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
    try {
      // getItem kann werfen (gesperrter Speicher, z.B. privates Fenster): dann gilt der Platz als leer.
      const text = this.storage.getItem(this.key(slot));
      if (!text) return null;
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

// --- Asynchroner Speicher mit Spiegel (Auftrag 47) ---
//
// localStorage ist synchron und auf etwa 5 MB begrenzt: Ein Spielstand mit allen Städten hat 1,4 MB, Autosave plus drei
// Speicherplätze passen nicht mehr hinein, und jeder Autosave blockierte den Hauptthread. Deshalb liegen die Spielstände
// in IndexedDB. Damit SaveStore und Sitzung synchron bleiben, liest alles aus einem Spiegel im Arbeitsspeicher, der beim
// Start einmal gefüllt wird; Schreibvorgänge laufen danach im Hintergrund. Noch nicht bestätigte Schreibvorgänge werden
// beim Verlassen der Seite in den Notfallspeicher (localStorage) gelegt und beim nächsten Start nachgetragen.

/** Ein Schlüssel-Wert-Speicher, der asynchron arbeitet (IndexedDB, in Tests ein Map). */
export interface AsyncKeyValueBackend {
  readAll(): Promise<Map<string, string>>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface MirroredStorage extends KeyValueStorage {
  /** Wartet, bis alle angestoßenen Schreibvorgänge durch sind (Tests, Export). */
  flush(): Promise<void>;
  /** Noch nicht bestätigte Schreibvorgänge in den Notfallspeicher legen (beim Verlassen der Seite). */
  persistPending(): void;
  /** Wie viele Schreibvorgänge noch ausstehen. */
  readonly pendingCount: number;
}

export interface MirroredStorageOptions {
  /** Schreibfehler im Hintergrund (Speicher voll, Datenbank weg). Wird je Fehler einmal gerufen. */
  onError?: (error: unknown) => void;
  /** Synchroner Notfallspeicher (localStorage) für ausstehende Schreibvorgänge und alte Spielstände. */
  emergency?: KeyValueStorage | null;
  /** Schlüssel, die aus dem Notfallspeicher übernommen werden (alte Spielstände aus localStorage). */
  migratePrefix?: string;
}

/** Präfix für ausstehende Schreibvorgänge im Notfallspeicher. */
export const PENDING_PREFIX = 'koeln-tycoon:pending:';
/** Markierung für ein ausstehendes Löschen. */
const PENDING_DELETE = '\u0000delete';

/**
 * Spiegel über einem asynchronen Speicher. Liest alles einmal ein, trägt ausstehende und alte Einträge aus dem
 * Notfallspeicher nach und liefert dann einen synchronen Speicher, dessen Schreibvorgänge im Hintergrund laufen.
 */
export async function mirroredStorage(
  backend: AsyncKeyValueBackend,
  options: MirroredStorageOptions = {},
): Promise<MirroredStorage> {
  const mirror = await backend.readAll();
  const emergency = options.emergency ?? null;
  /** Schreibvorgänge, die der Speicher noch nicht bestätigt hat (Wert oder Löschen). */
  const pending = new Map<string, string>();
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (key: string, value: string) => {
    pending.set(key, value);
    chain = chain.then(async () => {
      try {
        if (value === PENDING_DELETE) await backend.remove(key);
        else await backend.write(key, value);
        // Inzwischen etwas Neues für den Schlüssel? Dann bleibt das ausstehend.
        if (pending.get(key) === value) pending.delete(key);
        emergency?.removeItem(PENDING_PREFIX + key);
      } catch (error) {
        options.onError?.(error);
      }
    });
  };

  // Beim letzten Verlassen der Seite nicht mehr bestätigte Schreibvorgänge und alte Spielstände nachtragen.
  if (emergency) {
    for (const key of emergency.keys()) {
      if (key.startsWith(PENDING_PREFIX)) {
        const value = emergency.getItem(key);
        const real = key.slice(PENDING_PREFIX.length);
        if (value === PENDING_DELETE) mirror.delete(real);
        else if (value !== null) mirror.set(real, value);
        if (value !== null) enqueue(real, value);
      } else if (options.migratePrefix && key.startsWith(options.migratePrefix) && !mirror.has(key)) {
        const value = emergency.getItem(key);
        if (value === null) continue;
        mirror.set(key, value);
        enqueue(key, value);
        // Erst aus dem alten Speicher nehmen, wenn der neue ihn hat (sonst wäre er bei einem Fehler weg).
        chain = chain.then(() => {
          if (!pending.has(key)) emergency.removeItem(key);
        });
      }
    }
  }

  return {
    getItem: (key) => mirror.get(key) ?? null,
    setItem: (key, value) => {
      mirror.set(key, value);
      enqueue(key, value);
    },
    removeItem: (key) => {
      mirror.delete(key);
      enqueue(key, PENDING_DELETE);
    },
    keys: () => [...mirror.keys()],
    flush: () => chain,
    persistPending: () => {
      if (!emergency) return;
      for (const [key, value] of pending) {
        try {
          emergency.setItem(PENDING_PREFIX + key, value);
        } catch {
          // Notfallspeicher voll: Dann bleibt nur der letzte bestätigte Stand.
        }
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

const DB_NAME = 'koeln-tycoon';
const DB_STORE = 'kv';
/** Länger darf das Öffnen der Datenbank nicht dauern, sonst bleibt es beim localStorage. */
const OPEN_TIMEOUT_MS = 4000;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB-Fehler'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'));
  });
}

/** IndexedDB als asynchroner Speicher. Wirft, wenn sie sich nicht öffnen lässt (privates Fenster, Zeitüberschreitung). */
export async function indexedDbBackend(): Promise<AsyncKeyValueBackend> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB gibt es hier nicht.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB antwortet nicht.')), OPEN_TIMEOUT_MS);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('IndexedDB ließ sich nicht öffnen.'));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB ist blockiert.'));
    };
  });
  return {
    async readAll() {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const [keys, values] = await Promise.all([
        requestToPromise(store.getAllKeys()),
        requestToPromise(store.getAll() as IDBRequest<unknown[]>),
      ]);
      const map = new Map<string, string>();
      keys.forEach((key, i) => {
        const value = values[i];
        if (typeof key === 'string' && typeof value === 'string') map.set(key, value);
      });
      return map;
    },
    async write(key, value) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      await transactionDone(tx);
    },
    async remove(key) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      await transactionDone(tx);
    },
  };
}

/**
 * Speicher für die Spielstände im Browser: IndexedDB mit Spiegel, sonst localStorage wie bisher. Alte Spielstände aus
 * dem localStorage wandern beim ersten Start in die Datenbank.
 */
export async function openBrowserSaveStorage(onError?: (error: unknown) => void): Promise<KeyValueStorage> {
  const local = browserStorage();
  try {
    const backend = await indexedDbBackend();
    return await mirroredStorage(backend, { onError, emergency: local, migratePrefix: 'koeln-tycoon:save:' });
  } catch (error) {
    console.warn('Spielstände bleiben im localStorage (IndexedDB nicht verfügbar).', error);
    return local;
  }
}
