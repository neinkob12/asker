// Einstellungen der Oberfläche pro Gerät (localStorage): Überwachungs-Overlay, Verkehr auf der Karte, Vibration.
// Die Kamera ist seit dem 13.10.2026 immer 2D, ein altes Feld camera im Speicher wird überlesen.
// Ton und Musik merkt sich der Audio-Dienst selbst (src/audio).

import type { KeyValueStorage } from '../core';

/** Verkehr als Kulisse auf der Karte (Auftrag 31): aus, wenig (halb so viele Fahrzeuge) oder normal. */
export type TrafficLevel = 'off' | 'low' | 'normal';

export interface UiPrefs {
  /** Überwachungs-Overlay (Scanlines, Rahmen, Koordinaten) auf der Karte, Standard aus. */
  overlay: boolean;
  traffic: TrafficLevel;
  /** Leise Klicks bei Schaltern und Gesten (Haptik). */
  vibration: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  overlay: false,
  traffic: 'normal',
  vibration: true,
};

const KEY = 'koeln-tycoon:ui';
/** Version der gespeicherten Einstellungen. Ab 2 (Candy-Look) ist das Overlay standardmäßig aus. */
const VERSION = 2;

export function loadPrefs(storage: KeyValueStorage | null): UiPrefs {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const data = JSON.parse(raw) as Partial<UiPrefs> & { v?: number };
    // Ältere Stände haben das Overlay nur gespeichert, weil es damals Standard war: neu starten ohne.
    const current = data.v === VERSION;
    return {
      overlay: current && typeof data.overlay === 'boolean' ? data.overlay : DEFAULT_PREFS.overlay,
      traffic: data.traffic === 'off' || data.traffic === 'low' ? data.traffic : 'normal',
      vibration: typeof data.vibration === 'boolean' ? data.vibration : DEFAULT_PREFS.vibration,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: KeyValueStorage | null, prefs: UiPrefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...prefs, v: VERSION }));
  } catch {
    // Speicher voll oder gesperrt: Einstellungen gelten dann nur bis zum Neuladen.
  }
}
