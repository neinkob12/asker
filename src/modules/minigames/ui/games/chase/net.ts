// Straßennetz für die Verfolgungsjagd: Lesesicht auf roadGraph(cityId) aus roads, dazu eine ungerichtete Nachbarschaft
// (auf der Flucht und für die Streife gelten keine Einbahnstraßen), Punkte auf Kanten in Fahrtrichtung, Abzweige an
// Kreuzungen und eine A*-Suche auf festen Arrays (ohne Speicher pro Suche). Reine Rechnung ohne DOM und ohne Zufall.

import { ROAD_SPEEDS, type RoadClass, type RoadGraphView } from '../../../../roads';

/** Ein Stück Fahrt: Kante und Richtung (1 = von edgeFrom nach edgeTo, 0 = rückwärts). */
export interface Leg {
  edge: number;
  dir: number;
}

export interface ChaseNet {
  g: RoadGraphView;
  /** Alle Kanten an einem Knoten in beide Richtungen (CSR): adjStart[n] … adjStart[n + 1]. */
  adjStart: Int32Array;
  adjEdge: Int32Array;
  adjDir: Uint8Array;
  /** Meter pro Grad Länge der Projektion (für genaue Grad ohne Rundung). */
  mLng: number;
}

/** Meter pro Grad Breite (wie in roads). */
export const M_LAT = 111_320;

const nets = new WeakMap<RoadGraphView, ChaseNet>();

/** Netz der Verfolgungsjagd zu einem Graphen (einmal gebaut, dann gemerkt). */
export function chaseNet(g: RoadGraphView): ChaseNet {
  const known = nets.get(g);
  if (known) return known;
  const nodes = g.nodeX.length;
  const edges = g.edgeFrom.length;
  const count = new Int32Array(nodes + 1);
  for (let e = 0; e < edges; e++) {
    count[g.edgeFrom[e]] += 1;
    count[g.edgeTo[e]] += 1;
  }
  const adjStart = new Int32Array(nodes + 1);
  for (let n = 0; n < nodes; n++) adjStart[n + 1] = adjStart[n] + count[n];
  const fill = adjStart.slice(0, nodes);
  const adjEdge = new Int32Array(adjStart[nodes]);
  const adjDir = new Uint8Array(adjStart[nodes]);
  for (let e = 0; e < edges; e++) {
    const a = g.edgeFrom[e];
    const b = g.edgeTo[e];
    adjEdge[fill[a]] = e;
    adjDir[fill[a]++] = 1;
    if (b === a) continue;
    adjEdge[fill[b]] = e;
    adjDir[fill[b]++] = 0;
  }
  const [x1] = g.toMeters({ lng: 1, lat: 0 });
  const net: ChaseNet = { g, adjStart, adjEdge, adjDir, mLng: x1 };
  nets.set(g, net);
  return net;
}

/** Grad [lng, lat] eines Punkts in Metern (genau, ohne die Rundung von toLngLat). */
export function toLngLat(net: ChaseNet, x: number, y: number): [number, number] {
  return [x / net.mLng, y / M_LAT];
}

export function legLength(net: ChaseNet, leg: Leg): number {
  return net.g.edgeLength[leg.edge];
}

export function startNode(net: ChaseNet, leg: Leg): number {
  return leg.dir ? net.g.edgeFrom[leg.edge] : net.g.edgeTo[leg.edge];
}

export function endNode(net: ChaseNet, leg: Leg): number {
  return leg.dir ? net.g.edgeTo[leg.edge] : net.g.edgeFrom[leg.edge];
}

export function reverse(leg: Leg): Leg {
  return { edge: leg.edge, dir: leg.dir ? 0 : 1 };
}

export function sameLeg(a: Leg | null | undefined, b: Leg | null | undefined): boolean {
  return !!a && !!b && a.edge === b.edge && a.dir === b.dir;
}

export function roadClass(net: ChaseNet, edge: number): RoadClass {
  return net.g.classes[net.g.edgeClass[edge]] ?? 'residential';
}

/** Punkt d Meter in Fahrtrichtung ab dem Anfang der Kante (auf die Kante begrenzt). */
export function pointOn(net: ChaseNet, leg: Leg, d: number, out: [number, number] = [0, 0]): [number, number] {
  const g = net.g;
  const e = leg.edge;
  const len = g.edgeLength[e];
  const along = Math.min(len, Math.max(0, leg.dir ? d : len - d));
  let lo = g.shapeStart[e];
  let hi = g.shapeStart[e + 1] - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.shapeDist[mid] <= along) lo = mid;
    else hi = mid;
  }
  const span = g.shapeDist[hi] - g.shapeDist[lo];
  const f = span > 0 ? (along - g.shapeDist[lo]) / span : 0;
  out[0] = g.shapeX[lo] + (g.shapeX[hi] - g.shapeX[lo]) * f;
  out[1] = g.shapeY[lo] + (g.shapeY[hi] - g.shapeY[lo]) * f;
  return out;
}

const tmpA: [number, number] = [0, 0];
const tmpB: [number, number] = [0, 0];

/** Richtung (Einheitsvektor) am Ende (atEnd) bzw. am Anfang einer Kante in Fahrtrichtung, über bis zu 10 m gemittelt. */
export function direction(net: ChaseNet, leg: Leg, atEnd: boolean): [number, number] {
  const len = legLength(net, leg);
  const step = Math.min(10, len / 2);
  pointOn(net, leg, atEnd ? len - step : 0, tmpA);
  pointOn(net, leg, atEnd ? len : step, tmpB);
  const dx = tmpB[0] - tmpA[0];
  const dy = tmpB[1] - tmpA[1];
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

/** Kurs in Grad (0 = Norden, 90 = Osten) von a nach b. */
export function headingOf(ax: number, ay: number, bx: number, by: number): number {
  return ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
}

/** Ein Abzweig an einer Kreuzung: Kante und Winkel zur Fahrtrichtung (Bogenmaß, positiv = links). */
export interface Branch {
  leg: Leg;
  angle: number;
}

/** Abzweige am Ende von leg (ohne zurück auf derselben Kante). */
export function branchesAfter(net: ChaseNet, leg: Leg): Branch[] {
  const node = endNode(net, leg);
  const [ix, iy] = direction(net, leg, true);
  const out: Branch[] = [];
  for (let k = net.adjStart[node]; k < net.adjStart[node + 1]; k++) {
    const next = { edge: net.adjEdge[k], dir: net.adjDir[k] };
    if (next.edge === leg.edge) continue;
    const [ox, oy] = direction(net, next, false);
    out.push({ leg: next, angle: Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy) });
  }
  return out;
}

export type TurnChoice = 'left' | 'straight' | 'right';

/** Welcher Abzweig zur Wahl passt: geradeaus = kleinster Winkel; links/rechts = am nächsten an 90 Grad zur Seite. */
export function pickBranch(branches: readonly Branch[], choice: TurnChoice): Branch | null {
  if (branches.length === 0) return null;
  let straight = branches[0];
  for (const b of branches) if (Math.abs(b.angle) < Math.abs(straight.angle)) straight = b;
  if (choice === 'straight' || branches.length === 1) return straight;
  const sign = choice === 'left' ? 1 : -1;
  let best: Branch | null = null;
  for (const b of branches) {
    if (b.angle * sign < 0.3) continue;
    if (!best || Math.abs(Math.abs(b.angle) - Math.PI / 2) < Math.abs(Math.abs(best.angle) - Math.PI / 2)) best = b;
  }
  if (best) return best;
  // Keine echte Abbiegung zu der Seite: der Abzweig, der am weitesten zu ihr zeigt (sonst geradeaus).
  let side = straight;
  for (const b of branches) if (b.angle * sign > side.angle * sign) side = b;
  return side;
}

/** Höchsttempo auf einer Straßenart in m/s: ROAD_SPEEDS etwas schneller (im Spiel). */
export function topSpeed(cls: RoadClass): number {
  return (ROAD_SPEEDS[cls] * 1.3 + 25) / 3.6;
}

/** Wie schnell man um einen Winkel kommt (m/s): 90 Grad etwa 45 km/h, 135 Grad etwa 20 km/h, gerade unbegrenzt. */
export function cornerSpeed(angle: number): number {
  const c = Math.cos(Math.abs(angle) / 2);
  return 5 + 32 * c ** 4;
}

/** Nächster Knoten mit mindestens zwei Kanten zu einem Punkt (einfaches Durchsuchen, nur beim Start). */
export function nearestNode(net: ChaseNet, x: number, y: number, minDegree = 2): number {
  const g = net.g;
  let best = -1;
  let bestD = Infinity;
  for (let n = 0; n < g.nodeX.length; n++) {
    if (net.adjStart[n + 1] - net.adjStart[n] < minDegree) continue;
    const d = (g.nodeX[n] - x) ** 2 + (g.nodeY[n] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------- A*

interface Scratch {
  cost: Float64Array;
  via: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  heapNode: Int32Array;
  heapKey: Float64Array;
  round: number;
}

const scratches = new WeakMap<ChaseNet, Scratch>();

function scratchFor(net: ChaseNet): Scratch {
  let s = scratches.get(net);
  if (!s) {
    const n = net.g.nodeX.length;
    s = {
      cost: new Float64Array(n),
      via: new Int32Array(n),
      stamp: new Uint32Array(n),
      closed: new Uint32Array(n),
      heapNode: new Int32Array(net.adjEdge.length + 16),
      heapKey: new Float64Array(net.adjEdge.length + 16),
      round: 0,
    };
    scratches.set(net, s);
  }
  return s;
}

/**
 * Kürzester Weg (Meter) von Knoten from zu Knoten to als Folge von Kanten, höchstens maxExpand Knoten weit gesucht.
 * avoid: Knoten, die nicht befahren werden (Straßensperren). null ohne Weg.
 */
export function findPath(
  net: ChaseNet,
  from: number,
  to: number,
  maxExpand = 6000,
  avoid?: ReadonlySet<number>,
): Leg[] | null {
  if (from === to) return [];
  const g = net.g;
  const s = scratchFor(net);
  s.round += 1;
  const round = s.round;
  const tx = g.nodeX[to];
  const ty = g.nodeY[to];
  let size = 0;
  const push = (node: number, key: number) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (s.heapKey[p] <= key) break;
      s.heapNode[i] = s.heapNode[p];
      s.heapKey[i] = s.heapKey[p];
      i = p;
    }
    s.heapNode[i] = node;
    s.heapKey[i] = key;
  };
  const pop = (): number => {
    const top = s.heapNode[0];
    const lastNode = s.heapNode[--size];
    const lastKey = s.heapKey[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && s.heapKey[c + 1] < s.heapKey[c]) c += 1;
      if (s.heapKey[c] >= lastKey) break;
      s.heapNode[i] = s.heapNode[c];
      s.heapKey[i] = s.heapKey[c];
      i = c;
    }
    s.heapNode[i] = lastNode;
    s.heapKey[i] = lastKey;
    return top;
  };
  s.cost[from] = 0;
  s.stamp[from] = round;
  s.via[from] = -1;
  push(from, Math.hypot(g.nodeX[from] - tx, g.nodeY[from] - ty));
  let expanded = 0;
  while (size > 0) {
    const node = pop();
    if (s.closed[node] === round) continue;
    s.closed[node] = round;
    if (node === to) break;
    if (++expanded > maxExpand) return null;
    for (let k = net.adjStart[node]; k < net.adjStart[node + 1]; k++) {
      const e = net.adjEdge[k];
      const next = net.adjDir[k] ? g.edgeTo[e] : g.edgeFrom[e];
      if (avoid?.has(next) && next !== to) continue;
      const cost = s.cost[node] + g.edgeLength[e];
      if (s.stamp[next] === round && cost >= s.cost[next]) continue;
      s.stamp[next] = round;
      s.cost[next] = cost;
      s.via[next] = k;
      push(next, cost + Math.hypot(g.nodeX[next] - tx, g.nodeY[next] - ty));
    }
  }
  if (s.closed[to] !== round) return null;
  const path: Leg[] = [];
  for (let node = to; node !== from; ) {
    const k = s.via[node];
    const leg = { edge: net.adjEdge[k], dir: net.adjDir[k] };
    path.push(leg);
    node = startNode(net, leg);
  }
  return path.reverse();
}
