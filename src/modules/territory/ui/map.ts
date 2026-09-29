// Veedel auf der Karte: weiche, halbtransparente Pastellflächen nach kontrollierender Fraktion oder nach Heat,
// unter den Straßen. Keine dauerhaften Namen: Name und Herrscher bzw. Heat erscheinen nur beim Überfahren mit
// der Maus (und im Panel). Klick auf ein Veedel öffnet das Veedel-Panel.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { addHtmlMarker, BELOW_BUILDINGS, BELOW_ROADS, el, type MapLayer, pastel } from '../../../map';
import { getHeat, heatLevel } from '../../police';
import { allVeedel, getBoundary } from '../../veedel';
import { controllerOf, factionColor, factionName } from '../index';
import { getMapView, MAP_VIEW_OPTIONS, onMapViewChange, setMapView, type VeedelMapView } from './view';

const SOURCE = 'territory.veedel';
const FILL = 'territory.veedel-fill';
const LINE = 'territory.veedel-line';
const SELECTED = 'territory.veedel-selected';

/** Farbe eines Design-Tokens (Karten-Layer brauchen echte Farbwerte, keine CSS-Variablen). */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

type VeedelData = Parameters<GeoJSONSource['setData']>[0];

function buildData(state: GameState, view: VeedelMapView): VeedelData {
  return {
    type: 'FeatureCollection',
    features: allVeedel().map((v) => {
      const owner = controllerOf(state, v.id);
      const ring = getBoundary(v.id).map(([lng, lat]) => [lng, lat]);
      return {
        type: 'Feature',
        properties: {
          id: v.id,
          view,
          color: pastel(factionColor(state, owner), owner === null ? 0.5 : 0.3),
          line: pastel(factionColor(state, owner), 0.15),
          neutral: owner === null,
          heat: Math.round(getHeat(state, v.id)),
        },
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
      };
    }),
  };
}

/** Kennung für "hat sich etwas Sichtbares geändert?", damit die Daten nicht 10 Mal pro Sekunde neu gesetzt werden. */
function signature(state: GameState, view: VeedelMapView): string {
  return `${view}|${allVeedel()
    .map((v) => `${controllerOf(state, v.id)}:${Math.round(getHeat(state, v.id))}`)
    .join(',')}`;
}

function labelText(state: GameState, veedelId: string, view: VeedelMapView): string {
  if (view === 'heat') {
    const heat = getHeat(state, veedelId);
    return `Heat ${Math.round(heat)} · ${heatLevel(heat).label}`;
  }
  const owner = controllerOf(state, veedelId);
  return owner === null ? 'offen' : factionName(state, owner);
}

export const veedelLayer: MapLayer = {
  id: 'territory.veedel',
  order: 10,
  mount(ctx) {
    const { map } = ctx;
    const heatColors = [
      pastel(token('--color-info', '#6cb4ff'), 0.5),
      pastel(token('--color-warn', '#ffb547'), 0.2),
      pastel(token('--color-bad', '#ff5d62'), 0.15),
    ];
    const before = map.getLayer(BELOW_BUILDINGS) ? BELOW_BUILDINGS : undefined;
    const belowRoads = map.getLayer(BELOW_ROADS) ? BELOW_ROADS : before;
    let lastSignature = '';
    let hovered: string | null = null;
    let lastSelected = '';

    const initial = ctx.getState();
    map.addSource(SOURCE, {
      type: 'geojson',
      data: initial ? buildData(initial, getMapView()) : { type: 'FeatureCollection', features: [] },
      promoteId: 'id',
    });
    const isHeat = ['==', ['get', 'view'], 'heat'];
    const heatColor = [
      'interpolate',
      ['linear'],
      ['get', 'heat'],
      0,
      heatColors[0],
      30,
      heatColors[1],
      75,
      heatColors[2],
    ];
    const hover = ['boolean', ['feature-state', 'hover'], false];
    map.addLayer(
      {
        id: FILL,
        type: 'fill',
        source: SOURCE,
        paint: {
          'fill-color': ['case', isHeat, heatColor, ['get', 'color']] as never,
          'fill-opacity': [
            '+',
            ['case', hover, 0.1, 0],
            [
              'case',
              isHeat,
              ['interpolate', ['linear'], ['get', 'heat'], 0, 0.1, 100, 0.42],
              ['case', ['get', 'neutral'], 0.04, 0.24],
            ],
          ] as never,
        },
      },
      belowRoads,
    );
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SOURCE,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['case', isHeat, heatColor, ['get', 'line']] as never,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2.5],
          'line-opacity': ['case', ['get', 'neutral'], 0.35, 0.7] as never,
          'line-blur': 0.6,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: SELECTED,
        type: 'line',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.9 },
      },
      before,
    );

    // Name mit Herrscher bzw. Heat nur beim Überfahren mit der Maus, über der Mitte des Veedels.
    const hoverName = el('span', 'veedel-label__name');
    const hoverDetail = el('span', 'veedel-label__detail');
    const label = addHtmlMarker(map, {
      position: allVeedel()[0]?.center ?? { lng: 0, lat: 0 },
      className: 'veedel-label',
      children: [hoverName, hoverDetail],
    });
    label.element.hidden = true;
    const showLabel = (id: string | null) => {
      const veedel = id ? allVeedel().find((v) => v.id === id) : undefined;
      const state = ctx.getState();
      if (!veedel || !state) {
        label.element.hidden = true;
        return;
      }
      label.marker.setLngLat([veedel.center.lng, veedel.center.lat]);
      hoverName.textContent = veedel.name;
      hoverDetail.textContent = labelText(state, veedel.id, getMapView());
      label.element.hidden = false;
    };

    // Umschalter Kontrolle/Heat oben links (am Handy im Tab "Reviere").
    const control = el('div', 'maplibregl-ctrl maplibregl-ctrl-group veedel-view-control');
    const buttons = MAP_VIEW_OPTIONS.map((option) => {
      const button = el('button', 'veedel-view-control__button', option.label) as HTMLButtonElement;
      button.type = 'button';
      button.addEventListener('click', () => setMapView(option.value));
      control.appendChild(button);
      return { option, button };
    });
    map.addControl({ onAdd: () => control, onRemove: () => control.remove() }, 'top-left');

    const draw = (state: GameState, force = false) => {
      const view = getMapView();
      for (const { option, button } of buttons) button.classList.toggle('is-active', option.value === view);
      const sig = signature(state, view);
      if (!force && sig === lastSignature) return;
      lastSignature = sig;
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(buildData(state, view));
      showLabel(hovered);
    };

    const unsubscribe = onMapViewChange(() => {
      const state = ctx.getState();
      if (state) draw(state, true);
    });

    map.on('click', FILL, (e) => {
      if (ctx.isPicking()) return;
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') ctx.ui.openPanel('veedel.veedel', { veedelId: id });
    });
    map.on('mousemove', FILL, (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id !== 'string' || id === hovered) return;
      if (hovered) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
      hovered = id;
      map.setFeatureState({ source: SOURCE, id }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';
      showLabel(id);
    });
    map.on('mouseleave', FILL, () => {
      if (hovered) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
      hovered = null;
      map.getCanvas().style.cursor = '';
      showLabel(null);
    });

    return {
      update(state, ui) {
        draw(state);
        const selected = ui.panel?.id === 'veedel.veedel' ? (ui.panel.props as { veedelId: string }).veedelId : '';
        if (selected !== lastSelected) {
          lastSelected = selected;
          map.setFilter(SELECTED, ['==', ['get', 'id'], selected]);
        }
      },
      destroy() {
        unsubscribe();
        label.marker.remove();
      },
    };
  },
};
