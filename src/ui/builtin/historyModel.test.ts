import { describe, expect, it } from 'vitest';
import { clock, type GameState, type JournalEntry } from '../../core';
import type { Alert } from '../runtime';
import { filterHistory, groupByDay, type HistoryOrder, historyEntries } from './historyModel';

const entry = (id: number, time: number, source = 'test', text = `Eintrag ${id}`): JournalEntry => ({
  id,
  time,
  kind: 'info',
  text,
  source,
});

const stateWith = (journal: JournalEntry[]) => ({ journal }) as unknown as GameState;
const euro = (n: number) => `${n} €`;

describe('Verlauf nach Tagen', () => {
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

describe('Verlauf aus Journal, Meldungen und Aufträgen', () => {
  const t = (h: number) => clock.at(2, h, 0);
  const alerts: Alert[] = [
    { id: 1, text: 'Kontrolle in Ehrenfeld.', kind: 'bad', time: t(10), read: false },
    // wortgleich zur selben Minute wie der Journaleintrag: fällt weg
    { id: 2, text: 'Razzia!', kind: 'bad', time: t(12), read: false },
  ];
  const orders: HistoryOrder[] = [
    { id: 7, contactName: 'Mehmet', kind: 'delivery', status: 'done', price: 120, createdAt: t(8), finishedAt: t(9) },
    { id: 8, contactName: 'Jo', kind: 'wholesale', status: 'offered', price: 900, createdAt: t(11), finishedAt: null },
  ];
  const state = stateWith([entry(2, t(12), 'police', 'Razzia!'), entry(1, t(7), 'staff', 'Dragan ist jetzt Level 2.')]);

  it('mischt die Quellen, neueste zuerst, ohne Dubletten und ohne offene Aufträge', () => {
    const list = historyEntries(state, alerts, orders, euro);
    expect(list.map((e) => e.key)).toEqual(['journal-2', 'alert-1', 'order-7', 'journal-1']);
    expect(list[2].text).toBe('Lieferung für Mehmet erledigt (120 €).');
    expect(list[2].kind).toBe('good');
  });

  it('filtert nach Rubrik, die aus dem Modul des Eintrags kommt', () => {
    const list = historyEntries(state, alerts, orders, euro);
    expect(filterHistory(list, 'police').map((e) => e.key)).toEqual(['journal-2']);
    expect(filterHistory(list, 'people').map((e) => e.key)).toEqual(['journal-1']);
    expect(filterHistory(list, 'orders').map((e) => e.key)).toEqual(['order-7']);
    expect(filterHistory(list, 'money')).toEqual([]);
    expect(filterHistory(list, 'all')).toHaveLength(4);
  });
});
