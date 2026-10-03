import { describe, expect, it } from 'vitest';
import { distanceMeters, type LngLat } from '../../core';
import { decodeInts } from './graph';
import {
  autobahnBetween,
  interCityMinutes,
  interCityRoute,
  nearestRoadPoint,
  networkStats,
  roadDistance,
  roadEntryFrom,
  roadNetworkAt,
  roadRoute,
  travelMinutes,
} from './index';

const EHRENFELD: LngLat = { lng: 6.918, lat: 50.948 };
const NIEHLER_HAFEN: LngLat = { lng: 6.9712, lat: 50.9862 };
const NEUMARKT: LngLat = { lng: 6.9476, lat: 50.9362 };
const DEUTZ: LngLat = { lng: 6.975, lat: 50.936 };
const KALK: LngLat = { lng: 7.003, lat: 50.938 };
const KOELN_DOM: LngLat = { lng: 6.9583, lat: 50.9413 };
const ST_PAULI: LngLat = { lng: 9.9637, lat: 53.5496 };
const WILHELMSBURG: LngLat = { lng: 10.0067, lat: 53.4986 };
const HAMBURG_RATHAUS: LngLat = { lng: 9.9937, lat: 53.5511 };
/** Fahrer mit durchschnittlichem Tempo in der Stadt (logistics: 300 + 50 × 2 Meter pro Spielminute). */
const DRIVER_SPEED = 400;

/** Kleinster Abstand von p zur Linie a-b in Metern (Näherung, reicht für Köln). */
function nearLine(p: LngLat, path: LngLat[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    for (let t = 0; t <= 1; t += 0.05) {
      const q = {
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t,
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t,
      };
      best = Math.min(best, distanceMeters(p, q));
    }
  }
  return best;
}

describe('Straßennetz', () => {
  it('dekodiert das Polyline-Format', () => {
    // Beispiel aus der Beschreibung des Formats (Google): 38.5, -120.2 → "_p~iF~ps|U"
    expect(decodeInts('_p~iF~ps|U')).toEqual([3850000, -12020000]);
    expect(decodeInts('?@A')).toEqual([0, -1, 1]);
  });

  it('hat ein großes, zusammenhängendes Netz über ganz Köln', () => {
    const stats = networkStats();
    expect(stats.nodes).toBeGreaterThan(5000);
    expect(stats.km).toBeGreaterThan(1000);
  });

  it('findet eine Route über Straßen statt Luftlinie', () => {
    const route = roadRoute(EHRENFELD, NIEHLER_HAFEN);
    const air = distanceMeters(EHRENFELD, NIEHLER_HAFEN);
    expect(route.onRoads).toBe(true);
    expect(route.path.length).toBeGreaterThan(10);
    expect(route.meters).toBeGreaterThan(air);
    expect(route.meters).toBeLessThan(air * 1.8);
    expect(route.path[0]).toEqual(EHRENFELD);
    expect(route.path[route.path.length - 1]).toEqual(NIEHLER_HAFEN);
    // Die Länge passt zu den Punkten.
    let sum = 0;
    for (let i = 1; i < route.path.length; i++) sum += distanceMeters(route.path[i - 1], route.path[i]);
    expect(Math.abs(sum - route.meters)).toBeLessThan(route.meters * 0.01);
  });

  it('fährt über eine Brücke auf die andere Rheinseite', () => {
    const route = roadRoute(NEUMARKT, DEUTZ);
    expect(route.onRoads).toBe(true);
    expect(route.meters).toBeLessThan(distanceMeters(NEUMARKT, DEUTZ) * 2.5);
    // Deutzer Brücke oder Severinsbrücke: die Route kreuzt den Rhein zwischen 50,925 und 50,94.
    const crossing = route.path.find((p, i) => i > 0 && route.path[i - 1].lng < 6.966 && p.lng >= 6.966);
    expect(crossing).toBeDefined();
    expect(crossing?.lat).toBeGreaterThan(50.92);
    expect(crossing?.lat).toBeLessThan(50.945);
  });

  it('bleibt nah an den Straßen (kein Abkürzen durch Häuser)', () => {
    const route = roadRoute(EHRENFELD, KALK);
    // Jeder Zwischenpunkt liegt auf einer Straße.
    for (const p of route.path.slice(1, -1)) {
      const road = nearestRoadPoint(p);
      expect(road?.meters ?? 999).toBeLessThan(3);
    }
    // Die Mitte der Luftlinie liegt nicht zufällig genau auf der Route.
    expect(nearLine({ lng: 6.96, lat: 50.943 }, route.path)).toBeGreaterThan(0);
  });

  it('ist deterministisch und merkt sich Routen', () => {
    const a = roadRoute(KALK, EHRENFELD);
    const b = roadRoute({ ...KALK }, { ...EHRENFELD });
    expect(b).toBe(a);
    expect(roadDistance(KALK, EHRENFELD)).toBe(a.meters);
    expect(travelMinutes(KALK, EHRENFELD, 250)).toBe(Math.ceil(a.meters / 250));
    expect(travelMinutes(KALK, EHRENFELD, 250, 10)).toBe(Math.ceil(a.meters / 250) + 10);
  });

  it('gleicher Start und gleiches Ziel', () => {
    const route = roadRoute(NEUMARKT, NEUMARKT);
    expect(route.path.length).toBeGreaterThanOrEqual(2);
    expect(route.meters).toBeLessThan(200);
  });

  it('Luftlinie, wenn keine Straße in der Nähe ist', () => {
    const route = roadRoute({ lng: 4.4, lat: 51.9 }, NEUMARKT);
    expect(route.onRoads).toBe(false);
    expect(route.path).toHaveLength(2);
  });

  it('Lieferungen von weit her kommen über eine Autobahn am Stadtrand', () => {
    const frankfurt = roadEntryFrom({ lng: 8.682, lat: 50.111 });
    const hamburg = roadEntryFrom({ lng: 9.993, lat: 53.551 });
    const center = { lng: 6.958, lat: 50.941 };
    expect(distanceMeters(frankfurt, center)).toBeGreaterThan(4000);
    expect(frankfurt.lat).toBeLessThan(center.lat);
    expect(hamburg.lat).toBeGreaterThan(center.lat);
    expect(roadRoute(frankfurt, EHRENFELD).onRoads).toBe(true);
  });

  it('rechnet schnell genug für die Simulation', () => {
    const started = performance.now();
    for (let i = 0; i < 30; i++) {
      roadRoute(
        { lng: 6.9 + i * 0.003, lat: 50.93 + (i % 5) * 0.004 },
        { lng: 7.0 - i * 0.002, lat: 50.96 - (i % 7) * 0.003 },
      );
    }
    expect((performance.now() - started) / 30).toBeLessThan(50);
  });
});

describe('Mehrere Städte (Auftrag 30)', () => {
  it('hat ein eigenes Netz für Hamburg und wählt es nach dem Ausschnitt', () => {
    const stats = networkStats('hamburg');
    expect(stats.nodes).toBeGreaterThan(5000);
    expect(stats.km).toBeGreaterThan(1000);
    expect(roadNetworkAt(ST_PAULI)).toBe('hamburg');
    expect(roadNetworkAt(KALK)).toBe('koeln');
    expect(roadNetworkAt({ lng: 8.68, lat: 50.11 })).toBeNull();
    // Über die Elbbrücken nach Wilhelmsburg, auf Hamburger Straßen.
    const route = roadRoute(ST_PAULI, WILHELMSBURG);
    expect(route.onRoads).toBe(true);
    expect(route.meters).toBeGreaterThan(distanceMeters(ST_PAULI, WILHELMSBURG));
    expect(route.meters).toBeLessThan(distanceMeters(ST_PAULI, WILHELMSBURG) * 2);
    for (const p of route.path.slice(1, -1)) expect(nearestRoadPoint(p)?.meters ?? 999).toBeLessThan(3);
  });

  it('Lieferungen von weit her kommen am Rand der Stadt an, in die sie gehen', () => {
    const fromBerlin = roadEntryFrom({ lng: 13.4, lat: 52.52 }, ST_PAULI);
    expect(roadNetworkAt(fromBerlin)).toBe('hamburg');
    expect(fromBerlin.lng).toBeGreaterThan(ST_PAULI.lng);
    expect(roadRoute(fromBerlin, ST_PAULI).onRoads).toBe(true);
  });

  it('Köln–Hamburg über die A1: etwa 400 bis 450 km, mit Fahrer 4 bis 5 Stunden', () => {
    const route = interCityRoute(KOELN_DOM, HAMBURG_RATHAUS);
    expect(route.onRoads).toBe(true);
    expect(route.meters).toBeGreaterThan(400_000);
    expect(route.meters).toBeLessThan(450_000);
    expect(route.motorwayMeters).toBeGreaterThan(380_000);
    expect(route.path[0]).toEqual(KOELN_DOM);
    expect(route.path[route.path.length - 1]).toEqual(HAMBURG_RATHAUS);
    // Die A1 führt an Münster und Bremen vorbei.
    for (const place of [
      { lng: 7.63, lat: 51.93 },
      { lng: 8.8, lat: 53.07 },
    ]) {
      expect(Math.min(...route.path.map((p) => distanceMeters(p, place)))).toBeLessThan(15_000);
    }
    const minutes = interCityMinutes(KOELN_DOM, HAMBURG_RATHAUS, DRIVER_SPEED);
    expect(minutes).toBeGreaterThanOrEqual(4 * 60);
    expect(minutes).toBeLessThanOrEqual(5 * 60);
    // roadRoute und travelMinutes erkennen von selbst, dass es zwischen zwei Städten geht.
    expect(roadRoute(KOELN_DOM, HAMBURG_RATHAUS)).toBe(route);
    expect(travelMinutes(KOELN_DOM, HAMBURG_RATHAUS, DRIVER_SPEED, 20)).toBe(minutes + 20);
  });

  it('fährt zurück auf der Gegenfahrbahn, gleich lang', () => {
    const there = interCityRoute(KOELN_DOM, HAMBURG_RATHAUS);
    const back = interCityRoute(HAMBURG_RATHAUS, KOELN_DOM);
    expect(Math.abs(back.meters - there.meters)).toBeLessThan(there.meters * 0.05);
    const line = autobahnBetween('hamburg', 'koeln');
    expect(line?.path[0].lat).toBeGreaterThan(53.4);
    expect(line?.path[line.path.length - 1].lat).toBeLessThan(51.1);
    expect(autobahnBetween('koeln', 'berlin')).toBeNull();
  });
});
