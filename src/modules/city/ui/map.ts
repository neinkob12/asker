// Das Autobahn-Netz in der Deutschland-Ansicht (Auftrag 31 und 36): alle Linien zwischen den Städten fein und gedämpft,
// die Abschnitte, auf denen gerade eine Fahrt läuft (du selbst, eine Route, ein Lieferant aus einer anderen Stadt), in
// Gold. Nur weit herausgezoomt; in der Stadt zeigt die Grundkarte die Autobahnen. Die Glas-Karten der Städte: cards.tsx.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import { FAR_ZOOM, type MapLayer, mapToken } from '../../../map';
import { getTrips, isInterCityTrip, originCity, tripCity } from '../../logistics';
import { autobahnLines, autobahnPath } from '../../roads';
import { getSupplier, shipmentsInTransit } from '../../suppliers';
import { cityTravel, playableCities } from '../index';

const AUTOBAHN_SOURCE = 'city.autobahn';
const AUTOBAHN_GLOW = 'city.autobahn.glow';

/** Stadt, in deren Rahmen der Punkt liegt (null außerhalb aller Städte, z.B. Frankfurt). */
function cityContaining(point: LngLat): string | null {
  for (const c of playableCities()) {
    const [w, s, e, n] = c.bounds;
    if (point.lng >= w && point.lng <= e && point.lat >= s && point.lat <= n) return c.id;
  }
  return null;
}

/** Schlüssel einer Linie unabhängig von der Richtung. */
const lineKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Abschnitte des Netzes, auf denen gerade eine Fahrt zwischen zwei Städten läuft. */
export function busyLines(state: GameState): Set<string> {
  const busy = new Set<string>();
  const mark = (from: string, to: string) => {
    for (const leg of autobahnPath(from, to)?.legs ?? []) busy.add(lineKey(leg.from, leg.to));
  };
  const travel = cityTravel(state);
  if (travel) mark(travel.from, travel.to);
  for (const trip of getTrips(state)) {
    if (isInterCityTrip(state, trip)) mark(originCity(state, trip), tripCity(state, trip));
  }
  for (const s of shipmentsInTransit(state)) {
    const supplier = getSupplier(state, s.supplierId);
    if (supplier?.kind !== 'city') continue;
    const from = cityContaining(supplier);
    const to = s.cityId ?? 'koeln';
    if (from !== null && from !== to) mark(from, to);
  }
  return busy;
}

/** Alle Linien des Autobahn-Netzes, gedämpft; die mit einer laufenden Fahrt in Gold (Eigenschaft busy). */
export const autobahnLayer: MapLayer = {
  id: 'city.autobahn',
  order: 14,
  mount(ctx) {
    const { map } = ctx;
    const gold = mapToken('--hud-gold', '#f2c766');
    const quiet = mapToken('--hud-ink', '#f5f1e8');
    const lines = autobahnLines();
    const data = (busy: Set<string>) => ({
      type: 'FeatureCollection' as const,
      features: lines.map((l) => ({
        type: 'Feature' as const,
        properties: { busy: busy.has(lineKey(l.from, l.to)) ? 1 : 0, ref: l.ref },
        geometry: { type: 'LineString' as const, coordinates: l.path.map((p) => [p.lng, p.lat]) },
      })),
    });
    map.addSource(AUTOBAHN_SOURCE, { type: 'geojson', data: data(new Set()) });
    map.addLayer({
      id: AUTOBAHN_GLOW,
      type: 'line',
      source: AUTOBAHN_SOURCE,
      maxzoom: FAR_ZOOM + 1,
      filter: ['==', ['get', 'busy'], 1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': gold,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 4, 9, 8],
        'line-blur': 4,
        'line-opacity': 0.22,
      },
    });
    map.addLayer({
      id: AUTOBAHN_SOURCE,
      type: 'line',
      source: AUTOBAHN_SOURCE,
      maxzoom: FAR_ZOOM + 1,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'busy'], 1], gold, quiet],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['==', ['get', 'busy'], 1], 1.8, 1.4], 9, 2.6],
        'line-opacity': ['case', ['==', ['get', 'busy'], 1], 0.95, 0.5],
      },
    });
    let shownKey = '';
    return {
      update(state) {
        const busy = busyLines(state);
        const key = [...busy].sort().join(',');
        if (key === shownKey) return;
        shownKey = key;
        (map.getSource(AUTOBAHN_SOURCE) as GeoJSONSource | undefined)?.setData(data(busy));
      },
      destroy() {
        for (const id of [AUTOBAHN_SOURCE, AUTOBAHN_GLOW]) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(AUTOBAHN_SOURCE)) map.removeSource(AUTOBAHN_SOURCE);
      },
    };
  },
};
