// Veedel: die Stadtteile der Städte im Spiel (Köln, seit Auftrag 30 auch Hamburg, seit Auftrag 38 München) mit echten
// Grenzen, Eigenschaften und Nachbarschaft. Statische Daten, kein eigener Spielzustand. Grenzen: Köln aus den Offenen
// Daten Köln (Datenlizenz Deutschland – Zero – 2.0), Hamburg und München aus Overture Maps / OpenStreetMap (ODbL),
// Details in boundaries*.ts und tools/.
//
// Öffentliche API:
//   allVeedel(cityId?) (ohne Stadt: alle Städte), getVeedel(id), veedelName(id), veedelCity(id), veedelAt(lng, lat),
//   neighborsOf(id), sharesBorder(a, b), getBoundary(id), veedelLinks(), nightlifeOf(id)

import { defineModule } from '../../core';
import { SHARED_BORDERS as KOELN_BORDERS, BOUNDARY_COORDINATES as KOELN_BOUNDARIES } from './boundaries';
import { SHARED_BORDERS as HAMBURG_BORDERS, BOUNDARY_COORDINATES as HAMBURG_BOUNDARIES } from './boundaries-hamburg';
import { SHARED_BORDERS as MUENCHEN_BORDERS, BOUNDARY_COORDINATES as MUENCHEN_BOUNDARIES } from './boundaries-muenchen';
import { LINKS as KOELN_LINKS, VEEDEL as KOELN_VEEDEL, type Veedel } from './data';
import { LINKS_HAMBURG, VEEDEL_HAMBURG } from './data-hamburg';
import { LINKS_MUENCHEN, VEEDEL_MUENCHEN } from './data-muenchen';

export type { Veedel } from './data';

/** Punkt als [lng, lat], wie in GeoJSON. */
export type LngLatTuple = readonly [number, number];

/** Alle Veedel aller Städte, Köln zuerst. */
const VEEDEL: readonly Veedel[] = [...KOELN_VEEDEL, ...VEEDEL_HAMBURG, ...VEEDEL_MUENCHEN];
const BOUNDARY_COORDINATES: Record<string, readonly number[]> = {
  ...KOELN_BOUNDARIES,
  ...HAMBURG_BOUNDARIES,
  ...MUENCHEN_BOUNDARIES,
};
const SHARED_BORDERS: Record<string, readonly string[]> = { ...KOELN_BORDERS, ...HAMBURG_BORDERS, ...MUENCHEN_BORDERS };
const LINKS: readonly { a: string; b: string; via: string }[] = [
  ...KOELN_LINKS,
  ...LINKS_HAMBURG.map((l) => ({ a: l.a, b: l.b, via: l.why })),
  ...LINKS_MUENCHEN.map((l) => ({ a: l.a, b: l.b, via: l.why })),
];
const BY_ID = new Map(VEEDEL.map((v) => [v.id, v]));
const BY_CITY = new Map<string, Veedel[]>();
for (const v of VEEDEL) {
  const list = BY_CITY.get(v.cityId) ?? [];
  list.push(v);
  BY_CITY.set(v.cityId, list);
}

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

/** Veedel einer Stadt, ohne Stadt alle Veedel aller Städte (Köln zuerst). */
export function allVeedel(cityId?: string): readonly Veedel[] {
  if (cityId === undefined) return VEEDEL;
  return BY_CITY.get(cityId) ?? [];
}

/** Stadt eines Veedels ('koeln' für unbekannte IDs, so verhalten sich alte Daten wie bisher). */
export function veedelCity(id: string): string {
  return BY_ID.get(id)?.cityId ?? 'koeln';
}

/** Nachtleben eines Veedels (1 = normal). */
export function nightlifeOf(id: string): number {
  return BY_ID.get(id)?.nightlife ?? 1;
}

export function getVeedel(id: string): Veedel | undefined {
  return BY_ID.get(id);
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
