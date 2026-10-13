import { describe, expect, it } from 'vitest';
import { metersPerPixel } from '../../../map';
import { nearestSpotMeters, spotHitExtra, spotLift } from './map';

describe('Klickrand am Spot (Feedback 13.10.2026)', () => {
  it('zwei Klickflächen berühren sich auf keiner Zoomstufe', () => {
    const nearest = nearestSpotMeters([
      { lng: 6.95, lat: 50.94 },
      { lng: 6.953, lat: 50.94 },
    ]);
    for (let zoom = 10; zoom <= 18; zoom += 0.25) {
      const bubble = 26 * (0.6 + 0.4 * spotLift(zoom));
      const radius = bubble / 2 + spotHitExtra(nearest, 50.94, zoom);
      const distancePx = nearest / metersPerPixel(50.94, zoom);
      // Ist der Abstand kleiner als die Blase selbst, gibt es keinen Extra-Rand.
      if (distancePx < bubble) expect(spotHitExtra(nearest, 50.94, zoom)).toBe(0);
      else expect(2 * radius).toBeLessThanOrEqual(distancePx);
    }
  });

  it('nah dran gibt es den vollen Rand', () => {
    expect(spotHitExtra(800, 50.94, 16)).toBe(14);
    expect(spotHitExtra(Number.POSITIVE_INFINITY, 50.94, 12)).toBe(14);
  });

  it('weniger als zwei Spots: kein Nachbar', () => {
    expect(nearestSpotMeters([{ lng: 6.95, lat: 50.94 }])).toBe(Number.POSITIVE_INFINITY);
  });
});
