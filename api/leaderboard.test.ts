import { describe, expect, it } from 'vitest';
import {
  clientIp,
  hashToken,
  MAX_SCORE_PER_DAY,
  maxScore,
  parseEntry,
  parseToken,
  publicEntry,
  RATE_WINDOW_SECONDS,
  rateKey,
  toRank,
} from './leaderboard';

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
    // Städte (Auftrag 30) sind optional: ältere Spielstände schicken sie nicht.
    expect(parseEntry(valid, 0)).not.toHaveProperty('cities');
    expect(parseEntry({ ...valid, cities: 2 }, 0)?.cities).toBe(2);
    expect(parseEntry({ ...valid, cities: 999 }, 0)?.cities).toBe(20);
    // Rang des Spielers (Auftrag 36): Titel wie bisher, dazu sein Wert, optional und begrenzt.
    expect(parseEntry(valid, 0)).not.toHaveProperty('rank');
    expect(parseEntry({ ...valid, title: 'Boss von Hamburg', rank: 41 }, 0)).toMatchObject({
      title: 'Boss von Hamburg',
      rank: 41,
    });
    // Unbekannte Titel fallen weg, ein Wert, der nicht zum Titel passt, auch.
    expect(parseEntry({ ...valid, title: 'Kaiser von Europa', rank: 99 }, 0)).toMatchObject({ title: null });
    expect(parseEntry({ ...valid, title: 'Kaiser von Europa', rank: 99 }, 0)).not.toHaveProperty('rank');
    expect(parseEntry({ ...valid, title: 'Kleindealer', rank: 50 }, 0)).not.toHaveProperty('rank');
    expect(parseEntry({ ...valid, title: 'Boss von Deutschland', rank: 50 }, 0)?.rank).toBe(50);
    expect(parseEntry({ ...valid, name: 'x'.repeat(50) }, 0)?.name).toHaveLength(20);
  });

  it('lehnt Unsinn ab', () => {
    expect(parseEntry(null, 0)).toBeNull();
    expect(parseEntry({ ...valid, runId: 'a b' }, 0)).toBeNull();
    expect(parseEntry({ ...valid, score: 'viel' }, 0)).toBeNull();
    expect(parseEntry({ ...valid, outcome: 'cheat' }, 0)).toBeNull();
  });

  it('begrenzt absurde Werte, auch gemessen an den gespielten Tagen', () => {
    // Vier Tage: Mehr als MAX_SCORE_PER_DAY pro Tag nehmen wir nicht an.
    expect(parseEntry({ ...valid, score: 1e12 }, 0)?.score).toBe(4 * MAX_SCORE_PER_DAY);
    expect(parseEntry({ ...valid, days: 50_000, score: 1e12 }, 0)?.score).toBe(100_000_000);
    // Wenige Tage dürfen nicht mehr 100 Mio. hergeben (früher: 50 Tage x 2 Mio.).
    expect(parseEntry({ ...valid, days: 50, score: 1e8 }, 0)?.score).toBe(50 * MAX_SCORE_PER_DAY);
    expect(maxScore(1)).toBe(MAX_SCORE_PER_DAY);
    expect(MAX_SCORE_PER_DAY).toBeLessThanOrEqual(250_000);
    expect(parseEntry({ ...valid, score: -5 }, 0)?.score).toBe(0);
  });

  it('unsichtbare Formatzeichen im Namen fliegen raus (sonst steht eine leere Zeile da)', () => {
    expect(parseEntry({ ...valid, name: '\u200B\u202E' }, 0)?.name).toBe('Anonym');
    expect(parseEntry({ ...valid, name: 'Ja\u200Bkob' }, 0)?.name).toBe('Jakob');
  });

  it('Token: nur Zeichen aus dem erlaubten Satz, mindestens 16 Stück', () => {
    expect(parseToken({ token: 'abcdef0123456789' })).toBe('abcdef0123456789');
    expect(parseToken({ token: 'kurz' })).toBeNull();
    expect(parseToken({ token: 'a b c d e f g h i j k l' })).toBeNull();
    expect(parseToken({})).toBeNull();
    expect(parseToken(null)).toBeNull();
    expect(parseToken({ token: 1234567890123456 })).toBeNull();
  });

  it('Token wird gehasht (SHA-256, Hex) und gleich bleibt gleich', async () => {
    const a = await hashToken('abcdef0123456789');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('abcdef0123456789');
    expect(await hashToken('abcdef0123456789')).toBe(a);
    expect(await hashToken('abcdef0123456780')).not.toBe(a);
    // Bekannter Wert, damit ein Wechsel des Verfahrens auffällt (bestehende Einträge hängen daran).
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('die Antwort enthält keine runId', () => {
    const entry = parseEntry(valid, 5);
    expect(entry).not.toBeNull();
    if (!entry) return;
    const shown = publicEntry(entry);
    expect(shown).not.toHaveProperty('runId');
    expect(shown.name).toBe('Jakob');
    expect(JSON.stringify(shown)).not.toContain('run_abc123');
  });

  it('Rang: null (abgeschnitten) wird nicht zu Platz 1', () => {
    expect(toRank(0)).toBe(1);
    expect(toRank(41)).toBe(42);
    expect(toRank(null)).toBeNull();
    expect(toRank(undefined)).toBeNull();
    expect(toRank('3')).toBeNull();
  });

  it('Drosselung: IP aus x-forwarded-for, Zähler pro Zeitfenster', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' });
    expect(clientIp(headers)).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
    const window = RATE_WINDOW_SECONDS * 1000;
    expect(rateKey('1.2.3.4', 5)).toBe(rateKey('1.2.3.4', window - 1));
    expect(rateKey('1.2.3.4', 5)).not.toBe(rateKey('1.2.3.4', window));
    expect(rateKey('1.2.3.4', 5)).not.toBe(rateKey('1.2.3.5', 5));
  });
});
