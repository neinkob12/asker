// Überwachungs-Overlay: Scanlines, Vignette, Rahmen mit Ecken, Fadenkreuz in der Mitte und eine
// Koordinaten-Anzeige (Mausposition am Desktop, sonst Kartenmitte). Liegt über dem Luftbild, aber unter den
// Markern, fängt keine Klicks ab und lässt sich abschalten (UiState.overlay). Das Koordinatenraster ist eine
// Kartenebene (kt-grid) und wird mit ein- und ausgeblendet.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { formatDms } from './geometry';
import { el } from './markers';
import { BASE_LAYERS } from './style';

export class SurveillanceOverlay {
  readonly element: HTMLElement;
  private readonly coords: HTMLElement;
  private readonly camera: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly label: HTMLElement;
  private pointer: { lng: number; lat: number } | null = null;
  private frame = 0;
  private enabled = true;

  constructor(private readonly map: MapLibreMap) {
    this.element = el('div', 'map-surveillance');
    this.element.setAttribute('aria-hidden', 'true');
    for (const part of ['scanlines', 'vignette', 'reticle'])
      this.element.appendChild(el('div', `map-surveillance__${part}`));
    const frame = el('div', 'map-surveillance__frame');
    for (const corner of ['tl', 'tr', 'bl', 'br'])
      frame.appendChild(el('span', `map-surveillance__corner is-${corner}`));
    this.element.appendChild(frame);

    const readout = el('div', 'map-surveillance__readout');
    const rec = el('span', 'map-surveillance__rec', 'REC');
    this.label = el('span', 'map-surveillance__label', 'CAM 01 · KÖLN');
    this.clock = el('span', 'map-surveillance__clock');
    this.coords = el('span', 'map-surveillance__coords');
    this.camera = el('span', 'map-surveillance__camera');
    readout.append(rec, this.label, this.clock, this.coords, this.camera);
    this.element.appendChild(readout);

    // Direkt über dem Karten-Canvas, vor den Markern (die hängen später im selben Container).
    const container = map.getCanvasContainer();
    container.insertBefore(this.element, map.getCanvas().nextSibling);

    map.on('move', () => this.schedule());
    map.on('mousemove', (e) => {
      this.pointer = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      this.schedule();
    });
    map.getCanvas().addEventListener('mouseleave', () => {
      this.pointer = null;
      this.schedule();
    });
    this.render();
  }

  /** An- oder abschalten. force: auch ohne Änderung neu setzen (z.B. nachdem der Kartenstil geladen ist). */
  setEnabled(enabled: boolean, force = false): void {
    if (enabled === this.enabled && !force) return;
    this.enabled = enabled;
    this.element.hidden = !enabled;
    if (this.map.getLayer(BASE_LAYERS.grid)) {
      this.map.setLayoutProperty(BASE_LAYERS.grid, 'visibility', enabled ? 'visible' : 'none');
    }
    if (enabled) this.schedule();
  }

  /** Zeitstempel in der Anzeige, z.B. "FR 21:34 · TAG 3". */
  setClock(text: string): void {
    if (this.clock.textContent !== text) this.clock.textContent = text;
  }

  /** Kamerabezeichnung, z.B. nach Ansicht (Köln/Europa). */
  setLabel(text: string): void {
    if (this.label.textContent !== text) this.label.textContent = text;
  }

  private schedule(): void {
    if (this.frame || !this.enabled) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render(): void {
    const p = this.pointer ?? this.map.getCenter();
    this.coords.textContent = `${formatDms(p.lat, 'lat')}  ${formatDms(p.lng, 'lng')}`;
    const bearing = Math.round((this.map.getBearing() + 360) % 360);
    this.camera.textContent = `Z${this.map.getZoom().toFixed(1)}  HDG ${String(bearing).padStart(3, '0')}°  TLT ${Math.round(this.map.getPitch())}°`;
  }
}
