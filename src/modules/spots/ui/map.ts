// Spot-Marker im Look "Glas": ein Achteck-Schild an einem Mast, wie ein Straßenschild. Am Fuß ein Punkt und ein
// Lichtkegel in der Farbe des Zustands (ruhig, Kunden warten, dringend, Razzia/Überfall), im Schild die Zahl der
// Wartenden. Daneben eine Plakette aus Glas mit Name, Personal (Läufer, du oder frei) und sechs Strichen für die
// wartenden Kunden; Seite und Versatz kommen aus spots/config.ts (SPOT_LABELS), damit sich in der Innenstadt nichts
// überdeckt. Gesperrte Spots sind kleine dunkle Achtecke mit Schloss, ohne Plakette. Eigene Spots haben eine
// gestrichelte Kante. Mit der Maus erscheint über dem Schild eine Karte mit Details, ein Klick öffnet den Spot im Handy.
// Am Handy-Bildschirm entfällt die Plakette (nur Schild und Striche).
//
// Dazu die Hotspots: weicher Farb-Blob, wo etwas los ist. Seit dem Lichtkegel deutlich leiser (HOTSPOT_SCALE), er
// zeigt nur noch Nachfrage und Verkäufe, die man am Schild nicht sieht.

import type { Marker } from 'maplibre-gl';
import { formatEuro, type GameState } from '../../../core';
import { addHtmlMarker, createHotspots, el, type Hotspot, type MapLayer, setText } from '../../../map';
import { iconElement } from '../../../ui';
import { allWaiting, CUSTOMER_PATIENCE, type Customer, playerSpot, spotDemand, waitingAt } from '../../customers';
import { activeEncounters } from '../../encounters';
import { DEFAULT_PRODUCT } from '../../goods';
import { getSpotPrice } from '../../market';
import { getStaff, type StaffMember } from '../../staff';
import { veedelName } from '../../veedel';
import { getAllSpots, isKneipe, isSpotActive, type Spot, spotLabelPlacement } from '../index';

/** Unter dieser Zoomstufe zeigen gesperrte Spots keinen Namen (sonst drängeln sich die Pillen). */
const NAMES_ZOOM = 13;
/** So viele Spielminuten wirkt ein Verkauf im Hotspot nach (klingt linear ab). */
const SALE_GLOW_MINUTES = 90;
/** So lange zeigt ein Spot nach einer Razzia den Zustand "Razzia" (Spielminuten). */
const RAID_SHOW_MINUTES = 120;
/** Striche für wartende Kunden in der Plakette. */
const TICKS = 6;
/** Hotspots leiser als früher: Den Zustand zeigt jetzt der Lichtkegel. */
const HOTSPOT_SCALE = 0.45;

export type SpotLook = 'idle' | 'waiting' | 'urgent' | 'raid';

/** Letzte Verkäufe je Spot (Spielzeit), nur für die Optik. Füllt die Oberfläche über recordSaleGlow. */
const recentSales = new Map<string, number[]>();
/** Letzte Razzia je Spot (Spielzeit), nur für die Optik. */
const recentRaids = new Map<string, number>();

/** Einen Verkauf am Spot für den Hotspot merken. */
export function recordSaleGlow(spotId: string, time: number): void {
  const list = recentSales.get(spotId) ?? [];
  list.push(time);
  while (list.length > 8) list.shift();
  recentSales.set(spotId, list);
}

/** Eine Razzia am Spot merken (Schild wird eine Weile blau). */
export function recordSpotRaid(spotId: string, time: number): void {
  recentRaids.set(spotId, time);
}

function saleGlow(spotId: string, now: number): number {
  let glow = 0;
  for (const at of recentSales.get(spotId) ?? []) {
    const age = now - at;
    if (age >= 0 && age < SALE_GLOW_MINUTES) glow += 1 - age / SALE_GLOW_MINUTES;
  }
  return glow;
}

/** Wartende Kunden aller Spots in einem Durchlauf, je Spot dringendste zuerst (statt waitingAt pro Spot). */
export function waitingBySpot(state: GameState): Map<string, Customer[]> {
  const bySpot = new Map<string, Customer[]>();
  for (const c of allWaiting(state)) {
    const list = bySpot.get(c.spotId);
    if (list) list.push(c);
    else bySpot.set(c.spotId, [c]);
  }
  for (const list of bySpot.values()) list.sort((a, b) => a.expiresAt - b.expiresAt);
  return bySpot;
}

/** Wie viel an einem Spot los ist (0 = nichts, 1 = viel, bis 1,5). Offene Spots glimmen immer etwas. */
export function spotActivity(
  state: GameState,
  spotId: string,
  waitingList: readonly Customer[] = waitingAt(state, spotId),
): number {
  if (!isSpotActive(state, spotId)) return 0;
  const demand = spotDemand(state, spotId);
  const waiting = waitingList.length;
  return Math.min(1.5, 0.3 + demand * 0.15 + waiting * 0.16 + saleGlow(spotId, state.time) * 0.25);
}

/** Zustand des Schilds: Razzia/Überfall vor allem anderen, dann dringend (Kunden gehen bald), wartend, ruhig. */
export function spotLook(
  state: GameState,
  spotId: string,
  waiting: readonly Customer[] = waitingAt(state, spotId),
): SpotLook {
  const raidAt = recentRaids.get(spotId);
  if (raidAt !== undefined && state.time - raidAt >= 0 && state.time - raidAt < RAID_SHOW_MINUTES) return 'raid';
  if (activeEncounters(state).some((e) => e.request.spotId === spotId && e.phase !== 'done')) return 'raid';
  if (waiting.length === 0) return 'idle';
  const minLeft = waiting.reduce((m, c) => Math.min(m, c.expiresAt - state.time), Infinity);
  return minLeft < CUSTOMER_PATIENCE / 3 ? 'urgent' : 'waiting';
}

const LOOK_TEXT: Record<SpotLook, string> = {
  idle: 'ruhig',
  waiting: 'Kunden warten',
  urgent: 'Kunden werden ungeduldig',
  raid: 'Razzia oder Überfall',
};

/**
 * Läufer je Spot in einem Durchlauf (wie runnerAt aus staff: zuerst wer dort aktiv eingesetzt ist, sonst wer dorthin
 * zurückkehrt), statt für jeden Spot über alle Leute zu laufen.
 */
function runnersBySpot(state: GameState): Map<string, StaffMember> {
  const working = new Map<string, StaffMember>();
  const returning = new Map<string, StaffMember>();
  for (const m of getStaff(state, { role: 'runner' })) {
    if (m.assignment?.kind === 'spot' && m.status === 'active') {
      if (!working.has(m.assignment.targetId)) working.set(m.assignment.targetId, m);
    } else if (m.returnTo?.kind === 'spot' && !returning.has(m.returnTo.targetId)) {
      returning.set(m.returnTo.targetId, m);
    }
  }
  for (const [spotId, m] of returning) if (!working.has(spotId)) working.set(spotId, m);
  return working;
}

/** Wer am Spot verkauft: Läufer (Vorname), du, oder niemand. */
function seller(
  state: GameState,
  spotId: string,
  runners: Map<string, StaffMember> = runnersBySpot(state),
): { kind: 'runner' | 'self' | 'free'; name: string } {
  if (playerSpot(state) === spotId) return { kind: 'self', name: 'du' };
  const runner = runners.get(spotId);
  if (runner && runner.status === 'active') return { kind: 'runner', name: runner.name.split(' ')[0] };
  return { kind: 'free', name: 'frei' };
}

interface SpotMarker {
  marker: Marker;
  element: HTMLElement;
  badge: HTMLElement;
  name: HTMLElement;
  crew: HTMLElement;
  crewText: HTMLElement;
  ticks: HTMLElement[];
  key: string;
}

/** Hover-Karte nur mit Maus (nicht am Touch-Gerät). */
const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export const spotsLayer: MapLayer = {
  id: 'spots.markers',
  order: 50,
  mount(ctx) {
    const markers = new Map<string, SpotMarker>();
    const hotspots = createHotspots(ctx.map, 'spots.hotspots');
    let lastHotspots = '';
    let hovered: string | null = null;
    const container = ctx.map.getContainer();
    const onZoom = () => container.classList.toggle('spots-far', ctx.map.getZoom() < NAMES_ZOOM);
    ctx.map.on('zoom', onZoom);
    onZoom();

    // Hover-Karte: ein gemeinsames Element, das zum überfahrenen Spot wandert.
    const card = buildHoverCard();
    const hoverCard = addHtmlMarker(ctx.map, {
      position: { lng: 0, lat: 0 },
      className: 'spot-hover',
      anchor: 'bottom',
      children: [card.root],
    });
    hoverCard.element.hidden = true;

    const showCard = (spotId: string | null) => {
      hovered = spotId;
      const state = ctx.getState();
      const spot = spotId && state ? getAllSpots(state).find((s) => s.id === spotId) : undefined;
      if (!spot || !state) {
        hoverCard.element.hidden = true;
        return;
      }
      fillHoverCard(card, state, spot);
      hoverCard.element.classList.toggle('is-locked', !isSpotActive(state, spot.id));
      hoverCard.marker.setLngLat([spot.lng, spot.lat]);
      hoverCard.element.hidden = false;
    };

    let lastTime = -1;
    const drawHotspots = (state: GameState, waiting: Map<string, Customer[]>) => {
      // Nachfrage und Verkäufe ändern sich nur mit der Spielzeit.
      if (state.time === lastTime) return;
      lastTime = state.time;
      const list: Hotspot[] = getAllSpots(state).map((spot) => ({
        position: spot,
        intensity: Math.round(spotActivity(state, spot.id, waiting.get(spot.id) ?? []) * HOTSPOT_SCALE * 20) / 20,
      }));
      const key = list.map((h) => h.intensity).join(',');
      if (key === lastHotspots) return;
      lastHotspots = key;
      hotspots.setHotspots(list);
    };

    const ensureMarkers = () => {
      const state = ctx.getState();
      if (!state) return;
      const spots = getAllSpots(state);
      // Eigene Spots eines anderen Spielstands wieder entfernen.
      for (const [id, entry] of markers) {
        if (!spots.some((s) => s.id === id)) {
          entry.marker.remove();
          markers.delete(id);
        }
      }
      for (const spot of spots) {
        if (markers.has(spot.id)) continue;
        markers.set(spot.id, buildMarker(spot));
      }
    };

    const buildMarker = (spot: Spot): SpotMarker => {
      const placement = spotLabelPlacement(spot.id);
      const badge = el('span', 'spot-badge', '0');
      const lock = iconElement('lock', { class: 'spot-lock', strokeWidth: 2.4 });
      const octagon = el('span', 'spot-oct');
      octagon.append(badge, lock);
      const sign = el('span', 'spot-sign');
      sign.append(el('span', 'spot-pulse'), octagon);
      // Kneipen (Auftrag 30, Etappe 7) tragen ein Bierglas am Schild.
      if (isKneipe(spot)) {
        const kind = el('span', 'spot-kind');
        kind.appendChild(iconElement('beer', { strokeWidth: 2.4 }));
        sign.append(kind);
      }

      const name = el('span', 'spot-name', spot.name);
      const crewText = el('span', 'spot-crew__text');
      const crew = el('span', 'spot-crew');
      crew.append(iconElement('runner', { class: 'spot-crew__icon', strokeWidth: 2.2 }), crewText);
      const head = el('span', 'spot-plate__head');
      head.append(name, crew);
      const tickRow = el('span', 'spot-ticks');
      const ticks = Array.from({ length: TICKS }, () => el('span', 'spot-tick'));
      tickRow.append(...ticks);
      const plate = el('span', 'spot-plate');
      plate.append(head, tickRow);
      plate.style.setProperty('--label-offset', `${placement.labelOffsetY}px`);

      const { marker, element } = addHtmlMarker(ctx.map, {
        position: spot,
        className: `spot-marker is-${placement.labelSide}`,
        tag: 'button',
        anchor: 'bottom',
        title: spot.name,
        children: [el('span', 'spot-beam'), el('span', 'spot-foot'), el('span', 'spot-mast'), sign, plate],
        onClick: () => {
          if (!ctx.isPicking()) ctx.ui.openPanel('spots.spot', { spotId: spot.id });
        },
      });
      element.setAttribute('aria-label', `Spot ${spot.name} im Handy öffnen`);
      if (canHover()) {
        // Statt des Browser-Tooltips zeigt die Hover-Karte den Namen.
        element.removeAttribute('title');
        element.addEventListener('mouseenter', () => showCard(spot.id));
        element.addEventListener('mouseleave', () => showCard(null));
      }
      return { marker, element, badge, name, crew, crewText, ticks, key: '' };
    };
    ensureMarkers();

    return {
      update(state, ui) {
        ensureMarkers();
        // Einmal pro Aktualisierung gruppieren statt pro Spot über alle Kunden zu laufen.
        const waitingMap = waitingBySpot(state);
        const runners = runnersBySpot(state);
        drawHotspots(state, waitingMap);
        const selected = ui.panel?.id === 'spots.spot' ? (ui.panel.props as { spotId: string }).spotId : null;
        for (const spot of getAllSpots(state)) {
          const entry = markers.get(spot.id);
          if (!entry) continue;
          const active = isSpotActive(state, spot.id);
          const queue = waitingMap.get(spot.id) ?? [];
          const look = active ? spotLook(state, spot.id, queue) : 'idle';
          const waiting = active ? queue.length : 0;
          const who = active ? seller(state, spot.id, runners) : { kind: 'free', name: '' };
          const key = `${active}|${look}|${waiting}|${who.kind}|${who.name}|${spot.custom ? 1 : 0}|${spot.id === selected}`;
          if (key === entry.key) continue;
          entry.key = key;
          entry.element.classList.toggle('is-locked', !active);
          entry.element.classList.toggle('is-custom', !!spot.custom);
          entry.element.classList.toggle('selected', spot.id === selected);
          entry.element.dataset.urgency = look;
          entry.badge.textContent = active ? String(waiting) : '';
          entry.crew.dataset.kind = who.kind;
          entry.crewText.textContent = who.name;
          entry.ticks.forEach((tick, i) => {
            tick.classList.toggle('is-on', i < waiting);
          });
        }
        if (hovered && !hoverCard.element.hidden) {
          const spot = getAllSpots(state).find((s) => s.id === hovered);
          if (spot) fillHoverCard(card, state, spot);
        }
      },
      destroy() {
        ctx.map.off('zoom', onZoom);
        hotspots.remove();
        hoverCard.marker.remove();
        for (const entry of markers.values()) entry.marker.remove();
        markers.clear();
      },
    };
  },
};

interface HoverCard {
  root: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  waiting: HTMLElement;
  seller: HTMLElement;
  price: HTMLElement;
}

function buildHoverCard(): HoverCard {
  const root = el('div', 'spot-hover__card');
  const title = el('div', 'spot-hover__title');
  const sub = el('div', 'spot-hover__sub');
  const rows = el('dl', 'spot-hover__rows');
  const row = (label: string) => {
    const value = el('dd', 'spot-hover__value');
    rows.append(el('dt', 'spot-hover__label', label), value);
    return value;
  };
  const waiting = row('Wartend');
  const seller = row('Verkauft von');
  const price = row('Preis');
  const foot = el('div', 'spot-hover__foot', 'Klick: im Handy öffnen ›');
  root.append(title, sub, rows, foot);
  return { root, title, sub, waiting, seller, price };
}

function fillHoverCard(card: HoverCard, state: GameState, spot: Spot): void {
  const active = isSpotActive(state, spot.id);
  setText(card.title, spot.name);
  setText(card.sub, `${veedelName(spot.veedelId)} · ${active ? LOOK_TEXT[spotLook(state, spot.id)] : 'gesperrt'}`);
  if (!active) {
    setText(card.waiting, '–');
    setText(card.seller, '–');
    setText(card.price, '–');
    return;
  }
  const waiting = waitingAt(state, spot.id).length;
  const who = seller(state, spot.id);
  setText(card.waiting, waiting === 1 ? '1 Kunde' : `${waiting} Kunden`);
  setText(card.seller, who.kind === 'runner' ? who.name : who.kind === 'self' ? 'dir selbst' : 'niemandem');
  setText(card.price, `${formatEuro(getSpotPrice(state, spot.id, DEFAULT_PRODUCT))} / g`);
}
