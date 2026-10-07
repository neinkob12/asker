// Bude durchsuchen: Modell (Wohnung aus dem Seed, Suchen, Lärm, Zeit, Score) und Lage der Dinge auf der Bühne.

import { describe, expect, it } from 'vitest';
import { apartmentLayout, hitRect, hitTest, itemRect, neighbour, type Rect } from './layout';
import {
  ALERT_SECONDS,
  advance,
  createSearch,
  DURATION,
  ITEMS,
  initSearch,
  pick,
  ROOMS,
  type SearchEvent,
  type SearchSetup,
  searchPicks,
  searchScore,
  splitMoney,
  timeLeft,
} from './model';

/** Zeit in kleinen Schritten laufen lassen, Ereignisse sammeln. */
function run(setup: SearchSetup, state: ReturnType<typeof initSearch>, seconds: number): SearchEvent[] {
  const events: SearchEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) events.push(...advance(setup, state, 0.05));
  return events;
}

/** Ein Ding fertig durchsuchen. */
function searchItem(setup: SearchSetup, state: ReturnType<typeof initSearch>, index: number): SearchEvent[] {
  const events = pick(setup, state, index);
  return [...events, ...run(setup, state, setup.items[index].duration + 0.06)];
}

describe('Bude durchsuchen: Wohnung', () => {
  it('fest aus dem Seed, 15 (leicht) bis 25 (schwer) Dinge, je Raum mindestens zwei', () => {
    expect(createSearch(7, 0.5, 1200)).toEqual(createSearch(7, 0.5, 1200));
    expect(createSearch(7, 0.5, 1200)).not.toEqual(createSearch(8, 0.5, 1200));
    expect(createSearch(3, 0, 1000).items).toHaveLength(15);
    expect(createSearch(3, 1, 1000).items).toHaveLength(25);
    for (let seed = 1; seed < 40; seed++) {
      const setup = createSearch(seed, (seed % 5) / 4, 1000);
      for (const room of ROOMS) expect(setup.items.filter((i) => i.room === room).length).toBeGreaterThanOrEqual(2);
      expect(new Set(setup.items.map((i) => i.id)).size).toBe(setup.items.length);
    }
  });

  it('drei bis fünf Verstecke mit Geld, zusammen genau max', () => {
    for (let seed = 1; seed < 60; seed++) {
      const d = (seed % 5) / 4;
      const setup = createSearch(seed, d, 1537);
      const stashes = setup.items.filter((i) => i.money > 0);
      expect(stashes.length).toBe(setup.stashes);
      expect(setup.stashes).toBeGreaterThanOrEqual(3);
      expect(setup.stashes).toBeLessThanOrEqual(d === 0 ? 3 : 5);
      expect(stashes.reduce((a, i) => a + i.money, 0)).toBe(1537);
      expect(setup.total).toBe(1537);
      // Ein Schein lugt nur bei leicht und nur, wo Geld liegt.
      for (const item of setup.items) if (item.peek) expect(item.money > 0 && d < 0.35).toBe(true);
    }
  });

  it('Geld aufteilen: ganze Euro, Summe stimmt, jeder Teil mindestens 1', () => {
    expect(splitMoney(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(splitMoney(1000, [0.5, 1.5]).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.min(...splitMoney(5, [0.01, 0.01, 10]))).toBeGreaterThanOrEqual(1);
    expect(splitMoney(0, [1, 1, 1])).toEqual([0, 0, 0]);
  });

  it('Spuren: bei leicht an den meisten Verstecken, bei schwer mehr falsche Fährten', () => {
    let easyTells = 0;
    let easyStashes = 0;
    let hardDecoys = 0;
    let easyDecoys = 0;
    for (let seed = 1; seed < 80; seed++) {
      const easy = createSearch(seed, 0, 1000);
      const hard = createSearch(seed, 1, 1000);
      easyStashes += easy.stashes;
      easyTells += easy.items.filter((i) => i.money > 0 && i.tell).length;
      easyDecoys += easy.items.filter((i) => i.money === 0 && i.tell).length;
      hardDecoys += hard.items.filter((i) => i.money === 0 && i.tell).length;
    }
    expect(easyTells / easyStashes).toBeGreaterThan(0.75);
    expect(hardDecoys).toBeGreaterThan(easyDecoys * 2);
  });
});

describe('Bude durchsuchen: Spiel', () => {
  it('Antippen sucht, Geld fliegt in den Zähler, alles gefunden: Schluss mit Score 1', () => {
    const setup = createSearch(5, 0.3, 1000);
    const state = initSearch(setup);
    const stashes = setup.items.map((it, i) => (it.money > 0 ? i : -1)).filter((i) => i >= 0);
    let events: SearchEvent[] = [];
    for (const i of stashes) {
      const ev = searchItem(setup, state, i);
      expect(ev[0]).toEqual({ type: 'start', index: i });
      expect(ev.some((e) => e.type === 'found' && e.index === i && e.amount === setup.items[i].money)).toBe(true);
      events = ev;
      if (state.done) break;
    }
    // Lärm kann die Zeit kürzen; der Seed ist so gewählt, dass alles in die Zeit passt.
    expect(state.done).toBe(true);
    expect(state.reason).toBe('all');
    expect(events.at(-1)).toEqual({ type: 'end', reason: 'all' });
    expect(searchScore(setup, state)).toBe(1);
    expect(searchPicks(setup, state)).toEqual(
      expect.arrayContaining([`found:${setup.stashes}`, `hidden:${setup.stashes}`]),
    );
  });

  it('die Suche dauert; ein zweites Ding wartet, ein durchsuchtes geht nicht noch mal', () => {
    const setup = createSearch(9, 0.5, 900);
    const state = initSearch(setup);
    const empty = setup.items.findIndex((i) => i.money === 0 && i.noise === 0);
    const other = setup.items.findIndex((i, k) => k !== empty && i.money === 0);
    expect(pick(setup, state, empty)).toHaveLength(1);
    expect(pick(setup, state, empty)).toEqual([]);
    expect(pick(setup, state, other)).toEqual([]);
    expect(state.queued).toBe(other);
    run(setup, state, setup.items[empty].duration * 0.5);
    expect(state.searched[empty]).toBe(false);
    const ev = run(setup, state, setup.items[empty].duration * 0.5 + 0.06);
    expect(ev).toEqual(
      expect.arrayContaining([
        { type: 'empty', index: empty },
        { type: 'start', index: other },
      ]),
    );
    expect(state.current?.index).toBe(other);
    expect(pick(setup, state, empty)).toEqual([]);
    expect(pick(setup, state, -1)).toEqual([]);
    expect(pick(setup, state, 999)).toEqual([]);
  });

  it('Lärm steigt, sinkt langsam; voll: Nachbarn alarmiert, höchstens noch ALERT_SECONDS, pick noise', () => {
    const setup = createSearch(4, 0.8, 1000);
    for (const item of setup.items) item.noise = item.money > 0 ? 0 : 0.55;
    const state = initSearch(setup);
    const loud = setup.items.map((it, i) => (it.money === 0 ? i : -1)).filter((i) => i >= 0);
    const first = searchItem(setup, state, loud[0]);
    expect(first.some((e) => e.type === 'noise')).toBe(true);
    const level = state.noise;
    run(setup, state, 1);
    expect(state.noise).toBeLessThan(level);
    expect(state.alerted).toBe(false);
    const second = searchItem(setup, state, loud[1]);
    expect(second.some((e) => e.type === 'alert')).toBe(true);
    expect(state.alerted).toBe(true);
    expect(timeLeft(state)).toBeLessThanOrEqual(ALERT_SECONDS);
    expect(searchPicks(setup, state)).toContain('noise');
    const rest = run(setup, state, ALERT_SECONDS + 0.1);
    expect(rest.at(-1)).toEqual({ type: 'end', reason: 'time' });
    expect(state.done).toBe(true);
  });

  it('Zeit um: Schritte im Treppenhaus vorher, Score = gefundenes Geld / verstecktes Geld', () => {
    const setup = createSearch(12, 0.5, 1000);
    for (const item of setup.items) item.noise = 0;
    const state = initSearch(setup);
    const stash = setup.items.findIndex((i) => i.money > 0);
    searchItem(setup, state, stash);
    const events = run(setup, state, DURATION);
    expect(events.filter((e) => e.type === 'steps')).toHaveLength(1);
    expect(events.at(-1)).toEqual({ type: 'end', reason: 'time' });
    expect(searchScore(setup, state)).toBeCloseTo(setup.items[stash].money / 1000, 3);
    expect(searchPicks(setup, state)).toEqual(['found:1', `hidden:${setup.stashes}`]);
    // Nach dem Ende passiert nichts mehr.
    expect(advance(setup, state, 1)).toEqual([]);
    expect(pick(setup, state, 0)).toEqual([]);
  });

  it('nichts gefunden: Score 0; ohne Geld zählen die Verstecke', () => {
    const setup = createSearch(2, 0.5, 0);
    const state = initSearch(setup);
    expect(searchScore(setup, state)).toBe(0);
    expect(setup.total).toBe(0);
    const stash = setup.items.findIndex((i) => i.stash);
    for (const item of setup.items) item.noise = 0;
    searchItem(setup, state, stash);
    expect(state.foundStashes).toBe(1);
    expect(searchScore(setup, state)).toBeCloseTo(1 / setup.stashes, 3);
  });
});

describe('Bude durchsuchen: Lage', () => {
  const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (a: Rect, r: Rect) =>
    a.x >= r.x - 0.01 && a.y >= r.y - 0.01 && a.x + a.w <= r.x + r.w + 0.01 && a.y + a.h <= r.y + r.h + 0.01;

  for (const [name, w, h] of [
    ['Desktop', 950, 760],
    ['Handy', 390, 844],
    ['Handy quer', 844, 390],
    ['kleines Fenster', 640, 520],
  ] as const) {
    it(`${name}: alle Dinge im Raum, keine überlappen, Treffer mindestens 44 px`, () => {
      const layout = apartmentLayout(w, h);
      expect(layout.outer.x).toBeGreaterThanOrEqual(0);
      expect(layout.outer.x + layout.outer.w).toBeLessThanOrEqual(w);
      const rects = ITEMS.map((i) => itemRect(layout, i.id, i.room));
      ITEMS.forEach((item, i) => {
        expect(inside(rects[i], layout.rooms[item.room]), item.id).toBe(true);
        expect(hitRect(rects[i]).w).toBeGreaterThanOrEqual(44);
        for (let j = i + 1; j < rects.length; j++) {
          expect(overlap(rects[i], rects[j]), `${item.id} / ${ITEMS[j].id}`).toBe(false);
        }
      });
    });
  }

  it('Treffer: das Ding mit der nächsten Mitte; Pfeile gehen zum Nachbarn in der Richtung', () => {
    const rects = [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 30, y: 0, w: 20, h: 20 },
      { x: 0, y: 100, w: 20, h: 20 },
    ];
    expect(hitTest(rects, 10, 10)).toBe(0);
    expect(hitTest(rects, 42, 12)).toBe(1);
    expect(hitTest(rects, 300, 300)).toBe(-1);
    expect(neighbour(rects, 0, 1, 0)).toBe(1);
    expect(neighbour(rects, 0, 0, 1)).toBe(2);
    expect(neighbour(rects, 0, -1, 0)).toBe(0);
    expect(neighbour(rects, 0, 1, 0, (i) => i === 1)).toBe(0);
  });
});
