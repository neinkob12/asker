import { describe, expect, it } from 'vitest';
import type { TraitId } from '../../../../staff';
import {
  ASK_TIME,
  activeCue,
  advance,
  bandAt,
  CHOOSE_TIME,
  choose,
  createInterview,
  currentRound,
  discovered,
  FALSE_ALARMS_ALLOWED,
  type InterviewPerson,
  type InterviewSetup,
  type InterviewState,
  initInterview,
  interviewPicks,
  interviewScore,
  interviewStats,
  isDone,
  mark,
  OFFER,
  press,
  questionById,
  ROUNDS,
  ruledOutBy,
  typedChars,
  VERDICT_TIME,
  zoneOf,
} from './model';

const PERSON: InterviewPerson = { traits: ['drinker', 'charmer'] };
const DT = 1 / 60;

function step(setup: InterviewSetup, s: InterviewState, seconds: number, each?: () => void) {
  const signals: string[] = [];
  for (let t = 0; t < seconds && !isDone(s); t += DT) {
    each?.();
    signals.push(...advance(setup, s, DT));
  }
  return signals;
}

/** Druck in der Mitte der Zone halten (wie ein Mensch, der den Ring im Blick hat). */
function keepPressure(setup: InterviewSetup, s: InterviewState) {
  const { lo, hi } = bandAt(setup, s);
  press(s, s.pressure < (lo + hi) / 2);
}

/** Bis zur Antwort der ersten Runde: Frage stellen und den Druck schon aufbauen. */
function toAnswer(setup: InterviewSetup, s: InterviewState, index = 0) {
  choose(setup, s, index);
  step(setup, s, ASK_TIME + DT, () => keepPressure(setup, s));
}

interface Bot {
  /** Druck: in der Zone halten, nie drücken, immer drücken. */
  pressure: 'keep' | 'none' | 'max';
  /** Reaktionszeit in Sekunden, bis ein sichtbares Zeichen angetippt wird. */
  reaction: number;
  /** So lange überlegt er vor der Wahl der Frage. */
  think?: number;
}

function play(seed: number, difficulty: number, person: InterviewPerson, bot: Bot) {
  const setup = createInterview(seed, difficulty, person);
  const s = initInterview(setup);
  const seen = new Map<string, number>();
  let total = 0;
  let glance = 0;
  while (!isDone(s) && total < 300) {
    if (s.phase === 'choose' && s.t >= (bot.think ?? 1.5)) choose(setup, s, 0);
    // Ein Mensch schaut nur ab und zu auf den Ring: Entscheidung alle 0,25 s.
    glance -= DT;
    if (bot.pressure === 'keep' && glance <= 0) {
      keepPressure(setup, s);
      glance = 0.25;
    } else if (bot.pressure !== 'keep') press(s, bot.pressure === 'max');
    advance(setup, s, DT);
    total += DT;
    const active = activeCue(setup, s);
    if (active?.cue.tell && !s.caught.includes(active.index)) {
      const key = `${s.round}:${active.index}`;
      const first = seen.get(key) ?? total;
      seen.set(key, first);
      if (total - first >= bot.reaction) mark(setup, s);
    }
  }
  return { score: interviewScore(setup, s), time: total, s, setup };
}

const PEOPLE: InterviewPerson[] = [
  { traits: ['drinker', 'charmer'] },
  { traits: ['hothead', 'loyal', 'drinker'], known: ['loyal'] },
  { traits: ['coward', 'gambler'] },
  { traits: ['braggart', 'family', 'nimble'] },
  { traits: ['ambitious'] },
];

function average(difficulty: number, bot: Bot) {
  let score = 0;
  let time = 0;
  let n = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const r = play(seed, difficulty, PEOPLE[seed % PEOPLE.length], bot);
    score += r.score;
    time += r.time;
    n += 1;
  }
  return { score: score / n, time: time / n };
}

describe('Bewerbungsgespräch: Aufbau und Wahl der Frage', () => {
  it('legt drei Fragen auf den Tisch, fest aus dem Seed, mindestens eine trifft etwas Unbekanntes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const setup = createInterview(seed, 0.5, PERSON);
      const s = initInterview(setup);
      expect(s.phase).toBe('choose');
      expect(s.offer.length).toBe(OFFER);
      expect(new Set(s.offer).size).toBe(OFFER);
      expect(initInterview(createInterview(seed, 0.5, PERSON)).offer).toEqual(s.offer);
      const hits = s.offer.filter((id) =>
        questionById(id)?.probes.some((t) => (PERSON.traits as readonly string[]).includes(t)),
      );
      expect(hits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('stellt die gewählte Frage; die Antwort hängt an Seed und Frage, nicht an der Position', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const a = initInterview(setup);
    const id = a.offer[1];
    expect(choose(setup, a, 1)).toBe(true);
    expect(a.phase).toBe('ask');
    expect(a.rounds[0].questionId).toBe(id);
    expect(choose(setup, a, 0)).toBe(false);
    const b = initInterview(setup);
    choose(setup, b, 1);
    expect(b.rounds[0].answer).toBe(a.rounds[0].answer);
    const reveals = a.rounds[0].reveals;
    if (reveals !== 'none') expect(questionById(id)?.probes).toContain(reveals);
  });

  it('nimmt nach der Bedenkzeit von selbst die erste Frage', () => {
    const setup = createInterview(3, 0.5, PERSON);
    const s = initInterview(setup);
    const first = s.offer[0];
    const signals = step(setup, s, CHOOSE_TIME + 0.05);
    expect(signals).toContain('auto');
    expect(s.rounds[0].questionId).toBe(first);
  });

  it('fragt nichts zweimal und verrät keine Eigenschaft doppelt', () => {
    const r = play(11, 0.5, { traits: ['hothead', 'coward', 'drinker'] }, { pressure: 'keep', reaction: 0.25 });
    const ids = r.s.rounds.map((x) => x.questionId);
    expect(new Set(ids).size).toBe(ROUNDS);
    const revealed = r.s.rounds.map((x) => x.reveals).filter((x) => x !== 'none');
    expect(new Set(revealed).size).toBe(revealed.length);
  });

  it('zeigt bei Eigenschaften Zeichen und Gesten, bei unauffälligen Antworten nur Gesten, ohne Überlappung', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const setup = createInterview(seed, 0.6, { traits: ['loyal'], known: ['loyal'] });
      const s = initInterview(setup);
      for (let i = 0; i < ROUNDS; i++) {
        choose(setup, s, 0);
        const round = currentRound(setup, s);
        if (!round) throw new Error('keine Runde');
        const tells = round.cues.filter((c) => c.tell);
        if (round.reveals === 'none') expect(tells.length).toBe(0);
        else expect(tells.length).toBeGreaterThanOrEqual(2);
        expect(round.cues.some((c) => !c.tell)).toBe(true);
        for (let k = 1; k < round.cues.length; k++) {
          expect(round.cues[k].at).toBeGreaterThanOrEqual(round.cues[k - 1].at + round.cues[k - 1].len);
        }
        expect(round.cues[round.cues.length - 1].at + round.cues[round.cues.length - 1].len).toBeLessThanOrEqual(
          round.duration,
        );
        // Weiter zur nächsten Wahl.
        s.phase = 'verdict';
        s.t = VERDICT_TIME;
        advance(setup, s, DT);
      }
    }
  });
});

describe('Bewerbungsgespräch: Druck', () => {
  it('steigt beim Halten, sinkt beim Loslassen, und nur in Frage und Antwort', () => {
    const setup = createInterview(5, 0.5, PERSON);
    const s = initInterview(setup);
    const rest = s.pressure;
    press(s, true);
    step(setup, s, 1);
    expect(s.pressure).toBe(rest);
    choose(setup, s, 0);
    step(setup, s, 1);
    expect(s.pressure).toBeGreaterThan(rest + 0.3);
    press(s, false);
    const high = s.pressure;
    step(setup, s, 0.5);
    expect(s.pressure).toBeLessThan(high);
  });

  it('die Zone hängt an den Eigenschaften: Hitzköpfe machen früher zu als Angeber', () => {
    let hot = 0;
    let brag = 0;
    for (let seed = 1; seed <= 20; seed++) {
      hot += createInterview(seed, 0.5, { traits: ['hothead'] }).band.center;
      brag += createInterview(seed, 0.5, { traits: ['braggart'] }).band.center;
    }
    expect(hot).toBeLessThan(brag);
    expect(createInterview(1, 0.9, PERSON).band.width).toBeLessThan(createInterview(1, 0.1, PERSON).band.width);
  });

  it('locker huscht ein Zeichen nur kurz vorbei, angespannt steht es lange', () => {
    const setup = createInterview(7, 0.5, PERSON);
    // Eine Frage mit Eigenschaft finden.
    const find = () => {
      for (let i = 0; i < OFFER; i++) {
        const s = initInterview(setup);
        choose(setup, s, i);
        if (s.rounds[0].reveals !== 'none') return i;
      }
      return -1;
    };
    const index = find();
    expect(index).toBeGreaterThanOrEqual(0);
    const calm = initInterview(setup);
    choose(setup, calm, index);
    step(setup, calm, ASK_TIME + DT);
    const tense = initInterview(setup);
    toAnswer(setup, tense, index);
    const tell = calm.rounds[0].cues.findIndex((c) => c.tell);
    const at = calm.rounds[0].cues[tell].at;
    step(setup, calm, at + 0.05);
    step(setup, tense, at + 0.05, () => keepPressure(setup, tense));
    expect(zoneOf(setup, calm)).toBe('calm');
    expect(zoneOf(setup, tense)).toBe('tense');
    expect(calm.lens[tell]).toBeCloseTo(calm.rounds[0].cues[tell].len * setup.calmLen, 5);
    expect(tense.lens[tell]).toBeCloseTo(tense.rounds[0].cues[tell].len, 5);
    expect(activeCue(setup, calm)?.faint).toBe(true);
    expect(activeCue(setup, tense)?.faint).toBe(false);
  });

  it('zu viel Druck: Sie bricht ab, die Runde endet sofort', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview(setup);
    choose(setup, s, 0);
    press(s, true);
    const signals = step(setup, s, 10, () => press(s, true));
    expect(signals).toContain('warn');
    expect(signals).toContain('closed');
    expect(s.results[0].closed).toBe(true);
    expect(s.phase === 'verdict' || s.phase === 'choose').toBe(true);
  });
});

describe('Bewerbungsgespräch: Zeichen und Urteil', () => {
  it('ein Zeichen zählt nur einmal; eine Geste ist ein Fehlalarm', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview(setup);
    toAnswer(setup, s);
    const round = s.rounds[0];
    const tell = round.cues.find((c) => c.tell);
    const gesture = round.cues.find((c) => !c.tell);
    if (tell) {
      step(setup, s, tell.at + 0.05 - s.t, () => keepPressure(setup, s));
      expect(mark(setup, s)?.result).toBe('hit');
      expect(mark(setup, s)?.result).toBe('again');
    }
    if (gesture && gesture.at > s.t) {
      step(setup, s, gesture.at + 0.05 - s.t, () => keepPressure(setup, s));
      const r = mark(setup, s);
      expect(r?.result).toBe('falseAlarm');
      expect(r?.kind).toBe(gesture.kind);
    }
    expect(mark(setup, { ...s, phase: 'verdict' })).toBeNull();
  });

  it('zu viele Fehlalarme verderben die Runde', () => {
    const setup = createInterview(4, 0.5, PERSON);
    const s = initInterview(setup);
    toAnswer(setup, s);
    expect(activeCue(setup, s)).toBeNull();
    for (let i = 0; i <= FALSE_ALARMS_ALLOWED; i++) expect(mark(setup, s)?.result).toBe('falseAlarm');
    step(setup, s, 30, () => keepPressure(setup, s));
    expect(s.results[0].correct).toBe(false);
  });

  it('eine unauffällige Antwort schließt aus, was die Frage prüfte', () => {
    const setup = createInterview(2, 0.5, { traits: ['ambitious'] });
    const s = initInterview(setup);
    const neutral = s.offer.findIndex((id) => !questionById(id)?.probes.includes('ambitious'));
    choose(setup, s, neutral);
    step(setup, s, 30);
    expect(s.results[0].reveals).toBe('none');
    expect(s.results[0].correct).toBe(true);
    const out = ruledOutBy(setup, s, 0);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain('ambitious');
  });

  it('tippt die Antwort ab und steht am Ende ganz', () => {
    const setup = createInterview(7, 0.5, PERSON);
    const s = initInterview(setup);
    choose(setup, s, 0);
    expect(typedChars(setup, s)).toBe(0);
    step(setup, s, ASK_TIME + 1);
    expect(typedChars(setup, s)).toBeGreaterThan(0);
    step(setup, s, s.rounds[0].duration + 0.2);
    expect(s.phase).toBe('verdict');
    expect(typedChars(setup, s)).toBe(s.rounds[0].answer.length);
    step(setup, s, VERDICT_TIME + 0.2);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('choose');
  });

  it('perfektes Spiel: alles richtig, picks sind die aufgedeckten Eigenschaften', () => {
    const r = play(7, 0.5, PERSON, { pressure: 'keep', reaction: 0.2 });
    expect(r.score).toBe(1);
    expect(interviewPicks(r.s)).toEqual(discovered(r.s));
    for (const p of interviewPicks(r.s)) expect(PERSON.traits as readonly string[]).toContain(p as TraitId);
  });
});

describe('Bewerbungsgespräch: Schwierigkeit (Test-Bot)', () => {
  it('geübt (Druck in der Zone, 0,3 s Reaktion): leicht fast immer, schwer meistens richtig', () => {
    const skilled: Bot = { pressure: 'keep', reaction: 0.3 };
    expect(average(0.2, skilled).score).toBeGreaterThanOrEqual(0.9);
    expect(average(0.9, skilled).score).toBeGreaterThanOrEqual(0.7);
  });

  it('langsam (0,8 s Reaktion): leicht noch gut, schwer nicht mehr', () => {
    const slow: Bot = { pressure: 'keep', reaction: 0.8 };
    expect(average(0.2, slow).score).toBeGreaterThanOrEqual(0.9);
    expect(average(0.9, slow).score).toBeLessThan(0.6);
  });

  it('ohne Druck klappt es leicht noch, schwer kaum; Dauerdruck lässt die Leute zumachen', () => {
    const lazy: Bot = { pressure: 'none', reaction: 0.4 };
    const skilled: Bot = { pressure: 'keep', reaction: 0.4 };
    expect(average(0.2, lazy).score).toBeGreaterThanOrEqual(0.6);
    expect(average(0.9, lazy).score).toBeLessThan(average(0.9, skilled).score - 0.2);
    expect(average(0.6, { pressure: 'max', reaction: 0.3 }).score).toBeLessThan(average(0.6, skilled).score - 0.2);
  });

  it('dauert 30 bis 90 Sekunden', () => {
    for (const d of [0.2, 0.9]) {
      const { time } = average(d, { pressure: 'keep', reaction: 0.35, think: 3 });
      expect(time).toBeGreaterThan(30);
      expect(time).toBeLessThan(90);
    }
  });
});

describe('Bewerbungsgespräch: Werte fürs Ergebnis', () => {
  it('liefert vier Werte aus dem Spiel', () => {
    const r = play(7, 0.5, PERSON, { pressure: 'keep', reaction: 0.2 });
    const stats = interviewStats(r.s);
    expect(stats.length).toBe(4);
    expect(stats[0].value).toBe(`${ROUNDS}/${ROUNDS}`);
    expect(stats[0].tone).toBe('good');
  });
});
