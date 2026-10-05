// Auftrag 42: Regionen der eigenen Produktion als Glas-Karten in der Europa-Ansicht (wie die Häfen und Städte von
// trade, gleiche Klasse trade-card): Land, Fincas, Kartell-Anteil und Aufmerksamkeit der Behörden. Optik liest nur.

import type { GameState } from '../../../core';
import { addHtmlMarker, FAR_ZOOM, type MapLayer } from '../../../map';
import { REGIONS } from '../../city';
import { cartelPaid, getFincas, REGION_ECONOMY, regionAttention, regionStatus } from '../index';

/** Inhalt der Karte einer Region (als Daten, damit sie nur bei Änderungen neu zeichnet). */
export function regionCard(state: GameState, regionId: string): { title: string; lines: string[] } | null {
  const region = REGIONS.find((r) => r.id === regionId);
  const status = regionStatus(state, regionId);
  if (!region || status === 'none') return null;
  if (status === 'called') return { title: region.name, lines: ['Angebot'] };
  const fincas = getFincas(state, regionId).length;
  const share = Math.round((REGION_ECONOMY[regionId]?.cartelShare ?? 0) * 100);
  return {
    title: region.name,
    lines: [
      fincas === 1 ? '1 Finca' : `${fincas} Fincas`,
      cartelPaid(state, regionId) ? `Kartell ${share} %` : 'Kartell offen',
      `Behörden ${Math.round(regionAttention(state, regionId))} von 100`,
    ],
  };
}

function render(element: HTMLElement, title: string, lines: readonly string[]): void {
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

export const regionsLayer: MapLayer = {
  id: 'grow.regions',
  order: 92,
  mount(ctx) {
    const { map } = ctx;
    const cards = REGIONS.map((region) => {
      const { element } = addHtmlMarker(map, {
        position: region.center,
        className: 'trade-card is-region',
        anchor: 'bottom',
        tag: 'button',
        onClick: () => ctx.ui.openPanel('grow.region', { regionId: region.id }),
      });
      element.hidden = true;
      return { id: region.id, element, key: '' };
    });
    const refresh = (state: GameState) => {
      const far = map.getZoom() <= FAR_ZOOM;
      for (const card of cards) {
        const model = far ? regionCard(state, card.id) : null;
        card.element.hidden = model === null;
        if (!model) continue;
        const key = JSON.stringify(model);
        if (key === card.key) continue;
        card.key = key;
        card.element.setAttribute('aria-label', [model.title, ...model.lines].join('. '));
        render(card.element, model.title, model.lines);
      }
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
        for (const card of cards) card.element.remove();
      },
    };
  },
};
