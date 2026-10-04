import { describe, expect, it } from 'vitest';
import { hoversWith } from './HudPill';

describe('HudPill: wer die Karte aufklappen darf', () => {
  it('nur eine Maus schwebt; ein Finger löst das nachgemachte Hover am Touchscreen nicht aus', () => {
    expect(hoversWith('mouse')).toBe(true);
    expect(hoversWith('touch')).toBe(false);
    expect(hoversWith('pen')).toBe(false);
    expect(hoversWith('')).toBe(false);
  });
});
