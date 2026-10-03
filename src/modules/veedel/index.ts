// Veedel: die Kölner Stadtteile mit echten Grenzen, Eigenschaften und Nachbarschaft.
// Statische Daten, kein eigener Spielzustand. Grenzen: Offene Daten Köln, Datenlizenz Deutschland – Zero – 2.0
// (Details in boundaries.ts und tools/build-boundaries.mjs).
//
// Öffentliche API:
//   allVeedel(), getVeedel(id), veedelName(id), veedelAt(lng, lat), neighborsOf(id), sharesBorder(a, b),
//   getBoundary(id), veedelLinks()

import { defineModule } from '../../core';
import { BOUNDARY_COORDINATES, SHARED_BORDERS } from './boundaries';
import { LINKS, VEEDEL, type Veedel } from './data';

export type { Veedel } from './data';

/** Punkt als [lng, lat], wie in GeoJSON. */
export type LngLatTuple = readonly [number, number];

interface Shape {
  ring: LngLatTuple[];
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

const SHAPES: Record<string, Shape> = {};
for (const [id, flat] of Object.entries(BOUNDARY_COORDINATES)) {
  const ring: LngLatTuple[] = [];
  for (let i = 0; i < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
  SHAPES[id] = {
    ring,
    minLng: Math.min(...ring.map((p) => p[0])),
    maxLng: Math.max(...ring.map((p) => p[0])),
    minLat: Math.min(...ring.map((p) => p[1])),
    maxLat: Math.max(...ring.map((p) => p[1])),
  };
}

const NEIGHBORS: Record<string, string[]> = {};
for (const v of VEEDEL) NEIGHBORS[v.id] = [...(SHARED_BORDERS[v.id] ?? [])];
for (const { a, b } of LINKS) {
  if (!NEIGHBORS[a].includes(b)) NEIGHBORS[a].push(b);
  if (!NEIGHBORS[b].includes(a)) NEIGHBORS[b].push(a);
}
for (const list of Object.values(NEIGHBORS)) list.sort();

export function allVeedel(): readonly Veedel[] {
  return VEEDEL;
}

export function getVeedel(id: string): Veedel | undefined {
  return VEEDEL.find((v) => v.id === id);
}

export function veedelName(id: string): string {
  return getVeedel(id)?.name ?? id;
}

/** Strahl-Test: liegt der Punkt im Ring? Punkte genau auf einer Grenze landen eindeutig auf einer Seite. */
function inRing(lng: number, lat: number, ring: readonly LngLatTuple[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Gefragt wird meist nach denselben Punkten (Spots, Lager): Ergebnis gemerkt, begrenzt, damit Klicks auf die Karte
// den Speicher nicht füllen.
const AT_CACHE_LIMIT = 4096;
const atCache = new Map<string, Veedel | null>();

/** In welchem Veedel liegt der Punkt? Echte Punkt-in-Polygon-Prüfung, null außerhalb der Veedel im Spiel. */
export function veedelAt(lng: number, lat: number): Veedel | null {
  const key = `${lng},${lat}`;
  const cached = atCache.get(key);
  if (cached !== undefined) return cached;
  let found: Veedel | null = null;
  for (const v of VEEDEL) {
    const shape = SHAPES[v.id];
    if (!shape || lng < shape.minLng || lng > shape.maxLng || lat < shape.minLat || lat > shape.maxLat) continue;
    if (inRing(lng, lat, shape.ring)) {
      found = v;
      break;
    }
  }
  if (atCache.size >= AT_CACHE_LIMIT) atCache.clear();
  atCache.set(key, found);
  return found;
}

/** Grenze des Veedels als Ring [lng, lat] (ohne Wiederholung des Startpunkts), leer für unbekannte IDs. */
export function getBoundary(id: string): readonly LngLatTuple[] {
  return SHAPES[id]?.ring ?? [];
}

/**
 * IDs der Nachbar-Veedel: gemeinsame Grenze oder eine direkte Verbindung über Stadtteile, die nicht im Spiel sind
 * (veedelLinks()). Für die Expansion der Gangs.
 */
export function neighborsOf(id: string): readonly string[] {
  return NEIGHBORS[id] ?? [];
}

/** Haben die beiden Veedel eine echte gemeinsame Grenze? */
export function sharesBorder(a: string, b: string): boolean {
  return SHARED_BORDERS[a]?.includes(b) ?? false;
}

/** Verbindungen ohne gemeinsame Grenze (Brücken, Wege über Stadtteile außerhalb des Spiels). */
export function veedelLinks(): readonly { a: string; b: string; via: string }[] {
  return LINKS;
}

export default defineModule({
  id: 'veedel',
  version: 1,
});
