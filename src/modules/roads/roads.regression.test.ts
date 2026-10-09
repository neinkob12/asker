// Regressionstests aus dem Bugreview (Paket Fahrer und Karte).
import { describe, expect, it } from 'vitest';
import { distanceMeters } from '../../core';
import { createTestGame } from '../../core/testing';
import { playableCities } from '../city';
import { warehouseSites } from '../goods';
import { PORTS } from '../logistics';
import { getAllSpots, spotCity } from '../spots';
import { getSuppliers } from '../suppliers';
import {
  AVOID_MOTORWAY,
  COUNTRY_DETOUR,
  interCityMinutes,
  interCityRoute,
  roadDistance,
  roadRoute,
  travelMinutes,
} from './index';
import { checkedCounts, entrySuppliers } from './tools/check';

describe('Landstraße zwischen zwei Städten', () => {
  const koeln = { lng: 6.95, lat: 50.94 };
  const hamburg = { lng: 9.99, lat: 53.55 };
  const country = { weights: AVOID_MOTORWAY };

  it('Köln–Hamburg fährt auch mit Landstraße die A 1 in derselben Zeit wie mit Autobahn, in der Stadt unverändert', () => {
    const autobahn = interCityRoute(koeln, hamburg);
    expect(autobahn.refs).toContain('A 1');
    // Karte (roadRoute), Länge (roadDistance) und Zeit (travelMinutes) rechnen mit demselben Weg und Tempo.
    expect(roadRoute(koeln, hamburg, country)).toEqual(roadRoute(koeln, hamburg));
    expect(roadRoute(koeln, hamburg, country).path).toEqual(autobahn.path);
    expect(roadDistance(koeln, hamburg, country)).toBe(autobahn.meters);
    expect(roadDistance(koeln, hamburg, country)).toBe(roadDistance(koeln, hamburg));
    for (const speed of [300, 400, 520]) {
      expect(travelMinutes(koeln, hamburg, speed, 0, country)).toBe(travelMinutes(koeln, hamburg, speed));
      expect(travelMinutes(koeln, hamburg, speed, 30, country)).toBe(interCityMinutes(koeln, hamburg, speed) + 30);
      // Auch zurück.
      expect(travelMinutes(hamburg, koeln, speed, 0, country)).toBe(travelMinutes(hamburg, koeln, speed));
    }

    // In der Stadt unverändert. Leverkusen-Rand im Norden nach Rodenkirchen im Süden: der schnellste Weg nimmt die
    // Autobahn, die Landstraße einen anderen Weg und mindestens COUNTRY_DETOUR so lange.
    const from = { lng: 6.99, lat: 51.02 };
    const to = { lng: 6.99, lat: 50.88 };
    const plain = roadRoute(from, to);
    const slow = roadRoute(from, to, country);
    expect(slow.path).not.toEqual(plain.path);
    expect(roadDistance(from, to, country)).toBe(slow.meters);
    const speed = 400;
    expect(travelMinutes(from, to, speed, 0, country)).toBe(
      Math.max(Math.ceil(slow.meters / speed), Math.ceil((plain.meters * COUNTRY_DETOUR) / speed)),
    );
    expect(travelMinutes(from, to, speed, 0, country)).toBeGreaterThan(travelMinutes(from, to, speed));
  });
});

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
