import { describe, expect, it } from 'vitest';
import { clock, createSaveFile, loadSimulation, parseSaveFile, Simulation, serializeSave } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { FORECAST_SLOTS, HEAT_FROM, SNOW_BELOW, WEATHER_SLOT_MINUTES } from './config';
import weather, {
  getForecast,
  getWeather,
  slotStart,
  WEATHER_KINDS,
  WEATHER_NAMES,
  type WeatherKind,
  weatherDemandFactor,
} from './index';

/** Nur das Wetter-Modul: schnell genug für lange Verläufe. */
const weatherOnly = (seed = 1) => Simulation.create([weather], { seed });

/** Wetter zu Beginn jedes Zeitfensters über viele Tage. */
function record(seed: number, days: number) {
  const sim = weatherOnly(seed);
  const slots: { kind: WeatherKind; temperature: number; dayMean: number }[] = [];
  for (let i = 0; i < (days * 24 * 60) / WEATHER_SLOT_MINUTES; i++) {
    sim.advance(WEATHER_SLOT_MINUTES);
    const s = sim.state.modules.weather;
    slots.push({ kind: s.kind, temperature: s.temperature, dayMean: s.dayMean });
  }
  return slots;
}

describe('weather', () => {
  it('startet klar mit einer Vorhersage für die nächsten 12 Stunden', () => {
    const sim = createTestGame();
    const w = getWeather(sim.state);
    expect(w.kind).toBe('clear');
    expect(WEATHER_NAMES[w.kind]).toBe('Klar');
    expect(w.temperature).toBeGreaterThan(5);
    const forecast = getForecast(sim.state);
    expect(forecast).toHaveLength(FORECAST_SLOTS);
    expect(forecast.map((f) => f.at)).toEqual(
      [1, 2, 3, 4].map((n) => slotStart(sim.state.time) + n * WEATHER_SLOT_MINUTES),
    );
  });

  it('ist deterministisch: gleicher Seed, gleiches Wetter', () => {
    expect(record(5, 20)).toEqual(record(5, 20));
    expect(record(5, 20)).not.toEqual(record(6, 20));
  });

  it('die Vorhersage tritt ein', () => {
    const sim = weatherOnly(3);
    for (let i = 0; i < 40; i++) {
      const next = sim.state.modules.weather.forecast[0];
      sim.advance(next.at - sim.state.time);
      expect(getWeather(sim.state).kind).toBe(next.kind);
      expect(sim.state.modules.weather.forecast).toHaveLength(FORECAST_SLOTS);
    }
  });

  it('wechselt glaubwürdig über die Tage', () => {
    const slots = record(1, 365);
    const share = (kind: WeatherKind) => slots.filter((s) => s.kind === kind).length / slots.length;
    // Alle Wetterlagen kommen vor, keine dominiert.
    for (const kind of WEATHER_KINDS) expect(share(kind), kind).toBeGreaterThan(0.01);
    for (const kind of WEATHER_KINDS) expect(share(kind), kind).toBeLessThan(0.5);
    expect(share('clear') + share('cloudy')).toBeGreaterThan(0.55);
    // Wetter hält im Schnitt länger als ein Zeitfenster.
    const changes = slots.filter((s, i) => i > 0 && s.kind !== slots[i - 1].kind).length;
    expect(slots.length / changes).toBeGreaterThan(1.5);
    // Schnee nur in kalten, Hitze nur in heißen Phasen.
    for (const s of slots) {
      if (s.kind === 'snow') expect(s.dayMean).toBeLessThan(SNOW_BELOW);
      if (s.kind === 'heat') expect(s.dayMean).toBeGreaterThanOrEqual(HEAT_FROM);
    }
    // Temperaturen bleiben im Kölner Rahmen.
    const temps = slots.map((s) => s.temperature);
    expect(Math.min(...temps)).toBeGreaterThan(-15);
    expect(Math.max(...temps)).toBeLessThan(40);
  });

  it('die Temperatur hat einen Tagesgang und springt nicht', () => {
    const sim = weatherOnly(2);
    let previous = getWeather(sim.state).temperature;
    const byHour = new Map<number, number[]>();
    for (let h = 0; h < 30 * 24; h++) {
      sim.advance(60);
      const t = getWeather(sim.state).temperature;
      expect(Math.abs(t - previous)).toBeLessThan(6);
      previous = t;
      const hour = clock.hour(sim.state.time);
      byHour.set(hour, [...(byHour.get(hour) ?? []), t]);
    }
    const avg = (h: number) => (byHour.get(h) ?? []).reduce((a, b) => a + b, 0) / (byHour.get(h)?.length ?? 1);
    expect(avg(15)).toBeGreaterThan(avg(4) + 3);
  });

  it('meldet Wetterwechsel als Ereignis und auffälliges Wetter im Journal', () => {
    const sim = weatherOnly(1);
    const events = recordEvents(sim);
    sim.advance(60 * 24 * 60);
    const changes = eventsOfType(events, 'weather.changed');
    expect(changes.length).toBeGreaterThan(20);
    for (const e of changes) expect(e.payload.from).not.toBe(e.payload.to);
    const storms = changes.filter((e) => e.payload.to === 'storm').length;
    expect(storms).toBeGreaterThan(0);
    expect(sim.state.journal.some((j) => j.source === 'weather')).toBe(true);
  });

  it('Nachfrage: Regen hält die Leute von der Straße, Lieferdienst profitiert', () => {
    const sim = weatherOnly(1);
    const s = sim.state.modules.weather;
    const factorFor = (kind: WeatherKind, channel?: 'street' | 'delivery' | 'wholesale') => {
      s.kind = kind;
      s.intensity = 0.5;
      s.temperature = 12;
      return weatherDemandFactor(sim.state, channel);
    };
    expect(factorFor('clear')).toBeGreaterThanOrEqual(1);
    expect(factorFor('rain')).toBeLessThan(factorFor('cloudy'));
    expect(factorFor('storm')).toBeLessThan(factorFor('rain'));
    expect(factorFor('heat')).toBeGreaterThan(1);
    expect(factorFor('rain', 'delivery')).toBeGreaterThan(1);
    expect(factorFor('storm', 'wholesale')).toBe(1);
    s.kind = 'clear';
    s.temperature = -3;
    expect(weatherDemandFactor(sim.state)).toBeLessThan(factorFor('clear'));
  });

  it('ohne Wetter-Modul im Spiel: neutrale Werte', () => {
    const sim = Simulation.create([], { seed: 1 });
    expect(getWeather(sim.state).kind).toBe('clear');
    expect(weatherDemandFactor(sim.state)).toBe(1.05);
    expect(getForecast(sim.state)).toEqual([]);
  });

  it('migriert Spielstände aus dem Fundament (Wetter ohne Zustand)', () => {
    const stub = { id: 'weather', version: 1 };
    const old = Simulation.create([stub], { seed: 4 });
    old.advance(100);
    expect(old.state.modules.weather).toBeUndefined();
    const raw = parseSaveFile(serializeSave(createSaveFile(old.state, 'alt', 0))).state;
    const loaded = loadSimulation(raw, [weather]);
    expect(loaded.state.moduleVersions.weather).toBe(2);
    expect(getWeather(loaded.state).kind).toBe('clear');
    loaded.advance(60);
    expect(loaded.state.modules.weather.forecast).toHaveLength(FORECAST_SLOTS);
    loaded.advance(24 * 60);
    expect(loaded.state.modules.weather.forecast[0].at).toBeGreaterThan(loaded.state.time);
  });
});
