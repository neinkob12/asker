import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock } from '../goods';
import { referencePrice } from '../market';
import { getSpot } from '../spots';
import { CUSTOMER_PATIENCE, MAX_CUSTOMERS_PER_SPOT } from './config';
import { type Customer, canServe, customerRevenue, getSalesStats, waitingAt } from './index';

function addCustomer(sim: Simulation, spotId: string, amount: number, pricePerUnit = 10): Customer {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 100,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

/** Spiel ohne zufällig auftauchende Kunden, damit Tests genau zählen können. */
function quietGame(): Simulation {
  const sim = createTestGame();
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

describe('customers', () => {
  it('Kunden tauchen mit der Zeit an den Spots auf', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    sim.advance(120);
    expect(sim.state.modules.customers.waiting.length).toBeGreaterThan(0);
    expect(eventsOfType(events, 'customer.arrived').length).toBe(sim.state.modules.customers.waiting.length);
  });

  it('nie mehr als die Höchstzahl Kunden pro Spot', () => {
    const sim = createTestGame();
    sim.advance(24 * 60);
    for (const spotId of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
      expect(waitingAt(sim.state, spotId).length).toBeLessThanOrEqual(MAX_CUSTOMERS_PER_SPOT);
    }
  });

  it('der Preis richtet sich nach Richtpreis und Spot (±10 %)', () => {
    const sim = createTestGame();
    sim.advance(6 * 60);
    for (const c of sim.state.modules.customers.waiting) {
      const spot = getSpot(sim.state, c.spotId);
      if (!spot) throw new Error('Spot fehlt');
      const base = referencePrice(sim.state, 'weed', spot.veedelId) * spot.priceMultiplier;
      expect(c.pricePerUnit).toBeGreaterThanOrEqual(Math.floor(base * 0.9 * 10) / 10);
      expect(c.pricePerUnit).toBeLessThanOrEqual(Math.ceil(base * 1.1 * 10) / 10);
    }
  });

  it('Verkauf: Geld rein, Ware raus, Kunde weg, Ereignis mit Spot und Veedel', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const money = sim.state.wallet.dirty;
    const stock = getStock(sim.state);
    const c = addCustomer(sim, 'zuelpicher', 3, 10);
    expect(sim.dispatch({ type: 'customers.serve', payload: { customerId: c.id } }).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money + 30);
    expect(getStock(sim.state)).toBe(stock - 3);
    expect(sim.state.modules.customers.waiting).toHaveLength(0);
    expect(eventsOfType(events, 'sale.completed')[0].payload).toMatchObject({
      channel: 'street',
      spotId: 'zuelpicher',
      veedelId: 'neustadt-sued',
      productId: 'weed',
      amount: 3,
      revenue: 30,
      sellerId: null,
    });
    expect(getSalesStats(sim.state)).toMatchObject({ unitsSold: 3, revenue: 30, customersServed: 1 });
  });

  it('nicht mehr verkaufen als im Lager ist', () => {
    const sim = quietGame();
    sim.state.modules.goods.stock.ehrenfeld.weed = 2;
    const c = addCustomer(sim, 'neumarkt', 3);
    expect(canServe(sim.state, c.id)).toBe(false);
    expect(sim.dispatch({ type: 'customers.serve', payload: { customerId: c.id } })).toEqual({
      ok: false,
      reason: 'Nicht genug im Lager.',
    });
    expect(sim.state.modules.customers.waiting).toHaveLength(1);
  });

  it('alle am Spot bedienen, solange die Ware reicht', () => {
    const sim = quietGame();
    sim.state.modules.goods.stock.ehrenfeld.weed = 5;
    addCustomer(sim, 'neumarkt', 3);
    addCustomer(sim, 'neumarkt', 3);
    addCustomer(sim, 'uni', 1);
    const result = sim.dispatch({ type: 'customers.serveAll', payload: { spotId: 'neumarkt' } });
    expect(result).toEqual({ ok: true, data: { served: 1 } });
    expect(sim.state.modules.customers.waiting.map((c) => c.spotId).sort()).toEqual(['neumarkt', 'uni']);
  });

  it('Kunden hauen ab, wenn ihre Geduld zu Ende ist', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    addCustomer(sim, 'uni', 1);
    sim.advance(100);
    expect(sim.state.modules.customers.waiting).toHaveLength(0);
    expect(getSalesStats(sim.state).customersLost).toBe(1);
    expect(sim.state.journal[0].text).toBe('Kunde am Uni-Wiese ist abgehauen.');
    expect(eventsOfType(events, 'customer.left')).toHaveLength(1);
  });

  it('Geduld und Umsatz eines Kunden', () => {
    const sim = createTestGame();
    sim.advance(120);
    const c = sim.state.modules.customers.waiting[0];
    expect(c.expiresAt - c.arrivedAt).toBe(CUSTOMER_PATIENCE);
    expect(customerRevenue(c)).toBe(Math.round(c.amount * c.pricePerUnit));
  });
});
