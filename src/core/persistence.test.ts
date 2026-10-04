import { describe, expect, it, vi } from 'vitest';
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
    delete (old.messages as Record<string, unknown>).calls;
    const loaded = loadSimulation(old, [notesV2]);
    expect(loaded.state.schema).toBe(3);
    expect(loaded.state.messages.hidden).toEqual({});
    expect(loaded.state.messages.calls).toEqual({ ringing: [], retries: [] });
  });

  it('migriert die Kernfelder: Spielstände von Auftrag 29 (Schema 2) bekommen messages.calls', () => {
    const sim = Simulation.create([notesV2], { seed: 1 });
    const old = roundTrip(sim.state) as unknown as Record<string, unknown>;
    old.schema = 2;
    delete (old.messages as Record<string, unknown>).calls;
    const loaded = loadSimulation(old, [notesV2]);
    expect(loaded.state.schema).toBe(3);
    expect(loaded.state.messages.calls).toEqual({ ringing: [], retries: [] });
    // Und es läuft weiter (die Anruf-Prüfung jede Minute fasst die leeren Listen an).
    loaded.advance(10);
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

  it('legt einen Modulzustand, der in der Datei fehlt, frisch an, statt später in jedem Schritt zu scheitern', () => {
    const sim = Simulation.create([notesV2], { seed: 1 });
    const raw = roundTrip(sim.state) as unknown as { modules: Record<string, unknown> };
    delete raw.modules.testNotes;
    const loaded = loadSimulation(raw, [notesV2]);
    expect(loaded.state.modules.testNotes).toEqual({ lines: [], migrated: false });
    expect(() => loaded.advance(5)).not.toThrow();
  });

  it('lehnt Spielstände mit unmöglichen Zahlen ab (Zeit, Geld)', () => {
    const state = roundTrip(Simulation.create([notesV2], { seed: 1 }).state) as unknown as Record<string, unknown>;
    expect(() => loadSimulation({ ...state, time: -5 }, [notesV2])).toThrow(/beschädigt/);
    expect(() => loadSimulation({ ...state, wallet: { dirty: 'abc', clean: 0 } }, [notesV2])).toThrow(/Geld/);
    expect(() => loadSimulation({ ...state, wallet: { dirty: Number.NaN, clean: 0 } }, [notesV2])).toThrow(/Geld/);
  });

  it('lehnt Spielstände mit unmöglicher Zeit, nextId oder Nachrichten ab', () => {
    const state = roundTrip(Simulation.create([notesV2], { seed: 1 }).state) as unknown as Record<string, unknown>;
    const messages = state.messages as Record<string, unknown>;
    expect(() => loadSimulation({ ...state, time: 12.5 }, [notesV2])).toThrow(/beschädigt/);
    expect(() => loadSimulation({ ...state, nextId: 'x' }, [notesV2])).toThrow(/nextId/);
    expect(() => loadSimulation({ ...state, nextId: 3.5 }, [notesV2])).toThrow(/nextId/);
    expect(() => loadSimulation({ ...state, nextId: undefined }, [notesV2])).toThrow(/nextId/);
    expect(() => loadSimulation({ ...state, messages: { ...messages, list: {} } }, [notesV2])).toThrow(/Nachrichten/);
    expect(() => loadSimulation({ ...state, messages: { ...messages, contacts: [] } }, [notesV2])).toThrow(
      /Nachrichten/,
    );
    expect(() => loadSimulation({ ...state, messages: { ...messages, contacts: undefined } }, [notesV2])).toThrow(
      /Nachrichten/,
    );
    // Der unveränderte Stand lädt.
    expect(() => loadSimulation(state, [notesV2])).not.toThrow();
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

  it('ein Autosave, den das Spiel nicht lesen kann, wird gesichert, bevor ein neues Spiel ihn überschreibt', () => {
    const storage = memoryStorage();
    const first = makeSession(storage);
    first.newGame('normal', 5);
    // Ein Stand aus der Zukunft (Version des Moduls höher als bekannt).
    const raw = JSON.parse(storage.getItem('koeln-tycoon:save:autosave') ?? '{}');
    raw.state.moduleVersions.testNotes = 9;
    storage.setItem('koeln-tycoon:save:autosave', JSON.stringify(raw));
    const second = makeSession(storage);
    expect(second.continueAutosave()).toBe(false);
    expect(second.loadError).toMatch(/neueren Version/);
    second.newGame('normal', 6);
    // Das neue Spiel hat den Autosave überschrieben, die Kopie des alten liegt daneben.
    expect(storage.getItem('koeln-tycoon:save:autosave-defekt')).toContain('"testNotes":9');
  });

  it('Speicher voll: Speichern wirft einen verständlichen Fehler, der Autosave meldet ihn einmal statt zu werfen', () => {
    const memory = memoryStorage();
    let full = false;
    const storage = {
      ...memory,
      setItem: (k: string, v: string) => {
        if (full) throw new Error('QuotaExceededError');
        memory.setItem(k, v);
      },
    };
    const session = makeSession(storage);
    session.newGame('normal', 5);
    const changes: string[] = [];
    session.subscribe((c) => changes.push(c));
    full = true;
    expect(() => session.save(MANUAL_SLOTS[0])).toThrow(/Speicher/);
    expect(() => session.autosave()).not.toThrow();
    session.autosave();
    expect(session.autosaveError).toMatch(/Speicher/);
    expect(changes.filter((c) => c === 'autosave')).toHaveLength(1);
    full = false;
    session.autosave();
    expect(session.autosaveError).toBeNull();
    expect(changes.filter((c) => c === 'autosave')).toHaveLength(2);
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

  it('Hardcore: ein werfender UI-Zuhörer verhindert das Löschen der Spielstände nicht', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const session = new GameSession({ modules: [notesV2, bankrupt], storage: memoryStorage(), now: () => 5 });
    session.newGame('hardcore', 3);
    session.save(MANUAL_SLOTS[0]);
    const heard: string[] = [];
    session.onEvent(() => {
      throw new Error('UI kaputt');
    });
    session.onEvent((e) => heard.push(e.type));
    expect(() => goBroke(session)).not.toThrow();
    expect(session.hardcoreDeleted).toBe(true);
    expect(session.listSaves()).toEqual([]);
    expect(heard).toContain('game.over');
    error.mockRestore();
  });
});

describe('GameSession: Fehler im Spiel und im Speicher', () => {
  it('wirft ein Tick, laufen die übrigen Schritte des Bilds und das Bild (frame) trotzdem', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let ticks = 0;
    const flaky = defineModule({
      id: 'testFlaky',
      version: 1,
      tick: () => {
        ticks++;
        if (ticks === 2) throw new Error('Tick kaputt');
      },
    });
    const callbacks: ((now: number) => void)[] = [];
    const session = new GameSession({
      modules: [flaky],
      storage: memoryStorage(),
      scheduler: { request: (cb) => callbacks.push(cb), cancel: () => undefined },
    });
    session.newGame('normal', 1);
    const changes: string[] = [];
    session.subscribe((c) => changes.push(c));
    session.loop.start();
    const time = session.state?.time as number;
    callbacks[0](0);
    // Sechs Bilder à 0,25 s: Der zweite Tick wirft, die übrigen Schritte laufen weiter.
    for (let i = 1; i <= 6; i++) expect(() => callbacks[i](i * 250)).not.toThrow();
    const stepped = (session.state?.time as number) - time;
    expect(stepped).toBeGreaterThan(2);
    expect(ticks).toBe(stepped);
    expect(changes.filter((c) => c === 'frame')).toHaveLength(7);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('ein Speicher, dessen getItem wirft, gilt als leer (kein Absturz beim Lesen)', () => {
    const storage = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      keys: () => ['koeln-tycoon:autosave'],
    };
    const session = new GameSession({ modules: [notesV2], storage });
    expect(session.saves.read('autosave')).toBeNull();
    expect(() => session.continueAutosave()).not.toThrow();
    expect(session.continueAutosave()).toBe(false);
    expect(() => session.listSaves()).not.toThrow();
  });
});
