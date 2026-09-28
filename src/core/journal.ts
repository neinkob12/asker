// Journal: das Ereignis-Log. Jedes Modul kann Einträge schreiben, die UI zeigt sie an.

import { JOURNAL_LIMIT } from './config';
import type { Ctx, GameState } from './types';

export type JournalKind = 'info' | 'good' | 'bad';

export interface JournalEntry {
  id: number;
  time: number;
  kind: JournalKind;
  text: string;
  /** Modul, das den Eintrag geschrieben hat. */
  source: string;
  /** Optionaler Bezug, z.B. um in der UI zum Ort zu springen. */
  ref?: { veedelId?: string; spotId?: string; staffId?: string };
}

declare module './types' {
  interface GameEvents {
    'journal.added': { entry: JournalEntry };
  }
}

export const journal = {
  add(ctx: Ctx, text: string, kind: JournalKind = 'info', ref?: JournalEntry['ref']): JournalEntry {
    const entry: JournalEntry = { id: ctx.nextId(), time: ctx.now, kind, text, source: ctx.moduleId };
    if (ref) entry.ref = ref;
    ctx.state.journal.unshift(entry);
    if (ctx.state.journal.length > JOURNAL_LIMIT) ctx.state.journal.length = JOURNAL_LIMIT;
    ctx.emit('journal.added', { entry });
    return entry;
  },

  /** Neueste zuerst. */
  entries(state: GameState, limit = JOURNAL_LIMIT): JournalEntry[] {
    return state.journal.slice(0, limit);
  },
};
