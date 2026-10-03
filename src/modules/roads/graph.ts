// Straßengraph: dekodiert network.ts, findet die nächste Straße zu einem Punkt (Raster-Index) und sucht Routen
// mit A*. Reine Rechnung ohne Zufall und ohne DOM, damit Simulation und Karte dieselben Routen bekommen.
// Kosten = Fahrzeit (Länge geteilt durch das Tempo der Straßenart), Ergebnis = Weg und Länge in Metern.

import type { LngLat } from '../../core';
import { ROAD_APPROACHES, ROAD_CLASSES, ROAD_EDGES, ROAD_NODES } from './network';

export type RoadClass = (typeof ROAD_CLASSES)[number];

/** Tempo pro Straßenart in km/h (nur für die Routenwahl: große Straßen werden bevorzugt). */
export const ROAD_SPEEDS: Record<RoadClass, number> = {
  motorway: 90,
  trunk: 70,
  primary: 50,
  secondary: 45,
  tertiary: 40,
  unclassified: 30,
  residential: 25,
  living_street: 10,
};

// Lokale Projektion in Meter (für Köln genau genug, wie im Werkzeug).
const LAT0 = 50.94;
const M_LAT = 111_320;
const M_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
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

let graph: Graph | null = null;

const toX = (lng: number) => lng * M_LNG;
const toY = (lat: number) => lat * M_LAT;
const toLngLat = (x: number, y: number): LngLat => ({
  lng: Math.round((x / M_LNG) * 1e6) / 1e6,
  lat: Math.round((y / M_LAT) * 1e6) / 1e6,
});
const cellKey = (cx: number, cy: number) => cx * 100_000 + cy;

function build(): Graph {
  const nodeInts = decodeInts(ROAD_NODES);
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

  const ints = decodeInts(ROAD_EDGES);
  const from: number[] = [];
  const to: number[] = [];
  const oneway: number[] = [];
  const cls: number[] = [];
  const shapeStart: number[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  const nodeQ = (i: number) => [Math.round((nodeX[i] / M_LNG) * 1e5), Math.round((nodeY[i] / M_LAT) * 1e5)];
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

function getGraph(): Graph {
  graph ??= build();
  return graph;
}

/** Größe des Netzes (für Tests und die Doku). */
export function networkSize(): { nodes: number; edges: number; meters: number } {
  const g = getGraph();
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
export function snapToRoad(point: LngLat): Snap | null {
  const g = getGraph();
  const px = toX(point.lng);
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
function slice(g: Graph, e: number, fromOffset: number, toOffset: number, out: [number, number][]): void {
  const start = g.shapeStart[e];
  const end = g.shapeStart[e + 1];
  if (fromOffset <= toOffset) {
    for (let k = start; k < end; k++) {
      if (g.shapeDist[k] > fromOffset && g.shapeDist[k] < toOffset) out.push([g.shapeX[k], g.shapeY[k]]);
    }
  } else {
    for (let k = end - 1; k >= start; k--) {
      if (g.shapeDist[k] < fromOffset && g.shapeDist[k] > toOffset) out.push([g.shapeX[k], g.shapeY[k]]);
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
  /** Weg in Metern-Koordinaten, vom Startpunkt über die Straßen zum Ziel. */
  points: [number, number][];
  /** Länge auf der Straße (ohne die Wege zur Straße hin). */
  roadMeters: number;
  /** Gesamtlänge inklusive der Wege vom Punkt zur Straße und von der Straße zum Ziel. */
  meters: number;
  /** Index des ersten und letzten Punkts auf der Straße (davor und danach: zu Fuß zur Straße). */
  roadStart: number;
  roadEnd: number;
}

/** Route zwischen zwei Punkten über das Straßennetz. null, wenn einer der Punkte zu weit weg von jeder Straße ist. */
export function findRoute(fromPoint: LngLat, toPoint: LngLat): GraphRoute | null {
  const g = getGraph();
  const s = snapToRoad(fromPoint);
  const t = snapToRoad(toPoint);
  if (!s || !t) return null;
  const n = g.nodeX.length;
  const target = n; // virtueller Zielknoten
  const gScore = new Map<number, number>();
  const prevEdge = new Map<number, number>();
  const prevDir = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new Heap();
  const h = (node: number) => (node === target ? 0 : Math.hypot(g.nodeX[node] - t.x, g.nodeY[node] - t.y));

  const relax = (node: number, cost: number, edge: number, dir: number) => {
    const old = gScore.get(node);
    if (old !== undefined && old <= cost) return;
    gScore.set(node, cost);
    prevEdge.set(node, edge);
    prevDir.set(node, dir);
    heap.push(node, cost + h(node));
  };

  // Start auf Kante s.edge: vorwärts zum Ende, bei zweispurigen Kanten auch rückwärts zum Anfang.
  const se = s.edge;
  relax(g.edgeTo[se], (g.edgeLength[se] - s.offset) * g.edgeWeight[se], -1, 1);
  if (!g.edgeOneway[se]) relax(g.edgeFrom[se], s.offset * g.edgeWeight[se], -1, 0);
  // Start und Ziel auf derselben Kante: direkt, wenn die Richtung passt.
  if (se === t.edge) {
    if (t.offset >= s.offset) relax(target, (t.offset - s.offset) * g.edgeWeight[se], -2, 1);
    else if (!g.edgeOneway[se]) relax(target, (s.offset - t.offset) * g.edgeWeight[se], -2, 0);
  }

  const te = t.edge;
  while (heap.size > 0) {
    const node = heap.pop();
    if (closed.has(node)) continue;
    closed.add(node);
    if (node === target) break;
    const cost = gScore.get(node) as number;
    // Zielkante: vom Anfang vorwärts, bei zweispurigen auch vom Ende rückwärts.
    if (node === g.edgeFrom[te]) relax(target, cost + t.offset * g.edgeWeight[te], te, 1);
    if (node === g.edgeTo[te] && !g.edgeOneway[te]) {
      relax(target, cost + (g.edgeLength[te] - t.offset) * g.edgeWeight[te], te, 0);
    }
    for (let k = g.adjStart[node]; k < g.adjStart[node + 1]; k++) {
      const e = g.adjEdge[k];
      const dir = g.adjDir[k];
      const next = dir ? g.edgeTo[e] : g.edgeFrom[e];
      if (closed.has(next)) continue;
      relax(next, cost + g.edgeLength[e] * g.edgeWeight[e], e, dir);
    }
  }
  if (!closed.has(target)) return null;

  // Rückweg: Kanten vom Ziel bis zum Start einsammeln.
  const chain: { edge: number; dir: number }[] = [];
  const lastEdge = prevEdge.get(target) as number;
  const lastDir = prevDir.get(target) as number;
  if (lastEdge === -2) {
    // Start und Ziel auf derselben Kante.
    const points: [number, number][] = [[s.x, s.y]];
    slice(g, se, s.offset, t.offset, points);
    points.push([t.x, t.y]);
    return finish(points, fromPoint, toPoint);
  }
  let node = lastDir ? g.edgeFrom[lastEdge] : g.edgeTo[lastEdge];
  for (;;) {
    const edge = prevEdge.get(node) as number;
    if (edge === -1) break;
    const dir = prevDir.get(node) as number;
    chain.push({ edge, dir });
    node = dir ? g.edgeFrom[edge] : g.edgeTo[edge];
  }
  chain.reverse();
  // node ist jetzt der erste Knoten nach der Startkante.
  const points: [number, number][] = [[s.x, s.y]];
  const firstDir = prevDir.get(node) as number;
  slice(g, se, s.offset, firstDir ? g.edgeLength[se] : 0, points);
  points.push([g.nodeX[node], g.nodeY[node]]);
  for (const { edge, dir } of chain) {
    const len = g.edgeLength[edge];
    slice(g, edge, dir ? 0 : len, dir ? len : 0, points);
    const end = dir ? g.edgeTo[edge] : g.edgeFrom[edge];
    points.push([g.nodeX[end], g.nodeY[end]]);
  }
  slice(g, te, lastDir ? 0 : g.edgeLength[te], t.offset, points);
  points.push([t.x, t.y]);
  return finish(points, fromPoint, toPoint);
}

function finish(road: [number, number][], fromPoint: LngLat, toPoint: LngLat): GraphRoute {
  const points: [number, number][] = [];
  const add = (p: [number, number]) => {
    const last = points[points.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.5) points.push(p);
  };
  add([toX(fromPoint.lng), toY(fromPoint.lat)]);
  // Liegt der Start (fast) auf der Straße, fällt der erste Straßenpunkt mit ihm zusammen.
  const roadStart = road.length > 0 && Math.hypot(points[0][0] - road[0][0], points[0][1] - road[0][1]) > 0.5 ? 1 : 0;
  let roadMeters = 0;
  for (let i = 0; i < road.length; i++) {
    if (i > 0) roadMeters += Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]);
    add(road[i]);
  }
  const roadEnd = points.length - 1;
  add([toX(toPoint.lng), toY(toPoint.lat)]);
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (points.length === 1) points.push(points[0]);
  return { points, roadMeters, meters, roadStart, roadEnd: Math.max(roadStart, roadEnd) };
}

/** Meter-Koordinaten zurück in Grad. */
export function pointsToLngLat(points: readonly [number, number][]): LngLat[] {
  return points.map(([x, y]) => toLngLat(x, y));
}

/** Mitte des Netzes (Mittelwert aller Knoten), z.B. um die Richtung einer Autobahn-Zufahrt zu bestimmen. */
export function networkCenter(): LngLat {
  const g = getGraph();
  let x = 0;
  let y = 0;
  for (let i = 0; i < g.nodeX.length; i++) {
    x += g.nodeX[i];
    y += g.nodeY[i];
  }
  const n = Math.max(1, g.nodeX.length);
  return toLngLat(x / n, y / n);
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

/** Autobahn-Zufahrten aus network.ts: Weg vom Rand des Ausschnitts bis zum ersten Knoten im Netz. */
export function decodeApproaches(): { ref: string; toward: string; path: LngLat[] }[] {
  return ROAD_APPROACHES.map((a) => ({ ref: a.ref, toward: a.toward, path: decodeLine(a.path) }));
}

/** Knoten an Autobahnen (Einfahrt für Lieferungen von außerhalb), der dem Punkt am nächsten liegt. */
export function nearestMotorwayNode(point: LngLat): LngLat | null {
  const g = getGraph();
  const px = toX(point.lng);
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
  return best >= 0 ? toLngLat(g.nodeX[best], g.nodeY[best]) : null;
}
