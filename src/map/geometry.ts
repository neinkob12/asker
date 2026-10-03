// Geometrie für Effekte: Punkte entlang einer Linie, Richtung, Versatz. Rein rechnerisch, getestet.

import { distanceMeters, type LngLat } from '../core';

const METERS_PER_DEGREE = 111320;

/** Länge einer Linie in Metern. */
export function pathLength(path: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i]);
  return total;
}

/** Richtung von a nach b in Grad (0 = Norden, 90 = Osten), wie ein Kompass. */
export function bearing(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x =
    Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (((Math.atan2(y, x) / rad) % 360) + 360) % 360;
}

/**
 * Punkt bei Anteil t (0–1) der Strecke entlang einer Linie aus mehreren Punkten, gleichmäßig nach Metern.
 * Liefert auch die Fahrtrichtung, damit Fahrzeuge sich drehen können.
 */
export function pointAlong(path: readonly LngLat[], t: number): { position: LngLat; bearing: number } {
  if (path.length === 0) return { position: { lng: 0, lat: 0 }, bearing: 0 };
  if (path.length === 1) return { position: { ...path[0] }, bearing: 0 };
  const p = Math.min(1, Math.max(0, t));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distanceMeters(path[i - 1], path[i]);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return { position: { ...path[0] }, bearing: 0 };
  let target = p * total;
  for (let i = 0; i < lengths.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (target <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : Math.min(1, target / lengths[i]);
      return {
        position: { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f },
        bearing: bearing(a, b),
      };
    }
    target -= lengths[i];
  }
  return { position: { ...path[path.length - 1] }, bearing: 0 };
}

/** Strecke mit vorberechneten Längen: schnelle Punkte nach Metern (Binärsuche statt jedes Mal neu messen). */
export interface MeasuredPath {
  points: readonly LngLat[];
  /** Länge bis zu jedem Punkt in Metern (erster Punkt 0). */
  cumulative: Float64Array;
  /** Gesamtlänge in Metern. */
  length: number;
}

export function measurePath(points: readonly LngLat[]): MeasuredPath {
  const cumulative = new Float64Array(Math.max(1, points.length));
  for (let i = 1; i < points.length; i++) cumulative[i] = cumulative[i - 1] + distanceMeters(points[i - 1], points[i]);
  return { points, cumulative, length: points.length > 1 ? cumulative[points.length - 1] : 0 };
}

/** Punkt nach so vielen Metern auf der Strecke (vor dem Anfang der Anfang, nach dem Ende das Ende). */
export function pointAtDistance(path: MeasuredPath, meters: number): LngLat {
  const { points, cumulative } = path;
  if (points.length === 0) return { lng: 0, lat: 0 };
  if (points.length === 1 || meters <= 0) return { lng: points[0].lng, lat: points[0].lat };
  if (meters >= path.length) {
    const last = points[points.length - 1];
    return { lng: last.lng, lat: last.lat };
  }
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= meters) lo = mid;
    else hi = mid;
  }
  const span = cumulative[hi] - cumulative[lo];
  const f = span > 0 ? (meters - cumulative[lo]) / span : 0;
  const a = points[lo];
  const b = points[hi];
  return { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f };
}

/**
 * Richtung an einer Stelle der Strecke, gemittelt über ein Fenster (window Meter davor bis danach): An Ecken dreht
 * ein Fahrzeug so weich, statt zu springen. Am Anfang und Ende wird das Fenster kürzer.
 */
export function smoothBearing(path: MeasuredPath, meters: number, window: number): number {
  if (path.points.length < 2 || path.length === 0) return 0;
  const half = Math.min(window, path.length / 2);
  const from = Math.max(0, Math.min(path.length - 2 * half, meters - half));
  const a = pointAtDistance(path, from);
  const b = pointAtDistance(path, from + 2 * half);
  if (a.lng === b.lng && a.lat === b.lat) return 0;
  return bearing(a, b);
}

/**
 * Punkt im Kreis um einen Mittelpunkt, z.B. um mehrere Marker an einem Ort nebeneinander zu stellen.
 * index von count, Abstand in Metern.
 */
export function offsetAround(center: LngLat, index: number, count: number, meters = 14): LngLat {
  if (count <= 1) return { ...center };
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const dLat = (meters * Math.sin(angle)) / METERS_PER_DEGREE;
  const dLng = (meters * Math.cos(angle)) / (METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180));
  return { lng: center.lng + dLng, lat: center.lat - dLat };
}

/**
 * Punkt in einem lokalen Rahmen um origin: forward Meter in Richtung heading (Kompass, 0 = Norden), left Meter
 * quer dazu nach links. Für kleine Grundrisse (Wahrzeichen, Fahrzeuge), die gedreht auf der Karte liegen.
 */
export function offsetMeters(origin: LngLat, heading: number, forward: number, left: number): LngLat {
  const h = (heading * Math.PI) / 180;
  const east = forward * Math.sin(h) - left * Math.cos(h);
  const north = forward * Math.cos(h) + left * Math.sin(h);
  return {
    lng: origin.lng + east / (METERS_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180)),
    lat: origin.lat + north / METERS_PER_DEGREE,
  };
}

/** Meter pro Bildschirmpixel bei einer Zoomstufe (MapLibre, 512er Kacheln). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Koordinate im Überwachungsstil, z.B. 50°56'21"N bzw. 006°57'04"E. */
export function formatDms(value: number, axis: 'lat' | 'lng'): string {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60);
  if (sec === 60) {
    sec = 0;
    min += 1;
  }
  if (min === 60) {
    min = 0;
    deg += 1;
  }
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(deg, axis === 'lat' ? 2 : 3)}°${pad(min)}'${pad(sec)}"${hemi}`;
}
