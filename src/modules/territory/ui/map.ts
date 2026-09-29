// Veedel auf der Karte: Grenzen, eingefärbt nach kontrollierender Fraktion oder nach Heat, mit Namen.
// Klick auf ein Veedel öffnet das Veedel-Panel. Der Look ist bewusst schlicht (Auftrag 14 macht ihn schön).

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { addHtmlMarker, BELOW_BUILDINGS, el, type MapLayer } from '../../../map';
import { getHeat, heatLevel } from '../../police';
import { allVeedel, getBoundary } from '../../veedel';
import { controllerOf, factionColor, factionName } from '../index';
import { getMapView, MAP_VIEW_OPTIONS, onMapViewChange, setMapView, type VeedelMapView } from './view';

const SOURCE = 'territory.veedel';
const FILL = 'territory.veedel-fill';
const LINE = 'territory.veedel-line';
const SELECTED = 'territory.veedel-selected';

/**
 * Farbe eines Design-Tokens (Karten-Layer brauchen echte Farbwerte, keine CSS-Variablen). Gelesen wird am Kartenelement:
 * Die Karte bleibt dunkel und setzt ihre eigenen Farben (.shell-map in shell.css), auch wenn die Oberfläche hell ist.
 */
function token(name: string, fallback: string): string {
  const element = document.querySelector('.shell-map') ?? document.documentElement;
  const value = getComputedStyle(element).getPropertyValue(name).trim();
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
          color: factionColor(state, owner),
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
      token('--color-marker-idle', '#3a4a42'),
      token('--color-warn', '#f2c14e'),
      token('--color-bad', '#ef6b5b'),
    ];
    const before = map.getLayer(BELOW_BUILDINGS) ? BELOW_BUILDINGS : undefined;
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
            ['case', hover, 0.12, 0],
            [
              'case',
              isHeat,
              ['interpolate', ['linear'], ['get', 'heat'], 0, 0.1, 100, 0.5],
              ['case', ['get', 'neutral'], 0.1, 0.26],
            ],
          ] as never,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SOURCE,
        paint: {
          'line-color': ['case', isHeat, heatColor, ['get', 'color']] as never,
          'line-width': 1.5,
          'line-opacity': 0.85,
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
        paint: { 'line-color': token('--color-text', '#e8efe9'), 'line-width': 3 },
      },
      before,
    );

    // Namen der Veedel mit Herrscher bzw. Heat darunter.
    const labels = new Map<string, HTMLElement>();
    for (const v of allVeedel()) {
      const detail = el('span', 'veedel-label__detail');
      addHtmlMarker(map, {
        position: v.center,
        className: 'veedel-label',
        children: [el('span', 'veedel-label__name', v.name), detail],
      });
      labels.set(v.id, detail);
    }

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
      for (const [id, detail] of labels) detail.textContent = labelText(state, id, view);
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
    });
    map.on('mouseleave', FILL, () => {
      if (hovered) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
      hovered = null;
      map.getCanvas().style.cursor = '';
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
      },
    };
  },
};
