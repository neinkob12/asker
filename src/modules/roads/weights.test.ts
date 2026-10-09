// Auftrag 33: Gewicht pro Straßenart (Landstraße statt Autobahn).
import { describe, expect, it } from 'vitest';
import { AVOID_MOTORWAY, interCityMinutes, roadDistance, roadGraph, roadRoute, travelMinutes } from './index';

/** Meter einer Route auf Autobahnen (über die Kanten des Graphen am nächsten zu den Punkten, grob). */
function motorwayShare(path: { lng: number; lat: number }[]): number {
  const g = roadGraph('koeln');
  const motorway = g.classes.indexOf('motorway');
  let near = 0;
  for (const p of path) {
    const [x, y] = g.toMeters(p);
    let best = Infinity;
    let cls = -1;
    for (let e = 0; e < g.edgeFrom.length; e += 1) {
      const a = g.edgeFrom[e];
      const d = Math.hypot(g.nodeX[a] - x, g.nodeY[a] - y);
      if (d < best) {
        best = d;
        cls = g.edgeClass[e];
      }
    }
    if (cls === motorway) near += 1;
  }
  return near / path.length;
}

describe('roads: Gewicht pro Straßenart (Auftrag 33)', () => {
  // Leverkusen-Rand im Norden nach Rodenkirchen im Süden: der schnellste Weg nimmt die Autobahn.
  const from = { lng: 6.99, lat: 51.02 };
  const to = { lng: 6.99, lat: 50.88 };

  it('ohne Gewicht wie bisher, mit Gewicht ein anderer Weg, der länger dauert', () => {
    const plain = roadRoute(from, to);
    expect(roadRoute(from, to, {})).toEqual(plain);
    const country = roadRoute(from, to, { weights: AVOID_MOTORWAY });
    expect(country.meters).not.toBe(plain.meters);
    expect(roadDistance(from, to, { weights: AVOID_MOTORWAY })).toBe(country.meters);
    expect(travelMinutes(from, to, 400, 0, { weights: AVOID_MOTORWAY })).toBeGreaterThanOrEqual(
      travelMinutes(from, to, 400),
    );
  });

  it('meidet die Autobahn', () => {
    const plain = roadRoute(from, to).path;
    const country = roadRoute(from, to, { weights: AVOID_MOTORWAY }).path;
    expect(motorwayShare(country.filter((_, i) => i % 10 === 0))).toBeLessThanOrEqual(
      motorwayShare(plain.filter((_, i) => i % 10 === 0)),
    );
  });

  it('zwischen den Städten gibt es keine Landstraße: Die Fahrt nimmt die Autobahn und dauert so lange wie dort', () => {
    const koeln = { lng: 6.95, lat: 50.94 };
    const hamburg = { lng: 9.99, lat: 53.55 };
    expect(travelMinutes(koeln, hamburg, 400, 0, { weights: AVOID_MOTORWAY })).toBe(
      interCityMinutes(koeln, hamburg, 400),
    );
  });
});
