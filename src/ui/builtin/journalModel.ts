// Ansicht des Journals als reine Daten (ohne DOM, getestet in journalModel.test.ts).

import { clock, type JournalEntry } from '../../core';

/** Einträge nach Spieltag gruppiert (neueste zuerst, wie das Journal). */
export function groupByDay(entries: readonly JournalEntry[]): { day: number; time: number; entries: JournalEntry[] }[] {
  const groups: { day: number; time: number; entries: JournalEntry[] }[] = [];
  for (const entry of entries) {
    const day = clock.day(entry.time);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, time: entry.time, entries: [entry] });
  }
  return groups;
}
