// Logistik auf der Karte: dein Liegeplatz im Hafen jeder Stadt (Klick öffnet die Hafen-Seite) und die Fahrten als
// 3D-Mini-Fahrzeuge über echte Straßen (roads): erst leer vom Lager zum Hafen, dann mit Ware zurück. Routen zwischen
// den Städten fahren über die A1 (Deutschland-Ansicht und in beiden Städten bis zur Auffahrt). Das Fahrzeug hält an
// der Straße, die letzten Meter zu Lager und Kai sind ein gepunkteter Fußweg. Bei einer Kontrolle steht das Fahrzeug
// mit Blaulicht.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import {
  addFootpath,
  addHtmlMarker,
  createVehicle,
  type EffectHandle,
  el,
  type FootpathHandle,
  type MapLayer,
  mapEffects,
  mapToken,
  pointAlong,
  type VehicleHandle,
} from '../../../map';
import { iconElement } from '../../../ui';
import { vehicleSpec } from '../../fleet';
import { formatProductAmount, getProduct } from '../../goods';
import { getStaffMember } from '../../staff';
import { shipmentsInTransit } from '../../suppliers';

/** Runde Kachel eines Orts mit weißem Symbol (Look "Glas", Stil in src/map/map.css). */
const placeIcon = (icon: string) => {
  const tile = el('span', 'map-place-icon');
  tile.appendChild(iconElement(icon, { strokeWidth: 2.2 }));
  return tile;
};

import {
  getCargo,
  getTrips,
  hasBerth,
  PORTS,
  portPlace,
  type Trip,
  tripAmount,
  tripProgress,
  tripRoute,
} from '../index';

interface ShownTrip {
  vehicle: VehicleHandle;
  leg: 'approach' | 'delivery';
  /** Nur die Teile auf der Straße (drive); die Enden sind Fußwege (walks). */
  paths: { approach: LngLat[] | null; delivery: LngLat[] };
  walks: FootpathHandle[];
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
    // Ein Hafen pro Stadt (Auftrag 30); ein Klick macht seine Stadt aktiv und öffnet die Hafen-Seite.
    const ports = Object.keys(PORTS).map((cityId) => {
      const port = portPlace(cityId);
      const name = el('span', 'map-place-name', port.name);
      const marker = addHtmlMarker(map, {
        position: port,
        className: 'map-place map-place--dock',
        near: true,
        anchor: 'bottom',
        tag: 'button',
        title: 'Hafen öffnen',
        children: [placeIcon('anchor'), name],
        onClick: () => {
          if (ctx.isPicking()) return;
          const state = ctx.getState();
          // Nach dem Verkauf (Auftrag 43) gehören die Häfen in Deutschland nicht mehr dir: Rotterdam zeigt die Kunden-App.
          if (state?.modules.city.sale.sold) {
            ctx.ui.openPhone('trade.app', { view: 'harbor' });
            return;
          }
          if (state && state.modules.city.active !== cityId) {
            ctx.ui.dispatch({ type: 'city.switch', payload: { cityId } });
          }
          ctx.ui.openPanel('logistics.port', {});
        },
      });
      marker.element.hidden = true;
      return { cityId, port, name, element: marker.element, marker: marker.marker };
    });

    const create = (state: GameState, trip: Trip): ShownTrip => {
      const { routes } = tripRoute(state, trip);
      const paths = { approach: routes.approach?.drive ?? null, delivery: routes.delivery.drive };
      // Beide Enden der Fahrt (Lager und Hafen bzw. Ziellager) zu Fuß; die Anfahrt hat dieselben Enden.
      const walks = [addFootpath(map, routes.delivery.walkFrom), addFootpath(map, routes.delivery.walkTo)];
      const progress = tripProgress(state, trip);
      const leg = progress.leg === 'toPickup' && paths.approach ? 'approach' : 'delivery';
      const vehicle = createVehicle(map, {
        path: leg === 'approach' && paths.approach ? paths.approach : paths.delivery,
        // Eigenes Fahrzeug: Modell erkennbar (Roller, Kombi, Transporter); Privatauto wie bisher.
        kind: trip.vehicleId !== undefined ? vehicleSpec(state, trip.vehicleId).mapKind : trip.driverId ? 'van' : 'car',
        title: trip.kind === 'pickup' ? 'Abholung am Hafen' : trip.kind === 'route' ? 'Route' : 'Umlagern',
        progress: leg === 'approach' ? progress.t : progress.leg === 'delivering' ? progress.t : 0,
      });
      return { vehicle, leg, paths, walks, light: null };
    };

    return {
      update(state) {
        for (const p of ports) {
          const cargo = getCargo(state, p.cityId).length;
          const shipping = shipmentsInTransit(state).some((s) => s.toPort && (s.cityId ?? 'koeln') === p.cityId);
          // DOM nur anfassen, wenn sich Text oder Sichtbarkeit ändern.
          const hidden = !(hasBerth(state, p.cityId) || cargo > 0 || shipping);
          if (p.element.hidden !== hidden) p.element.hidden = hidden;
          const label = cargo > 0 ? `${p.port.name} · ${cargo} am Kai` : p.port.name;
          if (p.name.textContent !== label) p.name.textContent = label;
        }

        // Geplante Nachtfahrten fahren noch nicht (Auftrag 33).
        const trips = getTrips(state).filter((t) => t.status !== 'planned');
        const ids = new Set(trips.map((t) => t.id));
        for (const [id, entry] of shown) {
          if (ids.has(id)) continue;
          entry.vehicle.remove();
          entry.light?.stop();
          for (const walk of entry.walks) walk.remove();
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
          for (const walk of entry.walks) walk.remove();
        }
        shown.clear();
        for (const p of ports) p.marker.remove();
        if (map.getLayer(ROUTES)) map.removeLayer(ROUTES);
        if (map.getSource(ROUTES)) map.removeSource(ROUTES);
      },
    };
  },
};
