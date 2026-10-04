// Qualität treibt Nachfrage (Auftrag 32).

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { allProducts, store } from '../goods';
import { getSpots } from '../spots';
import { QUALITY_DEMAND_MAX, QUALITY_DEMAND_MIN } from './config';
import { qualityDemandFactor, qualityDemandFor, spotQuality, spotReputation } from './index';

describe('customers: Qualität treibt Nachfrage', () => {
  it('Faktor: Solide = 1, Premium bis +25 %, Dreck bis −33 %', () => {
    expect(qualityDemandFor(null)).toBe(1);
    expect(qualityDemandFor(0.5)).toBe(1);
    expect(qualityDemandFor(0.65)).toBe(1);
    expect(qualityDemandFor(0.75)).toBeGreaterThan(1);
    expect(qualityDemandFor(0.85)).toBeCloseTo(QUALITY_DEMAND_MAX);
    expect(qualityDemandFor(1)).toBeCloseTo(QUALITY_DEMAND_MAX);
    expect(qualityDemandFor(0.3)).toBeLessThan(1);
    expect(qualityDemandFor(0.15)).toBeCloseTo(QUALITY_DEMAND_MIN);
    expect(qualityDemandFor(0)).toBeCloseTo(QUALITY_DEMAND_MIN);
  });

  it('jeder Straßenverkauf schiebt den gleitenden Schnitt am Spot, der Chip folgt', () => {
    const sim = createTestGame();
    for (const id of Object.keys(sim.state.modules.goods.stock)) sim.state.modules.goods.stock[id] = [];
    store(sim.ctx('test'), { productId: 'weed', amount: 500, quality: 0.95 });
    expect(spotQuality(sim.state, 'uni', 'weed')).toBeNull();
    for (let i = 0; i < 6; i++) {
      const c = {
        id: sim.state.nextId++,
        spotId: 'uni',
        productId: 'weed',
        amount: 2,
        pricePerUnit: 10,
        arrivedAt: sim.state.time,
        expiresAt: sim.state.time + 100,
      };
      sim.state.modules.customers.waiting.push(c);
      expect(sim.dispatch({ type: 'customers.serve', payload: { customerId: c.id } }).ok).toBe(true);
    }
    expect(spotQuality(sim.state, 'uni', 'weed')).toBeGreaterThan(0.85);
    expect(qualityDemandFactor(sim.state, 'uni', 'weed')).toBeCloseTo(QUALITY_DEMAND_MAX);
    expect(spotReputation(sim.state, 'uni')).toEqual([
      expect.objectContaining({ productId: 'weed', good: true, label: 'Gras gefragt' }),
    ]);
    // Anderswo und für andere Ware gilt nichts.
    expect(qualityDemandFactor(sim.state, 'neumarkt', 'weed')).toBe(1);
    expect(qualityDemandFactor(sim.state, 'uni', 'haze')).toBe(1);
    sim.state.modules.customers.quality.uni.weed = 0.2;
    expect(spotReputation(sim.state, 'uni')[0]).toMatchObject({ label: 'Gras verschrien', good: false });
  });

  it('gute Ware bringt mehr Interessenten, Dreck weniger', () => {
    const arrivals = (quality: number | null) => {
      const sim = createTestGame({ seed: 3 });
      const events = recordEvents(sim);
      const spots = getSpots(sim.state).map((s) => s.id);
      const set = (s: Simulation) => {
        if (quality === null) return;
        s.state.modules.customers.quality = Object.fromEntries(
          spots.map((id) => [id, Object.fromEntries(allProducts().map((p) => [p.id, quality]))]),
        );
      };
      store(sim.ctx('test'), { productId: 'weed', amount: 5000 });
      for (let t = 0; t < 2 * 1440; t += 10) {
        set(sim);
        sim.advance(10);
        for (const c of [...sim.state.modules.customers.waiting]) {
          sim.dispatch({ type: 'customers.serve', payload: { customerId: c.id } });
        }
      }
      return eventsOfType(events, 'customer.arrived').length;
    };
    const neutral = arrivals(null);
    const premium = arrivals(0.95);
    const trash = arrivals(0.05);
    expect(premium).toBeGreaterThan(neutral * 1.08);
    expect(trash).toBeLessThan(neutral * 0.85);
  });

  it('migriert Version 4 (ohne Qualitätsverlauf)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, Record<string, unknown>>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.customers.quality;
    raw.moduleVersions.customers = 4;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.customers.quality).toEqual({});
    loaded.advance(60);
  });
});
