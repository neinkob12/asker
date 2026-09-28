// Einstellbare Werte des Wetters. Balancing passiert hier, nicht im Code.

import type { WeatherKind } from './index';

/** Alle so viele Spielminuten kann das Wetter umschlagen (ein Zeitfenster). */
export const WEATHER_SLOT_MINUTES = 180;

/** So viele Zeitfenster im Voraus steht die Vorhersage fest (4 × 3 Std. = 12 Std.). */
export const FORECAST_SLOTS = 4;

/**
 * Tagesmitteltemperatur in °C. Sie wandert jeden Tag ein Stück (Zufall, zum Mittelwert gezogen),
 * dadurch gibt es mehrtägige kalte und heiße Phasen, aber keine Jahreszeiten.
 */
export const TEMPERATURE = {
  start: 14,
  mean: 13,
  min: -5,
  max: 28,
  /** Größte Änderung des Tagesmittels von einem Tag auf den nächsten. */
  dailyStep: 5.5,
  /** Wie stark das Tagesmittel pro Tag zum Mittelwert zurückgezogen wird (0–1). */
  pull: 0.12,
};

/** Unter diesem Tagesmittel fällt Niederschlag als Schnee. */
export const SNOW_BELOW = 2.5;

/** Ab diesem Tagesmittel kann es Hitze geben. */
export const HEAT_FROM = 23;

/** Unterschied zwischen Nachmittag (wärmste Zeit, 15 Uhr) und Tagesmittel, je Wetter. */
export const DAY_AMPLITUDE: Record<WeatherKind, number> = {
  clear: 6,
  cloudy: 3,
  rain: 2,
  storm: 3,
  snow: 2,
  heat: 6,
};

/** Verschiebung der Temperatur je Wetter. */
export const TEMPERATURE_OFFSET: Record<WeatherKind, number> = {
  clear: 0.5,
  cloudy: -0.5,
  rain: -1.5,
  storm: -2,
  snow: -1,
  heat: 2,
};

/**
 * Relative Gewichte für das nächste Zeitfenster: von (Zeile) → nach (Spalte).
 * Schnee und Hitze werden zusätzlich durch die Temperatur freigeschaltet bzw. gesperrt.
 */
export const TRANSITIONS: Record<WeatherKind, Record<WeatherKind, number>> = {
  clear: { clear: 6, cloudy: 3, rain: 0.4, storm: 0.2, snow: 0.4, heat: 3 },
  cloudy: { clear: 3, cloudy: 4, rain: 1.8, storm: 0.4, snow: 2, heat: 0.6 },
  rain: { clear: 1, cloudy: 3.5, rain: 3.2, storm: 0.6, snow: 1.5, heat: 0 },
  storm: { clear: 0.6, cloudy: 2, rain: 3, storm: 0.8, snow: 0, heat: 0 },
  snow: { clear: 1, cloudy: 3, rain: 0.5, storm: 0, snow: 4, heat: 0 },
  heat: { clear: 3, cloudy: 1, rain: 0.2, storm: 1.4, snow: 0, heat: 5 },
};

/** Stärke (0–1) je Wetter: von … bis. Bei Regen und Schnee die Niederschlagsmenge, bei Bewölkung die Dichte. */
export const INTENSITY: Record<WeatherKind, [number, number]> = {
  clear: [0, 0.2],
  cloudy: [0.5, 1],
  rain: [0.35, 1],
  storm: [0.8, 1],
  snow: [0.3, 1],
  heat: [0.6, 1],
};

/** Nachfrage auf der Straße je Wetter (1 = normal). */
export const STREET_DEMAND: Record<WeatherKind, number> = {
  clear: 1.05,
  cloudy: 1,
  rain: 0.8,
  storm: 0.6,
  snow: 0.75,
  heat: 1.1,
};

/** Nachfrage beim Lieferdienst je Wetter: Bei schlechtem Wetter bestellen die Leute lieber. */
export const DELIVERY_DEMAND: Record<WeatherKind, number> = {
  clear: 0.95,
  cloudy: 1,
  rain: 1.15,
  storm: 1.25,
  snow: 1.2,
  heat: 0.95,
};

/** Unter dieser Temperatur sinkt die Straßen-Nachfrage zusätzlich. */
export const FREEZING_BELOW = 0;
export const FREEZING_FACTOR = 0.9;
