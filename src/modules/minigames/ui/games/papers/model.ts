// Papiere fälschen (Auftrag 44, Teil 8) als reines Modell ohne DOM: Papiere und Werte aus dem Seed, 2 bis 5
// Widersprüche (mehr mit der Schwierigkeit), der Zöllner liest Zeile für Zeile (sein Finger), Felder umschreiben,
// Stempel setzen, Schein ins Papier legen, Ladung aufgeben. Die Oberfläche (PapersGame.tsx) ruft advance() jedes Bild
// und choose()/bribe()/giveUp() bei Eingaben auf und liest den Zustand. Alles ist deterministisch aus Seed,
// Schwierigkeit, Ort, Uhrzeit und Eingaben.
//
// Regel: Kommt der Finger an eine Zeile, prüft er sie. Stimmt der Wert nicht (anders als auf den anderen Papieren
// bzw. als Waage, Kalender, Kamera), ist das ein Treffer. Zwei Treffer: nicht geschafft. Geprüfte Zeilen sind fest.

import { clock, createRng } from '../../../../../core';
import {
  CONTAINER_PREFIXES,
  FIELD_KEYS,
  type FieldKey,
  fieldLabel,
  GOODS,
  OFFICER_LINES,
  type OfficerLine,
  ORIGINS,
  PAPERS,
  type PaperDef,
  PLATE_PREFIXES,
  RECEIVERS,
  type Setting,
  WEIGHT_RANGE,
} from './data';

/** So viele Treffer, dann lässt er aufmachen. */
export const MAX_HITS = 2;
/** Score mit Schein im Papier (applyPapers schaut auf den pick 'bribe'). */
export const BRIBE_SCORE = 0.6;
/** Wert eines Stempels, der fehlt. */
export const NO_STAMP = '';

export type Phase = 'browse' | 'read' | 'pause' | 'turn' | 'end';
export type Outcome = 'pass' | 'fail' | 'bribe' | 'giveUp';

/** Eine Zeile auf einem Papier. */
export interface FieldSlot {
  /** '<papier>:<feld>', z.B. 'cmr:weight'. */
  id: string;
  paper: number;
  line: number;
  key: FieldKey;
  truth: string;
  /** Wert, mit dem das Papier auf dem Tisch liegt. */
  start: string;
  /** Werte zur Auswahl beim Umschreiben (die Wahrheit ist dabei, Reihenfolge fest aus dem Seed). */
  options: string[];
}

export interface PapersSetup {
  seed: number;
  difficulty: number;
  setting: Setting;
  papers: { def: PaperDef; slots: FieldSlot[] }[];
  /** Alle Zeilen in der Reihenfolge, in der er liest. */
  slots: FieldSlot[];
  /** Was stimmt (Waage, Kalender, Kamera zeigen weight, date, plate). */
  truth: Record<FieldKey, string>;
  /** IDs der Zeilen, die anfangs nicht stimmen. */
  wrong: string[];
  /** Sekunden: Durchblättern am Anfang, je Zeile, Papierwechsel, Stocken nach einem Treffer. */
  startDelay: number;
  lineTime: number;
  paperPause: number;
  hitPause: number;
}

export interface PapersState {
  t: number;
  phase: Phase;
  phaseT: number;
  phaseLen: number;
  /** Zeile, an der der Finger ist (Index in setup.slots). */
  cursor: number;
  values: Record<string, string>;
  /** Geprüfte Zeilen: ok oder Treffer. */
  seen: Record<string, 'ok' | 'hit'>;
  /** Zeilen, die du umgeschrieben hast. */
  edited: string[];
  hits: number;
  bribeUsed: boolean;
  /** Was der Zöllner gerade sagt (Zähler, damit die Sprechblase neu aufploppt). */
  say: { key: OfficerLine; text: string; n: number } | null;
  outcome: Outcome | null;
}

/** Was im Schritt passiert ist (für Ton, Vibration, Optik). */
export type Signal =
  | 'read'
  | 'hit'
  | 'nextPaper'
  | 'write'
  | 'stamp'
  | 'bribeAccepted'
  | 'bribeRejected'
  | 'giveUp'
  | 'pass'
  | 'fail'
  | 'done';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function shuffle<T>(list: T[], rnd: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pick<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length)];
}

/** Andere Werte aus einer Liste (ohne den richtigen), gemischt. */
function others(list: readonly string[], truth: string, rnd: () => number): string[] {
  return shuffle(
    list.filter((x) => x !== truth),
    rnd,
  );
}

/** 12480 → „12.480 kg“. */
export function formatKg(kg: number): string {
  return `${String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kg`;
}

/** „Fr, Tag 12“ zu einem Zeitpunkt in Spielminuten. */
export function dateText(time: number): string {
  return `${clock.weekdayName(time, true)}, Tag ${clock.day(time)}`;
}

const LETTERS = 'ABCDEFGHKLMNPRSTUVWXZ';
const DIGITS = '0123456789';

function makePlate(setting: Setting, rnd: () => number): string {
  const digits = (n: number) => Array.from({ length: n }, () => pick([...DIGITS], rnd)).join('');
  if (setting === 'port')
    return `${pick(CONTAINER_PREFIXES, rnd)} ${pick([...'123456789'], rnd)}${digits(5)}-${digits(1)}`;
  const letters = `${pick([...LETTERS], rnd)}${pick([...LETTERS], rnd)}`;
  return `${pick(PLATE_PREFIXES, rnd)}-${letters} ${pick([...'123456789'], rnd)}${digits(2 + Math.floor(rnd() * 2))}`;
}

/** Fast dieselbe Nummer: zwei Ziffern vertauscht oder eine Ziffer bzw. ein Buchstabe anders. */
function nearPlate(plate: string, rnd: () => number, avoid: readonly string[]): string {
  for (let tries = 0; tries < 30; tries++) {
    const chars = [...plate];
    const digitAt = chars.map((c, i) => (DIGITS.includes(c) ? i : -1)).filter((i) => i >= 0);
    const letterAt = chars.map((c, i) => (LETTERS.includes(c) && i > 0 ? i : -1)).filter((i) => i >= 0);
    const r = rnd();
    if (r < 0.45 && digitAt.length >= 2) {
      const k = Math.floor(rnd() * (digitAt.length - 1));
      const [a, b] = [digitAt[k], digitAt[k + 1]];
      [chars[a], chars[b]] = [chars[b], chars[a]];
    } else if (r < 0.8 || letterAt.length === 0) {
      const i = pick(digitAt, rnd);
      chars[i] = pick(
        [...DIGITS].filter((d) => d !== chars[i]),
        rnd,
      );
    } else {
      const i = pick(letterAt, rnd);
      chars[i] = pick(
        [...LETTERS].filter((l) => l !== chars[i]),
        rnd,
      );
    }
    const out = chars.join('');
    if (out !== plate && !avoid.includes(out)) return out;
  }
  return `${plate}1`;
}

/** Falsche Werte zu einem Feld, der erste ist der, mit dem ein falsches Papier auf dem Tisch liegt. */
function decoys(
  key: FieldKey,
  truth: Record<FieldKey, string>,
  ctx: { setting: Setting; weight: number; time: number },
  rnd: () => number,
): string[] {
  const { setting } = ctx;
  switch (key) {
    case 'sender': {
      const all = ORIGINS[setting].flatMap((o) => o.senders);
      return others(all, truth.sender, rnd).slice(0, 3);
    }
    case 'receiver':
      return others(RECEIVERS[setting], truth.receiver, rnd).slice(0, 3);
    case 'origin':
    case 'stamp':
      return others(
        ORIGINS[setting].map((o) => o.country),
        truth.origin,
        rnd,
      ).slice(0, 3);
    case 'goods':
      return others(GOODS[setting], truth.goods, rnd).slice(0, 3);
    case 'weight': {
      const step = setting === 'port' ? 1000 : 100;
      const swaps = [ctx.weight + step * (1 + Math.floor(rnd() * 4)), ctx.weight - step * (1 + Math.floor(rnd() * 3))];
      // Zwei Ziffern vertauscht (2.480 ↔ 2.840) fällt nur beim genauen Hinsehen auf.
      const digits = [...String(ctx.weight)];
      const i = 1 + Math.floor(rnd() * Math.max(1, digits.length - 3));
      [digits[i], digits[i + 1]] = [digits[i + 1], digits[i]];
      const swapped = Number(digits.join(''));
      const list = shuffle([...swaps, ...(swapped !== ctx.weight ? [swapped] : [])], rnd).map(formatKg);
      return [...new Set(list)].filter((w) => w !== truth.weight).slice(0, 3);
    }
    case 'plate': {
      const out: string[] = [];
      for (let i = 0; i < 3; i++) out.push(nearPlate(truth.plate, rnd, out));
      return out;
    }
    case 'date':
      return shuffle([-1, 1, -2], rnd).map((d) => dateText(ctx.time + d * 24 * 60));
  }
}

/**
 * Tisch fest aus Seed, Schwierigkeit und Ort ('autobahn' oder 'port'); time (Spielminuten) gibt das Datum von heute.
 * 2 bis 5 Widersprüche, nie in den ersten beiden Zeilen des ersten Papiers (die liest er zu früh).
 */
export function createPapers(
  seed: number,
  difficulty: number,
  options: { setting?: Setting; time?: number } = {},
): PapersSetup {
  const d = clamp(Number.isFinite(difficulty) ? difficulty : 0.5, 0, 1);
  const setting: Setting = options.setting === 'port' ? 'port' : 'autobahn';
  const time = Number.isFinite(options.time) ? Math.max(0, options.time ?? 0) : 0;
  const rnd = createRng(seed);
  const origin = pick(ORIGINS[setting], rnd);
  const [lo, hi] = WEIGHT_RANGE[setting];
  const weight = Math.round((lo + rnd() * (hi - lo)) / 10) * 10;
  const truth: Record<FieldKey, string> = {
    sender: pick(origin.senders, rnd),
    receiver: pick(RECEIVERS[setting], rnd),
    origin: origin.country,
    goods: pick(GOODS[setting], rnd),
    weight: formatKg(weight),
    plate: makePlate(setting, rnd),
    date: dateText(time),
    stamp: origin.country,
  };
  const fake = Object.fromEntries(
    FIELD_KEYS.map((key) => [key, decoys(key, truth, { setting, weight, time }, rnd)]),
  ) as Record<FieldKey, string[]>;

  const papers = PAPERS[setting].map((def, paper) => ({
    def,
    slots: def.fields.map(
      (key, line): FieldSlot => ({
        id: `${def.id}:${key}`,
        paper,
        line,
        key,
        truth: truth[key],
        start: truth[key],
        options: [],
      }),
    ),
  }));
  const slots = papers.flatMap((p) => p.slots);

  // Widersprüche: je Feld höchstens einer (so verrät die Mehrheit bzw. die Vorlage auf dem Tisch, was stimmt).
  const count = clamp(Math.round(2 + 3 * d + (rnd() - 0.5) * 0.8), 2, 5);
  const keys = shuffle([...FIELD_KEYS], rnd).slice(0, count);
  const wrong: string[] = [];
  for (const key of keys) {
    const candidates = slots.filter((s) => s.key === key && !(s.paper === 0 && s.line < 2));
    const slot = pick(candidates, rnd);
    slot.start = key === 'stamp' && rnd() < 0.5 ? NO_STAMP : fake[key][0];
    wrong.push(slot.id);
  }
  for (const slot of slots) {
    const pool = [slot.truth, ...fake[slot.key].slice(0, 2)];
    if (slot.start !== NO_STAMP && !pool.includes(slot.start)) pool.push(slot.start);
    slot.options = shuffle(pool, rnd);
  }
  return {
    seed,
    difficulty: d,
    setting,
    papers,
    slots,
    truth,
    wrong: slots.filter((s) => wrong.includes(s.id)).map((s) => s.id),
    startDelay: lerp(6, 4, d),
    lineTime: lerp(1.9, 1.25, d),
    paperPause: 1.3,
    hitPause: 1.4,
  };
}

export function initPapers(setup: PapersSetup): PapersState {
  const s: PapersState = {
    t: 0,
    phase: 'browse',
    phaseT: 0,
    phaseLen: setup.startDelay,
    cursor: 0,
    values: Object.fromEntries(setup.slots.map((slot) => [slot.id, slot.start])),
    seen: {},
    edited: [],
    hits: 0,
    bribeUsed: false,
    say: null,
    outcome: null,
  };
  say(setup, s, 'greet');
  return s;
}

function say(setup: PapersSetup, s: PapersState, key: OfficerLine, vars: Record<string, string> = {}): void {
  const list = OFFICER_LINES[key];
  const n = (s.say?.n ?? 0) + 1;
  let text = list[(setup.seed + n * 7 + key.length) % list.length];
  for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
  s.say = { key, text, n };
}

function setPhase(s: PapersState, phase: Phase, length: number): void {
  s.phase = phase;
  s.phaseT = 0;
  s.phaseLen = length;
}

function end(s: PapersState, outcome: Outcome, length: number): void {
  s.outcome = outcome;
  setPhase(s, 'end', length);
}

/** Stimmt die Zeile gerade? */
export function isRight(setup: PapersSetup, s: PapersState, slotId: string): boolean {
  const slot = setup.slots.find((x) => x.id === slotId);
  return !!slot && s.values[slotId] === slot.truth;
}

/** Kann die Zeile noch umgeschrieben werden (noch nicht geprüft, Spiel läuft)? */
export function isEditable(s: PapersState, slotId: string): boolean {
  return s.phase !== 'end' && s.seen[slotId] === undefined;
}

/** Welches Papier er gerade in der Hand hat. */
export function readingPaper(setup: PapersSetup, s: PapersState): number {
  return setup.slots[Math.min(s.cursor, setup.slots.length - 1)]?.paper ?? 0;
}

/** Liest der Finger gerade eine Zeile (nicht beim Durchblättern oder Umblättern)? */
export function fingerOn(s: PapersState): boolean {
  return s.phase === 'read' || s.phase === 'pause';
}

function hitLine(setup: PapersSetup, s: PapersState, slot: FieldSlot): void {
  const value = s.values[slot.id];
  if (slot.key === 'weight') say(setup, s, 'hitWeight');
  else if (slot.key === 'date') say(setup, s, 'hitDate');
  else if (slot.key === 'plate') say(setup, s, 'hitPlate');
  else if (slot.key === 'stamp') say(setup, s, value === NO_STAMP ? 'hitStampMissing' : 'hitStampWrong');
  else say(setup, s, 'hit', { feld: fieldLabel(slot.key, setup.setting) });
}

/** Der Finger kommt an eine Zeile: prüfen. */
function arrive(setup: PapersSetup, s: PapersState, out: Signal[]): void {
  const slot = setup.slots[s.cursor];
  if (!slot) return;
  if (s.values[slot.id] === slot.truth) {
    s.seen[slot.id] = 'ok';
    setPhase(s, 'read', setup.lineTime);
    out.push('read');
    return;
  }
  s.seen[slot.id] = 'hit';
  s.hits += 1;
  hitLine(setup, s, slot);
  out.push('hit');
  if (s.hits >= MAX_HITS) {
    say(setup, s, 'fail');
    end(s, 'fail', 2);
    out.push('fail');
    return;
  }
  setPhase(s, 'pause', setup.lineTime + setup.hitPause);
}

/** Ein Schritt (dt in echten Sekunden). Gibt zurück, was passiert ist. */
export function advance(setup: PapersSetup, s: PapersState, dt: number): Signal[] {
  const out: Signal[] = [];
  if (s.phase === 'end') {
    const was = s.phaseT;
    s.phaseT += dt;
    if (was < s.phaseLen && s.phaseT >= s.phaseLen) out.push('done');
    return out;
  }
  s.t += dt;
  s.phaseT += dt;
  if (s.phaseT < s.phaseLen) return out;
  if (s.phase === 'browse' || s.phase === 'turn') {
    arrive(setup, s, out);
    return out;
  }
  // Zeile gelesen: weiter zur nächsten (auf einem neuen Papier erst umblättern).
  const prev = setup.slots[s.cursor];
  s.cursor += 1;
  const next = setup.slots[s.cursor];
  if (!next) {
    say(setup, s, 'pass');
    end(s, 'pass', 2);
    out.push('pass');
    return out;
  }
  if (next.paper !== prev?.paper) {
    say(setup, s, 'nextPaper', { papier: setup.papers[next.paper].def.title });
    setPhase(s, 'turn', setup.paperPause);
    out.push('nextPaper');
    return out;
  }
  arrive(setup, s, out);
  return out;
}

/** Feld umschreiben bzw. Stempel setzen. Leer, wenn die Zeile schon geprüft ist oder sich nichts ändert. */
export function choose(setup: PapersSetup, s: PapersState, slotId: string, value: string): Signal[] {
  const slot = setup.slots.find((x) => x.id === slotId);
  if (!slot || !isEditable(s, slotId) || s.values[slotId] === value || !slot.options.includes(value)) return [];
  s.values[slotId] = value;
  if (!s.edited.includes(slotId)) s.edited.push(slotId);
  return [slot.key === 'stamp' ? 'stamp' : 'write'];
}

/** Hat er schon etwas gefunden, nimmt er den Schein (einmal). Vorher ist es ein Treffer. */
export function bribeOpen(s: PapersState): boolean {
  return s.phase !== 'end' && !s.bribeUsed && s.hits >= 1;
}

/** Schein ins Papier legen. */
export function bribe(setup: PapersSetup, s: PapersState): Signal[] {
  if (s.phase === 'end' || s.bribeUsed) return [];
  s.bribeUsed = true;
  if (s.hits >= 1) {
    say(setup, s, 'bribeOk');
    end(s, 'bribe', 2);
    return ['bribeAccepted'];
  }
  s.hits += 1;
  say(setup, s, 'bribeNo');
  return ['bribeRejected'];
}

/** Ladung aufgeben: Du gehst, die Ware bleibt (niemand wird festgenommen). */
export function giveUp(setup: PapersSetup, s: PapersState): Signal[] {
  if (s.phase === 'end') return [];
  say(setup, s, 'giveUp');
  end(s, 'giveUp', 1.6);
  return ['giveUp'];
}

/** Ist das Ende fertig gezeigt (dann onFinish)? */
export function isDone(s: PapersState): boolean {
  return s.phase === 'end' && s.phaseT >= s.phaseLen;
}

/** Widersprüche, die du behoben hast, bevor er sie sah (bzw. die jetzt stimmen, wenn er nicht mehr hinkam). */
export function fixedCount(setup: PapersSetup, s: PapersState): number {
  return setup.wrong.filter((id) => s.seen[id] !== 'hit' && isRight(setup, s, id)).length;
}

/** Offene Widersprüche (auch selbst eingebaute), die er noch nicht gesehen hat. */
export function openCount(setup: PapersSetup, s: PapersState): number {
  return setup.slots.filter((slot) => s.seen[slot.id] === undefined && s.values[slot.id] !== slot.truth).length;
}

/**
 * Score = behobene Widersprüche, bevor er sie sah, durch alle. Durch: mindestens 0,5 (höchstens ein Treffer);
 * nicht durch: höchstens 0,45. Schein 0,6, aufgegeben 0.
 */
export function papersScore(setup: PapersSetup, s: PapersState): number {
  const share = fixedCount(setup, s) / Math.max(1, setup.wrong.length);
  switch (s.outcome) {
    case 'pass':
      return clamp(share, 0.5, 1);
    case 'bribe':
      return BRIBE_SCORE;
    case 'giveUp':
      return 0;
    default:
      return clamp(0.45 * share, 0, 0.45);
  }
}

/** picks für applyPapers: bribe, giveUp; zur Info fixed:<n> und hits:<n>. */
export function papersPicks(setup: PapersSetup, s: PapersState): string[] {
  const picks: string[] = [];
  if (s.outcome === 'bribe') picks.push('bribe');
  if (s.outcome === 'giveUp') picks.push('giveUp');
  picks.push(`fixed:${fixedCount(setup, s)}`, `hits:${s.hits}`);
  return picks;
}
