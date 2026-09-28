import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getWeather, WEATHER_NAMES, weatherDemandFactor } from './index';

describe('weather', () => {
  it('Stub: immer klar, neutrale Nachfrage', () => {
    const sim = createTestGame();
    sim.advance(24 * 60);
    expect(getWeather(sim.state).kind).toBe('clear');
    expect(WEATHER_NAMES[getWeather(sim.state).kind]).toBe('Klar');
    expect(weatherDemandFactor(sim.state)).toBe(1);
  });
});
