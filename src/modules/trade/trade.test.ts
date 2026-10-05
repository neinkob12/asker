// Hafen-Phase (Auftrag 40): Kunden nach dem Verkauf, Bestellungen mit Konkurrenz, Abnahmevertrag, Auslieferung,
// Container mit Zollkontrolle und Zoll-Heat pro Hafen.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { playableCities } from '../city';
import { activeEncounters, autoResolveEncounter } from '../encounters';
import { customsHeat } from '../police';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { CONTRACT_SHARE, START_STOCK } from './config';
import { FOREIGN_CITIES } from './data';
import {
  containerRisk,
  getCustomers,
  getOrders,
  isTradeActive,
  maxFactor,
  openOrders,
  orderCoverage,
  ownedPorts,
  playerScore,
  portStock,
  shareFor,
  totalStock,
  tradeStats,
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

describe('Hafen-Phase: Start (Auftrag 40)', () => {
  it('vor dem Verkauf ruht alles; danach Kunden, Halle in Rotterdam und die ersten Bestellungen', () => {
    const before = createTestGame({ seed: 1 });
    expect(isTradeActive(before.state)).toBe(false);
    expect(
      before.dispatch({ type: 'trade.buy', payload: { producerId: 'spanien', productId: 'weed', size: 'small' } }).ok,
    ).toBe(false);
    const sim = soldGame();
    expect(isTradeActive(sim.state)).toBe(true);
    const customers = getCustomers(sim.state);
    const cities = playableCities().length;
    expect(customers.filter((c) => c.kind === 'org')).toHaveLength(cities);
    expect(customers.filter((c) => c.kind === 'gang')).toHaveLength(cities);
    expect(customers.filter((c) => c.kind === 'city')).toHaveLength(FOREIGN_CITIES.length);
    expect(ownedPorts(sim.state)).toEqual(['rotterdam']);
    expect(totalStock(sim.state, 'weed')).toBe(START_STOCK.weed);
    // Bei der Ankunft kommen die ersten Bestellungen; die alten Organisationen mit Abnahmevertrag.
    const open = openOrders(sim.state);
    expect(open.length).toBeGreaterThan(0);
    const guaranteed = open.filter((o) => o.guaranteed);
    expect(guaranteed.length).toBeGreaterThan(0);
    expect(guaranteed.every((o) => o.customerId.startsWith('org:'))).toBe(true);
    for (const c of customers.filter((x) => x.kind === 'org')) expect(c.share).toBeGreaterThanOrEqual(CONTRACT_SHARE);
  });
});

describe('Hafen-Phase: Bestellungen und Auslieferung', () => {
  it('annehmen, ausliefern, bezahlt bei Ankunft, Vertrauen steigt', () => {
    const sim = soldGame(2);
    const events = recordEvents(sim);
    const order = openOrders(sim.state).find((o) =>
      o.items.every((i) => (START_STOCK as Record<string, number>)[i.productId] >= i.amount),
    );
    if (!order) throw new Error('keine passende Bestellung');
    const customer = getCustomers(sim.state).find((c) => c.id === order.customerId);
    const trust = customer?.trust ?? 0;
    expect(sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'accept' } }).ok).toBe(true);
    const money = sim.state.wallet.dirty;
    const sent = sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id } });
    expect(sent.ok).toBe(true);
    for (const item of order.items) {
      expect(portStock(sim.state, 'rotterdam')[item.productId]?.amount ?? 0).toBe(
        (START_STOCK as Record<string, number>)[item.productId] - item.amount,
      );
    }
    sim.advance(DAY);
    const done = getOrders(sim.state).find((o) => o.id === order.id);
    const seized = eventsOfType(events, 'trade.deliverySeized').length > 0;
    const tipped = eventsOfType(events, 'trade.dealTipped').length > 0;
    if (!seized && !tipped) {
      expect(done?.status).toBe('delivered');
      const freight = money - sim.state.wallet.dirty + (done?.revenue ?? 0);
      expect(freight).toBeGreaterThan(0);
      expect(eventsOfType(events, 'trade.delivered')).toHaveLength(1);
      expect(getCustomers(sim.state).find((c) => c.id === order.customerId)?.trust).toBeGreaterThan(trust);
      expect(tradeStats(sim.state).revenue).toBe(done?.revenue);
    }
  });

  it('Gegenangebot: über der Preisgrenze geht nicht; ist die Konkurrenz besser, ist der Auftrag weg', () => {
    const sim = soldGame(3);
    const order = openOrders(sim.state).find((o) => !o.guaranteed);
    if (!order) throw new Error('keine freie Bestellung');
    const over = sim.dispatch({
      type: 'trade.answer',
      payload: { orderId: order.id, choice: 'counter', factor: maxFactor(order) + 0.05 },
    });
    expect(over.ok).toBe(false);
    // Schlechter Ruf: Die Konkurrenz liegt vorn.
    sim.state.modules.trade.reliability = 0.1;
    sim.state.modules.trade.quality = 0.1;
    const result = sim.dispatch({
      type: 'trade.answer',
      payload: { orderId: order.id, choice: 'counter', factor: maxFactor(order) },
    });
    expect(result.ok).toBe(true);
    expect(getOrders(sim.state).find((o) => o.id === order.id)?.status).toBe('lost');
    expect(getOrders(sim.state).find((o) => o.id === order.id)?.lostTo).toBeTruthy();
  });

  it('dein Anteil sinkt mit dem Preis und steigt mit dem Ruf', () => {
    const sim = soldGame(4);
    const customer = getCustomers(sim.state).find((c) => c.kind === 'city');
    if (!customer) throw new Error('kein Kunde');
    const week = weekOf(sim.state.time);
    expect(shareFor(sim.state, customer, week, 0.9).share).toBeGreaterThan(
      shareFor(sim.state, customer, week, 1.2).share,
    );
    const low = playerScore(sim.state, customer, 1);
    sim.state.modules.trade.reliability = 1;
    expect(playerScore(sim.state, customer, 1)).toBeGreaterThan(low);
  });

  it('eine Bestellung pro Kunde mit allen Waren; „Alle annehmen“', () => {
    const sim = soldGame(11);
    const open = openOrders(sim.state);
    expect(new Set(open.map((o) => o.customerId)).size).toBe(open.length);
    expect(open.some((o) => o.items.length > 1)).toBe(true);
    for (const o of open) expect(o.amount).toBe(o.items.reduce((s, i) => s + i.amount, 0));
    expect(sim.dispatch({ type: 'trade.acceptAll', payload: { guaranteedOnly: true } }).ok).toBe(true);
    expect(openOrders(sim.state).every((o) => !o.guaranteed)).toBe(true);
    expect(sim.dispatch({ type: 'trade.acceptAll', payload: {} }).ok).toBe(true);
    expect(openOrders(sim.state)).toHaveLength(0);
  });

  it('Teillieferung: was im Hafen liegt, fährt los; der Rest bleibt offen, bezahlt wird pro Lieferung', () => {
    const sim = soldGame(12);
    const order = openOrders(sim.state).find((o) => o.items.length > 1);
    if (!order) throw new Error('keine Bestellung mit mehreren Waren');
    sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'accept' } });
    // Nur die erste Ware liegt im Hafen.
    const stock = sim.state.modules.trade.stock.rotterdam;
    for (const id of Object.keys(stock)) delete stock[id];
    const first = order.items[0];
    stock[first.productId] = { amount: first.amount, quality: 0.7 };
    expect(sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id } }).ok).toBe(true);
    const after = getOrders(sim.state).find((o) => o.id === order.id);
    expect(after?.status).toBe('accepted');
    expect(after?.items.filter((i) => i.state === 'shipped')).toHaveLength(1);
    expect(sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id } }).ok).toBe(false);
    sim.advance(DAY);
    const paid = getOrders(sim.state).find((o) => o.id === order.id);
    if (paid?.items[0].state === 'delivered') {
      expect(paid.revenue).toBe(Math.round(first.amount * first.offer));
      expect(paid.status).toBe('accepted');
    }
  });

  it('Abdeckung: „Ware da“ zählt Bestand und Container vor der Frist; „Gedeckte annehmen“ nimmt nur diese', () => {
    const sim = soldGame(3);
    const open = openOrders(sim.state);
    expect(open.length).toBeGreaterThan(1);
    const stock = sim.state.modules.trade.stock.rotterdam;
    for (const id of Object.keys(stock)) delete stock[id];
    expect([...orderCoverage(sim.state).values()].every((m) => m > 0)).toBe(true);
    // Genau die Ware für die erste Bestellung, die Hälfte davon als Container vor der Frist.
    const first = open[0];
    for (const item of first.items) {
      stock[item.productId] = { amount: Math.ceil(item.amount / 2), quality: 0.7 };
      sim.state.modules.trade.shipments.push({
        id: 9000 + sim.state.modules.trade.shipments.length,
        producerId: 'jansen',
        productId: item.productId,
        amount: Math.ceil(item.amount / 2),
        quality: 0.7,
        size: 'small',
        portId: 'rotterdam',
        orderedAt: sim.state.time,
        arrivesAt: first.dueAt - 60,
        status: 'sea',
        cover: 'none',
        vesselId: null,
      });
    }
    const coverage = orderCoverage(sim.state);
    expect(coverage.get(first.id)).toBe(0);
    const accepted = sim.dispatch({ type: 'trade.acceptAll', payload: { coveredOnly: true } });
    expect(accepted.ok).toBe(true);
    const after = getOrders(sim.state);
    for (const o of open) {
      expect(after.find((x) => x.id === o.id)?.status === 'open').toBe(coverage.get(o.id) !== 0);
    }
  });

  it('keine doppelte Strafe: Beschlagnahme nach der geplatzten Frist und Ladung nach gekipptem Deal', () => {
    const sim = soldGame(12);
    const events = recordEvents(sim);
    const order = openOrders(sim.state).find((o) => o.items.length > 1);
    if (!order) throw new Error('keine Bestellung mit mehreren Waren');
    sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'accept' } });
    const stock = sim.state.modules.trade.stock.rotterdam;
    const first = order.items[0];
    let seized = false;
    for (let i = 0; i < 40 && !seized; i++) {
      for (const id of Object.keys(stock)) delete stock[id];
      stock[first.productId] = { amount: first.amount, quality: 0.7 };
      const live = getOrders(sim.state).find((o) => o.id === order.id);
      if (!live) throw new Error('Bestellung weg');
      for (const item of live.items) delete item.state;
      live.status = 'accepted';
      live.dueAt = sim.state.time + DAY;
      sim.state.modules.trade.deliveries = [];
      expect(sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id } }).ok).toBe(true);
      // Frist plus Gnadenfrist vorbei, während die Ladung unterwegs ist: geplatzt, Teil unterwegs.
      live.dueAt = sim.state.time - 3 * DAY;
      const delivery = sim.state.modules.trade.deliveries[0];
      delivery.arrivesAt = sim.state.time + 10 * DAY;
      delivery.checkAt = sim.state.time + 2;
      sim.advance(5);
      seized = eventsOfType(events, 'trade.deliverySeized').length > 0;
      if (!seized) events.length = 0;
    }
    expect(seized).toBe(true);
    sim.advance(DAY);
    const failed = eventsOfType(events, 'trade.orderFailed').filter((e) => e.payload.orderId === order.id);
    expect(failed).toHaveLength(1);
    expect(getOrders(sim.state).find((o) => o.id === order.id)?.status).toBe('failed');

    // Gekippter Deal: eine zweite Ladung ändert die Bestellung nicht mehr, die Ware kommt zurück.
    const live = getOrders(sim.state).find((o) => o.id === order.id);
    if (!live) throw new Error('Bestellung weg');
    for (const item of live.items) delete item.state;
    live.status = 'accepted';
    live.dueAt = sim.state.time + 5 * DAY;
    for (const id of Object.keys(stock)) delete stock[id];
    stock[first.productId] = { amount: first.amount, quality: 0.7 };
    expect(sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id } }).ok).toBe(true);
    const delivery = sim.state.modules.trade.deliveries[0];
    delivery.checkAt = null;
    live.status = 'failed';
    for (const item of live.items) if (item.state !== 'shipped') item.state = 'missed';
    const before = JSON.stringify(live);
    sim.advance(delivery.arrivesAt - sim.state.time + 5);
    expect(JSON.stringify(getOrders(sim.state).find((o) => o.id === order.id))).toBe(before);
    expect(portStock(sim.state, 'rotterdam')[first.productId]?.amount).toBe(first.amount);
  });

  it('nicht angenommen: die Bestellung verfällt; montags kommen neue', () => {
    const sim = soldGame(5);
    const events = recordEvents(sim);
    const first = openOrders(sim.state).length;
    expect(first).toBeGreaterThan(0);
    sim.advance(8 * DAY);
    expect(
      eventsOfType(events, 'trade.orderFailed').filter((e) => e.payload.reason === 'expired').length,
    ).toBeGreaterThanOrEqual(first);
    expect(eventsOfType(events, 'trade.orderPlaced').length).toBeGreaterThan(0);
  });
});

describe('Hafen-Phase: Container und Zoll', () => {
  it('Container kommt nach der Laufzeit an, mit oder ohne Zollkontrolle; der Zoll-Heat steigt', () => {
    const sim = soldGame(6);
    const events = recordEvents(sim);
    sim.state.wallet.dirty += 500_000;
    const risk = containerRisk(sim.state, 'spanien', 'medium', 'rotterdam');
    expect(risk).toBeGreaterThan(0);
    expect(containerRisk(sim.state, 'spanien', 'small', 'rotterdam')).toBeLessThan(risk);
    const before = totalStock(sim.state, 'weed');
    const bought = sim.dispatch({
      type: 'trade.buy',
      payload: { producerId: 'spanien', productId: 'weed', size: 'medium' },
    });
    expect(bought.ok).toBe(true);
    sim.advance(5 * DAY);
    for (const e of activeEncounters(sim.state)) autoResolveEncounter(sim.ctx('test'), e.id);
    sim.advance(10);
    const arrived = eventsOfType(events, 'trade.containerArrived').length;
    const seized = eventsOfType(events, 'trade.containerSeized').length;
    expect(arrived + seized).toBe(1);
    if (arrived) expect(totalStock(sim.state, 'weed')).toBeGreaterThan(before);
    else expect(tradeStats(sim.state).seized).toBe(1);
    expect(customsHeat(sim.state, 'rotterdam')).toBeGreaterThan(0);
  });

  it('Zoll in Rotterdam: du stehst selbst am Kai und entscheidest; in Antwerpen regeln es die Hafenarbeiter', () => {
    const sim = soldGame(9);
    sim.state.wallet.dirty += 5_000_000;
    sim.state.wallet.clean += 500_000;
    expect(sim.dispatch({ type: 'trade.rentBerth', payload: { portId: 'antwerpen' } }).ok).toBe(true);
    // Viel Zoll-Heat: fast jeder Container wird kontrolliert.
    sim.state.modules.police.customs = { rotterdam: 100, antwerpen: 100 };
    const events = recordEvents(sim);
    // Zehn große Container nach Rotterdam (mindestens einer wird kontrolliert), zwei kleine nach Antwerpen.
    const ports = [...Array(10).fill('rotterdam'), 'antwerpen', 'antwerpen'];
    for (const portId of ports) {
      const size = portId === 'rotterdam' ? ('full' as const) : ('small' as const);
      const payload = { producerId: 'spanien', productId: 'weed', size, portId };
      expect(sim.dispatch({ type: 'trade.buy', payload })).toEqual({ ok: true, data: expect.anything() });
    }
    let seen = 0;
    for (let i = 0; i < 10 * 24; i++) {
      sim.advance(60);
      for (const e of activeEncounters(sim.state)) {
        if (e.kind !== 'customsCheck' || e.phase === 'done') continue;
        // Nie mehr „Niemand von euch war da“: Du bist dabei und hast die Handlungen am Kai.
        expect(e.playerPresent).toBe(true);
        expect(e.phase).toBe('rounds');
        seen++;
        autoResolveEncounter(sim.ctx('test'), e.id);
      }
    }
    expect(seen).toBeGreaterThan(0);
    // Antwerpen ohne Konfrontation, aber mit Ergebnis (durch oder weg).
    const antwerp = (type: 'trade.containerArrived' | 'trade.containerSeized') =>
      eventsOfType(events, type).filter((e) => e.payload.portId === 'antwerpen').length;
    expect(antwerp('trade.containerArrived') + antwerp('trade.containerSeized')).toBe(2);
    expect(activeEncounters(sim.state).filter((e) => e.phase !== 'done')).toEqual([]);
  });

  it('weitere Häfen kosten sauberes Geld', () => {
    const sim = soldGame(7);
    sim.state.wallet.clean = 0;
    expect(sim.dispatch({ type: 'trade.rentBerth', payload: { portId: 'antwerpen' } }).ok).toBe(false);
    sim.state.wallet.clean = 200_000;
    expect(sim.dispatch({ type: 'trade.rentBerth', payload: { portId: 'antwerpen' } }).ok).toBe(true);
    expect(ownedPorts(sim.state)).toContain('antwerpen');
  });

  it('der Lkw ist nur in der Hafen-Phase zu haben', () => {
    const before = createTestGame({ seed: 8 });
    before.state.wallet.clean = 200_000;
    expect(before.dispatch({ type: 'fleet.buy', payload: { model: 'truck' } }).ok).toBe(false);
    const sim = soldGame(8);
    sim.state.wallet.clean = 200_000;
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'truck', cityId: 'rotterdam' } }).ok).toBe(true);
  });
});

describe('Hafen-Phase: Determinismus und Spielstände', () => {
  it('gleicher Seed, gleiche Bestellungen', () => {
    const a = soldGame(9);
    const b = soldGame(9);
    a.advance(9 * DAY);
    b.advance(9 * DAY);
    expect(getOrders(a.state)).toEqual(getOrders(b.state));
  });

  it('alte Spielstände ohne Zoll-Heat laden (police Version 6)', () => {
    const sim = createTestGame({ seed: 10 });
    const raw = JSON.parse(JSON.stringify(sim.state));
    delete raw.modules.police.customs;
    raw.moduleVersions.police = 5;
    delete raw.modules.trade;
    delete raw.moduleVersions.trade;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.police.customs).toEqual({});
    expect(isTradeActive(loaded.state)).toBe(false);
  });
});
