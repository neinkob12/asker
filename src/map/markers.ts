// Hilfen für HTML-Marker auf der Karte, auch im Überwachungsstil (Zielkreuz, Label-Kasten).

import { type Map as MapLibreMap, Marker } from 'maplibre-gl';
import './map.css';
import type { LngLat } from '../core';

export interface HtmlMarkerOptions {
  position: LngLat;
  /** CSS-Klasse des Marker-Elements. */
  className: string;
  /** Inhalt als DOM-Knoten (Texte nie als HTML-String einsetzen). */
  children?: Node[];
  anchor?: 'center' | 'bottom' | 'top' | 'left' | 'right';
  /** Element-Typ, Standard 'div'. Klickbare Marker als 'button'. */
  tag?: 'div' | 'button';
  onClick?: () => void;
  title?: string;
  /** 'map': liegt flach auf der Karte und dreht sich mit (z.B. Fahrzeuge). Standard: zum Bildschirm. */
  alignment?: 'map' | 'viewport';
  /** Drehung in Grad (mit alignment 'map' relativ zu Norden). */
  rotation?: number;
  /**
   * Nur in der Stadt: weit herausgezoomt (Deutschland-Ansicht, Zoom unter FAR_ZOOM) ausgeblendet, damit Spots, Lager
   * und Gangs nicht über den Stadt-Karten liegen (Klasse map-near, GameMap setzt is-far).
   */
  near?: boolean;
}

/** Marker mit eigenem HTML-Element anlegen und zur Karte hinzufügen. */
export function addHtmlMarker(map: MapLibreMap, options: HtmlMarkerOptions): { marker: Marker; element: HTMLElement } {
  const element = document.createElement(options.tag ?? 'div');
  element.className = options.near ? `${options.className} map-near` : options.className;
  if (options.tag === 'button') (element as HTMLButtonElement).type = 'button';
  if (options.title) element.title = options.title;
  for (const child of options.children ?? []) element.appendChild(child);
  if (options.onClick) {
    const onClick = options.onClick;
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  const marker = new Marker({
    element,
    anchor: options.anchor ?? 'center',
    rotation: options.rotation ?? 0,
    rotationAlignment: options.alignment ?? 'viewport',
    pitchAlignment: options.alignment ?? 'viewport',
  })
    .setLngLat([options.position.lng, options.position.lat])
    .addTo(map);
  return { marker, element };
}

/** Text eines Elements setzen, aber nur, wenn er sich ändert (textContent ersetzt sonst jedes Mal den Knoten). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Kleines DOM-Element mit Klasse und Text. */
export function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export type MarkerTone = 'accent' | 'warn' | 'bad' | 'info' | 'neutral';

export interface TargetMarkerOptions {
  position: LngLat;
  label: string;
  /** Zweite Zeile im Label-Kasten, z.B. "3 Kunden" oder "Heat 40". */
  sublabel?: string;
  tone?: MarkerTone;
  onClick?: () => void;
  title?: string;
  /** Zusätzliche Klasse, z.B. für eigene Farben. */
  className?: string;
}

export interface TargetMarker {
  marker: Marker;
  element: HTMLElement;
  setLabel(label: string, sublabel?: string): void;
  setTone(tone: MarkerTone): void;
  /** Hervorheben (z.B. ausgewählt): Zielkreuz schließt sich. */
  setActive(active: boolean): void;
  setPosition(position: LngLat): void;
  remove(): void;
}

/**
 * Marker im Überwachungsstil: Zielkreuz mit Ring und daneben ein Label-Kasten mit Ecken.
 * Für Orte, Ziele und Verdächtige. Farben über tone (Tokens).
 */
export function addTargetMarker(map: MapLibreMap, options: TargetMarkerOptions): TargetMarker {
  const reticle = el('span', 'map-target__reticle');
  const box = el('span', 'map-target__box');
  const label = el('span', 'map-target__label', options.label);
  const sub = el('span', 'map-target__sub', options.sublabel ?? '');
  box.append(label, sub);
  const { marker, element } = addHtmlMarker(map, {
    position: options.position,
    className: `map-target map-target--${options.tone ?? 'info'} ${options.className ?? ''}`,
    children: [reticle, box],
    tag: options.onClick ? 'button' : 'div',
    onClick: options.onClick,
    title: options.title,
  });
  sub.hidden = !options.sublabel;
  return {
    marker,
    element,
    setLabel(text, subtext) {
      label.textContent = text;
      sub.textContent = subtext ?? '';
      sub.hidden = !subtext;
    },
    setTone(tone) {
      for (const t of ['accent', 'warn', 'bad', 'info', 'neutral'])
        element.classList.toggle(`map-target--${t}`, t === tone);
    },
    setActive(active) {
      element.classList.toggle('is-active', active);
    },
    setPosition(position) {
      marker.setLngLat([position.lng, position.lat]);
    },
    remove() {
      marker.remove();
    },
  };
}
