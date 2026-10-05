// Einkauf der Leutnants nach Bestellregeln: Ware, Lieferant, Paket, Mindestbestand und Ziel-Lager.
// Gezählt wird der Bestand im Ziel-Lager plus alles, was dorthin unterwegs ist (Lieferungen, auch die anderer
// Leutnants, und Fahrten der Logistik). So bestellen zwei Leutnants mit demselben Lager nicht doppelt.
// Ein gesperrter oder nicht freigeschalteter Lieferant lässt die Regel ruhen (kein stilles Ausweichen), außer bei
// "automatisch". Schiffsware nur, wenn jemand sie automatisch am Kai abholt (die Rechte Hand mit "Hafen abholen").

import { type Actor, type CommandResult, type Ctx, formatEuro, type GameState } from '../../core';
import { activeCity } from '../city';
import { getSalesStats } from '../customers';
import { getProduct, getStock, getWarehouse, productName, warehouseCity } from '../goods';
import { getCargo, getTrips } from '../logistics';
import { priceIndex } from '../market';
import { getStaff } from '../staff';
import {
  availablePackages,
  getSupplier,
  getSuppliers,
  isBlocked,
  isUnlocked,
  packagePrice,
  type Supplier,
  type SupplierPackage,
  shipmentsInTransit,
} from '../suppliers';
import { isTaskActive } from './righthand';
import type { OrderRule } from './types';

/**
 * Darf ein Leutnant (oder die Rechte Hand) beim Hafen bestellen? Nur wenn jemand die Ware automatisch am Kai abholt:
 * die Rechte Hand mit der Aufgabe "Hafen abholen" und mindestens einem Fahrer (Auftrag 28).
 */
export function isPortSupplierAllowed(state: GameState): boolean {
  // Fahrer der Stadt, in der bestellt wird (Auftrag 43): Ein Kölner holt in Hamburg nichts ab.
  const drivers = getStaff(state, { role: 'driver', status: 'active', cityId: activeCity(state) });
  return isTaskActive(state, 'pickup') && drivers.length > 0;
}

export const PORT_SUPPLIER_HINT =
  'Schiffsware muss jemand am Kai abholen. Das macht die Rechte Hand mit der Aufgabe "Hafen abholen" und einem Fahrer; solange bestellt dort niemand von selbst.';

/**
 * Prüft eine Regel (für den Befehl und die Oberfläche). Mit cityId (Stadt des Leutnants bzw. der Rechten Hand) muss ein
 * gewähltes Lager in dieser Stadt liegen.
 */
export function checkOrderRule(state: GameState, rule: OrderRule, cityId?: string): CommandResult {
  if (!Number.isInteger(rule.minStock) || rule.minStock < 0 || rule.minStock > 5000) {
    return { ok: false, reason: 'Ungültiger Mindestbestand.' };
  }
  if (rule.productId && !getProduct(rule.productId)) return { ok: false, reason: 'Unbekannte Ware.' };
  const supplier = rule.supplierId ? getSupplier(state, rule.supplierId) : undefined;
  if (rule.supplierId && !supplier) return { ok: false, reason: 'Unbekannter Lieferant.' };
  if (supplier?.kind === 'port' && !isPortSupplierAllowed(state)) return { ok: false, reason: PORT_SUPPLIER_HINT };
  if (rule.packageId) {
    if (!supplier) return { ok: false, reason: 'Für ein bestimmtes Paket erst den Lieferanten wählen.' };
    const pkg = supplier.packages.find((p) => p.id === rule.packageId);
    if (!pkg) return { ok: false, reason: 'Dieses Paket hat der Lieferant nicht.' };
    if (rule.productId && pkg.productId !== rule.productId)
      return { ok: false, reason: 'Das Paket passt nicht zur Ware.' };
  }
  if (
    rule.maxIndex !== undefined &&
    rule.maxIndex !== null &&
    (!Number.isFinite(rule.maxIndex) || rule.maxIndex < 0.5 || rule.maxIndex > 2)
  ) {
    return { ok: false, reason: 'Ungültige Preisgrenze.' };
  }
  if (rule.warehouseId && !getWarehouse(state, rule.warehouseId)) return { ok: false, reason: 'Unbekanntes Lager.' };
  if (rule.warehouseId && cityId && warehouseCity(rule.warehouseId) !== cityId) {
    return { ok: false, reason: 'Das Lager liegt in einer anderen Stadt.' };
  }
  return { ok: true };
}

/** Nächste freie Regel-ID ("r1", "r2" …). */
export function nextRuleId(rules: readonly OrderRule[]): string {
  let n = rules.length + 1;
  while (rules.some((r) => r.id === `r${n}`)) n++;
  return `r${n}`;
}

/**
 * Bestellregeln aus einer Einstellung übernehmen (Leutnant und Rechte Hand): nur bekannte Felder, eindeutige IDs,
 * keine Pause, jede Regel geprüft. So landen weder Fremdfelder noch doppelte IDs im Spielstand.
 */
export function normalizeOrderRules(
  state: GameState,
  raw: readonly OrderRule[],
  cityId?: string,
): { ok: true; rules: OrderRule[] } | { ok: false; reason: string } {
  const rules: OrderRule[] = [];
  for (const r of raw) {
    const rule: OrderRule = {
      id: r.id || nextRuleId(rules),
      productId: r.productId ?? null,
      supplierId: r.supplierId ?? null,
      packageId: r.packageId ?? null,
      minStock: r.minStock,
      warehouseId: r.warehouseId ?? null,
      paused: null,
    };
    if (r.maxIndex !== undefined && r.maxIndex !== null) rule.maxIndex = r.maxIndex;
    if (rules.some((x) => x.id === rule.id)) rule.id = nextRuleId(rules);
    const check = checkOrderRule(state, rule, cityId);
    if (!check.ok) return check;
    rules.push(rule);
  }
  return { ok: true, rules };
}

/**
 * Ziel-Lager einer Regel: das gewählte (wenn es noch dir gehört und in der Stadt des Bestellers liegt), sonst das Lager
 * seiner Spots. Die Stadt ist cityId, ohne Angabe die des Heimat-Lagers; ein Lager aus einer anderen Stadt (z.B. aus der
 * kopierten Vorlage) wird ignoriert.
 */
export function ruleWarehouse(state: GameState, rule: OrderRule, home: string | null, cityId?: string): string | null {
  if (rule.warehouseId && getWarehouse(state, rule.warehouseId)) {
    const city = cityId ?? (home ? warehouseCity(home) : undefined);
    if (!city || warehouseCity(rule.warehouseId) === city) return rule.warehouseId;
  }
  return home;
}

/** Bestand im Lager plus was dorthin unterwegs ist (Lieferungen und Fahrten), für eine Ware oder alles. */
export function ruleStock(state: GameState, warehouseId: string, productId: string | null): number {
  const product = productId ?? undefined;
  const stock = getStock(state, { warehouseId, ...(product ? { productId: product } : {}) });
  const shipped = shipmentsInTransit(state)
    .filter((s) => !s.toPort && s.warehouseId === warehouseId && (!product || s.productId === product))
    .reduce((sum, s) => sum + s.amount, 0);
  // Schiffsware für dieses Lager zählt auf See und am Kai mit, sonst bestellt die Regel bis zur Abholung immer wieder.
  const atSea = shipmentsInTransit(state)
    .filter((s) => s.toPort && s.destinationId === warehouseId && (!product || s.productId === product))
    .reduce((sum, s) => sum + s.amount, 0);
  const onQuay = getCargo(state)
    .filter((c) => c.warehouseId === warehouseId && (!product || c.productId === product))
    .reduce((sum, c) => sum + c.amount, 0);
  const moving = getTrips(state)
    .filter((t) => t.toId === warehouseId)
    .flatMap((t) => t.items)
    .filter((i) => !product || i.productId === product)
    .reduce((sum, i) => sum + i.amount, 0);
  return stock + shipped + atSea + onQuay + moving;
}

/** Kurztext einer Regel, z.B. "Gras bei Frankfurt, passend, ab 50". */
export function orderRuleLabel(state: GameState, rule: OrderRule): string {
  const what = rule.productId ? productName(rule.productId) : 'Alles nach Nachfrage';
  const who = rule.supplierId ? (getSupplier(state, rule.supplierId)?.name ?? rule.supplierId) : 'günstigster';
  const pkg = rule.packageId
    ? (getSupplier(state, rule.supplierId ?? '')?.packages.find((p) => p.id === rule.packageId)?.label ?? 'Paket')
    : 'passend';
  const index = rule.maxIndex ? ` · Index unter ${rule.maxIndex.toFixed(2).replace('.', ',')}` : '';
  return `${what} · ${who} · ${pkg} · unter ${rule.minStock}${index}`;
}

export type OrderPlan =
  | { kind: 'none' }
  | { kind: 'pause'; reason: string }
  | { kind: 'noMoney'; needed: number }
  | { kind: 'order'; supplier: Supplier; pkg: SupplierPackage; price: number; warehouseId: string; why: string };

/** Was die Kunden zuletzt vermisst haben (pro Einheit Bestand), für "automatisch". */
function wanted(state: GameState, productId: string): number {
  const missed = getSalesStats(state).missedByProduct;
  return (missed[productId] ?? 0) / (1 + getStock(state, { productId }));
}

/**
 * Entscheidet für eine Regel, ob und was bestellt wird. budget = was er ausgeben darf (Rücklage, Lohnsicherung und
 * Budget der Rechten Hand sind schon abgezogen).
 */
export function planOrder(
  state: GameState,
  rule: OrderRule,
  home: string | null,
  budgetOrLookup: number | (() => number),
  minStock: number = rule.minStock,
  cityId?: string,
): OrderPlan {
  const warehouseId = ruleWarehouse(state, rule, home, cityId);
  if (!warehouseId) return { kind: 'pause', reason: 'Kein Lager für die Ware.' };
  // Geplant wird mit Angebot und Preisen der Stadt des Lagers, denn dort bucht suppliers.order.
  const city = warehouseCity(warehouseId);
  const deficit = minStock - ruleStock(state, warehouseId, rule.productId);
  if (deficit <= 0) return { kind: 'none' };
  // Das Budget erst jetzt (es rechnet die Lohnsicherung über alle Leute): Meist fehlt ja nichts.
  const budget = typeof budgetOrLookup === 'function' ? budgetOrLookup() : budgetOrLookup;

  let suppliers: Supplier[];
  if (rule.supplierId) {
    const supplier = getSupplier(state, rule.supplierId);
    if (!supplier) return { kind: 'pause', reason: 'Den Lieferanten gibt es nicht mehr.' };
    if (!isUnlocked(state, supplier.id))
      return { kind: 'pause', reason: `${supplier.name} liefert noch nicht an dich.` };
    if (isBlocked(state, supplier.id)) {
      return { kind: 'pause', reason: `${supplier.name} liefert nicht, solange die Schulden offen sind.` };
    }
    if (supplier.kind === 'port' && !isPortSupplierAllowed(state)) return { kind: 'pause', reason: PORT_SUPPLIER_HINT };
    suppliers = [supplier];
  } else {
    suppliers = getSuppliers(state, city).filter(
      (s) => isUnlocked(state, s.id) && !isBlocked(state, s.id) && (s.kind !== 'port' || isPortSupplierAllowed(state)),
    );
  }
  const all = suppliers.flatMap((supplier) =>
    availablePackages(state, supplier.id, city)
      .filter((pkg) => !rule.productId || pkg.productId === rule.productId)
      .filter((pkg) => !rule.packageId || pkg.id === rule.packageId)
      // Container (Auftrag 33) sind eine Entscheidung des Spielers: nur, wenn die Regel das Paket ausdrücklich nennt.
      .filter((pkg) => !pkg.container || pkg.id === rule.packageId)
      .map((pkg) => ({ supplier, pkg, price: packagePrice(state, supplier.id, pkg.id, city) })),
  );
  // Preisgrenze (Auftrag 32): Ware, deren Index zu hoch steht, wartet, bis der Markt nachgibt.
  const maxIndex = rule.maxIndex ?? null;
  const offers = maxIndex === null ? all : all.filter((o) => priceIndex(state, o.pkg.productId, city) < maxIndex);
  if (all.length > 0 && offers.length === 0) {
    return { kind: 'pause', reason: 'Der Markt steht zu hoch, er wartet auf einen besseren Preis.' };
  }
  if (offers.length === 0) {
    if (rule.packageId) return { kind: 'pause', reason: 'Das Paket gibt es gerade nicht.' };
    if (rule.supplierId) return { kind: 'pause', reason: 'Der Lieferant hat die Ware gerade nicht.' };
    return { kind: 'pause', reason: 'Kein Lieferant hat die Ware.' };
  }
  const affordable = offers.filter((o) => o.price <= budget);
  if (affordable.length === 0) {
    return { kind: 'noMoney', needed: Math.min(...offers.map((o) => o.price)) };
  }
  // Ohne feste Ware: erst eine Ware wählen (was die Kunden vermissen, sonst die mit dem kleinsten Bestand), damit die
  // Pakete vergleichbar sind (Gramm und Stück lassen sich nicht mischen).
  let pool = affordable;
  let why = '';
  if (!rule.productId) {
    const products = [...new Set(affordable.map((o) => o.pkg.productId))];
    const stock = (id: string) => getStock(state, { warehouseId, productId: id });
    const top = products.sort((a, b) => wanted(state, b) - wanted(state, a) || stock(a) - stock(b))[0];
    pool = affordable.filter((o) => o.pkg.productId === top);
    if (wanted(state, top) > 0) why = ' Die Kunden fragen danach.';
  }
  // Passendes Paket: der beste Preis pro Einheit unter denen, die nicht viel mehr als die Lücke bringen (kleine
  // Pakete beim teuren Kurier nur, wenn nichts Größeres bezahlbar ist). So wird nicht jeden Tag Kleinkram gekauft.
  const unit = (o: (typeof pool)[number]) => o.price / o.pkg.amount;
  const fitting = pool.filter((o) => o.pkg.amount <= Math.max(deficit * 2, 1));
  const best = (list: typeof pool) => [...list].sort((a, b) => unit(a) - unit(b) || b.pkg.amount - a.pkg.amount)[0];
  const choice = best(fitting.length > 0 ? fitting : [...pool].sort((a, b) => a.pkg.amount - b.pkg.amount).slice(0, 1));
  return { kind: 'order', ...choice, warehouseId, why: `${why} (${formatEuro(choice.price)})` };
}

/** Höchstens so viele Bestellungen pro Regel und Durchgang (große Lücke, kleine Pakete). */
export const MAX_ORDERS_PER_RULE = 3;

export interface RestockHooks {
  /** Stadt des Bestellers (Leutnant bzw. Rechte Hand): Lager aus anderen Städten zählen nicht. */
  cityId?: string;
  /** Was noch ausgegeben werden darf (wird vor jeder Bestellung neu gefragt). */
  budget: () => number;
  /** Mindestbestand einer Regel, wenn er vom eingestellten abweicht (z.B. nach Größe der Stadt). */
  minStock?: (rule: OrderRule) => number;
  onPause: (rule: OrderRule, reason: string) => void;
  onResume: (rule: OrderRule) => void;
  onNoMoney: () => void;
  onOrdered: (plan: Extract<OrderPlan, { kind: 'order' }>) => void;
}

/**
 * Gemeinsamer Einkauf für Leutnants und Rechte Hand: geht alle Regeln durch und bestellt, bis der Mindestbestand
 * (Lager plus Unterwegs) erreicht ist, höchstens MAX_ORDERS_PER_RULE Pakete pro Regel. Der Bestand wird nach jeder
 * Bestellung neu gezählt, deshalb bestellt nichts doppelt.
 */
export function runRestock(
  ctx: Ctx,
  rules: OrderRule[],
  home: string | null | (() => string | null),
  actor: Actor,
  hooks: RestockHooks,
): void {
  // Das Hauptlager erst bestimmen, wenn eine Regel es braucht (es kostet eine Suche über Spots und Lager).
  let homeId: string | null | undefined = typeof home === 'function' ? undefined : home;
  const resolveHome = (): string | null => {
    if (homeId === undefined) homeId = typeof home === 'function' ? home() : home;
    return homeId;
  };
  for (const rule of rules) {
    for (let i = 0; i < MAX_ORDERS_PER_RULE; i++) {
      const own = ruleWarehouse(ctx.state, rule, null, hooks.cityId);
      const plan = planOrder(
        ctx.state,
        rule,
        own ? null : resolveHome(),
        hooks.budget,
        hooks.minStock?.(rule),
        hooks.cityId,
      );
      if (plan.kind === 'pause') {
        if (rule.paused !== plan.reason) {
          rule.paused = plan.reason;
          hooks.onPause(rule, plan.reason);
        }
        break;
      }
      if (rule.paused) {
        rule.paused = null;
        hooks.onResume(rule);
      }
      if (plan.kind === 'noMoney') {
        hooks.onNoMoney();
        break;
      }
      if (plan.kind !== 'order') break;
      const result = ctx.dispatch(
        {
          type: 'suppliers.order',
          payload: { supplierId: plan.supplier.id, packageId: plan.pkg.id, warehouseId: plan.warehouseId },
        },
        { actor },
      );
      if (!result.ok) break;
      hooks.onOrdered(plan);
    }
  }
}
