// Effekt-Werkzeuge für Module und Integration: Geld-Popups, Blaulicht, Fahrzeuge entlang einer Linie,
// Figuren an Spots, Ping und Blitz. Beschreibung und Beispiele: src/map/README.md.
//
// Jede Funktion gibt es zweimal:
//   - mit Karte als erstem Argument, z.B. moneyPopup(ctx.map, pos, 450) in einem Karten-Layer
//   - gebunden an die aktive Karte über mapEffects, z.B. mapEffects.money(pos, 450) in onGameEvent-Reaktionen
//     (tut nichts und gibt null zurück, solange keine Karte da ist)
// Effekte sind reine Optik: Sie lesen den Spielzustand nicht und ändern ihn nie.

import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { formatEuro, type LngLat } from '../core';
import { ICONS } from '../ui/components/icons';
import { offsetAround, pointAlong } from './geometry';
import { addHtmlMarker, el } from './markers';

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
// Fahrzeuge

export type VehicleKind = 'car' | 'van' | 'truck' | 'police' | 'courier';

export interface VehicleOptions {
  /** Strecke als Punkte (mindestens 2). Luftlinie oder echte Route. */
  path: LngLat[];
  kind?: VehicleKind;
  /** Kurzer Text über dem Fahrzeug, z.B. "500 g". */
  label?: string;
  /** Eigene Karosseriefarbe (CSS-Farbe), z.B. die Farbe einer Gang. */
  color?: string;
  title?: string;
  onClick?: () => void;
}

export interface VehicleHandle {
  readonly element: HTMLElement;
  readonly marker: Marker;
  /** Position auf der Strecke, 0 = Start, 1 = Ziel. Z.B. aus dem Lieferfortschritt der Simulation. */
  setProgress(t: number): void;
  setPath(path: LngLat[]): void;
  setLabel(label: string): void;
  remove(): void;
}

/** Fahrzeug, das flach auf der Karte liegt und in Fahrtrichtung zeigt. Bewegen mit setProgress(t). */
export function createVehicle(map: MapLibreMap, options: VehicleOptions): VehicleHandle {
  let path = options.path;
  const body = el('span', 'map-fx-vehicle__body');
  body.append(el('span', 'map-fx-vehicle__beam'), el('span', 'map-fx-vehicle__roof'));
  if (options.kind === 'police') body.appendChild(el('span', 'map-fx-vehicle__siren'));
  if (options.color) body.style.setProperty('--fx-vehicle-color', options.color);
  const label = el('span', 'map-fx-vehicle__label', options.label ?? '');
  label.hidden = !options.label;
  const start = pointAlong(path, 0);
  const { marker, element } = addHtmlMarker(map, {
    position: start.position,
    className: `map-fx-vehicle map-fx-vehicle--${options.kind ?? 'van'}`,
    children: [body],
    alignment: 'map',
    rotation: start.bearing,
    tag: options.onClick ? 'button' : 'div',
    onClick: options.onClick,
    title: options.title,
  });
  // Das Label steht aufrecht über dem Fahrzeug, als eigener Marker.
  const labelMarker = addHtmlMarker(map, {
    position: start.position,
    className: 'map-fx-vehicle-tag',
    anchor: 'bottom',
    children: [label],
  });
  labelMarker.element.hidden = !options.label;
  return {
    element,
    marker,
    setProgress(t) {
      const p = pointAlong(path, t);
      marker.setLngLat([p.position.lng, p.position.lat]);
      marker.setRotation(p.bearing);
      labelMarker.marker.setLngLat([p.position.lng, p.position.lat]);
    },
    setPath(next) {
      path = next;
    },
    setLabel(text) {
      label.textContent = text;
      label.hidden = !text;
      labelMarker.element.hidden = !text;
    },
    remove() {
      marker.remove();
      labelMarker.marker.remove();
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
    vehicle.setProgress(Math.min(1, t));
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

// ---------------------------------------------------------------------------------------------
// Figuren

export type FigureRole = 'player' | 'dealer' | 'runner' | 'courier' | 'customer' | 'gang' | 'police' | 'staff';
export type FigureState = 'idle' | 'active' | 'busy' | 'alert' | 'down';

export interface FigureOptions {
  position: LngLat;
  name?: string;
  role?: FigureRole;
  state?: FigureState;
  /** Eigene Farbe (CSS-Farbe), z.B. die einer Gang. */
  color?: string;
  title?: string;
  onClick?: () => void;
}

export interface FigureHandle {
  readonly element: HTMLElement;
  readonly marker: Marker;
  setPosition(position: LngLat): void;
  setName(name: string): void;
  setState(state: FigureState): void;
  setColor(color: string | null): void;
  remove(): void;
}

function silhouette(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'map-fx-figure__icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS.user) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** Figur (Person) an einem Ort, z.B. Läufer oder Kunden an einem Spot. */
export function addFigure(map: MapLibreMap, options: FigureOptions): FigureHandle {
  const token = el('span', 'map-fx-figure__token');
  token.appendChild(silhouette());
  const name = el('span', 'map-fx-figure__name', options.name ?? '');
  name.hidden = !options.name;
  const { marker, element } = addHtmlMarker(map, {
    position: options.position,
    className: `map-fx-figure map-fx-figure--${options.role ?? 'staff'}`,
    anchor: 'bottom',
    children: [token, name],
    tag: options.onClick ? 'button' : 'div',
    onClick: options.onClick,
    title: options.title ?? options.name,
  });
  element.dataset.state = options.state ?? 'idle';
  if (options.color) element.style.setProperty('--fx-figure-color', options.color);
  return {
    element,
    marker,
    setPosition(p) {
      marker.setLngLat([p.lng, p.lat]);
    },
    setName(text) {
      name.textContent = text;
      name.hidden = !text;
    },
    setState(state) {
      element.dataset.state = state;
    },
    setColor(color) {
      if (color) element.style.setProperty('--fx-figure-color', color);
      else element.style.removeProperty('--fx-figure-color');
    },
    remove() {
      marker.remove();
    },
  };
}

/** Mehrere Figuren im Kreis um einen Spot (Abstand in Metern). */
export function addFiguresAt(
  map: MapLibreMap,
  center: LngLat,
  figures: Omit<FigureOptions, 'position'>[],
  meters = 16,
): FigureHandle[] {
  return figures.map((f, i) => addFigure(map, { ...f, position: offsetAround(center, i, figures.length, meters) }));
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
  figure: (options: FigureOptions) => withMap((map) => addFigure(map, options)),
  figuresAt: (center: LngLat, figures: Omit<FigureOptions, 'position'>[], meters?: number) =>
    withMap((map) => addFiguresAt(map, center, figures, meters)),
  ping: (position: LngLat, options?: { tone?: 'accent' | 'warn' | 'bad' | 'info' }) =>
    withMap((map) => ping(map, position, options)),
  flash: (options?: { color?: string; strength?: number; durationMs?: number }) =>
    withMap((map) => flash(map, options)),
};
