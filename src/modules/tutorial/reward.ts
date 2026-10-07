// Belohnungsregel der Missionen (Auftrag 46): 20 % des Umsatzes der letzten 24 Stunden als Schwarzgeld und 20 % der
// in den letzten 24 Stunden verkauften Gramm als Ware, in dem Produkt, das am meisten verkauft wurde. Geld wird auf
// 50 € (unter 1.000 €) bzw. 100 € aufgerundet, Ware auf 5 g (unter 100 g) bzw. 10 g; mindestens 100 € und 10 g.
// Die Verkäufe merkt sich das Modul selbst (sales im Zustand, aus 'sale.completed'), das ist genauer als Tagesbuch
// oder Tagesschnitt und hängt an keinem anderen Modul.

import type { GameState } from '../../core';
import { DEFAULT_PRODUCT } from '../goods';
import { REWARD } from './config';

/** Ein Verkauf der letzten 24 Stunden (für die Belohnung). */
export interface SaleRecord {
  at: number;
  revenue: number;
  productId: string;
  amount: number;
}

export interface MissionReward {
  money: number;
  productId: string;
  amount: number;
}

function roundUp(value: number, rule: { smallBelow: number; smallStep: number; bigStep: number; min: number }): number {
  const step = value < rule.smallBelow ? rule.smallStep : rule.bigStep;
  return Math.max(rule.min, Math.ceil(value / step) * step);
}

/** Geld nach der Regel: Anteil, aufgerundet, Untergrenze. */
export function rewardMoney(revenue24h: number): number {
  return roundUp(Math.max(0, revenue24h) * REWARD.share, REWARD.money);
}

/** Ware nach der Regel: Anteil der Gramm, aufgerundet, Untergrenze. */
export function rewardGoods(grams24h: number): number {
  return roundUp(Math.max(0, grams24h) * REWARD.share, REWARD.goods);
}

/** Verkäufe, die noch zählen (die letzten REWARD.hours Stunden). */
export function recentSales(state: GameState): readonly SaleRecord[] {
  const sales = state.modules.tutorial?.sales ?? [];
  const since = state.time - REWARD.hours * 60;
  return sales.filter((s) => s.at > since);
}

/** Belohnung der laufenden Mission, live aus den Verkäufen der letzten 24 Stunden. */
export function missionReward(state: GameState): MissionReward {
  const sales = recentSales(state);
  let revenue = 0;
  let grams = 0;
  const byProduct = new Map<string, number>();
  for (const s of sales) {
    revenue += s.revenue;
    grams += s.amount;
    byProduct.set(s.productId, (byProduct.get(s.productId) ?? 0) + s.amount);
  }
  let productId = DEFAULT_PRODUCT;
  let best = 0;
  // Bei Gleichstand das zuerst verkaufte Produkt (feste Reihenfolge, kein Zufall).
  for (const [id, amount] of byProduct) {
    if (amount > best) {
      best = amount;
      productId = id;
    }
  }
  return { money: rewardMoney(revenue), productId, amount: rewardGoods(grams) };
}
