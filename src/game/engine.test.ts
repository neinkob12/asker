import { describe, expect, it } from 'vitest';
import type { Spot } from '../data/spots';
import { PACKAGES, RUNNER_DAILY_WAGE, RUNNER_HIRE_COST, SHIPMENT_DURATION, START_MONEY, START_STOCK } from './config';
import {
  createGame,
  formatClock,
  hireRunner,
  orderShipment,
  serveAllAtSpot,
  serveCustomer,
  tick,
  type GameState,
} from './engine';

const spots: Spot[] = [
  { id: 'a', name: 'Spot A', lng: 0, lat: 0, demand: 1, priceMultiplier: 1 },
  { id: 'b', name: 'Spot B', lng: 0, lat: 0, demand: 1, priceMultiplier: 1 },
];

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function addCustomer(state: GameState, spotId: string, grams: number, pricePerGram = 10) {
  const c = { id: state.nextId++, spotId, grams, pricePerGram, arrivedAt: state.time, expiresAt: state.time + 100 };
  state.customers.push(c);
  return c;
}

describe('engine', () => {
  it('starts with configured money and stock', () => {
    const g = createGame(spots, seeded());
    expect(g.money).toBe(START_MONEY);
    expect(g.stock).toBe(START_STOCK);
    expect(formatClock(g.time)).toBe('Tag 1, 18:00');
  });

  it('spawns customers over time', () => {
    const g = createGame(spots, seeded());
    tick(g, 120, spots, seeded(7));
    expect(g.customers.length).toBeGreaterThan(0);
  });

  it('delivers an ordered shipment after the shipment duration', () => {
    const g = createGame(spots, seeded());
    const pkg = PACKAGES[0];
    expect(orderShipment(g, pkg.id).ok).toBe(true);
    expect(g.money).toBe(START_MONEY - pkg.price);
    tick(g, SHIPMENT_DURATION - 1, [], seeded());
    expect(g.stock).toBe(START_STOCK);
    tick(g, 1, [], seeded());
    expect(g.stock).toBe(START_STOCK + pkg.grams);
    expect(g.shipments).toHaveLength(0);
  });

  it('refuses orders without enough money', () => {
    const g = createGame(spots, seeded());
    g.money = 10;
    expect(orderShipment(g, PACKAGES[0].id)).toEqual({ ok: false, reason: 'Nicht genug Geld.' });
  });

  it('sells to a customer and removes them', () => {
    const g = createGame(spots, seeded());
    const c = addCustomer(g, 'a', 3, 10);
    expect(serveCustomer(g, c.id).ok).toBe(true);
    expect(g.money).toBe(START_MONEY + 30);
    expect(g.stock).toBe(START_STOCK - 3);
    expect(g.customers).toHaveLength(0);
  });

  it('cannot sell more than the stock', () => {
    const g = createGame(spots, seeded());
    g.stock = 2;
    const c = addCustomer(g, 'a', 3);
    expect(serveCustomer(g, c.id).ok).toBe(false);
    expect(g.customers).toHaveLength(1);
  });

  it('serves all customers at a spot while stock lasts', () => {
    const g = createGame(spots, seeded());
    g.stock = 5;
    addCustomer(g, 'a', 3);
    addCustomer(g, 'a', 3);
    addCustomer(g, 'b', 1);
    expect(serveAllAtSpot(g, 'a')).toBe(1);
    expect(g.customers.map((c) => c.spotId).sort()).toEqual(['a', 'b']);
  });

  it('loses customers whose patience runs out', () => {
    const g = createGame(spots, seeded());
    addCustomer(g, 'a', 1);
    tick(g, 100, [], seeded());
    expect(g.customers).toHaveLength(0);
    expect(g.stats.customersLost).toBe(1);
  });

  it('runners serve customers at their spot automatically', () => {
    const g = createGame(spots, seeded());
    expect(hireRunner(g, 'a', 'Spot A').ok).toBe(true);
    expect(g.money).toBe(START_MONEY - RUNNER_HIRE_COST);
    expect(hireRunner(g, 'a', 'Spot A').ok).toBe(false);
    addCustomer(g, 'a', 2);
    addCustomer(g, 'b', 2);
    tick(g, 1, [], seeded());
    expect(g.customers.map((c) => c.spotId)).toEqual(['b']);
  });

  it('pays runner wages at midnight and lets runners quit when broke', () => {
    const g = createGame(spots, seeded());
    hireRunner(g, 'a', 'Spot A');
    hireRunner(g, 'b', 'Spot B');
    g.money = RUNNER_DAILY_WAGE;
    tick(g, 6 * 60 + 1, [], seeded());
    expect(g.runners).toHaveLength(1);
    expect(g.money).toBe(0);
  });
});
