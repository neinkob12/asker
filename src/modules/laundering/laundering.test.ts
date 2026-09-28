import { describe, expect, it } from 'vitest';
import { loadSimulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { LAUNDERING_CAPACITY, LAUNDERING_FEE } from './config';
import { amountInProgress, batchProgress, getBatches, getLaunderingStats, launderingDuration } from './index';

describe('laundering', () => {
  it('wäscht Schwarzgeld über Zeit und gegen Gebühr zu sauberem Geld', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1000 } }).ok).toBe(true);
    // Das Schwarzgeld ist sofort weg, sauberes Geld gibt es erst, wenn die Wäsche fertig ist.
    expect(sim.state.wallet).toEqual({ dirty: START_DIRTY_MONEY - 1000, clean: 0 });
    expect(amountInProgress(sim.state)).toBe(1000);
    const [batch] = getBatches(sim.state);
    const duration = launderingDuration(1000);
    expect(batch.readyAt - batch.startedAt).toBe(duration);

    sim.advance(duration / 2);
    expect(batchProgress(sim.state, batch)).toBeCloseTo(0.5);
    expect(sim.state.wallet.clean).toBe(0);

    sim.advance(duration / 2);
    expect(sim.state.wallet.clean).toBe(1000 * (1 - LAUNDERING_FEE));
    expect(getBatches(sim.state)).toHaveLength(0);
    expect(getLaunderingStats(sim.state)).toMatchObject({ totalLaundered: 1000, totalFees: 1000 * LAUNDERING_FEE });
    expect(eventsOfType(events, 'laundering.completed')[0].payload).toMatchObject({ amount: 1000, fee: 200 });
  });

  it('größere Beträge brauchen länger', () => {
    expect(launderingDuration(5000)).toBeGreaterThan(launderingDuration(500));
  });

  it('nicht mehr waschen als da ist oder als gleichzeitig geht', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1e9 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: -5 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 50 } }).ok).toBe(false);
    sim.state.wallet.dirty = LAUNDERING_CAPACITY * 2;
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: LAUNDERING_CAPACITY } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 100 } })).toEqual({
      ok: false,
      reason: 'Mehr geht gerade nicht, frei sind noch 0 €.',
    });
  });

  it('migriert Version 1 (sofortige Wäsche) ohne laufende Wäschen', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.laundering = { totalLaundered: 500, totalFees: 100 };
    raw.moduleVersions.laundering = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.laundering).toEqual({ totalLaundered: 500, totalFees: 100, batches: [] });
  });
});
