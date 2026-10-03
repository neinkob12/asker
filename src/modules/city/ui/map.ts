// Deutschland-Ansicht (Auftrag 30 und 31): Jede freie Stadt steht als Glas-Karte auf der Karte (Name, Veedel x/12,
// Ergebnis heute, Fahrten unterwegs). Sichtbar nur weit herausgezoomt (FAR_ZOOM, dann sind die Marker der Städte aus);
// ein Klick macht die Stadt aktiv und fliegt hin. Zoomt man aus einer Stadt heraus, wird daraus die Deutschland-Ansicht
// (Draufsicht), zoomt man über einer freien Stadt wieder hinein, deren Stadtansicht (schräg; eine andere Stadt wird
// dabei aktiv wie mit einem Klick auf ihre Karte).

import type { GeoJSONSource } from 'maplibre-gl';
import { formatEuro, type GameState, type LngLat } from '../../../core';
import { addHtmlMarker, el, FAR_ZOOM, type MapLayer, mapToken } from '../../../map';
import { cityReport } from '../../finance';
import { getTrips, isInterCityTrip, tripCity } from '../../logistics';
import { autobahnBetween } from '../../roads';
import { getSupplier, shipmentsInTransit } from '../../suppliers';
import { campaignProgress } from '../../territory';
import { activeCity, citiesUnlocked, cityTravel, playableCities } from '../index';

/** So weit (über FAR_ZOOM) muss man hineinzoomen, bis aus Deutschland wieder die Stadt wird (kein Hin und Her). */
const ENTER_CITY_MARGIN = 1;

interface Card {
  element: HTMLElement;
  stats: HTMLElement;
  key: string;
}

/** Kennzahlen einer Stadt als einzelne Werte (keine Aufzählung mit Punkten). */
function stats(state: GameState, cityId: string): string[] {
  const progress = campaignProgress(state, cityId);
  const today = cityReport(state, cityId, 1).profit;
  const trips = getTrips(state).filter((t) => tripCity(state, t) === cityId).length;
  const parts = [
    `${progress.controlled}/${progress.total} Veedel`,
    `heute ${today >= 0 ? '+' : ''}${formatEuro(today)}`,
  ];
  if (trips > 0) parts.push(`${trips} ${trips === 1 ? 'Fahrt' : 'Fahrten'}`);
  return parts;
}

export const citiesLayer: MapLayer = {
  id: 'city.cards',
  order: 90,
  mount(ctx) {
    const { map } = ctx;
    const cards = new Map<string, Card>();
    for (const city of playableCities()) {
      const values = el('span', 'city-card__stats');
      const { element } = addHtmlMarker(map, {
        position: city.center,
        className: 'city-card',
        anchor: 'bottom',
        tag: 'button',
        title: `${city.name} ansehen`,
        children: [el('strong', 'city-card__name', city.name), values],
        onClick: () => {
          if (ctx.isPicking()) return;
          const state = ctx.getState();
          if (state && activeCity(state) !== city.id)
            ctx.ui.dispatch({ type: 'city.switch', payload: { cityId: city.id } });
          else ctx.ui.flyToCity(city.id);
        },
      });
      element.hidden = true;
      cards.set(city.id, { element, stats: values, key: '' });
    }
    const refresh = (state: GameState) => {
      const far = map.getZoom() <= FAR_ZOOM;
      const unlocked = citiesUnlocked(state);
      const active = activeCity(state);
      for (const [id, card] of cards) {
        const show = far && unlocked.includes(id);
        card.element.hidden = !show;
        if (!show) continue;
        card.element.classList.toggle('is-active', id === active);
        const parts = stats(state, id);
        const key = parts.join('|');
        if (key !== card.key) {
          card.key = key;
          card.stats.replaceChildren(...parts.map((text) => el('span', 'city-card__stat', text)));
        }
      }
    };
    /** Ansicht nach dem Zoomen: aus der Stadt heraus nach Deutschland, über einer freien Stadt wieder hinein. */
    const followZoom = (state: GameState) => {
      if (ctx.isPicking()) return;
      const zoom = map.getZoom();
      const view = ctx.ui.mapView();
      if (view.startsWith('city:') && zoom <= FAR_ZOOM) {
        ctx.ui.enterView('deutschland');
        return;
      }
      if (view !== 'deutschland' || zoom < FAR_ZOOM + ENTER_CITY_MARGIN) return;
      const { lng, lat } = map.getCenter();
      const city = playableCities().find((c) => {
        const [w, s, e, n] = c.bounds;
        return lng >= w && lng <= e && lat >= s && lat <= n;
      });
      if (!city || !citiesUnlocked(state).includes(city.id)) return;
      if (activeCity(state) !== city.id) ctx.ui.dispatch({ type: 'city.switch', payload: { cityId: city.id } });
      else ctx.ui.enterView(`city:${city.id}`);
    };
    // Auch ohne laufende Uhr (Pause): Nach dem Zoomen erscheinen oder verschwinden die Karten.
    const onZoom = () => {
      const state = ctx.getState();
      if (!state) return;
      refresh(state);
      followZoom(state);
    };
    map.on('zoomend', onZoom);
    return {
      update: refresh,
      destroy() {
        map.off('zoomend', onZoom);
        for (const card of cards.values()) card.element.remove();
      },
    };
  },
};

const AUTOBAHN_SOURCE = 'city.autobahn';
const AUTOBAHN_GLOW = 'city.autobahn.glow';

/** Stadt, in deren Rahmen der Punkt liegt (null außerhalb aller Städte, z.B. Frankfurt). */
function cityContaining(point: LngLat): string | null {
  for (const c of playableCities()) {
    const [w, s, e, n] = c.bounds;
    if (point.lng >= w && point.lng <= e && point.lat >= s && point.lat <= n) return c.id;
  }
  return null;
}

/** Läuft gerade eine Fahrt zwischen den Städten (du selbst, eine Route oder ein Kurier von Stadt zu Stadt)? */
function autobahnBusy(state: GameState): boolean {
  if (cityTravel(state)) return true;
  if (getTrips(state).some((t) => isInterCityTrip(state, t))) return true;
  return shipmentsInTransit(state).some((s) => {
    const supplier = getSupplier(state, s.supplierId);
    if (!supplier || supplier.kind !== 'city') return false;
    const from = cityContaining(supplier);
    return from !== null && from !== (s.cityId ?? 'koeln');
  });
}

/**
 * Die Autobahn zwischen den freien Städten (A1 Köln–Hamburg, roads: autobahnBetween) als feine goldene Linie, nur
 * weit herausgezoomt und nur, solange eine Fahrt darauf läuft (Auftrag 31). In der Stadt zeigt die Grundkarte sie.
 */
export const autobahnLayer: MapLayer = {
  id: 'city.autobahn',
  order: 14,
  mount(ctx) {
    const { map } = ctx;
    const gold = mapToken('--hud-gold', '#f2c766');
    map.addSource(AUTOBAHN_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: AUTOBAHN_GLOW,
      type: 'line',
      source: AUTOBAHN_SOURCE,
      maxzoom: FAR_ZOOM + 1,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': gold,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 4, 9, 8],
        'line-blur': 4,
        'line-opacity': 0.22,
      },
    });
    map.addLayer({
      id: AUTOBAHN_SOURCE,
      type: 'line',
      source: AUTOBAHN_SOURCE,
      maxzoom: FAR_ZOOM + 1,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': gold,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 9, 2.2],
        'line-opacity': 0.9,
      },
    });
    let shownKey = '';
    return {
      update(state) {
        const unlocked = citiesUnlocked(state);
        const lines = autobahnBusy(state)
          ? unlocked.flatMap((a, i) =>
              unlocked.slice(i + 1).flatMap((b) => {
                const line = autobahnBetween(a, b);
                return line ? [{ id: `${a}-${b}`, path: line.path }] : [];
              }),
            )
          : [];
        const key = lines.map((l) => l.id).join(',');
        if (key === shownKey) return;
        shownKey = key;
        (map.getSource(AUTOBAHN_SOURCE) as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: lines.map((l) => ({
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: l.path.map((p) => [p.lng, p.lat]) },
          })),
        });
      },
      destroy() {
        for (const id of [AUTOBAHN_SOURCE, AUTOBAHN_GLOW]) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(AUTOBAHN_SOURCE)) map.removeSource(AUTOBAHN_SOURCE);
      },
    };
  },
};
