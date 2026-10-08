// Regressionstests zu Befunden aus dem Bugreview (Kern).

import { describe, expect, it, vi } from 'vitest';
import { lookFor, lookTraits } from './looks';
import { messages } from './messages';
import { defineModule } from './module';
import { SaveError } from './persistence';
import { type KeyValueStorage, memoryStorage } from './saves';
import { GameSession } from './session';
import { Simulation } from './sim';
import { wallet } from './wallet';

declare module './types' {
  interface ModuleStates {
    regressionLate: { ticks: number };
  }
}

describe('unlesbarer Speicherplatz wird vor dem Überschreiben gesichert', () => {
  const KEY = 'koeln-tycoon:save:slot-1';
  const BACKUP = 'koeln-tycoon:save:slot-1-defekt';
  const makeSession = (storage: KeyValueStorage) => {
    let time = 1_000_000;
    return new GameSession({ modules: [], storage, now: () => (time += 1000) });
  };

  it('kaputtes JSON: Platz gilt als unlesbar, Speichern legt vorher eine Kopie an', () => {
    const storage = memoryStorage({ [KEY]: '{kaputt' });
    const session = makeSession(storage);
    session.newGame('normal', 3);
    expect(session.saves.unreadable('slot-1')).toBe(true);
    expect(session.listSaves().some((s) => s.slot === 'slot-1')).toBe(false);
    session.save('slot-1');
    expect(storage.getItem(BACKUP)).toBe('{kaputt');
    expect(session.saves.unreadable('slot-1')).toBe(false);
    expect(session.listSaves().some((s) => s.slot === 'slot-1')).toBe(true);
  });

  it('Stand aus einer neueren Version: wird gesichert statt still überschrieben', () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.newGame('normal', 4);
    session.save('slot-2');
    const raw = JSON.parse(storage.getItem('koeln-tycoon:save:slot-2') ?? '{}');
    const text = JSON.stringify({ ...raw, formatVersion: 99 });
    storage.setItem(KEY, text);
    expect(session.saves.unreadable('slot-1')).toBe(true);
    session.save('slot-1');
    expect(storage.getItem(BACKUP)).toBe(text);
    expect(session.saves.read('slot-1')?.formatVersion).toBe(1);
  });

  it('leere und lesbare Plätze bleiben ohne Kopie; scheitert die Kopie, bleibt der Platz unangetastet', () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.newGame('normal', 5);
    expect(session.saves.unreadable('slot-1')).toBe(false);
    session.save('slot-1');
    session.save('slot-1');
    expect(storage.getItem(BACKUP)).toBeNull();

    // Speicher, der nur noch den Spielstand selbst schreiben würde, die Kopie aber ablehnt.
    const inner = memoryStorage({ [KEY]: '{kaputt' });
    const picky: KeyValueStorage = {
      ...inner,
      setItem: (key, value) => {
        if (key === BACKUP) throw new Error('voll');
        inner.setItem(key, value);
      },
    };
    const other = makeSession(picky);
    other.newGame('normal', 6);
    expect(() => other.save('slot-1')).toThrow(SaveError);
    expect(inner.getItem(KEY)).toBe('{kaputt');
  });
});

describe('ein werfender Tick hält spätere Module, Fristen und die Pleite-Regel nicht an', () => {
  const broken = defineModule({
    id: 'regressionBroken',
    version: 1,
    tick: () => {
      throw new Error('Tick kaputt');
    },
  });
  const late = defineModule({
    id: 'regressionLate',
    version: 1,
    dependsOn: ['regressionBroken'],
    init: () => ({ ticks: 0 }),
    tick: (ctx) => {
      ctx.state.modules.regressionLate.ticks += 1;
    },
    solvency: (state) => wallet.balance(state) > 0,
  });
  const contact = { id: 'other:regression', name: 'Testfigur', kind: 'other' as const };

  it('der Fehler kommt an, die übrigen Module ticken, Fristen laufen ab, Pleite greift', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sim = Simulation.create([broken, late], { seed: 1 });
    const id = messages.send(sim.ctx('regressionLate'), {
      contact,
      text: 'Bis gleich?',
      options: [{ id: 'ok', label: 'Ok' }],
      expiresIn: 3,
    });
    for (let i = 0; i < 3; i++) expect(() => sim.step()).toThrow('Tick kaputt');
    expect(sim.state.modules.regressionLate.ticks).toBe(3);
    expect(messages.get(sim.state, id)?.expired).toBe(true);

    wallet.lose(sim.ctx('test'), wallet.balance(sim.state) + 10_000);
    expect(() => sim.step()).toThrow('Tick kaputt');
    expect(sim.state.outcome.gameOver?.reason).toBe('bankrupt');
    error.mockRestore();
  });
});

describe('Haarstil Afro mit männlicher Farbform', () => {
  it('heißt "schwarzer Afro", nicht "schwarze Afro"', () => {
    const look = { ...lookFor('regression'), hair: 'afro' as const, hat: 'none' as const, hairColor: 0 };
    expect(lookTraits(look)).toContain('schwarzer Afro');
    expect(lookTraits({ ...look, hairColor: 3 })).toContain('blonder Afro');
  });
});
