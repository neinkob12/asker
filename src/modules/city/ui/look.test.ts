import { describe, expect, it } from 'vitest';
import { clock } from '../../../core';
import { CITIES } from '../index';
import { cityMoodAt, citySoundLevels, mixMood } from './look';

describe('Stimmung der Städte (Auftrag 51)', () => {
  it('jede spielbare Stadt hat einen eigenen Look', () => {
    const playable = CITIES.filter((c) => !c.template && !c.abroad);
    for (const city of playable) expect(city.look, city.id).toBeDefined();
    const nightGlows = new Set(playable.map((c) => c.look?.night.glowTint));
    expect(nightGlows.size).toBe(playable.length);
  });

  it('mittags gilt der Tag, um Mitternacht die Nacht', () => {
    const berlin = CITIES.find((c) => c.id === 'berlin')?.look;
    if (!berlin) throw new Error('Berlin ohne Look');
    expect(cityMoodAt(berlin, 12 * 60).desaturate).toBeCloseTo(berlin.day.desaturate ?? 0);
    expect(cityMoodAt(berlin, 12 * 60).glowTintStrength).toBeUndefined();
    expect(cityMoodAt(berlin, 0).glowTint).toBe(berlin.night.glowTint);
  });

  it('mischt Zahlen linear und lässt leere Werte weg', () => {
    expect(mixMood({ brighten: 0.2 }, {}, 0.5)).toEqual({ brighten: 0.1 });
    expect(mixMood({}, { tint: '#ffffff', tintStrength: 0.4 }, 0.5)).toEqual({ tint: '#ffffff', tintStrength: 0.2 });
    expect(mixMood({ tint: '#ffffff', tintStrength: 0.4 }, {}, 1)).toEqual({});
  });
});

describe('Geräusche der Städte (Auftrag 51)', () => {
  const berlin = CITIES.find((c) => c.id === 'berlin')?.sounds;
  // Spielzeit an einem Wochentag (0 = Montag) und einer Stunde in der ersten Woche.
  const at = (weekday: number, hour: number) => {
    const day = [0, 1, 2, 3, 4, 5, 6].find((d) => clock.weekday(d * 1440) === weekday) ?? 0;
    return day * 1440 + hour * 60;
  };

  it('Berlin: am Wochenende laut, unter der Woche nur nachts leise, tagsüber still', () => {
    expect(citySoundLevels(berlin, at(5, 15)).club).toBe(0.9); // Samstag 15 Uhr
    expect(citySoundLevels(berlin, at(0, 3)).club).toBe(0.9); // Montag 3 Uhr, noch Wochenende
    expect(citySoundLevels(berlin, at(2, 1)).club).toBe(0.3); // Mittwoch 1 Uhr
    expect(citySoundLevels(berlin, at(2, 13)).club ?? 0).toBe(0); // Mittwoch 13 Uhr
  });

  it('Städte ohne Geräusche bleiben still', () => {
    expect(citySoundLevels(CITIES.find((c) => c.id === 'koeln')?.sounds, at(2, 1))).toEqual({});
  });
});
