// Hilfen für Tests. Module importieren sie aus '../../core/testing'.

import { discoverModules } from './discover';
import type { ModuleDefinition } from './module';
import { Simulation } from './sim';
import type { GameEvent, GameMode } from './types';

export interface TestGameOptions {
  seed?: number;
  mode?: GameMode;
  /** Standard: alle Module aus src/modules. */
  modules?: readonly ModuleDefinition[];
  /** Zusätzliche Module, z.B. ein Testmodul oder die Vorlage. */
  extraModules?: readonly ModuleDefinition[];
}

/** Neues Spiel für Tests, standardmäßig mit allen Modulen und Seed 1. */
export function createTestGame(options: TestGameOptions = {}): Simulation {
  const extra = options.extraModules ?? [];
  // Zusätzliche Module ersetzen gleichnamige gefundene Module (z.B. eine Kopie der Vorlage).
  const base = (options.modules ?? discoverModules()).filter((m) => !extra.some((e) => e.id === m.id));
  const modules = [...base, ...extra];
  return Simulation.create(modules, {
    seed: options.seed ?? 1,
    mode: options.mode ?? 'normal',
  });
}

/** Sammelt alle Ereignisse einer Simulation, z.B. `const events = recordEvents(sim)`. */
export function recordEvents(sim: Simulation): GameEvent[] {
  const events: GameEvent[] = [];
  sim.onEvent((e) => events.push(e));
  return events;
}

/** Ereignisse eines Typs aus einer Aufzeichnung. */
export function eventsOfType<T extends GameEvent['type']>(
  events: GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}
