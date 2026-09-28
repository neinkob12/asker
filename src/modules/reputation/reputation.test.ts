import { describe, expect, it } from 'vitest';
import { clock, loadSimulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import {
  changeReputation,
  getReputation,
  recentReputationChanges,
  reputationDemandFactor,
  reputationLabel,
  START_REPUTATION,
} from './index';

describe('reputation', () => {
  it('Ruf lesen und ändern, begrenzt auf 0–100', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    expect(getReputation(sim.state)).toBe(START_REPUTATION);
    expect(changeReputation(sim.ctx('test'), 80)).toBe(100);
    expect(changeReputation(sim.ctx('test'), -150)).toBe(0);
    sim.step();
    expect(eventsOfType(events, 'reputation.changed').map((e) => e.payload.delta)).toEqual([50, -100]);
  });

  it('merkt sich die Gründe und fasst gleiche zusammen', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('customers');
    changeReputation(ctx, -1, 'Gestreckte Ware bemerkt');
    changeReputation(ctx, 0.5, 'Zufriedene Kunden');
    changeReputation(ctx, -1, 'Gestreckte Ware bemerkt');
    expect(recentReputationChanges(sim.state)).toEqual([
      { time: sim.state.time, delta: -2, reason: 'Gestreckte Ware bemerkt' },
      { time: sim.state.time, delta: 0.5, reason: 'Zufriedene Kunden' },
    ]);
  });

  it('wirkt auf die Nachfrage', () => {
    const sim = createTestGame();
    expect(reputationDemandFactor(sim.state)).toBeCloseTo(1);
    changeReputation(sim.ctx('test'), 50);
    expect(reputationDemandFactor(sim.state)).toBeCloseTo(1.3);
    changeReputation(sim.ctx('test'), -100);
    expect(reputationDemandFactor(sim.state)).toBeCloseTo(0.7);
    expect(reputationLabel(0)).toBe('Verbrannt');
    expect(reputationLabel(85)).toBe('Legende');
  });

  it('verblasst um Mitternacht langsam Richtung Mitte', () => {
    const sim = createTestGame();
    changeReputation(sim.ctx('test'), 20);
    sim.advance(clock.at(2) - sim.state.time);
    expect(getReputation(sim.state)).toBeLessThan(START_REPUTATION + 20);
    expect(getReputation(sim.state)).toBeGreaterThan(START_REPUTATION);
  });

  it('migriert Version 1 (nur Wert)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.reputation = { value: 70 };
    raw.moduleVersions.reputation = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.reputation).toEqual({ value: 70, recent: [] });
  });
});
