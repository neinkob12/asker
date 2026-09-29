// Lieferungen auf der Karte: 3D-Mini-Fahrzeuge (createVehicle) fahren Luftlinie vom Lieferanten zum Lager
// (echte Routen später), aus einer Großstadt als Transporter. Hafenware kommt als Schiff den Rhein hinauf in den
// Niehler Hafen, wird umgeladen und fährt als Lkw weiter (deliveryLeg). Die Route ist nur eine dezente Linie.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import { addHtmlMarker, createVehicle, el, type MapLayer, pathLength, type VehicleHandle } from '../../../map';
import { DEFAULT_WAREHOUSE, formatProductAmount, getWarehouse, productName } from '../../goods';
import {
  deliveryLeg,
  getSuppliers,
  RHINE_APPROACH_FROM,
  RHINE_APPROACH_SHARE,
  RHINE_ROUTE,
  type Shipment,
  type Supplier,
  shipmentProgress,
  shipmentsInTransit,
  UNLOADING_PORT,
} from '../index';

const SOURCE = 'suppliers.routes';

const toLngLat = ([lng, lat]: readonly [number, number]): LngLat => ({ lng, lat });
const RIVER: LngLat[] = RHINE_ROUTE.map(toLngLat);
const PORT: LngLat = { lng: UNLOADING_PORT.lng, lat: UNLOADING_PORT.lat };

/** Anteil der Strecke (nach Metern), bis zu dem das Schiff bei Anteil u seiner Fahrzeit gekommen ist. */
const shipFraction = (() => {
  const outer = pathLength(RIVER.slice(0, RHINE_APPROACH_FROM + 1));
  const inner = pathLength(RIVER.slice(RHINE_APPROACH_FROM));
  const total = outer + inner;
  const split = 1 - RHINE_APPROACH_SHARE;
  return (u: number) =>
    u < split ? ((u / split) * outer) / total : (outer + ((u - split) / RHINE_APPROACH_SHARE) * inner) / total;
})();

/** Farbe eines Design-Tokens (Karten-Layer brauchen echte Farbwerte). */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

interface ShownShipment {
  ship: VehicleHandle | null;
  road: VehicleHandle;
}

export const suppliersLayer: MapLayer = {
  id: 'suppliers.routes',
  order: 20,
  mount(ctx) {
    const { map } = ctx;
    const shown = new Map<number, ShownShipment>();
    const lateColor = token('--color-warn', '#ffb547');
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'suppliers.routes',
      type: 'line',
      source: SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2.5],
        'line-dasharray': [0.5, 2.5],
        'line-opacity': 0.45,
      },
    });

    // Lieferanten-Marker einmal anlegen, den Niehler Hafen nur, solange ein Schiff unterwegs ist.
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
    const port = addHtmlMarker(map, {
      position: PORT,
      className: 'map-place map-place--harbor',
      anchor: 'bottom',
      children: [el('span', 'map-place-icon'), el('span', 'map-place-name', UNLOADING_PORT.name)],
    });
    port.element.hidden = true;

    const roadStart = (supplier: Supplier) => (supplier.kind === 'port' ? PORT : supplier);

    // Routen nur für Lieferanten, von denen gerade etwas unterwegs ist.
    let routesKey = '';
    const drawRoutes = (state: GameState) => {
      const active = [...new Set(shipmentsInTransit(state).map((s) => s.supplierId))].sort();
      const key = active.join(',');
      if (key === routesKey) return;
      routesKey = key;
      const warehouse = getWarehouse(state, DEFAULT_WAREHOUSE);
      const lines: LngLat[][] = [];
      for (const supplier of getSuppliers(state)) {
        if (!warehouse || !active.includes(supplier.id)) continue;
        if (supplier.kind === 'port') lines.push(RIVER);
        lines.push([roadStart(supplier), warehouse]);
      }
      const features = lines.map((line) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: line.map((p) => [p.lng, p.lat]) },
      }));
      (map.getSource(SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    };

    const create = (s: Shipment, supplier: Supplier, warehouse: LngLat, progress: number): ShownShipment => {
      const title = `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)} aus ${supplier.name}`;
      const label = formatProductAmount(s.productId, s.amount);
      const leg = deliveryLeg(supplier, progress);
      const ship =
        supplier.kind === 'port'
          ? createVehicle(map, {
              path: RIVER,
              kind: 'ship',
              title,
              progress: leg.stage === 'ship' ? shipFraction(leg.t) : 1,
            })
          : null;
      const road = createVehicle(map, {
        path: [roadStart(supplier), warehouse],
        kind: supplier.kind === 'port' ? 'truck' : 'van',
        title,
        progress: leg.stage === 'road' ? leg.t : 0,
      });
      ship?.setLabel(label);
      road.setLabel(label);
      return { ship, road };
    };

    return {
      update(state) {
        placeSuppliers();
        drawRoutes(state);
        const transit = shipmentsInTransit(state);
        const active = new Set(transit.map((s) => s.id));
        for (const [id, entry] of shown) {
          if (active.has(id)) continue;
          entry.ship?.remove();
          entry.road.remove();
          shown.delete(id);
        }
        let shipping = false;
        for (const s of transit) {
          const supplier = getSuppliers(state).find((x) => x.id === s.supplierId);
          const warehouse = getWarehouse(state, s.warehouseId);
          if (!supplier || !warehouse) continue;
          const progress = shipmentProgress(state, s);
          let entry = shown.get(s.id);
          if (!entry) {
            entry = create(s, supplier, warehouse, progress);
            shown.set(s.id, entry);
          }
          const leg = deliveryLeg(supplier, progress);
          const late = s.problem === 'delayed' && !!s.problemRevealed;
          if (entry.ship) {
            entry.ship.setVisible(leg.stage !== 'road');
            entry.ship.setProgress(leg.stage === 'ship' ? shipFraction(leg.t) : 1);
            entry.ship.setColor(late ? lateColor : null);
            shipping ||= leg.stage !== 'road';
          }
          entry.road.setVisible(leg.stage !== 'ship');
          entry.road.setProgress(leg.stage === 'road' ? leg.t : 0);
          entry.road.setColor(late ? lateColor : null);
        }
        port.element.hidden = !shipping;
      },
      destroy() {
        for (const entry of shown.values()) {
          entry.ship?.remove();
          entry.road.remove();
        }
        shown.clear();
        port.marker.remove();
      },
    };
  },
};
