// Lieferungen auf der Karte: 3D-Mini-Fahrzeuge (createVehicle). Aus einer Großstadt kommt ein Transporter, erst
// über die Autobahn bis an den Kölner Stadtrand (grob, man sieht ihn nur weit herausgezoomt), dann über echte Straßen
// (roads) bis ins Ziel-Lager; den letzten Teil der Lieferzeit (CITY_APPROACH_SHARE) fährt er durch Köln.
// Hafenware kommt als Schiff den Rhein hinauf und legt am Liegeplatz im Niehler Hafen an (den Hafen zeigt die
// Logistik). Nur alte Lieferungen ohne Liegeplatz werden noch umgeladen und per Lkw ins Lager gefahren.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import {
  addHtmlMarker,
  createVehicle,
  el,
  type MapLayer,
  mapToken,
  pathLength,
  type VehicleHandle,
} from '../../../map';
import { formatProductAmount, getWarehouse, getWarehouses, productName } from '../../goods';
import { roadEntryFrom, roadRoute } from '../../roads';
import {
  CITY_APPROACH_SHARE,
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

/**
 * Weg eines Transporters: Autobahn bis an den Stadtrand, dann echte Straßen. split = Anteil der Weglänge, ab dem er
 * in Köln ist; der Fortschritt wird so umgerechnet, dass er die letzten CITY_APPROACH_SHARE der Zeit in Köln fährt.
 */
function cityPath(supplier: Supplier, target: LngLat): { path: LngLat[]; split: number } {
  const entry = roadEntryFrom(supplier);
  const city = roadRoute(entry, target).path;
  const outside = pathLength([supplier, entry]);
  const inside = pathLength(city);
  return { path: [supplier, ...city], split: outside / Math.max(1, outside + inside) };
}

function cityProgress(split: number, t: number): number {
  const outsideShare = 1 - CITY_APPROACH_SHARE;
  return t < outsideShare
    ? (t / outsideShare) * split
    : split + ((t - outsideShare) / CITY_APPROACH_SHARE) * (1 - split);
}

interface ShownShipment {
  ship: VehicleHandle | null;
  road: VehicleHandle | null;
  split: number;
}

export const suppliersLayer: MapLayer = {
  id: 'suppliers.routes',
  order: 20,
  mount(ctx) {
    const { map } = ctx;
    const shown = new Map<number, ShownShipment>();
    const lateColor = mapToken('--color-warn', '#ffb547');
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

    const targetOf = (state: GameState, s: Shipment): LngLat | undefined =>
      s.toPort ? PORT : (getWarehouse(state, s.warehouseId) ?? getWarehouses(state)[0]);

    // Routen nur für Lieferungen, die gerade unterwegs sind.
    let routesKey = '';
    const drawRoutes = (state: GameState) => {
      const transit = shipmentsInTransit(state);
      const key = transit.map((s) => `${s.id}:${s.warehouseId}`).join(',');
      if (key === routesKey) return;
      routesKey = key;
      const lines: LngLat[][] = [];
      let river = false;
      for (const s of transit) {
        const supplier = getSuppliers(state).find((x) => x.id === s.supplierId);
        const target = targetOf(state, s);
        if (!supplier || !target) continue;
        if (supplier.kind === 'port') {
          river = true;
          if (!s.toPort) lines.push(roadRoute(PORT, target).path);
        } else {
          lines.push(cityPath(supplier, target).path);
        }
      }
      if (river) lines.push(RIVER);
      const features = lines.map((line) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: line.map((p) => [p.lng, p.lat]) },
      }));
      (map.getSource(SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    };

    const create = (s: Shipment, supplier: Supplier, target: LngLat, progress: number): ShownShipment => {
      const title = `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)} aus ${supplier.name}`;
      const label = formatProductAmount(s.productId, s.amount);
      const leg = deliveryLeg(supplier, progress, s.toPort);
      if (supplier.kind === 'port') {
        const ship = createVehicle(map, { path: RIVER, kind: 'ship', title, progress: shipFraction(leg.t) });
        ship.setLabel(label);
        // Alte Lieferungen ohne Liegeplatz: Lkw vom Hafen ins Lager.
        const road = s.toPort
          ? null
          : createVehicle(map, {
              path: roadRoute(PORT, target).path,
              kind: 'truck',
              title,
              progress: leg.stage === 'road' ? leg.t : 0,
            });
        road?.setLabel(label);
        return { ship, road, split: 0 };
      }
      const { path, split } = cityPath(supplier, target);
      const road = createVehicle(map, { path, kind: 'van', title, progress: cityProgress(split, progress) });
      road.setLabel(label);
      return { ship: null, road, split };
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
          entry.road?.remove();
          shown.delete(id);
        }
        for (const s of transit) {
          const supplier = getSuppliers(state).find((x) => x.id === s.supplierId);
          const target = targetOf(state, s);
          if (!supplier || !target) continue;
          const progress = shipmentProgress(state, s);
          let entry = shown.get(s.id);
          if (!entry) {
            entry = create(s, supplier, target, progress);
            shown.set(s.id, entry);
          }
          const late = s.problem === 'delayed' && !!s.problemRevealed;
          const color = late ? lateColor : null;
          if (supplier.kind !== 'port') {
            entry.road?.setProgress(cityProgress(entry.split, progress));
            entry.road?.setColor(color);
            continue;
          }
          const leg = deliveryLeg(supplier, progress, s.toPort);
          if (entry.ship) {
            entry.ship.setVisible(leg.stage !== 'road');
            entry.ship.setProgress(leg.stage === 'ship' ? shipFraction(leg.t) : 1);
            entry.ship.setColor(color);
          }
          if (entry.road) {
            entry.road.setVisible(leg.stage !== 'ship');
            entry.road.setProgress(leg.stage === 'road' ? leg.t : 0);
            entry.road.setColor(color);
          }
        }
      },
      destroy() {
        for (const entry of shown.values()) {
          entry.ship?.remove();
          entry.road?.remove();
        }
        shown.clear();
      },
    };
  },
};
