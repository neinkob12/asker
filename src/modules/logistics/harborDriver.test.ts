// Hafen-Fahrer (Feedback 13.10.2026): Ist er an, holt ein freier Fahrer Ware am Kai von selbst ins Lager.
import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getCargo, getTrips, harborDriverOn, receiveCargo } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.clean = 100_000;
  sim.state.wallet.dirty = 100_000;
  return sim;
}

const dock = (sim: Simulation) =>
  receiveCargo(sim.ctx('test'), { supplierId: 'rotterdam', productId: 'weed', amount: 100, quality: 0.6, unitCost: 2 });

describe('logistics: Hafen-Fahrer', () => {
  it('aus: Ware bleibt am Kai; an: der Fahrer fährt gleich los und beantwortet die Frage', () => {
    const sim = quietGame();
    expect(sim.dispatch({ type: 'logistics.buyBerth', payload: {} }).ok).toBe(true);
    expect(sim.dispatch({ type: 'staff.hireDriver', payload: {} }).ok).toBe(true);
    dock(sim);
    sim.advance(30);
    expect(getCargo(sim.state)).toHaveLength(1);
    expect(getTrips(sim.state)).toHaveLength(0);

    expect(harborDriverOn(sim.state)).toBe(false);
    expect(sim.dispatch({ type: 'logistics.setHarborDriver', payload: { enabled: true } }).ok).toBe(true);
    expect(harborDriverOn(sim.state)).toBe(true);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(getTrips(sim.state)).toHaveLength(1);

    // Neue Ware, während der Fahrer unterwegs ist: Er holt sie, sobald er wieder frei ist.
    dock(sim);
    expect(getCargo(sim.state)).toHaveLength(1);
    sim.advance(24 * 60);
    expect(getCargo(sim.state)).toHaveLength(0);
    const question = sim.state.messages.list.find((m) => m.options?.some((o) => o.id === 'driver'));
    expect(question?.answer).toBe('driver');
  });

  it('ohne Hafen in der Stadt nicht einschaltbar; migriert Version 6 mit allem aus', () => {
    const sim = quietGame();
    expect(sim.dispatch({ type: 'logistics.setHarborDriver', payload: { enabled: true, cityId: 'berlin' } }).ok).toBe(
      false,
    );
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, { harborDriver?: object }>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.logistics.harborDriver;
    raw.moduleVersions.logistics = 6;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.logistics.harborDriver).toEqual({});
  });
});
