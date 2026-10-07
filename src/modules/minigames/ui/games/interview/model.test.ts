import { describe, expect, it } from 'vitest';
import { INTERVIEW_QUESTIONS } from '../../../../recruiting';
import type { TraitId } from '../../../../staff';
import {
  advance,
  answerDuration,
  CHOOSE_TIME,
  choose,
  createInterview,
  currentOffer,
  discovered,
  initInterview,
  interviewPicks,
  interviewScore,
  isDone,
  OFFERS_PER_ROUND,
  ROUNDS,
  read,
  skipAnswer,
  timeLeft,
  typedChars,
  VERDICT_TIME,
} from './model';

const PERSON = { traits: ['hothead', 'drinker'] as TraitId[] };

/** Spielt eine Runde: Frage index, dann die Deutung, die pick wählt. */
function playRound(
  setup: ReturnType<typeof createInterview>,
  s: ReturnType<typeof initInterview>,
  index: number,
  pick: 'right' | 'wrong' | 'late',
) {
  choose(setup, s, index);
  skipAnswer(setup, s);
  const offer = currentOffer(setup, s);
  if (!offer) throw new Error('keine Frage');
  if (pick === 'late') advance(setup, s, setup.readTime + 0.01);
  else {
    const i = offer.readings.findIndex((r) => (pick === 'right' ? r === offer.reveals : r !== offer.reveals));
    read(setup, s, i);
  }
  advance(setup, s, VERDICT_TIME + 0.01);
}

describe('Bewerbungsgespräch: Inhalt aus dem Seed', () => {
  it('ist fest aus dem Seed und hat drei Runden mit je drei verschiedenen Fragen', () => {
    const a = createInterview(7, 0.5, PERSON);
    const b = createInterview(7, 0.5, PERSON);
    expect(a).toEqual(b);
    expect(a.rounds).toHaveLength(ROUNDS);
    const ids = a.rounds.flat().map((o) => o.questionId);
    expect(new Set(ids).size).toBe(ROUNDS * OFFERS_PER_ROUND);
    expect(createInterview(8, 0.5, PERSON)).not.toEqual(a);
  });

  it('die Antwort verrät eine echte Eigenschaft unter den geprüften, sonst nichts', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const setup = createInterview(seed, 0.5, PERSON);
      for (const offer of setup.rounds.flat()) {
        const q = INTERVIEW_QUESTIONS.find((x) => x.id === offer.questionId);
        if (!q) throw new Error(offer.questionId);
        const matching = q.probes.filter((t) => PERSON.traits.includes(t));
        if (matching.length === 0) {
          expect(offer.reveals).toBe('none');
          expect(q.neutral).toContain(offer.answer);
        } else {
          expect(matching).toContain(offer.reveals);
          expect(q.answers[offer.reveals as TraitId]).toContain(offer.answer);
        }
      }
    }
  });

  it('drei Deutungen, genau eine richtig, Köder nie eine echte Eigenschaft', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of [0, 1]) {
        for (const offer of createInterview(seed, d, PERSON).rounds.flat()) {
          expect(offer.readings).toHaveLength(3);
          expect(new Set(offer.readings).size).toBe(3);
          expect(offer.readings.filter((r) => r === offer.reveals)).toHaveLength(1);
          for (const r of offer.readings) {
            if (r !== offer.reveals && r !== 'none') expect(PERSON.traits).not.toContain(r);
          }
        }
      }
    }
  });

  it('verrät lieber Unbekanntes', () => {
    const known = { traits: ['hothead', 'coward'] as TraitId[], known: ['hothead'] as TraitId[] };
    // Bei Fragen, die beide prüfen, kommt die unbekannte (coward).
    for (let seed = 1; seed <= 30; seed++) {
      for (const offer of createInterview(seed, 0.5, known).rounds.flat()) {
        const q = INTERVIEW_QUESTIONS.find((x) => x.id === offer.questionId);
        if (q?.probes.includes('coward')) expect(offer.reveals).toBe('coward');
      }
    }
  });

  it('schwer: Köder öfter aus derselben Frage', () => {
    const near = (d: number) => {
      let count = 0;
      for (let seed = 1; seed <= 60; seed++) {
        for (const offer of createInterview(seed, d, PERSON).rounds.flat()) {
          const q = INTERVIEW_QUESTIONS.find((x) => x.id === offer.questionId);
          count += offer.readings.filter((r) => r !== offer.reveals && r !== 'none' && q?.probes.includes(r)).length;
        }
      }
      return count;
    };
    expect(near(1)).toBeGreaterThan(near(0));
  });
});

describe('Bewerbungsgespräch: Ablauf', () => {
  it('Frage wählen, Antwort tippt ab, dann deuten; alle richtig = Score 1', () => {
    const setup = createInterview(3, 0.5, PERSON);
    const s = initInterview();
    expect(s.phase).toBe('choose');
    expect(choose(setup, s, 1)).toEqual(['asked']);
    expect(s.phase).toBe('answer');
    const offer = currentOffer(setup, s);
    if (!offer) throw new Error('keine Frage');
    advance(setup, s, 0.5);
    expect(typedChars(setup, s)).toBeGreaterThan(0);
    expect(typedChars(setup, s)).toBeLessThan(offer.answer.length);
    expect(advance(setup, s, answerDuration(offer))).toEqual(['typed', 'reading']);
    expect(s.phase).toBe('read');
    expect(timeLeft(setup, s)).toBe(setup.readTime);
    const right = offer.readings.indexOf(offer.reveals);
    expect(read(setup, s, right)).toEqual(['correct']);
    expect(advance(setup, s, VERDICT_TIME)).toEqual(['round']);
    playRound(setup, s, 0, 'right');
    playRound(setup, s, 2, 'right');
    expect(isDone(s)).toBe(true);
    expect(interviewScore(setup, s)).toBe(1);
  });

  it('falsch und zu spät zählen nicht; picks sind nur angetippte Eigenschaften', () => {
    const setup = createInterview(5, 0.5, PERSON);
    const s = initInterview();
    playRound(setup, s, 0, 'wrong');
    playRound(setup, s, 1, 'late');
    playRound(setup, s, 2, 'right');
    expect(isDone(s)).toBe(true);
    expect(interviewScore(setup, s)).toBeCloseTo(1 / 3);
    expect(s.results.map((r) => r.correct)).toEqual([false, false, true]);
    expect(s.results[1].picked).toBeNull();
    const picks = interviewPicks(s);
    expect(picks).not.toContain('none');
    expect(picks.length).toBeLessThanOrEqual(2);
    const last = s.results[2];
    if (last.reveals !== 'none') {
      expect(picks).toContain(last.reveals);
      expect(discovered(s)).toEqual([last.reveals]);
    }
  });

  it('zu lange gezögert: die erste Frage wird gestellt', () => {
    const setup = createInterview(9, 0.5, PERSON);
    const s = initInterview();
    expect(advance(setup, s, CHOOSE_TIME + 0.1)).toEqual(['asked']);
    expect(s.chosen).toBe(0);
  });

  it('ignoriert Eingaben in der falschen Phase', () => {
    const setup = createInterview(2, 0.5, PERSON);
    const s = initInterview();
    expect(read(setup, s, 0)).toEqual([]);
    expect(skipAnswer(setup, s)).toEqual([]);
    expect(choose(setup, s, 7)).toEqual([]);
    choose(setup, s, 0);
    expect(choose(setup, s, 1)).toEqual([]);
    expect(read(setup, s, 0)).toEqual([]);
  });
});
