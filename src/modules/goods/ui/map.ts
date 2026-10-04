// Karten-Ebene "Lieferwege" (Auftrag 33, Menü Ebenen): Linien vom Lager zu jedem Spot der aktiven Stadt, den es bedient
// (das nächste Lager mit der Ware, die dort am meisten verkauft wird). Spots, deren Lager die Ware nicht mehr hat,
// sind rot. Aus, bis man sie im Menü einschaltet; die Wahl merkt sich die Sitzung.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { BELOW_BUILDINGS, type MapLayer, mapToken } from '../../../map';
import { registerMapLayerOption } from '../../../ui';
import { activeCity } from '../../city';
import { getSpots } from '../../spots';
import { allProducts, DEFAULT_PRODUCT, getStock, servingWarehouse, usagePerDay } from '../index';

const SOURCE = 'goods.supplyRoutes';
let visible = false;
let refresh: (() => void) | null = null;

/** Welche Ware ein Spot vor allem braucht: die meistverkaufte, ohne Verkäufe das Standardprodukt. */
function mainProduct(state: GameState, spotId: string): string {
  let best = DEFAULT_PRODUCT;
  let most = 0;
  for (const p of allProducts()) {
    const n = usagePerDay(state, { spotId, productId: p.id });
    if (n > most) {
      most = n;
      best = p.id;
    }
  }
  return best;
}

interface LineFeature {
  type: 'Feature';
  properties: { empty: number };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

/** Linien Lager → Spot als GeoJSON (empty = das Lager hat die Ware nicht mehr). */
function supplyLines(state: GameState): { type: 'FeatureCollection'; features: LineFeature[] } {
  const features: LineFeature[] = [];
  for (const spot of getSpots(state, activeCity(state))) {
    const productId = mainProduct(state, spot.id);
    const from = servingWarehouse(state, spot, productId);
    if (!from) continue;
    const empty = getStock(state, { warehouseId: from.id, productId }) <= 0;
    features.push({
      type: 'Feature',
      properties: { empty: empty ? 1 : 0 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lng, from.lat],
          [spot.lng, spot.lat],
        ],
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export const supplyRoutesLayer: MapLayer = {
  id: 'goods.supplyRoutes',
  order: 29,
  mount(ctx) {
    const { map } = ctx;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      {
        id: SOURCE,
        type: 'line',
        source: SOURCE,
        layout: { 'line-cap': 'round', visibility: 'none' },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'empty'], 1],
            mapToken('--color-bad', '#e5484d'),
            mapToken('--cat-goods', '#c8aa85'),
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 3.5],
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.85,
        },
      },
      map.getLayer(BELOW_BUILDINGS) ? BELOW_BUILDINGS : undefined,
    );
    let key = '';
    const draw = (state: GameState | null) => {
      if (!map.getLayer(SOURCE)) return;
      map.setLayoutProperty(SOURCE, 'visibility', visible ? 'visible' : 'none');
      if (!visible || !state) return;
      const data = supplyLines(state);
      const next = JSON.stringify(data.features.map((f) => [f.geometry, f.properties]));
      if (next === key) return;
      key = next;
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(data);
    };
    refresh = () => draw(ctx.getState());
    let lastTime = -1;
    return {
      update(state) {
        // Höchstens einmal pro Spielstunde neu rechnen: Lieferwege ändern sich langsam.
        const hour = Math.floor(state.time / 60);
        if (hour === lastTime) return;
        lastTime = hour;
        draw(state);
      },
      destroy() {
        refresh = null;
        if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      },
    };
  },
};

registerMapLayerOption({
  id: 'goods.supplyRoutes',
  order: 60,
  group: 'Anzeige',
  label: 'Lieferwege',
  icon: 'route',
  toggle: true,
  active: () => visible,
  select: () => {
    visible = !visible;
    refresh?.();
  },
});
