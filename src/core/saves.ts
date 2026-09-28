// Speicherplätze im Browser (localStorage) bzw. im Speicher (Tests).

import { SAVE_SLOT_COUNT } from './config';
import { createSaveFile, parseSaveFile, type SaveFile, serializeSave } from './persistence';
import type { GameMode, GameState } from './types';

/** Minimale Schnittstelle zu einem Schlüssel-Wert-Speicher. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export const AUTOSAVE_SLOT = 'autosave';
export const MANUAL_SLOTS: readonly string[] = Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => `slot-${i + 1}`);

/** Schlüssel des Prototyps. Alte Spielstände werden verworfen. */
const LEGACY_KEYS = ['koeln-tycoon-save-v1'];

export interface SaveInfo {
  slot: string;
  label: string;
  savedAt: number;
  runId: string;
  mode: GameMode;
  time: number;
  gameOver: boolean;
}

export class SaveStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly prefix = 'koeln-tycoon:save:',
  ) {
    for (const key of LEGACY_KEYS) this.storage.removeItem(key);
  }

  write(slot: string, state: GameState, label: string, savedAt: number): void {
    this.storage.setItem(this.key(slot), serializeSave(createSaveFile(state, label, savedAt)));
  }

  read(slot: string): SaveFile | null {
    const text = this.storage.getItem(this.key(slot));
    if (!text) return null;
    try {
      return parseSaveFile(text);
    } catch {
      return null;
    }
  }

  remove(slot: string): void {
    this.storage.removeItem(this.key(slot));
  }

  /** Alle Speicherstände eines Durchgangs löschen (Hardcore bei Game Over). Gibt die Anzahl zurück. */
  removeRun(runId: string): number {
    const slots = this.list()
      .filter((s) => s.runId === runId)
      .map((s) => s.slot);
    for (const slot of slots) this.remove(slot);
    return slots.length;
  }

  list(): SaveInfo[] {
    const infos: SaveInfo[] = [];
    for (const key of this.storage.keys()) {
      if (!key.startsWith(this.prefix)) continue;
      const slot = key.slice(this.prefix.length);
      const file = this.read(slot);
      if (!file) continue;
      infos.push({
        slot,
        label: file.label,
        savedAt: file.savedAt,
        runId: file.state.meta?.runId ?? '',
        mode: file.state.meta?.mode ?? 'normal',
        time: file.state.time,
        gameOver: !!file.state.outcome?.gameOver,
      });
    }
    return infos.sort((a, b) => b.savedAt - a.savedAt);
  }

  private key(slot: string): string {
    return this.prefix + slot;
  }
}

export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    keys: () => [...data.keys()],
  };
}

/** localStorage, mit Fallback auf den Arbeitsspeicher (z.B. im privaten Modus). */
export function browserStorage(): KeyValueStorage {
  try {
    const ls = window.localStorage;
    const probe = '__koeln_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => {
        try {
          ls.setItem(k, v);
        } catch {
          // Speicher voll: Speichern ist optional.
        }
      },
      removeItem: (k) => ls.removeItem(k),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i) ?? '').filter(Boolean),
    };
  } catch {
    return memoryStorage();
  }
}
