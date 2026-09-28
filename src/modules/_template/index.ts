// Kopiervorlage für ein neues Modul. Wird nicht registriert (Ordner beginnt mit "_").
//
// So legst du ein Modul an:
//   1. Ordner kopieren: src/modules/_template → src/modules/<id>   (id = Ordnername, klein, z.B. "casino")
//   2. Überall "template" durch deine ID ersetzen und "Template" durch deinen Namen (auch in ui/ und im Test).
//   3. Fertig. Die Registry findet das Modul automatisch, keine andere Datei muss geändert werden.
//
// Regeln (siehe CLAUDE.md):
//   - Andere Module nur über deren index.ts nutzen (Exporte, Befehle, Ereignisse).
//   - Lesen mit `state`, schreiben mit `ctx` (bekommt man in tick, Befehlen und Ereignis-Handlern).
//   - Nur JSON-Daten im Zustand. Kein Math.random(), sondern ctx.random() & Co.
//   - Ändert sich die Form des Zustands: version hochzählen und eine Migration schreiben.

import { type CommandResult, type Ctx, defineModule, type GameState, journal, wallet } from '../../core';
import { TEMPLATE_PRICE } from './config';

// ---------------------------------------------------------------------------------------------
// Zustand, Befehle und Ereignisse. Die Typen werden per Declaration Merging im Kern ergänzt.

export interface TemplateState {
  counter: number;
  /** Wie viele Verkäufe dieses Modul mitbekommen hat (Beispiel für Ereignisse anderer Module). */
  salesSeen: number;
}

declare module '../../core' {
  interface ModuleStates {
    template: TemplateState;
  }
  interface GameCommands {
    /** Befehle heißen '<modul-id>.<verb>'. Die Payload ist ein JSON-Objekt. */
    'template.increment': { by: number };
  }
  interface GameEvents {
    /** Ereignisse heißen '<thema>.<was ist passiert>' in der Vergangenheit. */
    'template.incremented': { counter: number };
  }
}

// ---------------------------------------------------------------------------------------------
// Öffentliche API. Andere Module importieren nur von hier (index.ts).

/** Lesende Funktionen bekommen `state`. */
export function getCounter(state: GameState): number {
  return state.modules.template.counter;
}

/** Schreibende Funktionen bekommen `ctx`, damit sie Ereignisse melden und Zufall nutzen können. */
export function increment(ctx: Ctx, by: number): CommandResult {
  if (!(by > 0)) return { ok: false, reason: 'Nur positive Zahlen.' };
  if (!wallet.pay(ctx, TEMPLATE_PRICE * by, 'dirty', 'Vorlage')) return { ok: false, reason: 'Nicht genug Geld.' };
  const state = ctx.state.modules.template;
  state.counter += by;
  ctx.emit('template.incremented', { counter: state.counter });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Registrierung.

export default defineModule({
  id: 'template',
  // Version des eigenen State-Bereichs. Hochzählen, wenn sich TemplateState ändert.
  version: 1,
  // Module, die vorher initialisiert werden und vorher ticken. Für reine API-Aufrufe zur Laufzeit nicht nötig.
  dependsOn: [],
  // Anfangszustand für ein neues Spiel.
  init: () => ({ counter: 0, salesSeen: 0 }),
  // Standard: jede Spielminute. Hier: zur vollen Stunde.
  tickEvery: 60,
  tick: (ctx) => {
    if (ctx.chance(0.01)) journal.add(ctx, 'Die Vorlage hat Glück gehabt.');
  },
  commands: {
    'template.increment': (ctx, { by }) => increment(ctx, by),
  },
  on: {
    // Auf Ereignisse anderer Module reagieren. Die Payload ist typisiert.
    'sale.completed': (ctx) => {
      ctx.state.modules.template.salesSeen += 1;
    },
  },
  // Migrationen: Schlüssel = Zielversion. Beispiel für den Schritt auf Version 2:
  //   migrations: {
  //     2: (old: TemplateStateV1): TemplateState => ({ ...old, salesSeen: 0 }),
  //   },
  migrations: {},
});
