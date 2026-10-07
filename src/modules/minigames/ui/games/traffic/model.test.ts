// Verkehrskontrolle (Auftrag 44, Teil 4): Spiellogik ohne DOM.

import { describe, expect, it } from 'vitest';
import {
  advance,
  answer,
  answersOf,
  BEAT,
  BRIBE_SCORE,
  bribe,
  createTraffic,
  currentQuestion,
  FLEE_SCORE,
  flee,
  initTraffic,
  isDone,
  PULSE_GREEN,
  type Signal,
  type TrafficSetup,
  type TrafficState,
  tap,
  trafficPicks,
  trafficScore,
  zoneOf,
} from './model';
import { QUESTIONS } from './questions';

const STEP = 1 / 60;

/** Bis zur nächsten offenen Frage (oder zum Ende) vorspulen. */
function untilAsk(setup: TrafficSetup, s: TrafficState, onStep?: () => void): Signal[] {
  const all: Signal[] = [];
  for (let i = 0; i < 2000 && s.phase !== 'ask' && s.phase !== 'end'; i++) {
    onStep?.();
    all.push(...advance(setup, s, STEP));
  }
  return all;
}

/** Ruhig antworten: die ruhigste Antwort, bei Rückfragen dieselbe Behauptung, die zur Herkunft passt. */
function calmAnswer(s: TrafficState): string {
  const q = currentQuestion(s);
  if (!q) throw new Error('keine Frage');
  const answers = answersOf(q);
  if (q.recheck) return answers.find((a) => a.claim === s.claims[q.def.topic])?.id ?? answers[0].id;
  const fitting = answers.filter((a) => a.tone === 'calm' && a.claim !== 'empty');
  const origin = s.claims.origin;
  const best = fitting.find((a) => a.fits && origin && a.fits.claims.includes(origin)) ?? fitting[0];
  return best.id;
}

/** Ein Spieler, der ruhig und stimmig antwortet und im Takt tippt (tapEvery: jeden n-ten Schlag). */
function play(seed: number, difficulty: number, opts: { tap?: boolean; silent?: boolean } = {}): TrafficState {
  const setup = createTraffic(seed, difficulty);
  const s = initTraffic(setup);
  let lastBeat = -1;
  const tapper = () => {
    const beat = Math.round(s.t / BEAT);
    if (opts.tap && beat !== lastBeat && Math.abs(s.t - beat * BEAT) < 0.02) {
      lastBeat = beat;
      tap(setup, s);
    }
  };
  for (let guard = 0; guard < 40 && s.phase !== 'end'; guard++) {
    // Kurz nachdenken, dann antworten (oder schweigen).
    for (let i = 0; i < 60 && s.phase === 'ask'; i++) {
      tapper();
      advance(setup, s, STEP);
    }
    if (s.phase === 'ask' && !opts.silent) answer(setup, s, calmAnswer(s));
    untilAsk(setup, s, tapper);
    if (opts.silent) for (let i = 0; i < 600 && s.phase === 'ask'; i++) advance(setup, s, STEP);
  }
  for (let i = 0; i < 300 && !isDone(s); i++) advance(setup, s, STEP);
  return s;
}

describe('Verkehrskontrolle: Aufbau', () => {
  it('fest aus dem Seed: 4 bis 6 Fragen, Woher zuerst, Laderaum immer, eine Rückfrage', () => {
    for (const difficulty of [0, 0.5, 1]) {
      for (let seed = 1; seed <= 30; seed++) {
        const setup = createTraffic(seed, difficulty);
        expect(setup).toEqual(createTraffic(seed, difficulty));
        const qs = setup.questions;
        expect(qs.length).toBe(4 + Math.round(2 * difficulty));
        expect(qs[0].def.id).toBe('origin');
        expect(qs.filter((q) => q.def.topic === 'cargo' && !q.recheck)).toHaveLength(1);
        const re = qs.findIndex((q) => q.recheck);
        expect(re).toBeGreaterThan(0);
        const source = qs.findIndex((q) => !q.recheck && q.def.id === qs[re].def.id);
        expect(re - source).toBeGreaterThanOrEqual(2);
        // Jede Antwort genau einmal in der Reihenfolge.
        for (const q of qs) expect([...q.order].sort()).toEqual(q.def.answers.map((a) => a.id).sort());
        expect(setup.actions.some((a) => a.kind === 'flashlight')).toBe(true);
        expect(setup.actions.some((a) => a.kind === 'radio')).toBe(difficulty >= 0.3);
      }
    }
  });

  it('schwerer: weniger Zeit zum Antworten, strengere Grenze', () => {
    const easy = createTraffic(3, 0);
    const hard = createTraffic(3, 1);
    expect(easy.answerTime).toBe(6);
    expect(hard.answerTime).toBe(4);
    expect(hard.limit).toBeLessThan(easy.limit);
  });

  it('jede Frage hat drei bis vier Antworten', () => {
    for (const q of QUESTIONS) {
      expect(q.answers.length).toBeGreaterThanOrEqual(3);
      expect(q.answers.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('Verkehrskontrolle: Gespräch', () => {
  it('Rückfrage: dieselbe Behauptung beruhigt, eine andere ist ein Widerspruch', () => {
    const setup = createTraffic(5, 0.5);
    // Rückfrage nach der Herkunft direkt an Stelle 2 setzen (für den Test).
    const origin = setup.questions[0];
    setup.questions = [
      origin,
      setup.questions.find((q) => q.def.topic === 'cargo') ?? origin,
      { ...origin, recheck: true },
    ];
    setup.actions = [];
    const consistent = initTraffic(setup);
    answer(setup, consistent, 'work');
    untilAsk(setup, consistent);
    answer(setup, consistent, 'tools');
    untilAsk(setup, consistent);
    const before = consistent.suspicion;
    answer(setup, consistent, 'work');
    expect(consistent.suspicion).toBeLessThan(before);
    expect(consistent.contradictions).toBe(0);

    const liar = initTraffic(setup);
    answer(setup, liar, 'work');
    untilAsk(setup, liar);
    answer(setup, liar, 'tools');
    untilAsk(setup, liar);
    const was = liar.suspicion;
    const signals = answer(setup, liar, 'market');
    expect(signals).toContain('contradiction');
    expect(liar.suspicion).toBeGreaterThan(was + 0.25);
    expect(liar.line?.key).toBe('contradiction');
  });

  it('Großmarkt und Gemüse passt, Großmarkt und Umzugskartons nicht', () => {
    const setup = createTraffic(5, 0.5);
    const cargo = setup.questions.find((q) => q.def.topic === 'cargo');
    if (!cargo) throw new Error('keine Laderaum-Frage');
    setup.questions = [setup.questions[0], cargo];
    setup.actions = [];
    const fits = initTraffic(setup);
    answer(setup, fits, 'market');
    untilAsk(setup, fits);
    const a = fits.suspicion;
    expect(answer(setup, fits, 'veg')).not.toContain('mismatch');
    const clash = initTraffic(setup);
    answer(setup, clash, 'market');
    untilAsk(setup, clash);
    expect(answer(setup, clash, 'boxes')).toContain('mismatch');
    expect(clash.suspicion).toBeGreaterThan(fits.suspicion);
    expect(fits.suspicion).toBeLessThan(a + 0.04);
  });

  it('„leer“ gesagt, und er leuchtet in den Laderaum: erwischt', () => {
    const setup = createTraffic(2, 0.2);
    const s = initTraffic(setup);
    let caught = false;
    for (let guard = 0; guard < 20 && s.phase !== 'end'; guard++) {
      const q = currentQuestion(s);
      if (s.phase === 'ask' && q) answer(setup, s, q.def.topic === 'cargo' && !q.recheck ? 'empty' : calmAnswer(s));
      if (untilAsk(setup, s).includes('caught')) caught = true;
      if (s.action === 'flashlight') caught ||= untilAsk(setup, s).includes('caught');
    }
    expect(caught).toBe(true);
    expect(s.contradictions).toBeGreaterThanOrEqual(1);
  });

  it('Schweigen: nach der Frist zählt es als verdächtige Antwort', () => {
    const setup = createTraffic(4, 0.5);
    const s = initTraffic(setup);
    const before = s.suspicion;
    const signals: Signal[] = [];
    for (let i = 0; i < 60 * 7 && s.phase === 'ask'; i++) signals.push(...advance(setup, s, STEP));
    expect(signals).toContain('timeout');
    expect(s.said).toBe('…');
    expect(s.suspicion).toBeGreaterThan(before + 0.1);
  });

  it('nach dem Funk ist die Frist kürzer', () => {
    const setup = createTraffic(7, 0.8);
    const s = initTraffic(setup);
    const full = s.answerLeft;
    for (let guard = 0; guard < 20 && !s.radioed && s.phase !== 'end'; guard++) {
      answer(setup, s, calmAnswer(s));
      untilAsk(setup, s);
    }
    expect(s.radioed).toBe(true);
    if (s.phase === 'ask') expect(s.answerLeft).toBeCloseTo(full * 0.75, 5);
  });
});

describe('Verkehrskontrolle: Puls', () => {
  it('Tippen im Takt senkt ihn, daneben oder doppelt treibt ihn hoch', () => {
    const setup = createTraffic(1, 0.5);
    const s = initTraffic(setup);
    s.t = 3 * BEAT;
    s.pulse = 120;
    expect(tap(setup, s)).toBe('good');
    expect(s.pulse).toBe(113);
    expect(tap(setup, s)).toBe('off');
    expect(s.pulse).toBe(115);
    s.t = 4.5 * BEAT;
    expect(tap(setup, s)).toBe('off');
    expect(s.pulse).toBe(118);
  });

  it('ohne Tippen steigt er, und rot macht Antworten zittrig', () => {
    const setup = createTraffic(1, 1);
    setup.actions = [];
    const s = initTraffic(setup);
    for (let i = 0; i < 60 * 3.5; i++) advance(setup, s, STEP);
    expect(s.pulse).toBeGreaterThan(setup.startPulse);
    s.pulse = 140;
    expect(zoneOf(s.pulse)).toBe('red');
    answer(setup, s, 'work');
    expect(s.shaky).toBe(true);
    expect(s.line?.key).toBe('shaky');
  });

  it('hoher Puls: er fragt, ob alles in Ordnung ist (einmal)', () => {
    const setup = createTraffic(9, 0.5);
    setup.actions = [];
    const s = initTraffic(setup);
    answer(setup, s, calmAnswer(s));
    s.pulse = 150;
    untilAsk(setup, s);
    expect(currentQuestion(s)?.def.id).toBe('nervous');
    expect(s.queue.length).toBe(setup.questions.length + 1);
  });
});

describe('Verkehrskontrolle: Ausgang', () => {
  it('ruhig und stimmig mit Tippen: meist „Gute Fahrt“, Score ab 0,55', () => {
    let passed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = play(seed, 0.5, { tap: true });
      expect(isDone(s)).toBe(true);
      if (s.outcome === 'pass') {
        passed += 1;
        const setup = createTraffic(seed, 0.5);
        expect(trafficScore(setup, s)).toBeGreaterThanOrEqual(0.55);
        expect(trafficPicks(s)).toEqual([]);
      }
    }
    expect(passed).toBeGreaterThanOrEqual(15);
  });

  it('ohne Tippen auf schwer seltener, schweigend nie', () => {
    let calm = 0;
    let tapped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (play(seed, 1).outcome === 'pass') calm += 1;
      if (play(seed, 1, { tap: true }).outcome === 'pass') tapped += 1;
      const silent = play(seed, 0.5, { silent: true });
      expect(silent.outcome).toBe('fail');
      expect(trafficScore(createTraffic(seed, 0.5), silent)).toBeLessThan(0.5);
    }
    expect(tapped).toBeGreaterThan(calm);
  });

  it('Schein zustecken: bei mittlerem Misstrauen angenommen, sonst steigt es stark', () => {
    const setup = createTraffic(1, 0.5);
    const low = initTraffic(setup);
    low.suspicion = 0.1;
    expect(bribe(setup, low)).toContain('bribeRejected');
    expect(low.suspicion).toBeCloseTo(0.4, 5);
    // Danach dieselbe Frage noch einmal.
    const asked = currentQuestion(low);
    untilAsk(setup, low);
    expect(currentQuestion(low)).toBe(asked);

    const mid = initTraffic(setup);
    mid.suspicion = 0.5;
    expect(bribe(setup, mid)).toContain('bribeAccepted');
    expect(mid.outcome).toBe('bribe');
    expect(trafficScore(setup, mid)).toBe(BRIBE_SCORE);
    expect(trafficPicks(mid)).toEqual(['bribe']);

    const high = initTraffic(setup);
    high.suspicion = 0.8;
    expect(bribe(setup, high)).toContain('fail');
    expect(high.outcome).toBe('fail');
  });

  it('Gas geben: flee, danach nichts mehr', () => {
    const setup = createTraffic(1, 0.5);
    const s = initTraffic(setup);
    expect(flee(s)).toEqual(['flee']);
    expect(trafficPicks(s)).toEqual(['flee']);
    expect(trafficScore(setup, s)).toBe(FLEE_SCORE);
    expect(answer(setup, s, 'work')).toEqual([]);
    expect(flee(s)).toEqual([]);
    const signals: Signal[] = [];
    for (let i = 0; i < 120; i++) signals.push(...advance(setup, s, STEP));
    expect(signals).toEqual(['done']);
  });

  it('Misstrauen voll: sofort „Aussteigen“', () => {
    const setup = createTraffic(1, 0.5);
    const s = initTraffic(setup);
    s.suspicion = 0.95;
    s.pulse = PULSE_GREEN + 40;
    answer(setup, s, 'why');
    expect(s.outcome).toBe('fail');
    expect(s.line?.key).toBe('fail');
    expect(trafficScore(setup, s)).toBeLessThan(0.5);
  });
});
