// Auftrag 33, Etappe 5: Verbrauch pro Tag für den Warenfluss.
import { describe, expect, it } from 'vitest';
import { loadSimulation, MINUTES_PER_DAY, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { servingWarehouse, usagePerDay, usedProducts } from './index';

function sale(sim: Simulation, productId: string, amount: number, spotId: string | null = 'zuelpicher') {
  sim.ctx('test').emit('sale.completed', {
    channel: 'street',
    spotId,
    veedelId: 'ehrenfeld',
    productId,
    amount,
    quality: 0.6,
    revenue: amount * 10,
    sellerId: null,
    customerId: null,
  } as never);
  sim.step();
}

describe('goods: Warenfluss (Auftrag 33)', () => {
  it('zählt Verkäufe pro Stadt, Ware und Spot; Schnitt über die letzten Tage', () => {
    const sim = createTestGame();
    for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
      sim.state.modules.customers.nextSpawnAt[key] = Infinity;
    }
    sale(sim, 'weed', 30);
    sale(sim, 'hash', 10, null);
    // Bis Mitternacht vorspulen: Tag 1 steht in der Liste.
    sim.advance(MINUTES_PER_DAY - (sim.state.time % MINUTES_PER_DAY));
    expect(usagePerDay(sim.state, { cityId: 'koeln', productId: 'weed' })).toBe(30);
    expect(usagePerDay(sim.state, { cityId: 'koeln' })).toBe(40);
    expect(usagePerDay(sim.state, { spotId: 'zuelpicher', productId: 'weed' })).toBe(30);
    expect(usagePerDay(sim.state, { spotId: 'zuelpicher', productId: 'hash' })).toBe(0);
    expect(usagePerDay(sim.state, { cityId: 'hamburg' })).toBe(0);
    sale(sim, 'weed', 10);
    sim.advance(MINUTES_PER_DAY);
    expect(usagePerDay(sim.state, { cityId: 'koeln', productId: 'weed' })).toBe(20);
    expect(usedProducts(sim.state, 'koeln').map((p) => p.id)).toEqual(['weed', 'hash']);
    expect(servingWarehouse(sim.state, { lng: 6.93, lat: 50.95 }, 'weed')?.id).toBe('ehrenfeld');
  });

  it('migriert Version 4: Verbrauch beginnt bei null', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, Record<string, unknown>>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.goods.usage;
    raw.moduleVersions.goods = 4;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.goods.usage).toEqual({ today: {}, days: [] });
  });
});
