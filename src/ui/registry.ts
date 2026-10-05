// Registries für Oberflächen. Module melden hier aus src/modules/<id>/ui/index.tsx an, was sie zeigen:
// HUD-Anzeigen, Seitenleisten-Tabs, Beiträge zu Slots, Panels, Dialoge, Handy-Apps und Reaktionen auf Ereignisse.
// Anmelden mit derselben ID ersetzt den alten Eintrag (wichtig für Hot Reload).

import type { ComponentType } from 'preact';
import type { EventType, GameEvents, GameState, LngLat } from '../core';
import type { UiApi, UiState } from './runtime';
import { memoState } from './stateMemo';

/** Panels (Detailansichten, z.B. ein Spot): ID → Props. Module erweitern das per Declaration Merging. */
// biome-ignore lint/suspicious/noEmptyInterface: wird per Declaration Merging gefüllt
export interface PanelRegistry {}

/** Dialoge: ID → Props. Module erweitern das per Declaration Merging. */
// biome-ignore lint/suspicious/noEmptyInterface: wird per Declaration Merging gefüllt
export interface DialogRegistry {}

/**
 * Slots: benannte Stellen, an denen andere Module Inhalte einhängen, z.B. 'spots.spotPanel'.
 * Name → Props. Tabs ohne eigene Komponente haben automatisch den Slot 'tab:<tab-id>' (ohne Props).
 */
export interface SlotRegistry {
  /** Widgets auf dem Startbildschirm des Spiel-Handys (z.B. Wetter), über den App-Icons. */
  'phone.home': Record<string, never>;
  /** Zusätzliche Abschnitte in den Einstellungen (Dialog und Handy-App). */
  'core.settings': Record<string, never>;
  /**
   * Überlagerungen der freien Kartenfläche (Look "Glas"), z.B. Razzia-Banner oder Tracking-Karte einer Lieferung.
   * Der Bereich reicht bis --map-right (neben dem angedockten Handy) und folgt ihm; die Beiträge positionieren sich
   * selbst (position: absolute) und sind standardmäßig nicht anklickbar (pointer-events für Knöpfe selbst setzen).
   */
  'map.overlay': Record<string, never>;
  /** Unter den Kennzahlen im Game-Over- bzw. Sieg-Bildschirm, z.B. die Bestenliste. */
  'core.ending': { kind: 'over' | 'won' };
}

export type PanelId = keyof PanelRegistry & string;
export type DialogId = keyof DialogRegistry & string;
export type SlotName = (keyof SlotRegistry & string) | `tab:${string}`;
export type SlotProps<N extends SlotName> = N extends keyof SlotRegistry ? SlotRegistry[N] : Record<string, never>;

export interface HudItem {
  id: string;
  /** Kleiner = weiter links. Kern: Geld 10, Uhr 90. Ab 90 steht der Eintrag fest neben dem Spieltempo. */
  order: number;
  component: ComponentType;
  /**
   * Wo der Eintrag steht: 'main' dauerhaft oben (Geld, Heat), 'time' in der Uhr-Pille (Uhr, Wetter),
   * 'alert' als auffällige Warnung oben, 'more' im Popover hinter dem Mehr-Knopf (Lager, Ruf, Köln …),
   * 'below' als eigene Glas-Karte direkt unter der Geld-Kapsel (Quest). Standard: ab Ordnung 90 'time', sonst 'more'.
   */
  placement?: 'main' | 'more' | 'time' | 'alert' | 'below';
  /** Icon für den Mehr-Knopf (zeigt die Icons der Einträge im Popover). */
  icon?: string;
}

export interface SidebarTab {
  id: string;
  title: string;
  order: number;
  /** Ohne Komponente zeigt der Tab den Slot 'tab:<id>'. */
  component?: ComponentType;
  /** Zahl am Tab, z.B. offene Aufgaben. 0 = keine. */
  badge?: (state: GameState) => number;
  /** Icon vor dem Titel (Name aus dem Icon-Set, siehe src/ui/components/icons.ts). */
  icon?: string;
  /**
   * 'stack' (Standard): Abschnitte untereinander. 'rows': Jede Karte (Card) des Slots ist eine tippbare Zeile
   * mit Icon, Titel, Kennzahl (summary) und Status; ein Tipp öffnet den Abschnitt ganz (z.B. "Geschäft").
   */
  layout?: 'stack' | 'rows';
  /** Tastenkürzel (ein Buchstabe) am Desktop. Standard: erster freier Buchstabe des Titels. */
  shortcut?: string;
  /** Nicht als App auf dem Startbildschirm, in der Suche und bei den Tastenkürzeln zeigen (nur per selectTab erreichbar). */
  hidden?: boolean;
}

export interface SlotContribution<N extends SlotName = SlotName> {
  id: string;
  order: number;
  component: ComponentType<SlotProps<N>>;
  /**
   * Titel des Beitrags, z.B. eines Abschnitts im Geschäft. Das Handy nutzt ihn für Titel und Zurück-Knopf, wenn der
   * Abschnitt direkt geöffnet wird (ui.openSection), bevor seine Zeile zu sehen war.
   */
  title?: string;
  /** Symbol und Bedeutungsfarbe des Beitrags, z.B. für den Abschnittskopf in den Einstellungen. */
  icon?: string;
  color?: string;
}

export interface PanelDefinition<K extends PanelId = PanelId> {
  id: K;
  title: (props: PanelRegistry[K], state: GameState) => string;
  component: ComponentType<PanelRegistry[K]>;
}

export interface DialogDefinition<K extends DialogId = DialogId> {
  id: K;
  component: ComponentType<DialogRegistry[K]>;
  /** Pausiert das Spiel, solange der Dialog offen ist. */
  pausesGame?: boolean;
  /** Mit Escape oder Klick daneben schließbar. Standard: true. */
  dismissable?: boolean;
  /**
   * Wo der Dialog liegt (Look "Glas"): 'screen' (Standard) über allem, 'map' nur über der Kartenfläche neben dem
   * angedockten Handy (der Dialog zeichnet sich dann selbst, z.B. als Akte; am Handy-Bildschirm als Blatt).
   */
  area?: 'screen' | 'map';
  /** Handy abdunkeln und sperren (inert), solange ein 'map'-Dialog offen ist. Standard: wie pausesGame. */
  lockPhone?: boolean;
}

/** Sperrt der offene Dialog gerade das Handy (Dialog über der Kartenfläche, der das Spiel pausiert)? */
export function dialogLocksPhone(dialogId: string | null | undefined): boolean {
  const definition = dialogId ? dialogs.get(dialogId as DialogId) : undefined;
  if (!definition || definition.area !== 'map') return false;
  return definition.lockPhone ?? !!definition.pausesGame;
}

export interface PhoneApp {
  id: string;
  name: string;
  /** Name aus dem Icon-Set (z.B. 'message', 'truck', 'users', siehe src/ui/components/icons.ts) oder ein Emoji. */
  icon: string;
  order: number;
  component: ComponentType;
  /** Zahl am App-Icon (z.B. ungelesene Nachrichten). Bekommt auch den UI-Zustand (z.B. für ungelesene Meldungen). */
  badge?: (state: GameState, ui: UiState) => number;
  /**
   * Farbe der Kachel: eine Bedeutungsfarbe des Spiels ('money', 'goods', 'people', 'chat' … siehe ChipColor,
   * eine Farbe = eine Bedeutung) oder, für alte Module, eine CSS-Farbe. Standard: 'system' (grau).
   */
  color?: string;
  /**
   * 'default': Das Handy zeigt oben eine Leiste mit Zurück-Knopf und App-Namen.
   * 'none': Die App zeichnet ihre Leiste selbst (z.B. mit <PhoneScreen>).
   */
  chrome?: 'default' | 'none';
  /**
   * Nicht auf dem Startbildschirm und nicht in der Suche zeigen. Die App bleibt angemeldet und lässt sich weiter mit
   * ui.openPhone(id) öffnen (z.B. eine Unterseite, die andere Stellen verlinken).
   */
  hidden?: boolean;
  /**
   * Nur zeitweise auf dem Startbildschirm, dann im Dock statt einer anderen App (Auftrag 40: „Kunden“ statt
   * „Lieferanten“ in der Hafen-Phase). Solange when nicht gilt, fehlt die App auf dem Startbildschirm (per openPhone
   * bleibt sie erreichbar); die ersetzte App rückt dann ins Raster.
   */
  dock?: { replaces: string; when: (state: GameState) => boolean };
}

/** Empfehlung für die Karte "Nächster Schritt" (und den sanften Hinweis beim Einstieg). */
export interface Advice {
  /** Eindeutig, z.B. 'staff.hireFirstRunner'. */
  id: string;
  /** Höher = wichtiger. Richtwerte: 90 dringend (Kunden warten), 70 Aufbau, 40 Ausbau, 10 Tipp. */
  priority: number;
  icon: string;
  title: string;
  text?: string;
  /** Kosten in Schwarzgeld. Reicht das Geld nicht, zeigt die Karte, was fehlt. */
  cost?: number;
  /** Was sonst noch fehlt (ersetzt die automatische Geld-Meldung). */
  missing?: string;
  /** Beschriftung des Knopfs, Standard "Los". */
  actionLabel?: string;
  action?: (ui: UiApi) => void;
  /** CSS-Selektor eines Elements, das sanft pulsiert (z.B. ein Spot-Marker). */
  highlight?: string;
  /** Ort auf der Karte (für "Hinzoomen"). */
  target?: LngLat;
}

export interface Advisor {
  id: string;
  advise: (state: GameState) => Advice | Advice[] | null;
}

/**
 * Live-Aktivität für die Dynamic Island des Spiel-Handys (wie bei iOS): laufende Dinge mit Anfang und Ende,
 * die man auf einen Blick sehen will (Überfall, Lieferung unterwegs, Frist, hohe Heat …).
 * Kompakt stehen links neben der Kamera `leading` (Icon + kurzes Wort), rechts `trailing` (Wert, z.B. "1:20 h").
 * Aufgeklappt zeigt die Island Titel, Text und Fortschritt. Ein Tipp führt mit `open` zur passenden Stelle.
 */
export interface LiveActivity {
  /** Eindeutig, z.B. 'suppliers.shipment.12'. */
  id: string;
  /** Höher = wichtiger. Richtwerte: 90 Gefahr (Überfall), 70 Frist, 50 Lieferung, 30 Status. */
  priority: number;
  icon: string;
  /** Farbe der Glyphe und des Werts (kräftig auf Schwarz). */
  tone?: 'accent' | 'warn' | 'bad' | 'info' | 'neutral';
  /** Sehr kurz, links der Kamera, z.B. 'Lieferung'. */
  leading: string;
  /** Sehr kurz, rechts der Kamera, z.B. '1:20 h' oder '+120 €'. */
  trailing: string;
  title: string;
  detail?: string;
  /** Fortschritt 0–1 (aufgeklappt als Balken). */
  progress?: number;
  open?: (ui: UiApi) => void;
}

export interface LiveActivitySource {
  id: string;
  activities: (state: GameState) => LiveActivity | LiveActivity[] | null;
}

/** Treffer der Suche (⌘K / Strg+K). */
export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  /** Zusätzliche Suchbegriffe. */
  keywords?: string;
  run: (ui: UiApi) => void;
}

export interface SearchProvider {
  id: string;
  /** Überschrift der Gruppe, z.B. "Spots". */
  label: string;
  order: number;
  items: (state: GameState) => SearchResult[];
}

/**
 * Eintrag im Menü "Ebenen" der Kartensteuerung (Look "Glas"): z.B. Veedel nach Kontrolle oder nach Heat einfärben.
 * Einträge derselben Gruppe schließen sich aus (Auswahl), `toggle: true` ist ein Schalter.
 */
export interface MapLayerOption {
  id: string;
  order: number;
  /** Überschrift der Gruppe, z.B. "Veedel einfärben". */
  group: string;
  label: string;
  icon?: string;
  toggle?: boolean;
  active: (ui: UiState) => boolean;
  select: (api: UiApi, ui: UiState) => void;
}

/** Kennzahl für den Ergebnis-Bildschirm (Game Over, Sieg) und die Übersicht. */
export interface GameStat {
  id: string;
  order: number;
  icon: string;
  label: string;
  value: (state: GameState) => string;
}

export type EventReaction<K extends EventType> = (payload: GameEvents[K], ui: UiApi, state: GameState) => void;

class Registry<T extends { id: string; order?: number }> {
  private readonly items = new Map<string, T>();

  register(item: T): void {
    this.items.set(item.id, item);
    bump();
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  list(): T[] {
    return [...this.items.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  }
}

let version = 0;
const bump = () => {
  version++;
};
/** Ändert sich bei jeder Anmeldung (für Neuzeichnen nach Hot Reload). */
export const registryVersion = () => version;

export const hudItems = new Registry<HudItem>();
export const sidebarTabs = new Registry<SidebarTab>();
export const panels = new Registry<PanelDefinition>();
export const dialogs = new Registry<DialogDefinition>();
export const phoneApps = new Registry<PhoneApp>();
export const advisors = new Registry<Advisor>();
export const liveActivitySources = new Registry<LiveActivitySource>();
export const searchProviders = new Registry<SearchProvider>();
export const gameStats = new Registry<GameStat>();
export const mapLayerOptions = new Registry<MapLayerOption>();
const slots = new Map<string, Registry<SlotContribution>>();
const reactions = new Map<string, Map<string, EventReaction<EventType>>>();

export function registerHudItem(item: HudItem): void {
  hudItems.register(item);
}

export function registerTab(tab: SidebarTab): void {
  sidebarTabs.register(tab);
}

/** Inhalt in einen Slot hängen, z.B. registerSlot('tab:territory', {...}) oder registerSlot('spots.spotPanel', {...}). */
export function registerSlot<N extends SlotName>(name: N, contribution: SlotContribution<N>): void {
  let registry = slots.get(name);
  if (!registry) {
    registry = new Registry<SlotContribution>();
    slots.set(name, registry);
  }
  registry.register(contribution as unknown as SlotContribution);
}

export function slotContributions(name: string): SlotContribution[] {
  return slots.get(name)?.list() ?? [];
}

export function registerPanel<K extends PanelId>(definition: PanelDefinition<K>): void {
  panels.register(definition as unknown as PanelDefinition);
}

export function registerDialog<K extends DialogId>(definition: DialogDefinition<K>): void {
  dialogs.register(definition as unknown as DialogDefinition);
}

export function registerPhoneApp(app: PhoneApp): void {
  phoneApps.register(app);
}

/**
 * Empfehlungen für "Nächster Schritt" anmelden. advise(state) liefert null, eine oder mehrere Empfehlungen;
 * die Shell zeigt die wichtigste. Nur lesen, nichts ändern.
 */
export function registerAdvisor(advisor: Advisor): void {
  advisors.register(advisor);
}

/** Live-Aktivitäten für die Dynamic Island des Handys anmelden (siehe LiveActivity). */
export function registerLiveActivity(source: LiveActivitySource): void {
  liveActivitySources.register(source);
}

/**
 * Alle laufenden Live-Aktivitäten, wichtigste zuerst. Fehler einzelner Module werden ignoriert. Einmal pro Spielstand
 * gerechnet (Island im Handy und über der Karte fragen beide), nicht verändern.
 */
export const collectLiveActivities: (state: GameState) => LiveActivity[] = memoState(computeLiveActivities);

function computeLiveActivities(state: GameState): LiveActivity[] {
  const all: LiveActivity[] = [];
  for (const source of liveActivitySources.list()) {
    try {
      const result = source.activities(state);
      if (Array.isArray(result)) all.push(...result);
      else if (result) all.push(result);
    } catch (error) {
      console.error(`Live-Aktivität "${source.id}"`, error);
    }
  }
  return all.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** Einträge für die Suche (⌘K / Strg+K) anmelden, z.B. Spots, Veedel, Personen. */
export function registerSearch(provider: SearchProvider): void {
  searchProviders.register(provider);
}

/** Eintrag im Menü "Ebenen" der Kartensteuerung anmelden (z.B. Kontrolle/Heat der Veedel). */
export function registerMapLayerOption(option: MapLayerOption): void {
  mapLayerOptions.register(option);
}

/** Kamera einer Stadt (Auftrag 30): Blickpunkt, Zoom am Desktop und am Handy-Bildschirm, Neigung und Drehung (3D). */
export interface CityCamera {
  id: string;
  name: string;
  center: LngLat;
  zoom: number;
  mobileZoom: number;
  /** Neigung und Drehung der schrägen Kamera in Grad (Standard wie Köln). */
  pitch?: number;
  bearing?: number;
}

/** Städte für Karte und Oberfläche: Kameras, Deutschland-Ansicht und welche Stadt gerade aktiv ist. */
export interface CityViews {
  cameras: readonly CityCamera[];
  deutschland: { center: LngLat; zoom: number };
  /** Rahmen [West, Süd, Ost, Nord] um die freien Städte: Die Deutschland-Ansicht passt sich ihm an (Auftrag 31). */
  deutschlandBounds?(state: GameState): readonly [number, number, number, number];
  active(state: GameState): string;
}

let cityViews: CityViews | null = null;

/** Städte anmelden (macht das Modul city). Ohne Anmeldung kennt die Karte nur Köln. */
export function registerCityViews(views: CityViews): void {
  cityViews = views;
  version++;
}

export function getCityViews(): CityViews | null {
  return cityViews;
}

/** Kennzahl für den Ergebnis-Bildschirm anmelden (z.B. Umsatz, Veedel, Leute). */
export function registerGameStat(stat: GameStat): void {
  gameStats.register(stat);
}

/**
 * Auf ein Spielereignis in der Oberfläche reagieren (Toast, Dialog öffnen, Sound …). Nur lesen und
 * Befehle schicken, nie den Zustand ändern. id macht die Anmeldung eindeutig (Hot Reload).
 */
export function onGameEvent<K extends EventType>(type: K, id: string, reaction: EventReaction<K>): void {
  let byId = reactions.get(type);
  if (!byId) {
    byId = new Map();
    reactions.set(type, byId);
  }
  byId.set(id, reaction as unknown as EventReaction<EventType>);
}

export function reactionsFor(type: string): EventReaction<EventType>[] {
  return [...(reactions.get(type)?.values() ?? [])];
}
