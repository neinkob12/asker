// Grundkarte: Satellitenbild und 3D-Gebäude. Den Nacht-Look baut Auftrag 14.

import type { StyleSpecification } from 'maplibre-gl';

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
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1410' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#c9c2b4',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.55,
      },
    },
  ],
};
