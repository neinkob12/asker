import { describe, expect, it } from 'vitest';
import { loadRecords, nextArcadeSeed, type RecordStorage, recordResult } from './records';

function store(initial?: string): RecordStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('koeln-tycoon:minigames', initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('Bestwerte der Spielhalle', () => {
  it('trägt ein, zählt und meldet einen neuen Bestwert erst ab dem zweiten Mal', () => {
    const s = store();
    const first = recordResult('safe', 0.6, true, s);
    expect(first).toEqual({ record: { best: 0.6, played: 1, won: 1 }, previous: null, newBest: false });
    const worse = recordResult('safe', 0.3, false, s);
    expect(worse.newBest).toBe(false);
    expect(worse.record).toEqual({ best: 0.6, played: 2, won: 1 });
    const better = recordResult('safe', 0.9, true, s);
    expect(better.newBest).toBe(true);
    expect(better.previous).toBe(0.6);
    expect(loadRecords(s).safe).toEqual({ best: 0.9, played: 3, won: 2 });
    expect(loadRecords(s).chase).toBeUndefined();
  });

  it('begrenzt die Wertung auf 0 bis 1 und übersteht kaputte Daten', () => {
    const s = store('{"records":{"chase":{"best":"x","played":-3},"nope":{"best":1}},"seq":"a"}');
    expect(loadRecords(s)).toEqual({ chase: { best: 0, played: 0, won: 0 } });
    recordResult('chase', 7, true, s);
    expect(loadRecords(s).chase?.best).toBe(1);
    expect(loadRecords(store('kein json'))).toEqual({});
  });

  it('zählt Seeds hoch und läuft weiter, wenn der Speicher nichts nimmt', () => {
    const s = store();
    expect(nextArcadeSeed(s)).toBe(1);
    expect(nextArcadeSeed(s)).toBe(2);
    const full: RecordStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('voll');
      },
    };
    expect(nextArcadeSeed(full)).toBe(1);
    expect(recordResult('brawl', 0.5, true, full).record.played).toBe(1);
  });
});
