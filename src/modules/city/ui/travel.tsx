// Deine Fahrt zwischen den Städten (Auftrag 30, Etappe 5): Karte über der Kartenfläche mit Ziel, Ankunft und
// "Fahrt überspringen" (Tempo auf Maximum bis zur Ankunft, kein Zeitsprung), Live-Aktivität in der Dynamic Island,
// das Auto auf der Deutschland-Karte (die Kamera fliegt beim Losfahren dorthin und folgt ihm). Ankunft: Banner, die
// Kamera fliegt in die Zielstadt (CitySync, weil sie dort aktiv wird).

import { clock, SPEEDS } from '../../../core';
import { addHtmlMarker, createVehicle, el, FAR_ZOOM, type MapLayer, pointAlong } from '../../../map';
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
import { interCityRoute } from '../../roads';
import { cityName, cityTravel, getCity } from '../index';

/** Tempo vor "Fahrt überspringen", damit es nach der Ankunft wieder gilt (pro Durchgang). */
let skipped: { runId: string; speed: number } | null = null;

/** Kamera klebt am Auto (Draufsicht); Ziehen an der Karte löst sie, "Folgen" holt sie zurück. */
let following = true;

/** Draufsicht (2D, Norden oben) und weiter weg, damit die Fahrt auf der A1 nicht so schnell wirkt. */
const FOLLOW_ZOOM = 13.2;

function travelProgress(now: number, departedAt: number, arrivesAt: number): number {
  return Math.min(1, Math.max(0, (now - departedAt) / Math.max(1, arrivesAt - departedAt)));
}

function TravelCard() {
  const { state } = useGame();
  const ui = useUi();
  const session = useSession();
  const travel = cityTravel(state);
  if (!travel) return null;
  const progress = travelProgress(state.time, travel.departedAt, travel.arrivesAt);
  const fastest = SPEEDS[SPEEDS.length - 1];
  const skip = () => {
    if (!skipped || skipped.runId !== state.meta.runId) {
      skipped = { runId: state.meta.runId, speed: session.loop.speed || 1 };
    }
    ui.setSpeed(fastest);
  };
  return (
    <div class="city-travel" role="status">
      <span class="hud-label is-city">Unterwegs auf der A1</span>
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
      leading: 'A1',
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
    let car: ReturnType<typeof createVehicle> | null = null;
    let carKey = '';
    let followedAt = 0;
    let travelling = false;
    const syncMarker = () => {
      element.hidden = !travelling || map.getZoom() > FAR_ZOOM;
    };
    // Wer selbst an der Karte zieht, will nicht mehr verfolgt werden.
    const onDrag = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) following = false;
    };
    map.on('zoomend', syncMarker);
    map.on('dragstart', onDrag);
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
          carKey = '';
          return;
        }
        travelling = true;
        const route = interCityRoute(from.center, to.center);
        const key = `${travel.from}>${travel.to}@${travel.departedAt}`;
        if (!car || key !== carKey) {
          car?.remove();
          car = createVehicle(map, { path: route.path, kind: 'car', title: `Du · ${cityName(travel.to)}` });
          car.setLabel('Du');
          carKey = key;
        }
        const t = travelProgress(state.time, travel.departedAt, travel.arrivesAt);
        car.setProgress(t);
        const { position } = pointAlong(route.path, t);
        marker.setLngLat([position.lng, position.lat]);
        syncMarker();
        const text = `Du · ${cityName(travel.to)}`;
        if (label.textContent !== text) label.textContent = text;
        // Kamera folgt dem Auto in der Draufsicht (nicht öfter als einmal pro Sekunde).
        const now = performance.now();
        if (following && ctx.ui.mapView() !== 'deutschland' && now - followedAt > 1000) {
          followedAt = now;
          map.easeTo({
            center: [position.lng, position.lat],
            zoom: FOLLOW_ZOOM,
            pitch: 0,
            bearing: 0,
            duration: 1400,
            easing: (x) => x,
          });
        }
      },
      destroy() {
        map.off('zoomend', syncMarker);
        map.off('dragstart', onDrag);
        car?.remove();
        marker.remove();
      },
    };
  },
};
