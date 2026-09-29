// Layout-Hilfen der Shell: Handy- oder Desktop-Aufbau, Icons und Kürzel der Tabs, Einordnung der HUD-Einträge.

import { useEffect, useState } from 'preact/hooks';
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

/** Handy-Aufbau (Handy bildschirmfüllend, Leiste unten) oder Desktop (Handy rechts angedockt)? */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => matches(MOBILE_QUERY));
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
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

/** Tastenkürzel aller Tabs: eigenes shortcut oder erster freier Buchstabe des Titels. */
export function tabShortcuts(): Map<string, string> {
  const used = new Set(RESERVED);
  const result = new Map<string, string>();
  const tabs = sidebarTabs.list();
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
  return result;
}

export function hudPlacement(item: HudItem): NonNullable<HudItem['placement']> {
  if (item.placement) return item.placement;
  return item.order >= 90 ? 'time' : 'more';
}
