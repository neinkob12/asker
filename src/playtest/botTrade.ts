// Der Bot in der Hafen-Phase (Auftrag 40): Als Boss von Deutschland verkauft er, sobald Jansen anruft. Danach kauft er
// für die neuen Bestellungen ein und nimmt nur die an, für die die Ware reicht (orderCoverage). Er liefert, sobald die
// Ware in einem Hafen liegt (eigener Lkw, sonst Spedition), und kauft Container nach: für das, was an Bestellungen offen
// ist, plus einen Puffer für die nächste Woche, beim günstigsten
// Produzenten, im Hafen mit dem ruhigsten Zoll, in halben Containern (verteilt das Risiko). Ist eine Frist knapp, holt
// er die Ware aus Jansens Netz (teurer, am nächsten Tag da). Wird der Zoll in Rotterdam scharf, mietet er Antwerpen dazu.
// Er schickt nur Befehle, genau wie die Oberfläche.

import type { Command, GameState } from '../core';
import { isBusinessSold, saleStatus } from '../modules/city';
import { getVehicles, VEHICLE_MODELS, vehiclePrice, vehicleStatus } from '../modules/fleet';
import { amountInProgress } from '../modules/laundering';
import { customsHeat } from '../modules/police';
import {
  CONTAINER_SIZES,
  type ContainerSize,
  containerCost,
  getShipments,
  harborPorts,
  isTradeActive,
  openOrders,
  orderCoverage,
  ownedPorts,
  PRODUCERS,
  pendingDeliveries,
  portFor,
  totalStock,
} from '../modules/trade';

const DAY = 1440;
/** So viel Schwarzgeld bleibt immer übrig (Spedition, Löhne bei der Ankunft). */
const TRADE_RESERVE = 60_000;
/** Puffer über die offenen Bestellungen hinaus: Anteil einer Woche Bedarf. */
const BUFFER_SHARE = 0.3;
/** Frist knapp: dann Jansens Netz statt Schiff. */
const URGENT_MINUTES = 3 * DAY;
/** Ab diesem Zoll-Heat in Rotterdam mietet er einen zweiten Hafen. */
const SECOND_PORT_HEAT = 30;

export type BotRun = (command: Command) => boolean;

/** Als Boss von Deutschland: verkaufen, sobald Jansen angerufen hat. */
export function sellWhenOffered(state: GameState, run: BotRun): void {
  if (isBusinessSold(state)) return;
  const status = saleStatus(state);
  if (status === 'calling' || status === 'later') run({ type: 'city.sell', payload: {} });
}

/** Gramm pro Sorte aus einer Liste von Bestellungen. */
function sum(orders: readonly { items: readonly { productId: string; amount: number }[] }[], share = 1) {
  const result = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) result.set(item.productId, (result.get(item.productId) ?? 0) + item.amount * share);
  }
  return result;
}

/** Hafen für neue Container: der mit der meisten Ware (alles für eine Bestellung muss in einem Hafen liegen), außer
 * der Zoll dort ist zu scharf, dann der ruhigste. */
function targetPort(state: GameState): string {
  const ports = ownedPorts(state);
  const stock = (id: string) => Object.values(state.modules.trade.stock[id] ?? {}).reduce((s, l) => s + l.amount, 0);
  const fullest = [...ports].sort((a, b) => stock(b) - stock(a) || a.localeCompare(b))[0];
  if (customsHeat(state, fullest) < SECOND_PORT_HEAT * 1.5) return fullest;
  return [...ports].sort((a, b) => customsHeat(state, a) - customsHeat(state, b) || a.localeCompare(b))[0];
}

/** Container einer Sorte kaufen, bis short gedeckt ist (höchstens vier). Gibt zurück, was gekauft wurde. */
function buy(state: GameState, run: BotRun, productId: string, short: number, urgent: boolean): number {
  const producer =
    PRODUCERS.filter(
      (p) => p.products[productId] !== undefined && (urgent ? p.id === 'jansen' : p.id !== 'jansen'),
    ).sort((a, b) => (a.products[productId] ?? 1) - (b.products[productId] ?? 1))[0] ??
    PRODUCERS.find((p) => p.id === 'jansen');
  if (!producer) return 0;
  let bought = 0;
  for (let i = 0; i < 4 && short - bought > 0; i++) {
    const size: ContainerSize['id'] = short - bought > 35_000 ? 'medium' : 'small';
    const cost = containerCost(producer.id, productId, size);
    if (state.wallet.dirty - cost.goods - cost.freight < TRADE_RESERVE) break;
    const ok = run({
      type: 'trade.buy',
      payload: { producerId: producer.id, productId, size, portId: targetPort(state) },
    });
    if (!ok) break;
    bought += CONTAINER_SIZES.find((c) => c.id === size)?.grams ?? short;
  }
  return bought;
}

/**
 * Ware beschaffen: zuerst, was angenommenen Bestellungen fehlt (Frist knapp: Jansens Netz), dann offene Bestellungen
 * und ein Puffer für die nächste Woche.
 */
function procure(state: GameState, run: BotRun): void {
  const pending = pendingDeliveries(state);
  const urgent = new Set(
    pending
      .filter((o) => o.dueAt - state.time < URGENT_MINUTES && portFor(state, o) === null)
      .flatMap((o) => o.items.map((i) => i.productId)),
  );
  const covered = new Map<string, number>();
  const have = (productId: string) =>
    totalStock(state, productId) +
    getShipments(state)
      .filter((x) => x.productId === productId)
      .reduce((s, x) => s + x.amount, 0) +
    (covered.get(productId) ?? 0);
  for (const [productId, need] of sum(pending)) {
    const short = need - have(productId);
    if (short > 0)
      covered.set(productId, (covered.get(productId) ?? 0) + buy(state, run, productId, short, urgent.has(productId)));
  }
  const week = state.modules.trade.orders.filter((o) => state.time - o.placedAt < 7 * DAY && o.status !== 'lost');
  const buffer = sum(week, BUFFER_SHARE);
  const open = sum(openOrders(state));
  for (const [productId, need] of sum(pending)) buffer.set(productId, (buffer.get(productId) ?? 0) + need);
  for (const [productId, need] of open) buffer.set(productId, (buffer.get(productId) ?? 0) + need);
  for (const [productId, need] of buffer) {
    const short = need - have(productId);
    if (short > 0) covered.set(productId, (covered.get(productId) ?? 0) + buy(state, run, productId, short, false));
  }
}

/** Ausliefern, was im Hafen liegt (Lkw, wenn einer frei ist und passt, sonst Spedition). */
function deliverReady(state: GameState, run: BotRun): void {
  for (const order of pendingDeliveries(state)) {
    const port = portFor(state, order);
    if (!port) continue;
    const truck = getVehicles(state, 'rotterdam').find((v) => vehicleStatus(v) === 'free' && v.model === 'truck');
    run({ type: 'trade.deliver', payload: { orderId: order.id, portId: port, vehicleId: truck?.id ?? null } });
  }
}

/** Gerät: zwei Lkw und bei scharfem Zoll ein zweiter Hafen (sauberes Geld, notfalls gewaschen). */
function equip(state: GameState, run: BotRun): void {
  const truck = VEHICLE_MODELS.find((m) => m.id === 'truck');
  const trucks = getVehicles(state, 'rotterdam').filter((v) => v.model === 'truck' && v.seizedAt === null).length;
  if (truck && trucks < 2 && state.wallet.clean >= vehiclePrice(truck, 'rotterdam') + 20_000) {
    run({ type: 'fleet.buy', payload: { model: 'truck', cityId: 'rotterdam' } });
  }
  const second = harborPorts().find((p) => p.id === 'antwerpen');
  if (second && !ownedPorts(state).includes(second.id) && customsHeat(state, 'rotterdam') >= SECOND_PORT_HEAT) {
    if (state.wallet.clean >= second.berthCost) run({ type: 'trade.rentBerth', payload: { portId: second.id } });
  }
  // Sauberes Geld für Lkw und Liegeplatz: ein Teil des Schwarzgelds in die Wäsche.
  if (state.wallet.clean < 120_000 && state.wallet.dirty > TRADE_RESERVE * 4 && amountInProgress(state) < 10_000) {
    run({ type: 'laundering.launder', payload: { amount: Math.round(state.wallet.dirty * 0.1) } });
  }
}

/** Ein Blick auf die Hafen-Phase. */
export function tradeTurn(state: GameState, run: BotRun): void {
  if (!isTradeActive(state)) return;
  deliverReady(state, run);
  equip(state, run);
  procure(state, run);
  // Erst beschaffen, dann nur annehmen, wofür die Ware reicht (Bestand plus Container vor der Frist).
  if ([...orderCoverage(state).values()].some((m) => m === 0)) {
    run({ type: 'trade.acceptAll', payload: { coveredOnly: true } });
  }
}
