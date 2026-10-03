// Hotspots: Wo etwas los ist, leuchtet ein weicher Farb-Blob (MapLibre-Heatmap), der langsam pulsiert.
// Farbe nach Dichte von Gelb über Orange und Pink bis Lila, nachts kräftiger. Keine Figuren, keine Avatare.
// Reine Optik: Die Werte liefert das Modul (z.B. spots aus Kunden, Verkäufen und Nachfrage).

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { LngLat } from '../core';
import { motion, onMapFrame, onMotionChange } from './animation';

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
/**
 * Der Puls zeichnet die Karte neu (setPaintProperty); langsam und weich reicht eine niedrige Rate (spart Akku). Nur die
 * Stärke pulsiert, der Radius bleibt: Seine Zoom-Kurve neu zu setzen kostet mehr. Bei Pause, verstecktem Tab und
 * "Bewegung reduzieren" steht der Puls.
 */
const FPS = 6;

let night = 0;
const handles = new Set<{ applyNight(): void }>();

/** Dunkelheit (0 Tag … 1 Nacht), setzt GameMap. Nachts leuchten die Hotspots stärker. */
export function setHotspotNight(value: number): void {
  if (Math.abs(value - night) < 0.02) return;
  night = value;
  for (const h of handles) h.applyNight();
}

function radius(size: number) {
  const k = size;
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
        'heatmap-radius': radius(size) as never,
        'heatmap-intensity': 1.2,
        'heatmap-opacity': 0.5,
        // Durchsichtig → gedämpftes Bernstein → warmes Orange (wie Straßenlicht).
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(226,174,74,0)',
          0.1,
          'rgba(226,174,74,0.25)',
          0.35,
          'rgba(226,174,74,0.5)',
          0.7,
          'rgba(230,140,70,0.65)',
          1,
          'rgba(229,110,77,0.75)',
        ],
      },
    },
    options.beforeId && map.getLayer(options.beforeId) ? options.beforeId : undefined,
  );

  let count = 0;
  let last = 0;
  let stopFrames: (() => void) | null = null;
  const start = performance.now();
  const steady = () => map.getLayer(id) && map.setPaintProperty(id, 'heatmap-intensity', 1.2 + night * 0.2);
  const pulse = (now: number) => {
    if (now - last < 1000 / FPS || !map.getLayer(id)) return;
    last = now;
    const wave = (Math.sin(((now - start) / PULSE_MS) * 2 * Math.PI) + 1) / 2;
    map.setPaintProperty(id, 'heatmap-intensity', Math.round((1.05 + wave * 0.3 + night * 0.2) * 100) / 100);
  };
  /** Puls an, solange es Hotspots gibt und Bewegung erlaubt ist. */
  const sync = () => {
    const animate = count > 0 && !motion.reduced;
    if (animate && !stopFrames) stopFrames = onMapFrame(pulse, 'hotspots');
    if (!animate && stopFrames) {
      stopFrames();
      stopFrames = null;
      steady();
    }
  };
  const offMotion = onMotionChange(sync);
  const entry = {
    applyNight() {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, 'heatmap-opacity', 0.45 + night * 0.25);
      if (!stopFrames) steady();
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
      sync();
    },
    remove() {
      stopFrames?.();
      stopFrames = null;
      offMotion();
      handles.delete(entry);
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    },
  };
}
