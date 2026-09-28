// Laufzeit der Oberfläche: verbindet die Spielsitzung mit Preact. Hält den reinen UI-Zustand
// (offenes Panel, Dialog, Handy, Toasts …) und stößt das Neuzeichnen an, gedrosselt auf ca. 10 Mal pro Sekunde.

import { audio } from '../audio';
import type { Command, CommandResult, GameSession, GameState, KeyValueStorage, LngLat } from '../core';
import { type CameraMode, loadPrefs, savePrefs, type UiPrefs } from './prefs';
import {
  type DialogId,
  type DialogRegistry,
  dialogs,
  type PanelId,
  type PanelRegistry,
  reactionsFor,
} from './registry';

export type ToastKind = 'info' | 'good' | 'bad';
export type { CameraMode } from './prefs';

/** Benachrichtigung, die oben aus dem Spiel-Handy herausragt (Banner). Klick öffnet die App. */
export interface PhoneNotification {
  id: number;
  title: string;
  text: string;
  /** Icon-Name aus dem Icon-Set oder Emoji. */
  icon?: string;
  /** App, die sich beim Klick öffnet, samt Parametern (z.B. { contactId }). */
  appId?: string;
  params?: Record<string, unknown>;
  /** Ton (Name aus SOUND_IDS oder registerSound), Standard 'notification'. null = still. */
  sound?: string | null;
}

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

export interface UiState {
  panel: { id: PanelId; props: unknown } | null;
  dialog: { id: DialogId; props: unknown } | null;
  phone: { open: boolean; app: string | null; params?: Record<string, unknown> };
  /** Aktiver Seitenleisten-Tab (null = erster). */
  tab: string | null;
  /** Handy-Layout: Bottom-Sheet aufgeklappt? */
  sheetExpanded: boolean;
  toasts: Toast[];
  /** Wartet die Karte gerade auf einen Klick (pickLocation)? */
  picking: { prompt: string } | null;
  /** Kamera: 3D schräg (Standard) oder 2D-Draufsicht. Pro Gerät gemerkt. */
  camera: CameraMode;
  /** Überwachungs-Overlay auf der Karte an? Pro Gerät gemerkt. */
  overlay: boolean;
  /** Handy vibriert bei Benachrichtigungen. Pro Gerät gemerkt. */
  vibration: boolean;
  /** Aktuelles Banner des Spiel-Handys. */
  notification: PhoneNotification | null;
  /** Zählt jedes Vibrieren hoch (für die Animation). */
  buzz: number;
}

/** Schnittstelle der Karte für die UI (implementiert in src/map/GameMap.ts). */
export interface MapController {
  flyToKoeln(): void;
  flyToEuropa(): void;
  flyTo(target: LngLat, zoom?: number): void;
  pickLocation(): Promise<LngLat | null>;
  cancelPick(): void;
  setCameraMode(mode: CameraMode): void;
  zoomIn(): void;
  zoomOut(): void;
  resetNorth(): void;
}

/** Was Oberflächen-Code tun darf. Den Spielzustand ändert er nur über dispatch. */
export interface UiApi {
  /** Befehl schicken. Schlägt er fehl, erscheint der Grund als Toast. */
  dispatch(command: Command): CommandResult;
  openPanel<K extends PanelId>(id: K, props: PanelRegistry[K]): void;
  closePanel(): void;
  openDialog<K extends DialogId>(id: K, props: DialogRegistry[K]): void;
  closeDialog(): void;
  toast(text: string, kind?: ToastKind): void;
  /** Handy öffnen, optional direkt in einer App, z.B. openPhone('core.messages', { contactId: 'gang:nord' }). */
  openPhone(appId?: string | null, params?: Record<string, unknown>): void;
  closePhone(): void;
  /** Banner am Spiel-Handy zeigen (mit Vibrieren). Sound spielt, wer es auslöst (siehe src/audio). */
  notify(notification: Omit<PhoneNotification, 'id'>): void;
  dismissNotification(): void;
  selectTab(id: string): void;
  setSheetExpanded(expanded: boolean): void;
  setSpeed(speed: number): void;
  togglePause(): void;
  /** Nächsten Klick auf die Karte abwarten, z.B. um einen Spot zu gründen. null = abgebrochen. */
  pickLocation(prompt: string): Promise<LngLat | null>;
  cancelPick(): void;
  flyTo(target: LngLat, zoom?: number): void;
  flyToKoeln(): void;
  flyToEuropa(): void;
  setCameraMode(mode: CameraMode): void;
  /** Zwischen 3D schräg und 2D-Draufsicht wechseln. */
  toggleCamera(): void;
  setOverlay(enabled: boolean): void;
  setVibration(enabled: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
  resetNorth(): void;
}

const TOAST_MS = 2600;
const NOTIFICATION_MS = 5000;
const RENDER_INTERVAL_MS = 100;

export class UiRuntime {
  readonly ui: UiState;
  readonly api: UiApi;
  map: MapController | null = null;

  private readonly listeners = new Set<() => void>();
  private lastRender = 0;
  private lastRenderedTime: number | null = null;
  private renderQueued = false;
  private toastId = 0;
  private speedBeforePause = 1;
  private speedBeforeDialog: number | null = null;
  private notificationId = 0;
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly session: GameSession,
    private readonly storage: KeyValueStorage | null = null,
  ) {
    const prefs = loadPrefs(storage);
    this.ui = {
      panel: null,
      dialog: null,
      phone: { open: false, app: null },
      tab: null,
      sheetExpanded: false,
      toasts: [],
      picking: null,
      camera: prefs.camera,
      overlay: prefs.overlay,
      vibration: prefs.vibration,
      notification: null,
      buzz: 0,
    };
    this.api = this.createApi();
    session.subscribe((change) => {
      if (change === 'frame') {
        // Nach Simulationsschritten neu zeichnen, höchstens ca. 10 Mal pro Sekunde. Ohne neue Schritte
        // (Pause) nicht: UI-Änderungen fordern das Neuzeichnen selbst an.
        const now = performance.now();
        if (now - this.lastRender < RENDER_INTERVAL_MS) return;
        if (session.state?.time === this.lastRenderedTime) return;
      }
      this.requestRender();
    });
    session.onEvent((event) => {
      const state = session.state;
      if (!state) return;
      for (const reaction of reactionsFor(event.type)) reaction(event.payload as never, this.api, state);
    });
  }

  get state(): GameState | null {
    return this.session.state;
  }

  /** Neuzeichnen anfordern (im nächsten Microtask, mehrere Anforderungen werden zusammengefasst). */
  requestRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      this.lastRender = performance.now();
      this.lastRenderedTime = this.session.state?.time ?? null;
      for (const listener of this.listeners) listener();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private savePrefs(): void {
    const prefs: UiPrefs = { overlay: this.ui.overlay, camera: this.ui.camera, vibration: this.ui.vibration };
    savePrefs(this.storage, prefs);
  }

  private createApi(): UiApi {
    const ui = this.ui;
    const session = this.session;
    const update = <T>(fn: () => T): T => {
      const result = fn();
      this.requestRender();
      return result;
    };
    const api: UiApi = {
      dispatch: (command) =>
        update(() => {
          const result = session.dispatch(command);
          if (!result.ok) {
            api.toast(result.reason, 'bad');
            audio.play('error', { volume: 0.5 });
          }
          return result;
        }),
      openPanel: (id, props) =>
        update(() => {
          ui.panel = { id, props };
        }),
      closePanel: () =>
        update(() => {
          ui.panel = null;
        }),
      openDialog: (id, props) =>
        update(() => {
          const pauses = dialogs.get(id)?.pausesGame;
          if (pauses && this.speedBeforeDialog === null) {
            this.speedBeforeDialog = session.loop.speed;
            session.setSpeed(0);
          }
          ui.dialog = { id, props };
        }),
      closeDialog: () =>
        update(() => {
          // Nach Game Over bleibt immer ein Dialog offen (Laden oder neues Spiel).
          ui.dialog = session.sim?.isOver ? { id: 'core.gameOver' as DialogId, props: {} } : null;
          if (this.speedBeforeDialog !== null) {
            session.setSpeed(this.speedBeforeDialog);
            this.speedBeforeDialog = null;
          }
        }),
      toast: (text, kind = 'info') =>
        update(() => {
          const id = ++this.toastId;
          ui.toasts = [...ui.toasts.slice(-2), { id, text, kind }];
          setTimeout(() => {
            ui.toasts = ui.toasts.filter((t) => t.id !== id);
            this.requestRender();
          }, TOAST_MS);
        }),
      openPhone: (appId = null, params) =>
        update(() => {
          ui.phone = params ? { open: true, app: appId, params } : { open: true, app: appId };
          if (ui.notification && (!appId || ui.notification.appId === appId)) ui.notification = null;
        }),
      closePhone: () =>
        update(() => {
          ui.phone = { open: false, app: null };
        }),
      notify: (notification) =>
        update(() => {
          // Ist genau diese App (bzw. dieser Chat) offen, braucht es kein Banner.
          const here =
            ui.phone.open &&
            ui.phone.app === notification.appId &&
            JSON.stringify(ui.phone.params ?? {}) === JSON.stringify(notification.params ?? {});
          if (here) {
            audio.play('tap');
            return;
          }
          const id = ++this.notificationId;
          ui.notification = { ...notification, id };
          if (notification.sound !== null) audio.play(notification.sound ?? 'notification');
          if (ui.vibration) {
            ui.buzz++;
            audio.play('vibrate', { volume: 0.6, delay: 0.05 });
            try {
              navigator.vibrate?.([60, 40, 60]);
            } catch {
              // Nicht jedes Gerät kann vibrieren.
            }
          }
          if (this.notificationTimer) clearTimeout(this.notificationTimer);
          this.notificationTimer = setTimeout(() => {
            if (ui.notification?.id === id) ui.notification = null;
            this.requestRender();
          }, NOTIFICATION_MS);
        }),
      dismissNotification: () =>
        update(() => {
          ui.notification = null;
        }),
      selectTab: (id) =>
        update(() => {
          ui.tab = id;
          ui.sheetExpanded = true;
        }),
      setSheetExpanded: (expanded) =>
        update(() => {
          ui.sheetExpanded = expanded;
        }),
      setSpeed: (speed) =>
        update(() => {
          if (speed > 0) this.speedBeforePause = speed;
          session.setSpeed(speed);
        }),
      togglePause: () => api.setSpeed(session.loop.speed === 0 ? this.speedBeforePause : 0),
      pickLocation: async (prompt) => {
        if (!this.map) return null;
        update(() => {
          ui.picking = { prompt };
        });
        try {
          return await this.map.pickLocation();
        } finally {
          update(() => {
            ui.picking = null;
          });
        }
      },
      cancelPick: () => this.map?.cancelPick(),
      flyTo: (target, zoom) => this.map?.flyTo(target, zoom),
      flyToKoeln: () => this.map?.flyToKoeln(),
      flyToEuropa: () => this.map?.flyToEuropa(),
      setCameraMode: (mode) =>
        update(() => {
          ui.camera = mode;
          this.map?.setCameraMode(mode);
          this.savePrefs();
        }),
      toggleCamera: () => api.setCameraMode(ui.camera === '3d' ? '2d' : '3d'),
      setOverlay: (enabled) =>
        update(() => {
          ui.overlay = enabled;
          this.savePrefs();
        }),
      setVibration: (enabled) =>
        update(() => {
          ui.vibration = enabled;
          this.savePrefs();
        }),
      zoomIn: () => this.map?.zoomIn(),
      zoomOut: () => this.map?.zoomOut(),
      resetNorth: () => this.map?.resetNorth(),
    };
    return api;
  }
}
