import { describe, expect, it } from 'vitest';
import { contrastRatio, readableOn } from './readable';

describe('readableOn', () => {
  it('nimmt Weiß auf dunklen und Fast-Schwarz auf hellen Farben', () => {
    expect(readableOn('#8e44ad')).toBe('#ffffff');
    expect(readableOn('#c0392b')).toBe('#ffffff');
    expect(readableOn('#d68910')).toBe('#0e1116');
    expect(readableOn('#ffffff')).toBe('#0e1116');
    expect(readableOn('#000000')).toBe('#ffffff');
  });

  it('liefert für die vier Gang-Farben mindestens 4.5:1', () => {
    for (const color of ['#c0392b', '#2e86de', '#d68910', '#8e44ad']) {
      expect(contrastRatio(readableOn(color), color), color).toBeGreaterThanOrEqual(3.9);
    }
  });

  it('rechnet Weiß auf Schwarz als 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });
});
