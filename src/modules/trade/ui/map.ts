// Europa-Ansicht der Hafen-Phase (Auftrag 40): Die Deutschland-Ansicht wächst. Weit herausgezoomt (FAR_ZOOM) stehen die
// Häfen (Rotterdam, Antwerpen, Hamburg) und die fremden Städte als Glas-Karten auf der Karte, dazu die Wege der
// Lieferungen (Lkw über das Autobahn-Netz) und der Container (Seeweg über Gibraltar und den Kanal) mit einem Punkt, wo
// sie gerade sind. Die alten Städte zeigt city (cards.tsx) nach dem Verkauf als Kunden. Optik liest nur.
// Auftrag 41: Die Seewege (roads.seaLanes, aus Overture-Tiefen) liegen blass darunter, Container fahren sie entlang.

import type { GeoJSONSource } from 'maplibre-gl';
import { distanceMeters, formatNumber, type GameState, type LngLat } from '../../../core';
import { addHtmlMarker, FAR_ZOOM, type MapLayer, mapToken } from '../../../map';
import { openRegions } from '../../grow';
import { customsHeat, customsLevel } from '../../police';
import { seaLanes, seaPorts, shipRoute } from '../../roads';
import {
  deliveryPath,
  EUROPE_CITIES,
  FOREIGN_CITIES,
  getCustomer,
  getDeliveries,
  getShipments,
  harborPorts,
  isTradeActive,
  OWN_ORIGINS,
  openOrders,
  ownedPorts,
  ownShips,
  PRODUCERS,
  portStock,
  shipmentPath,
} from '../index';

const SEAWAYS = 'trade.seaways';
const ROUTES = 'trade.routes';
const MOVERS = 'trade.movers';

/** Punkt auf einem Weg bei Anteil t (0–1), nach Länge. */
function pointAt(path: readonly LngLat[], t: number): LngLat {
  if (path.length === 0) return { lng: 0, lat: 0 };
  if (path.length === 1 || t <= 0) return path[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distanceMeters(path[i - 1], path[i]);
    lengths.push(d);
    total += d;
  }
  let left = Math.min(1, t) * total;
  for (let i = 1; i < path.length; i++) {
    const d = lengths[i - 1];
    if (left <= d || i === path.length - 1) {
      const f = d > 0 ? Math.min(1, left / d) : 1;
      return {
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * f,
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * f,
      };
    }
    left -= d;
  }
  return path[path.length - 1];
}

const kg = (grams: number) => `${formatNumber(Math.round(grams / 100) / 10, 1)} kg`;

interface Card {
  element: HTMLElement;
  key: string;
}

/** Inhalt einer Glas-Karte (als Daten, damit sie nur bei Änderungen neu zeichnet). */
function portCard(state: GameState, id: string): { title: string; lines: string[]; owned: boolean } {
  const owned = ownedPorts(state).includes(id);
  const port = harborPorts().find((p) => p.id === id);
  const stock = Object.values(portStock(state, id)).reduce((s, lot) => s + lot.amount, 0);
  const heat = customsHeat(state, id);
  const lines = owned ? [kg(stock), `Zoll ${customsLevel(heat).label}`] : ['zu mieten'];
  return { title: port?.name ?? id, lines, owned };
}

/** Stadt in Europa (Auftrag 41): Kunde mit Bestellung oder Anteil, sonst das Land (meldet sich noch). */
function europeCard(state: GameState, id: string): { title: string; lines: string[] } {
  const city = EUROPE_CITIES.find((c) => c.id === id);
  const customer = getCustomer(state, `europe:${id}`);
  if (!city) return { title: id, lines: [] };
  if (!customer) return { title: city.name, lines: [city.country] };
  const open = openOrders(state).some((o) => o.customerId === customer.id);
  return { title: city.name, lines: [open ? 'Bestellung' : `Anteil ${Math.round(customer.share * 100)} %`] };
}

function cityCard(state: GameState, id: string): { title: string; lines: string[] } {
  const customer = getCustomer(state, `city:${id}`);
  const city = FOREIGN_CITIES.find((c) => c.id === id);
  if (!customer || !city) return { title: city?.name ?? id, lines: [] };
  // Knapp halten: Die Karten stehen dicht (Ruhrgebiet, Rheinland).
  const open = openOrders(state).some((o) => o.customerId === customer.id);
  return { title: city.name, lines: [open ? 'Bestellung' : `Anteil ${Math.round(customer.share * 100)} %`] };
}

function renderCard(element: HTMLElement, title: string, lines: readonly string[]): void {
  element.replaceChildren();
  const name = document.createElement('strong');
  name.className = 'trade-card__name';
  name.textContent = title;
  element.appendChild(name);
  const stats = document.createElement('span');
  stats.className = 'trade-card__stats';
  for (const line of lines) {
    const chip = document.createElement('span');
    chip.className = 'trade-card__stat';
    chip.textContent = line;
    stats.appendChild(chip);
  }
  element.appendChild(stats);
}

export const europeLayer: MapLayer = {
  id: 'trade.europe',
  order: 91,
  mount(ctx) {
    const { map } = ctx;
    const gold = mapToken('--hud-gold', '#f2c766');
    const sea = mapToken('--cat-place', '#5aa9ff');
    const ink = mapToken('--hud-ink', '#f5f1e8');
    const empty = { type: 'FeatureCollection' as const, features: [] };
    map.addSource(SEAWAYS, { type: 'geojson', data: empty });
    map.addSource(ROUTES, { type: 'geojson', data: empty });
    map.addLayer({
      id: SEAWAYS,
      type: 'line',
      source: SEAWAYS,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': sea,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2],
        'line-opacity': 0.35,
      },
    });
    map.addSource(MOVERS, { type: 'geojson', data: empty });
    map.addLayer({
      id: ROUTES,
      type: 'line',
      source: ROUTES,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'kind'], 'ship'], sea, gold],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 9, 3],
        'line-opacity': 0.85,
        'line-dasharray': [2, 1.5],
      },
    });
    map.addLayer({
      id: MOVERS,
      type: 'circle',
      source: MOVERS,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 7],
        'circle-color': ['case', ['==', ['get', 'kind'], 'ship'], sea, gold],
        'circle-stroke-color': ink,
        'circle-stroke-width': 1.5,
      },
    });
    const cards = new Map<string, Card>();
    // Fremde Städte hängen unter ihrem Punkt, die alten Städte (city) stehen darüber: weniger Überlappung.
    const addCard = (id: string, at: LngLat, onClick: () => void, anchor: 'top' | 'bottom' = 'bottom') => {
      const { element } = addHtmlMarker(map, {
        position: at,
        className: 'trade-card',
        anchor,
        tag: 'button',
        onClick,
      });
      element.hidden = true;
      cards.set(id, { element, key: '' });
    };
    for (const port of harborPorts()) {
      addCard(`port:${port.id}`, { lng: port.lng, lat: port.lat }, () => ctx.ui.openPhone('trade.app'));
    }
    for (const city of FOREIGN_CITIES) {
      addCard(`city:${city.id}`, city.at, () => ctx.ui.openPhone('trade.app'), 'top');
    }
    for (const city of EUROPE_CITIES) {
      addCard(`europe:${city.id}`, city.at, () => ctx.ui.openPhone('trade.app'), 'top');
    }
    let routesKey = '';
    let seawaysShown = '';
    const refresh = (state: GameState) => {
      const active = isTradeActive(state);
      // Auftrag 42: Der Weg über den Atlantik erscheint erst, wenn Kolumbien frei ist.
      const open = openRegions(state);
      const hiddenNodes = new Set(OWN_ORIGINS.filter((o) => !open.includes(o.regionId)).map((o) => o.sea ?? ''));
      for (const p of PRODUCERS) hiddenNodes.delete(p.sea ?? '');
      const seawaysKey = active ? `on:${[...hiddenNodes].sort().join(',')}` : '';
      if (seawaysKey !== seawaysShown) {
        // Die Seewege ändern sich sonst nie: nur neu zeichnen, wenn die Hafen-Phase beginnt oder eine Region frei wird.
        seawaysShown = seawaysKey;
        const lanes = seaLanes().filter((l) => !hiddenNodes.has(l.from) && !hiddenNodes.has(l.to));
        const lines = active ? [...lanes.map((l) => l.path), ...seaPorts().map((id) => shipRoute(id))] : [];
        (map.getSource(SEAWAYS) as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: lines
            .filter((path) => path.length > 1)
            .map((path) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: path.map((q) => [q.lng, q.lat]) },
            })),
        });
      }
      const far = map.getZoom() <= FAR_ZOOM;
      for (const [id, card] of cards) {
        // Hamburg ist schon eine Stadt mit Karte: Ihr Hafen erscheint nur, wenn du dort einen Liegeplatz hast.
        const hidden = !active || !far || (id === 'port:hamburg' && !ownedPorts(state).includes('hamburg'));
        card.element.hidden = hidden;
        if (hidden) continue;
        const model = id.startsWith('port:')
          ? portCard(state, id.slice(5))
          : id.startsWith('europe:')
            ? europeCard(state, id.slice(7))
            : cityCard(state, id.slice(5));
        const key = JSON.stringify(model);
        if (key === card.key) continue;
        card.key = key;
        card.element.classList.toggle('is-port', id.startsWith('port:'));
        card.element.setAttribute('aria-label', [model.title, ...model.lines].join('. '));
        renderCard(card.element, model.title, model.lines);
      }
      if (!active) return;
      const deliveries = getDeliveries(state);
      // Container auf der Linie fahren den Seeweg einmal; eigene Schiffe hin und zurück (Auftrag 41).
      const shipments = getShipments(state).filter((x) => x.status === 'sea' && x.vesselId === null);
      const voyages = ownShips(state).filter((v) => v.voyage !== null);
      const key = [
        ...deliveries.map((d) => `d${d.id}`),
        ...shipments.map((x) => `s${x.id}`),
        ...voyages.map((v) => `v${v.id}:${v.voyage?.producerId}`),
      ].join(',');
      const paths = new Map<string, { kind: 'truck' | 'ship'; path: LngLat[]; t: number }>();
      for (const d of deliveries) {
        const span = Math.max(1, d.arrivesAt - d.departedAt);
        paths.set(`d${d.id}`, { kind: 'truck', path: deliveryPath(state, d), t: (state.time - d.departedAt) / span });
      }
      for (const x of shipments) {
        const span = Math.max(1, x.arrivesAt - x.orderedAt);
        paths.set(`s${x.id}`, { kind: 'ship', path: shipmentPath(x), t: (state.time - x.orderedAt) / span });
      }
      for (const { id, voyage } of voyages) {
        if (!voyage) continue;
        const path = shipmentPath(voyage);
        // Hinweg: der Weg rückwärts; beim Verladen am Produzenten.
        const t = voyage.phase === 'back' ? voyage.progress : voyage.phase === 'out' ? 1 - voyage.progress : 0;
        paths.set(`v${id}`, { kind: 'ship', path, t });
      }
      if (key !== routesKey) {
        routesKey = key;
        (map.getSource(ROUTES) as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: [...paths.values()]
            .filter((p) => p.path.length > 1)
            .map((p) => ({
              type: 'Feature' as const,
              properties: { kind: p.kind },
              geometry: { type: 'LineString' as const, coordinates: p.path.map((q) => [q.lng, q.lat]) },
            })),
        });
      }
      (map.getSource(MOVERS) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [...paths.values()]
          .filter((p) => p.path.length > 0)
          .map((p) => {
            const at = pointAt(p.path, p.t);
            return {
              type: 'Feature' as const,
              properties: { kind: p.kind },
              geometry: { type: 'Point' as const, coordinates: [at.lng, at.lat] },
            };
          }),
      });
    };
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
        for (const id of [MOVERS, ROUTES, SEAWAYS]) if (map.getLayer(id)) map.removeLayer(id);
        for (const id of [MOVERS, ROUTES, SEAWAYS]) if (map.getSource(id)) map.removeSource(id);
      },
    };
  },
};
