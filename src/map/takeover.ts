// Die Karte gehört zeitweise jemand anderem (Auftrag 44, Minispiele mit layout 'map', z.B. die Verfolgungsjagd):
// keine Bedienung der Karte (Ziehen, Zoomen, Drehen, Tastatur), keine Marker (geparkt, parkMarkers) und kein HUD über
// der Karte (Klasse `is-map-taken` an <html>), wählbare Ebenen aus (Kulisse wie Verkehr und Leute an Spots). Danach
// kommt alles zurück, auch Kamera und Ränder.

import type { Map as MapLibreMap, PaddingOptions } from 'maplibre-gl';
import { activeMap } from './effects';
import { parkMarkers } from './markers';

export interface MapTakeoverOptions {
  /** MapLibre-Ebenen, die solange aus sind (z.B. 'roads.traffic'). Fehlende werden übersprungen. */
  hideLayers?: readonly string[];
  /** Dauer der Kamerafahrt zurück in ms (0 bei „Bewegung reduzieren“). Standard 700. */
  restoreDuration?: number;
}

/** Klasse an <html>, solange die Karte übernommen ist. */
export const MAP_TAKEN_CLASS = 'is-map-taken';

let owners = 0;

/**
 * Übernimmt die aktive Karte und gibt eine Funktion zurück, die alles wiederherstellt (genau einmal wirksam).
 * Ohne Karte (noch nicht geladen, Tests) kommt eine Funktion zurück, die nichts tut.
 */
export function takeOverMap(options: MapTakeoverOptions = {}): () => void {
  const map = activeMap();
  owners += 1;
  document.documentElement.classList.add(MAP_TAKEN_CLASS);
  const restore = map ? lockMap(map, options) : () => {};
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owners = Math.max(0, owners - 1);
    if (owners === 0) document.documentElement.classList.remove(MAP_TAKEN_CLASS);
    restore();
  };
}

function lockMap(map: MapLibreMap, options: MapTakeoverOptions): () => void {
  const saved = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    padding: map.getPadding() as PaddingOptions,
  };
  const handlers = [
    map.dragPan,
    map.scrollZoom,
    map.boxZoom,
    map.dragRotate,
    map.keyboard,
    map.doubleClickZoom,
    map.touchZoomRotate,
    map.touchPitch,
  ];
  const wasOn = handlers.map((h) => h.isEnabled());
  for (const h of handlers) h.disable();
  const unpark = parkMarkers(map);
  const hidden: string[] = [];
  for (const id of options.hideLayers ?? []) {
    if (!map.getLayer(id) || map.getLayoutProperty(id, 'visibility') === 'none') continue;
    map.setLayoutProperty(id, 'visibility', 'none');
    hidden.push(id);
  }
  return () => {
    // Die Karte kann inzwischen weg sein (neues Spiel, Seitenwechsel).
    if (activeMap() !== map) {
      unpark(false);
      return;
    }
    unpark();
    for (const id of hidden) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    handlers.forEach((h, i) => {
      if (wasOn[i]) h.enable();
    });
    map.stop();
    map.easeTo({ ...saved, duration: options.restoreDuration ?? 700 });
  };
}
