import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getProduct } from '../goods';
import { getCompetitionFactor, referencePrice, setCompetitionFactor } from './index';

describe('market', () => {
  it('Richtpreis = Grundpreis × Kaufkraft × Konkurrenzfaktor', () => {
    const sim = createTestGame();
    const base = getProduct('weed')?.basePrice ?? 0;
    expect(referencePrice(sim.state, 'weed', 'kalk')).toBe(base);
    setCompetitionFactor(sim.ctx('gangs'), 'kalk', 0.8);
    expect(referencePrice(sim.state, 'weed', 'kalk')).toBeCloseTo(base * 0.8);
    expect(referencePrice(sim.state, 'weed', 'deutz')).toBe(base);
    expect(referencePrice(sim.state, 'gibtsnicht', 'deutz')).toBe(0);
  });

  it('der Konkurrenzfaktor ist begrenzt und wird gemeldet', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    setCompetitionFactor(sim.ctx('gangs'), 'kalk', 0.01);
    sim.step();
    expect(getCompetitionFactor(sim.state, 'kalk')).toBe(0.5);
    expect(eventsOfType(events, 'market.competitionChanged')[0].payload).toEqual({ veedelId: 'kalk', factor: 0.5 });
  });
});
