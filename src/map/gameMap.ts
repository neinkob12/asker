import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { HAFEN_ROTTERDAM, KOELN_CENTER, LAGER_KOELN, type Spot } from '../data/spots';
import { CUSTOMER_PATIENCE } from '../game/config';
import type { GameState } from '../game/engine';

setWorkerUrl(workerUrl);

const style: StyleSpecification = {
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
    route: {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [HAFEN_ROTTERDAM.lng, HAFEN_ROTTERDAM.lat],
            [LAGER_KOELN.lng, LAGER_KOELN.lat],
          ],
        },
      },
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
    {
      id: 'route',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#7CFC9A', 'line-width': 2.5, 'line-dasharray': [2, 2], 'line-opacity': 0.8 },
    },
  ],
};

const koelnZoom = () => (window.innerWidth <= 760 ? 12.4 : 13.6);

export class GameMap {
  private map: MapLibreMap;
  private spotMarkers = new Map<string, { el: HTMLElement; badge: HTMLElement; marker: Marker }>();
  private truckMarkers = new Map<number, Marker>();

  constructor(container: HTMLElement, private spots: Spot[], onSpotClick: (spotId: string) => void) {
    this.map = new MapLibreMap({
      container,
      style,
      center: [KOELN_CENTER.lng, KOELN_CENTER.lat],
      zoom: koelnZoom(),
      pitch: 55,
      bearing: -20,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    this.map.addControl(new NavigationControl({ visualizePitch: true }), 'top-left');
    this.applyPadding();
    window.addEventListener('resize', () => this.applyPadding());
    this.map.on('zoom', () => container.classList.toggle('zoomed-out', this.map.getZoom() < 10));

    for (const spot of spots) {
      const el = document.createElement('button');
      el.className = 'spot-marker';
      el.dataset.spotId = spot.id;
      el.innerHTML = `<span class="spot-dot"><span class="spot-badge">0</span></span><span class="spot-name">${spot.name}</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSpotClick(spot.id);
      });
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([spot.lng, spot.lat]).addTo(this.map);
      this.spotMarkers.set(spot.id, { el, badge: el.querySelector('.spot-badge') as HTMLElement, marker });
    }

    this.addStaticMarker(LAGER_KOELN.name, LAGER_KOELN.lng, LAGER_KOELN.lat, 'place-marker lager');
    this.addStaticMarker(HAFEN_ROTTERDAM.name, HAFEN_ROTTERDAM.lng, HAFEN_ROTTERDAM.lat, 'place-marker hafen');
  }

  private addStaticMarker(name: string, lng: number, lat: number, className: string): void {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = `<span class="place-icon"></span><span class="place-name">${name}</span>`;
    new Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(this.map);
  }

  // Die Seitenleiste liegt über der Karte, also soll die Kamera auf den freien Bereich zentrieren.
  private applyPadding(): void {
    const mobile = window.innerWidth <= 760;
    this.map.setPadding(mobile ? { top: 110, bottom: window.innerHeight * 0.4, left: 0, right: 0 } : { top: 80, bottom: 0, left: 0, right: 344 });
  }

  flyToKoeln(): void {
    this.map.flyTo({ center: [KOELN_CENTER.lng, KOELN_CENTER.lat], zoom: koelnZoom(), pitch: 55, bearing: -20, duration: 2500 });
  }

  flyToEuropa(): void {
    this.map.flyTo({ center: [5.7, 51.4], zoom: 7.2, pitch: 0, bearing: 0, duration: 2500 });
  }

  update(state: GameState, selectedSpotId: string | null): void {
    for (const spot of this.spots) {
      const entry = this.spotMarkers.get(spot.id);
      if (!entry) continue;
      const waiting = state.customers.filter((c) => c.spotId === spot.id);
      const minLeft = waiting.reduce((m, c) => Math.min(m, c.expiresAt - state.time), Infinity);
      const urgency = waiting.length === 0 ? 'idle' : minLeft < CUSTOMER_PATIENCE / 3 ? 'urgent' : 'waiting';
      entry.badge.textContent = String(waiting.length);
      entry.el.dataset.urgency = urgency;
      entry.el.classList.toggle('has-runner', state.runners.some((r) => r.spotId === spot.id));
      entry.el.classList.toggle('selected', spot.id === selectedSpotId);
    }

    const active = new Set(state.shipments.map((s) => s.id));
    for (const [id, marker] of this.truckMarkers) {
      if (!active.has(id)) {
        marker.remove();
        this.truckMarkers.delete(id);
      }
    }
    for (const s of state.shipments) {
      let marker = this.truckMarkers.get(s.id);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'truck-marker';
        el.title = `${s.grams} g unterwegs`;
        marker = new Marker({ element: el }).setLngLat([HAFEN_ROTTERDAM.lng, HAFEN_ROTTERDAM.lat]).addTo(this.map);
        this.truckMarkers.set(s.id, marker);
      }
      const p = Math.min(1, Math.max(0, (state.time - s.departedAt) / (s.arrivesAt - s.departedAt)));
      marker.setLngLat([
        HAFEN_ROTTERDAM.lng + (LAGER_KOELN.lng - HAFEN_ROTTERDAM.lng) * p,
        HAFEN_ROTTERDAM.lat + (LAGER_KOELN.lat - HAFEN_ROTTERDAM.lat) * p,
      ]);
    }
  }
}
