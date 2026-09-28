import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { controlledBy } from '../territory';
import { SNITCH_HEAT } from './config';
import { addHeat, getHeat } from './index';

describe('police', () => {
  it('Heat pro Veedel lesen und erhöhen, begrenzt auf 0–100', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    expect(getHeat(sim.state, 'kalk')).toBe(0);
    expect(addHeat(ctx, 'kalk', 30)).toBe(30);
    expect(addHeat(ctx, 'kalk', 500)).toBe(100);
    expect(addHeat(ctx, 'kalk', -500)).toBe(0);
  });

  it('eine Gang verpfeifen erhöht den Heat in ihren Veedeln', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const veedelIds = controlledBy(sim.state, 'ost');
    expect(sim.dispatch({ type: 'police.snitch', payload: { gangId: 'ost' } }).ok).toBe(true);
    for (const id of veedelIds) expect(getHeat(sim.state, id)).toBe(SNITCH_HEAT);
    expect(eventsOfType(events, 'police.tipOff')[0].payload).toEqual({ gangId: 'ost', veedelIds });
    expect(sim.dispatch({ type: 'police.snitch', payload: { gangId: 'gibtsnicht' } }).ok).toBe(false);
  });
});
