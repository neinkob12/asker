// Routen Lieferant → Lager, Lieferanten-Marker und Transporter (Effekt-Werkzeug createVehicle), die entlang der
// Luftlinie fahren (echte Routen später). Hafen: Lkw, Großstädte: Transporter.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { addHtmlMarker, createVehicle, el, type MapLayer, type VehicleHandle } from '../../../map';
import { DEFAULT_WAREHOUSE, formatProductAmount, getWarehouse, productName } from '../../goods';
import { getSuppliers, shipmentProgress, shipmentsInTransit } from '../index';

const LATE_CLASS = 'is-late';

const SOURCE = 'suppliers.routes';

export const suppliersLayer: MapLayer = {
  id: 'suppliers.routes',
  order: 20,
  mount(ctx) {
    const { map } = ctx;
    const trucks = new Map<number, VehicleHandle>();
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'suppliers.routes',
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': '#7CFC9A', 'line-width': 2.5, 'line-dasharray': [2, 2], 'line-opacity': 0.8 },
    });

    // Lieferanten-Marker einmal anlegen.
    let placed = false;
    const placeSuppliers = () => {
      const state = ctx.getState();
      if (!state || placed) return;
      placed = true;
      for (const supplier of getSuppliers(state)) {
        addHtmlMarker(map, {
          position: supplier,
          className: `map-place map-place--${supplier.kind}`,
          anchor: 'bottom',
          children: [el('span', 'map-place-icon'), el('span', 'map-place-name', supplier.name)],
        });
      }
    };
    placeSuppliers();

    // Routen nur für Lieferanten, von denen gerade etwas unterwegs ist.
    let routesKey = '';
    const drawRoutes = (state: GameState) => {
      const active = [...new Set(shipmentsInTransit(state).map((s) => s.supplierId))].sort();
      const key = active.join(',');
      if (key === routesKey) return;
      routesKey = key;
      const warehouse = getWarehouse(state, DEFAULT_WAREHOUSE);
      const features = [];
      for (const supplier of getSuppliers(state)) {
        if (!warehouse || !active.includes(supplier.id)) continue;
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
      (map.getSource(SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    };

    return {
      update(state) {
        placeSuppliers();
        drawRoutes(state);
        const active = new Set(shipmentsInTransit(state).map((s) => s.id));
        for (const [id, vehicle] of trucks) {
          if (!active.has(id)) {
            vehicle.remove();
            trucks.delete(id);
          }
        }
        for (const s of shipmentsInTransit(state)) {
          const supplier = getSuppliers(state).find((x) => x.id === s.supplierId);
          const warehouse = getWarehouse(state, s.warehouseId);
          if (!supplier || !warehouse) continue;
          let vehicle = trucks.get(s.id);
          if (!vehicle) {
            vehicle = createVehicle(map, {
              path: [supplier, warehouse],
              kind: supplier.kind === 'port' ? 'truck' : 'van',
              label: formatProductAmount(s.productId, s.amount),
              title: `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)} aus ${supplier.name}`,
            });
            trucks.set(s.id, vehicle);
          }
          vehicle.setProgress(shipmentProgress(state, s));
          vehicle.element.classList.toggle(LATE_CLASS, s.problem === 'delayed' && !!s.problemRevealed);
        }
      },
      destroy() {
        for (const vehicle of trucks.values()) vehicle.remove();
        trucks.clear();
      },
    };
  },
};
