// Ware: Produkte und Bestand pro Lager. Stand Fundament: ein Produkt, ein Lager, eine Qualität.
// Qualitätsstufen und Strecken baut Auftrag 12.
//
// Öffentliche API:
//   allProducts(), getProduct(id), getWarehouses(state), getWarehouse(state, id),
//   getStock(state, filter), store(ctx, {...}), take(ctx, {...})
// Ereignisse: 'goods.stored', 'goods.taken'

import { type Ctx, defineModule, type GameState } from '../../core';
import { DEFAULT_PRODUCT, DEFAULT_WAREHOUSE, PRODUCTS, STANDARD_QUALITY, START_STOCK, WAREHOUSES } from './config';

export { DEFAULT_PRODUCT, DEFAULT_WAREHOUSE, STANDARD_QUALITY } from './config';

export interface Product {
  id: string;
  name: string;
  /** Verkaufseinheit, z.B. 'g', 'Stück', 'ml'. */
  unit: string;
  /** Grundpreis pro Einheit auf der Straße in Euro. */
  basePrice: number;
}

export interface Warehouse {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

export interface GoodsState {
  /** Bestand: Lager-ID → Produkt-ID → Menge. */
  stock: Record<string, Record<string, number>>;
}

export interface StockFilter {
  productId?: string;
  warehouseId?: string;
}

export interface TakeRequest {
  productId: string;
  amount: number;
  warehouseId?: string;
  /** true: so viel wie da ist nehmen (Diebstahl, Beschlagnahme). false: alles oder nichts. */
  partial?: boolean;
}

export interface TakeResult {
  taken: number;
  /** Qualität der entnommenen Ware (0–1). */
  quality: number;
}

declare module '../../core' {
  interface ModuleStates {
    goods: GoodsState;
  }
  interface GameEvents {
    'goods.stored': { warehouseId: string; productId: string; amount: number; quality: number };
    'goods.taken': { warehouseId: string; productId: string; amount: number };
  }
}

export function allProducts(): readonly Product[] {
  return PRODUCTS;
}

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getWarehouses(_state: GameState): readonly Warehouse[] {
  return WAREHOUSES;
}

export function getWarehouse(state: GameState, id: string): Warehouse | undefined {
  return getWarehouses(state).find((w) => w.id === id);
}

/** Bestand, ohne Filter über alle Lager und Produkte. */
export function getStock(state: GameState, filter: StockFilter = {}): number {
  let total = 0;
  for (const [warehouseId, products] of Object.entries(state.modules.goods.stock)) {
    if (filter.warehouseId && warehouseId !== filter.warehouseId) continue;
    for (const [productId, amount] of Object.entries(products)) {
      if (!filter.productId || productId === filter.productId) total += amount;
    }
  }
  return total;
}

/** Ware einlagern (Lieferung, Beute …). */
export function store(
  ctx: Ctx,
  item: { productId: string; amount: number; warehouseId?: string; quality?: number },
): void {
  if (item.amount <= 0) return;
  const warehouseId = item.warehouseId ?? DEFAULT_WAREHOUSE;
  const stock = ctx.state.modules.goods.stock;
  const row = stock[warehouseId] ?? {};
  stock[warehouseId] = row;
  row[item.productId] = (row[item.productId] ?? 0) + item.amount;
  ctx.emit('goods.stored', {
    warehouseId,
    productId: item.productId,
    amount: item.amount,
    quality: item.quality ?? STANDARD_QUALITY,
  });
}

/** Ware entnehmen (Verkauf, Diebstahl, Beschlagnahme). */
export function take(ctx: Ctx, request: TakeRequest): TakeResult {
  const warehouseId = request.warehouseId ?? DEFAULT_WAREHOUSE;
  const row = ctx.state.modules.goods.stock[warehouseId] ?? {};
  const available = row[request.productId] ?? 0;
  const taken = request.partial
    ? Math.min(available, request.amount)
    : available >= request.amount
      ? request.amount
      : 0;
  if (taken <= 0) return { taken: 0, quality: STANDARD_QUALITY };
  row[request.productId] = available - taken;
  ctx.emit('goods.taken', { warehouseId, productId: request.productId, amount: taken });
  return { taken, quality: STANDARD_QUALITY };
}

export default defineModule({
  id: 'goods',
  version: 1,
  init: () => ({ stock: { [DEFAULT_WAREHOUSE]: { [DEFAULT_PRODUCT]: START_STOCK } } }),
  // Pleite-Regel: Wer noch Ware hat, kann weitermachen.
  solvency: (state) => getStock(state) > 0,
});
