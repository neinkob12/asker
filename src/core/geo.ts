// Geo-Hilfen. Koordinaten immer als { lng, lat } in Grad (wie MapLibre).

export interface LngLat {
  lng: number;
  lat: number;
}

const EARTH_RADIUS_M = 6371000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Luftlinie in Metern (Haversine). */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punkt auf der Strecke von a nach b, t von 0 bis 1 (lineare Näherung, reicht für Luftlinien). */
export function lerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
  const p = Math.min(1, Math.max(0, t));
  return { lng: a.lng + (b.lng - a.lng) * p, lat: a.lat + (b.lat - a.lat) * p };
}
