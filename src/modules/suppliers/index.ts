// Lieferanten: Bestellungen, Lieferungen und Beziehungen.
// Zwei Arten: Großstädte (Frankfurt, Berlin, Hamburg: kleine Mengen, schnell, teurer) und der Hafen Rotterdam
// (große Mengen, langsam, günstiger). Jeder Lieferant hat Preis, Qualität, Zuverlässigkeit, Lieferzeit und
// Sortiment. Vertrauen wächst mit Käufen und pünktlicher Zahlung und bringt Rabatt, Kredit und bessere Ware.
// Lieferprobleme (verspätet, schlechte Ware, beschlagnahmt) werden bei der Bestellung ausgewürfelt und zeigen
// sich unterwegs bzw. bei der Ankunft. Transporter fahren Luftlinie (echte Routen später).
//
// Öffentliche API:
//   getSuppliers(state), getSupplier(state, id), supplierContactId(id), assortment(supplier),
//   shipmentsInTransit(state), shipmentProgress(state, shipment), expectedArrival(shipment),
//   cheapestPackagePrice(state), getRelation(state, id), trustLabel(trust), supplierDiscount(state, id),
//   supplierQualityBonus(state, id), creditLimit(state, id), availableCredit(state, id), isBlocked(state, id),
//   availablePackages(state, id), packagePrice(state, supplierId, packageId), rollShipmentProblem(...)
// Befehle: 'suppliers.order' (onCredit für Kredit), 'suppliers.repay'
// Ereignisse: 'shipment.ordered', 'shipment.arrived', 'shipment.problem', 'supplier.trustChanged',
//   'supplier.repaid', 'supplier.overdue'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { DEFAULT_WAREHOUSE, formatProductAmount, getWarehouse, productName, store } from '../goods';
import {
  BAD_QUALITY_FACTOR,
  BAD_QUALITY_LOSS,
  CREDIT_MIN_TRUST,
  CREDIT_PER_TRUST,
  CREDIT_TERM,
  CREDIT_TRUST_OFFSET,
  DELAY_FACTOR,
  DELAY_RANGE,
  DISCOUNT_FROM_TRUST,
  LATE_INTEREST,
  MAX_DISCOUNT,
  MAX_QUALITY_BONUS,
  OVERDUE_EXTENSION,
  PORT_SEIZE_EXTRA,
  PROBLEM_AT,
  QUALITY_SPREAD,
  SEIZE_FACTOR,
  START_TRUST,
  SUPPLIERS,
  TRUST_CASH_BONUS,
  TRUST_LATE_PENALTY,
  TRUST_ON_TIME_REPAYMENT,
  TRUST_PER_1000_EUR,
  TRUST_PER_ORDER,
} from './config';

export interface SupplierPackage {
  id: string;
  label: string;
  productId: string;
  amount: number;
  /** Listenpreis ohne Rabatt. */
  price: number;
  /** Erst ab diesem Vertrauen im Sortiment. */
  minTrust?: number;
}

export interface Supplier {
  id: string;
  name: string;
  /** Ansprechpartner im Handy. */
  contactName: string;
  /** 'port' = Hafen (groß, langsam, günstig), 'city' = Großstadt (klein, schnell, teuer). */
  kind: 'port' | 'city';
  lng: number;
  lat: number;
  /** Lieferzeit in Spielminuten. */
  deliveryTime: number;
  /** Preisniveau als Anteil am Straßenpreis (0,34 = 34 %). */
  priceLevel: number;
  /** Qualität der Ware (0–1). */
  quality: number;
  /** 0–1: Wie selten es Lieferprobleme gibt. */
  reliability: number;
  description: string;
  packages: SupplierPackage[];
}

export type ShipmentProblem = 'delayed' | 'badQuality' | 'seized';

export interface Shipment {
  id: number;
  supplierId: string;
  packageId: string;
  productId: string;
  amount: number;
  /** Qualität, mit der die Ware ankommt. */
  quality: number;
  warehouseId: string;
  /** Bezahlter Preis (nach Rabatt). */
  price: number;
  orderedAt: number;
  /** Tatsächliche Ankunft (inklusive einer Verspätung). */
  arrivesAt: number;
  onCredit?: boolean;
  /** Ausgewürfeltes Lieferproblem, der Spieler erfährt es erst, wenn es passiert. */
  problem?: ShipmentProblem;
  /** Wann das Problem unterwegs auftritt (Verspätung, Beschlagnahme). */
  problemAt?: number;
  delayMinutes?: number;
  problemRevealed?: boolean;
  /** Versprochene Qualität, falls die Ware schlechter ankommt. */
  promisedQuality?: number;
}

export interface SupplierRelation {
  /** Vertrauen 0–100. */
  trust: number;
  orders: number;
  /** Summe aller Bestellungen in Euro. */
  spent: number;
  /** Offene Schulden (Kredit) in Euro. */
  debt: number;
  /** Fälligkeit der Schulden, null ohne Schulden. */
  dueAt: number | null;
  /** Wie oft die Schulden schon überfällig waren (seit der letzten vollen Zahlung). */
  overdue: number;
}

export interface SuppliersState {
  shipments: Shipment[];
  relations: Record<string, SupplierRelation>;
}

interface SuppliersStateV1 {
  shipments: Shipment[];
}

declare module '../../core' {
  interface ModuleStates {
    suppliers: SuppliersState;
  }
  interface GameCommands {
    /** Paket bestellen. onCredit: jetzt liefern, später zahlen (braucht Vertrauen). */
    'suppliers.order': { supplierId: string; packageId: string; onCredit?: boolean };
    /** Schulden zurückzahlen, ohne amount komplett. */
    'suppliers.repay': { supplierId: string; amount?: number };
  }
  interface GameEvents {
    'shipment.ordered': {
      shipmentId: number;
      supplierId: string;
      amount: number;
      price: number;
      productId?: string;
      onCredit?: boolean;
    };
    'shipment.arrived': {
      shipmentId: number;
      supplierId: string;
      productId: string;
      amount: number;
      warehouseId: string;
      quality?: number;
    };
    /** Lieferproblem ist eingetreten. */
    'shipment.problem': { shipmentId: number; supplierId: string; kind: ShipmentProblem };
    'supplier.trustChanged': { supplierId: string; trust: number; delta: number };
    'supplier.repaid': { supplierId: string; amount: number; debt: number };
    'supplier.overdue': { supplierId: string; debt: number };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function getSuppliers(_state: GameState): readonly Supplier[] {
  return SUPPLIERS;
}

export function getSupplier(state: GameState, id: string): Supplier | undefined {
  return getSuppliers(state).find((s) => s.id === id);
}

/** Kontakt-ID im Handy. */
export function supplierContactId(supplierId: string): string {
  return `supplier:${supplierId}`;
}

/** Sortiment: Produkt-IDs, die der Lieferant grundsätzlich hat. */
export function assortment(supplier: Supplier): string[] {
  return [...new Set(supplier.packages.map((p) => p.productId))];
}

export function shipmentsInTransit(state: GameState): readonly Shipment[] {
  return state.modules.suppliers.shipments;
}

/** Fortschritt einer Lieferung von 0 (bestellt) bis 1 (angekommen). Während einer Verspätung steht sie. */
export function shipmentProgress(state: GameState, shipment: Shipment): number {
  const delay = shipment.problem === 'delayed' ? (shipment.delayMinutes ?? 0) : 0;
  const travel = shipment.arrivesAt - shipment.orderedAt - delay;
  if (travel <= 0) return 1;
  let elapsed = state.time - shipment.orderedAt;
  if (delay > 0 && shipment.problemAt !== undefined) {
    const pauseStart = shipment.problemAt - shipment.orderedAt;
    if (elapsed > pauseStart) elapsed = pauseStart + Math.max(0, elapsed - pauseStart - delay);
  }
  return Math.min(1, Math.max(0, elapsed / travel));
}

/** Ankunft, wie der Spieler sie kennt (eine Verspätung erst, wenn sie bekannt ist). */
export function expectedArrival(shipment: Shipment): number {
  if (shipment.problem === 'delayed' && !shipment.problemRevealed) {
    return shipment.arrivesAt - (shipment.delayMinutes ?? 0);
  }
  return shipment.arrivesAt;
}

/** Preis des günstigsten Pakets, das dir gerade angeboten wird (nach Rabatt). */
export function cheapestPackagePrice(state: GameState): number {
  return Math.min(
    ...getSuppliers(state).flatMap((s) => availablePackages(state, s.id).map((p) => packagePrice(state, s.id, p.id))),
  );
}

export function getRelation(state: GameState, supplierId: string): SupplierRelation {
  return state.modules.suppliers.relations[supplierId] ?? newRelation();
}

/** Bezeichnung der Beziehung, z.B. "Geschäftspartner". */
export function trustLabel(trust: number): string {
  if (trust >= 80) return 'Familie';
  if (trust >= 60) return 'Vertraut';
  if (trust >= 40) return 'Geschäftspartner';
  if (trust >= 20) return 'Bekannt';
  return 'Fremder';
}

/** Rabatt als Anteil (0,15 = 15 %). */
export function supplierDiscount(state: GameState, supplierId: string): number {
  const { trust } = getRelation(state, supplierId);
  return (Math.max(0, trust - DISCOUNT_FROM_TRUST) / (100 - DISCOUNT_FROM_TRUST)) * MAX_DISCOUNT;
}

/** Qualitätsbonus durch Vertrauen (bessere Ware). */
export function supplierQualityBonus(state: GameState, supplierId: string): number {
  return (getRelation(state, supplierId).trust / 100) * MAX_QUALITY_BONUS;
}

/** Kreditrahmen in Euro (0 = kein Kredit). */
export function creditLimit(state: GameState, supplierId: string): number {
  const { trust } = getRelation(state, supplierId);
  if (trust < CREDIT_MIN_TRUST) return 0;
  return Math.round((trust - CREDIT_TRUST_OFFSET) * CREDIT_PER_TRUST);
}

/** Noch nutzbarer Kredit in Euro. */
export function availableCredit(state: GameState, supplierId: string): number {
  if (isBlocked(state, supplierId)) return 0;
  return Math.max(0, creditLimit(state, supplierId) - getRelation(state, supplierId).debt);
}

/** Liefert der Lieferant gerade nicht, weil Schulden überfällig sind? */
export function isBlocked(state: GameState, supplierId: string): boolean {
  const rel = getRelation(state, supplierId);
  return rel.debt > 0 && rel.overdue > 0;
}

/** Pakete, die der Lieferant dir bei deinem Vertrauen anbietet. */
export function availablePackages(state: GameState, supplierId: string): SupplierPackage[] {
  const supplier = getSupplier(state, supplierId);
  if (!supplier) return [];
  const { trust } = getRelation(state, supplierId);
  return supplier.packages.filter((p) => (p.minTrust ?? 0) <= trust);
}

/** Preis nach Rabatt. */
export function packagePrice(state: GameState, supplierId: string, packageId: string): number {
  const pkg = getSupplier(state, supplierId)?.packages.find((p) => p.id === packageId);
  if (!pkg) return Number.POSITIVE_INFINITY;
  return Math.round(pkg.price * (1 - supplierDiscount(state, supplierId)));
}

/**
 * Lieferproblem auswürfeln. roll ist eine Zufallszahl in [0, 1).
 * Wahrscheinlichkeit steigt mit schlechter Zuverlässigkeit, sinkt mit Vertrauen; am Hafen kommt der Zoll dazu.
 */
export function rollShipmentProblem(roll: number, supplier: Supplier, trust: number): ShipmentProblem | null {
  const risk = (1 - supplier.reliability) * (1 - trust / 200);
  const seize = risk * SEIZE_FACTOR + (supplier.kind === 'port' ? PORT_SEIZE_EXTRA : 0);
  const delay = seize + risk * DELAY_FACTOR;
  const bad = delay + risk * BAD_QUALITY_FACTOR;
  if (roll < seize) return 'seized';
  if (roll < delay) return 'delayed';
  if (roll < bad) return 'badQuality';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Schreiben

function newRelation(): SupplierRelation {
  return { trust: START_TRUST, orders: 0, spent: 0, debt: 0, dueAt: null, overdue: 0 };
}

function relationFor(ctx: Ctx, supplierId: string): SupplierRelation {
  const relations = ctx.state.modules.suppliers.relations;
  relations[supplierId] ??= newRelation();
  return relations[supplierId];
}

function addTrust(ctx: Ctx, supplierId: string, delta: number): void {
  const rel = relationFor(ctx, supplierId);
  const before = rel.trust;
  rel.trust = Math.round(Math.min(100, Math.max(0, rel.trust + delta)) * 10) / 10;
  if (rel.trust !== before) {
    ctx.emit('supplier.trustChanged', {
      supplierId,
      trust: rel.trust,
      delta: Math.round((rel.trust - before) * 10) / 10,
    });
  }
}

function contactOf(supplier: Supplier) {
  return {
    id: supplierContactId(supplier.id),
    name: `${supplier.contactName} (${supplier.name})`,
    kind: 'supplier' as const,
  };
}

function tell(ctx: Ctx, supplier: Supplier, text: string): void {
  messages.send(ctx, { contact: contactOf(supplier), text });
}

function order(ctx: Ctx, supplierId: string, packageId: string, onCredit: boolean): CommandResult {
  const supplier = getSupplier(ctx.state, supplierId);
  const pkg = supplier?.packages.find((p) => p.id === packageId);
  if (!supplier || !pkg) return { ok: false, reason: 'Unbekanntes Paket.' };
  const rel = relationFor(ctx, supplierId);
  if ((pkg.minTrust ?? 0) > rel.trust) {
    return { ok: false, reason: `Dafür vertraut dir ${supplier.contactName} noch nicht genug.` };
  }
  if (isBlocked(ctx.state, supplierId)) {
    return { ok: false, reason: `${supplier.contactName} liefert erst wieder, wenn du deine Schulden bezahlt hast.` };
  }
  const price = packagePrice(ctx.state, supplierId, packageId);
  if (onCredit) {
    if (creditLimit(ctx.state, supplierId) === 0) {
      return { ok: false, reason: `${supplier.contactName} gibt dir noch keinen Kredit.` };
    }
    if (price > availableCredit(ctx.state, supplierId)) {
      return { ok: false, reason: `So viel Kredit gibt dir ${supplier.contactName} nicht.` };
    }
    rel.debt += price;
    rel.dueAt ??= ctx.now + CREDIT_TERM;
  } else if (!wallet.pay(ctx, price, 'dirty', `Bestellung ${supplier.name}`)) {
    return { ok: false, reason: 'Nicht genug Geld.' };
  }

  const quality = clampQuality(
    supplier.quality + supplierQualityBonus(ctx.state, supplierId) + (ctx.random() * 2 - 1) * QUALITY_SPREAD,
  );
  const problem = rollShipmentProblem(ctx.random(), supplier, rel.trust);
  const shipment: Shipment = {
    id: ctx.nextId(),
    supplierId,
    packageId,
    productId: pkg.productId,
    amount: pkg.amount,
    quality,
    warehouseId: DEFAULT_WAREHOUSE,
    price,
    orderedAt: ctx.now,
    arrivesAt: ctx.now + supplier.deliveryTime,
  };
  if (onCredit) shipment.onCredit = true;
  if (problem) {
    shipment.problem = problem;
    shipment.problemAt = ctx.now + Math.round(supplier.deliveryTime * PROBLEM_AT);
    if (problem === 'delayed') {
      const [min, max] = DELAY_RANGE;
      shipment.delayMinutes = Math.round(supplier.deliveryTime * (min + ctx.random() * (max - min)));
      shipment.arrivesAt += shipment.delayMinutes;
    }
    if (problem === 'badQuality') {
      const [min, max] = BAD_QUALITY_LOSS;
      shipment.promisedQuality = quality;
      shipment.quality = clampQuality(quality - (min + ctx.random() * (max - min)));
    }
  }
  ctx.state.modules.suppliers.shipments.push(shipment);

  rel.orders += 1;
  rel.spent += price;
  addTrust(ctx, supplierId, TRUST_PER_ORDER + (price / 1000) * TRUST_PER_1000_EUR + (onCredit ? 0 : TRUST_CASH_BONUS));
  journal.add(
    ctx,
    `${pkg.label} bei ${supplier.name} bestellt (${formatEuro(price)}${onCredit ? ' auf Kredit' : ''}).`,
  );
  ctx.emit('shipment.ordered', {
    shipmentId: shipment.id,
    supplierId,
    amount: pkg.amount,
    price,
    productId: pkg.productId,
    onCredit,
  });
  return { ok: true, data: { shipmentId: shipment.id } };
}

function repay(ctx: Ctx, supplierId: string, amount?: number): CommandResult {
  const supplier = getSupplier(ctx.state, supplierId);
  if (!supplier) return { ok: false, reason: 'Unbekannter Lieferant.' };
  const rel = relationFor(ctx, supplierId);
  if (rel.debt <= 0) return { ok: false, reason: `Du hast keine Schulden bei ${supplier.contactName}.` };
  const pay = Math.round(Math.min(rel.debt, amount ?? rel.debt));
  if (!(pay > 0)) return { ok: false, reason: 'Ungültiger Betrag.' };
  if (!wallet.pay(ctx, pay, 'dirty', `Schulden ${supplier.name}`)) return { ok: false, reason: 'Nicht genug Geld.' };
  rel.debt -= pay;
  if (rel.debt <= 0) {
    rel.debt = 0;
    const onTime = rel.overdue === 0 && rel.dueAt !== null && ctx.now <= rel.dueAt;
    rel.dueAt = null;
    rel.overdue = 0;
    if (onTime) addTrust(ctx, supplierId, TRUST_ON_TIME_REPAYMENT);
    journal.add(ctx, `Schulden bei ${supplier.name} bezahlt (${formatEuro(pay)}).`, 'good');
  } else {
    journal.add(ctx, `${formatEuro(pay)} an ${supplier.name} gezahlt, offen noch ${formatEuro(rel.debt)}.`);
  }
  ctx.emit('supplier.repaid', { supplierId, amount: pay, debt: rel.debt });
  return { ok: true };
}

function revealProblems(ctx: Ctx): void {
  const state = ctx.state.modules.suppliers;
  for (const s of [...state.shipments]) {
    if (!s.problem || s.problemRevealed || s.problemAt === undefined || s.problemAt > ctx.now) continue;
    if (s.problem === 'badQuality') continue; // zeigt sich erst bei der Ankunft
    const supplier = getSupplier(ctx.state, s.supplierId);
    if (!supplier) continue;
    s.problemRevealed = true;
    const goods = `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)}`;
    if (s.problem === 'delayed') {
      const delay = clock.formatDuration(s.delayMinutes ?? 0);
      tell(
        ctx,
        supplier,
        `Kontrolle auf der Strecke, der Fahrer muss warten. Deine ${goods} kommen ca. ${delay} später.`,
      );
      journal.add(ctx, `Lieferung von ${supplier.name} verspätet sich um ca. ${delay}.`, 'bad');
    } else {
      state.shipments = state.shipments.filter((x) => x.id !== s.id);
      tell(
        ctx,
        supplier,
        s.onCredit
          ? `Scheiße. Die haben den Wagen hochgenommen, deine ${goods} sind weg. Die Schulden bleiben trotzdem.`
          : `Scheiße. Die haben den Wagen hochgenommen, deine ${goods} sind weg. Pech, so läuft das Geschäft.`,
      );
      journal.add(ctx, `Lieferung von ${supplier.name} beschlagnahmt: ${goods} verloren.`, 'bad');
    }
    ctx.emit('shipment.problem', { shipmentId: s.id, supplierId: s.supplierId, kind: s.problem });
  }
}

function deliver(ctx: Ctx): void {
  const state = ctx.state.modules.suppliers;
  const arrived = state.shipments.filter((s) => s.arrivesAt <= ctx.now);
  if (arrived.length === 0) return;
  state.shipments = state.shipments.filter((s) => s.arrivesAt > ctx.now);
  for (const s of arrived) {
    store(ctx, {
      productId: s.productId,
      amount: s.amount,
      warehouseId: s.warehouseId,
      quality: s.quality,
      unitCost: s.price / s.amount,
    });
    const warehouse = getWarehouse(ctx.state, s.warehouseId);
    const goods = `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)}`;
    journal.add(ctx, `Lieferung angekommen: ${goods} im ${warehouse?.name ?? 'Lager'}.`, 'good');
    const supplier = getSupplier(ctx.state, s.supplierId);
    if (s.problem === 'badQuality' && supplier) {
      s.problemRevealed = true;
      tell(ctx, supplier, 'Ich sag es lieber gleich: Die letzte Ladung ist nicht so gut wie versprochen. Kommt vor.');
      journal.add(ctx, `Die Ware von ${supplier.name} ist schlechter als versprochen.`, 'bad');
      ctx.emit('shipment.problem', { shipmentId: s.id, supplierId: s.supplierId, kind: 'badQuality' });
    }
    ctx.emit('shipment.arrived', {
      shipmentId: s.id,
      supplierId: s.supplierId,
      productId: s.productId,
      amount: s.amount,
      warehouseId: s.warehouseId,
      quality: s.quality,
    });
  }
}

/** Überfällige Schulden: Vertrauen sinkt, Aufschlag, neue Frist, Drohung. */
function checkDebts(ctx: Ctx): void {
  for (const [supplierId, rel] of Object.entries(ctx.state.modules.suppliers.relations)) {
    if (rel.debt <= 0 || rel.dueAt === null || rel.dueAt > ctx.now) continue;
    const supplier = getSupplier(ctx.state, supplierId);
    if (!supplier) continue;
    rel.overdue += 1;
    rel.debt = Math.round(rel.debt * (1 + LATE_INTEREST));
    rel.dueAt = ctx.now + OVERDUE_EXTENSION;
    addTrust(ctx, supplierId, -TRUST_LATE_PENALTY);
    tell(
      ctx,
      supplier,
      rel.overdue === 1
        ? `Du schuldest mir ${formatEuro(rel.debt)}. Das Geld war fällig. Ich liefer nichts mehr, bis du zahlst.`
        : `Ich warte immer noch auf ${formatEuro(rel.debt)}. Meine Geduld ist bald am Ende.`,
    );
    journal.add(ctx, `Schulden bei ${supplier.name} überfällig: ${formatEuro(rel.debt)} inkl. Aufschlag.`, 'bad');
    ctx.emit('supplier.overdue', { supplierId, debt: rel.debt });
  }
}

const clampQuality = (q: number) => Math.round(Math.min(0.98, Math.max(0.05, q)) * 100) / 100;

function initialRelations(): Record<string, SupplierRelation> {
  return Object.fromEntries(SUPPLIERS.map((s) => [s.id, newRelation()]));
}

/** Kann der Spieler über diesen Lieferanten noch an Ware kommen (Geld oder Kredit)? */
/**
 * Kann der Spieler hier noch Ware bekommen? Ein gesperrter Lieferant zählt, wenn das Geld reicht, um erst die
 * Schulden zu tilgen und dann ein Paket zu kaufen (wer Geld hat, ist nicht pleite).
 */
function canRestock(state: GameState, supplier: Supplier): boolean {
  const money = wallet.balance(state, 'dirty');
  const blocked = isBlocked(state, supplier.id);
  const debt = blocked ? getRelation(state, supplier.id).debt : 0;
  const credit = availableCredit(state, supplier.id);
  return availablePackages(state, supplier.id).some((p) => {
    const price = packagePrice(state, supplier.id, p.id);
    return money >= debt + price || credit >= price;
  });
}

export default defineModule({
  id: 'suppliers',
  version: 2,
  dependsOn: ['goods'],
  init: (ctx) => {
    const [rotterdam, frankfurt] = [SUPPLIERS[0], SUPPLIERS[1]];
    const fast = frankfurt.packages[0];
    messages.send(ctx, {
      contact: contactOf(frankfurt),
      text: `Brauchst du schnell was? Ich bin in ca. ${clock.formatDuration(frankfurt.deliveryTime)} in Köln. Kostet halt.`,
      options: [
        {
          id: 'order',
          label: `${fast.label} bestellen (${formatEuro(fast.price)})`,
          command: { type: 'suppliers.order', payload: { supplierId: frankfurt.id, packageId: fast.id } },
        },
        { id: 'later', label: 'Später', reply: 'Melde mich.' },
      ],
    });
    const first = rotterdam.packages[0];
    messages.send(ctx, {
      contact: contactOf(rotterdam),
      text:
        `Du brauchst Nachschub? Wir liefern große Mengen nach Köln, billiger als jeder andere. ` +
        `Lieferzeit ca. ${clock.formatDuration(rotterdam.deliveryTime)}. Alle Angebote in der Lieferanten-App.`,
      options: [
        {
          id: 'order',
          label: `${first.label} bestellen (${formatEuro(first.price)})`,
          command: { type: 'suppliers.order', payload: { supplierId: rotterdam.id, packageId: first.id } },
        },
        { id: 'later', label: 'Später', reply: 'Melde mich.' },
      ],
    });
    return { shipments: [], relations: initialRelations() };
  },
  tick: (ctx) => {
    revealProblems(ctx);
    deliver(ctx);
    checkDebts(ctx);
  },
  commands: {
    'suppliers.order': (ctx, { supplierId, packageId, onCredit }) => order(ctx, supplierId, packageId, !!onCredit),
    'suppliers.repay': (ctx, { supplierId, amount }) => repay(ctx, supplierId, amount),
  },
  migrations: {
    2: (old: SuppliersStateV1): SuppliersState => ({ shipments: old.shipments, relations: initialRelations() }),
  },
  // Pleite-Regel: Wer eine Lieferung erwartet oder sich eine leisten kann (bar oder auf Kredit), macht weiter.
  solvency: (state) =>
    state.modules.suppliers.shipments.length > 0 || getSuppliers(state).some((s) => canRestock(state, s)),
});
