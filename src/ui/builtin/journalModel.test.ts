import { describe, expect, it } from 'vitest';
import { clock, type JournalEntry } from '../../core';
import { groupByDay } from './journalModel';

const entry = (id: number, time: number): JournalEntry => ({
  id,
  time,
  kind: 'info',
  text: `Eintrag ${id}`,
  source: 'test',
});

describe('Journal nach Tagen', () => {
  it('gruppiert Einträge (neueste zuerst) nach Spieltag und behält die Reihenfolge', () => {
    const entries = [
      entry(4, clock.at(3, 1, 30)),
      entry(3, clock.at(2, 23, 0)),
      entry(2, clock.at(2, 8, 15)),
      entry(1, clock.at(1, 18, 0)),
    ];
    const groups = groupByDay(entries);
    expect(groups.map((g) => g.day)).toEqual([3, 2, 1]);
    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([[4], [3, 2], [1]]);
  });

  it('merkt sich die Zeit des ersten Eintrags für die Wochentag-Überschrift', () => {
    const [group] = groupByDay([entry(1, clock.at(1, 21, 0))]);
    expect(clock.weekdayName(group.time)).toBe('Freitag');
  });

  it('liefert für ein leeres Journal keine Gruppen', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
