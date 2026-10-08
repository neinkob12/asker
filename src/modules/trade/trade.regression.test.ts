// Regressionstests zum Bugreview (Paket trade-grow): Deckladung bei Teilkisten, Lkw nur ab Rotterdam, Untergrenze für
// Gegenangebote.

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { playableCities } from '../city';
import { freeVehicles, getVehicle } from '../fleet';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { containerCost, getDeliveries, getShipments, loadCost, openItems, openOrders, type TradeOrder } from './index';
import { DISPATCH_EVERY } from './plans';

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

describe('Deckladung eigener Ware nach den echten Gramm des Containers', () => {
  it('der zweite, nur teilweise volle Container zahlt die Deckladung auf seine 10 kg, nicht auf 120 kg', () => {
    const sim = soldGame(3);
    sim.state.wallet.dirty = 5_000_000;
    sim.state.modules.trade.origins['own-kolumbien'] = { weed: { amount: 130_000, quality: 0.8, pack: 0.6 } };
    const load = [{ productId: 'weed', size: 'full' as const, cover: 'bananas' as const, count: 2 }];
    const full = containerCost('own-kolumbien', 'weed', 'full', 'bananas', false, 120_000);
    const part = containerCost('own-kolumbien', 'weed', 'full', 'bananas', false, 10_000);
    expect(part.cover).toBeLessThan(full.cover);
    expect(part.cover).toBeGreaterThan(0);
    const expected = full.goods + full.freight + full.cover + part.goods + part.freight + part.cover;
    // Die Oberfläche rechnet mit dem Bestand dieselbe Summe; ohne Bestand (fremde Ware) bleibt es die volle Größe.
    expect(loadCost('own-kolumbien', load, false, { weed: 130_000 })).toBe(expected);
    expect(loadCost('own-kolumbien', load, false)).toBe(2 * (full.goods + full.freight + full.cover));
    const dirty = sim.state.wallet.dirty;
    const buy = sim.dispatch({
      type: 'trade.buy',
      payload: { producerId: 'own-kolumbien', productId: 'weed', size: 'full', cover: 'bananas', count: 2 },
    });
    expect(buy.ok).toBe(true);
    expect(dirty - sim.state.wallet.dirty).toBe(expected);
    const amounts = getShipments(sim.state)
      .filter((x) => x.producerId === 'own-kolumbien')
      .map((x) => x.amount);
    expect(amounts).toEqual([120_000, 10_000]);
  });

  it('fremde Ware kostet wie bisher den vollen Container', () => {
    const sim = soldGame(3);
    sim.state.wallet.dirty = 5_000_000;
    const one = containerCost('spanien', 'weed', 'medium', 'bananas');
    const dirty = sim.state.wallet.dirty;
    const buy = sim.dispatch({
      type: 'trade.buy',
      payload: { producerId: 'spanien', productId: 'weed', size: 'medium', cover: 'bananas', count: 2 },
    });
    expect(buy.ok).toBe(true);
    expect(dirty - sim.state.wallet.dirty).toBe(2 * (one.goods + one.freight + one.cover));
  });
});

/** Eine Bestellung annehmen und ihre Ware nur in den Hamburger Hafen legen. */
function orderInHamburg(sim: Simulation): TradeOrder {
  const order = openOrders(sim.state)[0];
  if (!order) throw new Error('keine Bestellung');
  expect(sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'accept' } }).ok).toBe(true);
  const s = sim.state.modules.trade;
  s.stock.rotterdam = {};
  s.stock.hamburg = {};
  for (const item of openItems(order)) s.stock.hamburg[item.productId] = { amount: item.amount, quality: 0.8 };
  return order;
}

describe('Lkw aus Rotterdam fährt nicht ab einem anderen Hafen', () => {
  function withTruckAndHamburg(seed: number): { sim: Simulation; truckId: number } {
    const sim = soldGame(seed);
    sim.state.wallet.clean = 1_000_000;
    sim.state.wallet.dirty = 1_000_000;
    expect(sim.dispatch({ type: 'trade.rentBerth', payload: { portId: 'hamburg' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'truck', cityId: 'rotterdam' } }).ok).toBe(true);
    const truck = freeVehicles(sim.state, 'rotterdam').find((v) => v.model === 'truck');
    if (!truck) throw new Error('kein Lkw');
    return { sim, truckId: truck.id };
  }

  it('ab Hamburg lehnt trade.deliver den Rotterdamer Lkw ab, die Spedition fährt', () => {
    const { sim, truckId } = withTruckAndHamburg(4);
    const order = orderInHamburg(sim);
    const withTruck = sim.dispatch({
      type: 'trade.deliver',
      payload: { orderId: order.id, portId: 'hamburg', vehicleId: truckId },
    });
    expect(withTruck.ok).toBe(false);
    expect(getVehicle(sim.state, truckId)?.tripId).toBeNull();
    expect(getDeliveries(sim.state)).toHaveLength(0);
    expect(sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id, portId: 'hamburg' } }).ok).toBe(true);
    expect(getDeliveries(sim.state).map((d) => [d.portId, d.vehicleId])).toEqual([['hamburg', null]]);
  });

  it('Fenna mit Plan „Lkw, sonst Spedition“ schickt ab Hamburg die Spedition', () => {
    const { sim, truckId } = withTruckAndHamburg(5);
    orderInHamburg(sim);
    expect(sim.dispatch({ type: 'trade.setPlan', payload: { plan: { deliver: 'truck' } } }).ok).toBe(true);
    sim.advance(2 * DISPATCH_EVERY);
    const deliveries = getDeliveries(sim.state);
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((d) => d.portId === 'hamburg' && d.vehicleId === null)).toBe(true);
    expect(getVehicle(sim.state, truckId)?.tripId).toBeNull();
  });
});

describe('Gegenangebot nicht unter ihrem Angebot', () => {
  it('ein Faktor unter 1 wird abgelehnt, die Bestellung bleibt offen', () => {
    const sim = soldGame(6);
    const order = openOrders(sim.state).find((o) => !o.guaranteed);
    if (!order) throw new Error('keine Bestellung ohne Vertrag');
    const before = order.factor;
    const low = sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'counter', factor: 0.01 } });
    expect(low.ok).toBe(false);
    const after = sim.state.modules.trade.orders.find((o) => o.id === order.id);
    expect(after?.status).toBe('open');
    expect(after?.factor).toBe(before);
    // Über ihrem Angebot geht es wie bisher (angenommen oder an die Konkurrenz verloren).
    const up = sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'counter', factor: 1.05 } });
    expect(up.ok).toBe(true);
  });
});
