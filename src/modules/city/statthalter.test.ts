// Statthalter, Schlaf und Startpaket (Auftrag 36): Übergabe mit neuer Rechter Hand, Leuten und Fahrzeugen; Razzia im
// Schlaf; Titel Statthalter; Ränge des Spielers.

import { describe, expect, it } from 'vitest';
import { messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getVehicles } from '../fleet';
import {
  getRightHand,
  hasFullPower,
  isCapo,
  isTaskUnlocked,
  RIGHT_HAND_DEMAND,
  RIGHT_HAND_RANK_XP,
  rankForXp,
  rightHandTitle,
  startPackLeaders,
  startPackStaff,
} from '../hierarchy';
import { enlist, generateProfile, getStaffMember, type StaffMember } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import {
  GERMANY_MIN_CITIES,
  HANDOVER_START_MONEY_DAYS,
  SLEEP_RAID_CHANCE,
  SLEEP_RAID_LOSS_MAX,
  START_MONEY_MIN_BY_CITY,
} from './config';
import {
  activeCity,
  cityTravel,
  currentRank,
  nextCityAfter,
  PLAYER_RANKS,
  playerRank,
  presentCity,
  sleepResult,
  startMoneyDue,
  startMoneyFor,
} from './index';
import { reachedRank } from './ranks';

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

/** Köln komplett, Rechte Hand bereit, dazu ein Leutnant ab Level 5 und ein freier Läufer (noch nicht übergeben). */
function readyKoeln(sim: Simulation): { boss: StaffMember; capo: StaffMember; runner: StaffMember } {
  sim.state.wallet.dirty = 80000;
  sim.state.wallet.clean = 40000;
  const a = hire(sim, 2, 80);
  const capo = hire(sim, 6, 85);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: capo.id, spotIds: ['neumarkt'] } });
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
  const runner = hire(sim, 2, 60);
  takeCity(sim, 'koeln');
  return { boss, capo, runner };
}

describe('Startpaket (Auftrag 36)', () => {
  it('neue Rechte Hand, Leute und Fahrzeug kommen mit; die Rechte Hand behält Level und bekommt freie Aufgaben', () => {
    const sim = quietGame();
    const { boss, capo, runner } = readyKoeln(sim);
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'kombi', cityId: 'koeln' } }).ok).toBe(true);
    const vehicle = getVehicles(sim.state, 'koeln')[0];
    expect(startPackLeaders(sim.state, 'koeln').map((m) => m.id)).toEqual([capo.id]);
    expect(startPackStaff(sim.state, 'koeln').map((m) => m.id)).toContain(runner.id);
    // Zu viele Leute oder jemand, der nicht darf: nichts passiert.
    const tooMany = sim.dispatch({
      type: 'city.handOver',
      payload: { cityId: 'koeln', toCityId: 'hamburg', pack: { leaderId: boss.id } },
    });
    expect(tooMany.ok).toBe(false);
    expect(hasFullPower(sim.state, 'koeln')).toBe(false);
    const events = recordEvents(sim);
    const done = sim.dispatch({
      type: 'city.handOver',
      payload: {
        cityId: 'koeln',
        toCityId: 'hamburg',
        pack: { leaderId: capo.id, staffIds: [runner.id], vehicleIds: [vehicle.id] },
      },
    });
    expect(done.ok).toBe(true);
    expect(hasFullPower(sim.state, 'koeln')).toBe(true);
    expect(rightHandTitle(sim.state, 'koeln')).toBe('Statthalter von Köln');
    // Das Fahrzeug kommt mit dir an.
    expect(getVehicles(sim.state, 'hamburg').map((v) => v.id)).toEqual([vehicle.id]);
    const travel = cityTravel(sim.state);
    if (!travel) throw new Error('keine Fahrt');
    sim.advance(travel.arrivesAt - sim.state.time + 10);
    expect(presentCity(sim.state)).toBe('hamburg');
    expect(activeCity(sim.state)).toBe('hamburg');
    // Angekommen: Der Capo ist Rechte Hand in Hamburg, mit Stufe nach seinem Level (6 → Stufe 4), der Läufer ist da.
    const rh = getRightHand(sim.state, 'hamburg');
    expect(rh?.staffId).toBe(capo.id);
    expect(rankForXp(rh?.xp ?? 0)).toBe(4);
    expect(getStaffMember(sim.state, capo.id)?.level).toBe(6);
    expect(isTaskUnlocked(sim.state, 'orders')).toBe(true);
    expect(rh?.settings.orders).toBe(true);
    expect(getStaffMember(sim.state, runner.id)?.cityId).toBe('hamburg');
    expect(eventsOfType(events, 'hierarchy.rightHandAppointed').map((e) => e.payload.staffId)).toContain(capo.id);
    // Köln führt weiter die alte Rechte Hand, als Statthalter.
    expect(getRightHand(sim.state, 'koeln')?.staffId).toBe(boss.id);
  });
});

describe('Startpaket mit Capo (Auftrag 34)', () => {
  it('Capos stehen vorn; der Capo geht als Rechte Hand, ist dort kein Capo mehr und behält ihren Anspruch', () => {
    const sim = quietGame();
    const { capo } = readyKoeln(sim);
    for (const id of ['zuelpicher', 'rudolfplatz', 'aachener-weiher']) {
      if (!sim.state.modules.spots.unlocked.includes(id)) sim.state.modules.spots.unlocked.push(id);
    }
    const veteran = hire(sim, 8, 90);
    const spots = (staffId: string, spotIds: string[]) =>
      sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId, spotIds } }).ok;
    expect(spots(veteran.id, ['rudolfplatz'])).toBe(true);
    expect(spots(capo.id, ['neumarkt', 'zuelpicher', 'aachener-weiher'])).toBe(true);
    expect(sim.dispatch({ type: 'hierarchy.appointCapo', payload: { staffId: capo.id, lieutenantIds: [] } }).ok).toBe(
      true,
    );
    // Der Leutnant mit Level 8 ist kein Capo: vorgeschlagen wird nur der Capo.
    expect(startPackLeaders(sim.state, 'koeln').map((m) => m.id)).toEqual([capo.id]);
    expect(
      sim.dispatch({
        type: 'city.handOver',
        payload: { cityId: 'koeln', toCityId: 'hamburg', pack: { leaderId: capo.id } },
      }).ok,
    ).toBe(true);
    expect(isCapo(sim.state, capo.id)).toBe(false);
    const travel = cityTravel(sim.state);
    if (!travel) throw new Error('keine Fahrt');
    sim.advance(travel.arrivesAt - sim.state.time + 10);
    expect(getRightHand(sim.state, 'hamburg')?.staffId).toBe(capo.id);
    sim.advance(1440);
    expect(getStaffMember(sim.state, capo.id)?.demand).toBe(RIGHT_HAND_DEMAND);
  });
});

describe('Startgeld (Auftrag 36)', () => {
  it('bei der Übergabe gibt der Statthalter Tagesgewinne mit, als Umbuchung, nicht als Gewinn', () => {
    const sim = quietGame();
    readyKoeln(sim);
    sim.state.modules.city.sleep.koeln.results = [4000, 6000];
    expect(startMoneyFor(sim.state, 'koeln', 'hamburg')).toBe(5000 * HANDOVER_START_MONEY_DAYS);
    expect(startMoneyDue(sim.state, 'koeln', 'hamburg')).toBe(5000 * HANDOVER_START_MONEY_DAYS);
    const before = sim.state.wallet.dirty;
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'hamburg' } }).ok).toBe(true);
    const start = eventsOfType(events, 'wallet.changed').find((e) => e.payload.reason.startsWith('Startgeld'));
    expect(start?.payload).toMatchObject({ amount: 5000 * HANDOVER_START_MONEY_DAYS, category: 'transfer' });
    expect(sim.state.wallet.dirty).toBeGreaterThanOrEqual(before + 5000 * HANDOVER_START_MONEY_DAYS - 1);
  });

  it('mindestens START_MONEY_MIN_BY_CITY der Zielstadt', () => {
    const sim = quietGame();
    readyKoeln(sim);
    sim.state.modules.city.sleep.koeln.results = [500];
    expect(startMoneyFor(sim.state, 'koeln', 'hamburg')).toBe(START_MONEY_MIN_BY_CITY.hamburg);
  });

  it('Widerruf und erneute Übergabe: kein zweites Startgeld, keine Stadt ohne Anruf', () => {
    const sim = quietGame();
    readyKoeln(sim);
    expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'hamburg' } }).ok).toBe(true);
    const travel = cityTravel(sim.state);
    if (!travel) throw new Error('keine Fahrt');
    sim.advance(travel.arrivesAt - sim.state.time + 10);
    // Zurück nach Köln, Vollmacht widerrufen, erneut übergeben.
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'koeln' } }).ok).toBe(true);
    const back = cityTravel(sim.state);
    if (!back) throw new Error('keine Rückfahrt');
    sim.advance(back.arrivesAt - sim.state.time + 10);
    expect(sim.dispatch({ type: 'hierarchy.revokeFullPower', payload: { cityId: 'koeln' } }).ok).toBe(true);
    expect(startMoneyDue(sim.state, 'koeln', 'hamburg')).toBe(0);
    expect(nextCityAfter(sim.state, 'koeln')).toBeNull();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'hamburg' } }).ok).toBe(true);
    expect(eventsOfType(events, 'wallet.changed').some((e) => e.payload.reason.startsWith('Startgeld'))).toBe(false);
    expect(hasFullPower(sim.state, 'koeln')).toBe(true);
  });
});

describe('Schlaf mit Razzia (Auftrag 36)', () => {
  it('an etwa 3 von 100 Tagen: halbes Ergebnis oder ein kleines Minus, nie mehr', () => {
    let seed = 7;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const days = 20_000;
    let raids = 0;
    let losses = 0;
    for (let i = 0; i < days; i++) {
      const r = sleepResult(1000, random);
      if (r.raid) raids++;
      if (r.raid === 'loss') {
        losses++;
        expect(r.amount).toBeLessThan(0);
        expect(r.amount).toBeGreaterThanOrEqual(-1000 * SLEEP_RAID_LOSS_MAX);
      } else if (r.raid === 'half') {
        expect(r.amount).toBeGreaterThanOrEqual(400);
        expect(r.amount).toBeLessThanOrEqual(600);
      } else {
        expect(r.amount).toBeGreaterThanOrEqual(850);
        expect(r.amount).toBeLessThanOrEqual(1150);
      }
    }
    expect(raids / days).toBeGreaterThan(SLEEP_RAID_CHANCE * 0.8);
    expect(raids / days).toBeLessThan(SLEEP_RAID_CHANCE * 1.2);
    expect(losses).toBeGreaterThan(0);
    // Ohne Gewinn keine Razzia (nichts zu halbieren).
    expect(sleepResult(0, random)).toEqual({ amount: 0, raid: null });
  });

  it('der Statthalter schreibt eine Zeile, Veedel bleiben', () => {
    const sim = quietGame();
    const { boss } = readyKoeln(sim);
    expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'hamburg' } }).ok).toBe(true);
    const travel = cityTravel(sim.state);
    if (!travel) throw new Error('keine Fahrt');
    sim.advance(travel.arrivesAt - sim.state.time + 10);
    // Köln schläft mit einem guten Schnitt; viele Tage, bis eine Razzia kommt.
    const sleep = sim.state.modules.city.sleep.koeln;
    sleep.results = [3000, 3000, 3000];
    const events = recordEvents(sim);
    let raid = false;
    for (let day = 0; day < 120 && !raid; day++) {
      sim.state.modules.customers.directOrders = false;
      sim.advance(1440);
      raid = eventsOfType(events, 'city.slept').some((e) => e.payload.raid);
    }
    expect(raid).toBe(true);
    const lines = messages.thread(sim.state, `staff:${boss.id}`).map((m) => m.text);
    expect(lines.some((t) => t.startsWith('Bericht aus Köln'))).toBe(true);
    expect(
      allVeedel('koeln').every((v) => (sim.state.modules.territory.influence[v.id]?.[PLAYER_FACTION] ?? 0) >= 50),
    ).toBe(true);
  }, 120_000);
});

describe('Ränge des Spielers (Auftrag 36)', () => {
  it('Kleindealer am Anfang, Boss von Köln mit der Mehrheit, Boss von Hamburg, Boss von Deutschland', () => {
    const sim = quietGame();
    expect(playerRank(sim.state).title).toBe('Kleindealer');
    expect(PLAYER_RANKS.map((r) => r.title)).toEqual([
      'Kleindealer',
      'Händler',
      'Großhändler',
      'Boss von Köln',
      'Boss von {city}',
      'Boss von Deutschland',
      'Importeur',
      'Produzent',
    ]);
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    for (const v of allVeedel('koeln').slice(0, 7)) addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    sim.advance(60);
    expect(playerRank(sim.state).title).toBe('Boss von Köln');
    expect(eventsOfType(events, 'player.rankUp').map((e) => e.payload.title)).toContain('Boss von Köln');
    // Hamburg komplett (Köln nicht): Boss von Hamburg.
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    takeCity(sim, 'hamburg');
    sim.advance(60);
    expect(playerRank(sim.state).title).toBe('Boss von Hamburg');
    // Köln und Hamburg komplett: noch nicht Boss von Deutschland (dafür braucht es GERMANY_MIN_CITIES Städte).
    takeCity(sim, 'koeln');
    sim.advance(60);
    expect(playerRank(sim.state).title).toBe('Boss von Hamburg');
    expect(GERMANY_MIN_CITIES).toBeGreaterThanOrEqual(4);
    // Mit zwei als Mindestzahl wäre es so weit (der Rang selbst ist reine Rechnung).
    const reached = reachedRank(sim.state, {
      cities: ['koeln', 'hamburg'],
      unlocked: ['koeln', 'hamburg'],
      name: (id) => id,
      minGermany: 2,
    });
    expect(reached.title).toBe('Boss von Deutschland');
    // Ränge gehen nie verloren, auch wenn Veedel fallen.
    for (const v of allVeedel('hamburg')) addInfluence(sim.ctx('test'), v.id, PLAYER_FACTION, -100);
    sim.advance(60);
    expect(playerRank(sim.state).title).toBe('Boss von Hamburg');
    expect(currentRank(sim.state).score).toBeLessThanOrEqual(playerRank(sim.state).score);
  });
});
