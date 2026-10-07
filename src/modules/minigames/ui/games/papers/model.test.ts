// Papiere fälschen (Teil 8): Modell ohne DOM. Fester Tisch aus dem Seed, jeder Widerspruch auffindbar, Finger und
// Treffer, Umschreiben, Schein, Aufgeben, Score und picks, Spielbarkeit mit einfachen Fälschern.

import { describe, expect, it } from 'vitest';
import { FIELD_KEYS } from './data';
import {
  advance,
  BRIBE_SCORE,
  bribe,
  bribeOpen,
  choose,
  createPapers,
  dateText,
  formatKg,
  giveUp,
  initPapers,
  isDone,
  isEditable,
  MAX_HITS,
  NO_STAMP,
  openCount,
  type PapersSetup,
  type PapersState,
  papersPicks,
  papersScore,
  type Signal,
} from './model';

/** Spielt t Sekunden in kleinen Schritten. */
function run(setup: PapersSetup, s: PapersState, seconds: number, step = 0.05): Signal[] {
  const out: Signal[] = [];
  for (let t = 0; t < seconds && !isDone(s); t += step) out.push(...advance(setup, s, step));
  return out;
}

/** Alles richtigstellen, was noch geht. */
function fixAll(setup: PapersSetup, s: PapersState): void {
  for (const slot of setup.slots) if (isEditable(s, slot.id)) choose(setup, s, slot.id, slot.truth);
}

describe('Papiere fälschen: Tisch', () => {
  it('ist fest aus dem Seed und hängt vom Ort ab', () => {
    const a = createPapers(7, 0.5, { setting: 'autobahn', time: 3000 });
    const b = createPapers(7, 0.5, { setting: 'autobahn', time: 3000 });
    expect(a).toEqual(b);
    expect(a.papers.map((p) => p.def.title)).toEqual(['Frachtbrief', 'Lieferschein', 'Zollanmeldung']);
    const port = createPapers(7, 0.5, { setting: 'port', time: 3000 });
    expect(port.papers.map((p) => p.def.title)).toEqual(['Konnossement', 'Packliste', 'Zollanmeldung']);
    expect(port.truth.plate).toMatch(/^[A-Z]{4} \d{6}-\d$/);
    expect(a.truth.plate).toMatch(/^[A-Z]{1,3}-[A-Z]{2} \d{3,4}$/);
  });

  it('2 bis 5 Widersprüche, mehr mit der Schwierigkeit, je Feld höchstens einer, nie ganz oben', () => {
    let easy = 0;
    let hard = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const [d, add] of [
        [0, (n: number) => (easy += n)],
        [1, (n: number) => (hard += n)],
      ] as const) {
        const setup = createPapers(seed, d, { setting: seed % 2 ? 'port' : 'autobahn' });
        expect(setup.wrong.length).toBeGreaterThanOrEqual(2);
        expect(setup.wrong.length).toBeLessThanOrEqual(5);
        add(setup.wrong.length);
        const keys = setup.wrong.map((id) => setup.slots.find((s) => s.id === id)?.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const id of setup.wrong) {
          const slot = setup.slots.find((s) => s.id === id);
          expect(slot && !(slot.paper === 0 && slot.line < 2)).toBe(true);
          expect(slot?.start).not.toBe(slot?.truth);
        }
      }
    }
    expect(hard / 60).toBeGreaterThan(easy / 60 + 2);
  });

  it('jeder Widerspruch ist zu finden: Mehrheit der Papiere oder Vorlage auf dem Tisch', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const setup = createPapers(seed, 1, { setting: seed % 2 ? 'port' : 'autobahn', time: 5000 });
      for (const key of FIELD_KEYS) {
        const slots = setup.slots.filter((s) => s.key === key);
        const right = slots.filter((s) => s.start === s.truth).length;
        // Waage, Kalender, Kamera zeigen weight, date, plate; der Stempel muss zur Herkunft passen (3 Papiere).
        const reference = key === 'weight' || key === 'date' || key === 'plate' ? 1 : 0;
        const herkunft = key === 'stamp' ? setup.slots.filter((s) => s.key === 'origin' && s.start === s.truth) : [];
        if (key === 'stamp') expect(herkunft.length).toBeGreaterThanOrEqual(2);
        else expect(right + reference).toBeGreaterThan(slots.length - right);
      }
      for (const slot of setup.slots) {
        expect(slot.options).toContain(slot.truth);
        if (slot.start !== NO_STAMP) expect(slot.options).toContain(slot.start);
        expect(new Set(slot.options).size).toBe(slot.options.length);
        expect(slot.options.length).toBeGreaterThanOrEqual(3);
        expect(slot.options.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('Gewicht und Datum lesbar', () => {
    expect(formatKg(12480)).toBe('12.480 kg');
    expect(formatKg(980)).toBe('980 kg');
    expect(dateText(0)).toMatch(/^[A-Z][a-z], Tag 1$/);
  });
});

describe('Papiere fälschen: Ablauf', () => {
  it('der Finger prüft Zeile für Zeile, Treffer bei falschen Werten, zwei Treffer: nicht geschafft', () => {
    const setup = createPapers(3, 0.5, { setting: 'autobahn' });
    const s = initPapers(setup);
    expect(s.phase).toBe('browse');
    run(setup, s, setup.startDelay + 0.01);
    expect(s.seen[setup.slots[0].id]).toBe('ok');
    const signals = run(setup, s, 200);
    expect(signals.filter((x) => x === 'hit')).toHaveLength(MAX_HITS);
    expect(signals).toContain('fail');
    expect(s.outcome).toBe('fail');
    expect(isDone(s)).toBe(true);
    expect(papersScore(setup, s)).toBeLessThan(0.5);
    expect(papersPicks(setup, s)).toEqual(['fixed:0', `hits:${MAX_HITS}`]);
  });

  it('alles behoben, bevor er hinkommt: durch mit Score 1, Umblättern zwischen den Papieren', () => {
    const setup = createPapers(5, 0.8, { setting: 'port' });
    const s = initPapers(setup);
    fixAll(setup, s);
    expect(openCount(setup, s)).toBe(0);
    const signals = run(setup, s, 200);
    expect(signals.filter((x) => x === 'nextPaper')).toHaveLength(2);
    expect(signals).toContain('pass');
    expect(s.outcome).toBe('pass');
    expect(papersScore(setup, s)).toBe(1);
    expect(papersPicks(setup, s)).toEqual([`fixed:${setup.wrong.length}`, 'hits:0']);
  });

  it('ein Treffer reicht noch: durch mit mindestens 0,5', () => {
    const setup = createPapers(11, 0.6, { setting: 'autobahn' });
    const s = initPapers(setup);
    const [first, ...rest] = setup.wrong;
    for (const id of rest) choose(setup, s, id, setup.slots.find((x) => x.id === id)?.truth ?? '');
    run(setup, s, 200);
    expect(s.seen[first]).toBe('hit');
    expect(s.outcome).toBe('pass');
    expect(papersScore(setup, s)).toBeGreaterThanOrEqual(0.5);
  });

  it('geprüfte Zeilen sind fest; einen richtigen Wert falsch machen ist auch ein Treffer', () => {
    const setup = createPapers(2, 0.3, { setting: 'autobahn' });
    const s = initPapers(setup);
    fixAll(setup, s);
    run(setup, s, setup.startDelay + 0.01);
    const first = setup.slots[0];
    expect(isEditable(s, first.id)).toBe(false);
    expect(choose(setup, s, first.id, first.options.find((o) => o !== first.truth) ?? '')).toEqual([]);
    const later = setup.slots[setup.slots.length - 1];
    const wrongValue = later.options.find((o) => o !== later.truth) ?? '';
    expect(choose(setup, s, later.id, wrongValue)).toEqual([later.key === 'stamp' ? 'stamp' : 'write']);
    expect(choose(setup, s, later.id, 'Gibt es nicht')).toEqual([]);
    run(setup, s, 200);
    expect(s.seen[later.id]).toBe('hit');
    expect(s.outcome).toBe('pass');
  });

  it('Schein: vor dem ersten Treffer ein Treffer, danach nimmt er ihn (einmal)', () => {
    const setup = createPapers(4, 0.5, { setting: 'autobahn' });
    const s = initPapers(setup);
    expect(bribeOpen(s)).toBe(false);
    expect(bribe(setup, s)).toEqual(['bribeRejected']);
    expect(s.hits).toBe(1);
    expect(bribe(setup, s)).toEqual([]);

    const t = initPapers(setup);
    run(setup, t, 200);
    // Bis zum ersten Treffer laufen lassen.
    const u = initPapers(setup);
    while (u.hits === 0 && !isDone(u)) advance(setup, u, 0.05);
    expect(bribeOpen(u)).toBe(true);
    expect(bribe(setup, u)).toEqual(['bribeAccepted']);
    expect(u.outcome).toBe('bribe');
    run(setup, u, 5);
    expect(papersScore(setup, u)).toBe(BRIBE_SCORE);
    expect(papersPicks(setup, u)[0]).toBe('bribe');
  });

  it('Ladung aufgeben: sofort vorbei, Score 0, pick giveUp', () => {
    const setup = createPapers(9, 0.5, { setting: 'port' });
    const s = initPapers(setup);
    expect(giveUp(setup, s)).toEqual(['giveUp']);
    const signals = run(setup, s, 5);
    expect(signals).toContain('done');
    expect(papersScore(setup, s)).toBe(0);
    expect(papersPicks(setup, s)[0]).toBe('giveUp');
    expect(giveUp(setup, s)).toEqual([]);
  });

  it('Länge: zwischen 20 und 90 Sekunden', () => {
    for (const d of [0, 0.5, 1]) {
      const setup = createPapers(1, d, { setting: 'autobahn' });
      const s = initPapers(setup);
      fixAll(setup, s);
      let t = 0;
      while (!isDone(s) && t < 200) {
        advance(setup, s, 0.05);
        t += 0.05;
      }
      expect(t).toBeGreaterThan(20);
      expect(t).toBeLessThan(90);
    }
  });
});

describe('Papiere fälschen: spielbar', () => {
  /**
   * Ein einfacher Fälscher: vergleicht wie ein Mensch Feld für Feld (je Feld so viele Sekunden), beginnend mit dem
   * Papier, das er gerade liest, und behebt, was er findet.
   */
  function forger(setup: PapersSetup, secondsPerField: number): PapersState {
    const s = initPapers(setup);
    const order = [...setup.slots];
    let budget = 0;
    let t = 0;
    while (!isDone(s) && t < 200) {
      advance(setup, s, 0.05);
      t += 0.05;
      budget += 0.05;
      while (budget >= secondsPerField && order.length > 0) {
        budget -= secondsPerField;
        const slot = order.shift();
        if (slot && isEditable(s, slot.id) && s.values[slot.id] !== slot.truth) choose(setup, s, slot.id, slot.truth);
      }
    }
    return s;
  }

  it('flink kommt man meist durch, schwer langsam seltener', () => {
    let quick = 0;
    let slowHard = 0;
    for (let seed = 1; seed <= 40; seed++) {
      if (forger(createPapers(seed, 0.3, { setting: 'autobahn' }), 1.2).outcome === 'pass') quick += 1;
      if (forger(createPapers(seed, 1, { setting: 'port' }), 2.6).outcome === 'pass') slowHard += 1;
    }
    expect(quick).toBeGreaterThanOrEqual(34);
    expect(slowHard).toBeLessThan(quick);
  });
});
