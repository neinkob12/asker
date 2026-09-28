import { describe, expect, it } from 'vitest';
import { loadSimulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getVeedel, veedelAt } from '../veedel';
import { FOUND_SPOT_COST, MAX_CUSTOM_SPOTS } from './config';
import {
  canFoundSpotAt,
  customSpots,
  getAllSpots,
  getSpot,
  getSpots,
  isSpotActive,
  lockedSpots,
  spotsInVeedel,
} from './index';

describe('spots', () => {
  it('jeder Spot liegt in einem bekannten Veedel', () => {
    const sim = createTestGame();
    const spots = getAllSpots(sim.state);
    expect(spots.length).toBeGreaterThanOrEqual(10);
    for (const spot of spots) expect(getVeedel(spot.veedelId), spot.id).toBeDefined();
  });

  it('die Veedel-Zuordnung passt zu veedelAt()', () => {
    const sim = createTestGame();
    for (const spot of getAllSpots(sim.state)) expect(veedelAt(spot.lng, spot.lat)?.id, spot.id).toBe(spot.veedelId);
  });

  it('zu Beginn sind ein paar Spots offen, die anderen muss man freischalten', () => {
    const sim = createTestGame();
    const open = getSpots(sim.state).map((s) => s.id);
    expect(open).toEqual(['ebertplatz', 'neumarkt', 'zuelpicher', 'uni']);
    expect(lockedSpots(sim.state).length).toBe(getAllSpots(sim.state).length - open.length);
    expect(getSpot(sim.state, 'rheinpark')?.name).toBe('Rheinpark');
    expect(isSpotActive(sim.state, 'rheinpark')).toBe(false);
  });

  it('freischalten kostet Geld, danach wird dort verkauft', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const cost = getSpot(sim.state, 'rheinpark')?.unlockCost ?? 0;
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'rheinpark' } }).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(START_DIRTY_MONEY - cost);
    expect(isSpotActive(sim.state, 'rheinpark')).toBe(true);
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'rheinpark' } }).ok).toBe(false);
    expect(eventsOfType(events, 'spots.unlocked')[0].payload).toEqual({ spotId: 'rheinpark', veedelId: 'deutz' });
    sim.advance(12 * 60);
    expect(sim.state.modules.customers.nextSpawnAt.rheinpark).toBeGreaterThan(0);
    sim.state.wallet.dirty = 0;
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'friesenplatz' } })).toEqual({
      ok: false,
      reason: 'Nicht genug Geld.',
    });
  });

  it('eigenen Spot per Klick auf die Karte gründen, Veedel über veedelAt', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const result = sim.dispatch({ type: 'spots.found', payload: { lng: 7.0035, lat: 50.9385 } });
    expect(result.ok).toBe(true);
    const [spot] = customSpots(sim.state);
    expect(spot).toMatchObject({ veedelId: 'kalk', name: 'Ecke Kalk', custom: true });
    expect(sim.state.wallet.dirty).toBe(START_DIRTY_MONEY - FOUND_SPOT_COST);
    expect(getSpots(sim.state).map((s) => s.id)).toContain(spot.id);
    expect(spotsInVeedel(sim.state, 'kalk')).toHaveLength(1);
    expect(eventsOfType(events, 'spots.founded')[0].payload).toEqual({ spotId: spot.id, veedelId: 'kalk' });
    // Kunden kommen auch an eigene Spots.
    sim.advance(24 * 60);
    expect(sim.state.modules.customers.nextSpawnAt[spot.id]).toBeDefined();
  });

  it('nicht außerhalb von Köln, nicht zu nah an anderen Spots, nicht unbegrenzt', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 1e6;
    expect(canFoundSpotAt(sim.state, 4.4, 51.9).ok).toBe(false);
    expect(sim.dispatch({ type: 'spots.found', payload: { lng: 6.9576, lat: 50.9498 } })).toEqual({
      ok: false,
      reason: 'Zu nah am Ebertplatz.',
    });
    const places = [
      [7.0035, 50.9385],
      [7.0085, 50.9635],
      [6.9535, 50.9655],
      [6.918, 50.9175],
      [6.9655, 50.9115],
      [6.9165, 50.9485],
      [6.9765, 50.9385],
    ];
    const results = places.map(([lng, lat]) => sim.dispatch({ type: 'spots.found', payload: { lng, lat } }).ok);
    expect(results.filter(Boolean)).toHaveLength(MAX_CUSTOM_SPOTS);
    expect(customSpots(sim.state)).toHaveLength(MAX_CUSTOM_SPOTS);
  });

  it('alte Spielstände (ohne Zustand) behalten alle Spots offen', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.spots;
    raw.moduleVersions.spots = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(getSpots(loaded.state)).toHaveLength(getAllSpots(loaded.state).length);
  });
});
