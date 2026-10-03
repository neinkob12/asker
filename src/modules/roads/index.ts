// Straßen: die echten Straßennetze der Städte (Köln, Hamburg; Autobahn bis Wohnstraße, aus OpenStreetMap über
// Overture Maps, ODbL) als Graphen, dazu die A1 zwischen den Städten als Linie. Fahrzeuge fahren darauf statt
// Luftlinie, und Fahrzeiten in der Simulation kommen aus der Straßenlänge. Statische Daten, kein eigener Spielzustand.
// Daten neu erzeugen: tools/build-roads.py (Details in network.ts).
//
// Öffentliche API:
//   roadRoute(from, to)       Route über die Straßen: { path (LngLat[], Start und Ziel inklusive), meters, drive
//                             (nur der Teil auf der Straße, dort fährt das Fahrzeug), walkFrom, walkTo (Fußwege) }.
//                             Das Netz wählt roads nach dem Ausschnitt, in dem Start und Ziel liegen; liegen sie in
//                             verschiedenen Städten, ist es die Route über die Autobahn (interCityRoute).
//   roadDistance(from, to)    nur die Länge in Metern
//   travelMinutes(from, to, metersPerMinute, extra?)  Fahrzeit in ganzen Spielminuten (zwischen Städten: Autobahn
//                             mit ROAD_SPEEDS.motorway, siehe interCityMinutes)
//   roadEntryFrom(far, via?, into?)  Autobahn-Einfahrt in die Stadt von into (Standard Köln) aus Richtung eines weit
//                             entfernten Orts (z.B. Frankfurt), optional über eine bestimmte Autobahn ('A3');
//                             roadApproach(far, via?, into?) mit dem ganzen Weg vom Rand des Ausschnitts bis dorthin,
//                             roadApproaches(cityId?) alle Zufahrten einer Stadt
//   nearestRoadPoint(point)   nächster Punkt auf einer Straße, networkSize(id?), networkStats(id?), ROAD_SPEEDS
//   roadNetworkAt(point)      Stadt, in deren Netz der Punkt liegt (null = außerhalb)
//   interCityRoute(from, to)  Weg zwischen zwei Städten (Auftrag 30): Stadt-Anfahrt, A1, Stadt-Zufahrt
//                             ({ path, meters, motorwayMeters, onRoads, drive, walkFrom, walkTo })
//   interCityMinutes(from, to, cityMetersPerMinute)  Fahrzeit dafür
//   autobahnBetween(a, b)     die Autobahn zwischen zwei Städten als Linie (für die Karte), null wenn keine
//   shipRoute(cityId)         Weg eines Schiffs von außen bis zum Kai ('koeln': Rotterdam über Waal und Rhein,
//                             'hamburg': Elbe ab Cuxhaven), aus Overture-Daten (waterways.ts, tools/build-water.py)
//   shipMinutes(cityId)       Fahrzeit dieses Wegs mit SHIP_SPEED (nur zur Anzeige, die Lieferzeit kommt aus suppliers)
//   roadGraph(cityId?)        Lesesicht auf den Graphen einer Stadt (Knoten, Kanten, Nachbarn in Metern), z.B. für
//                             den Verkehr
//
// Routen werden gemerkt (gleiche Punkte = gleiche Route), die Rechnung ist deterministisch.

import { defineModule, distanceMeters, type LngLat } from '../../core';
import { AUTOBAHNEN } from './autobahn';
import { SHIP_SPEED } from './config';
import {
  decodeApproaches,
  decodeLine,
  findRoute,
  type GraphRoute,
  nearestMotorwayNode,
  nearestNetwork,
  networkAt,
  networkCenter,
  networkSize,
  ROAD_SPEEDS,
  snapToLngLat,
  snapToRoad,
} from './graph';

import { WATERWAYS } from './waterways';

export { SHIP_SPEED } from './config';
export { graphView as roadGraph, networkSize, ROAD_SPEEDS, type RoadClass, type RoadGraphView } from './graph';

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
const cache = new Map<string, RoadRoute>();

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
 * in verschiedenen Städten, geht es über die Autobahn (interCityRoute).
 */
export function roadRoute(from: LngLat, to: LngLat): RoadRoute {
  const [netFrom, netTo] = networksOf(from, to);
  if (netFrom !== netTo) return interCityRoute(from, to);
  const id = `${key(from)}>${key(to)}`;
  const known = cache.get(id);
  if (known) return known;
  const route = toRoadRoute(findRoute(from, to, netFrom), from, to);
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  cache.set(id, route);
  return route;
}

/** Länge der Route über die Straßen in Metern. */
export function roadDistance(from: LngLat, to: LngLat): number {
  return roadRoute(from, to).meters;
}

/**
 * Fahrzeit in ganzen Spielminuten bei diesem Tempo (Meter pro Spielminute), plus extra Minuten. Zwischen zwei Städten
 * fährt die Autobahn schneller (interCityMinutes).
 */
export function travelMinutes(from: LngLat, to: LngLat, metersPerMinute: number, extra = 0): number {
  const [netFrom, netTo] = networksOf(from, to);
  if (netFrom !== netTo) return interCityMinutes(from, to, metersPerMinute) + extra;
  return Math.max(1, Math.ceil(roadDistance(from, to) / Math.max(1, metersPerMinute)) + extra);
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

export interface InterCityRoute extends RoadRoute {
  /** Davon auf der Autobahn (Rest: Anfahrt und Zufahrt in den Städten). */
  motorwayMeters: number;
}

interface Autobahn {
  from: string;
  to: string;
  ref: string;
  meters: number;
  path: LngLat[];
}

let autobahnLines: Autobahn[] | null = null;

/** Die Autobahn zwischen zwei Städten (Punkte in Fahrtrichtung von a nach b), null wenn es keine gibt. */
export function autobahnBetween(a: string, b: string): { ref: string; meters: number; path: LngLat[] } | null {
  autobahnLines ??= AUTOBAHNEN.map((line) => ({ ...line, path: decodeLine(line.points) }));
  for (const line of autobahnLines) {
    if (line.from === a && line.to === b) return line;
  }
  for (const line of autobahnLines) {
    if (line.from === b && line.to === a) return { ref: line.ref, meters: line.meters, path: [...line.path].reverse() };
  }
  return null;
}

const interCityCache = new Map<string, InterCityRoute>();

/**
 * Weg zwischen zwei Städten (Auftrag 30): mit den Straßen der ersten Stadt zur Autobahn, die A1 entlang und in der
 * zweiten Stadt über die Straßen zum Ziel. Ohne Autobahn-Linie zwischen den Städten die Luftlinie mit dem üblichen
 * Umweg einer Autobahn.
 */
export function interCityRoute(from: LngLat, to: LngLat): InterCityRoute {
  const id = `${key(from)}>${key(to)}`;
  const known = interCityCache.get(id);
  if (known) return known;
  const [netFrom, netTo] = networksOf(from, to);
  const autobahn = netFrom !== netTo ? autobahnBetween(netFrom, netTo) : null;
  let route: InterCityRoute;
  if (autobahn) {
    const onRamp = autobahn.path[0];
    const offRamp = autobahn.path[autobahn.path.length - 1];
    const access = roadRoute(from, onRamp);
    const egress = roadRoute(offRamp, to);
    route = {
      path: [...access.path, ...autobahn.path.slice(1, -1), ...egress.path],
      meters: access.meters + autobahn.meters + egress.meters,
      motorwayMeters: autobahn.meters,
      onRoads: access.onRoads && egress.onRoads,
      drive: [...access.drive, ...autobahn.path.slice(1, -1), ...egress.drive],
      walkFrom: access.walkFrom,
      walkTo: egress.walkTo,
    };
  } else {
    const meters = Math.round(distanceMeters(from, to) * INTERCITY_DETOUR);
    const path = [
      { lng: from.lng, lat: from.lat },
      { lng: to.lng, lat: to.lat },
    ];
    route = { path, meters, motorwayMeters: meters, onRoads: false, drive: path, walkFrom: null, walkTo: null };
  }
  if (interCityCache.size >= CACHE_SIZE) interCityCache.delete(interCityCache.keys().next().value as string);
  interCityCache.set(id, route);
  return route;
}

/**
 * Fahrzeit zwischen zwei Städten in Spielminuten: Autobahn mit ROAD_SPEEDS.motorway, Anfahrt und Zufahrt im Tempo
 * des Fahrzeugs in der Stadt (Meter pro Spielminute), dazu Auf- und Abfahrt.
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
