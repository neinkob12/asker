// Verkehrskontrolle (Auftrag 44, Teil 4) als reines Modell ohne DOM: Fragen in fester Folge aus dem Seed, Antworten
// mit Frist, Misstrauen, Puls im Takt halten, was der Beamte tut (Laderaum, Funk, Papiere), Bestechen und Gas geben.
// Die Oberfläche (TrafficGame.tsx) ruft advance() jedes Bild und answer()/tap()/bribe()/flee() bei Eingaben auf und
// liest den Zustand. Alles hier ist deterministisch aus Seed, Schwierigkeit und Eingaben.

import { createRng } from '../../../../../core';
import { OFFICER_LINES, type OfficerLine, QUESTIONS, type QuestionDef, type Topic } from './questions';

/** Antworten auf Rückfragen mit derselben Behauptung beruhigen, ein Widerspruch kostet so viel Misstrauen. */
export const CONTRADICTION_SUS = 0.3;
/** Ein Widerspruch zwischen zwei Fragen (Großmarkt, aber Umzugskartons). */
export const MISMATCH_SUS = 0.1;
/** „Leer“ gesagt, und er leuchtet in einen vollen Laderaum. */
export const EMPTY_LIE_SUS = 0.35;
/** Schweigen, bis die Frist um ist. */
export const SILENCE_SUS = 0.16;
/** Bestechen klappt nur bei mittlerem Misstrauen (dazwischen), sonst steigt es so stark. */
export const BRIBE_MIN = 0.3;
export const BRIBE_MAX = 0.75;
export const BRIBE_FAIL_SUS = 0.3;
/** Puls: bis GREEN ruhig, bis YELLOW angespannt, darüber zittrig. */
export const PULSE_GREEN = 100;
export const PULSE_YELLOW = 120;
export const PULSE_MIN = 58;
export const PULSE_MAX = 170;
/** Ab diesem Puls fragt er, ob alles in Ordnung ist (einmal). */
export const PULSE_NERVOUS = 128;
/** Ruhiger Takt zum Tippen in Sekunden. */
export const BEAT = 1;
/** Score für die Fälle ohne Urteil des Beamten (applyTraffic schaut auf die picks). */
export const BRIBE_SCORE = 0.6;
export const FLEE_SCORE = 0.45;

export type Zone = 'green' | 'yellow' | 'red';
export type OfficerAction = 'flashlight' | 'radio' | 'papers';
export type Outcome = 'pass' | 'fail' | 'flee' | 'bribe';
export type Phase = 'ask' | 'react' | 'event' | 'end';

/** Eine Frage in der Folge: welche, ob Rückfrage, Reihenfolge der Antworten. */
export interface PlannedQuestion {
  def: QuestionDef;
  recheck: boolean;
  /** IDs der Antworten in der Reihenfolge, in der sie stehen. */
  order: string[];
}

export interface TrafficSetup {
  seed: number;
  difficulty: number;
  /** Fragen in fester Folge (die Frage nach dem Schwitzen kommt nur bei hohem Puls dazu). */
  questions: PlannedQuestion[];
  nervous: PlannedQuestion | null;
  /** Nach so vielen beantworteten Fragen tut der Beamte etwas. */
  actions: { after: number; kind: OfficerAction }[];
  /** Sekunden zum Antworten. */
  answerTime: number;
  /** Misstrauen am Schluss darunter: „Gute Fahrt“. Voll (1) ist sofort vorbei. */
  limit: number;
  /** Ruhepuls am Anfang und wohin er ohne Tippen treibt. */
  startPulse: number;
  stressPulse: number;
  /** „Guten Tag“ bzw. „Guten Abend“. */
  greeting: string;
}

export interface TrafficState {
  t: number;
  phase: Phase;
  phaseT: number;
  phaseLen: number;
  /** Fragen, wie sie kommen (Kopie aus dem Setup, die Frage nach dem Schwitzen wird eingeschoben). */
  queue: PlannedQuestion[];
  index: number;
  answered: number;
  answerLeft: number;
  suspicion: number;
  pulse: number;
  claims: Partial<Record<Topic, string>>;
  /** Was der Beamte gerade sagt (die Frage selbst steht in queue[index]). */
  line: { key: OfficerLine; text: string } | null;
  /** Was du zuletzt gesagt hast, und ob es zittrig klang. */
  said: string | null;
  /** ID der letzten Antwort (null nach Schweigen). */
  lastAnswer: string | null;
  shaky: boolean;
  /** Was der Beamte gerade tut (Phase 'event'). */
  action: OfficerAction | null;
  radioed: boolean;
  nervousAsked: boolean;
  /** Nach der Reaktion dieselbe Frage noch einmal (abgelehnter Schein). */
  repeat: boolean;
  /** Takt, in dem zuletzt getippt wurde (ein Treffer pro Schlag). */
  lastTapBeat: number;
  contradictions: number;
  outcome: Outcome | null;
}

/** Was im Schritt passiert ist (für Ton, Vibration, Optik). */
export type Signal =
  | 'ask'
  | 'timeout'
  | 'contradiction'
  | 'mismatch'
  | 'rude'
  | 'calm'
  | 'flashlight'
  | 'radio'
  | 'papers'
  | 'caught'
  | 'cleared'
  | 'bribeRejected'
  | 'bribeAccepted'
  | 'flee'
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

function planned(def: QuestionDef, recheck: boolean, rnd: () => number): PlannedQuestion {
  return {
    def,
    recheck,
    order: shuffle(
      def.answers.map((a) => a.id),
      rnd,
    ),
  };
}

const byId = (id: string): QuestionDef => {
  const def = QUESTIONS.find((q) => q.id === id);
  if (!def) throw new Error(`Frage ${id} fehlt`);
  return def;
};

/** Ablauf fest aus Seed und Schwierigkeit (4 bis 6 Fragen, eine Rückfrage, Laderaum und ab mittel der Funk). */
export function createTraffic(seed: number, difficulty: number, options: { night?: boolean } = {}): TrafficSetup {
  const d = clamp(Number.isFinite(difficulty) ? difficulty : 0.5, 0, 1);
  const rnd = createRng(seed);
  const total = 4 + Math.round(2 * d);
  // Woher zuerst, Laderaum immer, der Rest gemischt; danach eine Rückfrage zu etwas, das schon zwei Fragen her ist.
  const optional = shuffle(
    QUESTIONS.filter((q) => !q.always && !q.whenNervous).map((q) => q.id),
    rnd,
  );
  const rest = shuffle(['cargo', ...optional.slice(0, total - 3)], rnd);
  const base = [byId('origin'), ...rest.map(byId)];
  const questions = base.map((def) => planned(def, false, rnd));
  const candidates = base.map((def, i) => ({ def, i })).filter(({ def, i }) => def.recheck && i <= base.length - 2);
  const pickRe = candidates[Math.floor(rnd() * candidates.length)] ?? { def: base[0], i: 0 };
  const from = pickRe.i + 2;
  const at = from + Math.floor(rnd() * (base.length - from + 1));
  questions.splice(at, 0, planned(pickRe.def, true, rnd));

  // Der Blick in den Laderaum kommt nach der Frage, was hinten drin ist (spätestens vor der letzten Frage).
  const cargoAt = questions.findIndex((q) => q.def.topic === 'cargo' && !q.recheck);
  const actions: TrafficSetup['actions'] = [{ after: Math.min(cargoAt + 1, questions.length - 1), kind: 'flashlight' }];
  if (d >= 0.3) {
    const free = [];
    for (let after = 1; after < questions.length; after++) {
      if (!actions.some((a) => a.after === after)) free.push(after);
    }
    if (free.length > 0) actions.push({ after: free[Math.floor(rnd() * free.length)], kind: 'radio' });
  }
  const nervous = QUESTIONS.find((q) => q.whenNervous);
  return {
    seed,
    difficulty: d,
    questions,
    nervous: nervous ? planned(nervous, false, rnd) : null,
    actions: actions.sort((a, b) => a.after - b.after),
    answerTime: lerp(6, 4, d),
    limit: lerp(0.72, 0.6, d),
    startPulse: lerp(84, 96, d),
    stressPulse: lerp(104, 128, d),
    greeting: options.night ? 'Guten Abend' : 'Guten Tag',
  };
}

export function initTraffic(setup: TrafficSetup): TrafficState {
  return {
    t: 0,
    phase: 'ask',
    phaseT: 0,
    phaseLen: 0,
    queue: [...setup.questions],
    index: 0,
    answered: 0,
    answerLeft: setup.answerTime,
    suspicion: 0.08 + 0.1 * setup.difficulty,
    pulse: setup.startPulse,
    claims: {},
    line: null,
    said: null,
    lastAnswer: null,
    shaky: false,
    action: null,
    radioed: false,
    nervousAsked: false,
    repeat: false,
    lastTapBeat: -1,
    contradictions: 0,
    outcome: null,
  };
}

export function zoneOf(pulse: number): Zone {
  return pulse < PULSE_GREEN ? 'green' : pulse < PULSE_YELLOW ? 'yellow' : 'red';
}

/** Hoher Puls macht jede verdächtige Antwort schlimmer. */
export function zoneFactor(zone: Zone): number {
  return zone === 'green' ? 1 : zone === 'yellow' ? 1.25 : 1.6;
}

export function currentQuestion(s: TrafficState): PlannedQuestion | undefined {
  return s.queue[s.index];
}

/** Text der Frage, wie der Beamte sie stellt. */
export function questionText(setup: TrafficSetup, q: PlannedQuestion): string {
  if (q.recheck && q.def.recheck) return q.def.recheck;
  return q.def.text.replace('{gruss}', setup.greeting);
}

/** Antworten der Frage in ihrer Reihenfolge. */
export function answersOf(q: PlannedQuestion) {
  return q.order.map((id) => q.def.answers.find((a) => a.id === id)).filter((a) => a !== undefined);
}

/** Zeit zum Antworten (nach dem Funk kürzer: Die Kollegen sind unterwegs). */
export function answerTimeOf(setup: TrafficSetup, s: TrafficState): number {
  return setup.answerTime * (s.radioed ? 0.75 : 1);
}

/** Wo im ruhigen Takt wir sind (0 = Schlag, 0,5 = genau dazwischen). */
export function beatPhase(s: TrafficState): number {
  return (s.t / BEAT) % 1;
}

/** Wie viele Fragen insgesamt (für „Frage 2 von 5“). */
export function questionCount(s: TrafficState): number {
  return s.queue.length;
}

function say(setup: TrafficSetup, s: TrafficState, key: OfficerLine): void {
  const list = OFFICER_LINES[key];
  const text = list[(setup.seed + s.answered * 7 + key.length) % list.length];
  s.line = { key, text };
}

function setPhase(s: TrafficState, phase: Phase, length: number): void {
  s.phase = phase;
  s.phaseT = 0;
  s.phaseLen = length;
}

function addSus(s: TrafficState, amount: number): void {
  s.suspicion = clamp(s.suspicion + amount, 0, 1);
}

function addPulse(s: TrafficState, amount: number): void {
  s.pulse = clamp(s.pulse + amount, PULSE_MIN, PULSE_MAX);
}

function end(s: TrafficState, outcome: Outcome, length: number): void {
  s.outcome = outcome;
  s.action = null;
  setPhase(s, 'end', length);
}

/** Misstrauen voll: sofort vorbei. true = vorbei. */
function checkFull(setup: TrafficSetup, s: TrafficState, out: Signal[]): boolean {
  if (s.suspicion < 1) return false;
  say(setup, s, 'fail');
  end(s, 'fail', 2);
  out.push('fail');
  return true;
}

/** Nächste Frage stellen oder, wenn keine mehr kommt, das Urteil. */
function nextQuestion(setup: TrafficSetup, s: TrafficState, out: Signal[]): void {
  if (s.repeat) s.repeat = false;
  else s.index += 1;
  // Schwitzt du sichtbar, fragt er nach (einmal, nicht als letzte Frage).
  if (
    setup.nervous &&
    !s.nervousAsked &&
    s.pulse >= PULSE_NERVOUS &&
    s.index > 0 &&
    s.index < s.queue.length &&
    !s.queue[s.index]?.recheck
  ) {
    s.queue.splice(s.index, 0, setup.nervous);
    s.nervousAsked = true;
  }
  s.action = null;
  if (s.index >= s.queue.length) {
    const pass = s.suspicion < setup.limit;
    say(setup, s, pass ? 'pass' : 'fail');
    end(s, pass ? 'pass' : 'fail', 2);
    out.push(pass ? 'pass' : 'fail');
    return;
  }
  s.line = null;
  s.answerLeft = answerTimeOf(setup, s);
  setPhase(s, 'ask', 0);
  out.push('ask');
}

/** Nach einer Reaktion: tut der Beamte jetzt etwas (Laderaum, Funk, Papiere)? Sonst die nächste Frage. */
function afterReaction(setup: TrafficSetup, s: TrafficState, out: Signal[]): void {
  const pending = s.repeat ? undefined : setup.actions.find((a) => a.after === s.answered && s.action !== a.kind);
  // Papiere gereicht (nicht „vergessen“, nicht geschwiegen): Er liest.
  const papers =
    !s.repeat &&
    s.action === null &&
    currentQuestion(s)?.def.topic === 'papers' &&
    (s.lastAnswer === 'here' || s.lastAnswer === 'glovebox');
  if (pending && s.phase === 'react') {
    startAction(setup, s, pending.kind, out);
    return;
  }
  if (papers && s.phase === 'react') {
    startAction(setup, s, 'papers', out);
    return;
  }
  nextQuestion(setup, s, out);
}

function startAction(setup: TrafficSetup, s: TrafficState, kind: OfficerAction, out: Signal[]): void {
  s.action = kind;
  if (kind === 'radio') {
    say(setup, s, 'radio');
    s.radioed = true;
    addSus(s, 0.04);
    setPhase(s, 'event', 2.6);
  } else if (kind === 'papers') {
    say(setup, s, 'papers');
    setPhase(s, 'event', 2.2);
  } else {
    s.line = null;
    setPhase(s, 'event', 3.4);
  }
  out.push(kind);
}

/** Was der Beamte am Ende seiner Handlung feststellt. */
function finishAction(setup: TrafficSetup, s: TrafficState, out: Signal[]): void {
  const kind = s.action;
  const zone = zoneOf(s.pulse);
  if (kind === 'flashlight') {
    if (s.claims.cargo === 'empty') {
      addSus(s, EMPTY_LIE_SUS);
      addPulse(s, 14);
      s.contradictions += 1;
      say(setup, s, 'flashlightEmpty');
      out.push('caught');
    } else if (zone === 'red') {
      addSus(s, 0.12);
      say(setup, s, 'flashlightShaky');
      out.push('caught');
    } else {
      addSus(s, -0.03);
      say(setup, s, 'flashlightOk');
      out.push('cleared');
    }
  } else if (kind === 'papers') {
    if (zone === 'red') addSus(s, 0.06);
    s.line = null;
  }
  // Funk: Die Kollegen sind unterwegs (kürzere Frist ab jetzt), sonst nichts.
  if (checkFull(setup, s, out)) return;
  // Was er gefunden hat, steht kurz da, dann geht es weiter.
  if (kind === 'flashlight') {
    setPhase(s, 'react', 1.6);
    s.repeat = false;
    return;
  }
  nextQuestion(setup, s, out);
}

/** Ein Schritt (dt in echten Sekunden). Gibt zurück, was passiert ist. */
export function advance(setup: TrafficSetup, s: TrafficState, dt: number): Signal[] {
  const out: Signal[] = [];
  if (s.phase === 'end') {
    const was = s.phaseT;
    s.phaseT += dt;
    if (was < s.phaseLen && s.phaseT >= s.phaseLen) out.push('done');
    return out;
  }
  s.t += dt;
  s.phaseT += dt;
  // Puls treibt zur Anspannung (mehr mit Misstrauen und wenn er etwas tut); Tippen im Takt hält ihn unten.
  const target = setup.stressPulse + 30 * s.suspicion + (s.phase === 'event' ? 8 : 0);
  s.pulse = clamp(s.pulse + (target - s.pulse) * Math.min(1, dt * 0.14), PULSE_MIN, PULSE_MAX);
  if (s.phase === 'ask') {
    // Zittrig: Er sieht es dir an.
    if (zoneOf(s.pulse) === 'red') addSus(s, 0.014 * dt);
    if (checkFull(setup, s, out)) return out;
    s.answerLeft -= dt;
    if (s.answerLeft <= 0) {
      s.answerLeft = 0;
      silence(setup, s, out);
    }
    return out;
  }
  if (s.phaseT < s.phaseLen) return out;
  if (s.phase === 'event') finishAction(setup, s, out);
  else afterReaction(setup, s, out);
  return out;
}

function silence(setup: TrafficSetup, s: TrafficState, out: Signal[]): void {
  const q = currentQuestion(s);
  addSus(s, SILENCE_SUS * zoneFactor(zoneOf(s.pulse)) + (q?.recheck ? 0.08 : 0));
  addPulse(s, 8);
  s.said = '…';
  s.lastAnswer = null;
  s.shaky = false;
  s.answered += 1;
  say(setup, s, 'silent');
  out.push('timeout');
  if (checkFull(setup, s, out)) return;
  setPhase(s, 'react', 1.6);
}

/** Antwort geben. Gibt zurück, was passiert ist (leer, wenn gerade keine Frage offen ist). */
export function answer(setup: TrafficSetup, s: TrafficState, answerId: string): Signal[] {
  const out: Signal[] = [];
  const q = currentQuestion(s);
  if (s.phase !== 'ask' || !q) return out;
  const a = q.def.answers.find((x) => x.id === answerId);
  if (!a) return out;
  const zone = zoneOf(s.pulse);
  const factor = zoneFactor(zone);
  let sus = a.sus;
  let line: OfficerLine = a.tone;
  const topic = q.def.topic;
  if (q.recheck) {
    if (a.claim !== undefined && a.claim === s.claims[topic]) {
      sus = -0.05;
      line = 'consistent';
    } else {
      sus = CONTRADICTION_SUS;
      line = 'contradiction';
      s.contradictions += 1;
      addPulse(s, 15);
      out.push('contradiction');
    }
  } else {
    if (a.claim !== undefined) s.claims[topic] = a.claim;
    const other = a.fits ? s.claims[a.fits.topic] : undefined;
    if (a.fits && other !== undefined) {
      if (a.fits.claims.includes(other)) sus -= 0.03;
      else {
        sus += MISMATCH_SUS;
        if (line === 'calm') line = 'mismatch';
        out.push('mismatch');
      }
    }
  }
  // Zittrig: Puls im roten Bereich, er merkt es (bei ruhigen Antworten sagt er es auch).
  s.shaky = zone === 'red';
  if (s.shaky && line === 'calm') line = 'shaky';
  addSus(s, sus > 0 ? sus * factor + (s.shaky ? 0.04 : 0) : sus);
  if (a.tone === 'rude') addPulse(s, 4);
  else if (a.tone === 'evasive') addPulse(s, 5);
  s.said = a.text;
  s.lastAnswer = a.id;
  s.answered += 1;
  say(setup, s, line);
  out.push(a.tone === 'rude' ? 'rude' : 'calm');
  if (checkFull(setup, s, out)) return out;
  setPhase(s, 'react', 1.5);
  return out;
}

/** Tippen im Takt. good/ok senken den Puls, daneben treibt ihn hoch; zweimal im selben Schlag zählt nicht. */
export function tap(setup: TrafficSetup, s: TrafficState): 'good' | 'ok' | 'off' | 'ignored' {
  if (s.phase === 'end') return 'ignored';
  const beat = Math.round(s.t / BEAT);
  const error = Math.abs(s.t - beat * BEAT);
  const good = 0.13 + 0.07 * (1 - setup.difficulty);
  const ok = 0.26;
  if (beat === s.lastTapBeat) {
    addPulse(s, 2);
    return 'off';
  }
  if (error <= good) {
    s.lastTapBeat = beat;
    addPulse(s, -7);
    return 'good';
  }
  if (error <= ok) {
    s.lastTapBeat = beat;
    addPulse(s, -3);
    return 'ok';
  }
  addPulse(s, 3);
  return 'off';
}

/** Schein zustecken: nur bei mittlerem Misstrauen, sonst steigt es stark. */
export function bribe(setup: TrafficSetup, s: TrafficState): Signal[] {
  const out: Signal[] = [];
  if (s.phase === 'end') return out;
  if (s.suspicion >= BRIBE_MIN && s.suspicion <= BRIBE_MAX) {
    say(setup, s, 'bribeOk');
    end(s, 'bribe', 2);
    out.push('bribeAccepted');
    return out;
  }
  const low = s.suspicion < BRIBE_MIN;
  addSus(s, BRIBE_FAIL_SUS);
  addPulse(s, 10);
  say(setup, s, low ? 'bribeLow' : 'bribeHigh');
  out.push('bribeRejected');
  if (checkFull(setup, s, out)) return out;
  // Dieselbe Frage kommt danach noch einmal (war er gerade mit etwas beschäftigt, macht er danach weiter).
  if (s.phase === 'ask') s.repeat = true;
  if (s.phase !== 'event') setPhase(s, 'react', 1.8);
  return out;
}

/** Gas geben: weg hier (die Verfolgungsjagd übernimmt). */
export function flee(s: TrafficState): Signal[] {
  if (s.phase === 'end') return [];
  s.line = null;
  end(s, 'flee', 1.1);
  return ['flee'];
}

/** Ist das Ende fertig gezeigt (dann onFinish)? */
export function isDone(s: TrafficState): boolean {
  return s.phase === 'end' && s.phaseT >= s.phaseLen;
}

/** Score: durch 0,55 bis 1 (je weniger Misstrauen, desto besser); rausgeholt 0,05 bis 0,45 nach Fortschritt. */
export function trafficScore(setup: TrafficSetup, s: TrafficState): number {
  switch (s.outcome) {
    case 'pass':
      return clamp(0.55 + 0.45 * (1 - s.suspicion / setup.limit), 0.55, 1);
    case 'bribe':
      return BRIBE_SCORE;
    case 'flee':
      return FLEE_SCORE;
    default:
      return clamp(0.05 + (0.4 * s.answered) / Math.max(1, s.queue.length), 0.05, 0.45);
  }
}

/** picks für applyTraffic: flee, bribe; dazu zur Info die Widersprüche (lies:<n>). */
export function trafficPicks(s: TrafficState): string[] {
  const picks: string[] = [];
  if (s.outcome === 'flee') picks.push('flee');
  if (s.outcome === 'bribe') picks.push('bribe');
  if (s.contradictions > 0) picks.push(`lies:${s.contradictions}`);
  return picks;
}
