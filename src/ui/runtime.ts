// Laufzeit der Oberfläche: verbindet die Spielsitzung mit Preact. Hält den reinen UI-Zustand
// (offenes Panel, Dialog, Handy, Toasts …) und stößt das Neuzeichnen an, gedrosselt auf ca. 10 Mal pro Sekunde.

import { audio } from '../audio';
import type { Command, CommandResult, GameSession, GameState, KeyValueStorage, LngLat } from '../core';
import { sectionTitle } from './components/section';
import { setHapticsEnabled } from './haptics';
import { closeAllOverlays } from './overlays';
import type { NavEntry, NavKind } from './phone/navModel';
import * as nav from './phone/navModel';
import { type CameraMode, loadPrefs, savePrefs, type TrafficLevel, type UiPrefs } from './prefs';
import {
  type DialogId,
  type DialogRegistry,
  dialogs,
  getCityViews,
  type PanelId,
  type PanelRegistry,
  panels,
  phoneApps,
  reactionsFor,
  sidebarTabs,
  slotContributions,
} from './registry';
import { bumpStateRevision, enableStateMemo } from './stateMemo';
import { TourRunner } from './tour/controller';
import type { TourApi } from './tour/types';

/** good/info: Routine (kurz, grau in der Alarm-Zentrale), warn: gelb, bad: rot. */
export type ToastKind = 'info' | 'good' | 'warn' | 'bad';

export type { CameraMode, TrafficLevel } from './prefs';

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
  /**
   * Dringend (Standard): Banner, Ton, Vibrieren. Nicht dringend: nur in die Mitteilungszentrale, kein Banner,
   * außer die Einstellung "Mehr Benachrichtigungen" ist an (Auftrag 26: nur das Allerwichtigste stört).
   */
  urgent?: boolean;
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
  /**
   * Als Banner zeigen? Standard: nur 'bad' und 'warn'. Routine ('good', 'info') landet still im Verlauf, außer die
   * Einstellung "Mehr Benachrichtigungen" ist an. Mit true erzwingen (z.B. "Lieferung ist da"), mit false
   * unterdrücken (z.B. Ärger, der nur ins Journal gehört).
   */
  urgent?: boolean;
  /** Überschrift im Banner statt „Meldung“ bzw. „Achtung“ (z.B. „Neue Quest“). */
  title?: string;
  /** Bedeutungsfarbe der Kachel im Banner statt der Farbe der Art (z.B. 'brand' für Peters Quests). */
  color?: string;
  /** Ein Tipp aufs Banner öffnet diese App (samt Parametern), wie bei ui.notify, statt des Verlaufs. */
  appId?: string;
  params?: Record<string, unknown>;
  /** So lange steht das Banner (Millisekunden), Standard nach Art; z.B. länger für Hinweise beim Einstieg. */
  duration?: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  icon?: string;
  target?: LngLat;
  title?: string;
  color?: string;
  appId?: string;
  params?: Record<string, unknown>;
  duration?: number;
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
  /** ID der laufenden Tour (Auftrag 46c), sonst null; Pop-ups über der Karte warten solange (popupMayOpen). */
  tour: string | null;
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
  /** Verkehr als Kulisse auf der Karte: aus, wenig, normal. Pro Gerät gemerkt. */
  traffic: TrafficLevel;
  /** Handy vibriert bei Benachrichtigungen. Pro Gerät gemerkt. */
  vibration: boolean;
  /** Auch Routine als Banner zeigen (sonst nur Dringendes). Pro Gerät gemerkt. */
  moreNotifications: boolean;
  /** Nur Wichtiges als Banner, höchstens eins alle QUIET_GAP_MS. Pro Gerät gemerkt. */
  quietNotifications: boolean;
  /** Aktuelles Banner des Spiel-Handys. */
  notification: PhoneNotification | null;
  /** Zählt jedes Vibrieren hoch (für die Animation). */
  buzz: number;
  /** Dynamic Island: aufgeklappt (alle Live-Aktivitäten) und aktueller kurzer Auftritt. */
  island: { expanded: boolean; pulse: IslandPulse | null };
  /**
   * Laufendes Gespräch im Handy (Auftrag 30): Nachricht des angenommenen Anrufs. Das Handy zeigt dann das Gespräch
   * bildschirmfüllend, bis aufgelegt wird. Ein klingelnder Anruf braucht das nicht (der steht im Spielzustand).
   */
  call: { messageId: number } | null;
}

/** Kamera-Ziel einer Ansicht (Stadt oder Deutschland, Auftrag 30). */
export interface MapCamera {
  /** 'city:<id>', 'deutschland' oder 'europa'. */
  view: string;
  /** Beschriftung im Überwachungs-Overlay, z.B. "CAM 01 · HAMBURG". */
  label: string;
  center: LngLat;
  zoom: number;
  mobileZoom: number;
  /** Schräge Kamera (3D) wie in der Stadt; sonst Draufsicht. */
  tilt: boolean;
  /** Neigung und Drehung der schrägen Kamera in Grad (Standard wie Köln). */
  pitch?: number;
  bearing?: number;
  /** Rahmen [West, Süd, Ost, Nord], der ganz zu sehen sein soll (statt center und zoom, Deutschland-Ansicht). */
  bounds?: readonly [number, number, number, number];
}

/** Schnittstelle der Karte für die UI (implementiert in src/map/GameMap.ts). */
export interface MapController {
  flyToKoeln(): void;
  flyToEuropa(): void;
  flyToCamera(camera: MapCamera): void;
  /**
   * Ansicht wechseln, ohne hinzufliegen (Auftrag 31, beim Zoomen): Ausschnitt bleibt, Neigung und Drehung gleiten zur
   * Ansicht (tilt null = Draufsicht).
   */
  settleView(view: string, label: string, tilt: { pitch: number; bearing: number } | null): void;
  /** Aktuelle Ansicht: 'city:<id>', 'deutschland' oder 'europa'. */
  currentView(): string;
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
  /**
   * Toast sofort ausblenden (der nächste aus der Warteschlange folgt). Mit `id` nur genau diesen: Ein Banner, das
   * inzwischen von einem neueren abgelöst wurde (Wischen, Tipp), räumt so nicht das neue ungesehen weg.
   */
  dismissToast(id?: number): void;
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
  /** Banner ausblenden. Mit `id` nur, wenn gerade dieses Banner zu sehen ist (siehe dismissToast). */
  dismissNotification(id?: number): void;
  /**
   * Banner anhalten, solange der Zeiger darüber steht oder der Fokus darin liegt (Barrierefreiheit: Zeit zum Lesen).
   * Die Anzeigezeit läuft erst weiter, wenn es wieder losgelassen wird.
   */
  holdBanner(held: boolean): void;
  /** Mitteilungszentrale öffnen oder schließen (ohne Argument umschalten). */
  toggleNotificationCenter(open?: boolean): void;
  /** Alle Mitteilungen löschen. */
  clearNotifications(): void;
  /**
   * Kurzer Auftritt in der Dynamic Island. Mit kind und amount werden Beträge gleicher Art zusammengezählt,
   * z.B. pulseIsland({ kind: 'earn', amount: 35, icon: 'euro', tone: 'accent', text: '' }) → "+35 €".
   */
  pulseIsland(pulse: Omit<IslandPulse, 'id'>): void;
  /** Gespräch eines angenommenen Anrufs im Handy zeigen (öffnet das Handy). */
  openCall(messageId: number): void;
  /** Auflegen: Das Gespräch bleibt als Chat beim Kontakt. */
  endCall(): void;
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
  /** Kamera auf eine Stadt (Auftrag 30, Kameras aus registerCityViews). */
  flyToCity(cityId: string): void;
  /** Zurück zur Stadt, die gerade aktiv ist. */
  flyHome(): void;
  /** Deutschland-Ansicht: alle Städte und die Autobahn dazwischen. */
  flyToDeutschland(): void;
  /**
   * In eine Ansicht wechseln, ohne die Kamera zu versetzen (z.B. beim Herauszoomen aus der Stadt in 'deutschland', beim
   * Hineinzoomen zurück in 'city:<id>').
   */
  enterView(view: string): void;
  /** Aktuelle Ansicht der Karte ('city:<id>', 'deutschland', 'europa'). */
  mapView(): string;
  setCameraMode(mode: CameraMode): void;
  /** Zwischen 3D schräg und 2D-Draufsicht wechseln. */
  toggleCamera(): void;
  setOverlay(enabled: boolean): void;
  /** Verkehr auf der Karte: 'off', 'low' oder 'normal'. */
  setTraffic(level: TrafficLevel): void;
  setVibration(enabled: boolean): void;
  setMoreNotifications(enabled: boolean): void;
  setQuietNotifications(enabled: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
  resetNorth(): void;
  /**
   * Tour (Auftrag 46a): Spotlight-Erklärungen über dem Spiel, Schritt für Schritt mit „Weiter“. `start(def)` reiht ein,
   * wenn schon eine läuft; `active()` nennt die laufende; `skip()` beendet sie. Reine Oberfläche, nichts im Spielstand.
   */
  tour: TourApi;
}

/** App-ID eines Tabs im Handy: 'tab:<id>', z.B. 'tab:territory'. */
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
/** Nach dem Loslassen eines angehaltenen Banners bleibt noch kurz Zeit, bevor es verschwindet. */
const BANNER_RELEASE_MS = 2500;
/** Im ruhigen Modus: Mindestabstand zwischen zwei Bannern (echte Millisekunden). */
const QUIET_GAP_MS = 15000;
const ISLAND_PULSE_MS = 2600;
const RENDER_INTERVAL_MS = 100;

export class UiRuntime {
  readonly ui: UiState;
  readonly api: UiApi;
  /** Touren (Auftrag 46a): Ablauf der laufenden Tour, gezeichnet von tour/TourHost.tsx. */
  readonly tours: TourRunner;
  map: MapController | null = null;
  /** Zähler für Tests und das Durchspielen: wie viele Banner (Meldungen und Benachrichtigungen) erschienen sind. */
  readonly stats = { banners: 0 };

  private readonly listeners = new Set<() => void>();
  private lastRender = 0;
  private lastRenderedTime: number | null = null;
  private lastSeenTime: number | null = null;
  private renderQueued = false;
  private toastId = 0;
  private speedBeforePause = 1;

  /** Tempo, mit dem es nach der Pause weitergeht (Handy-Knopf zeigt es pausiert an, Auftrag 43, N10). */
  get resumeSpeed(): number {
    return this.speedBeforePause;
  }
  private speedBeforeDialog: number | null = null;
  private notificationId = 0;
  private lastQuietBanner = 0;
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerHeld = false;
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
      tour: null,
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
      traffic: prefs.traffic,
      vibration: prefs.vibration,
      moreNotifications: prefs.moreNotifications,
      quietNotifications: prefs.quietNotifications,
      notification: null,
      buzz: 0,
      island: { expanded: false, pulse: null },
      call: null,
    };
    setHapticsEnabled(prefs.vibration);
    this.tours = new TourRunner({
      // Hält ein Dialog gerade an, zählt das Tempo, mit dem es nach ihm weitergeht.
      speed: () => this.speedBeforeDialog ?? session.loop.speed,
      setSpeed: (speed) => this.applySpeed(speed),
      state: () => session.state,
      onEvent: (type, fn) =>
        session.onEvent((event) => {
          if (event.type === type) fn();
        }),
      onChange: (fn) => this.subscribe(fn),
      render: () => {
        this.ui.tour = this.tours.active();
        this.requestRender();
      },
    });
    this.api = this.createApi();
    enableStateMemo();
    session.subscribe((change) => {
      // Gemerkte Auszüge des Zustands (stateMemo.ts) gelten nur bis zur nächsten Änderung: neue Spielzeit, Befehl,
      // neues Spiel. Tempo und Autosave ändern den Zustand nicht.
      const time = session.state?.time ?? null;
      if (change === 'sim' || change === 'dispatch' || (change === 'frame' && time !== this.lastSeenTime)) {
        bumpStateRevision();
      }
      this.lastSeenTime = time;
      // Neues, geladenes oder importiertes Spiel: Meldungen, Banner und Seiten des alten Spiels gehören nicht mehr dazu.
      if (change === 'sim') this.resetForNewGame();
      // Der Autosave klappt nicht (Speicher voll): einmal sagen, sonst geht Fortschritt still verloren.
      if (change === 'autosave' && session.autosaveError)
        this.api.toast(session.autosaveError, 'bad', { urgent: true });
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
      // Eine Reaktion, die wirft, darf die übrigen und den Rest der Ereignisse dieses Schritts nicht mitreißen (sonst
      // fehlt z.B. der Game-Over-Dialog und die Simulation steht).
      for (const reaction of reactionsFor(event.type)) {
        try {
          reaction(event.payload as never, this.api, state);
        } catch (error) {
          console.error(`Reaktion auf ${event.type}`, error);
        }
      }
    });
  }

  /** Alles, was zum alten Spiel gehörte, weg: Meldungen, Mitteilungen, Banner, Island und alle offenen Seiten. */
  private resetForNewGame(): void {
    const ui = this.ui;
    for (const timer of [this.toastTimer, this.notificationTimer, this.pulseTimer]) if (timer) clearTimeout(timer);
    this.toastTimer = null;
    this.notificationTimer = null;
    this.pulseTimer = null;
    this.bannerHeld = false;
    ui.toasts = [];
    ui.alerts = [];
    ui.notifications = [];
    ui.notification = null;
    ui.notificationCenter = false;
    ui.popover = null;
    ui.palette = false;
    ui.island = { expanded: false, pulse: null };
    ui.call = null;
    this.map?.cancelPick();
    this.setStack(nav.rootStack());
    this.tours.reset();
  }

  /** Tempo setzen, mit Rücksicht auf einen Dialog, der gerade anhält (sein Tempo gilt, sobald er zu ist). */
  private applySpeed(speed: number): void {
    if (speed > 0) this.speedBeforePause = speed;
    if (this.speedBeforeDialog !== null) {
      if (speed > 0) this.speedBeforeDialog = speed;
      return;
    }
    this.session.setSpeed(speed);
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
      // Ist ein Banner weg, kann der Toast dahinter seine Zeit bekommen.
      this.scheduleToast();
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
    if (this.toastTimer || this.bannerHeld) return;
    const current = this.ui.toasts[0];
    if (!current) return;
    // Ein Banner (Nachricht) hat Vorrang und verdeckt den Toast: Seine Zeit läuft erst, wenn er zu sehen ist.
    if (this.ui.notification) return;
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.ui.toasts = this.ui.toasts.filter((t) => t.id !== current.id);
      this.requestRender();
      this.scheduleToast();
    }, current.duration ?? TOAST_MS[current.kind]);
  }

  /** Blendet das Banner mit dieser ID nach `ms` aus (außer es ist angehalten, dann erst nach dem Loslassen). */
  private startNotificationTimer(id: number, ms: number): void {
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = null;
    if (this.bannerHeld) return;
    this.notificationTimer = setTimeout(() => {
      this.notificationTimer = null;
      if (this.ui.notification?.id === id) this.ui.notification = null;
      this.requestRender();
    }, ms);
  }

  /** Ruhiger Modus: Darf jetzt ein Banner erscheinen? Merkt sich den Zeitpunkt, wenn ja. */
  private quietBannerAllowed(): boolean {
    const now = performance.now();
    if (now - this.lastQuietBanner < QUIET_GAP_MS) return false;
    this.lastQuietBanner = now;
    return true;
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
    const prefs: UiPrefs = {
      overlay: this.ui.overlay,
      camera: this.ui.camera,
      traffic: this.ui.traffic,
      vibration: this.ui.vibration,
      moreNotifications: this.ui.moreNotifications,
      quietNotifications: this.ui.quietNotifications,
    };
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
          if (options.title) toast.title = options.title;
          if (options.color) toast.color = options.color;
          if (options.appId) toast.appId = options.appId;
          if (options.params) toast.params = options.params;
          if (options.duration) toast.duration = options.duration;
          // Banner nur für Dringendes (Razzia, Festnahme, Lieferung …); Routine landet still im Verlauf.
          let urgent = options.urgent ?? (kind === 'bad' || kind === 'warn');
          // Ruhig: nur Schlimmes, und nicht im Sekundentakt (der Rest bleibt im Verlauf).
          if (ui.quietNotifications && urgent) urgent = kind === 'bad' && this.quietBannerAllowed();
          // Gleicher Text schon in der Schlange: nicht doppelt zeigen.
          if ((urgent || (ui.moreNotifications && !ui.quietNotifications)) && !ui.toasts.some((t) => t.text === text)) {
            this.stats.banners++;
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
      dismissToast: (id) =>
        update(() => {
          // Mit ID nur diesen Toast (er kann schon von allein weg sein, dann ist der nächste nicht gemeint).
          if (id !== undefined && ui.toasts[0]?.id !== id) {
            ui.toasts = ui.toasts.filter((t) => t.id !== id);
            return;
          }
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
            // Liegt eine Detailseite (Spot, Veedel …) über dem Chat, schaut man ihn nicht an.
            ui.panel === null &&
            ui.phone.app === notification.appId &&
            JSON.stringify(ui.phone.params ?? {}) === JSON.stringify(notification.params ?? {});
          if (here) {
            audio.play('tap');
            return;
          }
          const id = ++this.notificationId;
          const entry: PhoneNotification = { ...notification, id, time: notification.time ?? session.state?.time ?? 0 };
          ui.notifications = [entry, ...ui.notifications].slice(0, NOTIFICATION_STACK);
          // Nicht dringend: still in die Mitteilungszentrale (Badge an der App), kein Banner, kein Ton.
          if (notification.urgent === false && !ui.moreNotifications) return;
          if (ui.quietNotifications && !this.quietBannerAllowed()) return;
          this.stats.banners++;
          ui.notification = entry;
          // Ein Toast, der gerade lief, ist jetzt verdeckt: Seine Zeit beginnt neu, sobald das Banner weg ist.
          if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
          }
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
          this.startNotificationTimer(id, NOTIFICATION_MS);
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
      openCall: (messageId) =>
        update(() => {
          ui.call = { messageId };
          ui.phone = { ...ui.phone, open: true };
        }),
      endCall: () =>
        update(() => {
          ui.call = null;
        }),
      toggleIsland: (expanded) =>
        update(() => {
          ui.island = { ...ui.island, expanded: expanded ?? !ui.island.expanded };
        }),
      dismissNotification: (id) =>
        update(() => {
          // Mit ID nur das Banner, das gemeint war: Ein neues, das während der Wisch-Animation kam, bleibt.
          if (id === undefined || ui.notification?.id === id) ui.notification = null;
        }),
      holdBanner: (held) => {
        if (held === this.bannerHeld) return;
        update(() => {
          this.bannerHeld = held;
          if (held) {
            if (this.notificationTimer) clearTimeout(this.notificationTimer);
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.notificationTimer = null;
            this.toastTimer = null;
          } else if (ui.notification) {
            this.startNotificationTimer(ui.notification.id, BANNER_RELEASE_MS);
          }
          // Ein Toast bekommt seine Zeit beim nächsten Zeichnen (scheduleToast in requestRender).
        });
      },
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
          // Während eine Tour die Uhr anhält, gilt ein Tempo-Wunsch nach der Tour (Tempo-Regler als Anker, Dialog).
          if (this.tours.pausing()) {
            if (speed > 0) this.speedBeforePause = speed;
            this.tours.resumeWith(speed);
            return;
          }
          // Ein Dialog, der das Spiel anhält, behält seine Pause (z.B. "Weiterspielen" in der Suche); das gewünschte
          // Tempo gilt, sobald er zu ist.
          this.applySpeed(speed);
        }),
      togglePause: () => api.setSpeed(session.loop.speed === 0 ? this.speedBeforePause : 0),
      pickLocation: async (prompt) => {
        if (!this.map) return null;
        // Am Handy-Bildschirm füllt das Handy alles unter dem HUD und deckt die Karte zu: Solange du auf die Karte
        // klickst, liegt es in der Tasche, danach kommt es mit der Seite zurück, von der du kamst.
        const hidePhone = ui.phone.open && isMobileScreen();
        update(() => {
          ui.picking = { prompt };
          if (hidePhone) ui.phone = { ...ui.phone, open: false };
        });
        try {
          return await this.map.pickLocation();
        } finally {
          update(() => {
            ui.picking = null;
            if (hidePhone) ui.phone = { ...ui.phone, open: true };
          });
        }
      },
      cancelPick: () => this.map?.cancelPick(),
      flyTo: (target, zoom) => this.map?.flyTo(target, zoom),
      flyToKoeln: () => this.map?.flyToKoeln(),
      flyToEuropa: () => this.map?.flyToEuropa(),
      flyToCity: (cityId) => {
        const camera = getCityViews()?.cameras.find((c) => c.id === cityId);
        if (!camera) {
          this.map?.flyToKoeln();
          return;
        }
        this.map?.flyToCamera({
          view: `city:${camera.id}`,
          label: `CAM 01 · ${camera.name.toUpperCase()}`,
          center: camera.center,
          zoom: camera.zoom,
          mobileZoom: camera.mobileZoom,
          tilt: true,
          pitch: camera.pitch,
          bearing: camera.bearing,
        });
      },
      flyHome: () => {
        const views = getCityViews();
        const state = this.session.state;
        if (views && state) api.flyToCity(views.active(state));
        else this.map?.flyToKoeln();
      },
      flyToDeutschland: () => {
        const views = getCityViews();
        if (!views) return;
        const state = this.session.state;
        this.map?.flyToCamera({
          view: 'deutschland',
          label: 'SAT 01 · DEUTSCHLAND',
          center: views.deutschland.center,
          zoom: views.deutschland.zoom,
          mobileZoom: views.deutschland.zoom - 0.9,
          tilt: false,
          bounds: state ? views.deutschlandBounds?.(state) : undefined,
        });
      },
      enterView: (view) => {
        if (view === 'deutschland') {
          this.map?.settleView(view, 'SAT 01 · DEUTSCHLAND', null);
          return;
        }
        const camera = getCityViews()?.cameras.find((c) => `city:${c.id}` === view);
        if (!camera) return;
        this.map?.settleView(view, `CAM 01 · ${camera.name.toUpperCase()}`, {
          pitch: camera.pitch ?? 50,
          bearing: camera.bearing ?? -20,
        });
      },
      mapView: () => this.map?.currentView() ?? 'city:koeln',
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
      setTraffic: (level) =>
        update(() => {
          ui.traffic = level;
          this.savePrefs();
        }),
      setVibration: (enabled) =>
        update(() => {
          ui.vibration = enabled;
          setHapticsEnabled(enabled);
          this.savePrefs();
        }),
      setMoreNotifications: (enabled) =>
        update(() => {
          ui.moreNotifications = enabled;
          this.savePrefs();
        }),
      setQuietNotifications: (enabled) =>
        update(() => {
          ui.quietNotifications = enabled;
          this.savePrefs();
        }),
      zoomIn: () => this.map?.zoomIn(),
      zoomOut: () => this.map?.zoomOut(),
      resetNorth: () => this.map?.resetNorth(),
      tour: {
        start: (def) => this.tours.start(def),
        active: () => this.tours.active(),
        skip: () => this.tours.skip(),
      },
    };
    return api;
  }
}
