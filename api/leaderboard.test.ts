import { describe, expect, it } from 'vitest';
import { parseEntry } from './leaderboard';

const valid = {
  runId: 'run_abc123',
  name: '  Jakob\n ',
  score: 12345.6,
  days: 4,
  veedel: 1,
  outcome: 'killed',
  mode: 'hardcore',
  title: '',
  quests: 7,
};

describe('api/leaderboard: Eintrag prüfen', () => {
  it('bereinigt Name und Zahlen', () => {
    expect(parseEntry(valid, 1000)).toEqual({
      runId: 'run_abc123',
      name: 'Jakob',
      score: 12346,
      days: 4,
      veedel: 1,
      outcome: 'killed',
      mode: 'hardcore',
      title: null,
      quests: 7,
      at: 1000,
    });
  });

  it('ohne Namen heißt man Anonym, zu lange Namen werden gekürzt', () => {
    expect(parseEntry({ ...valid, name: '' }, 0)?.name).toBe('Anonym');
    expect(parseEntry({ ...valid, name: 'x'.repeat(50) }, 0)?.name).toHaveLength(20);
  });

  it('lehnt Unsinn ab', () => {
    expect(parseEntry(null, 0)).toBeNull();
    expect(parseEntry({ ...valid, runId: 'a b' }, 0)).toBeNull();
    expect(parseEntry({ ...valid, score: 'viel' }, 0)).toBeNull();
    expect(parseEntry({ ...valid, outcome: 'cheat' }, 0)).toBeNull();
  });

  it('begrenzt absurde Werte, auch gemessen an den gespielten Tagen', () => {
    // Vier Tage: Mehr als 2 Mio. € pro Tag ist nicht möglich.
    expect(parseEntry({ ...valid, score: 1e12 }, 0)?.score).toBe(8_000_000);
    expect(parseEntry({ ...valid, days: 50_000, score: 1e12 }, 0)?.score).toBe(100_000_000);
    expect(parseEntry({ ...valid, score: -5 }, 0)?.score).toBe(0);
  });

  it('unsichtbare Formatzeichen im Namen fliegen raus (sonst steht eine leere Zeile da)', () => {
    expect(parseEntry({ ...valid, name: '\u200B\u202E' }, 0)?.name).toBe('Anonym');
    expect(parseEntry({ ...valid, name: 'Ja\u200Bkob' }, 0)?.name).toBe('Jakob');
  });
});
