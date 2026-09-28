// Die Grundkarte: MapLibre mit Stil, Kamera, Umschalten Köln/Europa und den angemeldeten Layern der Module.

import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GameState, LngLat } from '../core';
import type { MapController, UiApi, UiState } from '../ui/runtime';
import { EUROPA_VIEW, isMobile, KOELN_CENTER, koelnZoom } from './config';
import { type MapLayerInstance, mapLayers } from './registry';
import { baseStyle } from './style';

setWorkerUrl(workerUrl);

const KOELN_PITCH = 55;
const KOELN_BEARING = -20;

export class GameMap implements MapController {
  readonly map: MapLibreMap;
  private readonly instances: MapLayerInstance[] = [];
  private picking: ((result: LngLat | null) => void) | null = null;
  private loaded = false;
  private lastUi: UiState | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly ui: UiApi,
    private readonly getState: () => GameState | null,
  ) {
    this.map = new MapLibreMap({
      container,
      style: baseStyle,
      center: [KOELN_CENTER.lng, KOELN_CENTER.lat],
      zoom: koelnZoom(),
      pitch: KOELN_PITCH,
      bearing: KOELN_BEARING,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    this.map.addControl(new NavigationControl({ visualizePitch: true }), 'top-left');
    this.applyPadding();
    window.addEventListener('resize', () => this.applyPadding());
    this.map.on('zoom', () => container.classList.toggle('zoomed-out', this.map.getZoom() < 10));
    this.map.on('click', (e) => {
      if (!this.picking) return;
      const resolve = this.picking;
      this.picking = null;
      container.classList.remove('is-picking');
      resolve({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
    this.map.on('load', () => this.mountLayers());
  }

  private mountLayers(): void {
    if (this.loaded) return;
    this.loaded = true;
    for (const layer of mapLayers()) {
      try {
        this.instances.push(
          layer.mount({
            map: this.map,
            ui: this.ui,
            getState: this.getState,
            isPicking: () => this.picking !== null,
          }),
        );
      } catch (error) {
        console.error(`Karten-Layer ${layer.id} konnte nicht geladen werden`, error);
      }
    }
    const state = this.getState();
    if (state && this.lastUi) this.update(state, this.lastUi);
  }

  /** Nach jedem Neuzeichnen der UI. */
  update(state: GameState, ui: UiState): void {
    this.lastUi = ui;
    for (const instance of this.instances) instance.update?.(state, ui);
  }

  // Die Seitenleiste liegt über der Karte, also soll die Kamera auf den freien Bereich zentrieren.
  private applyPadding(): void {
    this.map.setPadding(
      isMobile()
        ? { top: 190, bottom: window.innerHeight * 0.15, left: 0, right: 0 }
        : { top: 80, bottom: 0, left: 0, right: 344 },
    );
  }

  flyToKoeln(): void {
    this.map.flyTo({
      center: [KOELN_CENTER.lng, KOELN_CENTER.lat],
      zoom: koelnZoom(),
      pitch: KOELN_PITCH,
      bearing: KOELN_BEARING,
      duration: 2500,
    });
  }

  flyToEuropa(): void {
    this.map.flyTo({
      center: [EUROPA_VIEW.center.lng, EUROPA_VIEW.center.lat],
      zoom: EUROPA_VIEW.zoom,
      pitch: 0,
      bearing: 0,
      duration: 2500,
    });
  }

  flyTo(target: LngLat, zoom?: number): void {
    this.map.flyTo({ center: [target.lng, target.lat], zoom: zoom ?? this.map.getZoom(), duration: 1200 });
  }

  pickLocation(): Promise<LngLat | null> {
    this.cancelPick();
    this.container.classList.add('is-picking');
    return new Promise((resolve) => {
      this.picking = resolve;
    });
  }

  cancelPick(): void {
    if (!this.picking) return;
    const resolve = this.picking;
    this.picking = null;
    this.container.classList.remove('is-picking');
    resolve(null);
  }
}
