// Spielstände lesen und schreiben, inklusive Migrationen.
// Der Kern migriert seine eigenen Felder (CORE_MIGRATIONS), jedes Modul seinen State-Bereich (migrations).

import type { ModuleDefinition } from './module';
import { CORE_SCHEMA_VERSION, Simulation } from './sim';
import type { GameState } from './types';

export const SAVE_FORMAT = 'koeln-tycoon-save';
export const SAVE_FORMAT_VERSION = 1;

/** Inhalt einer Spielstand-Datei (Export) bzw. eines Speicherplatzes. */
export interface SaveFile {
  format: typeof SAVE_FORMAT;
  formatVersion: number;
  /** Echte Zeit beim Speichern (ms). */
  savedAt: number;
  label: string;
  state: GameState;
}

/** Fehler beim Laden, mit Text für den Spieler. */
export class SaveError extends Error {}

/** Migrationen der Kernfelder. Schlüssel = Zielversion von CORE_SCHEMA_VERSION. */
const CORE_MIGRATIONS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  // 2: Gelöschte Chats (messages.hidden), Auftrag 26.
  2: (state) => {
    const messages = isRecord(state.messages) ? state.messages : {};
    return { ...state, messages: { ...messages, hidden: isRecord(messages.hidden) ? messages.hidden : {} } };
  },
  // 3: Anrufe (messages.calls mit klingelnden Anrufen und Rückrufen), Auftrag 30.
  3: (state) => {
    const messages = isRecord(state.messages) ? state.messages : {};
    const calls = isRecord(messages.calls) ? messages.calls : {};
    return {
      ...state,
      messages: {
        ...messages,
        calls: {
          ringing: Array.isArray(calls.ringing) ? calls.ringing : [],
          retries: Array.isArray(calls.retries) ? calls.retries : [],
        },
      },
    };
  },
};

export function createSaveFile(state: GameState, label: string, savedAt: number): SaveFile {
  return { format: SAVE_FORMAT, formatVersion: SAVE_FORMAT_VERSION, savedAt, label, state };
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify(file);
}

/** Datei-Inhalt prüfen und als SaveFile zurückgeben (noch ohne Migration). */
export function parseSaveFile(text: string): SaveFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('Die Datei ist kein gültiger Spielstand (kein JSON).');
  }
  if (!isRecord(data) || data.format !== SAVE_FORMAT) throw new SaveError('Die Datei ist kein Köln-Tycoon-Spielstand.');
  if (typeof data.formatVersion !== 'number' || data.formatVersion > SAVE_FORMAT_VERSION) {
    throw new SaveError('Der Spielstand stammt aus einer neueren Version des Spiels.');
  }
  if (!isRecord(data.state)) throw new SaveError('Der Spielstand ist beschädigt.');
  return data as unknown as SaveFile;
}

/**
 * Spielstand laden: Kernfelder migrieren, jedes Modul auf seine aktuelle Version bringen,
 * fehlende Module frisch anlegen. Gibt eine lauffähige Simulation zurück.
 */
export function loadSimulation(rawState: unknown, modules: readonly ModuleDefinition[]): Simulation {
  if (!isRecord(rawState)) throw new SaveError('Der Spielstand ist beschädigt.');
  let raw = structuredClone(rawState);
  const schema = raw.schema;
  if (typeof schema !== 'number') throw new SaveError('Der Spielstand ist beschädigt (keine Version).');
  if (schema > CORE_SCHEMA_VERSION) throw new SaveError('Der Spielstand stammt aus einer neueren Version des Spiels.');
  for (let v = schema + 1; v <= CORE_SCHEMA_VERSION; v++) {
    const migrate = CORE_MIGRATIONS[v];
    if (!migrate) throw new SaveError(`Keine Migration des Kerns auf Version ${v}.`);
    raw = migrate(raw);
    raw.schema = v;
  }
  for (const key of ['meta', 'wallet', 'messages', 'outcome', 'modules', 'moduleVersions', 'rng'] as const) {
    if (!isRecord(raw[key])) throw new SaveError(`Der Spielstand ist beschädigt (${key} fehlt).`);
  }
  // Zeit und nächste ID sind Ganzzahlen: Eine Bruchzahl würde den Takt (time % 60) und die IDs dauerhaft verschieben.
  if (!Number.isInteger(raw.time) || (raw.time as number) < 0 || !Array.isArray(raw.journal))
    throw new SaveError('Der Spielstand ist beschädigt.');
  if (!Number.isInteger(raw.nextId) || (raw.nextId as number) < 1)
    throw new SaveError('Der Spielstand ist beschädigt (nextId).');
  const messages = raw.messages as Record<string, unknown>;
  if (!Array.isArray(messages.list) || !isRecord(messages.contacts))
    throw new SaveError('Der Spielstand ist beschädigt (Nachrichten).');
  const wallet = raw.wallet as Record<string, unknown>;
  for (const key of ['dirty', 'clean'] as const) {
    if (typeof wallet[key] !== 'number' || !Number.isFinite(wallet[key])) {
      throw new SaveError(`Der Spielstand ist beschädigt (Geld: ${key}).`);
    }
  }

  const state = raw as unknown as GameState;
  const sim = new Simulation(modules, state);
  const moduleStates = state.modules as unknown as Record<string, unknown>;
  for (const m of sim.modules) {
    const saved = state.moduleVersions[m.id];
    // Fehlt der Zustand eines Moduls (neu dazugekommen oder in der Datei verloren), wird er frisch angelegt; ein
    // Spielstand mit Version, aber ohne Zustand lief sonst in jedem Schritt in einen Fehler.
    // (Bei älterer Version bekommt die Migration den fehlenden Zustand als undefined: Das ist erlaubt.)
    if (saved === undefined || (saved === m.version && m.init && !isRecord(moduleStates[m.id]))) {
      sim.initModule(m);
      continue;
    }
    if (saved > m.version) {
      throw new SaveError(`Der Spielstand stammt aus einer neueren Version (Modul ${m.id}).`);
    }
    for (let v = saved + 1; v <= m.version; v++) {
      const migrate = m.migrations?.[v] as ((old: unknown, state: GameState) => unknown) | undefined;
      if (!migrate) throw new SaveError(`Modul ${m.id}: keine Migration auf Version ${v}.`);
      moduleStates[m.id] = migrate(moduleStates[m.id], state);
      state.moduleVersions[m.id] = v;
    }
  }
  return sim;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
