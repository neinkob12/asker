// Modul-Vertrag. Jedes Modul unter src/modules/<id>/index.ts exportiert als default ein defineModule(...).

import type {
  CommandMeta,
  CommandResult,
  CommandType,
  Ctx,
  EventType,
  GameCommands,
  GameEvent,
  GameEvents,
  GameState,
  ModuleStates,
} from './types';

export type CommandHandler<K extends CommandType> = (
  ctx: Ctx,
  payload: GameCommands[K],
  meta: CommandMeta,
) => CommandResult | undefined;

export type EventHandler<K extends EventType> = (ctx: Ctx, payload: GameEvents[K], event: GameEvent<K>) => void;

/**
 * Migration des eigenen State-Bereichs auf die nächste Version.
 * Bekommt den alten Stand (so wie er im Spielstand lag) und gibt den neuen zurück.
 * Den Parameter selbst typisieren, z.B. `(old: SpotsStateV1): SpotsState => ...`.
 */
export type Migration = (old: never, state: GameState) => unknown;

type StateOf<Id extends string> = Id extends keyof ModuleStates ? ModuleStates[Id] : never;

export interface ModuleDefinition<Id extends string = string> {
  /** Eindeutig, gleich dem Ordnernamen unter src/modules/. */
  id: Id;
  /** Version des eigenen State-Bereichs. Hochzählen, wenn sich dessen Form ändert, und eine Migration schreiben. */
  version: number;
  /** Module, die vorher initialisiert werden und vorher ticken. Für reine API-Aufrufe zur Laufzeit nicht nötig. */
  dependsOn?: readonly string[];
  /**
   * Anfangszustand für ein neues Spiel (landet in state.modules[id]). Läuft in Abhängigkeits-Reihenfolge,
   * darf also den Zustand der Module aus dependsOn lesen. Module ohne eigenen Zustand lassen init weg.
   */
  init?: (ctx: Ctx) => StateOf<Id>;
  /** Ein Simulationsschritt. Standard: jede Spielminute. */
  tick?: (ctx: Ctx) => void;
  /** tick nur alle n Spielminuten, z.B. 60 = zur vollen Stunde, 1440 = um Mitternacht. */
  tickEvery?: number;
  /** Befehle, die dieses Modul verarbeitet. Jeder Befehlstyp gehört genau einem Modul. */
  commands?: { [K in CommandType]?: CommandHandler<K> };
  /** Reaktionen auf Ereignisse. */
  on?: { [K in EventType]?: EventHandler<K> };
  /** Schlüssel = Zielversion, z.B. { 2: (old) => neu } migriert von Version 1 auf 2. */
  migrations?: Record<number, Migration>;
  /**
   * Beitrag zur Pleite-Regel: true, solange der Spieler dank dieses Moduls weitermachen kann
   * (z.B. Ware im Lager, Lieferung unterwegs). Melden alle Module false, ist das Spiel verloren.
   */
  solvency?: (state: GameState) => boolean;
}

/** Modul definieren. Prüft den Typ des Anfangszustands gegen ModuleStates[id]. */
export function defineModule<Id extends string>(definition: ModuleDefinition<Id>): ModuleDefinition<Id> {
  return definition;
}

/**
 * Sortiert Module so, dass Abhängigkeiten zuerst kommen. Bei Gleichstand nach ID, damit die Reihenfolge
 * nicht davon abhängt, in welcher Reihenfolge die Dateien gefunden wurden.
 */
export function sortModules(modules: readonly ModuleDefinition[]): ModuleDefinition[] {
  const byId = new Map<string, ModuleDefinition>();
  for (const m of modules) {
    if (byId.has(m.id)) throw new Error(`Modul "${m.id}" ist doppelt registriert.`);
    byId.set(m.id, m);
  }
  for (const m of modules) {
    for (const dep of m.dependsOn ?? []) {
      if (!byId.has(dep)) throw new Error(`Modul "${m.id}" hängt von "${dep}" ab, das nicht registriert ist.`);
    }
  }
  const sorted: ModuleDefinition[] = [];
  const done = new Set<string>();
  const remaining = [...modules].sort((a, b) => a.id.localeCompare(b.id));
  while (remaining.length > 0) {
    const index = remaining.findIndex((m) => (m.dependsOn ?? []).every((d) => done.has(d)));
    if (index === -1) {
      throw new Error(`Zyklische Abhängigkeit zwischen Modulen: ${remaining.map((m) => m.id).join(', ')}`);
    }
    const [next] = remaining.splice(index, 1);
    sorted.push(next);
    done.add(next.id);
  }
  return sorted;
}
