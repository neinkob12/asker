// Grundkarte "Nacht-Satellit": echtes Luftbild (abgedunkelt, entsättigt, kalter Blaustich), leuchtende
// Straßen aus den OpenFreeMap-Vektordaten, dunkle 3D-Gebäude mit beleuchteten Fenstern und ein dezentes
// Koordinatenraster für den Überwachungs-Look. Die Werte hier sind der Nachtzustand; Tag, Dämmerung und
// Wetter stellt GameMap zur Laufzeit über setPaintProperty ein (siehe look.ts).

import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { computeLook } from './look';

/** Ebenen-IDs der Grundkarte. Module legen eigene Ebenen mit Modul-Präfix an. */
export const BASE_LAYERS = {
  satellite: 'satellite',
  water: 'kt-water',
  tint: 'kt-tint',
  grid: 'kt-grid',
  rail: 'kt-rail',
  roadsGlow: 'kt-roads-glow',
  roadsCore: 'kt-roads-core',
  lamps: 'kt-lamps',
  buildings: 'buildings-3d',
} as const;

/**
 * Module, deren Flächen oder Linien unter den 3D-Gebäuden liegen sollen (z.B. Veedel-Grenzen), geben diese ID
 * als beforeId an: map.addLayer(layer, BELOW_BUILDINGS).
 */
export const BELOW_BUILDINGS = BASE_LAYERS.buildings;

/** Name des Fenster-Musters der Gebäude (wird in GameMap erzeugt). */
export const WINDOWS_IMAGE = 'kt-windows';

const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
const LAMP_CLASSES = ['trunk', 'primary', 'secondary', 'tertiary'];

/** Linienbreite je Straßenklasse, mit dem Zoom wachsend. factor skaliert (Glühen = breiter). */
function roadWidth(factor: number): ExpressionSpecification {
  const byClass = (widths: [number, number, number, number, number, number]): ExpressionSpecification => [
    'match',
    ['get', 'class'],
    ['motorway', 'trunk'],
    widths[0] * factor,
    'primary',
    widths[1] * factor,
    'secondary',
    widths[2] * factor,
    'tertiary',
    widths[3] * factor,
    'minor',
    widths[4] * factor,
    widths[5] * factor,
  ];
  return [
    'interpolate',
    ['exponential', 1.6],
    ['zoom'],
    9,
    byClass([0.9, 0.6, 0.4, 0.3, 0, 0]),
    13,
    byClass([2.2, 1.8, 1.4, 1, 0.5, 0.25]),
    17,
    byClass([16, 13, 11, 9, 6, 3.5]),
  ];
}

const roadFilter: ExpressionSpecification = [
  'all',
  ['match', ['get', 'class'], ROAD_CLASSES, true, false],
  ['!=', ['get', 'brunnel'], 'tunnel'],
];

interface LineFeature {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'LineString'; coordinates: number[][] };
}

/** Raster aus Längen- und Breitengraden rund um Köln (ca. 1 km Abstand). */
function koelnGrid(): { type: 'FeatureCollection'; features: LineFeature[] } {
  const features: LineFeature[] = [];
  const west = 6.7;
  const east = 7.2;
  const south = 50.8;
  const north = 51.1;
  for (let lng = west; lng <= east + 1e-9; lng += 0.015) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [lng, south],
          [lng, north],
        ],
      },
    });
  }
  for (let lat = south; lat <= north + 1e-9; lat += 0.01) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [west, lat],
          [east, lat],
        ],
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

const WORLD = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
        ],
      },
    },
  ],
} as const;

const night = computeLook(0, 0);

export const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Satellitenbild &copy; Esri, Maxar, Earthstar Geographics',
    },
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; OpenFreeMap &copy; OpenMapTiles &copy; OpenStreetMap',
    },
    'kt-world': { type: 'geojson', data: WORLD },
    'kt-grid': { type: 'geojson', data: koelnGrid() },
  },
  sky: {
    'sky-color': night.skyColor,
    'horizon-color': night.horizonColor,
    'fog-color': night.fogColor,
    'fog-ground-blend': night.fogBlend,
    'horizon-fog-blend': 0.7,
    'sky-horizon-blend': 0.6,
    'atmosphere-blend': 0,
  },
  light: { anchor: 'map', color: night.lightColor, intensity: night.lightIntensity, position: [1.3, 200, 35] },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#03060a' } },
    {
      id: BASE_LAYERS.satellite,
      type: 'raster',
      source: 'satellite',
      paint: {
        'raster-brightness-max': night.rasterBrightnessMax,
        'raster-brightness-min': night.rasterBrightnessMin,
        'raster-saturation': night.rasterSaturation,
        'raster-contrast': night.rasterContrast,
        'raster-fade-duration': 200,
      },
    },
    {
      id: BASE_LAYERS.water,
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': night.waterColor, 'fill-opacity': night.waterOpacity, 'fill-antialias': false },
    },
    {
      id: BASE_LAYERS.tint,
      type: 'fill',
      source: 'kt-world',
      paint: { 'fill-color': night.tintColor, 'fill-opacity': night.tintOpacity, 'fill-antialias': false },
    },
    {
      id: BASE_LAYERS.grid,
      type: 'line',
      source: 'kt-grid',
      minzoom: 10,
      paint: {
        'line-color': '#6cb4ff',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.05, 14, 0.14],
        'line-width': 1,
      },
    },
    {
      id: BASE_LAYERS.rail,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: {
        'line-color': '#7fa7d9',
        'line-opacity': 0.28,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 17, 2],
        'line-dasharray': [3, 2],
      },
    },
    {
      id: BASE_LAYERS.roadsGlow,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: roadFilter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': night.roadColor,
        'line-opacity': night.roadGlowOpacity,
        'line-width': roadWidth(4),
        'line-blur': roadWidth(3),
      },
    },
    {
      id: BASE_LAYERS.roadsCore,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: roadFilter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': night.roadColor,
        'line-opacity': night.roadCoreOpacity,
        'line-width': roadWidth(0.55),
        'line-blur': roadWidth(0.3),
      },
    },
    {
      id: BASE_LAYERS.lamps,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['all', ['match', ['get', 'class'], LAMP_CLASSES, true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': '#ffe2b0',
        'line-opacity': night.lampOpacity,
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.6, 18, 4],
        'line-blur': 0.6,
        'line-dasharray': [0, 7],
      },
    },
    {
      id: BASE_LAYERS.buildings,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-pattern': WINDOWS_IMAGE,
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          0,
          14,
          ['coalesce', ['get', 'render_height'], 8],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': night.buildingOpacity,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ],
};
