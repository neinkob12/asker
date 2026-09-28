// Wetter. Stand Fundament: immer klar, kein eigener Zustand. Wetterwechsel und Optik baut Auftrag 14.
//
// Öffentliche API:
//   getWeather(state), weatherDemandFactor(state), WEATHER_NAMES

import { defineModule, type GameState } from '../../core';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'heat';

export interface Weather {
  kind: WeatherKind;
  /** Temperatur in °C. */
  temperature: number;
}

export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: 'Klar',
  cloudy: 'Bewölkt',
  rain: 'Regen',
  storm: 'Gewitter',
  snow: 'Schnee',
  heat: 'Hitze',
};

export function getWeather(_state: GameState): Weather {
  return { kind: 'clear', temperature: 16 };
}

/** Faktor auf die Nachfrage auf der Straße (1 = normal). */
export function weatherDemandFactor(_state: GameState): number {
  return 1;
}

export default defineModule({
  id: 'weather',
  version: 1,
});
