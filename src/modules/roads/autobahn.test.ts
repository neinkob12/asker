// Autobahn-Netz zwischen den Städten (Auftrag 36): sechs Linien aus Overture, kürzester Weg über den Graphen, auch über
// eine Stadt hinweg; Fahrten zwischen Köln und Hamburg bleiben auf der A1.

import { describe, expect, it } from 'vitest';
import { distanceMeters, type LngLat } from '../../core';
import { AUTOBAHNEN } from './autobahn';
import {
  autobahnBetween,
  autobahnCities,
  autobahnLines,
  autobahnPath,
  autobahnRefs,
  interCityMinutes,
  interCityRoute,
} from './index';

const KOELN_DOM: LngLat = { lng: 6.9583, lat: 50.9413 };
const HAMBURG_RATHAUS: LngLat = { lng: 9.9925, lat: 53.5503 };
const FRANKFURTER_KREUZ: LngLat = { lng: 8.596, lat: 50.055 };
const MUENCHEN_NORD: LngLat = { lng: 11.615, lat: 48.215 };
const BERLIN_FUNKTURM: LngLat = { lng: 13.275, lat: 52.505 };

describe('Autobahn-Netz (Auftrag 36)', () => {
  it('sechs Linien zwischen den fünf Städten, jede mit Nummern und plausibler Länge', () => {
    const pairs = AUTOBAHNEN.map((l) => `${l.from}-${l.to}`);
    expect(pairs).toEqual(
      expect.arrayContaining([
        'koeln-hamburg',
        'koeln-frankfurt',
        'frankfurt-muenchen',
        'hamburg-berlin',
        'berlin-muenchen',
        'hamburg-frankfurt',
        // Auftrag 40: nach Rotterdam und weiter nach Antwerpen (Häfen der Hafen-Phase).
        'koeln-rotterdam',
        'rotterdam-antwerpen',
      ]),
    );
    expect(autobahnCities()).toEqual(['antwerpen', 'berlin', 'frankfurt', 'hamburg', 'koeln', 'muenchen', 'rotterdam']);
    for (const line of autobahnLines()) {
      const crow = distanceMeters(line.path[0], line.path[line.path.length - 1]);
      // Eine Autobahn ist länger als die Luftlinie, aber nicht doppelt so lang.
      expect(line.meters, `${line.from}-${line.to}`).toBeGreaterThan(crow);
      expect(line.meters, `${line.from}-${line.to}`).toBeLessThan(crow * 1.6);
      expect(line.refs[0], `${line.from}-${line.to}`).toBe(line.ref);
    }
  });

  it('Rotterdam hängt über Köln am Netz (Auftrag 40): nach Berlin über Köln und Hamburg', () => {
    const way = autobahnPath('rotterdam', 'berlin');
    expect(way?.via).toEqual(['koeln', 'hamburg']);
    const route = interCityRoute({ lng: 4.4, lat: 51.9 }, KOELN_DOM);
    expect(route.motorwayMeters).toBeGreaterThan(250_000);
    expect(route.refs[0]).toBe('A 3');
  });

  it('die Enden einer Stadt treffen sich (Frankfurter Kreuz, Kreuz München-Nord, Dreieck Funkturm)', () => {
    const ends = (city: string) =>
      autobahnLines().flatMap((l) => [
        ...(l.from === city ? [l.path[0]] : []),
        ...(l.to === city ? [l.path[l.path.length - 1]] : []),
      ]);
    for (const [city, node] of [
      ['frankfurt', FRANKFURTER_KREUZ],
      ['muenchen', MUENCHEN_NORD],
      ['berlin', BERLIN_FUNKTURM],
    ] as const) {
      for (const end of ends(city)) expect(distanceMeters(end, node), city).toBeLessThan(3000);
    }
  });

  it('kürzester Weg über das Netz, auch über eine Stadt hinweg', () => {
    expect(autobahnPath('koeln', 'hamburg')?.via).toEqual([]);
    expect(autobahnRefs('koeln', 'hamburg')).toEqual(['A 1']);
    const muenchen = autobahnPath('koeln', 'muenchen');
    expect(muenchen?.via).toEqual(['frankfurt']);
    expect(muenchen?.legs.map((l) => l.ref)).toEqual(['A 3', 'A 3']);
    expect(autobahnPath('koeln', 'berlin')?.via).toEqual(['hamburg']);
    expect(autobahnRefs('koeln', 'berlin')).toEqual(['A 1', 'A 24', 'A 10', 'A 111', 'A 100']);
    // Rückweg: gleiche Städte, umgekehrt.
    expect(autobahnPath('muenchen', 'koeln')?.via).toEqual(['frankfurt']);
    expect(autobahnPath('koeln', 'koeln')).toBeNull();
    // Direkte Linie nur zwischen Nachbarn.
    expect(autobahnBetween('koeln', 'berlin')).toBeNull();
    expect(autobahnBetween('muenchen', 'frankfurt')?.path[0].lat).toBeLessThan(48.5);
  });

  it('Fahrt über eine Stadt hinweg: Köln → Berlin über Hamburg, die Wege hängen aneinander', () => {
    const route = interCityRoute(KOELN_DOM, BERLIN_FUNKTURM);
    expect(route.via).toEqual(['hamburg']);
    expect(route.path[0]).toEqual(KOELN_DOM);
    expect(route.path[route.path.length - 1]).toEqual(BERLIN_FUNKTURM);
    expect(route.motorwayMeters).toBeGreaterThan(650_000);
    // Kein Sprung im Weg: Zwei Punkte hintereinander liegen nie weit auseinander.
    for (let i = 1; i < route.path.length; i++) {
      expect(distanceMeters(route.path[i - 1], route.path[i])).toBeLessThan(25_000);
    }
    // Durch Hamburg über die Straßen von der A1 zur A24.
    expect(Math.min(...route.path.map((p) => distanceMeters(p, { lng: 10.05, lat: 53.53 })))).toBeLessThan(5000);
    expect(interCityMinutes(KOELN_DOM, BERLIN_FUNKTURM, 400)).toBeGreaterThan(6 * 60);
  });

  it('Köln–Hamburg bleibt die A1 (keine Abkürzung über Frankfurt)', () => {
    const route = interCityRoute(KOELN_DOM, HAMBURG_RATHAUS);
    expect(route.via).toEqual([]);
    expect(route.refs).toEqual(['A 1']);
  });
});
