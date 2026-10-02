// Verlauf (Einstellungen › Verlauf) als reine Daten, getestet in historyModel.test.ts: Journal des Kerns, Meldungen
// der Oberfläche (ui.toast) und die Historie der Aufträge in einer Liste, neueste zuerst, nach Tagen gruppiert, mit
// Filter (Alles, Geld, Leute, Polizei, Gangs, Aufträge). Welches Modul einen Journaleintrag geschrieben hat,
// entscheidet seine Rubrik; Meldungen tragen keine Quelle und zählen nur zu "Alles".

import { clock, type GameState, type JournalKind, journal } from '../../core';
import type { Alert } from '../runtime';

export type HistoryFilter = 'all' | 'money' | 'people' | 'police' | 'gangs' | 'orders';

export const HISTORY_FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Alles' },
  { value: 'money', label: 'Geld' },
  { value: 'people', label: 'Leute' },
  { value: 'police', label: 'Polizei' },
  { value: 'gangs', label: 'Gangs' },
  { value: 'orders', label: 'Aufträge' },
];

/** Rubrik nach Modul (Quelle eines Journaleintrags). Unbekannte Module zählen nur zu "Alles". */
const SOURCE_FILTER: Record<string, HistoryFilter> = {
  finance: 'money',
  laundering: 'money',
  suppliers: 'money',
  logistics: 'money',
  goods: 'money',
  market: 'money',
  staff: 'people',
  hierarchy: 'people',
  recruiting: 'people',
  police: 'police',
  gangs: 'gangs',
  encounters: 'gangs',
  territory: 'gangs',
  customers: 'orders',
};

export interface HistoryEntry {
  /** Eindeutig über alle Quellen. */
  key: string;
  time: number;
  kind: JournalKind;
  text: string;
  filter: HistoryFilter | null;
  /** Woher der Eintrag kommt: Journal, Meldung der Oberfläche oder die Auftrags-Historie. */
  source: 'journal' | 'alert' | 'order';
}

/** Auftrag für den Verlauf, so wie customers ihn ablegt (nur die Felder, die der Verlauf braucht). */
export interface HistoryOrder {
  id: number;
  contactName: string;
  kind: 'delivery' | 'wholesale';
  status: 'offered' | 'enRoute' | 'contested' | 'done' | 'declined' | 'expired' | 'failed';
  price: number;
  createdAt: number;
  finishedAt: number | null;
}

const ORDER_TEXT: Record<HistoryOrder['status'], string | null> = {
  offered: null,
  enRoute: null,
  contested: null,
  done: 'erledigt',
  declined: 'abgelehnt',
  expired: 'verpasst',
  failed: 'geplatzt',
};

function orderEntry(order: HistoryOrder, formatEuro: (amount: number) => string): HistoryEntry | null {
  const result = ORDER_TEXT[order.status];
  if (!result) return null;
  const what = order.kind === 'wholesale' ? 'Großhandel' : 'Lieferung';
  return {
    key: `order-${order.id}`,
    time: order.finishedAt ?? order.createdAt,
    kind: order.status === 'done' ? 'good' : order.status === 'declined' ? 'info' : 'bad',
    text: `${what} für ${order.contactName} ${result} (${formatEuro(order.price)}).`,
    filter: 'orders',
    source: 'order',
  };
}

/**
 * Alle Einträge, neueste zuerst. Meldungen, die wortgleich zur selben Minute auch im Journal stehen, fallen weg
 * (viele Module schreiben beides).
 */
export function historyEntries(
  state: GameState,
  alerts: readonly Alert[],
  orders: readonly HistoryOrder[],
  formatEuro: (amount: number) => string,
): HistoryEntry[] {
  const entries: HistoryEntry[] = journal.entries(state).map((e) => ({
    key: `journal-${e.id}`,
    time: e.time,
    kind: e.kind,
    text: e.text,
    filter: SOURCE_FILTER[e.source] ?? null,
    source: 'journal',
  }));
  const seen = new Set(entries.map((e) => `${e.time}:${e.text}`));
  for (const a of alerts) {
    if (seen.has(`${a.time}:${a.text}`)) continue;
    entries.push({
      key: `alert-${a.id}`,
      time: a.time,
      kind: a.kind === 'bad' || a.kind === 'warn' ? 'bad' : a.kind === 'good' ? 'good' : 'info',
      text: a.text,
      filter: null,
      source: 'alert',
    });
  }
  for (const o of orders) {
    const entry = orderEntry(o, formatEuro);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => b.time - a.time || a.key.localeCompare(b.key));
}

export function filterHistory(entries: readonly HistoryEntry[], filter: HistoryFilter): HistoryEntry[] {
  return filter === 'all' ? [...entries] : entries.filter((e) => e.filter === filter);
}

/** Einträge nach Spieltag gruppiert (neueste zuerst, wie die Liste). */
export function groupByDay<T extends { time: number }>(
  entries: readonly T[],
): { day: number; time: number; entries: T[] }[] {
  const groups: { day: number; time: number; entries: T[] }[] = [];
  for (const entry of entries) {
    const day = clock.day(entry.time);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, time: entry.time, entries: [entry] });
  }
  return groups;
}
