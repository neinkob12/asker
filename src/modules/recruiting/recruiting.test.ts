import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getCandidates } from './index';

describe('recruiting', () => {
  it('startet mit leerem Bewerber-Pool', () => {
    const sim = createTestGame();
    expect(getCandidates(sim.state)).toEqual([]);
  });
});
