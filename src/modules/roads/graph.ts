// Straßengraphen: dekodiert die Netze der Städte (network.ts, network-hamburg.ts, network-berlin.ts,
// network-muenchen.ts, network-frankfurt.ts), findet die nächste Straße zu einem Punkt (Raster-Index) und sucht Routen mit A*. Reine Rechnung ohne Zufall und ohne DOM, damit Simulation und Karte
// dieselben Routen bekommen. Kosten = Fahrzeit (Länge geteilt durch das Tempo der Straßenart), Ergebnis = Weg und
// Länge in Metern. Jede Stadt hat ihr eigenes Netz (Auftrag 30); es wird erst beim ersten Gebrauch dekodiert.

import type { LngLat } from '../../core';
import * as koeln from './network';
import * as berlin from './network-berlin';
import * as frankfurt from './network-frankfurt';
import * as hamburg from './network-hamburg';
import * as muenchen from './network-muenchen';

export type RoadClass = (typeof koeln.ROAD_CLASSES)[number];
const ROAD_CLASSES: readonly RoadClass[] = koeln.ROAD_CLASSES;

/** Tempo pro Straßenart in km/h (nur für die Routenwahl: große Straßen werden bevorzugt). */
export const ROAD_SPEEDS: Record<RoadClass, number> = {
  motorway: 110,
  trunk: 70,
  primary: 50,
  secondary: 45,
  tertiary: 40,
  unclassified: 30,
  residential: 25,
  living_street: 10,
};

interface NetworkData {
  /** Kennung der Stadt (wie im Modul city). */
  id: string;
  /** Ausschnitt [West, Süd, Ost, Nord]. */
  box: readonly [number, number, number, number];
  lat0: number;
  nodes: string;
  edges: string;
  /** Autobahn-Zufahrten (ROAD_APPROACHES). */
  approaches: readonly { ref: string; toward: string; path: string }[];
}

/** Die Netze der Städte. Eine neue Stadt: Netz mit tools/build-roads.py --city erzeugen und hier eintragen. */
const NETWORKS: readonly NetworkData[] = [
  {
    id: 'koeln',
    box: koeln.ROAD_BOX,
    lat0: koeln.ROAD_LAT0,
    nodes: koeln.ROAD_NODES,
    edges: koeln.ROAD_EDGES,
    approaches: koeln.ROAD_APPROACHES,
  },
  {
    id: 'hamburg',
    box: hamburg.ROAD_BOX,
    lat0: hamburg.ROAD_LAT0,
    nodes: hamburg.ROAD_NODES,
    edges: hamburg.ROAD_EDGES,
    approaches: hamburg.ROAD_APPROACHES,
  },
  {
    id: 'berlin',
    box: berlin.ROAD_BOX,
    lat0: berlin.ROAD_LAT0,
    nodes: berlin.ROAD_NODES,
    edges: berlin.ROAD_EDGES,
    approaches: berlin.ROAD_APPROACHES,
  },
  {
    id: 'muenchen',
    box: muenchen.ROAD_BOX,
    lat0: muenchen.ROAD_LAT0,
    nodes: muenchen.ROAD_NODES,
    edges: muenchen.ROAD_EDGES,
    approaches: muenchen.ROAD_APPROACHES,
  },
  {
    id: 'frankfurt',
    box: frankfurt.ROAD_BOX,
    lat0: frankfurt.ROAD_LAT0,
    nodes: frankfurt.ROAD_NODES,
    edges: frankfurt.ROAD_EDGES,
    approaches: frankfurt.ROAD_APPROACHES,
  },
];

/** Netz, in dessen Ausschnitt der Punkt liegt (null = außerhalb aller Städte). */
export function networkAt(point: LngLat): string | null {
  for (const net of NETWORKS) {
    const [w, s, e, n] = net.box;
    if (point.lng >= w && point.lng <= e && point.lat >= s && point.lat <= n) return net.id;
  }
  return null;
}

/** Netz mit dem nächsten Ausschnitt (für Punkte außerhalb aller Städte). */
export function nearestNetwork(point: LngLat): string {
  let best = NETWORKS[0].id;
  let bestDist = Infinity;
  for (const net of NETWORKS) {
    const [w, s, e, n] = net.box;
    const dx = Math.max(w - point.lng, 0, point.lng - e);
    const dy = Math.max(s - point.lat, 0, point.lat - n);
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = net.id;
    }
  }
  return best;
}

/** Kennungen aller Netze. */
export function networkIds(): string[] {
  return NETWORKS.map((n) => n.id);
}

const M_LAT = 111_320;
/** Rastergröße des Index in Metern. */
const CELL = 150;
/** Weiter als so weit von einer Straße wird nicht gesucht (dann Luftlinie). */
const MAX_SNAP = 3000;
const MAX_SPEED = Math.max(...Object.values(ROAD_SPEEDS));

/** Zahlen im Polyline-Format (Google): vorzeichenbehaftet, 5 Bit pro Zeichen ab ASCII 63. */
export function decodeInts(text: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) - 63;
    value |= (c & 0x1f) << shift;
    if (c >= 0x20) {
      shift += 5;
      continue;
    }
    out.push(value & 1 ? ~(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return out;
}

interface Graph {
  id: string;
  /** Meter pro Grad Länge in der lokalen Projektion dieses Netzes. */
  mLng: number;
  nodeX: Float64Array;
  nodeY: Float64Array;
  edgeFrom: Int32Array;
  edgeTo: Int32Array;
  /** 1 = nur von edgeFrom nach edgeTo. */
  edgeOneway: Uint8Array;
  /** Kosten pro Meter (1 / Tempo-Faktor). */
  edgeWeight: Float64Array;
  edgeLength: Float64Array;
  edgeClass: Uint8Array;
  /** Stützpunkte jeder Kante inklusive Anfang und Ende, in Metern: shape[shapeStart[e] … shapeStart[e + 1]). */
  shapeStart: Int32Array;
  shapeX: Float64Array;
  shapeY: Float64Array;
  /** Laufende Länge bis zu jedem Stützpunkt, ab dem Anfang der Kante. */
  shapeDist: Float64Array;
  /** Abgehende Kanten pro Knoten (CSR). dir 1 = vorwärts (from → to), 0 = rückwärts. */
  adjStart: Int32Array;
  adjEdge: Int32Array;
  adjDir: Uint8Array;
  grid: Map<number, number[]>;
}

const graphs = new Map<string, Graph>();

const cellKey = (cx: number, cy: number) => cx * 100_000 + cy;
const toX = (g: Graph, lng: number) => lng * g.mLng;
const toY = (lat: number) => lat * M_LAT;
const toLngLat = (g: Graph, x: number, y: number): LngLat => ({
  lng: Math.round((x / g.mLng) * 1e6) / 1e6,
  lat: Math.round((y / M_LAT) * 1e6) / 1e6,
});

function build(net: NetworkData): Graph {
  const mLng = 111_320 * Math.cos((net.lat0 * Math.PI) / 180);
  const toX = (lng: number) => lng * mLng;
  const nodeInts = decodeInts(net.nodes);
  const n = nodeInts.length / 2;
  const nodeX = new Float64Array(n);
  const nodeY = new Float64Array(n);
  let qx = 0;
  let qy = 0;
  for (let i = 0; i < n; i++) {
    qx += nodeInts[2 * i];
    qy += nodeInts[2 * i + 1];
    nodeX[i] = toX(qx / 1e5);
    nodeY[i] = toY(qy / 1e5);
  }

  const ints = decodeInts(net.edges);
  const from: number[] = [];
  const to: number[] = [];
  const oneway: number[] = [];
  const cls: number[] = [];
  const shapeStart: number[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  const nodeQ = (i: number) => [Math.round((nodeX[i] / mLng) * 1e5), Math.round((nodeY[i] / M_LAT) * 1e5)];
  let pos = 0;
  let a = 0;
  while (pos < ints.length) {
    a += ints[pos++];
    const b = a + ints[pos++];
    const flags = ints[pos++];
    const count = ints[pos++];
    from.push(a);
    to.push(b);
    cls.push(flags >> 1);
    oneway.push(flags & 1);
    shapeStart.push(sx.length);
    sx.push(nodeX[a]);
    sy.push(nodeY[a]);
    let [lx, ly] = nodeQ(a);
    for (let k = 0; k < count; k++) {
      lx += ints[pos++];
      ly += ints[pos++];
      sx.push(toX(lx / 1e5));
      sy.push(toY(ly / 1e5));
    }
    sx.push(nodeX[b]);
    sy.push(nodeY[b]);
  }
  shapeStart.push(sx.length);

  const m = from.length;
  const shapeDist = new Float64Array(sx.length);
  const edgeLength = new Float64Array(m);
  const edgeWeight = new Float64Array(m);
  const grid = new Map<number, number[]>();
  for (let e = 0; e < m; e++) {
    let dist = 0;
    for (let k = shapeStart[e]; k < shapeStart[e + 1]; k++) {
      if (k > shapeStart[e]) {
        dist += Math.hypot(sx[k] - sx[k - 1], sy[k] - sy[k - 1]);
        // Kante in alle Rasterzellen eintragen, die das Teilstück berührt.
        const x0 = Math.floor(Math.min(sx[k], sx[k - 1]) / CELL);
        const x1 = Math.floor(Math.max(sx[k], sx[k - 1]) / CELL);
        const y0 = Math.floor(Math.min(sy[k], sy[k - 1]) / CELL);
        const y1 = Math.floor(Math.max(sy[k], sy[k - 1]) / CELL);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const key = cellKey(cx, cy);
            const list = grid.get(key);
            if (!list) grid.set(key, [e]);
            else if (list[list.length - 1] !== e) list.push(e);
          }
        }
      }
      shapeDist[k] = dist;
    }
    edgeLength[e] = dist;
    const speed = ROAD_SPEEDS[ROAD_CLASSES[cls[e]] ?? 'residential'] ?? 25;
    edgeWeight[e] = MAX_SPEED / speed;
  }

  // Nachbarschaft: jede Kante vorwärts, zweispurige auch rückwärts.
  const degree = new Int32Array(n + 1);
  for (let e = 0; e < m; e++) {
    degree[from[e]]++;
    if (!oneway[e]) degree[to[e]]++;
  }
  const adjStart = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + degree[i];
  const fill = adjStart.slice(0, n);
  const adjEdge = new Int32Array(adjStart[n]);
  const adjDir = new Uint8Array(adjStart[n]);
  for (let e = 0; e < m; e++) {
    adjEdge[fill[from[e]]] = e;
    adjDir[fill[from[e]]++] = 1;
    if (!oneway[e]) {
      adjEdge[fill[to[e]]] = e;
      adjDir[fill[to[e]]++] = 0;
    }
  }

  return {
    id: net.id,
    mLng,
    nodeX,
    nodeY,
    edgeFrom: Int32Array.from(from),
    edgeTo: Int32Array.from(to),
    edgeOneway: Uint8Array.from(oneway),
    edgeWeight,
    edgeLength,
    edgeClass: Uint8Array.from(cls),
    shapeStart: Int32Array.from(shapeStart),
    shapeX: Float64Array.from(sx),
    shapeY: Float64Array.from(sy),
    shapeDist,
    adjStart,
    adjEdge,
    adjDir,
    grid,
  };
}

function getGraph(networkId: string): Graph {
  let g = graphs.get(networkId);
  if (!g) {
    const net = NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0];
    g = graphs.get(net.id) ?? build(net);
    graphs.set(net.id, g);
    graphs.set(networkId, g);
  }
  return g;
}

/**
 * Lesesicht auf den Graphen (z.B. für den Verkehr als Kulisse in roads/ui): Knoten und Kanten in Metern einer lokalen
 * Projektion, Nachbarschaft als CSR (adjStart/adjEdge/adjDir, dir 1 = vorwärts). Nur lesen!
 */
export interface RoadGraphView {
  nodeX: Float64Array;
  nodeY: Float64Array;
  edgeFrom: Int32Array;
  edgeTo: Int32Array;
  edgeOneway: Uint8Array;
  edgeClass: Uint8Array;
  edgeLength: Float64Array;
  shapeStart: Int32Array;
  shapeX: Float64Array;
  shapeY: Float64Array;
  shapeDist: Float64Array;
  adjStart: Int32Array;
  adjEdge: Int32Array;
  adjDir: Uint8Array;
  /** Straßenart je Code (edgeClass). */
  classes: readonly RoadClass[];
  toLngLat(x: number, y: number): LngLat;
  toMeters(point: LngLat): [number, number];
}

/** Lesesicht auf das Netz einer Stadt (Standard Köln). */
export function graphView(networkId = NETWORKS[0].id): RoadGraphView {
  const g = getGraph(networkId);
  return {
    nodeX: g.nodeX,
    nodeY: g.nodeY,
    edgeFrom: g.edgeFrom,
    edgeTo: g.edgeTo,
    edgeOneway: g.edgeOneway,
    edgeClass: g.edgeClass,
    edgeLength: g.edgeLength,
    shapeStart: g.shapeStart,
    shapeX: g.shapeX,
    shapeY: g.shapeY,
    shapeDist: g.shapeDist,
    adjStart: g.adjStart,
    adjEdge: g.adjEdge,
    adjDir: g.adjDir,
    classes: ROAD_CLASSES,
    toLngLat: (x, y) => toLngLat(g, x, y),
    toMeters: (p) => [toX(g, p.lng), toY(p.lat)],
  };
}

/** Größe eines Netzes (für Tests und die Doku). */
export function networkSize(networkId = NETWORKS[0].id): { nodes: number; edges: number; meters: number } {
  const g = getGraph(networkId);
  return { nodes: g.nodeX.length, edges: g.edgeFrom.length, meters: g.edgeLength.reduce((a, b) => a + b, 0) };
}

/** Punkt auf einer Kante: Kante, Abstand vom Kantenanfang und Lage in Metern. */
export interface Snap {
  edge: number;
  offset: number;
  x: number;
  y: number;
  /** Abstand vom gesuchten Punkt zur Straße. */
  distance: number;
}

/** Nächster Punkt auf dem Straßennetz, null wenn weiter als MAX_SNAP entfernt. */
export function snapToRoad(point: LngLat, networkId = networkAt(point) ?? nearestNetwork(point)): Snap | null {
  return snapIn(getGraph(networkId), point);
}

function snapIn(g: Graph, point: LngLat): Snap | null {
  const px = toX(g, point.lng);
  const py = toY(point.lat);
  const cx = Math.floor(px / CELL);
  const cy = Math.floor(py / CELL);
  let best: Snap | null = null;
  const seen = new Set<number>();
  const maxRing = Math.ceil(MAX_SNAP / CELL);
  for (let r = 0; r <= maxRing; r++) {
    // Alles in Ring r ist mindestens (r - 1) Zellen weit weg.
    if (best && best.distance < (r - 1) * CELL) break;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const list = g.grid.get(cellKey(cx + dx, cy + dy));
        if (!list) continue;
        for (const e of list) {
          if (seen.has(e)) continue;
          seen.add(e);
          const snap = projectOnEdge(g, e, px, py);
          if (
            !best ||
            snap.distance < best.distance - 1e-9 ||
            (snap.distance <= best.distance + 1e-9 && e < best.edge)
          ) {
            best = snap;
          }
        }
      }
    }
  }
  return best && best.distance <= MAX_SNAP ? best : null;
}

function projectOnEdge(g: Graph, e: number, px: number, py: number): Snap {
  let best: Snap = {
    edge: e,
    offset: 0,
    x: g.shapeX[g.shapeStart[e]],
    y: g.shapeY[g.shapeStart[e]],
    distance: Infinity,
  };
  for (let k = g.shapeStart[e] + 1; k < g.shapeStart[e + 1]; k++) {
    const ax = g.shapeX[k - 1];
    const ay = g.shapeY[k - 1];
    const vx = g.shapeX[k] - ax;
    const vy = g.shapeY[k] - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    const x = ax + vx * t;
    const y = ay + vy * t;
    const distance = Math.hypot(px - x, py - y);
    if (distance < best.distance) {
      best = { edge: e, offset: g.shapeDist[k - 1] + Math.sqrt(len2) * t, x, y, distance };
    }
  }
  return best;
}

/** Stützpunkte einer Kante zwischen zwei Abständen vom Kantenanfang (auch rückwärts), ohne die Endpunkte. */
function slice(g: Graph, e: number, fromOffset: number, toOffset: number, emit: (x: number, y: number) => void): void {
  const start = g.shapeStart[e];
  const end = g.shapeStart[e + 1];
  if (fromOffset <= toOffset) {
    for (let k = start; k < end; k++) {
      if (g.shapeDist[k] > fromOffset && g.shapeDist[k] < toOffset) emit(g.shapeX[k], g.shapeY[k]);
    }
  } else {
    for (let k = end - 1; k >= start; k--) {
      if (g.shapeDist[k] < fromOffset && g.shapeDist[k] > toOffset) emit(g.shapeX[k], g.shapeY[k]);
    }
  }
}

/** Kleiner Min-Heap für A* (Knoten-ID mit Priorität). */
class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  /** Leeren, ohne die Arrays neu anzulegen (der Heap wird zwischen Suchen wiederverwendet). */
  clear(): void {
    this.ids.length = 0;
    this.keys.length = 0;
  }
  push(id: number, key: number): void {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] < key || (keys[p] === key && ids[p] <= id)) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop() as number;
    const lastKey = keys.pop() as number;
    if (ids.length > 0) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (keys[r] < keys[l] || (keys[r] === keys[l] && ids[r] < ids[l])) ? r : l;
        if (keys[c] > lastKey || (keys[c] === lastKey && ids[c] >= lastId)) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

export interface GraphRoute {
  /** Weg vom Startpunkt über die Straßen zum Ziel. */
  path: LngLat[];
  /** Länge auf der Straße (ohne die Wege zur Straße hin). */
  roadMeters: number;
  /** Gesamtlänge inklusive der Wege vom Punkt zur Straße und von der Straße zum Ziel. */
  meters: number;
  /** Index des ersten und letzten Punkts auf der Straße (davor und danach: zu Fuß zur Straße). */
  roadStart: number;
  roadEnd: number;
}

/**
 * Arbeitsspeicher der Suche pro Graph, über alle Suchen hinweg wiederverwendet (statt pro Aufruf Map und Set). Ein Eintrag
 * gilt nur, wenn sein Stempel die aktuelle Suche (generation) trägt; so muss nichts zurückgesetzt werden.
 */
interface Scratch {
  generation: number;
  /** Stempel: gScore, prevEdge und prevDir des Knotens gehören zur aktuellen Suche. */
  seen: Uint32Array;
  /** Stempel: Knoten ist abgeschlossen. */
  closed: Uint32Array;
  gScore: Float64Array;
  prevEdge: Int32Array;
  prevDir: Uint8Array;
  heap: Heap;
}

const scratches = new WeakMap<Graph, Scratch>();

function scratchFor(g: Graph): Scratch {
  const size = g.nodeX.length + 1; // plus virtueller Zielknoten
  let sc = scratches.get(g);
  if (!sc) {
    sc = {
      generation: 0,
      seen: new Uint32Array(size),
      closed: new Uint32Array(size),
      gScore: new Float64Array(size),
      prevEdge: new Int32Array(size),
      prevDir: new Uint8Array(size),
      heap: new Heap(),
    };
    scratches.set(g, sc);
  }
  if (sc.generation >= 0xffffffff) {
    // Zähler läuft über (nach über vier Milliarden Suchen): alle Stempel löschen, von vorn anfangen.
    sc.seen.fill(0);
    sc.closed.fill(0);
    sc.generation = 0;
  }
  sc.generation += 1;
  return sc;
}

/** Ergebnis der Suche ohne Weg: wie die Kanten aufeinander folgen. */
type Found =
  | { kind: 'sameEdge' }
  | {
      kind: 'chain';
      /** Kanten nach der Startkante bis zur Zielkante, in Fahrtrichtung (dir 1 = vorwärts). */
      chain: { edge: number; dir: number }[];
      /** Erster Knoten nach der Startkante. */
      firstNode: number;
      firstDir: number;
      /** Fahrtrichtung auf der Zielkante. */
      lastDir: number;
    };

/** Gewicht pro Straßenart (Auftrag 33): Faktor ≥ 1 auf die Fahrzeit, z.B. Autobahn meiden. Fehlt eine Art: 1. */
export type ClassWeights = Partial<Record<RoadClass, number>>;

const weightArrays = new Map<string, Float64Array>();

/** Gewichte als Faktor je Straßenart-Code (gemerkt), null ohne Gewichte. */
function classFactors(weights: ClassWeights | undefined): Float64Array | null {
  if (!weights) return null;
  const id = ROAD_CLASSES.map((c) => weights[c] ?? 1).join(',');
  let factors = weightArrays.get(id);
  if (!factors) {
    // Faktoren unter 1 würden die Schätzung von A* (Luftlinie) überholen: nie kleiner als 1.
    factors = Float64Array.from(ROAD_CLASSES.map((c) => Math.max(1, weights[c] ?? 1)));
    weightArrays.set(id, factors);
  }
  return factors;
}

/** A* zwischen zwei Punkten auf Kanten. null, wenn es keine Verbindung gibt. Mit factors: Gewicht je Straßenart. */
function search(g: Graph, s: Snap, t: Snap, factors: Float64Array | null = null): Found | null {
  const n = g.nodeX.length;
  const target = n; // virtueller Zielknoten
  const sc = scratchFor(g);
  const { seen, closed, gScore, prevEdge, prevDir, heap, generation } = sc;
  heap.clear();
  const w = (e: number) => (factors ? g.edgeWeight[e] * factors[g.edgeClass[e]] : g.edgeWeight[e]);
  const h = (node: number) => (node === target ? 0 : Math.hypot(g.nodeX[node] - t.x, g.nodeY[node] - t.y));

  const relax = (node: number, cost: number, edge: number, dir: number) => {
    if (seen[node] === generation && gScore[node] <= cost) return;
    seen[node] = generation;
    gScore[node] = cost;
    prevEdge[node] = edge;
    prevDir[node] = dir;
    heap.push(node, cost + h(node));
  };

  // Start auf Kante s.edge: vorwärts zum Ende, bei zweispurigen Kanten auch rückwärts zum Anfang.
  const se = s.edge;
  relax(g.edgeTo[se], (g.edgeLength[se] - s.offset) * w(se), -1, 1);
  if (!g.edgeOneway[se]) relax(g.edgeFrom[se], s.offset * w(se), -1, 0);
  // Start und Ziel auf derselben Kante: direkt, wenn die Richtung passt.
  if (se === t.edge) {
    if (t.offset >= s.offset) relax(target, (t.offset - s.offset) * w(se), -2, 1);
    else if (!g.edgeOneway[se]) relax(target, (s.offset - t.offset) * w(se), -2, 0);
  }

  const te = t.edge;
  while (heap.size > 0) {
    const node = heap.pop();
    if (closed[node] === generation) continue;
    closed[node] = generation;
    if (node === target) break;
    const cost = gScore[node];
    // Zielkante: vom Anfang vorwärts, bei zweispurigen auch vom Ende rückwärts.
    if (node === g.edgeFrom[te]) relax(target, cost + t.offset * w(te), te, 1);
    if (node === g.edgeTo[te] && !g.edgeOneway[te]) {
      relax(target, cost + (g.edgeLength[te] - t.offset) * w(te), te, 0);
    }
    for (let k = g.adjStart[node]; k < g.adjStart[node + 1]; k++) {
      const e = g.adjEdge[k];
      const dir = g.adjDir[k];
      const next = dir ? g.edgeTo[e] : g.edgeFrom[e];
      if (closed[next] === generation) continue;
      relax(next, cost + g.edgeLength[e] * w(e), e, dir);
    }
  }
  if (closed[target] !== generation) return null;

  // Rückweg: Kanten vom Ziel bis zum Start einsammeln.
  const lastEdge = prevEdge[target];
  const lastDir = prevDir[target];
  if (lastEdge === -2) return { kind: 'sameEdge' }; // Start und Ziel auf derselben Kante.
  const chain: { edge: number; dir: number }[] = [];
  let node = lastDir ? g.edgeFrom[lastEdge] : g.edgeTo[lastEdge];
  for (;;) {
    const edge = prevEdge[node];
    if (edge === -1) break;
    const dir = prevDir[node];
    chain.push({ edge, dir });
    node = dir ? g.edgeFrom[edge] : g.edgeTo[edge];
  }
  chain.reverse();
  // node ist jetzt der erste Knoten nach der Startkante.
  return { kind: 'chain', chain, firstNode: node, firstDir: prevDir[node], lastDir };
}

/**
 * Punkte der Straße (in Metern) in Fahrtrichtung, vom Startpunkt auf der Straße bis zum Zielpunkt auf der Straße. Wer
 * nur die Länge braucht, nimmt einen emit, der nichts speichert.
 */
function walkRoad(g: Graph, s: Snap, t: Snap, found: Found, emit: (x: number, y: number) => void): void {
  const se = s.edge;
  emit(s.x, s.y);
  if (found.kind === 'sameEdge') {
    slice(g, se, s.offset, t.offset, emit);
    emit(t.x, t.y);
    return;
  }
  slice(g, se, s.offset, found.firstDir ? g.edgeLength[se] : 0, emit);
  emit(g.nodeX[found.firstNode], g.nodeY[found.firstNode]);
  for (const { edge, dir } of found.chain) {
    const len = g.edgeLength[edge];
    slice(g, edge, dir ? 0 : len, dir ? len : 0, emit);
    const end = dir ? g.edgeTo[edge] : g.edgeFrom[edge];
    emit(g.nodeX[end], g.nodeY[end]);
  }
  const te = t.edge;
  slice(g, te, found.lastDir ? 0 : g.edgeLength[te], t.offset, emit);
  emit(t.x, t.y);
}

/**
 * Route zwischen zwei Punkten über das Straßennetz einer Stadt. null, wenn einer der Punkte zu weit weg von jeder
 * Straße dieses Netzes ist.
 */
export function findRoute(
  fromPoint: LngLat,
  toPoint: LngLat,
  networkId: string,
  weights?: ClassWeights,
): GraphRoute | null {
  const g = getGraph(networkId);
  const s = snapIn(g, fromPoint);
  const t = snapIn(g, toPoint);
  if (!s || !t) return null;
  const found = search(g, s, t, classFactors(weights));
  if (!found) return null;
  const points: [number, number][] = [];
  walkRoad(g, s, t, found, (x, y) => points.push([x, y]));
  return finish(g, points, fromPoint, toPoint);
}

/**
 * Nur die Länge der Route in Metern (ungerundet), ohne den Weg als Liste zu bauen. Bitgleich mit
 * findRoute(...).meters: gleiche Punkte, gleiche Reihenfolge der Summanden. null wie bei findRoute.
 */
export function findRouteMeters(
  fromPoint: LngLat,
  toPoint: LngLat,
  networkId: string,
  weights?: ClassWeights,
): number | null {
  const g = getGraph(networkId);
  const s = snapIn(g, fromPoint);
  const t = snapIn(g, toPoint);
  if (!s || !t) return null;
  const found = search(g, s, t, classFactors(weights));
  if (!found) return null;
  // Wie finish(): Punkte, die weniger als 0,5 m vom letzten behaltenen entfernt sind, entfallen.
  let meters = 0;
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  let count = 0;
  const add = (x: number, y: number) => {
    if (count === 0) {
      count = 1;
    } else if (Math.hypot(lastX - x, lastY - y) > 0.5) {
      meters += Math.hypot(x - lastX, y - lastY);
      count++;
    } else {
      return;
    }
    lastX = x;
    lastY = y;
  };
  add(toX(g, fromPoint.lng), toY(fromPoint.lat));
  walkRoad(g, s, t, found, add);
  add(toX(g, toPoint.lng), toY(toPoint.lat));
  return meters;
}

function finish(g: Graph, road: [number, number][], fromPoint: LngLat, toPoint: LngLat): GraphRoute {
  const points: [number, number][] = [];
  const add = (p: [number, number]) => {
    const last = points[points.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.5) points.push(p);
  };
  add([toX(g, fromPoint.lng), toY(fromPoint.lat)]);
  // Liegt der Start (fast) auf der Straße, fällt der erste Straßenpunkt mit ihm zusammen.
  const roadStart = road.length > 0 && Math.hypot(points[0][0] - road[0][0], points[0][1] - road[0][1]) > 0.5 ? 1 : 0;
  let roadMeters = 0;
  for (let i = 0; i < road.length; i++) {
    if (i > 0) roadMeters += Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]);
    add(road[i]);
  }
  const roadEnd = points.length - 1;
  add([toX(g, toPoint.lng), toY(toPoint.lat)]);
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (points.length === 1) points.push(points[0]);
  return {
    path: points.map(([x, y]) => toLngLat(g, x, y)),
    roadMeters,
    meters,
    roadStart,
    roadEnd: Math.max(roadStart, roadEnd),
  };
}

/** Punkt auf der Straße als Grad (zu snapToRoad). */
export function snapToLngLat(snap: Snap, networkId: string): LngLat {
  return toLngLat(getGraph(networkId), snap.x, snap.y);
}

/** Mitte eines Netzes (Mittelwert aller Knoten), z.B. um die Richtung einer Autobahn-Zufahrt zu bestimmen. */
export function networkCenter(networkId: string): LngLat {
  const g = getGraph(networkId);
  let x = 0;
  let y = 0;
  for (let i = 0; i < g.nodeX.length; i++) {
    x += g.nodeX[i];
    y += g.nodeY[i];
  }
  const n = Math.max(1, g.nodeX.length);
  return toLngLat(g, x / n, y / n);
}

/** Linie im Polyline-Format (erster Punkt absolut, dann Abstände, 1e-5 Grad) als Punkte. */
export function decodeLine(text: string): LngLat[] {
  const ints = decodeInts(text);
  const path: LngLat[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < ints.length; i += 2) {
    x += ints[i];
    y += ints[i + 1];
    path.push({ lng: x / 1e5, lat: y / 1e5 });
  }
  return path;
}

/** Autobahn-Zufahrten eines Netzes: Weg vom Rand des Ausschnitts bis zum ersten Knoten im Netz. */
export function decodeApproaches(networkId: string): { ref: string; toward: string; path: LngLat[] }[] {
  const net = NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0];
  return net.approaches.map((a) => ({ ref: a.ref, toward: a.toward, path: decodeLine(a.path) }));
}

/** Knoten an Autobahnen eines Netzes (Einfahrt für Lieferungen von außerhalb), der dem Punkt am nächsten liegt. */
export function nearestMotorwayNode(point: LngLat, networkId: string): LngLat | null {
  const g = getGraph(networkId);
  const px = toX(g, point.lng);
  const py = toY(point.lat);
  const motorway = ROAD_CLASSES.indexOf('motorway');
  let best = -1;
  let bestDist = Infinity;
  for (let e = 0; e < g.edgeFrom.length; e++) {
    if (g.edgeClass[e] !== motorway) continue;
    for (const node of [g.edgeFrom[e], g.edgeTo[e]]) {
      const d = Math.hypot(g.nodeX[node] - px, g.nodeY[node] - py);
      if (d < bestDist || (d === bestDist && node < best)) {
        bestDist = d;
        best = node;
      }
    }
  }
  return best >= 0 ? toLngLat(g, g.nodeX[best], g.nodeY[best]) : null;
}
