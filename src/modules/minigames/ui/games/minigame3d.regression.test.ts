// Regressionstests zu Befunden aus dem Bugreview der 3D-Minispiele (Verfolgungsjagd, Verkehrskontrolle).

import { describe, expect, it } from 'vitest';
import {
  CAR_RADIUS,
  type ChaseInput,
  type ChaseState,
  type Cop,
  chaseScore,
  createChase,
  forceEnd,
  forward,
  GRID,
  initChase,
  LANE_OFF,
  PITCH,
  stepChase,
  TIME_LIMIT,
  TOP_SPEED,
  TURBO_SECONDS,
  timeLeft,
  type Vehicle,
  type Wall,
  wrapAngle,
} from './chase/model';
import {
  answer,
  buildQuestion,
  contradiction,
  createTraffic,
  initTraffic,
  isDone,
  advance as trafficAdvance,
} from './traffic/model';
import { plateAdjective, QUESTIONS, type Story } from './traffic/questions';

const IDLE: ChaseInput = { steer: 0, gas: false, brake: false, turbo: false };
const GAS: ChaseInput = { steer: 0, gas: true, brake: false, turbo: false };
const TURBO: ChaseInput = { steer: 0, gas: true, brake: false, turbo: true };

/** Jagd ohne Streifen, ohne Verkehr, ohne Fluss und mit eigenen Wänden: nur das, was der Test braucht. */
function bareChase(walls: Wall[] = []) {
  const setup = createChase({ seed: 2, difficulty: 0.3 });
  setup.city.walls = walls;
  setup.city.riverCol = -10;
  const state = initChase(setup);
  for (const cop of state.cops) {
    cop.active = false;
    cop.spawnAt = Infinity;
  }
  state.traffic.length = 0;
  return { setup, state };
}

function car(partial: Partial<Vehicle>): Vehicle {
  return {
    id: 900,
    kind: 'car',
    x: 0,
    z: 0,
    axis: 'x',
    dir: 1,
    line: 5,
    v: 10,
    cruise: 10,
    color: 0,
    pushed: 0,
    braking: false,
    heading: 0,
    hitCooldown: 0,
    ...partial,
  };
}

function placePlayer(state: ChaseState, x: number, z: number, heading: number, v: number): void {
  const p = state.player;
  p.x = x;
  p.z = z;
  p.heading = heading;
  p.course = heading;
  p.v = v;
}

describe('Verkehr biegt an der Kreuzung ab, die er gerade überquert', () => {
  /** Ein Wagen auf der Ost-West-Straße fährt über die Kreuzung k; der Zufall biegt immer rechts ab. */
  function cross(k: number, dir: 1 | -1) {
    const { setup, state } = bareChase();
    const line = 5;
    const v = car({ axis: 'x', dir, line, x: k * PITCH - dir * 1, z: line * PITCH + dir * LANE_OFF });
    state.traffic.push(v);
    // Du stehst eine Straße weiter, damit der Wagen nicht neu gesetzt wird und dir nicht begegnet.
    placePlayer(state, k * PITCH + 30, (line + 2) * PITCH, 0, 0);
    state.random = () => 0.9;
    let jump = 0;
    for (let i = 0; i < 20; i++) {
      const [x0, z0] = [v.x, v.z];
      stepChase(setup, state, IDLE, 1 / 60);
      jump = Math.max(jump, Math.hypot(v.x - x0, v.z - z0));
    }
    return Object.assign(v, { jump });
  }

  for (const dir of [1, -1] as const) {
    for (const k of [1, 5, GRID - 1]) {
      it(`Richtung ${dir > 0 ? '+x' : '−x'}, Kreuzung ${k}: Abbiegen auf Straße ${k}, kein Sprung`, () => {
        const v = cross(k, dir);
        expect(v.axis).toBe('z');
        expect(v.line).toBe(k);
        // Rechts ab: von Osten nach Süden (+z), von Westen nach Norden (−z).
        expect(v.dir).toBe(dir);
        expect(Math.abs(v.x - k * PITCH)).toBeLessThanOrEqual(LANE_OFF + 1e-9);
        expect(v.jump).toBeLessThan(2 * LANE_OFF + 1);
      });
    }
  }

  it('am Rand (Kreuzung 0 nach Westen, Kreuzung GRID nach Osten) dreht er um statt abzubiegen', () => {
    const west = cross(0, -1);
    expect(west.axis).toBe('x');
    expect(west.dir).toBe(1);
    const east = cross(GRID, 1);
    expect(east.axis).toBe('x');
    expect(east.dir).toBe(-1);
  });
});

describe('Nach dem Aufprall läuft der Kurs entlang der Wand', () => {
  /** Wand quer (Normale nach Süden) bzw. längs (Normale nach Osten), Wagen knapp davor. */
  function hit(course: number, side: 'south' | 'east') {
    const wall: Wall =
      side === 'south'
        ? { x0: -1000, z0: 390, x1: 1000, z1: 400, kind: 'building' }
        : { x0: 390, z0: -1000, x1: 400, z1: 1000, kind: 'building' };
    const { setup, state } = bareChase([wall]);
    if (side === 'south') placePlayer(state, 300, 400 + CAR_RADIUS + 0.3, course, 40);
    else placePlayer(state, 400 + CAR_RADIUS + 0.3, 300, course, 40);
    let crashed = false;
    for (let i = 0; i < 10 && !crashed; i++) {
      stepChase(setup, state, GAS, 1 / 60);
      crashed = state.events.some((e) => e.kind === 'crash');
    }
    expect(crashed).toBe(true);
    return state.player.course;
  }

  it('frontal: Kurs quer zur Normalen (parallel zur Wand)', () => {
    const course = hit(0, 'south');
    expect(Math.abs(forward(course).z)).toBeLessThan(1e-9);
  });

  it('schräg: Kurs entlang der Wand in die Richtung, die näher am alten Kurs liegt', () => {
    expect(wrapAngle(hit(0.4, 'south') - Math.PI / 2)).toBeCloseTo(0, 9);
    expect(wrapAngle(hit(-0.4, 'south') + Math.PI / 2)).toBeCloseTo(0, 9);
    // Längs stehende Wand (Normale nach Osten), von Osten kommend nach Nordwesten: weiter nach Norden.
    expect(wrapAngle(hit(-Math.PI / 2 + 0.4, 'east'))).toBeCloseTo(0, 9);
  });
});

describe('Nach dem Aufprall zeigt auch die Nase entlang der Wand', () => {
  /** Quer stehende Wand nördlich von dir (Normale nach Süden). */
  const NORTH_WALL: Wall = { x0: -1000, z0: 390, x1: 1000, z1: 400, kind: 'building' };
  const BRAKE: ChaseInput = { steer: 0, gas: false, brake: true, turbo: false };

  /** Acht Sekunden mit gehaltener Eingabe gegen die Wand: Zeitpunkte der Aufpralle, Nase direkt nach dem ersten. */
  function holdAgainstWall(hz: number, heading: number, v: number, input: ChaseInput) {
    const { setup, state } = bareChase([NORTH_WALL]);
    placePlayer(state, 300, 400 + CAR_RADIUS + 0.3, heading, v);
    const crashes: number[] = [];
    let noseAfterFirst = Number.NaN;
    let damageAfterFirst = Number.NaN;
    for (let i = 0; i < 8 * hz; i++) {
      stepChase(setup, state, input, 1 / hz);
      if (!state.events.some((e) => e.kind === 'crash')) continue;
      crashes.push(state.t);
      if (crashes.length === 1) {
        noseAfterFirst = state.player.heading;
        damageAfterFirst = state.player.damage;
      }
    }
    return { crashes, noseAfterFirst, damageAfterFirst, damage: state.player.damage };
  }

  for (const hz of [30, 60, 120]) {
    it(`frontal mit 40 m/s und gehaltenem Gas: ein Aufprall in acht Sekunden, nicht alle 0,5 s (${hz} Hz)`, () => {
      const r = holdAgainstWall(hz, 0, 40, GAS);
      expect(r.crashes.length).toBe(1);
      expect(r.damage).toBe(r.damageAfterFirst);
      // Die Nase steht parallel zur Wand, der Griff zieht den Kurs nicht mehr hinein.
      expect(Math.abs(forward(r.noseAfterFirst).z)).toBeLessThan(1e-9);
    });
  }

  it('rückwärts mit gehaltener Bremse gegen die Wand: ebenso nur ein Aufprall', () => {
    const r = holdAgainstWall(60, Math.PI, -6, BRAKE);
    expect(r.crashes.length).toBe(1);
    expect(Math.abs(forward(r.noseAfterFirst).z)).toBeLessThan(1e-9);
  });

  it('zeigt die Nase beim Rutschen schon von der Wand weg, bleibt sie, wie sie ist', () => {
    const { setup, state } = bareChase([NORTH_WALL]);
    // Kurs nach Norden in die Wand, Nase nach Ostsüdost (von der Wand weg).
    placePlayer(state, 300, 400 + CAR_RADIUS + 0.3, 1.7, 40);
    state.player.course = 0;
    stepChase(setup, state, IDLE, 1 / 60);
    expect(state.events.some((e) => e.kind === 'crash')).toBe(true);
    expect(state.player.heading).toBe(1.7);
    // Frontaler Aufprall nach vorn dagegen: Die Nase dreht mit (ohne die Änderung bleibt sie bei 0).
    const r = holdAgainstWall(60, 0, 40, IDLE);
    expect(Math.abs(wrapAngle(r.noseAfterFirst))).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('Ladungsfrage hat immer eine passende Antwort', () => {
  const values = (fact: keyof Story): (string | undefined)[] => {
    const set = new Set<string>();
    for (const q of QUESTIONS) for (const a of q.answers) if (a.claims[fact]) set.add(a.claims[fact] as string);
    return [undefined, ...set];
  };

  it('zu jeder Lage und jeder Geschichte (woher, wohin, Zweck) gibt es eine passende Antwort', () => {
    const cargo = QUESTIONS.find((q) => q.id === 'cargo');
    if (!cargo) throw new Error('Ladungsfrage fehlt');
    for (let seed = 1; seed <= 40; seed++) {
      for (let hour = 0; hour < 24; hour++) {
        const ev = createTraffic(seed, 0.5, { hour, homeCity: 'Köln' }).evidence;
        for (const from of values('from'))
          for (const to of values('to'))
            for (const purpose of values('purpose')) {
              const story: Story = { from, to, purpose };
              const ok = cargo.answers.some((a) => contradiction(cargo, a, ev, story) === null);
              expect(ok, `${ev.visible} h${hour} ${JSON.stringify(story)}`).toBe(true);
            }
      }
    }
  });

  it('nachts „In den Club“ mit Umzugskartons fliegt bei der Frage nach dem Ziel auf, nicht erst bei der Ladung', () => {
    const toDef = QUESTIONS.find((q) => q.id === 'to');
    const club = toDef?.answers.find((a) => a.claims.to === 'club');
    const purposeDef = QUESTIONS.find((q) => q.id === 'purpose');
    const pickup = purposeDef?.answers.find((a) => a.claims.purpose === 'club');
    if (!toDef || !club || !purposeDef || !pickup) throw new Error('Antwort fehlt');
    const ev = {
      hour: 23,
      plateHome: true,
      plateCity: 'Köln',
      homeCity: 'Köln',
      vehicle: 'kombi',
      visible: 'kartons',
    } as const;
    expect(contradiction(toDef, club, ev, {})).not.toBeNull();
    expect(contradiction(purposeDef, pickup, ev, {})).not.toBeNull();
    // Ohne Kartons bleibt der Club nachts eine passende Antwort.
    expect(contradiction(toDef, club, { ...ev, visible: 'taschen' }, {})).toBeNull();
    expect(contradiction(purposeDef, pickup, { ...ev, visible: 'taschen' }, {})).toBeNull();
  });

  it('wer immer die passende Antwort gibt, bekommt nie eine Frage ohne passende Antwort', () => {
    for (let seed = 1; seed <= 120; seed++) {
      for (let hour = 0; hour < 24; hour++) {
        const setup = createTraffic(seed, 1, { hour, homeCity: 'Köln' });
        const state = initTraffic(setup);
        for (let guard = 0; guard < 100 && !isDone(state); guard++) {
          const q = state.question;
          if (state.phase === 'ask' && q) {
            expect(
              q.good,
              `Seed ${seed}, ${hour} Uhr, Frage ${q.id}, ${JSON.stringify(state.story)}`,
            ).toBeGreaterThanOrEqual(0);
            expect(answer(setup, state, q.good)).toBe('ok');
          } else trafficAdvance(setup, state, 5);
        }
        expect(state.outcome).toBe('pass');
        expect(state.hits).toBe(0);
      }
    }
    // buildQuestion bleibt die Quelle für good.
    const setup = createTraffic(3, 0.5, { hour: 23, homeCity: 'Köln' });
    expect(buildQuestion(setup, initTraffic(setup), 'cargo').good).toBeGreaterThanOrEqual(0);
  });
});

describe('Reibung an Wänden hängt nicht von der Bildrate ab', () => {
  const WALL: Wall = { x0: 400, z0: -1000, x1: 410, z1: 2000, kind: 'building' };

  /** Eine Sekunde leicht schräg an der Hauswand entlang rollen, ohne Gas. */
  function scrape(hz: number): number {
    const { setup, state } = bareChase([WALL]);
    placePlayer(state, 400 - CAR_RADIUS, 1000, 0.02, 30);
    for (let i = 0; i < hz; i++) stepChase(setup, state, IDLE, 1 / hz);
    return state.player.v;
  }

  it('Spieler: gleiches Tempo nach einer Sekunde bei 30, 60 und 120 Hz', () => {
    const v30 = scrape(30);
    const v60 = scrape(60);
    const v120 = scrape(120);
    expect(v60).toBeLessThan(25); // es schrammt wirklich
    expect(Math.abs(v30 - v60)).toBeLessThan(0.5);
    expect(Math.abs(v120 - v60)).toBeLessThan(0.5);
  });

  /** Streife drückt gegen eine Wand, hinter der du stehst. */
  function copAtWall(hz: number): number {
    const { setup, state } = bareChase([WALL]);
    placePlayer(state, 415, 1000, 0, 0);
    const cop = state.cops[0] as Cop;
    state.cops = [cop];
    Object.assign(cop, {
      active: true,
      spawnAt: 0,
      state: 'chase',
      x: 400 - CAR_RADIUS,
      z: 1000,
      heading: Math.PI / 2,
    });
    Object.assign(cop, { v: 10, ramCooldown: 10 });
    for (let i = 0; i < hz; i++) stepChase(setup, state, IDLE, 1 / hz);
    return cop.v;
  }

  it('Streife: gleiches Tempo an der Wand bei 30, 60 und 120 Hz', () => {
    const v30 = copAtWall(30);
    const v60 = copAtWall(60);
    const v120 = copAtWall(120);
    expect(Math.abs(v30 - v60)).toBeLessThan(0.2);
    expect(Math.abs(v120 - v60)).toBeLessThan(0.2);
  });
});

describe('Streife gegen Verkehr wirkt je Kontakt gleich, unabhängig von der Bildrate', () => {
  /**
   * Streife fährt mit `speed` nach Osten an einem stehenden Wagen vorbei, `offset` Meter seitlich versetzt. Du stehst
   * weit genug weg (kein Sichtkontakt), der Zufall lässt sie nie verunglücken. Ergebnis: kleinstes Tempo der Streife
   * und wie oft auf den Unfall gewürfelt wurde.
   */
  function copThroughTraffic(hz: number, speed: number, offset: number) {
    const { setup, state } = bareChase();
    placePlayer(state, 303, 420, 0, 0);
    const cop = state.cops[0] as Cop;
    state.cops = [cop];
    Object.assign(cop, { active: true, spawnAt: 0, state: 'chase', pursuit: false, x: 290, z: 300 });
    Object.assign(cop, { heading: Math.PI / 2, v: speed, ramCooldown: 10, tx: 600, tz: 300, axis: 'x', dir: 1 });
    state.traffic.push(car({ x: 300, z: 300 + offset, v: 0, cruise: 0, pushed: 10 }));
    let rolls = 0;
    state.random = () => {
      rolls++;
      return 0.9;
    };
    let minV = Infinity;
    for (let i = 0; i < Math.round(0.6 * hz); i++) {
      stepChase(setup, state, IDLE, 1 / hz);
      minV = Math.min(minV, cop.v);
    }
    return { minV, rolls };
  }

  for (const [speed, offset] of [
    [25, 2],
    [40, 2],
    [40, 1],
  ] as const) {
    it(`${speed} m/s, ${offset} m versetzt: gleiches Tempo und gleich viele Würfe bei 30, 60 und 120 Hz`, () => {
      const at60 = copThroughTraffic(60, speed, offset);
      expect(at60.minV).toBeLessThan(speed * 0.7); // der Kontakt bremst wirklich
      for (const hz of [30, 120]) {
        const r = copThroughTraffic(hz, speed, offset);
        expect(Math.abs(r.minV - at60.minV), `${hz} Hz`).toBeLessThan(0.5);
        expect(r.rolls, `${hz} Hz`).toBe(at60.rolls);
      }
    });
  }
});

describe('Nach dem Turbo läuft das Tempo aus, statt zu springen', () => {
  it('mit gehaltenem Gas fällt das Tempo höchstens um COAST · dt pro Schritt', () => {
    const { setup, state } = bareChase();
    placePlayer(state, 300, 300, 0, TOP_SPEED);
    stepChase(setup, state, TURBO, 1 / 60);
    expect(state.player.turboOn).toBe(true);
    let last = state.player.v;
    let maxDrop = 0;
    let ended = false;
    let afterEnd = 0;
    for (let i = 0; i < (TURBO_SECONDS + 1) * 60; i++) {
      stepChase(setup, state, GAS, 1 / 60);
      maxDrop = Math.max(maxDrop, last - state.player.v);
      last = state.player.v;
      if (!state.player.turboOn && !ended) {
        ended = true;
        afterEnd = state.player.v;
      }
    }
    expect(ended).toBe(true);
    expect(afterEnd).toBeGreaterThan(TOP_SPEED + 5);
    expect(maxDrop).toBeLessThan(0.1);
  });
});

describe('Angestoßener Verkehr bleibt auf seiner Spur', () => {
  it('seitlich gestreift: Querversatz bleibt null, auch nach dem Weiterfahren', () => {
    const { setup, state } = bareChase();
    const line = 4;
    const lane = line * PITCH + LANE_OFF;
    const v = car({ axis: 'x', dir: 1, line, x: 3.5 * PITCH, z: lane, heading: Math.PI / 2 });
    state.traffic.push(v);
    // Du stehst daneben, zur Straßenmitte hin, und berührst ihn.
    placePlayer(state, v.x, lane - 2, Math.PI / 2, 0);
    stepChase(setup, state, IDLE, 1 / 60);
    expect(state.events.some((e) => e.kind === 'sideswipe' || e.kind === 'crash')).toBe(true);
    expect(v.z).toBe(lane);
    for (let i = 0; i < 120; i++) stepChase(setup, state, IDLE, 1 / 60);
    if (v.axis === 'x') expect(v.z).toBe(lane);
  });
});

describe('Die Zeitlupe nach dem Ende zählt nicht für die Punkte', () => {
  for (const end of ['escaped', 'caught'] as const) {
    it(`${end}: Punkte und Restzeit bleiben in der Zeitlupe gleich`, () => {
      const { setup, state } = bareChase();
      for (let i = 0; i < 5 * 60; i++) stepChase(setup, state, IDLE, 1 / 60);
      forceEnd(state, end);
      const score = chaseScore(state);
      const left = timeLeft(state);
      expect(left).toBeCloseTo(TIME_LIMIT - 5, 6);
      // So läuft die Oberfläche nach dem Ende weiter: 2,8 s echte Zeit mit 0,4facher Geschwindigkeit.
      for (let i = 0; i < 2.8 * 60; i++) stepChase(setup, state, GAS, (1 / 60) * 0.4);
      expect(chaseScore(state)).toBe(score);
      expect(timeLeft(state)).toBe(left);
    });
  }
});

describe('Kennzeichen und Herkunft passen zur Stadt', () => {
  it('Adjektiv zur Stadt: Münchner, sonst Stadt + er', () => {
    expect(plateAdjective('München')).toBe('Münchner');
    expect(plateAdjective('Köln')).toBe('Kölner');
    expect(plateAdjective('Hamburg')).toBe('Hamburger');
    const owner = QUESTIONS.find((q) => q.id === 'owner');
    const own = owner?.answers.find((a) => a.claims.owner === 'own');
    if (!owner || !own) throw new Error('Antwort fehlt');
    const ev = {
      hour: 14,
      plateHome: false,
      plateCity: 'München',
      homeCity: 'Köln',
      vehicle: 'kombi',
      visible: 'nichts',
    } as const;
    expect(contradiction(owner, own, ev, {})).toContain('Münchner Kennzeichen');
  });

  it('„Aus Hamburg, gerade angekommen“ passt nicht, wenn die Kontrolle in Hamburg ist', () => {
    const from = QUESTIONS.find((q) => q.id === 'from');
    const arrived = from?.answers.find((a) => a.claims.from === 'fremd');
    if (!from || !arrived) throw new Error('Antwort fehlt');
    const base = { hour: 14, plateHome: false, plateCity: 'Berlin', vehicle: 'kombi', visible: 'nichts' } as const;
    expect(contradiction(from, arrived, { ...base, homeCity: 'Köln' }, {})).toBeNull();
    expect(contradiction(from, arrived, { ...base, homeCity: 'Hamburg' }, {})).not.toBeNull();
  });
});
