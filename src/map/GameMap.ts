// Die Grundkarte: MapLibre im gedämpften Look, vier Tageszeit-Paletten nach der Spieluhr, Stimmung der Module
// (z.B. Wetter), Regen und Schnee, Überwachungs-Overlay (Standard aus), Kamera 3D/2D, Köln/Europa und die
// angemeldeten Layer der Module.

import { type GeoJSONSource, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { clock, type GameState, type LngLat } from '../core';
import type { CameraMode, MapCamera, MapController, UiApi, UiState } from '../ui/runtime';
import { setMotionSpeed } from './animation';
import { currentMood } from './atmosphere';
import { EUROPA_VIEW, FAR_ZOOM, isMobile, KOELN_CENTER, KOELN_VIEW, koelnZoom } from './config';
import { setActiveMap, setEffectsLook } from './effects';
import { landmarkFeatures } from './landmarks';
import { computeLook, type MapLook } from './look';
import { addHtmlMarker, el } from './markers';
import { SurveillanceOverlay } from './overlay';
import { mapPerf } from './perf';
import { PrecipitationLayer } from './precipitation';
import { type MapLayerInstance, mapLayers } from './registry';
import { BASE_LAYERS, baseStyle, LANDMARK_SOURCE } from './style';

setWorkerUrl(workerUrl);

/** Schräge Kamera in der Stadt (Köln; andere Städte bringen eigene Werte über ihre Kamera mit). */
const KOELN_PITCH = 50;
const KOELN_BEARING = -20;
/** Straßennetz, Wasserwege und Autobahn-Zufahrten kommen aus Overture Maps (abgeleitet von OpenStreetMap, ODbL). */
export const ATTRIBUTION = '©\u00a0OpenStreetMap-Mitwirkende, Overture Maps Foundation';
const MAX_PIXEL_RATIO = 1.5;

type PaintValue = string | number;

export class GameMap implements MapController {
  readonly map: MapLibreMap;
  private readonly instances: { id: string; instance: MapLayerInstance }[] = [];
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
  /** Ansicht: 'city:<id>' (schräg, Stadt), 'deutschland' oder 'europa' (Draufsicht). */
  private view = 'city:koeln';
  private viewLabel = 'CAM 01 · KÖLN';
  /** Zählt Befehle und neue Spiele (invalidate), damit update() erkennt, ob sich etwas geändert hat. */
  private revision = 0;
  private lastKey = '';
  private lastState: GameState | null = null;
  private lastPanel: UiState['panel'] = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly ui: UiApi,
    private readonly getState: () => GameState | null,
  ) {
    this.map = new MapLibreMap({
      container,
      style: baseStyle,
      center: [KOELN_VIEW.lng, KOELN_VIEW.lat],
      zoom: koelnZoom(),
      pitch: KOELN_PITCH,
      bearing: KOELN_BEARING,
      maxPitch: 75,
      // Quellenangabe unten rechts: Kacheln aus dem Stil, dazu Straßen, Flüsse und Wege aus Overture (Auftrag 31).
      attributionControl: { compact: true, customAttribution: ATTRIBUTION },
      fadeDuration: 200,
      // Retina-Bildschirme zeichnen sonst mit doppelter Auflösung. Das kostet viel Grafikspeicher, und Safari
      // lädt die Seite neu, wenn er ausgeht (weißer Bildschirm).
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    });
    this.map.on('webglcontextlost', () => ui.toast('Die Karte wird neu aufgebaut …', 'info'));
    this.overlay = new SurveillanceOverlay(this.map);
    this.precipitation = new PrecipitationLayer(this.map.getCanvasContainer(), this.overlay.element);
    this.applyPadding();
    window.addEventListener('resize', () => {
      this.padRight = -1;
      this.applyPadding();
    });
    // Weit draußen: Marker der Stadt aus (zoomed-out ab 10: Schilder und Namen, is-far ab FAR_ZOOM: alles mit near).
    const onZoom = () => {
      const zoom = this.map.getZoom();
      container.classList.toggle('zoomed-out', zoom < 10);
      container.classList.toggle('is-far', zoom <= FAR_ZOOM);
    };
    this.map.on('zoom', onZoom);
    onZoom();
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
    mapPerf.attach(this.map);
  }

  destroy(): void {
    for (const { instance } of this.instances) instance.destroy?.();
    this.precipitation.destroy();
    setActiveMap(null);
    this.map.remove();
  }

  private mountLayers(): void {
    if (this.loaded) return;
    this.loaded = true;
    for (const layer of mapLayers()) {
      try {
        const instance = layer.mount({
          map: this.map,
          ui: this.ui,
          getState: this.getState,
          isPicking: () => this.picking !== null,
        });
        this.instances.push({ id: layer.id, instance });
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
    this.lastKey = '';
    if (state && this.lastUi) this.update(state, this.lastUi);
  }

  /** Der Zustand hat sich ohne neue Spielzeit geändert (Befehl, neues oder geladenes Spiel). */
  invalidate(): void {
    this.revision++;
  }

  /** Spieltempo (0 = Pause): Verkehr, Figuren und Puls halten bei Pause an. */
  setSpeed(speed: number): void {
    setMotionSpeed(speed);
  }

  /**
   * Nach jedem Neuzeichnen der UI. Die Layer bekommen update() nur, wenn sich etwas geändert hat: Spielzeit, ein
   * Befehl oder neues Spiel (invalidate), das offene Panel, Handy, Kamera, Overlay oder Verkehr.
   */
  update(state: GameState, ui: UiState): void {
    const key = `${state.time}|${this.revision}|${this.view}|${ui.phone.open}|${ui.camera}|${ui.overlay}|${ui.traffic}|${this.loaded}`;
    if (key === this.lastKey && state === this.lastState && ui.panel === this.lastPanel) {
      this.precipitation.sync();
      return;
    }
    this.lastKey = key;
    this.lastState = state;
    this.lastPanel = ui.panel;
    const phoneChanged = this.lastUi?.phone.open !== ui.phone.open;
    this.lastUi = ui;
    if (phoneChanged || this.padRight < 0) this.applyPadding(this.padRight >= 0);
    if (ui.camera !== this.cameraMode) this.setCameraMode(ui.camera);
    this.overlay.setEnabled(ui.overlay);
    this.overlay.setClock(
      `${clock.weekdayName(state.time, true).toUpperCase()} ${clock.formatTime(state.time)} · TAG ${clock.day(state.time)}`,
    );
    this.overlay.setLabel(this.viewLabel);
    for (const { id, instance } of this.instances) {
      if (!instance.update) continue;
      const t0 = mapPerf.begin();
      instance.update(state, ui);
      mapPerf.end('layer', id, t0);
    }
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

  // HUD und Handy liegen über der Karte, also soll die Kamera auf den freien Bereich zentrieren.
  private padRight = -1;

  /**
   * Freier Kartenausschnitt: Am Desktop steht das Handy rechts (angedockt) und das HUD oben, am Handy-Bildschirm HUD
   * oben und die Leiste unten. Klappt das Handy ein oder aus, gleitet der Ausschnitt mit (Look "Glas", Auftrag 24).
   * Panels ändern nichts, damit die Karte beim Blättern im Handy nicht wandert.
   */
  private applyPadding(animate = false): void {
    if (isMobile()) {
      this.padRight = 0;
      this.map.setPadding({ top: 120, bottom: 170, left: 0, right: 0 });
      return;
    }
    // offsetLeft statt getBoundingClientRect: Die Einblend-Animation des Handys verschiebt es kurz.
    const phone = this.lastUi?.phone.open ? document.querySelector<HTMLElement>('.phone') : null;
    const right = phone ? Math.max(0, Math.round(window.innerWidth - phone.offsetLeft)) : 0;
    if (right === this.padRight) return;
    this.padRight = right;
    const padding = { top: 90, bottom: 0, left: 0, right };
    if (animate) this.map.easeTo({ padding, duration: 450 });
    else this.map.setPadding(padding);
  }

  /** Neigung und Drehung der aktuellen Stadt (flyToCamera merkt sie sich), für 3D zurück aus der Draufsicht. */
  private tilt = { pitch: KOELN_PITCH, bearing: KOELN_BEARING };

  private koelnCamera() {
    return this.cameraMode === '2d' ? { pitch: 0, bearing: 0 } : { ...this.tilt };
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
      if (this.view.startsWith('city:')) this.map.easeTo({ ...this.tilt, duration: 900 });
    }
    this.container.classList.toggle('is-2d', mode === '2d');
  }

  flyToKoeln(): void {
    this.view = 'city:koeln';
    this.tilt = { pitch: KOELN_PITCH, bearing: KOELN_BEARING };
    this.viewLabel = 'CAM 01 · KÖLN';
    this.map.flyTo({
      center: [KOELN_VIEW.lng, KOELN_VIEW.lat],
      zoom: koelnZoom(),
      ...this.koelnCamera(),
      duration: 2500,
    });
  }

  flyToEuropa(): void {
    this.view = 'europa';
    this.viewLabel = 'SAT 02 · EUROPA';
    this.map.flyTo({
      center: [EUROPA_VIEW.center.lng, EUROPA_VIEW.center.lat],
      zoom: EUROPA_VIEW.zoom,
      pitch: 0,
      bearing: 0,
      duration: 2500,
    });
  }

  /** Kamera auf eine Ansicht (Stadt oder Deutschland, Auftrag 30). */
  flyToCamera(camera: MapCamera): void {
    this.view = camera.view;
    this.viewLabel = camera.label;
    if (camera.tilt) this.tilt = { pitch: camera.pitch ?? KOELN_PITCH, bearing: camera.bearing ?? KOELN_BEARING };
    if (camera.bounds) {
      // Rahmen ganz zeigen, mit Platz für die Stadt-Karten (über dem Punkt, halb so breit wie eine Karte) und am Handy
      // für die Karte unter Geld und Heat.
      const [w, s, e, n] = camera.bounds;
      const padding = isMobile()
        ? { top: 220, bottom: 40, left: 125, right: 125 }
        : { top: 110, bottom: 60, left: 140, right: 140 };
      const fit = this.map.cameraForBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding, bearing: 0 },
      );
      if (fit?.center) {
        this.map.flyTo({
          center: fit.center,
          zoom: Math.min(fit.zoom ?? camera.zoom, FAR_ZOOM - 0.5),
          pitch: 0,
          bearing: 0,
          duration: 2500,
        });
        return;
      }
    }
    this.map.flyTo({
      center: [camera.center.lng, camera.center.lat],
      zoom: isMobile() ? camera.mobileZoom : camera.zoom,
      ...(camera.tilt ? this.koelnCamera() : { pitch: 0, bearing: 0 }),
      duration: 2500,
    });
  }

  settleView(view: string, label: string, tilt: { pitch: number; bearing: number } | null): void {
    if (view === this.view) return;
    this.view = view;
    this.viewLabel = label;
    if (tilt) this.tilt = { ...tilt };
    this.overlay.setLabel(label);
    this.map.easeTo({ ...(tilt ? this.koelnCamera() : { pitch: 0, bearing: 0 }), duration: 900 });
  }

  currentView(): string {
    return this.view;
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
