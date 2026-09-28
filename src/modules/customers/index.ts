// Kunden: tauchen an Spots auf, warten eine Weile und wollen eine Menge zu einem Preis.
// Aus dem Prototyp portiert. Kundentypen, Stammkunden, Lieferdienst und Großhandel baut Auftrag 12.
//
// Öffentliche API:
//   waitingAt(state, spotId), allWaiting(state), getCustomer(state, id), canServe(state, customerId),
//   customerRevenue(customer), getSalesStats(state), CUSTOMER_PATIENCE
// Befehle: 'customers.serve' (auch für Läufer, mit sellerId), 'customers.serveAll'
// Ereignisse: 'sale.completed', 'customer.arrived', 'customer.left'

import { type CommandResult, type Ctx, clock, defineModule, type GameState, journal, wallet } from '../../core';
import { DEFAULT_PRODUCT, getStock, take } from '../goods';
import { referencePrice } from '../market';
import { getSpot, getSpots, type Spot } from '../spots';
import {
  BASE_SPAWN_INTERVAL,
  CUSTOMER_MAX_AMOUNT,
  CUSTOMER_MIN_AMOUNT,
  CUSTOMER_PATIENCE,
  hourDemandMultiplier,
  MAX_CUSTOMERS_PER_SPOT,
  PRICE_SPREAD,
} from './config';

export { CUSTOMER_PATIENCE } from './config';

export interface Customer {
  id: number;
  spotId: string;
  productId: string;
  amount: number;
  /** Preis pro Einheit, den der Kunde zahlt. */
  pricePerUnit: number;
  arrivedAt: number;
  expiresAt: number;
}

export interface SalesStats {
  unitsSold: number;
  revenue: number;
  customersServed: number;
  customersLost: number;
}

export interface CustomersState {
  waiting: Customer[];
  /** Nächster Kunde pro Spot (Spielminute, mit Nachkommastellen). */
  nextSpawnAt: Record<string, number>;
  stats: SalesStats;
}

/** Vertriebsweg eines Verkaufs. */
export type SalesChannel = 'street' | 'delivery' | 'wholesale';

declare module '../../core' {
  interface ModuleStates {
    customers: CustomersState;
  }
  interface GameCommands {
    /** Einen Kunden bedienen. sellerId: Mitarbeiter (Läufer), der verkauft; ohne = der Spieler selbst. */
    'customers.serve': { customerId: number; sellerId?: string };
    /** Alle Kunden an einem Spot bedienen, solange die Ware reicht. */
    'customers.serveAll': { spotId: string };
  }
  interface GameEvents {
    /** Jeder Verkauf, egal über welchen Vertriebsweg. spotId ist null bei Lieferdienst und Großhandel. */
    'sale.completed': {
      channel: SalesChannel;
      spotId: string | null;
      veedelId: string;
      productId: string;
      amount: number;
      quality: number;
      revenue: number;
      /** Verkaufender Mitarbeiter, null = der Spieler selbst. */
      sellerId: string | null;
      customerId: number | null;
    };
    'customer.arrived': { customerId: number; spotId: string };
    /** Kunde ist ohne Ware abgehauen. */
    'customer.left': { customerId: number; spotId: string };
  }
}

/** Wartende Kunden an einem Spot, dringendste zuerst. */
export function waitingAt(state: GameState, spotId: string): Customer[] {
  return state.modules.customers.waiting.filter((c) => c.spotId === spotId).sort((a, b) => a.expiresAt - b.expiresAt);
}

export function allWaiting(state: GameState): readonly Customer[] {
  return state.modules.customers.waiting;
}

export function getCustomer(state: GameState, id: number): Customer | undefined {
  return state.modules.customers.waiting.find((c) => c.id === id);
}

/** Reicht die Ware für diesen Kunden? */
export function canServe(state: GameState, customerId: number): boolean {
  const c = getCustomer(state, customerId);
  return !!c && getStock(state, { productId: c.productId }) >= c.amount;
}

export function customerRevenue(customer: Customer): number {
  return Math.round(customer.amount * customer.pricePerUnit);
}

export function getSalesStats(state: GameState): SalesStats {
  return state.modules.customers.stats;
}

function spawnInterval(spot: Spot, time: number, ctx: Ctx): number {
  const mean = BASE_SPAWN_INTERVAL / (spot.demand * hourDemandMultiplier(clock.hour(time)));
  // Exponentialverteilung, damit Kunden unregelmäßig auftauchen.
  return -Math.log(1 - ctx.random() * 0.999) * mean;
}

function spawnCustomer(ctx: Ctx, spot: Spot, at: number): void {
  const amount = ctx.randomInt(CUSTOMER_MIN_AMOUNT, CUSTOMER_MAX_AMOUNT);
  const base = referencePrice(ctx.state, DEFAULT_PRODUCT, spot.veedelId) * spot.priceMultiplier;
  const pricePerUnit = Math.round(base * (1 - PRICE_SPREAD + ctx.random() * 2 * PRICE_SPREAD) * 10) / 10;
  const customer: Customer = {
    id: ctx.nextId(),
    spotId: spot.id,
    productId: DEFAULT_PRODUCT,
    amount,
    pricePerUnit,
    arrivedAt: at,
    expiresAt: at + CUSTOMER_PATIENCE,
  };
  ctx.state.modules.customers.waiting.push(customer);
  ctx.emit('customer.arrived', { customerId: customer.id, spotId: spot.id });
}

function serve(ctx: Ctx, customerId: number, sellerId: string | null): CommandResult {
  const state = ctx.state.modules.customers;
  const customer = state.waiting.find((c) => c.id === customerId);
  if (!customer) return { ok: false, reason: 'Kunde ist weg.' };
  const spot = getSpot(ctx.state, customer.spotId);
  if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
  const { taken, quality } = take(ctx, { productId: customer.productId, amount: customer.amount });
  if (taken === 0) return { ok: false, reason: 'Nicht genug im Lager.' };
  const revenue = customerRevenue(customer);
  wallet.earn(ctx, revenue, 'dirty', 'Verkauf');
  state.waiting = state.waiting.filter((c) => c.id !== customer.id);
  state.stats.unitsSold += customer.amount;
  state.stats.revenue += revenue;
  state.stats.customersServed += 1;
  ctx.emit('sale.completed', {
    channel: 'street',
    spotId: spot.id,
    veedelId: spot.veedelId,
    productId: customer.productId,
    amount: customer.amount,
    quality,
    revenue,
    sellerId,
    customerId: customer.id,
  });
  return { ok: true, data: { revenue } };
}

function tick(ctx: Ctx): void {
  const state = ctx.state.modules.customers;
  const now = ctx.now;

  const expired = state.waiting.filter((c) => c.expiresAt <= now);
  if (expired.length > 0) {
    state.waiting = state.waiting.filter((c) => c.expiresAt > now);
    state.stats.customersLost += expired.length;
    for (const c of expired) {
      const spot = getSpot(ctx.state, c.spotId);
      journal.add(ctx, `Kunde am ${spot?.name ?? c.spotId} ist abgehauen.`, 'bad', { spotId: c.spotId });
      ctx.emit('customer.left', { customerId: c.id, spotId: c.spotId });
    }
  }

  for (const spot of getSpots(ctx.state)) {
    let next = state.nextSpawnAt[spot.id] ?? now;
    while (next <= now) {
      const waiting = state.waiting.filter((c) => c.spotId === spot.id).length;
      if (waiting < MAX_CUSTOMERS_PER_SPOT) spawnCustomer(ctx, spot, next);
      next += spawnInterval(spot, next, ctx);
    }
    state.nextSpawnAt[spot.id] = next;
  }
}

export default defineModule({
  id: 'customers',
  version: 1,
  dependsOn: ['spots', 'goods', 'market'],
  init: (ctx) => {
    const nextSpawnAt: Record<string, number> = {};
    for (const spot of getSpots(ctx.state)) {
      nextSpawnAt[spot.id] = ctx.now + ctx.random() * spawnInterval(spot, ctx.now, ctx);
    }
    return {
      waiting: [],
      nextSpawnAt,
      stats: { unitsSold: 0, revenue: 0, customersServed: 0, customersLost: 0 },
    };
  },
  tick,
  commands: {
    'customers.serve': (ctx, { customerId, sellerId }) => serve(ctx, customerId, sellerId ?? null),
    'customers.serveAll': (ctx, { spotId }) => {
      let served = 0;
      for (const c of waitingAt(ctx.state, spotId)) {
        if (serve(ctx, c.id, null).ok) served++;
      }
      if (served === 0) return { ok: false, reason: 'Nicht genug im Lager.' };
      return { ok: true, data: { served } };
    },
  },
});
