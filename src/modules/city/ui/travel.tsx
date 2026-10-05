// Deine Fahrt zwischen den Städten (Auftrag 30, Etappe 5): Karte über der Kartenfläche mit Ziel, Ankunft und
// "Fahrt überspringen" (Tempo auf Maximum bis zur Ankunft, kein Zeitsprung), Live-Aktivität in der Dynamic Island,
// das Auto auf der Deutschland-Karte (die Kamera fliegt beim Losfahren dorthin und folgt ihm). Ankunft: Banner, die
// Kamera fliegt in die Zielstadt (CitySync, weil sie dort aktiv wird).

import { useEffect } from 'preact/hooks';
import { clock, type LngLat, SPEEDS } from '../../../core';
import { addHtmlMarker, createVehicle, el, FAR_ZOOM, type MapLayer, onMapFrame, pointAlong } from '../../../map';
import {
  Button,
  IconChip,
  iconElement,
  islandCountdown,
  onGameEvent,
  registerLiveActivity,
  registerSlot,
  soundOnEvent,
  useGame,
  useSession,
  useUi,
} from '../../../ui';
import { autobahnRefs, interCityRoute } from '../../roads';
import { cityName, cityTravel, getCity } from '../index';

/** Tempo vor "Fahrt überspringen", damit es nach der Ankunft wieder gilt (pro Durchgang). */
let skipped: { runId: string; speed: number } | null = null;

/** Kamera klebt am Auto (Draufsicht); Ziehen an der Karte löst sie, "Folgen" holt sie zurück. */
let following = true;

/**
 * Kamerafahrt (immer Draufsicht, Norden oben): Die ersten Sekunden klebt sie nah am Auto, wie man losfährt, dann zieht sie
 * auf, und der Rest der Fahrt läuft im Zeitraffer (Tempo springt beim Losfahren auf das Maximum).
 */
const CLOSE_ZOOM = 14;
const FAR_FOLLOW_ZOOM = 8.4;
const CLOSE_SECONDS = 5;
/** Danach bleibt die Nahsicht nur, solange das Auto noch am Anfang der Strecke ist. */
const CLOSE_MAX_PROGRESS = 0.2;

function travelProgress(now: number, departedAt: number, arrivesAt: number): number {
  return Math.min(1, Math.max(0, (now - departedAt) / Math.max(1, arrivesAt - departedAt)));
}

function TravelCard() {
  const { state } = useGame();
  const ui = useUi();
  const session = useSession();
  const travel = cityTravel(state);
  const fastest = SPEEDS[SPEEDS.length - 1];
  const tripKey = travel ? `${state.meta.runId}:${travel.departedAt}` : '';
  // Zeitraffer gleich beim Losfahren (einmal pro Fahrt; wer danach langsamer stellt, bleibt dabei).
  useEffect(() => {
    if (tripKey) skip();
  }, [tripKey]);
  function skip() {
    if (!skipped || skipped.runId !== state.meta.runId) {
      skipped = { runId: state.meta.runId, speed: session.loop.speed || 1 };
    }
    ui.setSpeed(fastest);
  }
  if (!travel) return null;
  const progress = travelProgress(state.time, travel.departedAt, travel.arrivesAt);
  return (
    <div class="city-travel" role="status">
      <span class="hud-label is-city">
        Unterwegs auf der {autobahnRefs(travel.from, travel.to)[0]?.replace(' ', '') ?? 'Autobahn'}
      </span>
      <span class="city-travel__main">
        <IconChip icon="car" color="place" size="md" />
        <span class="city-travel__text">
          <strong>
            {cityName(travel.from)} → {cityName(travel.to)}
          </strong>
          <span class="city-travel__hint">
            Ankunft {clock.formatTime(travel.arrivesAt)} (noch {islandCountdown(travel.arrivesAt - state.time)})
          </span>
        </span>
      </span>
      <span class="city-travel__bar" aria-hidden="true">
        <span class="city-travel__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <div class="city-travel__actions">
        <Button small icon="speed3" onClick={skip}>
          Fahrt überspringen
        </Button>
        <Button small variant="subtle" icon="map" onClick={() => ui.flyToDeutschland()}>
          Folgen
        </Button>
      </div>
    </div>
  );
}

registerSlot('map.overlay', { id: 'city.travel', order: 20, component: TravelCard });

registerLiveActivity({
  id: 'city.travel',
  activities: (state) => {
    const travel = cityTravel(state);
    if (!travel) return null;
    return {
      id: 'city.travel',
      priority: 60,
      icon: 'car',
      tone: 'info',
      leading: autobahnRefs(travel.from, travel.to)[0]?.replace(' ', '') ?? 'Autobahn',
      trailing: islandCountdown(travel.arrivesAt - state.time),
      title: `Unterwegs nach ${cityName(travel.to)}`,
      detail: `Ankunft ${clock.formatTime(travel.arrivesAt)}`,
      progress: travelProgress(state.time, travel.departedAt, travel.arrivesAt),
      open: () => {
        following = true;
      },
    };
  },
});

onGameEvent('city.travelStarted', 'city.travel.camera', () => {
  following = true;
});

onGameEvent('city.arrived', 'city.travel.arrived', (payload, ui, state) => {
  ui.toast(`Angekommen in ${cityName(payload.cityId)}.`, 'good', { urgent: true });
  if (skipped && skipped.runId === state.meta.runId) {
    ui.setSpeed(skipped.speed);
    skipped = null;
  }
});
soundOnEvent('city.arrived', 'success');

/** Das Auto auf der Karte (HTML, damit es auch weit herausgezoomt zu sehen ist); die Kamera folgt ihm. */
export const travelLayer: MapLayer = {
  id: 'city.travel',
  order: 91,
  mount(ctx) {
    const { map } = ctx;
    const icon = el('span', 'city-car__icon');
    icon.appendChild(iconElement('car', { strokeWidth: 2.2 }));
    const label = el('span', 'city-car__label');
    const { marker, element } = addHtmlMarker(map, {
      position: { lng: 0, lat: 0 },
      className: 'city-car',
      anchor: 'center',
      children: [icon, label],
    });
    element.hidden = true;
    // Das 3D-Auto fährt die echte A1 (wie alle anderen Fahrzeuge); der HTML-Marker bleibt nur für die Deutschland-Ansicht.
    // Auto und Kamera laufen im gemeinsamen Kartentakt aus EINEM Wert (shown): So sitzt das Auto immer genau in der Mitte,
    // und es springt nicht von Spielschritt zu Spielschritt.
    let car: ReturnType<typeof createVehicle> | null = null;
    let trip: { key: string; path: LngLat[]; startedAt: number; target: number; shown: number } | null = null;
    let travelling = false;
    let zoom = CLOSE_ZOOM;
    const syncMarker = () => {
      element.hidden = !travelling || map.getZoom() > FAR_ZOOM;
    };
    // Wer selbst an der Karte zieht oder zoomt, will nicht mehr verfolgt werden.
    const release = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) following = false;
    };
    const frame = (now: number, dt: number) => {
      if (!trip || !car) return;
      // Weich nachziehen (sonst ruckelt das Auto im Takt der Spielschritte), bei Zeitraffer schnell genug.
      trip.shown += (trip.target - trip.shown) * (1 - Math.exp(-dt * 8));
      if (Math.abs(trip.target - trip.shown) < 1e-6) trip.shown = trip.target;
      car.jumpTo(trip.shown);
      const { position } = pointAlong(trip.path, trip.shown);
      marker.setLngLat([position.lng, position.lat]);
      if (!following) return;
      const elapsed = (now - trip.startedAt) / 1000;
      const close = elapsed < CLOSE_SECONDS && trip.shown < CLOSE_MAX_PROGRESS;
      zoom += ((close ? CLOSE_ZOOM : FAR_FOLLOW_ZOOM) - zoom) * (1 - Math.exp(-dt * (close ? 3 : 1.2)));
      // Die ersten Momente gleitet die Kamera zum Auto, danach sitzt sie fest auf ihm.
      const k = elapsed < 1.2 ? 1 - Math.exp(-dt * 5) : 1;
      const c = map.getCenter();
      map.jumpTo({
        center: [c.lng + (position.lng - c.lng) * k, c.lat + (position.lat - c.lat) * k],
        zoom,
        pitch: 0,
        bearing: 0,
      });
    };
    const stopFrame = onMapFrame(frame, 'city.travel');
    map.on('zoomend', syncMarker);
    map.on('dragstart', release);
    map.on('zoomstart', release);
    return {
      update(state) {
        const travel = cityTravel(state);
        const from = travel ? getCity(travel.from) : undefined;
        const to = travel ? getCity(travel.to) : undefined;
        if (!travel || !from || !to) {
          travelling = false;
          element.hidden = true;
          car?.remove();
          car = null;
          trip = null;
          return;
        }
        travelling = true;
        const key = `${travel.from}>${travel.to}@${travel.departedAt}`;
        const t = travelProgress(state.time, travel.departedAt, travel.arrivesAt);
        if (!car || !trip || key !== trip.key) {
          car?.remove();
          const path = interCityRoute(from.center, to.center).path;
          car = createVehicle(map, { path, kind: 'car', title: `Du · ${cityName(travel.to)}`, progress: t });
          car.setLabel('Du');
          trip = { key, path, startedAt: performance.now(), target: t, shown: t };
          zoom = Math.max(map.getZoom(), CLOSE_ZOOM);
          following = true;
        }
        trip.target = t;
        syncMarker();
        const text = `Du · ${cityName(travel.to)}`;
        if (label.textContent !== text) label.textContent = text;
      },
      destroy() {
        map.off('zoomend', syncMarker);
        map.off('dragstart', release);
        map.off('zoomstart', release);
        stopFrame();
        car?.remove();
        marker.remove();
      },
    };
  },
};
