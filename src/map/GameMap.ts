// Die Grundkarte: MapLibre im Nacht-Satelliten-Look, Tag und Nacht nach der Spieluhr, Stimmung der Module
// (z.B. Wetter), Regen und Schnee, Überwachungs-Overlay, Kamera 3D/2D, Köln/Europa und die angemeldeten
// Layer der Module.

import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { clock, type GameState, type LngLat } from '../core';
import type { CameraMode, MapController, UiApi, UiState } from '../ui/runtime';
import { currentMood } from './atmosphere';
import { EUROPA_VIEW, isMobile, KOELN_CENTER, koelnZoom } from './config';
import { daylightAt, twilight } from './daylight';
import { setActiveMap } from './effects';
import { computeLook, type MapLook } from './look';
import { SurveillanceOverlay } from './overlay';
import { PrecipitationLayer } from './precipitation';
import { type MapLayerInstance, mapLayers } from './registry';
import { BASE_LAYERS, baseStyle, WINDOWS_IMAGE } from './style';
import { drawWindows, WINDOWS_PIXEL_RATIO } from './windows';

setWorkerUrl(workerUrl);

const KOELN_PITCH = 55;
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
  private windows: { wall: string; lit: number } | null = null;
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
    // Fenstermuster sofort anlegen, damit die Gebäude es beim ersten Zeichnen finden.
    const first = computeLook(0, 0);
    this.updateWindows(first.wallColor, first.windowsLit);
    this.map.on('styleimagemissing', (e) => {
      if (e.id === WINDOWS_IMAGE) this.updateWindows(first.wallColor, first.windowsLit);
    });
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
    this.map.on('load', () => this.mountLayers());
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

  /** Tag/Nacht und Stimmung auf die Kartenebenen übertragen. Setzt nur, was sich geändert hat. */
  private applyLook(state: GameState): void {
    const minute = clock.minuteOfDay(state.time);
    const look = computeLook(daylightAt(state.time), twilight(minute), currentMood());
    const L = BASE_LAYERS;
    this.paint(L.satellite, 'raster-brightness-max', look.rasterBrightnessMax);
    this.paint(L.satellite, 'raster-brightness-min', look.rasterBrightnessMin);
    this.paint(L.satellite, 'raster-saturation', look.rasterSaturation);
    this.paint(L.satellite, 'raster-contrast', look.rasterContrast);
    this.paint(L.tint, 'fill-color', look.tintColor);
    this.paint(L.tint, 'fill-opacity', look.tintOpacity);
    this.paint(L.water, 'fill-color', look.waterColor);
    this.paint(L.water, 'fill-opacity', look.waterOpacity);
    this.paint(L.roadsGlow, 'line-color', look.roadColor);
    this.paint(L.roadsGlow, 'line-opacity', look.roadGlowOpacity);
    this.paint(L.roadsCore, 'line-color', look.roadColor);
    this.paint(L.roadsCore, 'line-opacity', look.roadCoreOpacity);
    this.paint(L.lamps, 'line-opacity', look.lampOpacity);
    this.paint(L.buildings, 'fill-extrusion-opacity', look.buildingOpacity);
    this.applyWindows(look);
    this.applyLightAndSky(look);
  }

  private paint(layer: string, property: string, value: PaintValue): void {
    const key = `${layer}|${property}`;
    if (this.applied.get(key) === value) return;
    if (!this.map.getLayer(layer)) return;
    this.map.setPaintProperty(layer, property as Parameters<MapLibreMap['setPaintProperty']>[1], value);
    this.applied.set(key, value);
  }

  private applyWindows(look: MapLook): void {
    const w = this.windows;
    // Das Muster neu zu zeichnen kostet etwas, also nur bei spürbarer Änderung.
    if (w && Math.abs(w.lit - look.windowsLit) < 0.04 && colorDistance(w.wall, look.wallColor) < 6) return;
    this.updateWindows(look.wallColor, look.windowsLit);
  }

  private updateWindows(wall: string, lit: number): void {
    const image = drawWindows(wall, lit);
    if (!image) return;
    if (this.map.hasImage(WINDOWS_IMAGE)) this.map.updateImage(WINDOWS_IMAGE, image);
    else this.map.addImage(WINDOWS_IMAGE, image, { pixelRatio: WINDOWS_PIXEL_RATIO });
    this.windows = { wall, lit };
  }

  private applyLightAndSky(look: MapLook): void {
    const light = `${look.lightColor}|${look.lightIntensity}`;
    if (light !== this.lastLight) {
      this.map.setLight({
        anchor: 'map',
        color: look.lightColor,
        intensity: look.lightIntensity,
        position: [1.3, 200, 35],
      });
      this.lastLight = light;
    }
    const sky = `${look.skyColor}|${look.horizonColor}|${look.fogColor}|${look.fogBlend}`;
    if (sky !== this.lastSky) {
      this.map.setSky({
        'sky-color': look.skyColor,
        'horizon-color': look.horizonColor,
        'fog-color': look.fogColor,
        'fog-ground-blend': look.fogBlend,
        'horizon-fog-blend': 0.7,
        'sky-horizon-blend': 0.6,
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

function colorDistance(a: string, b: string): number {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  let d = 0;
  for (const shift of [16, 8, 0]) d += Math.abs(((pa >> shift) & 255) - ((pb >> shift) & 255));
  return d;
}
