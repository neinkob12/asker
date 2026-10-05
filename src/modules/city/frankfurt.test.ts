// Frankfurt (Auftrag 39): die Stadt als Daten nach der Checkliste in docs/architektur.md und ihr Dreh (Geld und
// Flughafen): Banker-Kundschaft, das Bahnhofsviertel als Brennpunkt, Kofi mit Luftfracht und scharfem Zoll, Toni zu
// Hause, Geldwäsche mit höherer Obergrenze, Messe und Museumsuferfest.

import { describe, expect, it } from 'vitest';
import { loadSimulation, MINUTES_PER_DAY, messages, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { DEALERS } from '../customers';
import { CITY_EVENTS, eventFactor, isEventActive } from '../events';
import { getGangStatus, getGangs } from '../gangs';
import { getStock, warehouseSites } from '../goods';
import { channelCapacity, channelFree, channelHeatAbove, getChannel, launderingCapacity } from '../laundering';
import { networkStats, roadApproaches, roadNetworkAt } from '../roads';
import { getAllSpots, spotCity } from '../spots';
import { getSupplier, getSuppliers, packagePrice, rollShipmentProblem, routeKindOf, supplierIn } from '../suppliers';
import { controllerOf } from '../territory';
import { allVeedel, getVeedel, neighborsOf } from '../veedel';
import { cityAt, getCity, playableCities } from './index';

/** Frankfurt frei und aktiv, du bist dort, mit Geld. */
function inFrankfurt(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'frankfurt' } }, { actor: 'system' }).ok).toBe(true);
  expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'frankfurt' } }).ok).toBe(true);
  sim.state.modules.city.present = 'frankfurt';
  sim.state.wallet.clean = 40000;
  sim.state.wallet.dirty = 60000;
  return sim;
}

describe('Frankfurt (Auftrag 39)', () => {
  it('ist spielbar: zwölf Stadtteile mit Grenzen, die zusammenhängen, Kamera und Straßennetz', () => {
    const city = getCity('frankfurt');
    expect(city?.template).toBeUndefined();
    expect(playableCities().map((c) => c.id)).toContain('frankfurt');
    expect(city?.view.pitch).toBeGreaterThan(0);
    const veedel = allVeedel('frankfurt');
    expect(veedel).toHaveLength(12);
    // Alle hängen über Grenzen oder Verbindungen zusammen (Höchst und der Flughafen über Mainbrücken und Ausfallstraßen).
    const seen = new Set(['bahnhofsviertel']);
    const queue = ['bahnhofsviertel'];
    while (queue.length > 0) {
      for (const n of neighborsOf(queue.shift() ?? '')) {
        if (!seen.has(n) && getVeedel(n)?.cityId === 'frankfurt') {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(12);
    for (const v of veedel) expect(cityAt(v.center.lng, v.center.lat), v.id).toBe('frankfurt');
    expect(networkStats('frankfurt').nodes).toBeGreaterThan(5000);
    expect(roadNetworkAt({ lng: 8.667, lat: 50.108 })).toBe('frankfurt');
    expect(roadApproaches('frankfurt').map((a) => a.ref)).toEqual(expect.arrayContaining(['A3', 'A5', 'A648', 'A661']));
  });

  it('das Bahnhofsviertel ist der Brennpunkt, im Westend wohnen die Banker', () => {
    const veedel = allVeedel('frankfurt');
    const max = (f: (v: (typeof veedel)[number]) => number) => veedel.reduce((a, v) => (f(v) > f(a) ? v : a)).id;
    expect(max((v) => v.density)).toBe('bahnhofsviertel');
    expect(max((v) => v.policePresence)).toBe('bahnhofsviertel');
    expect(max((v) => v.purchasingPower)).toBe('westend-sued');
    // Frankfurt hat Geld: im Schnitt mehr Kaufkraft als Köln und Hamburg.
    const avg = (cityId: string) =>
      allVeedel(cityId).reduce((s, v) => s + v.purchasingPower, 0) / allVeedel(cityId).length;
    expect(avg('frankfurt')).toBeGreaterThan(avg('hamburg'));
    expect(avg('frankfurt')).toBeGreaterThan(avg('koeln'));
  });

  it('mindestens zwei Spots pro Stadtteil, alle zum Freischalten, viel Banker-Kundschaft', () => {
    const sim = createTestGame();
    const spots = getAllSpots(sim.state).filter((s) => spotCity(s) === 'frankfurt');
    for (const v of allVeedel('frankfurt')) {
      expect(spots.filter((s) => s.veedelId === v.id).length, v.id).toBeGreaterThanOrEqual(2);
    }
    for (const s of spots) expect(s.unlockCost, s.id).toBeGreaterThan(0);
    const bankers = spots.filter((s) => (s.audience?.banker ?? 0) >= 2);
    expect(bankers.length).toBeGreaterThanOrEqual(5);
    expect(spots.some((s) => s.kind === 'kneipe')).toBe(true);
    expect(warehouseSites('frankfurt')).toHaveLength(5);
  });

  it('vier Gangs mit Heimat, jede hält zu Beginn Stadtteile, alle Stadtteile gehören einer', () => {
    const sim = createTestGame();
    const gangs = getGangs(sim.state, 'frankfurt');
    expect(gangs).toHaveLength(4);
    const owners = new Map<string, number>();
    for (const v of allVeedel('frankfurt')) {
      const owner = controllerOf(sim.state, v.id);
      expect(owner, v.id).not.toBeNull();
      owners.set(owner ?? '', (owners.get(owner ?? '') ?? 0) + 1);
    }
    for (const g of gangs) expect(owners.get(g.id) ?? 0, g.id).toBeGreaterThanOrEqual(2);
    expect(controllerOf(sim.state, 'bahnhofsviertel')).toBe('ff-bahnhof');
    expect(controllerOf(sim.state, 'flughafen')).toBe('ff-hoechst');
  });

  it('Toni ist zu Hause: in Frankfurt eine Stunde und zehn Prozent billiger, ins Frankfurter Lager', () => {
    const sim = inFrankfurt();
    expect(packagePrice(sim.state, 'frankfurt', 'weed50', 'frankfurt')).toBe(
      Math.round(packagePrice(sim.state, 'frankfurt', 'weed50', 'koeln') * 0.9),
    );
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'halle-osthafen' } }).ok).toBe(true);
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } }).ok,
    ).toBe(true);
    const s = sim.state.modules.suppliers.shipments[0];
    expect(s.warehouseId).toBe('halle-osthafen');
    expect(s.arrivesAt - s.orderedAt).toBeLessThanOrEqual(60 * 2);
    sim.advance(s.arrivesAt - sim.state.time + 1);
    expect(getStock(sim.state, { cityId: 'frankfurt', productId: 'weed' })).toBe(50);
  });

  it('Kofi am Flughafen: nur in Frankfurt, klein, schnell, teuer, beste Ware, Luftfracht mit scharfem Zoll', () => {
    const sim = inFrankfurt();
    const kofi = getSupplier(sim.state, 'flughafen');
    if (!kofi) throw new Error('kein Kofi');
    expect(getSuppliers(sim.state, 'koeln').map((s) => s.id)).not.toContain('flughafen');
    // Zu Hause in Frankfurt (Supplier.home): Kofi und Toni melden sich, sobald Frankfurt frei ist.
    expect(messages.thread(sim.state, 'supplier:flughafen').some((m) => m.text.includes('Cargo City'))).toBe(true);
    expect(messages.thread(sim.state, 'supplier:frankfurt').some((m) => m.text.includes('zu Hause'))).toBe(true);
    expect(getSuppliers(sim.state, 'frankfurt').map((s) => s.id)).toContain('flughafen');
    const toni = supplierIn(getSupplier(sim.state, 'frankfurt') ?? kofi, 'frankfurt');
    expect(kofi.deliveryTime).toBeLessThan(60);
    expect(kofi.priceLevel).toBeGreaterThan(toni.priceLevel);
    expect(kofi.quality).toBeGreaterThan(Math.max(...getSuppliers(sim.state, 'koeln').map((s) => s.quality)));
    expect(Math.max(...kofi.packages.map((p) => p.amount))).toBeLessThanOrEqual(50);
    expect(routeKindOf(kofi, 'frankfurt')).toBe('air');
    // Der Zoll greift öfter zu als bei einem Kurier mit derselben Zuverlässigkeit.
    const plain = { ...kofi, customs: 0 };
    const seized = (s: typeof kofi) =>
      Array.from({ length: 1000 }, (_, i) => rollShipmentProblem(i / 1000, s, 50)).filter((p) => p === 'seized').length;
    expect(seized(kofi)).toBeGreaterThan(seized(plain) + 30);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'halle-cargo-city' } }).ok).toBe(true);
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'flughafen', packageId: 'kush25' } }).ok,
    ).toBe(true);
  });

  it('Geldwäsche: Wo du in Frankfurt bist, nehmen alle Wege anderthalbmal so viel auf einmal', () => {
    const sim = createTestGame();
    const kiosk = getChannel('kiosk');
    const salon = getChannel('laundromat');
    expect(channelCapacity(sim.state, 'kiosk')).toBe(kiosk.capacity);
    const before = launderingCapacity(sim.state);
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'frankfurt' } }, { actor: 'system' }).ok).toBe(true);
    // Nur anschauen reicht nicht: Der Faktor hängt an der Stadt, in der du bist.
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'frankfurt' } }).ok).toBe(true);
    expect(channelCapacity(sim.state, 'kiosk')).toBe(kiosk.capacity);
    sim.state.modules.city.present = 'frankfurt';
    expect(channelCapacity(sim.state, 'kiosk')).toBe(Math.round(kiosk.capacity * 1.5));
    expect(channelHeatAbove(sim.state, 'laundromat')).toBe(Math.round(salon.heatAbove * 1.5));
    expect(launderingCapacity(sim.state)).toBe(Math.round(before * 1.5));
    sim.state.wallet.dirty = kiosk.capacity * 2;
    const amount = Math.round(kiosk.capacity * 1.4);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount, channel: 'kiosk' } }).ok).toBe(true);
    // Zurück in Köln: Was läuft, läuft weiter; frei ist nichts mehr, aber nie weniger als nichts.
    sim.state.modules.city.present = 'koeln';
    expect(channelCapacity(sim.state, 'kiosk')).toBe(kiosk.capacity);
    expect(channelFree(sim.state, 'kiosk')).toBe(0);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 100, channel: 'kiosk' } }).ok).toBe(false);
  });

  it('Messe und Museumsuferfest: mehr Kundschaft am Main und rund um die Messe', () => {
    const sim = createTestGame();
    const ids = CITY_EVENTS.filter((e) => e.cityId === 'frankfurt').map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['messe', 'museumsuferfest']));
    const spotIds = new Set(getAllSpots(sim.state).map((s) => s.id));
    for (const e of CITY_EVENTS.filter((d) => d.cityId === 'frankfurt')) {
      for (const id of e.area.spots ?? []) expect(spotIds.has(id), `${e.id}: ${id}`).toBe(true);
      for (const id of e.area.veedel ?? []) expect(getVeedel(id)?.cityId, `${e.id}: ${id}`).toBe('frankfurt');
    }
    const fest = CITY_EVENTS.find((e) => e.id === 'museumsuferfest');
    if (fest?.schedule.kind !== 'cycle') throw new Error('kein Museumsuferfest');
    sim.state.time = fest.schedule.firstDay * MINUTES_PER_DAY + 12 * 60;
    expect(isEventActive(fest, sim.state.time)).toBe(true);
    expect(eventFactor(sim.state, 'demand', { spotId: 'museumsufer' })).toBeGreaterThan(2);
    expect(eventFactor(sim.state, 'demand', { spotId: 'museumsufer' })).toBeGreaterThan(
      eventFactor(sim.state, 'demand', { spotId: 'kaiserstrasse' }),
    );
  });

  it('IDs in den Datenlisten sind über alle Städte eindeutig (Stammabnehmer, Lager, Events, Gangs, Spots)', () => {
    const sim = createTestGame();
    const lists: Record<string, readonly string[]> = {
      DEALERS: DEALERS.map((d) => d.id),
      WAREHOUSES: warehouseSites().map((w) => w.id),
      CITY_EVENTS: CITY_EVENTS.map((e) => e.id),
      GANGS: getGangs(sim.state).map((g) => g.id),
      SPOTS: getAllSpots(sim.state).map((s) => s.id),
    };
    for (const [name, ids] of Object.entries(lists)) {
      const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(twice, name).toEqual([]);
    }
  });

  it('alte Spielstände ohne Frankfurt (schon mit Berlin und München gespeichert) bekommen Stadtteile und Gangs wie neu', () => {
    const sim = createTestGame({ seed: 3 });
    const fresh = JSON.parse(JSON.stringify(sim.state));
    const old = JSON.parse(JSON.stringify(sim.state));
    const gangs = old.modules.gangs.gangs as Record<string, unknown>;
    for (const id of Object.keys(gangs)) if (id.startsWith('ff-')) delete gangs[id];
    // Stand nach dem Münchner Merge (gangs 7, territory 6).
    old.moduleVersions.gangs = 7;
    for (const v of allVeedel('frankfurt')) {
      delete old.modules.territory.influence[v.id];
      delete old.modules.territory.controller[v.id];
    }
    old.moduleVersions.territory = 6;
    const loaded = loadSimulation(old as never, sim.modules);
    expect(loaded.state.moduleVersions.gangs).toBe(8);
    expect(loaded.state.moduleVersions.territory).toBe(7);
    for (const id of ['ff-bahnhof', 'ff-westend', 'ff-sachsenhausen', 'ff-hoechst']) {
      expect(getGangStatus(loaded.state, id)?.people, id).toBeGreaterThan(0);
    }
    for (const v of allVeedel('frankfurt')) {
      expect(loaded.state.modules.territory.influence[v.id], v.id).toEqual(fresh.modules.territory.influence[v.id]);
      expect(controllerOf(loaded.state, v.id), v.id).toBe(fresh.modules.territory.controller[v.id]);
    }
    // Köln, Berlin und München bleiben, wie sie waren.
    expect(loaded.state.modules.territory.influence.kalk).toEqual(fresh.modules.territory.influence.kalk);
    expect(loaded.state.modules.territory.influence.kreuzberg).toEqual(fresh.modules.territory.influence.kreuzberg);
  });

  it('gleicher Seed, gleiche Befehle: Frankfurt spielt sich gleich', () => {
    const run = () => {
      const sim = inFrankfurt(7);
      sim.state.modules.customers.directOrders = true;
      for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt))
        sim.state.modules.customers.nextSpawnAt[key] = 0;
      sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'keller-bahnhofsviertel' } });
      sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'kaiserstrasse' } });
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'flughafen', packageId: 'kush25' } });
      sim.advance(2 * MINUTES_PER_DAY);
      return JSON.stringify(sim.state);
    };
    expect(run()).toBe(run());
  });
});
