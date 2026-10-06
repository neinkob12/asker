// Rat der Rechten Hand im Tagesbericht (Auftrag 34): ein Satz aus Daten, keine eigene Haltung. Jede Regel prüft den
// Zustand ihrer Stadt und gibt Platzhalter zurück (oder null); die passende mit der höchsten Priorität gewinnt, der
// Text kommt über den Text-Helfer (keine direkte Wiederholung). Neue Ratschläge sind neue Einträge in REPORT_TIPS.

import { type Ctx, formatEuro, formatNumber, type GameState, texts } from '../../core';
import { lieutenantResult } from '../finance';
import { activeWars, ceasefireCost, getGang, getGangStatus, getGangs, isAtPeace } from '../gangs';
import { getStock, usagePerDay } from '../goods';
import { getStaff, getStaffMember } from '../staff';
import { canBeCapo, getCapos } from './capo';
import { CAPO_ADVICE_LIEUTENANTS } from './config';

type TipVars = Record<string, string | number>;

export interface ReportTip {
  id: string;
  /** Höher gewinnt, wenn mehrere passen. */
  priority: number;
  /** Platzhalter, wenn der Rat passt, sonst null. */
  test: (state: GameState, cityId: string) => TipVars | null;
  texts: readonly string[];
}

function lieutenantsIn(state: GameState, cityId: string): string[] {
  return Object.keys(state.modules.hierarchy.posts)
    .sort()
    .filter((id) => (getStaffMember(state, id)?.cityId ?? 'koeln') === cityId);
}

/** Wie lange das Lager noch reicht, mit Einzahl und unter einem Tag in Stunden. */
function stockLeft(days: number): { left: string; inLeft: string } {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return hours === 1
      ? { left: 'eine Stunde', inLeft: 'einer Stunde' }
      : { left: `${hours} Stunden`, inLeft: `${hours} Stunden` };
  }
  const rounded = Math.round(days * 10) / 10;
  if (rounded === 1) return { left: 'einen Tag', inLeft: 'einem Tag' };
  const text = formatNumber(rounded, 1);
  return { left: `${text} Tage`, inLeft: `${text} Tagen` };
}

export const REPORT_TIPS: readonly ReportTip[] = [
  {
    id: 'capo',
    priority: 90,
    test: (state, cityId) => {
      const lts = lieutenantsIn(state, cityId);
      if (lts.length < CAPO_ADVICE_LIEUTENANTS || getCapos(state, cityId).length > 0) return null;
      const candidate = lts.find((id) => canBeCapo(state, id).ok);
      const name = candidate ? getStaffMember(state, candidate)?.name : undefined;
      return name ? { count: lts.length, name } : null;
    },
    texts: [
      'Mein Rat: {count} Leutnants sind zu viele für mich allein. Mach {name} zum Capo.',
      'Mein Rat: Wir brauchen eine Ebene dazwischen. {name} könnte Capo werden und drei Leutnants führen.',
      'Mein Rat: Bei {count} Leutnants verlier ich den Überblick. {name} hat das Zeug zum Capo.',
    ],
  },
  {
    id: 'stock',
    priority: 80,
    test: (state, cityId) => {
      const usage = usagePerDay(state, { cityId });
      if (usage <= 0) return null;
      const days = getStock(state, { cityId }) / usage;
      return days < 1.5 ? stockLeft(days) : null;
    },
    // {left} „1 Tag“, „5 Stunden“; {inLeft} „einem Tag“, „5 Stunden“ (Auftrag 43, K5: es stand „noch 1 Tage“).
    texts: [
      'Mein Rat: Engpass. Das Lager reicht noch etwa {left}, wir sollten nachbestellen.',
      'Mein Rat: Bei dem Tempo ist das Lager in {inLeft} leer. Bestell nach.',
      'Mein Rat: Uns geht die Ware aus, noch {left}. Lieber jetzt bestellen als später.',
    ],
  },
  {
    id: 'gangPressure',
    priority: 70,
    test: (state, cityId) => {
      for (const gang of getGangs(state, cityId)) {
        const s = getGangStatus(state, gang.id);
        if (s && s.stage >= 2 && !isAtPeace(state, gang.id)) {
          return { gang: gang.name, cost: formatEuro(ceasefireCost(state, gang.id)) };
        }
      }
      return null;
    },
    texts: [
      'Mein Rat: {gang} macht Druck. Ein Waffenstillstand kostet gerade {cost}.',
      'Mein Rat: Mit {gang} wird es ernst. Für {cost} hätten wir erst mal Ruhe.',
      'Mein Rat: {gang} wird nicht leiser. Waffenstillstand: {cost}. Oder Sicherheit an die Spots.',
    ],
  },
  {
    id: 'expensiveLieutenant',
    priority: 60,
    test: (state, cityId) => {
      let worst: { name: string; result: number } | null = null;
      for (const id of lieutenantsIn(state, cityId)) {
        const result = lieutenantResult(state, id, 1, 1).result;
        if (result < 0 && (!worst || result < worst.result)) {
          worst = { name: getStaffMember(state, id)?.name ?? id, result };
        }
      }
      return worst ? { name: worst.name, loss: formatEuro(-worst.result) } : null;
    },
    texts: [
      'Mein Rat: {name} hat uns gestern {loss} gekostet. Weniger Lohn oder bessere Spots.',
      'Mein Rat: {name} ist zu teuer für das, was seine Spots bringen ({loss} Minus gestern).',
      'Mein Rat: Schau dir {name} an. Gestern {loss} im Minus.',
    ],
  },
  {
    id: 'unhappy',
    priority: 55,
    test: (state, cityId) => {
      const m = getStaff(state, { cityId })
        .filter((x) => x.stats.loyalty < 25)
        .sort((a, b) => a.stats.loyalty - b.stats.loyalty || a.id.localeCompare(b.id))[0];
      return m ? { name: m.name } : null;
    },
    texts: [
      'Mein Rat: {name} ist kurz davor hinzuschmeißen. Mehr Lohn hilft.',
      'Mein Rat: Pass auf {name} auf, die Laune ist im Keller.',
      'Mein Rat: {name} redet schon davon, zu gehen.',
    ],
  },
  {
    id: 'idle',
    priority: 50,
    test: (state, cityId) => {
      // In der Stadt des Berichts (auch der schlafenden eines Statthalters), nicht in der aktiven.
      const idle = getStaff(state, { cityId, status: 'active' }).filter(
        (m) => (m.role === 'runner' || m.role === 'security') && !m.assignment,
      ).length;
      return idle >= 3 ? { count: idle } : null;
    },
    texts: [
      'Mein Rat: {count} Leute stehen rum und kosten Lohn. Stell sie an Spots oder lass sie gehen.',
      'Mein Rat: Wir bezahlen {count} Leute fürs Warten.',
      'Mein Rat: {count} ohne Einsatz. Ein neuer Spot würde sich lohnen.',
    ],
  },
  {
    id: 'gangWar',
    priority: 40,
    test: (state, cityId) => {
      const war = activeWars(state, cityId)[0];
      const a = war ? getGang(state, war.attacker) : undefined;
      const b = war ? getGang(state, war.defender) : undefined;
      return a && b ? { a: a.name, b: b.name } : null;
    },
    texts: [
      'Mein Rat: {a} und {b} schlagen sich. Wer hilft, macht sich Freunde und Feinde.',
      'Mein Rat: Krieg zwischen {a} und {b}. Halt dich raus oder such dir eine Seite.',
      'Mein Rat: {a} gegen {b}. Solange die sich prügeln, haben wir Ruhe.',
    ],
  },
];

/** Der passende Ratschlag mit der höchsten Priorität (ohne Text), sonst null. */
export function reportTipFor(state: GameState, cityId: string): { tip: ReportTip; vars: TipVars } | null {
  for (const tip of [...REPORT_TIPS].sort((a, b) => b.priority - a.priority)) {
    const vars = tip.test(state, cityId);
    if (vars) return { tip, vars };
  }
  return null;
}

/** Ein Satz Rat für den Tagesbericht (leer, wenn nichts ansteht). */
export function reportTip(ctx: Ctx, cityId: string): string {
  const found = reportTipFor(ctx.state, cityId);
  if (!found) return '';
  return texts.pick(ctx, `righthand:tip:${found.tip.id}`, found.tip.texts, found.vars);
}
