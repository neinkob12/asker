// Straßen: das echte Kölner Straßennetz (Autobahn bis Wohnstraße, aus OpenStreetMap über Overture Maps, ODbL) als
// Graph. Fahrzeuge fahren darauf statt Luftlinie, und Fahrzeiten in der Simulation kommen aus der Straßenlänge.
// Statische Daten, kein eigener Spielzustand. Daten neu erzeugen: tools/build-roads.py (Details in network.ts).
//
// Öffentliche API:
//   roadRoute(from, to)       Route über die Straßen: { path (LngLat[], Start und Ziel inklusive), meters }
//   roadDistance(from, to)    nur die Länge in Metern
//   travelMinutes(from, to, metersPerMinute, extra?)  Fahrzeit in ganzen Spielminuten
//   roadEntryFrom(far)        Autobahn-Einfahrt nach Köln aus Richtung eines weit entfernten Orts (z.B. Frankfurt)
//   nearestRoadPoint(point)   nächster Punkt auf einer Straße, networkSize(), ROAD_SPEEDS
//   interCityRoute(from, to)  Weg zwischen zwei Städten über die Autobahn (Auftrag 30): Punkte, Meter, Autobahn-Meter
//   interCityMinutes(from, to, cityMetersPerMinute)  Fahrzeit dafür (Autobahn mit ROAD_SPEEDS.motorway)
//
// Routen werden gemerkt (gleiche Punkte = gleiche Route), die Rechnung ist deterministisch.

import { defineModule, distanceMeters, type LngLat } from '../../core';
import { findRoute, nearestMotorwayNode, networkSize, pointsToLngLat, ROAD_SPEEDS, snapToRoad } from './graph';

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

/** Route über das Straßennetz. Liegt ein Punkt weit weg von jeder Straße, gibt es die Luftlinie. */
export function roadRoute(from: LngLat, to: LngLat): RoadRoute {
  const id = `${key(from)}>${key(to)}`;
  const known = cache.get(id);
  if (known) return known;
  const found = findRoute(from, to);
  const route: RoadRoute = found
    ? { path: pointsToLngLat(found.points), meters: Math.round(found.meters), onRoads: true }
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

/** Fahrzeit in ganzen Spielminuten bei diesem Tempo (Meter pro Spielminute), plus extra Minuten. */
export function travelMinutes(from: LngLat, to: LngLat, metersPerMinute: number, extra = 0): number {
  return Math.max(1, Math.ceil(roadDistance(from, to) / Math.max(1, metersPerMinute)) + extra);
}

const entries = new Map<string, LngLat>();

/**
 * Wo eine Lieferung von weit her (Frankfurt, Berlin …) auf das Kölner Netz trifft: der Autobahn-Knoten im Netz, der
 * am nächsten zu diesem Ort liegt. Ohne Autobahnen der Ort selbst.
 */
export function roadEntryFrom(far: LngLat): LngLat {
  const id = key(far);
  let entry = entries.get(id);
  if (!entry) {
    entry = nearestMotorwayNode(far) ?? { lng: far.lng, lat: far.lat };
    entries.set(id, entry);
  }
  return entry;
}

/** Nächster Punkt auf einer Straße und der Abstand dorthin (null = keine Straße in der Nähe). */
export function nearestRoadPoint(point: LngLat): { point: LngLat; meters: number } | null {
  const snap = snapToRoad(point);
  if (!snap) return null;
  const [p] = pointsToLngLat([[snap.x, snap.y]]);
  return { point: p, meters: Math.round(snap.distance) };
}

/** Umweg der Autobahn gegenüber der Luftlinie, solange es die echte A1 noch nicht im Netz gibt (Etappe 6). */
const INTERCITY_DETOUR = 1.18;
/** Minuten für Stadt-Anfahrt und Stadt-Zufahrt zusammen (bis zur Autobahn und von ihr runter). */
const INTERCITY_ACCESS_MINUTES = 20;

export interface InterCityRoute extends RoadRoute {
  /** Davon auf der Autobahn (Rest: Anfahrt und Zufahrt in den Städten). */
  motorwayMeters: number;
}

const interCityCache = new Map<string, InterCityRoute>();

/**
 * Weg zwischen zwei Städten (Auftrag 30): Stadt-Anfahrt, Autobahn, Stadt-Zufahrt. Bis die A1 als Linie im Netz liegt
 * (Etappe 6), ist der Weg die Luftlinie mit dem üblichen Umweg einer Autobahn.
 */
export function interCityRoute(from: LngLat, to: LngLat): InterCityRoute {
  const id = `${key(from)}>${key(to)}`;
  const known = interCityCache.get(id);
  if (known) return known;
  const meters = Math.round(distanceMeters(from, to) * INTERCITY_DETOUR);
  const route: InterCityRoute = {
    path: [
      { lng: from.lng, lat: from.lat },
      { lng: to.lng, lat: to.lat },
    ],
    meters,
    motorwayMeters: meters,
    onRoads: false,
  };
  interCityCache.set(id, route);
  return route;
}

/** Fahrzeit zwischen zwei Städten: Autobahn mit ROAD_SPEEDS.motorway, Anfahrt und Zufahrt im Stadttempo. */
export function interCityMinutes(from: LngLat, to: LngLat, cityMetersPerMinute: number): number {
  const route = interCityRoute(from, to);
  const motorway = (ROAD_SPEEDS.motorway * 1000) / 60;
  const city = route.meters - route.motorwayMeters;
  return Math.max(
    1,
    Math.ceil(route.motorwayMeters / motorway + city / Math.max(1, cityMetersPerMinute) + INTERCITY_ACCESS_MINUTES),
  );
}

/** Anzahl Knoten, Kanten und Kilometer (für die Oberfläche). */
export function networkStats(): { nodes: number; edges: number; km: number } {
  const size = networkSize();
  return { nodes: size.nodes, edges: size.edges, km: Math.round(size.meters / 1000) };
}

export default defineModule({ id: 'roads', version: 1 });
