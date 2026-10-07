// Effekt-Werkzeuge für Module und Integration: Geld-Popups, Blaulicht, Ping und Blitz, dazu gebunden an die
// aktive Karte die 3D-Mini-Fahrzeuge (vehicles.ts). Beschreibung und Beispiele: src/map/README.md.
//
// Jede Funktion gibt es zweimal:
//   - mit Karte als erstem Argument, z.B. moneyPopup(ctx.map, pos, 450) in einem Karten-Layer
//   - gebunden an die aktive Karte über mapEffects, z.B. mapEffects.money(pos, 450) in onGameEvent-Reaktionen
//     (tut nichts und gibt null zurück, solange keine Karte da ist)
// Effekte sind reine Optik: Sie lesen den Spielzustand nicht und ändern ihn nie.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { formatEuro, type LngLat } from '../core';
import { setFleetNight } from './fleet';
import { setHotspotNight } from './hotspots';
import type { MapLook } from './look';
import { addHtmlMarker, el } from './markers';
import {
  type AnimateVehicleOptions,
  animateVehicle,
  createVehicle,
  setVehicleNight,
  type VehicleOptions,
} from './vehicles';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------------------------
// Geld-Popup

export interface MoneyPopupOptions {
  /** good = Einnahme (grün), bad = Verlust (rot), info = neutral. Standard: nach Vorzeichen. */
  tone?: 'good' | 'bad' | 'info';
  /** Dauer der Animation in ms, Standard 1800. */
  durationMs?: number;
  /** Zweite Zeile, z.B. "Verkauf" oder "Razzia". */
  caption?: string;
}

/** Aufsteigende Zahl wie "+450 €" an einer Position. Text statt Zahl ist auch möglich. */
export function moneyPopup(
  map: MapLibreMap,
  position: LngLat,
  amount: number | string,
  options: MoneyPopupOptions = {},
): void {
  const text =
    typeof amount === 'number' ? `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatEuro(Math.abs(amount))}` : amount;
  const tone = options.tone ?? (typeof amount === 'number' && amount < 0 ? 'bad' : 'good');
  const duration = options.durationMs ?? 1800;
  // Die Animation läuft auf einem inneren Element: transform am Marker selbst setzt MapLibre für die Position.
  const inner = el('span', 'map-fx-money__inner');
  inner.appendChild(el('span', 'map-fx-money__value', text));
  if (options.caption) inner.appendChild(el('span', 'map-fx-money__caption', options.caption));
  const { marker, element } = addHtmlMarker(map, {
    position,
    className: `map-fx-money map-fx-money--${tone}`,
    anchor: 'bottom',
    children: [inner],
  });
  element.style.setProperty('--fx-duration', `${duration}ms`);
  window.setTimeout(() => marker.remove(), duration + 50);
}

// ---------------------------------------------------------------------------------------------
// Blaulicht

export interface BlueLightOptions {
  /** Automatisch aus nach ms. 0 oder weglassen = bis stop(). */
  durationMs?: number;
  /** Durchmesser des Lichtscheins in px, Standard 140. */
  size?: number;
  /** Beschriftung darunter, z.B. "Razzia". */
  label?: string;
}

export interface EffectHandle {
  stop(): void;
  setPosition(position: LngLat): void;
}

/** Blinkendes Blaulicht (blau/rot) mit Lichtschein, z.B. bei Razzien und Kontrollen. */
export function blueLight(map: MapLibreMap, position: LngLat, options: BlueLightOptions = {}): EffectHandle {
  const children: HTMLElement[] = [el('span', 'map-fx-bluelight__glow'), el('span', 'map-fx-bluelight__core')];
  if (options.label) children.push(el('span', 'map-fx-bluelight__label', options.label));
  const { marker, element } = addHtmlMarker(map, { position, className: 'map-fx-bluelight', children });
  element.style.setProperty('--fx-size', `${options.size ?? 140}px`);
  let timer = 0;
  const handle: EffectHandle = {
    stop() {
      window.clearTimeout(timer);
      element.classList.add('is-ending');
      window.setTimeout(() => marker.remove(), 400);
    },
    setPosition(p) {
      marker.setLngLat([p.lng, p.lat]);
    },
  };
  if (options.durationMs) timer = window.setTimeout(handle.stop, options.durationMs);
  return handle;
}

// ---------------------------------------------------------------------------------------------
// Ping und Blitz

/** Einmaliger Ring, der sich ausbreitet (z.B. neuer Kunde, Ziel markiert). */
export function ping(
  map: MapLibreMap,
  position: LngLat,
  options: { tone?: 'accent' | 'warn' | 'bad' | 'info' } = {},
): void {
  const { marker } = addHtmlMarker(map, {
    position,
    className: `map-fx-ping map-fx-ping--${options.tone ?? 'info'}`,
    children: [el('span', 'map-fx-ping__ring'), el('span', 'map-fx-ping__ring is-late')],
  });
  window.setTimeout(() => marker.remove(), 1700);
}

/** Funken, die bei einem Feuerwerk aus einem Punkt fliegen. */
const FIREWORK_SPARKS = 14;
const FIREWORK_MS = 1700;

/**
 * Ein Feuerwerk-Schlag über einem Punkt (z.B. Kölner Lichter über dem Rhein): Funken fliegen kreisförmig auseinander
 * und verglühen, nur CSS (transform und opacity). color: Farbe der Funken, size: Radius in Pixeln (Standard 46).
 * Bei "Bewegung reduzieren" passiert nichts.
 */
export function firework(map: MapLibreMap, position: LngLat, options: { color?: string; size?: number } = {}): void {
  if (reducedMotion()) return;
  const sparks = Array.from({ length: FIREWORK_SPARKS }, (_, i) => {
    const spark = el('span', 'map-fx-firework__spark');
    spark.style.setProperty('--fx-angle', `${Math.round((360 / FIREWORK_SPARKS) * i)}deg`);
    return spark;
  });
  const { marker, element } = addHtmlMarker(map, {
    position,
    className: 'map-fx-firework',
    children: [el('span', 'map-fx-firework__glow'), ...sparks],
  });
  element.style.setProperty('--fx-firework-color', options.color ?? '#f2c766');
  element.style.setProperty('--fx-firework-size', `${options.size ?? 46}px`);
  window.setTimeout(() => marker.remove(), FIREWORK_MS + 100);
}

/** Heller Blitz über der ganzen Karte (Gewitter, Schuss, Explosion). strength 0–1. */
export function flash(
  map: MapLibreMap,
  options: { color?: string; strength?: number; durationMs?: number } = {},
): void {
  if (reducedMotion()) return;
  const layer = el('div', 'map-fx-flash');
  layer.style.setProperty('--fx-flash-color', options.color ?? '#dfe8ff');
  layer.style.setProperty('--fx-flash-strength', String(options.strength ?? 0.55));
  layer.style.setProperty('--fx-duration', `${options.durationMs ?? 650}ms`);
  map.getContainer().appendChild(layer);
  window.setTimeout(() => layer.remove(), (options.durationMs ?? 650) + 50);
}

// ---------------------------------------------------------------------------------------------
// An die aktive Karte gebunden

let activeMap: MapLibreMap | null = null;

/** Wird von GameMap gesetzt. */
export function setActiveMap(map: MapLibreMap | null): void {
  activeMap = map;
}

/** Die MapLibre-Karte des laufenden Spiels (null, solange sie noch nicht steht). Für Minispiele auf der Karte. */
function currentMap(): MapLibreMap | null {
  return activeMap;
}

export { currentMap as activeMap };

/** Tageszeit an die Effekte weitergeben (Scheinwerfer, Leuchten der Hotspots). Setzt GameMap. */
export function setEffectsLook(look: Pick<MapLook, 'night'>): void {
  setHotspotNight(look.night);
  setFleetNight(look.night);
  if (activeMap) setVehicleNight(activeMap, look.night);
}

function withMap<T>(fn: (map: MapLibreMap) => T): T | null {
  return activeMap ? fn(activeMap) : null;
}

/** Effekte auf der aktiven Karte, ohne Zugriff auf das Kartenobjekt. Für onGameEvent-Reaktionen. */
export const mapEffects = {
  money: (position: LngLat, amount: number | string, options?: MoneyPopupOptions) =>
    withMap((map) => moneyPopup(map, position, amount, options)),
  blueLight: (position: LngLat, options?: BlueLightOptions) => withMap((map) => blueLight(map, position, options)),
  vehicle: (options: VehicleOptions) => withMap((map) => createVehicle(map, options)),
  animateVehicle: (options: AnimateVehicleOptions) => withMap((map) => animateVehicle(map, options)),
  ping: (position: LngLat, options?: { tone?: 'accent' | 'warn' | 'bad' | 'info' }) =>
    withMap((map) => ping(map, position, options)),
  flash: (options?: { color?: string; strength?: number; durationMs?: number }) =>
    withMap((map) => flash(map, options)),
  firework: (position: LngLat, options?: { color?: string; size?: number }) =>
    withMap((map) => firework(map, position, options)),
};
