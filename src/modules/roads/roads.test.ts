import { describe, expect, it } from 'vitest';
import { distanceMeters, type LngLat } from '../../core';
import { decodeInts, findRoute, findRouteMeters } from './graph';
import {
  autobahnBetween,
  interCityMinutes,
  interCityRoute,
  nearestRoadPoint,
  networkStats,
  roadApproach,
  roadApproaches,
  roadDistance,
  roadEntryFrom,
  roadNetworkAt,
  roadRoute,
  SHIP_SPEED,
  shipMinutes,
  shipRoute,
  travelMinutes,
} from './index';

const EHRENFELD: LngLat = { lng: 6.918, lat: 50.948 };
const NIEHLER_HAFEN: LngLat = { lng: 6.9679, lat: 50.98527 };
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

  it('trennt Fahrstrecke und Fußweg: das Fahrzeug hält an der Straße', () => {
    // Aachener Weiher liegt im Park, etwa 55 m von der Richard-Wagner-Straße.
    const weiher = { lng: 6.92821, lat: 50.93605 };
    const route = roadRoute(EHRENFELD, weiher);
    expect(route.onRoads).toBe(true);
    expect(route.walkTo).not.toBeNull();
    const [road, goal] = route.walkTo as [LngLat, LngLat];
    expect(goal).toEqual(route.path[route.path.length - 1]);
    expect(road).toEqual(route.drive[route.drive.length - 1]);
    expect(distanceMeters(road, goal)).toBeGreaterThan(30);
    expect(distanceMeters(road, goal)).toBeLessThan(61);
    // Das Ende der Fahrstrecke liegt auf der Straße.
    expect(nearestRoadPoint(road)?.meters ?? 99).toBeLessThan(2);
    // Start und Ziel direkt auf der Straße: kein Fußweg.
    const onRoad = nearestRoadPoint(NEUMARKT)?.point as LngLat;
    const direct = roadRoute(onRoad, nearestRoadPoint(DEUTZ)?.point as LngLat);
    expect(direct.walkFrom).toBeNull();
    expect(direct.walkTo).toBeNull();
    expect(direct.drive).toEqual(direct.path);
  });

  it('Kuriere kommen über die Autobahn ihrer Richtung herein', () => {
    const refs = roadApproaches().map((a) => a.ref);
    for (const ref of ['A1', 'A3', 'A4', 'A57']) expect(refs).toContain(ref);
    const frankfurt = roadApproach({ lng: 8.682, lat: 50.111 }, 'A3');
    const amsterdam = roadApproach({ lng: 4.904, lat: 52.37 }, 'A57');
    const berlin = roadApproach({ lng: 13.405, lat: 52.52 }, 'A1');
    const hamburg = roadApproach({ lng: 9.993, lat: 53.551 }, 'A1');
    expect(frankfurt?.toward).toContain('Frankfurt');
    expect(amsterdam?.toward).toContain('Amsterdam');
    expect(berlin?.toward).toContain('Hamburg');
    expect(hamburg).toBe(berlin);
    for (const approach of [frankfurt, amsterdam, hamburg]) {
      const path = approach?.path ?? [];
      // Der Weg endet im Netz und geht von dort über Straßen weiter.
      expect(nearestRoadPoint(path[path.length - 1])?.meters ?? 99).toBeLessThan(2);
      expect(roadRoute(path[path.length - 1], EHRENFELD).onRoads).toBe(true);
    }
    expect(roadEntryFrom({ lng: 8.682, lat: 50.111 }, 'A3')).toEqual(frankfurt?.path.at(-1));
  });

  it('In Hamburg kommen Kuriere über A7, A24 und A1 herein', () => {
    const refs = roadApproaches('hamburg').map((a) => a.ref);
    for (const ref of ['A1', 'A7', 'A23', 'A24', 'A25', 'A26']) expect(refs).toContain(ref);
    const altona = { lng: 9.935, lat: 53.552 };
    const frankfurt = roadApproach({ lng: 8.682, lat: 50.111 }, 'A7', altona);
    const berlin = roadApproach({ lng: 13.405, lat: 52.52 }, 'A24', altona);
    const amsterdam = roadApproach({ lng: 4.904, lat: 52.37 }, 'A1', altona);
    const koeln = roadApproach({ lng: 6.958, lat: 50.938 }, 'A1', altona);
    expect(frankfurt?.toward).toContain('Hannover');
    expect(berlin?.toward).toContain('Berlin');
    expect(amsterdam?.toward).toContain('Bremen');
    expect(koeln).toBe(amsterdam);
    for (const approach of [frankfurt, berlin, amsterdam]) {
      const path = approach?.path ?? [];
      expect(nearestRoadPoint(path[path.length - 1])?.meters ?? 99).toBeLessThan(2);
      expect(roadRoute(path[path.length - 1], altona).onRoads).toBe(true);
    }
  });

  it('Schiffe fahren auf echten Wasserwegen (Overture): Rhein ab Rotterdam, Elbe ab Cuxhaven', () => {
    const length = (path: LngLat[]) => path.slice(1).reduce((sum, p, i) => sum + distanceMeters(path[i], p), 0) / 1000;
    const rhein = shipRoute('koeln');
    const elbe = shipRoute('hamburg');
    expect(length(rhein)).toBeGreaterThan(250);
    expect(length(rhein)).toBeLessThan(320);
    expect(length(elbe)).toBeGreaterThan(100);
    expect(length(elbe)).toBeLessThan(140);
    // Rotterdam im Westen, Ende am Niehler Hafen; Cuxhaven im Nordwesten, Ende im Hamburger Hafen.
    expect(rhein[0].lng).toBeLessThan(4.5);
    expect(distanceMeters(rhein[rhein.length - 1], NIEHLER_HAFEN)).toBeLessThan(100);
    expect(elbe[0].lng).toBeLessThan(8.8);
    expect(elbe[elbe.length - 1].lat).toBeGreaterThan(53.5);
    // Keine großen Sprünge: Gerade Stücke gibt es nur, wo der Fluss gerade ist (vereinfacht auf 30 m).
    for (const path of [rhein, elbe]) {
      for (let i = 1; i < path.length; i++) expect(distanceMeters(path[i - 1], path[i])).toBeLessThan(8000);
    }
    expect(shipMinutes('koeln')).toBe(Math.ceil((length(rhein) * 1000) / SHIP_SPEED));
    expect(shipRoute('berlin')).toEqual([]);
    expect(shipMinutes('berlin')).toBe(0);
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
    expect(roadNetworkAt({ lng: 8.68, lat: 50.11 })).toBe('frankfurt');
    // Leipzig liegt in keiner Stadt im Spiel (auch nicht, wenn Berlin und München Netze haben).
    expect(roadNetworkAt({ lng: 12.37, lat: 51.34 })).toBeNull();
    // Über die Elbbrücken nach Wilhelmsburg, auf Hamburger Straßen.
    const route = roadRoute(ST_PAULI, WILHELMSBURG);
    expect(route.onRoads).toBe(true);
    expect(route.meters).toBeGreaterThan(distanceMeters(ST_PAULI, WILHELMSBURG));
    expect(route.meters).toBeLessThan(distanceMeters(ST_PAULI, WILHELMSBURG) * 2);
    for (const p of route.path.slice(1, -1)) expect(nearestRoadPoint(p)?.meters ?? 999).toBeLessThan(3);
  });

  it('Lieferungen von weit her kommen am Rand der Stadt an, in die sie gehen', () => {
    const fromBerlin = roadEntryFrom({ lng: 13.4, lat: 52.52 }, undefined, ST_PAULI);
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

/** Feste Folge von Punkten um die Mitte einer Stadt (eigener Zufall, kein Spielzufall). */
function scatter(center: LngLat, count: number, seed: number): LngLat[] {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return Array.from({ length: count }, () => ({
    lng: center.lng + (next() - 0.5) * 0.14,
    lat: center.lat + (next() - 0.5) * 0.08,
  }));
}

describe('Suche mit wiederverwendetem Arbeitsspeicher', () => {
  it('gleiche Anfrage, gleiches Ergebnis, auch nach vielen anderen Suchen dazwischen (Stempel statt Zurücksetzen)', () => {
    const points = scatter(NEUMARKT, 40, 7);
    const first = findRoute(points[0], points[1], 'koeln');
    const sample = points.slice(2).map((p, i) => findRoute(points[i], p, 'koeln'));
    expect(first).not.toBeNull();
    expect(findRoute(points[0], points[1], 'koeln')).toEqual(first);
    // Eine Hamburger Suche dazwischen stört die Kölner nicht (eigener Speicher pro Netz).
    findRoute(ST_PAULI, WILHELMSBURG, 'hamburg');
    expect(points.slice(2).map((p, i) => findRoute(points[i], p, 'koeln'))).toEqual(sample);
  });

  it('die Länge ohne Wegbau ist bitgleich mit der Länge der vollen Route (beide Städte, auch Start gleich Ziel)', () => {
    const pairs: [LngLat, LngLat, string][] = [];
    const koeln = scatter(NEUMARKT, 60, 11);
    const hamburg = scatter(HAMBURG_RATHAUS, 60, 13);
    for (let i = 1; i < koeln.length; i++) pairs.push([koeln[i - 1], koeln[i], 'koeln']);
    for (let i = 1; i < hamburg.length; i++) pairs.push([hamburg[i - 1], hamburg[i], 'hamburg']);
    pairs.push([NEUMARKT, NEUMARKT, 'koeln'], [DEUTZ, KALK, 'koeln'], [KALK, DEUTZ, 'koeln']);
    for (const [a, b, net] of pairs) {
      const full = findRoute(a, b, net);
      const meters = findRouteMeters(a, b, net);
      expect(meters).toBe(full === null ? null : full.meters);
    }
  });

  it('roadDistance rechnet ohne Wegbau und liefert dieselben Meter wie roadRoute', () => {
    const points = [...scatter(KOELN_DOM, 30, 21), ...scatter(HAMBURG_RATHAUS, 30, 23)];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      // Erst die Länge (noch nichts gemerkt), dann die volle Route.
      const meters = roadDistance(a, b);
      expect(meters).toBe(roadRoute(a, b).meters);
      expect(roadDistance(a, b)).toBe(meters);
    }
    // Fahrzeiten bleiben ganze Minuten aus denselben Metern.
    expect(travelMinutes(EHRENFELD, NIEHLER_HAFEN, DRIVER_SPEED)).toBe(
      Math.max(1, Math.ceil(roadRoute(EHRENFELD, NIEHLER_HAFEN).meters / DRIVER_SPEED)),
    );
  });
});

describe('Routen-Cache', () => {
  it('verdrängt die am längsten unbenutzte Route, nicht die älteste (LRU)', () => {
    const hot = roadRoute(NEUMARKT, DEUTZ);
    // Mehr verschiedene Routen als in den Cache passen; die erste wird dabei immer wieder gebraucht.
    for (let i = 0; i < 700; i++) {
      const to = { lng: 6.9 + (i % 28) * 0.0037, lat: 50.9 + Math.floor(i / 28) * 0.0041 };
      roadRoute(NEUMARKT, to);
      if (i % 100 === 99) expect(roadRoute(NEUMARKT, DEUTZ)).toBe(hot);
    }
    expect(roadRoute(NEUMARKT, DEUTZ)).toBe(hot);
  });
});
