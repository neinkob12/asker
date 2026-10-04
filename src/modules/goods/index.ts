// Ware: Produkte und Bestand pro Lager. Der Bestand besteht aus Posten (Lots) mit eigener Qualität,
// Streckanteil und Einkaufspreis. Ein Lager hast du von Anfang an, weitere kaufst du mit sauberem Geld
// ('goods.buyWarehouse'). Entnommen wird ohne Angabe aus dem Lager, das am nächsten liegt (near) bzw. zuerst aus dem
// Standardlager.
//
// Öffentliche API:
//   allProducts(), getProduct(id), productName(id), getWarehouses(state, cityId?) (eigene), getWarehouse(state, id)
//   (eigene), warehouseSites(cityId?) (alle Standorte), warehouseSite(id), isWarehouseOwned(state, id),
//   nearestWarehouse(state, point, { productId?, amount? }) (nur Lager in der Stadt des Punkts), getStock(state, filter),
//   getLots(state, filter) (filter mit cityId), stockSummary(state, warehouseId?),
//   averageQuality(state, filter), qualityTier(quality), cutPreview(lot, ratio), store(ctx, {...}), take(ctx, {...}),
//   cutLot(ctx, {...}), QUALITY_TIERS, CUT_STEPS, MAX_CUT, DEFAULT_PRODUCT, DEFAULT_WAREHOUSE, STANDARD_QUALITY
//   Kapazität und Ausbau (Auftrag 33): warehouseLoad(state, id) (Gramm im Lager), warehouseCapacity(state, id),
//   warehouseFree(state, id), fitsInto(state, id, productId, amount?), stockWeight(items), warehouseModifiers(state, id)
//   (Kapazität, Verlust-Faktor für Einbruch und Überfall, Razzia-Faktor), upgradeLevel, upgradeCost, storeFitting(ctx,
//   {...}) (nimmt nur, was passt, und meldet den Rest), storageStats(state), WAREHOUSE_UPGRADES, UPGRADE_KINDS
//   Warenfluss (Auftrag 33): usagePerDay(state, { cityId?, productId?, spotId? }) (Verkäufe pro Tag, Schnitt der
//   letzten sieben Tage), usedProducts(state, cityId), servingWarehouse(state, point, productId)
// Befehle: 'goods.cut', 'goods.buyWarehouse', 'goods.upgradeWarehouse'
// Ereignisse: 'goods.stored', 'goods.taken', 'goods.cut', 'goods.warehouseBought', 'goods.warehouseUpgraded',
//   'goods.storeRejected'

import {
  type CommandResult,
  type Ctx,
  defineModule,
  distanceMeters,
  formatAmount,
  formatEuro,
  type GameState,
  journal,
  type LngLat,
  MINUTES_PER_DAY,
  wallet,
} from '../../core';
import { activeCity, cityAt, getCity, isCityUnlocked } from '../city';
import { veedelCity } from '../veedel';
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
  UNIT_WEIGHT_GRAMS,
  WAREHOUSE_UPGRADES,
  WAREHOUSES,
} from './config';

export {
  CUT_STEPS,
  DEFAULT_PRODUCT,
  DEFAULT_WAREHOUSE,
  MAX_CUT,
  NEARLY_FULL,
  QUALITY_TIERS,
  SHORTAGE_DAYS,
  STANDARD_QUALITY,
  UPGRADE_KINDS,
  type UpgradeDef,
  type UpgradeLevel,
  WAREHOUSE_UPGRADES,
} from './config';

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
  /** Stadt des Lagers (Auftrag 30). */
  cityId: string;
  name: string;
  lng: number;
  lat: number;
  /** Kaufpreis in sauberem Geld (0 = hast du von Anfang an). */
  cost: number;
  /** Platz ohne Ausbau in Gramm (Auftrag 33). */
  capacity: number;
  description: string;
}

/** Ausbau eines Lagers (Auftrag 33): Regale, Tresor, Tarnung. */
export type WarehouseUpgradeKind = 'shelves' | 'vault' | 'cover';

/** Erreichte Stufe je Ausbau (0 = nicht ausgebaut). */
export type WarehouseUpgrades = Record<WarehouseUpgradeKind, number>;

/** Was ein Lager kann, mit Ausbau: andere Module (police, gangs, encounters) fragen das zur Laufzeit. */
export interface WarehouseModifiers {
  /** Platz in Gramm (mit Regalen). */
  capacity: number;
  /** Anteil des Verlusts bei Einbruch und Überfall (1 = ohne Tresor). */
  lossFactor: number;
  /** Anteil, den eine Razzia aus diesem Lager mitnimmt, gemessen an der Regel der Polizei (1 = ohne Tarnung). */
  raidFactor: number;
  levels: WarehouseUpgrades;
}

/** Ergebnis von storeFitting: eingelagert und Rest (in Einheiten). */
export interface StoreResult {
  stored: number;
  rest: number;
  lotId: number | null;
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
  /** Eigene Lager (IDs aus WAREHOUSES), in der Reihenfolge des Kaufs. */
  owned: string[];
  /** Ausbau pro Lager (Auftrag 33), nur ausgebaute Lager stehen drin. */
  upgrades: Record<string, WarehouseUpgrades>;
  /** Einlagern mit Kapazität (storeFitting) in Gramm: angeboten und abgelehnt (für Balancing und Anzeige). */
  storage: { offered: number; rejected: number };
  /**
   * Verbrauch für den Warenfluss (Auftrag 33): verkaufte Einheiten heute und an den letzten sieben Tagen (neueste
   * zuerst), Schlüssel "c:<Stadt>:<Produkt>" und "s:<Spot>:<Produkt>".
   */
  usage: { today: Record<string, number>; days: Record<string, number>[] };
}

/** Zustand bis Version 4: ohne Verbrauch. */
type GoodsStateV4 = Omit<GoodsState, 'usage'>;

/** Zustand bis Version 3: Lager ohne Kapazität und Ausbau. */
type GoodsStateV3 = Omit<GoodsStateV4, 'upgrades' | 'storage'>;

/** Zustand bis Version 2: nur ein Lager. */
type GoodsStateV2 = Omit<GoodsStateV3, 'owned'>;

/** Zustand bis Version 1: Lager-ID → Produkt-ID → Menge. */
interface GoodsStateV1 {
  stock: Record<string, Record<string, number>>;
}

export interface StockFilter {
  productId?: string;
  warehouseId?: string;
  /** Nur Lager in dieser Stadt (Auftrag 30). */
  cityId?: string;
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
  /**
   * Ohne Angabe: erst das Lager am nächsten zu near, ohne near erst das Standardlager, dann die übrigen; immer nur Lager
   * in derselben Stadt (die von near, sonst die aktive).
   */
  warehouseId?: string;
  /** Ort, für den die Ware gebraucht wird (z.B. ein Spot): das nächste Lager zuerst. */
  near?: LngLat;
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
    /** Lager-Standort kaufen (sauberes Geld). */
    'goods.buyWarehouse': { warehouseId: string };
    /** Lager um eine Stufe ausbauen: Regale, Tresor oder Tarnung (sauberes Geld, Auftrag 33). */
    'goods.upgradeWarehouse': { warehouseId: string; kind: WarehouseUpgradeKind };
  }
  interface GameEvents {
    'goods.stored': { warehouseId: string; productId: string; amount: number; quality: number; lotId?: number };
    'goods.taken': { warehouseId: string; productId: string; amount: number; quality?: number };
    'goods.warehouseBought': { warehouseId: string; cost: number };
    'goods.warehouseUpgraded': { warehouseId: string; kind: WarehouseUpgradeKind; level: number; cost: number };
    /** Ein Lager war zu voll: rest Einheiten passten nicht hinein (storeFitting). */
    'goods.storeRejected': { warehouseId: string; productId: string; amount: number; rest: number };
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

/** Gewicht einer Einheit in Gramm (für die Ladung einer Fahrt zwischen den Städten). */
export function unitWeight(productId: string): number {
  const product = getProduct(productId);
  return product ? UNIT_WEIGHT_GRAMS[product.category] : 1;
}

/** Menge mit der Einheit des Produkts, z.B. "5 g" oder "2 Stück". */
export function formatProductAmount(productId: string, amount: number): string {
  return formatAmount(amount, getProduct(productId)?.unit ?? 'g');
}

/** Alle Lager-Standorte, auch die noch nicht gekauften (mit Stadt: nur dort). */
export function warehouseSites(cityId?: string): readonly Warehouse[] {
  return cityId === undefined ? WAREHOUSES : WAREHOUSES.filter((w) => w.cityId === cityId);
}

/** Stadt eines Lagers (unbekannte: Köln). */
export function warehouseCity(id: string): string {
  return warehouseSite(id)?.cityId ?? 'koeln';
}

const SITE_BY_ID = new Map(WAREHOUSES.map((w) => [w.id, w]));

export function warehouseSite(id: string): Warehouse | undefined {
  return SITE_BY_ID.get(id);
}

/** Eigene Lager (Standardlager zuerst, dann in der Reihenfolge der Standorte); mit Stadt nur die dort. */
export function getWarehouses(state: GameState, cityId?: string): readonly Warehouse[] {
  const owned = state.modules.goods.owned;
  return WAREHOUSES.filter((w) => owned.includes(w.id) && (cityId === undefined || w.cityId === cityId));
}

/** Eigenes Lager nach ID (undefined, wenn es dir nicht gehört). */
export function getWarehouse(state: GameState, id: string): Warehouse | undefined {
  return getWarehouses(state).find((w) => w.id === id);
}

export function isWarehouseOwned(state: GameState, id: string): boolean {
  return state.modules.goods.owned.includes(id);
}

/**
 * Eigenes Lager, das am nächsten zu point liegt, in derselben Stadt (Auftrag 30). Mit productId (und amount) nur
 * Lager, die genug davon haben. Bei gleichem Abstand das frühere in der Liste.
 */
export function nearestWarehouse(
  state: GameState,
  point: LngLat,
  filter: { productId?: string; amount?: number } = {},
): Warehouse | undefined {
  let best: Warehouse | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const w of getWarehouses(state, cityAt(point.lng, point.lat))) {
    if (
      filter.productId &&
      getStock(state, { productId: filter.productId, warehouseId: w.id }) < (filter.amount ?? 1)
    ) {
      continue;
    }
    const d = distanceMeters(w, point);
    if (d < bestDistance) {
      best = w;
      bestDistance = d;
    }
  }
  return best;
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
    if (filter.cityId && warehouseCity(warehouseId) !== filter.cityId) continue;
    for (const lot of lots) {
      if (lot.amount > 0 && (!filter.productId || lot.productId === filter.productId)) result.push(lot);
    }
  }
  return result;
}

/** Bestand, ohne Filter über alle Lager und Produkte. */
export function getStock(state: GameState, filter: StockFilter = {}): number {
  let sum = 0;
  // Ohne Zwischen-Array: wird pro Läufer und Minute oft gefragt.
  for (const [warehouseId, lots] of Object.entries(state.modules.goods.stock)) {
    if (filter.warehouseId && warehouseId !== filter.warehouseId) continue;
    if (filter.cityId && warehouseCity(warehouseId) !== filter.cityId) continue;
    for (const lot of lots) {
      if (lot.amount > 0 && (!filter.productId || lot.productId === filter.productId)) sum += lot.amount;
    }
  }
  return sum;
}

/** Liegt irgendwo Ware? Bricht beim ersten Posten ab (die Pleite-Regel fragt das jede Spielminute). */
function hasAnyStock(state: GameState): boolean {
  for (const lots of Object.values(state.modules.goods.stock)) for (const lot of lots) if (lot.amount > 0) return true;
  return false;
}

/** Mittlere Qualität des Bestands (nach Menge), 0 ohne Bestand. */
export function averageQuality(state: GameState, filter: StockFilter = {}): number {
  return weighted(getLots(state, filter)).quality;
}

/** Bestand pro Produkt (Reihenfolge wie allProducts), nur Produkte mit Bestand; optional nur in einer Stadt. */
export function stockSummary(state: GameState, warehouseId?: string, cityId?: string): StockSummaryRow[] {
  return PRODUCTS.map((p) => {
    const w = weighted(getLots(state, { productId: p.id, warehouseId, cityId }));
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
    // Ganze Euro: Cent-Beträge im Konto würden in den Apps (HUD, Kasse, Geldwäsche) unterschiedlich gerundet.
    cost: Math.max(1, Math.round(added * CUT_AGENT_COST)),
  };
}

// ---------------------------------------------------------------------------------------------
// Kapazität und Ausbau (Auftrag 33)

const NO_UPGRADES: WarehouseUpgrades = { shelves: 0, vault: 0, cover: 0 };

/** Gewicht einer Menge in Gramm. */
export function stockWeight(items: readonly { productId: string; amount: number }[]): number {
  let grams = 0;
  for (const i of items) grams += i.amount * unitWeight(i.productId);
  return grams;
}

/** Gramm im Lager (alle Posten). */
export function warehouseLoad(state: GameState, id: string): number {
  return stockWeight(state.modules.goods.stock[id] ?? []);
}

/** Erreichte Stufe eines Ausbaus (0 = keiner). */
export function upgradeLevel(state: GameState, id: string, kind: WarehouseUpgradeKind): number {
  return state.modules.goods.upgrades?.[id]?.[kind] ?? 0;
}

/** Wirkung der erreichten Stufe (ohne Ausbau 1). */
function upgradeValue(state: GameState, id: string, kind: WarehouseUpgradeKind): number {
  const level = upgradeLevel(state, id, kind);
  return level > 0 ? (WAREHOUSE_UPGRADES[kind].levels[level - 1]?.value ?? 1) : 1;
}

/** Kapazität, Tresor und Tarnung eines Lagers. Unbekannte Lager: ohne Grenze und ohne Ausbau. */
export function warehouseModifiers(state: GameState, id: string): WarehouseModifiers {
  const site = warehouseSite(id);
  return {
    capacity: site ? Math.round(site.capacity * upgradeValue(state, id, 'shelves')) : Number.POSITIVE_INFINITY,
    lossFactor: upgradeValue(state, id, 'vault'),
    raidFactor: upgradeValue(state, id, 'cover'),
    levels: { ...NO_UPGRADES, ...state.modules.goods.upgrades?.[id] },
  };
}

/** Platz in Gramm (mit Regalen). */
export function warehouseCapacity(state: GameState, id: string): number {
  return warehouseModifiers(state, id).capacity;
}

/** Freier Platz in Gramm (nie unter 0; ein überfülltes Lager hat 0). */
export function warehouseFree(state: GameState, id: string): number {
  return Math.max(0, warehouseCapacity(state, id) - warehouseLoad(state, id));
}

/** Wie viele Einheiten eines Produkts noch hineinpassen (mit amount: höchstens so viele). */
export function fitsInto(state: GameState, id: string, productId: string, amount = Number.POSITIVE_INFINITY): number {
  const room = Math.floor(warehouseFree(state, id) / unitWeight(productId));
  return Math.max(0, Math.min(amount, room));
}

/** Preis der nächsten Stufe in sauberem Geld (mal Immobilien-Faktor der Stadt), null wenn ausgebaut. */
export function upgradeCost(state: GameState, id: string, kind: WarehouseUpgradeKind): number | null {
  const next = WAREHOUSE_UPGRADES[kind].levels[upgradeLevel(state, id, kind)];
  if (!next) return null;
  return Math.round((next.cost * (getCity(warehouseCity(id))?.propertyFactor ?? 1)) / 50) * 50;
}

// ---------------------------------------------------------------------------------------------
// Warenfluss (Auftrag 33)

/** So viele Tage zählt der Verbrauch (Schnitt). */
const USAGE_DAYS = 7;

const usageKey = (scope: 'c' | 's', id: string, productId: string) => `${scope}:${id}:${productId}`;

/**
 * Verkäufe pro Tag: Schnitt der letzten (bis zu sieben) ganzen Tage; ohne ganze Tage der heutige Stand hochgerechnet.
 * Mit spotId der Verbrauch an einem Spot, sonst der einer Stadt (Standard: die aktive), mit productId nur diese Ware.
 */
export function usagePerDay(
  state: GameState,
  filter: { cityId?: string; productId?: string; spotId?: string } = {},
): number {
  const usage = state.modules.goods.usage;
  if (!usage) return 0;
  const prefix = filter.spotId ? `s:${filter.spotId}:` : `c:${filter.cityId ?? activeCity(state)}:`;
  const sum = (map: Record<string, number>) => {
    if (filter.productId) return map[prefix + filter.productId] ?? 0;
    let total = 0;
    for (const [key, n] of Object.entries(map)) if (key.startsWith(prefix)) total += n;
    return total;
  };
  if (usage.days.length > 0) return usage.days.reduce((t, day) => t + sum(day), 0) / usage.days.length;
  const minute = state.time % MINUTES_PER_DAY;
  return minute >= 120 ? (sum(usage.today) * MINUTES_PER_DAY) / minute : sum(usage.today);
}

/** Produkte, die in einer Stadt verkauft werden oder dort liegen (Reihenfolge wie allProducts). */
export function usedProducts(state: GameState, cityId: string): Product[] {
  return PRODUCTS.filter(
    (p) => usagePerDay(state, { cityId, productId: p.id }) > 0 || getStock(state, { cityId, productId: p.id }) > 0,
  );
}

/** Lager, aus dem ein Ort (Spot) eine Ware bekommt: das nächste mit Bestand, sonst das nächste überhaupt. */
export function servingWarehouse(state: GameState, point: LngLat, productId: string): Warehouse | undefined {
  return nearestWarehouse(state, point, { productId }) ?? nearestWarehouse(state, point);
}

/** Verkauf zählen (sale.completed). */
function countSale(ctx: Ctx, cityId: string, spotId: string | null, productId: string, amount: number): void {
  const s = ctx.state.modules.goods;
  s.usage ??= { today: {}, days: [] };
  const today = s.usage.today;
  const city = usageKey('c', cityId, productId);
  today[city] = (today[city] ?? 0) + amount;
  if (spotId) {
    const spot = usageKey('s', spotId, productId);
    today[spot] = (today[spot] ?? 0) + amount;
  }
}

/** Um Mitternacht: Der Tag wandert in die Liste der letzten Tage. */
function closeUsageDay(ctx: Ctx): void {
  const s = ctx.state.modules.goods;
  s.usage ??= { today: {}, days: [] };
  s.usage.days = [s.usage.today, ...s.usage.days].slice(0, USAGE_DAYS);
  s.usage.today = {};
}

/** Einlagern mit Kapazität, in Gramm: angeboten und abgelehnt (Anteil abgelehnt fürs Balancing). */
export function storageStats(state: GameState): { offered: number; rejected: number } {
  return state.modules.goods.storage ?? { offered: 0, rejected: 0 };
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/**
 * Ware einlagern, ohne Kapazität zu prüfen (Beute, Belohnung, Rückgabe kleiner Mengen). Lieferungen und Fahrten nehmen
 * storeFitting. Gleichartige Ware landet im selben Posten. Gibt die Posten-ID zurück.
 */
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

/**
 * Ware einlagern, so weit Platz ist (Auftrag 33): Das Lager nimmt nur, was in seine Kapazität passt, und meldet den
 * Rest zurück ('goods.storeRejected'). Was mit dem Rest passiert, entscheidet der Aufrufer (bleibt am Kai, wartet beim
 * Fahrer, geht in ein anderes Lager).
 */
export function storeFitting(ctx: Ctx, item: StoreRequest): StoreResult {
  if (!(item.amount > 0)) return { stored: 0, rest: 0, lotId: null };
  const warehouseId = item.warehouseId ?? DEFAULT_WAREHOUSE;
  const stored = fitsInto(ctx.state, warehouseId, item.productId, item.amount);
  const rest = item.amount - stored;
  const s = ctx.state.modules.goods;
  s.storage ??= { offered: 0, rejected: 0 };
  const per = unitWeight(item.productId);
  s.storage.offered += item.amount * per;
  s.storage.rejected += rest * per;
  const lotId = stored > 0 ? store(ctx, { ...item, warehouseId, amount: stored }) : null;
  if (rest > 0) ctx.emit('goods.storeRejected', { warehouseId, productId: item.productId, amount: item.amount, rest });
  return { stored, rest, lotId };
}

/** Ware entnehmen (Verkauf, Diebstahl, Beschlagnahme). Älteste Posten zuerst. */
export function take(ctx: Ctx, request: TakeRequest): TakeResult {
  const stock = ctx.state.modules.goods.stock;
  const city = request.near ? cityAt(request.near.lng, request.near.lat) : activeCity(ctx.state);
  const warehouseIds = request.warehouseId
    ? [request.warehouseId]
    : warehouseOrder(
        Object.keys(stock).filter((id) => warehouseCity(id) === city),
        request.near,
      );
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

/** Reihenfolge der Lager beim Entnehmen: nach Abstand zu near, sonst Standardlager zuerst. */
function warehouseOrder(ids: string[], near: LngLat | undefined): string[] {
  const sorted = ids.includes(DEFAULT_WAREHOUSE)
    ? [DEFAULT_WAREHOUSE, ...ids.filter((id) => id !== DEFAULT_WAREHOUSE).sort()]
    : [...ids].sort();
  if (!near) return sorted;
  const distance = (id: string) => {
    const site = warehouseSite(id);
    return site ? distanceMeters(site, near) : Number.POSITIVE_INFINITY;
  };
  return sorted
    .map((id, index) => ({ id, index, d: distance(id) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .map((x) => x.id);
}

/** Lager-Standort kaufen. Immobilien sind legal: bezahlt wird mit sauberem Geld. */
export function buyWarehouse(ctx: Ctx, warehouseId: string): CommandResult {
  const site = warehouseSite(warehouseId);
  if (!site) return { ok: false, reason: 'Diesen Standort gibt es nicht.' };
  if (isWarehouseOwned(ctx.state, warehouseId)) return { ok: false, reason: `${site.name} gehört dir schon.` };
  if (!isCityUnlocked(ctx.state, site.cityId)) return { ok: false, reason: 'In dieser Stadt bist du noch nicht.' };
  if (!wallet.pay(ctx, site.cost, 'clean', `Kauf ${site.name}`, 'expansion')) {
    return {
      ok: false,
      reason: `Dafür brauchst du ${formatEuro(site.cost)} sauberes Geld. Wasch vorher Schwarzgeld.`,
    };
  }
  ctx.state.modules.goods.owned.push(warehouseId);
  ctx.state.modules.goods.stock[warehouseId] ??= [];
  journal.add(ctx, `${site.name} gekauft (${formatEuro(site.cost)} sauberes Geld). Neues Lager.`, 'good');
  ctx.emit('goods.warehouseBought', { warehouseId, cost: site.cost });
  return { ok: true };
}

/** Lager um eine Stufe ausbauen (sauberes Geld, wie der Kauf). */
export function upgradeWarehouse(ctx: Ctx, warehouseId: string, kind: WarehouseUpgradeKind): CommandResult {
  const def = WAREHOUSE_UPGRADES[kind];
  if (!def) return { ok: false, reason: 'Diesen Ausbau gibt es nicht.' };
  const site = getWarehouse(ctx.state, warehouseId);
  if (!site) return { ok: false, reason: 'Dieses Lager gehört dir nicht.' };
  const cost = upgradeCost(ctx.state, warehouseId, kind);
  if (cost === null) return { ok: false, reason: `${def.name} im ${site.name} sind schon voll ausgebaut.` };
  if (!wallet.pay(ctx, cost, 'clean', `${def.name} ${site.name}`, { category: 'expansion', cityId: site.cityId })) {
    return { ok: false, reason: `Dafür brauchst du ${formatEuro(cost)} sauberes Geld. Wasch vorher Schwarzgeld.` };
  }
  const s = ctx.state.modules.goods;
  s.upgrades ??= {};
  const levels = { ...NO_UPGRADES, ...s.upgrades[warehouseId] };
  levels[kind] += 1;
  s.upgrades[warehouseId] = levels;
  journal.add(ctx, `${site.name}: ${def.name} Stufe ${levels[kind]} (${formatEuro(cost)} sauberes Geld).`, 'good');
  ctx.emit('goods.warehouseUpgraded', { warehouseId, kind, level: levels[kind], cost });
  return { ok: true };
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
  if (!wallet.pay(ctx, preview.cost, 'dirty', 'Streckmittel', 'goods.purchase'))
    return { ok: false, reason: 'Nicht genug Geld.' };
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
  version: 5,
  init: (ctx) => ({
    owned: [DEFAULT_WAREHOUSE],
    upgrades: {},
    storage: { offered: 0, rejected: 0 },
    usage: { today: {}, days: [] },
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
    'goods.buyWarehouse': (ctx, { warehouseId }) => buyWarehouse(ctx, warehouseId),
    'goods.upgradeWarehouse': (ctx, { warehouseId, kind }) => upgradeWarehouse(ctx, warehouseId, kind),
  },
  migrations: {
    // Version 1 kannte nur Mengen pro Produkt: daraus werden Posten in Standardqualität.
    2: (old: GoodsStateV1, state: GameState): GoodsStateV2 => {
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
    // Version 3: Lager werden gekauft. Wer schon Ware in einem Lager hat, besitzt es.
    3: (old: GoodsStateV2): GoodsStateV3 => ({
      stock: old.stock,
      owned: [
        DEFAULT_WAREHOUSE,
        ...WAREHOUSES.map((w) => w.id).filter((id) => id !== DEFAULT_WAREHOUSE && (old.stock[id]?.length ?? 0) > 0),
      ],
    }),
    // Version 4 (Auftrag 33): Lager haben Kapazität und Ausbau. Alte Lager sind nicht ausgebaut; wer mehr drin hat, als
    // hineinpasst, behält alles (das Lager ist dann voll, bis Ware rausgeht).
    4: (old: GoodsStateV3): GoodsStateV4 => ({ ...old, upgrades: {}, storage: { offered: 0, rejected: 0 } }),
    // Version 5 (Auftrag 33): Verbrauch für den Warenfluss, er zählt ab jetzt.
    5: (old: GoodsStateV4): GoodsState => ({ ...old, usage: { today: {}, days: [] } }),
  },
  // Warenfluss: jeder Verkauf zählt; um Mitternacht rückt der Tag weiter.
  tick: (ctx) => {
    if (ctx.now % MINUTES_PER_DAY === 0) closeUsageDay(ctx);
  },
  tickEvery: 60,
  on: {
    'sale.completed': (ctx, { veedelId, spotId, productId, amount }) =>
      countSale(ctx, veedelCity(veedelId), spotId, productId, amount),
  },
  // Pleite-Regel: Wer noch Ware hat, kann weitermachen.
  solvency: (state) => hasAnyStock(state),
});
