// Stimmung der Karte je Stadt (Auftrag 51, Charakter der Städte): Die Daten stehen in CITIES (look), hier werden Tag
// und Nacht nach dem Tageslicht gemischt, die Dämmerung legt sich obendrauf, und das Ergebnis geht als Stimmung 'city'
// an die Karte (wie das Wetter, beides addiert sich). Dazu Musik und Geräusche der Stadt. Reine Optik und Klang:
// liest den Zustand, ändert ihn nie.

import { clock, type GameState } from '../../../core';
import { daylight, type MapLayer, type MapMood, mixColor, setMapMood, twilight } from '../../../map';
import { type AmbienceId, audio } from '../../../ui';
import { activeCity, type CityLook, type CityMood, type CitySound, getCity } from '../index';

const NUMBERS = ['tintStrength', 'desaturate', 'brighten', 'darken', 'glowTintStrength', 'glowBoost'] as const;

/** Zwei Stimmungen mischen: Zahlen linear, Farben nach ihrem Anteil an der Stärke. */
export function mixMood(a: CityMood, b: CityMood, t: number): CityMood {
  const out: CityMood = {};
  for (const key of NUMBERS) {
    const v = (a[key] ?? 0) * (1 - t) + (b[key] ?? 0) * t;
    if (v > 0) out[key] = Math.round(v * 1000) / 1000;
  }
  const color = (ca: string | undefined, sa: number, cb: string | undefined, sb: number) => {
    if (!ca) return cb;
    if (!cb) return ca;
    const wa = sa * (1 - t);
    const wb = sb * t;
    return wa + wb > 0 ? mixColor(ca, cb, wb / (wa + wb)) : ca;
  };
  const tint = color(a.tint, a.tintStrength ?? 0, b.tint, b.tintStrength ?? 0);
  if (tint && out.tintStrength) out.tint = tint;
  const glow = color(a.glowTint, a.glowTintStrength ?? 0, b.glowTint, b.glowTintStrength ?? 0);
  if (glow && out.glowTintStrength) out.glowTint = glow;
  return out;
}

/** Stimmung einer Stadt zu einer Minute des Tages. */
export function cityMoodAt(look: CityLook, minuteOfDay: number): MapMood {
  const base = mixMood(look.night, look.day, daylight(minuteOfDay));
  const dusk = twilight(minuteOfDay);
  if (!look.twilight || dusk <= 0) return base;
  // Die Dämmerung kommt dazu (gewichtet), statt die Grundstimmung zu ersetzen.
  const extra = mixMood({}, look.twilight, dusk);
  const sum: CityMood = { ...base };
  for (const key of NUMBERS) {
    const v = (base[key] ?? 0) + (extra[key] ?? 0);
    if (v > 0) sum[key] = Math.min(1, v);
  }
  sum.tint = base.tint && extra.tint ? mixColor(base.tint, extra.tint, 0.5) : (base.tint ?? extra.tint);
  return sum;
}

/** Geräusche, die eine Stadt haben kann (Kennungen aus src/audio). */
const CITY_AMBIENCE: readonly AmbienceId[] = ['harbor', 'club', 'airport'];

/** Stunde der Woche in einem Fenster [von, bis), das über Montag springen darf. */
function inWeekWindow(time: number, [from, to]: readonly [number, number]): boolean {
  const hour = clock.weekday(time) * 24 + clock.hour(time);
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Lautstärke je Geräusch der Stadt zu einer Spielzeit (der lauteste Eintrag einer Kennung gilt). */
export function citySoundLevels(sounds: readonly CitySound[] | undefined, time: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sound of sounds ?? []) {
    if (sound.weekHours && !inWeekWindow(time, sound.weekHours)) continue;
    const level = sound.night ? sound.level * (1 - daylight(time % 1440)) : sound.level;
    out[sound.id] = Math.max(out[sound.id] ?? 0, Math.round(level * 100) / 100);
  }
  return out;
}

export const cityLookLayer: MapLayer = {
  id: 'city.look',
  order: 1,
  mount() {
    let last = '';
    return {
      update(state: GameState) {
        const cityId = activeCity(state);
        // Musik der Stadt (eigene Stücke, tracks.ts).
        audio.setCity(cityId);
        const city = getCity(cityId);
        const levels = citySoundLevels(city?.sounds, state.time);
        for (const id of CITY_AMBIENCE) audio.setAmbience(id, levels[id] ?? 0);
        const look = city?.look;
        const mood = look ? cityMoodAt(look, state.time % 1440) : null;
        const key = JSON.stringify(mood);
        if (key === last) return;
        last = key;
        setMapMood('city', mood);
      },
      destroy() {
        setMapMood('city', null);
        for (const id of CITY_AMBIENCE) audio.setAmbience(id, 0);
      },
    };
  },
};
