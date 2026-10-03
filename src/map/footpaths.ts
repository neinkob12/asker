// Fußwege: die letzten Meter von der Straße zum Ziel (Spot, Kunde, Lager, Kai) als gepunktete Linie. Das Fahrzeug
// hält an der Straße, den Rest geht man zu Fuß; so fährt nichts quer über Häuser. Alle Fußwege einer Karte teilen
// sich eine GeoJSON-Quelle, neue Daten gibt es nur, wenn ein Weg dazukommt oder wegfällt (gebündelt).
//
//   const walk = addFootpath(map, [straße, ziel]);   …   walk.remove();

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { distanceMeters, type LngLat } from '../core';
import { mapToken } from './tokens';

const SOURCE = 'kt-footpaths';
/** Kürzere Wege lohnen keine Linie (das Fahrzeug steht praktisch am Ziel). */
const MIN_METERS = 4;

export interface FootpathHandle {
  remove(): void;
}

class Footpaths {
  private readonly lines = new Map<number, LngLat[]>();
  private nextId = 1;
  private queued = false;

  constructor(private readonly map: MapLibreMap) {}

  private ensure(): GeoJSONSource | undefined {
    const map = this.map;
    try {
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: SOURCE,
          type: 'line',
          source: SOURCE,
          minzoom: 12.5,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            // Punkte: Strich der Länge 0 mit runden Enden.
            'line-color': mapToken('--map-footpath', '#d8dce2'),
            'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 3.5],
            'line-dasharray': [0, 2],
            'line-opacity': 0.75,
          },
        });
      }
    } catch {
      // Stil noch nicht geladen: beim nächsten Mal.
      return undefined;
    }
    return map.getSource(SOURCE) as GeoJSONSource | undefined;
  }

  add(line: LngLat[]): number {
    const id = this.nextId++;
    this.lines.set(id, line);
    this.flush();
    return id;
  }

  remove(id: number): void {
    if (this.lines.delete(id)) this.flush();
  }

  private flush(): void {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      const source = this.ensure();
      if (!source) {
        this.map.once('style.load', () => this.flush());
        return;
      }
      source.setData({
        type: 'FeatureCollection',
        features: [...this.lines.values()].map((line) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: line.map((p) => [p.lng, p.lat]) },
        })),
      });
    });
  }
}

const registry = new WeakMap<MapLibreMap, Footpaths>();

/** Gepunkteten Fußweg zeigen (z.B. route.walkTo aus roads). Zu kurze oder fehlende Wege zeigen nichts. */
export function addFootpath(map: MapLibreMap, line: readonly LngLat[] | null | undefined): FootpathHandle {
  if (!line || line.length < 2 || distanceMeters(line[0], line[line.length - 1]) < MIN_METERS) {
    return { remove() {} };
  }
  let paths = registry.get(map);
  if (!paths) {
    paths = new Footpaths(map);
    registry.set(map, paths);
  }
  const id = paths.add([...line]);
  let removed = false;
  const owner = paths;
  return {
    remove() {
      if (removed) return;
      removed = true;
      owner.remove(id);
    },
  };
}
