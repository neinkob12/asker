// Eine laufende Spielsitzung im Browser: aktuelle Simulation, Spieltempo, Autosave, Speicherplätze,
// Export/Import und Hardcore-Regel. DOM-frei, Speicher und Zeitgeber werden hereingereicht.

import { clock } from './clock';
import { AUTOSAVE_INTERVAL_SECONDS } from './config';
import { type FrameScheduler, GameLoop } from './loop';
import type { ModuleDefinition } from './module';
import { createSaveFile, loadSimulation, parseSaveFile, SaveError, serializeSave } from './persistence';
import { randomSeed } from './rng';
import { AUTOSAVE_SLOT, BROKEN_AUTOSAVE_SLOT, type KeyValueStorage, type SaveInfo, SaveStore } from './saves';
import { Simulation } from './sim';
import type { Command, CommandMeta, CommandResult, GameEvent, GameMode, GameState } from './types';

export type SessionChange = 'frame' | 'sim' | 'dispatch' | 'speed' | 'autosave';

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
  /** Hat sich seit dem letzten Autosave etwas geändert (Schritte, Befehle)? Sonst schreibt der Takt nichts. */
  private dirty = false;
  private readonly now: () => number;
  /** Wurde der Spielstand wegen Hardcore gelöscht? */
  hardcoreDeleted = false;
  /** Warum der letzte Autosave nicht geklappt hat (null = alles gut). Ändert er sich, meldet die Sitzung 'autosave'. */
  autosaveError: string | null = null;
  /** Warum der Autosave beim Start nicht geladen werden konnte (er wurde dann als "autosave-defekt" gesichert). */
  loadError: string | null = null;

  constructor(options: GameSessionOptions) {
    this.modules = options.modules;
    this.saves = new SaveStore(options.storage);
    this.now = options.now ?? (() => Date.now());
    this.loop = new GameLoop({
      scheduler: options.scheduler,
      step: (n) => {
        const sim = this.current;
        if (!sim) return;
        if (n > 0) this.dirty = true;
        // Wirft ein Schritt, gehen die übrigen Schritte dieses Bilds nicht verloren (der Fehler wird gemeldet).
        for (let i = 0; i < n && !sim.isOver; i++) {
          try {
            sim.step();
          } catch (error) {
            console.error('Fehler in der Simulation', error);
          }
        }
      },
      frame: (dt) => {
        // Auch in der Pause: Wer pausiert, etwas kauft und den Tab schließt, verliert sonst den Kauf. Ohne Änderung
        // (Pause, nichts getan) wird nichts geschrieben (Auftrag 47).
        if (this.current && !this.current.isOver) {
          this.sinceAutosave += dt;
          if (this.dirty && this.sinceAutosave >= AUTOSAVE_INTERVAL_SECONDS) this.autosave();
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
    this.loadError = null;
    const file = this.saves.read(AUTOSAVE_SLOT);
    if (!file) {
      // Es gibt Daten, aber sie sind nicht lesbar (beschädigt)? Sichern, bevor ein neues Spiel sie überschreibt.
      if (this.saves.backup(AUTOSAVE_SLOT, BROKEN_AUTOSAVE_SLOT)) {
        this.loadError = 'Der Autosave ist beschädigt.';
      }
      return false;
    }
    try {
      this.setSim(loadSimulation(file.state, this.modules));
      return true;
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Der Autosave ließ sich nicht laden.';
      this.saves.backup(AUTOSAVE_SLOT, BROKEN_AUTOSAVE_SLOT);
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
    // Daten, die das Spiel nicht lesen kann, wirken im Dialog leer: vor dem Überschreiben sichern wie beim Autosave
    // ("<platz>-defekt"); klappt das nicht, bleibt der Platz unangetastet.
    if (this.saves.unreadable(slot) && !this.saves.backup(slot, `${slot}-defekt`)) {
      throw new SaveError(
        'Auf diesem Speicherplatz liegt ein Stand, den das Spiel nicht lesen kann, und er ließ sich nicht sichern. Nimm einen anderen Platz.',
      );
    }
    this.saves.write(slot, state, label ?? defaultLabel(state), this.now());
  }

  /** Aktuellen Stand in den Autosave schreiben. Ein beendetes Spiel wird nicht mehr überschrieben. */
  autosave(): void {
    this.sinceAutosave = 0;
    this.dirty = false;
    const sim = this.current;
    if (!sim || sim.isOver) return;
    try {
      this.saves.write(AUTOSAVE_SLOT, sim.state, `Autosave, ${defaultLabel(sim.state)}`, this.now());
      if (this.autosaveError !== null) {
        this.autosaveError = null;
        this.emitChange('autosave');
      }
    } catch (error) {
      // Der Autosave läuft mitten im Spiel: nicht werfen, sondern einmal melden (UI), bis es wieder klappt.
      const message = error instanceof Error ? error.message : 'Der Autosave hat nicht geklappt.';
      if (this.autosaveError !== message) {
        this.autosaveError = message;
        this.emitChange('autosave');
      }
    }
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
    this.dirty = true;
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
    this.dirty = true;
    this.detachSim = sim.onEvent((event) => {
      // Zuerst die Hardcore-Regel (Spielstände löschen), damit kein UI-Zuhörer sie verhindern kann.
      if (event.type === 'game.over') {
        try {
          this.handleGameOver(sim);
        } catch (error) {
          console.error('Fehler beim Beenden des Spiels', error);
        }
      }
      for (const listener of [...this.eventListeners]) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Fehler in einem Ereignis-Zuhörer (${event.type})`, error);
        }
      }
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
