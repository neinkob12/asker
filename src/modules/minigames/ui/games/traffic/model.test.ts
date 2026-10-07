import { describe, expect, it } from 'vitest';
import {
  advance,
  answer,
  BRIBE_MAX,
  BRIBE_MIN,
  BRIBE_SCORE,
  bribe,
  buildQuestion,
  contradiction,
  createTraffic,
  FLEE_SCORE,
  flee,
  GREET,
  initTraffic,
  isDone,
  MAX_HITS,
  PASS_SCORE,
  progress,
  questionDef,
  type TrafficState,
  trafficPicks,
  trafficScore,
} from './model';
import { QUESTIONS, type Story } from './questions';

const OPTIONS = { hour: 14, homeCity: 'Köln' };

type Setup = ReturnType<typeof createTraffic>;

function run(setup: Setup, state: TrafficState, seconds: number) {
  const signals = [];
  for (let t = 0; t < seconds && !isDone(state); t += 1 / 30) signals.push(...advance(setup, state, 1 / 30));
  return signals;
}

/** Eine Antwort, die wirklich widerspricht (−1, wenn alle passen). */
function badIndex(setup: Setup, state: TrafficState): number {
  const q = state.question;
  if (!q) return -1;
  const def = questionDef(q.id);
  return q.answers.findIndex((a) => {
    const full = def.answers.find((x) => x.text === a.text);
    return full ? contradiction(def, full, setup.evidence, state.story) !== null : false;
  });
}

/** Bis zur nächsten Frage vorspulen. */
function untilAsk(setup: Setup, state: TrafficState) {
  for (let t = 0; t < 30 && state.phase !== 'ask' && !isDone(state); t += 1 / 30) advance(setup, state, 1 / 30);
}

describe('Verkehrskontrolle: Aufbau aus dem Seed', () => {
  it('gleicher Seed, gleiche Fakten und Reihenfolge; anderer Seed anders', () => {
    const a = createTraffic(7, 0.5, OPTIONS);
    const b = createTraffic(7, 0.5, OPTIONS);
    const c = createTraffic(9, 0.5, OPTIONS);
    expect(a.evidence).toEqual(b.evidence);
    expect(a.order).toEqual(b.order);
    expect([a.evidence, a.order]).not.toEqual([c.evidence, c.order]);
    expect(a.evidence.hour).toBe(14);
    expect(a.evidence.homeCity).toBe('Köln');
  });

  it('die Ladungsfrage kommt nach dem Blick nach hinten, Nachfragen erst mit der Schwierigkeit', () => {
    const easy = createTraffic(3, 0, OPTIONS);
    const hard = createTraffic(3, 1, OPTIONS);
    expect(easy.order.indexOf('cargo')).toBe(easy.walkAfter + 1);
    expect(easy.order.length).toBe(5);
    expect(hard.order.length).toBe(7);
    expect(hard.order.filter((id) => questionDef(id).repeat).length).toBe(2);
    expect(hard.waitSus).toBeGreaterThan(easy.waitSus);
  });

  it('jede Frage hat zu jeder Lage mindestens eine passende Antwort', () => {
    const stories: Story[] = [{}, { from: 'club', to: 'home' }, { owner: 'kumpel', from: 'arbeit' }];
    for (let seed = 1; seed <= 30; seed++) {
      for (let hour = 0; hour < 24; hour += 3) {
        const setup = createTraffic(seed, 0.5, { ...OPTIONS, hour });
        for (const def of QUESTIONS) {
          for (const story of stories) {
            const ok = def.answers.some((a) => contradiction(def, a, setup.evidence, story) === null);
            expect(ok, `${def.id} h${hour} ${JSON.stringify(story)}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('Verkehrskontrolle: Gespräch', () => {
  it('Begrüßung, dann die erste Frage mit drei Antworten, genau eine passt', () => {
    const setup = createTraffic(5, 0.5, OPTIONS);
    const state = initTraffic(setup);
    const signals = run(setup, state, GREET + 0.1);
    expect(signals).toContain('greet');
    expect(signals).toContain('ask');
    expect(state.phase).toBe('ask');
    const q = state.question;
    expect(q).not.toBeNull();
    expect(q?.answers.length).toBe(3);
    const def = questionDef(q?.id ?? '');
    const fitting = q?.answers.filter(
      (a) =>
        contradiction(
          def,
          def.answers.find((x) => x.text === a.text) ?? def.answers[0],
          setup.evidence,
          state.story,
        ) === null,
    );
    expect(fitting?.length).toBe(1);
    expect(q?.answers[q.good].text).toBe(fitting?.[0].text);
  });

  it('die passende Antwort: Misstrauen fällt, es geht weiter; alle passend = Gute Fahrt mit hohem Score', () => {
    const setup = createTraffic(5, 0.5, OPTIONS);
    const state = initTraffic(setup);
    untilAsk(setup, state);
    const s0 = state.suspicion;
    expect(answer(setup, state, state.question?.good ?? 0)).toBe('ok');
    expect(state.suspicion).toBeLessThan(s0);
    let guard = 0;
    while (!isDone(state) && guard++ < 20) {
      untilAsk(setup, state);
      if (state.phase === 'ask') expect(answer(setup, state, state.question?.good ?? 0)).toBe('ok');
      run(setup, state, 0.2);
    }
    run(setup, state, 5);
    expect(state.outcome).toBe('pass');
    expect(state.hits).toBe(0);
    expect(trafficScore(state)).toBe(PASS_SCORE.clean);
    expect(trafficPicks(state)).toEqual([]);
    expect(progress(setup, state)).toBe(1);
  });

  it('ein Widerspruch zu Sichtbarem: Treffer mit Satz; der zweite: Aussteigen', () => {
    const setup = createTraffic(5, 0.5, OPTIONS);
    const state = initTraffic(setup);
    untilAsk(setup, state);
    const bad = badIndex(setup, state);
    expect(bad).toBeGreaterThanOrEqual(0);
    expect(answer(setup, state, bad)).toBe('hit');
    expect(state.hits).toBe(1);
    expect(state.line?.text.length).toBeGreaterThan(5);
    untilAsk(setup, state);
    const bad2 = badIndex(setup, state);
    expect(bad2).toBeGreaterThanOrEqual(0);
    expect(answer(setup, state, bad2)).toBe('fail');
    expect(state.outcome).toBe('fail');
    expect(state.hits).toBe(MAX_HITS);
    run(setup, state, 5);
    expect(isDone(state)).toBe(true);
    expect(trafficScore(state)).toBeLessThan(0.5);
  });

  it('ein Treffer, sonst alles passend: durch, aber er notiert das Kennzeichen (lies:1)', () => {
    const setup = createTraffic(8, 0.5, OPTIONS);
    const state = initTraffic(setup);
    untilAsk(setup, state);
    const bad = badIndex(setup, state);
    expect(bad).toBeGreaterThanOrEqual(0);
    answer(setup, state, bad);
    let guard = 0;
    while (!isDone(state) && guard++ < 20) {
      untilAsk(setup, state);
      if (state.phase === 'ask') answer(setup, state, state.question?.good ?? 0);
      run(setup, state, 0.2);
    }
    run(setup, state, 5);
    expect(state.outcome).toBe('pass');
    expect(trafficScore(state)).toBe(PASS_SCORE.noted);
    expect(trafficPicks(state)).toEqual(['lies:1']);
  });

  it('Widerspruch zu einer früheren Antwort: die Nachfrage muss zur ersten passen', () => {
    const setup = createTraffic(2, 1, OPTIONS);
    const state = initTraffic(setup);
    // Erst 'from' beantworten, dann eine Nachfrage dazu bauen.
    state.story = { from: 'kumpel' };
    const q = buildQuestion(setup, state, 'from2');
    expect(q.answers[q.good].claims.from).toBe('kumpel');
    const other = q.answers.find((a) => a.claims.from !== 'kumpel');
    expect(other).toBeDefined();
    const def = questionDef('from2');
    const full = def.answers.find((a) => a.text === other?.text);
    expect(full && contradiction(def, full, setup.evidence, state.story)).toMatch(/Vorhin sagten Sie/);
  });

  it('Nachfragen ohne erste Antwort werden übersprungen', () => {
    const setup = createTraffic(2, 1, OPTIONS);
    // Nur Nachfragen übrig lassen.
    setup.order = ['from2', 'to2'];
    setup.radioAfter = 99;
    const state = initTraffic(setup);
    run(setup, state, GREET + 1);
    expect(state.outcome).toBe('pass');
  });

  it('lange überlegen: er sagt etwas, Misstrauen steigt', () => {
    const setup = createTraffic(5, 0.5, OPTIONS);
    const state = initTraffic(setup);
    untilAsk(setup, state);
    const s0 = state.suspicion;
    const signals = run(setup, state, 16);
    expect(signals).toContain('slow');
    expect(state.suspicion).toBeGreaterThan(s0 + 0.05);
    expect(state.phase).toBe('ask');
  });

  it('nach hinten schauen und funken kommen als Zwischenschritte', () => {
    const setup = createTraffic(5, 1, OPTIONS);
    const state = initTraffic(setup);
    const all: string[] = [];
    let guard = 0;
    while (!isDone(state) && guard++ < 30) {
      all.push(...run(setup, state, 30));
      if (state.phase === 'ask') answer(setup, state, state.question?.good ?? 0);
    }
    expect(all).toContain('walk');
    expect(all).toContain('radio');
    expect(all).toContain('pass');
    expect(all).toContain('done');
  });
});

describe('Verkehrskontrolle: Schein und Gas', () => {
  it('Schein zu früh: abgelehnt und schlimmer; dazwischen: durch; zu spät: vorbei', () => {
    const setup = createTraffic(5, 0.5, OPTIONS);
    const state = initTraffic(setup);
    untilAsk(setup, state);
    state.suspicion = BRIBE_MIN - 0.1;
    expect(bribe(state)).toBe('low');
    expect(state.suspicion).toBeGreaterThan(BRIBE_MIN - 0.1);
    state.suspicion = (BRIBE_MIN + BRIBE_MAX) / 2;
    expect(bribe(state)).toBe('ok');
    expect(state.outcome).toBe('bribe');
    expect(trafficScore(state)).toBe(BRIBE_SCORE);
    expect(trafficPicks(state)).toEqual(['bribe']);
    expect(bribe(state)).toBe('done');
    const late = initTraffic(setup);
    untilAsk(setup, late);
    late.suspicion = BRIBE_MAX + 0.1;
    expect(bribe(late)).toBe('high');
    expect(late.outcome).toBe('fail');
  });

  it('Gas geben: pick flee, Score FLEE_SCORE, danach nichts mehr', () => {
    const setup = createTraffic(5, 0.5, OPTIONS);
    const state = initTraffic(setup);
    untilAsk(setup, state);
    expect(flee(state)).toBe(true);
    expect(flee(state)).toBe(false);
    expect(answer(setup, state, 0)).toBe('none');
    expect(trafficScore(state)).toBe(FLEE_SCORE);
    expect(trafficPicks(state)).toEqual(['flee']);
  });
});
