import { describe, expect, it } from 'vitest';
import { clock, distanceMeters } from '../core';
import { DAWN, DUSK, daylight, daylightAt, dayPhase, twilight } from './daylight';
import { bearing, formatDms, offsetAround, pathLength, pointAlong } from './geometry';
import { combineMoods, computeLook, mixColor } from './look';

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

describe('Nacht-Satellit', () => {
  it('ist nachts dunkler, entsättigter und blauer als tagsüber', () => {
    const night = computeLook(0, 0);
    const day = computeLook(1, 0);
    expect(night.rasterBrightnessMax).toBeLessThan(day.rasterBrightnessMax / 2);
    expect(night.rasterSaturation).toBeLessThan(day.rasterSaturation);
    expect(night.tintOpacity).toBeGreaterThan(day.tintOpacity);
    expect(night.roadGlowOpacity).toBeGreaterThan(day.roadGlowOpacity * 5);
    expect(night.windowsLit).toBeGreaterThan(0.8);
    expect(day.windowsLit).toBeLessThan(0.2);
  });

  it('Wetter-Stimmungen dunkeln ab und färben', () => {
    const clear = computeLook(1, 0);
    const storm = computeLook(1, 0, combineMoods([{ darken: 0.6, tint: '#223344', tintStrength: 0.4, wet: 1 }]));
    expect(storm.rasterBrightnessMax).toBeLessThan(clear.rasterBrightnessMax);
    expect(storm.tintOpacity).toBeGreaterThan(clear.tintOpacity);
    expect(computeLook(0, 0, { wet: 1 }).roadGlowOpacity).toBeGreaterThan(computeLook(0, 0).roadGlowOpacity);
  });

  it('mischt Farben und Stimmungen', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('#102030', '#102030', 0.3)).toBe('#102030');
    const mood = combineMoods([
      { darken: 0.7, tint: '#ff0000', tintStrength: 0.2 },
      { darken: 0.6, tint: '#0000ff', tintStrength: 0.2 },
    ]);
    expect(mood.darken).toBe(1);
    expect(mood.tint).toBe('#800080');
    expect(combineMoods([]).tint).toBeUndefined();
  });
});
