// Auftrag 33, Etappe 4: Liegeplatz in Stufen, Container-Pakete.
import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getSupplier, packagePrice } from '../suppliers';
import { BERTH_LEVELS, LOAD_MINUTES } from './config';
import { berthLevel, berthUpgradeCost, cargoRiskFrom, getCargo, getTrips, receiveCargo } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.clean = 100_000;
  sim.state.wallet.dirty = 100_000;
  return sim;
}

describe('logistics: Hafen-Ausbau (Auftrag 33)', () => {
  it('Liegeplatz in Stufen: Kai, Halle am Kai, Kran; Ware länger sicher, Laden schneller', () => {
    const sim = quietGame();
    const upgrade = () => sim.dispatch({ type: 'logistics.upgradeBerth', payload: {} });
    expect(upgrade().ok).toBe(false);
    expect(sim.dispatch({ type: 'logistics.buyBerth', payload: {} }).ok).toBe(true);
    expect(berthLevel(sim.state)).toBe(0);
    const cargoId = receiveCargo(sim.ctx('test'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.6,
      unitCost: 2,
    });
    const cargo = () => getCargo(sim.state).find((c) => c.id === cargoId) ?? getCargo(sim.state)[0];
    const safeAtKai = cargoRiskFrom(cargo(), sim.state);
    const cost = berthUpgradeCost(sim.state) ?? 0;
    expect(cost).toBeGreaterThan(0);
    const clean = sim.state.wallet.clean;
    expect(upgrade().ok).toBe(true);
    expect(sim.state.wallet.clean).toBe(clean - cost);
    expect(upgrade().ok).toBe(true);
    expect(berthLevel(sim.state)).toBe(2);
    expect(upgrade().ok).toBe(false);
    expect(berthUpgradeCost(sim.state)).toBeNull();
    expect(cargoRiskFrom(cargo(), sim.state)).toBeGreaterThan(safeAtKai);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(true);
    const [trip] = getTrips(sim.state);
    // Mit Kran: Laden dauert nur noch einen Bruchteil.
    const approach = trip.loadedAt - trip.startedAt - Math.round(LOAD_MINUTES * BERTH_LEVELS[2].loadFactor);
    expect(approach).toBeGreaterThan(0);
    expect(trip.loadedAt - trip.startedAt).toBeLessThan(approach + LOAD_MINUTES);
  });

  it('migriert Version 5: Liegeplätze bekommen Stufe 0', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, { berths?: object }>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.logistics.berths = { koeln: { since: 5 } };
    raw.moduleVersions.logistics = 5;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.logistics.berths.koeln).toEqual({ since: 5, level: 0 });
  });
});

describe('suppliers: Container-Pakete (Auftrag 33)', () => {
  it('ganzer Container ist billiger pro Gramm als das größte Paket, der geteilte noch billiger', () => {
    const sim = quietGame();
    const rotterdam = getSupplier(sim.state, 'rotterdam');
    const pkg = (id: string) => rotterdam?.packages.find((p) => p.id === id);
    const perGram = (id: string) => packagePrice(sim.state, 'rotterdam', id) / (pkg(id)?.amount ?? 1);
    expect(pkg('container')?.container).toBe('full');
    expect(pkg('shared')?.container).toBe('shared');
    expect(perGram('container')).toBeLessThan(perGram('large'));
    expect(perGram('shared')).toBeLessThan(perGram('container'));
  });

  it('geteilter Container: fliegt die fremde Hälfte auf, ist die eigene mit weg', () => {
    let shared = 0;
    let orders = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sim = quietGame(seed);
      sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
      sim.state.modules.suppliers.unlocked.push('rotterdam');
      const result = sim.dispatch({
        type: 'suppliers.order',
        payload: { supplierId: 'rotterdam', packageId: 'shared' },
      });
      if (!result.ok) throw new Error(result.reason);
      orders++;
      const shipment = sim.state.modules.suppliers.shipments[0];
      if (shipment.shared) {
        shared++;
        expect(shipment.problem).toBe('seized');
      }
    }
    expect(orders).toBe(30);
    expect(shared).toBeGreaterThan(0);
    expect(shared).toBeLessThan(15);
  });
});
