// Verkehrskontrolle (Auftrag 47: Gespräch mit Widersprüchen) als reines Modell ohne DOM. Du sitzt im Auto, der Beamte
// steht am Fenster und fragt (Fragen und Antworten in questions.ts). Zu jeder Frage drei Antworten: Eine passt zu
// allem, was er sieht (Uhrzeit, Kennzeichen, Fahrzeug, was hinten liegt) und zu dem, was du vorher gesagt hast; die
// anderen widersprechen etwas davon. Fliegt ein Widerspruch auf (Treffer), steigt das Misstrauen; zwei Treffer:
// „Aussteigen“. Zwischen den Fragen geht er nach hinten und schaut durch die Scheibe oder funkt das Kennzeichen durch.
// Schein zustecken klappt nur bei mittlerem Misstrauen, Gas geben startet die Verfolgungsjagd.
//
// Fakten, Reihenfolge der Fragen und die Mischung der Antworten kommen fest aus dem Seed (createRng); welche Antworten
// gerade passen, hängt von deinen bisherigen Antworten ab. Die Oberfläche ruft advance() jedes Bild und answer(),
// bribe(), flee() bei Eingaben auf und liest den Zustand.

import { createRng } from '../../../../../core';
import {
  type AnswerDef,
  type Evidence,
  type FactKey,
  OFFICER_LINES,
  QUESTIONS,
  type QuestionDef,
  repeatContradiction,
  type Story,
  type Vehicle,
  type Visible,
} from './questions';

// ---------------------------------------------------------------------------------------------- Stellschrauben

/** So viele Treffer, dann lässt er aussteigen. */
export const MAX_HITS = 2;
/** Fragen (leicht bis schwer; ab 6 kommt eine Nachfrage dazu, ab 7 zwei). */
export const QUESTIONS_EASY = 5;
export const QUESTIONS_HARD = 7;
/** Misstrauen: je Treffer, je passender Antwort (fällt), pro Sekunde Warten bei offener Frage, Start. */
export const HIT_SUS = 0.34;
export const OK_SUS = -0.04;
export const WAIT_SUS = { easy: 0.006, hard: 0.014 };
export const START_SUS = 0.12;
/** Ab so vielen Sekunden Überlegen sagt er etwas (einmal je Frage) und es kostet etwas Misstrauen. */
export const SLOW_AFTER = 14;
export const SLOW_SUS = 0.06;
/** Bestechen klappt nur bei mittlerem Misstrauen (dazwischen). */
export const BRIBE_MIN = 0.3;
export const BRIBE_MAX = 0.78;
export const BRIBE_FAIL_SUS = 0.25;
/** Dauer der Zwischenschritte in Sekunden. */
export const GREET = 2.6;
export const REACT = { ok: 1.1, hit: 2.6 };
export const WALK = 3.4;
export const RADIO = 3;
export const END = 2;
/** Score für die Fälle ohne Urteil des Beamten (applyTraffic schaut auf die picks). */
export const BRIBE_SCORE = 0.6;
export const FLEE_SCORE = 0.45;
export const PASS_SCORE = { clean: 0.95, noted: 0.6 };
export const FAIL_SCORE = 0.15;

// ---------------------------------------------------------------------------------------------- Typen

export interface Answer {
  text: string;
  claims: Story;
}

export interface Question {
  id: string;
  fact: FactKey;
  text: string;
  answers: Answer[];
  /** Index der passenden Antwort (für Tests und die Rechte Hand; die Oberfläche zeigt ihn nie). */
  good: number;
}

export type Phase = 'greet' | 'ask' | 'react' | 'walk' | 'radio' | 'end';
export type Outcome = 'pass' | 'fail' | 'flee' | 'bribe';

export interface TrafficSetup {
  seed: number;
  difficulty: number;
  evidence: Evidence;
  /** Reihenfolge der Fragen (IDs aus QUESTIONS). */
  order: string[];
  /** Nach dieser Frage (Index) geht er nach hinten bzw. funkt. */
  walkAfter: number;
  radioAfter: number;
  waitSus: number;
}

export interface TrafficState {
  t: number;
  phase: Phase;
  phaseT: number;
  phaseLen: number;
  /** Welche Frage dran ist (Index in setup.order). */
  index: number;
  /** Die aktuelle Frage mit gemischten Antworten (null außerhalb von 'ask'). */
  question: Question | null;
  story: Story;
  suspicion: number;
  hits: number;
  /** So lange hast du bei der aktuellen Frage schon überlegt. */
  thinking: number;
  slowSaid: boolean;
  walked: boolean;
  radioed: boolean;
  outcome: Outcome | null;
  /** Letzte Zeile des Beamten (Text und Zähler, damit die Sprechblase neu aufploppt). */
  line: { text: string; n: number } | null;
  /** Antworten, die du gegeben hast (Text), für Journal und Ergebnis. */
  given: string[];
  random: () => number;
}

/** Was im Schritt passiert ist (für Ton, Vibration, Optik). */
export type Signal = 'greet' | 'ask' | 'ok' | 'hit' | 'slow' | 'walk' | 'radio' | 'pass' | 'fail' | 'done';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------- Aufbau

export interface TrafficOptions {
  /** Stunde 0 bis 23 (Spieluhr). */
  hour: number;
  /** Stadt der Kontrolle (für das Kennzeichen). */
  homeCity: string;
  /** Mögliche fremde Städte auf dem Kennzeichen. */
  otherCities?: readonly string[];
}

const VEHICLES: readonly Vehicle[] = ['transporter', 'kombi', 'limousine'];
const VISIBLES: readonly Visible[] = ['kartons', 'werkzeug', 'taschen', 'nichts'];

export function createTraffic(seed: number, difficulty: number, options: TrafficOptions): TrafficSetup {
  const random = createRng(seed);
  const d = clamp(Number.isFinite(difficulty) ? difficulty : 0.5, 0, 1);
  const others = options.otherCities?.length ? options.otherCities : ['Hamburg', 'Berlin', 'München', 'Frankfurt'];
  const plateHome = random() < 0.75;
  const evidence: Evidence = {
    hour: clamp(Math.floor(Number.isFinite(options.hour) ? options.hour : 14), 0, 23),
    plateHome,
    plateCity: plateHome ? options.homeCity : others[Math.floor(random() * others.length)],
    homeCity: options.homeCity,
    vehicle: VEHICLES[Math.floor(random() * VEHICLES.length)],
    visible: VISIBLES[Math.floor(random() * VISIBLES.length)],
  };
  // Grundfragen in gemischter Reihenfolge, 'cargo' erst nach dem Blick nach hinten; Nachfragen nach Schwierigkeit.
  const base = QUESTIONS.filter((q) => !q.repeat && q.id !== 'cargo').map((q) => q.id);
  shuffle(base, random);
  const count = Math.round(lerp(QUESTIONS_EASY, QUESTIONS_HARD, d));
  const walkAfter = 1 + Math.floor(random() * 2); // nach der zweiten oder dritten Frage
  const order = [...base.slice(0, walkAfter + 1), 'cargo', ...base.slice(walkAfter + 1)];
  const repeats = QUESTIONS.filter((q) => q.repeat).map((q) => q.id);
  shuffle(repeats, random);
  for (const id of repeats) {
    if (order.length >= count) break;
    order.push(id);
  }
  return {
    seed,
    difficulty: d,
    evidence,
    order,
    walkAfter,
    radioAfter: order.length - 2,
    waitSus: lerp(WAIT_SUS.easy, WAIT_SUS.hard, d),
  };
}

function shuffle<T>(list: T[], random: () => number): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

export function initTraffic(setup: TrafficSetup): TrafficState {
  return {
    t: 0,
    phase: 'greet',
    phaseT: 0,
    phaseLen: GREET,
    index: -1,
    question: null,
    story: {},
    suspicion: START_SUS,
    hits: 0,
    thinking: 0,
    slowSaid: false,
    walked: false,
    radioed: false,
    outcome: null,
    line: null,
    given: [],
    random: createRng(setup.seed ^ 0x3c6ef372),
  };
}

// ---------------------------------------------------------------------------------------------- Fragen

export function questionDef(id: string): QuestionDef {
  const def = QUESTIONS.find((q) => q.id === id);
  if (!def) throw new Error(`Unbekannte Frage: ${id}`);
  return def;
}

/** Satz des Beamten, wenn die Antwort nicht passt (null = passt). */
export function contradiction(def: QuestionDef, answer: AnswerDef, ev: Evidence, story: Story): string | null {
  if (def.repeat) return repeatContradiction(def, answer, story);
  return answer.fits(ev, story);
}

/**
 * Die Frage mit drei Antworten bauen: eine passende, zwei, die widersprechen (gibt es nicht genug widersprechende,
 * kommen weitere passende dazu). Gemischt mit dem Zufall des Zustands.
 */
export function buildQuestion(setup: TrafficSetup, state: TrafficState, id: string): Question {
  const def = questionDef(id);
  const ev = setup.evidence;
  const good: AnswerDef[] = [];
  const bad: AnswerDef[] = [];
  for (const a of def.answers) (contradiction(def, a, ev, state.story) ? bad : good).push(a);
  shuffle(good, state.random);
  shuffle(bad, state.random);
  const picked: AnswerDef[] = [];
  if (good.length) picked.push(good[0]);
  for (const a of bad) if (picked.length < 3) picked.push(a);
  for (const a of good.slice(1)) if (picked.length < 3) picked.push(a);
  shuffle(picked, state.random);
  const goodIndex = picked.findIndex((a) => !contradiction(def, a, ev, state.story));
  return {
    id,
    fact: def.fact,
    text: def.ask(ev, state.story),
    answers: picked.map((a) => ({ text: a.text, claims: a.claims })),
    good: goodIndex,
  };
}

function say(state: TrafficState, lines: readonly string[]): void {
  const text = lines[Math.floor(state.random() * lines.length)] ?? lines[0];
  state.line = { text, n: (state.line?.n ?? 0) + 1 };
}

function sayText(state: TrafficState, text: string): void {
  state.line = { text, n: (state.line?.n ?? 0) + 1 };
}

function enter(state: TrafficState, phase: Phase, len: number): void {
  state.phase = phase;
  state.phaseT = 0;
  state.phaseLen = len;
}

/** Nächste Frage stellen (oder das Urteil fällen). Gibt das Signal zurück. */
function nextQuestion(setup: TrafficSetup, state: TrafficState): Signal {
  // Nachfragen nur, wenn es etwas nachzufragen gibt.
  let next = state.index + 1;
  while (next < setup.order.length) {
    const def = questionDef(setup.order[next]);
    if (!def.repeat || state.story[def.fact]) break;
    next += 1;
  }
  if (next >= setup.order.length) {
    const noted = state.hits > 0;
    state.outcome = 'pass';
    say(state, noted ? OFFICER_LINES.passNoted : OFFICER_LINES.pass);
    enter(state, 'end', END);
    return 'pass';
  }
  state.index = next;
  state.question = buildQuestion(setup, state, setup.order[next]);
  state.thinking = 0;
  state.slowSaid = false;
  sayText(state, state.question.text);
  enter(state, 'ask', Infinity);
  return 'ask';
}

/** Zwischenschritt vor der nächsten Frage: nach hinten schauen, funken, oder gleich fragen. */
function proceed(setup: TrafficSetup, state: TrafficState): Signal {
  if (!state.walked && state.index >= setup.walkAfter) {
    state.walked = true;
    say(state, OFFICER_LINES.walk);
    enter(state, 'walk', WALK);
    return 'walk';
  }
  if (!state.radioed && state.index >= setup.radioAfter && state.index < setup.order.length - 1) {
    state.radioed = true;
    say(state, OFFICER_LINES.radio);
    enter(state, 'radio', RADIO);
    return 'radio';
  }
  return nextQuestion(setup, state);
}

// ---------------------------------------------------------------------------------------------- Schritt

export function isDone(state: TrafficState): boolean {
  return state.phase === 'end' && state.phaseT >= state.phaseLen;
}

/** Zeit laufen lassen. Signale für Ton und Optik. */
export function advance(setup: TrafficSetup, state: TrafficState, dt: number): Signal[] {
  const signals: Signal[] = [];
  if (!(dt > 0)) return signals;
  state.t += dt;
  state.phaseT += dt;
  switch (state.phase) {
    case 'greet':
      if (state.phaseT >= state.phaseLen) signals.push(nextQuestion(setup, state));
      else if (!state.line) {
        say(
          state,
          setup.evidence.hour >= 18 || setup.evidence.hour <= 5 ? OFFICER_LINES.greetNight : OFFICER_LINES.greetDay,
        );
        signals.push('greet');
      }
      break;
    case 'ask':
      state.thinking += dt;
      state.suspicion = clamp(state.suspicion + setup.waitSus * dt, 0, 1);
      if (state.thinking >= SLOW_AFTER && !state.slowSaid) {
        state.slowSaid = true;
        state.suspicion = clamp(state.suspicion + SLOW_SUS, 0, 1);
        say(state, OFFICER_LINES.slow);
        signals.push('slow');
      }
      break;
    case 'react':
    case 'walk':
    case 'radio':
      if (state.phaseT >= state.phaseLen) signals.push(proceed(setup, state));
      break;
    case 'end':
      if (state.phaseT >= state.phaseLen && state.phaseT - dt < state.phaseLen) signals.push('done');
      break;
  }
  return signals;
}

export type AnswerResult = 'ok' | 'hit' | 'fail' | 'none';

/** Eine Antwort wählen (Index 0 bis 2). */
export function answer(setup: TrafficSetup, state: TrafficState, index: number): AnswerResult {
  const q = state.question;
  if (state.phase !== 'ask' || !q || state.outcome) return 'none';
  const a = q.answers[index];
  if (!a) return 'none';
  const def = questionDef(q.id);
  const full = def.answers.find((x) => x.text === a.text);
  const remark = full ? contradiction(def, full, setup.evidence, state.story) : null;
  state.given.push(a.text);
  // Was du sagst, gilt ab jetzt (auch wenn es nicht passt: dann hast du es eben behauptet).
  for (const [k, v] of Object.entries(a.claims)) if (v) state.story[k as FactKey] = v;
  state.question = null;
  if (remark) {
    state.hits += 1;
    state.suspicion = clamp(state.suspicion + HIT_SUS, 0, 1);
    if (state.hits >= MAX_HITS) {
      state.outcome = 'fail';
      sayText(state, `${remark} ${OFFICER_LINES.fail[Math.floor(state.random() * OFFICER_LINES.fail.length)]}`);
      enter(state, 'end', END + 0.6);
      return 'fail';
    }
    sayText(state, remark);
    enter(state, 'react', REACT.hit);
    return 'hit';
  }
  state.suspicion = clamp(state.suspicion + OK_SUS, 0, 1);
  say(state, OFFICER_LINES.ok);
  enter(state, 'react', REACT.ok);
  return 'ok';
}

export type BribeResult = 'ok' | 'low' | 'high' | 'done';

/** Schein zustecken: klappt nur bei mittlerem Misstrauen. Zu früh oder zu spät macht es schlimmer. */
export function bribe(state: TrafficState): BribeResult {
  if (state.outcome || state.phase === 'end') return 'done';
  if (state.suspicion < BRIBE_MIN) {
    state.suspicion = clamp(state.suspicion + BRIBE_FAIL_SUS, 0, 1);
    say(state, OFFICER_LINES.bribeLow);
    return 'low';
  }
  if (state.suspicion > BRIBE_MAX) {
    state.outcome = 'fail';
    say(state, OFFICER_LINES.bribeHigh);
    enter(state, 'end', END);
    return 'high';
  }
  state.outcome = 'bribe';
  say(state, OFFICER_LINES.bribeOk);
  enter(state, 'end', END);
  return 'ok';
}

/** Gas geben: Abbruch, die Verfolgungsjagd übernimmt. */
export function flee(state: TrafficState): boolean {
  if (state.outcome || state.phase === 'end') return false;
  state.outcome = 'flee';
  say(state, OFFICER_LINES.flee);
  enter(state, 'end', 0.8);
  return true;
}

/** Fortschritt 0 bis 1 (Fragen beantwortet). */
export function progress(setup: TrafficSetup, state: TrafficState): number {
  const total = Math.max(1, setup.order.length);
  const done = state.phase === 'ask' ? state.index : state.index + 1;
  return clamp(done / total, 0, 1);
}

/** Wo er gerade ist: am Fenster, hinten am Wagen oder am Funkgerät. */
export function officerSpot(state: TrafficState): 'window' | 'rear' | 'radio' {
  if (state.phase === 'walk') return 'rear';
  if (state.phase === 'radio') return 'radio';
  return 'window';
}

// ---------------------------------------------------------------------------------------------- Ergebnis

export function trafficScore(state: TrafficState): number {
  switch (state.outcome) {
    case 'flee':
      return FLEE_SCORE;
    case 'bribe':
      return BRIBE_SCORE;
    case 'pass':
      return state.hits > 0 ? PASS_SCORE.noted : PASS_SCORE.clean;
    default:
      return FAIL_SCORE;
  }
}

/** picks für den Kern: 'flee', 'bribe', 'lies:<n>' (aufgeflogene Widersprüche bei Erfolg: er notiert das Kennzeichen). */
export function trafficPicks(state: TrafficState): string[] {
  const picks: string[] = [];
  if (state.outcome === 'flee') picks.push('flee');
  if (state.outcome === 'bribe') picks.push('bribe');
  if (state.outcome === 'pass' && state.hits > 0) picks.push(`lies:${state.hits}`);
  return picks;
}
