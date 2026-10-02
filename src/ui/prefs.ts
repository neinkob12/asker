// Einstellungen der Oberfläche pro Gerät (localStorage): Überwachungs-Overlay, Kamera, Vibration, Benachrichtigungen.
// Ton und Musik merkt sich der Audio-Dienst selbst (src/audio).

import type { KeyValueStorage } from '../core';

export type CameraMode = '3d' | '2d';

export interface UiPrefs {
  /** Überwachungs-Overlay (Scanlines, Rahmen, Koordinaten) auf der Karte, Standard aus. */
  overlay: boolean;
  camera: CameraMode;
  /** Handy vibriert bei neuen Nachrichten (Animation und, wo möglich, echtes Vibrieren). */
  vibration: boolean;
  /** Auch Routine als Banner (altes Verhalten). Standard: nur Dringendes, der Rest still (Badge, Verlauf). */
  moreNotifications: boolean;
}

export const DEFAULT_PREFS: UiPrefs = { overlay: false, camera: '3d', vibration: true, moreNotifications: false };

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
      camera: data.camera === '2d' ? '2d' : '3d',
      vibration: typeof data.vibration === 'boolean' ? data.vibration : DEFAULT_PREFS.vibration,
      moreNotifications:
        typeof data.moreNotifications === 'boolean' ? data.moreNotifications : DEFAULT_PREFS.moreNotifications,
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
