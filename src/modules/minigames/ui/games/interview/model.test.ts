import { describe, expect, it } from 'vitest';
import {
  ASK_TIME,
  activeCue,
  advance,
  createInterview,
  discovered,
  FALSE_ALARMS_ALLOWED,
  type InterviewState,
  initInterview,
  interviewPicks,
  interviewScore,
  isDone,
  mark,
  ROUNDS,
  TELL_WINDOW,
  typedChars,
  VERDICT_TIME,
} from './model';

const PERSON = { traits: ['drinker', 'charmer'] as const };

function run(setup: ReturnType<typeof createInterview>, s: InterviewState, seconds: number, onStep?: () => void) {
  const signals: string[] = [];
  for (let t = 0; t < seconds && !isDone(s); t += 1 / 60) {
    signals.push(...advance(setup, s, 1 / 60));
    onStep?.();
  }
  return signals;
}

/** Spielt perfekt: tippt genau einmal in jedes Zeichen, nie in eine Geste. */
function perfect(setup: ReturnType<typeof createInterview>, s: InterviewState) {
  const active = activeCue(setup, s);
  if (active?.cue.tell && !s.caught.includes(active.index)) mark(setup, s);
}

describe('Lügendetektor: Aufbau', () => {
  it('kommt fest aus dem Seed, drei Runden, zuerst Fragen zu unbekannten Eigenschaften', () => {
    const a = createInterview(7, 0.5, PERSON);
    const b = createInterview(7, 0.5, PERSON);
    expect(a.rounds.length).toBe(ROUNDS);
    expect(a.rounds.map((r) => r.questionId)).toEqual(b.rounds.map((r) => r.questionId));
    expect(a.rounds.map((r) => r.answer)).toEqual(b.rounds.map((r) => r.answer));
    const revealed = a.rounds.map((r) => r.reveals).filter((r) => r !== 'none');
    expect(revealed.length).toBeGreaterThanOrEqual(1);
    for (const r of revealed) expect(PERSON.traits as readonly string[]).toContain(r);
    // Keine Eigenschaft zweimal.
    expect(new Set(revealed).size).toBe(revealed.length);
    expect(createInterview(8, 0.5, PERSON).rounds.map((r) => r.questionId)).not.toEqual(
      a.rounds.map((r) => r.questionId),
    );
  });

  it('zeigt bei Eigenschaften Zeichen und Gesten, bei unauffälligen Antworten nur Gesten, ohne Überlappung', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const setup = createInterview(seed, 0.6, { traits: ['loyal'], known: ['loyal'] });
      for (const round of setup.rounds) {
        const tells = round.cues.filter((c) => c.tell);
        if (round.reveals === 'none') expect(tells.length).toBe(0);
        else expect(tells.length).toBeGreaterThanOrEqual(2);
        expect(round.cues.some((c) => !c.tell)).toBe(true);
        for (let i = 1; i < round.cues.length; i++) {
          expect(round.cues[i].at).toBeGreaterThanOrEqual(round.cues[i - 1].at + round.cues[i - 1].len);
        }
        for (const c of round.cues) {
          expect(c.at).toBeGreaterThanOrEqual(0);
          expect(c.at + c.len).toBeLessThanOrEqual(round.duration + 0.01);
        }
      }
    }
  });

  it('wird mit der Schwierigkeit schwerer: kürzere Zeichen, mehr Gesten', () => {
    const easy = createInterview(3, 0, PERSON);
    const hard = createInterview(3, 1, PERSON);
    const tellLen = (setup: typeof easy) => setup.rounds.flatMap((r) => r.cues.filter((c) => c.tell)).map((c) => c.len);
    expect(Math.max(...tellLen(easy))).toBeCloseTo(TELL_WINDOW.easy, 2);
    expect(Math.max(...tellLen(hard))).toBeCloseTo(TELL_WINDOW.hard, 2);
    const gestures = (setup: typeof easy) => setup.rounds.reduce((n, r) => n + r.cues.filter((c) => !c.tell).length, 0);
    expect(gestures(hard)).toBeGreaterThan(gestures(easy));
  });
});

describe('Lügendetektor: Ablauf', () => {
  it('fragt, lässt antworten, urteilt, und mit perfektem Tippen stehen alle Eigenschaften in der Akte', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview();
    const signals = run(setup, s, 60, () => perfect(setup, s));
    expect(signals).toContain('asked');
    expect(signals).toContain('answering');
    expect(signals).toContain('verdict');
    expect(signals).toContain('done');
    expect(signals).not.toContain('miss');
    expect(isDone(s)).toBe(true);
    expect(s.results.length).toBe(ROUNDS);
    expect(s.results.every((r) => r.correct)).toBe(true);
    expect(interviewScore(setup, s)).toBe(1);
    const expected = setup.rounds.map((r) => r.reveals).filter((r) => r !== 'none');
    expect(discovered(s)).toEqual(expected);
    expect(interviewPicks(s)).toEqual(expected);
  });

  it('ohne Tippen gehen die Zeichen verloren, unauffällige Runden sind trotzdem richtig', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview();
    const signals = run(setup, s, 60);
    expect(signals.filter((x) => x === 'miss').length).toBeGreaterThan(0);
    for (const r of s.results) expect(r.correct).toBe(r.reveals === 'none');
    expect(discovered(s)).toEqual([]);
    expect(interviewScore(setup, s)).toBeLessThan(1);
  });

  it('zählt Fehlalarme: zu viele, und die Runde ist falsch', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview();
    run(setup, s, ASK_TIME + 0.05);
    expect(s.phase).toBe('answer');
    // In eine Lücke tippen (kein Zeichen, keine Geste).
    const round = setup.rounds[0];
    const gap = round.cues.length > 0 ? Math.max(0.05, round.cues[0].at - 0.2) : 0.3;
    while (s.t < gap) advance(setup, s, 1 / 60);
    expect(activeCue(setup, s)).toBeNull();
    for (let i = 0; i <= FALSE_ALARMS_ALLOWED; i++) expect(mark(setup, s)).toBe('falseAlarm');
    expect(s.falseAlarms).toBe(FALSE_ALARMS_ALLOWED + 1);
    run(setup, s, round.duration + 0.1, () => perfect(setup, s));
    expect(s.results[0].correct).toBe(false);
    expect(s.results[0].falseAlarms).toBe(FALSE_ALARMS_ALLOWED + 1);
  });

  it('ein Zeichen zählt nur einmal; eine Geste ist ein Fehlalarm', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview();
    run(setup, s, ASK_TIME + 0.05);
    const round = setup.rounds[0];
    const tell = round.cues.find((c) => c.tell);
    const gesture = round.cues.find((c) => !c.tell);
    if (tell) {
      while (s.t < tell.at + 0.05) advance(setup, s, 1 / 60);
      expect(mark(setup, s)).toBe('hit');
      expect(mark(setup, s)).toBe('again');
    }
    if (gesture) {
      while (s.t < gesture.at + 0.05) advance(setup, s, 1 / 60);
      expect(mark(setup, s)).toBe('falseAlarm');
    }
    expect(mark({ rounds: [], difficulty: 0 }, { ...s, phase: 'verdict' })).toBeNull();
  });

  it('tippt die Antwort ab und steht am Ende ganz', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview();
    expect(typedChars(setup, s)).toBe(0);
    run(setup, s, ASK_TIME + 1);
    expect(typedChars(setup, s)).toBeGreaterThan(0);
    run(setup, s, setup.rounds[0].duration + 0.2);
    expect(s.phase).toBe('verdict');
    expect(typedChars(setup, s)).toBe(setup.rounds[0].answer.length);
    run(setup, s, VERDICT_TIME + 0.2);
    expect(s.round).toBe(1);
  });
});
