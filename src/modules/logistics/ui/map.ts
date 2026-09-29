// Logistik auf der Karte: dein Liegeplatz im Niehler Hafen (Klick öffnet die Logistik-App) und die Fahrten als
// 3D-Mini-Fahrzeuge über echte Straßen (roads): erst leer vom Lager zum Hafen, dann mit Ware zurück. Bei einer
// Verkehrskontrolle steht das Fahrzeug mit Blaulicht.

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
import { getSupplier, shipmentsInTransit } from '../../suppliers';
import { getCargo, getTrips, hasBerth, portPlace, type Trip, tripAmount, tripProgress, tripRoute } from '../index';

interface ShownTrip {
  vehicle: VehicleHandle;
  leg: 'approach' | 'delivery';
  paths: { approach: LngLat[] | null; delivery: LngLat[] };
  light: EffectHandle | null;
}

export const logisticsLayer: MapLayer = {
  id: 'logistics.trips',
  order: 22,
  mount(ctx) {
    const { map } = ctx;
    const shown = new Map<number, ShownTrip>();
    const badColor = mapToken('--color-bad', '#e5484d');
    const port = portPlace();
    const name = el('span', 'map-place-name', port.name);
    const portMarker = addHtmlMarker(map, {
      position: port,
      className: 'map-place map-place--harbor',
      anchor: 'bottom',
      tag: 'button',
      title: 'Logistik öffnen',
      children: [el('span', 'map-place-icon'), name],
      onClick: () => {
        if (!ctx.isPicking()) ctx.ui.openPhone('logistics.app');
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
        portMarker.element.hidden = !(hasBerth(state) || cargo > 0 || shipping);
        name.textContent = cargo > 0 ? `${port.name} · ${cargo} am Kai` : port.name;

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
          entry.vehicle.setLabel(leg === 'delivery' ? `${tripAmount(trip)}` : '');
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
      },
      destroy() {
        for (const entry of shown.values()) {
          entry.vehicle.remove();
          entry.light?.stop();
        }
        shown.clear();
        portMarker.marker.remove();
      },
    };
  },
};
