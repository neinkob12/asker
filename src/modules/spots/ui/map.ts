// Spot-Marker: Zahl der wartenden Kunden, Farbe nach Dringlichkeit, Rand wenn ein Läufer da ist.

import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { CUSTOMER_PATIENCE, waitingAt } from '../../customers';
import { runnerAt } from '../../staff';
import { getSpots } from '../index';

export const spotsLayer: MapLayer = {
  id: 'spots.markers',
  order: 50,
  mount(ctx) {
    const markers = new Map<string, { element: HTMLElement; badge: HTMLElement }>();

    const ensureMarkers = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const spot of getSpots(state)) {
        if (markers.has(spot.id)) continue;
        const badge = el('span', 'spot-badge', '0');
        const dot = el('span', 'spot-dot');
        dot.appendChild(badge);
        const { element } = addHtmlMarker(ctx.map, {
          position: spot,
          className: 'spot-marker',
          tag: 'button',
          anchor: 'bottom',
          children: [dot, el('span', 'spot-name', spot.name)],
          onClick: () => {
            if (!ctx.isPicking()) ctx.ui.openPanel('spots.spot', { spotId: spot.id });
          },
        });
        markers.set(spot.id, { element, badge });
      }
    };
    ensureMarkers();

    return {
      update(state, ui) {
        ensureMarkers();
        const selected = ui.panel?.id === 'spots.spot' ? (ui.panel.props as { spotId: string }).spotId : null;
        for (const spot of getSpots(state)) {
          const entry = markers.get(spot.id);
          if (!entry) continue;
          const waiting = waitingAt(state, spot.id);
          const minLeft = waiting.reduce((m, c) => Math.min(m, c.expiresAt - state.time), Infinity);
          const urgency = waiting.length === 0 ? 'idle' : minLeft < CUSTOMER_PATIENCE / 3 ? 'urgent' : 'waiting';
          entry.badge.textContent = String(waiting.length);
          entry.element.dataset.urgency = urgency;
          entry.element.classList.toggle('has-runner', runnerAt(state, spot.id)?.status === 'active');
          entry.element.classList.toggle('selected', spot.id === selected);
        }
      },
    };
  },
};
