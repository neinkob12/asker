// Straßenverkauf: Interessenten an den Spots, Verkauf, Zufriedenheit und Stammkunden.

import { type CommandResult, type Ctx, clock, journal, MINUTES_PER_DAY, wallet } from '../../core';
import { allProducts, getProduct, getStock, take } from '../goods';
import { getSpotPrice, priceRatio, spotReferencePrice } from '../market';
import { changeReputation, reputationDemandFactor } from '../reputation';
import { getSpot, getSpots, isSpotActive, type Spot } from '../spots';
import { weatherDemandFactor } from '../weather';
import {
  BASE_SPAWN_INTERVAL,
  CUSTOMER_PATIENCE,
  CUSTOMER_TYPES,
  hourDemandMultiplier,
  LOST_REGULARS_KEPT,
  MAX_CHEAP_BOOST,
  MAX_CUSTOMERS_PER_SPOT,
  MAX_REGULARS,
  REGULAR_CHANCE,
  REGULAR_LOST_BELOW,
  REGULAR_NAMES,
  REGULAR_NICKNAMES,
  REGULAR_PATIENCE_FACTOR,
  REGULAR_START_SATISFACTION,
  REP_CUSTOMER_LOST,
  REP_CUT_NOTICED,
  REP_PER_SATISFACTION,
  WEEKDAY_DEMAND,
} from './config';
import {
  acceptsPrice,
  chooseProduct,
  customerType,
  cutNoticeChance,
  inPeak,
  regularAfterSale,
  regularVerdict,
  saleSatisfaction,
  typeDemandWeight,
} from './decisions';
import type { Customer, Regular } from './index';

const TYPE_NORM = CUSTOMER_TYPES.reduce((sum, t) => sum + t.share, 0);

function typeWeights(spot: Pick<Spot, 'audience'>, time: number): number[] {
  const hour = clock.hour(time);
  const weekday = clock.weekday(time);
  return CUSTOMER_TYPES.map((t) => typeDemandWeight(t, spot.audience, hour, weekday));
}

export function pickWeighted<T>(ctx: Ctx, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = ctx.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Zeit bis zum nächsten Interessenten an einem Spot (exponentialverteilt, damit es unregelmäßig wirkt). */
function spawnInterval(ctx: Ctx, spot: Spot, time: number): number {
  const mix = typeWeights(spot, time).reduce((a, b) => a + b, 0) / TYPE_NORM;
  const rate =
    spot.demand *
    hourDemandMultiplier(clock.hour(time)) *
    WEEKDAY_DEMAND[clock.weekday(time)] *
    weatherDemandFactor(ctx.state) *
    reputationDemandFactor(ctx.state) *
    mix *
    MAX_CHEAP_BOOST;
  const mean = BASE_SPAWN_INTERVAL / Math.max(0.01, rate);
  return -Math.log(1 - ctx.random() * 0.999) * mean;
}

export function initialSpawn(ctx: Ctx, spots: readonly Spot[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const spot of spots) next[spot.id] = ctx.now + ctx.random() * spawnInterval(ctx, spot, ctx.now);
  return next;
}

function stockOf(ctx: Ctx) {
  return (productId: string) => getStock(ctx.state, { productId });
}

/** Ein Interessent kommt an einen Spot. Er kauft nur, was da ist, und nur, wenn ihm der Preis passt. */
function arrive(ctx: Ctx, spot: Spot, at: number): void {
  const state = ctx.state.modules.customers;
  const type = pickWeighted(ctx, CUSTOMER_TYPES, typeWeights(spot, at));
  const { wanted, productId } = chooseProduct(type.id, allProducts(), stockOf(ctx), ctx.random);
  if (!wanted) return;
  const considered = productId ?? wanted;
  const ratio = priceRatio(ctx.state, spot.id, considered);
  if (!acceptsPrice(ratio, type.priceSensitivity, ctx.random())) {
    // Beim Richtpreis springt auch mal einer ab; als "zu teuer" zählt nur, wer über dem Richtpreis abspringt.
    if (productId && ratio > 1.02) state.stats.tooExpensive += 1;
    return;
  }
  const product = getProduct(considered);
  if (!product) return;
  const [min, max] = product.typicalAmount;
  const amount = Math.max(1, Math.round(ctx.randomInt(min, max) * type.amountFactor));
  if (!productId) {
    state.stats.missedDemand += 1;
    state.stats.missedByProduct[wanted] = (state.stats.missedByProduct[wanted] ?? 0) + 1;
    ctx.emit('customer.missed', {
      spotId: spot.id,
      veedelId: spot.veedelId,
      productId: wanted,
      amount,
      typeId: type.id,
    });
    return;
  }
  addCustomer(ctx, spot, {
    productId,
    amount: Math.min(amount, getStock(ctx.state, { productId })),
    typeId: type.id,
    at,
    patience: CUSTOMER_PATIENCE * type.patience,
  });
}

function addCustomer(
  ctx: Ctx,
  spot: Spot,
  c: { productId: string; amount: number; typeId: string; at: number; patience: number; regularId?: string },
): Customer {
  const customer: Customer = {
    id: ctx.nextId(),
    spotId: spot.id,
    productId: c.productId,
    amount: c.amount,
    pricePerUnit: getSpotPrice(ctx.state, spot.id, c.productId),
    arrivedAt: Math.floor(c.at),
    expiresAt: Math.floor(c.at) + Math.round(c.patience),
    typeId: c.typeId,
  };
  if (c.regularId) customer.regularId = c.regularId;
  ctx.state.modules.customers.waiting.push(customer);
  ctx.emit(
    'customer.arrived',
    c.regularId
      ? { customerId: customer.id, spotId: spot.id, typeId: c.typeId, regularId: c.regularId }
      : { customerId: customer.id, spotId: spot.id, typeId: c.typeId },
  );
  return customer;
}

/**
 * Wie ist der Verkauf angekommen? Kunden merken Streckmittel und vergleichen die Qualität mit ihrer Erwartung.
 * Ändert den Ruf und gibt Zufriedenheit und "Streckmittel bemerkt" zurück.
 */
export function rateSale(
  ctx: Ctx,
  sale: { typeId: string | undefined; quality: number; cut: number; priceRatio: number; where: string },
): { satisfaction: number; noticedCut: boolean } {
  const type = customerType(sale.typeId);
  const noticedCut = sale.cut > 0 && ctx.chance(cutNoticeChance(sale.cut, type.expertise));
  const satisfaction = saleSatisfaction({
    quality: sale.quality,
    expectation: type.qualityExpectation,
    noticedCut,
    priceRatio: sale.priceRatio,
  });
  if (satisfaction !== 0) {
    changeReputation(
      ctx,
      satisfaction * REP_PER_SATISFACTION,
      satisfaction > 0 ? 'Zufriedene Kundschaft' : 'Unzufriedene Kundschaft',
    );
  }
  if (noticedCut) {
    ctx.state.modules.customers.stats.cutNoticed += 1;
    changeReputation(ctx, REP_CUT_NOTICED, 'Gestreckte Ware bemerkt');
    journal.add(ctx, `${type.name} ${sale.where} hat gemerkt, dass dein Zeug gestreckt ist.`, 'bad');
  }
  return { satisfaction, noticedCut };
}

/** Kunden bedienen: Ware raus, Schwarzgeld rein, Zufriedenheit, Stammkunden, Ereignis. */
export function serve(ctx: Ctx, customerId: number, sellerId: string | null): CommandResult {
  const state = ctx.state.modules.customers;
  const customer = state.waiting.find((c) => c.id === customerId);
  if (!customer) return { ok: false, reason: 'Kunde ist weg.' };
  const spot = getSpot(ctx.state, customer.spotId);
  if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
  const { taken, quality, cut } = take(ctx, { productId: customer.productId, amount: customer.amount });
  if (taken === 0) return { ok: false, reason: 'Nicht genug im Lager.' };
  const revenue = Math.round(customer.amount * customer.pricePerUnit);
  wallet.earn(ctx, revenue, 'dirty', 'Verkauf');
  state.waiting = state.waiting.filter((c) => c.id !== customer.id);
  state.stats.unitsSold += customer.amount;
  state.stats.revenue += revenue;
  state.stats.customersServed += 1;

  const reference = spotReferencePrice(ctx.state, spot.id, customer.productId);
  const rating = rateSale(ctx, {
    typeId: customer.typeId,
    quality,
    cut,
    priceRatio: reference > 0 ? customer.pricePerUnit / reference : 1,
    where: `am ${spot.name}`,
  });
  const regular = customer.regularId ? state.regulars.find((r) => r.id === customer.regularId) : undefined;
  if (regular) {
    updateRegularAfterSale(ctx, regular, { price: customer.pricePerUnit, quality, noticedCut: rating.noticedCut });
  } else if (rating.satisfaction > 0) {
    maybeBecomeRegular(ctx, customer, spot, quality);
  }

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
    ...(regular ? { regularId: regular.id } : {}),
  });
  return { ok: true, data: { revenue } };
}

// ---------------------------------------------------------------------------------------------
// Stammkunden

function activeRegulars(ctx: Ctx): Regular[] {
  return ctx.state.modules.customers.regulars.filter((r) => r.status === 'active');
}

/** Nächsten Besuch planen: in ein paar Tagen, zur Hauptzeit des Typs. */
function scheduleVisit(ctx: Ctx, regular: Regular, from: number): void {
  const type = customerType(regular.typeId);
  const days = Math.max(1, Math.round(type.visitEvery * (0.7 + ctx.random() * 0.6)));
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => inPeak(h, type.peakHours));
  const hour = hours.length > 0 ? ctx.pick(hours) : 18;
  const dayStart = (Math.floor(from / MINUTES_PER_DAY) + days) * MINUTES_PER_DAY;
  regular.nextVisitAt = dayStart + hour * 60 + ctx.randomInt(0, 59);
}

function maybeBecomeRegular(ctx: Ctx, customer: Customer, spot: Spot, quality: number): void {
  const state = ctx.state.modules.customers;
  if (activeRegulars(ctx).length >= MAX_REGULARS) return;
  const type = customerType(customer.typeId);
  if (!ctx.chance(REGULAR_CHANCE * type.loyalty * reputationDemandFactor(ctx.state))) return;
  const taken = new Set(state.regulars.map((r) => r.name));
  let name = '';
  for (let i = 0; i < 5 && (!name || taken.has(name)); i++) {
    const nick = REGULAR_NICKNAMES[type.id] ?? [];
    name = `${ctx.pick(REGULAR_NAMES)}${nick.length > 0 ? ` ${ctx.pick(nick)}` : ''}`;
  }
  const regular: Regular = {
    id: `r${ctx.nextId()}`,
    name,
    typeId: type.id,
    spotId: spot.id,
    productId: customer.productId,
    amount: customer.amount,
    visits: 1,
    lastPrice: customer.pricePerUnit,
    lastQuality: quality,
    satisfaction: REGULAR_START_SATISFACTION,
    since: ctx.now,
    nextVisitAt: 0,
    status: 'active',
  };
  scheduleVisit(ctx, regular, ctx.now);
  state.regulars.push(regular);
  journal.add(ctx, `${name} (${type.name}) ist jetzt Stammkunde am ${spot.name}.`, 'good', { spotId: spot.id });
  ctx.emit('customer.regularGained', { regularId: regular.id, spotId: spot.id });
}

export function updateRegularAfterSale(
  ctx: Ctx,
  regular: Regular,
  sale: { price: number; quality: number; noticedCut: boolean },
): void {
  regular.satisfaction = regularAfterSale(regular, customerType(regular.typeId), sale);
  regular.lastPrice = sale.price;
  regular.lastQuality = sale.quality;
  regular.visits += 1;
  if (regular.satisfaction < REGULAR_LOST_BELOW) {
    loseRegular(ctx, regular, sale.noticedCut ? 'gestreckte Ware' : 'die Qualität stimmt nicht mehr');
  }
}

function loseRegular(ctx: Ctx, regular: Regular, reason: string): void {
  regular.status = 'lost';
  regular.lostReason = reason;
  journal.add(ctx, `Stammkunde ${regular.name} kommt nicht mehr: ${reason}.`, 'bad', { spotId: regular.spotId });
  ctx.emit('customer.regularLost', { regularId: regular.id, reason });
  const state = ctx.state.modules.customers;
  const lost = state.regulars.filter((r) => r.status === 'lost');
  if (lost.length > LOST_REGULARS_KEPT) {
    const drop = new Set(lost.slice(0, lost.length - LOST_REGULARS_KEPT).map((r) => r.id));
    state.regulars = state.regulars.filter((r) => !drop.has(r.id));
  }
}

/** Stammkunden, deren Besuch fällig ist, kommen vorbei (oder bleiben weg). */
function visitRegulars(ctx: Ctx): void {
  const state = ctx.state.modules.customers;
  for (const regular of [...state.regulars]) {
    if (regular.status !== 'active' || regular.nextVisitAt > ctx.now) continue;
    const spot = getSpot(ctx.state, regular.spotId);
    if (!spot || !isSpotActive(ctx.state, spot.id)) {
      scheduleVisit(ctx, regular, ctx.now);
      continue;
    }
    const type = customerType(regular.typeId);
    const stock = getStock(ctx.state, { productId: regular.productId });
    const price = getSpotPrice(ctx.state, spot.id, regular.productId);
    const verdict = regularVerdict(regular, type, { price, available: stock > 0 });
    regular.satisfaction = verdict.satisfaction;
    if (verdict.verdict === 'quit') {
      loseRegular(ctx, regular, verdict.reason ?? 'keine Lust mehr');
      continue;
    }
    if (verdict.verdict === 'skip') {
      scheduleVisit(ctx, regular, ctx.now);
      continue;
    }
    const waiting = state.waiting.filter((c) => c.spotId === spot.id);
    if (waiting.length >= MAX_CUSTOMERS_PER_SPOT || waiting.some((c) => c.regularId === regular.id)) {
      regular.nextVisitAt = ctx.now + 60;
      continue;
    }
    addCustomer(ctx, spot, {
      productId: regular.productId,
      amount: Math.min(regular.amount, stock),
      typeId: type.id,
      at: ctx.now,
      patience: CUSTOMER_PATIENCE * type.patience * REGULAR_PATIENCE_FACTOR,
      regularId: regular.id,
    });
    scheduleVisit(ctx, regular, ctx.now);
  }
}

// ---------------------------------------------------------------------------------------------
// Ablauf pro Spielminute

function expireCustomers(ctx: Ctx): void {
  const state = ctx.state.modules.customers;
  const expired = state.waiting.filter((c) => c.expiresAt <= ctx.now);
  if (expired.length === 0) return;
  state.waiting = state.waiting.filter((c) => c.expiresAt > ctx.now);
  state.stats.customersLost += expired.length;
  for (const c of expired) {
    const spot = getSpot(ctx.state, c.spotId);
    const regular = c.regularId ? state.regulars.find((r) => r.id === c.regularId) : undefined;
    if (regular) {
      journal.add(ctx, `Stammkunde ${regular.name} hat am ${spot?.name ?? c.spotId} umsonst gewartet.`, 'bad', {
        spotId: c.spotId,
      });
      regular.satisfaction = Math.max(0, Math.round((regular.satisfaction - 0.25) * 100) / 100);
      if (regular.satisfaction < REGULAR_LOST_BELOW) loseRegular(ctx, regular, 'zu lange gewartet');
    } else {
      journal.add(ctx, `Kunde am ${spot?.name ?? c.spotId} ist abgehauen.`, 'bad', { spotId: c.spotId });
    }
    changeReputation(ctx, REP_CUSTOMER_LOST, 'Kunden warten lassen');
    ctx.emit('customer.left', {
      customerId: c.id,
      spotId: c.spotId,
      productId: c.productId,
      amount: c.amount,
      ...(spot ? { veedelId: spot.veedelId } : {}),
    });
  }
}

export function streetTick(ctx: Ctx): void {
  const state = ctx.state.modules.customers;
  const now = ctx.now;
  expireCustomers(ctx);
  for (const spot of getSpots(ctx.state)) {
    let next = state.nextSpawnAt[spot.id] ?? now;
    while (next <= now) {
      const waiting = state.waiting.filter((c) => c.spotId === spot.id).length;
      if (waiting < MAX_CUSTOMERS_PER_SPOT) arrive(ctx, spot, next);
      next += spawnInterval(ctx, spot, next);
    }
    state.nextSpawnAt[spot.id] = next;
  }
  visitRegulars(ctx);
}
