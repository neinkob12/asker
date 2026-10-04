import { describe, expect, it } from 'vitest';
import { CUSTOMER_PATIENCE } from '../../customers';
import { patienceFill, RING_STEP } from './ringModel';

const customer = (expiresAt: number) => ({ expiresAt });

describe('Geduld-Ring am Spot', () => {
  it('ohne Wartende ist der Ring voll', () => {
    expect(patienceFill(100, [])).toBe(100);
  });

  it('zeigt den Anteil der Geduld des ungeduldigsten Kunden, in Schritten', () => {
    const now = 1000;
    expect(patienceFill(now, [customer(now + CUSTOMER_PATIENCE)])).toBe(100);
    expect(patienceFill(now, [customer(now + CUSTOMER_PATIENCE / 2)])).toBe(50);
    expect(patienceFill(now, [customer(now + CUSTOMER_PATIENCE / 4)])).toBe(25);
    // Der dringendste zählt, nicht der Durchschnitt.
    const mixed = [customer(now + CUSTOMER_PATIENCE), customer(now + CUSTOMER_PATIENCE / 5)];
    expect(patienceFill(now, mixed)).toBe(20);
    for (let left = 1; left < CUSTOMER_PATIENCE; left += 7) {
      expect(patienceFill(now, [customer(now + left)]) % RING_STEP).toBe(0);
    }
  });

  it('lässt immer einen Rest stehen, solange jemand wartet', () => {
    expect(patienceFill(1000, [customer(1001)])).toBe(RING_STEP);
    expect(patienceFill(1000, [customer(1000)])).toBe(RING_STEP);
  });

  it('bleibt bei Stammkunden mit mehr Geduld als üblich bei voll', () => {
    expect(patienceFill(0, [customer(CUSTOMER_PATIENCE * 1.5)])).toBe(100);
  });
});
