// Logistik auf der Karte: dein Liegeplatz im Niehler Hafen (Klick öffnet die Logistik-App) und die Fahrten als
// 3D-Mini-Fahrzeuge über echte Straßen (roads): erst leer vom Lager zum Hafen, dann mit Ware zurück. Bei einer
// Verkehrskontrolle steht das Fahrzeug mit Blaulicht.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import {
  addHtmlMarker,
  createVehicle,
  type EffectHandle,
  el,
  type MapLayer,
  mapEffects,
  mapToken,
  pointAlong,
  type VehicleHandle,
} from '../../../map';
import { iconElement } from '../../../ui';
import { formatProductAmount, getProduct } from '../../goods';
import { getStaffMember } from '../../staff';
import { getSupplier, shipmentsInTransit } from '../../suppliers';

/** Runde Kachel eines Orts mit weißem Symbol (Look "Glas", Stil in src/map/map.css). */
const placeIcon = (icon: string) => {
  const tile = el('span', 'map-place-icon');
  tile.appendChild(iconElement(icon, { strokeWidth: 2.2 }));
  return tile;
};

import { getCargo, getTrips, hasBerth, portPlace, type Trip, tripAmount, tripProgress, tripRoute } from '../index';

interface ShownTrip {
  vehicle: VehicleHandle;
  leg: 'approach' | 'delivery';
  paths: { approach: LngLat[] | null; delivery: LngLat[] };
  light: EffectHandle | null;
}

const ROUTES = 'logistics.routes';

/** Etikett über dem Fahrzeug: "Kemal · 500 g" (auf der Anfahrt nur der Name). */
function tripLabel(state: GameState, trip: Trip, loaded: boolean): string {
  const driver = trip.driverId ? (getStaffMember(state, trip.driverId)?.name.split(' ')[0] ?? 'Fahrer') : 'Du';
  if (!loaded) return driver;
  const grams = trip.items.filter((i) => getProduct(i.productId)?.unit === 'g').reduce((sum, i) => sum + i.amount, 0);
  const other = tripAmount(trip) - grams;
  return `${driver} · ${grams > 0 ? formatProductAmount('weed', grams) : `${other}`}${grams > 0 && other > 0 ? ` +${other}` : ''}`;
}

export const logisticsLayer: MapLayer = {
  id: 'logistics.trips',
  order: 22,
  mount(ctx) {
    const { map } = ctx;
    const shown = new Map<number, ShownTrip>();
    const badColor = mapToken('--color-bad', '#e5484d');
    // Strecke der laufenden Fahrten gestrichelt in Gold (Look "Glas").
    map.addSource(ROUTES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: ROUTES,
      type: 'line',
      source: ROUTES,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': mapToken('--hud-gold', '#f2c766'),
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 3],
        'line-dasharray': [1, 2],
        'line-opacity': 0.8,
      },
    });
    let routesKey = '';
    const port = portPlace();
    const name = el('span', 'map-place-name', port.name);
    const portMarker = addHtmlMarker(map, {
      position: port,
      className: 'map-place map-place--dock',
      anchor: 'bottom',
      tag: 'button',
      title: 'Hafen öffnen',
      children: [placeIcon('anchor'), name],
      onClick: () => {
        if (!ctx.isPicking()) ctx.ui.openPanel('logistics.port', {});
      },
    });
    portMarker.element.hidden = true;

    const create = (state: GameState, trip: Trip): ShownTrip => {
      const paths = tripRoute(state, trip);
      const progress = tripProgress(state, trip);
      const leg = progress.leg === 'toPickup' && paths.approach ? 'approach' : 'delivery';
      const vehicle = createVehicle(map, {
        path: leg === 'approach' && paths.approach ? paths.approach : paths.delivery,
        kind: trip.driverId ? 'van' : 'car',
        title: trip.kind === 'pickup' ? 'Abholung am Hafen' : 'Umlagern',
        progress: leg === 'approach' ? progress.t : progress.leg === 'delivering' ? progress.t : 0,
      });
      return { vehicle, leg, paths, light: null };
    };

    return {
      update(state) {
        const cargo = getCargo(state).length;
        const shipping = shipmentsInTransit(state).some((s) => getSupplier(state, s.supplierId)?.kind === 'port');
        // DOM nur anfassen, wenn sich Text oder Sichtbarkeit ändern.
        const hidden = !(hasBerth(state) || cargo > 0 || shipping);
        if (portMarker.element.hidden !== hidden) portMarker.element.hidden = hidden;
        const portText = cargo > 0 ? `${port.name} · ${cargo} am Kai` : port.name;
        if (name.textContent !== portText) name.textContent = portText;

        const trips = getTrips(state);
        const ids = new Set(trips.map((t) => t.id));
        for (const [id, entry] of shown) {
          if (ids.has(id)) continue;
          entry.vehicle.remove();
          entry.light?.stop();
          shown.delete(id);
        }
        for (const trip of trips) {
          let entry = shown.get(trip.id);
          if (!entry) {
            entry = create(state, trip);
            shown.set(trip.id, entry);
          }
          const progress = tripProgress(state, trip);
          // Anfahrt zum Hafen, dann mit Ware auf dem Rückweg.
          const leg = progress.leg === 'toPickup' && entry.paths.approach ? 'approach' : 'delivery';
          if (leg !== entry.leg) {
            entry.leg = leg;
            entry.vehicle.setPath(
              leg === 'approach' && entry.paths.approach ? entry.paths.approach : entry.paths.delivery,
            );
            entry.vehicle.jumpTo(0);
          }
          const t = leg === 'approach' ? progress.t : progress.leg === 'loading' ? 0 : progress.t;
          entry.vehicle.setProgress(t);
          entry.vehicle.setLabel(tripLabel(state, trip, leg === 'delivery'));
          const stopped = trip.status === 'stopped';
          entry.vehicle.setColor(stopped ? badColor : null);
          if (stopped && !entry.light) {
            const at = pointAlong(entry.paths.delivery, t).position;
            entry.light = mapEffects.blueLight(at, { label: 'Kontrolle', size: 110 });
          } else if (!stopped && entry.light) {
            entry.light.stop();
            entry.light = null;
          }
        }
        // Gestrichelte Strecke: der Teil, der gerade gefahren wird (Anfahrt oder Lieferung).
        const nextKey = trips.map((t) => `${t.id}:${shown.get(t.id)?.leg ?? ''}`).join(',');
        if (nextKey !== routesKey) {
          routesKey = nextKey;
          const features = trips.flatMap((trip) => {
            const entry = shown.get(trip.id);
            if (!entry) return [];
            const path = entry.leg === 'approach' && entry.paths.approach ? entry.paths.approach : entry.paths.delivery;
            return [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'LineString' as const, coordinates: path.map((p) => [p.lng, p.lat]) },
              },
            ];
          });
          (map.getSource(ROUTES) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
        }
      },
      destroy() {
        for (const entry of shown.values()) {
          entry.vehicle.remove();
          entry.light?.stop();
        }
        shown.clear();
        portMarker.marker.remove();
        if (map.getLayer(ROUTES)) map.removeLayer(ROUTES);
        if (map.getSource(ROUTES)) map.removeSource(ROUTES);
      },
    };
  },
};
