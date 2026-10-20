// Bestwerte der Spielhalle pro Gerät (Auftrag 49): Wertung, wie oft gespielt und geschafft je Minispiel, dazu ein
// Zähler für neue Seeds („Nochmal“ und jeder Start in der Spielhalle bringen eine neue Lage). Nur Anzeige, nichts davon
// steht im Spielstand. Liegt im localStorage; ist der gesperrt oder voll, gilt alles nur bis zum Neuladen.

import { MINIGAME_KIND_IDS, type MinigameKind } from '../index';

export interface MinigameRecord {
  /** Beste Wertung 0 bis 1. */
  best: number;
  played: number;
  won: number;
}

export type MinigameRecords = Partial<Record<MinigameKind, MinigameRecord>>;

/** Was ein Speicher können muss (localStorage oder ein Ersatz im Test). */
export interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'koeln-tycoon:minigames';
const VERSION = 1;

interface Stored {
  v: number;
  records: MinigameRecords;
  /** Zähler für Seeds der Spielhalle. */
  seq: number;
}

/** Ersatz, wenn der Browser keinen Speicher hergibt: hält bis zum Neuladen. */
const memory = new Map<string, string>();
const fallback: RecordStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

function browserStorage(): RecordStorage {
  try {
    return typeof localStorage === 'undefined' ? fallback : localStorage;
  } catch {
    return fallback;
  }
}

function finite01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function read(storage: RecordStorage): Stored {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { v: VERSION, records: {}, seq: 0 };
    const data = JSON.parse(raw) as Partial<Stored>;
    const records: MinigameRecords = {};
    for (const kind of MINIGAME_KIND_IDS) {
      const r = data.records?.[kind];
      if (!r || typeof r !== 'object') continue;
      records[kind] = { best: finite01(r.best), played: count(r.played), won: count(r.won) };
    }
    return { v: VERSION, records, seq: count(data.seq) };
  } catch {
    return { v: VERSION, records: {}, seq: 0 };
  }
}

function write(storage: RecordStorage, data: Stored): void {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Speicher voll oder gesperrt: gilt dann nur bis zum Neuladen.
  }
}

/** Alle Bestwerte dieses Geräts. */
export function loadRecords(storage: RecordStorage = browserStorage()): MinigameRecords {
  return read(storage).records;
}

/**
 * Ergebnis eines Durchgangs in der Vorschau eintragen. newBest heißt: besser als alles davor (nicht beim ersten Mal,
 * da gibt es nichts zu schlagen). previous ist der Bestwert vorher (null beim ersten Mal).
 */
export function recordResult(
  kind: MinigameKind,
  score: number,
  won: boolean,
  storage: RecordStorage = browserStorage(),
): { record: MinigameRecord; previous: number | null; newBest: boolean } {
  const data = read(storage);
  const old = data.records[kind];
  const s = finite01(score);
  const record: MinigameRecord = {
    best: Math.max(old?.best ?? 0, s),
    played: (old?.played ?? 0) + 1,
    won: (old?.won ?? 0) + (won ? 1 : 0),
  };
  data.records[kind] = record;
  write(storage, data);
  return { record, previous: old ? old.best : null, newBest: !!old && s > old.best };
}

/** Nächster Seed für die Spielhalle (1, 2, 3 …), damit jeder Start eine andere Lage bringt. */
export function nextArcadeSeed(storage: RecordStorage = browserStorage()): number {
  const data = read(storage);
  data.seq += 1;
  write(storage, data);
  return data.seq;
}
