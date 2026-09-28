import type { Spot } from '../data/spots';
import {
  BASE_SPAWN_INTERVAL,
  BASE_STREET_PRICE,
  CUSTOMER_MAX_GRAMS,
  CUSTOMER_MIN_GRAMS,
  CUSTOMER_PATIENCE,
  LOG_LIMIT,
  MAX_CUSTOMERS_PER_SPOT,
  PACKAGES,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  RUNNER_SERVE_TIME,
  SHIPMENT_DURATION,
  START_MONEY,
  START_STOCK,
  START_TIME,
  hourDemandMultiplier,
} from './config';

export type Rng = () => number;

export interface Customer {
  id: number;
  spotId: string;
  grams: number;
  pricePerGram: number;
  arrivedAt: number;
  expiresAt: number;
}

export interface Shipment {
  id: number;
  grams: number;
  departedAt: number;
  arrivesAt: number;
}

export interface Runner {
  id: number;
  spotId: string;
  busyUntil: number;
}

export type LogKind = 'info' | 'good' | 'bad';

export interface LogEntry {
  id: number;
  time: number;
  kind: LogKind;
  text: string;
}

export interface GameState {
  version: 1;
  time: number;
  money: number;
  stock: number;
  customers: Customer[];
  shipments: Shipment[];
  runners: Runner[];
  nextSpawnAt: Record<string, number>;
  nextId: number;
  stats: { gramsSold: number; revenue: number; customersLost: number };
  log: LogEntry[];
}

export type ActionResult = { ok: true } | { ok: false; reason: string };

export function createGame(spots: Spot[], rng: Rng = Math.random): GameState {
  const state: GameState = {
    version: 1,
    time: START_TIME,
    money: START_MONEY,
    stock: START_STOCK,
    customers: [],
    shipments: [],
    runners: [],
    nextSpawnAt: {},
    nextId: 1,
    stats: { gramsSold: 0, revenue: 0, customersLost: 0 },
    log: [],
  };
  for (const spot of spots) {
    state.nextSpawnAt[spot.id] = state.time + rng() * spawnInterval(spot, state.time, rng);
  }
  addLog(state, 'info', 'Willkommen in Köln. Bestell Ware am Hafen und beliefere deine Kunden.');
  return state;
}

export function day(time: number): number {
  return Math.floor(time / 1440) + 1;
}

export function hour(time: number): number {
  return Math.floor(time / 60) % 24;
}

export function formatClock(time: number): string {
  const m = Math.floor(time) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `Tag ${day(time)}, ${hh}:${mm}`;
}

function addLog(state: GameState, kind: LogKind, text: string): void {
  state.log.unshift({ id: state.nextId++, time: state.time, kind, text });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function spawnInterval(spot: Spot, time: number, rng: Rng): number {
  const mean = BASE_SPAWN_INTERVAL / (spot.demand * hourDemandMultiplier(hour(time)));
  // Exponentialverteilung, damit Kunden unregelmäßig auftauchen.
  return -Math.log(1 - rng() * 0.999) * mean;
}

function spawnCustomer(state: GameState, spot: Spot, at: number, rng: Rng): void {
  const grams = CUSTOMER_MIN_GRAMS + Math.floor(rng() * (CUSTOMER_MAX_GRAMS - CUSTOMER_MIN_GRAMS + 1));
  const pricePerGram = Math.round(BASE_STREET_PRICE * spot.priceMultiplier * (0.9 + rng() * 0.2) * 10) / 10;
  state.customers.push({
    id: state.nextId++,
    spotId: spot.id,
    grams,
    pricePerGram,
    arrivedAt: at,
    expiresAt: at + CUSTOMER_PATIENCE,
  });
}

function sell(state: GameState, customer: Customer): void {
  const revenue = Math.round(customer.grams * customer.pricePerGram);
  state.stock -= customer.grams;
  state.money += revenue;
  state.stats.gramsSold += customer.grams;
  state.stats.revenue += revenue;
  state.customers = state.customers.filter((c) => c.id !== customer.id);
}

export function customerRevenue(customer: Customer): number {
  return Math.round(customer.grams * customer.pricePerGram);
}

export function tick(state: GameState, minutes: number, spots: Spot[], rng: Rng = Math.random): void {
  const prevTime = state.time;
  const end = prevTime + minutes;
  state.time = end;

  for (const s of state.shipments.filter((s) => s.arrivesAt <= end)) {
    state.stock += s.grams;
    addLog(state, 'good', `Lieferung angekommen: ${s.grams} g im Lager.`);
  }
  state.shipments = state.shipments.filter((s) => s.arrivesAt > end);

  const expired = state.customers.filter((c) => c.expiresAt <= end);
  if (expired.length > 0) {
    state.stats.customersLost += expired.length;
    state.customers = state.customers.filter((c) => c.expiresAt > end);
    for (const c of expired) {
      const spot = spots.find((s) => s.id === c.spotId);
      addLog(state, 'bad', `Kunde am ${spot?.name ?? c.spotId} ist abgehauen.`);
    }
  }

  for (const spot of spots) {
    let next = state.nextSpawnAt[spot.id] ?? end;
    while (next <= end) {
      const waiting = state.customers.filter((c) => c.spotId === spot.id).length;
      if (waiting < MAX_CUSTOMERS_PER_SPOT) spawnCustomer(state, spot, next, rng);
      next += spawnInterval(spot, next, rng);
    }
    state.nextSpawnAt[spot.id] = next;
  }

  for (const runner of state.runners) {
    if (runner.busyUntil > end) continue;
    const customer = state.customers
      .filter((c) => c.spotId === runner.spotId && c.grams <= state.stock)
      .sort((a, b) => a.expiresAt - b.expiresAt)[0];
    if (!customer) continue;
    sell(state, customer);
    runner.busyUntil = end + RUNNER_SERVE_TIME;
  }

  if (day(end) > day(prevTime)) payWages(state);
}

function payWages(state: GameState): void {
  if (state.runners.length === 0) return;
  const total = state.runners.length * RUNNER_DAILY_WAGE;
  if (state.money >= total) {
    state.money -= total;
    addLog(state, 'info', `Löhne gezahlt: ${total} € für ${state.runners.length} Läufer.`);
    return;
  }
  const affordable = Math.floor(Math.max(0, state.money) / RUNNER_DAILY_WAGE);
  const quitting = state.runners.length - affordable;
  state.money -= affordable * RUNNER_DAILY_WAGE;
  state.runners = state.runners.slice(0, affordable);
  addLog(state, 'bad', `Kein Geld für Löhne: ${quitting} Läufer ${quitting === 1 ? 'hat' : 'haben'} gekündigt.`);
}

export function orderShipment(state: GameState, packageId: string): ActionResult {
  const pkg = PACKAGES.find((p) => p.id === packageId);
  if (!pkg) return { ok: false, reason: 'Unbekanntes Paket.' };
  if (state.money < pkg.price) return { ok: false, reason: 'Nicht genug Geld.' };
  state.money -= pkg.price;
  state.shipments.push({
    id: state.nextId++,
    grams: pkg.grams,
    departedAt: state.time,
    arrivesAt: state.time + SHIPMENT_DURATION,
  });
  addLog(state, 'info', `${pkg.label} in Rotterdam bestellt (${pkg.price} €).`);
  return { ok: true };
}

export function serveCustomer(state: GameState, customerId: number): ActionResult {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) return { ok: false, reason: 'Kunde ist weg.' };
  if (state.stock < customer.grams) return { ok: false, reason: 'Nicht genug im Lager.' };
  sell(state, customer);
  return { ok: true };
}

export function serveAllAtSpot(state: GameState, spotId: string): number {
  const waiting = state.customers
    .filter((c) => c.spotId === spotId)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  let served = 0;
  for (const c of waiting) {
    if (serveCustomer(state, c.id).ok) served++;
  }
  return served;
}

export function hireRunner(state: GameState, spotId: string, spotName: string): ActionResult {
  if (state.runners.some((r) => r.spotId === spotId)) return { ok: false, reason: 'Hier arbeitet schon ein Läufer.' };
  if (state.money < RUNNER_HIRE_COST) return { ok: false, reason: 'Nicht genug Geld.' };
  state.money -= RUNNER_HIRE_COST;
  state.runners.push({ id: state.nextId++, spotId, busyUntil: state.time });
  addLog(state, 'good', `Läufer am ${spotName} angeheuert.`);
  return { ok: true };
}

export function fireRunner(state: GameState, spotId: string): void {
  state.runners = state.runners.filter((r) => r.spotId !== spotId);
}
