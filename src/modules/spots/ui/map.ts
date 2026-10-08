// Spot-Marker im Look "Glas": ein Ring flach auf der Straße, am Fuß ein Punkt, darüber an einem kurzen Stiel eine runde
// Blase mit der Zahl der Wartenden. Die Farbe zeigt den Zustand (ruhig, Kunden warten, dringend, Razzia/Überfall), der
// Bogen des Rings die Geduld des ungeduldigsten Kunden: voll = frisch, fast leer = geht gleich (ringModel.ts). Daneben
// eine Plakette aus Glas mit Läufer (oder du) und Leutnant; Seite und Versatz kommen aus spots/config.ts
// (SPOT_LABELS), damit sich in der Innenstadt nichts überdeckt. Gesperrte Spots sind kleine dunkle Blasen mit Schloss
// und einem blassen Ring, ohne Plakette. Eigene Spots haben eine gestrichelte Kante und einen goldenen Fußpunkt.
// Mit der Maus erscheint über der Blase eine Karte mit Details, ein Klick öffnet den Spot im Handy. Am
// Handy-Bildschirm ist alles etwas kleiner, die Plakette sitzt über der Blase.
//
// Dazu die Hotspots: weicher Farb-Blob, wo etwas los ist. Seit dem Ring deutlich leiser (HOTSPOT_SCALE), er
// zeigt nur noch Nachfrage und Verkäufe, die man am Marker nicht sieht.

import type { Marker } from 'maplibre-gl';
import { formatEuro, type GameState } from '../../../core';
import { addHtmlMarker, createHotspots, el, type Hotspot, type MapLayer, setText } from '../../../map';
import { iconElement } from '../../../ui';
import { activeCity } from '../../city';
import { allWaiting, CUSTOMER_PATIENCE, type Customer, playerSpot, spotDemand, waitingAt } from '../../customers';
import { activeEncounters } from '../../encounters';
import { DEFAULT_PRODUCT } from '../../goods';
import { lieutenantOfSpot } from '../../hierarchy';
import { getSpotPrice } from '../../market';
import { getStaff, type StaffMember } from '../../staff';
import { veedelName } from '../../veedel';
import {
  getAllSpots,
  isKneipe,
  isSpotActive,
  type Spot,
  spotAwareness,
  spotCity,
  spotKind,
  spotLabelPlacement,
  spotType,
} from '../index';
import { raidShown, saleGlow, syncSpotGlow } from './glow';
import { patienceFill } from './ringModel';

/** Unter dieser Zoomstufe zeigen gesperrte Spots keinen Namen (sonst drängeln sich die Pillen). */
const NAMES_ZOOM = 13;
/** Hotspots leiser als früher: Den Zustand zeigt jetzt der Ring. */
const HOTSPOT_SCALE = 0.45;

export type SpotLook = 'idle' | 'waiting' | 'urgent' | 'raid';

/**
 * Spots mit Marker: nur die der aktiven Stadt (Auftrag 47, Punkt 4). Die anderen Städte sieht man nur aus der
 * Deutschland-Ansicht, und dort sind Spot-Marker ohnehin aus (zoomed-out); vorher hingen alle Städte im DOM.
 */
export function mapSpots(state: GameState): Spot[] {
  const cityId = activeCity(state);
  return getAllSpots(state).filter((s) => spotCity(s) === cityId);
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
  syncSpotGlow(state);
  const demand = spotDemand(state, spotId);
  const waiting = waitingList.length;
  return Math.min(1.5, 0.3 + demand * 0.15 + waiting * 0.16 + saleGlow(spotId, state.time) * 0.25);
}

/** Zustand des Markers: Razzia/Überfall vor allem anderen, dann dringend (Kunden gehen bald), wartend, ruhig. */
export function spotLook(
  state: GameState,
  spotId: string,
  waiting: readonly Customer[] = waitingAt(state, spotId),
): SpotLook {
  syncSpotGlow(state);
  if (raidShown(spotId, state.time)) return 'raid';
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
  for (const m of getStaff(state, { role: 'runner', cityId: activeCity(state) })) {
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
  plate: HTMLElement;
  crew: HTMLElement;
  boss: HTMLElement;
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
      const spot = spotId && state ? mapSpots(state).find((s) => s.id === spotId) : undefined;
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
    let lastLayout = '';
    const drawHotspots = (state: GameState, waiting: Map<string, Customer[]>) => {
      // Nachfrage und Verkäufe ändern sich nur mit der Spielzeit. Freischalten, Verlegen oder Aufgeben ändert die Spots
      // aber auch bei Tempo 0 (gleiche Minute), darum zählen offene Spots und ihre Lage mit.
      const spots = mapSpots(state);
      const layout = spots.map((s) => `${s.id}:${isSpotActive(state, s.id) ? 1 : 0}:${s.lng},${s.lat}`).join('|');
      if (state.time === lastTime && layout === lastLayout) return;
      lastTime = state.time;
      lastLayout = layout;
      const list: Hotspot[] = spots.map((spot) => ({
        position: spot,
        intensity: Math.round(spotActivity(state, spot.id, waiting.get(spot.id) ?? []) * HOTSPOT_SCALE * 20) / 20,
      }));
      const key = `${layout}#${list.map((h) => h.intensity).join(',')}`;
      if (key === lastHotspots) return;
      lastHotspots = key;
      hotspots.setHotspots(list);
    };

    const ensureMarkers = () => {
      const state = ctx.getState();
      if (!state) return;
      const spots = mapSpots(state);
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
      const bubble = el('span', 'spot-bubble');
      bubble.append(badge, lock);
      // Anker der Tour (Auftrag 46a): die Kundenanzeige dieses Spots, Schlüssel ist die Spot-ID.
      bubble.dataset.tour = 'spot.customer';
      bubble.dataset.tourKey = spot.id;
      const sign = el('span', 'spot-sign');
      sign.append(bubble);
      // Kneipen (Auftrag 30, Etappe 7) tragen ein Bierglas an der Blase, seit Auftrag 23 jede Art außer der Straßenecke
      // ihr Icon (Club, Park, Bahnhof …).
      if (isKneipe(spot) || spotKind(spot) !== 'corner') {
        const kind = el('span', 'spot-kind');
        kind.appendChild(iconElement(spotType(spot).icon, { strokeWidth: 2.4 }));
        sign.append(kind);
      }

      // Plakette nur als Symbole: Läufer (oder du selbst) und Leutnant, der den Spot versorgt.
      const crew = el('span', 'spot-crew');
      crew.append(iconElement('runner', { strokeWidth: 2.4 }));
      const boss = el('span', 'spot-boss');
      boss.append(iconElement('crew', { strokeWidth: 2.4 }));
      const plate = el('span', 'spot-plate');
      plate.append(crew, boss);
      plate.style.setProperty('--label-offset', `${placement.labelOffsetY}px`);

      const { marker, element } = addHtmlMarker(ctx.map, {
        position: spot,
        className: `spot-marker is-${placement.labelSide}`,
        tag: 'button',
        anchor: 'bottom',
        title: spot.name,
        children: [
          el('span', 'spot-glow'),
          el('span', 'spot-ring'),
          el('span', 'spot-pulse'),
          el('span', 'spot-foot'),
          el('span', 'spot-stem'),
          sign,
          plate,
        ],
        onClick: () => {
          if (!ctx.isPicking()) ctx.ui.openPanel('spots.spot', { spotId: spot.id });
        },
      });
      element.setAttribute('aria-label', `Spot ${spot.name} im Handy öffnen`);
      // Auftrag 46c: Anker der Tour am Marker selbst (Stufe 2 zeigt die Spots zum Kauf), Schlüssel ist die Spot-ID.
      element.dataset.tour = 'spot.marker';
      element.dataset.tourKey = spot.id;
      if (canHover()) {
        // Statt des Browser-Tooltips zeigt die Hover-Karte den Namen.
        element.removeAttribute('title');
        element.addEventListener('mouseenter', () => showCard(spot.id));
        element.addEventListener('mouseleave', () => showCard(null));
      }
      return { marker, element, badge, plate, crew, boss, key: '' };
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
        for (const spot of mapSpots(state)) {
          const entry = markers.get(spot.id);
          if (!entry) continue;
          const active = isSpotActive(state, spot.id);
          const queue = waitingMap.get(spot.id) ?? [];
          const look = active ? spotLook(state, spot.id, queue) : 'idle';
          const waiting = active ? queue.length : 0;
          const who = active ? seller(state, spot.id, runners) : { kind: 'free', name: '' };
          const lieutenant = active ? lieutenantOfSpot(state, spot.id) : null;
          // Der Ring zeigt die Geduld nur bei wartenden Kunden; bei Razzia und im Leerlauf ist er voll.
          const fill = active && look !== 'raid' ? patienceFill(state.time, queue) : 100;
          // Auftrag 23: Wenig bekannte eigene Spots sind blasser; verlegte Spots wandern mit.
          const faint = spotAwareness(state, spot.id) < 0.5;
          const key = `${active}|${look}|${waiting}|${fill}|${who.kind}|${lieutenant ?? ''}|${spot.custom ? 1 : 0}|${spot.id === selected}|${faint}|${spot.lng},${spot.lat}|${spot.name}`;
          if (key === entry.key) continue;
          entry.key = key;
          entry.marker.setLngLat([spot.lng, spot.lat]);
          // Umbenannte Spots (Auftrag 23): Name für Vorleser und, ohne Maus, als Tooltip.
          entry.element.setAttribute('aria-label', `Spot ${spot.name} im Handy öffnen`);
          if (entry.element.hasAttribute('title')) entry.element.title = spot.name;
          entry.element.classList.toggle('is-faint', faint);
          entry.element.style.setProperty('--fill', String(fill));
          entry.element.classList.toggle('is-locked', !active);
          entry.element.classList.toggle('is-custom', !!spot.custom);
          entry.element.classList.toggle('selected', spot.id === selected);
          entry.element.dataset.urgency = look;
          entry.badge.textContent = active ? String(waiting) : '';
          entry.crew.dataset.kind = who.kind;
          entry.boss.hidden = !lieutenant;
          entry.crew.hidden = who.kind === 'free';
          entry.plate.hidden = who.kind === 'free' && !lieutenant;
        }
        if (hovered && !hoverCard.element.hidden) {
          const spot = mapSpots(state).find((s) => s.id === hovered);
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
