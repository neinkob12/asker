import { describe, expect, it } from 'vitest';
import { distanceMeters, loadSimulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { nearestRoadPoint } from '../roads';
import { allVeedel, getVeedel, veedelAt } from '../veedel';
import { FOUND_SPOT_COST, MAX_CUSTOM_SPOTS, ORIGINAL_SPOT_IDS, PRESET_SPOTS, SPOT_LABELS } from './config';
import {
  canFoundSpotAt,
  customSpots,
  getAllSpots,
  getSpot,
  getSpots,
  isSpotActive,
  lockedSpots,
  spotLabelPlacement,
  spotsInVeedel,
} from './index';

describe('spots', () => {
  it('jeder Spot liegt in einem bekannten Veedel', () => {
    const sim = createTestGame();
    const spots = getAllSpots(sim.state);
    expect(spots.length).toBeGreaterThanOrEqual(10);
    for (const spot of spots) expect(getVeedel(spot.veedelId), spot.id).toBeDefined();
  });

  it('das Veedel eines Spots kommt aus den echten Grenzen (veedelAt)', () => {
    const sim = createTestGame();
    for (const spot of getAllSpots(sim.state)) expect(veedelAt(spot.lng, spot.lat)?.id, spot.id).toBe(spot.veedelId);
    const veedelOf = (id: string) => getAllSpots(sim.state).find((s) => s.id === id)?.veedelId;
    expect(veedelOf('zuelpicher')).toBe('neustadt-sued');
    expect(veedelOf('ebertplatz')).toBe('neustadt-nord');
    expect(veedelOf('uni')).toBe('lindenthal');
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
    expect(eventsOfType(events, 'spots.founded')[0].payload).toEqual({
      spotId: spot.id,
      veedelId: 'kalk',
      kind: 'corner',
    });
    // Kunden kommen auch an eigene Spots.
    sim.advance(24 * 60);
    expect(sim.state.modules.customers.nextSpawnAt[spot.id]).toBeDefined();
  });

  it('Gründen in Hamburg bucht die Kosten auf Hamburg, auch wenn Köln die aktive Stadt ist', () => {
    const sim = createTestGame();
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    const events = recordEvents(sim);
    const center = getVeedel('st-pauli')?.center;
    if (!center) throw new Error('st-pauli');
    const candidates = [0, 0.001, -0.001, 0.002, -0.002].map((d) => ({ lng: center.lng + d, lat: center.lat - d / 2 }));
    const free = candidates.find((p) => canFoundSpotAt(sim.state, p.lng, p.lat).ok);
    if (!free) throw new Error('keine freie Stelle in St. Pauli');
    expect(sim.dispatch({ type: 'spots.found', payload: { lng: free.lng, lat: free.lat } }).ok).toBe(true);
    const paid = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.category === 'expansion');
    expect(paid).toHaveLength(1);
    expect(paid[0].payload.cityId).toBe('hamburg');
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
      [6.9655, 50.9145],
      [6.9105, 50.9525],
      [6.9765, 50.9385],
    ];
    const results = places.map(([lng, lat]) => sim.dispatch({ type: 'spots.found', payload: { lng, lat } }).ok);
    expect(results.filter(Boolean)).toHaveLength(MAX_CUSTOM_SPOTS);
    expect(customSpots(sim.state)).toHaveLength(MAX_CUSTOM_SPOTS);
  });

  it('alte Spielstände (ohne Zustand) behalten ihre zehn Spots offen, die neuen sind gesperrt', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.spots;
    raw.moduleVersions.spots = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(getSpots(loaded.state).map((s) => s.id)).toEqual([...ORIGINAL_SPOT_IDS]);
    expect(getAllSpots(loaded.state).length).toBeGreaterThan(ORIGINAL_SPOT_IDS.length);
    expect(isSpotActive(loaded.state, 'wiener-platz')).toBe(false);
  });

  it('Spielstände der Version 2 bekommen die neuen Spots gesperrt dazu, Unbekanntes fliegt raus', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: { spots: { unlocked: string[]; custom: unknown[] } };
      moduleVersions: Record<string, number>;
    };
    raw.modules.spots.unlocked = ['ebertplatz', 'rheinpark', 'gibt-es-nicht'];
    raw.moduleVersions.spots = 2;
    const loaded = loadSimulation(raw, sim.modules);
    expect(getSpots(loaded.state).map((s) => s.id)).toEqual(['ebertplatz', 'rheinpark']);
    expect(lockedSpots(loaded.state).map((s) => s.id)).toContain('kalk-post');
    expect(loaded.state.moduleVersions.spots).toBe(4);
  });
});

describe('Spots in jedem Veedel (Auftrag 28)', () => {
  it('jedes Veedel hat mindestens zwei vorgegebene Spots, mindestens einen zum Kaufen', () => {
    const sim = createTestGame();
    for (const v of allVeedel()) {
      const here = getAllSpots(sim.state).filter((s) => s.veedelId === v.id && !s.custom);
      expect(here.length, v.id).toBeGreaterThanOrEqual(2);
      expect(
        here.some((s) => (s.unlockCost ?? 0) > 0),
        v.id,
      ).toBe(true);
    }
  });

  it('die Schäl Sick und Bayenthal sind Ziele fürs mittlere Spiel (teurer als die Innenstadt)', () => {
    const sim = createTestGame();
    const cheapest = (veedelId: string) =>
      Math.min(
        ...getAllSpots(sim.state)
          .filter((s) => s.veedelId === veedelId)
          .map((s) => s.unlockCost ?? 0),
      );
    for (const id of ['kalk', 'muelheim', 'bayenthal']) expect(cheapest(id), id).toBeGreaterThanOrEqual(800);
    expect(getSpot(sim.state, 'ottoplatz')?.unlockCost).toBeGreaterThanOrEqual(800);
    expect(cheapest('neustadt-sued')).toBe(0);
  });

  it('jeder Spot liegt nah an einer Straße und nicht zu nah an einem anderen', () => {
    const sim = createTestGame();
    const spots = getAllSpots(sim.state);
    for (const spot of spots) {
      const road = nearestRoadPoint(spot);
      expect(road, spot.id).not.toBeNull();
      expect(road?.meters ?? Infinity, spot.id).toBeLessThan(200);
      for (const other of spots) {
        if (other.id === spot.id) continue;
        expect(distanceMeters(spot, other), `${spot.id} / ${other.id}`).toBeGreaterThanOrEqual(200);
      }
    }
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
  });
});

describe('Plaketten auf der Karte', () => {
  it('hat für jeden vorgegebenen Spot eine Seite, eigene Spots stehen rechts', () => {
    for (const spot of PRESET_SPOTS) expect(SPOT_LABELS[spot.id], spot.id).toBeDefined();
    expect(spotLabelPlacement('custom-1')).toEqual({ labelSide: 'right', labelOffsetY: 0 });
  });
});
