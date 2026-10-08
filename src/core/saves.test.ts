// Spiegel über einem asynchronen Speicher (Auftrag 47): synchron lesen, im Hintergrund schreiben, ausstehende
// Schreibvorgänge und alte Spielstände aus dem Notfallspeicher nachtragen.

import { describe, expect, it } from 'vitest';
import { type AsyncKeyValueBackend, memoryStorage, mirroredStorage, PENDING_PREFIX } from './saves';

/** Asynchroner Speicher im Arbeitsspeicher; `failing` lässt jedes Schreiben scheitern. */
function memoryBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const log: string[] = [];
  let failing = false;
  const backend: AsyncKeyValueBackend = {
    readAll: async () => new Map(data),
    write: async (key, value) => {
      if (failing) throw new Error('Speicher voll');
      data.set(key, value);
      log.push(`write ${key}`);
    },
    remove: async (key) => {
      if (failing) throw new Error('Speicher voll');
      data.delete(key);
      log.push(`remove ${key}`);
    },
  };
  return { backend, data, log, fail: (on: boolean) => (failing = on) };
}

describe('mirroredStorage', () => {
  it('liest den Bestand beim Öffnen und schreibt Änderungen im Hintergrund', async () => {
    const { backend, data, log } = memoryBackend({ a: '1' });
    const storage = await mirroredStorage(backend);
    expect(storage.getItem('a')).toBe('1');
    storage.setItem('b', '2');
    storage.removeItem('a');
    // Sofort sichtbar, noch bevor der Speicher bestätigt hat.
    expect(storage.getItem('b')).toBe('2');
    expect(storage.getItem('a')).toBeNull();
    expect(storage.keys()).toEqual(['b']);
    expect(storage.pendingCount).toBe(2);
    await storage.flush();
    expect(storage.pendingCount).toBe(0);
    expect([...data.entries()]).toEqual([['b', '2']]);
    expect(log).toEqual(['write b', 'remove a']);
  });

  it('meldet Schreibfehler und legt das Ausstehende beim Verlassen in den Notfallspeicher', async () => {
    const { backend, fail } = memoryBackend();
    const emergency = memoryStorage();
    const errors: unknown[] = [];
    const storage = await mirroredStorage(backend, { emergency, onError: (e) => errors.push(e) });
    fail(true);
    storage.setItem('koeln-tycoon:save:autosave', 'stand-1');
    await storage.flush();
    expect(errors).toHaveLength(1);
    expect(storage.pendingCount).toBe(1);
    storage.persistPending();
    expect(emergency.getItem(`${PENDING_PREFIX}koeln-tycoon:save:autosave`)).toBe('stand-1');
  });

  it('trägt beim nächsten Start nach, was im Notfallspeicher liegt, und räumt ihn auf', async () => {
    const { backend, data } = memoryBackend({ 'koeln-tycoon:save:autosave': 'alt' });
    const emergency = memoryStorage({ [`${PENDING_PREFIX}koeln-tycoon:save:autosave`]: 'neu' });
    const storage = await mirroredStorage(backend, { emergency });
    expect(storage.getItem('koeln-tycoon:save:autosave')).toBe('neu');
    await storage.flush();
    expect(data.get('koeln-tycoon:save:autosave')).toBe('neu');
    expect(emergency.keys()).toEqual([]);
  });

  it('übernimmt alte Spielstände aus dem localStorage und nimmt sie dort erst nach dem Schreiben weg', async () => {
    const { backend, data } = memoryBackend();
    const emergency = memoryStorage({
      'koeln-tycoon:save:slot-1': 'stand',
      'koeln-tycoon:prefs': 'bleibt',
    });
    const storage = await mirroredStorage(backend, { emergency, migratePrefix: 'koeln-tycoon:save:' });
    expect(storage.getItem('koeln-tycoon:save:slot-1')).toBe('stand');
    await storage.flush();
    expect(data.get('koeln-tycoon:save:slot-1')).toBe('stand');
    expect(emergency.getItem('koeln-tycoon:save:slot-1')).toBeNull();
    expect(emergency.getItem('koeln-tycoon:prefs')).toBe('bleibt');
  });

  it('ein Spielstand, der nicht in die Datenbank kommt, bleibt im localStorage', async () => {
    const { backend, fail } = memoryBackend();
    fail(true);
    const emergency = memoryStorage({ 'koeln-tycoon:save:slot-1': 'stand' });
    const storage = await mirroredStorage(backend, { emergency, migratePrefix: 'koeln-tycoon:save:' });
    await storage.flush();
    expect(storage.getItem('koeln-tycoon:save:slot-1')).toBe('stand');
    expect(emergency.getItem('koeln-tycoon:save:slot-1')).toBe('stand');
  });
});
