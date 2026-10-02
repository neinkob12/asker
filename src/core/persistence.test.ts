import { describe, expect, it } from 'vitest';
import { defineModule, type ModuleDefinition } from './module';
import { createSaveFile, loadSimulation, parseSaveFile, SaveError, serializeSave } from './persistence';
import { MANUAL_SLOTS, memoryStorage } from './saves';
import { GameSession } from './session';
import { Simulation } from './sim';
import type { GameState } from './types';
import { wallet } from './wallet';

// Ein Testmodul, das zwischen zwei Spielversionen seine State-Form ändert.
interface NotesStateV1 {
  text: string;
}
interface NotesState {
  lines: string[];
  migrated: boolean;
}

declare module './types' {
  interface ModuleStates {
    testNotes: NotesState;
  }
}

const notesV1 = {
  id: 'testNotes',
  version: 1,
  init: (): NotesStateV1 => ({ text: 'a\nb' }),
} as unknown as ModuleDefinition;

const notesV2 = defineModule({
  id: 'testNotes',
  version: 2,
  init: () => ({ lines: [], migrated: false }),
  migrations: {
    2: (old: NotesStateV1): NotesState => ({ lines: old.text.split('\n'), migrated: true }),
  },
});

const extra = defineModule({ id: 'testExtra', version: 1 });

const roundTrip = (state: GameState) => parseSaveFile(serializeSave(createSaveFile(state, 'Test', 0))).state;

describe('Speichern und Laden', () => {
  it('ein gespeicherter Stand lädt identisch und läuft deterministisch weiter', () => {
    const sim = Simulation.create([notesV2], { seed: 9 });
    sim.advance(123);
    const loaded = loadSimulation(roundTrip(sim.state), [notesV2]);
    expect(loaded.state).toEqual(sim.state);
    sim.advance(500);
    loaded.advance(500);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(sim.state));
  });

  it('migriert den State-Bereich eines Moduls auf die neue Version', () => {
    const old = Simulation.create([notesV1], { seed: 1 });
    expect(old.state.moduleVersions.testNotes).toBe(1);
    const loaded = loadSimulation(roundTrip(old.state), [notesV2]);
    expect(loaded.state.modules.testNotes).toEqual({ lines: ['a', 'b'], migrated: true });
    expect(loaded.state.moduleVersions.testNotes).toBe(2);
  });

  it('migriert die Kernfelder: Spielstände ohne gelöschte Chats bekommen messages.hidden', () => {
    const sim = Simulation.create([notesV2], { seed: 1 });
    const old = roundTrip(sim.state) as unknown as Record<string, unknown>;
    old.schema = 1;
    delete (old.messages as Record<string, unknown>).hidden;
    const loaded = loadSimulation(old, [notesV2]);
    expect(loaded.state.schema).toBe(2);
    expect(loaded.state.messages.hidden).toEqual({});
  });

  it('legt Module, die im Spielstand fehlen, frisch an', () => {
    const old = Simulation.create([notesV2], { seed: 1 });
    const loaded = loadSimulation(roundTrip(old.state), [notesV2, extra]);
    expect(loaded.state.moduleVersions.testExtra).toBe(1);
  });

  it('lehnt Spielstände aus neueren Versionen ab', () => {
    const state = roundTrip(Simulation.create([notesV2], { seed: 1 }).state);
    expect(() => loadSimulation(state, [notesV1])).toThrow(SaveError);
    expect(() => loadSimulation({ ...state, schema: 999 }, [notesV2])).toThrow(/neueren Version/);
  });

  it('fehlt eine Migration, gibt es eine verständliche Fehlermeldung', () => {
    const noMigration = { ...notesV2, migrations: {} } as ModuleDefinition;
    const state = roundTrip(Simulation.create([notesV1], { seed: 1 }).state);
    expect(() => loadSimulation(state, [noMigration])).toThrow(/keine Migration/);
  });

  it('erkennt kaputte Dateien', () => {
    expect(() => parseSaveFile('kein json')).toThrow(SaveError);
    expect(() => parseSaveFile('{"format":"anderes-spiel"}')).toThrow(/kein Köln-Tycoon/);
    expect(() => loadSimulation({ schema: 1 }, [notesV2])).toThrow(/beschädigt/);
  });
});

describe('GameSession: Speicherplätze, Autosave, Export und Hardcore', () => {
  const makeSession = (storage = memoryStorage()) => {
    let time = 1_000_000;
    return new GameSession({ modules: [notesV2], storage, now: () => (time += 1000) });
  };

  it('schreibt beim neuen Spiel einen Autosave und setzt ihn beim nächsten Start fort', () => {
    const storage = memoryStorage();
    const first = makeSession(storage);
    first.newGame('normal', 5);
    first.sim?.advance(30);
    first.autosave();
    const second = makeSession(storage);
    expect(second.continueAutosave()).toBe(true);
    expect(second.state?.time).toBe(first.state?.time);
  });

  it('speichert und lädt Speicherplätze', () => {
    const session = makeSession();
    session.newGame('normal', 5);
    session.save(MANUAL_SLOTS[0]);
    const saved = session.state?.time;
    session.sim?.advance(100);
    session.load(MANUAL_SLOTS[0]);
    expect(session.state?.time).toBe(saved);
    expect(session.listSaves().map((s) => s.slot)).toEqual(expect.arrayContaining(['autosave', MANUAL_SLOTS[0]]));
  });

  it('exportiert und importiert als JSON-Datei', () => {
    const a = makeSession();
    a.newGame('hardcore', 11);
    a.sim?.advance(77);
    const file = a.exportSave();
    expect(file.filename).toMatch(/^koeln-tycoon-.*\.json$/);
    const b = makeSession();
    b.importSave(file.content);
    expect(b.state).toEqual(a.state);
    expect(() => b.importSave('{}')).toThrow(SaveError);
  });

  const bankrupt = defineModule({ id: 'testBroke', version: 1, solvency: (s) => wallet.balance(s) > 0 });
  const goBroke = (session: GameSession) => {
    const sim = session.sim as Simulation;
    wallet.lose(sim.ctx('test'), 1e9);
    sim.step();
    expect(sim.isOver).toBe(true);
  };

  it('Normal: nach Game Over bleiben die Spielstände, der Autosave wird nicht überschrieben', () => {
    const session = new GameSession({ modules: [notesV2, bankrupt], storage: memoryStorage() });
    session.newGame('normal', 1);
    session.save(MANUAL_SLOTS[1]);
    goBroke(session);
    session.autosave();
    expect(session.saves.read('autosave')?.state.outcome.gameOver).toBeNull();
    expect(session.listSaves()).toHaveLength(2);
    expect(session.hardcoreDeleted).toBe(false);
  });

  it('Hardcore: bei Game Over werden alle Spielstände des Durchgangs gelöscht', () => {
    const storage = memoryStorage();
    const other = new GameSession({ modules: [notesV2, bankrupt], storage });
    other.newGame('normal', 2);
    other.save(MANUAL_SLOTS[2]);

    const session = new GameSession({ modules: [notesV2, bankrupt], storage, now: () => 5 });
    session.newGame('hardcore', 3);
    session.save(MANUAL_SLOTS[0]);
    session.save(MANUAL_SLOTS[1]);
    goBroke(session);
    expect(session.hardcoreDeleted).toBe(true);
    const left = session.listSaves();
    expect(left.map((s) => s.slot)).toEqual([MANUAL_SLOTS[2]]);
  });
});
