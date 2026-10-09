// Straßen: die echten Straßennetze der Städte (Köln, Hamburg; Autobahn bis Wohnstraße, aus OpenStreetMap über
// Overture Maps, ODbL) als Graphen, dazu das Autobahn-Netz zwischen den Städten (Auftrag 36: A1, A3, A3/A9, A24, A9,
// A7/A5 als Linien zwischen Köln, Hamburg, Berlin, München und Frankfurt; Routen gehen über den Graphen, auch über eine
// Stadt hinweg). Fahrzeuge fahren darauf statt
// Luftlinie, und Fahrzeiten in der Simulation kommen aus der Straßenlänge. Statische Daten, kein eigener Spielzustand.
// Daten neu erzeugen: tools/build-roads.py (Details in network.ts).
//
// Öffentliche API:
//   roadRoute(from, to, options?)  Route über die Straßen: { path (LngLat[], Start und Ziel inklusive), meters, drive
//                             (nur der Teil auf der Straße, dort fährt das Fahrzeug), walkFrom, walkTo (Fußwege) }.
//                             Das Netz wählt roads nach dem Ausschnitt, in dem Start und Ziel liegen; liegen sie in
//                             verschiedenen Städten, ist es die Route über die Autobahn (interCityRoute).
//   roadDistance(from, to, options?)  nur die Länge in Metern
//   travelMinutes(from, to, metersPerMinute, extra?, options?)  Fahrzeit in ganzen Spielminuten (zwischen Städten:
//                             Autobahn mit ROAD_SPEEDS.motorway, siehe interCityMinutes)
//   options (Auftrag 33): { weights } Gewicht pro Straßenart (Faktor ≥ 1 auf die Fahrzeit), z.B. AVOID_MOTORWAY für
//                             die Landstraße, nur innerhalb einer Stadt (mindestens COUNTRY_DETOUR so lange). Zwischen
//                             zwei Städten gibt es keine Landstraßen-Daten: Jede Fahrt nimmt die Autobahn
//                             (interCityRoute), Weg, Länge und Zeit sind für jede Wahl dieselben.
//   roadEntryFrom(far, via?, into?)  Autobahn-Einfahrt in die Stadt von into (Standard Köln) aus Richtung eines weit
//                             entfernten Orts (z.B. Frankfurt), optional über eine bestimmte Autobahn ('A3');
//                             roadApproach(far, via?, into?) mit dem ganzen Weg vom Rand des Ausschnitts bis dorthin,
//                             roadApproaches(cityId?) alle Zufahrten einer Stadt
//   nearestRoadPoint(point)   nächster Punkt auf einer Straße, networkSize(id?), networkStats(id?), ROAD_SPEEDS
//   roadNetworkAt(point)      Stadt, in deren Netz der Punkt liegt (null = außerhalb)
//   interCityRoute(from, to)  Weg zwischen zwei Städten (Auftrag 30, 36): Stadt-Anfahrt, Autobahn über das Netz (auch
//                             durch eine dritte Stadt), Stadt-Zufahrt
//                             ({ path, meters, motorwayMeters, onRoads, drive, walkFrom, walkTo, via, refs })
//   interCityMinutes(from, to, cityMetersPerMinute)  Fahrzeit dafür
//   autobahnBetween(a, b)     die direkte Autobahn zwischen zwei Städten als Linie, null wenn keine
//   autobahnPath(a, b)        kürzester Weg über das Autobahn-Netz: Abschnitte (Linien in Fahrtrichtung), Städte
//                             unterwegs, Meter; null ohne Verbindung
//   autobahnRefs(a, b)        Nummern auf diesem Weg, z.B. ['A 1', 'A 24']
//   autobahnLines()           alle Linien des Netzes (für die Karte)
//   shipRoute(cityId)         Weg eines Schiffs von außen bis zum Kai ('koeln': Rotterdam über Waal und Rhein,
//                             'hamburg': Elbe ab Cuxhaven), aus Overture-Daten (waterways.ts, tools/build-water.py)
//   shipMinutes(cityId)       Fahrzeit dieses Wegs mit SHIP_SPEED (nur zur Anzeige, die Lieferzeit kommt aus suppliers)
//   Seewege (Auftrag 41, seaways.ts aus Overture-Tiefen, tools/build-water.py --sea):
//   seaRoute(from, portId)    Weg eines Seeschiffs von einem Knoten (z.B. 'tanger') bis zum Liegeplatz eines Hafens
//                             der Hafen-Phase ('rotterdam', 'antwerpen', 'hamburg'): { path, km, nodes }, null ohne Weg
//   seaNodes(), seaLanes()    Knoten und Wege des Netzes (für die Karte), seaPorts() Häfen mit Weg vom Meer
//   roadGraph(cityId?)        Lesesicht auf den Graphen einer Stadt (Knoten, Kanten, Nachbarn in Metern), z.B. für
//                             den Verkehr
//
// Routen werden gemerkt (gleiche Punkte = gleiche Route), die Rechnung ist deterministisch.

import { defineModule, distanceMeters, type LngLat } from '../../core';
import { AUTOBAHNEN } from './autobahn';
import { SHIP_SPEED } from './config';
import {
  type ClassWeights,
  decodeApproaches,
  decodeLine,
  findRoute,
  findRouteMeters,
  type GraphRoute,
  nearestMotorwayNode,
  nearestNetwork,
  networkAt,
  networkCenter,
  networkIds,
  networkSize,
  ROAD_SPEEDS,
  snapToLngLat,
  snapToRoad,
} from './graph';

import { SEA_LANES, SEA_NODES, SEA_PORTS } from './seaways';
import { WATERWAYS } from './waterways';

export { SHIP_SPEED } from './config';
export {
  type ClassWeights,
  graphView as roadGraph,
  networkSize,
  ROAD_SPEEDS,
  type RoadClass,
  type RoadGraphView,
} from './graph';

/** Wahl der Strecke (Auftrag 33): Gewicht pro Straßenart, Standard ohne (schnellster Weg wie bisher). */
export interface RoadOptions {
  weights?: ClassWeights;
}

/** Autobahn und Schnellstraßen meiden (Landstraße): Sie zählen, als wären sie viel langsamer. */
export const AVOID_MOTORWAY: ClassWeights = { motorway: 8, trunk: 3 };

/**
 * Landstraße in der Stadt: dauert mindestens so viel länger als der schnellste Weg. Zwischen zwei Städten gilt das
 * nicht, dort fährt jede Fahrt die Autobahn (interCityRoute).
 */
export const COUNTRY_DETOUR = 1.2;

/** Kennung der Gewichte für die Caches ('' = ohne). */
function optionsKey(options?: RoadOptions): string {
  const w = options?.weights;
  if (!w) return '';
  return Object.entries(w)
    .filter(([, v]) => v !== undefined && v !== 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join(',');
}

/** Meidet diese Wahl die Autobahn (für die Fahrzeit in der Stadt)? */
function avoidsMotorway(options?: RoadOptions): boolean {
  return (options?.weights?.motorway ?? 1) > 1;
}

export interface RoadRoute {
  /** Weg vom Start über die Straßen zum Ziel (mindestens zwei Punkte). */
  path: LngLat[];
  /** Länge des Wegs in Metern. */
  meters: number;
  /** false, wenn es keine Straße in der Nähe gab und die Route Luftlinie ist. */
  onRoads: boolean;
  /**
   * Nur der Teil auf der Straße (mindestens zwei Punkte): Hier fährt ein Fahrzeug und hält an der Straße, die letzten
   * Meter geht man zu Fuß (walkFrom, walkTo). Ohne Straße die Luftlinie.
   */
  drive: LngLat[];
  /** Fußweg vom Start zur Straße und von der Straße zum Ziel, null = liegt auf der Straße. */
  walkFrom: [LngLat, LngLat] | null;
  walkTo: [LngLat, LngLat] | null;
}

/** So viele Routen bleiben im Speicher. */
const CACHE_SIZE = 600;
/** So viele reine Längen (ohne Weg) bleiben im Speicher, sie sind klein. */
const DISTANCE_CACHE_SIZE = 4000;
const cache = new Map<string, RoadRoute>();
const distances = new Map<string, number>();

/** Wert aus einem Cache holen und als zuletzt benutzt markieren (die Map merkt sich die Reihenfolge des Einfügens). */
function lruGet<V>(map: Map<string, V>, id: string): V | undefined {
  const value = map.get(id);
  if (value !== undefined) {
    map.delete(id);
    map.set(id, value);
  }
  return value;
}

/** Wert in einen Cache legen; ist er voll, fliegt der am längsten unbenutzte raus. */
function lruSet<V>(map: Map<string, V>, id: string, value: V, size: number): void {
  if (map.size >= size) map.delete(map.keys().next().value as string);
  map.set(id, value);
}

const key = (p: LngLat) => `${Math.round(p.lng * 1e5)},${Math.round(p.lat * 1e5)}`;

/** Stadt, in deren Straßennetz der Punkt liegt (null = außerhalb aller Netze). */
export function roadNetworkAt(point: LngLat): string | null {
  return networkAt(point);
}

/** Netze von Start und Ziel: verschieden = zwischen zwei Städten. Punkte außerhalb nehmen das Netz des anderen. */
function networksOf(from: LngLat, to: LngLat): [string, string] {
  const a = networkAt(from);
  const b = networkAt(to);
  const fallback = a ?? b ?? nearestNetwork(to);
  return [a ?? fallback, b ?? fallback];
}

/** Ergebnis der Suche als RoadRoute: Fahrweg und Fußwege getrennt, ohne Straße die Luftlinie. */
function toRoadRoute(found: GraphRoute | null, from: LngLat, to: LngLat): RoadRoute {
  if (found) {
    const path = found.path;
    const drive = path.slice(found.roadStart, found.roadEnd + 1);
    return {
      path,
      meters: Math.round(found.meters),
      onRoads: true,
      drive: drive.length >= 2 ? drive : [drive[0] ?? path[0], drive[0] ?? path[0]],
      walkFrom: found.roadStart > 0 ? [path[0], path[found.roadStart]] : null,
      walkTo: found.roadEnd < path.length - 1 ? [path[found.roadEnd], path[path.length - 1]] : null,
    };
  }
  const path = [
    { lng: from.lng, lat: from.lat },
    { lng: to.lng, lat: to.lat },
  ];
  return {
    path,
    meters: Math.round(distanceMeters(from, to)),
    onRoads: false,
    drive: path,
    walkFrom: null,
    walkTo: null,
  };
}

/**
 * Route über das Straßennetz. Liegt ein Punkt weit weg von jeder Straße, gibt es die Luftlinie; liegen Start und Ziel
 * in verschiedenen Städten, geht es über die Autobahn (interCityRoute), egal mit welcher Wahl.
 */
export function roadRoute(from: LngLat, to: LngLat, options?: RoadOptions): RoadRoute {
  const [netFrom, netTo] = networksOf(from, to);
  if (netFrom !== netTo) return interCityRoute(from, to);
  const id = `${key(from)}>${key(to)}${optionsKey(options)}`;
  const known = lruGet(cache, id);
  if (known) return known;
  const route = toRoadRoute(findRoute(from, to, netFrom, options?.weights), from, to);
  lruSet(cache, id, route, CACHE_SIZE);
  return route;
}

/**
 * Länge der Route über die Straßen in Metern. Wie roadRoute(...).meters, aber ohne den Weg zu bauen, wenn die Route
 * noch nicht gemerkt ist (Fahrzeiten brauchen nur die Meter). Zwischen zwei Städten die Länge von interCityRoute.
 */
export function roadDistance(from: LngLat, to: LngLat, options?: RoadOptions): number {
  const [netFrom, netTo] = networksOf(from, to);
  if (netFrom !== netTo) return interCityRoute(from, to).meters;
  const id = `${key(from)}>${key(to)}${optionsKey(options)}`;
  const route = lruGet(cache, id);
  if (route) return route.meters;
  const known = lruGet(distances, id);
  if (known !== undefined) return known;
  const found = findRouteMeters(from, to, netFrom, options?.weights);
  const meters = Math.round(found ?? distanceMeters(from, to));
  lruSet(distances, id, meters, DISTANCE_CACHE_SIZE);
  return meters;
}

/**
 * Fahrzeit in ganzen Spielminuten bei diesem Tempo (Meter pro Spielminute), plus extra Minuten. Zwischen zwei Städten
 * fährt die Autobahn schneller (interCityMinutes), mit jeder Wahl dieselbe Strecke wie roadRoute.
 */
export function travelMinutes(
  from: LngLat,
  to: LngLat,
  metersPerMinute: number,
  extra = 0,
  options?: RoadOptions,
): number {
  const [netFrom, netTo] = networksOf(from, to);
  if (netFrom !== netTo) return interCityMinutes(from, to, metersPerMinute) + extra;
  const speed = Math.max(1, metersPerMinute);
  const minutes = Math.ceil(roadDistance(from, to, options) / speed);
  // Fahrzeiten rechnen mit einem Tempo für alle Straßen: Ohne Autobahn dauert es mindestens COUNTRY_DETOUR so lange
  // wie der schnellste Weg (kleine Straßen sind langsamer, auch wenn der Weg kürzer ist).
  const slower = avoidsMotorway(options) ? Math.ceil((roadDistance(from, to) * COUNTRY_DETOUR) / speed) : 0;
  return Math.max(1, Math.max(minutes, slower) + extra);
}

const entries = new Map<string, LngLat>();

export interface RoadApproach {
  /** Autobahn, z.B. 'A3'. */
  ref: string;
  /** Wohin sie führt, z.B. "Siegburg, Frankfurt". */
  toward: string;
  /** Weg über die Autobahn vom Rand des Ausschnitts bis zum ersten Knoten im Netz (dort geht roadRoute weiter). */
  path: LngLat[];
}

const approachLists = new Map<string, RoadApproach[]>();

/** Alle Autobahn-Zufahrten einer Stadt (Standard Köln; aus network.ts, erzeugt von tools/build-roads.py). */
export function roadApproaches(cityId = 'koeln'): readonly RoadApproach[] {
  let list = approachLists.get(cityId);
  if (!list) {
    list = decodeApproaches(cityId).filter((a) => a.path.length >= 2);
    approachLists.set(cityId, list);
  }
  return list;
}

/** Netz der Stadt, in der into liegt (Standard Köln). */
const networkInto = (into?: LngLat) => (into && (networkAt(into) ?? nearestNetwork(into))) || 'koeln';

/** Kompassrichtung von a nach b in Grad (flach gerechnet, reicht für den Vergleich von Richtungen). */
function heading(a: LngLat, b: LngLat): number {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  return ((Math.atan2(dx, b.lat - a.lat) * 180) / Math.PI + 360) % 360;
}

/**
 * Zufahrt für eine Lieferung von weit her in die Stadt von into (Standard Köln): die Autobahn via (z.B. 'A3' aus
 * Frankfurt, 'A57' aus Amsterdam, 'A1' aus Hamburg und Berlin), deren Rand-Punkt am besten in Richtung des fernen Orts
 * liegt. Ohne via die beste Richtung überhaupt; null, wenn das Netz keine Zufahrten hat.
 */
export function roadApproach(far: LngLat, via?: string, into?: LngLat): RoadApproach | null {
  const network = networkInto(into);
  const all = roadApproaches(network);
  const pool = via ? all.filter((a) => a.ref === via) : all;
  const list = pool.length > 0 ? pool : all;
  if (list.length === 0) return null;
  const center = networkCenter(network);
  const want = heading(center, far);
  let best: RoadApproach | null = null;
  let bestDiff = Infinity;
  for (const a of list) {
    const diff = Math.abs(((heading(center, a.path[0]) - want + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return best;
}

/**
 * Wo eine Lieferung von weit her (Frankfurt, Berlin …) auf das Netz der Stadt von into (Standard Köln) trifft: das
 * Ende der passenden Autobahn-Zufahrt (roadApproach). Ohne Zufahrten der nächste Autobahn-Knoten im Netz der Stadt,
 * ohne Autobahnen der Ort selbst.
 */
export function roadEntryFrom(far: LngLat, via?: string, into?: LngLat): LngLat {
  const network = networkInto(into);
  const id = `${network}:${key(far)}|${via ?? ''}`;
  let entry = entries.get(id);
  if (!entry) {
    const approach = roadApproach(far, via, into);
    entry = approach
      ? approach.path[approach.path.length - 1]
      : (nearestMotorwayNode(far, network) ?? { lng: far.lng, lat: far.lat });
    entries.set(id, entry);
  }
  return entry;
}

const shipRoutes = new Map<string, LngLat[]>();

/**
 * Weg eines Schiffs von außen bis zum Kai der Stadt: 'koeln' von Rotterdam über Nieuwe Maas, Noord, Merwede, Waal und
 * Rhein bis zum Liegeplatz im Niehler Hafen, 'hamburg' die Elbe hinauf ab Cuxhaven. Leer für Städte ohne Wasserweg.
 */
export function shipRoute(cityId: string): LngLat[] {
  let route = shipRoutes.get(cityId);
  if (!route) {
    const data = WATERWAYS[cityId];
    route = data ? decodeLine(data.path) : [];
    shipRoutes.set(cityId, route);
  }
  return route;
}

/** Fahrzeit des Schiffs über shipRoute in ganzen Spielminuten (SHIP_SPEED), 0 ohne Wasserweg. */
export function shipMinutes(cityId: string): number {
  const route = shipRoute(cityId);
  let meters = 0;
  for (let i = 1; i < route.length; i++) meters += distanceMeters(route[i - 1], route[i]);
  return route.length < 2 ? 0 : Math.ceil(meters / SHIP_SPEED);
}

// ---------------------------------------------------------------------------------------------
// Seewege (Auftrag 41)

export interface SeaNode {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

export interface SeaLane {
  from: string;
  to: string;
  name: string;
  km: number;
  /** Punkte von from nach to. */
  path: LngLat[];
}

export interface SeaRoute {
  /** Punkte vom Knoten bis zum Liegeplatz. */
  path: LngLat[];
  km: number;
  /** Knoten unterwegs, mit Start und dem Knoten vor dem Hafen. */
  nodes: string[];
}

let seaLaneCache: SeaLane[] | null = null;
const seaRouteCache = new Map<string, SeaRoute | null>();

export function seaNodes(): SeaNode[] {
  return Object.entries(SEA_NODES).map(([id, n]) => ({ id, ...n }));
}

export function seaLanes(): readonly SeaLane[] {
  seaLaneCache ??= SEA_LANES.map((l) => ({ from: l.from, to: l.to, name: l.name, km: l.km, path: decodeLine(l.path) }));
  return seaLaneCache;
}

/** Häfen, in die ein Weg vom Meer führt. */
export function seaPorts(): string[] {
  return Object.keys(SEA_PORTS);
}

/**
 * Seeweg von einem Knoten (Hafen eines Produzenten) bis an den Liegeplatz eines Hafens: kürzester Weg über die Seewege
 * (Dijkstra, bei Gleichstand nach Namen) bis vor den Hafen, dann das Fahrwasser hinein (WATERWAYS). null ohne Weg.
 */
export function seaRoute(from: string, portId: string): SeaRoute | null {
  const id = `${from}>${portId}`;
  if (seaRouteCache.has(id)) return seaRouteCache.get(id) ?? null;
  const target = SEA_PORTS[portId];
  const water = WATERWAYS[portId];
  let result: SeaRoute | null = null;
  if (target && water && SEA_NODES[from]) {
    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, SeaLane>();
    const done = new Set<string>();
    for (;;) {
      let here: string | null = null;
      for (const [node, d] of dist) {
        if (done.has(node)) continue;
        if (here === null || d < (dist.get(here) ?? Infinity) || (d === dist.get(here) && node < here)) here = node;
      }
      if (here === null || here === target) break;
      done.add(here);
      for (const lane of seaLanes()) {
        const next = lane.from === here ? lane.to : lane.to === here ? lane.from : null;
        if (!next || done.has(next)) continue;
        const d = (dist.get(here) ?? 0) + lane.km;
        if (d < (dist.get(next) ?? Infinity)) {
          dist.set(next, d);
          prev.set(next, lane);
        }
      }
    }
    if (dist.has(target)) {
      const nodes = [target];
      let path: LngLat[] = [];
      while (nodes[0] !== from) {
        const lane = prev.get(nodes[0]) as SeaLane;
        const forward = lane.to === nodes[0];
        path = join(forward ? lane.path : [...lane.path].reverse(), path);
        nodes.unshift(forward ? lane.from : lane.to);
      }
      path = join(path, decodeLine(water.path));
      result = { path, km: Math.round(((dist.get(target) ?? 0) + water.km) * 10) / 10, nodes };
    }
  }
  seaRouteCache.set(id, result);
  return result;
}

/** Nächster Punkt auf einer Straße und der Abstand dorthin (null = keine Straße in der Nähe). */
export function nearestRoadPoint(point: LngLat): { point: LngLat; meters: number } | null {
  const network = networkAt(point) ?? nearestNetwork(point);
  const snap = snapToRoad(point, network);
  if (!snap) return null;
  return { point: snapToLngLat(snap, network), meters: Math.round(snap.distance) };
}

/** Umweg einer Autobahn gegenüber der Luftlinie, wenn es zwischen zwei Städten (noch) keine Linie gibt. */
const INTERCITY_DETOUR = 1.18;
/** Minuten für Auffahrt, Abfahrt und Tankpause (zusätzlich zu den Fahrten in den Städten). */
const INTERCITY_ACCESS_MINUTES = 15;
/** Ein Punkt außerhalb aller Straßennetze gehört zu einer Stadt des Autobahn-Netzes, wenn er so nah an ihrem Knoten ist. */
const NODE_RADIUS = 40_000;

export interface InterCityRoute extends RoadRoute {
  /** Davon auf der Autobahn (Rest: Anfahrt und Zufahrt in den Städten). */
  motorwayMeters: number;
  /** Städte, durch die der Weg unterwegs führt (ohne Start und Ziel). */
  via: string[];
  /** Nummern der Autobahnen in Fahrtrichtung, z.B. ['A 1', 'A 24']. */
  refs: string[];
}

export interface AutobahnLeg {
  from: string;
  to: string;
  ref: string;
  refs: readonly string[];
  meters: number;
  /** Punkte in Fahrtrichtung. */
  path: LngLat[];
}

let autobahnLineCache: AutobahnLeg[] | null = null;

/** Alle Linien des Autobahn-Netzes (Richtung wie in autobahn.ts). */
export function autobahnLines(): readonly AutobahnLeg[] {
  autobahnLineCache ??= AUTOBAHNEN.map((line) => ({
    from: line.from,
    to: line.to,
    ref: line.ref,
    refs: line.refs,
    meters: line.meters,
    path: decodeLine(line.points),
  }));
  return autobahnLineCache;
}

/** Die direkte Autobahn zwischen zwei Städten (Punkte in Fahrtrichtung von a nach b), null wenn es keine gibt. */
export function autobahnBetween(a: string, b: string): AutobahnLeg | null {
  for (const line of autobahnLines()) {
    if (line.from === a && line.to === b) return line;
  }
  for (const line of autobahnLines()) {
    if (line.from === b && line.to === a) return { ...line, from: a, to: b, path: [...line.path].reverse() };
  }
  return null;
}

export interface AutobahnPath {
  /** Abschnitte in Fahrtrichtung (je eine Linie des Netzes). */
  legs: AutobahnLeg[];
  /** Städte unterwegs (ohne Start und Ziel). */
  via: string[];
  meters: number;
}

const pathCache = new Map<string, AutobahnPath | null>();

/** Städte im Autobahn-Netz (alle Enden der Linien), sortiert. */
export function autobahnCities(): string[] {
  return [...new Set(autobahnLines().flatMap((l) => [l.from, l.to]))].sort();
}

/**
 * Kürzester Weg über das Autobahn-Netz von Stadt a nach Stadt b (Dijkstra über die Meter der Linien, bei Gleichstand
 * nach Namen, also fest). null ohne Verbindung oder bei a = b.
 */
export function autobahnPath(a: string, b: string): AutobahnPath | null {
  const id = `${a}>${b}`;
  if (pathCache.has(id)) return pathCache.get(id) ?? null;
  let result: AutobahnPath | null = null;
  if (a !== b) {
    const dist = new Map<string, number>([[a, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    for (;;) {
      let here: string | null = null;
      for (const [city, d] of dist) {
        if (done.has(city)) continue;
        if (here === null || d < (dist.get(here) ?? Infinity) || (d === dist.get(here) && city < here)) here = city;
      }
      if (here === null || here === b) break;
      done.add(here);
      for (const line of autobahnLines()) {
        const next = line.from === here ? line.to : line.to === here ? line.from : null;
        if (!next || done.has(next)) continue;
        const d = (dist.get(here) ?? 0) + line.meters;
        if (d < (dist.get(next) ?? Infinity)) {
          dist.set(next, d);
          prev.set(next, here);
        }
      }
    }
    if (dist.has(b)) {
      const cities = [b];
      while (cities[0] !== a) cities.unshift(prev.get(cities[0]) as string);
      const legs = cities.slice(1).map((to, i) => autobahnBetween(cities[i], to) as AutobahnLeg);
      result = { legs, via: cities.slice(1, -1), meters: dist.get(b) ?? 0 };
    }
  }
  pathCache.set(id, result);
  return result;
}

/** Nummern der Autobahnen auf dem Weg von a nach b, in Fahrtrichtung ohne Wiederholung (leer ohne Weg). */
export function autobahnRefs(a: string, b: string): string[] {
  const refs: string[] = [];
  for (const leg of autobahnPath(a, b)?.legs ?? []) {
    for (const ref of leg.refs) if (ref.startsWith('A') && !refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

/** Hat die Stadt ein eigenes Straßennetz (Schablonen-Städte haben noch keins)? */
function hasNetwork(cityId: string): boolean {
  return networkIds().includes(cityId);
}

/** Mitte der Enden der Linien in einer Stadt (Knoten des Autobahn-Netzes). */
function nodeOf(cityId: string): LngLat | null {
  const ends = autobahnLines().flatMap((l) => [
    ...(l.from === cityId ? [l.path[0]] : []),
    ...(l.to === cityId ? [l.path[l.path.length - 1]] : []),
  ]);
  if (ends.length === 0) return null;
  return {
    lng: ends.reduce((s, p) => s + p.lng, 0) / ends.length,
    lat: ends.reduce((s, p) => s + p.lat, 0) / ends.length,
  };
}

/** Stadt eines Punkts für die Fahrt zwischen den Städten: das Netz, sonst ein naher Knoten (Schablonen), sonst null. */
function placeOf(point: LngLat): string | null {
  const net = networkAt(point);
  if (net) return net;
  let best: string | null = null;
  let bestMeters = NODE_RADIUS;
  for (const city of autobahnCities()) {
    const node = nodeOf(city);
    const meters = node ? distanceMeters(node, point) : Infinity;
    if (meters < bestMeters) {
      best = city;
      bestMeters = meters;
    }
  }
  return best;
}

/** Stück innerhalb einer Stadt: über ihre Straßen, ohne Netz (Schablone) gerade. */
function cityPiece(cityId: string, from: LngLat, to: LngLat): RoadRoute {
  if (hasNetwork(cityId)) return roadRoute(from, to);
  if (from.lng === to.lng && from.lat === to.lat) {
    const p = { lng: from.lng, lat: from.lat };
    return { path: [p, p], meters: 0, onRoads: true, drive: [p, p], walkFrom: null, walkTo: null };
  }
  return toRoadRoute(null, from, to);
}

/** Zwei Wege aneinanderhängen (der gemeinsame Punkt nur einmal). */
function join(a: LngLat[], b: LngLat[]): LngLat[] {
  if (a.length === 0) return [...b];
  const last = a[a.length - 1];
  const first = b[0];
  return first && last.lng === first.lng && last.lat === first.lat ? [...a, ...b.slice(1)] : [...a, ...b];
}

const interCityCache = new Map<string, InterCityRoute>();

/**
 * Weg zwischen zwei Städten (Auftrag 30, 36): mit den Straßen der ersten Stadt zur Autobahn, über das Autobahn-Netz
 * (in einer Stadt unterwegs über ihre Straßen von einer Autobahn zur nächsten) und in der letzten Stadt über die Straßen
 * zum Ziel. Ohne Verbindung im Netz die Luftlinie mit dem üblichen Umweg einer Autobahn.
 */
export function interCityRoute(from: LngLat, to: LngLat): InterCityRoute {
  const id = `${key(from)}>${key(to)}`;
  const known = lruGet(interCityCache, id);
  if (known) return known;
  const [netFrom, netTo] = networksOf(from, to);
  const a = placeOf(from) ?? netFrom;
  const b = placeOf(to) ?? netTo;
  const way = a !== b ? autobahnPath(a, b) : null;
  let route: InterCityRoute;
  if (way) {
    const legs = way.legs;
    const access = cityPiece(a, from, legs[0].path[0]);
    const egress = cityPiece(b, legs[legs.length - 1].path[legs[legs.length - 1].path.length - 1], to);
    let path = access.path;
    let drive = access.drive;
    let cityMeters = access.meters + egress.meters;
    let onRoads = access.onRoads && egress.onRoads;
    legs.forEach((leg, i) => {
      const inner = leg.path.slice(1, -1);
      path = join(path, inner);
      drive = join(drive, inner);
      if (i < legs.length - 1) {
        // Durch die Stadt dazwischen: vom Ende dieser Linie zum Anfang der nächsten.
        const through = cityPiece(way.via[i], leg.path[leg.path.length - 1], legs[i + 1].path[0]);
        path = join(path, through.path);
        drive = join(drive, through.drive);
        cityMeters += through.meters;
        onRoads &&= through.onRoads;
      }
    });
    path = join(path, egress.path);
    drive = join(drive, egress.drive);
    route = {
      path,
      meters: cityMeters + way.meters,
      motorwayMeters: way.meters,
      onRoads,
      drive,
      walkFrom: access.walkFrom,
      walkTo: egress.walkTo,
      via: way.via,
      refs: autobahnRefs(a, b),
    };
  } else {
    const meters = Math.round(distanceMeters(from, to) * INTERCITY_DETOUR);
    const path = [
      { lng: from.lng, lat: from.lat },
      { lng: to.lng, lat: to.lat },
    ];
    route = {
      path,
      meters,
      motorwayMeters: meters,
      onRoads: false,
      drive: path,
      walkFrom: null,
      walkTo: null,
      via: [],
      refs: [],
    };
  }
  lruSet(interCityCache, id, route, CACHE_SIZE);
  return route;
}

/**
 * Fahrzeit zwischen zwei Städten in Spielminuten: Autobahn mit ROAD_SPEEDS.motorway, Anfahrt und Zufahrt im Tempo
 * des Fahrzeugs in der Stadt (Meter pro Spielminute), dazu Auf- und Abfahrt. Es gibt keine Landstraße zwischen den
 * Städten: Jede Fahrt nimmt den Weg von interCityRoute in diesem Tempo, auch mit der Wahl Landstraße.
 */
export function interCityMinutes(from: LngLat, to: LngLat, cityMetersPerMinute: number): number {
  const route = interCityRoute(from, to);
  const motorway = (ROAD_SPEEDS.motorway * 1000) / 60;
  const city = route.meters - route.motorwayMeters;
  return Math.max(
    1,
    Math.ceil(route.motorwayMeters / motorway + city / Math.max(1, cityMetersPerMinute) + INTERCITY_ACCESS_MINUTES),
  );
}

/** Anzahl Knoten, Kanten und Kilometer eines Netzes (für die Oberfläche, Standard Köln). */
export function networkStats(networkId?: string): { nodes: number; edges: number; km: number } {
  const size = networkSize(networkId);
  return { nodes: size.nodes, edges: size.edges, km: Math.round(size.meters / 1000) };
}

export default defineModule({ id: 'roads', version: 1 });
