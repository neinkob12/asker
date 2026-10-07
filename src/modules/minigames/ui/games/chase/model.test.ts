import { describe, expect, it } from 'vitest';
import {
  BLOCK_DAMAGE,
  BLOCK_FIRST,
  CAR_LENGTH,
  CATCH_SECONDS,
  type ChaseInput,
  type ChaseState,
  type Cop,
  CRUISE,
  chasePicks,
  chaseScore,
  createChase,
  dumpGoods,
  forceEnd,
  initChase,
  LANES,
  laneOf,
  laneX,
  RAM_DAMAGE,
  ROAD_HALF,
  SEGMENTS,
  SHAKE_NEAR,
  steer,
  stepChase,
  TIME_LIMIT,
  TOP_SPEED,
  TURBO_FACTOR,
  type Vehicle,
} from './model';

const GAS: ChaseInput = { gas: true, brake: false, turbo: false };
const IDLE: ChaseInput = { gas: false, brake: false, turbo: false };
const BRAKE: ChaseInput = { gas: false, brake: true, turbo: false };
const TURBO: ChaseInput = { gas: true, brake: false, turbo: true };

function run(setup: ReturnType<typeof createChase>, state: ChaseState, seconds: number, input: ChaseInput) {
  for (let t = 0; t < seconds && !state.end; t += 1 / 60) stepChase(setup, state, input, 1 / 60);
}

/** Fahren ohne Verfolger, ohne dass der Balken „Abhängen“ das Spiel beendet. */
function runFree(setup: ReturnType<typeof createChase>, state: ChaseState, seconds: number, input: ChaseInput) {
  for (let t = 0; t < seconds && !state.end; t += 1 / 60) {
    state.shake = 0;
    stepChase(setup, state, input, 1 / 60);
  }
}

/** Alle Streifen weg (für Tests ohne Verfolger). */
function noCops(state: ChaseState): void {
  for (const cop of state.cops) {
    cop.active = false;
    cop.spawnAt = Infinity;
  }
}

function cop(state: ChaseState, lane: number, behind: number, v: number): Cop {
  const c: Cop = {
    id: 900,
    lane,
    x: laneX(lane),
    z: state.player.z - behind,
    v,
    state: 'chase',
    spawnAt: 0,
    active: true,
    ramCooldown: 0,
    hesitateUntil: 0,
    wreckT: 0,
  };
  state.cops = [c];
  return c;
}

function car(state: ChaseState, lane: number, ahead: number, v: number): Vehicle {
  const vehicle: Vehicle = {
    id: 800,
    kind: 'car',
    lane,
    x: laneX(lane),
    z: state.player.z + ahead,
    v,
    color: 0,
    pushed: 0,
    braking: false,
  };
  state.traffic = [vehicle];
  return vehicle;
}

describe('Straße der Verfolgungsjagd', () => {
  it('kommt fest aus dem Seed, mit Kurven in beide Richtungen und Kulisse', () => {
    const a = createChase({ seed: 7, difficulty: 0.5 });
    const b = createChase({ seed: 7, difficulty: 0.5 });
    expect(a.road.length).toBe(SEGMENTS);
    expect(a.road.map((s) => s.curve)).toEqual(b.road.map((s) => s.curve));
    expect(a.road.some((s) => s.curve > 0.01)).toBe(true);
    expect(a.road.some((s) => s.curve < -0.01)).toBe(true);
    expect(Math.max(...a.road.map((s) => Math.abs(s.curve)))).toBeLessThan(0.05);
    expect(a.road.filter((s) => s.scenery.length > 0).length).toBeGreaterThan(SEGMENTS / 4);
    const other = createChase({ seed: 8, difficulty: 0.5 });
    expect(other.road.map((s) => s.curve)).not.toEqual(a.road.map((s) => s.curve));
  });

  it('wird mit der Schwierigkeit härter: mehr Streifen, schnellere Streifen, mehr Verkehr, Sperren öfter', () => {
    const easy = createChase({ seed: 1, difficulty: 0 });
    const hard = createChase({ seed: 1, difficulty: 1 });
    expect(easy.cops).toBe(2);
    expect(hard.cops).toBe(4);
    expect(hard.copFactor).toBeGreaterThan(easy.copFactor);
    expect(hard.traffic).toBeGreaterThan(easy.traffic);
    expect(hard.blockEvery).toBeLessThan(easy.blockEvery);
  });

  it('kennt Spuren und ihre Mitte', () => {
    expect(laneX(1)).toBe(0);
    expect(laneX(0)).toBeLessThan(0);
    expect(laneOf(laneX(2))).toBe(2);
    expect(laneOf(-99)).toBe(0);
    expect(laneOf(99)).toBe(LANES - 1);
  });
});

describe('Fahren', () => {
  it('startet mit der ersten Streife im Nacken und Verkehr voraus', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    expect(state.cops.length).toBe(setup.cops);
    expect(state.traffic.length).toBeGreaterThan(0);
    expect(state.traffic.every((v) => v.z > state.player.z)).toBe(true);
    stepChase(setup, state, GAS, 1 / 60);
    expect(state.cops[0].active).toBe(true);
    expect(state.nearest).toBeLessThan(SHAKE_NEAR);
    expect(state.near).toBe(true);
  });

  it('beschleunigt mit Gas auf das Höchsttempo, rollt ohne Gas langsamer und bremst', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    state.traffic = [];
    setup.traffic = 0;
    runFree(setup, state, 12, GAS);
    expect(state.player.v).toBeCloseTo(TOP_SPEED, 0);
    const z = state.player.z;
    runFree(setup, state, 10, IDLE);
    expect(state.player.v).toBeLessThan(TOP_SPEED);
    expect(state.player.v).toBeLessThanOrEqual(TOP_SPEED * CRUISE + 0.01);
    expect(state.player.z).toBeGreaterThan(z);
    runFree(setup, state, 5, BRAKE);
    expect(state.player.v).toBe(0);
  });

  it('zündet den Turbo nur voll geladen, wird schneller als mit Gas und lädt nach', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    state.traffic = [];
    setup.traffic = 0;
    runFree(setup, state, 2.5, TURBO);
    expect(state.player.turboOn).toBe(true);
    expect(state.player.v).toBeGreaterThan(TOP_SPEED * 1.05);
    expect(state.player.v).toBeLessThanOrEqual(TOP_SPEED * TURBO_FACTOR + 0.01);
    // Nach dem Turbo ist der Balken leer und lädt wieder.
    runFree(setup, state, 1, TURBO);
    expect(state.player.turboOn).toBe(false);
    expect(state.player.turbo).toBeLessThan(0.6);
    const before = state.player.turbo;
    runFree(setup, state, 2, GAS);
    expect(state.player.turbo).toBeGreaterThan(before);
  });

  it('wechselt die Spur und bleibt auf der Straße', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    state.traffic = [];
    setup.traffic = 0;
    expect(steer(state, 'left')).toBe(true);
    expect(state.player.lane).toBe(0);
    expect(steer(state, 'left')).toBe(false);
    runFree(setup, state, 2, GAS);
    expect(state.player.x).toBeCloseTo(laneX(0), 1);
    expect(steer(state, 'right')).toBe(true);
    expect(steer(state, 'right')).toBe(true);
    expect(state.player.lane).toBe(LANES - 1);
    runFree(setup, state, 2, GAS);
    expect(state.player.x).toBeCloseTo(laneX(LANES - 1), 1);
    expect(Math.abs(state.player.x)).toBeLessThan(ROAD_HALF);
  });
});

describe('Verkehr und Zusammenstöße', () => {
  it('hält immer mindestens eine Spur frei und füllt den Verkehr nach', () => {
    const setup = createChase({ seed: 5, difficulty: 1 });
    const state = initChase(setup);
    noCops(state);
    runFree(setup, state, 20, GAS);
    expect(state.traffic.length).toBeGreaterThanOrEqual(setup.traffic - 2);
    // Kein Wagen weit hinter dir, alle Lagen plausibel.
    expect(state.traffic.every((v) => v.z > state.player.z - 70)).toBe(true);
    for (const v of state.traffic) {
      const same = state.traffic.filter((o) => o !== v && Math.abs(o.z - v.z) < 20 && o.lane !== v.lane);
      expect(same.length).toBeLessThan(LANES - 1 + 1);
    }
  });

  it('kracht in einen langsamen Wagen: Tempo weg, Schaden, der andere wird angeschoben', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    setup.traffic = 0;
    state.player.v = TOP_SPEED;
    const slow = car(state, 1, 30, 12);
    const events: string[] = [];
    for (let i = 0; i < 90 && !events.includes('crash'); i++) {
      stepChase(setup, state, GAS, 1 / 60);
      events.push(...state.events.map((e) => e.kind));
    }
    expect(events).toContain('crash');
    expect(state.player.v).toBeLessThan(20);
    expect(state.player.damage).toBeGreaterThan(0.05);
    expect(slow.pushed).toBeGreaterThan(0);
    expect(state.player.z).toBeLessThan(slow.z);
  });

  it('rollt bei kleinem Tempounterschied nur auf (kaum Schaden)', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    setup.traffic = 0;
    state.player.v = 24;
    car(state, 1, 12, 20);
    const events: string[] = [];
    for (let i = 0; i < 120; i++) {
      stepChase(setup, state, IDLE, 1 / 60);
      events.push(...state.events.map((e) => e.kind));
    }
    expect(events).toContain('bump');
    expect(events).not.toContain('crash');
    expect(state.player.damage).toBeLessThan(0.05);
  });
});

describe('Streifen', () => {
  it('holt auf, rammt in deiner Spur und schiebt dich quer', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    setup.traffic = 0;
    state.traffic = [];
    state.player.v = 20;
    cop(state, 1, 12, 40);
    const events: string[] = [];
    for (let i = 0; i < 240 && !events.includes('ram'); i++) {
      stepChase(setup, state, { gas: false, brake: true, turbo: false }, 1 / 60);
      events.push(...state.events.map((e) => e.kind));
    }
    expect(events).toContain('ram');
    expect(state.player.damage).toBeCloseTo(RAM_DAMAGE, 2);
    expect(Math.abs(state.player.vx)).toBeGreaterThan(0);
  });

  it('stellt dich, wenn sie dicht dran ist und du langsam bist', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    setup.traffic = 0;
    state.traffic = [];
    state.player.v = 0;
    const c = cop(state, 1, 3, 0);
    for (let t = 0; t < CATCH_SECONDS + 1 && !state.end; t += 1 / 60) {
      // Die Streife klebt hinter dir.
      c.z = state.player.z - 3;
      c.v = 0;
      stepChase(setup, state, BRAKE, 1 / 60);
    }
    expect(state.end).toBe('caught');
    expect(chaseScore(state)).toBeLessThan(0.2);
  });

  it('zögert nach der Ware aus dem Fenster, und das geht nur einmal', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    state.player.turbo = 0.2;
    expect(dumpGoods(state)).toBe(true);
    expect(dumpGoods(state)).toBe(false);
    expect(state.player.turbo).toBe(1);
    expect(state.hesitateUntil).toBeGreaterThan(state.t);
    expect(chasePicks(state)).toContain('dumped');
  });
});

describe('Abhängen und Ende', () => {
  it('füllt den Balken ohne Verfolger und endet in der Tiefgarage', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    setup.traffic = 0;
    state.traffic = [];
    run(setup, state, 30, GAS);
    expect(state.end).toBe('escaped');
    expect(chasePicks(state)).toContain('hideout');
    expect(chaseScore(state)).toBeGreaterThanOrEqual(0.6);
    expect(chaseScore(state)).toBeLessThanOrEqual(1);
    // Nach dem Ende rollt der Wagen aus, die Zeit läuft noch (Zeitlupe).
    const t = state.t;
    stepChase(setup, state, GAS, 0.5);
    expect(state.t).toBeGreaterThan(t);
    expect(state.player.v).toBeLessThanOrEqual(TOP_SPEED);
  });

  it('leert den Balken, wenn eine Streife im Nacken sitzt', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    setup.traffic = 0;
    state.traffic = [];
    state.shake = 0.5;
    const c = cop(state, 0, 10, TOP_SPEED);
    for (let i = 0; i < 60; i++) {
      c.z = state.player.z - 10;
      stepChase(setup, state, GAS, 1 / 60);
    }
    expect(state.shake).toBeLessThan(0.5);
    expect(state.near).toBe(true);
  });

  it('ist bei vollem Schaden gefasst', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    state.player.damage = 0.99;
    cop(state, 1, 5, 30);
    state.player.v = 10;
    run(setup, state, 4, BRAKE);
    expect(state.end).toBe('caught');
  });

  it('läuft nach TIME_LIMIT ab', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    setup.traffic = 0;
    state.traffic = [];
    // Eine Streife, die immer gleich weit hinter dir bleibt (weder nah noch weit).
    const c = cop(state, 0, 36, 0);
    for (let t = 0; t < TIME_LIMIT + 2 && !state.end; t += 0.05) {
      c.z = state.player.z - 36;
      stepChase(setup, state, GAS, 0.05);
    }
    expect(state.end).toBe('time');
    expect(chasePicks(state)).toContain('time');
    expect(chaseScore(state)).toBeCloseTo(0.4, 1);
  });

  it('forceEnd beendet sofort (Screenshots)', () => {
    const setup = createChase({ seed: 3, difficulty: 0.5 });
    const state = initChase(setup);
    forceEnd(state, 'escaped');
    expect(state.end).toBe('escaped');
    expect(state.events.some((e) => e.kind === 'escaped')).toBe(true);
  });
});

describe('Straßensperren', () => {
  it('kommen ab BLOCK_FIRST mit einer Lücke; durch die Lücke geht es, daneben kracht es', () => {
    const setup = createChase({ seed: 11, difficulty: 0.6 });
    const state = initChase(setup);
    noCops(state);
    setup.traffic = 0;
    state.traffic = [];
    const events: string[] = [];
    while (state.t < BLOCK_FIRST + 1 && !events.includes('block')) {
      state.shake = 0;
      stepChase(setup, state, GAS, 1 / 30);
      events.push(...state.events.map((e) => e.kind));
    }
    expect(events).toContain('block');
    const block = state.blocks[0];
    expect(block).toBeDefined();
    expect(block.gap).toBeGreaterThanOrEqual(0);
    expect(block.gap).toBeLessThan(LANES);
    // In die Lücke fahren.
    while (state.player.lane < block.gap) steer(state, 'right');
    while (state.player.lane > block.gap) steer(state, 'left');
    const damage = state.player.damage;
    while (!block.passed && !state.end) {
      state.shake = 0;
      stepChase(setup, state, GAS, 1 / 30);
      events.push(...state.events.map((e) => e.kind));
    }
    expect(events).toContain('blockPassed');
    expect(state.player.damage).toBe(damage);

    // Zweite Sperre: absichtlich daneben.
    const state2 = initChase(setup);
    noCops(state2);
    state2.traffic = [];
    const events2: string[] = [];
    while (state2.blocks.length === 0 && state2.t < BLOCK_FIRST + 2) {
      state2.shake = 0;
      stepChase(setup, state2, GAS, 1 / 30);
    }
    const b2 = state2.blocks[0];
    const wrong = b2.gap === 0 ? 1 : 0;
    while (state2.player.lane < wrong) steer(state2, 'right');
    while (state2.player.lane > wrong) steer(state2, 'left');
    while (!b2.passed && !state2.end) {
      state2.shake = 0;
      stepChase(setup, state2, GAS, 1 / 30);
      events2.push(...state2.events.map((e) => e.kind));
    }
    expect(events2).toContain('blockHit');
    expect(state2.player.damage).toBeGreaterThanOrEqual(BLOCK_DAMAGE - 0.01);
    expect(state2.player.v).toBeLessThan(TOP_SPEED * 0.3);
  });

  it('räumt den Verkehr an der Sperre weg', () => {
    const setup = createChase({ seed: 11, difficulty: 0.9 });
    const state = initChase(setup);
    noCops(state);
    while (state.blocks.length === 0 && state.t < BLOCK_FIRST + 2) {
      state.shake = 0;
      stepChase(setup, state, GAS, 1 / 30);
    }
    const b = state.blocks[0];
    expect(state.traffic.every((v) => Math.abs(v.z - b.z) > CAR_LENGTH * 4)).toBe(true);
  });
});
