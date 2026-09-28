// Ware: Produkte und Bestand pro Lager. Der Bestand besteht aus Posten (Lots) mit eigener Qualität,
// Streckanteil und Einkaufspreis. Vorerst gibt es ein Lager, die Datenstruktur erlaubt mehrere.
//
// Öffentliche API:
//   allProducts(), getProduct(id), productName(id), getWarehouses(state), getWarehouse(state, id),
//   getStock(state, filter), getLots(state, filter), stockSummary(state, warehouseId?), averageQuality(state, filter),
//   qualityTier(quality), cutPreview(lot, ratio), store(ctx, {...}), take(ctx, {...}), cutLot(ctx, {...}),
//   QUALITY_TIERS, CUT_STEPS, MAX_CUT, DEFAULT_PRODUCT, DEFAULT_WAREHOUSE, STANDARD_QUALITY
// Befehle: 'goods.cut'
// Ereignisse: 'goods.stored', 'goods.taken', 'goods.cut'

import { type CommandResult, type Ctx, defineModule, formatAmount, type GameState, journal, wallet } from '../../core';
import {
  CUT_AGENT_COST,
  CUT_QUALITY_LOSS,
  DEFAULT_PRODUCT,
  DEFAULT_WAREHOUSE,
  MAX_CUT,
  PRODUCTS,
  QUALITY_TIERS,
  STANDARD_QUALITY,
  START_QUALITY,
  START_STOCK,
  START_UNIT_COST,
  WAREHOUSES,
} from './config';

export { CUT_STEPS, DEFAULT_PRODUCT, DEFAULT_WAREHOUSE, MAX_CUT, QUALITY_TIERS, STANDARD_QUALITY } from './config';

export type ProductCategory = 'flower' | 'hash' | 'edible' | 'oil' | 'vape';

export interface Product {
  id: string;
  name: string;
  /** Verkaufseinheit, z.B. 'g', 'Stück', 'ml'. */
  unit: string;
  /** Grundpreis pro Einheit auf der Straße in Euro. */
  basePrice: number;
  category: ProductCategory;
  /** Lässt sich strecken (Edibles und Vapes sind abgepackt). */
  cuttable: boolean;
  /** Zielgruppen: IDs der Kundentypen (customers), die das Produkt kaufen. */
  audiences: readonly string[];
  /** Übliche Menge eines Straßenkunden [von, bis]. */
  typicalAmount: readonly [number, number];
}

export interface Warehouse {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

/** Ein Warenposten im Lager. */
export interface StockLot {
  id: number;
  productId: string;
  amount: number;
  /** 0 (Dreck) bis 1 (beste Ware). */
  quality: number;
  /** Anteil Streckmittel an der Menge (0 = rein). */
  cut: number;
  /** Einkaufspreis pro Einheit (Durchschnitt, für die Marge). */
  unitCost: number;
}

export interface QualityTier {
  id: string;
  name: string;
  /** Untergrenze der Qualität (0–1). */
  min: number;
}

export interface GoodsState {
  /** Bestand: Lager-ID → Posten, älteste zuerst. */
  stock: Record<string, StockLot[]>;
}

/** Zustand bis Version 1: Lager-ID → Produkt-ID → Menge. */
interface GoodsStateV1 {
  stock: Record<string, Record<string, number>>;
}

export interface StockFilter {
  productId?: string;
  warehouseId?: string;
}

export interface StoreRequest {
  productId: string;
  amount: number;
  warehouseId?: string;
  quality?: number;
  cut?: number;
  unitCost?: number;
}

export interface TakeRequest {
  productId: string;
  amount: number;
  /** Ohne Angabe: erst das Standardlager, dann die übrigen. */
  warehouseId?: string;
  /** true: so viel wie da ist nehmen (Diebstahl, Beschlagnahme). false: alles oder nichts. */
  partial?: boolean;
  /** Nur aus diesem Posten nehmen. */
  lotId?: number;
}

export interface TakeResult {
  taken: number;
  /** Qualität der entnommenen Ware (0–1, Mittel nach Menge). */
  quality: number;
  /** Streckanteil der entnommenen Ware (Mittel nach Menge). */
  cut: number;
  /** Einkaufspreis pro Einheit (Mittel nach Menge). */
  unitCost: number;
}

export interface StockSummaryRow {
  productId: string;
  amount: number;
  quality: number;
  cut: number;
  unitCost: number;
}

declare module '../../core' {
  interface ModuleStates {
    goods: GoodsState;
  }
  interface GameCommands {
    /** Posten strecken: Menge steigt um ratio (0,25 = +25 %), Qualität sinkt. */
    'goods.cut': { lotId: number; ratio: number; warehouseId?: string };
  }
  interface GameEvents {
    'goods.stored': { warehouseId: string; productId: string; amount: number; quality: number; lotId?: number };
    'goods.taken': { warehouseId: string; productId: string; amount: number; quality?: number };
    'goods.cut': {
      warehouseId: string;
      lotId: number;
      productId: string;
      added: number;
      quality: number;
      cut: number;
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function allProducts(): readonly Product[] {
  return PRODUCTS;
}

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function productName(id: string): string {
  return getProduct(id)?.name ?? id;
}

/** Menge mit der Einheit des Produkts, z.B. "5 g" oder "2 Stück". */
export function formatProductAmount(productId: string, amount: number): string {
  return formatAmount(amount, getProduct(productId)?.unit ?? 'g');
}

export function getWarehouses(_state: GameState): readonly Warehouse[] {
  return WAREHOUSES;
}

export function getWarehouse(state: GameState, id: string): Warehouse | undefined {
  return getWarehouses(state).find((w) => w.id === id);
}

/** Qualitätsstufe einer Qualität (0–1). */
export function qualityTier(quality: number): QualityTier {
  return QUALITY_TIERS.find((t) => quality >= t.min) ?? QUALITY_TIERS[QUALITY_TIERS.length - 1];
}

/** Posten, älteste zuerst. Ohne Filter aus allen Lagern. */
export function getLots(state: GameState, filter: StockFilter = {}): StockLot[] {
  const result: StockLot[] = [];
  for (const [warehouseId, lots] of Object.entries(state.modules.goods.stock)) {
    if (filter.warehouseId && warehouseId !== filter.warehouseId) continue;
    for (const lot of lots) {
      if (lot.amount > 0 && (!filter.productId || lot.productId === filter.productId)) result.push(lot);
    }
  }
  return result;
}

/** Bestand, ohne Filter über alle Lager und Produkte. */
export function getStock(state: GameState, filter: StockFilter = {}): number {
  return getLots(state, filter).reduce((sum, lot) => sum + lot.amount, 0);
}

/** Mittlere Qualität des Bestands (nach Menge), 0 ohne Bestand. */
export function averageQuality(state: GameState, filter: StockFilter = {}): number {
  return weighted(getLots(state, filter)).quality;
}

/** Bestand pro Produkt (Reihenfolge wie allProducts), nur Produkte mit Bestand. */
export function stockSummary(state: GameState, warehouseId?: string): StockSummaryRow[] {
  return PRODUCTS.map((p) => {
    const w = weighted(getLots(state, { productId: p.id, warehouseId }));
    return { productId: p.id, amount: w.amount, quality: w.quality, cut: w.cut, unitCost: w.unitCost };
  }).filter((row) => row.amount > 0);
}

/** Was Strecken aus einem Posten machen würde (für die Vorschau in der UI). */
export function cutPreview(
  lot: Pick<StockLot, 'amount' | 'quality' | 'cut' | 'unitCost'>,
  ratio: number,
): { added: number; amount: number; quality: number; cut: number; unitCost: number; cost: number } {
  const added = Math.round(lot.amount * ratio);
  const amount = lot.amount + added;
  const share = amount > 0 ? lot.amount / amount : 1;
  return {
    added,
    amount,
    quality: roundQuality(lot.quality * Math.max(0, 1 - ratio * CUT_QUALITY_LOSS)),
    cut: round3(1 - (1 - lot.cut) * share),
    unitCost: round2(lot.unitCost * share + CUT_AGENT_COST * (1 - share)),
    cost: round2(added * CUT_AGENT_COST),
  };
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/** Ware einlagern (Lieferung, Beute …). Gleichartige Ware landet im selben Posten. Gibt die Posten-ID zurück. */
export function store(ctx: Ctx, item: StoreRequest): number | null {
  if (!(item.amount > 0)) return null;
  const warehouseId = item.warehouseId ?? DEFAULT_WAREHOUSE;
  const quality = roundQuality(item.quality ?? STANDARD_QUALITY);
  const cut = round3(item.cut ?? 0);
  const unitCost = item.unitCost ?? 0;
  const stock = ctx.state.modules.goods.stock;
  const lots = stock[warehouseId] ?? [];
  stock[warehouseId] = lots;
  let lot = lots.find((l) => l.productId === item.productId && l.quality === quality && l.cut === cut);
  if (lot) {
    lot.unitCost = round2((lot.unitCost * lot.amount + unitCost * item.amount) / (lot.amount + item.amount));
    lot.amount += item.amount;
  } else {
    lot = {
      id: ctx.nextId(),
      productId: item.productId,
      amount: item.amount,
      quality,
      cut,
      unitCost: round2(unitCost),
    };
    lots.push(lot);
  }
  ctx.emit('goods.stored', { warehouseId, productId: item.productId, amount: item.amount, quality, lotId: lot.id });
  return lot.id;
}

/** Ware entnehmen (Verkauf, Diebstahl, Beschlagnahme). Älteste Posten zuerst. */
export function take(ctx: Ctx, request: TakeRequest): TakeResult {
  const stock = ctx.state.modules.goods.stock;
  const warehouseIds = request.warehouseId
    ? [request.warehouseId]
    : [DEFAULT_WAREHOUSE, ...Object.keys(stock).filter((id) => id !== DEFAULT_WAREHOUSE)];
  const matches = (lot: StockLot) =>
    lot.productId === request.productId && lot.amount > 0 && (request.lotId === undefined || lot.id === request.lotId);
  const available = warehouseIds.reduce(
    (sum, id) => sum + (stock[id] ?? []).filter(matches).reduce((s, l) => s + l.amount, 0),
    0,
  );
  const wanted = request.partial
    ? Math.min(available, request.amount)
    : available >= request.amount
      ? request.amount
      : 0;
  if (!(wanted > 0)) return { taken: 0, quality: STANDARD_QUALITY, cut: 0, unitCost: 0 };

  let rest = wanted;
  const parts: { amount: number; quality: number; cut: number; unitCost: number }[] = [];
  for (const warehouseId of warehouseIds) {
    const lots = stock[warehouseId];
    if (!lots || rest <= 0) continue;
    const here: typeof parts = [];
    for (const lot of lots) {
      if (rest <= 0) break;
      if (!matches(lot)) continue;
      const n = Math.min(lot.amount, rest);
      lot.amount -= n;
      rest -= n;
      here.push({ amount: n, quality: lot.quality, cut: lot.cut, unitCost: lot.unitCost });
    }
    stock[warehouseId] = lots.filter((l) => l.amount > 0);
    if (here.length > 0) {
      const w = weighted(here);
      parts.push(...here);
      ctx.emit('goods.taken', { warehouseId, productId: request.productId, amount: w.amount, quality: w.quality });
    }
  }
  const w = weighted(parts);
  return { taken: wanted, quality: w.quality, cut: w.cut, unitCost: w.unitCost };
}

/** Einen Posten strecken. ratio = zusätzliche Menge als Anteil (0,25 = +25 %). */
export function cutLot(ctx: Ctx, request: { lotId: number; ratio: number; warehouseId?: string }): CommandResult {
  const warehouseId = request.warehouseId ?? DEFAULT_WAREHOUSE;
  const lot = ctx.state.modules.goods.stock[warehouseId]?.find((l) => l.id === request.lotId && l.amount > 0);
  if (!lot) return { ok: false, reason: 'Diesen Posten gibt es nicht mehr.' };
  const product = getProduct(lot.productId);
  if (!product?.cuttable) return { ok: false, reason: `${product?.name ?? 'Das'} lässt sich nicht strecken.` };
  if (!(request.ratio > 0) || request.ratio > 1) return { ok: false, reason: 'Ungültige Menge Streckmittel.' };
  const preview = cutPreview(lot, request.ratio);
  if (preview.added < 1) return { ok: false, reason: 'Zu wenig Ware zum Strecken.' };
  if (preview.cut > MAX_CUT + 1e-9) return { ok: false, reason: 'Mehr Streckmittel verträgt die Ware nicht.' };
  if (!wallet.pay(ctx, preview.cost, 'dirty', 'Streckmittel')) return { ok: false, reason: 'Nicht genug Geld.' };
  const before = lot.amount;
  lot.amount = preview.amount;
  lot.quality = preview.quality;
  lot.cut = preview.cut;
  lot.unitCost = preview.unitCost;
  journal.add(
    ctx,
    `${formatAmount(before, product.unit)} ${product.name} gestreckt: jetzt ${formatAmount(lot.amount, product.unit)}, ` +
      `Qualität ${Math.round(lot.quality * 100)} %.`,
  );
  ctx.emit('goods.cut', {
    warehouseId,
    lotId: lot.id,
    productId: lot.productId,
    added: preview.added,
    quality: lot.quality,
    cut: lot.cut,
  });
  return { ok: true, data: { added: preview.added } };
}

// ---------------------------------------------------------------------------------------------
// Hilfen

function weighted(parts: readonly { amount: number; quality: number; cut: number; unitCost: number }[]) {
  let amount = 0;
  let quality = 0;
  let cut = 0;
  let unitCost = 0;
  for (const p of parts) {
    amount += p.amount;
    quality += p.quality * p.amount;
    cut += p.cut * p.amount;
    unitCost += p.unitCost * p.amount;
  }
  if (amount <= 0) return { amount: 0, quality: 0, cut: 0, unitCost: 0 };
  return { amount, quality: quality / amount, cut: cut / amount, unitCost: unitCost / amount };
}

const roundQuality = (q: number) => Math.round(Math.min(1, Math.max(0, q)) * 100) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export default defineModule({
  id: 'goods',
  version: 2,
  init: (ctx) => ({
    stock: {
      [DEFAULT_WAREHOUSE]: [
        {
          id: ctx.nextId(),
          productId: DEFAULT_PRODUCT,
          amount: START_STOCK,
          quality: START_QUALITY,
          cut: 0,
          unitCost: START_UNIT_COST,
        },
      ],
    },
  }),
  commands: {
    'goods.cut': (ctx, payload) => cutLot(ctx, payload),
  },
  migrations: {
    // Version 1 kannte nur Mengen pro Produkt: daraus werden Posten in Standardqualität.
    2: (old: GoodsStateV1, state: GameState): GoodsState => {
      const stock: GoodsState['stock'] = {};
      for (const [warehouseId, products] of Object.entries(old.stock)) {
        stock[warehouseId] = Object.entries(products)
          .filter(([, amount]) => amount > 0)
          .map(([productId, amount]) => ({
            id: state.nextId++,
            productId,
            amount,
            quality: STANDARD_QUALITY,
            cut: 0,
            unitCost: START_UNIT_COST,
          }));
      }
      return { stock };
    },
  },
  // Pleite-Regel: Wer noch Ware hat, kann weitermachen.
  solvency: (state) => getStock(state) > 0,
});
