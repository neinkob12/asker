// Auftrag 41: Seewege, Hafen-Lager mit Platz, Schiffe, Deckladung und Europa-Kunden.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { playableCities } from '../city';
import { activeEncounters, autoResolveEncounter } from '../encounters';
import { freeVehicles, getVehicle, vehicleStatus } from '../fleet';
import { harborPort } from '../logistics';
import { seaRoute } from '../roads';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { CHARTER_KM_PER_DAY, EUROPE_MIN_RELIABILITY, MAX_HALLS, QUAY_FEE_PER_DAY } from './config';
import { EUROPE_CITIES } from './data';
import {
  containerCost,
  containerRisk,
  customerContact,
  customerOffer,
  deliveryEstimate,
  europeStatus,
  getCustomers,
  getShipments,
  openOrders,
  ownShips,
  portCapacity,
  portLoad,
  portRoom,
  shipmentPath,
  shippingMinutes,
  shipVoyage,
  totalStock,
  tradeStats,
  voyagePlan,
  weekOf,
} from './index';

const DAY = 1440;

/** Ganz Deutschland, verkauft und in Rotterdam angekommen; Kundschaft in den Städten aus. */
function soldGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  const ctx = sim.ctx('test');
  for (const city of playableCities()) {
    if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
    for (const v of allVeedel(city.id)) {
      for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
      addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    }
  }
  sim.advance(60);
  sim.state.modules.city.sale = { status: 'calling', callAt: null, sold: null };
  const sold = sim.dispatch({ type: 'city.sell', payload: {} });
  if (!sold.ok) throw new Error(sold.reason);
  while (sim.state.modules.city.travel) sim.advance(30);
  return sim;
}

/** Zollkontrollen sofort entscheiden, bis nichts mehr offen ist. */
function settle(sim: Simulation, minutes: number): void {
  for (let t = 0; t < minutes; t += 60) {
    sim.advance(60);
    for (const e of activeEncounters(sim.state)) autoResolveEncounter(sim.ctx('test'), e.id);
  }
}

describe('Seewege in der Hafen-Phase (Auftrag 41, Etappe 1)', () => {
  it('die Laufzeit kommt aus dem echten Seeweg: Albanien durchs Mittelmeer, Hamburg weiter als Rotterdam', () => {
    const spain = shippingMinutes('spanien', 'rotterdam');
    const km = seaRoute('algeciras', 'rotterdam')?.km ?? 0;
    expect(spain).toBe(Math.round((1 + km / CHARTER_KM_PER_DAY) * DAY));
    expect(shippingMinutes('albanien', 'rotterdam')).toBeGreaterThan(spain + 3 * DAY);
    expect(shippingMinutes('spanien', 'hamburg')).toBeGreaterThan(spain);
    // Per Lkw: die Tage des Produzenten.
    expect(shippingMinutes('westland', 'rotterdam')).toBe(DAY);
    // Auf der Karte fährt der Container den Seeweg bis an den Liegeplatz.
    const path = shipmentPath({ producerId: 'marokko', portId: 'antwerpen' });
    expect(path.length).toBeGreaterThan(20);
    expect(path[0].lng).toBeLessThan(-5);
    expect(path[path.length - 1].lng).toBeCloseTo(4.29, 1);
  });
});

describe('Hafen-Lager mit Platz (Auftrag 41, Etappe 1)', () => {
  it('ist das Lager voll, wartet der Rest am Kai; mit einer Halle kommt er herein, Liegegeld wird fällig', () => {
    const sim = soldGame(21);
    const events = recordEvents(sim);
    sim.state.wallet.dirty += 1_000_000;
    const capacity = portCapacity(sim.state, 'rotterdam');
    expect(capacity).toBe(harborPort('rotterdam')?.capacity);
    // Lager bis auf 8 kg voll.
    const stock = sim.state.modules.trade.stock.rotterdam;
    stock.hash = {
      amount: capacity - portLoad(sim.state, 'rotterdam') + (stock.hash?.amount ?? 0) - 8000,
      quality: 0.6,
    };
    expect(portRoom(sim.state, 'rotterdam')).toBe(8000);
    const weed = totalStock(sim.state, 'weed');
    expect(
      sim.dispatch({ type: 'trade.buy', payload: { producerId: 'jansen', productId: 'weed', size: 'small' } }).ok,
    ).toBe(true);
    settle(sim, DAY + 120);
    if (eventsOfType(events, 'trade.containerSeized').length > 0) return; // Zoll war schneller
    expect(totalStock(sim.state, 'weed')).toBe(weed + 8000);
    expect(portRoom(sim.state, 'rotterdam')).toBe(0);
    const waiting = getShipments(sim.state).find((x) => x.status === 'quay');
    expect(waiting?.amount).toBe(12_000);
    expect(eventsOfType(events, 'trade.containerWaiting')).toHaveLength(1);
    // Eine Halle: sauberes Geld, dann kommt der Rest herein und das Liegegeld ist fällig.
    sim.state.wallet.clean = 0;
    expect(sim.dispatch({ type: 'trade.buildHall', payload: { portId: 'rotterdam' } }).ok).toBe(false);
    sim.state.wallet.clean = 1_000_000;
    sim.advance(DAY);
    const clean = sim.state.wallet.clean;
    expect(sim.dispatch({ type: 'trade.buildHall', payload: { portId: 'rotterdam' } }).ok).toBe(true);
    expect(portCapacity(sim.state, 'rotterdam')).toBe(capacity + (harborPort('rotterdam')?.hallCapacity ?? 0));
    expect(getShipments(sim.state).some((x) => x.status === 'quay')).toBe(false);
    expect(totalStock(sim.state, 'weed')).toBe(weed + 20_000);
    // Halle und Liegegeld sind legal: sauberes Geld.
    expect(clean - sim.state.wallet.clean).toBeGreaterThanOrEqual(
      (harborPort('rotterdam')?.hallCost ?? 0) + QUAY_FEE_PER_DAY,
    );
    for (let i = 1; i < MAX_HALLS; i++) {
      expect(sim.dispatch({ type: 'trade.buildHall', payload: { portId: 'rotterdam' } }).ok).toBe(true);
    }
    expect(sim.dispatch({ type: 'trade.buildHall', payload: { portId: 'rotterdam' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'trade.buildHall', payload: { portId: 'hamburg' } }).ok).toBe(false);
  }, 30_000);

  it('alte Spielstände der Hafen-Phase laden (trade Version 2: Hallen, Container mit Deckladung und Schiff)', () => {
    const sim = soldGame(22);
    const raw = JSON.parse(JSON.stringify(sim.state));
    delete raw.modules.trade.halls;
    delete raw.modules.trade.stats.voyages;
    raw.modules.trade.shipments = [
      {
        id: 9901,
        producerId: 'spanien',
        productId: 'weed',
        amount: 20_000,
        quality: 0.66,
        size: 'small',
        portId: 'rotterdam',
        orderedAt: sim.state.time,
        arrivesAt: sim.state.time + DAY,
        status: 'sea',
      },
    ];
    raw.moduleVersions.trade = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.trade.halls).toEqual({});
    expect(loaded.state.modules.trade.shipments[0]).toMatchObject({ id: 9901, cover: 'none', vesselId: null });
    expect(loaded.state.modules.trade.stats.voyages).toBe(0);
    expect(portCapacity(loaded.state, 'rotterdam')).toBe(harborPort('rotterdam')?.capacity);
    expect(loaded.state.modules.trade.customers).toEqual(sim.state.modules.trade.customers);
  }, 30_000);
});

describe('Deckladung und eigene Schiffe (Auftrag 41, Etappe 2)', () => {
  it('Deckladung: teurer ist sicherer; Charter mit mehreren Containern auf einmal', () => {
    const sim = soldGame(23);
    sim.state.wallet.dirty += 2_000_000;
    const none = containerRisk(sim.state, 'marokko', 'full', 'rotterdam');
    const tiles = containerRisk(sim.state, 'marokko', 'full', 'rotterdam', 'tiles');
    const bananas = containerRisk(sim.state, 'marokko', 'full', 'rotterdam', 'bananas');
    expect(tiles).toBeLessThan(none);
    expect(bananas).toBeLessThan(tiles);
    const cheap = containerCost('marokko', 'hash', 'full');
    const safe = containerCost('marokko', 'hash', 'full', 'bananas');
    expect(cheap.cover).toBe(0);
    expect(safe.cover).toBeGreaterThan(containerCost('marokko', 'hash', 'full', 'tiles').cover);
    expect(safe.goods).toBe(cheap.goods);
    const money = sim.state.wallet.dirty;
    const bought = sim.dispatch({
      type: 'trade.buy',
      payload: { producerId: 'marokko', productId: 'hash', size: 'full', cover: 'bananas', count: 2 },
    });
    expect(bought.ok).toBe(true);
    const list = getShipments(sim.state).filter((x) => x.producerId === 'marokko');
    expect(list).toHaveLength(2);
    expect(list.every((x) => x.cover === 'bananas' && x.vesselId === null)).toBe(true);
    expect(money - sim.state.wallet.dirty).toBe(2 * (safe.goods + safe.freight + safe.cover));
    expect(
      sim.dispatch({ type: 'trade.buy', payload: { producerId: 'marokko', productId: 'hash', size: 'full', count: 0 } })
        .ok,
    ).toBe(false);
  }, 30_000);

  it('eigenes Schiff: kaufen, zum Produzenten schicken, ohne Fracht zurück, dann wieder frei', () => {
    const sim = soldGame(24);
    const events = recordEvents(sim);
    sim.state.wallet.dirty += 3_000_000;
    sim.state.wallet.clean += 1_000_000;
    const bought = sim.dispatch({ type: 'fleet.buy', payload: { model: 'coaster', cityId: 'rotterdam' } });
    if (!bought.ok) throw new Error(bought.reason);
    const vesselId = (bought.data as { vehicleId: number }).vehicleId;
    expect(ownShips(sim.state).map((x) => x.id)).toEqual([vesselId]);
    // Zu viel für ein Küstenmotorschiff (250 kg).
    const tooMuch = sim.dispatch({
      type: 'trade.sail',
      payload: { vesselId, producerId: 'spanien', load: [{ productId: 'weed', size: 'full', count: 3 }] },
    });
    expect(tooMuch.ok).toBe(false);
    // Westland liefert per Lkw, nicht per Schiff.
    expect(
      sim.dispatch({
        type: 'trade.sail',
        payload: { vesselId, producerId: 'westland', load: [{ productId: 'oil', size: 'small' }] },
      }).ok,
    ).toBe(false);
    const plan = voyagePlan(sim.state, vesselId, 'spanien', 'rotterdam');
    if (!plan) throw new Error('kein Plan');
    expect(plan.minutes).toBeGreaterThan(shippingMinutes('spanien', 'rotterdam'));
    const load = [
      { productId: 'weed', size: 'full' as const, cover: 'tiles' as const },
      { productId: 'haze', size: 'medium' as const },
    ];
    const money = sim.state.wallet.dirty;
    const sent = sim.dispatch({ type: 'trade.sail', payload: { vesselId, producerId: 'spanien', load } });
    expect(sent.ok).toBe(true);
    const weed = containerCost('spanien', 'weed', 'full', 'tiles', true);
    const haze = containerCost('spanien', 'haze', 'medium', 'none', true);
    expect(weed.freight).toBe(0);
    expect(money - sim.state.wallet.dirty).toBe(weed.goods + weed.cover + haze.goods + plan.cost);
    expect(vehicleStatus(getVehicle(sim.state, vesselId) ?? ({} as never))).toBe('busy');
    expect(shipVoyage(sim.state, vesselId)?.phase).toBe('out');
    // Unterwegs geht keine zweite Fahrt.
    expect(sim.dispatch({ type: 'trade.sail', payload: { vesselId, producerId: 'spanien', load } }).ok).toBe(false);
    // Eigenes Schiff fällt dem Zoll weniger auf.
    expect(containerRisk(sim.state, 'spanien', 'full', 'rotterdam', 'none', vesselId)).toBeLessThan(
      containerRisk(sim.state, 'spanien', 'full', 'rotterdam'),
    );
    sim.advance(plan.legMinutes + 60);
    expect(shipVoyage(sim.state, vesselId)?.phase).toBe('loading');
    sim.advance(plan.loadMinutes);
    expect(shipVoyage(sim.state, vesselId)?.phase).toBe('back');
    settle(sim, plan.legMinutes + 120);
    expect(shipVoyage(sim.state, vesselId)).toBeNull();
    expect(vehicleStatus(getVehicle(sim.state, vesselId) ?? ({} as never))).toBe('free');
    expect(eventsOfType(events, 'trade.shipSailed')).toHaveLength(1);
    expect(eventsOfType(events, 'trade.shipReturned')).toHaveLength(1);
    const landed = eventsOfType(events, 'trade.containerArrived').length;
    expect(landed + tradeStats(sim.state).seized).toBe(2);
    // Schiffe fahren keine Lieferungen auf der Straße und stehen nicht unter den freien Straßenfahrzeugen.
    expect(freeVehicles(sim.state, 'rotterdam').some((v) => v.id === vesselId)).toBe(false);
    const order = sim.state.modules.trade.orders.find((o) => o.status === 'open');
    if (order) {
      sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'accept' } });
      const ship = sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id, vehicleId: vesselId } });
      expect(ship.ok ? '' : ship.reason).toBe('Schiffe fahren nicht auf der Straße.');
    }
    // Im Hafen lässt es sich verkaufen.
    expect(sim.dispatch({ type: 'fleet.sell', payload: { vehicleId: vesselId } }).ok).toBe(true);
  }, 30_000);

  it('Schiffe gibt es erst in der Hafen-Phase', () => {
    const sim = createTestGame({ seed: 25 });
    sim.state.wallet.clean = 1_000_000;
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'coaster' } }).ok).toBe(false);
  });
});

describe('Europa-Kunden (Auftrag 41, Etappe 3)', () => {
  /** Bis zum Montag der Woche spulen, in der die Stadt sich meldet (plus Bestellstunde). */
  function untilWeek(sim: Simulation, week: number): void {
    while (weekOf(sim.state.time) < week || sim.state.modules.trade.week < week) sim.advance(6 * 60);
  }

  it('melden sich nach und nach, mit eigenem Kontakt, Preis und Bestellung', () => {
    const sim = soldGame(26);
    const events = recordEvents(sim);
    expect(getCustomers(sim.state).some((c) => c.kind === 'europe')).toBe(false);
    const amsterdam = EUROPE_CITIES.find((c) => c.id === 'amsterdam');
    const zuerich = EUROPE_CITIES.find((c) => c.id === 'zuerich');
    if (!amsterdam || !zuerich) throw new Error('Daten fehlen');
    untilWeek(sim, europeStatus(sim.state, amsterdam).week);
    const joined = getCustomers(sim.state).filter((c) => c.kind === 'europe');
    expect(joined.map((c) => c.europeId)).toContain('amsterdam');
    expect(joined.map((c) => c.europeId)).not.toContain('zuerich');
    expect(eventsOfType(events, 'trade.customerJoined').length).toBe(joined.length);
    const customer = joined.find((c) => c.europeId === 'amsterdam');
    if (!customer) throw new Error('Amsterdam fehlt');
    expect(customerContact(sim.state, customer).name).toBe(amsterdam.contact.name);
    expect(openOrders(sim.state).some((o) => o.customerId === customer.id)).toBe(true);
    // Der Preis kommt aus der Stadt: Zürich zahlt mehr als Amsterdam (gleicher Index).
    const zh = { ...customer, priceFactor: zuerich.priceFactor, indexCity: customer.indexCity };
    expect(customerOffer(sim.state, zh, 'hash')).toBeGreaterThan(customerOffer(sim.state, customer, 'hash'));
    untilWeek(sim, europeStatus(sim.state, zuerich).week);
    expect(getCustomers(sim.state).some((c) => c.europeId === 'zuerich')).toBe(
      sim.state.modules.trade.reliability >= EUROPE_MIN_RELIABILITY,
    );
  }, 60_000);

  it('bei schlechtem Ruf meldet sich niemand', () => {
    const sim = soldGame(27);
    sim.state.modules.trade.reliability = EUROPE_MIN_RELIABILITY - 0.1;
    const amsterdam = EUROPE_CITIES[0];
    untilWeek(sim, europeStatus(sim.state, amsterdam).week);
    expect(getCustomers(sim.state).some((c) => c.kind === 'europe')).toBe(false);
    expect(europeStatus(sim.state, amsterdam).reliable).toBe(false);
  }, 60_000);

  it('der Lkw fährt über die Autobahn ins Ausland; vom nächsten Hafen ist es kürzer', () => {
    const at = (id: string) => {
      const city = EUROPE_CITIES.find((c) => c.id === id);
      if (!city) throw new Error(id);
      return { lng: city.at.lng, lat: city.at.lat } as Parameters<typeof deliveryEstimate>[0];
    };
    expect(deliveryEstimate(at('paris'), 'antwerpen').km).toBeLessThan(deliveryEstimate(at('paris'), 'hamburg').km);
    expect(deliveryEstimate(at('kopenhagen'), 'hamburg').km).toBeLessThan(
      deliveryEstimate(at('kopenhagen'), 'rotterdam').km,
    );
    for (const city of EUROPE_CITIES) {
      const km = deliveryEstimate(at(city.id), 'rotterdam').km;
      expect(km, city.id).toBeGreaterThan(50);
      expect(km, city.id).toBeLessThan(1600);
    }
  });
});

describe('Auftrag 41: Determinismus', () => {
  it('gleicher Seed und gleiche Befehle: gleiche Fahrten, Container und Europa-Kunden', () => {
    const run = () => {
      const sim = soldGame(28);
      sim.state.wallet.dirty += 2_000_000;
      sim.state.wallet.clean += 500_000;
      const bought = sim.dispatch({ type: 'fleet.buy', payload: { model: 'coaster', cityId: 'rotterdam' } });
      if (!bought.ok) throw new Error(bought.reason);
      const vesselId = (bought.data as { vehicleId: number }).vehicleId;
      sim.dispatch({
        type: 'trade.sail',
        payload: {
          vesselId,
          producerId: 'marokko',
          load: [{ productId: 'hash', size: 'full', cover: 'tiles', count: 2 }],
        },
      });
      sim.dispatch({
        type: 'trade.buy',
        payload: { producerId: 'spanien', productId: 'weed', size: 'medium', count: 2 },
      });
      settle(sim, 15 * DAY);
      return sim.state.modules.trade;
    };
    const a = run();
    const b = run();
    expect(a.stock).toEqual(b.stock);
    expect(a.customers).toEqual(b.customers);
    expect(a.stats).toEqual(b.stats);
  }, 60_000);
});
