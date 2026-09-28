import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getVeedel, veedelAt } from '../veedel';
import { getSpot, getSpots, spotsInVeedel } from './index';

describe('spots', () => {
  it('jeder Spot liegt in einem bekannten Veedel', () => {
    const sim = createTestGame();
    const spots = getSpots(sim.state);
    expect(spots.length).toBeGreaterThanOrEqual(10);
    for (const spot of spots) expect(getVeedel(spot.veedelId), spot.id).toBeDefined();
  });

  it('die Veedel-Zuordnung passt zu veedelAt()', () => {
    const sim = createTestGame();
    for (const spot of getSpots(sim.state)) expect(veedelAt(spot.lng, spot.lat)?.id, spot.id).toBe(spot.veedelId);
  });

  it('findet Spots nach ID und Veedel', () => {
    const sim = createTestGame();
    expect(getSpot(sim.state, 'ebertplatz')?.name).toBe('Ebertplatz');
    expect(spotsInVeedel(sim.state, 'neustadt-sued').map((s) => s.id)).toContain('zuelpicher');
  });
});
