import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { changeReputation, getReputation, START_REPUTATION } from './index';

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
});
