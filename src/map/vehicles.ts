// 3D-Mini-Fahrzeuge: kleine Klötze mit Kabine (fill-extrusion), die entlang einer Linie fahren und sich in
// Fahrtrichtung drehen (über ein Stück der Strecke gemittelt, damit sie an Ecken weich abbiegen). Alle Fahrzeuge einer
// Karte teilen sich eine GeoJSON-Quelle; ihr Grundriss wird höchstens 20-mal pro Sekunde neu berechnet und nur, wenn
// sich eines sichtbar bewegt hat. Damit man sie auf jeder Zoomstufe sieht, wachsen sie beim Herauszoomen mit
// (feste Größe in Pixeln, nie kleiner als in echt). Nachts werfen sie Scheinwerferlicht auf die Straße.
// Viele Fahrzeuge als Kulisse (Verkehr) zeichnet createFleet (fleet.ts) in einer eigenen WebGL-Ebene.
// Reine Optik: Die Position kommt von außen (setProgress, z.B. aus dem Lieferfortschritt der Simulation) und
// wird weich nachgezogen, damit das Fahrzeug fährt statt zu springen.

import type { GeoJSONSource, MapLayerMouseEvent, Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { LngLat } from '../core';
import {
  type MeasuredPath,
  measurePath,
  metersPerPixel,
  offsetMeters,
  pointAtDistance,
  smoothBearing,
} from './geometry';
import { addHtmlMarker, el } from './markers';
import { mapPerf } from './perf';

export type VehicleKind = 'car' | 'van' | 'truck' | 'police' | 'courier' | 'ship';

export interface VehicleOptions {
  /** Strecke als Punkte (mindestens 2). Luftlinie oder echte Route. */
  path: LngLat[];
  kind?: VehicleKind;
  /** Kurzer Text über dem Fahrzeug, z.B. "500 g". */
  label?: string;
  /** Eigene Farbe der Karosserie (Hex), z.B. die einer Gang. Standard: Flottenfarbe. */
  color?: string;
  /** Text beim Überfahren mit der Maus. */
  title?: string;
  onClick?: () => void;
  /** Startposition auf der Strecke (0–1), ohne Anfahrt vom Start. */
  progress?: number;
}

export interface VehicleHandle {
  /** Position auf der Strecke, 0 = Start, 1 = Ziel. Wird weich nachgezogen. */
  setProgress(t: number): void;
  /** Wie setProgress, aber ohne Nachziehen (z.B. beim ersten Anzeigen). */
  jumpTo(t: number): void;
  setPath(path: LngLat[]): void;
  setLabel(label: string): void;
  /** Karosseriefarbe (Hex) oder null für die Standardfarbe. */
  setColor(color: string | null): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

/** Einheitliche Flottenfarben (der Spieler). */
export const VEHICLE_COLORS = {
  body: '#3dbb7f',
  cabin: '#d8dce2',
  police: '#4c8fe0',
  hull: '#8a5a5e',
  cargo: ['#b99a5e', '#5e7a93', '#7d6ea8'],
} as const;

export interface Box {
  /** Vorne/hinten und links/rechts als Anteil der Länge (Mitte = 0). */
  f0: number;
  f1: number;
  w: number;
  base: number;
  top: number;
  color: 'body' | 'cabin' | 'police' | 'hull' | 'cargo0' | 'cargo1' | 'cargo2';
  /** Spitz nach vorne (Bug eines Schiffs). */
  bow?: boolean;
}

export interface KindSpec {
  /** Echte Länge in Metern (kleiner wird es nie). */
  meters: number;
  /** Länge auf dem Bildschirm in Pixeln. */
  pixels: number;
  boxes: Box[];
  lights: boolean;
}

// Maße als Anteil der Länge, bewusst etwas spielzeughaft (breit und hoch). Auch für die Flotte (fleet.ts).
export const KINDS: Record<VehicleKind, KindSpec> = {
  courier: {
    meters: 2.2,
    pixels: 13,
    lights: true,
    boxes: [
      { f0: -0.5, f1: 0.5, w: 0.42, base: 0, top: 0.32, color: 'body' },
      { f0: -0.3, f1: 0.05, w: 0.34, base: 0.32, top: 0.62, color: 'cabin' },
    ],
  },
  car: {
    meters: 4.5,
    pixels: 17,
    lights: true,
    boxes: [
      { f0: -0.5, f1: 0.5, w: 0.46, base: 0, top: 0.22, color: 'body' },
      { f0: -0.3, f1: 0.2, w: 0.4, base: 0.22, top: 0.4, color: 'cabin' },
    ],
  },
  police: {
    meters: 4.8,
    pixels: 18,
    lights: true,
    boxes: [
      { f0: -0.5, f1: 0.5, w: 0.46, base: 0, top: 0.22, color: 'cabin' },
      { f0: -0.3, f1: 0.2, w: 0.4, base: 0.22, top: 0.38, color: 'police' },
      { f0: -0.12, f1: 0.02, w: 0.34, base: 0.38, top: 0.45, color: 'police' },
    ],
  },
  van: {
    meters: 5.5,
    pixels: 21,
    lights: true,
    boxes: [
      { f0: -0.5, f1: 0.26, w: 0.42, base: 0, top: 0.4, color: 'body' },
      { f0: 0.26, f1: 0.5, w: 0.4, base: 0, top: 0.28, color: 'cabin' },
    ],
  },
  truck: {
    meters: 12,
    pixels: 29,
    lights: true,
    boxes: [
      { f0: -0.5, f1: 0.24, w: 0.3, base: 0.04, top: 0.34, color: 'body' },
      { f0: 0.27, f1: 0.5, w: 0.3, base: 0, top: 0.26, color: 'cabin' },
      { f0: -0.5, f1: 0.5, w: 0.22, base: 0, top: 0.04, color: 'cabin' },
    ],
  },
  ship: {
    meters: 110,
    pixels: 50,
    lights: false,
    boxes: [
      { f0: -0.5, f1: 0.38, w: 0.2, base: 0, top: 0.06, color: 'hull' },
      { f0: 0.38, f1: 0.5, w: 0.2, base: 0, top: 0.06, color: 'hull', bow: true },
      { f0: -0.48, f1: -0.34, w: 0.16, base: 0.06, top: 0.2, color: 'cabin' },
      { f0: -0.3, f1: -0.08, w: 0.16, base: 0.06, top: 0.13, color: 'cargo0' },
      { f0: -0.07, f1: 0.14, w: 0.16, base: 0.06, top: 0.16, color: 'cargo1' },
      { f0: 0.15, f1: 0.34, w: 0.16, base: 0.06, top: 0.12, color: 'cargo2' },
    ],
  },
};

const SOURCE = 'kt-vehicles';
const LIGHTS_SOURCE = 'kt-vehicle-lights';
const LAYER = 'kt-vehicles';
const SHADOW_LAYER = 'kt-vehicle-shadow';
const LIGHTS_LAYER = 'kt-vehicle-lights';
/** Zeitkonstante fürs Nachziehen der Position in ms. */
const FOLLOW_MS = 280;
/** Höchstens so oft pro Sekunde neue Geometrie an die Karte. */
const MAX_FPS = 20;
/** Neu zeichnen erst, wenn sich ein Fahrzeug um mindestens so viele Pixel bewegt hat. */
const MIN_MOVE_PX = 0.35;
/** Unter dieser Dunkelheit gibt es kein Scheinwerferlicht (dann bleibt die Licht-Quelle leer). */
const LIGHTS_FROM_NIGHT = 0.05;

interface Vehicle {
  id: number;
  path: MeasuredPath;
  kind: VehicleKind;
  color: string | null;
  title: string;
  onClick?: () => void;
  target: number;
  shown: number;
  /** Fortschritt beim letzten Zeichnen (für "hat sich sichtbar bewegt?"). */
  drawn: number;
  visible: boolean;
  label: { marker: Marker; element: HTMLElement; text: HTMLElement; value: string } | null;
}

type Feature = {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'Point'; coordinates: number[] };
};

/** Alle Fahrzeuge einer Karte. */
class Fleet {
  private readonly vehicles = new Map<number, Vehicle>();
  private nextId = 1;
  private frame = 0;
  private lastFrame = 0;
  private lastDraw = 0;
  private dirty = false;
  private night = 0;
  private lightsShown = false;
  private hover: { marker: Marker; element: HTMLElement; text: HTMLElement } | null = null;

  constructor(private readonly map: MapLibreMap) {
    // Vor dem Laden des Stils geht das noch nicht; dann beim ersten Zeichnen.
    try {
      this.ensureLayers();
    } catch {
      map.once('style.load', () => this.schedule(true));
    }
    map.on('zoom', () => this.schedule(true));
    map.on('click', LAYER, (e) => this.onClick(e));
    map.on('mousemove', LAYER, (e) => this.onHover(e));
    map.on('mouseleave', LAYER, () => this.onHover(null));
  }

  private ensureLayers(): void {
    const map = this.map;
    if (map.getSource(SOURCE)) return;
    const empty = { type: 'FeatureCollection' as const, features: [] };
    map.addSource(SOURCE, { type: 'geojson', data: empty });
    map.addSource(LIGHTS_SOURCE, { type: 'geojson', data: empty });
    map.addLayer({
      id: LIGHTS_LAYER,
      type: 'circle',
      source: LIGHTS_SOURCE,
      paint: {
        'circle-color': '#fff1bf',
        'circle-radius': ['*', ['get', 'size'], 1],
        'circle-blur': 1,
        'circle-opacity': 0,
        'circle-pitch-alignment': 'map',
      },
    });
    map.addLayer({
      id: SHADOW_LAYER,
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'base'], 0],
      paint: {
        'fill-color': '#2a1d4a',
        'fill-opacity': 0.22,
        'fill-translate': [3, 3],
        'fill-translate-anchor': 'map',
        'fill-antialias': false,
      },
    });
    map.addLayer({
      id: LAYER,
      type: 'fill-extrusion',
      source: SOURCE,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-height': ['get', 'top'],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': false,
      },
    });
  }

  add(options: VehicleOptions): Vehicle {
    const start = Math.min(1, Math.max(0, options.progress ?? 0));
    const vehicle: Vehicle = {
      id: this.nextId++,
      path: measurePath(options.path),
      kind: options.kind ?? 'van',
      color: options.color ?? null,
      title: options.title ?? '',
      onClick: options.onClick,
      target: start,
      shown: start,
      drawn: -1,
      visible: true,
      label: null,
    };
    this.vehicles.set(vehicle.id, vehicle);
    if (options.label) this.setLabel(vehicle, options.label);
    this.schedule(true);
    return vehicle;
  }

  remove(vehicle: Vehicle): void {
    vehicle.label?.marker.remove();
    this.vehicles.delete(vehicle.id);
    this.schedule(true);
  }

  setLabel(vehicle: Vehicle, text: string): void {
    if (!text) {
      vehicle.label?.marker.remove();
      vehicle.label = null;
      return;
    }
    if (vehicle.label?.value === text) return;
    if (!vehicle.label) {
      const textEl = el('span', 'map-fx-vehicle__label', text);
      const { marker, element } = addHtmlMarker(this.map, {
        position: pointAtDistance(vehicle.path, vehicle.shown * vehicle.path.length),
        className: 'map-fx-vehicle-tag',
        anchor: 'bottom',
        children: [textEl],
      });
      // Über dem Fahrzeug, das auf dem Bildschirm etwa KINDS[kind].pixels lang ist.
      marker.setOffset([0, -Math.round(KINDS[vehicle.kind].pixels * 0.55 + 6)]);
      vehicle.label = { marker, element, text: textEl, value: text };
    }
    vehicle.label.value = text;
    vehicle.label.text.textContent = text;
    vehicle.label.element.hidden = !vehicle.visible;
  }

  setNight(night: number): void {
    if (Math.abs(night - this.night) < 0.02) return;
    const lightsBefore = this.night >= LIGHTS_FROM_NIGHT;
    this.night = night;
    if (this.map.getLayer(LIGHTS_LAYER)) this.map.setPaintProperty(LIGHTS_LAYER, 'circle-opacity', night * 0.85);
    if (lightsBefore !== night >= LIGHTS_FROM_NIGHT) this.schedule(true);
  }

  /** Neu zeichnen lassen; force = auch ohne Bewegung (Zoom, Farbe, neue Fahrzeuge). */
  schedule(force = false): void {
    if (force) this.dirty = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.frame = 0;
    const t0 = mapPerf.begin();
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : 16;
    this.lastFrame = now;
    let moving = false;
    const follow = 1 - Math.exp(-dt / FOLLOW_MS);
    for (const v of this.vehicles.values()) {
      const diff = v.target - v.shown;
      if (Math.abs(diff) < 1e-5) {
        v.shown = v.target;
        continue;
      }
      v.shown += diff * follow;
      moving = true;
    }
    const due = now - this.lastDraw >= 1000 / MAX_FPS;
    if (due && (this.dirty || (moving && this.movedVisibly()))) {
      this.draw();
      this.lastDraw = now;
      this.dirty = false;
    }
    if (moving || this.dirty) this.schedule();
    else this.lastFrame = 0;
    mapPerf.end('frame', 'vehicles', t0);
  }

  /** Hat sich seit dem letzten Zeichnen ein Fahrzeug um mehr als MIN_MOVE_PX bewegt? */
  private movedVisibly(): boolean {
    const mpp = metersPerPixel(this.map.getCenter().lat, this.map.getZoom());
    for (const v of this.vehicles.values()) {
      if (!v.visible) continue;
      if (v.drawn < 0 || (Math.abs(v.shown - v.drawn) * v.path.length) / mpp >= MIN_MOVE_PX) return true;
    }
    return false;
  }

  private draw(): void {
    try {
      this.ensureLayers();
    } catch {
      return;
    }
    const source = this.map.getSource(SOURCE) as GeoJSONSource | undefined;
    const lights = this.map.getSource(LIGHTS_SOURCE) as GeoJSONSource | undefined;
    if (!source || !lights) return;
    const zoom = this.map.getZoom();
    const withLights = this.night >= LIGHTS_FROM_NIGHT;
    const features: Feature[] = [];
    const lightFeatures: Feature[] = [];
    for (const v of this.vehicles.values()) {
      v.drawn = v.shown;
      if (!v.visible) continue;
      const along = v.shown * v.path.length;
      const position = pointAtDistance(v.path, along);
      const spec = KINDS[v.kind];
      const mpp = metersPerPixel(position.lat, zoom);
      const length = Math.max(spec.meters, spec.pixels * mpp);
      // Richtung über eine Fahrzeuglänge gemittelt: An Ecken dreht es weich.
      const bearing = smoothBearing(v.path, along, Math.max(4, spec.meters * 0.8));
      v.label?.marker.setLngLat([position.lng, position.lat]);
      for (const box of spec.boxes) {
        features.push({
          type: 'Feature',
          properties: {
            vid: v.id,
            base: box.base === 0 ? 0 : round(box.base * length),
            top: round(box.top * length),
            color: boxColor(v, box),
          },
          geometry: { type: 'Polygon', coordinates: [boxRing(position, bearing, box, length)] },
        });
      }
      if (spec.lights && withLights) {
        const front = offsetMeters(position, bearing, length * 0.95, 0);
        lightFeatures.push({
          type: 'Feature',
          properties: { size: round(Math.min(40, (length * 0.9) / mpp)) },
          geometry: { type: 'Point', coordinates: [front.lng, front.lat] },
        });
      }
    }
    source.setData({ type: 'FeatureCollection', features } as never);
    // Tagsüber keine Lichter: die Quelle nur einmal leeren statt bei jeder Bewegung neu zu setzen.
    if (withLights || this.lightsShown) {
      lights.setData({ type: 'FeatureCollection', features: lightFeatures } as never);
      this.lightsShown = withLights;
    }
  }

  private find(e: MapLayerMouseEvent): Vehicle | undefined {
    const id = e.features?.[0]?.properties?.vid;
    return typeof id === 'number' ? this.vehicles.get(id) : undefined;
  }

  private onClick(e: MapLayerMouseEvent): void {
    const vehicle = this.find(e);
    if (vehicle?.onClick) vehicle.onClick();
  }

  private onHover(e: MapLayerMouseEvent | null): void {
    const vehicle = e ? this.find(e) : undefined;
    const canvas = this.map.getCanvas();
    canvas.style.cursor = vehicle?.onClick ? 'pointer' : '';
    if (!vehicle?.title || !e) {
      if (this.hover) this.hover.element.hidden = true;
      return;
    }
    if (!this.hover) {
      const text = el('span', 'map-hover-label__text');
      const { marker, element } = addHtmlMarker(this.map, {
        position: e.lngLat,
        className: 'map-hover-label',
        anchor: 'bottom',
        children: [text],
      });
      this.hover = { marker, element, text };
    }
    this.hover.marker.setLngLat(e.lngLat);
    this.hover.text.textContent = vehicle.title;
    this.hover.element.hidden = false;
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

function boxColor(v: Vehicle, box: Box): string {
  switch (box.color) {
    case 'body':
      return v.color ?? VEHICLE_COLORS.body;
    case 'hull':
      return v.color ?? VEHICLE_COLORS.hull;
    case 'cabin':
      return VEHICLE_COLORS.cabin;
    case 'police':
      return VEHICLE_COLORS.police;
    case 'cargo0':
      return VEHICLE_COLORS.cargo[0];
    case 'cargo1':
      return VEHICLE_COLORS.cargo[1];
    default:
      return VEHICLE_COLORS.cargo[2];
  }
}

/** Grundriss eines Kastens in Längen (Mitte des Fahrzeugs = Position, vorne = Fahrtrichtung). */
function boxRing(position: LngLat, heading: number, box: Box, length: number): number[][] {
  const half = (box.w * length) / 2;
  const f0 = box.f0 * length;
  const f1 = box.f1 * length;
  const local: [number, number][] = box.bow
    ? [
        [f0, -half],
        [f1, 0],
        [f0, half],
      ]
    : [
        [f0, -half],
        [f1, -half],
        [f1, half],
        [f0, half],
      ];
  const ring = local.map(([f, l]) => {
    const p = offsetMeters(position, heading, f, l);
    return [p.lng, p.lat];
  });
  return [...ring, ring[0]];
}

const fleets = new WeakMap<MapLibreMap, Fleet>();

function fleetOf(map: MapLibreMap): Fleet {
  let fleet = fleets.get(map);
  if (!fleet) {
    fleet = new Fleet(map);
    fleets.set(map, fleet);
  }
  return fleet;
}

/** Dunkelheit (0–1) für die Scheinwerfer, setzt GameMap. */
export function setVehicleNight(map: MapLibreMap, night: number): void {
  fleets.get(map)?.setNight(night);
}

/** 3D-Mini-Fahrzeug auf einer Linie. Bewegen mit setProgress(t), Standardfarbe = Flotte des Spielers. */
export function createVehicle(map: MapLibreMap, options: VehicleOptions): VehicleHandle {
  const fleet = fleetOf(map);
  const vehicle = fleet.add(options);
  return {
    setProgress(t) {
      const next = Math.min(1, Math.max(0, t));
      if (next === vehicle.target) return;
      vehicle.target = next;
      fleet.schedule();
    },
    jumpTo(t) {
      vehicle.target = Math.min(1, Math.max(0, t));
      vehicle.shown = vehicle.target;
      fleet.schedule(true);
    },
    setPath(path) {
      vehicle.path = measurePath(path);
      fleet.schedule(true);
    },
    setLabel(label) {
      fleet.setLabel(vehicle, label);
    },
    setColor(color) {
      if (color === vehicle.color) return;
      vehicle.color = color;
      fleet.schedule(true);
    },
    setVisible(visible) {
      if (visible === vehicle.visible) return;
      vehicle.visible = visible;
      if (vehicle.label) vehicle.label.element.hidden = !visible;
      fleet.schedule(true);
    },
    remove() {
      fleet.remove(vehicle);
    },
  };
}

export interface AnimateVehicleOptions extends VehicleOptions {
  /** Echte Fahrzeit in ms (unabhängig vom Spieltempo). */
  durationMs: number;
  /** Am Ziel wieder von vorn. */
  loop?: boolean;
  /** Am Ziel entfernen (Standard true, außer bei loop). */
  removeAtEnd?: boolean;
  onDone?: () => void;
}

/** Fahrzeug fährt einmal (oder in Schleife) die Strecke ab, in echter Zeit. Für reine Deko-Fahrten. */
export function animateVehicle(map: MapLibreMap, options: AnimateVehicleOptions): VehicleHandle & { stop(): void } {
  const vehicle = createVehicle(map, options);
  const startTime = performance.now();
  let frame = 0;
  const step = (now: number) => {
    let t = (now - startTime) / options.durationMs;
    if (options.loop) t %= 1;
    vehicle.jumpTo(Math.min(1, t));
    if (t < 1 || options.loop) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    if (options.removeAtEnd ?? true) vehicle.remove();
    options.onDone?.();
  };
  frame = requestAnimationFrame(step);
  return {
    ...vehicle,
    stop() {
      cancelAnimationFrame(frame);
      vehicle.remove();
    },
  };
}
