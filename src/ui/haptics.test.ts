import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, haptic, setHapticsEnabled } from './haptics';

describe('haptic', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setHapticsEnabled(true);
  });

  it('vibriert mit dem kurzen Muster der Art, wo der Browser das kann', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('performance', { now: () => 1000 });
    haptic('success');
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.success);
  });

  it('folgt der Einstellung "Vibrieren"', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('performance', { now: () => 5000 });
    setHapticsEnabled(false);
    haptic('medium');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('ohne navigator.vibrate (iOS Safari) kein Fehler', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('performance', { now: () => 9000 });
    expect(() => haptic('error')).not.toThrow();
  });

  it('fasst Aufrufe kurz hintereinander zusammen', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    let now = 20000;
    vi.stubGlobal('performance', { now: () => now });
    haptic('selection');
    now += 10;
    haptic('selection');
    now += 100;
    haptic('selection');
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('Muster sind kurz (kein Brummen)', () => {
    for (const pattern of Object.values(HAPTIC_PATTERNS)) {
      const total = [pattern].flat().reduce((sum, ms) => sum + ms, 0);
      expect(total).toBeLessThanOrEqual(200);
    }
  });
});
