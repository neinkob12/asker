import { describe, expect, it } from 'vitest';
import { roadGraph } from '../../../../roads';
import {
  ABTAUCHEN_SECONDS,
  type ChaseInput,
  type ChaseOptions,
  type ChaseState,
  chasePicks,
  chaseScore,
  choose,
  createChase,
  dumpGoods,
  escaped,
  forceEnd,
  initChase,
  stepChase,
  TIME_LIMIT,
  upcoming,
} from './model';
import { branchesAfter, chaseNet, findPath, legLength, pickBranch, reverse } from './net';

const net = chaseNet(roadGraph('koeln'));
/** Ehrenfeld, Venloer Straße (in Metern des Kölner Graphen). */
const START = net.g.toMeters({ lng: 6.9205, lat: 50.9455 });
const base: ChaseOptions = { seed: 7, difficulty: 0.5, start: START };
const GAS: ChaseInput = { gas: true, brake: false, turbo: false };
const IDLE: ChaseInput = { gas: false, brake: false, turbo: false };
const BRAKE: ChaseInput = { gas: false, brake: true, turbo: false };

function run(state: ChaseState, setup: ReturnType<typeof createChase>, seconds: number, input: ChaseInput) {
  for (let t = 0; t < seconds && !state.end; t += 1 / 30) stepChase(net, setup, state, input, 1 / 30);
}

describe('Netz der Verfolgungsjagd', () => {
  it('kennt jede Kante an beiden Enden (keine Einbahnstraßen auf der Flucht)', () => {
    const g = net.g;
    for (let e = 0; e < g.edgeFrom.length; e += 97) {
      for (const [node, dir] of [
        [g.edgeFrom[e], 1],
        [g.edgeTo[e], 0],
      ] as const) {
        let found = false;
        for (let k = net.adjStart[node]; k < net.adjStart[node + 1]; k++) {
          if (net.adjEdge[k] === e && net.adjDir[k] === dir) found = true;
        }
        expect(found).toBe(true);
      }
    }
  });

  it('findet einen Weg mit A* und meidet Sperren', () => {
    const setup = createChase(net, base);
    const from = net.g.edgeFrom[setup.startLeg.edge];
    const state = initChase(net, setup);
    const to = state.cops[0] ? net.g.edgeTo[state.cops[0].leg.edge] : from;
    const path = findPath(net, from, to);
    expect(path).not.toBeNull();
    // Der Weg hängt zusammen.
    let node = from;
    for (const leg of path ?? []) {
      expect(leg.dir ? net.g.edgeFrom[leg.edge] : net.g.edgeTo[leg.edge]).toBe(node);
      node = leg.dir ? net.g.edgeTo[leg.edge] : net.g.edgeFrom[leg.edge];
    }
    expect(node).toBe(to);
  });

  it('wählt links, geradeaus und rechts nach dem Winkel', () => {
    const branches = [
      { leg: { edge: 1, dir: 1 }, angle: 1.5 },
      { leg: { edge: 2, dir: 1 }, angle: 0.1 },
      { leg: { edge: 3, dir: 1 }, angle: -1.6 },
    ];
    expect(pickBranch(branches, 'left')?.leg.edge).toBe(1);
    expect(pickBranch(branches, 'straight')?.leg.edge).toBe(2);
    expect(pickBranch(branches, 'right')?.leg.edge).toBe(3);
    // Keine Abzweigung nach rechts: der, der am weitesten rechts liegt.
    expect(pickBranch(branches.slice(0, 2), 'right')?.leg.edge).toBe(2);
  });
});

describe('Aufbau', () => {
  it('ist fest aus dem Seed', () => {
    expect(createChase(net, base)).toEqual(createChase(net, base));
    expect(createChase(net, { ...base, seed: 8 }).hideouts).not.toEqual(createChase(net, base).hideouts);
  });

  it('hat 2 bis 5 Streifen, Sperren erst ab mittlerer Schwierigkeit, Verstecke 350 bis 900 m entfernt', () => {
    const easy = createChase(net, { ...base, difficulty: 0 });
    const hard = createChase(net, { ...base, difficulty: 1 });
    expect(easy.cops).toBe(2);
    expect(hard.cops).toBe(5);
    expect(easy.roadblocks).toBe(0);
    expect(hard.roadblocks).toBeGreaterThan(0);
    expect(easy.heliAt).toBeGreaterThanOrEqual(40);
    expect(easy.heliAt).toBeLessThanOrEqual(60);
    expect(easy.hideouts.length).toBeGreaterThanOrEqual(2);
    for (const h of easy.hideouts) {
      const d = Math.hypot(h.x - START[0], h.y - START[1]);
      expect(d).toBeGreaterThan(300);
      expect(d).toBeLessThan(1000);
    }
  });

  it('nimmt eigene Lager in der Nähe als Versteck', () => {
    const near = { id: 'w1', label: 'Lager Ehrenfeld', x: START[0] + 400, y: START[1] + 200 };
    const far = { id: 'w2', label: 'Lager Porz', x: START[0] + 9000, y: START[1] };
    const setup = createChase(net, { ...base, warehouses: [near, far] });
    expect(setup.hideouts.map((h) => h.id)).toContain('w1');
    expect(setup.hideouts.map((h) => h.id)).not.toContain('w2');
    expect(setup.hideouts.find((h) => h.id === 'w1')?.kind).toBe('warehouse');
  });

  it('startet mit einer Streife direkt hinter dir (Sichtkontakt)', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    expect(state.cops.filter((c) => c.active)).toHaveLength(1);
    stepChase(net, setup, state, IDLE, 1 / 30);
    expect(state.sight).toBe(true);
    expect(state.nearest).toBeLessThan(setup.sightRange);
  });
});

describe('Fahren', () => {
  it('Gas beschleunigt, Bremse hält an, Turbo ist schneller und leert sich', () => {
    const setup = createChase(net, base);
    const a = initChase(net, setup);
    run(a, setup, 1.5, GAS);
    expect(a.player.v).toBeGreaterThan(5);
    const b = initChase(net, setup);
    run(b, setup, 1.5, { ...GAS, turbo: true });
    expect(b.player.v).toBeGreaterThan(a.player.v);
    expect(b.player.turbo).toBeLessThan(1);
    run(a, setup, 1, BRAKE);
    expect(a.player.v).toBeLessThan(1);
  });

  it('rollt ohne Vollgas mit gedrosseltem Tempo weiter (cruise)', () => {
    const setup = createChase(net, base);
    const full = initChase(net, setup);
    const cruise = initChase(net, setup);
    run(full, setup, 4, GAS);
    run(cruise, setup, 4, { ...IDLE, cruise: true });
    expect(cruise.player.v).toBeGreaterThan(3);
    expect(cruise.player.v).toBeLessThan(full.player.v);
  });

  it('nimmt an der Kreuzung die gewählte Abbiegung und setzt die Wahl danach zurück', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    choose(state, 'right');
    const next = upcoming(net, state);
    expect(state.player.choice).toBe('right');
    const target = next.chosen?.leg;
    let took = false;
    for (let i = 0; i < 30 * 30 && !state.end; i++) {
      stepChase(net, setup, state, GAS, 1 / 30);
      if (target && state.player.leg.edge === target.edge) {
        took = true;
        break;
      }
    }
    expect(took).toBe(true);
    expect(state.player.choice).toBe('straight');
  });

  it('dieselbe Seite zweimal wählen heißt wieder geradeaus', () => {
    const state = initChase(net, createChase(net, base));
    choose(state, 'left');
    choose(state, 'left');
    expect(state.player.choice).toBe('straight');
  });

  it('rutscht, wenn es zu schnell in eine scharfe Kurve geht', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    let skidded = false;
    // Mit Turbo immer scharf abbiegen.
    for (let i = 0; i < 30 * 40 && !state.end && !skidded; i++) {
      choose(state, i % 2 ? 'left' : 'right');
      stepChase(net, setup, state, { gas: true, brake: false, turbo: true }, 1 / 30);
      skidded = state.events.some((e) => e.kind === 'skid');
    }
    expect(skidded).toBe(true);
  });

  it('wendet im Stand mit gehaltener Bremse', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    const leg = state.player.leg;
    run(state, setup, 0.6, BRAKE);
    expect(state.player.leg).toEqual(reverse(leg));
    expect(state.player.uturn).toBeGreaterThan(0);
    // Weiter gehalten: kein zweites Wenden, erst nach dem Loslassen.
    run(state, setup, 3, BRAKE);
    expect(state.player.leg).toEqual(reverse(leg));
    run(state, setup, 0.1, IDLE);
    run(state, setup, 0.6, BRAKE);
    expect(state.player.leg).toEqual(leg);
  });

  it('kennt die nächste Kreuzung mit Abstand und Abzweigen', () => {
    const state = initChase(net, createChase(net, base));
    const next = upcoming(net, state);
    expect(next.distance).toBeGreaterThan(0);
    expect(next.branches.length === 0 || next.branches.length >= 2).toBe(true);
    expect(legLength(net, state.player.leg)).toBeGreaterThan(0);
    expect(branchesAfter(net, state.player.leg).length).toBeGreaterThanOrEqual(0);
  });
});

describe('Ende', () => {
  it('wer stehen bleibt, wird gefasst (Score 0,05 bis 0,4)', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    run(state, setup, 30, IDLE);
    expect(state.end).toBe('caught');
    expect(escaped(state)).toBe(false);
    const score = chaseScore(state);
    expect(score).toBeGreaterThanOrEqual(0.05);
    expect(score).toBeLessThanOrEqual(0.4);
  });

  it('ohne Sichtkontakt füllt sich der Ring und man ist weg', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    // Alle Streifen weit weg und gebremst: nur die Zeit zählt.
    for (const cop of state.cops) cop.spawnAt = 1e9;
    state.cops[0].active = false;
    run(state, setup, ABTAUCHEN_SECONDS + 1, IDLE);
    expect(state.end).toBe('escaped');
    expect(chaseScore(state)).toBeGreaterThan(0.9);
  });

  it('im Versteck ohne Sichtkontakt sofort entkommen', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    for (const cop of state.cops) cop.spawnAt = 1e9;
    state.cops[0].active = false;
    const h = setup.hideouts[0];
    state.player.leg = { edge: net.adjEdge[net.adjStart[h.node]], dir: net.adjDir[net.adjStart[h.node]] };
    state.player.s = 0;
    stepChase(net, setup, state, IDLE, 1 / 30);
    expect(state.end).toBe('hideout');
    expect(chasePicks(state)).toContain('hideout');
  });

  it('läuft die Zeit ab, ist es vorbei', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    for (const cop of state.cops) cop.spawnAt = 1e9;
    state.cops[0].active = false;
    state.heli.active = true;
    state.t = TIME_LIMIT - 0.01;
    // Der Hubschrauber sieht dich: kein Abtauchen.
    state.heli.x = state.player.x;
    state.heli.y = state.player.y;
    stepChase(net, setup, state, IDLE, 1 / 30);
    expect(state.end).toBe('time');
    expect(chasePicks(state)).toContain('time');
  });

  it('Ware aus dem Fenster geht einmal und kommt in die picks', () => {
    const setup = createChase(net, base);
    const state = initChase(net, setup);
    expect(dumpGoods(state)).toBe(true);
    expect(dumpGoods(state)).toBe(false);
    forceEnd(state, 'escaped');
    expect(chasePicks(state)).toEqual(['dumped']);
  });

  it('Score entkommen 0,6 + 0,4 · übrige Zeit', () => {
    const state = initChase(net, createChase(net, base));
    state.t = TIME_LIMIT / 2;
    forceEnd(state, 'escaped');
    expect(chaseScore(state)).toBeCloseTo(0.8, 5);
  });
});

describe('Spielbarkeit', () => {
  /** Ein einfacher Fahrer: Gas, Turbo auf Geraden, bremst vor Kurven, biegt ab, wenn die Streife nah ist. */
  function drive(seed: number, difficulty: number): ChaseState {
    const setup = createChase(net, { ...base, seed, difficulty });
    const state = initChase(net, setup);
    for (let i = 0; i < TIME_LIMIT * 30 && !state.end; i++) {
      const next = upcoming(net, state);
      if (next.distance > 60 && next.distance < 120)
        choose(state, i % 3 === 0 ? 'left' : i % 3 === 1 ? 'right' : 'straight');
      const tooFast = next.chosen && state.player.v > next.safe * 1.05 && next.distance < state.player.v * 1.4;
      stepChase(
        net,
        setup,
        state,
        { gas: !tooFast, brake: !!tooFast, turbo: !tooFast && next.distance > 150 && state.sight },
        1 / 30,
      );
    }
    return state;
  }

  it('ist mit vernünftigem Fahren zu schaffen, aber nicht immer', () => {
    const results = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => drive(seed, 0.3));
    const wins = results.filter(escaped).length;
    expect(wins).toBeGreaterThan(0);
    const hard = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => drive(seed, 0.95));
    expect(hard.filter(escaped).length).toBeLessThanOrEqual(wins);
  });
});
