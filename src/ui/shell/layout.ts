// Layout-Hilfen der Shell: Handy- oder Desktop-Aufbau, Icons und Kürzel der Tabs, Einordnung der HUD-Einträge.

import { useEffect, useState } from 'preact/hooks';
import type { GameState } from '../../core';
import { type HudItem, type SidebarTab, sidebarTabs } from '../registry';

/** Gleiche Breite wie MOBILE_BREAKPOINT in src/map/config.ts und die Media Queries in tokens.css. */
const MOBILE_QUERY = '(max-width: 760px)';

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** Echtes Handy: schmal und mit dem Finger bedient (dann zeichnet das Spiel keine zweite Statusleiste). */
const PHONE_DEVICE_QUERY = '(max-width: 760px) and (pointer: coarse)';

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

/** Handy-Aufbau (Handy bildschirmfüllend, Leiste unten) oder Desktop (Handy rechts angedockt)? */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/**
 * Läuft das Spiel auf einem echten Handy? Dann hat das Gerät selbst Statusleiste, Kamera und Home-Balken; das
 * Spiel-Handy zeichnet sie nicht noch einmal (docs/handy-design.md, Abschnitt 7).
 */
export function useIsPhoneDevice(): boolean {
  return useMediaQuery(PHONE_DEVICE_QUERY);
}

export function isMobileLayout(): boolean {
  return matches(MOBILE_QUERY);
}

/** Icons für Tabs, die selbst keins angeben. */
const TAB_ICONS: Record<string, string> = {
  business: 'briefcase',
  territory: 'map',
  staff: 'users',
  gangs: 'skull',
  journal: 'newspaper',
};

/** Bedeutungsfarbe der App-Kachel eines Tabs im Handy (eine Farbe = eine Bedeutung, siehe docs/handy-design.md). */
const TAB_TINTS: Record<string, string> = {
  business: 'brand',
  territory: 'place',
  staff: 'people',
  gangs: 'danger',
  journal: 'log',
};

export function tabTint(tab: SidebarTab): string {
  return TAB_TINTS[tab.id] ?? 'system';
}

export function tabIcon(tab: SidebarTab): string {
  return tab.icon ?? TAB_ICONS[tab.id] ?? 'grid';
}

/** Buchstaben, die schon anders belegt sind (T = Handy, K = Suche mit ⌘/Strg). */
const RESERVED = new Set(['T', 'K']);

/**
 * Tastenkürzel aller Tabs: eigenes shortcut oder erster freier Buchstabe des Titels. Mit Zustand fehlen Tabs, die
 * gerade ausgeblendet sind (hiddenWhen, z.B. am Anfang noch nicht freigeschaltet); die Buchstaben der übrigen bleiben
 * dabei dieselben.
 */
export function tabShortcuts(state?: GameState | null): Map<string, string> {
  const used = new Set(RESERVED);
  const result = new Map<string, string>();
  const tabs = sidebarTabs.list().filter((t) => !t.hidden);
  for (const tab of tabs) {
    const own = tab.shortcut?.toUpperCase();
    if (own && !used.has(own)) {
      used.add(own);
      result.set(tab.id, own);
    }
  }
  for (const tab of tabs) {
    if (result.has(tab.id)) continue;
    const letter = [...tab.title.toUpperCase()].find((c) => /[A-ZÄÖÜ]/.test(c) && !used.has(c));
    if (letter) {
      used.add(letter);
      result.set(tab.id, letter);
    }
  }
  if (state) for (const tab of tabs) if (tab.hiddenWhen?.(state) || tab.lockedWhen?.(state)) result.delete(tab.id);
  return result;
}

export function hudPlacement(item: HudItem): NonNullable<HudItem['placement']> {
  if (item.placement) return item.placement;
  return item.order >= 90 ? 'time' : 'more';
}

/*
 * „Karte zuerst“ (Handy-Bildschirm, Standard seit 14.10.2026): Statt des Spiel-Handys im Vollbild bleibt die Karte der
 * Grund, unten liegt das Dock als feste Leiste. Zurück zum alten Aufbau mit `?ui=alt`, wieder an mit `?ui=karte`
 * (merkt sich das Gerät). Farbvariante mit `?akzent=neon` bzw. `?akzent=gold`.
 */
const PROTO_KEY = 'koeln-tycoon:ui-proto';
const ACCENT_KEY = 'koeln-tycoon:ui-accent';

function protoFlag(param: string, key: string, on: string[], off: string): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get(param);
    if (value === off) window.localStorage.removeItem(key);
    else if (value && on.includes(value)) window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

const MAP_FIRST = protoFlag('ui', PROTO_KEY, ['karte', 'alt'], '') !== 'alt';
const ACCENT = protoFlag('akzent', ACCENT_KEY, ['neon'], 'gold');

/** „Karte zuerst“ aktiv? Nur im Handy-Aufbau, außer das Gerät hat `?ui=alt` gewählt. */
export function useMapFirst(): boolean {
  return useIsMobile() && MAP_FIRST;
}

/** Farbvariante des Prototyps ('neon') oder null. */
export function protoAccent(): string | null {
  return MAP_FIRST ? ACCENT : null;
}
