// Kacheln vorladen (Auftrag 50, „Flüssiger“): Fährst du in eine andere Stadt, holt der Browser die Kacheln ihrer
// Ansicht schon während der Fahrt in seinen HTTP-Cache. MapLibre lädt sie bei der Ankunft dann von dort, die Stadt ist
// sofort scharf statt Stück für Stück. Reine Optik: liest nichts aus dem Spiel, ändert nichts.

import type { Map as MapLibreMap, VectorTileSource } from 'maplibre-gl';
import type { LngLat } from '../core';
import { activeMap } from './effects';

/** Quelle der Grundkarte (style.ts). */
const BASE_SOURCE = 'openmaptiles';
/** Kachelgröße der Vektorkacheln in Pixeln (MapLibre: 512). */
const TILE_PX = 512;
/** Höchstens so viele Kacheln pro Aufruf (zwei Zoomstufen eines großen Bildschirms). */
const MAX_TILES = 60;

/** Kachel-Koordinaten (x, y) eines Punkts auf Zoomstufe z (Web Mercator). */
export function tileAt(point: LngLat, z: number): [number, number] {
  const n = 2 ** z;
  const x = ((point.lng + 180) / 360) * n;
  const lat = (point.lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
  return [Math.floor(x), Math.floor(y)];
}

/**
 * Kacheln für eine Ansicht: Zoomstufen floor(zoom) − 1 und floor(zoom) (höchstens maxzoom der Quelle), je ein
 * Rechteck um die Mitte, so groß wie der Bildschirm. Ohne Doppelte, Mitte zuerst.
 */
export function tilesFor(
  center: LngLat,
  zoom: number,
  screen: { width: number; height: number },
  maxzoom: number,
): { z: number; x: number; y: number }[] {
  const out: { z: number; x: number; y: number }[] = [];
  const top = Math.min(maxzoom, Math.floor(zoom));
  for (const z of [top, top - 1]) {
    if (z < 0) continue;
    const [cx, cy] = tileAt(center, z);
    // Bei Zoom zoom ist eine Kachel der Stufe z so viele Pixel groß.
    const px = TILE_PX * 2 ** (zoom - z);
    const rx = Math.ceil(screen.width / px / 2);
    const ry = Math.ceil(screen.height / px / 2);
    const ring: { z: number; x: number; y: number; d: number }[] = [];
    for (let dx = -rx; dx <= rx; dx++)
      for (let dy = -ry; dy <= ry; dy++) ring.push({ z, x: cx + dx, y: cy + dy, d: Math.abs(dx) + Math.abs(dy) });
    ring.sort((a, b) => a.d - b.d);
    for (const t of ring) out.push({ z: t.z, x: t.x, y: t.y });
  }
  return out.slice(0, MAX_TILES);
}

const prefetched = new Set<string>();

/** Kacheln einer Ansicht in den Cache des Browsers holen (leise, Fehler egal). */
export function prefetchView(map: MapLibreMap, center: LngLat, zoom: number): void {
  const source = map.getSource(BASE_SOURCE) as VectorTileSource | undefined;
  const template = source?.tiles?.[0];
  if (!template || typeof fetch !== 'function') return;
  const canvas = map.getCanvas();
  const ratio = map.getPixelRatio() || 1;
  const screen = { width: canvas.width / ratio || 1200, height: canvas.height / ratio || 800 };
  for (const t of tilesFor(center, zoom, screen, source.maxzoom ?? 14)) {
    const url = template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
    if (prefetched.has(url)) continue;
    prefetched.add(url);
    // Niedrige Priorität: Was die Karte gerade sichtbar braucht, geht vor. Den Körper lesen, damit er ganz im Cache liegt.
    fetch(url, { priority: 'low' } as RequestInit)
      .then(async (response) => {
        if (response.ok) await response.arrayBuffer();
        else prefetched.delete(url);
      })
      .catch(() => prefetched.delete(url));
  }
}

/** Wie prefetchView, an der aktiven Karte (für Reaktionen auf Ereignisse); ohne Karte nichts. */
export function prefetchMapView(center: LngLat, zoom: number): void {
  const map = activeMap();
  if (map) prefetchView(map, center, zoom);
}
