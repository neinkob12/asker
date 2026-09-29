// Grundkarte im Candy-Look (wie die Snapchat-Map): Pastellflächen, dicke runde Straßen, wenig Details und
// 3D-Gebäude in weichen Farben mit Schatten. Alle Daten kommen aus den OpenFreeMap-Vektorkacheln
// (OpenMapTiles-Schema, ohne Key). Keine POIs, keine Straßennamen, keine Hausnummern.
// Die Farben hier sind der Tag; Morgen, Abend, Nacht und Wetter stellt GameMap zur Laufzeit über
// setPaintProperty ein (siehe look.ts). Deshalb hat jede Farbe ihre eigene Ebene mit festem Wert: Datengetriebene
// Farben (z.B. nach Straßenklasse) müssten bei jeder Änderung die Kacheln neu aufbauen.

import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { LANDMARK_ZONES, landmarkFeatures } from './landmarks';
import { computeLook } from './look';

/** Ebenen-IDs der Grundkarte. Module legen eigene Ebenen mit Modul-Präfix an. */
export const BASE_LAYERS = {
  land: 'kt-land',
  farmland: 'kt-farmland',
  park: 'kt-park',
  green: 'kt-green',
  wood: 'kt-wood',
  water: 'kt-water',
  waterLine: 'kt-water-line',
  waterway: 'kt-waterway',
  rail: 'kt-rail',
  roadGlow: 'kt-road-glow',
  minorCasing: 'kt-road-minor-casing',
  majorCasing: 'kt-road-major-casing',
  highwayCasing: 'kt-road-highway-casing',
  minor: 'kt-road-minor',
  major: 'kt-road-major',
  highway: 'kt-road-highway',
  bridgeCasing: 'kt-bridge-casing',
  bridge: 'kt-bridge',
  buildingShadow: 'kt-building-shadow',
  buildings: ['kt-buildings-1', 'kt-buildings-2', 'kt-buildings-3', 'kt-buildings-4'],
  landmarkShadow: 'kt-landmark-shadow',
  landmarks: 'kt-landmarks',
} as const;

/**
 * Module, deren Flächen oder Linien unter den 3D-Gebäuden (und ihren Schatten) liegen sollen, geben diese ID
 * als beforeId an: map.addLayer(layer, BELOW_BUILDINGS).
 */
export const BELOW_BUILDINGS = BASE_LAYERS.buildingShadow;

/** Flächen, die unter den Straßen liegen sollen: map.addLayer(layer, BELOW_ROADS). */
export const BELOW_ROADS = BASE_LAYERS.rail;

/**
 * Flächen, die nur das Land einfärben (direkt über dem Land, unter Grün, Wasser und Straßen), z.B. die Veedel:
 * map.addLayer(layer, ABOVE_LAND). So bleiben Rhein und Parks klar erkennbar.
 */
export const ABOVE_LAND = BASE_LAYERS.farmland;

/** Quelle der Wahrzeichen (GeoJSON, Farben wechseln mit der Tageszeit). */
export const LANDMARK_SOURCE = 'kt-landmarks';

/** Grenzen der Gebäudebänder in Metern: niedrig, mittel, hoch, sehr hoch. */
export const BUILDING_BANDS = [9, 16, 28] as const;

type Widths = readonly [number, number, number, number, number, number, number];

/** Straßenbreite in Pixeln je Zoomstufe (10, 12, 14, 16, 18) und Klasse. */
const WIDTHS: Record<string, readonly number[]> = {
  motorway: [1.6, 3.2, 6.5, 15, 36],
  primary: [1.1, 2.4, 5.5, 13, 30],
  secondary: [0.7, 1.8, 4.5, 11, 26],
  tertiary: [0.4, 1.2, 3.4, 9, 22],
  minor: [0, 0, 1.9, 6, 16],
  service: [0, 0, 0.6, 3, 9],
};
const ZOOMS = [10, 12, 14, 16, 18];
/** Breite der Kontur je Seite, je Zoomstufe. */
const CASING = [0.5, 0.8, 1.3, 2, 3.2];

function widthFor(index: number, casing: boolean): Widths {
  const w = (cls: string) => {
    const base = WIDTHS[cls][index];
    return casing && base > 0 ? base + 2 * CASING[index] : base;
  };
  return [w('motorway'), w('primary'), w('secondary'), w('tertiary'), w('minor'), w('service'), w('minor')];
}

/** Linienbreite nach Klasse, mit dem Zoom wachsend. casing = mit Kontur. factor skaliert (Leuchten). */
function roadWidth(casing: boolean, factor = 1): ExpressionSpecification {
  const byClass = (widths: Widths): ExpressionSpecification => [
    'match',
    ['get', 'class'],
    'motorway',
    widths[0] * factor,
    ['trunk', 'primary'],
    widths[1] * factor,
    'secondary',
    widths[2] * factor,
    'tertiary',
    widths[3] * factor,
    'minor',
    widths[4] * factor,
    'service',
    widths[5] * factor,
    widths[6] * factor,
  ];
  const stops: (number | ExpressionSpecification)[] = [];
  ZOOMS.forEach((zoom, i) => {
    stops.push(zoom, byClass(widthFor(i, casing)));
  });
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops] as ExpressionSpecification;
}

const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const isBridge: ExpressionSpecification = ['==', ['get', 'brunnel'], 'bridge'];
const MAIN_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];

/** Nebenstraßen (weiß), auch Fußgängerzonen. Brücken größerer Straßen zeichnet die Brückenebene. */
const minorFilter: FilterSpecification = [
  'all',
  notTunnel,
  [
    'any',
    ['match', ['get', 'class'], ['tertiary', 'minor', 'service'], true, false],
    ['all', ['==', ['get', 'class'], 'path'], ['==', ['get', 'subclass'], 'pedestrian']],
  ],
  ['!', ['all', isBridge, ['==', ['get', 'class'], 'tertiary']]],
];
/** Hauptstraßen (gelb). */
const majorFilter: FilterSpecification = [
  'all',
  notTunnel,
  ['!', isBridge],
  ['match', ['get', 'class'], ['trunk', 'primary', 'secondary'], true, false],
];
/** Autobahnen (orange). */
const highwayFilter: FilterSpecification = ['all', notTunnel, ['!', isBridge], ['==', ['get', 'class'], 'motorway']];
/** Brücken der größeren Straßen (orange). */
const bridgeFilter: FilterSpecification = ['all', isBridge, ['match', ['get', 'class'], MAIN_CLASSES, true, false]];

/**
 * Echte Gebäude, die nicht in einem Wahrzeichen stecken (die zeichnet die Wahrzeichen-Ebene). Die Prüfung kostet
 * Rechenzeit beim Laden der Kacheln, deshalb nur für hohe Häuser: Niedrige verschwinden ohnehin im Wahrzeichen.
 */
const outsideLandmarks: ExpressionSpecification = ['>', ['distance', LANDMARK_ZONES], 0];
/** Ab diesem Band (Index in BUILDING_BANDS) wird gegen die Wahrzeichen geprüft. */
const LANDMARK_CHECK_FROM_BAND = 2;
const buildingHeight: ExpressionSpecification = ['coalesce', ['get', 'render_height'], 8];

function buildingBand(index: number): FilterSpecification {
  const low = index === 0 ? null : BUILDING_BANDS[index - 1];
  const high = index === BUILDING_BANDS.length ? null : BUILDING_BANDS[index];
  const conditions: ExpressionSpecification[] = [['!=', ['get', 'hide_3d'], true]];
  if (low !== null) conditions.push(['>=', buildingHeight, low]);
  if (high !== null) conditions.push(['<', buildingHeight, high]);
  if (index >= LANDMARK_CHECK_FROM_BAND) conditions.push(outsideLandmarks);
  return ['all', ...conditions];
}

const day = computeLook(12 * 60);

function roadLayer(id: string, filter: FilterSpecification, color: string, casing: boolean, minzoom = 5) {
  return {
    id,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom,
    filter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': roadWidth(casing) },
  } satisfies LayerSpecification;
}

function buildingLayers(): LayerSpecification[] {
  return BASE_LAYERS.buildings.map((id, i) => ({
    id,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 13,
    filter: buildingBand(i),
    paint: {
      'fill-extrusion-color': day.buildings[i],
      // Beim Hineinzoomen wachsen die Häuser aus dem Boden.
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, buildingHeight],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 1,
      'fill-extrusion-vertical-gradient': true,
    },
  }));
}

/** Weicher Schatten: Grundriss leicht versetzt, halbtransparent (der Versatz wächst mit dem Zoom). */
const SHADOW_TRANSLATE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  13,
  ['literal', [1, 1]],
  15,
  ['literal', [3, 2.5]],
  17,
  ['literal', [9, 7]],
  19,
  ['literal', [26, 20]],
];

export const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; OpenFreeMap &copy; OpenMapTiles &copy; OpenStreetMap',
    },
    [LANDMARK_SOURCE]: { type: 'geojson', data: landmarkFeatures(0) },
  },
  sky: {
    'sky-color': day.sky,
    'horizon-color': day.horizon,
    'fog-color': day.fog,
    'fog-ground-blend': day.fogBlend,
    'horizon-fog-blend': 0.6,
    'sky-horizon-blend': 0.7,
    'atmosphere-blend': 0,
  },
  light: { anchor: 'map', color: day.light, intensity: day.lightIntensity, position: [1.15, 210, 35] },
  layers: [
    { id: BASE_LAYERS.land, type: 'background', paint: { 'background-color': day.land } },
    {
      id: BASE_LAYERS.farmland,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'farmland'],
      paint: { 'fill-color': day.park, 'fill-opacity': 0.35 },
    },
    {
      id: BASE_LAYERS.park,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': day.park, 'fill-opacity': 0.45 },
    },
    {
      id: BASE_LAYERS.green,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'grass'],
      paint: { 'fill-color': day.park },
    },
    {
      id: BASE_LAYERS.wood,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': day.wood },
    },
    {
      // Friedhöfe (Melaten) und Sportplätze sind in Köln große grüne Flächen.
      id: `${BASE_LAYERS.green}-landuse`,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'stadium', 'playground'], true, false],
      paint: { 'fill-color': day.park, 'fill-opacity': 0.75 },
    },
    {
      id: BASE_LAYERS.water,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: ['!=', ['get', 'class'], 'swimming_pool'],
      paint: { 'fill-color': day.water },
    },
    {
      id: BASE_LAYERS.waterLine,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'water',
      minzoom: 11,
      filter: ['!=', ['get', 'class'], 'swimming_pool'],
      paint: {
        'line-color': day.waterLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 2.5],
      },
    },
    {
      id: BASE_LAYERS.waterway,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      filter: ['all', notTunnel, ['match', ['get', 'class'], ['river', 'canal', 'stream'], true, false]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': day.water,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 2, 18, 6],
      },
    },
    {
      id: BASE_LAYERS.rail,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: [
        'all',
        notTunnel,
        ['==', ['get', 'class'], 'rail'],
        ['!', ['all', isBridge, ['within', LANDMARK_ZONES]]],
      ],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': day.rail,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 2.5, 18, 4],
      },
    },
    {
      // Nachts leuchten Hauptstraßen und Autobahnen (tagsüber unsichtbar).
      id: BASE_LAYERS.roadGlow,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: [
        'all',
        notTunnel,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': day.majorCasing,
        'line-opacity': day.glow,
        'line-width': roadWidth(true, 3.2),
        'line-blur': roadWidth(true, 2.2),
      },
    },
    roadLayer(BASE_LAYERS.minorCasing, minorFilter, day.minorCasing, true, 11),
    roadLayer(BASE_LAYERS.majorCasing, majorFilter, day.majorCasing, true),
    roadLayer(BASE_LAYERS.highwayCasing, highwayFilter, day.highwayCasing, true),
    roadLayer(BASE_LAYERS.minor, minorFilter, day.minor, false, 11),
    roadLayer(BASE_LAYERS.major, majorFilter, day.major, false),
    roadLayer(BASE_LAYERS.highway, highwayFilter, day.highway, false),
    roadLayer(BASE_LAYERS.bridgeCasing, bridgeFilter, day.highwayCasing, true),
    roadLayer(BASE_LAYERS.bridge, bridgeFilter, day.highway, false),
    {
      id: BASE_LAYERS.buildingShadow,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13.5,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-color': day.shadow,
        'fill-opacity': day.shadowOpacity,
        'fill-translate': SHADOW_TRANSLATE,
        'fill-translate-anchor': 'map',
        'fill-antialias': false,
      },
    },
    ...buildingLayers(),
    {
      id: BASE_LAYERS.landmarkShadow,
      type: 'fill',
      source: LANDMARK_SOURCE,
      filter: ['<', ['get', 'base'], 20],
      paint: {
        'fill-color': day.shadow,
        'fill-opacity': day.shadowOpacity,
        'fill-translate': SHADOW_TRANSLATE,
        'fill-translate-anchor': 'map',
        'fill-antialias': false,
      },
    },
    {
      id: BASE_LAYERS.landmarks,
      type: 'fill-extrusion',
      source: LANDMARK_SOURCE,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ],
};
