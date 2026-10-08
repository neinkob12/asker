import { describe, expect, it } from 'vitest';
import {
  BLOCK_FIRST,
  CAR_RADIUS,
  CATCH_SECONDS,
  type ChaseInput,
  type ChaseState,
  chasePicks,
  chaseScore,
  createChase,
  dist,
  dumpGoods,
  forceEnd,
  forward,
  GRID,
  HIDEOUT_RADIUS,
  initChase,
  lineAt,
  onRoad,
  PITCH,
  RAM_DAMAGE,
  SHAKE_NEAR,
  stepChase,
  TIME_LIMIT,
  TOP_SPEED,
  TURBO_FACTOR,
  WORLD,
  wrapAngle,
} from './model';

const GAS: ChaseInput = { steer: 0, gas: true, brake: false, turbo: false };
const IDLE: ChaseInput = { steer: 0, gas: false, brake: false, turbo: false };
const BRAKE: ChaseInput = { steer: 0, gas: false, brake: true, turbo: false };
const TURBO: ChaseInput = { steer: 0, gas: true, brake: false, turbo: true };

type Setup = ReturnType<typeof createChase>;

function run(setup: Setup, state: ChaseState, seconds: number, input: ChaseInput | ((t: number) => ChaseInput)) {
  for (let t = 0; t < seconds && !state.end; t += 1 / 60) {
    stepChase(setup, state, typeof input === 'function' ? input(t) : input, 1 / 60);
  }
}

/** Alle Streifen weg (für Tests ohne Verfolger). */
function noCops(state: ChaseState): void {
  for (const cop of state.cops) {
    cop.active = false;
    cop.spawnAt = Infinity;
  }
}

/** Kein Verkehr (für Tests, die saubere Straße brauchen). */
function noTraffic(state: ChaseState): void {
  state.traffic.length = 0;
}

describe('Verfolgungsjagd: Stadt aus dem Seed', () => {
  it('gleicher Seed, gleiche Stadt; anderer Seed, andere', () => {
    const a = createChase({ seed: 7, difficulty: 0.5 });
    const b = createChase({ seed: 7, difficulty: 0.5 });
    const c = createChase({ seed: 8, difficulty: 0.5 });
    expect(a.city.blocks.length).toBe(GRID * GRID);
    expect(a.city.blocks.map((x) => x.kind)).toEqual(b.city.blocks.map((x) => x.kind));
    expect(a.city.blocks.map((x) => x.kind)).not.toEqual(c.city.blocks.map((x) => x.kind));
    expect(a.city.riverCol).toBeGreaterThanOrEqual(2);
    expect(a.city.riverCol).toBeLessThan(GRID - 2);
  });

  it('Gebäude liegen in ihrem Block, der Start steht auf einer Straße', () => {
    const s = createChase({ seed: 3, difficulty: 0.5 });
    for (const block of s.city.blocks) {
      for (const b of block.buildings) {
        expect(b.x0).toBeGreaterThan(block.i * PITCH);
        expect(b.x1).toBeLessThan((block.i + 1) * PITCH);
        expect(b.z0).toBeGreaterThan(block.j * PITCH);
        expect(b.z1).toBeLessThan((block.j + 1) * PITCH);
      }
    }
    expect(onRoad(s.start.x)).toBe(true);
    expect(lineAt(s.start.x)).not.toBe(s.city.riverCol);
    expect(s.start.x).toBeGreaterThan(0);
    expect(s.start.z).toBeLessThan(WORLD);
  });

  it('schwerer: mehr Streifen, schnellere Streifen, mehr Verkehr, Sperren öfter', () => {
    const easy = createChase({ seed: 1, difficulty: 0.1 });
    const hard = createChase({ seed: 1, difficulty: 0.95 });
    expect(hard.cops).toBeGreaterThanOrEqual(easy.cops);
    expect(hard.copFactor).toBeGreaterThan(easy.copFactor);
    expect(hard.traffic).toBeGreaterThan(easy.traffic);
    expect(hard.blockEvery).toBeLessThan(easy.blockEvery);
  });

  it('Winkel: wrapAngle und forward', () => {
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2, 5);
    expect(forward(0)).toEqual({ x: 0, z: -1 });
    expect(forward(Math.PI / 2).x).toBeCloseTo(1, 5);
  });
});

describe('Verfolgungsjagd: Fahren', () => {
  it('Vollgas beschleunigt bis zum Höchsttempo, Bremse hält an, rückwärts langsam', () => {
    const setup = createChase({ seed: 2, difficulty: 0.3 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    run(setup, state, 12, GAS);
    expect(state.player.v).toBeGreaterThan(TOP_SPEED * 0.95);
    run(setup, state, 6, BRAKE);
    expect(state.player.v).toBeLessThan(0);
    expect(state.player.v).toBeGreaterThanOrEqual(-6);
  });

  it('Turbo zündet einmal, geht über das Höchsttempo und lädt nach', () => {
    const setup = createChase({ seed: 2, difficulty: 0.3 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    run(setup, state, 10, GAS);
    stepChase(setup, state, TURBO, 1 / 60);
    expect(state.player.turboOn).toBe(true);
    expect(state.events.some((e) => e.kind === 'turbo')).toBe(true);
    run(setup, state, 2.5, TURBO);
    expect(state.player.v).toBeGreaterThan(TOP_SPEED * 1.05);
    expect(state.player.v).toBeLessThanOrEqual(TOP_SPEED * TURBO_FACTOR + 0.01);
    run(setup, state, 12, IDLE);
    expect(state.player.turbo).toBeGreaterThan(0.9);
  });

  it('lenken dreht die Nase, die Fahrtrichtung folgt mit Verzug', () => {
    const setup = createChase({ seed: 2, difficulty: 0.3 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    // Mitten auf eine freie Fläche (Park) stellen, damit nichts im Weg steht: oberhalb der Stadt gibt es keine.
    run(setup, state, 2, GAS);
    const h0 = state.player.heading;
    stepChase(setup, state, { ...GAS, steer: 1 }, 1 / 60);
    stepChase(setup, state, { ...GAS, steer: 1 }, 1 / 60);
    stepChase(setup, state, { ...GAS, steer: 1 }, 1 / 60);
    expect(state.player.heading).toBeGreaterThan(h0);
    expect(Math.abs(wrapAngle(state.player.course - state.player.heading))).toBeGreaterThan(0);
    expect(state.player.course).toBeLessThan(state.player.heading);
  });

  it('gegen ein Gebäude: Schaden, Tempo weg, nie drin', () => {
    const setup = createChase({ seed: 2, difficulty: 0.3 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    run(setup, state, 6, GAS);
    // Scharf nach rechts in den Block.
    run(setup, state, 4, { ...GAS, steer: 1 });
    expect(state.events.length + state.player.damage).toBeGreaterThan(0);
    expect(state.player.damage).toBeGreaterThan(0);
    for (const w of setup.city.walls) {
      const inside = state.player.x > w.x0 && state.player.x < w.x1 && state.player.z > w.z0 && state.player.z < w.z1;
      expect(inside).toBe(false);
    }
  });

  it('Verkehr fährt auf den Straßen und bleibt in der Nähe', () => {
    const setup = createChase({ seed: 5, difficulty: 0.6 });
    const state = initChase(setup);
    noCops(state);
    expect(state.traffic.length).toBe(setup.traffic);
    run(setup, state, 20, GAS);
    for (const v of state.traffic) {
      expect(v.axis === 'x' ? onRoad(v.z) : onRoad(v.x)).toBe(true);
      expect(dist(v.x, v.z, state.player.x, state.player.z)).toBeLessThan(400);
    }
    expect(state.traffic.length).toBe(setup.traffic);
  });

  it('auffahren auf den Verkehr kostet Schaden und Tempo', () => {
    const setup = createChase({ seed: 5, difficulty: 0.6 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    run(setup, state, 5, GAS);
    const p = state.player;
    const f = forward(p.heading);
    state.traffic.push({
      id: 999,
      kind: 'car',
      x: p.x + f.x * 12,
      z: p.z + f.z * 12,
      axis: 'z',
      dir: -1,
      line: lineAt(p.x),
      v: 0,
      cruise: 0,
      color: 0,
      pushed: 10,
      braking: false,
      heading: p.heading,
      hitCooldown: 0,
    });
    const v0 = p.v;
    run(setup, state, 1, GAS);
    expect(p.damage).toBeGreaterThan(0);
    expect(p.v).toBeLessThan(v0);
  });
});

describe('Verfolgungsjagd: Streifen', () => {
  it('die erste Streife ist von Anfang an dran, weitere kommen dazu', () => {
    const setup = createChase({ seed: 4, difficulty: 0.9 });
    const state = initChase(setup);
    expect(state.cops.filter((c) => c.active).length).toBe(1);
    noTraffic(state);
    for (let t = 0; t < 20; t += 1 / 60) {
      stepChase(setup, state, IDLE, 1 / 60);
      // Nur das Erscheinen zählt: nicht gefasst werden.
      state.player.damage = 0;
      state.contact = 0;
      state.end = null;
    }
    expect(state.cops.filter((c) => c.active).length).toBe(setup.cops);
  });

  it('stehst du, holt sie auf und stellt dich nach CATCH_SECONDS', () => {
    const setup = createChase({ seed: 4, difficulty: 0.5 });
    const state = initChase(setup);
    noTraffic(state);
    run(setup, state, 3, BRAKE);
    run(setup, state, 25, IDLE);
    expect(state.end).toBe('caught');
    expect(state.t).toBeGreaterThan(CATCH_SECONDS);
    expect(chaseScore(state)).toBeLessThan(0.4);
  });

  it('rammt sie dich, kostet das Schaden', () => {
    const setup = createChase({ seed: 4, difficulty: 0.9 });
    const state = initChase(setup);
    noTraffic(state);
    const cop = state.cops[0];
    const p = state.player;
    const f = forward(p.heading);
    cop.x = p.x - f.x * (CAR_RADIUS * 2 + 0.2);
    cop.z = p.z - f.z * (CAR_RADIUS * 2 + 0.2);
    cop.v = 40;
    cop.ramCooldown = 0;
    p.v = 20;
    let rammed = false;
    for (let i = 0; i < 60 && !rammed; i++) {
      stepChase(setup, state, IDLE, 1 / 60);
      if (state.events.some((e) => e.kind === 'ram')) rammed = true;
    }
    expect(rammed).toBe(true);
    expect(p.damage).toBeGreaterThanOrEqual(RAM_DAMAGE - 1e-9);
  });

  it('Ware aus dem Fenster: einmal, Turbo voll, die Streifen zögern', () => {
    const setup = createChase({ seed: 4, difficulty: 0.5 });
    const state = initChase(setup);
    state.player.turbo = 0.2;
    expect(dumpGoods(state)).toBe(true);
    expect(dumpGoods(state)).toBe(false);
    expect(state.player.turbo).toBe(1);
    expect(state.cops[0].state).toBe('hesitate');
    expect(chasePicks(state)).toContain('dumped');
  });
});

describe('Verfolgungsjagd: Abhängen, Sperren, Ende', () => {
  it('weit weg von allen Streifen füllt sich der Balken, dann leuchtet die Tiefgarage; rein = entkommen', () => {
    const setup = createChase({ seed: 6, difficulty: 0.3 });
    const state = initChase(setup);
    noTraffic(state);
    // Streifen weit weg parken.
    for (const cop of state.cops) {
      cop.x = 5;
      cop.z = 5;
      cop.v = 0;
    }
    const park = () => {
      for (const cop of state.cops) {
        cop.x = 5;
        cop.z = 5;
        cop.v = 0;
      }
    };
    for (let t = 0; t < 12 && !state.hideout; t += 1 / 60) {
      park();
      stepChase(setup, state, GAS, 1 / 60);
    }
    expect(state.hideout).not.toBeNull();
    expect(state.shake).toBeGreaterThanOrEqual(0.99);
    const h = state.hideout ?? { x: 0, z: 0 };
    expect(dist(h.x, h.z, state.player.x, state.player.z)).toBeGreaterThan(HIDEOUT_RADIUS);
    // Direkt reinsetzen.
    state.player.x = h.x;
    state.player.z = h.z;
    park();
    stepChase(setup, state, IDLE, 1 / 60);
    expect(state.end).toBe('escaped');
    expect(chaseScore(state)).toBeGreaterThan(0.6);
    expect(chasePicks(state)).toContain('hideout');
  });

  it('kommt die Streife wieder dicht ran, verschwindet die Tiefgarage', () => {
    const setup = createChase({ seed: 6, difficulty: 0.3 });
    const state = initChase(setup);
    noTraffic(state);
    state.shake = 1;
    stepChase(setup, state, IDLE, 1 / 60);
    state.hideout = { x: 10, z: 10, heading: 0 };
    state.shake = 0.3;
    const p = state.player;
    state.cops[0].x = p.x;
    state.cops[0].z = p.z + SHAKE_NEAR - 5;
    stepChase(setup, state, IDLE, 1 / 60);
    expect(state.hideout).toBeNull();
    expect(state.events.some((e) => e.kind === 'hideoutLost')).toBe(true);
  });

  it('Sperren kommen ab BLOCK_FIRST vor dir auf eine Kreuzung, mit Lücke', () => {
    const setup = createChase({ seed: 6, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    let placed = false;
    for (let t = 0; t < BLOCK_FIRST + 8 && !placed; t += 1 / 60) {
      stepChase(setup, state, { ...IDLE, gas: t < 2 }, 1 / 60);
      if (state.events.some((e) => e.kind === 'block')) placed = true;
    }
    expect(placed).toBe(true);
    const b = state.blocks[0];
    expect(b.walls.length).toBeGreaterThanOrEqual(1);
    expect(b.walls.every((w) => w.kind === 'block')).toBe(true);
    const total = b.walls.reduce((s, w) => s + (b.axis === 'x' ? w.z1 - w.z0 : w.x1 - w.x0), 0);
    expect(total).toBeLessThan(17);
  });

  it('die Zeit läuft ab: pick time, Score klein', () => {
    const setup = createChase({ seed: 6, difficulty: 0.5 });
    const state = initChase(setup);
    noCops(state);
    noTraffic(state);
    run(setup, state, TIME_LIMIT + 1, IDLE);
    expect(state.end).toBe('time');
    expect(chasePicks(state)).toContain('time');
    expect(chaseScore(state)).toBeCloseTo(0.4, 2);
  });

  it('forceEnd beendet sofort', () => {
    const setup = createChase({ seed: 6, difficulty: 0.5 });
    const state = initChase(setup);
    forceEnd(state, 'escaped');
    expect(state.end).toBe('escaped');
    expect(chaseScore(state)).toBeCloseTo(1, 2);
  });
});
