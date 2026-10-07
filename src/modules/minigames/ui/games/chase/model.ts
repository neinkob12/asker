// Spiellogik der Verfolgungsjagd (Auftrag 47: freies Lenken im Straßennetz) als reines Modell: kein DOM, keine
// Grafik, testbar mit Vitest.
//
// Die Stadt ist ein Raster aus GRID × GRID Blöcken (Abstand PITCH Meter, Straßen ROAD_W breit) mit Gebäuden, Parks
// und einem Fluss mit Brücken, alles fest aus dem Seed. Du fährst frei: lenken (stufenlos), Gas, Bremse, Turbo, mit
// Drift (die Fahrtrichtung folgt der Nase mit Verzug). Gebäude und Wasser sind hart: Aufprall kostet Tempo und
// Schaden. Verkehr fährt rechts auf den Straßen und biegt an Kreuzungen ab. Streifen suchen ihren Weg über das Raster
// (an jeder Kreuzung die Ausfahrt, die den Abstand zu dir verkleinert) und gehen auf derselben Straße direkt auf dich
// los: aufschließen, rammen. Sperren stehen an Kreuzungen vor dir mit einer Lücke. Der Balken „Abhängen“ füllt sich,
// solange die nächste Streife weit weg ist, und leert sich, wenn sie dir im Nacken sitzt. Voll: Die nächste Tiefgarage
// leuchtet auf (hideout); rein = entkommen. Gefasst, wenn die Karre kaputt ist (Schaden 1), eine Streife dich länger
// bei langsamer Fahrt stellt oder die Zeit abläuft. Ware aus dem Fenster (einmal): Turbo voll, die Streifen zögern.
//
// Koordinaten: x nach Osten, z nach Süden (wie three.js von oben, y ist oben). Richtung heading: 0 = nach Norden
// (−z), wächst im Uhrzeigersinn; vorwärts = (sin h, −cos h). Die Zeit kommt von außen (dt in echten Sekunden): Nur der
// Score geht an den Kern.

import { createRng } from '../../../../../core';

// ---------------------------------------------------------------------------------------------- Stellschrauben

/** Zeit, bis die Verstärkung da ist (Sekunden). */
export const TIME_LIMIT = 100;
/** Blöcke je Seite, Abstand der Straßenmitten, Breite der Fahrbahn, Gehweg je Seite (Meter). */
export const GRID = 12;
export const PITCH = 72;
export const ROAD_W = 12;
export const SIDEWALK = 2.5;
/** Fahrspur: so weit rechts von der Straßenmitte fährt der Verkehr. */
export const LANE_OFF = 3;
/** Höchsttempo mit Vollgas (m/s), Turbo darüber. */
export const TOP_SPEED = 50;
export const TURBO_FACTOR = 1.28;
export const TURBO_SECONDS = 2.8;
export const TURBO_RECHARGE = 10;
/** Rückwärts höchstens so schnell (m/s). */
export const REVERSE_SPEED = 6;
/** Lenken: größte Gierrate (rad/s) und ab welchem Tempo sie voll da ist. */
export const YAW_MAX = 2.1;
export const YAW_FULL_AT = 16;
/** Abhängen: Abstand der nächsten Streife, ab dem der Balken fällt bzw. steigt (Meter). */
export const SHAKE_NEAR = 34;
export const SHAKE_FAR = 66;
export const SHAKE_RATE = 0.15;
export const SHAKE_LEAD = 120;
export const SHAKE_DRAIN = 0.16;
/** Tiefgarage: so weit vor dir (Meter) und so nah muss man ran; verschwindet, fällt der Balken darunter. */
export const HIDEOUT_MIN = 50;
export const HIDEOUT_MAX = 150;
export const HIDEOUT_RADIUS = 7;
export const HIDEOUT_LOST = 0.45;
/** Gestellt: Streife näher als CATCH_GAP, du langsamer als CATCH_SPEED, und das länger als CATCH_SECONDS. */
export const CATCH_GAP = 7;
export const CATCH_SPEED = 8;
export const CATCH_SECONDS = 3;
/** Ware aus dem Fenster: so lange zögern die Streifen (Sekunden). */
export const DUMP_HESITATE = 3.5;
/** Schaden: Rammen, Sperre; Aufprall nach Geschwindigkeit (ab IMPACT_FREE m/s, voll bei IMPACT_FULL). */
export const RAM_DAMAGE = 0.07;
export const BLOCK_DAMAGE = 0.3;
export const IMPACT_FREE = 5;
export const IMPACT_FULL = 42;
export const IMPACT_MAX_DAMAGE = 0.4;
/** Halber Durchmesser der Wagen für Zusammenstöße (Meter). */
export const CAR_RADIUS = 1.35;
export const TRUCK_RADIUS = 2.4;
/** Verkehr: so viele Wagen um dich herum (wenig bis viel), in diesem Umkreis (Meter). */
export const TRAFFIC = { min: 10, max: 18, radius: 230, respawn: 300 };
/** Straßensperren: ab wann, Abstand dazwischen (leicht bis schwer, Sekunden), Lebensdauer. */
export const BLOCK_FIRST = 14;
export const BLOCK_EVERY = { easy: 26, hard: 17 };
export const BLOCK_LIFETIME = 25;
export const BLOCK_AHEAD = { min: 70, max: 160 };

const ACCEL = 10;
const TURBO_ACCEL = 16;
const BRAKE = 24;
const COAST = 3;
/** Griff: wie schnell die Fahrtrichtung der Nase folgt (pro Sekunde), bei Bremsen und Lenken weniger (Drift). */
const GRIP = 5.5;
const GRIP_DRIFT = 2.2;
/** Lenkeingabe glätten (pro Sekunde). */
const STEER_SMOOTH = 9;
/** Rutschen nach Zusammenstößen: so lange kein Gas (Sekunden). */
const SKID_SECONDS = 0.6;
/** Streifen: Tempo relativ zum Höchsttempo (leicht bis schwer), Gummiband weit hinten, Rammen. */
const COP_SPEED = { easy: 0.86, hard: 1.0 };
const COP_RUBBER_GAP = 160;
const COP_RUBBER = 1.2;
const COP_YAW = 2.4;
const COP_SIGHT = 90;
const RAM_COOLDOWN = 2.2;
const RAM_PUSH = 5;
const COP_WRECK_SECONDS = 12;
/** Verkehr: Tempo (m/s). */
const TRAFFIC_SPEED: Record<TrafficKind, [number, number]> = { car: [9, 14], van: [8, 12], truck: [7, 10] };

// ---------------------------------------------------------------------------------------------- Typen

export type BlockKind = 'houses' | 'tower' | 'park' | 'water';

/** Ein Gebäude (Rechteck am Boden, Höhe) in einem Block. */
export interface Building {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number;
  /** Farbvariante (0 bis 1). */
  tint: number;
  /** Fensterreihen leuchten (nachts). */
  lit: boolean;
}

export interface CityBlock {
  i: number;
  j: number;
  kind: BlockKind;
  buildings: Building[];
  /** Bäume (Park): Mittelpunkte. */
  trees: { x: number; z: number; size: number }[];
}

export interface City {
  blocks: CityBlock[];
  /** Spalte des Flusses (−1 ohne). Die Straßen quer dazu sind Brücken. */
  riverCol: number;
  /** Harte Rechtecke (Gebäude, Wasser, Rand) für Zusammenstöße. */
  walls: Wall[];
}

export interface Wall {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: 'building' | 'water' | 'edge' | 'block';
}

export type TrafficKind = 'car' | 'van' | 'truck';

export interface Vehicle {
  id: number;
  kind: TrafficKind;
  x: number;
  z: number;
  /** Achse der Straße und Fahrtrichtung (+1 wächst). */
  axis: 'x' | 'z';
  dir: 1 | -1;
  /** Index der Straße (Linie quer zur Achse): auf axis 'x' ist das z = line · PITCH. */
  line: number;
  v: number;
  cruise: number;
  color: number;
  /** Angestoßen: so lange steht er (Sekunden). */
  pushed: number;
  braking: boolean;
  /** Blickrichtung (für die Optik, folgt der Fahrtrichtung weich). */
  heading: number;
  /** Nach einem Zusammenstoß mit dir: so lange kein weiterer Schaden (Sekunden). */
  hitCooldown: number;
}

export type CopState = 'chase' | 'hesitate' | 'wrecked';

export interface Cop {
  id: number;
  x: number;
  z: number;
  heading: number;
  v: number;
  state: CopState;
  spawnAt: number;
  active: boolean;
  ramCooldown: number;
  hesitateUntil: number;
  wreckT: number;
  /** Nächster Zielpunkt (Kreuzung oder du). */
  tx: number;
  tz: number;
  /** Auf dem Raster: Achse und Richtung, Kreuzung, auf die er zufährt. */
  axis: 'x' | 'z';
  dir: 1 | -1;
  node: { i: number; j: number };
  /** Direkt hinter dir (Sichtkontakt auf derselben Straße). */
  pursuit: boolean;
}

export interface Roadblock {
  id: number;
  /** Kreuzung. */
  i: number;
  j: number;
  /** Achse der Straße, die gesperrt ist (quer dazu steht die Sperre), von welcher Seite du kommst. */
  axis: 'x' | 'z';
  dir: 1 | -1;
  /** Lücke: −1 links, 1 rechts (in Fahrtrichtung). */
  gap: -1 | 1;
  walls: Wall[];
  until: number;
  passed: boolean;
  hit: boolean;
}

export interface Player {
  x: number;
  z: number;
  /** Nase (rad, 0 = Norden, im Uhrzeigersinn). */
  heading: number;
  /** Fahrtrichtung (rad), folgt der Nase mit Verzug (Drift). */
  course: number;
  /** Tempo entlang der Fahrtrichtung (m/s), negativ rückwärts. */
  v: number;
  /** Lenkung −1 bis 1 (geglättet). */
  steer: number;
  turbo: number;
  turboOn: boolean;
  turboLeft: number;
  damage: number;
  skid: number;
  braking: boolean;
  /** Rutscht gerade (Drift, für Ton und Spuren). */
  drifting: boolean;
  /** Nach einem Aufprall: so lange kein weiterer Schaden von Wänden (Sekunden). */
  crashCooldown: number;
}

export type ChaseEventKind =
  | 'steer'
  | 'bump'
  | 'crash'
  | 'scrape'
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
  | 'hideout'
  | 'hideoutLost'
  | 'splash'
  | 'escaped'
  | 'caught';

export interface ChaseEvent {
  kind: ChaseEventKind;
  /** Stärke 0–1 (z.B. wie hart der Aufprall). */
  power: number;
  /** Wo es passiert ist (Welt). */
  x: number;
  z: number;
}

export type ChaseEnd = 'escaped' | 'caught' | 'time';

export interface ChaseInput {
  /** Lenkung −1 (links) bis 1 (rechts). */
  steer: number;
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
  city: City;
  cops: number;
  copFactor: number;
  traffic: number;
  blockEvery: number;
  /** Start: mitten auf einer Straße nach Norden. */
  start: { x: number; z: number; heading: number };
}

export interface Hideout {
  x: number;
  z: number;
  /** Richtung der Einfahrt (rad), zur Straße hin. */
  heading: number;
}

export interface ChaseState {
  t: number;
  player: Player;
  traffic: Vehicle[];
  cops: Cop[];
  blocks: Roadblock[];
  /** Abhängen 0–1. */
  shake: number;
  /** Abstand zur nächsten aktiven Streife (Meter, Infinity ohne). */
  nearest: number;
  /** Sitzt dir eine Streife im Nacken (unter SHAKE_NEAR)? */
  near: boolean;
  hideout: Hideout | null;
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
const TAU = Math.PI * 2;

/** Winkel auf −π bis π. */
export function wrapAngle(a: number): number {
  return a - TAU * Math.floor((a + Math.PI) / TAU);
}

export function forward(heading: number): { x: number; z: number } {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

export function headingTo(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Welt-Ausdehnung (Meter). */
export const WORLD = GRID * PITCH;

/** Nächste Straßenlinie (Index) zu einer Koordinate. */
export function lineAt(c: number): number {
  return clamp(Math.round(c / PITCH), 0, GRID);
}

/** Liegt die Koordinate auf der Fahrbahn einer Straße (mit etwas Gehweg)? */
export function onRoad(c: number): boolean {
  return Math.abs(c - lineAt(c) * PITCH) <= ROAD_W / 2 + SIDEWALK;
}

/** Wagenradius je Art. */
export function radiusOf(kind: TrafficKind): number {
  return kind === 'truck' ? TRUCK_RADIUS : kind === 'van' ? 1.6 : CAR_RADIUS;
}

// ---------------------------------------------------------------------------------------------- Stadt

/** Block (i, j) bedeckt x in [i·PITCH + ROAD_W/2, (i+1)·PITCH − ROAD_W/2], ebenso z. */
export function blockRect(i: number, j: number): { x0: number; z0: number; x1: number; z1: number } {
  const inset = ROAD_W / 2 + SIDEWALK;
  return { x0: i * PITCH + inset, z0: j * PITCH + inset, x1: (i + 1) * PITCH - inset, z1: (j + 1) * PITCH - inset };
}

function buildBlock(random: () => number, i: number, j: number, kind: BlockKind): CityBlock {
  const r = blockRect(i, j);
  const buildings: Building[] = [];
  const trees: CityBlock['trees'] = [];
  if (kind === 'park') {
    const n = 5 + Math.floor(random() * 5);
    for (let k = 0; k < n; k++) {
      trees.push({
        x: lerp(r.x0 + 4, r.x1 - 4, random()),
        z: lerp(r.z0 + 4, r.z1 - 4, random()),
        size: 0.8 + random() * 0.6,
      });
    }
  } else if (kind === 'tower') {
    const pad = 4 + random() * 6;
    buildings.push({
      x0: r.x0 + pad,
      z0: r.z0 + pad,
      x1: r.x1 - pad,
      z1: r.z1 - pad,
      height: 40 + random() * 50,
      tint: random(),
      lit: random() < 0.8,
    });
  } else if (kind === 'houses') {
    // Zwei bis vier Häuserzeilen, die den Block füllen (Teilung längs und quer).
    const cols = random() < 0.5 ? 1 : 2;
    const rows = random() < 0.6 ? 2 : 1;
    const w = (r.x1 - r.x0) / cols;
    const d = (r.z1 - r.z0) / rows;
    for (let c = 0; c < cols; c++) {
      for (let q = 0; q < rows; q++) {
        const gap = 1 + random() * 2;
        buildings.push({
          x0: r.x0 + c * w + gap,
          z0: r.z0 + q * d + gap,
          x1: r.x0 + (c + 1) * w - gap,
          z1: r.z0 + (q + 1) * d - gap,
          height: 9 + random() * 14,
          tint: random(),
          lit: random() < 0.7,
        });
      }
    }
  }
  return { i, j, kind, buildings, trees };
}

/** Stadt fest aus dem Seed: Blöcke, Fluss, harte Wände. */
export function buildCity(random: () => number): City {
  const blocks: CityBlock[] = [];
  const walls: Wall[] = [];
  const riverCol = 2 + Math.floor(random() * (GRID - 4));
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      let kind: BlockKind;
      const roll = random();
      if (i === riverCol) kind = 'water';
      else if (roll < 0.12) kind = 'park';
      else if (roll < 0.32) kind = 'tower';
      else kind = 'houses';
      const block = buildBlock(random, i, j, kind);
      blocks.push(block);
      const r = blockRect(i, j);
      if (kind === 'water') walls.push({ ...r, kind: 'water' });
      for (const b of block.buildings) walls.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'building' });
    }
  }
  // Rand: außen herum ist Schluss (Nebel).
  const m = ROAD_W / 2 + SIDEWALK;
  walls.push({ x0: -1000, z0: -1000, x1: WORLD + 1000, z1: -m, kind: 'edge' });
  walls.push({ x0: -1000, z0: WORLD + m, x1: WORLD + 1000, z1: WORLD + 1000, kind: 'edge' });
  walls.push({ x0: -1000, z0: -1000, x1: -m, z1: WORLD + 1000, kind: 'edge' });
  walls.push({ x0: WORLD + m, z0: -1000, x1: WORLD + 1000, z1: WORLD + 1000, kind: 'edge' });
  return { blocks, riverCol, walls };
}

/** Feste Inhalte aus Seed und Schwierigkeit. */
export function createChase(options: ChaseOptions): ChaseSetup {
  const random = createRng(options.seed);
  const difficulty = clamp(Number.isFinite(options.difficulty) ? options.difficulty : 0.5, 0, 1);
  const clock = clamp(Number.isFinite(options.clock) ? Number(options.clock) : 4, 2, 6);
  const city = buildCity(random);
  // Start: auf einer senkrechten Straße (nicht am Fluss, nicht am Rand), nach Norden, auf der rechten Spur.
  let col = 2 + Math.floor(random() * (GRID - 3));
  if (col === city.riverCol || col === city.riverCol + 1) col = col > 2 ? col - 2 : col + 2;
  const row = GRID - 3;
  return {
    seed: options.seed,
    difficulty,
    city,
    cops: clamp(2 + Math.round(difficulty * 2) + (clock <= 3 ? 1 : 0), 2, 4),
    copFactor: lerp(COP_SPEED.easy, COP_SPEED.hard, difficulty),
    traffic: Math.round(lerp(TRAFFIC.min, TRAFFIC.max, difficulty) * (options.mobile ? 0.75 : 1)),
    blockEvery: lerp(BLOCK_EVERY.easy, BLOCK_EVERY.hard, difficulty),
    start: { x: col * PITCH + LANE_OFF, z: row * PITCH + PITCH / 2, heading: 0 },
  };
}

// ---------------------------------------------------------------------------------------------- Anfang

function makeCop(setup: ChaseSetup, state: ChaseState, behind: number, spawnAt: number): Cop {
  const s = setup.start;
  const f = forward(s.heading);
  return {
    id: state.nextId++,
    x: s.x - f.x * behind,
    z: s.z - f.z * behind,
    heading: s.heading,
    v: 0,
    state: 'chase',
    spawnAt,
    active: false,
    ramCooldown: spawnAt === 0 ? 3 : 0,
    hesitateUntil: 0,
    wreckT: 0,
    tx: s.x,
    tz: s.z,
    axis: 'z',
    dir: -1,
    node: { i: lineAt(s.x), j: lineAt(s.z - f.z * behind) - 1 },
    pursuit: true,
  };
}

export function initChase(setup: ChaseSetup): ChaseState {
  const random = createRng(setup.seed ^ 0x5bd1e995);
  const state: ChaseState = {
    t: 0,
    player: {
      x: setup.start.x,
      z: setup.start.z,
      heading: setup.start.heading,
      course: setup.start.heading,
      v: TOP_SPEED * 0.4,
      steer: 0,
      turbo: 1,
      turboOn: false,
      turboLeft: 0,
      damage: 0,
      skid: 0,
      braking: false,
      drifting: false,
      crashCooldown: 0,
    },
    traffic: [],
    cops: [],
    blocks: [],
    shake: 0,
    nearest: 22,
    near: true,
    hideout: null,
    contact: 0,
    dumped: false,
    hesitateUntil: 0,
    nextBlockAt: BLOCK_FIRST,
    end: null,
    endAt: -1,
    events: [],
    nextId: 1,
    random,
  };
  for (let k = 0; k < setup.cops; k++) {
    state.cops.push(makeCop(setup, state, 22 + k * 14, k === 0 ? 0 : 4 + k * 5));
  }
  state.cops[0].active = true;
  for (let k = 0; k < setup.traffic; k++) spawnTraffic(setup, state, true);
  return state;
}

// ---------------------------------------------------------------------------------------------- Verkehr

/** Rechte Seite der Fahrtrichtung (axis, dir) als Versatz der anderen Koordinate. */
function rightOffset(axis: 'x' | 'z', dir: 1 | -1): number {
  // Fahrt +x: rechts ist +z. Fahrt +z: rechts ist −x.
  return axis === 'x' ? dir * LANE_OFF : -dir * LANE_OFF;
}

function headingOf(axis: 'x' | 'z', dir: 1 | -1): number {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? Math.PI : 0;
}

function placeOnLane(v: Vehicle | Cop, axis: 'x' | 'z', dir: 1 | -1, line: number, along: number): void {
  v.axis = axis;
  v.dir = dir;
  if (axis === 'x') {
    v.x = along;
    v.z = line * PITCH + rightOffset(axis, dir);
  } else {
    v.z = along;
    v.x = line * PITCH + rightOffset(axis, dir);
  }
}

function spawnTraffic(setup: ChaseSetup, state: ChaseState, initial: boolean): void {
  const r = state.random;
  const p = state.player;
  const kinds: TrafficKind[] = ['car', 'car', 'car', 'car', 'van', 'van', 'truck'];
  const kind = kinds[Math.floor(r() * kinds.length)];
  const axis: 'x' | 'z' = r() < 0.5 ? 'x' : 'z';
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
  // Straße in der Nähe, aber nicht direkt vor der Nase (am Anfang auch nicht hinter dir).
  let line = 0;
  let along = 0;
  for (let tries = 0; tries < 8; tries++) {
    const d = initial ? 40 + r() * 180 : 120 + r() * 140;
    const a = r() * TAU;
    const px = clamp(p.x + Math.sin(a) * d, ROAD_W, WORLD - ROAD_W);
    const pz = clamp(p.z - Math.cos(a) * d, ROAD_W, WORLD - ROAD_W);
    line = axis === 'x' ? lineAt(pz) : lineAt(px);
    along = axis === 'x' ? px : pz;
    // Nicht auf dem Wasser-Block entlang (die Straßen über den Fluss sind Brücken, da fahren sie).
    if (axis === 'z' && (line === setup.city.riverCol || line === setup.city.riverCol + 1)) continue;
    const vx = axis === 'x' ? along : line * PITCH;
    const vz = axis === 'x' ? line * PITCH : along;
    if (dist(vx, vz, p.x, p.z) <= 30) continue;
    if (initial) {
      // Nicht auf deiner Straße vor dir: Die ersten Sekunden gehören dem Lenkrad.
      const f = forward(p.heading);
      const ahead = (vx - p.x) * f.x + (vz - p.z) * f.z;
      const side = Math.abs((vx - p.x) * -f.z + (vz - p.z) * f.x);
      if (ahead > 0 && ahead < 140 && side < 12) continue;
    }
    break;
  }
  const [lo, hi] = TRAFFIC_SPEED[kind];
  const cruise = lo + r() * (hi - lo);
  const v: Vehicle = {
    id: state.nextId++,
    kind,
    x: 0,
    z: 0,
    axis,
    dir,
    line,
    v: cruise,
    cruise,
    color: Math.floor(r() * 8),
    pushed: 0,
    braking: false,
    heading: headingOf(axis, dir),
    hitCooldown: 0,
  };
  placeOnLane(v, axis, dir, line, along);
  state.traffic.push(v);
}

/** An der Kreuzung: geradeaus, links oder rechts (nie zurück); nicht auf den Fluss. */
function turnTraffic(setup: ChaseSetup, state: ChaseState, v: Vehicle, node: number): void {
  const r = state.random();
  if (r < 0.6) return;
  const left = r < 0.8;
  const newAxis: 'x' | 'z' = v.axis === 'x' ? 'z' : 'x';
  // Links abbiegen: von +x nach −z (Norden); von +z (Süden) nach +x; von −x nach +z; von −z nach −x.
  let newDir: 1 | -1;
  if (v.axis === 'x') newDir = left ? (v.dir > 0 ? -1 : 1) : v.dir > 0 ? 1 : -1;
  else newDir = left ? (v.dir > 0 ? 1 : -1) : v.dir > 0 ? -1 : 1;
  const newLine = node;
  const along = v.line * PITCH;
  if (newAxis === 'z' && (newLine === setup.city.riverCol || newLine === setup.city.riverCol + 1)) return;
  if (newLine <= 0 || newLine >= GRID) return;
  placeOnLane(v, newAxis, newDir, newLine, along + newDir * LANE_OFF);
  v.line = newLine;
}

function stepTraffic(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  for (const v of state.traffic) {
    v.hitCooldown = Math.max(0, v.hitCooldown - dt);
    if (v.pushed > 0) {
      v.pushed -= dt;
      v.v = Math.max(0, v.v - 12 * dt);
      continue;
    }
    // Bremsen vor dir und vor anderen auf derselben Spur.
    const f = forward(headingOf(v.axis, v.dir));
    let ahead = Infinity;
    const dpx = p.x - v.x;
    const dpz = p.z - v.z;
    const alongP = dpx * f.x + dpz * f.z;
    const sideP = Math.abs(dpx * -f.z + dpz * f.x);
    if (alongP > 0 && alongP < 18 && sideP < 3) ahead = alongP;
    for (const o of state.traffic) {
      if (o === v || o.axis !== v.axis || o.dir !== v.dir || o.line !== v.line) continue;
      const a = (o.x - v.x) * f.x + (o.z - v.z) * f.z;
      if (a > 0 && a < ahead) ahead = a;
    }
    const want = ahead < 12 ? 0 : ahead < 24 ? v.cruise * 0.5 : v.cruise;
    v.braking = want < v.v - 0.5;
    v.v = want > v.v ? Math.min(want, v.v + 4 * dt) : Math.max(want, v.v - 9 * dt);
    const before = v.axis === 'x' ? v.x : v.z;
    const after = before + v.dir * v.v * dt;
    if (v.axis === 'x') v.x = after;
    else v.z = after;
    v.heading = headingOf(v.axis, v.dir);
    // Kreuzung passiert?
    const nodeBefore = Math.floor(before / PITCH + (v.dir > 0 ? 0 : 1));
    const nodeAfter = Math.floor(after / PITCH + (v.dir > 0 ? 0 : 1));
    if (nodeAfter !== nodeBefore) {
      const node = v.dir > 0 ? nodeAfter : nodeBefore;
      if (node <= 0 || node >= GRID) {
        // Am Rand: umdrehen.
        v.dir = v.dir > 0 ? -1 : 1;
        placeOnLane(v, v.axis, v.dir, v.line, clamp(after, ROAD_W, WORLD - ROAD_W));
      } else turnTraffic(setup, state, v, node);
    }
  }
  // Weit weg: neu setzen.
  for (let k = state.traffic.length - 1; k >= 0; k--) {
    const v = state.traffic[k];
    if (dist(v.x, v.z, p.x, p.z) > TRAFFIC.respawn) {
      state.traffic.splice(k, 1);
      spawnTraffic(setup, state, false);
    }
  }
}

// ---------------------------------------------------------------------------------------------- Fahren

function stepPlayer(state: ChaseState, input: ChaseInput, dt: number): void {
  const p = state.player;
  const steerIn = clamp(Number.isFinite(input.steer) ? input.steer : 0, -1, 1);
  p.steer = lerp(p.steer, steerIn, Math.min(1, STEER_SMOOTH * dt));
  // Turbo zünden (nur mit Ladung, nicht beim Rutschen).
  if (input.turbo && !p.turboOn && p.turbo >= 0.999 && p.skid <= 0 && !state.end) {
    p.turboOn = true;
    p.turboLeft = TURBO_SECONDS;
    p.turbo = 0;
    state.events.push({ kind: 'turbo', power: 1, x: p.x, z: p.z });
  }
  if (p.turboOn) {
    p.turboLeft -= dt;
    if (p.turboLeft <= 0) p.turboOn = false;
  } else p.turbo = clamp(p.turbo + dt / TURBO_RECHARGE, 0, 1);
  const top = TOP_SPEED * (p.turboOn ? TURBO_FACTOR : 1) * (1 - 0.35 * p.damage);
  p.braking = input.brake;
  if (p.skid > 0) {
    p.skid -= dt;
    p.v = Math.max(0, p.v - COAST * 2 * dt);
  } else if (input.brake) {
    if (p.v > 0.3) p.v = Math.max(0, p.v - BRAKE * dt);
    else p.v = Math.max(-REVERSE_SPEED, p.v - ACCEL * 0.5 * dt);
  } else if (input.gas || p.turboOn) {
    const accel = (p.turboOn ? TURBO_ACCEL : ACCEL) * clamp(1.2 - p.v / top, 0.25, 1.2);
    p.v = Math.min(top, p.v + accel * dt);
    if (p.v > top) p.v = Math.max(top, p.v - COAST * dt);
  } else {
    p.v = p.v > 0 ? Math.max(0, p.v - COAST * dt) : Math.min(0, p.v + COAST * dt);
  }
  // Lenken: Gierrate nach Tempo (langsam wenig, sehr schnell etwas weniger als mittel).
  const speed = Math.abs(p.v);
  const f = clamp(speed / YAW_FULL_AT, 0, 1) * (1 - 0.3 * clamp((speed - 28) / 30, 0, 1));
  const yaw = p.steer * YAW_MAX * f * (p.v < 0 ? -1 : 1);
  const turning = Math.abs(p.steer) > 0.15 && speed > 4;
  if (turning && Math.abs(yaw) > 0.6 && state.random() < dt * 2)
    state.events.push({ kind: 'steer', power: Math.abs(p.steer), x: p.x, z: p.z });
  p.heading = wrapAngle(p.heading + yaw * dt);
  // Drift: die Fahrtrichtung folgt der Nase mit Verzug (beim Bremsen und Lenken stärker).
  const drift = input.brake && turning && speed > 12;
  const grip = drift ? GRIP_DRIFT : GRIP;
  const diff = wrapAngle(p.heading - p.course);
  p.course = wrapAngle(p.course + diff * Math.min(1, grip * dt));
  p.drifting = Math.abs(diff) > 0.18 && speed > 8;
  if (p.drifting) p.v *= 1 - 0.25 * dt;
  const c = forward(p.course);
  p.x += c.x * p.v * dt;
  p.z += c.z * p.v * dt;
}

/** Kreis gegen Rechteck: Tiefe und Normale, wenn sie sich überlappen. */
function circleVsRect(
  x: number,
  z: number,
  r: number,
  w: { x0: number; z0: number; x1: number; z1: number },
): { nx: number; nz: number; depth: number } | null {
  const cx = clamp(x, w.x0, w.x1);
  const cz = clamp(z, w.z0, w.z1);
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return null;
  if (d > 1e-6) return { nx: dx / d, nz: dz / d, depth: r - d };
  // Mittelpunkt im Rechteck: kürzester Weg raus.
  const toX0 = x - w.x0;
  const toX1 = w.x1 - x;
  const toZ0 = z - w.z0;
  const toZ1 = w.z1 - z;
  const m = Math.min(toX0, toX1, toZ0, toZ1);
  if (m === toX0) return { nx: -1, nz: 0, depth: r + toX0 };
  if (m === toX1) return { nx: 1, nz: 0, depth: r + toX1 };
  if (m === toZ0) return { nx: 0, nz: -1, depth: r + toZ0 };
  return { nx: 0, nz: 1, depth: r + toZ1 };
}

/** Zusammenstöße mit Gebäuden, Wasser, Rand und Sperren: rausdrücken, Tempo entlang der Normalen weg, Schaden. */
function collideWalls(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  p.crashCooldown = Math.max(0, p.crashCooldown - dt);
  const walls: Wall[] = setup.city.walls;
  const c = forward(p.course);
  for (const list of [walls, ...state.blocks.map((b) => b.walls)]) {
    for (const w of list) {
      // Grob vorsortieren.
      if (p.x < w.x0 - 4 || p.x > w.x1 + 4 || p.z < w.z0 - 4 || p.z > w.z1 + 4) continue;
      const hit = circleVsRect(p.x, p.z, CAR_RADIUS, w);
      if (!hit) continue;
      p.x += hit.nx * hit.depth;
      p.z += hit.nz * hit.depth;
      const into = -(c.x * hit.nx + c.z * hit.nz) * p.v; // Tempo gegen die Wand
      if (into > IMPACT_FREE && p.crashCooldown <= 0) {
        p.crashCooldown = 0.5;
        const power = clamp((into - IMPACT_FREE) / (IMPACT_FULL - IMPACT_FREE), 0, 1);
        const blockWall = w.kind === 'block';
        p.damage = clamp(p.damage + (blockWall ? BLOCK_DAMAGE : power * IMPACT_MAX_DAMAGE), 0, 1);
        state.events.push({
          kind: w.kind === 'water' ? 'splash' : blockWall ? 'blockHit' : 'crash',
          power,
          x: p.x,
          z: p.z,
        });
        if (blockWall) for (const b of state.blocks) if (b.walls.includes(w)) b.hit = true;
        // Abprallen: Fahrtrichtung weg von der Wand, Tempo runter.
        p.v = Math.max(0, p.v * (1 - 0.55 * power) - into * 0.3);
        p.skid = Math.max(p.skid, SKID_SECONDS * power);
        const tangent = Math.atan2(-hit.nz, hit.nx); // entlang der Wand
        // Kurs entlang der Wand drehen, in die Richtung, die näher an der bisherigen liegt.
        const a = wrapAngle(headingTo(Math.cos(tangent), Math.sin(tangent)));
        const b = wrapAngle(a + Math.PI);
        p.course = Math.abs(wrapAngle(a - p.course)) < Math.abs(wrapAngle(b - p.course)) ? a : b;
      } else if (Math.abs(p.v) > 3) {
        // Schrammen entlang.
        p.v *= 0.985;
        state.events.push({ kind: 'scrape', power: 0.3, x: p.x, z: p.z });
      }
    }
  }
}

function collideTraffic(state: ChaseState): void {
  const p = state.player;
  const c = forward(p.course);
  for (const v of state.traffic) {
    const r = CAR_RADIUS + radiusOf(v.kind);
    const dx = v.x - p.x;
    const dz = v.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d >= r || d < 1e-6) continue;
    const nx = dx / d;
    const nz = dz / d;
    const into = (c.x * nx + c.z * nz) * p.v - v.v * (Math.sin(v.heading) * nx - Math.cos(v.heading) * nz);
    const power = clamp(Math.abs(into) / 30, 0, 1);
    // Auseinander: Der Verkehr ist schwer, du weichst zurück.
    const push = r - d;
    p.x -= nx * push * 0.8;
    p.z -= nz * push * 0.8;
    v.x += nx * push * 0.2;
    v.z += nz * push * 0.2;
    v.pushed = Math.max(v.pushed, 1.5);
    const frontal = Math.abs(c.x * nx + c.z * nz) > 0.7;
    if (v.hitCooldown > 0) {
      // Noch dran: nur bremsen, kein neuer Schaden.
      if (frontal && p.v > v.v) p.v = Math.max(0, Math.min(p.v, v.v) - 1);
      continue;
    }
    v.hitCooldown = 0.8;
    if (frontal) {
      p.damage = clamp(p.damage + 0.03 + power * 0.22, 0, 1);
      p.v = Math.max(0, p.v * 0.4);
      p.skid = Math.max(p.skid, SKID_SECONDS * 0.6);
      state.events.push({ kind: 'crash', power, x: v.x, z: v.z });
    } else {
      p.v *= 0.9;
      state.events.push({ kind: 'sideswipe', power: 0.4 + power * 0.4, x: v.x, z: v.z });
    }
  }
}

// ---------------------------------------------------------------------------------------------- Streifen

/** Kreuzung (i, j) in Weltkoordinaten. */
function nodeAt(i: number, j: number): { x: number; z: number } {
  return { x: i * PITCH, z: j * PITCH };
}

/** Nächste Kreuzung aus Sicht der Streife: die Ausfahrt, die den Abstand zu dir verkleinert (nie zurück, nie Fluss). */
function chooseNode(setup: ChaseSetup, cop: Cop, px: number, pz: number): void {
  const { i, j } = cop.node;
  const options: { i: number; j: number; axis: 'x' | 'z'; dir: 1 | -1 }[] = [
    { i: i + 1, j, axis: 'x', dir: 1 },
    { i: i - 1, j, axis: 'x', dir: -1 },
    { i, j: j + 1, axis: 'z', dir: 1 },
    { i, j: j - 1, axis: 'z', dir: -1 },
  ];
  let best: (typeof options)[number] | null = null;
  let bestD = Infinity;
  for (const o of options) {
    if (o.i < 0 || o.i > GRID || o.j < 0 || o.j > GRID) continue;
    if (o.axis === cop.axis && o.dir === -cop.dir) continue; // nicht wenden
    if (o.axis === 'z' && (o.i === setup.city.riverCol || o.i === setup.city.riverCol + 1)) continue;
    const n = nodeAt(o.i, o.j);
    const d = dist(n.x, n.z, px, pz);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) {
    best = { i, j, axis: cop.axis, dir: cop.dir > 0 ? -1 : 1 };
    best.i = i + (best.axis === 'x' ? best.dir : 0);
    best.j = j + (best.axis === 'z' ? best.dir : 0);
  }
  cop.node = { i: best.i, j: best.j };
  cop.axis = best.axis;
  cop.dir = best.dir;
  const n = nodeAt(best.i, best.j);
  cop.tx = n.x + (best.axis === 'z' ? rightOffset('z', best.dir) : 0);
  cop.tz = n.z + (best.axis === 'x' ? rightOffset('x', best.dir) : 0);
}

/** Sieht die Streife dich: auf derselben Straße (gleiche Linie) und nah genug? */
function seesPlayer(cop: Cop, px: number, pz: number): boolean {
  const d = dist(cop.x, cop.z, px, pz);
  if (d > COP_SIGHT) return false;
  const sameX = onRoad(cop.z) && onRoad(pz) && lineAt(cop.z) === lineAt(pz);
  const sameZ = onRoad(cop.x) && onRoad(px) && lineAt(cop.x) === lineAt(px);
  return sameX || sameZ || d < 22;
}

function stepCop(setup: ChaseSetup, state: ChaseState, cop: Cop, dt: number): void {
  const p = state.player;
  if (cop.state === 'wrecked') {
    cop.wreckT -= dt;
    cop.v = Math.max(0, cop.v - 20 * dt);
    if (cop.wreckT <= 0) {
      // Neu von weit hinten.
      const f = forward(p.heading);
      cop.state = 'chase';
      cop.x = clamp(p.x - f.x * 150, 5, WORLD - 5);
      cop.z = clamp(p.z - f.z * 150, 5, WORLD - 5);
      cop.node = { i: lineAt(cop.x), j: lineAt(cop.z) };
      cop.heading = p.heading;
      cop.v = 10;
      chooseNode(setup, cop, p.x, p.z);
      state.events.push({ kind: 'cop', power: 1, x: cop.x, z: cop.z });
    }
    return;
  }
  if (cop.state === 'hesitate' && state.t >= cop.hesitateUntil) cop.state = 'chase';
  cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
  const gap = dist(cop.x, cop.z, p.x, p.z);
  const sees = seesPlayer(cop, p.x, p.z);
  // Ziel: du (Sichtkontakt) oder die nächste Kreuzung.
  if (sees) {
    cop.pursuit = true;
    const pf = forward(p.course);
    cop.tx = p.x + pf.x * 2;
    cop.tz = p.z + pf.z * 2;
  } else {
    if (cop.pursuit) {
      // Sicht verloren: auf das Raster zurück, zur nächsten Kreuzung in Fahrtrichtung.
      cop.pursuit = false;
      const f = forward(cop.heading);
      cop.axis = Math.abs(f.x) > Math.abs(f.z) ? 'x' : 'z';
      cop.dir = (cop.axis === 'x' ? f.x : f.z) > 0 ? 1 : -1;
      const i = cop.axis === 'x' ? Math.floor(cop.x / PITCH + (cop.dir > 0 ? 1 : 0)) : lineAt(cop.x);
      const j = cop.axis === 'z' ? Math.floor(cop.z / PITCH + (cop.dir > 0 ? 1 : 0)) : lineAt(cop.z);
      cop.node = { i: clamp(i, 0, GRID), j: clamp(j, 0, GRID) };
      const n = nodeAt(cop.node.i, cop.node.j);
      cop.tx = n.x + (cop.axis === 'z' ? rightOffset('z', cop.dir) : 0);
      cop.tz = n.z + (cop.axis === 'x' ? rightOffset('x', cop.dir) : 0);
    }
    if (dist(cop.x, cop.z, cop.tx, cop.tz) < 5) chooseNode(setup, cop, p.x, p.z);
  }
  // Lenken zum Ziel.
  const want = headingTo(cop.tx - cop.x, cop.tz - cop.z);
  const diff = wrapAngle(want - cop.heading);
  const yawRate = COP_YAW * clamp(cop.v / 10, 0.3, 1);
  cop.heading = wrapAngle(cop.heading + clamp(diff, -yawRate * dt, yawRate * dt));
  // Tempo: Gummiband (weit weg schneller), in Kurven und vor Kreuzungen langsamer, zögern nach der Ware.
  let top = TOP_SPEED * setup.copFactor;
  if (!sees && gap > COP_RUBBER_GAP) top *= COP_RUBBER;
  if (cop.state === 'hesitate') top *= 0.45;
  const sharp = Math.abs(diff) > 0.5;
  const nearNode = !sees && dist(cop.x, cop.z, cop.tx, cop.tz) < 16;
  if (sharp || nearNode) top = Math.min(top, 14);
  // Dicht dran ohne Rammen: Tempo angleichen und kurz hinter dir bleiben (stellen), nicht vorbeischießen.
  if (sees && gap < 16 && !(cop.ramCooldown <= 0 && cop.state === 'chase'))
    top = Math.min(top, Math.abs(p.v) + Math.max(2, (gap - 4) * 0.8));
  cop.v = cop.v < top ? Math.min(top, cop.v + 11 * dt) : Math.max(top, cop.v - 16 * dt);
  const f = forward(cop.heading);
  cop.x += f.x * cop.v * dt;
  cop.z += f.z * cop.v * dt;
  // Wände: rausdrücken (ohne Schaden), Richtung entlang der Wand.
  for (const w of setup.city.walls) {
    if (cop.x < w.x0 - 4 || cop.x > w.x1 + 4 || cop.z < w.z0 - 4 || cop.z > w.z1 + 4) continue;
    const hit = circleVsRect(cop.x, cop.z, CAR_RADIUS, w);
    if (!hit) continue;
    cop.x += hit.nx * hit.depth;
    cop.z += hit.nz * hit.depth;
    cop.v *= 0.8;
  }
  // Rammen: dicht hinter dir mit Tempo.
  if (sees && cop.state === 'chase' && cop.ramCooldown <= 0 && gap < CAR_RADIUS * 2 + 0.6 && !state.end) {
    const rel = cop.v - Math.abs(p.v);
    if (rel > 1 || gap < CAR_RADIUS * 2) {
      cop.ramCooldown = RAM_COOLDOWN;
      p.damage = clamp(p.damage + RAM_DAMAGE, 0, 1);
      const side = state.random() < 0.5 ? -1 : 1;
      // Anschieben: Tempo rauf, Kurs seitlich verdreht.
      p.v += RAM_PUSH;
      p.course = wrapAngle(p.course + side * 0.25);
      cop.v *= 0.7;
      state.events.push({ kind: 'ram', power: 1, x: cop.x, z: cop.z });
    }
  }
  // Im Verkehr verunglücken (nur schnell).
  for (const v of state.traffic) {
    const d = dist(cop.x, cop.z, v.x, v.z);
    if (d < CAR_RADIUS + radiusOf(v.kind)) {
      if (cop.v > 24 && state.random() < 0.35) {
        cop.state = 'wrecked';
        cop.wreckT = COP_WRECK_SECONDS;
        v.pushed = 3;
        state.events.push({ kind: 'copCrash', power: 1, x: cop.x, z: cop.z });
      } else {
        v.pushed = Math.max(v.pushed, 1);
        cop.v *= 0.6;
        const nx = (cop.x - v.x) / Math.max(d, 1e-6);
        const nz = (cop.z - v.z) / Math.max(d, 1e-6);
        cop.x += nx * 0.5;
        cop.z += nz * 0.5;
      }
      break;
    }
  }
}

function stepCops(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  let nearest = Infinity;
  for (const cop of state.cops) {
    if (!cop.active) {
      if (state.t >= cop.spawnAt) {
        cop.active = true;
        // Erscheint hinter dir auf dem Raster.
        const f = forward(p.heading);
        cop.x = clamp(p.x - f.x * 70, 5, WORLD - 5);
        cop.z = clamp(p.z - f.z * 70, 5, WORLD - 5);
        cop.heading = p.heading;
        cop.v = 18;
        cop.node = { i: lineAt(cop.x), j: lineAt(cop.z) };
        chooseNode(setup, cop, p.x, p.z);
        state.events.push({ kind: 'cop', power: 1, x: cop.x, z: cop.z });
      }
      continue;
    }
    stepCop(setup, state, cop, dt);
    if (cop.state !== 'wrecked') nearest = Math.min(nearest, dist(cop.x, cop.z, p.x, p.z));
  }
  const wasNear = state.near;
  state.nearest = nearest;
  state.near = nearest < SHAKE_NEAR;
  if (state.near && !wasNear) state.events.push({ kind: 'near', power: 1, x: p.x, z: p.z });
  if (!state.near && wasNear) state.events.push({ kind: 'clear', power: 1, x: p.x, z: p.z });
}

// ---------------------------------------------------------------------------------------------- Sperren

/** Kreuzung, auf die du zufährst (entlang deiner Hauptachse), mindestens so weit weg. */
function nodeAhead(
  p: Player,
  minAhead: number,
  maxAhead: number,
): { i: number; j: number; axis: 'x' | 'z'; dir: 1 | -1 } | null {
  const f = forward(p.heading);
  const axis: 'x' | 'z' = Math.abs(f.x) > Math.abs(f.z) ? 'x' : 'z';
  const dir: 1 | -1 = (axis === 'x' ? f.x : f.z) > 0 ? 1 : -1;
  const along = axis === 'x' ? p.x : p.z;
  const other = axis === 'x' ? lineAt(p.z) : lineAt(p.x);
  for (let k = 1; k <= 3; k++) {
    const line = Math.floor(along / PITCH) + (dir > 0 ? k : 1 - k);
    const d = (line * PITCH - along) * dir;
    if (d < minAhead) continue;
    if (d > maxAhead) return null;
    if (line <= 0 || line >= GRID) return null;
    return axis === 'x' ? { i: line, j: other, axis, dir } : { i: other, j: line, axis, dir };
  }
  return null;
}

function stepBlocks(setup: ChaseSetup, state: ChaseState): void {
  const p = state.player;
  if (state.t >= state.nextBlockAt && !state.end) {
    state.nextBlockAt = state.t + setup.blockEvery;
    const n = nodeAhead(p, BLOCK_AHEAD.min, BLOCK_AHEAD.max);
    if (n && !state.blocks.some((b) => b.i === n.i && b.j === n.j)) {
      const gap: -1 | 1 = state.random() < 0.5 ? -1 : 1;
      const c = nodeAt(n.i, n.j);
      // Sperre quer zur Fahrtrichtung, kurz vor der Kreuzung, Lücke auf einer Seite (eine Spur breit).
      const walls: Wall[] = [];
      const half = ROAD_W / 2 + SIDEWALK;
      const gapW = 4.2;
      const thick = 1.2;
      // Rechts in Fahrtrichtung: bei axis x/dir+ ist rechts +z; axis x/dir−: −z; axis z/dir+: −x; axis z/dir−: +x.
      const rightSign = n.axis === 'x' ? n.dir : -n.dir;
      const lo = -half;
      const hi = half;
      const gapLo = gap * rightSign > 0 ? hi - gapW : lo;
      const gapHi = gapLo + gapW;
      const at = (n.axis === 'x' ? c.x : c.z) - n.dir * (ROAD_W / 2 + 4);
      const seg = (a: number, b: number) => {
        if (b - a < 0.5) return;
        if (n.axis === 'x')
          walls.push({ x0: at - thick / 2, x1: at + thick / 2, z0: c.z + a, z1: c.z + b, kind: 'block' });
        else walls.push({ z0: at - thick / 2, z1: at + thick / 2, x0: c.x + a, x1: c.x + b, kind: 'block' });
      };
      seg(lo, gapLo);
      seg(gapHi, hi);
      state.blocks.push({
        id: state.nextId++,
        i: n.i,
        j: n.j,
        axis: n.axis,
        dir: n.dir,
        gap,
        walls,
        until: state.t + BLOCK_LIFETIME,
        passed: false,
        hit: false,
      });
      state.events.push({ kind: 'block', power: 1, x: c.x, z: c.z });
    }
  }
  for (let k = state.blocks.length - 1; k >= 0; k--) {
    const b = state.blocks[k];
    if (!b.passed) {
      const c = nodeAt(b.i, b.j);
      const along = b.axis === 'x' ? p.x : p.z;
      const line = b.axis === 'x' ? c.x : c.z;
      if ((along - line) * b.dir > 2 && dist(p.x, p.z, c.x, c.z) < PITCH / 2) {
        b.passed = true;
        if (!b.hit) state.events.push({ kind: 'blockPassed', power: 1, x: c.x, z: c.z });
      }
    }
    if (state.t > b.until) state.blocks.splice(k, 1);
  }
}

// ---------------------------------------------------------------------------------------------- Abhängen

/** Tiefgarage an einem Gebäude vor dir: an der Straßenseite eines Blocks, HIDEOUT_MIN bis HIDEOUT_MAX voraus. */
function pickHideout(setup: ChaseSetup, state: ChaseState): Hideout | null {
  const p = state.player;
  const f = forward(p.heading);
  let best: Hideout | null = null;
  let bestScore = Infinity;
  for (const block of setup.city.blocks) {
    if (block.kind === 'water' || block.kind === 'park') continue;
    const r = blockRect(block.i, block.j);
    // Vier Kandidaten: Mitte jeder Seite, auf dem Gehweg.
    const cands: Hideout[] = [
      { x: (r.x0 + r.x1) / 2, z: r.z0 - 1, heading: Math.PI }, // Nordseite, Einfahrt zeigt nach Süden? Nein: Einfahrt zeigt zur Straße (Norden)
      { x: (r.x0 + r.x1) / 2, z: r.z1 + 1, heading: 0 },
      { x: r.x0 - 1, z: (r.z0 + r.z1) / 2, heading: Math.PI / 2 },
      { x: r.x1 + 1, z: (r.z0 + r.z1) / 2, heading: -Math.PI / 2 },
    ];
    for (const c of cands) {
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < HIDEOUT_MIN || d > HIDEOUT_MAX) continue;
      const ahead = (dx * f.x + dz * f.z) / Math.max(d, 1e-6);
      if (ahead < 0.2) continue;
      // Lieber vorn und nah.
      const score = d * (1.6 - ahead);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

function stepShake(setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  const nearest = state.nearest;
  let rate = 0;
  if (nearest > SHAKE_FAR) rate = SHAKE_RATE * clamp(0.35 + (nearest - SHAKE_FAR) / SHAKE_LEAD, 0.35, 1.2);
  else if (nearest < SHAKE_NEAR) rate = -SHAKE_DRAIN;
  state.shake = clamp(state.shake + rate * dt, 0, 1);
  if (nearest < CATCH_GAP && Math.abs(p.v) < CATCH_SPEED) state.contact += dt;
  else state.contact = Math.max(0, state.contact - dt * 2);
  if (!state.hideout && state.shake >= 1) {
    const h = pickHideout(setup, state);
    if (h) {
      state.hideout = h;
      state.events.push({ kind: 'hideout', power: 1, x: h.x, z: h.z });
    } else state.shake = 0.9;
  } else if (state.hideout && state.shake < HIDEOUT_LOST) {
    state.hideout = null;
    state.events.push({ kind: 'hideoutLost', power: 1, x: p.x, z: p.z });
  }
}

// ---------------------------------------------------------------------------------------------- Schritt

/** Ware aus dem Fenster: einmal, Turbo voll, die Streifen zögern. */
export function dumpGoods(state: ChaseState): boolean {
  if (state.dumped || state.end) return false;
  state.dumped = true;
  state.player.turbo = 1;
  state.player.turboOn = false;
  state.hesitateUntil = state.t + DUMP_HESITATE;
  for (const cop of state.cops) {
    if (cop.state === 'chase') {
      cop.state = 'hesitate';
      cop.hesitateUntil = state.hesitateUntil;
    }
  }
  state.events.push({ kind: 'dump', power: 1, x: state.player.x, z: state.player.z });
  return true;
}

function endChase(state: ChaseState, end: ChaseEnd): void {
  if (state.end) return;
  state.end = end;
  state.endAt = state.t;
  state.events.push({ kind: end === 'escaped' ? 'escaped' : 'caught', power: 1, x: state.player.x, z: state.player.z });
}

/** Ein Schritt in echten Sekunden. Nach dem Ende laufen die Wagen noch aus (Zeitlupe in der Oberfläche). */
export function stepChase(setup: ChaseSetup, state: ChaseState, input: ChaseInput, dt: number): void {
  state.events.length = 0;
  state.t += dt;
  stepPlayer(state, state.end ? { steer: 0, gas: false, brake: true, turbo: false } : input, dt);
  collideWalls(setup, state, dt);
  stepTraffic(setup, state, dt);
  stepBlocks(setup, state);
  if (!state.end) collideTraffic(state);
  stepCops(setup, state, dt);
  if (state.end) return;
  stepShake(setup, state, dt);
  const h = state.hideout;
  if (state.player.damage >= 1) endChase(state, 'caught');
  else if (state.contact >= CATCH_SECONDS) endChase(state, 'caught');
  else if (h && dist(state.player.x, state.player.z, h.x, h.z) < HIDEOUT_RADIUS) endChase(state, 'escaped');
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
