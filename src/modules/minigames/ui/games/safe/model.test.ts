// Spiellogik von Tresor knacken (Auftrag 44, Teil 0), ohne DOM.

import { describe, expect, it } from 'vitest';
import { playSafe, SAFE_BOT_GOOD, SAFE_BOT_WEAK, type SafeBot } from './bot';
import {
  advance,
  CORRECTION,
  comingRight,
  confirm,
  createSafe,
  DURATION_EASY,
  DURATION_HARD,
  dialDistance,
  dialNumber,
  initSafe,
  onTarget,
  proximity,
  requiredDir,
  type SafeSetup,
  type SafeState,
  safeScore,
  timeLeft,
  turn,
  turnHeld,
  wrap,
} from './model';

/** Von der aktuellen Stellung in Richtung dir genau auf target drehen. */
function turnTo(state: SafeState, target: number, dir: 1 | -1): void {
  const way = dir > 0 ? wrap(target - state.pos) : -wrap(state.pos - target);
  turn(state, way === 0 ? dir * 100 : way);
}

function crack(setup: SafeSetup, state: SafeState): void {
  setup.combo.forEach((n, i) => {
    turnTo(state, n, requiredDir(i));
    confirm(setup, state);
  });
}

describe('Tresor: Aufbau', () => {
  it('gleicher Seed, gleicher Tresor; die Zahlen liegen auseinander und im Rad', () => {
    expect(createSafe(42, 0.5)).toEqual(createSafe(42, 0.5));
    expect(createSafe(42, 0.5).combo).not.toEqual(createSafe(43, 0.5).combo);
    for (let seed = 0; seed < 50; seed++) {
      const s = createSafe(seed, 0.5);
      expect(s.combo.every((n) => Number.isInteger(n) && n >= 0 && n < 100)).toBe(true);
      expect(dialDistance(s.start, s.combo[0])).toBeGreaterThanOrEqual(18);
      expect(dialDistance(s.combo[0], s.combo[1])).toBeGreaterThanOrEqual(18);
      expect(dialDistance(s.combo[1], s.combo[2])).toBeGreaterThanOrEqual(18);
    }
  });

  it('schwerer: weniger Zeit und schmalere Toleranz', () => {
    const easy = createSafe(1, 0.2);
    const hard = createSafe(1, 0.9);
    expect(easy.duration).toBe(DURATION_EASY);
    expect(hard.duration).toBe(DURATION_HARD);
    expect(hard.catchTime).toBeLessThan(easy.catchTime);
    expect(easy.decoys.every((list) => list.length === 0)).toBe(true);
    expect(hard.decoys.every((list) => list.length === 2)).toBe(true);
    expect(hard.tolerance).toBeLessThan(easy.tolerance);
    expect(hard.tolerance).toBeGreaterThanOrEqual(2);
    expect(hard.penalty).toBeGreaterThan(easy.penalty);
  });

  it('Rad: Strecke über die Null, Zahl unter der Marke', () => {
    expect(dialDistance(98, 2)).toBe(4);
    expect(dialDistance(10, 60)).toBe(50);
    expect(dialNumber(99.6)).toBe(0);
    expect(wrap(-3)).toBe(97);
  });
});

describe('Tresor: Drehen und Einrasten', () => {
  it('drehen meldet die überschrittenen Zahlen in Drehrichtung', () => {
    const setup = createSafe(7, 0.5);
    const state = initSafe(setup);
    state.pos = 98.5;
    expect(turn(state, 3)).toEqual([99, 0, 1]);
    expect(state.pos).toBeCloseTo(1.5, 5);
    expect(turn(state, -2)).toEqual([1, 0]);
    expect(state.lastDir).toBe(-1);
  });

  it('richtig gedreht und getroffen: rastet ein, nach drei Zahlen ist er offen', () => {
    const setup = createSafe(3, 0.5);
    const state = initSafe(setup);
    turnTo(state, setup.combo[0], 1);
    expect(onTarget(setup, state)).toBe(true);
    expect(proximity(setup, state)).toBeCloseTo(1, 5);
    expect(confirm(setup, state)).toBe('locked');
    turnTo(state, setup.combo[1], -1);
    expect(confirm(setup, state)).toBe('locked');
    turnTo(state, setup.combo[2], 1);
    expect(confirm(setup, state)).toBe('opened');
    expect(state).toMatchObject({ done: true, opened: true, step: 3 });
  });

  it('daneben oder aus der falschen Richtung: Strafsekunden, kein Fortschritt', () => {
    const setup = createSafe(3, 0.5);
    const state = initSafe(setup);
    turnTo(state, setup.combo[0] + 20, 1);
    expect(confirm(setup, state)).toBe('miss');
    expect(state.penalty).toBe(setup.penalty);
    // Aus der falschen Richtung auf die richtige Zahl:
    turnTo(state, setup.combo[0], -1);
    expect(confirm(setup, state)).toBe('wrongWay');
    expect(state.step).toBe(0);
    expect(state.mistakes).toBe(2);
    expect(timeLeft(setup, state)).toBe(setup.duration - 2 * setup.penalty);
  });

  it('überdreht: ein kleines Stück zurück gilt noch als richtige Richtung, weit zurück nicht', () => {
    const setup = createSafe(4, 0.5);
    const state = initSafe(setup);
    turnTo(state, setup.combo[0] + 4, 1);
    turn(state, -4);
    expect(comingRight(state)).toBe(true);
    expect(confirm(setup, state)).toBe('locked');
    const wide = initSafe(setup);
    turnTo(wide, setup.combo[0] + CORRECTION + 3, 1);
    turn(wide, -(CORRECTION + 3));
    expect(confirm(setup, wide)).toBe('wrongWay');
  });

  it('nach dem Einrasten muss man erst wieder drehen (in die neue Richtung)', () => {
    const setup = createSafe(5, 0.5);
    const state = initSafe(setup);
    turnTo(state, setup.combo[0], 1);
    confirm(setup, state);
    // Gleich noch einmal ohne Drehen: falsche Richtung.
    expect(confirm(setup, state)).not.toBe('locked');
  });

  it('Nähe steigt zum Ziel hin und ist aus der falschen Richtung schwächer', () => {
    const setup = createSafe(9, 0.5);
    const state = initSafe(setup);
    turnTo(state, setup.combo[0] - 10, 1);
    const far = proximity(setup, state);
    turn(state, 6);
    const near = proximity(setup, state);
    expect(near).toBeGreaterThan(far);
    turn(state, -1);
    expect(proximity(setup, state)).toBeLessThan(near);
  });
});

describe('Tresor: Zeit und Score', () => {
  it('die Zeit läuft ab: vorbei, Score nach geknackten Zahlen', () => {
    const setup = createSafe(11, 0.5);
    const state = initSafe(setup);
    turnTo(state, setup.combo[0], 1);
    confirm(setup, state);
    expect(advance(setup, state, setup.duration - 1)).toBe(false);
    expect(advance(setup, state, 2)).toBe(true);
    expect(state.done).toBe(true);
    expect(safeScore(setup, state)).toBeCloseTo(0.2 / 3, 3);
    expect(turn(state, 5)).toEqual([]);
    expect(confirm(setup, state)).toBe('done');
  });

  it('geknackt: 0,6 plus 0,4 mal restliche Zeit; schnell ist besser', () => {
    const setup = createSafe(13, 0.3);
    const quick = initSafe(setup);
    crack(setup, quick);
    expect(safeScore(setup, quick)).toBe(1);
    const slow = initSafe(setup);
    advance(setup, slow, setup.duration / 2);
    crack(setup, slow);
    expect(safeScore(setup, slow)).toBeCloseTo(0.8, 2);
    const none = initSafe(setup);
    advance(setup, none, setup.duration + 1);
    expect(safeScore(setup, none)).toBe(0);
  });

  it('Strafsekunden können das Spiel beenden', () => {
    const setup = createSafe(13, 0.9);
    const state = initSafe(setup);
    advance(setup, state, setup.duration - 2);
    turn(state, 1);
    turn(state, 30);
    confirm(setup, state);
    expect(state.done).toBe(true);
    expect(state.opened).toBe(false);
  });
});

describe('Tresor: Rad hakt (Auftrag 49)', () => {
  it('beim Halten bleibt das Rad an der richtigen Zahl hängen, danach dreht es weiter', () => {
    const setup = createSafe(4, 0.2);
    const state = initSafe(setup);
    let caught = null as ReturnType<typeof turnHeld>['caught'];
    for (let i = 0; i < 600 && !caught; i++) {
      caught = turnHeld(setup, state, 0.3).caught;
      advance(setup, state, 0.01);
    }
    expect(caught).toBe('target');
    expect(state.pos).toBe(setup.combo[0]);
    expect(turnHeld(setup, state, 0.3).crossed).toEqual([]);
    expect(confirm(setup, state)).toBe('locked');
  });

  it('Störklicks haken kürzer und gelten nicht als Zahl', () => {
    const setup = createSafe(4, 0.9);
    const state = initSafe(setup);
    let caught = null as ReturnType<typeof turnHeld>['caught'];
    for (let i = 0; i < 2000 && caught !== 'decoy'; i++) {
      caught = turnHeld(setup, state, 0.3).caught;
      if (caught === 'target') {
        advance(setup, state, 1);
        caught = null;
      }
    }
    expect(caught).toBe('decoy');
    expect(state.caught).toBeLessThan(setup.catchTime);
    expect(setup.decoys[0]).toContain(state.pos);
    expect(confirm(setup, state)).toBe('miss');
  });
});

describe('Tresor: Schwierigkeit (Test-Bot)', () => {
  function measure(bot: SafeBot | null, difficulty: number) {
    let opened = 0;
    let seconds = 0;
    const n = 40;
    for (let seed = 1; seed <= n; seed++) {
      const setup = createSafe(seed, difficulty);
      const run = playSafe(setup, initSafe(setup), bot);
      if (run.opened) opened += 1;
      seconds += run.seconds / n;
    }
    return { opened: opened / n, seconds };
  }

  it('schaffbar, aber knapp: geübt fast immer, schwach mittel öfter als schwer, ohne Eingabe nie', () => {
    expect(measure(SAFE_BOT_GOOD, 0.5).opened).toBeGreaterThanOrEqual(0.9);
    expect(measure(SAFE_BOT_GOOD, 0.9).opened).toBeGreaterThanOrEqual(0.8);
    const weakMid = measure(SAFE_BOT_WEAK, 0.5).opened;
    expect(weakMid).toBeGreaterThanOrEqual(0.5);
    expect(weakMid).toBeLessThanOrEqual(0.85);
    expect(measure(SAFE_BOT_WEAK, 0.9).opened).toBeLessThan(weakMid);
    expect(measure(SAFE_BOT_WEAK, 0.2).opened).toBeGreaterThanOrEqual(0.9);
    for (const d of [0.2, 0.5, 0.9]) expect(measure(null, d).opened).toBe(0);
  });
});
