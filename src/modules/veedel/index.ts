// Veedel: die Kölner Stadtteile mit Mittelpunkt, Eigenschaften und Nachbarschaft.
// Statische Daten, kein eigener Spielzustand.
//
// Öffentliche API:
//   allVeedel(), getVeedel(id), veedelAt(lng, lat), neighborsOf(id), veedelName(id)

import { defineModule, distanceMeters } from '../../core';
import { NEIGHBORS, VEEDEL, type Veedel } from './data';

export type { Veedel } from './data';

/** Punkte, die weiter als das vom nächsten Mittelpunkt entfernt sind, liegen in keinem Veedel des Spiels. */
const MAX_DISTANCE_METERS = 3000;

export function allVeedel(): readonly Veedel[] {
  return VEEDEL;
}

export function getVeedel(id: string): Veedel | undefined {
  return VEEDEL.find((v) => v.id === id);
}

export function veedelName(id: string): string {
  return getVeedel(id)?.name ?? id;
}

/**
 * In welchem Veedel liegt der Punkt? Näherung über den nächsten Mittelpunkt, null außerhalb.
 * Auftrag 10 ersetzt das durch eine echte Punkt-in-Polygon-Prüfung.
 */
export function veedelAt(lng: number, lat: number): Veedel | null {
  let best: Veedel | null = null;
  let bestDistance = Infinity;
  for (const v of VEEDEL) {
    const d = distanceMeters({ lng, lat }, v.center);
    if (d < bestDistance) {
      best = v;
      bestDistance = d;
    }
  }
  return bestDistance <= MAX_DISTANCE_METERS ? best : null;
}

/** IDs der angrenzenden Veedel. */
export function neighborsOf(id: string): readonly string[] {
  return NEIGHBORS[id] ?? [];
}

export default defineModule({
  id: 'veedel',
  version: 1,
});
