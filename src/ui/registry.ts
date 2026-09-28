// Registries für Oberflächen. Module melden hier aus src/modules/<id>/ui/index.tsx an, was sie zeigen:
// HUD-Anzeigen, Seitenleisten-Tabs, Beiträge zu Slots, Panels, Dialoge, Handy-Apps und Reaktionen auf Ereignisse.
// Anmelden mit derselben ID ersetzt den alten Eintrag (wichtig für Hot Reload).

import type { ComponentType } from 'preact';
import type { EventType, GameEvents, GameState } from '../core';
import type { UiApi } from './runtime';

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
// biome-ignore lint/suspicious/noEmptyInterface: wird per Declaration Merging gefüllt
export interface SlotRegistry {}

export type PanelId = keyof PanelRegistry & string;
export type DialogId = keyof DialogRegistry & string;
export type SlotName = (keyof SlotRegistry & string) | `tab:${string}`;
export type SlotProps<N extends SlotName> = N extends keyof SlotRegistry ? SlotRegistry[N] : Record<string, never>;

export interface HudItem {
  id: string;
  /** Kleiner = weiter links. Kern: Geld 10, Uhr 90. */
  order: number;
  component: ComponentType;
}

export interface SidebarTab {
  id: string;
  title: string;
  order: number;
  /** Ohne Komponente zeigt der Tab den Slot 'tab:<id>'. */
  component?: ComponentType;
  /** Zahl am Tab, z.B. offene Aufgaben. 0 = keine. */
  badge?: (state: GameState) => number;
}

export interface SlotContribution<N extends SlotName = SlotName> {
  id: string;
  order: number;
  component: ComponentType<SlotProps<N>>;
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
}

export interface PhoneApp {
  id: string;
  name: string;
  /** Emoji oder kurzer Text, bis Auftrag 14 ein Icon-Set bringt. */
  icon: string;
  order: number;
  component: ComponentType;
  /** Zahl am App-Icon (z.B. ungelesene Nachrichten). */
  badge?: (state: GameState) => number;
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
const slots = new Map<string, Registry<SlotContribution>>();
const reactions = new Map<string, Map<string, EventReaction<EventType>>>();

export function registerHudItem(item: HudItem): void {
  hudItems.register(item);
}

export function registerTab(tab: SidebarTab): void {
  sidebarTabs.register(tab);
}

/** Inhalt in einen Slot hängen, z.B. registerSlot('tab:business', {...}) oder registerSlot('spots.spotPanel', {...}). */
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
