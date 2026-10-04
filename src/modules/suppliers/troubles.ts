// Lieferprobleme mit Gründen und Entscheidungen (Auftrag 23). Gründe als Daten in problems.ts, Texte in der Stimme
// des Lieferanten (voices.ts). Ein Teil der Verspätungen und drohenden Beschlagnahmen kommt als Nachricht mit
// Optionen und Frist ('suppliers.resolveProblem'): Umweg gegen Aufpreis, Teillieferung, Umleiten in ein anderes Lager,
// Schmieren. Ohne Antwort gilt "abwarten" (wie vorher: Verspätung bzw. Beschlagnahme). Dazu Chancen: früher da, Ware
// obendrauf, bessere Qualität. Die Wahrscheinlichkeiten der Probleme (rollShipmentProblem) bleiben gleich.

import {
  type CommandResult,
  type Ctx,
  clock,
  formatEuro,
  type GameState,
  journal,
  type MessageOption,
  messages,
  texts,
  wallet,
} from '../../core';
import { cityName } from '../city';
import { formatProductAmount, getWarehouse, getWarehouses, productName } from '../goods';
import { portName } from '../logistics';
import {
  BRIBE_DELAY,
  BRIBE_MIN,
  BRIBE_SHARE,
  BRIBE_SUCCESS,
  DECISION_SHARE_DELAY,
  DECISION_SHARE_SEIZE,
  DECISION_TIME,
  DETOUR_COST_SHARE,
  DETOUR_MIN_COST,
  DETOUR_REMAINING,
  LUCK_BONUS,
  LUCK_CHANCE,
  LUCK_EARLY,
  LUCK_QUALITY,
  PARTIAL_SHARE,
  REDIRECT_REMAINING,
} from './config';
import { contactOf, getSupplier, type Shipment, type Supplier, supplierIn, supplierVia, tell } from './index';
import { type DelayChoice, findReason, PROBLEM_REASONS, type ProblemKind, reasonVars, routeKindOf } from './problems';
import { type SupplierTextKey, supplierVariants } from './voices';

/** Antworten auf ein Lieferproblem. 'wait' ist die Wahl ohne Antwort. */
export type ProblemChoice = DelayChoice | 'bribe' | 'wait';

export const CHOICE_NAMES: Readonly<Record<ProblemChoice, string>> = {
  detour: 'Umweg',
  partial: 'Teillieferung',
  redirect: 'Umgeleitet',
  bribe: 'Geschmiert',
  wait: 'Abgewartet',
};

/** Offene Rückfrage an einer Lieferung. */
export interface ShipmentDecision {
  kind: 'delay' | 'seize';
  until: number;
  choices: ProblemChoice[];
  /** Aufpreis für den Umweg bzw. Schmiergeld. */
  cost: number;
  /** Ziel beim Umleiten. */
  redirectTo?: string;
}

export type ShipmentLuck = 'early' | 'bonus' | 'betterQuality';

// ---------------------------------------------------------------------------------------------
// Texte

/** Text in der Stimme des Lieferanten (voices.ts), ohne direkte Wiederholung. */
export function voice(ctx: Ctx, supplier: Supplier, key: SupplierTextKey, vars: Record<string, string> = {}): string {
  return texts.pick(ctx, `supplier:${supplier.id}:${key}`, supplierVariants(supplier.id, key), vars);
}

/** Grund für ein Problem auswürfeln (ohne direkte Wiederholung pro Weg) und an der Lieferung merken. */
export function rollReason(ctx: Ctx, s: Shipment, supplier: Supplier, kind: ProblemKind): Record<string, string> {
  const cityId = s.cityId ?? 'koeln';
  const route = routeKindOf(supplierIn(supplier, cityId), cityId);
  const reason = texts.pickItem(ctx, `reason:${route}:${kind}`, PROBLEM_REASONS[route][kind]);
  s.route = route;
  s.reasonId = reason.id;
  const vars = reasonVars(supplier, cityId, cityName(cityId), portName(cityId));
  return { reason: texts.fill(reason.text, vars), reasonLabel: texts.fill(reason.label, vars) };
}

/** Autobahn des Kuriers für Texte wie "Freie Bahn auf der {road}". */
function roadVar(supplier: Supplier, s: Shipment): { road: string } {
  return { road: supplierVia(supplier, s.cityId ?? 'koeln') ?? 'Autobahn' };
}

function goodsOf(s: Pick<Shipment, 'productId' | 'amount'>): string {
  return `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)}`;
}

/** Grund eines Lieferproblems als kurzer Text (z.B. "Stau auf der A3"), null ohne bekannten Grund. */
export function shipmentReason(state: GameState, s: Shipment): string | null {
  if (!s.route || !s.reasonId) return null;
  const supplier = getSupplier(state, s.supplierId);
  if (!supplier) return null;
  const kind: ProblemKind =
    s.problem === 'seized' || s.decision?.kind === 'seize' || s.choice === 'bribe'
      ? 'seize'
      : s.problem === 'badQuality'
        ? 'badQuality'
        : 'delay';
  const cityId = s.cityId ?? 'koeln';
  return texts.fill(
    findReason(s.route, kind, s.reasonId).label,
    reasonVars(supplier, cityId, cityName(cityId), portName(cityId)),
  );
}

// ---------------------------------------------------------------------------------------------
// Problem wird bekannt

/** Verspätung oder Beschlagnahme tritt ein: Nachricht, je nach Fall mit Rückfrage. */
export function revealProblem(ctx: Ctx, s: Shipment, supplier: Supplier): void {
  const shipments = ctx.state.modules.suppliers;
  const goods = goodsOf(s);
  const remaining = s.arrivesAt - ctx.now;
  if (s.problem === 'delayed') {
    const delay = clock.formatDuration(s.delayMinutes ?? 0);
    const why = rollReason(ctx, s, supplier, 'delay');
    const choices = delayChoices(ctx.state, s);
    const time = Math.min(DECISION_TIME, remaining - 1);
    if (choices.length > 0 && time >= 15 && ctx.chance(DECISION_SHARE_DELAY)) {
      const cost = Math.max(DETOUR_MIN_COST, Math.round((s.price * DETOUR_COST_SHARE) / 5) * 5);
      const redirectTo = otherWarehouse(ctx.state, s);
      s.decision = {
        kind: 'delay',
        until: ctx.now + time,
        choices: [...choices, 'wait'],
        cost,
        ...(redirectTo ? { redirectTo } : {}),
      };
      messages.send(ctx, {
        contact: contactOf(supplier),
        text: voice(ctx, supplier, 'delayedAsk', { ...why, goods, delay, ...roadVar(supplier, s) }),
        options: decisionOptions(ctx.state, s),
        expiresIn: time,
      });
    } else {
      tell(ctx, supplier, voice(ctx, supplier, 'delayed', { ...why, goods, delay, ...roadVar(supplier, s) }));
    }
    journal.add(ctx, `Lieferung von ${supplier.name} verspätet sich um ca. ${delay} (${why.reasonLabel}).`, 'bad');
    ctx.emit('shipment.problem', {
      shipmentId: s.id,
      supplierId: s.supplierId,
      kind: 'delayed',
      reason: why.reasonLabel,
    });
    return;
  }
  // Beschlagnahme: mit Rückfrage erst eine Drohung (Schmieren), sonst wie vorher sofort weg.
  const why = rollReason(ctx, s, supplier, 'seize');
  const time = Math.min(DECISION_TIME, remaining - 1);
  if (time >= 15 && ctx.chance(DECISION_SHARE_SEIZE)) {
    const cost = Math.max(BRIBE_MIN, Math.round((s.price * BRIBE_SHARE) / 10) * 10);
    s.decision = { kind: 'seize', until: ctx.now + time, choices: ['bribe', 'wait'], cost };
    messages.send(ctx, {
      contact: contactOf(supplier),
      text: voice(ctx, supplier, 'seizeThreat', { ...why, goods, cost: formatEuro(cost) }),
      options: decisionOptions(ctx.state, s),
      expiresIn: time,
    });
    journal.add(ctx, `Lieferung von ${supplier.name} in Gefahr (${why.reasonLabel}).`, 'bad');
    return;
  }
  shipments.shipments = shipments.shipments.filter((x) => x.id !== s.id);
  tell(ctx, supplier, voice(ctx, supplier, s.onCredit ? 'seizedCredit' : 'seized', { ...why, goods }));
  journal.add(ctx, `Lieferung von ${supplier.name} beschlagnahmt (${why.reasonLabel}): ${goods} verloren.`, 'bad');
  ctx.emit('shipment.problem', { shipmentId: s.id, supplierId: s.supplierId, kind: 'seized', reason: why.reasonLabel });
}

/** Was bei dieser Verspätung geht: laut Grund, Umleiten nur mit einem zweiten Lager in der Stadt, nicht bei Schiffen. */
function delayChoices(state: GameState, s: Shipment): DelayChoice[] {
  if (!s.route || !s.reasonId) return [];
  const reason = findReason(s.route, 'delay', s.reasonId);
  const base: readonly DelayChoice[] = reason.choices ?? ['detour', 'redirect'];
  return base.filter((c) => {
    if (c === 'redirect') return !s.toPort && otherWarehouse(state, s) !== null;
    if (c === 'detour') return s.route !== 'ship';
    return s.amount >= 2;
  });
}

/** Ein anderes eigenes Lager in derselben Stadt (das erste nach der Liste), null ohne. */
function otherWarehouse(state: GameState, s: Shipment): string | null {
  if (s.toPort) return null;
  return getWarehouses(state, s.cityId ?? 'koeln').find((w) => w.id !== s.warehouseId)?.id ?? null;
}

function decisionOptions(state: GameState, s: Shipment): MessageOption[] {
  const d = s.decision;
  if (!d) return [];
  const option = (choice: ProblemChoice, label: string, reply: string): MessageOption => ({
    id: choice,
    label,
    reply,
    command: { type: 'suppliers.resolveProblem', payload: { shipmentId: s.id, choice } },
  });
  return d.choices.map((c) => {
    if (c === 'detour') return option(c, `Umweg (${formatEuro(d.cost)})`, 'Nimm den Umweg, ich zahl.');
    if (c === 'partial') return option(c, 'Teillieferung', 'Bring, was geht. Rest später.');
    if (c === 'redirect') {
      const name = d.redirectTo ? getWarehouse(state, d.redirectTo)?.name : undefined;
      return option(c, `Ins ${name ?? 'andere Lager'}`, 'Fahr ins andere Lager.');
    }
    if (c === 'bribe') return option(c, `Schmieren (${formatEuro(d.cost)})`, 'Mach es. Ich zahl.');
    return option(
      c,
      d.kind === 'seize' ? 'Aufgeben' : 'Abwarten',
      d.kind === 'seize' ? 'Lass es.' : 'Dann warten wir.',
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Entscheidung

/** Befehl 'suppliers.resolveProblem'. */
export function resolveProblem(ctx: Ctx, shipmentId: number, choice: ProblemChoice): CommandResult {
  const s = ctx.state.modules.suppliers.shipments.find((x) => x.id === shipmentId);
  const d = s?.decision;
  if (!s || !d) return { ok: false, reason: 'Diese Lieferung braucht keine Entscheidung.' };
  if (!d.choices.includes(choice)) return { ok: false, reason: 'Das geht bei dieser Lieferung nicht.' };
  const supplier = getSupplier(ctx.state, s.supplierId);
  if (!supplier) return { ok: false, reason: 'Unbekannter Lieferant.' };
  const cityId = s.cityId ?? 'koeln';
  if (choice === 'detour' || choice === 'bribe') {
    const why = choice === 'detour' ? `Umweg ${supplier.name}` : `Schmiergeld ${supplier.name}`;
    if (
      !wallet.pay(ctx, d.cost, 'dirty', why, {
        category: choice === 'detour' ? 'goods.purchase' : 'loss.police',
        cityId,
      })
    ) {
      return { ok: false, reason: 'Nicht genug Geld.' };
    }
  }
  s.decision = undefined;
  s.choice = choice;
  retract(ctx, s.id);
  const goods = goodsOf(s);
  if (choice === 'detour' || choice === 'redirect') {
    const delay = s.delayMinutes ?? 0;
    const keep = Math.round(delay * (choice === 'detour' ? DETOUR_REMAINING : REDIRECT_REMAINING));
    s.arrivesAt -= delay - keep;
    s.delayMinutes = keep;
    if (choice === 'redirect' && d.redirectTo) s.warehouseId = d.redirectTo;
    const warehouse = getWarehouse(ctx.state, s.warehouseId)?.name ?? 'Lager';
    tell(ctx, supplier, voice(ctx, supplier, choice === 'detour' ? 'detourDone' : 'redirectDone', { warehouse }));
  } else if (choice === 'partial') {
    const now = Math.max(1, Math.round(s.amount * PARTIAL_SHARE));
    const rest = s.amount - now;
    const delay = s.delayMinutes ?? 0;
    if (rest > 0) {
      const restPrice = Math.round((s.price * rest) / s.amount);
      const remainder: Shipment = { ...s, id: ctx.nextId(), amount: rest, price: restPrice, partOf: s.id };
      delete remainder.choice;
      ctx.state.modules.suppliers.shipments.push(remainder);
      s.price -= restPrice;
    }
    s.amount = now;
    s.arrivesAt -= delay;
    s.delayMinutes = 0;
    tell(ctx, supplier, voice(ctx, supplier, 'partialDone', { share: goodsOf(s) }));
  } else if (choice === 'bribe') {
    if (ctx.chance(BRIBE_SUCCESS)) {
      s.problem = undefined;
      s.arrivesAt += BRIBE_DELAY;
      tell(ctx, supplier, voice(ctx, supplier, 'bribeSaved', { goods }));
      journal.add(ctx, `Geschmiert: Die Lieferung von ${supplier.name} ist durch.`, 'good');
    } else {
      seize(ctx, s, supplier, 'bribeFailed');
    }
  } else if (d.kind === 'seize') {
    seize(ctx, s, supplier, null);
  }
  ctx.emit('shipment.decided', { shipmentId: s.id, supplierId: s.supplierId, choice });
  return { ok: true };
}

function seize(ctx: Ctx, s: Shipment, supplier: Supplier, key: SupplierTextKey | null): void {
  const state = ctx.state.modules.suppliers;
  state.shipments = state.shipments.filter((x) => x.id !== s.id);
  const goods = goodsOf(s);
  const why = s.reasonId && s.route ? findReason(s.route, 'seize', s.reasonId) : null;
  const vars = reasonVars(supplier, s.cityId ?? 'koeln', cityName(s.cityId ?? 'koeln'), portName(s.cityId ?? 'koeln'));
  const reason = why ? texts.fill(why.text, vars) : '';
  const label = why ? texts.fill(why.label, vars) : '';
  tell(ctx, supplier, voice(ctx, supplier, key ?? (s.onCredit ? 'seizedCredit' : 'seized'), { reason, goods }));
  journal.add(
    ctx,
    `Lieferung von ${supplier.name} beschlagnahmt${label ? ` (${label})` : ''}: ${goods} verloren.`,
    'bad',
  );
  ctx.emit('shipment.problem', { shipmentId: s.id, supplierId: s.supplierId, kind: 'seized', reason: label });
}

function retract(ctx: Ctx, shipmentId: number): void {
  messages.retractWhere(
    ctx,
    (m) =>
      !!m.options?.some(
        (o) => o.command?.type === 'suppliers.resolveProblem' && o.command.payload.shipmentId === shipmentId,
      ),
  );
}

/** Jede Minute: Fristen ohne Antwort mit "abwarten" schließen. */
export function upkeepDecisions(ctx: Ctx): void {
  for (const s of [...ctx.state.modules.suppliers.shipments]) {
    if (s.decision && s.decision.until <= ctx.now) resolveProblem(ctx, s.id, 'wait');
  }
}

// ---------------------------------------------------------------------------------------------
// Chancen

/** Bei der Bestellung (ohne Problem): vielleicht eine Chance. */
export function rollLuck(ctx: Ctx, s: Shipment, deliveryTime: number): void {
  if (!ctx.chance(LUCK_CHANCE)) return;
  const roll = ctx.random();
  if (roll < 1 / 3) {
    s.luck = 'early';
    s.arrivesAt -= Math.round(deliveryTime * LUCK_EARLY);
  } else s.luck = roll < 2 / 3 ? 'bonus' : 'betterQuality';
}

/** Bei der Ankunft: Ware obendrauf oder bessere Qualität, mit Nachricht. "Früher da" meldet sich ebenfalls hier. */
export function applyArrivalLuck(ctx: Ctx, s: Shipment, supplier: Supplier): void {
  if (!s.luck || s.luckShown) return;
  s.luckShown = true;
  let text = '';
  if (s.luck === 'bonus') {
    const [min, max] = LUCK_BONUS;
    const extra = Math.max(1, Math.round(s.amount * (min + ctx.random() * (max - min))));
    s.price = Math.round(s.price);
    s.amount += extra;
    text = voice(ctx, supplier, 'bonus', { extra: goodsOf({ productId: s.productId, amount: extra }) });
  } else if (s.luck === 'betterQuality') {
    const [min, max] = LUCK_QUALITY;
    s.quality = Math.round(Math.min(0.98, s.quality + min + ctx.random() * (max - min)) * 100) / 100;
    text = voice(ctx, supplier, 'betterQuality');
  } else {
    text = voice(ctx, supplier, 'early', { goods: goodsOf(s), ...roadVar(supplier, s) });
  }
  tell(ctx, supplier, text);
  ctx.emit('shipment.luck', { shipmentId: s.id, supplierId: s.supplierId, kind: s.luck });
}
