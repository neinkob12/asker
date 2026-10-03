// Ankommen in Hamburg (Auftrag 30, Etappe 5): Fahrt über die A1, Aufenthalt, Leute nachholen, Rechte Hand pro Stadt,
// Hamburg komplett.

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { startEncounter } from '../encounters';
import { getRightHand, hasFullPower, RIGHT_HAND_RANK_XP } from '../hierarchy';
import { runSummary } from '../leaderboard';
import { isPlayerOnTheRoad } from '../logistics';
import { enlist, generateProfile, getStaffMember, type StaffMember } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { HARBOR_CALLER, WELCOME_TEXTS } from './config';
import { activeCity, cityTravel, isPlayerIn, presentCity, travelMinutesBetween } from './index';

const DAY = MINUTES_PER_DAY;

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

function hire(sim: Simulation, level: number, loyalty: number): StaffMember {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
  m.stats.loyalty = loyalty;
  m.stats.caution = 90;
  return m;
}

function takeCity(sim: Simulation, cityId: string): void {
  const t = sim.ctx('test');
  for (const v of allVeedel(cityId)) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(t, v.id, f, -100);
    addInfluence(t, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/** Köln komplett, Rechte Hand bereit, Vollmacht erteilt: Hamburg ist frei. */
function handOverKoeln(sim: Simulation): StaffMember {
  sim.state.wallet.dirty = 80000;
  sim.state.wallet.clean = 40000;
  const a = hire(sim, 2, 80);
  const b = hire(sim, 2, 80);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = hire(sim, 5, 95);
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
  const rh = getRightHand(sim.state);
  if (!rh) throw new Error('keine Rechte Hand');
  rh.xp = RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1];
  sim.dispatch({
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: true },
    },
  });
  takeCity(sim, 'koeln');
  expect(sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }).ok).toBe(true);
  return boss;
}

/** Nach der Übergabe nach Hamburg fahren und ankommen. */
function arriveInHamburg(sim: Simulation): void {
  expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(true);
  const travel = cityTravel(sim.state);
  if (!travel) throw new Error('keine Fahrt');
  sim.advance(travel.arrivesAt - sim.state.time + 5);
}

describe('Ankommen in Hamburg (Auftrag 30)', () => {
  it('Fahrt über die A1: 4 bis 5 Stunden, unterwegs bist du nirgends; Ankunft macht Hamburg aktiv, Fiete schreibt', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    const minutes = travelMinutesBetween('koeln', 'hamburg');
    expect(minutes).toBeGreaterThanOrEqual(4 * 60);
    expect(minutes).toBeLessThanOrEqual(5 * 60 + 15);
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'koeln' } }).ok).toBe(false);
    sim.dispatch({ type: 'customers.standAt', payload: { spotId: 'uni' } });
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }, { actor: 'staff:x' }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    // Unterwegs: kein Spot, keine eigene Fahrt, keine zweite Reise, Köln bleibt bis zur Ankunft aktiv.
    expect(sim.state.modules.customers.self.spotId).toBeNull();
    expect(isPlayerOnTheRoad(sim.state)).toBe(true);
    expect(isPlayerIn(sim.state, 'koeln')).toBe(false);
    expect(sim.dispatch({ type: 'customers.standAt', payload: { spotId: 'uni' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(false);
    expect(activeCity(sim.state)).toBe('koeln');
    sim.advance(minutes + 5);
    expect(cityTravel(sim.state)).toBeNull();
    expect(presentCity(sim.state)).toBe('hamburg');
    expect(activeCity(sim.state)).toBe('hamburg');
    expect(eventsOfType(events, 'city.arrived').map((e) => e.payload)).toEqual([{ cityId: 'hamburg', first: true }]);
    const fiete = messages.thread(sim.state, HARBOR_CALLER.id).map((m) => m.text);
    for (const text of WELCOME_TEXTS.hamburg) expect(fiete).toContain(text);
    // Zurück nach Köln und wieder hin: Fiete begrüßt nur einmal.
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'koeln' } }).ok).toBe(true);
    sim.advance(travelMinutesBetween('hamburg', 'koeln') + 5);
    expect(activeCity(sim.state)).toBe('koeln');
    arriveInHamburg(sim);
    expect(eventsOfType(events, 'city.arrived').filter((e) => e.payload.first)).toHaveLength(1);
  });

  it('Aufenthalt: Selbst am Spot stehen, ausfahren und abholen nur in der Stadt, in der du bist', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    arriveInHamburg(sim);
    // Auf Köln schauen geht, dort selbst verkaufen nicht.
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } }).ok).toBe(true);
    const stand = sim.dispatch({ type: 'customers.standAt', payload: { spotId: 'uni' } });
    expect(stand.ok).toBe(false);
    expect(stand.ok ? '' : stand.reason).toContain('nicht in Köln');
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'keller-st-georg' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'hansaplatz' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'customers.standAt', payload: { spotId: 'hansaplatz' } }).ok).toBe(true);
  });

  it('Konfrontation in der Stadt, in der du nicht bist: selbst hin geht nicht, mit Vollmacht entscheidet die Rechte Hand', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    arriveInHamburg(sim);
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } });
    expect(hasFullPower(sim.state, 'koeln')).toBe(true);
    const runner = hire(sim, 2, 70);
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'kalk',
      staffIds: [runner.id],
      askPlayer: true,
      opponent: { label: 'Leute der Schäl Sick', strength: 40, count: 2 },
    });
    const started = sim.state.modules.encounters.active.find((x) => x.id === encounterId);
    expect(started?.playerPresent).toBe(false);
    sim.advance(2);
    const e = sim.state.modules.encounters.active.find((x) => x.id === encounterId);
    // Die Rechte Hand hat entschieden: Ihre Leute machen (oder es ist schon vorbei).
    expect(e === undefined || e.phase !== 'briefing').toBe(true);
    if (e) expect(e.mode).toBe('crew');
  });

  it('Leute nachholen: Mit Vollmacht gibt die Rechte Hand Leute am Spot nicht frei, freie Leute fahren nach Hamburg', () => {
    const sim = quietGame();
    const boss = handOverKoeln(sim);
    const atSpot = hire(sim, 1, 60);
    sim.dispatch({
      type: 'staff.assign',
      payload: { staffId: atSpot.id, assignment: { kind: 'spot', targetId: 'zuelpicher' } },
    });
    const free = hire(sim, 1, 60);
    const refused = sim.dispatch({ type: 'staff.relocate', payload: { staffId: atSpot.id, cityId: 'hamburg' } });
    expect(refused.ok).toBe(false);
    const chat = messages.thread(sim.state, `staff:${boss.id}`).map((m) => m.text);
    expect(chat.some((t) => t.includes('steht der Zülpicher Platz leer'))).toBe(true);
    expect(sim.dispatch({ type: 'staff.relocate', payload: { staffId: free.id, cityId: 'hamburg' } }).ok).toBe(true);
    expect(getStaffMember(sim.state, free.id)?.assignment).toEqual({ kind: 'travel', targetId: 'hamburg' });
    // Leutnants werden nicht verschickt.
    const lead = Object.keys(sim.state.modules.hierarchy.posts)[0];
    expect(sim.dispatch({ type: 'staff.relocate', payload: { staffId: lead, cityId: 'hamburg' } }).ok).toBe(false);
    const events = recordEvents(sim);
    sim.advance(travelMinutesBetween('koeln', 'hamburg') + 2);
    expect(getStaffMember(sim.state, free.id)).toMatchObject({ cityId: 'hamburg', assignment: null });
    expect(eventsOfType(events, 'staff.relocated').map((e) => e.payload)).toEqual([
      { staffId: free.id, from: 'koeln', to: 'hamburg' },
    ]);
  });

  it('Rechte Hand pro Stadt: In Hamburg kann eine zweite Rechte Hand arbeiten, Köln behält seine Vollmacht', () => {
    const sim = quietGame();
    const koelnBoss = handOverKoeln(sim);
    arriveInHamburg(sim);
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'keller-st-georg' } });
    sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'hansaplatz' } });
    sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'lange-reihe' } });
    // In Hamburg angeheuert (aktive Stadt), zwei Leutnants und eine Rechte Hand.
    const a = hire(sim, 2, 80);
    const b = hire(sim, 2, 80);
    expect(a.cityId).toBe('hamburg');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['hansaplatz'] } });
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['lange-reihe'] } });
    const hhBoss = hire(sim, 5, 95);
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: hhBoss.id } }).ok).toBe(true);
    expect(getRightHand(sim.state, 'hamburg')?.staffId).toBe(hhBoss.id);
    expect(getRightHand(sim.state, 'koeln')?.staffId).toBe(koelnBoss.id);
    expect(hasFullPower(sim.state, 'koeln')).toBe(true);
    expect(hasFullPower(sim.state, 'hamburg')).toBe(false);
    // Vollmacht für Hamburg erst, wenn Hamburg ganz dir gehört.
    expect(sim.dispatch({ type: 'hierarchy.grantFullPower', payload: { cityId: 'hamburg' } }).ok).toBe(false);
  });

  it('Hamburg komplett: Sieg pro Stadt, die Bestenliste zählt zwei Städte, danach Endlosmodus', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    arriveInHamburg(sim);
    const events = recordEvents(sim);
    takeCity(sim, 'hamburg');
    expect(eventsOfType(events, 'campaign.won').map((e) => e.payload)).toEqual([
      expect.objectContaining({ cityId: 'hamburg', cityName: 'Hamburg', next: expect.stringContaining('Endlosmodus') }),
    ]);
    expect(sim.state.outcome.won?.cities).toEqual(['koeln', 'hamburg']);
    expect(runSummary(sim.state).cities).toBe(2);
    sim.advance(DAY);
    expect(sim.isOver).toBe(false);
  });
});
