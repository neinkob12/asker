// Einstellungen der Oberfläche pro Gerät (localStorage): Überwachungs-Overlay, Kamera, Vibration.
// Ton und Musik merkt sich der Audio-Dienst selbst (src/audio).

import type { KeyValueStorage } from '../core';

export type CameraMode = '3d' | '2d';

export interface UiPrefs {
  /** Überwachungs-Overlay (Raster, Scanlines, Koordinaten) auf der Karte. */
  overlay: boolean;
  camera: CameraMode;
  /** Handy vibriert bei neuen Nachrichten (Animation und, wo möglich, echtes Vibrieren). */
  vibration: boolean;
}

export const DEFAULT_PREFS: UiPrefs = { overlay: true, camera: '3d', vibration: true };

const KEY = 'koeln-tycoon:ui';

export function loadPrefs(storage: KeyValueStorage | null): UiPrefs {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const data = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      overlay: typeof data.overlay === 'boolean' ? data.overlay : DEFAULT_PREFS.overlay,
      camera: data.camera === '2d' ? '2d' : '3d',
      vibration: typeof data.vibration === 'boolean' ? data.vibration : DEFAULT_PREFS.vibration,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: KeyValueStorage | null, prefs: UiPrefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Speicher voll oder gesperrt: Einstellungen gelten dann nur bis zum Neuladen.
  }
}
