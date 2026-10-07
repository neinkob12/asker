// München (Auftrag 38): Daten nach der Checkliste (Veedel, Spots, Lager, Gangs, Straßennetz, Lieferanten, Events) und
// der Dreh „teuer und streng“ als Daten. Dazu ein kurzer Weg ins Spiel: Köln komplett, übergeben, in München ankommen.

import { describe, expect, it } from 'vitest';
import { distanceMeters, loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { CITY_EVENTS, getEventDef, isEventActive } from '../events';
import { getGangStatus, getGangs } from '../gangs';
import { warehouseSites } from '../goods';
import { getRightHand, RIGHT_HAND_RANK_XP } from '../hierarchy';
import { operationTier } from '../police';
import { interCityRoute, nearestRoadPoint, networkStats, roadApproaches } from '../roads';
import { getAllSpots, spotCity } from '../spots';
import { enlist, generateProfile } from '../staff';
import { getSupplier, getSuppliers, isUnlocked, rollShipmentProblem } from '../suppliers';
import { addInfluence, controllerOf, factions, PLAYER_FACTION } from '../territory';
import { allVeedel, neighborsOf, veedelAt, veedelLinks } from '../veedel';
import { START_MONEY_MIN_BY_CITY } from './config';
import { CITIES } from './data';
import { isCityUnlocked, playableCities, presentCity } from './index';

const CITY = 'muenchen';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

function readyRightHand(sim: Simulation): void {
  sim.state.wallet.dirty = 50000;
  const ctx = sim.ctx('staff');
  const hire = (level: number, loyalty: number) => {
    const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
    m.stats.loyalty = loyalty;
    return m;
  };
  const a = hire(2, 70);
  const b = hire(2, 70);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = hire(5, 90);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
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
}

function completeKoeln(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel('koeln')) {
    for (const faction of factions(sim.state)) if (faction !== PLAYER_FACTION) addInfluence(ctx, v.id, faction, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/** Köln komplett, an die Rechte Hand übergeben, über die Autobahn nach München. */
function moveToMuenchen(sim: Simulation): void {
  readyRightHand(sim);
  completeKoeln(sim);
  expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: CITY } }).ok).toBe(true);
  sim.advance(12 * 60);
  expect(presentCity(sim.state)).toBe(CITY);
}

describe('München (Auftrag 38)', () => {
  it('ist spielbar: zwölf Stadtbezirke mit Grenzen, die zusammenhängen', () => {
    expect(playableCities().map((c) => c.id)).toContain(CITY);
    const veedel = allVeedel(CITY);
    expect(veedel).toHaveLength(12);
    for (const v of veedel) expect(veedelAt(v.center.lng, v.center.lat)?.id, v.id).toBe(v.id);
    // Jeder Bezirk ist über Grenzen oder Verbindungen vom ersten aus erreichbar.
    const ids = new Set(veedel.map((v) => v.id));
    const links = veedelLinks().filter((l) => ids.has(l.a));
    const seen = new Set([veedel[0].id]);
    const queue = [veedel[0].id];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const next = [
        ...neighborsOf(id),
        ...links.filter((l) => l.a === id).map((l) => l.b),
        ...links.filter((l) => l.b === id).map((l) => l.a),
      ];
      for (const n of next) {
        if (ids.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(12);
  });

  it('teuer und streng: höchste Löhne und Immobilienpreise, Polizei eine Stufe härter, Kaufkraft am höchsten', () => {
    const muenchen = CITIES.find((c) => c.id === CITY);
    if (!muenchen) throw new Error('München fehlt');
    expect(muenchen.template).toBeUndefined();
    for (const c of CITIES.filter((c) => c.id !== CITY)) {
      expect(muenchen.wageFactor, c.id).toBeGreaterThan(c.wageFactor);
      expect(muenchen.propertyFactor, c.id).toBeGreaterThan(c.propertyFactor);
    }
    const power = (city: string) => {
      const list = allVeedel(city);
      return list.reduce((s, v) => s + v.purchasingPower, 0) / list.length;
    };
    expect(power(CITY)).toBeGreaterThan(power('hamburg'));
    const police = (city: string) => {
      const list = allVeedel(city);
      return list.reduce((s, v) => s + v.policePresence, 0) / list.length;
    };
    expect(police(CITY)).toBeGreaterThan(police('hamburg'));
    const sim = quietGame();
    expect(operationTier(sim.state, CITY).id).toBe('dealer');
    expect(operationTier(sim.state, 'koeln').id).toBe('small');
    expect(START_MONEY_MIN_BY_CITY[CITY]).toBeGreaterThan(START_MONEY_MIN_BY_CITY.hamburg);
  });

  it('Spots: mindestens zwei pro Bezirk, alle zum Freischalten, weniger und teurer als in Hamburg', () => {
    const sim = quietGame();
    const spots = getAllSpots(sim.state).filter((s) => spotCity(s) === CITY);
    const hamburg = getAllSpots(sim.state).filter((s) => spotCity(s) === 'hamburg');
    expect(spots.length).toBeLessThan(hamburg.length);
    for (const v of allVeedel(CITY)) {
      expect(spots.filter((s) => s.veedelId === v.id).length, v.id).toBeGreaterThanOrEqual(2);
    }
    for (const s of spots) expect(s.unlockCost, s.id).toBeGreaterThan(0);
    const avg = (list: typeof spots, f: (s: (typeof spots)[number]) => number) =>
      list.reduce((sum, s) => sum + f(s), 0) / list.length;
    expect(avg(spots, (s) => s.unlockCost ?? 0)).toBeGreaterThan(avg(hamburg, (s) => s.unlockCost ?? 0));
    expect(avg(spots, (s) => s.priceMultiplier)).toBeGreaterThan(avg(hamburg, (s) => s.priceMultiplier));
  });

  it('Lager: fünf Standorte zum Kaufen, teurer als in Hamburg, alle an einer Straße', () => {
    const sites = warehouseSites(CITY);
    expect(sites).toHaveLength(5);
    const cheapest = Math.min(...sites.map((w) => w.cost));
    expect(cheapest).toBeGreaterThan(Math.max(...warehouseSites('hamburg').map((w) => w.cost)));
    for (const w of sites) {
      expect(veedelAt(w.lng, w.lat)?.cityId, w.id).toBe(CITY);
      expect(nearestRoadPoint(w)?.meters ?? Infinity, w.id).toBeLessThanOrEqual(60);
    }
  });

  it('vier Gangs teilen die Bezirke unter sich auf', () => {
    const sim = quietGame();
    const gangs = getGangs(sim.state, CITY);
    expect(gangs).toHaveLength(4);
    const owners = new Set(allVeedel(CITY).map((v) => controllerOf(sim.state, v.id)));
    for (const g of gangs) expect(owners.has(g.id), g.id).toBe(true);
    expect(owners.has(PLAYER_FACTION)).toBe(false);
  });

  it('Straßennetz mit Autobahn-Zufahrten; die Autobahn aus Köln endet auf einer Münchner Straße', () => {
    const stats = networkStats(CITY);
    expect(stats.nodes).toBeGreaterThan(10000);
    expect(roadApproaches(CITY).map((a) => a.ref)).toEqual(expect.arrayContaining(['A9', 'A8', 'A94', 'A96']));
    const site = warehouseSites(CITY)[0];
    const route = interCityRoute({ lng: 6.9583, lat: 50.9413 }, site);
    expect(route.via).toEqual(['frankfurt']);
    // Das letzte Stück in München liegt auf Straßen: Ziel erreicht, kein langer Sprung neben der Straße.
    const inside = route.path.filter((p) => p.lat < 48.25 && p.lng > 11.4);
    expect(inside.length).toBeGreaterThan(5);
    for (let i = 1; i < inside.length; i++) {
      const near = nearestRoadPoint(inside[i]);
      expect(near?.meters ?? Infinity).toBeLessThan(80);
    }
    expect(distanceMeters(route.path[route.path.length - 1], site)).toBeLessThan(1);
  });

  it('Events: Oktoberfest zwei Wochen auf der Wiesn mit vielen Kontrollen, Bayern-Heimspiel im Norden', () => {
    const wiesn = getEventDef('oktoberfest');
    if (wiesn?.schedule.kind !== 'cycle') throw new Error('Oktoberfest fehlt');
    expect(wiesn.cityId).toBe(CITY);
    expect(wiesn.schedule.days).toBeGreaterThanOrEqual(14);
    expect(wiesn.effects.demand).toBeGreaterThanOrEqual(2.5);
    expect(wiesn.effects.checks).toBeGreaterThan(1.5);
    const sim = quietGame();
    const spots = new Map(getAllSpots(sim.state).map((s) => [s.id, s]));
    for (const id of wiesn.area.spots ?? []) expect(spotCity(spots.get(id) ?? { veedelId: '' }), id).toBe(CITY);
    expect(spots.get('theresienwiese')?.veedelId).toBe('isarvorstadt');
    const day = (d: number) => (d - 1) * 24 * 60 + 12 * 60;
    expect(isEventActive(wiesn, day(wiesn.schedule.firstDay))).toBe(true);
    expect(isEventActive(wiesn, day(wiesn.schedule.firstDay + wiesn.schedule.days))).toBe(false);
    const bayern = CITY_EVENTS.find((e) => e.id === 'bayern');
    expect(bayern?.cityId).toBe(CITY);
    for (const v of bayern?.area.veedel ?? [])
      expect(
        allVeedel(CITY).some((x) => x.id === v),
        v,
      ).toBe(true);
  });

  it('Lieferanten: Toni liefert nach München, Enzo aus Verona über den Brenner mit Zoll', () => {
    const sim = quietGame();
    expect(getSuppliers(sim.state, CITY).map((s) => s.id)).toEqual(expect.arrayContaining(['frankfurt', 'italien']));
    const enzo = getSupplier(sim.state, 'italien');
    if (!enzo) throw new Error('Enzo fehlt');
    expect(enzo.cities).toEqual([CITY]);
    expect(enzo.quality).toBeGreaterThan(0.8);
    // Zoll am Brenner: Bei gleichem Wurf fliegt die Ware öfter auf als ohne Zoll.
    const seized = (s: typeof enzo) =>
      Array.from({ length: 1000 }, (_, i) => rollShipmentProblem(i / 1000, s, 50)).filter((p) => p === 'seized').length;
    expect(seized(enzo)).toBeGreaterThan(seized({ ...enzo, customs: 0 }));
    expect(isUnlocked(sim.state, 'italien')).toBe(false);
  });

  it('Spielweg: übergeben, ankommen, Enzo meldet sich, Lager kaufen, Spot freischalten', () => {
    const sim = quietGame();
    moveToMuenchen(sim);
    expect(isCityUnlocked(sim.state, CITY)).toBe(true);
    sim.advance(2 * 60);
    expect(sim.state.modules.suppliers.offered).toContain('italien');
    sim.state.wallet.clean = 20000;
    sim.state.wallet.dirty = 20000;
    const site = warehouseSites(CITY).find((w) => w.id === 'hinterhof-giesing');
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'hinterhof-giesing' } }).ok).toBe(true);
    expect(sim.state.wallet.clean).toBe(20000 - (site?.cost ?? 0));
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'tegernseer-landstrasse' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'suppliers.unlock', payload: { supplierId: 'italien' } }).ok).toBe(true);
  });

  it('alte Spielstände ohne München (auch schon mit Berlin gespeichert) bekommen Bezirke und Gangs wie neu', () => {
    const sim = createTestGame({ seed: 3 });
    const fresh = JSON.parse(JSON.stringify(sim.state));
    const old = JSON.parse(JSON.stringify(sim.state));
    const gangs = old.modules.gangs.gangs as Record<string, unknown>;
    for (const id of Object.keys(gangs)) if (id.startsWith('mu-')) delete gangs[id];
    // Stand nach dem Berliner Merge (gangs 6, territory 5), also nach den Migrationen, die Berlin ergänzt haben.
    old.moduleVersions.gangs = 6;
    for (const v of allVeedel(CITY)) {
      delete old.modules.territory.influence[v.id];
      delete old.modules.territory.controller[v.id];
    }
    old.moduleVersions.territory = 5;
    const loaded = loadSimulation(old as never, sim.modules);
    expect(loaded.state.moduleVersions.gangs).toBeGreaterThanOrEqual(7);
    expect(loaded.state.moduleVersions.territory).toBeGreaterThanOrEqual(6);
    for (const id of ['mu-bahnhof', 'mu-giesing', 'mu-isar', 'mu-nord']) {
      expect(getGangStatus(loaded.state, id)?.people, id).toBeGreaterThan(0);
    }
    for (const v of allVeedel(CITY)) {
      expect(loaded.state.modules.territory.influence[v.id], v.id).toEqual(fresh.modules.territory.influence[v.id]);
      expect(controllerOf(loaded.state, v.id), v.id).not.toBe(PLAYER_FACTION);
    }
    // Köln und Berlin bleiben, wie sie waren.
    expect(loaded.state.modules.territory.influence.kalk).toEqual(fresh.modules.territory.influence.kalk);
    expect(loaded.state.modules.territory.influence.kreuzberg).toEqual(fresh.modules.territory.influence.kreuzberg);
  });
});
