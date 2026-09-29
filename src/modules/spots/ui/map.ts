// Spot-Marker: Zahl der wartenden Kunden, Farbe nach Dringlichkeit, Rand wenn ein Läufer da ist.
// Gesperrte Spots erscheinen grau mit Schloss, eigene Spots mit gestricheltem Rand.
// Dazu Hotspots: Wo etwas los ist (wartende Kunden, Verkäufe, aktuelle Nachfrage), pulsiert ein weicher
// Farb-Blob unter dem Spot. Figuren gibt es auf der Karte nicht mehr.

import type { Marker } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { addHtmlMarker, createHotspots, el, type Hotspot, type MapLayer } from '../../../map';
import { CUSTOMER_PATIENCE, spotDemand, waitingAt } from '../../customers';
import { runnerAt } from '../../staff';
import { getAllSpots, isSpotActive } from '../index';

/** So viele Spielminuten wirkt ein Verkauf im Hotspot nach (klingt linear ab). */
const SALE_GLOW_MINUTES = 90;

/** Letzte Verkäufe je Spot (Spielzeit), nur für die Optik. Füllt die Oberfläche über recordSaleGlow. */
const recentSales = new Map<string, number[]>();

/** Einen Verkauf am Spot für den Hotspot merken. */
export function recordSaleGlow(spotId: string, time: number): void {
  const list = recentSales.get(spotId) ?? [];
  list.push(time);
  while (list.length > 8) list.shift();
  recentSales.set(spotId, list);
}

function saleGlow(spotId: string, now: number): number {
  let glow = 0;
  for (const at of recentSales.get(spotId) ?? []) {
    const age = now - at;
    if (age >= 0 && age < SALE_GLOW_MINUTES) glow += 1 - age / SALE_GLOW_MINUTES;
  }
  return glow;
}

/** Wie viel an einem Spot los ist (0 = nichts, 1 = viel, bis 1,5). Offene Spots glimmen immer etwas. */
export function spotActivity(state: GameState, spotId: string): number {
  if (!isSpotActive(state, spotId)) return 0;
  const demand = spotDemand(state, spotId);
  const waiting = waitingAt(state, spotId).length;
  return Math.min(1.5, 0.3 + demand * 0.15 + waiting * 0.16 + saleGlow(spotId, state.time) * 0.25);
}

export const spotsLayer: MapLayer = {
  id: 'spots.markers',
  order: 50,
  mount(ctx) {
    const markers = new Map<string, { marker: Marker; element: HTMLElement; badge: HTMLElement }>();
    const hotspots = createHotspots(ctx.map, 'spots.hotspots');
    let lastHotspots = '';

    const drawHotspots = (state: GameState) => {
      const list: Hotspot[] = getAllSpots(state).map((spot) => ({
        position: spot,
        intensity: Math.round(spotActivity(state, spot.id) * 20) / 20,
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
        const badge = el('span', 'spot-badge', '0');
        const dot = el('span', 'spot-dot');
        dot.appendChild(badge);
        const { marker, element } = addHtmlMarker(ctx.map, {
          position: spot,
          className: 'spot-marker',
          tag: 'button',
          anchor: 'bottom',
          children: [dot, el('span', 'spot-name', spot.name)],
          onClick: () => {
            if (!ctx.isPicking()) ctx.ui.openPanel('spots.spot', { spotId: spot.id });
          },
        });
        markers.set(spot.id, { marker, element, badge });
      }
    };
    ensureMarkers();

    return {
      update(state, ui) {
        ensureMarkers();
        drawHotspots(state);
        const selected = ui.panel?.id === 'spots.spot' ? (ui.panel.props as { spotId: string }).spotId : null;
        for (const spot of getAllSpots(state)) {
          const entry = markers.get(spot.id);
          if (!entry) continue;
          const active = isSpotActive(state, spot.id);
          entry.element.classList.toggle('is-locked', !active);
          entry.element.classList.toggle('is-custom', !!spot.custom);
          entry.element.classList.toggle('selected', spot.id === selected);
          if (!active) {
            entry.element.classList.remove('has-runner');
            entry.badge.textContent = '🔒';
            entry.element.dataset.urgency = 'idle';
            continue;
          }
          const waiting = waitingAt(state, spot.id);
          const minLeft = waiting.reduce((m, c) => Math.min(m, c.expiresAt - state.time), Infinity);
          const urgency = waiting.length === 0 ? 'idle' : minLeft < CUSTOMER_PATIENCE / 3 ? 'urgent' : 'waiting';
          entry.badge.textContent = String(waiting.length);
          entry.element.dataset.urgency = urgency;
          entry.element.classList.toggle('has-runner', runnerAt(state, spot.id)?.status === 'active');
        }
      },
      destroy() {
        hotspots.remove();
        for (const entry of markers.values()) entry.marker.remove();
        markers.clear();
      },
    };
  },
};
