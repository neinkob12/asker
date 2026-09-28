// Spot-Marker: Zahl der wartenden Kunden, Farbe nach Dringlichkeit, Rand wenn ein Läufer da ist.
// Gesperrte Spots erscheinen grau mit Schloss, eigene Spots mit eigenem Rahmen.

import type { Marker } from 'maplibre-gl';
import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { CUSTOMER_PATIENCE, waitingAt } from '../../customers';
import { runnerAt } from '../../staff';
import { getAllSpots, isSpotActive } from '../index';

export const spotsLayer: MapLayer = {
  id: 'spots.markers',
  order: 50,
  mount(ctx) {
    const markers = new Map<string, { marker: Marker; element: HTMLElement; badge: HTMLElement }>();

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
    };
  },
};
