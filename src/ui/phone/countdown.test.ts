import { describe, expect, it } from 'vitest';
import { hourCountdown } from './countdown';

describe('hourCountdown', () => {
  it('zeigt unter einer Stunde "< 1 Std." statt Minuten', () => {
    expect(hourCountdown(0)).toBe('< 1 Std.');
    expect(hourCountdown(59)).toBe('< 1 Std.');
  });

  it('zeigt volle Stunden aufgerundet und springt nur einmal pro Spielstunde', () => {
    expect(hourCountdown(60)).toBe('1 Std.');
    expect(hourCountdown(61)).toBe('2 Std.');
    expect(hourCountdown(119)).toBe('2 Std.');
    expect(hourCountdown(120)).toBe('2 Std.');
  });

  it('zeigt nie negative Zeiten', () => {
    expect(hourCountdown(-30)).toBe('< 1 Std.');
  });
});
