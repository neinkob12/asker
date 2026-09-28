// Hilfen für HTML-Marker auf der Karte.

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
}

/** Marker mit eigenem HTML-Element anlegen und zur Karte hinzufügen. */
export function addHtmlMarker(map: MapLibreMap, options: HtmlMarkerOptions): { marker: Marker; element: HTMLElement } {
  const element = document.createElement(options.tag ?? 'div');
  element.className = options.className;
  if (options.title) element.title = options.title;
  for (const child of options.children ?? []) element.appendChild(child);
  if (options.onClick) {
    const onClick = options.onClick;
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  const marker = new Marker({ element, anchor: options.anchor ?? 'center' })
    .setLngLat([options.position.lng, options.position.lat])
    .addTo(map);
  return { marker, element };
}

/** Kleines DOM-Element mit Klasse und Text. */
export function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
