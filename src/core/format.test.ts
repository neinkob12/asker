import { describe, expect, it } from 'vitest';
import { formatDays, formatEuro, formatNumber, withPeriod } from './format';

describe('format: keine negative Null', () => {
  it('formatEuro zeigt kleine Minusbeträge und -0 als "0 €"', () => {
    expect(formatEuro(-0.4)).toBe('0 €');
    expect(formatEuro(-0)).toBe('0 €');
    expect(formatEuro(0.4)).toBe('0 €');
  });

  it('formatEuro lässt echte Beträge unverändert', () => {
    expect(formatEuro(-1500)).toBe('-1.500 €');
    expect(formatEuro(1234.6)).toBe('1.235 €');
    expect(formatEuro(-0.6)).toBe('-1 €');
  });

  it('formatNumber zeigt "-0" und "-0,0" nicht', () => {
    expect(formatNumber(-0.4)).toBe('0');
    expect(formatNumber(-0.04, 1)).toBe('0,0');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-1.5, 1)).toBe('-1,5');
    expect(formatNumber(-0.5, 1)).toBe('-0,5');
  });

  it('withPeriod setzt hinter eine Abkürzung keinen zweiten Punkt', () => {
    expect(withPeriod('Ärger mit Sven L.')).toBe('Ärger mit Sven L.');
    expect(withPeriod('Verdacht: Kalle')).toBe('Verdacht: Kalle.');
    expect(withPeriod('Wirklich?')).toBe('Wirklich?');
  });

  it('formatDays sagt „1 Tag“, sonst „Tage“', () => {
    expect(formatDays(1)).toBe('1 Tag');
    expect(formatDays(0)).toBe('0 Tage');
    expect(formatDays(12)).toBe('12 Tage');
  });
});
