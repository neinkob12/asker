// Die Grundkarte: MapLibre im Candy-Look, vier Tageszeit-Paletten nach der Spieluhr, Stimmung der Module
// (z.B. Wetter), Regen und Schnee, Überwachungs-Overlay (Standard aus), Kamera 3D/2D, Köln/Europa und die
// angemeldeten Layer der Module.

import { type GeoJSONSource, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { clock, type GameState, type LngLat } from '../core';
import type { CameraMode, MapController, UiApi, UiState } from '../ui/runtime';
import { currentMood } from './atmosphere';
import { EUROPA_VIEW, isMobile, KOELN_CENTER, koelnZoom } from './config';
import { setActiveMap, setEffectsLook } from './effects';
import { landmarkFeatures } from './landmarks';
import { computeLook, type MapLook } from './look';
import { addHtmlMarker, el } from './markers';
import { SurveillanceOverlay } from './overlay';
import { PrecipitationLayer } from './precipitation';
import { type MapLayerInstance, mapLayers } from './registry';
import { BASE_LAYERS, baseStyle, LANDMARK_SOURCE } from './style';

setWorkerUrl(workerUrl);

const KOELN_PITCH = 50;
const KOELN_BEARING = -20;
const MAX_PIXEL_RATIO = 1.5;

type PaintValue = string | number;

export class GameMap implements MapController {
  readonly map: MapLibreMap;
  private readonly instances: MapLayerInstance[] = [];
  private picking: ((result: LngLat | null) => void) | null = null;
  private loaded = false;
  private lastUi: UiState | null = null;
  private readonly overlay: SurveillanceOverlay;
  private readonly precipitation: PrecipitationLayer;
  private readonly applied = new Map<string, PaintValue>();
  private landmarkNight = -1;
  private lastLight = '';
  private lastSky = '';
  private cameraMode: CameraMode = '3d';
  private view: 'koeln' | 'europa' = 'koeln';

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
      fadeDuration: 200,
      // Retina-Bildschirme zeichnen sonst mit doppelter Auflösung. Das kostet viel Grafikspeicher, und Safari
      // lädt die Seite neu, wenn er ausgeht (weißer Bildschirm).
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    });
    this.map.on('webglcontextlost', () => ui.toast('Die Karte wird neu aufgebaut …', 'info'));
    this.overlay = new SurveillanceOverlay(this.map);
    this.precipitation = new PrecipitationLayer(this.map.getCanvasContainer(), this.overlay.element);
    this.applyPadding();
    window.addEventListener('resize', () => this.applyPadding());
    this.map.on('zoom', () => container.classList.toggle('zoomed-out', this.map.getZoom() < 10));
    this.map.on('click', (e) => {
      if (!this.picking) return;
      const resolve = this.picking;
      // Erst nach den Klick-Handlern der Layer auflösen: Die sehen so noch isPicking() === true und
      // öffnen beim Platzieren keine Panels.
      queueMicrotask(() => {
        if (this.picking !== resolve) return;
        this.picking = null;
        container.classList.remove('is-picking');
        resolve({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });
    });
    // Schon nach dem Stil, nicht erst nach den Kacheln ('load'): Sind die Kacheln nicht erreichbar, bleiben
    // Spots, Lager und Fahrzeuge trotzdem bedienbar.
    this.map.on('style.load', () => this.mountLayers());
    this.map.on('load', () => this.mountLayers());
    this.bindLandmarkHover();
    setActiveMap(this.map);
  }

  destroy(): void {
    for (const instance of this.instances) instance.destroy?.();
    this.precipitation.destroy();
    setActiveMap(null);
    this.map.remove();
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
    // Stil ist jetzt da: Look neu setzen (vorher gesetzte Werte gelten für den Stil vor dem Laden).
    this.applied.clear();
    this.lastLight = '';
    this.lastSky = '';
    this.landmarkNight = -1;
    if (this.lastUi) this.overlay.setEnabled(this.lastUi.overlay, true);
    const state = this.getState();
    if (state && this.lastUi) this.update(state, this.lastUi);
  }

  /** Nach jedem Neuzeichnen der UI. */
  update(state: GameState, ui: UiState): void {
    this.lastUi = ui;
    if (ui.camera !== this.cameraMode) this.setCameraMode(ui.camera);
    this.overlay.setEnabled(ui.overlay);
    this.overlay.setClock(
      `${clock.weekdayName(state.time, true).toUpperCase()} ${clock.formatTime(state.time)} · TAG ${clock.day(state.time)}`,
    );
    this.overlay.setLabel(this.view === 'europa' ? 'SAT 02 · EUROPA' : 'CAM 01 · KÖLN');
    for (const instance of this.instances) instance.update?.(state, ui);
    // Nach den Layern: die setzen Stimmung und Niederschlag (z.B. das Wetter).
    if (this.loaded) this.applyLook(state);
    this.precipitation.sync();
  }

  /** Tageszeit und Stimmung auf die Kartenebenen übertragen. Setzt nur, was sich geändert hat. */
  private applyLook(state: GameState): void {
    const look = computeLook(clock.minuteOfDay(state.time) + (state.time % 1), currentMood());
    const L = BASE_LAYERS;
    this.paint(L.land, 'background-color', look.land);
    for (const id of [L.farmland, L.park, L.green, `${L.green}-landuse`]) this.paint(id, 'fill-color', look.park);
    this.paint(L.wood, 'fill-color', look.wood);
    this.paint(L.water, 'fill-color', look.water);
    this.paint(L.waterLine, 'line-color', look.waterLine);
    this.paint(L.waterway, 'line-color', look.water);
    this.paint(L.rail, 'line-color', look.rail);
    this.paint(L.roadGlow, 'line-color', look.majorCasing);
    this.paint(L.roadGlow, 'line-opacity', look.glow);
    this.paint(L.minorCasing, 'line-color', look.minorCasing);
    this.paint(L.minor, 'line-color', look.minor);
    this.paint(L.majorCasing, 'line-color', look.majorCasing);
    this.paint(L.major, 'line-color', look.major);
    this.paint(L.highwayCasing, 'line-color', look.highwayCasing);
    this.paint(L.highway, 'line-color', look.highway);
    this.paint(L.bridgeCasing, 'line-color', look.highwayCasing);
    this.paint(L.bridge, 'line-color', look.highway);
    for (const id of [L.buildingShadow, L.landmarkShadow]) {
      this.paint(id, 'fill-color', look.shadow);
      this.paint(id, 'fill-opacity', look.shadowOpacity);
    }
    L.buildings.forEach((id, i) => {
      this.paint(id, 'fill-extrusion-color', look.buildings[i]);
    });
    this.applyLandmarks(look);
    this.applyLightAndSky(look);
    setEffectsLook(look);
  }

  private paint(layer: string, property: string, value: PaintValue): void {
    const key = `${layer}|${property}`;
    if (this.applied.get(key) === value) return;
    if (!this.map.getLayer(layer)) return;
    this.map.setPaintProperty(layer, property as Parameters<MapLibreMap['setPaintProperty']>[1], value);
    this.applied.set(key, value);
  }

  /** Wahrzeichen-Farben wandern mit der Dunkelheit (in kleinen Schritten, die Quelle ist winzig). */
  private applyLandmarks(look: MapLook): void {
    const night = Math.round(look.night * 20) / 20;
    if (night === this.landmarkNight) return;
    const source = this.map.getSource(LANDMARK_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(landmarkFeatures(night));
    this.landmarkNight = night;
  }

  /** Name des Wahrzeichens beim Überfahren mit der Maus. */
  private bindLandmarkHover(): void {
    const label = el('span', 'map-hover-label__text');
    const { marker, element } = addHtmlMarker(this.map, {
      position: KOELN_CENTER,
      className: 'map-hover-label',
      anchor: 'bottom',
      children: [label],
    });
    element.hidden = true;
    let current = '';
    this.map.on('mousemove', BASE_LAYERS.landmarks, (e) => {
      const feature = e.features?.[0];
      const name = typeof feature?.properties?.name === 'string' ? feature.properties.name : '';
      if (!name) return;
      marker.setLngLat(e.lngLat);
      if (name === current) return;
      current = name;
      label.textContent = name;
      element.hidden = false;
    });
    this.map.on('mouseleave', BASE_LAYERS.landmarks, () => {
      current = '';
      element.hidden = true;
    });
  }

  private applyLightAndSky(look: MapLook): void {
    const light = `${look.light}|${look.lightIntensity}`;
    if (light !== this.lastLight) {
      this.map.setLight({
        anchor: 'map',
        color: look.light,
        intensity: look.lightIntensity,
        position: [1.15, 210, 35],
      });
      this.lastLight = light;
    }
    const sky = `${look.sky}|${look.horizon}|${look.fog}|${look.fogBlend}`;
    if (sky !== this.lastSky) {
      this.map.setSky({
        'sky-color': look.sky,
        'horizon-color': look.horizon,
        'fog-color': look.fog,
        'fog-ground-blend': look.fogBlend,
        'horizon-fog-blend': 0.6,
        'sky-horizon-blend': 0.7,
        'atmosphere-blend': 0,
      });
      this.lastSky = sky;
    }
  }

  // Seitenleiste und HUD liegen über der Karte, also soll die Kamera auf den freien Bereich zentrieren.
  private applyPadding(): void {
    this.map.setPadding(
      isMobile()
        ? { top: 130, bottom: window.innerHeight * 0.14, left: 0, right: 0 }
        : { top: 90, bottom: 0, left: 0, right: 364 },
    );
  }

  private koelnCamera() {
    return this.cameraMode === '2d' ? { pitch: 0, bearing: 0 } : { pitch: KOELN_PITCH, bearing: KOELN_BEARING };
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    const handlers = [this.map.dragRotate, this.map.touchPitch, this.map.keyboard];
    if (mode === '2d') {
      for (const h of handlers) h.disable();
      this.map.touchZoomRotate.disableRotation();
      this.map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    } else {
      for (const h of handlers) h.enable();
      this.map.touchZoomRotate.enableRotation();
      if (this.view === 'koeln') this.map.easeTo({ pitch: KOELN_PITCH, bearing: KOELN_BEARING, duration: 900 });
    }
    this.container.classList.toggle('is-2d', mode === '2d');
  }

  flyToKoeln(): void {
    this.view = 'koeln';
    this.map.flyTo({
      center: [KOELN_CENTER.lng, KOELN_CENTER.lat],
      zoom: koelnZoom(),
      ...this.koelnCamera(),
      duration: 2500,
    });
  }

  flyToEuropa(): void {
    this.view = 'europa';
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

  zoomIn(): void {
    this.map.zoomIn({ duration: 300 });
  }

  zoomOut(): void {
    this.map.zoomOut({ duration: 300 });
  }

  resetNorth(): void {
    this.map.easeTo({ bearing: 0, duration: 500 });
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
