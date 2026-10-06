// Zugriff auf die MapLibre-Karte für die Verfolgungsjagd: Die Karte gibt es nur über die Registry der Karten-Ebenen
// (registerMapLayer). Diese Ebene selbst zeichnet nichts, sie merkt sich nur die Karte.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { registerMapLayer } from '../../../../../map';

let current: MapLibreMap | null = null;

/** Die Karte (null, solange sie noch nicht steht). */
export function chaseMap(): MapLibreMap | null {
  return current;
}

registerMapLayer({
  id: 'minigames.chase',
  order: 999,
  mount(ctx) {
    current = ctx.map;
    return {
      destroy() {
        if (current === ctx.map) current = null;
      },
    };
  },
});
