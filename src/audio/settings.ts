// Lautstärke und Stummschalten, gemerkt pro Gerät (localStorage über KeyValueStorage aus dem Kern).

import type { KeyValueStorage } from '../core';

export interface AudioSettings {
  /** Gesamtlautstärke 0–1. */
  master: number;
  /** Musik 0–1. */
  music: number;
  /** Soundeffekte und Geräusche 0–1. */
  sfx: number;
  muted: boolean;
  /** Musik abspielen? (Effekte laufen trotzdem.) */
  musicOn: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.8,
  muted: false,
  musicOn: true,
};

export const AUDIO_SETTINGS_KEY = 'koeln-tycoon:audio';

const volume = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function loadAudioSettings(storage: KeyValueStorage | null): AudioSettings {
  const d = DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = storage?.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { ...d };
    const data = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: volume(data.master, d.master),
      music: volume(data.music, d.music),
      sfx: volume(data.sfx, d.sfx),
      muted: typeof data.muted === 'boolean' ? data.muted : d.muted,
      musicOn: typeof data.musicOn === 'boolean' ? data.musicOn : d.musicOn,
    };
  } catch {
    return { ...d };
  }
}

export function saveAudioSettings(storage: KeyValueStorage | null, settings: AudioSettings): void {
  try {
    storage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Speichern ist optional.
  }
}
