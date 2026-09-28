// Kundenentscheidungen als reine Funktionen (ohne Zustand, gut testbar):
// Wer kommt wann, was will er, ist ihm der Preis recht, wie zufrieden geht er, kommt ein Stammkunde wieder?

import type { Product } from '../goods';
import {
  CHEAP_ATTRACTION,
  CUSTOMER_TYPES,
  CUT_NOTICE_FACTOR,
  FALLBACK_TYPE,
  MAX_CHEAP_BOOST,
  OFF_PEAK,
  PRICE_ELASTICITY,
  REGULAR_LOST_BELOW,
  REGULAR_PRICE_TOLERANCE,
  SUBSTITUTE_CHANCE,
} from './config';
import type { CustomerType, Regular } from './index';

export function customerType(id: string | undefined): CustomerType {
  return (
    CUSTOMER_TYPES.find((t) => t.id === id) ?? (CUSTOMER_TYPES.find((t) => t.id === FALLBACK_TYPE) as CustomerType)
  );
}

/** Liegt die Stunde in der Hauptzeit [von, bis)? Auch über Mitternacht (z.B. [21, 4]). */
export function inPeak(hour: number, [from, to]: readonly [number, number]): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Wie stark ein Kundentyp an diesem Spot zu dieser Zeit vertreten ist. */
export function typeDemandWeight(
  type: CustomerType,
  audience: Readonly<Record<string, number>> | undefined,
  hour: number,
  weekday: number,
): number {
  return (
    type.share * (audience?.[type.id] ?? 1) * (inPeak(hour, type.peakHours) ? 1 : OFF_PEAK) * type.weekdays[weekday]
  );
}

/**
 * Wirkung des Preises auf die Kundschaft: 1 beim Richtpreis, darunter mehr (bis MAX_CHEAP_BOOST),
 * darüber weniger. ratio = eigener Preis / Richtpreis, sensitivity = Preisempfindlichkeit des Typs.
 */
export function priceDemandFactor(ratio: number, sensitivity: number): number {
  if (ratio >= 1) return Math.exp(-PRICE_ELASTICITY * sensitivity * (ratio - 1));
  return Math.min(MAX_CHEAP_BOOST, 1 + CHEAP_ATTRACTION * sensitivity * (1 - ratio));
}

/** Kauft ein Interessent zu diesem Preis? roll ist eine Zufallszahl in [0, 1). */
export function acceptsPrice(ratio: number, sensitivity: number, roll: number): boolean {
  return roll < priceDemandFactor(ratio, sensitivity) / MAX_CHEAP_BOOST;
}

/** Produkte, die ein Kundentyp kauft. */
export function productsFor(typeId: string, products: readonly Product[]): Product[] {
  return products.filter((p) => p.audiences.includes(typeId));
}

/**
 * Welches Produkt will der Kunde, und welches bekommt er? wanted ist sein Wunsch. Ist der nicht auf Lager,
 * nimmt er mit SUBSTITUTE_CHANCE etwas anderes aus seinem Geschmack, das da ist; sonst productId = null.
 */
export function chooseProduct(
  typeId: string,
  products: readonly Product[],
  stockOf: (productId: string) => number,
  random: () => number,
): { wanted: string; productId: string | null } {
  const options = productsFor(typeId, products);
  if (options.length === 0) return { wanted: '', productId: null };
  const wanted = options[Math.floor(random() * options.length)].id;
  if (stockOf(wanted) > 0) return { wanted, productId: wanted };
  const available = options.filter((p) => stockOf(p.id) > 0);
  if (available.length === 0 || random() >= SUBSTITUTE_CHANCE) return { wanted, productId: null };
  return { wanted, productId: available[Math.floor(random() * available.length)].id };
}

/** Chance, dass ein Kunde Streckmittel bemerkt. */
export function cutNoticeChance(cut: number, expertise: number): number {
  return Math.min(0.95, Math.max(0, cut) * CUT_NOTICE_FACTOR * expertise);
}

/**
 * Zufriedenheit nach dem Kauf (-1 bis 1): Qualität gegen Erwartung, bemerktes Streckmittel und
 * ein deutlich überhöhter Preis drücken sie.
 */
export function saleSatisfaction(input: {
  quality: number;
  expectation: number;
  noticedCut: boolean;
  priceRatio: number;
}): number {
  let s = Math.min(0.6, Math.max(-1, (input.quality - input.expectation) * 2.5));
  if (input.noticedCut) s -= 0.6;
  if (input.priceRatio > 1.25) s -= 0.2;
  return Math.round(Math.min(1, Math.max(-1, s)) * 100) / 100;
}

export type RegularVerdict = 'visit' | 'skip' | 'quit';

/**
 * Kommt ein Stammkunde vorbei? Er erinnert sich an den letzten Preis: Ist es deutlich teurer geworden, sinkt
 * seine Zufriedenheit und er bleibt weg; ist sie zu tief, kommt er gar nicht mehr. Ohne seine Ware kommt er
 * diesmal nicht.
 */
export function regularVerdict(
  regular: Pick<Regular, 'lastPrice' | 'satisfaction'>,
  type: CustomerType,
  now: { price: number; available: boolean },
): { verdict: RegularVerdict; satisfaction: number; reason?: string } {
  const tolerance = REGULAR_PRICE_TOLERANCE / Math.max(0.2, type.priceSensitivity);
  if (now.price > regular.lastPrice * (1 + tolerance)) {
    const satisfaction = round2(regular.satisfaction - 0.15);
    if (satisfaction < REGULAR_LOST_BELOW) return { verdict: 'quit', satisfaction, reason: 'zu teuer geworden' };
    return { verdict: 'skip', satisfaction, reason: 'zu teuer' };
  }
  if (!now.available)
    return { verdict: 'skip', satisfaction: round2(regular.satisfaction - 0.05), reason: 'nichts da' };
  return { verdict: 'visit', satisfaction: regular.satisfaction };
}

/** Neue Zufriedenheit eines Stammkunden nach einem Kauf. Er vergleicht mit dem, was er letztes Mal bekam. */
export function regularAfterSale(
  regular: Pick<Regular, 'lastPrice' | 'lastQuality' | 'satisfaction'>,
  type: CustomerType,
  sale: { price: number; quality: number; noticedCut: boolean },
): number {
  let delta = 0.08;
  if (sale.quality < regular.lastQuality - 0.08) delta -= 0.25;
  if (sale.quality < type.qualityExpectation - 0.1) delta -= 0.1;
  if (sale.noticedCut) delta -= 0.3;
  if (sale.price < regular.lastPrice * 0.95) delta += 0.05;
  return round2(Math.min(1, Math.max(0, regular.satisfaction + delta)));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
