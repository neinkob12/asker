// Spot-Marker: Zahl der wartenden Kunden, Farbe nach Dringlichkeit, Rand wenn ein Läufer da ist.
// Gesperrte Spots erscheinen grau mit Schloss, eigene Spots mit eigenem Rahmen.
// Aus der Nähe (ab FIGURE_ZOOM) stehen Figuren um den Spot: Läufer, Sicherheit und wartende Kunden.

import type { Marker } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { addFiguresAt, addHtmlMarker, el, type FigureHandle, type FigureOptions, type MapLayer } from '../../../map';
import { CUSTOMER_PATIENCE, waitingAt } from '../../customers';
import { activeRunnerAt, runnerAt, securityAt } from '../../staff';
import { getAllSpots, isSpotActive } from '../index';

/** Ab dieser Zoomstufe zeigt die Karte Figuren an den Spots. */
const FIGURE_ZOOM = 14;
/** Höchstens so viele wartende Kunden als Figur. */
const MAX_CUSTOMER_FIGURES = 3;

type FigureSpec = Omit<FigureOptions, 'position'>;

function figuresFor(state: GameState, spotId: string): FigureSpec[] {
  const figures: FigureSpec[] = [];
  const runner = activeRunnerAt(state, spotId);
  if (runner) figures.push({ role: 'runner', name: runner.name.split(' ')[0], state: 'active', title: runner.name });
  for (const guard of securityAt(state, { spotId })) figures.push({ role: 'staff', state: 'alert', title: guard.name });
  const waiting = waitingAt(state, spotId).length;
  for (let i = 0; i < Math.min(waiting, MAX_CUSTOMER_FIGURES); i++) figures.push({ role: 'customer', state: 'idle' });
  return figures;
}

export const spotsLayer: MapLayer = {
  id: 'spots.markers',
  order: 50,
  mount(ctx) {
    const markers = new Map<string, { marker: Marker; element: HTMLElement; badge: HTMLElement }>();
    const figures = new Map<string, { key: string; handles: FigureHandle[] }>();
    const container = ctx.map.getContainer();
    const onZoom = () => container.classList.toggle('spots-far', ctx.map.getZoom() < FIGURE_ZOOM);
    ctx.map.on('zoom', onZoom);
    onZoom();

    const drawFigures = (state: GameState, spotId: string, active: boolean, position: { lng: number; lat: number }) => {
      const specs = active ? figuresFor(state, spotId) : [];
      const key = specs.map((f) => `${f.role}:${f.name ?? ''}`).join('|');
      const current = figures.get(spotId);
      if (current?.key === key) return;
      for (const h of current?.handles ?? []) h.remove();
      const handles = specs.length > 0 ? addFiguresAt(ctx.map, position, specs, 22) : [];
      for (const h of handles) h.element.classList.add('spot-figure');
      figures.set(spotId, { key, handles });
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
        const selected = ui.panel?.id === 'spots.spot' ? (ui.panel.props as { spotId: string }).spotId : null;
        for (const spot of getAllSpots(state)) {
          const entry = markers.get(spot.id);
          if (!entry) continue;
          const active = isSpotActive(state, spot.id);
          entry.element.classList.toggle('is-locked', !active);
          entry.element.classList.toggle('is-custom', !!spot.custom);
          entry.element.classList.toggle('selected', spot.id === selected);
          drawFigures(state, spot.id, active, spot);
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
        ctx.map.off('zoom', onZoom);
        for (const f of figures.values()) for (const h of f.handles) h.remove();
        figures.clear();
      },
    };
  },
};
