// Zivi oder Kunde (Auftrag 44, Teil 5): Spiellogik als reines Modell (ohne DOM, getestet in model.test.ts).
//
// Eine Schicht am Spot: Leute kommen nacheinander, jeder als Karte mit Gesicht, einem Satz und dem, was man sieht.
// Darunter ein bis drei Zivis. Faustregel (fair aus den Daten): Ein Zivi hat mindestens zwei verdächtige Merkmale, ein
// echter Kunde höchstens eins. Pro Karte bleibt eine feste Zeit (6 s, schwer 4 s); wer zu lange zögert, lässt den Kunden
// gehen. Alles kommt aus dem Seed der Challenge (createRng), nie aus ctx.random().

import { createRng, type Look, lookFor } from '../../../../../core';
import { undercoverScore } from '../../../../police';
import { ASKS_BIG, ASKS_SMALL, ASKS_SUPPLIER, FORMAL_NAMES, GREETINGS_POLITE, GREETINGS_STREET } from './lines';
import { CUES, NOISE, TELLS, type TellShow } from './tells';

export interface UndercoverGood {
  productId: string;
  name: string;
  unit: string;
}

/** Was das Spiel aus den params braucht (police, UndercoverParams). */
export interface UndercoverInput {
  customers: number;
  zivis: number;
  goods: UndercoverGood[];
}

/** Eine Person am Spot. */
export interface Person {
  index: number;
  zivi: boolean;
  look: Look;
  /** Was sie sagt. */
  line: string;
  /** Alles, was man sieht (IDs aus tells.ts), gemischt: verdächtig, harmlos, vertrauenswürdig. */
  tells: string[];
  /** Was im Bild zu sehen ist. */
  shows: Partial<Record<TellShow, boolean>>;
  /** Schuhe am unteren Kartenrand. */
  shoes: 'new' | 'worn' | 'plain';
  productId: string;
  amount: number;
  unit: string;
}

export interface Shift {
  people: Person[];
  /** Sekunden pro Karte. */
  perCard: number;
  /** Pause zwischen zwei Karten (die nächste schiebt sich nach vorn). */
  gap: number;
  zivis: number;
}

export type Decision = 'sell' | 'refuse' | 'timeout';

/** Was eine Entscheidung bedeutet. */
export type Verdict = 'sold' | 'spotted' | 'soldZivi' | 'turnedAway' | 'missed';

export interface ShiftState {
  index: number;
  /** Restzeit der aktuellen Karte in Sekunden. */
  cardLeft: number;
  /** Pause bis zur nächsten Karte (> 0: noch keine Karte offen). */
  gapLeft: number;
  decisions: Decision[];
  done: boolean;
}

export type ShiftEvent =
  | { type: 'decided'; index: number; decision: Decision; verdict: Verdict; zivi: boolean }
  | { type: 'next'; index: number }
  | { type: 'done' };

/** Zeit pro Karte: 6 s, schwer (ab 0,8) 4 s. */
export function cardSeconds(difficulty: number): number {
  const d = Math.min(1, Math.max(0, (difficulty - 0.3) / 0.5));
  return Math.round((6 - 2 * d) * 10) / 10;
}

/** params aus police lesen, ohne sich auf ihre Form zu verlassen (alte Stände, Vorschau). */
export function inputFrom(params: Record<string, unknown>): UndercoverInput {
  const zivis = Math.max(1, Math.min(3, Math.floor(Number(params.zivis) || 1)));
  const customers = Math.max(zivis + 1, Math.min(12, Math.floor(Number(params.customers) || 8)));
  const goods = (Array.isArray(params.goods) ? params.goods : [])
    .map((g) => g as Record<string, unknown>)
    .map((g) => ({ productId: String(g.productId ?? ''), name: String(g.name ?? 'Gras'), unit: String(g.unit ?? 'g') }))
    .filter((g) => g.productId !== '');
  return { customers, zivis, goods: goods.length > 0 ? goods : [{ productId: 'weed', name: 'Gras', unit: 'g' }] };
}

type Rng = () => number;

function pickOne<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function shuffle<T>(rng: Rng, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Bis zu n verschiedene aus einer Liste. */
function pickSome<T>(rng: Rng, list: readonly T[], n: number): T[] {
  return shuffle(rng, [...list]).slice(0, Math.max(0, n));
}

const UNIT_WORDS: Record<string, string> = { g: 'Gramm', Stück: 'Stück', ml: 'ml' };

function amountFor(rng: Rng, unit: string, big: boolean): number {
  if (unit === 'g') return big ? pickOne(rng, [30, 50, 100]) : 1 + Math.floor(rng() * 5);
  if (unit === 'ml') return big ? pickOne(rng, [50, 100]) : 5 + 5 * Math.floor(rng() * 2);
  return big ? pickOne(rng, [20, 40]) : 1 + Math.floor(rng() * 4);
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

/** Haare, die die Ohren verdecken (dann sähe man den Knopf im Ohr nicht). */
const EAR_COVERING = new Set(['long', 'afro', 'dreads', 'braids', 'curly', 'mullet']);

/** Gesicht: fest aus dem Seed, so angepasst, dass man sieht, was die Karte sagt. */
function lookOf(seed: string, tells: readonly string[]): Look {
  const base = lookFor(seed);
  const partial: Partial<Look> = { mask: 'none' };
  if (tells.includes('hood')) partial.hat = 'hood';
  if (tells.includes('earpiece') || tells.includes('headphones')) {
    if (EAR_COVERING.has(base.hair)) partial.hair = base.feminine ? 'tight' : 'short';
    if (!['none', 'cap', 'backcap'].includes(base.hat)) partial.hat = 'none';
  }
  if (tells.includes('wire') && ['openshirt', 'tank'].includes(base.top)) partial.top = 'jacket';
  return lookFor(seed, '', partial);
}

const HARD = TELLS.filter((t) => t.strength === 'hard').map((t) => t.id);
const SOFT = TELLS.filter((t) => t.strength === 'soft').map((t) => t.id);
const NOISE_IDS = NOISE.map((t) => t.id);
const CUE_IDS = CUES.map((t) => t.id);
const SHOWS = new Map<string, TellShow>([...TELLS, ...NOISE, ...CUES].map((t) => [t.id, t.show]));

/** Verdächtige Merkmale eines Zivis: zwei (leicht auch drei), schwer seltener ein eindeutiges. */
function ziviTells(rng: Rng, d: number): string[] {
  const hardChance = d < 0.4 ? 1 : d < 0.75 ? 0.6 : 0.3;
  const total = 2 + (rng() < 0.35 * (1 - d) ? 1 : 0);
  const hard = rng() < hardChance ? 1 : 0;
  return [...pickSome(rng, HARD, hard), ...pickSome(rng, SOFT, total - hard)];
}

/** Eine Schicht aus Seed und Schwierigkeit. Die erste Karte ist immer ein echter Kunde (zum Reinkommen). */
export function createShift(seed: number, difficulty: number, input: UndercoverInput): Shift {
  const rng = createRng(seed);
  const d = Math.min(1, Math.max(0, difficulty));
  const n = Math.max(input.zivis + 1, input.customers);
  const ziviAt = new Set(
    pickSome(
      rng,
      Array.from({ length: n - 1 }, (_, i) => i + 1),
      input.zivis,
    ),
  );
  const people: Person[] = [];
  for (let index = 0; index < n; index++) {
    const zivi = ziviAt.has(index);
    const tells: string[] = zivi ? ziviTells(rng, d) : rng() < 0.2 + 0.4 * d ? pickSome(rng, SOFT, 1) : [];
    const cueChance = zivi ? (d >= 0.5 ? 0.35 * d : 0) : 0.55;
    if (rng() < cueChance) {
      const cues = CUE_IDS.filter((c) => !(c === 'worn' && tells.includes('newShoes')));
      tells.push(pickOne(rng, cues));
    }
    const noise = (rng() < 0.6 ? 1 : 0) + (d >= 0.6 && rng() < 0.3 ? 1 : 0);
    for (const id of pickSome(rng, NOISE_IDS, noise)) {
      if (id === 'hood' && tells.includes('earpiece')) continue;
      tells.push(id);
    }
    const shown = shuffle(rng, tells.slice(0, 4));
    const good = pickOne(rng, input.goods);
    const big = shown.includes('bigOrder');
    const amount = amountFor(rng, good.unit, big);
    const ware = shown.includes('noSlang') ? (FORMAL_NAMES[good.productId] ?? 'Cannabis') : good.name;
    const greeting = shown.includes('tooPolite') ? pickOne(rng, GREETINGS_POLITE) : pickOne(rng, GREETINGS_STREET);
    const ask = fill(pickOne(rng, big ? ASKS_BIG : ASKS_SMALL), {
      menge: `${amount} ${UNIT_WORDS[good.unit] ?? good.unit}`,
      ware,
    });
    const supplier = shown.includes('asksSupplier') ? ` ${pickOne(rng, ASKS_SUPPLIER)}` : '';
    const shows: Partial<Record<TellShow, boolean>> = {};
    for (const id of shown) {
      const show = SHOWS.get(id);
      if (show && show !== 'none' && show !== 'speech') shows[show] = true;
    }
    people.push({
      index,
      zivi,
      look: lookOf(`uc:${seed}:${index}`, shown),
      line: `${greeting} ${ask}${supplier}`,
      tells: shown,
      shows,
      shoes: shown.includes('newShoes') ? 'new' : shown.includes('worn') ? 'worn' : 'plain',
      productId: good.productId,
      amount,
      unit: good.unit,
    });
  }
  return { people, perCard: cardSeconds(d), gap: 0.45, zivis: input.zivis };
}

export function initShift(shift: Shift): ShiftState {
  return { index: 0, cardLeft: shift.perCard, gapLeft: 0, decisions: [], done: shift.people.length === 0 };
}

/** Was eine Entscheidung bei dieser Person bedeutet. */
export function verdictOf(person: Pick<Person, 'zivi'>, decision: Decision): Verdict {
  if (person.zivi) return decision === 'sell' ? 'soldZivi' : decision === 'refuse' ? 'spotted' : 'missed';
  return decision === 'sell' ? 'sold' : 'turnedAway';
}

/** Ist gerade eine Karte offen (keine Pause, nicht vorbei)? */
export function canDecide(state: ShiftState): boolean {
  return !state.done && state.gapLeft <= 0;
}

/** Entscheidung für die aktuelle Karte (null, wenn gerade keine offen ist). */
export function decide(shift: Shift, state: ShiftState, decision: Decision): ShiftEvent | null {
  if (!canDecide(state)) return null;
  const person = shift.people[state.index];
  if (!person) return null;
  state.decisions.push(decision);
  const event: ShiftEvent = {
    type: 'decided',
    index: state.index,
    decision,
    verdict: verdictOf(person, decision),
    zivi: person.zivi,
  };
  state.index += 1;
  if (state.index >= shift.people.length) state.done = true;
  else {
    state.gapLeft = shift.gap;
    state.cardLeft = shift.perCard;
  }
  return event;
}

/** Zeit vergeht: Pause zwischen den Karten, dann die Zeit der Karte. Läuft sie ab, geht der Kunde (timeout). */
export function step(shift: Shift, state: ShiftState, dt: number): ShiftEvent[] {
  if (state.done || dt <= 0) return [];
  const events: ShiftEvent[] = [];
  if (state.gapLeft > 0) {
    state.gapLeft = Math.max(0, state.gapLeft - dt);
    if (state.gapLeft === 0) events.push({ type: 'next', index: state.index });
    return events;
  }
  state.cardLeft = Math.max(0, state.cardLeft - dt);
  if (state.cardLeft === 0) {
    const e = decide(shift, state, 'timeout');
    if (e) events.push(e);
  }
  if (state.done) events.push({ type: 'done' });
  return events;
}

export interface ShiftOutcome {
  soldZivi: number;
  spotted: number;
  turnedAway: number;
  sold: number;
  /** Zivis, die man zu lange angeschaut hat (gegangen, nicht erkannt). */
  missed: number;
}

export function shiftOutcome(shift: Shift, state: ShiftState): ShiftOutcome {
  const out: ShiftOutcome = { soldZivi: 0, spotted: 0, turnedAway: 0, sold: 0, missed: 0 };
  state.decisions.forEach((decision, i) => {
    const person = shift.people[i];
    if (person) out[verdictOf(person, decision)] += 1;
  });
  return out;
}

/** picks für police (soldZivi:<n>, spotted:<n>, turnedAway:<n>, sold:<n>, missed:<n>), nur was vorkam. */
export function shiftPicks(out: ShiftOutcome): string[] {
  return (['soldZivi', 'spotted', 'turnedAway', 'sold', 'missed'] as const)
    .filter((k) => out[k] > 0)
    .map((k) => `${k}:${out[k]}`);
}

/** Score wie in police: Anteil richtig, halbiert bei Verkauf an einen Zivi. */
export function shiftScore(shift: Shift, out: ShiftOutcome): number {
  return undercoverScore(out, shift.people.length);
}

/** picks zählen (für den Satz unter dem Stempel). */
export function countPick(picks: readonly string[], id: string): number {
  let n = 0;
  for (const pick of picks) {
    const [name, value] = pick.split(':');
    if (name === id) n += Number(value) || 0;
  }
  return n;
}
