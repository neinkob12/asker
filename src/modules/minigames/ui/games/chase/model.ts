// Spiellogik der Verfolgungsjagd (Auftrag 44, Teil 1) als reines Modell: kein DOM, keine Karte, testbar mit Vitest.
//
// Man fährt auf dem echten Straßennetz der Stadt (net.ts): An jeder Kreuzung nimmt der Wagen den Abzweig, den man
// vorher gewählt hat (links, geradeaus, rechts), dazu Gas, Bremse und ein Turbo, der langsam nachlädt. Zu schnell in
// eine Kurve → Rutschen. Im Stand mit der Bremse: wenden.
//
// Streifen erscheinen nacheinander 300 bis 600 m entfernt (die erste direkt hinter dir) und suchen per A* den Weg zum
// Knoten vor dir. Sehen sie dich nicht mehr, fahren sie zur letzten bekannten Stelle und suchen dort. Ab mittlerer
// Schwierigkeit gibt es Straßensperren an Kreuzungen vor dir, dazu Zivilverkehr (Zusammenstöße bremsen) und nach
// 40 bis 60 s den Hubschrauber, dessen Lichtkegel dir mit Verzögerung folgt.
//
// Ziel: Sichtkontakt brechen und abtauchen (Ring füllt sich in ABTAUCHEN_SECONDS), im Versteck sofort. Gefasst, wenn eine
// Streife länger als CATCH_SECONDS dicht bei dir ist, während du langsam bist, oder die Zeit abläuft.
//
// Inhalte (Startrichtung, Verstecke, Orte der Streifen) kommen aus dem Seed der Challenge (createRng). Die Zeit kommt
// von außen (dt in echten Sekunden), deshalb hängt der Verlauf von der Bildrate ab: Nur der Score geht an den Kern.

import { createRng } from '../../../../../core';
import {
  type Branch,
  branchesAfter,
  type ChaseNet,
  cornerSpeed,
  direction,
  endNode,
  findPath,
  type Leg,
  legLength,
  nearestNode,
  pickBranch,
  pointOn,
  reverse,
  roadClass,
  startNode,
  type TurnChoice,
  topSpeed,
} from './net';

// ---------------------------------------------------------------------------------------------- Stellschrauben

/** Zeit bis die Streife dich sicher hat (Sekunden). */
export const TIME_LIMIT = 120;
/** So lange ohne Sichtkontakt, dann bist du weg (Sekunden). */
export const ABTAUCHEN_SECONDS = 8;
/** Sichtweite der Streife in Metern (leicht bis schwer). */
export const SIGHT_RANGE = { min: 150, max: 200 };
/** So nah sieht dich jede Streife, egal wohin sie schaut (Meter). */
export const NEAR_SIGHT = 55;
/** Kegel nach vorne, in dem eine Streife dich weiter weg sieht (Kosinus, etwa ±22 Grad). */
export const SIGHT_CONE = 0.93;
/** Gefasst: Streife näher als CATCH_DISTANCE, du langsamer als CATCH_SPEED, und das länger als CATCH_SECONDS. */
export const CATCH_DISTANCE = 12;
export const CATCH_SPEED = 15 / 3.6;
export const CATCH_SECONDS = 1.5;
/** Turbo: so viel schneller, so lange voll (Sekunden), so lange zum Nachladen (Sekunden). */
export const TURBO_FACTOR = 1.35;
export const TURBO_SECONDS = 3;
export const TURBO_RECHARGE = 14;
/** Im Versteck, wenn näher als so viele Meter am Knoten. */
export const HIDEOUT_RADIUS = 22;
/** Lichtkegel des Hubschraubers: Radius in Metern, Tempo in m/s (schneller als das nur mit Turbo auf großen Straßen). */
export const HELI_RADIUS = 32;
export const HELI_SPEED = 23;
/** Ware aus dem Fenster: so lange schneller, so lange zögern die Streifen (Sekunden). */
export const DUMP_BOOST = 4;
export const DUMP_HESITATE = 3.5;
/** Zivilverkehr in der Nähe: so viele Wagen (wenig bis viel). */
export const CIVILIANS = { min: 10, max: 20 };

const ACCEL = 8.5;
/** Ohne Vollgas rollt der Wagen mit diesem Anteil des Höchsttempos (cruise). */
export const CRUISE = 0.8;
const TURBO_ACCEL = 13;
const BRAKE = 17;
const COAST = 2.2;
/** Im Stand die Bremse so lange halten, dann wird gewendet; das Wenden selbst dauert UTURN_SECONDS. */
const UTURN_HOLD = 0.35;
const UTURN_SECONDS = 1.1;
/** Rutschen: Tempo danach (Anteil), so lange kein Gas. */
const SKID_KEEP = 0.55;
const SKID_SECONDS = 0.8;
/** Spurversatz des Zivilverkehrs nach Straßenart (Meter rechts der Mitte): Auf kleinen Straßen wird es eng. */
const LANE_OFFSET: Record<string, number> = {
  motorway: 4,
  trunk: 3.5,
  primary: 3.2,
  secondary: 3,
  tertiary: 2.6,
  unclassified: 2,
  residential: 1.4,
  living_street: 0.8,
};
const BUMP_DISTANCE = 3.3;

// ---------------------------------------------------------------------------------------------- Typen

export type HideoutKind = 'warehouse' | 'garage' | 'yard';

export interface Hideout {
  id: string;
  kind: HideoutKind;
  label: string;
  node: number;
  x: number;
  y: number;
}

/** Ein Lager oder Ort, der als Versteck taugt (in Metern des Graphen). */
export interface HideoutSpot {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface ChaseOptions {
  seed: number;
  difficulty: number;
  /** Start in Metern des Graphen. */
  start: [number, number];
  /** Eigene Lager der Stadt (in Metern); weiter als 1,6 km zählen sie nicht. */
  warehouses?: readonly HideoutSpot[];
  /** Polizei-Uhr der Konfrontation (Runden, typisch 3 bis 5): weniger = Hubschrauber früher. */
  clock?: number;
  /** Am Handy: weniger Zivilverkehr. */
  mobile?: boolean;
}

export interface ChaseSetup {
  seed: number;
  difficulty: number;
  startLeg: Leg;
  cops: number;
  /** Ab hier kommt der Hubschrauber (Sekunden). */
  heliAt: number;
  sightRange: number;
  /** Tempo der Streife relativ zum Höchsttempo der Straße. */
  copFactor: number;
  roadblocks: number;
  civilians: number;
  hideouts: Hideout[];
}

export interface Mover {
  leg: Leg;
  /** Meter auf der Kante in Fahrtrichtung. */
  s: number;
  /** Tempo in m/s. */
  v: number;
  x: number;
  y: number;
  /** Kurs in Grad (0 = Norden). */
  heading: number;
}

export interface Player extends Mover {
  /** Gewählte Abbiegung für die nächste Kreuzung. */
  choice: TurnChoice;
  /** Turbo 0–1, läuft gerade? */
  turbo: number;
  turboOn: boolean;
  skid: number;
  stun: number;
  /** Wenden: Restzeit (Sekunden) und wie lange schon im Stand gebremst. */
  uturn: number;
  brakeHold: number;
  /** Bremse seit dem letzten Wenden losgelassen? */
  uturnArmed: boolean;
}

export interface Cop extends Mover {
  id: number;
  path: Leg[];
  repathIn: number;
  /** Erscheint erst ab dieser Zeit (Sekunden). */
  spawnAt: number;
  active: boolean;
  /** Sucht (ohne Sichtkontakt an der letzten bekannten Stelle angekommen). */
  searching: boolean;
  /** Vorbeirauschen an Zivilwagen bremst kurz. */
  slow: number;
}

export interface Civilian extends Mover {
  id: number;
  next: Leg | null;
  /** Steht nach einem Zusammenstoß (Sekunden). */
  stopped: number;
  /** Seitlicher Versatz (Meter, rechts positiv). */
  lane: number;
  color: number;
  cooldown: number;
}

export interface Roadblock {
  id: number;
  node: number;
  x: number;
  y: number;
  /** Kurs der Straße, auf der man kommt (die Wagen stehen quer dazu). */
  heading: number;
  until: number;
  hit: boolean;
}

export interface Heli {
  active: boolean;
  x: number;
  y: number;
  /** Lichtkegel auf dir? */
  onYou: boolean;
}

export type ChaseEventKind =
  | 'skid'
  | 'squeal'
  | 'bump'
  | 'crash'
  | 'uturn'
  | 'turn'
  | 'turbo'
  | 'dump'
  | 'cop'
  | 'heli'
  | 'roadblock'
  | 'spotted'
  | 'lost'
  | 'escaped'
  | 'caught';

export interface ChaseEvent {
  kind: ChaseEventKind;
  x: number;
  y: number;
  /** Stärke 0–1 (z.B. wie hart der Aufprall). */
  power: number;
}

export type ChaseEnd = 'escaped' | 'hideout' | 'caught' | 'time';

export interface ChaseState {
  t: number;
  player: Player;
  cops: Cop[];
  civilians: Civilian[];
  roadblocks: Roadblock[];
  heli: Heli;
  /** Sieht dich gerade jemand? */
  sight: boolean;
  /** Abstand zur nächsten Streife (Meter, Infinity ohne). */
  nearest: number;
  /** Abtauchen 0–1. */
  hide: number;
  /** Wie lange schon eine Streife dicht dran ist (für „gefasst“). */
  contact: number;
  /** Letzte bekannte Stelle (Knoten), zu der die Streifen fahren. */
  known: number;
  dumped: boolean;
  dumpUntil: number;
  hesitateUntil: number;
  /** Im Versteck (Index in setup.hideouts) oder -1. */
  inHideout: number;
  end: ChaseEnd | null;
  endAt: number;
  /** Ereignisse dieses Schritts (für Ton und Effekte), werden bei jedem Schritt geleert. */
  events: ChaseEvent[];
  /** Zähler für IDs und den Zufall der Kulisse (aus dem Seed). */
  nextId: number;
  nextRoadblockAt: number;
  roadblocksLeft: number;
  random: () => number;
}

export interface ChaseInput {
  /** Vollgas. */
  gas: boolean;
  brake: boolean;
  turbo: boolean;
  /** Ohne Gas mit CRUISE des Höchsttempos weiterrollen (Tastatur: ↑ ist dann Vollgas, man bleibt nie aus Versehen stehen). */
  cruise?: boolean;
}

/** Nächste echte Kreuzung vor dir: Abstand, Abzweige (Winkel) und welcher mit der Wahl genommen würde. */
export interface Upcoming {
  distance: number;
  node: number;
  branches: Branch[];
  chosen: Branch | null;
  /** Sicheres Tempo für den gewählten Abzweig (m/s). */
  safe: number;
  deadEnd: boolean;
}

// ---------------------------------------------------------------------------------------------- Aufbau

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function degree(net: ChaseNet, node: number): number {
  return net.adjStart[node + 1] - net.adjStart[node];
}

/** Ist das eine ruhige Ecke (nur Wohnstraßen am Knoten)? */
function quietNode(net: ChaseNet, node: number): boolean {
  for (let k = net.adjStart[node]; k < net.adjStart[node + 1]; k++) {
    const cls = roadClass(net, net.adjEdge[k]);
    if (cls !== 'residential' && cls !== 'living_street' && cls !== 'unclassified') return false;
  }
  return degree(net, node) >= 2;
}

/** Zufälliger Knoten im Ring [min, max] Meter um (x, y), der passt (oder -1). */
function nodeInRing(
  net: ChaseNet,
  random: () => number,
  x: number,
  y: number,
  min: number,
  max: number,
  ok: (node: number) => boolean,
): number {
  const g = net.g;
  for (let tries = 0; tries < 400; tries++) {
    const a = random() * Math.PI * 2;
    const r = lerp(min, max, random());
    const n = nearestNodeNear(net, x + Math.cos(a) * r, y + Math.sin(a) * r, 120);
    if (n < 0) continue;
    const d = Math.hypot(g.nodeX[n] - x, g.nodeY[n] - y);
    if (d >= min && d <= max && ok(n)) return n;
  }
  return -1;
}

/** Raster über die Knoten (für die Suche in der Nähe), einmal je Netz. */
const grids = new WeakMap<ChaseNet, Map<number, number[]>>();
const CELL = 100;
const cellKey = (cx: number, cy: number) => cx * 1_000_003 + cy;

function gridOf(net: ChaseNet): Map<number, number[]> {
  let grid = grids.get(net);
  if (!grid) {
    grid = new Map();
    const g = net.g;
    for (let n = 0; n < g.nodeX.length; n++) {
      if (degree(net, n) === 0) continue;
      const key = cellKey(Math.floor(g.nodeX[n] / CELL), Math.floor(g.nodeY[n] / CELL));
      const list = grid.get(key);
      if (list) list.push(n);
      else grid.set(key, [n]);
    }
    grids.set(net, grid);
  }
  return grid;
}

/** Nächster Knoten in höchstens radius Metern (oder -1). */
export function nearestNodeNear(net: ChaseNet, x: number, y: number, radius: number): number {
  const grid = gridOf(net);
  const g = net.g;
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = -1;
  let bestD = radius * radius;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const list = grid.get(cellKey(cx + dx, cy + dy));
      if (!list) continue;
      for (const n of list) {
        const d = (g.nodeX[n] - x) ** 2 + (g.nodeY[n] - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
  }
  return best;
}

const GARAGE_LABELS = ['Tiefgarage', 'Hinterhof', 'Parkhaus', 'Werkstatt-Hof'];

/** Feste Inhalte aus Seed, Schwierigkeit und Start. */
export function createChase(net: ChaseNet, options: ChaseOptions): ChaseSetup {
  const random = createRng(options.seed);
  const difficulty = clamp(options.difficulty, 0, 1);
  const g = net.g;
  const [sx, sy] = options.start;
  let node = nearestNodeNear(net, sx, sy, 600);
  if (node < 0 || degree(net, node) < 2) node = nearestNode(net, sx, sy);
  // Startrichtung: die größte Straße am Knoten (bei Gleichstand aus dem Seed).
  const options0: Leg[] = [];
  for (let k = net.adjStart[node]; k < net.adjStart[node + 1]; k++) {
    options0.push({ edge: net.adjEdge[k], dir: net.adjDir[k] });
  }
  const rank = (leg: Leg) => topSpeed(roadClass(net, leg.edge)) + legLength(net, leg) / 40 + random() * 4;
  options0.sort((a, b) => rank(b) - rank(a));
  const startLeg = options0[0];

  const hideouts: Hideout[] = [];
  for (const w of options.warehouses ?? []) {
    if (Math.hypot(w.x - sx, w.y - sy) > 1600) continue;
    const n = nearestNodeNear(net, w.x, w.y, 200);
    if (n < 0) continue;
    hideouts.push({ id: w.id, kind: 'warehouse', label: w.label, node: n, x: g.nodeX[n], y: g.nodeY[n] });
    if (hideouts.length >= 2) break;
  }
  const garages = 3 - Math.min(1, hideouts.length) - (difficulty > 0.7 ? 1 : 0);
  for (let i = 0; i < garages; i++) {
    const n = nodeInRing(net, random, sx, sy, 350, 900, (c) => {
      if (!quietNode(net, c)) return false;
      return hideouts.every((h) => Math.hypot(h.x - g.nodeX[c], h.y - g.nodeY[c]) > 250);
    });
    if (n < 0) continue;
    const kind: HideoutKind = i % 2 === 0 ? 'garage' : 'yard';
    const label = GARAGE_LABELS[(i + Math.floor(random() * GARAGE_LABELS.length)) % GARAGE_LABELS.length];
    hideouts.push({ id: `hideout:${i}`, kind, label, node: n, x: g.nodeX[n], y: g.nodeY[n] });
  }

  const clockRounds = Number.isFinite(options.clock) ? (options.clock as number) : 4;
  const heliAt = clamp(60 - difficulty * 14 - (4 - clockRounds) * 4, 40, 60);
  return {
    seed: options.seed,
    difficulty,
    startLeg,
    cops: Math.round(2 + 3 * difficulty),
    heliAt,
    sightRange: lerp(SIGHT_RANGE.min, SIGHT_RANGE.max, difficulty),
    copFactor: lerp(0.88, 1.02, difficulty),
    roadblocks: difficulty < 0.4 ? 0 : Math.round(1 + (difficulty - 0.4) * 3.4),
    civilians: Math.round(lerp(CIVILIANS.min, CIVILIANS.max, 0.5) * (options.mobile ? 0.7 : 1)),
    hideouts,
  };
}

function placeMover(net: ChaseNet, m: Mover): void {
  const p = pointOn(net, m.leg, m.s);
  const a = pointOn(net, m.leg, m.s - 4);
  const b = pointOn(net, m.leg, m.s + 4);
  m.x = p[0];
  m.y = p[1];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01) {
    m.heading = ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
  }
}

/** Ein Stück rückwärts von einer Stelle: Kante, auf der man dist Meter hinter (leg, s) wäre (in Fahrtrichtung). */
function behind(net: ChaseNet, leg: Leg, s: number, dist: number, random: () => number): { leg: Leg; s: number } {
  let cur = leg;
  let rest = dist - s;
  if (rest <= 0) return { leg: cur, s: s - dist };
  for (let i = 0; i < 20; i++) {
    const back = reverse(cur);
    const options = branchesAfter(net, back);
    if (options.length === 0) return { leg: cur, s: 0 };
    // Rückwärts möglichst geradeaus.
    const pick = pickBranch(options, random() < 0.7 ? 'straight' : random() < 0.5 ? 'left' : 'right');
    if (!pick) return { leg: cur, s: 0 };
    cur = reverse(pick.leg);
    const len = legLength(net, cur);
    if (rest <= len) return { leg: cur, s: len - rest };
    rest -= len;
  }
  return { leg: cur, s: 0 };
}

export function initChase(net: ChaseNet, setup: ChaseSetup): ChaseState {
  const random = createRng(setup.seed ^ 0x5eed);
  const player: Player = {
    leg: setup.startLeg,
    s: Math.min(6, legLength(net, setup.startLeg) / 3),
    v: 0,
    x: 0,
    y: 0,
    heading: 0,
    choice: 'straight',
    turbo: 1,
    turboOn: false,
    skid: 0,
    stun: 0,
    uturn: 0,
    brakeHold: 0,
    uturnArmed: true,
  };
  placeMover(net, player);
  const cops: Cop[] = [];
  for (let i = 0; i < setup.cops; i++) {
    const cop: Cop = {
      id: i + 1,
      leg: setup.startLeg,
      s: 0,
      v: 0,
      x: player.x,
      y: player.y,
      heading: player.heading,
      path: [],
      repathIn: 0.05 * i,
      // Die erste Streife steht schon hinter dir, die anderen kommen nach und nach dazu.
      spawnAt: i === 0 ? 0 : 3 + i * lerp(7, 4.5, setup.difficulty) + random() * 2,
      active: false,
      searching: false,
      slow: 0,
    };
    cops.push(cop);
  }
  const state: ChaseState = {
    t: 0,
    player,
    cops,
    civilians: [],
    roadblocks: [],
    heli: { active: false, x: player.x, y: player.y, onYou: false },
    sight: true,
    nearest: Infinity,
    hide: 0,
    contact: 0,
    known: endNode(net, player.leg),
    dumped: false,
    dumpUntil: -1,
    hesitateUntil: -1,
    inHideout: -1,
    end: null,
    endAt: -1,
    events: [],
    nextId: 100,
    nextRoadblockAt: 14 + random() * 6,
    roadblocksLeft: setup.roadblocks,
    random,
  };
  spawnCop(net, setup, state, cops[0]);
  state.nearest = Math.hypot(cops[0].x - player.x, cops[0].y - player.y);
  return state;
}

function emit(state: ChaseState, kind: ChaseEventKind, x: number, y: number, power = 1): void {
  state.events.push({ kind, x, y, power });
}

function spawnCop(net: ChaseNet, setup: ChaseSetup, state: ChaseState, cop: Cop): void {
  const p = state.player;
  if (cop.id === 1) {
    // Direkt hinter dir: Die Kontrolle, der du gerade davonfährst.
    const at = behind(net, p.leg, p.s, 55 + setup.difficulty * 25, state.random);
    cop.leg = at.leg;
    cop.s = at.s;
    cop.v = 4;
  } else {
    // Um die letzte bekannte Stelle (nicht um dich: Wer abgetaucht ist, soll es bleiben).
    const kx = net.g.nodeX[state.known];
    const ky = net.g.nodeY[state.known];
    const node = nodeInRing(net, state.random, kx, ky, 300, 600, (n) => degree(net, n) >= 2);
    if (node < 0) {
      cop.spawnAt = state.t + 2;
      return;
    }
    const k = net.adjStart[node] + Math.floor(state.random() * degree(net, node));
    cop.leg = { edge: net.adjEdge[k], dir: net.adjDir[k] };
    cop.s = 0;
    cop.v = topSpeed(roadClass(net, cop.leg.edge)) * 0.6;
  }
  cop.active = true;
  cop.path = [];
  cop.repathIn = 0;
  placeMover(net, cop);
  emit(state, 'cop', cop.x, cop.y);
}

// ---------------------------------------------------------------------------------------------- Abfragen

/** Nächste echte Kreuzung vor dir (Knoten mit mindestens zwei Abzweigen), höchstens 700 m weit. */
export function upcoming(net: ChaseNet, state: ChaseState): Upcoming {
  const p = state.player;
  let leg = p.leg;
  let distance = legLength(net, leg) - p.s;
  for (let i = 0; i < 30 && distance < 700; i++) {
    const branches = branchesAfter(net, leg);
    if (branches.length !== 1) {
      const chosen = pickBranch(branches, p.choice);
      return {
        distance,
        node: endNode(net, leg),
        branches,
        chosen,
        safe: chosen ? cornerSpeed(chosen.angle) : 0,
        deadEnd: branches.length === 0,
      };
    }
    leg = branches[0].leg;
    distance += legLength(net, leg);
  }
  return { distance, node: endNode(net, leg), branches: [], chosen: null, safe: Infinity, deadEnd: false };
}

/**
 * Der Weg, den du mit der aktuellen Wahl nimmst: Punkte [x0, y0, x1, y1, …] alle step Meter von dir bis zur nächsten
 * Kreuzung und intoBranch Meter in den gewählten Abzweig (für die Linie auf der Straße).
 */
export function routeAhead(net: ChaseNet, state: ChaseState, step = 6, intoBranch = 22): number[] {
  const p = state.player;
  const out: number[] = [];
  const pt: [number, number] = [0, 0];
  let leg = p.leg;
  let s = p.s;
  for (let i = 0; i < 30 && out.length < 400; i++) {
    const len = legLength(net, leg);
    for (; s < len; s += step) {
      pointOn(net, leg, s, pt);
      out.push(pt[0], pt[1]);
    }
    const branches = branchesAfter(net, leg);
    if (branches.length === 0) break;
    const pick = pickBranch(branches, branches.length === 1 ? 'straight' : p.choice) as Branch;
    if (branches.length > 1) {
      const into = Math.min(intoBranch, legLength(net, pick.leg));
      for (let d = 0; d <= into; d += step) {
        pointOn(net, pick.leg, d, pt);
        out.push(pt[0], pt[1]);
      }
      break;
    }
    s -= len;
    leg = pick.leg;
  }
  return out;
}

/** Restzeit in Sekunden. */
export function timeLeft(state: ChaseState): number {
  return Math.max(0, TIME_LIMIT - state.t);
}

/** Score: entkommen 0,6 + 0,4 · übrige Zeit; gefasst 0,05 bis 0,4 nach überstandener Zeit. */
export function chaseScore(state: ChaseState): number {
  if (state.end === 'escaped' || state.end === 'hideout')
    return clamp(0.6 + 0.4 * (timeLeft(state) / TIME_LIMIT), 0, 1);
  return clamp(0.05 + 0.35 * Math.min(1, state.endAt / TIME_LIMIT), 0.05, 0.4);
}

export function chasePicks(state: ChaseState): string[] {
  const picks: string[] = [];
  if (state.dumped) picks.push('dumped');
  if (state.end === 'hideout') picks.push('hideout');
  if (state.end === 'time') picks.push('time');
  return picks;
}

export function escaped(state: ChaseState): boolean {
  return state.end === 'escaped' || state.end === 'hideout';
}

// ---------------------------------------------------------------------------------------------- Eingaben

/** Abbiegung für die nächste Kreuzung wählen (dieselbe Seite noch einmal: zurück auf geradeaus). */
export function choose(state: ChaseState, choice: TurnChoice): void {
  const p = state.player;
  p.choice = p.choice === choice && choice !== 'straight' ? 'straight' : choice;
}

/** Ware aus dem Fenster: einmal, kurz schneller, die Streifen zögern. */
export function dumpGoods(state: ChaseState): boolean {
  if (state.dumped || state.end) return false;
  state.dumped = true;
  state.dumpUntil = state.t + DUMP_BOOST;
  state.hesitateUntil = state.t + DUMP_HESITATE;
  emit(state, 'dump', state.player.x, state.player.y);
  return true;
}

// ---------------------------------------------------------------------------------------------- Schritt

/** Weiterfahren über Kantengrenzen; onNode entscheidet am Ende einer Kante, wie es weitergeht (null = stehen). */
function advance(net: ChaseNet, m: Mover, dist: number, onNode: (from: Leg) => Leg | null): boolean {
  let move = dist;
  for (let i = 0; i < 12 && move > 0; i++) {
    const rest = legLength(net, m.leg) - m.s;
    if (move < rest) {
      m.s += move;
      return true;
    }
    move -= rest;
    const next = onNode(m.leg);
    if (!next) {
      m.s = legLength(net, m.leg);
      return false;
    }
    m.leg = next;
    m.s = 0;
  }
  return true;
}

function stepPlayer(net: ChaseNet, state: ChaseState, input: ChaseInput, dt: number): void {
  const p = state.player;
  const cls = roadClass(net, p.leg.edge);
  p.skid = Math.max(0, p.skid - dt);
  p.stun = Math.max(0, p.stun - dt);

  // Turbo: halten verbraucht, sonst lädt er nach.
  const wantTurbo = input.turbo && p.turbo > 0.02 && p.stun <= 0 && p.uturn <= 0;
  if (wantTurbo && !p.turboOn) emit(state, 'turbo', p.x, p.y);
  p.turboOn = wantTurbo;
  p.turbo = clamp(p.turbo + (wantTurbo ? -dt / TURBO_SECONDS : dt / TURBO_RECHARGE), 0, 1);

  // Wenden.
  if (p.uturn > 0) {
    p.uturn -= dt;
    p.v = 0;
    if (p.uturn <= 0) p.uturn = 0;
    return;
  }
  if (!input.brake) p.uturnArmed = true;
  if (input.brake && p.v < 0.8 && p.uturnArmed) {
    p.brakeHold += dt;
    if (p.brakeHold >= UTURN_HOLD) {
      p.brakeHold = 0;
      const len = legLength(net, p.leg);
      p.leg = reverse(p.leg);
      p.s = Math.max(0, len - p.s);
      p.v = 0;
      p.uturn = UTURN_SECONDS;
      // Noch einmal wenden erst nach Loslassen der Bremse (sonst dreht man sich im Kreis).
      p.uturnArmed = false;
      p.choice = 'straight';
      emit(state, 'uturn', p.x, p.y);
      return;
    }
  } else {
    p.brakeHold = 0;
  }

  const boost = state.t < state.dumpUntil ? 1.15 : 1;
  const cap = topSpeed(cls) * (p.turboOn ? TURBO_FACTOR : 1) * boost;
  let a: number;
  if (p.stun > 0) a = -BRAKE;
  else if (input.brake) a = -BRAKE;
  else if (p.v > cap) a = -6;
  else if ((input.gas || (input.cruise && p.v < cap * CRUISE)) && p.skid <= 0) {
    a = (p.turboOn ? TURBO_ACCEL : ACCEL) * Math.sqrt(Math.max(0, 1 - p.v / cap));
  } else a = -COAST;
  p.v = clamp(p.v + a * dt, 0, Math.max(cap, p.v));

  advance(net, p, p.v * dt, (from) => {
    const branches = branchesAfter(net, from);
    const node = endNode(net, from);
    const block = state.roadblocks.find((b) => b.node === node && !b.hit && b.until > state.t);
    if (block) {
      block.hit = true;
      const power = clamp(p.v / 25, 0.3, 1);
      p.v = 0;
      p.stun = 1.3;
      p.s = Math.max(0, legLength(net, from) - 7);
      emit(state, 'crash', block.x, block.y, power);
      return null;
    }
    if (branches.length === 0) {
      // Sackgasse: stehen bleiben (wenden mit der Bremse).
      if (p.v > 3) emit(state, 'bump', p.x, p.y, 0.3);
      p.v = 0;
      return null;
    }
    const pick = pickBranch(branches, branches.length === 1 ? 'straight' : p.choice) as Branch;
    if (branches.length > 1) {
      p.choice = 'straight';
      emit(state, 'turn', p.x, p.y, Math.abs(pick.angle) / Math.PI);
    }
    const safe = cornerSpeed(pick.angle);
    if (p.v > safe * 1.15) {
      p.v = safe * SKID_KEEP + (p.v - safe) * 0.15;
      p.skid = SKID_SECONDS;
      emit(state, 'skid', p.x, p.y, clamp((p.v - safe) / 10 + 0.5, 0.4, 1));
    } else if (p.v > safe * 0.85 && Math.abs(pick.angle) > 0.5) {
      emit(state, 'squeal', p.x, p.y, 0.5);
    }
    return pick.leg;
  });
  placeMover(net, p);
}

function nodeAhead(net: ChaseNet, state: ChaseState): number {
  return endNode(net, state.player.leg);
}

function stepCops(net: ChaseNet, setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  const hesitate = state.t < state.hesitateUntil;
  const avoid = new Set<number>();
  for (const b of state.roadblocks) if (b.until > state.t) avoid.add(b.node);
  for (const cop of state.cops) {
    if (!cop.active) {
      if (state.t >= cop.spawnAt) spawnCop(net, setup, state, cop);
      continue;
    }
    cop.slow = Math.max(0, cop.slow - dt);
    const sameEdge = cop.leg.edge === p.leg.edge;
    const target = state.sight ? nodeAhead(net, state) : state.known;
    cop.repathIn -= dt;
    if (cop.repathIn <= 0) {
      cop.repathIn = 0.3 + ((cop.id * 0.037) % 0.2);
      const from = endNode(net, cop.leg);
      const path = findPath(net, from, target, 5000, avoid);
      cop.path = path ?? [];
      // Ohne Sicht an der letzten bekannten Stelle angekommen: suchen (zufällig weiter).
      cop.searching = !state.sight && from === state.known;
    }
    // Tempo: Straße × Faktor, weiter weg etwas schneller (sie holen auf), dicht hinter dir so schnell wie du.
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy);
    let cap = topSpeed(roadClass(net, cop.leg.edge)) * setup.copFactor * (dist > 450 ? 1.2 : 1);
    if (cop.searching) cap *= 0.55;
    if (hesitate) cap *= 0.45;
    if (cop.slow > 0) cap *= 0.6;
    // Dicht hinter dir: nicht auffahren.
    const rad = (cop.heading * Math.PI) / 180;
    const ahead = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (dist < 10 && ahead > 0) cap = Math.min(cap, p.v + 0.5);
    // Vor der nächsten Kurve bremsen (die Streife fährt Kurven besser als du).
    const next = cop.path[0];
    if (next) {
      const toEnd = legLength(net, cop.leg) - cop.s;
      const [ix, iy] = direction(net, cop.leg, true);
      const [ox, oy] = direction(net, next, false);
      const angle = Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy);
      const safe = cornerSpeed(angle) * 1.45;
      if (toEnd < 40) cap = Math.min(cap, lerp(safe, cap, toEnd / 40));
    }
    // Auf deiner Kante dir entgegen: abbremsen und quer stellen (Blockade).
    if (sameEdge && cop.leg.dir !== p.leg.dir && dist < 35) cap = Math.min(cap, 1.5);
    const a = cop.v < cap ? 10 : -18;
    cop.v = clamp(cop.v + a * dt, 0, Math.max(cap, 0));
    advance(net, cop, cop.v * dt, (from) => {
      const step = cop.path.shift();
      if (step && startNode(net, step) === endNode(net, from)) return step;
      // Kein Weg (oder falscher Anschluss): möglichst geradeaus weiter, beim Suchen zufällig.
      const branches = branchesAfter(net, from);
      if (branches.length === 0) return reverse(from);
      if (cop.searching) return branches[Math.floor(state.random() * branches.length)].leg;
      const pick = pickBranch(branches, 'straight');
      return pick ? pick.leg : reverse(from);
    });
    placeMover(net, cop);
  }
}

const CIV_COLORS = 6;

function spawnCivilian(net: ChaseNet, state: ChaseState): Civilian | null {
  const p = state.player;
  const g = net.g;
  const n = nodeInRing(net, state.random, p.x, p.y, 90, 420, (c) => g.adjStart[c + 1] - g.adjStart[c] > 0);
  if (n < 0) return null;
  // Zivilverkehr fährt nur in erlaubter Richtung (CSR des Graphen).
  const count = g.adjStart[n + 1] - g.adjStart[n];
  const k = g.adjStart[n] + Math.floor(state.random() * count);
  const leg = { edge: g.adjEdge[k], dir: g.adjDir[k] };
  const cls = roadClass(net, leg.edge);
  if (cls === 'motorway') return null;
  const civ: Civilian = {
    id: state.nextId++,
    leg,
    s: state.random() * legLength(net, leg),
    v: topSpeed(cls) * 0.55,
    x: 0,
    y: 0,
    heading: 0,
    next: null,
    stopped: 0,
    lane: LANE_OFFSET[cls] ?? 2,
    color: Math.floor(state.random() * CIV_COLORS),
    cooldown: 0,
  };
  placeMover(net, civ);
  return civ;
}

/** Nächste Kante eines Zivilwagens: erlaubte Richtung, geradeaus bevorzugt. */
function civilianNext(net: ChaseNet, state: ChaseState, leg: Leg): Leg | null {
  const g = net.g;
  const node = endNode(net, leg);
  const [ix, iy] = direction(net, leg, true);
  let best: Leg | null = null;
  let bestW = -1;
  for (let k = g.adjStart[node]; k < g.adjStart[node + 1]; k++) {
    const cand = { edge: g.adjEdge[k], dir: g.adjDir[k] };
    if (cand.edge === leg.edge) continue;
    const [ox, oy] = direction(net, cand, false);
    const w = Math.exp(-((Math.acos(clamp(ix * ox + iy * oy, -1, 1)) / 0.8) ** 2)) + state.random() * 0.6;
    if (w > bestW) {
      bestW = w;
      best = cand;
    }
  }
  return best;
}

function stepCivilians(net: ChaseNet, setup: ChaseSetup, state: ChaseState, dt: number): void {
  const p = state.player;
  const list = state.civilians;
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.stopped > 0) {
      c.stopped -= dt;
      c.v = 0;
    } else {
      const cap = topSpeed(roadClass(net, c.leg.edge)) * 0.55;
      c.v = Math.min(cap, c.v + 4 * dt);
    }
    let gone = false;
    advance(net, c, c.v * dt, (from) => {
      const next = c.next ?? civilianNext(net, state, from);
      c.next = null;
      if (!next) gone = true;
      return next;
    });
    placeMover(net, c);
    // Spur: rechts versetzt.
    const rad = (c.heading * Math.PI) / 180;
    c.x += Math.cos(rad) * c.lane;
    c.y -= Math.sin(rad) * c.lane;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (gone || d > 560) {
      list.splice(i, 1);
      continue;
    }
    const prad = (p.heading * Math.PI) / 180;
    const inFront = (c.x - p.x) * Math.sin(prad) + (c.y - p.y) * Math.cos(prad) > -0.5;
    if (d < BUMP_DISTANCE && c.cooldown <= 0 && p.uturn <= 0 && inFront) {
      const power = clamp(Math.abs(p.v - c.v) / 20, 0.15, 1);
      // Der Wagen steht kurz und weicht an den Rand aus (sonst rammt man ihn immer wieder).
      c.cooldown = 4;
      c.stopped = 2.5;
      c.lane += c.lane >= 0 ? 2.5 : -2.5;
      if (p.v > 3) {
        p.v *= 0.42;
        p.skid = Math.max(p.skid, 0.35);
        emit(state, 'bump', (c.x + p.x) / 2, (c.y + p.y) / 2, power);
      }
    }
    for (const cop of state.cops) {
      if (cop.active && cop.slow <= 0 && Math.hypot(cop.x - c.x, cop.y - c.y) < BUMP_DISTANCE) cop.slow = 0.6;
    }
  }
  for (let n = 0; n < 2 && list.length < setup.civilians; n++) {
    const civ = spawnCivilian(net, state);
    if (civ) list.push(civ);
  }
}

/** Straßensperre an einer Kreuzung 120 bis 350 m vor dir (auf dem Weg, den du gerade nehmen würdest). */
function stepRoadblocks(net: ChaseNet, state: ChaseState): void {
  state.roadblocks = state.roadblocks.filter((b) => b.until > state.t);
  if (state.roadblocksLeft <= 0 || state.t < state.nextRoadblockAt) return;
  const p = state.player;
  let leg = p.leg;
  let distance = legLength(net, leg) - p.s;
  let junctions = 0;
  for (let i = 0; i < 30; i++) {
    const branches = branchesAfter(net, leg);
    if (branches.length === 0) break;
    if (branches.length > 1) junctions += 1;
    if (branches.length > 1 && distance >= 120 && junctions >= 2) {
      const node = endNode(net, leg);
      const [ix, iy] = direction(net, leg, true);
      state.roadblocks.push({
        id: state.nextId++,
        node,
        x: net.g.nodeX[node],
        y: net.g.nodeY[node],
        heading: ((Math.atan2(ix, iy) * 180) / Math.PI + 360) % 360,
        until: state.t + 32,
        hit: false,
      });
      state.roadblocksLeft -= 1;
      state.nextRoadblockAt = state.t + 16 + state.random() * 8;
      emit(state, 'roadblock', net.g.nodeX[node], net.g.nodeY[node]);
      return;
    }
    if (distance > 350) break;
    leg = (pickBranch(branches, 'straight') as Branch).leg;
    distance += legLength(net, leg);
  }
  state.nextRoadblockAt = state.t + 3;
}

function stepHeli(net: ChaseNet, setup: ChaseSetup, state: ChaseState, dt: number): void {
  const h = state.heli;
  const p = state.player;
  if (!h.active) {
    if (state.t < setup.heliAt) return;
    h.active = true;
    // Kommt von der Seite herein.
    h.x = p.x - 260;
    h.y = p.y + 200;
    emit(state, 'heli', h.x, h.y);
  }
  // Mit Sichtkontakt fliegt er dir nach, sonst sucht er im Kreis um die letzte bekannte Stelle.
  let tx = p.x;
  let ty = p.y;
  if (!state.sight) {
    const a = state.t * 0.7;
    tx = net.g.nodeX[state.known] + Math.cos(a) * 70;
    ty = net.g.nodeY[state.known] + Math.sin(a) * 70;
  }
  const dx = tx - h.x;
  const dy = ty - h.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, HELI_SPEED * dt);
  if (d > 0.01) {
    h.x += (dx / d) * step;
    h.y += (dy / d) * step;
  }
  h.onYou = Math.hypot(p.x - h.x, p.y - h.y) < HELI_RADIUS;
}

/**
 * Sieht diese Streife dich? Nah dran (NEAR_SIGHT) immer, weiter weg bis zur Sichtweite nur die Straße hinunter
 * (in einem schmalen Kegel vor ihr oder auf derselben Straße): Um die Ecke biegen bricht den Sichtkontakt.
 */
function sees(setup: ChaseSetup, cop: Cop, p: Player, d: number): boolean {
  if (d < NEAR_SIGHT) return true;
  if (d > setup.sightRange) return false;
  if (cop.leg.edge === p.leg.edge) return true;
  const rad = (cop.heading * Math.PI) / 180;
  const along = ((p.x - cop.x) * Math.sin(rad) + (p.y - cop.y) * Math.cos(rad)) / d;
  return along > SIGHT_CONE;
}

function finishChase(state: ChaseState, end: ChaseEnd): void {
  if (state.end) return;
  state.end = end;
  state.endAt = state.t;
  emit(state, end === 'caught' || end === 'time' ? 'caught' : 'escaped', state.player.x, state.player.y);
}

/** dt Sekunden weiter (echte Sekunden, vom Aufrufer gedeckelt). */
export function stepChase(net: ChaseNet, setup: ChaseSetup, state: ChaseState, input: ChaseInput, dt: number): void {
  state.events.length = 0;
  if (state.end || dt <= 0) return;
  state.t += dt;
  stepPlayer(net, state, input, dt);
  stepCops(net, setup, state, dt);
  stepCivilians(net, setup, state, dt);
  stepRoadblocks(net, state);
  stepHeli(net, setup, state, dt);

  const p = state.player;
  // Sichtkontakt: eine Streife sieht dich (nah dran oder die Straße hinunter) oder der Lichtkegel des Hubschraubers.
  let nearest = Infinity;
  let seen = state.heli.onYou;
  for (const cop of state.cops) {
    if (!cop.active) continue;
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    nearest = Math.min(nearest, d);
    if (!seen && sees(setup, cop, p, d)) seen = true;
  }
  for (const b of state.roadblocks) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < NEAR_SIGHT * 1.6) seen = true;
  }
  state.nearest = nearest;
  const sight = seen;
  if (sight !== state.sight) emit(state, sight ? 'spotted' : 'lost', p.x, p.y);
  state.sight = sight;
  if (sight) state.known = nodeAhead(net, state);

  state.inHideout = setup.hideouts.findIndex((h) => Math.hypot(h.x - p.x, h.y - p.y) < HIDEOUT_RADIUS);
  if (!sight && state.inHideout >= 0) {
    state.hide = 1;
    finishChase(state, 'hideout');
    return;
  }
  state.hide = clamp(state.hide + (sight ? -dt / 2 : dt / ABTAUCHEN_SECONDS), 0, 1);
  if (state.hide >= 1) {
    finishChase(state, 'escaped');
    return;
  }

  // Gefasst: Streife dicht dran, du langsam.
  const close = state.cops.some((c) => c.active && Math.hypot(c.x - p.x, c.y - p.y) < CATCH_DISTANCE);
  if (close && p.v < CATCH_SPEED) state.contact += dt;
  else state.contact = Math.max(0, state.contact - dt * 2);
  if (state.contact >= CATCH_SECONDS) {
    finishChase(state, 'caught');
    return;
  }
  if (state.t >= TIME_LIMIT) finishChase(state, 'time');
}

/** Für Tests und das Ende: sofort beenden. */
export function forceEnd(state: ChaseState, end: ChaseEnd): void {
  finishChase(state, end);
}
