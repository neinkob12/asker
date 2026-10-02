// Speicherplätze im Browser (localStorage) bzw. im Speicher (Tests).

import { SAVE_SLOT_COUNT } from './config';
import { createSaveFile, parseSaveFile, SaveError, type SaveFile, serializeSave } from './persistence';
import type { GameMode, GameState } from './types';

/** Minimale Schnittstelle zu einem Schlüssel-Wert-Speicher. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  /** Wirft, wenn nicht gespeichert werden kann (Speicher voll oder gesperrt). */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export const AUTOSAVE_SLOT = 'autosave';
/** Ein Autosave, den das Spiel nicht lesen konnte, liegt hier (bis zum nächsten Mal) als Kopie. */
export const BROKEN_AUTOSAVE_SLOT = 'autosave-defekt';
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

  /** Speichern. Wirft SaveError mit Text für den Spieler, wenn der Speicher voll oder gesperrt ist. */
  write(slot: string, state: GameState, label: string, savedAt: number): void {
    try {
      this.storage.setItem(this.key(slot), serializeSave(createSaveFile(state, label, savedAt)));
    } catch {
      throw new SaveError(
        'Speichern hat nicht geklappt: Der Speicher des Browsers ist voll oder gesperrt. Exportiere den Spielstand als Datei (Einstellungen › Verlauf).',
      );
    }
  }

  /**
   * Den Inhalt eines Speicherplatzes unverändert unter einem zweiten Namen sichern (z.B. einen Autosave, den das Spiel
   * nicht lesen kann, bevor ein neues Spiel ihn überschreibt). false, wenn nichts da ist oder das Sichern scheitert.
   */
  backup(slot: string, name: string): boolean {
    try {
      const text = this.storage.getItem(this.key(slot));
      if (!text) return false;
      this.storage.setItem(this.key(name), text);
      return true;
    } catch {
      return false;
    }
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
      // Fehler (Speicher voll) gehen nach oben: Die Sitzung meldet sie, statt "Gespeichert." zu behaupten.
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i) ?? '').filter(Boolean),
    };
  } catch {
    return memoryStorage();
  }
}
