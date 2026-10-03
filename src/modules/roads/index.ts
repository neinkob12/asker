// Straßen: die echten Straßennetze der Städte (Köln, Hamburg; Autobahn bis Wohnstraße, aus OpenStreetMap über
// Overture Maps, ODbL) als Graphen, dazu die A1 zwischen den Städten als Linie. Fahrzeuge fahren darauf statt
// Luftlinie, und Fahrzeiten in der Simulation kommen aus der Straßenlänge. Statische Daten, kein eigener Spielzustand.
// Daten neu erzeugen: tools/build-roads.py (Details in network.ts).
//
// Öffentliche API:
//   roadRoute(from, to)       Route über die Straßen: { path (LngLat[], Start und Ziel inklusive), meters }. Das Netz
//                             wählt roads nach dem Ausschnitt, in dem Start und Ziel liegen; liegen sie in verschiedenen
//                             Städten, ist es die Route über die Autobahn (interCityRoute).
//   roadDistance(from, to)    nur die Länge in Metern
//   travelMinutes(from, to, metersPerMinute, extra?)  Fahrzeit in ganzen Spielminuten (zwischen Städten: Autobahn
//                             mit ROAD_SPEEDS.motorway, siehe interCityMinutes)
//   roadEntryFrom(far, into?) Autobahn-Einfahrt in die Stadt von into (Standard Köln) aus Richtung eines weit
//                             entfernten Orts (z.B. Frankfurt)
//   nearestRoadPoint(point)   nächster Punkt auf einer Straße, networkSize(id?), networkStats(id?), ROAD_SPEEDS
//   roadNetworkAt(point)      Stadt, in deren Netz der Punkt liegt (null = außerhalb)
//   interCityRoute(from, to)  Weg zwischen zwei Städten (Auftrag 30): Stadt-Anfahrt, A1, Stadt-Zufahrt
//                             ({ path, meters, motorwayMeters, onRoads })
//   interCityMinutes(from, to, cityMetersPerMinute)  Fahrzeit dafür
//   autobahnBetween(a, b)     die Autobahn zwischen zwei Städten als Linie (für die Karte), null wenn keine
//
// Routen werden gemerkt (gleiche Punkte = gleiche Route), die Rechnung ist deterministisch.

import { defineModule, distanceMeters, type LngLat } from '../../core';
import { AUTOBAHNEN } from './autobahn';
import {
  decodeInts,
  findRoute,
  nearestMotorwayNode,
  nearestNetwork,
  networkAt,
  networkSize,
  ROAD_SPEEDS,
  snapToLngLat,
  snapToRoad,
} from './graph';

export { networkSize, ROAD_SPEEDS, type RoadClass } from './graph';

export interface RoadRoute {
  /** Weg vom Start über die Straßen zum Ziel (mindestens zwei Punkte). */
  path: LngLat[];
  /** Länge des Wegs in Metern. */
  meters: number;
  /** false, wenn es keine Straße in der Nähe gab und die Route Luftlinie ist. */
  onRoads: boolean;
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
  const found = findRoute(from, to, netFrom);
  const route: RoadRoute = found
    ? { path: found.path, meters: Math.round(found.meters), onRoads: true }
    : {
        path: [
          { lng: from.lng, lat: from.lat },
          { lng: to.lng, lat: to.lat },
        ],
        meters: Math.round(distanceMeters(from, to)),
        onRoads: false,
      };
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

/**
 * Wo eine Lieferung von weit her (Frankfurt, Berlin …) auf das Netz einer Stadt trifft: der Autobahn-Knoten im Netz
 * der Stadt von into (Standard Köln), der am nächsten zu diesem Ort liegt. Ohne Autobahnen der Ort selbst.
 */
export function roadEntryFrom(far: LngLat, into?: LngLat): LngLat {
  const network = (into && (networkAt(into) ?? nearestNetwork(into))) || 'koeln';
  const id = `${network}:${key(far)}`;
  let entry = entries.get(id);
  if (!entry) {
    entry = nearestMotorwayNode(far, network) ?? { lng: far.lng, lat: far.lat };
    entries.set(id, entry);
  }
  return entry;
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

function decodeLine(text: string): LngLat[] {
  const ints = decodeInts(text);
  const out: LngLat[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < ints.length; i += 2) {
    x += ints[i];
    y += ints[i + 1];
    out.push({ lng: x / 1e5, lat: y / 1e5 });
  }
  return out;
}

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
    };
  } else {
    const meters = Math.round(distanceMeters(from, to) * INTERCITY_DETOUR);
    route = {
      path: [
        { lng: from.lng, lat: from.lat },
        { lng: to.lng, lat: to.lat },
      ],
      meters,
      motorwayMeters: meters,
      onRoads: false,
    };
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
