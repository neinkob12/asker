// Straßenverkauf: Interessenten an den Spots, Verkauf, Zufriedenheit und Stammkunden.

import {
  type CommandResult,
  type Ctx,
  clock,
  distanceMeters,
  type GameState,
  journal,
  MINUTES_PER_DAY,
  START_TIME,
  wallet,
} from '../../core';
import { activeCity, cityOfSpot } from '../city';
import { eventFactor } from '../events';
import { intimidationFactor } from '../gangs';
import { allProducts, getProduct, getStock, take } from '../goods';
import { isPlayerOnTheRoad } from '../logistics';
import { getSpotPrice, priceRatio, spotReferencePrice } from '../market';
import { changeReputation, reputationDemandFactor } from '../reputation';
import {
  atSpot,
  getSpot,
  getSpots,
  isKneipe,
  isSpotActive,
  isSpotOpen,
  KNEIPE,
  nextSpotOpening,
  type Spot,
  spotCity,
  spotDemandFactor,
  spotModifiers,
} from '../spots';
import { nightlifeOf } from '../veedel';
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
  NIGHTLIFE_HOURS,
  NIGHTLIFE_WEEKEND,
  PLAYER_SERVE_TIME,
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
  warmupDemandFactor,
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
import { qualityDemandFactor, recordSaleQuality } from './quality';

/** Stammkunden eines aufgegebenen Spots wechseln höchstens so weit (Meter) zum nächsten Spot (Auftrag 23). */
const REGULAR_MOVE_METERS = 1500;

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

/**
 * Aktuelle Nachfrage an einem Spot (1 = ein Kunde alle BASE_SPAWN_INTERVAL Minuten): Andrang, Uhrzeit,
 * Wochentag, Wetter, Ruf, Anlaufphase, Kundenmix und Stadt-Events (Auftrag 30). Eine Kneipe hat außerhalb ihrer
 * Öffnungszeit keine Nachfrage. Ohne Zufall, auch für die Karte (Hotspots).
 */
export function demandRate(state: GameState, spot: Spot, time: number): number {
  if (!isSpotOpen(spot, time)) return 0;
  const mix = typeWeights(spot, time).reduce((a, b) => a + b, 0) / TYPE_NORM;
  return (
    spot.demand *
    eventFactor(state, 'demand', { spotId: spot.id, veedelId: spot.veedelId }) *
    // Auftrag 23: Gang-Leute am Spot schrecken Kunden ab; Bekanntheit und Art des Spots (Tageskurve, Wetter).
    intimidationFactor(state, spot.id) *
    spotDemandFactor(state, spot, time) *
    nightlifeFactor(spot.veedelId, time) *
    hourDemandMultiplier(clock.hour(time)) *
    WEEKDAY_DEMAND[clock.weekday(time)] *
    weatherDemandFactor(state) *
    reputationDemandFactor(state) *
    warmupDemandFactor(time - START_TIME) *
    mix *
    MAX_CHEAP_BOOST
  );
}

/**
 * Nachtleben (Auftrag 30): zwischen NIGHTLIFE_HOURS die Nachfrage mal nightlife des Veedels, in Nächten auf Samstag
 * und Sonntag in Veedeln mit Nachtleben noch einmal mal NIGHTLIFE_WEEKEND.
 */
export function nightlifeFactor(veedelId: string, time: number): number {
  const nightlife = nightlifeOf(veedelId);
  if (nightlife === 1) return 1;
  const hour = clock.hour(time);
  if (hour < NIGHTLIFE_HOURS.from && hour >= NIGHTLIFE_HOURS.to) return 1;
  // Die Nacht gehört zum Tag, an dem sie anfängt: 2 Uhr am Samstag ist Freitagnacht.
  const startDay = hour < NIGHTLIFE_HOURS.to ? (clock.weekday(time) + 6) % 7 : clock.weekday(time);
  const weekend = nightlife > 1 && (startDay === 4 || startDay === 5);
  return nightlife * (weekend ? NIGHTLIFE_WEEKEND : 1);
}

/** Zeit bis zum nächsten Interessenten an einem Spot (exponentialverteilt, damit es unregelmäßig wirkt). */
function spawnInterval(ctx: Ctx, spot: Spot, time: number): number {
  // Eine geschlossene Kneipe zählt ab der Öffnung (streetTick wartet bis dahin).
  if (!isSpotOpen(spot, time)) return Math.max(1, nextSpotOpening(spot, time) - time);
  const mean = BASE_SPAWN_INTERVAL / Math.max(0.01, demandRate(ctx.state, spot, time));
  return -Math.log(1 - ctx.random() * 0.999) * mean;
}

/**
 * Ein Stadt-Event fängt an oder hört auf (Auftrag 30): Die Laufkundschaft an den Spots der Stadt richtet sich sofort
 * nach der neuen Nachfrage (der nächste Interessent wird neu ausgewürfelt).
 */
export function onCityEventChanged(ctx: Ctx, cityId: string): void {
  if (activeCity(ctx.state) !== cityId) return;
  const s = ctx.state.modules.customers;
  for (const spot of getSpots(ctx.state, cityId)) {
    const current = s.nextSpawnAt[spot.id];
    if (current === undefined || !Number.isFinite(current)) continue;
    s.nextSpawnAt[spot.id] = Math.min(current, ctx.now + spawnInterval(ctx, spot, ctx.now));
  }
}

/**
 * Umschalten der Städte (Auftrag 30): Wer in der Stadt wartet, die jetzt schläft, geht still (eingefroren, keine
 * Folgen); in der Stadt, die aufwacht, kommt die Laufkundschaft neu in Gang, ohne die Lücke nachzuholen.
 */
export function onCitySwitched(ctx: Ctx, from: string, to: string): void {
  const s = ctx.state.modules.customers;
  s.waiting = s.waiting.filter((c) => cityOfSpot(ctx.state, c.spotId) !== from);
  // Wer in der verlassenen Stadt am Spot stand, steht nach dem Wechsel nirgends mehr.
  if (s.self.spotId && cityOfSpot(ctx.state, s.self.spotId) === from) {
    s.self.spotId = null;
    ctx.emit('customers.selfMoved', { spotId: null });
  }
  for (const spot of getSpots(ctx.state, to)) {
    const current = s.nextSpawnAt[spot.id];
    if (current !== undefined && !Number.isFinite(current)) continue;
    s.nextSpawnAt[spot.id] = ctx.now + ctx.random() * spawnInterval(ctx, spot, ctx.now);
  }
}

export function initialSpawn(ctx: Ctx, spots: readonly Spot[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const spot of spots) next[spot.id] = ctx.now + ctx.random() * spawnInterval(ctx, spot, ctx.now);
  return next;
}

function stockOf(ctx: Ctx) {
  const cityId = activeCity(ctx.state);
  return (productId: string) => getStock(ctx.state, { productId, cityId });
}

/** Ein Interessent kommt an einen Spot. Er kauft nur, was da ist, und nur, wenn ihm der Preis passt. */
function arrive(ctx: Ctx, spot: Spot, at: number): void {
  const state = ctx.state.modules.customers;
  const type = pickWeighted(ctx, CUSTOMER_TYPES, typeWeights(spot, at));
  const { wanted, productId } = chooseProduct(type.id, allProducts(), stockOf(ctx), ctx.random);
  if (!wanted) return;
  const considered = productId ?? wanted;
  const ratio = priceRatio(ctx.state, spot.id, considered);
  // In der Kneipe schauen die Gäste weniger auf den Preis (Etappe 7).
  const sensitivity = type.priceSensitivity * (isKneipe(spot) ? KNEIPE.priceSensitivity : 1);
  if (!acceptsPrice(ratio, sensitivity, ctx.random())) {
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
  // Qualität treibt Nachfrage (Auftrag 32): Verschriene Ware lässt Interessenten abdrehen, gefragte bringt welche mit.
  const quality = qualityDemandFactor(ctx.state, spot.id, productId);
  if (quality < 1 && !ctx.chance(quality)) return;
  const customer = {
    productId,
    amount: Math.min(amount, stockOf(ctx)(productId)),
    typeId: type.id,
    at,
    patience: CUSTOMER_PATIENCE * type.patience,
  };
  addCustomer(ctx, spot, customer);
  if (quality > 1 && ctx.chance(quality - 1)) {
    const waiting = ctx.state.modules.customers.waiting.filter((c) => c.spotId === spot.id).length;
    if (waiting < MAX_CUSTOMERS_PER_SPOT && stockOf(ctx)(productId) >= customer.amount * 2)
      addCustomer(ctx, spot, customer);
  }
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
  sale: {
    typeId: string | undefined;
    quality: number;
    cut: number;
    priceRatio: number;
    where: string;
    /** Spot des Verkaufs: In einer Kneipe zählt der Ruf doppelt (Etappe 7). */
    spotId?: string;
  },
): { satisfaction: number; noticedCut: boolean } {
  const type = customerType(sale.typeId);
  const weight = sale.spotId && isKneipe(getSpot(ctx.state, sale.spotId)) ? KNEIPE.reputationFactor : 1;
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
      satisfaction * REP_PER_SATISFACTION * weight,
      satisfaction > 0 ? 'Zufriedene Kundschaft' : 'Unzufriedene Kundschaft',
    );
  }
  if (noticedCut) {
    ctx.state.modules.customers.stats.cutNoticed += 1;
    changeReputation(ctx, REP_CUT_NOTICED * weight, 'Gestreckte Ware bemerkt');
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
  // Ware aus dem Lager, das dem Spot am nächsten liegt.
  const { taken, quality, cut, unitCost } = take(ctx, {
    productId: customer.productId,
    amount: customer.amount,
    near: spot,
  });
  if (taken === 0) return { ok: false, reason: 'Nicht genug im Lager.' };
  const revenue = Math.round(customer.amount * customer.pricePerUnit);
  wallet.earn(ctx, revenue, 'dirty', `Verkauf ${atSpot(spot)}`, {
    category: 'sales.street',
    spotId: spot.id,
    ...(sellerId ? { staffId: sellerId } : {}),
  });
  state.waiting = state.waiting.filter((c) => c.id !== customer.id);
  state.stats.unitsSold += customer.amount;
  state.stats.revenue += revenue;
  state.stats.customersServed += 1;

  recordSaleQuality(ctx, spot.id, customer.productId, quality);
  const reference = spotReferencePrice(ctx.state, spot.id, customer.productId);
  const rating = rateSale(ctx, {
    typeId: customer.typeId,
    quality,
    cut,
    priceRatio: reference > 0 ? customer.pricePerUnit / reference : 1,
    where: atSpot(spot),
    spotId: spot.id,
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
    goodsCost: Math.round(taken * unitCost),
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
  const kneipe = isKneipe(spot) ? KNEIPE.regularFactor : 1;
  // Auftrag 23: Ein Stammplatz (Ausbau) bringt mehr Stammkunden.
  const place = spotModifiers(ctx.state, spot.id).regularFactor;
  if (!ctx.chance(REGULAR_CHANCE * kneipe * place * type.loyalty * reputationDemandFactor(ctx.state))) return;
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
  journal.add(ctx, `${name} (${type.name}) ist jetzt Stammkunde ${atSpot(spot)}.`, 'good', { spotId: spot.id });
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

/**
 * Ein eigener Spot wird aufgegeben (Auftrag 23): Wer dort wartet, geht; Stammkunden wechseln zum nächsten Spot in
 * derselben Stadt (bis REGULAR_MOVE_METERS entfernt), sonst sind sie weg. Stehst du selbst dort, gehst du.
 */
export function onSpotClosed(ctx: Ctx, spotId: string, where: { lng: number; lat: number }): void {
  const s = ctx.state.modules.customers;
  s.waiting = s.waiting.filter((c) => c.spotId !== spotId);
  delete s.nextSpawnAt[spotId];
  if (s.self.spotId === spotId) s.self.spotId = null;
  for (const regular of s.regulars) {
    if (regular.status !== 'active' || regular.spotId !== spotId) continue;
    const next = getSpots(ctx.state)
      .filter((x) => x.id !== spotId)
      .map((x) => ({ x, d: distanceMeters(x, where) }))
      .filter(({ d }) => d <= REGULAR_MOVE_METERS)
      .sort((a, b) => a.d - b.d || a.x.id.localeCompare(b.x.id))[0]?.x;
    if (next) {
      regular.spotId = next.id;
      journal.add(ctx, `Stammkunde ${regular.name} kauft ab jetzt ${atSpot(next)}.`, 'info', { spotId: next.id });
    } else loseRegular(ctx, regular, 'sein Spot ist zu');
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
    // Stammkunden in der schlafenden Stadt kommen wieder, wenn sie aufwacht (keine Abwanderung im Schlaf).
    if (!spot || !isSpotActive(ctx.state, spot.id) || spotCity(spot) !== activeCity(ctx.state)) {
      scheduleVisit(ctx, regular, ctx.now);
      continue;
    }
    // Geschlossene Spots (Kneipe, Club am Wochenende): Der Stammkunde kommt kurz nach der nächsten Öffnung.
    if (!isSpotOpen(spot, ctx.now)) {
      regular.nextVisitAt = nextSpotOpening(spot, ctx.now) + 30;
      continue;
    }
    const type = customerType(regular.typeId);
    const stock = getStock(ctx.state, { productId: regular.productId, cityId: spotCity(spot) });
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

/** So lange nach einem Eintrag "Kunde ist abgehauen" kommt für denselben Spot kein neuer. */
const LOSS_JOURNAL_INTERVAL = 60;
const LOSS_JOURNAL_MARK = 'ist gegangen:';

/** Warum ein Kunde ohne Ware gegangen ist, damit man im Journal versteht, was zu tun ist. */
function lossReason(ctx: Ctx, c: { productId: string; amount: number; spotId: string }): string {
  if (getStock(ctx.state, { productId: c.productId, cityId: cityOfSpot(ctx.state, c.spotId) }) <= 0)
    return 'Lager leer, nachbestellen';
  return 'niemand hat rechtzeitig verkauft';
}

function recentlyReportedLoss(ctx: Ctx, spotId: string): boolean {
  return journal
    .entries(ctx.state)
    .some(
      (e) =>
        e.source === 'customers' &&
        e.ref?.spotId === spotId &&
        e.text.includes(LOSS_JOURNAL_MARK) &&
        ctx.now - e.time < LOSS_JOURNAL_INTERVAL,
    );
}

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
      journal.add(ctx, `Stammkunde ${regular.name} hat ${spot ? atSpot(spot) : 'am Spot'} umsonst gewartet.`, 'bad', {
        spotId: c.spotId,
      });
      regular.satisfaction = Math.max(0, Math.round((regular.satisfaction - 0.25) * 100) / 100);
      if (regular.satisfaction < REGULAR_LOST_BELOW) loseRegular(ctx, regular, 'zu lange gewartet');
    } else if (!recentlyReportedLoss(ctx, c.spotId)) {
      // Höchstens ein Eintrag pro Spot und Stunde, sonst verdrängt das alles andere im Journal.
      journal.add(ctx, `Kunde ${spot ? atSpot(spot) : 'am Spot'} ${LOSS_JOURNAL_MARK} ${lossReason(ctx, c)}.`, 'bad', {
        spotId: c.spotId,
      });
    }
    changeReputation(ctx, REP_CUSTOMER_LOST * (isKneipe(spot) ? KNEIPE.reputationFactor : 1), 'Kunden warten lassen');
    ctx.emit('customer.left', {
      customerId: c.id,
      spotId: c.spotId,
      productId: c.productId,
      amount: c.amount,
      ...(spot ? { veedelId: spot.veedelId } : {}),
    });
  }
}

/**
 * Du stehst selbst an einem Spot: Du bedienst die Kunden dort nacheinander, wie ein Läufer, nur schneller. Solange
 * du mit einer Lieferung oder Fahrt unterwegs bist, wartet der Spot.
 */
function serveInPerson(ctx: Ctx): void {
  const self = ctx.state.modules.customers.self;
  if (!self.spotId || self.busyUntil > ctx.now) return;
  if (!isSpotActive(ctx.state, self.spotId)) {
    self.spotId = null;
    return;
  }
  if (isPlayerAway(ctx.state)) return;
  // Nur Kunden, für die das Lager der Stadt reicht; scheitert einer trotzdem, kommt der nächste dran.
  const cityId = cityOfSpot(ctx.state, self.spotId);
  const candidates = ctx.state.modules.customers.waiting
    .filter((c) => c.spotId === self.spotId)
    .sort((a, b) => a.expiresAt - b.expiresAt)
    .filter((c) => getStock(ctx.state, { productId: c.productId, cityId }) >= c.amount);
  for (const customer of candidates) {
    if (serve(ctx, customer.id, null).ok) {
      self.busyUntil = ctx.now + PLAYER_SERVE_TIME;
      return;
    }
  }
}

/** Bist du gerade unterwegs (Lieferung oder Fahrt) und nicht am Spot? */
export function isPlayerAway(state: GameState): boolean {
  return (
    state.modules.customers.orders.some((o) => o.status === 'enRoute' && o.deliveredBy === 'player') ||
    isPlayerOnTheRoad(state)
  );
}

export function streetTick(ctx: Ctx): void {
  const state = ctx.state.modules.customers;
  const now = ctx.now;
  expireCustomers(ctx);
  // Kunden nur in der Stadt, die live ist (Auftrag 30); die schlafende ist eingefroren.
  for (const spot of getSpots(ctx.state, activeCity(ctx.state))) {
    let next = state.nextSpawnAt[spot.id] ?? now;
    while (next <= now) {
      // Kneipe zu: Der nächste Gast kommt frühestens zur Öffnung.
      if (!isSpotOpen(spot, next)) {
        next = Math.max(next + 1, nextSpotOpening(spot, next) + ctx.random() * BASE_SPAWN_INTERVAL);
        continue;
      }
      const waiting = state.waiting.filter((c) => c.spotId === spot.id).length;
      if (waiting < MAX_CUSTOMERS_PER_SPOT) arrive(ctx, spot, next);
      next += spawnInterval(ctx, spot, next);
    }
    state.nextSpawnAt[spot.id] = next;
  }
  visitRegulars(ctx);
  serveInPerson(ctx);
}
