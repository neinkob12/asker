// Regressionstests zu Befunden aus dem Bugreview (Minispiele, Oberfläche): Modelle ohne DOM.

import { describe, expect, it } from 'vitest';
import {
  type BrawlEvent,
  type BrawlInput,
  type BrawlSetup,
  type BrawlState,
  createBrawl,
  type Fighter,
  fighterById,
  initBrawl,
  playerOf,
  stepBrawl,
} from './brawl/model';
import {
  activeCue,
  advance,
  createInterview,
  discovered,
  type InterviewPerson,
  type InterviewState,
  initInterview,
  isDone,
  mark,
  newlyDiscovered,
} from './interview/model';
import {
  canHide,
  createStash,
  getHide,
  initStash,
  isLoose,
  type StashInput,
  type StashSetup,
  type StashState,
  savedValue,
  send,
  step,
} from './stash/model';

describe('Tastendruck während einer Trefferpause im Straßenkampf', () => {
  const DT = 1 / 60;
  const PARAMS = {
    setting: 'spot',
    opponent: { label: 'Leute von Schäl Sick', strength: 50, count: 3, roles: ['leader', 'nervous', 'bruiser'] },
    crew: [],
    player: { stats: { strength: 60, speed: 50 }, condition: 'ok' },
    clock: 4,
  };

  function run(s: BrawlSetup, state: BrawlState, seconds: number, input: () => BrawlInput = () => ({ dx: 0 })) {
    const events: BrawlEvent[] = [];
    for (let t = 0; t < seconds; t += DT) events.push(...stepBrawl(s, state, DT, input()));
    return events;
  }

  /** Spieler und ein Gegner nebeneinander, alle anderen am Boden; der Gegner greift nicht an. */
  function duel(): { s: BrawlSetup; state: BrawlState; p: Fighter; f: Fighter } {
    const s = createBrawl(7, 0.5, PARAMS);
    const state = initBrawl(s);
    for (const o of state.fighters) {
      if (o.kind === 'player' || o.id === 'foe:1') continue;
      o.out = 'down';
      o.state = 'down';
      o.hp = 0;
    }
    const p = playerOf(state);
    const f = fighterById(state, 'foe:1') as Fighter;
    for (const [x, facing, who] of [
      [5, 1, p],
      [5.8, -1, f],
    ] as const) {
      who.x = x;
      who.lane = 0;
      who.depth = 0;
      who.facing = facing;
      who.state = 'idle';
      who.t = 0;
      who.vx = 0;
    }
    f.cooldown = 99;
    return { s, state, p, f };
  }

  it('ein Schlag, gedrückt im Treffer-Stopp, kommt nach der Pause an', () => {
    const { s, state, p, f } = duel();
    state.hitStop = 0.05;
    stepBrawl(s, state, DT, { dx: 0, light: true });
    // In der Pause steht alles still.
    expect(state.hitStop).toBeGreaterThan(0);
    expect(p.state).toBe('idle');
    const events = run(s, state, 0.5);
    expect(events.some((e) => e.type === 'hit' && e.attacker === 'player' && e.target === 'foe:1')).toBe(true);
    expect(f.hp).toBeLessThan(f.maxHp);
  });

  it('auch Ausweichen aus der Pause gilt danach, aber nur einmal', () => {
    const { s, state, p } = duel();
    state.hitStop = 0.05;
    stepBrawl(s, state, DT, { dx: 0, dodge: true });
    expect(p.state).toBe('idle');
    run(s, state, 0.1);
    expect(p.dodgeSince).toBeGreaterThan(0);
    expect(state.held).toBeNull();
  });

  it('ohne Pause ändert sich nichts: Eingaben gelten im selben Bild', () => {
    const { s, state, p } = duel();
    stepBrawl(s, state, DT, { dx: 0, light: true });
    expect(p.state).toBe('windup');
    expect(state.held).toBeNull();
  });

  /** Bilder weiter, bis dein Schlag sitzt; danach steht der Treffer-Stopp. */
  function untilOwnHit(s: BrawlSetup, state: BrawlState): void {
    for (let i = 0; i < 120; i++) {
      const events = stepBrawl(s, state, DT, { dx: 0 });
      if (events.some((e) => e.type === 'hit' && e.attacker === 'player')) return;
    }
    throw new Error('kein eigener Treffer');
  }

  /** Wie oft du in dieser Zeit neu ausholst (ohne weitere Eingaben). */
  function windups(s: BrawlSetup, state: BrawlState, p: Fighter, seconds: number): number {
    let count = 0;
    let last = p.state;
    for (let t = 0; t < seconds; t += DT) {
      stepBrawl(s, state, DT, { dx: 0 });
      if (p.state === 'windup' && last !== 'windup') count += 1;
      last = p.state;
    }
    return count;
  }

  for (const [attack, label] of [
    ['light', 'leichten'],
    ['heavy', 'schweren'],
  ] as const) {
    it(`nach deinem eigenen ${label} Treffer: ein Schlag aus der Pause kommt, sobald du wieder frei bist`, () => {
      const { s, state, p } = duel();
      stepBrawl(s, state, DT, { dx: 0, [attack]: true });
      expect(p.state).toBe('windup');
      untilOwnHit(s, state);
      // Du stehst noch im Schlag; Schlag und Erholung dauern länger als ein fester Puffer von 0,25 s.
      expect(state.hitStop).toBeGreaterThan(0);
      expect(p.state).toBe('strike');
      stepBrawl(s, state, DT, { dx: 0, light: true });
      expect(windups(s, state, p, 1)).toBe(1);
      expect(state.buffered).toBeNull();
    });
  }

  it('ein Schlag kurz nach der Pause, noch im eigenen Schlag, kommt ebenso (und nur einmal)', () => {
    const { s, state, p } = duel();
    stepBrawl(s, state, DT, { dx: 0, heavy: true });
    untilOwnHit(s, state);
    // Pause (0,1 s) und Schlag vorbei, die Erholung dauert noch gut 0,25 s.
    run(s, state, 0.25);
    expect(state.hitStop).toBe(0);
    expect(p.state).toBe('recover');
    expect(p.dur - p.t).toBeGreaterThan(0.25);
    stepBrawl(s, state, DT, { dx: 0, light: true });
    expect(windups(s, state, p, 1)).toBe(1);
  });

  it('Ausweichen aus der Pause nach deinem eigenen Treffer wartet, bis du ausweichen kannst', () => {
    const { s, state, p } = duel();
    const before = p.dodgeSince;
    stepBrawl(s, state, DT, { dx: 0, light: true });
    untilOwnHit(s, state);
    expect(p.state).toBe('strike');
    stepBrawl(s, state, DT, { dx: 0, dodge: true });
    run(s, state, 0.3);
    expect(p.dodgeSince).toBeGreaterThan(before);
    expect(state.held).toBeNull();
    // Nur einmal: danach weicht er nicht erneut aus.
    const first = p.dodgeSince;
    run(s, state, 1);
    expect(p.dodgeSince).toBe(first);
  });
});

describe('Razzia-Countdown, Ware unterwegs, wenn die Straße zu ist', () => {
  const LAGER: StashInput = {
    setting: 'warehouse',
    lots: [
      { productId: 'weed', name: 'Gras', amount: 1200, unit: 'g', grams: 1200, value: 13200 },
      { productId: 'kush', name: 'OG Kush', amount: 300, unit: 'g', grams: 300, value: 5400 },
    ],
    money: 2400,
    warehouse: { vault: 0, cover: 0 },
  };

  function settle(setup: StashSetup, state: StashState): string[] {
    const types: string[] = [];
    for (let i = 0; i < 200 && state.carry && !state.done; i++)
      types.push(...step(setup, state, 0.05).map((e) => e.type));
    return types;
  }

  for (const hideId of ['trunk', 'drain'] as const) {
    it(`was kurz vor dem Schließen zum ${hideId === 'trunk' ? 'Kofferraum' : 'Gully'} geht, bleibt liegen`, () => {
      const setup = createStash(5, 1, LAGER);
      const state = initStash(setup);
      const closeAt = setup.closeAt as number;
      const pkg = setup.packages.find((p) => canHide(setup, state, p.id, hideId) === 'ok');
      if (!pkg) throw new Error('kein passendes Paket');
      state.time = closeAt - 0.1;
      expect(send(setup, state, pkg.id, hideId)).toBe('ok');
      const types = settle(setup, state);
      expect(types).toContain('closed');
      expect(types).not.toContain('stowed');
      expect(state.items[pkg.id].hide).toBeNull();
      expect(isLoose(state, pkg.id)).toBe(true);
      expect(savedValue(setup, state)).toBe(0);
      // Es liegt nicht im Versteck, du hast die Hände frei, und das Versteck draußen bleibt zu.
      expect(state.carry).toBeNull();
      expect(canHide(setup, state, pkg.id, hideId)).toBe('closed');
    });
  }

  it('was beim Schließen schon im Kofferraum verstaut wird, ist drin', () => {
    const setup = createStash(5, 1, LAGER);
    const state = initStash(setup);
    const trunk = getHide(setup, 'trunk');
    if (!trunk) throw new Error('kein Kofferraum');
    const pkg = setup.packages.find((p) => canHide(setup, state, p.id, 'trunk') === 'ok');
    if (!pkg) throw new Error('kein passendes Paket');
    // Liegt schon am Kofferraum: kommt sofort an und wird verstaut, während die Straße zugeht.
    state.items[pkg.id].x = trunk.x + trunk.w / 2;
    state.items[pkg.id].y = trunk.y + trunk.h / 2;
    state.time = (setup.closeAt as number) - 0.1;
    expect(send(setup, state, pkg.id, 'trunk')).toBe('ok');
    const types = settle(setup, state);
    expect(types).toContain('closed');
    expect(types).toContain('stowed');
    expect(state.items[pkg.id].hide).toBe('trunk');
  });
});

describe('Lügendetektor, Akte ohne Doppel', () => {
  function play(person: InterviewPerson, seed: number): InterviewState {
    const setup = createInterview(seed, 0.3, person);
    const s = initInterview();
    for (let i = 0; i < 60 * 120 && !isDone(s); i++) {
      advance(setup, s, 1 / 60);
      const active = activeCue(setup, s);
      if (active?.cue.tell && !s.caught.includes(active.index)) mark(setup, s);
    }
    return s;
  }

  it('alles schon bekannt (alte Stände): erkannt wird nichts Neues', () => {
    const person: InterviewPerson = { traits: ['drinker', 'charmer'], known: ['drinker', 'charmer'] };
    let exposedKnown = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = play(person, seed);
      exposedKnown += discovered(s).length;
      expect(newlyDiscovered(s, person.known ?? [])).toEqual([]);
    }
    // Die Antworten verraten durchaus Bekanntes (sonst prüfte der Test nichts).
    expect(exposedKnown).toBeGreaterThan(0);
  });

  it('teilweise bekannt: die Akte zählt jede Eigenschaft höchstens einmal', () => {
    // Hitzkopf bekannt, Trinker nicht: Nach dem Trinker verrät die Frage nach Hitzkopf, Trinker, Ehrgeizig nur noch
    // den Hitzkopf.
    const person: InterviewPerson = { traits: ['hothead', 'drinker'], known: ['hothead'] };
    const known = person.known ?? [];
    let sawKnown = false;
    for (let seed = 1; seed <= 40; seed++) {
      const s = play(person, seed);
      if (discovered(s).includes('hothead')) sawKnown = true;
      const fresh = newlyDiscovered(s, known);
      expect(fresh).not.toContain('hothead');
      const file = [...known, ...fresh];
      expect(new Set(file).size).toBe(file.length);
      // Offene Fragezeichen werden nie zu wenige.
      expect(person.traits.length - file.length).toBeGreaterThanOrEqual(0);
    }
    expect(sawKnown).toBe(true);
  });
});
