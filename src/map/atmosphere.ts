// Stimmung der Karte: Beiträge der Module (z.B. Wetter) und der gewünschte Niederschlag.
// Module setzen ihre Werte aus ihrem Karten-Layer (update), die Karte liest sie beim nächsten Neuzeichnen.

import { combineMoods, type MapMood } from './look';

const moods = new Map<string, MapMood>();

/**
 * Stimmung setzen oder mit null entfernen. id mit Modul-Präfix, z.B. 'weather'.
 * Beispiel: setMapMood('weather', { darken: 0.3, tint: '#1b3050', tintStrength: 0.3, wet: 1 })
 */
export function setMapMood(id: string, mood: MapMood | null): void {
  if (mood) moods.set(id, { ...mood });
  else moods.delete(id);
}

/** Alle Stimmungen zusammengefasst. */
export function currentMood(): MapMood {
  return combineMoods([...moods.values()]);
}

export type PrecipitationKind = 'none' | 'rain' | 'snow';

export interface Precipitation {
  kind: PrecipitationKind;
  /** 0–1: Menge. */
  intensity: number;
  /** -1 (nach links) bis 1 (nach rechts): Wind neigt Regen und treibt Schnee. */
  wind?: number;
}

let precipitation: Precipitation = { kind: 'none', intensity: 0 };

/** Regen- oder Schnee-Overlay über der Karte einstellen. */
export function setPrecipitation(next: Precipitation): void {
  precipitation = { ...next, intensity: Math.min(1, Math.max(0, next.intensity)) };
}

export function currentPrecipitation(): Precipitation {
  return precipitation;
}
