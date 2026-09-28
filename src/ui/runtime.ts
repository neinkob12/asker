// Laufzeit der Oberfläche: verbindet die Spielsitzung mit Preact. Hält den reinen UI-Zustand
// (offenes Panel, Dialog, Handy, Toasts …) und stößt das Neuzeichnen an, gedrosselt auf ca. 10 Mal pro Sekunde.

import type { Command, CommandResult, GameSession, GameState, LngLat } from '../core';
import {
  type DialogId,
  type DialogRegistry,
  dialogs,
  type PanelId,
  type PanelRegistry,
  reactionsFor,
} from './registry';

export type ToastKind = 'info' | 'good' | 'bad';

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

export interface UiState {
  panel: { id: PanelId; props: unknown } | null;
  dialog: { id: DialogId; props: unknown } | null;
  phone: { open: boolean; app: string | null };
  /** Aktiver Seitenleisten-Tab (null = erster). */
  tab: string | null;
  /** Handy-Layout: Bottom-Sheet aufgeklappt? */
  sheetExpanded: boolean;
  toasts: Toast[];
  /** Wartet die Karte gerade auf einen Klick (pickLocation)? */
  picking: { prompt: string } | null;
}

/** Schnittstelle der Karte für die UI (implementiert in src/map/GameMap.ts). */
export interface MapController {
  flyToKoeln(): void;
  flyToEuropa(): void;
  flyTo(target: LngLat, zoom?: number): void;
  pickLocation(): Promise<LngLat | null>;
  cancelPick(): void;
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
  openPhone(appId?: string | null): void;
  closePhone(): void;
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
}

const TOAST_MS = 2600;
const RENDER_INTERVAL_MS = 100;

export class UiRuntime {
  readonly ui: UiState = {
    panel: null,
    dialog: null,
    phone: { open: false, app: null },
    tab: null,
    sheetExpanded: false,
    toasts: [],
    picking: null,
  };
  readonly api: UiApi;
  map: MapController | null = null;

  private readonly listeners = new Set<() => void>();
  private lastRender = 0;
  private lastRenderedTime: number | null = null;
  private renderQueued = false;
  private toastId = 0;
  private speedBeforePause = 1;
  private speedBeforeDialog: number | null = null;

  constructor(readonly session: GameSession) {
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
          if (!result.ok) api.toast(result.reason, 'bad');
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
      openPhone: (appId = null) =>
        update(() => {
          ui.phone = { open: true, app: appId };
        }),
      closePhone: () =>
        update(() => {
          ui.phone = { open: false, app: null };
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
    };
    return api;
  }
}
