// Qualität treibt Nachfrage (Auftrag 32): Jeder Straßenverkauf schiebt den gleitenden Schnitt der Qualität dieser Ware
// an diesem Spot. Daraus ein Faktor auf die Nachfrage nach der Ware dort: Premium bis +25 %, Dreck bis −33 %, Solide
// bleibt bei 1. Wirkt beim Eintreffen eines Interessenten (street.ts): Unter 1 dreht er mit der Gegenwahrscheinlichkeit
// wieder ab, über 1 bringt er mit dem Überschuss als Chance noch jemanden mit.

import type { Ctx, GameState } from '../../core';
import { getProduct } from '../goods';
import {
  QUALITY_CHIP_FROM,
  QUALITY_DEMAND_MAX,
  QUALITY_DEMAND_MIN,
  QUALITY_MEMORY,
  QUALITY_NEUTRAL,
  QUALITY_PREMIUM_AT,
  QUALITY_TRASH_AT,
} from './config';

/** Gleitender Schnitt der Qualität der letzten Verkäufe einer Ware am Spot, oder null ohne Verkäufe. */
export function spotQuality(state: GameState, spotId: string, productId: string): number | null {
  return state.modules.customers.quality?.[spotId]?.[productId] ?? null;
}

/** Faktor aus einem Qualitätsschnitt (rein, für Tests und Anzeige). */
export function qualityDemandFor(quality: number | null): number {
  if (quality === null) return 1;
  const [low, high] = QUALITY_NEUTRAL;
  if (quality > high) {
    const t = Math.min(1, (quality - high) / (QUALITY_PREMIUM_AT - high));
    return 1 + t * (QUALITY_DEMAND_MAX - 1);
  }
  if (quality < low) {
    const t = Math.min(1, (low - quality) / (low - QUALITY_TRASH_AT));
    return 1 - t * (1 - QUALITY_DEMAND_MIN);
  }
  return 1;
}

/** Faktor auf die Nachfrage nach einer Ware an einem Spot (1 = normal). */
export function qualityDemandFactor(state: GameState, spotId: string, productId: string): number {
  return qualityDemandFor(spotQuality(state, spotId, productId));
}

/** Für die Oberfläche: Waren, die am Spot gefragt oder verschrien sind (ab QUALITY_CHIP_FROM). */
export function spotReputation(
  state: GameState,
  spotId: string,
): { productId: string; factor: number; label: string; good: boolean }[] {
  const row = state.modules.customers.quality?.[spotId] ?? {};
  return Object.keys(row)
    .map((productId) => ({ productId, factor: qualityDemandFactor(state, spotId, productId) }))
    .filter((r) => Math.abs(r.factor - 1) >= QUALITY_CHIP_FROM)
    .sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))
    .map((r) => {
      const name = getProduct(r.productId)?.name ?? r.productId;
      const good = r.factor > 1;
      return { ...r, good, label: `${name} ${good ? 'gefragt' : 'verschrien'}` };
    });
}

/** Ein Straßenverkauf am Spot: Qualität in den gleitenden Schnitt. */
export function recordSaleQuality(ctx: Ctx, spotId: string, productId: string, quality: number): void {
  const all = ctx.state.modules.customers.quality;
  all[spotId] ??= {};
  const before = all[spotId][productId];
  const next = before === undefined ? quality : before + (quality - before) * QUALITY_MEMORY;
  all[spotId][productId] = Math.round(next * 1000) / 1000;
}
