// Markt: Richtpreis pro Produkt und Veedel und eigene Preise pro Spot.
// Richtpreis = Grundpreis × Kaufkraft-Faktor (veedel) × Angebot/Nachfrage × Konkurrenzfaktor (setzen die Gangs).
// Angebot und Nachfrage entstehen aus den Verkäufen ('sale.completed') und aus Kunden, die nichts bekommen
// ('customer.left', 'customer.missed'), und gleichen sich stündlich wieder aus.
// Eigene Preise setzt der Spieler pro Spot und Produkt (Befehl 'market.setPrice'); ohne eigenen Preis gilt der
// Richtpreis am Spot. Wie Kunden auf den Preis reagieren, entscheidet das customers-Modul.
// Preisindex (Auftrag 32): Pro Stadt und Produkt ein Faktor um 1, der um Mitternacht einen Schritt eines Zufallspfads
// mit Rückkehr zur Mitte macht (INDEX_MIN bis INDEX_MAX), in allen Städten, auch den schlafenden. Richtpreise
// multiplizieren damit, der Einkauf bei den Lieferanten mit halben Ausschlägen (purchaseIndex).
//
// Öffentliche API:
//   referencePrice(state, productId, veedelId), averageReferencePrice(state, productId),
//   purchasingPowerFactor(veedelId), supplyDemandFactor(state, productId, veedelId), getPressure(...),
//   getCompetitionFactor(state, veedelId), setCompetitionFactor(ctx, veedelId, factor) (für die Gangs),
//   spotReferencePrice(state, spotId, productId), getSpotPrice(state, spotId, productId),
//   hasOwnPrice(state, spotId, productId), priceRatio(state, spotId, productId), roundPrice(price),
//   priceIndex(state, productId, cityId?), purchaseIndex(state, productId, cityId?), indexTrend(state, productId, cityId?)
// Befehle: 'market.setPrice'
// Ereignisse: 'market.competitionChanged', 'market.priceSet'

import { type CommandResult, type Ctx, defineModule, formatEuro, type GameState, MINUTES_PER_DAY } from '../../core';
import { activeCity, isVeedelLive, playableCities } from '../city';
import { allProducts, getProduct } from '../goods';
import { getSpot } from '../spots';
import { allVeedel, getVeedel, veedelCity } from '../veedel';
import {
  INDEX_CHIP_FROM,
  INDEX_MAX,
  INDEX_MIN,
  INDEX_REVERSION,
  INDEX_STEP,
  LOST_CUSTOMER_WEIGHT,
  MAX_COMPETITION_FACTOR,
  MAX_PRICE_FACTOR,
  MIN_COMPETITION_FACTOR,
  PRESSURE_DECAY,
  PRICE_STEP,
  PURCHASE_INDEX_SHARE,
  PURCHASING_POWER_WEIGHT,
  SATURATION_EUR,
  SUPPLY_DEMAND_RANGE,
} from './config';

export interface MarketState {
  /** Preisfaktor durch Konkurrenz pro Veedel. 1 = neutral, 0,8 = Preise um 20 % gedrückt. */
  competition: Record<string, number>;
  /** Angebot/Nachfrage pro Veedel und Produkt: > 0 mehr Nachfrage als Ware, < 0 Markt gesättigt. */
  pressure: Record<string, Record<string, number>>;
  /** Eigene Preise: Spot-ID → Produkt-ID → Euro pro Einheit. */
  prices: Record<string, Record<string, number>>;
  /** Preisindex (Auftrag 32): Stadt → Produkt → Faktor (fehlt = 1). */
  index: Record<string, Record<string, number>>;
}

interface MarketStateV1 {
  competition: Record<string, number>;
}

type MarketStateV2 = Omit<MarketState, 'index'>;

declare module '../../core' {
  interface ModuleStates {
    market: MarketState;
  }
  interface GameCommands {
    /** Eigenen Preis pro Einheit setzen, null = zurück zum Richtpreis. */
    'market.setPrice': { spotId: string; productId: string; price: number | null };
  }
  interface GameEvents {
    'market.competitionChanged': { veedelId: string; factor: number };
    'market.priceSet': { spotId: string; productId: string; price: number | null };
  }
}

// ---------------------------------------------------------------------------------------------
// Richtpreis

/** Wirkung der Kaufkraft eines Veedels auf den Preis. */
export function purchasingPowerFactor(veedelId: string): number {
  const purchasingPower = getVeedel(veedelId)?.purchasingPower ?? 1;
  return Math.max(0.3, 1 + (purchasingPower - 1) * PURCHASING_POWER_WEIGHT);
}

export function getPressure(state: GameState, productId: string, veedelId: string): number {
  return state.modules.market.pressure[veedelId]?.[productId] ?? 0;
}

/** Wirkung von Angebot und Nachfrage (0,75 bis 1,25). */
export function supplyDemandFactor(state: GameState, productId: string, veedelId: string): number {
  return 1 + SUPPLY_DEMAND_RANGE * Math.tanh(getPressure(state, productId, veedelId));
}

export function getCompetitionFactor(state: GameState, veedelId: string): number {
  return state.modules.market.competition[veedelId] ?? 1;
}

/** Richtpreis in Euro pro Einheit. */
export function referencePrice(state: GameState, productId: string, veedelId: string): number {
  const product = getProduct(productId);
  if (!product) return 0;
  return (
    product.basePrice *
    purchasingPowerFactor(veedelId) *
    supplyDemandFactor(state, productId, veedelId) *
    getCompetitionFactor(state, veedelId) *
    priceIndex(state, productId, veedelCity(veedelId))
  );
}

// ---------------------------------------------------------------------------------------------
// Preisindex (Auftrag 32)

/** Der gewürfelte Teil des Index (ohne Marktereignisse). */
export function driftIndex(state: GameState, productId: string, cityId: string = activeCity(state)): number {
  return state.modules.market.index?.[cityId]?.[productId] ?? 1;
}

/** Preisindex eines Produkts in einer Stadt (1 = normal, 1,08 = acht Prozent teurer). */
export function priceIndex(state: GameState, productId: string, cityId: string = activeCity(state)): number {
  return clampIndex(driftIndex(state, productId, cityId));
}

/** Wie der Index den Einkauf trifft: gedämpft (PURCHASE_INDEX_SHARE), damit die Marge nicht kippt. */
export function purchaseIndex(state: GameState, productId: string, cityId: string = activeCity(state)): number {
  return 1 + (priceIndex(state, productId, cityId) - 1) * PURCHASE_INDEX_SHARE;
}

/**
 * Für die Oberfläche: Abweichung des Index ab INDEX_CHIP_FROM als Text, z.B. "Gras ↑ 8 %", sonst null.
 * up: der Preis steigt (für den Verkauf gut, für den Einkauf schlecht).
 */
export function indexTrend(
  state: GameState,
  productId: string,
  cityId: string = activeCity(state),
): { change: number; up: boolean; label: string } | null {
  const change = priceIndex(state, productId, cityId) - 1;
  if (Math.abs(change) < INDEX_CHIP_FROM) return null;
  const pct = Math.round(Math.abs(change) * 100);
  const name = getProduct(productId)?.name ?? productId;
  return { change, up: change > 0, label: `${name} ${change > 0 ? '↑' : '↓'} ${pct} %` };
}

function clampIndex(value: number): number {
  return Math.min(INDEX_MAX, Math.max(INDEX_MIN, value));
}

/** Ein Tagesschritt des Index in allen Städten (auch den schlafenden): Rückkehr zur Mitte plus Zufall. */
function stepIndex(ctx: Ctx): void {
  const market = ctx.state.modules.market;
  for (const city of playableCities()) {
    market.index[city.id] ??= {};
    const row = market.index[city.id];
    for (const product of allProducts()) {
      const now = row[product.id] ?? 1;
      const next = 1 + (now - 1) * (1 - INDEX_REVERSION) + (ctx.random() * 2 - 1) * INDEX_STEP;
      row[product.id] = Math.round(clampIndex(next) * 1000) / 1000;
    }
  }
}

/** Mittlerer Richtpreis über alle Veedel einer Stadt (Standard: die aktive; z.B. für den Großhandel). */
export function averageReferencePrice(state: GameState, productId: string, cityId: string = activeCity(state)): number {
  const veedel = allVeedel(cityId);
  if (veedel.length === 0) return getProduct(productId)?.basePrice ?? 0;
  return veedel.reduce((sum, v) => sum + referencePrice(state, productId, v.id), 0) / veedel.length;
}

// ---------------------------------------------------------------------------------------------
// Preise am Spot

/** Auf die Schrittweite gerundeter Preis (mindestens ein Schritt). */
export function roundPrice(price: number): number {
  return Math.max(PRICE_STEP, Math.round(price / PRICE_STEP) * PRICE_STEP);
}

/** Richtpreis am Spot (Richtpreis des Veedels × Preisniveau des Spots). */
export function spotReferencePrice(state: GameState, spotId: string, productId: string): number {
  const spot = getSpot(state, spotId);
  if (!spot) return 0;
  return referencePrice(state, productId, spot.veedelId) * spot.priceMultiplier;
}

export function hasOwnPrice(state: GameState, spotId: string, productId: string): boolean {
  return state.modules.market.prices[spotId]?.[productId] !== undefined;
}

/** Preis pro Einheit, zu dem am Spot verkauft wird: eigener Preis oder gerundeter Richtpreis. */
export function getSpotPrice(state: GameState, spotId: string, productId: string): number {
  return state.modules.market.prices[spotId]?.[productId] ?? roundPrice(spotReferencePrice(state, spotId, productId));
}

/** Eigener Preis im Verhältnis zum Richtpreis am Spot (1 = genau Richtpreis, 1,2 = 20 % teurer). */
export function priceRatio(state: GameState, spotId: string, productId: string): number {
  const reference = spotReferencePrice(state, spotId, productId);
  return reference > 0 ? getSpotPrice(state, spotId, productId) / reference : 1;
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/** Konkurrenzdruck setzen, z.B. wenn eine Gang die Preise drückt. */
export function setCompetitionFactor(ctx: Ctx, veedelId: string, factor: number): void {
  const clamped = Math.min(MAX_COMPETITION_FACTOR, Math.max(MIN_COMPETITION_FACTOR, factor));
  ctx.state.modules.market.competition[veedelId] = clamped;
  ctx.emit('market.competitionChanged', { veedelId, factor: clamped });
}

function setPrice(ctx: Ctx, spotId: string, productId: string, price: number | null): CommandResult {
  const spot = getSpot(ctx.state, spotId);
  const product = getProduct(productId);
  if (!spot || !product) return { ok: false, reason: 'Unbekannter Spot oder unbekannte Ware.' };
  const prices = ctx.state.modules.market.prices;
  if (price === null) {
    if (prices[spotId]) {
      delete prices[spotId][productId];
      if (Object.keys(prices[spotId]).length === 0) delete prices[spotId];
    }
    ctx.emit('market.priceSet', { spotId, productId, price: null });
    return { ok: true };
  }
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'Ungültiger Preis.' };
  const max = product.basePrice * MAX_PRICE_FACTOR;
  if (price > max) return { ok: false, reason: `Mehr als ${formatEuro(max)} pro ${product.unit} zahlt keiner.` };
  const rounded = roundPrice(price);
  prices[spotId] ??= {};
  prices[spotId][productId] = rounded;
  ctx.emit('market.priceSet', { spotId, productId, price: rounded });
  return { ok: true, data: { price: rounded } };
}

/** Druck verschieben: positive Menge = Nachfrage, negative = Angebot. */
function shiftPressure(ctx: Ctx, veedelId: string, productId: string, amount: number): void {
  const product = getProduct(productId);
  if (!product || !veedelId || amount === 0) return;
  const pressure = ctx.state.modules.market.pressure;
  pressure[veedelId] ??= {};
  const value = (pressure[veedelId][productId] ?? 0) + (amount * product.basePrice) / SATURATION_EUR;
  pressure[veedelId][productId] = Math.round(value * 10000) / 10000;
}

function decay(ctx: Ctx): void {
  const pressure = ctx.state.modules.market.pressure;
  for (const [veedelId, products] of Object.entries(pressure)) {
    // Die schlafende Stadt ist eingefroren (Auftrag 30).
    if (!isVeedelLive(ctx.state, veedelId)) continue;
    for (const [productId, value] of Object.entries(products)) {
      const next = Math.round(value * PRESSURE_DECAY * 10000) / 10000;
      if (Math.abs(next) < 0.001) delete products[productId];
      else products[productId] = next;
    }
    if (Object.keys(products).length === 0) delete pressure[veedelId];
  }
}

export default defineModule({
  id: 'market',
  version: 3,
  dependsOn: ['goods', 'veedel'],
  init: () => ({ competition: {}, pressure: {}, prices: {}, index: {} }),
  tickEvery: 60,
  tick: (ctx) => {
    decay(ctx);
    if (ctx.now % MINUTES_PER_DAY === 0) stepIndex(ctx);
  },
  commands: {
    'market.setPrice': (ctx, { spotId, productId, price }) => setPrice(ctx, spotId, productId, price),
  },
  on: {
    'sale.completed': (ctx, { veedelId, productId, amount }) => shiftPressure(ctx, veedelId, productId, -amount),
    'customer.left': (ctx, { veedelId, productId, amount }) => {
      if (veedelId && productId && amount) shiftPressure(ctx, veedelId, productId, amount * LOST_CUSTOMER_WEIGHT);
    },
    'customer.missed': (ctx, { veedelId, productId, amount }) => shiftPressure(ctx, veedelId, productId, amount),
  },
  migrations: {
    2: (old: MarketStateV1): MarketStateV2 => ({ competition: old.competition, pressure: {}, prices: {} }),
    // Version 3 (Auftrag 32): Preisindex, alte Stände fangen bei 1 an.
    3: (old: MarketStateV2): MarketState => ({ ...old, index: {} }),
  },
});
