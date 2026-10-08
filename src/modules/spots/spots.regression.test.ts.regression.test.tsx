import { describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { getSpot, spotAwareness } from './index';
import { AWARENESS_PER_UNIT, AWARENESS_START } from './kinds';

/** Eigenen Spot in Kalk gründen (Geld wird vorher aufgestockt). */
function foundSpot(sim: Simulation): string {
  wallet.earn(sim.ctx('test'), 10000, 'dirty', 'Test');
  const r = sim.dispatch({ type: 'spots.found', payload: { lng: 7.0035, lat: 50.9385, kind: 'corner' } });
  if (!r.ok) throw new Error(r.reason);
  return (r as { data?: { spotId: string } }).data?.spotId ?? '';
}

/** Zuwachs der Bekanntheit durch einen Verkauf von 40 g bei diesem Ruf. */
function growthAt(reputation: number): number {
  const sim = createTestGame();
  const id = foundSpot(sim);
  const spot = getSpot(sim.state, id);
  if (!spot) throw new Error(id);
  sim.state.modules.reputation.value = reputation;
  sim.ctx('test').emit('sale.completed', {
    channel: 'street',
    spotId: id,
    veedelId: spot.veedelId,
    productId: 'weed',
    amount: 40,
    quality: 0.6,
    revenue: 400,
    sellerId: null,
    customerId: null,
  });
  sim.advance(1);
  return spotAwareness(sim.state, id) - AWARENESS_START;
}

describe('Spots: Befunde aus dem Bugreview', () => {
  it('Der Ruf beschleunigt die Bekanntheit eigener Spots (mal Ruf/50, höchstens 1,5)', () => {
    const base = 40 * AWARENESS_PER_UNIT;
    expect(growthAt(50)).toBeCloseTo(base, 3);
    expect(growthAt(100)).toBeCloseTo(base * 1.5, 3);
    expect(growthAt(25)).toBeCloseTo(base * 0.5, 3);
    // Über 75 deckelt der Faktor bei 1,5.
    expect(growthAt(90)).toBeCloseTo(growthAt(100), 3);
  });
});
