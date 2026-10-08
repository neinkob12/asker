// Regressionstests aus dem Bugreview (Paket Fahrer und Karte).
import { describe, expect, it } from 'vitest';
import { distanceMeters } from '../../core';
import { createTestGame } from '../../core/testing';
import { playableCities } from '../city';
import { warehouseSites } from '../goods';
import { PORTS } from '../logistics';
import { getAllSpots, spotCity } from '../spots';
import { getSuppliers } from '../suppliers';
import { checkedCounts, entrySuppliers } from './tools/check';

describe('Zählung der geprüften Orte in check-roads', () => {
  it('zählt nur die Autobahn-Einfahrten, die auch geprüft werden', () => {
    const { state } = createTestGame();
    let expected = 0;
    let local = 0;
    for (const city of playableCities()) {
      const fromCity = getSuppliers(state, city.id).filter((s) => s.kind === 'city');
      // Lieferanten bis 15 km von der Stadtmitte fahren nicht über die Autobahn herein (LOCAL_RADIUS).
      const far = fromCity.filter((s) => distanceMeters(s, city.center) > 15_000);
      expect(entrySuppliers(state, city.id, city.center).map((s) => s.id)).toEqual(far.map((s) => s.id));
      local += fromCity.length - far.length;
      expected +=
        getAllSpots(state).filter((s) => spotCity(s) === city.id).length +
        warehouseSites(city.id).length +
        (PORTS[city.id] ? 1 : 0) +
        far.length;
    }
    // Ohne nahe Lieferanten zeigte der Test nichts: Es gibt sie (z.B. in Köln).
    expect(local).toBeGreaterThan(0);
    expect(checkedCounts(state).places).toBe(expected);
  });
});
