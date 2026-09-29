// Lieferdienst und Großhandel: Anfragen kommen als Nachricht ins Spiel-Handy. Der Spieler nimmt an (selbst
// liefern oder einen freien Kurier schicken) oder lehnt ab. Die Ware verlässt beim Annehmen das Lager, bezahlt
// wird bei der Übergabe.

import {
  type CommandResult,
  type Ctx,
  clock,
  formatEuro,
  formatNumber,
  journal,
  type MessageOption,
  messages,
  wallet,
} from '../../core';
import { startEncounter } from '../encounters';
import {
  allProducts,
  formatProductAmount,
  getProduct,
  getStock,
  nearestWarehouse,
  productName,
  store,
  take,
} from '../goods';
import { isPlayerOnTheRoad } from '../logistics';
import { averageReferencePrice, referencePrice } from '../market';
import { changeReputation, getReputation, reputationDemandFactor } from '../reputation';
import { travelMinutes } from '../roads';
import { getSpot } from '../spots';
import { assign, findAvailable, getStaffMember, getStats } from '../staff';
import { allVeedel, getVeedel, type Veedel } from '../veedel';
import {
  COURIER_BASE_SPEED,
  COURIER_SPEED_PER_POINT,
  CUSTOMER_TYPES,
  DEALERS,
  DELIVERY_CHANCE_PER_HOUR,
  DELIVERY_MARKUP,
  DELIVERY_MIN_REPUTATION,
  HANDOVER_MINUTES,
  hourDemandMultiplier,
  MAX_OPEN_ORDERS,
  ORDER_EXPIRES_IN,
  ORDER_HISTORY,
  PLAYER_SPEED,
  REP_DELIVERY_DONE,
  REP_ORDER_DECLINED,
  REP_ORDER_EXPIRED,
  REP_ORDER_FAILED,
  REP_WHOLESALE_DONE,
  WHOLESALE_AMOUNTS,
  WHOLESALE_BETRAYAL_CHANCE,
  WHOLESALE_CHANCE_PER_HOUR,
  WHOLESALE_DISCOUNT,
  WHOLESALE_HANDOVER_MINUTES,
  WHOLESALE_MIN_REPUTATION,
} from './config';
import { customerType, productsFor, typeDemandWeight } from './decisions';
import type { Order, OrderKind, Regular } from './index';
import { pickWeighted, rateSale, updateRegularAfterSale } from './street';

const isOpen = (o: Order) => o.status === 'offered' || o.status === 'enRoute' || o.status === 'contested';

function findOrder(ctx: Ctx, orderId: number): Order | undefined {
  return ctx.state.modules.customers.orders.find((o) => o.id === orderId);
}

function finish(ctx: Ctx, order: Order, status: 'done' | 'declined' | 'expired' | 'failed'): void {
  order.status = status;
  order.finishedAt = ctx.now;
  ctx.emit('order.finished', { orderId: order.id, kind: order.kind, status });
}

/** Ort in einem Veedel, leicht gestreut um den Mittelpunkt. */
function placeIn(ctx: Ctx, veedel: Veedel): { lng: number; lat: number } {
  const jitter = () => (ctx.random() * 2 - 1) * 0.004;
  return {
    lng: Math.round((veedel.center.lng + jitter()) * 1e5) / 1e5,
    lat: Math.round((veedel.center.lat + jitter()) * 1e5) / 1e5,
  };
}

function orderOptions(orderId: number, kind: OrderKind): MessageOption[] {
  return [
    {
      id: 'self',
      label: kind === 'wholesale' ? "Ich bring's selbst" : 'Ich komme selbst',
      reply: 'Bin unterwegs.',
      command: { type: 'customers.acceptOrder', payload: { orderId, by: 'player' } },
    },
    {
      id: 'courier',
      label: 'Kurier schicken',
      reply: 'Ich schick dir jemanden.',
      command: { type: 'customers.acceptOrder', payload: { orderId, by: 'courier' } },
    },
    {
      id: 'decline',
      label: kind === 'wholesale' ? 'Kein Interesse' : 'Geht gerade nicht',
      reply: kind === 'wholesale' ? 'Kein Interesse.' : 'Heute nicht, sorry.',
      command: { type: 'customers.declineOrder', payload: { orderId } },
    },
  ];
}

function createOrder(
  ctx: Ctx,
  fields: Omit<
    Order,
    | 'id'
    | 'status'
    | 'createdAt'
    | 'expiresAt'
    | 'messageId'
    | 'deliveredBy'
    | 'courierId'
    | 'startedAt'
    | 'arrivesAt'
    | 'finishedAt'
    | 'quality'
    | 'cut'
    | 'fromWarehouseId'
  >,
  text: string,
): Order {
  const id = ctx.nextId();
  const messageId = messages.send(ctx, {
    contact: {
      id: fields.contactId,
      name: fields.contactName,
      kind: fields.kind === 'wholesale' ? 'other' : 'customer',
    },
    text,
    options: orderOptions(id, fields.kind),
    expiresIn: ORDER_EXPIRES_IN,
    // Lieferanfragen kommen oft: nur Badge im Handy, kein Banner. Großhandel ist seltener und lohnt sich mehr.
    silent: fields.kind === 'delivery',
  });
  const order: Order = {
    ...fields,
    id,
    status: 'offered',
    createdAt: ctx.now,
    expiresAt: ctx.now + ORDER_EXPIRES_IN,
    messageId,
    deliveredBy: null,
    courierId: null,
    startedAt: null,
    arrivesAt: null,
    finishedAt: null,
    quality: null,
    cut: null,
    fromWarehouseId: null,
  };
  ctx.state.modules.customers.orders.push(order);
  ctx.emit('order.received', { orderId: id, kind: fields.kind });
  return order;
}

/** Lieferanfrage von einem Stammkunden oder neuer Kundschaft. */
export function offerDelivery(ctx: Ctx, force = false): Order | null {
  const state = ctx.state;
  const s = state.modules.customers;
  if (s.orders.filter(isOpen).length >= MAX_OPEN_ORDERS) return null;
  if (getReputation(state) < DELIVERY_MIN_REPUTATION || getStock(state) <= 0) return null;
  const active = s.regulars.filter((r) => r.status === 'active');
  const hour = clock.hour(ctx.now);
  const chance =
    DELIVERY_CHANCE_PER_HOUR *
    reputationDemandFactor(state) *
    (hourDemandMultiplier(hour) / 1.6) *
    (1 + 0.04 * active.length);
  if (!force && !ctx.chance(chance)) return null;

  const candidates = active.filter(
    (r) => getStock(state, { productId: r.productId }) > 0 && !s.orders.some((o) => isOpen(o) && o.regularId === r.id),
  );
  let regular: Regular | null = null;
  if (candidates.length > 0 && ctx.chance(0.4)) regular = ctx.pick(candidates);

  let typeId: string;
  let productId: string;
  if (regular) {
    typeId = regular.typeId;
    productId = regular.productId;
  } else {
    // Nur wer bei dir etwas Passendes bekommt, fragt an.
    const weekday = clock.weekday(ctx.now);
    const inStock = CUSTOMER_TYPES.map((t) =>
      productsFor(t.id, allProducts()).filter((p) => getStock(state, { productId: p.id }) > 0),
    );
    const weights = CUSTOMER_TYPES.map((t, i) =>
      inStock[i].length > 0 ? typeDemandWeight(t, undefined, hour, weekday) : 0,
    );
    if (weights.every((w) => w <= 0)) return null;
    const index = pickWeighted(
      ctx,
      CUSTOMER_TYPES.map((_, i) => i),
      weights,
    );
    typeId = CUSTOMER_TYPES[index].id;
    productId = ctx.pick(inStock[index]).id;
  }
  const product = getProduct(productId);
  if (!product) return null;
  const type = customerType(typeId);
  const [, max] = product.typicalAmount;
  const stock = getStock(state, { productId });
  const amount = Math.min(stock, Math.max(1, Math.round(ctx.randomInt(max, max * 2) * type.amountFactor)));
  const regularSpot = regular ? getSpot(state, regular.spotId) : undefined;
  const veedel = (regularSpot && getVeedel(regularSpot.veedelId)) || ctx.pick(allVeedel());
  const place = placeIn(ctx, veedel);
  const price = Math.round(amount * referencePrice(state, productId, veedel.id) * DELIVERY_MARKUP);
  const goods = `${formatProductAmount(productId, amount)} ${product.name}`;
  const text = regular
    ? `Hey, ${regular.name.split(' ')[0]} hier. Kannst du mir ${goods} nach ${veedel.name} bringen? Ich zahl ${formatEuro(price)}.`
    : `Hab deine Nummer von einem Kumpel. ${goods} nach ${veedel.name}, ${formatEuro(price)}. Geht das?`;
  return createOrder(
    ctx,
    {
      kind: 'delivery',
      contactId: regular ? `customer:${regular.id}` : `customer:area-${veedel.id}`,
      contactName: regular ? regular.name : `Kundschaft ${veedel.name}`,
      typeId,
      regularId: regular?.id ?? null,
      productId,
      amount,
      price,
      veedelId: veedel.id,
      ...place,
    },
    text,
  );
}

/** Großhandelsanfrage eines anderen Dealers: große Menge mit Rabatt. */
export function offerWholesale(ctx: Ctx, force = false): Order | null {
  const state = ctx.state;
  const s = state.modules.customers;
  if (s.orders.some((o) => isOpen(o) && o.kind === 'wholesale')) return null;
  if (s.orders.filter(isOpen).length >= MAX_OPEN_ORDERS) return null;
  if (getReputation(state) < WHOLESALE_MIN_REPUTATION) return null;
  if (!force && !ctx.chance(WHOLESALE_CHANCE_PER_HOUR * reputationDemandFactor(state))) return null;
  const options = allProducts()
    .map((p) => ({
      product: p,
      amounts: (WHOLESALE_AMOUNTS[p.unit] ?? []).filter((a) => a <= getStock(state, { productId: p.id })),
    }))
    .filter((o) => o.amounts.length > 0);
  if (options.length === 0) return null;
  const { product, amounts } = ctx.pick(options);
  const amount = ctx.pick(amounts);
  const dealer = ctx.pick(DEALERS);
  const [min, max] = WHOLESALE_DISCOUNT;
  const discount = min + ctx.random() * (max - min);
  const price = Math.max(
    10,
    Math.round((amount * averageReferencePrice(state, product.id) * (1 - discount)) / 10) * 10,
  );
  const veedel = getVeedel(dealer.veedelId) ?? ctx.pick(allVeedel());
  const place = placeIn(ctx, veedel);
  const goods = `${formatProductAmount(product.id, amount)} ${product.name}`;
  const perUnit = formatNumber(price / amount, 2);
  return createOrder(
    ctx,
    {
      kind: 'wholesale',
      contactId: `dealer:${dealer.id}`,
      contactName: dealer.name,
      typeId: null,
      regularId: null,
      productId: product.id,
      amount,
      price,
      veedelId: veedel.id,
      ...place,
    },
    `Ich brauch ${goods}. Zahle ${formatEuro(price)} (${perUnit} € pro ${product.unit}), Übergabe in ${veedel.name}. Bist du dabei?`,
  );
}

export function acceptOrder(ctx: Ctx, orderId: number, by: 'player' | 'courier'): CommandResult {
  const order = findOrder(ctx, orderId);
  if (!order) return { ok: false, reason: 'Diesen Auftrag gibt es nicht.' };
  if (order.status !== 'offered') return { ok: false, reason: 'Der Auftrag ist nicht mehr offen.' };
  if (ctx.now > order.expiresAt) return { ok: false, reason: 'Zu spät, der Kunde hat sich was anderes gesucht.' };
  const state = ctx.state;
  let courierId: string | null = null;
  if (by === 'player') {
    if (state.modules.customers.orders.some((o) => o.status === 'enRoute' && o.deliveredBy === 'player')) {
      return { ok: false, reason: 'Du bist schon mit einer Lieferung unterwegs.' };
    }
    if (isPlayerOnTheRoad(state)) return { ok: false, reason: 'Du bist gerade mit dem Transporter unterwegs.' };
  } else {
    const courier = findAvailable(state, { role: 'courier' });
    if (!courier) return { ok: false, reason: 'Kein freier Kurier.' };
    courierId = courier.id;
  }
  if (getStock(state, { productId: order.productId }) < order.amount) {
    return { ok: false, reason: 'Nicht genug im Lager.' };
  }
  // Losgefahren wird im nächsten Lager, das genug davon hat (sonst im nächsten mit etwas davon).
  const warehouse =
    nearestWarehouse(state, order, { productId: order.productId, amount: order.amount }) ??
    nearestWarehouse(state, order, { productId: order.productId });
  const goods = take(ctx, { productId: order.productId, amount: order.amount, near: warehouse ?? order });
  if (goods.taken === 0) return { ok: false, reason: 'Nicht genug im Lager.' };

  const speed = courierId
    ? COURIER_BASE_SPEED + (getStats(state, courierId)?.speed ?? 50) * COURIER_SPEED_PER_POINT
    : PLAYER_SPEED;
  const handover = order.kind === 'wholesale' ? WHOLESALE_HANDOVER_MINUTES : HANDOVER_MINUTES;
  // Fahrzeit über echte Straßen (roads).
  const travel = warehouse ? travelMinutes(warehouse, order, speed) : Math.ceil(3000 / speed);
  order.status = 'enRoute';
  order.deliveredBy = by;
  order.courierId = courierId;
  order.fromWarehouseId = warehouse?.id ?? null;
  order.startedAt = ctx.now;
  order.arrivesAt = ctx.now + travel + handover;
  order.quality = goods.quality;
  order.cut = goods.cut;
  if (courierId) assign(ctx, courierId, { kind: 'delivery', targetId: String(order.id) });
  const who = courierId ? (getStaffMember(state, courierId)?.name ?? 'Der Kurier') : 'Du';
  journal.add(
    ctx,
    `${who} ${courierId ? 'bringt' : 'bringst'} ${formatProductAmount(order.productId, order.amount)} ` +
      `${productName(order.productId)} zu ${order.contactName}, Ankunft in ca. ${clock.formatDuration(order.arrivesAt - ctx.now)}.`,
  );
  ctx.emit('order.accepted', { orderId: order.id, kind: order.kind, by, courierId });
  return { ok: true, data: { arrivesAt: order.arrivesAt } };
}

export function declineOrder(ctx: Ctx, orderId: number): CommandResult {
  const order = findOrder(ctx, orderId);
  if (!order) return { ok: false, reason: 'Diesen Auftrag gibt es nicht.' };
  if (order.status !== 'offered') return { ok: false, reason: 'Der Auftrag ist nicht mehr offen.' };
  changeReputation(ctx, REP_ORDER_DECLINED, 'Anfragen abgelehnt');
  finish(ctx, order, 'declined');
  return { ok: true };
}

/** Die Antwortfrist im Handy ist abgelaufen. */
export function expireOrderMessage(ctx: Ctx, messageId: number): void {
  const order = ctx.state.modules.customers.orders.find((o) => o.messageId === messageId && o.status === 'offered');
  if (!order) return;
  changeReputation(ctx, REP_ORDER_EXPIRED, 'Anfragen ignoriert');
  finish(ctx, order, 'expired');
}

/** Ein Kurier fällt aus (Haft, verletzt, weg): Seine Lieferung platzt, die Ware ist verloren. */
export function courierGone(ctx: Ctx, staffId: string, clearAssignment: boolean): void {
  for (const order of ctx.state.modules.customers.orders) {
    if (order.status !== 'enRoute' || order.courierId !== staffId) continue;
    changeReputation(ctx, REP_ORDER_FAILED, 'Lieferung geplatzt');
    journal.add(
      ctx,
      `Lieferung an ${order.contactName} geplatzt: Der Kurier ist ausgefallen, ` +
        `${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)} sind weg.`,
      'bad',
    );
    finish(ctx, order, 'failed');
    if (clearAssignment && getStaffMember(ctx.state, staffId)) assign(ctx, staffId, null);
  }
}

/**
 * Bei der Übergabe kann ein Großhandels-Deal kippen: Konfrontation "Deal kippt" (encounters). Wer selbst liefert,
 * ist dabei; ein Kurier muss es allein regeln. Das Ergebnis kommt in onDealResolved an.
 */
function dealGoesWrong(ctx: Ctx, order: Order): boolean {
  if (order.kind !== 'wholesale' || !ctx.chance(WHOLESALE_BETRAYAL_CHANCE)) return false;
  order.status = 'contested';
  const goods = `${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)}`;
  startEncounter(ctx, {
    kind: 'dealGoneWrong',
    veedelId: order.veedelId,
    staffIds: order.courierId ? [order.courierId] : [],
    playerPresent: order.deliveredBy === 'player',
    place: `mit ${order.contactName}`,
    situation: `Übergabe {place}: ${goods} gegen {stakeMoney}. Statt Geld zieht einer ein Messer. {opponent} wollen die Ware umsonst.`,
    opponent: { label: `${order.contactName} und seine Jungs`, count: ctx.randomInt(2, 3) },
    stakes: { money: order.price, goods: order.amount },
    // Die Ware ist schon unterwegs: Das Geld verbucht customers selbst, die Folgen hier sind nur Ruf.
    effects: {
      success: { reputation: 2, text: 'Deal {place} gerettet. Die Kohle stimmt, der Typ entschuldigt sich.' },
      failure: { reputation: -3, text: 'Abgezogen {place}: Ware weg, kein Geld.' },
      retreat: { reputation: -1, text: 'Deal {place} geplatzt. Mit der Ware zurück, aber ohne Geld.' },
    },
    origin: { module: 'customers', ref: `order:${order.id}` },
  });
  return true;
}

/** Ausgang eines gekippten Deals. */
export function onDealResolved(ctx: Ctx, ref: string | undefined, outcome: string): void {
  const id = Number(ref?.replace('order:', ''));
  const order = ctx.state.modules.customers.orders.find((o) => o.id === id && o.status === 'contested');
  if (!order) return;
  if (order.courierId && getStaffMember(ctx.state, order.courierId)) assign(ctx, order.courierId, null);
  if (outcome === 'success') {
    complete(ctx, order, true);
    return;
  }
  if (outcome === 'retreat') {
    store(ctx, {
      productId: order.productId,
      amount: order.amount,
      ...(order.quality !== null ? { quality: order.quality } : {}),
      ...(order.cut !== null ? { cut: order.cut } : {}),
    });
  }
  changeReputation(ctx, REP_ORDER_FAILED, 'Deal geplatzt');
  finish(ctx, order, 'failed');
}

function complete(ctx: Ctx, order: Order, afterFight = false): void {
  if (!afterFight && dealGoesWrong(ctx, order)) return;
  const s = ctx.state.modules.customers;
  const wholesale = order.kind === 'wholesale';
  wallet.earn(ctx, order.price, 'dirty', wholesale ? 'Großhandel' : 'Lieferung');
  s.stats.unitsSold += order.amount;
  s.stats.revenue += order.price;
  if (wholesale) s.stats.wholesaleDeals += 1;
  else s.stats.deliveries += 1;
  changeReputation(ctx, wholesale ? REP_WHOLESALE_DONE : REP_DELIVERY_DONE, 'Zuverlässig geliefert');
  if (order.typeId) {
    const rating = rateSale(ctx, {
      typeId: order.typeId,
      quality: order.quality ?? 0,
      cut: order.cut ?? 0,
      priceRatio: 1,
      where: `aus ${getVeedel(order.veedelId)?.name ?? 'der Stadt'}`,
    });
    const regular = order.regularId ? s.regulars.find((r) => r.id === order.regularId) : undefined;
    if (regular && regular.status === 'active') {
      updateRegularAfterSale(ctx, regular, {
        price: regular.lastPrice,
        quality: order.quality ?? 0,
        noticedCut: rating.noticedCut,
      });
    }
  }
  if (order.courierId && getStaffMember(ctx.state, order.courierId)) assign(ctx, order.courierId, null);
  journal.add(
    ctx,
    `${wholesale ? 'Deal mit' : 'Geliefert an'} ${order.contactName}: ${formatProductAmount(order.productId, order.amount)} ` +
      `${productName(order.productId)} für ${formatEuro(order.price)}.`,
    'good',
  );
  ctx.emit('sale.completed', {
    channel: order.kind,
    spotId: null,
    veedelId: order.veedelId,
    productId: order.productId,
    amount: order.amount,
    quality: order.quality ?? 0,
    revenue: order.price,
    sellerId: order.courierId,
    customerId: null,
    orderId: order.id,
    ...(order.regularId ? { regularId: order.regularId } : {}),
  });
  finish(ctx, order, 'done');
}

function prune(ctx: Ctx): void {
  const s = ctx.state.modules.customers;
  const finished = s.orders.filter((o) => !isOpen(o));
  if (finished.length <= ORDER_HISTORY) return;
  const keep = new Set(
    finished
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || b.id - a.id)
      .slice(0, ORDER_HISTORY)
      .map((o) => o.id),
  );
  s.orders = s.orders.filter((o) => isOpen(o) || keep.has(o.id));
}

export function ordersTick(ctx: Ctx): void {
  const s = ctx.state.modules.customers;
  for (const order of [...s.orders]) {
    if (order.status === 'enRoute' && order.arrivesAt !== null && order.arrivesAt <= ctx.now) complete(ctx, order);
    // Sicherheitsnetz, falls das Ablaufen der Nachricht nicht ankam.
    else if (order.status === 'offered' && order.expiresAt < ctx.now) {
      changeReputation(ctx, REP_ORDER_EXPIRED, 'Anfragen ignoriert');
      finish(ctx, order, 'expired');
    }
  }
  if (ctx.now % 60 === 0) {
    offerDelivery(ctx);
    offerWholesale(ctx);
  }
  prune(ctx);
}
