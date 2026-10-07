// Bewerbungsgespräch (Auftrag 44, Teil 9): Spiellogik als reines Modell (ohne DOM, getestet in model.test.ts).
//
// Drei Runden. Je Runde liegen drei Fragen auf dem Tisch (aus INTERVIEW_QUESTIONS in recruiting, fest aus dem Seed,
// keine doppelt). Du wählst eine, die Person antwortet (Text tippt sich ab, dazu die Stimme). Danach hast du READ_TIME
// Sekunden, um eine von drei Deutungen anzutippen: Eine stimmt (die Eigenschaft, die die Antwort verrät, oder „Nichts
// davon“, wenn die Person keine der geprüften hat), zwei sind Köder. Schwerer heißt: Die Köder kommen öfter aus den
// Eigenschaften, die dieselbe Frage prüft (passen also auch zur Frage), statt von ganz woanders.
//
// Score = richtige Deutungen / Runden. picks = die angetippten Eigenschaften (der Kern deckt nur echte auf).

import { createRng, type MouthStyle } from '../../../../../core';
import { INTERVIEW_QUESTIONS, type InterviewQuestion, TRAIT_MOOD } from '../../../../recruiting';
import type { TraitId } from '../../../../staff';

/** Was man antippen kann: eine Eigenschaft oder „Nichts davon“. */
export type Reading = TraitId | 'none';

export const ROUNDS = 3;
export const OFFERS_PER_ROUND = 3;
/** Zeit zum Deuten (Sekunden). */
export const READ_TIME = 8;
/** Zeit zum Wählen einer Frage; danach fragst du die erste. */
export const CHOOSE_TIME = 15;
/** So viele Zeichen pro Sekunde tippt die Antwort ab. */
export const TYPE_SPEED = 38;
/** Die Antwort steht mindestens so lange, bevor die Deutungen kommen (außer man überspringt). */
export const ANSWER_MIN = 1.2;
/** So lange steht das Urteil einer Runde, bevor die nächste kommt. */
export const VERDICT_TIME = 1.6;

const ALL_TRAITS: readonly TraitId[] = [
  'family',
  'drinker',
  'gambler',
  'ambitious',
  'coward',
  'braggart',
  'loyal',
  'hothead',
  'charmer',
  'nimble',
];

/** Eine Frage, wie sie auf dem Tisch liegt, mit der Antwort, die diese Person geben würde. */
export interface Offer {
  questionId: string;
  topic: string;
  icon: string;
  text: string;
  answer: string;
  /** Was die Antwort verrät. */
  reveals: Reading;
  /** Ausdruck im Gesicht beim Antworten. */
  mood: MouthStyle;
  /** Drei Deutungen in fester Reihenfolge (eine richtig). */
  readings: Reading[];
}

export interface InterviewSetup {
  rounds: Offer[][];
  readTime: number;
  difficulty: number;
}

export interface InterviewPerson {
  /** Alle Eigenschaften der Person. */
  traits: readonly TraitId[];
  /** Schon bekannte (die Antworten verraten lieber Neues). */
  known?: readonly TraitId[];
}

export type Phase = 'choose' | 'answer' | 'read' | 'verdict' | 'end';

export interface RoundResult {
  questionId: string;
  reveals: Reading;
  /** null: Zeit abgelaufen. */
  picked: Reading | null;
  correct: boolean;
}

export interface InterviewState {
  phase: Phase;
  round: number;
  /** Gewählte Frage dieser Runde (Index in rounds[round]). */
  chosen: number | null;
  /** Zeit in der aktuellen Phase (Sekunden). */
  t: number;
  results: RoundResult[];
}

export type Signal = 'asked' | 'typed' | 'reading' | 'correct' | 'wrong' | 'timeout' | 'round' | 'done';

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
): { reveals: Reading; answer: string } {
  const matching = q.probes.filter((t) => person.traits.includes(t) && (q.answers[t]?.length ?? 0) > 0);
  const fresh = matching.filter((t) => !person.known?.includes(t));
  const pool = fresh.length > 0 ? fresh : matching;
  if (pool.length === 0) return { reveals: 'none', answer: pickOne(rng, q.neutral) };
  const trait = pickOne(rng, pool);
  return { reveals: trait, answer: pickOne(rng, q.answers[trait] ?? q.neutral) };
}

/** Zwei Köder: Eigenschaften, die die Person nicht hat (sonst deckte ein „falscher“ Tipp etwas Echtes auf). */
function decoysFor(
  rng: () => number,
  q: InterviewQuestion,
  person: InterviewPerson,
  reveals: Reading,
  difficulty: number,
): Reading[] {
  const foreign = (t: TraitId) => !person.traits.includes(t);
  const near = shuffle(
    rng,
    q.probes.filter((t) => t !== reveals && foreign(t)),
  );
  const far = shuffle(
    rng,
    ALL_TRAITS.filter((t) => t !== reveals && foreign(t) && !q.probes.includes(t)),
  );
  const out: Reading[] = [];
  // „Nichts davon“ ist ein guter Köder, wenn die Antwort etwas verrät (dann steht es nicht immer für die Lösung).
  if (reveals !== 'none' && rng() < 0.35) out.push('none');
  while (out.length < 2) {
    const fromNear = near.length > 0 && (far.length === 0 || rng() < 0.25 + 0.65 * difficulty);
    const next = fromNear ? near.shift() : far.shift();
    if (next === undefined) break;
    out.push(next);
  }
  // Sicherheitsnetz (kommt bei zehn Eigenschaften nie vor): auffüllen mit „Nichts davon“.
  if (out.length < 2 && reveals !== 'none' && !out.includes('none')) out.push('none');
  return out;
}

/** Inhalt eines Gesprächs fest aus dem Seed. */
export function createInterview(seed: number, difficulty: number, person: InterviewPerson): InterviewSetup {
  const rng = createRng(seed);
  const d = Math.min(1, Math.max(0, Number.isFinite(difficulty) ? difficulty : 0.5));
  const order = shuffle(rng, INTERVIEW_QUESTIONS);
  const rounds: Offer[][] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const offers: Offer[] = [];
    for (let i = 0; i < OFFERS_PER_ROUND; i++) {
      const q = order[(r * OFFERS_PER_ROUND + i) % order.length];
      const { reveals, answer } = answerFor(rng, q, person);
      const readings = shuffle(rng, [reveals, ...decoysFor(rng, q, person, reveals, d)]);
      offers.push({
        questionId: q.id,
        topic: q.topic,
        icon: q.icon,
        text: q.text,
        answer,
        reveals,
        mood: reveals === 'none' ? 'neutral' : TRAIT_MOOD[reveals],
        readings,
      });
    }
    rounds.push(offers);
  }
  return { rounds, readTime: READ_TIME, difficulty: d };
}

export function initInterview(): InterviewState {
  return { phase: 'choose', round: 0, chosen: null, t: 0, results: [] };
}

/** Frage, die gerade läuft (nach der Wahl). */
export function currentOffer(setup: InterviewSetup, s: InterviewState): Offer | null {
  if (s.chosen === null) return null;
  return setup.rounds[s.round]?.[s.chosen] ?? null;
}

/** Fragen, die gerade auf dem Tisch liegen. */
export function offersOf(setup: InterviewSetup, s: InterviewState): Offer[] {
  return setup.rounds[s.round] ?? [];
}

/** Wie lange die Antwort zum Abtippen braucht. */
export function answerDuration(offer: Offer): number {
  return Math.max(ANSWER_MIN, offer.answer.length / TYPE_SPEED);
}

/** Wie viele Zeichen der Antwort schon stehen. */
export function typedChars(setup: InterviewSetup, s: InterviewState): number {
  const offer = currentOffer(setup, s);
  if (!offer) return 0;
  if (s.phase !== 'answer') return offer.answer.length;
  return Math.min(offer.answer.length, Math.floor(s.t * TYPE_SPEED));
}

/** Restzeit der aktuellen Phase (Wählen bzw. Deuten), sonst 0. */
export function timeLeft(setup: InterviewSetup, s: InterviewState): number {
  if (s.phase === 'choose') return Math.max(0, CHOOSE_TIME - s.t);
  if (s.phase === 'read') return Math.max(0, setup.readTime - s.t);
  return 0;
}

/** Eine Frage stellen. */
export function choose(setup: InterviewSetup, s: InterviewState, index: number): Signal[] {
  if (s.phase !== 'choose' || !setup.rounds[s.round]?.[index]) return [];
  s.chosen = index;
  s.phase = 'answer';
  s.t = 0;
  return ['asked'];
}

/** Antwort fertig zeigen (Leertaste bzw. Tippen). */
export function skipAnswer(_setup: InterviewSetup, s: InterviewState): Signal[] {
  if (s.phase !== 'answer') return [];
  s.phase = 'read';
  s.t = 0;
  return ['typed', 'reading'];
}

function settle(s: InterviewState, offer: Offer, picked: Reading | null): Signal[] {
  const correct = picked !== null && picked === offer.reveals;
  s.results.push({ questionId: offer.questionId, reveals: offer.reveals, picked, correct });
  s.phase = 'verdict';
  s.t = 0;
  return [picked === null ? 'timeout' : correct ? 'correct' : 'wrong'];
}

/** Eine Deutung antippen. */
export function read(setup: InterviewSetup, s: InterviewState, index: number): Signal[] {
  const offer = currentOffer(setup, s);
  if (s.phase !== 'read' || !offer) return [];
  const picked = offer.readings[index];
  if (picked === undefined) return [];
  return settle(s, offer, picked);
}

/** Zeit laufen lassen (dt in Sekunden). */
export function advance(setup: InterviewSetup, s: InterviewState, dt: number): Signal[] {
  if (s.phase === 'end') return [];
  s.t += Math.max(0, dt);
  switch (s.phase) {
    case 'choose':
      return s.t >= CHOOSE_TIME ? choose(setup, s, 0) : [];
    case 'answer': {
      const offer = currentOffer(setup, s);
      return offer && s.t >= answerDuration(offer) ? skipAnswer(setup, s) : [];
    }
    case 'read': {
      const offer = currentOffer(setup, s);
      return offer && s.t >= setup.readTime ? settle(s, offer, null) : [];
    }
    case 'verdict':
      if (s.t < VERDICT_TIME) return [];
      if (s.round + 1 >= setup.rounds.length) {
        s.phase = 'end';
        s.t = 0;
        return ['done'];
      }
      s.round += 1;
      s.chosen = null;
      s.phase = 'choose';
      s.t = 0;
      return ['round'];
    default:
      return [];
  }
}

export function isDone(s: InterviewState): boolean {
  return s.phase === 'end';
}

/** Richtig gedeutete Runden. */
export function correctCount(s: InterviewState): number {
  return s.results.filter((r) => r.correct).length;
}

/** Score 0 bis 1: Anteil richtig gedeuteter Runden. */
export function interviewScore(setup: InterviewSetup, s: InterviewState): number {
  return setup.rounds.length > 0 ? correctCount(s) / setup.rounds.length : 0;
}

/** Angetippte Eigenschaften (ohne „Nichts davon“), ohne Doppelte. */
export function interviewPicks(s: InterviewState): string[] {
  const out: string[] = [];
  for (const r of s.results) if (r.picked && r.picked !== 'none' && !out.includes(r.picked)) out.push(r.picked);
  return out;
}

/** Richtig erkannte Eigenschaften (für die Akte). */
export function discovered(s: InterviewState): TraitId[] {
  const out: TraitId[] = [];
  for (const r of s.results) if (r.correct && r.reveals !== 'none' && !out.includes(r.reveals)) out.push(r.reveals);
  return out;
}
