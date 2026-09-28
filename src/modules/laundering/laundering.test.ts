import { describe, expect, it } from 'vitest';
import { START_DIRTY_MONEY } from '../../core';
import { createTestGame } from '../../core/testing';
import { LAUNDERING_FEE } from './config';
import { getLaunderingStats } from './index';

describe('laundering', () => {
  it('wäscht Schwarzgeld gegen Gebühr zu sauberem Geld', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1000 } }).ok).toBe(true);
    expect(sim.state.wallet).toEqual({ dirty: START_DIRTY_MONEY - 1000, clean: 1000 * (1 - LAUNDERING_FEE) });
    expect(getLaunderingStats(sim.state)).toEqual({ totalLaundered: 1000, totalFees: 1000 * LAUNDERING_FEE });
  });

  it('nicht mehr waschen als da ist', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1e9 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: -5 } }).ok).toBe(false);
  });
});
