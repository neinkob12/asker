// Bewerbungsgespräch (Feedback vom 07.10.2026: Lügendetektor statt Fragen deuten) als reines Modell, ohne DOM.
//
// Drei Runden. Du stellst eine Frage (fest aus dem Seed, am liebsten eine, die eine noch unbekannte Eigenschaft der
// Person berührt), die Person antwortet (Text tippt sich ab, dazu die Stimme). Verrät die Antwort eine Eigenschaft,
// zeigt die Person währenddessen kurz Zeichen (Blick weg, Schwitzen, Zappeln, Kratzen am Hals, nervöses Grinsen): Du
// musst sie rechtzeitig antippen (Leertaste bzw. „Zeichen!“). Dazwischen gibt es harmlose Gesten (Nicken, Schluck aus
// dem Becher, Schulterzucken, Vorbeugen), die keine Zeichen sind: Antippen ist ein Fehlalarm. Antwortet die Person
// unauffällig, gibt es nur Gesten. Am Ende jeder Runde das Urteil: Zeichen erkannt → die Eigenschaft steht in der Akte.
//
// Score = richtig beurteilte Runden / Runden. picks = die aufgedeckten Eigenschaften (der Kern deckt nur echte auf).

import { createRng, type MouthStyle } from '../../../../../core';
import { INTERVIEW_QUESTIONS, type InterviewQuestion, TRAIT_MOOD } from '../../../../recruiting';
import type { TraitId } from '../../../../staff';

export const ROUNDS = 3;
/** So viele Zeichen pro Antwort (leicht bis schwer: eher weniger, dafür kürzer), harmlose Gesten dazu. */
export const TELLS = { min: 2, max: 3 };
export const DECOYS = { easy: 1, hard: 3 };
/** Ein Zeichen ist so lange zu sehen (Sekunden, leicht bis schwer). */
export const TELL_WINDOW = { easy: 1.2, hard: 0.75 };
/** Gesten dauern so lange. */
export const GESTURE_WINDOW = 0.9;
/** So viele Zeichen pro Sekunde tippt die Antwort ab, mindestens so lange steht sie, danach ein Nachhall. */
export const TYPE_SPEED = 36;
export const ANSWER_MIN = 2.4;
export const ANSWER_TAIL = 0.9;
/** Deine Frage steht so lange, bevor die Antwort kommt; das Urteil so lange danach. */
export const ASK_TIME = 1.3;
export const VERDICT_TIME = 1.8;
/** So viele Fehlalarme in einer Runde darf man sich leisten. */
export const FALSE_ALARMS_ALLOWED = 1;

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

export interface Cue {
  kind: CueKind;
  /** Zeichen (true) oder harmlose Geste (false). */
  tell: boolean;
  /** Beginn (Sekunden nach Beginn der Antwort) und Dauer. */
  at: number;
  len: number;
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
}

export interface InterviewSetup {
  rounds: Round[];
  difficulty: number;
}

export interface InterviewPerson {
  traits: readonly TraitId[];
  known?: readonly TraitId[];
}

export type Phase = 'ask' | 'answer' | 'verdict' | 'end';

export interface RoundResult {
  questionId: string;
  reveals: TraitId | 'none';
  /** Zeichen, die du erwischt hast, und wie viele es gab; Fehlalarme. */
  hits: number;
  tells: number;
  falseAlarms: number;
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
  /** Diese Runde: getroffene Zeichen (Index in cues), Fehlalarme. */
  caught: number[];
  falseAlarms: number;
  results: RoundResult[];
}

export type Signal = 'asked' | 'answering' | 'hit' | 'miss' | 'falseAlarm' | 'verdict' | 'round' | 'done';

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

/** Antwort einer Person auf eine Frage: verrät lieber eine noch unbekannte Eigenschaft. */
function answerFor(
  rng: () => number,
  q: InterviewQuestion,
  person: InterviewPerson,
  used: Set<TraitId>,
): { reveals: TraitId | 'none'; answer: string } {
  const matching = q.probes.filter((t) => person.traits.includes(t) && (q.answers[t]?.length ?? 0) > 0);
  const fresh = matching.filter((t) => !person.known?.includes(t) && !used.has(t));
  const pool = fresh.length > 0 ? fresh : matching.filter((t) => !used.has(t));
  if (pool.length === 0) return { reveals: 'none', answer: pickOne(rng, q.neutral) };
  const trait = pickOne(rng, pool);
  return { reveals: trait, answer: pickOne(rng, q.answers[trait] ?? q.neutral) };
}

export function answerDuration(answer: string): number {
  return Math.max(ANSWER_MIN, answer.length / TYPE_SPEED) + ANSWER_TAIL;
}

/**
 * Zeichen und Gesten einer Antwort, ohne Überlappung, aus dem Seed. Reicht die Antwort dafür nicht, redet die Person
 * länger (Pausen): Die Dauer wächst, bis alles hineinpasst.
 */
function cuesFor(
  rng: () => number,
  answer: string,
  reveals: TraitId | 'none',
  difficulty: number,
): { cues: Cue[]; duration: number } {
  const tellLen = lerp(TELL_WINDOW.easy, TELL_WINDOW.hard, difficulty);
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
  const lead = 0.5;
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

/** Inhalt eines Gesprächs fest aus dem Seed: drei Fragen, möglichst zu noch unbekannten Eigenschaften. */
export function createInterview(seed: number, difficulty: number, person: InterviewPerson): InterviewSetup {
  const rng = createRng(seed);
  const d = clamp(Number.isFinite(difficulty) ? difficulty : 0.5, 0, 1);
  const unknown = person.traits.filter((t) => !person.known?.includes(t));
  const hits = (q: InterviewQuestion) => q.probes.filter((t) => unknown.includes(t)).length;
  // Fragen, die etwas Unbekanntes berühren, zuerst (gemischt), dann der Rest.
  const pool = shuffle(rng, INTERVIEW_QUESTIONS);
  const ordered = [...pool.filter((q) => hits(q) > 0), ...pool.filter((q) => hits(q) === 0)];
  const used = new Set<TraitId>();
  const rounds: Round[] = [];
  for (const q of ordered) {
    if (rounds.length >= ROUNDS) break;
    const { reveals, answer } = answerFor(rng, q, person, used);
    if (reveals !== 'none') used.add(reveals);
    const { cues, duration } = cuesFor(rng, answer, reveals, d);
    rounds.push({
      questionId: q.id,
      topic: q.topic,
      icon: q.icon,
      text: q.text,
      answer,
      reveals,
      mood: reveals === 'none' ? 'neutral' : TRAIT_MOOD[reveals],
      duration,
      cues,
    });
  }
  return { rounds, difficulty: d };
}

export function initInterview(): InterviewState {
  return { phase: 'ask', round: 0, t: 0, caught: [], falseAlarms: 0, results: [] };
}

export function currentRound(setup: InterviewSetup, s: InterviewState): Round | null {
  return setup.rounds[s.round] ?? null;
}

/** Zeichen oder Geste, die gerade zu sehen ist (mit Index), sonst null. */
export function activeCue(setup: InterviewSetup, s: InterviewState): { index: number; cue: Cue; k: number } | null {
  const round = currentRound(setup, s);
  if (!round || s.phase !== 'answer') return null;
  for (const [index, cue] of round.cues.entries()) {
    if (s.t >= cue.at && s.t < cue.at + cue.len) return { index, cue, k: (s.t - cue.at) / cue.len };
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

function judge(round: Round, s: InterviewState): RoundResult {
  const tells = round.cues.filter((c) => c.tell).length;
  const hits = s.caught.filter((i) => round.cues[i]?.tell).length;
  const falseAlarms = s.falseAlarms;
  const correct =
    round.reveals === 'none'
      ? falseAlarms <= FALSE_ALARMS_ALLOWED
      : hits >= Math.ceil(tells / 2) && falseAlarms <= FALSE_ALARMS_ALLOWED;
  return {
    questionId: round.questionId,
    reveals: round.reveals,
    hits,
    tells,
    falseAlarms,
    correct,
    exposed: correct && round.reveals !== 'none' ? round.reveals : null,
  };
}

/** Ein Schritt in echten Sekunden. */
export function advance(setup: InterviewSetup, s: InterviewState, dt: number): Signal[] {
  const out: Signal[] = [];
  if (s.phase === 'end') return out;
  const round = currentRound(setup, s);
  if (!round) {
    s.phase = 'end';
    out.push('done');
    return out;
  }
  const was = s.t;
  s.t += dt;
  if (s.phase === 'ask') {
    if (was === 0) out.push('asked');
    if (s.t >= ASK_TIME) {
      s.phase = 'answer';
      s.t = 0;
      s.caught = [];
      s.falseAlarms = 0;
      out.push('answering');
    }
  } else if (s.phase === 'answer') {
    // Verpasste Zeichen melden (für Ton), sobald ihr Fenster vorbei ist.
    for (const [i, cue] of round.cues.entries()) {
      if (cue.tell && !s.caught.includes(i) && was < cue.at + cue.len && s.t >= cue.at + cue.len) out.push('miss');
    }
    if (s.t >= round.duration) {
      s.results.push(judge(round, s));
      s.phase = 'verdict';
      s.t = 0;
      out.push('verdict');
    }
  } else if (s.phase === 'verdict') {
    if (s.t >= VERDICT_TIME) {
      s.round += 1;
      s.t = 0;
      if (s.round >= setup.rounds.length) {
        s.phase = 'end';
        out.push('done');
      } else {
        s.phase = 'ask';
        out.push('round');
      }
    }
  }
  return out;
}

/** „Zeichen!“ antippen: trifft ein sichtbares Zeichen (einmal je Zeichen), sonst Fehlalarm. */
export function mark(setup: InterviewSetup, s: InterviewState): 'hit' | 'again' | 'falseAlarm' | null {
  if (s.phase !== 'answer') return null;
  const active = activeCue(setup, s);
  if (active?.cue.tell) {
    if (s.caught.includes(active.index)) return 'again';
    s.caught.push(active.index);
    return 'hit';
  }
  s.falseAlarms += 1;
  return 'falseAlarm';
}

export function correctCount(s: InterviewState): number {
  return s.results.filter((r) => r.correct).length;
}

/** Eigenschaften, die bisher aufgedeckt sind. */
export function discovered(s: InterviewState): TraitId[] {
  return s.results.flatMap((r) => (r.exposed ? [r.exposed] : []));
}

/** Score 0 bis 1: richtig beurteilte Runden. */
export function interviewScore(setup: InterviewSetup, s: InterviewState): number {
  const n = Math.max(1, setup.rounds.length);
  return Math.round((correctCount(s) / n) * 1000) / 1000;
}

/** picks: die aufgedeckten Eigenschaften (der Kern deckt nur echte auf). */
export function interviewPicks(s: InterviewState): string[] {
  return [...new Set(discovered(s))];
}
