// Gangs: die Hauptgegner, die jede Stadt zu Beginn unter sich aufgeteilt haben (je vier in Köln und Hamburg, Auftrag
// 30; sie handeln nur, wenn ihre Stadt live ist). Frei erfundene Gangs mit Boss,
// Heimat-Veedel, Stil und Stärken (data.ts). Jede hat Geld, Leute und Ware und eine KI, die stündlich tickt:
// Sie verteidigt und erweitert ihr Revier, drückt die Preise, ignoriert dich als kleinen Fisch und wird
// feindseliger, je mehr du in ihren Veedeln verkaufst: erst Warnung, dann Drohung, dann Überfälle.
//
// Gegen die Gangs: Gewalt ('gangs.attack' → Konfrontation), wirtschaftlich (Verkäufe in ihrem Revier kosten sie
// Einfluss und Umsatz), Polizei ('police.snitch' → Razzia bei ihnen) und Diplomatie (Waffenstillstand,
// Schutzgeld zahlen oder kassieren, Bündnis gegen eine andere Gang). Drohungen und Angebote kommen als
// Handy-Nachricht, die Antworten lösen die Befehle aus.
//
// Öffentliche API:
//   getGangs(state, cityId?), getGang(state, id), gangCity(state, id), getGangStatus(state, id), gangVeedel(state, id),
//   veedelGang(state, veedelId),
//   gangPower(state, id),
//   playerPower(state), isGangBroken, hasCeasefire, paysTribute, isAllied, isAtPeace, ceasefireCost,
//   tributeAmount, protectionAmount, gangContact(gang), STAGE_NAMES, GANG_SPOT_MIN_INFLUENCE, ALLIANCE_COST, WARN_AT
// Befehle: 'gangs.ceasefire', 'gangs.payTribute', 'gangs.refuse', 'gangs.demandProtection', 'gangs.collect',
//   'gangs.releaseProtection', 'gangs.ally', 'gangs.attack', 'gangs.acceptOffer'
// Ereignisse: 'gang.pushStarted', 'gang.pushEnded', 'gang.escalated', 'gang.raidStarted', 'gang.diplomacyChanged',
//   'gang.busted'
// Auftrag 34: Gedächtnis (memory.ts: gangMemories, memoryScore, memoryPriceFactor, remember; Preise für Waffenstillstand
//   und Bündnis hängen daran, allianceCost) und Gang-Kriege (war.ts: rivalry, rivalries, activeWars, pastWars; Befehl
//   'gangs.supportWar', Ereignisse 'gang.remembered', 'gang.warStarted', 'gang.warEnded', 'gang.warSupported').
// Auftrag 44: Tresor knacken nach einem Überfall auf einen Gang-Spot mit dir selbst dabei (safe.ts, Minispiel 'safe'),
//   Bude durchsuchen nach dem Eintreiben mit dir selbst dabei (search.ts, Minispiel 'search').
//
// Achtung Abhängigkeiten: territory hängt von gangs ab (Startverteilung der Reviere). gangs darf deshalb
// nicht dependsOn: ['territory'] eintragen (Zyklus). Für API-Aufrufe zur Laufzeit ist das auch nicht nötig.

import { type Ctx, defineModule } from '../../core';
import type { FactionId } from '../territory';
import { gangsTick } from './ai';
import { say } from './common';
import type { MemoryKind } from './config';
import type { GangMethod } from './data';
import {
  acceptOffer,
  ally,
  attack,
  ceasefire,
  collect,
  demandProtection,
  payTribute,
  refuse,
  releaseProtection,
} from './diplomacy';
import { forgetFaded } from './memory';
import { burgleNow, type IncidentKind, respond, runMethod } from './methods';
import { onControlChanged, onEncounterResolved, onPoliceRaid, onSale, onTipOff } from './reactions';
import { onSafeFinished } from './safe';
import { onSearchFinished } from './search';
import {
  type GangStage,
  type GangsState,
  getGang,
  getGangStatus,
  initialGangsState,
  initialMemoryState,
} from './state';
import type { GangTextKey } from './texts';
import { recoverRivalries, supportWar, type WarSupport } from './war';

/** Zustand bis Version 3 (vor Auftrag 23). */
type GangsStateV3 = Pick<GangsState, 'gangs' | 'priceFactors'>;
/** Zustand bis Version 4 (vor Auftrag 34). */
type GangsStateV4 = Omit<GangsState, keyof ReturnType<typeof initialMemoryState>>;

export {
  ALLIANCE_COST,
  GANG_SPOT_MIN_INFLUENCE,
  MEMORIES,
  type MemoryKind,
  SAFE_ALARM_HEAT,
  SAFE_MAX,
  SAFE_MIN,
  SAFE_SHARE,
  SEARCH_BONUS,
  SEARCH_MIN,
  SEARCH_NOISE_HEAT,
  WAR_AT,
  WARN_AT,
} from './config';
export type { Gang, GangMethod, GangTraits } from './data';
export { GANG_RIVALRY } from './data';
export { canJoinRaid, raidCrew } from './diplomacy';
export { type GangMemory, gangMemories, MEMORY_TEXTS, memoryPriceFactor, memoryScore, remember } from './memory';
export {
  describeIncident,
  type GangActionEntry,
  type GangIncident,
  type GangIntimidation,
  gangActions,
  INCIDENT_CHOICES,
  type IncidentKind,
  incidentChoiceLabel,
  incidentChoices,
  intimidationAt,
  intimidationFactor,
  openIncidents,
} from './methods';
export { safeAmount } from './safe';
export { searchAmount } from './search';
export {
  allianceCost,
  ceasefireCost,
  type GangAlliance,
  type GangOffer,
  type GangProtection,
  type GangPush,
  type GangStage,
  type GangStatus,
  type GangsState,
  type GangTribute,
  gangCity,
  gangContact,
  gangPower,
  gangVeedel,
  getGang,
  getGangStatus,
  getGangs,
  hasCeasefire,
  isAllied,
  isAtPeace,
  isGangBroken,
  paysTribute,
  playerPower,
  protectionAmount,
  raidTargets,
  STAGE_NAMES,
  tributeAmount,
  veedelGang,
} from './state';
export type { GangTextKey } from './texts';
export {
  activeWars,
  type GangWar,
  type GangWarResult,
  pastWars,
  rivalries,
  rivalry,
  type WarSupport,
} from './war';

/**
 * Eine Methode der Gang sofort ausführen (Tests, Dev-Abkürzungen, Szenen für Screenshots). Gibt zurück, ob etwas
 * passiert ist. Der Einbruch findet sofort statt statt in der nächsten Nacht, mit report wird er auch gleich gemeldet.
 */
export function runGangMethod(ctx: Ctx, gangId: string, method: GangMethod, report = false): boolean {
  const gang = getGang(ctx.state, gangId);
  const s = getGangStatus(ctx.state, gangId);
  if (!gang || !s) return false;
  const done = runMethod(ctx, gang, s, method);
  if (done && method === 'burglary') burgleNow(ctx, gangId);
  if (done && report) {
    for (const i of ctx.state.modules.gangs.incidents) if (i.reported === false) i.reportAt = ctx.now;
  }
  return done;
}

/** Nachricht des Bosses in der Stimme der Gang schicken (Dev-Abkürzungen, Szenen). */
export function sendGangMessage(ctx: Ctx, gangId: string, key: GangTextKey, vars: Record<string, string> = {}): void {
  const gang = getGang(ctx.state, gangId);
  if (gang) say(ctx, gang, key, vars);
}

export type GangAgreement = 'ceasefire' | 'tribute' | 'protection' | 'alliance';

declare module '../../core' {
  interface ModuleStates {
    gangs: GangsState;
  }
  interface GameCommands {
    /** Waffenstillstand kaufen: eine Weile keine Überfälle, Feindseligkeit sinkt. */
    'gangs.ceasefire': { gangId: string };
    /** Schutzgeld an die Gang zahlen: eine Woche Ruhe. */
    'gangs.payTribute': { gangId: string };
    /** Forderung einer Gang ablehnen. */
    'gangs.refuse': { gangId: string };
    /** Schutzgeld von einer Gang verlangen (nur wenn du stark genug bist). */
    'gangs.demandProtection': { gangId: string };
    /** Verweigertes Schutzgeld eintreiben (Konfrontation). Ohne Angaben: Sicherheitsleute, Spieler entscheidet. */
    'gangs.collect': { gangId: string; staffIds?: string[]; playerPresent?: boolean };
    /** Auf das Schutzgeld einer Gang verzichten. */
    'gangs.releaseProtection': { gangId: string };
    /** Bündnis mit einer Gang gegen eine andere. */
    'gangs.ally': { gangId: string; againstGangId: string };
    /** Überfall auf einen Spot der Gang in einem Veedel (Konfrontation). */
    'gangs.attack': { gangId: string; veedelId: string; staffIds: string[]; playerPresent: boolean };
    /** Angebotene Ware kaufen. Manchmal kippt der Deal. */
    'gangs.acceptOffer': { gangId: string; offerId: number };
    /** Antwort auf einen Vorfall (Auftrag 23): Einbruch, Abwerben, Einschüchtern, Erpressung, Chancen. */
    'gangs.respond': { incidentId: number; choice: string };
    /** Auftrag 34: im Gang-Krieg Partei ergreifen (Ware liefern oder einen Spot der anderen überfallen). */
    'gangs.supportWar': { warId: number; kind: WarSupport };
  }
  interface GameEvents {
    'gang.pushStarted': { gangId: string; veedelId: string; against: FactionId | null };
    'gang.pushEnded': { gangId: string; veedelId: string; success: boolean };
    /** Eskalationsstufe gegenüber dem Spieler gestiegen (1 Warnung, 2 Drohung, 3 Überfälle). */
    'gang.escalated': { gangId: string; stage: GangStage };
    'gang.raidStarted': { gangId: string; encounterId: number; target: 'spot' | 'courier' | 'warehouse' };
    'gang.diplomacyChanged': { gangId: string; kind: GangAgreement; active: boolean };
    /** Razzia der Polizei bei einer Gang (z.B. nach deinem Tipp): was sie verloren hat. */
    'gang.busted': { gangId: string; veedelId: string; arrests: number; goods: number; money: number };
    /** Auftrag 23: Einbruch in ein Lager bemerkt (amount 0: Wache hat sie verscheucht). gangId = ausführende Gang. */
    'gang.burglary': { gangId: string; warehouseId: string; amount: number; productId?: string };
    'gang.poachAttempt': { gangId: string; staffId: string };
    'gang.intimidation': { gangId: string; spotId: string; until: number };
    'gang.tipOff': { gangId: string; veedelId: string; raid: boolean };
    'gang.blackmail': { gangId: string; warehouseId: string; amount: number };
    /** Chance von einer Gang (Warnung vor einem Rivalen, Gefallen). */
    'gang.goodTurn': { gangId: string; kind: 'warnRival' | 'favor' };
    'gang.incidentResolved': { incidentId: number; kind: IncidentKind; choice: string };
    /** Auftrag 34: Eine Gang merkt sich etwas über dich. */
    'gang.remembered': { gangId: string; kind: MemoryKind; effect: number };
    /** Auftrag 34: Gang-Krieg (ein Vorstoß ins Revier einer verfeindeten Gang). */
    'gang.warStarted': { warId: number; attacker: string; defender: string; veedelId: string };
    'gang.warEnded': { warId: number; attacker: string; defender: string; veedelId: string; winner: string };
    'gang.warSupported': { warId: number; gangId: string; kind: WarSupport };
  }
}

export default defineModule({
  id: 'gangs',
  version: 8,
  dependsOn: ['veedel'],
  init: () => initialGangsState(),
  tickEvery: 60,
  // Versatz (Auftrag 47): nicht mit allen anderen in derselben Minute ticken.
  tickOffset: 19,
  tick: gangsTick,
  commands: {
    'gangs.ceasefire': (ctx, { gangId }) => ceasefire(ctx, gangId),
    'gangs.payTribute': (ctx, { gangId }) => payTribute(ctx, gangId),
    'gangs.refuse': (ctx, { gangId }) => refuse(ctx, gangId),
    'gangs.demandProtection': (ctx, { gangId }) => demandProtection(ctx, gangId),
    'gangs.collect': (ctx, { gangId, staffIds, playerPresent }) => collect(ctx, gangId, staffIds, playerPresent),
    'gangs.releaseProtection': (ctx, { gangId }) => releaseProtection(ctx, gangId),
    'gangs.ally': (ctx, { gangId, againstGangId }) => ally(ctx, gangId, againstGangId),
    'gangs.attack': (ctx, { gangId, veedelId, staffIds, playerPresent }) =>
      attack(ctx, gangId, veedelId, staffIds, playerPresent),
    'gangs.acceptOffer': (ctx, { gangId, offerId }) => acceptOffer(ctx, gangId, offerId),
    'gangs.respond': (ctx, { incidentId, choice }) => respond(ctx, incidentId, choice),
    'gangs.supportWar': (ctx, { warId, kind }) => supportWar(ctx, warId, kind),
  },
  on: {
    // Auftrag 34: Das Gedächtnis verblasst in allen Städten, Verhältnisse unter den Gangs erholen sich.
    'clock.dayStarted': (ctx) => {
      forgetFaded(ctx);
      recoverRivalries(ctx);
    },
    'sale.completed': onSale,
    'encounter.resolved': onEncounterResolved,
    'police.tipOff': onTipOff,
    'police.raid': onPoliceRaid,
    'territory.controlChanged': onControlChanged,
    'minigame.finished': (ctx, payload) => {
      onSafeFinished(ctx, payload);
      onSearchFinished(ctx, payload);
    },
  },
  migrations: {
    // Version 1 (Fundament) hatte keinen Zustand.
    2: (): GangsState => initialGangsState(),
    // Version 3 (Auftrag 30): Die Hamburger Gangs kommen dazu, wie bei einem neuen Spiel.
    3: (old: GangsState): GangsState => ({ ...old, gangs: { ...initialGangsState().gangs, ...old.gangs } }),
    // Version 4 (Auftrag 23): Vorfälle, Einschüchterungen, Protokoll und Abklingzeiten der neuen Gang-Methoden.
    4: (old: GangsStateV3): GangsStateV4 => ({
      ...old,
      incidents: [],
      intimidations: [],
      log: {},
      nextMethodAt: {},
      lastMethodAt: null,
    }),
    // Version 5 (Auftrag 34): Gedächtnis, Verhältnis der Gangs untereinander, Gang-Kriege.
    5: (old: GangsStateV4): GangsState => ({ ...old, ...initialMemoryState() }),
    // Version 6 (Auftrag 37): Die Berliner Gangs kommen dazu, wie bei einem neuen Spiel. Allgemein gehalten: Jede Gang,
    // die im Spielstand fehlt, bekommt ihren Startzustand (so reicht dieselbe Migration auch für weitere Städte).
    6: (old: GangsState): GangsState => ({ ...old, gangs: { ...initialGangsState().gangs, ...old.gangs } }),
    // Version 7 (Auftrag 38): Die Münchner Gangs kommen dazu, genauso (auch für Stände, die schon mit 6 gespeichert
    // wurden).
    7: (old: GangsState): GangsState => ({ ...old, gangs: { ...initialGangsState().gangs, ...old.gangs } }),
    // Version 8 (Auftrag 39): Die Frankfurter Gangs kommen dazu, genauso.
    8: (old: GangsState): GangsState => ({ ...old, gangs: { ...initialGangsState().gangs, ...old.gangs } }),
  },
});
