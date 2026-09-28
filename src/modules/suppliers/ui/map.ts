// Route Hafen → Lager, Hafen-Marker und Transporter, die entlang der Luftlinie fahren.

import type { GeoJSONSource, Marker } from 'maplibre-gl';
import { formatAmount, lerpLngLat } from '../../../core';
import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { DEFAULT_WAREHOUSE, getWarehouse } from '../../goods';
import { getSuppliers, shipmentProgress, shipmentsInTransit } from '../index';

const SOURCE = 'suppliers.routes';

export const suppliersLayer: MapLayer = {
  id: 'suppliers.routes',
  order: 20,
  mount(ctx) {
    const { map } = ctx;
    const trucks = new Map<number, Marker>();
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'suppliers.routes',
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': '#7CFC9A', 'line-width': 2.5, 'line-dasharray': [2, 2], 'line-opacity': 0.8 },
    });

    let drawn = false;
    const drawStatic = () => {
      const state = ctx.getState();
      if (!state || drawn) return;
      drawn = true;
      const warehouse = getWarehouse(state, DEFAULT_WAREHOUSE);
      const features = [];
      for (const supplier of getSuppliers(state)) {
        addHtmlMarker(map, {
          position: supplier,
          className: 'map-place map-place--port',
          anchor: 'bottom',
          children: [el('span', 'map-place-icon'), el('span', 'map-place-name', supplier.name)],
        });
        if (warehouse) {
          features.push({
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [supplier.lng, supplier.lat],
                [warehouse.lng, warehouse.lat],
              ],
            },
          });
        }
      }
      (map.getSource(SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    };
    drawStatic();

    return {
      update(state) {
        drawStatic();
        const active = new Set(shipmentsInTransit(state).map((s) => s.id));
        for (const [id, marker] of trucks) {
          if (!active.has(id)) {
            marker.remove();
            trucks.delete(id);
          }
        }
        for (const s of shipmentsInTransit(state)) {
          const supplier = getSuppliers(state).find((x) => x.id === s.supplierId);
          const warehouse = getWarehouse(state, s.warehouseId);
          if (!supplier || !warehouse) continue;
          const pos = lerpLngLat(supplier, warehouse, shipmentProgress(state, s));
          let marker = trucks.get(s.id);
          if (!marker) {
            marker = addHtmlMarker(map, {
              position: pos,
              className: 'truck-marker',
              title: `${formatAmount(s.amount)} unterwegs`,
            }).marker;
            trucks.set(s.id, marker);
          }
          marker.setLngLat([pos.lng, pos.lat]);
        }
      },
    };
  },
};
