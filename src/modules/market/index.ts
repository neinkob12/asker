// Markt: Richtpreis pro Produkt und Veedel und eigene Preise pro Spot.
// Richtpreis = Grundpreis × Kaufkraft-Faktor (veedel) × Angebot/Nachfrage × Konkurrenzfaktor (setzen die Gangs).
// Angebot und Nachfrage entstehen aus den Verkäufen ('sale.completed') und aus Kunden, die nichts bekommen
// ('customer.left', 'customer.missed'), und gleichen sich stündlich wieder aus.
// Eigene Preise setzt der Spieler pro Spot und Produkt (Befehl 'market.setPrice'); ohne eigenen Preis gilt der
// Richtpreis am Spot. Wie Kunden auf den Preis reagieren, entscheidet das customers-Modul.
//
// Öffentliche API:
//   referencePrice(state, productId, veedelId), averageReferencePrice(state, productId),
//   purchasingPowerFactor(veedelId), supplyDemandFactor(state, productId, veedelId), getPressure(...),
//   getCompetitionFactor(state, veedelId), setCompetitionFactor(ctx, veedelId, factor) (für die Gangs),
//   spotReferencePrice(state, spotId, productId), getSpotPrice(state, spotId, productId),
//   hasOwnPrice(state, spotId, productId), priceRatio(state, spotId, productId), roundPrice(price)
// Befehle: 'market.setPrice'
// Ereignisse: 'market.competitionChanged', 'market.priceSet'

import { type CommandResult, type Ctx, defineModule, formatEuro, type GameState } from '../../core';
import { getProduct } from '../goods';
import { getSpot } from '../spots';
import { allVeedel, getVeedel } from '../veedel';
import {
  LOST_CUSTOMER_WEIGHT,
  MAX_COMPETITION_FACTOR,
  MAX_PRICE_FACTOR,
  MIN_COMPETITION_FACTOR,
  PRESSURE_DECAY,
  PRICE_STEP,
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
}

interface MarketStateV1 {
  competition: Record<string, number>;
}

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
    getCompetitionFactor(state, veedelId)
  );
}

/** Mittlerer Richtpreis über alle Veedel (z.B. für den Großhandel). */
export function averageReferencePrice(state: GameState, productId: string): number {
  const veedel = allVeedel();
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
  version: 2,
  dependsOn: ['goods', 'veedel'],
  init: () => ({ competition: {}, pressure: {}, prices: {} }),
  tickEvery: 60,
  tick: decay,
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
    2: (old: MarketStateV1): MarketState => ({ competition: old.competition, pressure: {}, prices: {} }),
  },
});
