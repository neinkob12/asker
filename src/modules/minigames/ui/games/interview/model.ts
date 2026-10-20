// Bewerbungsgespräch (Auftrag 48: eigene Fragen, Druck steuern) als reines Modell, ohne DOM.
//
// Drei Runden. Jede Runde wählst du eine von drei Fragen; jede Karte sagt, was sie prüft (zwei bis drei
// Eigenschaften). Die Person antwortet (Text tippt sich ab, dazu die Stimme). Verrät die Antwort eine Eigenschaft,
// zeigt die Person währenddessen Zeichen (Blick weg, Schwitzen, Zappeln, Kratzen am Hals, nervöses Grinsen), die du
// rechtzeitig antippen musst (Leertaste bzw. „Zeichen!“). Harmlose Gesten (Nicken, Schluck, Schulterzucken,
// Vorbeugen) sind Fehlalarme. Antwortet die Person unauffällig, gibt es nur Gesten, und du weißt: nichts von dem,
// was die Frage prüft.
//
// Druck: Solange du den Blick hältst (gedrückt halten), steigt der Druck, sonst sinkt er. Jede Person hat eine Zone
// (die Lage hängt an ihren Eigenschaften und wandert langsam, die Breite an der Schwierigkeit). Darunter ist sie
// locker: Zeichen huschen nur kurz vorbei. In der Zone ist sie angespannt: Zeichen stehen lange und deutlich. Darüber
// macht sie zu (Arme verschränkt); bleibst du zu lange darüber, bricht sie die Antwort ab, und was nicht mehr kam,
// fehlt dir. Alles ist sichtbar (Ring um das Porträt, Gesicht), nichts wird geraten.
//
// Inhalt fest aus dem Seed (createRng, je Runde und Frage ein eigener Strom, damit deine Wahl nichts verschiebt).
// Score = richtig beurteilte Runden / Runden. picks = die aufgedeckten Eigenschaften (der Kern deckt nur echte auf).

import { createRng, type MouthStyle } from '../../../../../core';
import { INTERVIEW_QUESTIONS, type InterviewQuestion, TRAIT_MOOD } from '../../../../recruiting';
import type { TraitId } from '../../../../staff';

export const ROUNDS = 3;
/** So viele Fragen stehen je Runde zur Wahl; nach so vielen Sekunden nimmst du die erste. */
export const OFFER = 3;
export const CHOOSE_TIME = 9;
/** So viele Zeichen pro Antwort, harmlose Gesten dazu (leicht bis schwer). */
export const TELLS = { min: 2, max: 3 };
export const DECOYS = { easy: 1, hard: 4 };
/** Ein Zeichen steht so lange, wenn die Person angespannt ist (Sekunden, leicht bis schwer). */
export const TELL_WINDOW = { easy: 1.3, hard: 0.5 };
/** Wie schnell das Fenster mit der Schwierigkeit schrumpft (Exponent: unter 1 wird es schon in der Mitte knapp). */
export const TELL_CURVE = 0.45;
/** Ist sie locker (Druck unter der Zone), huscht es nur so kurz vorbei (Anteil am Fenster, leicht bis schwer). */
export const CALM_LEN = { easy: 0.5, hard: 0.3 };
/** Gesten dauern so lange. */
export const GESTURE_WINDOW = 0.9;
/** So viele Zeichen pro Sekunde tippt die Antwort ab, mindestens so lange steht sie, danach ein Nachhall. */
export const TYPE_SPEED = 36;
export const ANSWER_MIN = 2.4;
export const ANSWER_TAIL = 0.9;
/** Deine Frage steht so lange, bevor die Antwort kommt; das Urteil so lange danach. */
export const ASK_TIME = 1.3;
export const VERDICT_TIME = 1.8;
/** Anteil der Zeichen, die du erwischen musst (leicht bis schwer, aufgerundet). */
export const HITS_NEEDED = { easy: 0.5, hard: 0.75 };
/**
 * Zu wenig Druck verrät nichts (Auftrag 49, Teil E): Eine unauffällige Antwort zählt nur als gelesen, wenn die Person
 * so lange angespannt war (Anteil der Antwort). Wer nie den Blick hält, weiß hinterher nichts.
 */
export const TENSE_NEEDED = 0.35;
/**
 * Schweigen aushalten (Auftrag 49, Teil E): Ist die Antwort zu Ende und die Person noch angespannt, kommt eine Pause
 * (`window` Sekunden). Hältst du den Blick darin `hold` Sekunden in der Zone, rutscht ihr ein Nachsatz heraus, mit
 * einem Zeichen mehr (zählt als Treffer, aber nicht zu den nötigen). Nur bei Antworten, die etwas verraten.
 */
export const SILENCE = { window: 2.4, hold: 1.1, tail: 0.4 };
/** Nachsätze nach dem Schweigen (fest aus dem Seed je Frage). */
export const AFTERWORDS: readonly string[] = [
  '… na ja. Manchmal halt.',
  '… aber das bleibt unter uns, ja?',
  '… okay, öfter, als ich sollte.',
  '… frag nicht weiter.',
  '… ist doch normal, oder?',
];
/** So viele Fehlalarme in einer Runde darf man sich leisten. */
export const FALSE_ALARMS_ALLOWED = 1;

/** Druck 0 bis 1: Ruhewert (dahin sinkt er), Anstieg beim Halten und Abfall pro Sekunde. */
export const PRESSURE = { rest: 0.1, rise: 0.5, fall: 0.35 };
/** Die Zone: Mitte, Breite (leicht bis schwer), wie weit und wie schnell sie wandert. */
export const BAND = {
  center: 0.55,
  width: { easy: 0.38, hard: 0.22 },
  drift: { easy: 0.04, hard: 0.1 },
  speed: 0.55,
  jitter: 0.06,
};
/** Wo die Zone je Eigenschaft liegt: Hitzköpfe und Feiglinge machen früher zu, Angeber halten mehr aus. */
export const TRAIT_BAND: Partial<Record<TraitId, number>> = {
  hothead: -0.12,
  coward: -0.08,
  family: -0.03,
  drinker: -0.02,
  loyal: 0.04,
  charmer: 0.08,
  braggart: 0.1,
};
/** So lange darf der Druck über der Zone liegen, dann bricht die Person ab (leicht bis schwer). */
export const CLOSE_AFTER = { easy: 1.5, hard: 0.75 };

/** Zeichen (verraten etwas) und Gesten (harmlos). */
export type TellKind = 'eyesAway' | 'sweat' | 'fidget' | 'scratch' | 'grin';
export type GestureKind = 'nod' | 'sip' | 'shrug' | 'lean';
export type CueKind = TellKind | GestureKind;

export const TELL_KINDS: readonly TellKind[] = ['eyesAway', 'sweat', 'fidget', 'scratch', 'grin'];
export const GESTURE_KINDS: readonly GestureKind[] = ['nod', 'sip', 'shrug', 'lean'];

export const CUE_NAMES: Record<CueKind, string> = {
  eyesAway: 'Blick weg',
  sweat: 'Schwitzen',
  fidget: 'Zappeln',
  scratch: 'Kratzen am Hals',
  grin: 'Nervöses Grinsen',
  nod: 'Nicken',
  sip: 'Schluck',
  shrug: 'Schulterzucken',
  lean: 'Vorbeugen',
};

/** Was die Person sagt, wenn sie zumacht (je Runde eine). */
export const CLOSED_LINES: readonly string[] = [
  'Was soll das jetzt? Ich bin doch nicht beim Verhör.',
  'Weißt du was? Dazu sag ich nix mehr.',
  'Guck mich nicht so an. Nächste Frage.',
];

export interface Cue {
  kind: CueKind;
  /** Zeichen (true) oder harmlose Geste (false). */
  tell: boolean;
  /** Beginn (Sekunden nach Beginn der Antwort) und Dauer, wenn die Person angespannt ist. */
  at: number;
  len: number;
  /** Kam erst im Nachsatz (Schweigen ausgehalten): zählt als Treffer, aber nicht zu den nötigen. */
  bonus?: boolean;
}

export interface Round {
  questionId: string;
  topic: string;
  icon: string;
  text: string;
  answer: string;
  /** Was die Antwort verrät ('none': unauffällig, dann nur Gesten). */
  reveals: TraitId | 'none';
  mood: MouthStyle;
  /** Dauer der Antwort (Sekunden). */
  duration: number;
  cues: Cue[];
  /** Nachsatz, wenn du das Schweigen aushältst (nur bei Antworten, die etwas verraten). */
  afterword: { text: string; kind: TellKind } | null;
}

export interface InterviewPerson {
  traits: readonly TraitId[];
  known?: readonly TraitId[];
}

export interface InterviewSetup {
  seed: number;
  difficulty: number;
  person: { traits: TraitId[]; known: TraitId[] };
  /** Mitte, Breite und Wandern der Zone, Startphase des Wanderns; Frist über der Zone. */
  band: { center: number; width: number; drift: number; phase: number };
  closeAfter: number;
  /** Anteil am Fenster, wenn die Person locker ist; Anteil der Zeichen, die du brauchst. */
  calmLen: number;
  hitsNeeded: number;
}

export type Phase = 'choose' | 'ask' | 'answer' | 'verdict' | 'end';
/** Wo der Druck gerade liegt: locker (darunter), angespannt (in der Zone), macht zu (darüber). */
export type Zone = 'calm' | 'tense' | 'over';

export interface RoundResult {
  questionId: string;
  reveals: TraitId | 'none';
  /** Zeichen, die du erwischt hast, und wie viele es gab; Fehlalarme. */
  hits: number;
  tells: number;
  falseAlarms: number;
  /** Die Person hat abgebrochen (zu viel Druck). */
  closed: boolean;
  /** Du hast zu wenig Druck gemacht: Die Antwort sagt nichts (nur bei unauffälliger Antwort von Belang). */
  soft: boolean;
  /** Richtig beurteilt: Zeichen erkannt (bzw. bei unauffälliger Antwort nicht getippt). */
  correct: boolean;
  /** Was in die Akte kommt (nur bei correct und einer Eigenschaft). */
  exposed: TraitId | null;
}

export interface InterviewState {
  phase: Phase;
  round: number;
  /** Zeit in der aktuellen Phase (Sekunden). */
  t: number;
  /** Fragen zur Wahl (IDs, nur in 'choose') und die schon gestellten. */
  offer: string[];
  asked: string[];
  /** Gestellte Runden (die aktuelle zuletzt). */
  rounds: Round[];
  /** Diese Runde: getroffene Zeichen (Index in cues), Fehlalarme, Dauer je Zeichen (0 = noch nicht begonnen). */
  caught: number[];
  falseAlarms: number;
  lens: number[];
  /** Druck 0 bis 1, ob du gerade den Blick hältst, wie lange er schon über der Zone liegt. */
  pressure: number;
  pressing: boolean;
  over: number;
  /** Zone beim letzten Schritt (für die Signale beim Wechsel). */
  zone: Zone;
  /** Diese Runde: so lange war die Person angespannt (Sekunden in der Zone während der Antwort). */
  tense: number;
  /** Schweigen: Verlängerung nach der Antwort (0 = keins), so lange in der Zone gehalten, Nachsatz gekommen. */
  extra: number;
  silent: number;
  afterword: boolean;
  results: RoundResult[];
}

export type Signal =
  | 'offer'
  | 'auto'
  | 'asked'
  | 'answering'
  | 'tense'
  | 'calm'
  | 'warn'
  | 'closed'
  | 'miss'
  | 'silence'
  | 'afterword'
  | 'verdict'
  | 'round'
  | 'done';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function shuffle<T>(rng: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickOne<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Eigener Zufallsstrom je Zweck (Runde, Frage), fest aus dem Seed. */
function streamFor(seed: number, key: string): () => number {
  let h = seed | 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x9e3779b1) ^ (h >>> 15);
  return createRng(h >>> 0);
}

export function questionById(id: string): InterviewQuestion | undefined {
  return INTERVIEW_QUESTIONS.find((q) => q.id === id);
}

/** Antwort einer Person auf eine Frage: verrät lieber eine noch unbekannte Eigenschaft. */
function answerFor(
  rng: () => number,
  q: InterviewQuestion,
  person: InterviewSetup['person'],
  used: ReadonlySet<TraitId>,
): { reveals: TraitId | 'none'; answer: string } {
  const matching = q.probes.filter((t) => person.traits.includes(t) && (q.answers[t]?.length ?? 0) > 0);
  const fresh = matching.filter((t) => !person.known.includes(t) && !used.has(t));
  const pool = fresh.length > 0 ? fresh : matching.filter((t) => !used.has(t));
  if (pool.length === 0) return { reveals: 'none', answer: pickOne(rng, q.neutral) };
  const trait = pickOne(rng, pool);
  return { reveals: trait, answer: pickOne(rng, q.answers[trait] ?? q.neutral) };
}

export function answerDuration(answer: string): number {
  return Math.max(ANSWER_MIN, answer.length / TYPE_SPEED) + ANSWER_TAIL;
}

/**
 * Zeichen und Gesten einer Antwort, ohne Überlappung. Reicht die Antwort dafür nicht, redet die Person länger
 * (Pausen): Die Dauer wächst, bis alles hineinpasst.
 */
/** So lange steht ein Zeichen, wenn die Person angespannt ist. */
export function tellWindow(difficulty: number): number {
  return lerp(TELL_WINDOW.easy, TELL_WINDOW.hard, difficulty ** TELL_CURVE);
}

function cuesFor(
  rng: () => number,
  answer: string,
  reveals: TraitId | 'none',
  difficulty: number,
): { cues: Cue[]; duration: number } {
  const tellLen = tellWindow(difficulty);
  const tells = reveals === 'none' ? 0 : TELLS.min + Math.round(rng() * (TELLS.max - TELLS.min));
  const decoys = Math.round(lerp(DECOYS.easy, DECOYS.hard, difficulty)) + (reveals === 'none' ? 1 : 0);
  const kinds: Cue[] = [];
  const tellOrder = shuffle(rng, TELL_KINDS);
  const gestureOrder = shuffle(rng, GESTURE_KINDS);
  for (let i = 0; i < tells; i++)
    kinds.push({ kind: tellOrder[i % tellOrder.length], tell: true, at: 0, len: tellLen });
  for (let i = 0; i < decoys; i++) {
    kinds.push({ kind: gestureOrder[i % gestureOrder.length], tell: false, at: 0, len: GESTURE_WINDOW });
  }
  const order = shuffle(rng, kinds);
  const gap = 0.35;
  // Erst Druck aufbauen lassen: Das erste Zeichen kommt nicht sofort.
  const lead = 1.1;
  const needed = lead + order.reduce((sum, c) => sum + c.len + gap, 0) + ANSWER_TAIL;
  const duration = Math.round(Math.max(answerDuration(answer), needed) * 100) / 100;
  // Auf die Antwort verteilen: gleichmäßige Fächer mit etwas Streuung, nie überlappend.
  const usable = duration - ANSWER_TAIL - lead;
  const slot = usable / Math.max(1, order.length);
  let cursor = lead;
  for (const cue of order) {
    const slack = Math.max(0, slot - cue.len - gap);
    cue.at = Math.round((cursor + rng() * slack) * 100) / 100;
    cursor = cue.at + cue.len + gap;
  }
  return { cues: order.sort((a, b) => a.at - b.at), duration };
}

/** Aufbau fest aus dem Seed: Person, Zone, Frist. Die Fragen wählst du im Spiel. */
export function createInterview(seed: number, difficulty: number, person: InterviewPerson): InterviewSetup {
  const d = clamp(Number.isFinite(difficulty) ? difficulty : 0.5, 0, 1);
  const traits = [...person.traits];
  const known = [...(person.known ?? [])];
  const rng = streamFor(seed, 'band');
  const shift = traits.reduce((sum, t) => sum + (TRAIT_BAND[t] ?? 0), 0);
  const width = lerp(BAND.width.easy, BAND.width.hard, d);
  const drift = lerp(BAND.drift.easy, BAND.drift.hard, d);
  const center = clamp(BAND.center + shift + (rng() * 2 - 1) * BAND.jitter, 0.3 + width / 2, 0.92 - width / 2 - drift);
  return {
    seed,
    difficulty: d,
    person: { traits, known },
    band: { center, width, drift, phase: rng() * Math.PI * 2 },
    closeAfter: lerp(CLOSE_AFTER.easy, CLOSE_AFTER.hard, d),
    calmLen: lerp(CALM_LEN.easy, CALM_LEN.hard, d),
    hitsNeeded: lerp(HITS_NEEDED.easy, HITS_NEEDED.hard, d),
  };
}

/** Eigenschaften, die frühere Runden schon verraten haben. */
function usedTraits(s: InterviewState): Set<TraitId> {
  return new Set(s.rounds.flatMap((r) => (r.reveals === 'none' ? [] : [r.reveals])));
}

/**
 * Drei Fragen zur Wahl: Mindestens eine trifft etwas, das die Person hat und das noch keiner weiß (gibt es so etwas
 * noch), die anderen sind gemischt. Die Reihenfolge auf dem Tisch ist gemischt.
 */
export function offerFor(setup: InterviewSetup, s: InterviewState): string[] {
  const rng = streamFor(setup.seed, `offer:${s.round}`);
  const used = usedTraits(s);
  const hidden = setup.person.traits.filter((t) => !setup.person.known.includes(t) && !used.has(t));
  const left = shuffle(
    rng,
    INTERVIEW_QUESTIONS.filter((q) => !s.asked.includes(q.id)),
  );
  const hitting = left.find((q) => q.probes.some((t) => hidden.includes(t) && (q.answers[t]?.length ?? 0) > 0));
  const picked = hitting ? [hitting, ...left.filter((q) => q !== hitting)] : left;
  return shuffle(rng, picked.slice(0, OFFER)).map((q) => q.id);
}

export function initInterview(setup: InterviewSetup): InterviewState {
  const s: InterviewState = {
    phase: 'choose',
    round: 0,
    t: 0,
    offer: [],
    asked: [],
    rounds: [],
    caught: [],
    falseAlarms: 0,
    lens: [],
    pressure: PRESSURE.rest,
    pressing: false,
    over: 0,
    zone: 'calm',
    tense: 0,
    extra: 0,
    silent: 0,
    afterword: false,
    results: [],
  };
  s.offer = offerFor(setup, s);
  return s;
}

export function currentRound(_setup: InterviewSetup, s: InterviewState): Round | null {
  if (s.phase === 'choose') return null;
  return s.rounds[s.round] ?? null;
}

/** Die Zone gerade (untere und obere Grenze); sie wandert langsam, solange die Person redet. */
export function bandAt(setup: InterviewSetup, s: InterviewState): { lo: number; hi: number } {
  const { center, width, drift, phase } = setup.band;
  const wobble = s.phase === 'answer' ? Math.sin(s.t * BAND.speed + phase + s.round * 2.1) * drift : 0;
  const mid = center + wobble;
  return { lo: mid - width / 2, hi: mid + width / 2 };
}

export function zoneOf(setup: InterviewSetup, s: InterviewState): Zone {
  const { lo, hi } = bandAt(setup, s);
  return s.pressure < lo ? 'calm' : s.pressure > hi ? 'over' : 'tense';
}

/** Blick halten (true) oder loslassen. */
export function press(s: InterviewState, on: boolean): void {
  s.pressing = on;
}

/** Eine der Fragen auf dem Tisch stellen (Index in offer). */
export function choose(setup: InterviewSetup, s: InterviewState, index: number): boolean {
  if (s.phase !== 'choose') return false;
  const id = s.offer[index];
  const q = id ? questionById(id) : undefined;
  if (!q) return false;
  const rng = streamFor(setup.seed, `round:${q.id}`);
  const { reveals, answer } = answerFor(rng, q, setup.person, usedTraits(s));
  const { cues, duration } = cuesFor(rng, answer, reveals, setup.difficulty);
  // Eigener Strom, damit der Nachsatz nichts an Antwort und Zeichen verschiebt.
  const after = streamFor(setup.seed, `afterword:${q.id}`);
  const used = new Set(cues.map((c) => c.kind));
  const free = TELL_KINDS.filter((k) => !used.has(k));
  const afterword =
    reveals === 'none'
      ? null
      : { text: pickOne(after, AFTERWORDS), kind: pickOne(after, free.length > 0 ? free : TELL_KINDS) };
  s.rounds.push({
    questionId: q.id,
    topic: q.topic,
    icon: q.icon,
    text: q.text,
    answer,
    reveals,
    mood: reveals === 'none' ? 'neutral' : TRAIT_MOOD[reveals],
    duration,
    cues,
    afterword,
  });
  s.asked.push(q.id);
  s.offer = [];
  s.phase = 'ask';
  s.t = 0;
  return true;
}

/** Zeichen oder Geste, die gerade zu sehen ist (mit Index und ob sie nur kurz huscht), sonst null. */
export function activeCue(
  setup: InterviewSetup,
  s: InterviewState,
): { index: number; cue: Cue; k: number; faint: boolean } | null {
  const round = currentRound(setup, s);
  if (!round || s.phase !== 'answer') return null;
  for (const [index, cue] of round.cues.entries()) {
    const len = s.lens[index] || 0;
    if (len > 0 && s.t >= cue.at && s.t < cue.at + len) {
      return { index, cue, k: (s.t - cue.at) / len, faint: cue.tell && len < cue.len };
    }
  }
  return null;
}

/** Wie viele Zeichen der Antwort schon stehen. */
export function typedChars(setup: InterviewSetup, s: InterviewState): number {
  const round = currentRound(setup, s);
  if (!round) return 0;
  if (s.phase === 'ask') return 0;
  if (s.phase !== 'answer') return round.answer.length;
  return Math.min(round.answer.length, Math.floor(s.t * TYPE_SPEED));
}

export function isDone(s: InterviewState): boolean {
  return s.phase === 'end';
}

function judge(setup: InterviewSetup, round: Round, s: InterviewState, closed: boolean): RoundResult {
  const tells = round.cues.filter((c) => c.tell && !c.bonus).length;
  const hits = Math.min(tells, s.caught.filter((i) => round.cues[i]?.tell).length);
  const falseAlarms = s.falseAlarms;
  const soft = s.tense < round.duration * TENSE_NEEDED - 1e-9;
  const correct =
    round.reveals === 'none'
      ? falseAlarms <= FALSE_ALARMS_ALLOWED && !soft
      : hits >= neededHits(setup, tells) && falseAlarms <= FALSE_ALARMS_ALLOWED;
  return {
    questionId: round.questionId,
    reveals: round.reveals,
    hits,
    tells,
    falseAlarms,
    closed,
    soft,
    correct,
    exposed: correct && round.reveals !== 'none' ? round.reveals : null,
  };
}

/** So viele Zeichen brauchst du von so vielen. */
export function neededHits(setup: InterviewSetup, tells: number): number {
  return Math.min(tells, Math.ceil(tells * setup.hitsNeeded - 1e-9));
}

function toVerdict(setup: InterviewSetup, round: Round, s: InterviewState, closed: boolean, out: Signal[]): void {
  s.results.push(judge(setup, round, s, closed));
  s.phase = 'verdict';
  s.t = 0;
  out.push('verdict');
}

/** Ein Schritt in echten Sekunden. */
export function advance(setup: InterviewSetup, s: InterviewState, dt: number): Signal[] {
  const out: Signal[] = [];
  if (s.phase === 'end' || !(dt > 0)) return out;
  // Druck: steigt beim Halten (nur, wenn gefragt oder geantwortet wird), sinkt sonst zum Ruhewert.
  const holding = s.pressing && (s.phase === 'ask' || s.phase === 'answer');
  if (holding) s.pressure = clamp(s.pressure + PRESSURE.rise * dt, 0, 1);
  else s.pressure = Math.max(PRESSURE.rest, s.pressure - PRESSURE.fall * dt);
  const was = s.t;
  s.t += dt;
  if (s.phase === 'choose') {
    if (was === 0) out.push('offer');
    if (s.t >= CHOOSE_TIME && choose(setup, s, 0)) out.push('auto');
    return out;
  }
  const round = currentRound(setup, s);
  if (!round) {
    s.phase = 'end';
    out.push('done');
    return out;
  }
  // Wechsel der Zone (Frage und Antwort): für Ton, Vibration und Gesicht.
  const zone = zoneOf(setup, s);
  if (zone !== s.zone && (s.phase === 'ask' || s.phase === 'answer')) {
    out.push(zone === 'tense' ? 'tense' : zone === 'calm' ? 'calm' : 'warn');
    s.zone = zone;
  }
  if (s.phase === 'ask') {
    if (was === 0) out.push('asked');
    if (s.t >= ASK_TIME) {
      s.phase = 'answer';
      s.t = 0;
      s.caught = [];
      s.falseAlarms = 0;
      s.over = 0;
      s.tense = 0;
      s.extra = 0;
      s.silent = 0;
      s.afterword = false;
      s.lens = round.cues.map(() => 0);
      out.push('answering');
    }
  } else if (s.phase === 'answer') {
    // Zeichen, die jetzt beginnen: lang, wenn sie angespannt ist, sonst nur kurz.
    for (const [i, cue] of round.cues.entries()) {
      if (s.lens[i] === 0 && s.t >= cue.at) s.lens[i] = cue.tell && zone === 'calm' ? cue.len * setup.calmLen : cue.len;
    }
    // Verpasste Zeichen melden (für Ton), sobald ihr Fenster vorbei ist.
    for (const [i, cue] of round.cues.entries()) {
      const len = s.lens[i] || cue.len;
      if (cue.tell && !s.caught.includes(i) && was < cue.at + len && s.t >= cue.at + len) out.push('miss');
    }
    if (zone === 'tense') s.tense += dt;
    // Schweigen: Wer den Blick in der Zone hält, bekommt den Nachsatz mit einem Zeichen mehr.
    if (s.extra > 0 && s.t >= round.duration && round.afterword) {
      if (zone === 'tense') s.silent += dt;
      if (!s.afterword && s.silent >= SILENCE.hold) {
        s.afterword = true;
        const len = tellWindow(setup.difficulty);
        round.cues.push({ kind: round.afterword.kind, tell: true, at: s.t, len, bonus: true });
        s.lens.push(len);
        s.extra = Math.max(s.extra, s.t - round.duration + len + SILENCE.tail);
        out.push('afterword');
      }
    }
    // Zu viel Druck: Sie macht zu.
    s.over = zone === 'over' ? s.over + dt : Math.max(0, s.over - dt * 2);
    if (s.over >= setup.closeAfter) {
      out.push('closed');
      toVerdict(setup, round, s, true, out);
    } else if (s.t >= round.duration + s.extra) {
      if (s.extra === 0 && round.afterword && zone === 'tense') {
        s.extra = SILENCE.window;
        out.push('silence');
      } else toVerdict(setup, round, s, false, out);
    }
  } else if (s.phase === 'verdict') {
    if (s.t >= VERDICT_TIME) {
      s.round += 1;
      s.t = 0;
      if (s.round >= ROUNDS) {
        s.phase = 'end';
        out.push('done');
      } else {
        s.phase = 'choose';
        s.offer = offerFor(setup, s);
        out.push('round');
      }
    }
  }
  return out;
}

/** „Zeichen!“ antippen: trifft ein sichtbares Zeichen (einmal je Zeichen), sonst Fehlalarm. */
export function mark(
  setup: InterviewSetup,
  s: InterviewState,
): { result: 'hit' | 'again' | 'falseAlarm'; kind: CueKind | null } | null {
  if (s.phase !== 'answer') return null;
  const active = activeCue(setup, s);
  if (active?.cue.tell) {
    if (s.caught.includes(active.index)) return { result: 'again', kind: active.cue.kind };
    s.caught.push(active.index);
    return { result: 'hit', kind: active.cue.kind };
  }
  s.falseAlarms += 1;
  return { result: 'falseAlarm', kind: active?.cue.kind ?? null };
}

export function correctCount(s: InterviewState): number {
  return s.results.filter((r) => r.correct).length;
}

/** Eigenschaften, die bisher aufgedeckt sind. */
export function discovered(s: InterviewState): TraitId[] {
  return s.results.flatMap((r) => (r.exposed ? [r.exposed] : []));
}

/**
 * Was die unauffällige Antwort einer Runde ausschließt: was die Frage prüfte, außer dem, was schon bekannt ist oder
 * früher verraten wurde (das kann die Person haben, ohne es noch einmal zu zeigen).
 */
export function ruledOutBy(setup: InterviewSetup, s: InterviewState, index: number): TraitId[] {
  const r = s.results[index];
  const round = s.rounds[index];
  if (!r || !round || r.reveals !== 'none' || r.soft) return [];
  const shown = new Set(s.rounds.slice(0, index).flatMap((x) => (x.reveals === 'none' ? [] : [x.reveals])));
  const probes = questionById(round.questionId)?.probes ?? [];
  return probes.filter((t) => !setup.person.known.includes(t) && !shown.has(t));
}

/**
 * Was neu in die Akte kommt: aufgedeckt und noch nicht bekannt. Eine Antwort verrät auch Bekanntes, wenn die Frage
 * nichts Unbekanntes mehr trifft (answerFor); das steht schon in der Akte.
 */
export function newlyDiscovered(s: InterviewState, known: readonly TraitId[]): TraitId[] {
  return discovered(s).filter((t) => !known.includes(t));
}

/** Score 0 bis 1: richtig beurteilte Runden. */
export function interviewScore(_setup: InterviewSetup, s: InterviewState): number {
  return Math.round((correctCount(s) / ROUNDS) * 1000) / 1000;
}

/** picks: die aufgedeckten Eigenschaften (der Kern deckt nur echte auf). */
export function interviewPicks(s: InterviewState): string[] {
  return [...new Set(discovered(s))];
}

/** Wert unter der Wertung im Ergebnis (wie MinigameStat im Rahmen). */
export interface InterviewStat {
  label: string;
  value: string;
  icon?: string;
  tone?: 'good' | 'bad';
}

/** Bis zu vier Werte fürs Ergebnis: Runden, erkannte Zeichen, Fehlalarme, wie oft die Person zugemacht hat. */
export function interviewStats(s: InterviewState): InterviewStat[] {
  const right = correctCount(s);
  const hits = s.results.reduce((n, r) => n + r.hits, 0);
  const tells = s.results.reduce((n, r) => n + r.tells, 0);
  const alarms = s.results.reduce((n, r) => n + r.falseAlarms, 0);
  const closed = s.results.filter((r) => r.closed).length;
  return [
    { label: 'Richtig gelesen', value: `${right}/${ROUNDS}`, icon: 'check', tone: right >= 2 ? 'good' : 'bad' },
    { label: 'Zeichen erkannt', value: `${hits}/${tells}`, icon: 'search' },
    { label: 'Fehlalarme', value: String(alarms), icon: 'alert', ...(alarms > 0 ? { tone: 'bad' as const } : {}) },
    { label: 'Zugemacht', value: String(closed), icon: 'close', ...(closed > 0 ? { tone: 'bad' as const } : {}) },
  ];
}
