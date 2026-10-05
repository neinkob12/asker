// Prüfung "Fahrzeuge fahren überall auf der Straße" (scripts/check-roads.mjs, läuft in `npm run lint`):
//
//   1. Alle Spots, Lager, der Hafen und die Autobahn-Einfahrten (roadEntryFrom für jede Lieferanten-Stadt) liegen
//      höchstens MAX_SNAP_METERS von einer Straße des Netzes.
//   2. roadRoute zwischen allen Lagern und Spots (beide Richtungen) und zwischen Hafen und Lagern hat kein gerades Stück
//      über MAX_STRAIGHT_METERS, das nicht auf einer Straße liegt (Luftlinie), und findet überhaupt eine Straße.
//
// Jede Stadt (Auftrag 30) für sich: Routen nur zwischen Orten derselben Stadt (zwischen den Städten fährt man über
// die A1, interCityRoute). Fehler nennen Ort und Abstand.

import { distanceMeters, type GameState, type LngLat } from '../../../core';
import { getCity, playableCities } from '../../city';
import { warehouseSites } from '../../goods';
import { portPlace } from '../../logistics';
import { getAllSpots, spotCity } from '../../spots';
import { getSuppliers, supplierVia } from '../../suppliers';
import { nearestRoadPoint, roadEntryFrom, roadRoute } from '../index';

export const MAX_SNAP_METERS = 60;
export const MAX_STRAIGHT_METERS = 80;
/** Abstand der Prüfpunkte auf langen geraden Stücken und wie weit sie von einer Straße liegen dürfen. */
const SAMPLE_STEP = 20;
const SAMPLE_TOLERANCE = 15;
/** Lieferanten näher als das an der Stadtmitte fahren nicht über die Autobahn herein. */
const LOCAL_RADIUS = 15_000;

interface Place extends LngLat {
  name: string;
}

export interface RoadProblem {
  /** Kurzer Text mit Ort und Abstand. */
  text: string;
  at: LngLat;
  meters: number;
}

const fmt = (p: LngLat) => `${p.lng.toFixed(5)}, ${p.lat.toFixed(5)}`;

/** Orte einer Stadt, die das Netz erreichen muss (Spots und Lager auch gesperrt bzw. noch nicht gekauft). */
function cityPlaces(
  state: GameState,
  cityId: string,
  center: LngLat,
): { spots: Place[]; warehouses: Place[]; port: Place | null; center: LngLat } {
  // Städte ohne Hafen (Berlin): kein Hafen zu prüfen (portPlace fiele sonst auf den Kölner zurück).
  const port = getCity(cityId)?.portId ? portPlace(cityId) : null;
  return {
    spots: getAllSpots(state)
      .filter((s) => spotCity(s) === cityId)
      .map((s) => ({ name: `Spot ${s.name}`, lng: s.lng, lat: s.lat })),
    warehouses: warehouseSites(cityId).map((w) => ({ name: `Lager ${w.name}`, lng: w.lng, lat: w.lat })),
    port: port ? { name: `Hafen ${port.name}`, lng: port.lng, lat: port.lat } : null,
    center,
  };
}

/** Orte aller Städte im Spiel. */
function allPlaces(state: GameState) {
  return playableCities().map((c) => ({ cityId: c.id, ...cityPlaces(state, c.id, c.center) }));
}

/** Erstes gerades Stück der Route, das nicht auf einer Straße liegt (Luftlinie), oder null. */
function offRoadPiece(path: readonly LngLat[]): { at: LngLat; meters: number } | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = distanceMeters(a, b);
    if (length <= MAX_STRAIGHT_METERS) continue;
    const steps = Math.ceil(length / SAMPLE_STEP);
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      const p = { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f };
      const near = nearestRoadPoint(p);
      if (!near || near.meters > SAMPLE_TOLERANCE) return { at: p, meters: Math.round(length) };
    }
  }
  return null;
}

/** Alle Probleme für einen frischen Spielstand (Spots, Lager, Hafen, Lieferanten wie bei Spielbeginn). */
export function checkRoads(state: GameState): RoadProblem[] {
  const problems: RoadProblem[] = [];
  for (const city of allPlaces(state)) problems.push(...checkCity(state, city));
  return problems;
}

function checkCity(
  state: GameState,
  { cityId, spots, warehouses, port, center }: ReturnType<typeof allPlaces>[number],
): RoadProblem[] {
  const problems: RoadProblem[] = [];
  const entries: Place[] = getSuppliers(state, cityId)
    .filter((s) => s.kind === 'city' && distanceMeters(s, center) > LOCAL_RADIUS)
    .map((s) => ({ name: `Autobahn-Einfahrt aus ${s.name}`, ...roadEntryFrom(s, supplierVia(s, cityId), center) }));
  // Orte, die schon zu weit weg liegen, nicht noch einmal in jeder Route melden.
  const far = new Set<string>();
  for (const place of [...spots, ...warehouses, ...(port ? [port] : []), ...entries]) {
    const near = nearestRoadPoint(place);
    const meters = near?.meters ?? Infinity;
    if (meters > MAX_SNAP_METERS) {
      far.add(place.name);
      problems.push({
        text: `${place.name} (${fmt(place)}): ${Number.isFinite(meters) ? `${meters} m` : 'keine Straße'} bis zur nächsten Straße (höchstens ${MAX_SNAP_METERS} m)`,
        at: place,
        meters,
      });
    }
  }

  const pairs: [Place, Place][] = [];
  for (const w of warehouses) {
    for (const s of spots) pairs.push([w, s], [s, w]);
    if (port) pairs.push([port, w], [w, port]);
  }
  for (const [from, to] of pairs) {
    if (far.has(from.name) || far.has(to.name)) continue;
    const route = roadRoute(from, to);
    if (!route.onRoads) {
      problems.push({
        text: `Route ${from.name} → ${to.name}: keine Straße gefunden, Luftlinie ${route.meters} m`,
        at: from,
        meters: route.meters,
      });
      continue;
    }
    const piece = offRoadPiece(route.path);
    if (piece) {
      problems.push({
        text: `Route ${from.name} → ${to.name}: gerades Stück ${piece.meters} m neben der Straße bei ${fmt(piece.at)} (höchstens ${MAX_STRAIGHT_METERS} m)`,
        at: piece.at,
        meters: piece.meters,
      });
    }
  }
  return problems;
}

/** Wie viele Orte und Routen geprüft werden (für die Meldung des Skripts). */
export function checkedCounts(state: GameState): { places: number; routes: number } {
  let places = 0;
  let routes = 0;
  for (const { cityId, spots, warehouses } of allPlaces(state)) {
    places +=
      spots.length + warehouses.length + 1 + getSuppliers(state, cityId).filter((s) => s.kind === 'city').length;
    routes += warehouses.length * (spots.length * 2 + 2);
  }
  return { places, routes };
}
