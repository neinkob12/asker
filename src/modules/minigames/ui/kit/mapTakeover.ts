// Minispiele mit layout 'map' (Verfolgungsjagd): Der Rahmen übernimmt die Karte, bevor das Spiel startet, und gibt sie
// beim Schließen zurück (takeOverMap aus src/map). Das Spiel selbst holt sich die Karte mit activeMap() und führt nur
// noch die Kamera.

import { useEffect, useState } from 'preact/hooks';
import { takeOverMap } from '../../../../map';
import { prefersReducedMotion } from '../../../../ui';

/**
 * Kulisse, die während eines Minispiels auf der Karte aus ist (Verkehr, Leute an Spots). Es zählen die IDs der
 * MapLibre-Ebenen, nicht die der Layer-Registry: Die Leute an Spots liegen in drei Gruppen und der Streife
 * (spots/ui/people.ts, groupLayer und PATROL_SOURCE).
 */
export const MAP_DECOR_LAYERS = [
  'roads.traffic',
  'spots.people.0',
  'spots.people.1',
  'spots.people.2',
  'spots.people.patrol',
] as const;

/** Übernimmt die Karte, solange `active` gilt; true, sobald sie dem Minispiel gehört (sofort bei !active). */
export function useMapTakeover(active: boolean): boolean {
  const [ready, setReady] = useState(!active);
  useEffect(() => {
    if (!active) return;
    const release = takeOverMap({
      hideLayers: MAP_DECOR_LAYERS,
      restoreDuration: prefersReducedMotion() ? 0 : 700,
    });
    setReady(true);
    return release;
  }, [active]);
  return ready;
}
