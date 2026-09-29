import { describe, expect, it } from 'vitest';
import { clock, distanceMeters } from '../core';
import { DAWN, DUSK, daylight, daylightAt, dayPhase, twilight } from './daylight';
import { bearing, formatDms, metersPerPixel, offsetAround, offsetMeters, pathLength, pointAlong } from './geometry';
import { LANDMARK_ZONES, LANDMARKS, landmarkFeatures } from './landmarks';
import { combineMoods, computeLook, mixColor, PALETTES, paletteBlend, pastel } from './look';

const KOELN = { lng: 6.95, lat: 50.94 };

describe('Tag und Nacht', () => {
  it('ist nachts finster, tagsüber hell und dazwischen weich', () => {
    expect(daylight(0)).toBe(0);
    expect(daylight(3 * 60)).toBe(0);
    expect(daylight(12 * 60)).toBe(1);
    expect(daylight(18 * 60)).toBe(1);
    expect(daylight(23 * 60)).toBe(0);
    const mid = daylight((DUSK.start + DUSK.end) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    // Keine Sprünge: Minute für Minute höchstens ein kleiner Schritt.
    for (let m = 1; m < 1440; m++) expect(Math.abs(daylight(m) - daylight(m - 1))).toBeLessThan(0.02);
  });

  it('kennt Phasen und Dämmerungsfarbe', () => {
    expect(dayPhase(2 * 60)).toBe('night');
    expect(dayPhase(DAWN.start + 10)).toBe('dawn');
    expect(dayPhase(14 * 60)).toBe('day');
    expect(dayPhase(DUSK.start + 10)).toBe('dusk');
    expect(twilight(14 * 60)).toBe(0);
    expect(twilight((DUSK.start + DUSK.end) / 2)).toBeCloseTo(1);
  });

  it('hängt an der Spieluhr', () => {
    expect(daylightAt(clock.at(3, 13))).toBe(1);
    expect(daylightAt(clock.at(3, 2))).toBe(0);
  });
});

describe('Geometrie für Effekte', () => {
  const path = [
    { lng: 6.9, lat: 50.9 },
    { lng: 6.95, lat: 50.9 },
    { lng: 6.95, lat: 50.95 },
  ];

  it('misst Linien und findet Punkte gleichmäßig nach Metern', () => {
    const total = pathLength(path);
    expect(total).toBeCloseTo(distanceMeters(path[0], path[1]) + distanceMeters(path[1], path[2]), 3);
    expect(pointAlong(path, 0).position).toEqual(path[0]);
    expect(pointAlong(path, 1).position.lat).toBeCloseTo(50.95, 6);
    // Die Hälfte der Strecke liegt schon auf dem zweiten Abschnitt.
    const half = pointAlong(path, 0.5).position;
    expect(distanceMeters(path[0], path[1]) + distanceMeters(path[1], half)).toBeCloseTo(total / 2, -1);
  });

  it('liefert die Fahrtrichtung', () => {
    expect(pointAlong(path, 0.1).bearing).toBeCloseTo(90, 0);
    expect(pointAlong(path, 0.9).bearing).toBeCloseTo(0, 0);
    expect(bearing(path[2], path[1])).toBeCloseTo(180, 0);
  });

  it('verteilt Figuren im Kreis um einen Punkt', () => {
    const center = { lng: 6.95, lat: 50.94 };
    expect(offsetAround(center, 0, 1)).toEqual(center);
    const points = [0, 1, 2].map((i) => offsetAround(center, i, 3, 20));
    for (const p of points) expect(distanceMeters(center, p)).toBeCloseTo(20, 0);
    expect(distanceMeters(points[0], points[1])).toBeGreaterThan(20);
  });
});

describe('Koordinaten', () => {
  it('zeigt Grad, Minuten und Sekunden', () => {
    expect(formatDms(50.939, 'lat')).toBe(`50°56'20"N`);
    expect(formatDms(6.949, 'lng')).toBe(`006°56'56"E`);
    expect(formatDms(-0.5, 'lng')).toBe(`000°30'00"W`);
  });
});

describe('Candy-Look nach Tageszeit', () => {
  const at = (hour: number, minute = 0) => hour * 60 + minute;
  const mid = (w: { start: number; end: number }) => (w.start + w.end) / 2;

  it('zeigt tagsüber, nachts, morgens und abends die Paletten aus dem Prototyp', () => {
    expect(computeLook(at(13)).land).toBe(PALETTES.day.land);
    expect(computeLook(at(13)).water).toBe('#8ad3f4');
    expect(computeLook(at(2)).land).toBe(PALETTES.night.land);
    expect(computeLook(at(2)).sky).toBe('#141433');
    expect(computeLook(mid(DAWN)).land).toBe(PALETTES.dawn.land);
    expect(computeLook(mid(DUSK)).major).toBe(PALETTES.dusk.major);
    expect(computeLook(at(2)).phase).toBe('night');
    expect(computeLook(mid(DUSK)).phase).toBe('dusk');
  });

  it('blendet weich über, ohne Sprünge', () => {
    const dist = (a: string, b: string) => {
      const pa = Number.parseInt(a.slice(1), 16);
      const pb = Number.parseInt(b.slice(1), 16);
      let d = 0;
      for (const shift of [16, 8, 0]) d += Math.abs(((pa >> shift) & 255) - ((pb >> shift) & 255));
      return d;
    };
    for (let m = 1; m < 1440; m++) {
      const a = computeLook(m - 1);
      const b = computeLook(m);
      expect(dist(a.land, b.land)).toBeLessThan(24);
      expect(dist(a.buildings[3], b.buildings[3])).toBeLessThan(24);
      expect(Math.abs(a.night - b.night)).toBeLessThan(0.1);
    }
    // Zwischen Abend und Nacht liegt eine Mischung.
    const blend = paletteBlend(DUSK.end - 20);
    expect(blend.from).toBe('dusk');
    expect(blend.to).toBe('night');
    expect(blend.t).toBeGreaterThan(0);
    expect(blend.t).toBeLessThan(1);
  });

  it('bleibt nachts dunkel, mit leuchtenden Hauptstraßen, Wasser und Parks gut sichtbar', () => {
    const night = computeLook(at(2));
    const day = computeLook(at(13));
    expect(night.glow).toBeGreaterThan(0.5);
    expect(day.glow).toBe(0);
    expect(night.night).toBe(1);
    expect(day.night).toBe(0);
    // Wasser und Park heben sich klar vom Land ab.
    const brightness = (c: string) => {
      const n = Number.parseInt(c.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(night.park).not.toBe(night.land);
    expect(Math.abs(brightness(night.water) - brightness(night.land))).toBeGreaterThan(20);
    expect(brightness(night.major)).toBeGreaterThan(brightness(night.land) * 3);
  });

  it('Wetter-Stimmungen trüben ein und färben', () => {
    const clear = computeLook(at(13));
    const storm = computeLook(at(13), combineMoods([{ darken: 0.6, tint: '#223344', tintStrength: 0.4, wet: 1 }]));
    const snow = computeLook(at(13), { brighten: 0.4, desaturate: 0.6 });
    expect(storm.land).not.toBe(clear.land);
    expect(storm.lightIntensity).toBeLessThan(clear.lightIntensity);
    expect(storm.shadowOpacity).toBeLessThan(clear.shadowOpacity);
    expect(snow.park).not.toBe(clear.park);
    expect(computeLook(at(2), { wet: 1 }).glow).toBeGreaterThan(computeLook(at(2)).glow);
    expect(computeLook(at(13), { haze: 1 }).fogBlend).toBeLessThan(clear.fogBlend);
  });

  it('mischt Farben und Stimmungen', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('#102030', '#102030', 0.3)).toBe('#102030');
    expect(pastel('#000000', 1)).toBe('#ffffff');
    const mood = combineMoods([
      { darken: 0.7, tint: '#ff0000', tintStrength: 0.2 },
      { darken: 0.6, tint: '#0000ff', tintStrength: 0.2 },
    ]);
    expect(mood.darken).toBe(1);
    expect(mood.tint).toBe('#800080');
    expect(combineMoods([]).tint).toBeUndefined();
  });
});

describe('Wahrzeichen', () => {
  it('stehen an echten Orten mit ungefähren Maßen', () => {
    const ids = LANDMARKS.map((l) => l.id);
    for (const id of ['dom', 'hohenzollernbruecke', 'colonius', 'kranhaus-nord', 'koelntriangle']) {
      expect(ids).toContain(id);
    }
    const dom = LANDMARKS.find((l) => l.id === 'dom');
    expect(dom).toBeDefined();
    expect(Math.max(...(dom?.parts.map((p) => p.height) ?? []))).toBe(157);
    expect(distanceMeters(dom?.center ?? KOELN, { lng: 6.9583, lat: 50.9413 })).toBeLessThan(80);
    const colonius = LANDMARKS.find((l) => l.id === 'colonius');
    expect(Math.max(...(colonius?.parts.map((p) => p.height) ?? []))).toBe(266);
  });

  it('liefern GeoJSON mit geschlossenen Ringen und Farben für Tag und Nacht', () => {
    const day = landmarkFeatures(0);
    const night = landmarkFeatures(1);
    expect(day.features.length).toBeGreaterThan(20);
    for (const f of day.features) {
      const ring = f.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(f.properties.height).toBeGreaterThan(f.properties.base);
      // Nichts liegt weiter als 400 m von seinem Wahrzeichen entfernt.
      const landmark = LANDMARKS.find((l) => l.id === f.properties.id);
      const [lng, lat] = ring[0];
      expect(distanceMeters(landmark?.center ?? KOELN, { lng, lat })).toBeLessThan(400);
    }
    expect(night.features[0].properties.color).not.toBe(day.features[0].properties.color);
    expect(LANDMARK_ZONES.features).toHaveLength(LANDMARKS.length);
  });

  it('rechnet lokale Meter in Koordinaten um', () => {
    const origin = { lng: 6.95, lat: 50.94 };
    const east = offsetMeters(origin, 90, 100, 0);
    expect(distanceMeters(origin, east)).toBeCloseTo(100, 0);
    expect(bearing(origin, east)).toBeCloseTo(90, 0);
    const left = offsetMeters(origin, 90, 0, 50);
    expect(bearing(origin, left)).toBeCloseTo(0, 0);
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 0);
    expect(metersPerPixel(50.94, 14)).toBeLessThan(metersPerPixel(50.94, 13));
  });
});
