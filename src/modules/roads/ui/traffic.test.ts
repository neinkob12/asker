import { describe, expect, it } from 'vitest';
import { nearestRoadPoint, roadGraph } from '../index';
import {
  hourDensity,
  MAX_TRAVEL,
  mulberry32,
  policeShare,
  TRAFFIC_MAX,
  Traffic,
  type TrafficArea,
  type TrafficKind,
  tempoFactor,
  trafficTarget,
} from './traffic';

const PALETTE: Record<TrafficKind, string[]> = {
  car: ['#7d838c'],
  van: ['#b9bdc3'],
  truck: ['#50555d'],
  police: ['#c9cdd3'],
};

/** Ausschnitt um den Neumarkt, etwa 2 × 1,5 km. */
function neumarkt(): TrafficArea {
  const [x, y] = roadGraph().toMeters({ lng: 6.9476, lat: 50.9362 });
  return { minX: x - 1000, maxX: x + 1000, minY: y - 750, maxY: y + 750 };
}

function run(seed: number, steps: number, target = 40) {
  const traffic = new Traffic(roadGraph(), PALETTE);
  const random = mulberry32(seed);
  const area = neumarkt();
  for (let i = 0; i < steps; i++) traffic.step(0.05, { target, area, policeShare: 0.05, random });
  return traffic;
}

describe('Verkehr als Kulisse', () => {
  it('füllt den Ausschnitt bis zur Zielzahl und fährt auf den Straßen', () => {
    const traffic = run(7, 200);
    expect(traffic.cars.length).toBe(40);
    for (const pose of traffic.poses()) {
      expect(nearestRoadPoint(pose)?.meters ?? 99).toBeLessThan(2);
      expect(pose.heading).toBeGreaterThanOrEqual(0);
      expect(pose.heading).toBeLessThan(360);
    }
  });

  it('beachtet Einbahnstraßen und fährt nie weiter als MAX_TRAVEL', () => {
    const g = roadGraph();
    const traffic = run(3, 1500);
    for (const car of traffic.cars) {
      for (const leg of [car.leg, car.next, car.prev]) {
        if (leg && g.edgeOneway[leg.edge]) expect(leg.dir).toBe(1);
      }
      expect(car.traveled).toBeLessThan(MAX_TRAVEL);
    }
  });

  it('gleicher Startwert, gleiche Schritte: gleiches Bild', () => {
    expect(run(11, 300).poses()).toEqual(run(11, 300).poses());
    expect(run(11, 300).poses()).not.toEqual(run(12, 300).poses());
  });

  it('weniger Ziel heißt weniger Fahrzeuge, 0 räumt alles ab', () => {
    const traffic = run(5, 100);
    const random = mulberry32(1);
    traffic.step(0.05, { target: 10, area: neumarkt(), policeShare: 0.05, random });
    expect(traffic.cars.length).toBeLessThanOrEqual(10);
    traffic.step(0.05, { target: 0, area: neumarkt(), policeShare: 0.05, random });
    expect(traffic.cars).toHaveLength(0);
  });

  it('Streifenwagen werden mit der Heat häufiger', () => {
    const count = (share: number) => {
      const traffic = new Traffic(roadGraph(), PALETTE);
      const random = mulberry32(9);
      let police = 0;
      for (let i = 0; i < 400; i++) {
        traffic.clear();
        traffic.step(0, { target: 3, area: neumarkt(), policeShare: share, random });
        police += traffic.cars.filter((c) => c.kind === 'police').length;
      }
      return police;
    };
    expect(count(policeShare(80))).toBeGreaterThan(count(policeShare(0)) * 1.8);
    expect(policeShare(0)).toBeCloseTo(0.05);
    expect(policeShare(1000)).toBe(0.25);
  });

  it('Dichte nach Uhrzeit, Anzahl nach Gerät und Einstellung, Tempo 0 steht', () => {
    expect(hourDensity(8)).toBe(1.5);
    expect(hourDensity(17)).toBe(1.5);
    expect(hourDensity(2)).toBe(0.3);
    expect(hourDensity(13)).toBe(1);
    expect(trafficTarget('normal', false, 8)).toBe(TRAFFIC_MAX.desktop);
    expect(trafficTarget('normal', true, 8)).toBe(TRAFFIC_MAX.mobile);
    expect(trafficTarget('low', false, 8)).toBe(TRAFFIC_MAX.desktop / 2);
    expect(trafficTarget('off', false, 8)).toBe(0);
    expect(trafficTarget('normal', false, 3)).toBeLessThan(trafficTarget('normal', false, 12));
    expect(tempoFactor(0)).toBe(0);
    expect(tempoFactor(4)).toBe(2);
    // Bei Tempo 0 (dt 0) bewegt sich nichts.
    const traffic = run(2, 50);
    const before = traffic.poses();
    traffic.step(0 * tempoFactor(0), { target: 40, area: neumarkt(), policeShare: 0.05, random: mulberry32(1) });
    expect(traffic.poses()).toEqual(before);
  });

  it('rechnet schnell genug: 40 Fahrzeuge in weit unter 1,5 ms pro Schritt', () => {
    const traffic = run(4, 100);
    const random = mulberry32(4);
    const area = neumarkt();
    const started = performance.now();
    for (let i = 0; i < 200; i++) {
      traffic.step(0.05, { target: 40, area, policeShare: 0.05, random });
      traffic.poses();
    }
    expect((performance.now() - started) / 200).toBeLessThan(1.5);
  });
});
