// Hotspots: Wo etwas los ist, leuchtet ein weicher Farb-Blob (MapLibre-Heatmap), der langsam pulsiert.
// Farbe nach Dichte von Gelb über Orange und Pink bis Lila, nachts kräftiger. Keine Figuren, keine Avatare.
// Reine Optik: Die Werte liefert das Modul (z.B. spots aus Kunden, Verkäufen und Nachfrage).

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { LngLat } from '../core';

export interface Hotspot {
  position: LngLat;
  /** 0 = ruhig (unsichtbar), 1 = viel los; bis 1,5 für "brennt". */
  intensity: number;
}

export interface HotspotsHandle {
  setHotspots(hotspots: readonly Hotspot[]): void;
  remove(): void;
}

export interface HotspotsOptions {
  /** Unter diese Ebene legen (Standard: ganz oben). */
  beforeId?: string;
  /** Radius-Faktor (Standard 1). */
  size?: number;
}

const PULSE_MS = 2600;
const FPS = 24;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let night = 0;
const handles = new Set<{ applyNight(): void }>();

/** Dunkelheit (0 Tag … 1 Nacht), setzt GameMap. Nachts leuchten die Hotspots stärker. */
export function setHotspotNight(value: number): void {
  if (Math.abs(value - night) < 0.02) return;
  night = value;
  for (const h of handles) h.applyNight();
}

function radius(size: number, pulse: number) {
  const k = size * pulse;
  return ['interpolate', ['exponential', 1.6], ['zoom'], 9, 14 * k, 12, 40 * k, 14, 90 * k, 16, 240 * k, 18, 700 * k];
}

/** Hotspot-Ebene mit eigener Quelle anlegen. id mit Modul-Präfix, z.B. 'spots.hotspots'. */
export function createHotspots(map: MapLibreMap, id: string, options: HotspotsOptions = {}): HotspotsHandle {
  const size = options.size ?? 1;
  map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer(
    {
      id,
      type: 'heatmap',
      source: id,
      paint: {
        'heatmap-weight': ['get', 'weight'],
        'heatmap-radius': radius(size, 1) as never,
        'heatmap-intensity': 1,
        'heatmap-opacity': 0.75,
        // Durchsichtig → Gelb → Orange → Pink → Lila.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(255,216,77,0)',
          0.12,
          'rgba(255,216,77,0.45)',
          0.35,
          'rgba(255,163,77,0.72)',
          0.6,
          'rgba(255,111,160,0.82)',
          0.85,
          'rgba(176,108,240,0.9)',
          1,
          'rgba(141,92,246,0.95)',
        ],
      },
    },
    options.beforeId && map.getLayer(options.beforeId) ? options.beforeId : undefined,
  );

  let count = 0;
  let frame = 0;
  let last = 0;
  const start = performance.now();
  const animate = (now: number) => {
    frame = 0;
    if (count === 0 || !map.getLayer(id)) return;
    if (now - last >= 1000 / FPS) {
      last = now;
      const wave = (Math.sin(((now - start) / PULSE_MS) * 2 * Math.PI) + 1) / 2;
      map.setPaintProperty(id, 'heatmap-radius', radius(size, 0.9 + wave * 0.2) as never);
      map.setPaintProperty(id, 'heatmap-intensity', 0.85 + wave * 0.3 + night * 0.2);
    }
    frame = requestAnimationFrame(animate);
  };
  const entry = {
    applyNight() {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, 'heatmap-opacity', 0.72 + night * 0.25);
      if (reducedMotion()) map.setPaintProperty(id, 'heatmap-intensity', 1 + night * 0.2);
    },
  };
  handles.add(entry);
  entry.applyNight();

  return {
    setHotspots(hotspots) {
      const features = hotspots
        .filter((h) => h.intensity > 0.01)
        .map((h) => ({
          type: 'Feature' as const,
          properties: { weight: Math.round(Math.min(1.5, h.intensity) * 100) / 100 },
          geometry: { type: 'Point' as const, coordinates: [h.position.lng, h.position.lat] },
        }));
      count = features.length;
      (map.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      if (count > 0 && !frame && !reducedMotion()) frame = requestAnimationFrame(animate);
    },
    remove() {
      cancelAnimationFrame(frame);
      handles.delete(entry);
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    },
  };
}
