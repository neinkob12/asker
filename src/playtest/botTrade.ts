// Der Bot in der Hafen-Phase (Auftrag 40): Als Boss von Deutschland verkauft er, sobald Jansen anruft. Danach kauft er
// für die neuen Bestellungen ein und nimmt nur die an, für die die Ware reicht (orderCoverage). Er liefert, sobald die
// Ware in einem Hafen liegt (eigener Lkw, sonst Spedition), und kauft Container nach: für das, was an Bestellungen offen
// ist, plus einen Puffer für die nächste Woche, beim günstigsten
// Produzenten, im Hafen mit dem ruhigsten Zoll, in halben Containern (verteilt das Risiko). Ist eine Frist knapp, holt
// er die Ware aus Jansens Netz (teurer, am nächsten Tag da). Wird der Zoll in Rotterdam scharf, mietet er Antwerpen dazu.
// Auftrag 41: Er tarnt Container mit Deckladung, sobald der Zoll im Hafen wach wird, kauft ein Küstenmotorschiff und
// schickt es mit vollen Containern für den Bedarf der nächsten Wochen los (Charter bleibt für das Kurzfristige), baut
// eine Halle, wenn das Lager voll wird, und beliefert die Städte in Europa, die sich melden (wie alle Kunden).
// Er schickt nur Befehle, genau wie die Oberfläche.

import type { Command, GameState } from '../core';
import { isBusinessSold, saleStatus } from '../modules/city';
import { getShips, getVehicles, VEHICLE_MODELS, vehiclePrice, vehicleSpec, vehicleStatus } from '../modules/fleet';
import { amountInProgress } from '../modules/laundering';
import { customsHeat } from '../modules/police';
import {
  CONTAINER_SIZES,
  type ContainerSize,
  type Cover,
  containerCost,
  getShipments,
  harborPorts,
  isTradeActive,
  loadCost,
  MAX_HALLS,
  openOrders,
  orderCoverage,
  ownedPorts,
  PRODUCERS,
  pendingDeliveries,
  portCapacity,
  portFor,
  portHalls,
  portLoad,
  shippingMinutes,
  totalStock,
  voyagePlan,
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
/** Deckladung ab diesem Zoll-Heat im Zielhafen: Fliesen, darüber Bananen. */
const COVER_HEAT = { tiles: 15, bananas: 35 } as const;
/** Ab so viel Bedarf pro Woche lohnt ein eigenes Schiff (Gramm). */
const SHIP_WEEKLY_GRAMS = 150_000;
/** Halle bauen, wenn das Lager zu so viel voll ist. */
const HALL_FILL = 0.8;
/** Ware, die später ankommt, zählt nicht für Bestellungen mit Frist (Tage). */
const PENDING_HORIZON = 6 * DAY;
/** Länger fährt das eigene Schiff nicht (hin und zurück). */
const SHIP_MAX_MINUTES = 13 * DAY;

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

/** Deckladung nach dem Zoll-Heat im Hafen: ruhig ohne, wach Fliesen, scharf Bananen. */
function coverFor(state: GameState, portId: string): Cover['id'] {
  const heat = customsHeat(state, portId);
  return heat >= COVER_HEAT.bananas ? 'bananas' : heat >= COVER_HEAT.tiles ? 'tiles' : 'none';
}

/** Container einer Sorte kaufen, bis short gedeckt ist (höchstens vier). Gibt zurück, was gekauft wurde. */
function buy(
  state: GameState,
  run: BotRun,
  productId: string,
  short: number,
  urgent: boolean,
  horizon = Infinity,
): number {
  const port = targetPort(state);
  const producer =
    PRODUCERS.filter(
      (p) =>
        p.products[productId] !== undefined &&
        (urgent ? p.id === 'jansen' : p.id !== 'jansen') &&
        shippingMinutes(p.id, port) <= horizon,
    ).sort((a, b) => (a.products[productId] ?? 1) - (b.products[productId] ?? 1))[0] ??
    PRODUCERS.find((p) => p.id === 'jansen');
  if (!producer) return 0;
  let bought = 0;
  for (let i = 0; i < 4 && short - bought > 0; i++) {
    const size: ContainerSize['id'] = short - bought > 35_000 ? 'medium' : 'small';
    const portId = targetPort(state);
    const cover = coverFor(state, portId);
    const cost = containerCost(producer.id, productId, size, cover);
    if (state.wallet.dirty - cost.goods - cost.freight - cost.cover < TRADE_RESERVE) break;
    const ok = run({ type: 'trade.buy', payload: { producerId: producer.id, productId, size, portId, cover } });
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
  const have = (productId: string, horizon = Infinity) =>
    totalStock(state, productId) +
    getShipments(state)
      .filter((x) => x.productId === productId && x.arrivesAt - state.time <= horizon)
      .reduce((s, x) => s + x.amount, 0) +
    (covered.get(productId) ?? 0);
  // Für angenommene und offene Bestellungen zählt nur, was vor der Frist ankommt; gekauft wird bei einem Produzenten,
  // der rechtzeitig liefert (Albanien und das eigene Schiff brauchen länger).
  const due = sum(pending);
  for (const [productId, need] of sum(openOrders(state))) due.set(productId, (due.get(productId) ?? 0) + need);
  for (const [productId, need] of due) {
    const short = need - have(productId, PENDING_HORIZON);
    if (short > 0) {
      const bought = buy(state, run, productId, short, urgent.has(productId), PENDING_HORIZON);
      covered.set(productId, (covered.get(productId) ?? 0) + bought);
    }
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

/**
 * Eigenes Schiff (Auftrag 41): Ist eins frei, fährt es zum Produzenten der Ware mit dem größten Wochenbedarf und holt
 * volle Container für die übernächste Woche (die Fahrt dauert hin und zurück gut eine Woche).
 */
function sailShips(state: GameState, run: BotRun): void {
  const week = state.modules.trade.orders.filter((o) => state.time - o.placedAt < 7 * DAY && o.status !== 'lost');
  const need = [...sum(week)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const ship of getShips(state)) {
    if (vehicleStatus(ship) !== 'free') continue;
    const capacity = vehicleSpec(state, ship.id).capacity;
    const top = need[0];
    if (!top) return;
    const portId = targetPort(state);
    // Der billigste Produzent, zu dem die Fahrt hin und zurück nicht zu lange dauert (Albanien: drei Wochen).
    const producer = PRODUCERS.filter(
      (p) =>
        p.sea &&
        p.products[top[0]] !== undefined &&
        (voyagePlan(state, ship.id, p.id, portId)?.minutes ?? Infinity) <= SHIP_MAX_MINUTES,
    ).sort((a, b) => (a.products[top[0]] ?? 1) - (b.products[top[0]] ?? 1))[0];
    if (!producer) continue;
    const cover = coverFor(state, portId);
    const full = CONTAINER_SIZES.find((c) => c.id === 'full')?.grams ?? 120_000;
    const plan = voyagePlan(state, ship.id, producer.id, portId);
    if (!plan) return;
    // Volle Container, verteilt nach Bedarf über die Waren dieses Produzenten, so viele die Kasse hergibt.
    const wares = need.filter(([id]) => producer.products[id] !== undefined);
    const load: { productId: string; size: 'full'; cover: Cover['id'] }[] = [];
    for (let i = 0; i < Math.max(1, Math.floor(capacity / full)); i++) {
      const next = [...load, { productId: wares[i % wares.length][0], size: 'full' as const, cover }];
      if (state.wallet.dirty - loadCost(producer.id, next, true) - plan.cost < TRADE_RESERVE * 2) break;
      load.push(next[next.length - 1]);
    }
    if (load.length === 0) return;
    run({ type: 'trade.sail', payload: { vesselId: ship.id, producerId: producer.id, portId, load } });
  }
}

/** Gerät: zwei Lkw und bei scharfem Zoll ein zweiter Hafen (sauberes Geld, notfalls gewaschen). */
function equip(state: GameState, run: BotRun): void {
  const truck = VEHICLE_MODELS.find((m) => m.id === 'truck');
  const trucks = getVehicles(state, 'rotterdam').filter((v) => v.model === 'truck' && v.seizedAt === null).length;
  if (truck && trucks < 2 && state.wallet.clean >= vehiclePrice(truck, 'rotterdam') + 20_000) {
    run({ type: 'fleet.buy', payload: { model: 'truck', cityId: 'rotterdam' } });
  }
  // Ein Küstenmotorschiff, sobald der Bedarf groß genug ist (Auftrag 41).
  const coaster = VEHICLE_MODELS.find((m) => m.id === 'coaster');
  const weekly = [...sum(state.modules.trade.orders.filter((o) => state.time - o.placedAt < 7 * DAY)).values()].reduce(
    (a, b) => a + b,
    0,
  );
  if (
    coaster &&
    trucks >= 1 &&
    getShips(state).length === 0 &&
    weekly >= SHIP_WEEKLY_GRAMS &&
    state.wallet.clean >= vehiclePrice(coaster, 'rotterdam')
  ) {
    run({ type: 'fleet.buy', payload: { model: 'coaster', cityId: 'rotterdam' } });
  }
  // Lager fast voll: eine Halle.
  for (const portId of ownedPorts(state)) {
    const hall = harborPorts().find((p) => p.id === portId);
    if (!hall || portHalls(state, portId) >= MAX_HALLS) continue;
    if (portLoad(state, portId) >= portCapacity(state, portId) * HALL_FILL && state.wallet.clean >= hall.hallCost) {
      run({ type: 'trade.buildHall', payload: { portId } });
    }
  }
  const second = harborPorts().find((p) => p.id === 'antwerpen');
  if (second && !ownedPorts(state).includes(second.id) && customsHeat(state, 'rotterdam') >= SECOND_PORT_HEAT) {
    if (state.wallet.clean >= second.berthCost) run({ type: 'trade.rentBerth', payload: { portId: second.id } });
  }
  // Sauberes Geld für Lkw, Schiff und Liegeplatz: ein Teil des Schwarzgelds in die Wäsche.
  if (
    state.wallet.clean < (getShips(state).length === 0 ? 300_000 : 120_000) &&
    state.wallet.dirty > TRADE_RESERVE * 4 &&
    amountInProgress(state) < 10_000
  ) {
    run({ type: 'laundering.launder', payload: { amount: Math.round(state.wallet.dirty * 0.1) } });
  }
}

/** Ein Blick auf die Hafen-Phase. */
export function tradeTurn(state: GameState, run: BotRun): void {
  if (!isTradeActive(state)) return;
  deliverReady(state, run);
  equip(state, run);
  sailShips(state, run);
  procure(state, run);
  // Erst beschaffen, dann nur annehmen, wofür die Ware reicht (Bestand plus Container vor der Frist).
  if ([...orderCoverage(state).values()].some((m) => m === 0)) {
    run({ type: 'trade.acceptAll', payload: { coveredOnly: true } });
  }
}
