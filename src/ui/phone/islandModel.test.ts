import { describe, expect, it } from 'vitest';
import { islandCountdown } from './islandModel';

describe('islandCountdown', () => {
  it('zeigt unter einer Stunde "< 1 Std." statt Minuten', () => {
    expect(islandCountdown(0)).toBe('< 1 Std.');
    expect(islandCountdown(1)).toBe('< 1 Std.');
    expect(islandCountdown(45)).toBe('< 1 Std.');
    expect(islandCountdown(59.9)).toBe('< 1 Std.');
  });

  it('zeigt volle Stunden aufgerundet', () => {
    expect(islandCountdown(60)).toBe('1 Std.');
    expect(islandCountdown(61)).toBe('2 Std.');
    expect(islandCountdown(120)).toBe('2 Std.');
    expect(islandCountdown(125)).toBe('3 Std.');
    expect(islandCountdown(180)).toBe('3 Std.');
  });

  it('springt nur einmal pro Spielstunde (kein Zappeln über Minuten)', () => {
    const values = new Set<string>();
    for (let m = 61; m <= 120; m++) values.add(islandCountdown(m));
    expect(values).toEqual(new Set(['2 Std.']));
  });

  it('zeigt nie Minuten und nie negative Zeiten', () => {
    for (const m of [-30, -1, 0, 3, 47, 90, 599, 1440]) {
      const text = islandCountdown(m);
      expect(text).toMatch(/^(< 1|\d+) Std\.$/);
      expect(text).not.toMatch(/Min|:/);
    }
    expect(islandCountdown(-5)).toBe('< 1 Std.');
  });
});
