// Deutschland-Ansicht (Auftrag 30): Jede freie Stadt steht als Glas-Karte auf der Karte (Name, Veedel x/12, Ergebnis
// heute, Fahrten unterwegs). Sichtbar nur weit herausgezoomt; ein Klick macht die Stadt aktiv und fliegt hin. Schöner
// wird die Ansicht in Auftrag 31.

import { formatEuro, type GameState } from '../../../core';
import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { cityReport } from '../../finance';
import { getTrips, tripCity } from '../../logistics';
import { campaignProgress } from '../../territory';
import { activeCity, citiesUnlocked, playableCities } from '../index';

/** Ab diesem Zoom (und weiter heraus) stehen die Städte als Karten auf der Karte. */
const CARD_MAX_ZOOM = 9;

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
      const far = map.getZoom() <= CARD_MAX_ZOOM;
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
    // Auch ohne laufende Uhr (Pause): Nach dem Zoomen erscheinen oder verschwinden die Karten.
    const onZoom = () => {
      const state = ctx.getState();
      if (state) refresh(state);
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
