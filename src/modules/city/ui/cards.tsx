// Deutschland-Ansicht (Auftrag 30, 31 und 36): Jede Stadt steht als Glas-Karte auf der Karte. Sichtbar nur weit
// herausgezoomt (FAR_ZOOM, dann sind die Marker der Städte aus).
//   - Deine Städte: Veedel x/12, Ergebnis heute, Fahrten unterwegs; mit Vollmacht das Porträt des Statthalters. Ein
//     Tipp macht die Stadt aktiv und fliegt hin.
//   - Freie Städte (Reihenfolge frei): Dreh in einem Satz und der Kontakt mit Gesicht. Läuft eine Runde Angebote (eine
//     Stadt ist komplett), löst ein Tipp den Anruf dieser Stadt aus ('city.requestCall'); nach der Zusage öffnet er die
//     Übergabe.
//   - Schablonen: „bald“, ohne Tipp.
// Zoomt man aus einer Stadt heraus, wird daraus die Deutschland-Ansicht (Draufsicht), zoomt man über einer freien Stadt
// wieder hinein, deren Stadtansicht (schräg; eine andere Stadt wird dabei aktiv wie mit einem Klick auf ihre Karte).

import { render } from 'preact';
import { contactLook, formatEuro, type GameState, personLook } from '../../../core';
import { addHtmlMarker, FAR_ZOOM, type MapLayer } from '../../../map';
import { Avatar, Chip, Chips } from '../../../ui';
import { cityReport } from '../../finance';
import { getRightHand, hasFullPower } from '../../hierarchy';
import { getTrips, tripCity } from '../../logistics';
import { getStaffMember } from '../../staff';
import { campaignProgress } from '../../territory';
import { getCustomer } from '../../trade';
import {
  ABROAD_CITIES,
  activeCity,
  CITIES,
  type CityDef,
  citiesUnlocked,
  isBusinessSold,
  offerFrom,
  offerStatus,
  playableCities,
} from '../index';

/** So weit (über FAR_ZOOM) muss man hineinzoomen, bis aus Deutschland wieder die Stadt wird (kein Hin und Her). */
const ENTER_CITY_MARGIN = 1;

type CardKind = 'mine' | 'offer' | 'free' | 'soon' | 'customer';

/** Was eine Karte zeigt (als Daten, damit sie nur bei Änderungen neu zeichnet). */
interface CardModel {
  kind: CardKind;
  active: boolean;
  stats: string[];
  /** Statthalter (eigene Stadt mit Vollmacht) bzw. Kontakt (freie Stadt). */
  person: { name: string; role: string; age?: number; contact?: boolean } | null;
  pitch: string | null;
  /** Was ein Tipp tut (null = nichts). */
  action: string | null;
}

/** Kennzahlen einer eigenen Stadt als einzelne Werte (keine Aufzählung mit Punkten). */
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

/** Was ein Tipp auf eine freie Stadt bewirkt, je nach Stand ihres Angebots. */
const OFFER_ACTION: Record<string, string> = {
  scheduled: 'Ruft gleich an',
  queued: 'Anrufen lassen',
  pitched: 'Anrufen lassen',
  calling: 'Ruft gerade an',
  house: 'Wartet auf dich',
  later: 'Anrufen lassen',
  declined: 'Anrufen lassen',
  accepted: 'Zugesagt: übergeben',
};

export function cardModel(state: GameState, city: CityDef): CardModel {
  // Nach dem Verkauf (Auftrag 40): Die alten Städte sind Kunden, ihr Statthalter bestellt bei dir.
  if (isBusinessSold(state)) {
    const customer = getCustomer(state, `org:${city.id}`);
    const rh = getRightHand(state, city.id);
    const m = rh ? getStaffMember(state, rh.staffId) : undefined;
    return {
      kind: customer ? 'customer' : 'soon',
      active: false,
      stats: customer ? [`Anteil ${Math.round(customer.share * 100)} %`, `Vertrauen ${customer.trust}`] : [],
      person: m ? { name: m.name, role: 'Statthalter', age: m.age } : null,
      pitch: null,
      action: customer ? 'Kunde' : null,
    };
  }
  const unlocked = citiesUnlocked(state).includes(city.id);
  if (unlocked) {
    let person: CardModel['person'] = null;
    if (hasFullPower(state, city.id)) {
      const rh = getRightHand(state, city.id);
      const m = rh ? getStaffMember(state, rh.staffId) : undefined;
      if (m) person = { name: m.name, role: 'Statthalter', age: m.age };
    }
    return {
      kind: 'mine',
      active: activeCity(state) === city.id,
      stats: stats(state, city.id),
      person,
      pitch: null,
      action: null,
    };
  }
  if (city.template) return { kind: 'soon', active: false, stats: [], person: null, pitch: null, action: null };
  const status = offerStatus(state, city.id);
  const contact = { name: city.contact.name, role: city.contact.role ?? '', contact: true };
  if (offerFrom(state) && status !== 'none') {
    return {
      kind: 'offer',
      active: false,
      stats: [],
      person: contact,
      pitch: city.pitch,
      action: OFFER_ACTION[status] ?? null,
    };
  }
  return { kind: 'free', active: false, stats: [], person: contact, pitch: city.pitch, action: null };
}

function CityCard(props: { city: CityDef; model: CardModel }) {
  const { city, model } = props;
  const look = model.person
    ? model.person.contact
      ? contactLook(city.contact)
      : personLook(model.person.name, model.person.age)
    : null;
  return (
    <>
      <span class="city-card__head">
        <strong class="city-card__name">{city.name}</strong>
        {model.kind === 'soon' && <Chip>bald</Chip>}
        {(model.kind === 'mine' || model.kind === 'customer') && model.person && (
          <Chip color="brand" icon="crown">
            Statthalter
          </Chip>
        )}
      </span>
      {model.stats.length > 0 && (
        <span class="city-card__stats">
          {model.stats.map((s) => (
            <span key={s} class="city-card__stat">
              {s}
            </span>
          ))}
        </span>
      )}
      {model.pitch && <span class="city-card__pitch">{model.pitch}</span>}
      {model.person && (
        <span class="city-card__person">
          <Avatar
            name={model.person.name}
            look={look}
            size="sm"
            tone={model.kind === 'mine' || model.kind === 'customer' ? 'brand' : 'place'}
          />
          <span class="city-card__who">
            <span class="city-card__who-name">{model.person.name}</span>
            {model.person.role && <span class="city-card__who-role">{model.person.role}</span>}
          </span>
        </span>
      )}
      {model.action && (
        <Chips>
          <Chip
            color={model.kind === 'offer' ? 'chat' : model.kind === 'customer' ? 'money' : 'place'}
            icon={model.kind === 'customer' ? 'handshake' : 'phone'}
          >
            {model.action}
          </Chip>
        </Chips>
      )}
    </>
  );
}

interface Card {
  element: HTMLElement;
  key: string;
  model: CardModel | null;
}

export const citiesLayer: MapLayer = {
  id: 'city.cards',
  order: 90,
  mount(ctx) {
    const { map } = ctx;
    const cards = new Map<string, Card>();
    const tap = (city: CityDef) => {
      if (ctx.isPicking()) return;
      const state = ctx.getState();
      const model = cards.get(city.id)?.model;
      if (!state || !model) return;
      if (model.kind === 'customer') {
        ctx.ui.openPhone('trade.app');
      } else if (model.kind === 'mine') {
        if (activeCity(state) !== city.id) ctx.ui.dispatch({ type: 'city.switch', payload: { cityId: city.id } });
        else ctx.ui.flyToCity(city.id);
      } else if (model.kind === 'offer') {
        const from = offerFrom(state);
        if (offerStatus(state, city.id) === 'accepted' && from) {
          ctx.ui.openDialog('hierarchy.handover', { cityId: from, toCityId: city.id });
        } else {
          ctx.ui.dispatch({ type: 'city.requestCall', payload: { cityId: city.id } });
        }
      }
    };
    for (const city of CITIES) {
      const { element } = addHtmlMarker(map, {
        position: city.center,
        className: 'city-card',
        anchor: 'bottom',
        tag: 'button',
        title: city.template ? `${city.name}: bald` : city.name,
        onClick: () => tap(city),
      });
      element.hidden = true;
      cards.set(city.id, { element, key: '', model: null });
    }
    const refresh = (state: GameState) => {
      const far = map.getZoom() <= FAR_ZOOM;
      for (const city of CITIES) {
        const card = cards.get(city.id);
        if (!card) continue;
        card.element.hidden = !far;
        if (!far) continue;
        const model = cardModel(state, city);
        card.model = model;
        const key = JSON.stringify(model);
        if (key === card.key) continue;
        card.key = key;
        // Nur die eigenen Klassen setzen: MapLibre hängt seine (Position, Anker) an dasselbe Element.
        for (const kind of ['mine', 'offer', 'free', 'soon', 'customer'])
          card.element.classList.toggle(`is-${kind}`, kind === model.kind);
        card.element.classList.toggle('is-active', model.active);
        (card.element as HTMLButtonElement).disabled = model.kind === 'soon' || model.kind === 'free';
        card.element.setAttribute(
          'aria-label',
          [city.name, ...model.stats, model.pitch ?? '', model.action ?? ''].filter(Boolean).join('. '),
        );
        render(<CityCard city={city} model={model} />, card.element);
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
      // Hafen-Phase (Auftrag 40): Nur Rotterdam hat eine Stadtansicht, die alten Städte gehören dir nicht mehr.
      if (isBusinessSold(state)) {
        const here = ABROAD_CITIES.find((c) => {
          const [w, s, e, n] = c.bounds;
          return lng >= w && lng <= e && lat >= s && lat <= n;
        });
        if (here) ctx.ui.enterView(`city:${here.id}`);
        return;
      }
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
        for (const card of cards.values()) {
          render(null, card.element);
          card.element.remove();
        }
      },
    };
  },
};
