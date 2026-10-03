// Straßen: das echte Kölner Straßennetz (Autobahn bis Wohnstraße, aus OpenStreetMap über Overture Maps, ODbL) als
// Graph. Fahrzeuge fahren darauf statt Luftlinie, und Fahrzeiten in der Simulation kommen aus der Straßenlänge.
// Statische Daten, kein eigener Spielzustand. Daten neu erzeugen: tools/build-roads.py (Details in network.ts).
//
// Öffentliche API:
//   roadRoute(from, to)       Route über die Straßen: { path (LngLat[], Start und Ziel inklusive), meters, drive
//                             (nur der Teil auf der Straße, dort fährt das Fahrzeug), walkFrom, walkTo (Fußwege) }
//   roadDistance(from, to)    nur die Länge in Metern
//   travelMinutes(from, to, metersPerMinute, extra?)  Fahrzeit in ganzen Spielminuten
//   roadEntryFrom(far, via?)  Autobahn-Einfahrt nach Köln aus Richtung eines weit entfernten Orts (z.B. Frankfurt),
//                             optional über eine bestimmte Autobahn ('A3'); roadApproach(far, via?) mit dem ganzen
//                             Weg vom Rand des Ausschnitts bis dorthin, roadApproaches() alle Zufahrten
//   nearestRoadPoint(point)   nächster Punkt auf einer Straße, networkSize(), ROAD_SPEEDS
//   shipRoute(cityId)         Weg eines Schiffs von außen bis zum Kai ('koeln': Rotterdam über Waal und Rhein,
//                             'hamburg': Elbe ab Cuxhaven), aus Overture-Daten (waterways.ts, tools/build-water.py)
//   shipMinutes(cityId)       Fahrzeit dieses Wegs mit SHIP_SPEED (nur zur Anzeige, die Lieferzeit kommt aus suppliers)
//
// Routen werden gemerkt (gleiche Punkte = gleiche Route), die Rechnung ist deterministisch.

import { defineModule, distanceMeters, type LngLat } from '../../core';
import { SHIP_SPEED } from './config';
import {
  decodeApproaches,
  decodeLine,
  findRoute,
  nearestMotorwayNode,
  networkCenter,
  networkSize,
  pointsToLngLat,
  snapToRoad,
} from './graph';

import { WATERWAYS } from './waterways';

export { SHIP_SPEED } from './config';
export { networkSize, ROAD_SPEEDS, type RoadClass } from './graph';

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

/** Route über das Straßennetz. Liegt ein Punkt weit weg von jeder Straße, gibt es die Luftlinie. */
export function roadRoute(from: LngLat, to: LngLat): RoadRoute {
  const id = `${key(from)}>${key(to)}`;
  const known = cache.get(id);
  if (known) return known;
  const found = findRoute(from, to);
  let route: RoadRoute;
  if (found) {
    const path = pointsToLngLat(found.points);
    const drive = path.slice(found.roadStart, found.roadEnd + 1);
    route = {
      path,
      meters: Math.round(found.meters),
      onRoads: true,
      drive: drive.length >= 2 ? drive : [drive[0] ?? path[0], drive[0] ?? path[0]],
      walkFrom: found.roadStart > 0 ? [path[0], path[found.roadStart]] : null,
      walkTo: found.roadEnd < path.length - 1 ? [path[found.roadEnd], path[path.length - 1]] : null,
    };
  } else {
    const path = [
      { lng: from.lng, lat: from.lat },
      { lng: to.lng, lat: to.lat },
    ];
    route = {
      path,
      meters: Math.round(distanceMeters(from, to)),
      onRoads: false,
      drive: path,
      walkFrom: null,
      walkTo: null,
    };
  }
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

export interface RoadApproach {
  /** Autobahn, z.B. 'A3'. */
  ref: string;
  /** Wohin sie führt, z.B. "Siegburg, Frankfurt". */
  toward: string;
  /** Weg über die Autobahn vom Rand des Ausschnitts bis zum ersten Knoten im Netz (dort geht roadRoute weiter). */
  path: LngLat[];
}

let approachList: RoadApproach[] | null = null;

/** Alle Autobahn-Zufahrten (aus network.ts, erzeugt von tools/build-roads.py). */
export function roadApproaches(): readonly RoadApproach[] {
  approachList ??= decodeApproaches().filter((a) => a.path.length >= 2);
  return approachList;
}

/** Kompassrichtung von a nach b in Grad (flach gerechnet, reicht für den Vergleich von Richtungen). */
function heading(a: LngLat, b: LngLat): number {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  return ((Math.atan2(dx, b.lat - a.lat) * 180) / Math.PI + 360) % 360;
}

/**
 * Zufahrt für eine Lieferung von weit her: die Autobahn via (z.B. 'A3' aus Frankfurt, 'A57' aus Amsterdam, 'A1' aus
 * Hamburg und Berlin), deren Rand-Punkt am besten in Richtung des fernen Orts liegt. Ohne via die beste Richtung
 * überhaupt; null, wenn das Netz keine Zufahrten hat.
 */
export function roadApproach(far: LngLat, via?: string): RoadApproach | null {
  const all = roadApproaches();
  const pool = via ? all.filter((a) => a.ref === via) : all;
  const list = pool.length > 0 ? pool : all;
  if (list.length === 0) return null;
  const center = networkCenter();
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
 * Wo eine Lieferung von weit her (Frankfurt, Berlin …) auf das Kölner Netz trifft: das Ende der passenden
 * Autobahn-Zufahrt (roadApproach). Ohne Zufahrten der nächste Autobahn-Knoten, ohne Autobahnen der Ort selbst.
 */
export function roadEntryFrom(far: LngLat, via?: string): LngLat {
  const id = `${key(far)}|${via ?? ''}`;
  let entry = entries.get(id);
  if (!entry) {
    const approach = roadApproach(far, via);
    entry = approach
      ? approach.path[approach.path.length - 1]
      : (nearestMotorwayNode(far) ?? { lng: far.lng, lat: far.lat });
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
  const snap = snapToRoad(point);
  if (!snap) return null;
  const [p] = pointsToLngLat([[snap.x, snap.y]]);
  return { point: p, meters: Math.round(snap.distance) };
}

/** Anzahl Knoten, Kanten und Kilometer (für die Oberfläche). */
export function networkStats(): { nodes: number; edges: number; km: number } {
  const size = networkSize();
  return { nodes: size.nodes, edges: size.edges, km: Math.round(size.meters / 1000) };
}

export default defineModule({ id: 'roads', version: 1 });
