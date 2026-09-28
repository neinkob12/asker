import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getVeedel } from '../veedel';
import { getGang, getGangs } from './index';

describe('gangs', () => {
  it('drei Platzhalter-Gangs mit ID, Name, Farbe und Heimat-Veedel', () => {
    const sim = createTestGame();
    const gangs = getGangs(sim.state);
    expect(gangs).toHaveLength(3);
    expect(new Set(gangs.map((g) => g.id)).size).toBe(3);
    expect(new Set(gangs.map((g) => g.color)).size).toBe(3);
    for (const g of gangs) expect(getVeedel(g.homeVeedelId)).toBeDefined();
    expect(getGang(sim.state, gangs[0].id)).toBe(gangs[0]);
  });
});
