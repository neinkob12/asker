// Veedel auf der Karte: feine Grenzen und schwach getönte Flächen nach kontrollierender Fraktion oder nach Heat,
// nur auf dem Land (unter Grün, Wasser und Straßen). Keine dauerhaften Namen: Name und Herrscher bzw. Heat erscheinen nur beim Überfahren mit
// der Maus (und im Panel). Klick auf ein Veedel öffnet das Veedel-Panel.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState } from '../../../core';
import { ABOVE_LAND, addHtmlMarker, BELOW_BUILDINGS, el, type MapLayer, mapToken, mixColor } from '../../../map';
import { getHeat, heatLevel } from '../../police';
import { allVeedel, getBoundary } from '../../veedel';
import { controllerOf, factionColor, factionName } from '../index';
import { getMapView, onMapViewChange, type VeedelMapView } from './view';

/** Grenzen offener Veedel: dezentes Grau. */
const NEUTRAL_LINE = '#5a616b';

/** Fraktionsfarbe für die dunkle Karte etwas gedämpft (amount = Anteil Grau). */
function muted(color: string, amount: number): string {
  return mixColor(color, '#8a9099', amount);
}

const SOURCE = 'territory.veedel';
const FILL = 'territory.veedel-fill';
const LINE = 'territory.veedel-line';
const SELECTED = 'territory.veedel-selected';

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
          color: muted(factionColor(state, owner), 0.25),
          line: owner === null ? NEUTRAL_LINE : muted(factionColor(state, owner), 0.15),
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
      muted(mapToken('--color-info-strong', '#4c8fe0'), 0.3),
      mapToken('--map-heat-warm', '#e2ae4a'),
      mapToken('--map-heat-hot', '#e5484d'),
    ];
    const before = map.getLayer(BELOW_BUILDINGS) ? BELOW_BUILDINGS : undefined;
    // Die Einfärbung liegt nur auf dem Land, Rhein und Parks bleiben klar.
    const onLand = map.getLayer(ABOVE_LAND) ? ABOVE_LAND : before;
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
            ['case', hover, 0.08, 0],
            [
              'case',
              isHeat,
              ['interpolate', ['linear'], ['get', 'heat'], 0, 0.06, 100, 0.34],
              ['case', ['get', 'neutral'], 0, 0.14],
            ],
          ] as never,
        },
      },
      onLand,
    );
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SOURCE,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['case', isHeat, heatColor, ['get', 'line']] as never,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.6],
          'line-opacity': ['case', ['get', 'neutral'], 0.5, 0.85] as never,
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
        paint: { 'line-color': mapToken('--gold', '#e2ae4a'), 'line-width': 2, 'line-opacity': 0.95 },
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

    const draw = (state: GameState, force = false) => {
      const view = getMapView();
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
