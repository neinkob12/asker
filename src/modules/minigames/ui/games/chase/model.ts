// Spiellogik der Verfolgungsjagd (Feedback vom 07.10.2026: ein richtiges Autospiel) als reines Modell: kein DOM,
// keine Karte, testbar mit Vitest.
//
// Du sitzt in einer fetten Karre und fährst auf einer dreispurigen Stadtstraße (Blick von hinten, pseudo-3D). Du
// wechselst die Spur (links/rechts), gibst Gas, bremst, zündest den Turbo. Verkehr muss umfahren werden, Streifen mit
// Blaulicht hängen hinter dir, holen auf, rammen dich und schieben dich quer. Ab und zu steht eine Straßensperre:
// Nur eine Spur ist frei. Ziel: der Balken „Abhängen“. Er füllt sich, solange die nächste Streife weit hinter dir
// liegt, und leert sich, wenn sie dir im Nacken sitzt. Voll: Du biegst in eine Tiefgarage ab, entkommen. Gefasst, wenn
// die Karre kaputt ist (Schaden 1), eine Streife dich länger bei langsamer Fahrt stellt oder die Zeit abläuft.
// Ware aus dem Fenster (einmal): Turbo voll, die Streifen zögern, die Ware ist weg.
//
// Die Straße (Kurven, Kulisse), der Verkehr und die Streifen kommen fest aus dem Seed (createRng). Die Zeit kommt
// von außen (dt in echten Sekunden), deshalb hängt der Verlauf von der Bildrate ab: Nur der Score geht an den Kern.

import { createRng } from '../../../../../core';

// ---------------------------------------------------------------------------------------------- Stellschrauben

/** Zeit, bis die Verstärkung da ist (Sekunden). */
export const TIME_LIMIT = 90;
export const LANES = 3;
/** Breite einer Spur in Metern; die Straße hat dazu einen schmalen Streifen am Rand. */
export const LANE_WIDTH = 3.5;
export const ROAD_HALF = (LANES * LANE_WIDTH) / 2 + 0.7;
/** Länge eines Straßenstücks in Metern (Kurven und Kulisse hängen daran). */
export const SEGMENT = 10;
/** Straßenstücke insgesamt; danach geht es von vorn (bei 90 s reichen sie dreimal). */
export const SEGMENTS = 1200;
/** Höchsttempo mit Vollgas (m/s), ohne Gas rollt der Wagen mit dem Anteil CRUISE. */
export const TOP_SPEED = 56;
export const CRUISE = 0.8;
export const TURBO_FACTOR = 1.28;
export const TURBO_SECONDS = 2.8;
export const TURBO_RECHARGE = 10;
/** Abhängen: Abstand der nächsten Streife, ab dem der Balken fällt bzw. steigt (Meter). */
export const SHAKE_NEAR = 28;
export const SHAKE_FAR = 45;
/** Füllrate pro Sekunde bei vollem Vorsprung (SHAKE_FAR + SHAKE_LEAD Meter), Leeren pro Sekunde dicht dran. */
export const SHAKE_RATE = 0.22;
export const SHAKE_LEAD = 110;
export const SHAKE_DRAIN = 0.14;
/** Gestellt: Streife näher als CATCH_GAP, du langsamer als CATCH_SPEED, und das länger als CATCH_SECONDS. */
export const CATCH_GAP = 7;
export const CATCH_SPEED = 9;
export const CATCH_SECONDS = 3;
/** Ware aus dem Fenster: so lange zögern die Streifen (Sekunden). */
export const DUMP_HESITATE = 3.5;
/** Schaden: Rammen, Auffahren (nach Differenztempo), Sperre. Bei 1 ist die Karre hin. */
export const RAM_DAMAGE = 0.06;
export const BLOCK_DAMAGE = 0.3;
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 1.9;
/** Verkehr: so viele Wagen im Fenster vor dir (wenig bis viel), Fenster in Metern. */
export const TRAFFIC = { min: 5, max: 10, window: 420, behind: 60 };
/** Straßensperren: ab wann, Abstand dazwischen (leicht bis schwer), so weit vor dir stehen sie. */
export const BLOCK_FIRST = 16;
export const BLOCK_EVERY = { easy: 30, hard: 19 };
export const BLOCK_AHEAD = 280;

const ACCEL = 9;
const TURBO_ACCEL = 15;
const BRAKE = 20;
const COAST = 3;
/** Spurwechsel: Feder zur Spur (pro Sekunde), Tempo seitlich höchstens (m/s), und wie stark Kurven nach außen ziehen. */
const STEER_SPRING = 6;
const STEER_SPEED = 7;
const CURVE_PULL = 110;
/** Rutschen nach Zusammenstößen: so lange kein Gas (Sekunden). */
const SKID_SECONDS = 0.7;
/** Streifen: Tempo relativ zum Höchsttempo (leicht bis schwer), Gummiband weit hinten, Rammen. */
const COP_SPEED = { easy: 0.9, hard: 1.03 };
const COP_RUBBER_GAP = 140;
const COP_RUBBER = 1.14;
const RAM_COOLDOWN = 2.2;
const RAM_PUSH = 1.4;

// ---------------------------------------------------------------------------------------------- Typen

export type SceneryKind = 'house' | 'tower' | 'lamp' | 'tree' | 'sign' | 'bridge' | 'kiosk';

/** Kulisse an einem Straßenstück: Seite (−1 links, 1 rechts), Größe und Variante (Farbe, Form) aus dem Seed. */
export interface Scenery {
  kind: SceneryKind;
  side: -1 | 1;
  /** Abstand vom Straßenrand in Metern. */
  offset: number;
  size: number;
  variant: number;
}

export interface RoadSegment {
  /** Krümmung: Versatz pro Stück (negativ links). */
  curve: number;
  scenery: Scenery[];
  /** Laterne bzw. Brückenbogen (für Licht und Schatten). */
  lit: boolean;
}

export type TrafficKind = 'car' | 'van' | 'truck';

export interface Vehicle {
  id: number;
  kind: TrafficKind;
  lane: number;
  /** Seitliche Lage in Metern (Spurmitte), bewegt sich beim Ausweichen. */
  x: number;
  /** Lage auf der Straße in Metern. */
  z: number;
  v: number;
  color: number;
  /** Nach einem Zusammenstoß: so lange angeschoben (Sekunden). */
  pushed: number;
  /** Bremst gerade (Rücklichter). */
  braking: boolean;
}

export type CopState = 'chase' | 'hesitate' | 'wrecked';

export interface Cop {
  id: number;
  lane: number;
  x: number;
  z: number;
  v: number;
  state: CopState;
  /** Erscheint erst ab dieser Zeit (Sekunden). */
  spawnAt: number;
  active: boolean;
  ramCooldown: number;
  hesitateUntil: number;
  /** Nach einem Crash: Restzeit, bis der Wagen aus dem Spiel ist. */
  wreckT: number;
}

export interface Roadblock {
  id: number;
  z: number;
  /** Diese Spur ist frei. */
  gap: number;
  /** Schon passiert oder getroffen. */
  passed: boolean;
  hit: boolean;
}

export interface Player {
  /** Seitliche Lage in Metern (0 = Mitte der Straße). */
  x: number;
  /** Gewählte Spur (0 links bis LANES−1 rechts). */
  lane: number;
  /** Lage auf der Straße in Metern (gefahren). */
  z: number;
  v: number;
  /** Seitliches Tempo (für Neigung der Karre). */
  vx: number;
  turbo: number;
  turboOn: boolean;
  turboLeft: number;
  damage: number;
  skid: number;
  braking: boolean;
}

export type ChaseEventKind =
  | 'steer'
  | 'bump'
  | 'crash'
  | 'ram'
  | 'sideswipe'
  | 'block'
  | 'blockPassed'
  | 'blockHit'
  | 'turbo'
  | 'dump'
  | 'cop'
  | 'copCrash'
  | 'near'
  | 'clear'
  | 'escaped'
  | 'caught';

export interface ChaseEvent {
  kind: ChaseEventKind;
  /** Stärke 0–1 (z.B. wie hart der Aufprall). */
  power: number;
  /** Seitliche Lage (Meter), wo es passiert ist (Funken). */
  x: number;
  /** Abstand vor dir (Meter; negativ hinter dir). */
  ahead: number;
}

export type ChaseEnd = 'escaped' | 'caught' | 'time';

export interface ChaseInput {
  gas: boolean;
  brake: boolean;
  turbo: boolean;
}

export interface ChaseOptions {
  seed: number;
  difficulty: number;
  /** Polizei-Uhr der Konfrontation (Runden, typisch 3 bis 5): weniger = mehr Streifen. */
  clock?: number;
  /** Am Handy: etwas weniger Verkehr. */
  mobile?: boolean;
}

export interface ChaseSetup {
  seed: number;
  difficulty: number;
  road: RoadSegment[];
  cops: number;
  copFactor: number;
  traffic: number;
  blockEvery: number;
}

export interface ChaseState {
  t: number;
  player: Player;
  traffic: Vehicle[];
  cops: Cop[];
  blocks: Roadblock[];
  /** Abhängen 0–1. */
  shake: number;
  /** Abstand zur nächsten aktiven Streife hinter dir (Meter, Infinity ohne). */
  nearest: number;
  /** Sitzt dir eine Streife im Nacken (unter SHAKE_NEAR)? */
  near: boolean;
  /** Wie lange schon gestellt (für „gefasst“). */
  contact: number;
  dumped: boolean;
  hesitateUntil: number;
  nextBlockAt: number;
  end: ChaseEnd | null;
  endAt: number;
  /** Ereignisse dieses Schritts (für Ton und Effekte), werden bei jedem Schritt geleert. */
  events: ChaseEvent[];
  nextId: number;
  random: () => number;
}

// ---------------------------------------------------------------------------------------------- Hilfen

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mitte einer Spur in Metern. */
export function laneX(lane: number): number {
  return (lane - (LANES - 1) / 2) * LANE_WIDTH;
}

/** Spur zu einer seitlichen Lage. */
export function laneOf(x: number): number {
  return clamp(Math.round(x / LANE_WIDTH + (LANES - 1) / 2), 0, LANES - 1);
}

const KINDS: Record<TrafficKind, { length: number; width: number; speed: [number, number] }> = {
  car: { length: 4.4, width: 1.85, speed: [0.36, 0.52] },
  van: { length: 5.2, width: 2.0, speed: [0.34, 0.46] },
  truck: { length: 9, width: 2.5, speed: [0.3, 0.38] },
};

export function vehicleSize(kind: TrafficKind): { length: number; width: number } {
  return KINDS[kind];
}

/** Straßenstück an einer Lage. */
export function segmentIndex(z: number): number {
  return ((Math.floor(z / SEGMENT) % SEGMENTS) + SEGMENTS) % SEGMENTS;
}

export function segmentAt(setup: ChaseSetup, z: number): RoadSegment {
  return setup.road[segmentIndex(z)];
}

// ---------------------------------------------------------------------------------------------- Aufbau

type Stretch = { kind: 'straight' | 'curve' | 's'; length: number; curve: number };

/** Straße aus dem Seed: Geraden, Kurven und S-Kurven mit weichem Ein- und Auslauf. */
function buildRoad(random: () => number): RoadSegment[] {
  const road: RoadSegment[] = [];
  const push = (curve: number) => road.push({ curve, scenery: [], lit: false });
  const ease = (a: number, b: number, t: number) => a + ((b - a) * (1 - Math.cos(t * Math.PI))) / 2;
  const stretch = (s: Stretch) => {
    const n = s.length;
    const lead = Math.max(4, Math.floor(n * 0.3));
    for (let i = 0; i < n; i++) {
      if (s.kind === 'straight') push(0);
      else if (s.kind === 'curve') {
        const t = i < lead ? i / lead : i >= n - lead ? (n - i) / lead : 1;
        push(ease(0, s.curve, t));
      } else {
        // S-Kurve: erst in die eine, dann in die andere Richtung.
        const t = (i / n) * Math.PI * 2;
        push(Math.sin(t) * s.curve);
      }
    }
  };
  // Anfang: eine Gerade, damit man sich sortieren kann.
  stretch({ kind: 'straight', length: 30, curve: 0 });
  while (road.length < SEGMENTS) {
    const r = random();
    const dir = random() < 0.5 ? -1 : 1;
    if (r < 0.32) stretch({ kind: 'straight', length: 18 + Math.floor(random() * 30), curve: 0 });
    else if (r < 0.8) {
      const strength = lerp(0.012, 0.034, random());
      stretch({ kind: 'curve', length: 28 + Math.floor(random() * 34), curve: strength * dir });
    } else stretch({ kind: 's', length: 50 + Math.floor(random() * 30), curve: lerp(0.014, 0.026, random()) * dir });
  }
  road.length = SEGMENTS;
  // Kulisse: Häuserzeilen, Laternen, Bäume, Schilder, Büdchen, ab und zu eine Brücke.
  let i = 0;
  while (i < SEGMENTS) {
    const block = 40 + Math.floor(random() * 40);
    const style = random();
    for (let k = 0; k < block && i + k < SEGMENTS; k++) {
      const seg = road[i + k];
      if (k % 6 === 0) {
        seg.lit = true;
        seg.scenery.push({ kind: 'lamp', side: k % 12 === 0 ? -1 : 1, offset: 1.4, size: 1, variant: 0 });
      }
      for (const side of [-1, 1] as const) {
        if (style < 0.55) {
          // Gründerzeit und Nachkrieg: dichte Häuserzeile, alle drei Stücke ein Haus.
          if (k % 3 === 1) {
            seg.scenery.push({
              kind: random() < 0.12 ? 'tower' : 'house',
              side,
              offset: 3.2 + random() * 2,
              size: 0.8 + random() * 0.6,
              variant: Math.floor(random() * 6),
            });
          }
          if (k % 9 === 5 && random() < 0.35) {
            seg.scenery.push({ kind: 'kiosk', side, offset: 2, size: 1, variant: Math.floor(random() * 3) });
          }
        } else if (style < 0.85) {
          // Ring und Rheinufer: Bäume, dazwischen Schilder.
          if (k % 4 === 2) {
            seg.scenery.push({
              kind: 'tree',
              side,
              offset: 2.2 + random() * 1.5,
              size: 0.8 + random() * 0.5,
              variant: Math.floor(random() * 3),
            });
          }
          if (k % 14 === 7 && random() < 0.5) {
            seg.scenery.push({ kind: 'sign', side, offset: 2.6, size: 1, variant: Math.floor(random() * 4) });
          }
        } else if (k % 5 === 0) {
          // Brücke: Bögen links und rechts.
          seg.scenery.push({ kind: 'bridge', side, offset: 0.6, size: 1, variant: 0 });
        }
      }
    }
    i += block;
  }
  return road;
}

/** Feste Inhalte aus Seed und Schwierigkeit. */
export function createChase(options: ChaseOptions): ChaseSetup {
  const random = createRng(options.seed);
  const difficulty = clamp(Number.isFinite(options.difficulty) ? options.difficulty : 0.5, 0, 1);
  const clock = clamp(Number.isFinite(options.clock) ? Number(options.clock) : 4, 2, 6);
  const road = buildRoad(random);
  return {
    seed: options.seed,
    difficulty,
    road,
    cops: clamp(2 + Math.round(difficulty * 2) + (clock <= 3 ? 1 : 0), 2, 4),
    copFactor: lerp(COP_SPEED.easy, COP_SPEED.hard, difficulty),
    traffic: Math.round(lerp(TRAFFIC.min, TRAFFIC.max, difficulty) * (options.mobile ? 0.8 : 1)),
    blockEvery: lerp(BLOCK_EVERY.easy, BLOCK_EVERY.hard, difficulty),
  };
}

function makeCop(state: ChaseState, lane: number, behind: number, spawnAt: number): Cop {
  return {
    id: state.nextId++,
    lane,
    x: laneX(lane),
    z: -behind,
    v: 0,
    state: 'chase',
    spawnAt,
    active: false,
    // Schonfrist am Anfang: Die erste Streife rammt nicht, bevor man das Lenkrad in der Hand hat.
    ramCooldown: spawnAt === 0 ? 3 : 0,
    hesitateUntil: 0,
    wreckT: 0,
  };
}

export function initChase(setup: ChaseSetup): ChaseState {
  const random = createRng(setup.seed ^ 0x5bd1e995);
  const state: ChaseState = {
    t: 0,
    player: {
      x: laneX(1),
      lane: 1,
      z: 0,
      v: TOP_SPEED * 0.45,
      vx: 0,
      turbo: 1,
      turboOn: false,
      turboLeft: 0,
      damage: 0,
      skid: 0,
      braking: false,
    },
    traffic: [],
    cops: [],
    blocks: [],
    shake: 0,
    nearest: 18,
    near: true,
    contact: 0,
    dumped: false,
    hesitateUntil: 0,
    nextBlockAt: setup.difficulty >= 0.3 ? BLOCK_FIRST : Infinity,
    end: null,
    endAt: -1,
    events: [],
    nextId: 1,
    random,
  };
  // Die erste Streife sitzt dir im Nacken, die anderen kommen nach und nach.
  const spawnAt = [0, 5, 11, 18];
  const behind = [18, 50, 80, 110];
  for (let i = 0; i < setup.cops; i++) {
    state.cops.push(makeCop(state, i % 2 === 0 ? 1 : i % 4 === 1 ? 0 : 2, behind[i], spawnAt[i]));
  }
  // Verkehr voraus; die ersten 200 m deiner Spur bleiben frei, damit du dich sortieren kannst.
  for (let i = 0; i < setup.traffic; i++) {
    const v = spawnTraffic(state, 70 + (i / setup.traffic) * TRAFFIC.window);
    if (v && v.lane === 1 && v.z < 220) {
      v.lane = state.random() < 0.5 ? 0 : 2;
      v.x = laneX(v.lane);
    }
  }
  return state;
}

// ---------------------------------------------------------------------------------------------- Verkehr

function trafficAt(state: ChaseState, lane: number, z: number, span: number): Vehicle | undefined {
  return state.traffic.find((v) => v.lane === lane && Math.abs(v.z - z) < span);
}

/** Ein Wagen voraus an einer freien Stelle; es bleibt immer mindestens eine Spur frei. */
function spawnTraffic(state: ChaseState, ahead: number): Vehicle | null {
  const random = state.random;
  const z = state.player.z + ahead;
  if (state.blocks.some((b) => Math.abs(b.z - z) < 45)) return null;
  const r = random();
  const kind: TrafficKind = r < 0.68 ? 'car' : r < 0.9 ? 'van' : 'truck';
  const free = [];
  for (let lane = 0; lane < LANES; lane++) if (!trafficAt(state, lane, z, 28)) free.push(lane);
  // Mindestens eine Spur bleibt in jedem Abschnitt frei.
  if (free.length <= 1) return null;
  const lane = free[Math.floor(random() * free.length)];
  const [lo, hi] = KINDS[kind].speed;
  const vehicle: Vehicle = {
    id: state.nextId++,
    kind,
    lane,
    x: laneX(lane),
    z,
    v: TOP_SPEED * lerp(lo, hi, random()),
    color: Math.floor(random() * 5),
    pushed: 0,
    braking: false,
  };
  state.traffic.push(vehicle);
  return vehicle;
}

function stepTraffic(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  for (const v of state.traffic) {
    // Wer angeschoben wurde, rollt kurz schneller, dann wieder im eigenen Takt.
    if (v.pushed > 0) {
      v.pushed -= dt;
      v.z += (v.v + 6) * dt;
    } else v.z += v.v * dt;
    // Langsamere voraus in derselben Spur: dranbleiben.
    const front = state.traffic.find((o) => o !== v && o.lane === v.lane && o.z > v.z && o.z - v.z < 14);
    v.braking = !!front && front.v < v.v;
    if (front && front.z - v.z < 9) v.z = front.z - 9;
    v.x += (laneX(v.lane) - v.x) * Math.min(1, 4 * dt);
  }
  // Was hinter dir ist, kommt vorne neu.
  state.traffic = state.traffic.filter((v) => v.z > p.z - TRAFFIC.behind);
  let tries = 0;
  while (state.traffic.length < setup.traffic && tries < 6) {
    tries++;
    spawnTraffic(state, TRAFFIC.window * (0.55 + 0.45 * state.random()));
  }
}

/** Überlappen zwei Wagen (Länge und Breite)? */
function overlaps(ax: number, az: number, aw: number, al: number, bx: number, bz: number, bw: number, bl: number) {
  return Math.abs(az - bz) < (al + bl) / 2 && Math.abs(ax - bx) < (aw + bw) / 2;
}

function emit(state: ChaseState, kind: ChaseEventKind, power: number, x = state.player.x, ahead = 0): void {
  state.events.push({ kind, power: clamp(power, 0, 1), x, ahead });
}

function addDamage(state: ChaseState, amount: number): void {
  state.player.damage = clamp(state.player.damage + amount, 0, 1);
}

/** Zusammenstöße mit dem Verkehr: auffahren (bremst, Schaden nach Differenztempo) oder seitlich streifen. */
function collideTraffic(state: ChaseState): void {
  const p = state.player;
  for (const v of state.traffic) {
    const size = KINDS[v.kind];
    if (!overlaps(p.x, p.z, CAR_WIDTH, CAR_LENGTH, v.x, v.z, size.width, size.length)) continue;
    const dz = v.z - p.z;
    const dx = v.x - p.x;
    const sideways = Math.abs(dz) < (CAR_LENGTH + size.length) / 2 - 1.2;
    if (sideways && Math.abs(dx) > 0.4) {
      // Seitlich gestreift: zurück in die alte Spur, etwas Tempo weg.
      const away = dx > 0 ? -1 : 1;
      p.x = v.x + away * ((CAR_WIDTH + size.width) / 2 + 0.05);
      p.lane = laneOf(p.x);
      p.vx = away * 2.5;
      p.v = Math.max(v.v - 2, p.v - 4);
      addDamage(state, 0.03);
      emit(state, 'sideswipe', 0.4, p.x + dx / 2, dz);
      continue;
    }
    if (dz <= 0) continue;
    const closing = p.v - v.v;
    if (closing > 10) {
      // Aufgefahren: hart. Der andere wird angeschoben, du hängst dahinter und rutschst.
      p.v = Math.max(4, v.v - 3);
      p.z = v.z - (CAR_LENGTH + size.length) / 2;
      p.skid = SKID_SECONDS;
      v.pushed = 1;
      v.z += 1.5;
      addDamage(state, Math.min(0.25, 0.05 + closing / 200));
      emit(state, 'crash', clamp(closing / 40, 0.3, 1), v.x, dz);
    } else {
      // Aufgerollt: du hängst hinter ihm.
      p.v = Math.max(3, v.v - 1.5);
      p.z = v.z - (CAR_LENGTH + size.length) / 2;
      addDamage(state, 0.015);
      emit(state, 'bump', 0.3, v.x, dz);
    }
  }
}

// ---------------------------------------------------------------------------------------------- Streifen

function activeCops(state: ChaseState): Cop[] {
  return state.cops.filter((c) => c.active && c.state !== 'wrecked');
}

/** Freie Spur für eine Streife: am liebsten deine, sonst die nächste ohne Verkehr dicht voraus. */
function copLane(state: ChaseState, cop: Cop): number {
  const p = state.player;
  const blocked = (lane: number) =>
    state.traffic.some((v) => v.lane === lane && v.z > cop.z - 2 && v.z - cop.z < 30 && v.v < cop.v - 2) ||
    state.blocks.some((b) => b.gap !== lane && !b.passed && b.z > cop.z && b.z - cop.z < 60);
  const wanted = p.lane;
  if (!blocked(wanted)) return wanted;
  const order = [cop.lane, wanted - 1, wanted + 1, 0, LANES - 1].filter((l) => l >= 0 && l < LANES);
  return order.find((l) => !blocked(l)) ?? cop.lane;
}

function stepCops(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  const hesitate = state.t < state.hesitateUntil;
  for (const cop of state.cops) {
    if (!cop.active) {
      if (state.t >= cop.spawnAt) {
        cop.active = true;
        cop.v = Math.max(p.v, TOP_SPEED * 0.6);
        emit(state, 'cop', 0.5, cop.x, cop.z - p.z);
      }
      continue;
    }
    if (cop.state === 'wrecked') {
      cop.wreckT -= dt;
      cop.v = Math.max(0, cop.v - 25 * dt);
      cop.z += cop.v * dt;
      continue;
    }
    cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
    const gap = p.z - cop.z;
    const slowed = hesitate || state.t < cop.hesitateUntil;
    // Tempo: etwas langsamer als du mit Vollgas, weit hinten mit Gummiband, nach der Ware aus dem Fenster zögernd.
    let target = TOP_SPEED * setup.copFactor;
    if (gap > COP_RUBBER_GAP) target *= COP_RUBBER;
    if (slowed) target *= 0.72;
    if (gap < -1.5) {
      // Vor dir: Sie bremst dich aus und zieht in deine Spur (Blockieren), bis du vorbei bist.
      target = Math.max(6, p.v * 0.8);
    } else if (gap < 40) {
      // Aufschließen mit Maß: je näher, desto kleiner der Tempounterschied (sonst schießt sie vorbei). Dicht hinter dir
      // in deiner Spur rammt sie; daneben bleibt sie auf gleicher Höhe und drückt dich zur Seite.
      const sameLane = Math.abs(cop.x - p.x) < CAR_WIDTH;
      const approach = p.v + Math.max(sameLane ? 1.5 : gap < 2.5 ? 0 : 0.6, gap * 0.8);
      target = Math.min(target, approach);
    }
    cop.v += clamp(target - cop.v, -14 * dt, 7 * dt);
    // Spur wählen und wechseln; dabei kann es krachen.
    const lane = copLane(state, cop);
    if (lane !== cop.lane) {
      cop.lane = lane;
      if (setup.difficulty < 0.85 && state.random() < 0.06 + 0.1 * (1 - setup.difficulty)) {
        // Zu eng: Die Streife setzt den Wagen in den Verkehr.
        cop.state = 'wrecked';
        cop.wreckT = 4;
        emit(state, 'copCrash', 0.8, cop.x, cop.z - p.z);
        continue;
      }
    }
    cop.x += clamp(laneX(cop.lane) - cop.x, -STEER_SPEED * dt, STEER_SPEED * dt);
    // Verkehr voraus in der eigenen Spur bremst die Streife.
    const front = state.traffic.find((v) => v.lane === cop.lane && v.z > cop.z && v.z - cop.z < 8);
    if (front && front.z - cop.z < 7) {
      cop.v = Math.min(cop.v, front.v);
      cop.z = Math.min(cop.z, front.z - 7);
    }
    // Sperren bremsen auch die Streifen (sie müssen durch die Lücke).
    const block = state.blocks.find((b) => b.z > cop.z && b.z - cop.z < 12);
    if (block && cop.lane !== block.gap) cop.v = Math.min(cop.v, TOP_SPEED * 0.4);
    cop.z += cop.v * dt;
    const dz = cop.z - p.z;
    const dx = cop.x - p.x;
    if (cop.ramCooldown <= 0 && dz > -CAR_LENGTH - 0.6 && dz < 0.5 && Math.abs(dx) < CAR_WIDTH * 0.9) {
      // Rammen: dicht hinter dir in deiner Spur.
      cop.ramCooldown = RAM_COOLDOWN;
      cop.v = Math.max(0, cop.v - 9);
      cop.z = p.z - CAR_LENGTH - 0.8;
      const side = dx > 0.15 ? -1 : dx < -0.15 ? 1 : state.random() < 0.5 ? -1 : 1;
      p.vx += side * RAM_PUSH * 2.2;
      p.v = Math.max(5, p.v - 6);
      addDamage(state, RAM_DAMAGE);
      emit(state, 'ram', 0.7, p.x, dz);
    } else if (Math.abs(dz) < CAR_LENGTH * 0.9 && Math.abs(dx) < CAR_WIDTH + 0.15) {
      // Neben dir: Sie drückt dich zur Seite (Blech an Blech).
      const side = dx > 0 ? -1 : 1;
      p.x = cop.x + side * (CAR_WIDTH + 0.15);
      p.vx += side * 1.6 * dt * 10;
      if (cop.ramCooldown <= 0) {
        cop.ramCooldown = 0.8;
        addDamage(state, 0.015);
        emit(state, 'sideswipe', 0.5, p.x - side * CAR_WIDTH * 0.5, dz);
      }
    } else if (dz > -0.5 && dz < CAR_LENGTH + 0.5 && Math.abs(dx) < CAR_WIDTH * 0.95 && cop.v <= p.v + 0.5) {
      // Vor dir in deiner Spur: du hängst hinter der Streife, sie zieht dich runter.
      p.v = Math.max(4, Math.min(p.v, cop.v - 1));
      p.z = Math.min(p.z, cop.z - CAR_LENGTH - 0.2);
    }
  }
  // Zerstörte Streifen verschwinden; bei hoher Schwierigkeit kommt Ersatz.
  for (const cop of state.cops) {
    if (cop.state === 'wrecked' && cop.wreckT <= 0 && cop.active) {
      cop.active = false;
      cop.spawnAt = Infinity;
      if (setup.difficulty >= 0.5 && state.t < TIME_LIMIT - 20) {
        state.cops.push(makeCop(state, state.random() < 0.5 ? 0 : 2, 95, state.t + 6));
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------- Sperren

function stepBlocks(setup: ChaseSetup, state: ChaseState): void {
  const p = state.player;
  if (state.t >= state.nextBlockAt && !state.end) {
    state.nextBlockAt = state.t + setup.blockEvery;
    const gap = Math.floor(state.random() * LANES);
    const z = p.z + BLOCK_AHEAD;
    state.blocks.push({ id: state.nextId++, z, gap, passed: false, hit: false });
    // Verkehr an der Sperre räumt den Platz (der steht sonst mitten in der Lücke).
    state.traffic = state.traffic.filter((v) => Math.abs(v.z - z) > 45);
    emit(state, 'block', 0.5, laneX(gap), BLOCK_AHEAD);
  }
  for (const b of state.blocks) {
    if (b.passed) continue;
    const dz = b.z - p.z;
    if (dz > CAR_LENGTH / 2 + 1) continue;
    b.passed = true;
    const gapX = laneX(b.gap);
    if (Math.abs(p.x - gapX) < LANE_WIDTH / 2 + 0.25) {
      emit(state, 'blockPassed', 0.6, gapX, dz);
      // Die Streifen müssen auch durch die Lücke: Sie verlieren Zeit.
      for (const cop of state.cops) cop.hesitateUntil = Math.max(cop.hesitateUntil, state.t + 1.6);
    } else {
      b.hit = true;
      p.v = Math.min(p.v, 8);
      p.skid = SKID_SECONDS;
      p.x += (p.x < gapX ? -1 : 1) * 0.6;
      addDamage(state, BLOCK_DAMAGE);
      emit(state, 'blockHit', 1, p.x, dz);
    }
  }
  state.blocks = state.blocks.filter((b) => b.z > p.z - 80);
}

// ---------------------------------------------------------------------------------------------- Schritt

/** Spur wechseln (eine nach links oder rechts). true, wenn es eine Spur gab. */
export function steer(state: ChaseState, dir: 'left' | 'right'): boolean {
  const p = state.player;
  if (state.end) return false;
  const lane = clamp(p.lane + (dir === 'left' ? -1 : 1), 0, LANES - 1);
  if (lane === p.lane) return false;
  p.lane = lane;
  emit(state, 'steer', 0.5);
  return true;
}

/** Ware aus dem Fenster: einmal, nur solange es läuft. */
export function dumpGoods(state: ChaseState): boolean {
  if (state.dumped || state.end) return false;
  state.dumped = true;
  state.player.turbo = 1;
  state.hesitateUntil = state.t + DUMP_HESITATE;
  emit(state, 'dump', 1, state.player.x, -2);
  return true;
}

function endChase(state: ChaseState, end: ChaseEnd): void {
  if (state.end) return;
  state.end = end;
  state.endAt = state.t;
  emit(state, end === 'escaped' ? 'escaped' : 'caught', 1);
}

function stepPlayer(state: ChaseState, input: ChaseInput, dt: number): void {
  const p = state.player;
  // Turbo: zünden, läuft TURBO_SECONDS, lädt langsam nach.
  if (input.turbo && !p.turboOn && p.turbo >= 0.999 && !state.end) {
    p.turboOn = true;
    p.turboLeft = TURBO_SECONDS;
    emit(state, 'turbo', 1);
  }
  if (p.turboOn) {
    p.turboLeft -= dt;
    p.turbo = Math.max(0, p.turboLeft / TURBO_SECONDS);
    if (p.turboLeft <= 0) {
      p.turboOn = false;
      p.turbo = 0;
    }
  } else p.turbo = Math.min(1, p.turbo + dt / TURBO_RECHARGE);
  // Tempo.
  const top = TOP_SPEED * (p.turboOn ? TURBO_FACTOR : 1) * (1 - 0.25 * p.damage);
  p.skid = Math.max(0, p.skid - dt);
  p.braking = input.brake && !state.end;
  if (state.end) {
    p.v = Math.max(state.end === 'escaped' ? 12 : 0, p.v - (state.end === 'escaped' ? 10 : 16) * dt);
  } else if (input.brake) p.v = Math.max(0, p.v - BRAKE * dt);
  else if (p.skid > 0) p.v = Math.max(0, p.v - COAST * dt);
  else if (input.gas || p.turboOn) p.v = Math.min(top, p.v + (p.turboOn ? TURBO_ACCEL : ACCEL) * dt);
  else if (p.v < top * CRUISE) p.v = Math.min(top * CRUISE, p.v + ACCEL * 0.6 * dt);
  else p.v = Math.max(top * CRUISE, p.v - COAST * dt);
  p.z += p.v * dt;
  // Seitlich: zur gewählten Spur, Kurven ziehen nach außen, Stöße (vx) klingen ab.
  // Feder zur Spur mit Höchsttempo seitlich: schnell los, weich ankommen. Der Kurvenzug (curvePull) drückt dagegen.
  const target = state.end === 'escaped' ? ROAD_HALF - 1.2 : laneX(p.lane);
  const toTarget = clamp((target - p.x) * STEER_SPRING, -STEER_SPEED, STEER_SPEED) * dt;
  p.x += toTarget + p.vx * dt;
  p.vx *= Math.max(0, 1 - 6 * dt);
  p.x = clamp(p.x, -ROAD_HALF + CAR_WIDTH / 2, ROAD_HALF - CAR_WIDTH / 2);
}

/** Kurven ziehen bei hohem Tempo nach außen: Wer die Spur hält, muss gegenhalten (die Spur selbst bleibt gewählt). */
function curvePull(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  const curve = segmentAt(setup, p.z + 20).curve;
  const pull = curve * (p.v / TOP_SPEED) ** 2 * CURVE_PULL * dt;
  p.x = clamp(p.x + pull, -ROAD_HALF + CAR_WIDTH / 2, ROAD_HALF - CAR_WIDTH / 2);
}

function stepShake(state: ChaseState, dt: number): void {
  const p = state.player;
  const cops = activeCops(state);
  let nearest = Infinity;
  for (const cop of cops) nearest = Math.min(nearest, Math.max(0, p.z - cop.z));
  state.nearest = nearest;
  const near = nearest < SHAKE_NEAR;
  if (near !== state.near) {
    state.near = near;
    emit(state, near ? 'near' : 'clear', 0.5);
  }
  let rate: number;
  if (nearest === Infinity) rate = SHAKE_RATE;
  else if (nearest >= SHAKE_FAR) rate = SHAKE_RATE * clamp((nearest - SHAKE_FAR) / SHAKE_LEAD, 0.15, 1);
  else if (nearest < SHAKE_NEAR) rate = -SHAKE_DRAIN;
  else rate = 0;
  state.shake = clamp(state.shake + rate * dt, 0, 1);
  // Gestellt: dicht dran und du bist langsam.
  if (nearest < CATCH_GAP && p.v < CATCH_SPEED) state.contact += dt;
  else state.contact = Math.max(0, state.contact - dt * 2);
}

/** Ein Schritt in echten Sekunden. Nach dem Ende laufen die Wagen noch aus (Zeitlupe in der Oberfläche). */
export function stepChase(setup: ChaseSetup, state: ChaseState, input: ChaseInput, dt: number): void {
  state.events.length = 0;
  state.t += dt;
  stepPlayer(state, state.end ? { gas: false, brake: false, turbo: false } : input, dt);
  if (!state.end) curvePull(setup, state, dt);
  stepTraffic(setup, state, dt);
  stepBlocks(setup, state);
  if (!state.end) collideTraffic(state);
  stepCops(setup, state, dt);
  if (state.end) return;
  stepShake(state, dt);
  if (state.player.damage >= 1) endChase(state, 'caught');
  else if (state.contact >= CATCH_SECONDS) endChase(state, 'caught');
  else if (state.shake >= 1) endChase(state, 'escaped');
  else if (state.t >= TIME_LIMIT) endChase(state, 'time');
}

// ---------------------------------------------------------------------------------------------- Ergebnis

export function timeLeft(state: ChaseState): number {
  return Math.max(0, TIME_LIMIT - state.t);
}

export function escaped(state: ChaseState): boolean {
  return state.end === 'escaped';
}

/** Score: entkommen 0,6 + 0,4 · übrige Zeit; gefasst 0,05 bis 0,4 nach überstandener Zeit. */
export function chaseScore(state: ChaseState): number {
  const left = timeLeft(state) / TIME_LIMIT;
  if (state.end === 'escaped') return Math.round((0.6 + 0.4 * left) * 1000) / 1000;
  const survived = clamp(Math.min(state.t, TIME_LIMIT) / TIME_LIMIT, 0, 1);
  return Math.round((0.05 + 0.35 * survived) * 1000) / 1000;
}

/** picks für den Kern: 'dumped' (Ware weg), 'hideout' (in der Tiefgarage entkommen), 'time' (Zeit abgelaufen). */
export function chasePicks(state: ChaseState): string[] {
  const picks: string[] = [];
  if (state.dumped) picks.push('dumped');
  if (state.end === 'escaped') picks.push('hideout');
  if (state.end === 'time') picks.push('time');
  return picks;
}

/** Für Screenshots und Playwright: sofort beenden. */
export function forceEnd(state: ChaseState, end: ChaseEnd): void {
  endChase(state, end);
}
