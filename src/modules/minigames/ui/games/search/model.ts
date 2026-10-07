// Bude durchsuchen (Auftrag 44, Teil 6): Spiellogik als reines Modell, ohne DOM (getestet in model.test.ts).
//
// Eine Wohnung mit fünf Räumen und 15 bis 25 Dingen zum Durchsuchen (aus dem Seed, mehr mit der Schwierigkeit). In
// drei bis fünf liegt Geld, zusammen genau params.max. Antippen startet die Suche; sie dauert je nach Ding (die
// Matratze länger als die Müslipackung). Manche Dinge machen Lärm (Geschirr klirrt): Der Lärm-Balken steigt und sinkt
// langsam wieder. Ist er voll, rufen die Nachbarn die Polizei, dann bleiben höchstens noch ALERT_SECONDS.
// Spuren: Was verrutscht aussieht, lohnt sich oft (bei hoher Schwierigkeit seltener, dafür mehr falsche Fährten).
// Zeit 30 s, dann dreht sich der Schlüssel im Schloss. Score = gefundenes Geld / verstecktes Geld.

import { createRng } from '../../../../../core';

export type RoomId = 'living' | 'kitchen' | 'bath' | 'bedroom' | 'hall';

export type ItemId =
  | 'sofa'
  | 'rug'
  | 'frame'
  | 'plant'
  | 'book'
  | 'tv'
  | 'freezer'
  | 'dishes'
  | 'microwave'
  | 'oven'
  | 'cereal'
  | 'cookies'
  | 'cistern'
  | 'cabinet'
  | 'vent'
  | 'laundry'
  | 'mattress'
  | 'nightstand'
  | 'wardrobe'
  | 'shoebox'
  | 'teddy'
  | 'floorboard'
  | 'mat'
  | 'jacket'
  | 'shoes'
  | 'fuse'
  | 'umbrella';

export interface ItemDef {
  id: ItemId;
  /** Name im HUD und für Screenreader, z.B. „Spülkasten“. */
  name: string;
  room: RoomId;
  /** Grunddauer der Suche in Sekunden. */
  search: number;
  /** Chance, dass das Ding beim Durchsuchen Lärm macht (0 = nie). */
  loud: number;
  /** Klassisches Versteck: liegt eher Geld drin. */
  classic?: boolean;
}

/** Alle Dinge der Wohnung (Lage und Aussehen in layout.ts und draw.ts). */
export const ITEMS: readonly ItemDef[] = [
  { id: 'sofa', name: 'Sofakissen', room: 'living', search: 1.4, loud: 0 },
  { id: 'rug', name: 'Teppichecke', room: 'living', search: 1.5, loud: 0, classic: true },
  { id: 'frame', name: 'Bilderrahmen', room: 'living', search: 1.2, loud: 0.35, classic: true },
  { id: 'plant', name: 'Blumentopf', room: 'living', search: 1.6, loud: 0.25 },
  { id: 'book', name: 'Dickes Buch', room: 'living', search: 1.1, loud: 0, classic: true },
  { id: 'tv', name: 'Fernsehschrank', room: 'living', search: 1.6, loud: 0.3 },
  { id: 'freezer', name: 'Gefrierfach', room: 'kitchen', search: 1.9, loud: 0.2, classic: true },
  { id: 'dishes', name: 'Geschirrschrank', room: 'kitchen', search: 1.5, loud: 0.95 },
  { id: 'microwave', name: 'Mikrowelle', room: 'kitchen', search: 1.2, loud: 0.6 },
  { id: 'oven', name: 'Backofen', room: 'kitchen', search: 1.5, loud: 0.5 },
  { id: 'cereal', name: 'Müslipackung', room: 'kitchen', search: 1, loud: 0, classic: true },
  { id: 'cookies', name: 'Keksdose', room: 'kitchen', search: 1, loud: 0.45 },
  { id: 'cistern', name: 'Spülkasten', room: 'bath', search: 1.9, loud: 0.4, classic: true },
  { id: 'cabinet', name: 'Spiegelschrank', room: 'bath', search: 1.2, loud: 0.65 },
  { id: 'vent', name: 'Lüftungsgitter', room: 'bath', search: 2.1, loud: 0.15, classic: true },
  { id: 'laundry', name: 'Wäschekorb', room: 'bath', search: 1.3, loud: 0 },
  { id: 'mattress', name: 'Matratze', room: 'bedroom', search: 2.4, loud: 0, classic: true },
  { id: 'nightstand', name: 'Nachttisch', room: 'bedroom', search: 1.1, loud: 0.2 },
  { id: 'wardrobe', name: 'Kleiderschrank', room: 'bedroom', search: 1.8, loud: 0.15 },
  { id: 'shoebox', name: 'Schuhkarton', room: 'bedroom', search: 1, loud: 0, classic: true },
  { id: 'teddy', name: 'Kuscheltier', room: 'bedroom', search: 1, loud: 0 },
  { id: 'floorboard', name: 'Lose Diele', room: 'bedroom', search: 2.2, loud: 0.3, classic: true },
  { id: 'mat', name: 'Fußmatte', room: 'hall', search: 0.8, loud: 0 },
  { id: 'jacket', name: 'Jacke am Haken', room: 'hall', search: 0.9, loud: 0 },
  { id: 'shoes', name: 'Schuhregal', room: 'hall', search: 1.2, loud: 0.15 },
  { id: 'fuse', name: 'Sicherungskasten', room: 'hall', search: 1.5, loud: 0.2, classic: true },
  { id: 'umbrella', name: 'Schirmständer', room: 'hall', search: 1, loud: 0.4 },
];

export const ROOMS: readonly RoomId[] = ['living', 'kitchen', 'bath', 'bedroom', 'hall'];

export const ROOM_NAMES: Record<RoomId, string> = {
  living: 'Wohnzimmer',
  kitchen: 'Küche',
  bath: 'Bad',
  bedroom: 'Schlafzimmer',
  hall: 'Flur',
};

/** Spielzeit in Sekunden. */
export const DURATION = 30;
/** Nachbarn alarmiert: So viele Sekunden bleiben höchstens noch. */
export const ALERT_SECONDS = 6;
/** Der Lärm sinkt pro Sekunde um so viel. */
export const NOISE_DECAY = 0.035;
/** In den letzten Sekunden hört man Schritte im Treppenhaus. */
export const STEPS_AT = 7;

/** Ein Ding in dieser Wohnung. */
export interface SearchItem {
  id: ItemId;
  name: string;
  room: RoomId;
  /** Dauer der Suche in Sekunden. */
  duration: number;
  /** Hier ist ein Versteck mit Geld. */
  stash: boolean;
  /** So viel Geld liegt drin (0 ohne Versteck; in einem Versteck nur 0, wenn gar kein Geld da ist). */
  money: number;
  /** Macht beim Durchsuchen Lärm (so viel auf den Balken). */
  noise: number;
  /** Sieht verrutscht aus (Spur, kann auch eine falsche Fährte sein). */
  tell: boolean;
  /** Ein Schein lugt hervor (nur bei leichter Schwierigkeit und nur, wo wirklich Geld liegt). */
  peek: boolean;
}

export interface SearchSetup {
  items: SearchItem[];
  /** Zusammen versteckt (Euro). */
  total: number;
  /** Wie viele Verstecke mit Geld. */
  stashes: number;
  duration: number;
}

export interface SearchState {
  time: number;
  /** Zeitpunkt, an dem spätestens Schluss ist (nach Alarm der Nachbarn früher). */
  end: number;
  /** Wird gerade durchsucht: Ding und Fortschritt in Sekunden. */
  current: { index: number; t: number } | null;
  /** Als Nächstes (angetippt, während noch gesucht wird). */
  queued: number | null;
  searched: boolean[];
  found: number;
  foundStashes: number;
  noise: number;
  /** Höchster Lärm bisher. */
  peakNoise: number;
  alerted: boolean;
  stepsHeard: boolean;
  done: boolean;
  /** Warum Schluss ist. */
  reason: 'time' | 'all' | null;
}

/** Was in einem Schritt passiert ist (für Ton, Wackeln, Texte). */
export type SearchEvent =
  | { type: 'start'; index: number }
  | { type: 'found'; index: number; amount: number }
  | { type: 'empty'; index: number }
  | { type: 'noise'; index: number; level: number }
  | { type: 'alert' }
  | { type: 'steps' }
  | { type: 'end'; reason: 'time' | 'all' };

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Teile von total auf n Verstecke: ganze Euro, Summe genau total, jedes mindestens 1 € (wenn total reicht). */
export function splitMoney(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const parts = weights.map((w) => Math.max(total >= weights.length ? 1 : 0, Math.floor((total * w) / sum)));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; rest !== 0 && i < 10 * parts.length; i++) {
    const k = i % parts.length;
    const step = rest > 0 ? 1 : -1;
    if (step < 0 && parts[k] <= 1) continue;
    parts[k] += step;
    rest -= step;
  }
  return parts;
}

/**
 * Wohnung aus Seed, Schwierigkeit und Geld. Je Raum mindestens zwei Dinge; 15 (leicht) bis 25 (schwer) insgesamt,
 * drei bis fünf Verstecke mit Geld (klassische Verstecke doppelt so wahrscheinlich). Spuren bei leicht an fast jedem
 * echten Versteck, bei schwer an wenigen; dafür mehr falsche Fährten.
 */
export function createSearch(seed: number, difficulty: number, total: number): SearchSetup {
  const random = createRng(seed);
  const d = clamp01(difficulty);
  const count = Math.round(15 + 10 * d);
  // Erst je Raum zwei, dann der Rest zufällig.
  const pool = ITEMS.map((def, i) => ({ def, i, r: random() }));
  const chosen = new Set<number>();
  for (const room of ROOMS) {
    pool
      .filter((p) => p.def.room === room)
      .sort((a, b) => a.r - b.r)
      .slice(0, 2)
      .forEach((p) => {
        chosen.add(p.i);
      });
  }
  for (const p of [...pool].sort((a, b) => a.r - b.r)) {
    if (chosen.size >= count) break;
    chosen.add(p.i);
  }
  const defs = ITEMS.filter((_, i) => chosen.has(i));
  // Verstecke mit Geld.
  const stashes = Math.min(defs.length, 3 + Math.floor(random() * (1 + 2 * d)));
  const money = new Set<number>();
  while (money.size < stashes) {
    const weights = defs.map((def, i): number => (money.has(i) ? 0 : def.classic ? 2 : 1));
    let pick = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0 && weights[i] > 0) {
        money.add(i);
        break;
      }
    }
  }
  const stashIdx = [...money].sort((a, b) => a - b);
  const amounts = splitMoney(
    Math.max(0, Math.round(total)),
    stashIdx.map(() => 0.5 + random()),
  );
  const tellChance = 0.9 - 0.6 * d;
  const decoys = 1 + Math.round(2.5 * d);
  const items: SearchItem[] = defs.map((def, i) => {
    const k = stashIdx.indexOf(i);
    const has = k >= 0;
    const noisy = def.loud > 0 && random() < def.loud;
    return {
      id: def.id,
      name: def.name,
      room: def.room,
      duration: Math.round(def.search * (0.9 + 0.3 * d) * 100) / 100,
      stash: has,
      money: has ? amounts[k] : 0,
      noise: noisy ? Math.round((0.3 + 0.2 * d + 0.1 * def.loud) * 100) / 100 : 0,
      tell: has ? random() < tellChance : false,
      peek: has && d < 0.35 && random() < 0.6,
    };
  });
  // Falsche Fährten: verrutscht, aber leer.
  const empty = items.map((it, i) => (it.stash ? -1 : i)).filter((i) => i >= 0);
  for (let n = 0; n < decoys && empty.length > 0; n++) {
    const j = Math.floor(random() * empty.length);
    items[empty[j]].tell = true;
    empty.splice(j, 1);
  }
  return { items, total: amounts.reduce((a, b) => a + b, 0), stashes: stashIdx.length, duration: DURATION };
}

export function initSearch(setup: SearchSetup): SearchState {
  return {
    time: 0,
    end: setup.duration,
    current: null,
    queued: null,
    searched: setup.items.map(() => false),
    found: 0,
    foundStashes: 0,
    noise: 0,
    peakNoise: 0,
    alerted: false,
    stepsHeard: false,
    done: false,
    reason: null,
  };
}

/** Restliche Zeit in Sekunden, nie unter 0. */
export function timeLeft(state: SearchState): number {
  return Math.max(0, state.end - state.time);
}

/** Fortschritt der laufenden Suche (0 bis 1), sonst 0. */
export function progress(setup: SearchSetup, state: SearchState): number {
  const c = state.current;
  return c ? clamp01(c.t / setup.items[c.index].duration) : 0;
}

/**
 * Ein Ding antippen. Ist gerade nichts dran, beginnt die Suche sofort; sonst kommt es als Nächstes dran (ein Platz).
 * Schon durchsuchte Dinge und das gerade durchsuchte zählen nicht.
 */
export function pick(setup: SearchSetup, state: SearchState, index: number): SearchEvent[] {
  if (state.done || index < 0 || index >= setup.items.length || state.searched[index]) return [];
  if (state.current?.index === index) return [];
  if (state.current) {
    state.queued = index;
    return [];
  }
  state.current = { index, t: 0 };
  return [{ type: 'start', index }];
}

function finishItem(setup: SearchSetup, state: SearchState, index: number, events: SearchEvent[]): void {
  const item = setup.items[index];
  state.searched[index] = true;
  state.current = null;
  if (item.noise > 0) {
    state.noise = Math.min(1, state.noise + item.noise);
    state.peakNoise = Math.max(state.peakNoise, state.noise);
    events.push({ type: 'noise', index, level: state.noise });
    if (state.noise >= 1 && !state.alerted) {
      state.alerted = true;
      state.end = Math.min(state.end, state.time + ALERT_SECONDS);
      events.push({ type: 'alert' });
    }
  }
  if (item.stash) {
    state.found += item.money;
    state.foundStashes += 1;
    events.push({ type: 'found', index, amount: item.money });
  } else events.push({ type: 'empty', index });
  if (state.foundStashes >= setup.stashes) {
    state.done = true;
    state.reason = 'all';
    events.push({ type: 'end', reason: 'all' });
    return;
  }
  const next = state.queued;
  state.queued = null;
  if (next !== null && !state.searched[next]) {
    state.current = { index: next, t: 0 };
    events.push({ type: 'start', index: next });
  }
}

/** Zeit laufen lassen (dt in Sekunden). Gibt zurück, was passiert ist. */
export function advance(setup: SearchSetup, state: SearchState, dt: number): SearchEvent[] {
  const events: SearchEvent[] = [];
  if (state.done || !(dt > 0)) return events;
  state.time += dt;
  state.noise = Math.max(0, state.noise - NOISE_DECAY * dt);
  if (state.current) {
    state.current.t += dt;
    if (state.current.t >= setup.items[state.current.index].duration) {
      finishItem(setup, state, state.current.index, events);
      if (state.done) return events;
    }
  }
  if (!state.stepsHeard && timeLeft(state) <= STEPS_AT) {
    state.stepsHeard = true;
    events.push({ type: 'steps' });
  }
  if (timeLeft(state) <= 0) {
    state.done = true;
    state.reason = 'time';
    state.current = null;
    events.push({ type: 'end', reason: 'time' });
  }
  return events;
}

/** Score: gefundenes Geld / verstecktes Geld (ohne Geld: gefundene Verstecke / alle). */
export function searchScore(setup: SearchSetup, state: SearchState): number {
  const share = setup.total > 0 ? state.found / setup.total : state.foundStashes / Math.max(1, setup.stashes);
  // Nicht gerundet: Der Kern bucht round(max · Score), das muss genau das Gefundene sein.
  return clamp01(share);
}

/** picks für den Kern: found:<n>, hidden:<n>, dazu noise, wenn die Nachbarn alarmiert waren. */
export function searchPicks(setup: SearchSetup, state: SearchState): string[] {
  const picks = [`found:${state.foundStashes}`, `hidden:${setup.stashes}`];
  if (state.alerted) picks.push('noise');
  return picks;
}
