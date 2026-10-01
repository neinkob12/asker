// Laufzeit der Oberfläche: verbindet die Spielsitzung mit Preact. Hält den reinen UI-Zustand
// (offenes Panel, Dialog, Handy, Toasts …) und stößt das Neuzeichnen an, gedrosselt auf ca. 10 Mal pro Sekunde.

import { audio } from '../audio';
import type { Command, CommandResult, GameSession, GameState, KeyValueStorage, LngLat } from '../core';
import { sectionTitle } from './components/section';
import { setHapticsEnabled } from './haptics';
import { closeAllOverlays } from './overlays';
import type { NavEntry, NavKind } from './phone/navModel';
import * as nav from './phone/navModel';
import { type CameraMode, loadPrefs, savePrefs, type UiPrefs } from './prefs';
import {
  type DialogId,
  type DialogRegistry,
  dialogs,
  type PanelId,
  type PanelRegistry,
  panels,
  phoneApps,
  reactionsFor,
  sidebarTabs,
  slotContributions,
} from './registry';

/** good/info: Routine (kurz, grau in der Alarm-Zentrale), warn: gelb, bad: rot. */
export type ToastKind = 'info' | 'good' | 'warn' | 'bad';

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
  /** Spielzeit, zu der die Benachrichtigung kam (setzt notify selbst). */
  time?: number;
}

/** Kurzer Auftritt in der Dynamic Island (z.B. "+120 €" nach Verkäufen, "Lieferung da"). */
export interface IslandPulse {
  id: number;
  icon: string;
  text: string;
  tone?: 'accent' | 'warn' | 'bad' | 'info' | 'neutral';
  /** Gleiche Art (z.B. 'earn'): Beträge werden zusammengezählt, solange der Auftritt läuft. */
  kind?: string;
  amount?: number;
}

export interface ToastOptions {
  /** Ort des Geschehens: Die Alarm-Zentrale bietet dann "Hinzoomen" an. */
  target?: LngLat;
  /** Icon-Name statt des Standard-Icons der Art. */
  icon?: string;
  /** In der Alarm-Zentrale festhalten? Standard: ja (Fehlermeldungen von Befehlen nicht). */
  log?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  icon?: string;
  target?: LngLat;
}

/** Eintrag der Alarm-Zentrale (Glocke im HUD). */
export interface Alert {
  id: number;
  text: string;
  kind: ToastKind;
  /** Spielzeit. */
  time: number;
  icon?: string;
  target?: LngLat;
  read: boolean;
}

export type { NavEntry, NavKind } from './phone/navModel';

/**
 * Spiel-Handy: offen oder weggelegt und der Navigationsstapel (unten der Startbildschirm, oben die sichtbare Seite,
 * siehe phone/navModel.ts). `app` und `params` sind die oberste App-Seite des Stapels (z.B. 'core.messages' mit
 * { contactId }), null auf dem Startbildschirm.
 */
export interface PhoneState {
  open: boolean;
  app: string | null;
  params?: Record<string, unknown>;
  stack: NavEntry[];
}

export interface UiState {
  /** Oberste Seite, wenn sie Details (ein Panel) zeigt, sonst null. Folgt dem Stapel des Handys. */
  panel: { id: PanelId; props: unknown } | null;
  dialog: { id: DialogId; props: unknown } | null;
  phone: PhoneState;
  /** Zuletzt geöffneter Tab (als App im Handy: 'tab:<id>'), null = keiner. */
  tab: string | null;
  /** Geöffneter Abschnitt eines Listen-Tabs (ID des Slot-Beitrags), null = Übersicht. Folgt dem Stapel. */
  section: string | null;
  /** Warteschlange: Sichtbar ist nur der erste Eintrag. */
  toasts: Toast[];
  /** Alarm-Zentrale, neueste zuerst. */
  alerts: Alert[];
  /** Gestapelte Benachrichtigungen fürs Handy (Mitteilungszentrale), neueste zuerst. */
  notifications: PhoneNotification[];
  /** Mitteilungszentrale im Handy offen (Banner oder Statusleiste herunterziehen)? */
  notificationCenter: boolean;
  /** Suche (⌘K / Strg+K) offen? */
  palette: boolean;
  /** Offenes Popover im HUD (z.B. 'more', 'alerts', 'menu'). */
  popover: string | null;
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
  /** Dynamic Island: aufgeklappt (alle Live-Aktivitäten) und aktueller kurzer Auftritt. */
  island: { expanded: boolean; pulse: IslandPulse | null };
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
  toast(text: string, kind?: ToastKind, options?: ToastOptions): void;
  /** Aktuellen Toast sofort ausblenden (der nächste aus der Warteschlange folgt). */
  dismissToast(): void;
  /** Alarm-Zentrale: alles als gelesen markieren bzw. leeren. */
  markAlertsRead(): void;
  clearAlerts(): void;
  /**
   * Handy öffnen, optional direkt in einer App, z.B. openPhone('core.messages', { contactId: 'gang:nord' }).
   * Ohne App: Startbildschirm. Mit Parametern kommt die Unterseite über die Wurzel der App (zurück führt zur Liste).
   */
  openPhone(appId?: string | null, params?: Record<string, unknown>): void;
  /** Handy aufnehmen, ohne die Navigation zu ändern (zeigt die zuletzt offene Seite). */
  showPhone(): void;
  closePhone(): void;
  /** Im Handy eine Seite zurück (wie der Zurück-Knopf); auf dem Startbildschirm wird das Handy weggelegt. */
  back(): void;
  /** Banner am Spiel-Handy zeigen (mit Vibrieren). Sound spielt, wer es auslöst (siehe src/audio). */
  notify(notification: Omit<PhoneNotification, 'id'>): void;
  dismissNotification(): void;
  /** Mitteilungszentrale öffnen oder schließen (ohne Argument umschalten). */
  toggleNotificationCenter(open?: boolean): void;
  /** Alle Mitteilungen löschen. */
  clearNotifications(): void;
  /**
   * Kurzer Auftritt in der Dynamic Island. Mit kind und amount werden Beträge gleicher Art zusammengezählt,
   * z.B. pulseIsland({ kind: 'earn', amount: 35, icon: 'euro', tone: 'accent', text: '' }) → "+35 €".
   */
  pulseIsland(pulse: Omit<IslandPulse, 'id'>): void;
  /** Dynamic Island auf- oder zuklappen (ohne Argument umschalten). */
  toggleIsland(expanded?: boolean): void;
  /** Tab (Bereich eines Moduls) als App im Handy öffnen. */
  selectTab(id: string): void;
  /** Abschnitt eines Listen-Tabs öffnen (ID des Slot-Beitrags), null = zurück zur Übersicht. */
  openSection(id: string | null): void;
  /** Suche öffnen/schließen (ohne Argument umschalten). */
  togglePalette(open?: boolean): void;
  /** Popover im HUD öffnen/schließen (null = zu). */
  setPopover(id: string | null): void;
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

/** App-ID eines Tabs im Handy: 'tab:<id>', z.B. 'tab:business'. */
export const TAB_APP_PREFIX = 'tab:';

/** Handy-Breite, gleich wie MOBILE_BREAKPOINT in src/map/config.ts und die Media Queries in tokens.css. */
function isMobileScreen(): boolean {
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

/** Anzeigedauer: Routine kurz, Warnungen länger. */
const TOAST_MS: Record<ToastKind, number> = { good: 1900, info: 2200, warn: 3000, bad: 3400 };
const TOAST_QUEUE = 5;
const ALERT_LIMIT = 60;
const NOTIFICATION_STACK = 12;
const NOTIFICATION_MS = 5000;
const ISLAND_PULSE_MS = 2600;
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
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private alertId = 0;
  private pulseId = 0;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly session: GameSession,
    private readonly storage: KeyValueStorage | null = null,
  ) {
    const prefs = loadPrefs(storage);
    // Am Desktop ist das Handy fest angedockt und von Anfang an offen, am Handy liegt es in der Tasche.
    const desktop = !isMobileScreen();
    this.ui = {
      panel: null,
      dialog: null,
      phone: { open: desktop, app: null, stack: nav.rootStack() },
      tab: null,
      section: null,
      toasts: [],
      alerts: [],
      notifications: [],
      notificationCenter: false,
      palette: false,
      popover: null,
      picking: null,
      camera: prefs.camera,
      overlay: prefs.overlay,
      vibration: prefs.vibration,
      notification: null,
      buzz: 0,
      island: { expanded: false, pulse: null },
    };
    setHapticsEnabled(prefs.vibration);
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

  /** Zeigt den ersten Toast der Warteschlange für seine Dauer, danach den nächsten. */
  private scheduleToast(): void {
    if (this.toastTimer) return;
    const current = this.ui.toasts[0];
    if (!current) return;
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.ui.toasts = this.ui.toasts.filter((t) => t.id !== current.id);
      this.requestRender();
      this.scheduleToast();
    }, TOAST_MS[current.kind]);
  }

  private navKey = 0;

  /** Neue Seite für den Stapel, mit Titel aus der Registry (die Seite meldet später ihren echten Titel). */
  private navEntry(kind: NavKind, id: string, params?: Record<string, unknown>): NavEntry {
    const entry: NavEntry = { kind, id, title: this.titleOf(kind, id, params), key: `${kind}:${++this.navKey}` };
    if (params && Object.keys(params).length > 0) entry.params = params;
    return entry;
  }

  private titleOf(kind: NavKind, id: string, params?: Record<string, unknown>): string {
    try {
      if (kind === 'app') return phoneApps.get(id)?.name ?? id;
      if (kind === 'tab') return sidebarTabs.get(id)?.title ?? id;
      if (kind === 'section') {
        const tab = typeof params?.tab === 'string' ? sidebarTabs.get(params.tab) : undefined;
        const registered = tab ? slotContributions(`tab:${tab.id}`).find((c) => c.id === id)?.title : undefined;
        return sectionTitle(id) ?? registered ?? tab?.title ?? 'Abschnitt';
      }
      if (kind === 'panel') {
        const state = this.session.state;
        const definition = panels.get(id as PanelId);
        if (definition && state) return definition.title(params as never, state);
        return 'Details';
      }
    } catch (error) {
      console.error('Titel der Seite', error);
    }
    return 'Start';
  }

  /** Wurzel einer App im Stapel: Tab ('tab:<id>') oder Handy-App. */
  private appRoot(appId: string): NavEntry {
    return appId.startsWith(TAB_APP_PREFIX)
      ? this.navEntry('tab', appId.slice(TAB_APP_PREFIX.length))
      : this.navEntry('app', appId);
  }

  /** Neuen Stapel übernehmen und die abgeleiteten Felder (app, params, panel, tab, section) nachziehen. */
  private setStack(next: NavEntry[]): void {
    const ui = this.ui;
    // Ein Menü oder Blatt gehört zu seiner Seite: Wechselt die Seite, schließt es.
    if (nav.top(next).key !== nav.top(ui.phone.stack).key) closeAllOverlays();
    const app = nav.currentApp(next);
    const phone: PhoneState = {
      open: ui.phone.open,
      app: app ? (app.kind === 'tab' ? `${TAB_APP_PREFIX}${app.id}` : app.id) : null,
      stack: next,
    };
    if (app?.params) phone.params = app.params;
    ui.phone = phone;
    const current = nav.top(next);
    ui.panel = current.kind === 'panel' ? { id: current.id as PanelId, props: current.params ?? {} } : null;
    if (app?.kind === 'tab') ui.tab = app.id;
    ui.section = nav.currentSection(next)?.id ?? null;
  }

  /** Eine Seite meldet ihren Titel (z.B. Name im Chat). Kein Neuzeichnen nötig: Er erscheint im nächsten Bild. */
  rememberTitle(key: string, title: string): void {
    const stack = this.ui.phone.stack;
    const next = nav.withTitle(stack, key, title);
    if (next.some((e, i) => e !== stack[i])) this.ui.phone = { ...this.ui.phone, stack: next };
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
            api.toast(result.reason, 'bad', { log: false });
            audio.play('error', { volume: 0.5 });
          }
          return result;
        }),
      // Details (Spot, Veedel, Person …) erscheinen als Seite im Handy, oben auf dem Stapel.
      openPanel: (id, props) =>
        update(() => {
          if (!ui.phone.open) ui.phone = { ...ui.phone, open: true };
          this.setStack(nav.openPanel(ui.phone.stack, this.navEntry('panel', id, props as Record<string, unknown>)));
          ui.popover = null;
        }),
      closePanel: () =>
        update(() => {
          this.setStack(nav.closePanel(ui.phone.stack));
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
      toast: (text, kind = 'info', options = {}) =>
        update(() => {
          const id = ++this.toastId;
          const toast: Toast = { id, text, kind };
          if (options.icon) toast.icon = options.icon;
          if (options.target) toast.target = options.target;
          // Gleicher Text schon in der Schlange: nicht doppelt zeigen.
          if (!ui.toasts.some((t) => t.text === text)) {
            let queue = [...ui.toasts, toast];
            // Zu voll: Routine-Meldungen (nicht die sichtbare) fliegen zuerst raus.
            while (queue.length > TOAST_QUEUE) {
              const drop = queue.findIndex((t, i) => i > 0 && (t.kind === 'good' || t.kind === 'info'));
              queue = queue.filter((_, i) => i !== (drop > 0 ? drop : 1));
            }
            ui.toasts = queue;
            this.scheduleToast();
          }
          if (options.log !== false) {
            const alert: Alert = { id: ++this.alertId, text, kind, time: session.state?.time ?? 0, read: false };
            if (options.icon) alert.icon = options.icon;
            if (options.target) alert.target = options.target;
            ui.alerts = [alert, ...ui.alerts].slice(0, ALERT_LIMIT);
          }
        }),
      dismissToast: () =>
        update(() => {
          if (this.toastTimer) clearTimeout(this.toastTimer);
          this.toastTimer = null;
          ui.toasts = ui.toasts.slice(1);
          this.scheduleToast();
        }),
      markAlertsRead: () =>
        update(() => {
          if (ui.alerts.some((a) => !a.read)) ui.alerts = ui.alerts.map((a) => (a.read ? a : { ...a, read: true }));
        }),
      clearAlerts: () =>
        update(() => {
          ui.alerts = [];
        }),
      openPhone: (appId = null, params) =>
        update(() => {
          ui.phone = { ...ui.phone, open: true };
          const stack = ui.phone.stack;
          if (!appId) {
            this.setStack(nav.popToRoot(stack));
          } else {
            // Unterseite einer App (z.B. ein Chat) liegt über ihrer Wurzel; Tabs haben keine Unterseiten mit Parametern.
            const detail =
              params && Object.keys(params).length > 0 && !appId.startsWith(TAB_APP_PREFIX)
                ? this.navEntry('app', appId, params)
                : undefined;
            this.setStack(nav.openApp(stack, this.appRoot(appId), detail));
          }
          if (ui.notification && (!appId || ui.notification.appId === appId)) ui.notification = null;
          // Geöffnete App: Ihre Benachrichtigungen verschwinden vom Stapel (bei Chats nur die des Chats).
          if (appId) {
            const same = (n: PhoneNotification) =>
              n.appId === appId && (!params || JSON.stringify(n.params ?? {}) === JSON.stringify(params));
            if (ui.notifications.some(same)) ui.notifications = ui.notifications.filter((n) => !same(n));
          }
        }),
      showPhone: () =>
        update(() => {
          ui.phone = { ...ui.phone, open: true };
        }),
      // Weglegen: Am Desktop klappt das Handy an den Rand, die zuletzt offene App bleibt gemerkt (Details nicht).
      closePhone: () =>
        update(() => {
          ui.phone = { ...ui.phone, open: false };
          ui.notificationCenter = false;
          this.setStack(nav.withoutPanels(ui.phone.stack));
        }),
      back: () => {
        if (!ui.phone.open) return;
        if (ui.phone.stack.length <= 1) api.closePhone();
        else update(() => this.setStack(nav.pop(ui.phone.stack)));
      },
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
          ui.notification = { ...notification, id, time: notification.time ?? session.state?.time ?? 0 };
          ui.notifications = [ui.notification, ...ui.notifications].slice(0, NOTIFICATION_STACK);
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
      pulseIsland: (pulse) =>
        update(() => {
          const current = ui.island.pulse;
          const next: IslandPulse = { ...pulse, id: ++this.pulseId };
          if (current && pulse.kind && current.kind === pulse.kind && pulse.amount !== undefined) {
            next.amount = (current.amount ?? 0) + pulse.amount;
            next.id = current.id;
          }
          ui.island = { ...ui.island, pulse: next };
          if (this.pulseTimer) clearTimeout(this.pulseTimer);
          this.pulseTimer = setTimeout(() => {
            ui.island = { ...ui.island, pulse: null };
            this.requestRender();
          }, ISLAND_PULSE_MS);
        }),
      toggleIsland: (expanded) =>
        update(() => {
          ui.island = { ...ui.island, expanded: expanded ?? !ui.island.expanded };
        }),
      dismissNotification: () =>
        update(() => {
          ui.notification = null;
        }),
      toggleNotificationCenter: (open) =>
        update(() => {
          ui.notificationCenter = open ?? !ui.notificationCenter;
          if (ui.notificationCenter) ui.notification = null;
        }),
      clearNotifications: () =>
        update(() => {
          ui.notifications = [];
        }),
      // Bereiche der Module (Tabs) sind Apps im Handy.
      selectTab: (id) => api.openPhone(`${TAB_APP_PREFIX}${id}`),
      openSection: (id) =>
        update(() => {
          const stack = ui.phone.stack;
          if (id === null) this.setStack(nav.closeSections(stack));
          else
            this.setStack(nav.openSection(stack, this.navEntry('section', id, ui.tab ? { tab: ui.tab } : undefined)));
        }),
      togglePalette: (open) =>
        update(() => {
          ui.palette = open ?? !ui.palette;
          if (ui.palette) ui.popover = null;
        }),
      setPopover: (id) =>
        update(() => {
          ui.popover = id;
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
          setHapticsEnabled(enabled);
          this.savePrefs();
        }),
      zoomIn: () => this.map?.zoomIn(),
      zoomOut: () => this.map?.zoomOut(),
      resetNorth: () => this.map?.resetNorth(),
    };
    return api;
  }
}
