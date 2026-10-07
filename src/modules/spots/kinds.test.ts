import { describe, expect, it } from 'vitest';
import { clock, loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStaffMember } from '../staff';
import { getVeedel } from '../veedel';
import {
  customSpots,
  getSpot,
  getSpots,
  isSpotOpen,
  MOVE_COST,
  SPOT_TYPES,
  spotAwareness,
  spotDemandFactor,
  spotKind,
  spotModifiers,
} from './index';
import { AWARENESS_START, MOVE_KEEP_AWARENESS } from './kinds';

/** Eigenen Spot in Kalk gründen (Geld wird vorher aufgestockt). */
function foundIn(sim: Simulation, kind: 'corner' | 'club' | 'park' = 'corner', lng = 7.0035, lat = 50.9385): string {
  wallet.earn(sim.ctx('test'), 10000, 'dirty', 'Test');
  const r = sim.dispatch({ type: 'spots.found', payload: { lng, lat, kind } });
  if (!r.ok) throw new Error(r.reason);
  return (r as { data?: { spotId: string } }).data?.spotId ?? '';
}

describe('Spot-Arten, Bekanntheit, Ausbau (Auftrag 23)', () => {
  it('Arten kosten verschieden viel, vorgegebene Spots tragen ihre Art', () => {
    const sim = createTestGame();
    const money = sim.state.wallet.dirty + 10000;
    const id = foundIn(sim, 'club');
    expect(sim.state.wallet.dirty).toBe(money - SPOT_TYPES.club.foundCost);
    const spot = getSpot(sim.state, id);
    expect(spotKind(spot)).toBe('club');
    expect(spot?.name).toBe('Club Kalk');
    expect(spotKind(getSpot(sim.state, 'zuelpicher'))).toBe('club');
    expect(spotKind(getSpot(sim.state, 'uni'))).toBe('campus');
    expect(spotKind(getSpot(sim.state, 'ebertplatz'))).toBe('corner');
    // Kneipen gründet man nicht selbst.
    const r = sim.dispatch({ type: 'spots.found', payload: { lng: 6.99, lat: 50.95, kind: 'kneipe' } });
    expect(r.ok).toBe(false);
  });

  it('ein eigener Club hat nur abends offen, ein vorgegebener Club wie bisher immer', () => {
    const sim = createTestGame();
    const club = getSpot(sim.state, foundIn(sim, 'club'));
    if (!club) throw new Error('kein Club');
    expect(isSpotOpen(club, clock.at(2, 12))).toBe(false);
    expect(isSpotOpen(club, clock.at(2, 23))).toBe(true);
    const zuelpicher = getSpot(sim.state, 'zuelpicher');
    if (!zuelpicher) throw new Error('kein Zülpicher');
    expect(isSpotOpen(zuelpicher, clock.at(2, 12))).toBe(true);
  });

  it('Bekanntheit: startet niedrig, wächst mit Verkäufen und Tagen mit Leuten, sinkt ohne', () => {
    const sim = createTestGame();
    const id = foundIn(sim);
    expect(spotAwareness(sim.state, id)).toBe(AWARENESS_START);
    expect(spotAwareness(sim.state, 'ebertplatz')).toBe(1);
    const spot = getSpot(sim.state, id);
    if (!spot) throw new Error(id);
    expect(spotDemandFactor(sim.state, spot, sim.state.time)).toBeLessThan(0.6);
    sim.ctx('test').emit('sale.completed', {
      channel: 'street',
      spotId: id,
      veedelId: spot.veedelId,
      productId: 'weed',
      amount: 40,
      quality: 0.6,
      revenue: 400,
      sellerId: null,
      customerId: null,
    });
    sim.advance(1);
    const grown = spotAwareness(sim.state, id);
    expect(grown).toBeGreaterThan(AWARENESS_START);
    // Ohne Leute am Spot: jeden Tag etwas weniger.
    sim.advance(3 * 24 * 60);
    expect(spotAwareness(sim.state, id)).toBeLessThan(grown);
    // Mit Läufer: wächst.
    const hired = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: id } });
    expect(hired.ok).toBe(true);
    const before = spotAwareness(sim.state, id);
    sim.advance(2 * 24 * 60);
    expect(spotAwareness(sim.state, id)).toBeGreaterThan(before);
  });

  it('verlegen kostet und behält einen Teil der Bekanntheit, umbenennen ist kostenlos', () => {
    const sim = createTestGame();
    const id = foundIn(sim);
    sim.state.modules.spots.awareness[id] = 0.8;
    const money = sim.state.wallet.dirty;
    const target = getVeedel('muelheim')?.center ?? { lng: 0, lat: 0 };
    const moved = sim.dispatch({ type: 'spots.move', payload: { spotId: id, lng: target.lng, lat: target.lat } });
    expect(moved.ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money - MOVE_COST);
    expect(spotAwareness(sim.state, id)).toBeCloseTo(0.8 * MOVE_KEEP_AWARENESS);
    expect(getSpot(sim.state, id)?.veedelId).toBe('muelheim');
    expect(getSpots(sim.state, 'koeln').find((s) => s.id === id)?.veedelId).toBe('muelheim');
    expect(sim.dispatch({ type: 'spots.rename', payload: { spotId: id, name: 'Bei Kalle' } }).ok).toBe(true);
    expect(getSpot(sim.state, id)?.name).toBe('Bei Kalle');
    expect(sim.state.wallet.dirty).toBe(money - MOVE_COST);
    // Vorgegebene Spots lassen sich nicht verlegen.
    expect(sim.dispatch({ type: 'spots.rename', payload: { spotId: 'ebertplatz', name: 'X-Platz' } }).ok).toBe(false);
  });

  it('aufgeben: Leute werden frei, Stammkunden wechseln oder gehen', () => {
    const sim = createTestGame();
    const id = foundIn(sim);
    const hired = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: id } });
    const staffId = (hired as { data?: { staffId: string } }).data?.staffId ?? '';
    sim.state.modules.customers.regulars.push({
      id: 'r-test',
      name: 'Test',
      typeId: 'stoner',
      spotId: id,
      productId: 'weed',
      amount: 5,
      visits: 3,
      lastPrice: 10,
      lastQuality: 0.6,
      satisfaction: 0.8,
      status: 'active',
    } as (typeof sim.state.modules.customers.regulars)[number]);
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'spots.close', payload: { spotId: id } }).ok).toBe(true);
    expect(customSpots(sim.state)).toHaveLength(0);
    expect(getStaffMember(sim.state, staffId)?.assignment).toBeNull();
    expect(eventsOfType(events, 'spots.closed')).toHaveLength(1);
    const regular = sim.state.modules.customers.regulars.find((r) => r.id === 'r-test');
    expect(regular?.spotId === id && regular.status === 'active').toBe(false);
  });

  it('Spielstände der Version 3: eigene Spots werden Straßenecken und sind voll bekannt', () => {
    const sim = createTestGame();
    const id = foundIn(sim);
    const state = JSON.parse(JSON.stringify(sim.state));
    delete state.modules.spots.awareness;
    delete state.modules.spots.upgrades;
    delete state.modules.spots.custom[0].kind;
    state.moduleVersions.spots = 3;
    const loaded = loadSimulation(state, sim.modules);
    expect(loaded.state.moduleVersions.spots).toBe(5);
    expect(spotKind(getSpot(loaded.state, id))).toBe('corner');
    expect(spotAwareness(loaded.state, id)).toBe(1);
    expect('upgrades' in loaded.state.modules.spots).toBe(false);
  });

  it('Spielstände der Version 4 (Auftrag 46d): Der Ausbau fällt weg, spotModifiers bleiben neutral', () => {
    const sim = createTestGame();
    const state = JSON.parse(JSON.stringify(sim.state));
    state.modules.spots.upgrades = { ebertplatz: ['lookout', 'stash', 'regular'] };
    state.moduleVersions.spots = 4;
    const loaded = loadSimulation(state, sim.modules);
    expect(loaded.state.moduleVersions.spots).toBe(5);
    expect('upgrades' in loaded.state.modules.spots).toBe(false);
    expect(spotModifiers(loaded.state, 'ebertplatz')).toEqual({
      heatFactor: 1,
      checkAvoid: 0,
      lossFactor: 1,
      regularFactor: 1,
    });
  });
});
