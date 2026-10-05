// Lieferpläne und Nachkauf (Auftrag 43): Fenna, die Disponentin in Jansens Kontor, übernimmt die Woche so weit, wie du
// willst. Pro Kunde (oder für alle, defaultPlan) nimmt sie Bestellungen an (nur mit Ware oder alle) und liefert aus,
// sobald die Ware im Hafen liegt (eigener Lkw, sonst Spedition, oder nur Spedition). Nachkauf-Regeln halten eine Ware
// im Hafen über einer Menge: Liegt weniger da und ist auch nichts unterwegs, bestellt sie beim gewählten Produzenten
// einen Container. Sie arbeitet einmal pro Stunde (DISPATCH_EVERY) und nur mit dem, was du auch selbst tun könntest
// (dieselben Befehle, dieselben Kosten).

import { type CommandResult, type Ctx, type GameState, journal } from '../../core';
import { HARBOR_CITY } from '../city';
import { freeVehicles, vehicleSpec } from '../fleet';
import { productName } from '../goods';
import { CONTAINER_SIZES, type ContainerSize, PRODUCERS } from './data';
import {
  answerOrder,
  buyContainer,
  deliver,
  getCustomer,
  getShipments,
  orderCoverage,
  ownedPorts,
  portFor,
  portStock,
  shippableItems,
  type TradeOrder,
} from './index';

/** So oft (Spielminuten) schaut Fenna, was zu tun ist. */
export const DISPATCH_EVERY = 60;

/** Was Fenna für einen Kunden tut. */
export interface CustomerPlan {
  /** Bestellungen annehmen: 'covered' nur mit Ware (im Hafen oder unterwegs), 'all' alle, 'off' das machst du. */
  accept: 'off' | 'covered' | 'all';
  /** Ausliefern, sobald Ware da ist: 'truck' eigener Lkw, sonst Spedition; 'freight' nur Spedition; 'off' du. */
  deliver: 'off' | 'truck' | 'freight';
}

/** Ohne Plan macht Fenna nichts (wie vor Auftrag 43). */
export const NO_PLAN: CustomerPlan = { accept: 'off', deliver: 'off' };

/** Eine Nachkauf-Regel: Liegt von der Ware weniger als minGrams im Hafen oder unterwegs, kommt ein Container. */
export interface RestockRule {
  id: number;
  productId: string;
  minGrams: number;
  producerId: string;
  size: ContainerSize['id'];
  portId: string;
}

export const ACCEPT_LABELS: Record<CustomerPlan['accept'], string> = {
  off: 'Selbst',
  covered: 'Mit Ware',
  all: 'Alle',
};
export const DELIVER_LABELS: Record<CustomerPlan['deliver'], string> = {
  off: 'Selbst',
  truck: 'Lkw, sonst Spedition',
  freight: 'Spedition',
};

/** Plan für einen Kunden: eigener, sonst der für alle. */
export function planFor(state: GameState, customerId: string): CustomerPlan {
  const s = state.modules.trade;
  return s.plans?.[customerId] ?? s.defaultPlan ?? NO_PLAN;
}

/** Hat der Kunde einen eigenen Plan (statt dem für alle)? */
export function hasOwnPlan(state: GameState, customerId: string): boolean {
  return state.modules.trade.plans?.[customerId] !== undefined;
}

export function restockRules(state: GameState): readonly RestockRule[] {
  return state.modules.trade.restock ?? [];
}

/** Gramm einer Ware in einem Hafen plus Container dorthin unterwegs (auf See, beim Zoll, am Kai). */
export function stockWithIncoming(state: GameState, portId: string, productId: string): number {
  const here = portStock(state, portId)[productId]?.amount ?? 0;
  const incoming = getShipments(state)
    .filter((x) => x.portId === portId && x.productId === productId)
    .reduce((sum, x) => sum + x.amount, 0);
  return here + incoming;
}

function isPlan(plan: Partial<CustomerPlan>): boolean {
  const okAccept = plan.accept === undefined || plan.accept in ACCEPT_LABELS;
  const okDeliver = plan.deliver === undefined || plan.deliver in DELIVER_LABELS;
  return okAccept && okDeliver;
}

/** Plan setzen: für einen Kunden (customerId) oder für alle (ohne); reset nimmt den eigenen Plan weg. */
export function setPlan(ctx: Ctx, plan: Partial<CustomerPlan>, customerId?: string, reset = false): CommandResult {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return { ok: false, reason: 'Erst nach dem Verkauf.' };
  if (!isPlan(plan)) return { ok: false, reason: 'Diesen Plan gibt es nicht.' };
  if (customerId === undefined) {
    s.defaultPlan = { ...(s.defaultPlan ?? NO_PLAN), ...plan };
    return { ok: true };
  }
  if (!getCustomer(ctx.state, customerId)) return { ok: false, reason: 'Diesen Kunden gibt es nicht.' };
  s.plans ??= {};
  if (reset) {
    delete s.plans[customerId];
    return { ok: true };
  }
  s.plans[customerId] = { ...planFor(ctx.state, customerId), ...plan };
  return { ok: true };
}

/** Nachkauf-Regel anlegen (eine pro Ware und Hafen; eine neue ersetzt die alte). */
export function addRestock(ctx: Ctx, rule: Omit<RestockRule, 'id' | 'portId'> & { portId?: string }): CommandResult {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return { ok: false, reason: 'Erst nach dem Verkauf.' };
  const producer = PRODUCERS.find((p) => p.id === rule.producerId);
  if (!producer) return { ok: false, reason: 'Diesen Produzenten gibt es nicht.' };
  if (producer.products[rule.productId] === undefined) {
    return { ok: false, reason: `${producer.name} hat kein ${productName(rule.productId)}.` };
  }
  if (!CONTAINER_SIZES.some((c) => c.id === rule.size)) return { ok: false, reason: 'Diese Größe gibt es nicht.' };
  if (!(Number.isFinite(rule.minGrams) && rule.minGrams > 0)) return { ok: false, reason: 'Ab wie viel?' };
  const portId = rule.portId ?? ownedPorts(ctx.state)[0] ?? HARBOR_CITY;
  if (!ownedPorts(ctx.state).includes(portId)) return { ok: false, reason: 'Dort hast du keinen Hafen.' };
  s.restock ??= [];
  s.restock = s.restock.filter((r) => !(r.productId === rule.productId && r.portId === portId));
  const id = ctx.nextId();
  s.restock.push({
    id,
    productId: rule.productId,
    minGrams: Math.round(rule.minGrams),
    producerId: rule.producerId,
    size: rule.size,
    portId,
  });
  return { ok: true, data: { ruleId: id } };
}

export function removeRestock(ctx: Ctx, ruleId: number): CommandResult {
  const s = ctx.state.modules.trade;
  const before = (s.restock ?? []).length;
  s.restock = (s.restock ?? []).filter((r) => r.id !== ruleId);
  return s.restock.length < before ? { ok: true } : { ok: false, reason: 'Diese Regel gibt es nicht.' };
}

/** Der passende freie Lkw für eine Lieferung (der kleinste, in den sie passt), sonst null. */
function truckFor(state: GameState, portId: string, order: TradeOrder): number | null {
  const grams = shippableItems(state, portId, order).reduce((sum, i) => sum + i.amount, 0);
  const fits = freeVehicles(state, HARBOR_CITY).filter((v) => vehicleSpec(state, v.id).capacity >= grams);
  return fits.at(-1)?.id ?? null;
}

/** Fennas Runde: annehmen, ausliefern, nachkaufen. */
export function dispatcherTick(ctx: Ctx): void {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return;
  const done: string[] = [];
  // Annehmen.
  const coverage = orderCoverage(ctx.state);
  for (const order of s.orders.filter((o) => o.status === 'open')) {
    const plan = planFor(ctx.state, order.customerId);
    if (plan.accept === 'off') continue;
    if (plan.accept === 'covered' && (coverage.get(order.id) ?? 1) > 0) continue;
    if (answerOrder(ctx, order.id, 'accept').ok) {
      done.push(`angenommen: ${getCustomer(ctx.state, order.customerId)?.name ?? 'Kunde'}`);
    }
  }
  // Ausliefern, sobald Ware im Hafen liegt.
  for (const order of s.orders.filter((o) => o.status === 'accepted')) {
    const plan = planFor(ctx.state, order.customerId);
    if (plan.deliver === 'off') continue;
    const portId = portFor(ctx.state, order);
    if (!portId) continue;
    const truck = plan.deliver === 'truck' ? truckFor(ctx.state, portId, order) : null;
    if (deliver(ctx, order.id, portId, truck).ok) {
      done.push(`ausgeliefert: ${getCustomer(ctx.state, order.customerId)?.name ?? 'Kunde'}`);
    }
  }
  // Nachkauf.
  for (const rule of restockRules(ctx.state)) {
    if (!ownedPorts(ctx.state).includes(rule.portId)) continue;
    if (stockWithIncoming(ctx.state, rule.portId, rule.productId) >= rule.minGrams) continue;
    if (buyContainer(ctx, rule.producerId, rule.productId, rule.size, rule.portId).ok) {
      done.push(`nachgekauft: ${productName(rule.productId)}`);
    }
  }
  if (done.length > 0) journal.add(ctx, `Fenna (Disposition): ${done.join(', ')}.`, 'info');
}
