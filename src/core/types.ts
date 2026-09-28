// Grundtypen des Kerns. Module erweitern ModuleStates, GameCommands und GameEvents
// per Declaration Merging aus ihrem eigenen Ordner, z.B.:
//
//   declare module '../../core' {
//     interface ModuleStates { spots: SpotsState }
//     interface GameCommands { 'spots.found': { lng: number; lat: number } }
//     interface GameEvents { 'spots.founded': { spotId: string } }
//   }

import type { JournalEntry } from './journal';
import type { MessagesState } from './messages';
import type { OutcomeState } from './outcome';
import type { WalletState } from './wallet';

/** Wird beim Anlegen des Spielstands gewählt. */
export type GameMode = 'normal' | 'hardcore';

/** Spielzustand der Module, Schlüssel = Modul-ID. Wird von den Modulen erweitert. */
// biome-ignore lint/suspicious/noEmptyInterface: wird per Declaration Merging gefüllt
export interface ModuleStates {}

/** Alle Befehle: Typ → Payload. Wird von den Modulen erweitert. */
// biome-ignore lint/suspicious/noEmptyInterface: wird per Declaration Merging gefüllt
export interface GameCommands {}

/** Alle Ereignisse: Typ → Payload. Wird von den Modulen erweitert. */
// biome-ignore lint/suspicious/noEmptyInterface: wird per Declaration Merging gefüllt
export interface GameEvents {}

export interface GameMeta {
  /** Kennung eines Spieldurchgangs. Alle Speicherstände desselben Durchgangs teilen sie. */
  runId: string;
  mode: GameMode;
  seed: number;
  /** Echte Zeit beim Anlegen (ms seit 1970), nur zur Anzeige. */
  createdAt: number;
}

/**
 * Der komplette Spielzustand. Nur JSON-Daten: keine Klassen, keine Funktionen, kein undefined in Arrays.
 * Die UI liest ihn, verändert ihn aber nie direkt.
 */
export interface GameState {
  /** Version des Kern-Formats (siehe CORE_SCHEMA_VERSION). */
  schema: number;
  meta: GameMeta;
  /** Spielminuten seit Tag 1, 00:00 Uhr. */
  time: number;
  /** Fortlaufender Zähler für IDs, siehe ctx.nextId(). */
  nextId: number;
  /** Zustand der Zufallsgeneratoren, ein Strom pro Modul. */
  rng: Record<string, number>;
  wallet: WalletState;
  journal: JournalEntry[];
  messages: MessagesState;
  outcome: OutcomeState;
  modules: ModuleStates;
  /** Version des State-Bereichs pro Modul, für Migrationen. */
  moduleVersions: Record<string, number>;
}

export type CommandType = keyof GameCommands & string;
export type EventType = keyof GameEvents & string;

/** Ein serialisierbarer Befehl. `Command` ohne Typargument ist die Union aller Befehle. */
export type Command<K extends CommandType = CommandType> = K extends CommandType
  ? { type: K; payload: GameCommands[K] }
  : never;

export type GameEvent<K extends EventType = EventType> = K extends EventType
  ? { type: K; payload: GameEvents[K]; time: number }
  : never;

export type CommandResult = { ok: true; data?: unknown } | { ok: false; reason: string };

/** Wer einen Befehl schickt: der Spieler, das System oder ein Mitarbeiter (z.B. ein Leutnant). */
export type Actor = 'player' | 'system' | `staff:${string}`;

export interface CommandMeta {
  actor: Actor;
}

/**
 * Kontext für alles, was den Zustand verändert (tick, Befehle, Ereignisse, Schreib-APIs).
 * Jedes Modul bekommt seinen eigenen Kontext mit eigenem Zufallsstrom.
 */
export interface Ctx {
  readonly state: GameState;
  /** Modul, dem dieser Kontext gehört. */
  readonly moduleId: string;
  /** Aktuelle Spielzeit in Minuten (= state.time). */
  readonly now: number;
  /** Zufallszahl in [0, 1). Deterministisch, der Zustand liegt im Spielstand. */
  random(): number;
  /** Ganze Zufallszahl von min bis max (beide inklusive). */
  randomInt(min: number, max: number): number;
  /** true mit Wahrscheinlichkeit p (0–1). */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Ereignis melden. Zugestellt wird am Ende des Simulationsschritts bzw. Befehls. */
  emit<K extends EventType>(type: K, payload: GameEvents[K]): void;
  /** Befehl ausführen, z.B. aus der Leutnant-KI. Standard-Akteur ist 'system'. */
  dispatch(command: Command, meta?: Partial<CommandMeta>): CommandResult;
  /** Neue, im Spielstand eindeutige Zahl. */
  nextId(): number;
}
