// Eine laufende Spielsitzung im Browser: aktuelle Simulation, Spieltempo, Autosave, Speicherplätze,
// Export/Import und Hardcore-Regel. DOM-frei, Speicher und Zeitgeber werden hereingereicht.

import { clock } from './clock';
import { AUTOSAVE_INTERVAL_SECONDS } from './config';
import { type FrameScheduler, GameLoop } from './loop';
import type { ModuleDefinition } from './module';
import { createSaveFile, loadSimulation, parseSaveFile, serializeSave } from './persistence';
import { randomSeed } from './rng';
import { AUTOSAVE_SLOT, type KeyValueStorage, type SaveInfo, SaveStore } from './saves';
import { Simulation } from './sim';
import type { Command, CommandMeta, CommandResult, GameEvent, GameMode, GameState } from './types';

export type SessionChange = 'frame' | 'sim' | 'dispatch' | 'speed';

export interface GameSessionOptions {
  modules: readonly ModuleDefinition[];
  storage: KeyValueStorage;
  scheduler?: FrameScheduler;
  /** Echte Uhr in ms, für Zeitstempel. */
  now?: () => number;
}

export class GameSession {
  readonly modules: readonly ModuleDefinition[];
  readonly saves: SaveStore;
  readonly loop: GameLoop;
  private current: Simulation | null = null;
  private detachSim: (() => void) | null = null;
  private readonly changeListeners = new Set<(change: SessionChange) => void>();
  private readonly eventListeners = new Set<(event: GameEvent) => void>();
  private sinceAutosave = 0;
  private readonly now: () => number;
  /** Wurde der Spielstand wegen Hardcore gelöscht? */
  hardcoreDeleted = false;

  constructor(options: GameSessionOptions) {
    this.modules = options.modules;
    this.saves = new SaveStore(options.storage);
    this.now = options.now ?? (() => Date.now());
    this.loop = new GameLoop({
      scheduler: options.scheduler,
      step: (n) => {
        const sim = this.current;
        if (!sim) return;
        for (let i = 0; i < n && !sim.isOver; i++) sim.step();
      },
      frame: (dt) => {
        if (this.current && !this.current.isOver && this.loop.speed > 0) {
          this.sinceAutosave += dt;
          if (this.sinceAutosave >= AUTOSAVE_INTERVAL_SECONDS) this.autosave();
        }
        this.emitChange('frame');
      },
    });
  }

  get sim(): Simulation | null {
    return this.current;
  }

  get state(): GameState | null {
    return this.current?.state ?? null;
  }

  /** Autosave laden, falls vorhanden. Gibt true zurück, wenn ein Spiel geladen wurde. */
  continueAutosave(): boolean {
    const file = this.saves.read(AUTOSAVE_SLOT);
    if (!file) return false;
    try {
      this.setSim(loadSimulation(file.state, this.modules));
      return true;
    } catch {
      return false;
    }
  }

  newGame(mode: GameMode, seed = randomSeed()): Simulation {
    const createdAt = this.now();
    const sim = Simulation.create(this.modules, {
      seed,
      mode,
      createdAt,
      runId: `run-${createdAt.toString(36)}-${seed.toString(36)}`,
    });
    this.setSim(sim);
    this.autosave();
    return sim;
  }

  /** Speicherplatz laden. Wirft SaveError mit Text für den Spieler. */
  load(slot: string): void {
    const file = this.saves.read(slot);
    if (!file) throw new Error('Dieser Speicherplatz ist leer.');
    this.setSim(loadSimulation(file.state, this.modules));
    this.autosave();
  }

  save(slot: string, label?: string): void {
    const state = this.requireState();
    this.saves.write(slot, state, label ?? defaultLabel(state), this.now());
  }

  /** Aktuellen Stand in den Autosave schreiben. Ein beendetes Spiel wird nicht mehr überschrieben. */
  autosave(): void {
    this.sinceAutosave = 0;
    const sim = this.current;
    if (!sim || sim.isOver) return;
    this.saves.write(AUTOSAVE_SLOT, sim.state, `Autosave, ${defaultLabel(sim.state)}`, this.now());
  }

  listSaves(): SaveInfo[] {
    return this.saves.list();
  }

  deleteSave(slot: string): void {
    this.saves.remove(slot);
  }

  /** Spielstand als Datei-Inhalt. */
  exportSave(): { filename: string; content: string } {
    const state = this.requireState();
    const savedAt = this.now();
    const date = new Date(savedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return {
      filename: `koeln-tycoon-${date}.json`,
      content: serializeSave(createSaveFile(state, defaultLabel(state), savedAt)),
    };
  }

  /** Spielstand aus Datei-Inhalt laden. Wirft SaveError mit Text für den Spieler. */
  importSave(text: string): void {
    const file = parseSaveFile(text);
    this.setSim(loadSimulation(file.state, this.modules));
    this.autosave();
  }

  dispatch(command: Command, meta?: Partial<CommandMeta>): CommandResult {
    if (!this.current) return { ok: false, reason: 'Kein Spiel geladen.' };
    const result = this.current.dispatch(command, meta);
    this.emitChange('dispatch');
    return result;
  }

  setSpeed(speed: number): void {
    this.loop.setSpeed(speed);
    this.emitChange('speed');
  }

  /** Änderungen an Sitzung oder Zustand (für die UI). */
  subscribe(listener: (change: SessionChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Ereignisse der jeweils aktuellen Simulation. */
  onEvent(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private setSim(sim: Simulation): void {
    this.detachSim?.();
    this.current = sim;
    this.hardcoreDeleted = false;
    this.sinceAutosave = 0;
    this.detachSim = sim.onEvent((event) => {
      if (event.type === 'game.over') this.handleGameOver(sim);
      for (const listener of this.eventListeners) listener(event);
    });
    this.emitChange('sim');
  }

  private handleGameOver(sim: Simulation): void {
    if (sim.state.meta.mode !== 'hardcore') return;
    this.saves.removeRun(sim.state.meta.runId);
    this.hardcoreDeleted = true;
  }

  private requireState(): GameState {
    if (!this.current) throw new Error('Kein Spiel geladen.');
    return this.current.state;
  }

  private emitChange(change: SessionChange): void {
    for (const listener of this.changeListeners) listener(change);
  }
}

function defaultLabel(state: GameState): string {
  return clock.formatLong(state.time);
}
