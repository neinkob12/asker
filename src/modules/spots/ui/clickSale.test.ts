// Klick auf den Spot verkauft (Feedback vom 08.10.2026): Wem verkauft der Klick, und was passiert ohne Ware?

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../../core';
import { createTestGame } from '../../../core/testing';
import { getSpots } from '../index';
import { clickSaleCustomer } from './map';

type Waiting = Simulation['state']['modules']['customers']['waiting'][number];

/** Spiel mit wartenden Kunden an einem Spot, die Kunden als Vorlage aus dem Spiel selbst. */
function withCustomers(amounts: number[]): { sim: Simulation; spotId: string; ids: number[] } {
  const sim = createTestGame();
  for (let i = 0; i < 24 * 60 && sim.state.modules.customers.waiting.length === 0; i++) sim.step();
  const template = sim.state.modules.customers.waiting[0];
  expect(template).toBeDefined();
  const spotId = template.spotId;
  sim.state.modules.customers.waiting = amounts.map(
    (amount, i): Waiting => ({ ...template, id: 900 + i, amount, expiresAt: sim.state.time + 30 + i * 10 }),
  );
  return { sim, spotId, ids: amounts.map((_, i) => 900 + i) };
}

describe('Klick auf den Spot', () => {
  it('niemand da: kein Verkauf, der Klick öffnet das Fenster', () => {
    const sim = createTestGame();
    sim.state.modules.customers.waiting = [];
    expect(clickSaleCustomer(sim.state, getSpots(sim.state)[0].id)).toBeNull();
  });

  it('verkauft an den dringendsten Kunden, den die Ware bedienen kann', () => {
    const { sim, spotId, ids } = withCustomers([1_000_000, 1]);
    // Der dringendste will mehr, als im Lager ist; der nächste bekommt den Verkauf.
    expect(clickSaleCustomer(sim.state, spotId)?.id).toBe(ids[1]);
    const result = sim.dispatch({ type: 'customers.serve', payload: { customerId: ids[1] } });
    expect(result.ok).toBe(true);
  });

  it('ohne passende Ware: der dringendste, und der Verkauf meldet, dass die Ware fehlt', () => {
    const { sim, spotId, ids } = withCustomers([1_000_000, 2_000_000]);
    expect(clickSaleCustomer(sim.state, spotId)?.id).toBe(ids[0]);
    const result = sim.dispatch({ type: 'customers.serve', payload: { customerId: ids[0] } });
    expect(result).toEqual({ ok: false, reason: 'Nicht genug im Lager.' });
  });
});
