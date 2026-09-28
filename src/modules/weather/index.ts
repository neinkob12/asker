// Wetter: klar, bewölkt, Regen, Gewitter, Schnee, Hitze. Wechselt glaubwürdig über die Tage und ist
// deterministisch (Spiel-Zufall). Alle 3 Spielstunden kann es umschlagen; die nächsten 12 Stunden stehen als
// Vorhersage fest. Die Temperatur folgt einem Tagesgang um ein Tagesmittel, das von Tag zu Tag wandert.
// Schnee gibt es nur in kalten, Hitze nur in heißen Phasen. Jahreszeiten gibt es nicht (siehe Konzept).
//
// Öffentliche API:
//   getWeather(state)                         → { kind, temperature, intensity, since }
//   getForecast(state)                        → kommende Zeitfenster { at, kind, intensity, temperature }
//   weatherDemandFactor(state, channel?)      → Faktor auf die Nachfrage (1 = normal), channel wie in sale.completed
//   WEATHER_NAMES, isPrecipitation(kind)
// Ereignis: 'weather.changed' { from, to, temperature, intensity }

import { type Ctx, clock, defineModule, type GameState, journal, MINUTES_PER_DAY } from '../../core';
import {
  DAY_AMPLITUDE,
  DELIVERY_DEMAND,
  FORECAST_SLOTS,
  FREEZING_BELOW,
  FREEZING_FACTOR,
  HEAT_FROM,
  INTENSITY,
  SNOW_BELOW,
  STREET_DEMAND,
  TEMPERATURE,
  TEMPERATURE_OFFSET,
  TRANSITIONS,
  WEATHER_SLOT_MINUTES,
} from './config';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'heat';

export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'heat'];

export interface Weather {
  kind: WeatherKind;
  /** Temperatur in °C. */
  temperature: number;
  /** Stärke 0–1: Niederschlagsmenge bei Regen/Schnee, Dichte der Wolken, Stärke der Hitze. */
  intensity: number;
  /** Seit wann (Spielminute) dieses Wetter herrscht. */
  since: number;
}

export interface ForecastSlot {
  /** Beginn des Zeitfensters (Spielminute). */
  at: number;
  kind: WeatherKind;
  intensity: number;
}

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  since: number;
  /** Aktuelle Temperatur, eine Nachkommastelle. */
  temperature: number;
  /** Tagesmittel heute und morgen (morgen steht schon fest, damit die Vorhersage stimmt). */
  dayMean: number;
  nextDayMean: number;
  /** Kommende Zeitfenster, das nächste zuerst. */
  forecast: ForecastSlot[];
}

/** Absatzweg wie in 'sale.completed'. */
export type DemandChannel = 'street' | 'delivery' | 'wholesale';

declare module '../../core' {
  interface ModuleStates {
    weather: WeatherState;
  }
  interface GameEvents {
    /** Das Wetter ist umgeschlagen. */
    'weather.changed': { from: WeatherKind; to: WeatherKind; temperature: number; intensity: number };
  }
}

export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: 'Klar',
  cloudy: 'Bewölkt',
  rain: 'Regen',
  storm: 'Gewitter',
  snow: 'Schnee',
  heat: 'Hitze',
};

/** Journal-Einträge beim Umschlagen auf auffälliges Wetter. */
const JOURNAL_TEXT: Partial<Record<WeatherKind, string>> = {
  storm: 'Gewitter über Köln. Wer kann, bleibt drinnen.',
  snow: 'Es schneit in Köln. Auf der Straße wird es ruhig.',
  heat: 'Hitze in der Stadt. Parks und Rheinufer sind voll.',
};

const FALLBACK: Weather = { kind: 'clear', temperature: 16, intensity: 0, since: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function isPrecipitation(kind: WeatherKind): boolean {
  return kind === 'rain' || kind === 'storm' || kind === 'snow';
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function getWeather(state: GameState): Weather {
  const s = state.modules.weather;
  if (!s) return { ...FALLBACK };
  return { kind: s.kind, temperature: s.temperature, intensity: s.intensity, since: s.since };
}

/** Vorhersage der nächsten Zeitfenster mit geschätzter Temperatur. */
export function getForecast(state: GameState): (ForecastSlot & { temperature: number })[] {
  const s = state.modules.weather;
  if (!s) return [];
  return s.forecast.map((slot) => ({
    ...slot,
    temperature: Math.round(targetTemperature(meanAt(s, state.time, slot.at), slot.kind, slot.at)),
  }));
}

/** Faktor auf die Nachfrage (1 = normal). Standard: Straßenverkauf. */
export function weatherDemandFactor(state: GameState, channel: DemandChannel = 'street'): number {
  const w = getWeather(state);
  if (channel === 'wholesale') return 1;
  if (channel === 'delivery') return DELIVERY_DEMAND[w.kind];
  let factor = STREET_DEMAND[w.kind];
  // Starker Regen oder dichter Schnee halten noch mehr Leute drinnen.
  if (w.kind === 'rain' || w.kind === 'snow') factor -= (w.intensity - 0.5) * 0.1;
  if (w.temperature < FREEZING_BELOW) factor *= FREEZING_FACTOR;
  return round2(factor);
}

// ---------------------------------------------------------------------------------------------
// Modell

/** Beginn des Zeitfensters, in dem time liegt. */
export function slotStart(time: number): number {
  return Math.floor(time / WEATHER_SLOT_MINUTES) * WEATHER_SLOT_MINUTES;
}

function meanAt(s: WeatherState, now: number, time: number): number {
  return clock.day(time) === clock.day(now) ? s.dayMean : s.nextDayMean;
}

/** Temperatur, auf die das Wetter zu einem Zeitpunkt zustrebt: Tagesgang mit Maximum um 15 Uhr. */
export function targetTemperature(dayMean: number, kind: WeatherKind, time: number): number {
  const hours = clock.minuteOfDay(time) / 60;
  const curve = Math.cos((2 * Math.PI * (hours - 15)) / 24);
  return dayMean + TEMPERATURE_OFFSET[kind] + DAY_AMPLITUDE[kind] * curve;
}

/** Gewichte für das nächste Zeitfenster, abhängig vom jetzigen Wetter und vom Tagesmittel. */
export function transitionWeights(from: WeatherKind, dayMean: number): Record<WeatherKind, number> {
  const w = { ...TRANSITIONS[from] };
  if (dayMean < SNOW_BELOW) {
    // Kalt: Niederschlag fällt als Schnee, keine Gewitter, keine Hitze.
    w.snow = w.snow * 1.5 + w.rain * 0.8 + w.storm;
    w.rain *= 0.2;
    w.storm = 0;
  } else {
    w.snow = 0;
  }
  if (dayMean < HEAT_FROM) {
    w.heat = 0;
  } else {
    // Heiße Phase: Aus klarem Wetter wird meist Hitze.
    w.heat = w.heat * 2 + w.clear * 0.5;
    w.clear *= 0.5;
  }
  if (dayMean >= 16) w.storm *= 1.5;
  else if (dayMean < 8) w.storm *= 0.3;
  return w;
}

function pickWeighted(ctx: Ctx, weights: Record<WeatherKind, number>): WeatherKind {
  const total = WEATHER_KINDS.reduce((sum, k) => sum + weights[k], 0);
  let r = ctx.random() * total;
  for (const kind of WEATHER_KINDS) {
    r -= weights[kind];
    if (r < 0 && weights[kind] > 0) return kind;
  }
  return 'cloudy';
}

function rollIntensity(ctx: Ctx, kind: WeatherKind, previous?: { kind: WeatherKind; intensity: number }): number {
  const [min, max] = INTENSITY[kind];
  // Gleiches Wetter ändert seine Stärke nur langsam.
  if (previous?.kind === kind) return round2(clamp(previous.intensity + (ctx.random() - 0.5) * 0.4, min, max));
  return round2(min + ctx.random() * (max - min));
}

function rollDayMean(ctx: Ctx, previous: number): number {
  const { mean, pull, dailyStep, min, max } = TEMPERATURE;
  const next = previous + (mean - previous) * pull + (ctx.random() * 2 - 1) * dailyStep;
  return round1(clamp(next, min, max));
}

/** Vorhersage bis FORECAST_SLOTS Zeitfenster auffüllen. */
function fillForecast(ctx: Ctx, s: WeatherState): void {
  let last: { at: number; kind: WeatherKind; intensity: number } = s.forecast[s.forecast.length - 1] ?? {
    at: slotStart(ctx.now),
    kind: s.kind,
    intensity: s.intensity,
  };
  while (s.forecast.length < FORECAST_SLOTS) {
    const at = last.at + WEATHER_SLOT_MINUTES;
    const kind = pickWeighted(ctx, transitionWeights(last.kind, meanAt(s, ctx.now, at)));
    const slot: ForecastSlot = { at, kind, intensity: rollIntensity(ctx, kind, last) };
    s.forecast.push(slot);
    last = slot;
  }
}

function initialState(ctx: Ctx): WeatherState {
  const s: WeatherState = {
    kind: 'clear',
    intensity: 0.1,
    since: ctx.now,
    temperature: 0,
    dayMean: TEMPERATURE.start,
    nextDayMean: rollDayMean(ctx, TEMPERATURE.start),
    forecast: [],
  };
  s.temperature = round1(targetTemperature(s.dayMean, s.kind, ctx.now));
  fillForecast(ctx, s);
  return s;
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.weather;
  const now = ctx.now;
  if (now % MINUTES_PER_DAY === 0) {
    s.dayMean = s.nextDayMean;
    s.nextDayMean = rollDayMean(ctx, s.dayMean);
  }
  // Fällige Zeitfenster übernehmen (nach dem Laden eines alten Stands können es mehrere sein).
  while (s.forecast.length > 0 && s.forecast[0].at <= now) {
    const slot = s.forecast.shift() as ForecastSlot;
    const from = s.kind;
    s.intensity = slot.intensity;
    if (slot.kind !== from) {
      s.kind = slot.kind;
      s.since = slot.at;
      ctx.emit('weather.changed', { from, to: slot.kind, temperature: s.temperature, intensity: s.intensity });
      const text = JOURNAL_TEXT[slot.kind];
      if (text) journal.add(ctx, text, 'info');
    }
  }
  fillForecast(ctx, s);
  // Die Temperatur folgt dem Ziel mit etwas Verzögerung, damit sie beim Umschlagen nicht springt.
  const target = targetTemperature(s.dayMean, s.kind, now);
  s.temperature = round1(s.temperature + (target - s.temperature) * 0.5);
}

export default defineModule({
  id: 'weather',
  version: 2,
  init: initialState,
  tick,
  tickEvery: 60,
  migrations: {
    // Version 1 (Fundament) hatte keinen Zustand. Ohne Zufall (Migrationen haben keinen ctx): klares Wetter,
    // die Vorhersage füllt der nächste Tick mit dem Spiel-Zufall auf.
    2: (_old: undefined, state: GameState): WeatherState => ({
      kind: 'clear',
      intensity: 0.1,
      since: state.time,
      temperature: round1(targetTemperature(TEMPERATURE.start, 'clear', state.time)),
      dayMean: TEMPERATURE.start,
      nextDayMean: TEMPERATURE.start,
      forecast: [],
    }),
  },
});
