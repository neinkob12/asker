// Lieferdienst und Großhandel: Anfragen kommen als Nachricht ins Spiel-Handy. Der Spieler nimmt an (selbst
// liefern oder die Rechte Hand schicken, die als Einzige Aufträge fährt) oder lehnt ab. Die Rechte Hand nimmt mit der
// Aufgabe "Aufträge und Handy" auch selbst an (hierarchy, actor 'staff:<id>'). Die Ware verlässt beim Annehmen das
// Lager, bezahlt wird bei der Übergabe.

import {
  type CommandResult,
  type Ctx,
  clock,
  formatEuro,
  formatNumber,
  type GameState,
  journal,
  type MessageOption,
  messages,
  wallet,
} from '../../core';
import { activeCity, cityAt, cityName, cityOfSpot, isPlayerIn } from '../city';
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
import {
  getRightHand,
  isTaskActive,
  rightHandDetour,
  rightHandDriver,
  rightHandHandlesOrders,
  rightHandSkim,
  rightHandSpeedFactor,
} from '../hierarchy';
import { isPlayerOnTheRoad } from '../logistics';
import { averageReferencePrice, referencePrice } from '../market';
import { changeReputation, getReputation, reputationDemandFactor } from '../reputation';
import { travelMinutes } from '../roads';
import { getSpot } from '../spots';
import { assign, getStaffMember, specialistFactor } from '../staff';
import { allVeedel, getVeedel, type Veedel, veedelCity } from '../veedel';
import { weatherDemandFactor } from '../weather';
import {
  CUSTOMER_TYPES,
  DEALER_PREPAY_SHARE,
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
  RIGHT_HAND_BASE_SPEED,
  RIGHT_HAND_ORDER_FACTOR,
  RIGHT_HAND_SPEED_PER_POINT,
  WHOLESALE_AMOUNTS,
  WHOLESALE_BETRAYAL_CHANCE,
  WHOLESALE_CHANCE_PER_HOUR,
  WHOLESALE_DISCOUNT,
  WHOLESALE_HANDOVER_MINUTES,
  WHOLESALE_MIN_REPUTATION,
} from './config';
import {
  dealerContact,
  dealerExtraDiscount,
  dealerOfContact,
  dealerPrepays,
  dealerRelation,
  dealersTick,
  dealerWantsMore,
  dueDealer,
  getDealer,
  noteDealerRequest,
  onDealerOrderFinished,
  pickDealer,
} from './dealers';
import { customerType, productsFor, typeDemandWeight } from './decisions';
import type { Order, OrderKind, Regular } from './index';
import { pickWeighted, rateSale, updateRegularAfterSale } from './street';

const isOpen = (o: Order) => o.status === 'offered' || o.status === 'enRoute' || o.status === 'contested';

/**
 * Anfrage, deren Frage im Handy zurückgezogen ist (bei der Ankunft in einer anderen Stadt, Auftrag 43, oder beim
 * Verkauf des Geschäfts): Du kannst weder annehmen noch ablehnen, nur die Rechte Hand der Stadt nimmt sie bis zur
 * Frist noch an. Zurückziehen setzt die Nachricht ohne Ereignis auf abgelaufen; die Frist selbst markiert der Kern erst
 * nach den Ticks und mit Ereignis (expireOrderMessage). Fehlt die Nachricht, gilt die Anfrage nicht als zurückgezogen.
 */
function isWithdrawn(state: GameState, o: Order): boolean {
  if (o.status !== 'offered') return false;
  const message = messages.get(state, o.messageId);
  return !!message?.expired && !message.answer;
}

/** Belegt der Auftrag einen der offenen Plätze (MAX_OPEN_ORDERS)? Zurückgezogene nicht, sie sperrten die neue Stadt. */
const takesSlot = (state: GameState, o: Order) => isOpen(o) && !isWithdrawn(state, o);

function findOrder(ctx: Ctx, orderId: number): Order | undefined {
  return ctx.state.modules.customers.orders.find((o) => o.id === orderId);
}

function finish(
  ctx: Ctx,
  order: Order,
  status: 'done' | 'declined' | 'expired' | 'failed',
  options: { dealerCounts?: boolean } = {},
): void {
  order.status = status;
  order.finishedAt = ctx.now;
  // Auftrag 34: Platzt ein vorab bezahlter Deal, bekommt der Dealer seine Vorkasse zurück (sonst verlöre er Geld und
  // Vertrauen zugleich). Gebucht gegen den Großhandel, so bleibt der Umsatz in der Kasse ehrlich.
  if (status === 'failed' && order.prepaid && order.prepaid > 0) {
    // In die Kasse der Stadt, in der der Deal lief (wie die Vorkasse), nicht in die gerade aktive.
    const back = wallet.lose(ctx, order.prepaid, 'dirty', `Vorkasse zurück an ${order.contactName}`, {
      category: 'sales.wholesale',
      cityId: cityAt(order.lng, order.lat),
    });
    order.prepaid = Math.max(0, order.prepaid - back);
  }
  // Stammabnehmer merken sich, wie es lief (nicht bei einer zurückgezogenen Anfrage: Da konntest du nicht antworten).
  if (order.kind === 'wholesale' && options.dealerCounts !== false) onDealerOrderFinished(ctx, order.contactId, status);
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

/** Antworten auf eine Anfrage: selbst, Rechte Hand (nur wenn es eine gibt) oder ablehnen. */
function orderOptions(ctx: Ctx, orderId: number, kind: OrderKind): MessageOption[] {
  return [
    {
      id: 'self',
      label: kind === 'wholesale' ? "Ich bring's selbst" : 'Ich komme selbst',
      reply: 'Bin unterwegs.',
      command: { type: 'customers.acceptOrder', payload: { orderId, by: 'player' } },
    },
    ...(getRightHand(ctx.state)
      ? [
          {
            id: 'rightHand',
            label: 'Rechte Hand schicken',
            reply: 'Meine Rechte Hand kommt vorbei.',
            command: { type: 'customers.acceptOrder' as const, payload: { orderId, by: 'rightHand' as const } },
          },
        ]
      : []),
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
  // Routine (die Rechte Hand darf antworten): Lieferanfragen immer, Großhandel nur, wenn ihre Aufgabe an ist und der
  // Betrag in ihrem Rahmen liegt. Alles andere ist Chefsache.
  const rh = getRightHand(ctx.state);
  const routine =
    fields.kind === 'delivery' ||
    (!!rh && isTaskActive(ctx.state, 'wholesale') && fields.price <= rh.settings.wholesaleMaxPrice);
  const dealer = getDealer(dealerOfContact(fields.contactId) ?? '');
  const messageId = messages.send(ctx, {
    contact: dealer
      ? dealerContact(dealer)
      : {
          id: fields.contactId,
          name: fields.contactName,
          kind: fields.kind === 'wholesale' ? 'other' : 'customer',
          // Großhändler sind auch Menschen: Porträt aus dem Namen.
          ...(fields.kind === 'wholesale' ? { role: 'Großhandel', look: {} } : {}),
        },
    text,
    options: orderOptions(ctx, id, fields.kind),
    expiresIn: ORDER_EXPIRES_IN,
    // Lieferanfragen kommen oft: nur Badge im Handy, kein Banner. Großhandel ist seltener und lohnt sich mehr.
    silent: fields.kind === 'delivery',
    routine,
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
  // Kunden schreiben direkt, wenn du es eingeschaltet hast oder deine Rechte Hand die Aufträge übernimmt.
  const viaRightHand = rightHandHandlesOrders(state);
  if (!force && !s.directOrders && !viaRightHand) return null;
  if (s.orders.filter((o) => takesSlot(state, o)).length >= MAX_OPEN_ORDERS) return null;
  // Anfragen kommen aus der Stadt, die live ist, und nur für Ware, die dort im Lager liegt (Auftrag 30).
  const cityId = activeCity(state);
  if (getReputation(state) < DELIVERY_MIN_REPUTATION || getStock(state, { cityId }) <= 0) return null;
  const active = s.regulars.filter((r) => r.status === 'active' && cityOfSpot(state, r.spotId) === cityId);
  const hour = clock.hour(ctx.now);
  const chance =
    DELIVERY_CHANCE_PER_HOUR *
    (viaRightHand ? RIGHT_HAND_ORDER_FACTOR : 1) *
    reputationDemandFactor(state) *
    // Bei Regen, Schnee oder Gewitter bleiben die Leute drinnen und bestellen lieber (weather, DELIVERY_DEMAND).
    weatherDemandFactor(state, 'delivery') *
    (hourDemandMultiplier(hour) / 1.6) *
    (1 + 0.04 * active.length);
  if (!force && !ctx.chance(chance)) return null;

  const candidates = active.filter(
    (r) =>
      getStock(state, { productId: r.productId, cityId }) > 0 &&
      !s.orders.some((o) => isOpen(o) && o.regularId === r.id),
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
      productsFor(t.id, allProducts()).filter((p) => getStock(state, { productId: p.id, cityId }) > 0),
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
  const stock = getStock(state, { productId, cityId });
  const amount = Math.min(stock, Math.max(1, Math.round(ctx.randomInt(max, max * 2) * type.amountFactor)));
  const regularSpot = regular ? getSpot(state, regular.spotId) : undefined;
  const veedel = (regularSpot && getVeedel(regularSpot.veedelId)) || ctx.pick(allVeedel(cityId));
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

/**
 * Auftrag 46c: eine feste Lieferanfrage aus einem Veedel (die erste Handy-Bestellung im Tutorial), ohne Würfel für
 * Kunde und Ware: das Produkt mit dem meisten Bestand in der Stadt des Veedels, eine kleine Menge (die untere
 * übliche Menge des Produkts, höchstens der Bestand). Nimmt keine Rücksicht auf Ruf oder Einstellungen; null ohne
 * Ware oder bei zu vielen offenen Anfragen.
 */
export function scriptedOrder(ctx: Ctx, request: { veedelId: string }): Order | null {
  const state = ctx.state;
  const veedel = getVeedel(request.veedelId);
  if (!veedel) return null;
  const cityId = veedelCity(veedel.id);
  if (state.modules.customers.orders.filter((o) => takesSlot(state, o)).length >= MAX_OPEN_ORDERS) return null;
  const stocked = allProducts()
    .map((p) => ({ product: p, stock: getStock(state, { productId: p.id, cityId }) }))
    .filter((x) => x.stock > 0)
    .sort((a, b) => b.stock - a.stock || a.product.id.localeCompare(b.product.id));
  const best = stocked[0];
  if (!best) return null;
  const product = best.product;
  const [min] = product.typicalAmount;
  const amount = Math.max(1, Math.min(best.stock, Math.round(min)));
  const type = CUSTOMER_TYPES.find((t) => productsFor(t.id, [product]).length > 0) ?? CUSTOMER_TYPES[0];
  const place = placeIn(ctx, veedel);
  const price = Math.round(amount * referencePrice(state, product.id, veedel.id) * DELIVERY_MARKUP);
  const goods = `${formatProductAmount(product.id, amount)} ${product.name}`;
  return createOrder(
    ctx,
    {
      kind: 'delivery',
      contactId: `customer:area-${veedel.id}`,
      contactName: `Kundschaft ${veedel.name}`,
      typeId: type.id,
      regularId: null,
      productId: product.id,
      amount,
      price,
      veedelId: veedel.id,
      ...place,
    },
    `Hab deine Nummer von einem Kumpel. Kannst du mir ${goods} nach ${veedel.name} bringen? Ich zahl ${formatEuro(price)}.`,
  );
}

/**
 * Großhandelsanfrage eines anderen Dealers: große Menge mit Rabatt. Auftrag 34: Wer fragt, hängt am Vertrauen
 * (pickDealer); mit dealerId fragt genau dieser (regelmäßige Anfragen der Stammabnehmer).
 */
export function offerWholesale(ctx: Ctx, force = false, dealerId?: string): Order | null {
  const state = ctx.state;
  const s = state.modules.customers;
  if (s.orders.some((o) => takesSlot(state, o) && o.kind === 'wholesale')) return null;
  if (s.orders.filter((o) => takesSlot(state, o)).length >= MAX_OPEN_ORDERS) return null;
  if (getReputation(state) < WHOLESALE_MIN_REPUTATION) return null;
  if (!force && !ctx.chance(WHOLESALE_CHANCE_PER_HOUR * reputationDemandFactor(state))) return null;
  const cityId = activeCity(state);
  const options = allProducts()
    .map((p) => ({
      product: p,
      amounts: (WHOLESALE_AMOUNTS[p.unit] ?? []).filter((a) => a <= getStock(state, { productId: p.id, cityId })),
    }))
    .filter((o) => o.amounts.length > 0);
  if (options.length === 0) return null;
  const { product, amounts } = ctx.pick(options);
  const forced = dealerId ? getDealer(dealerId) : undefined;
  const dealer = forced && dealerRelation(state, forced.id).status === 'active' ? forced : pickDealer(ctx, cityId);
  if (!dealer) return null;
  // Ab „regelmäßig“ wollen Stammabnehmer größere Mengen.
  const range = dealerWantsMore(state, dealer.id) ? amounts.slice(Math.floor(amounts.length / 2)) : amounts;
  const amount = ctx.pick(range);
  const [min, max] = WHOLESALE_DISCOUNT;
  const discount = min + ctx.random() * (max - min) + dealerExtraDiscount(state, dealer.id);
  noteDealerRequest(ctx, dealer.id);
  const price = Math.max(
    10,
    Math.round((amount * averageReferencePrice(state, product.id) * (1 - discount)) / 10) * 10,
  );
  const veedel = getVeedel(dealer.veedelId) ?? ctx.pick(allVeedel(cityId));
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
    `Ich brauch ${goods}. Zahle ${formatEuro(price)} (${perUnit} € pro ${product.unit}), Übergabe in ${veedel.name}.` +
      (dealerPrepays(state, dealer.id) ? ' Die Hälfte kriegst du vorab.' : '') +
      ' Bist du dabei?',
  );
}

/**
 * Auftrag annehmen: Du fährst selbst (Rad) oder die Rechte Hand fährt mit dem Auto (nur sie, eine Fahrt zur Zeit,
 * schneller mit Tempo-Wert und Stufe). 'courier' aus alten Spielständen zählt wie 'player'.
 */
export function acceptOrder(ctx: Ctx, orderId: number, by: 'player' | 'courier' | 'rightHand'): CommandResult {
  const order = findOrder(ctx, orderId);
  if (!order) return { ok: false, reason: 'Diesen Auftrag gibt es nicht.' };
  if (order.status !== 'offered') return { ok: false, reason: 'Der Auftrag ist nicht mehr offen.' };
  // Wie bei der Nachricht (messages.canAnswer): Zur Fristminute ist es schon zu spät.
  if (ctx.now >= order.expiresAt) return { ok: false, reason: 'Zu spät, der Kunde hat sich was anderes gesucht.' };
  const state = ctx.state;
  const who: 'player' | 'rightHand' = by === 'rightHand' ? 'rightHand' : 'player';
  let courierId: string | null = null;
  let speed = PLAYER_SPEED;
  let detour = false;
  if (who === 'player') {
    if (state.modules.customers.orders.some((o) => o.status === 'enRoute' && o.deliveredBy === 'player')) {
      return { ok: false, reason: 'Du bist schon mit einer Lieferung unterwegs.' };
    }
    if (isPlayerOnTheRoad(state)) return { ok: false, reason: 'Du bist gerade unterwegs.' };
    const city = cityAt(order.lng, order.lat);
    if (!isPlayerIn(state, city)) return { ok: false, reason: `Du bist nicht in ${cityName(city)}.` };
  } else {
    const driver = rightHandDriver(state, cityAt(order.lng, order.lat));
    if (!driver.ok) return { ok: false, reason: driver.reason };
    courierId = driver.member.id;
    speed = Math.round(
      (RIGHT_HAND_BASE_SPEED + driver.member.stats.speed * RIGHT_HAND_SPEED_PER_POINT) * rightHandSpeedFactor(state),
    );
    detour = rightHandDetour(ctx);
  }
  if (getStock(state, { productId: order.productId, cityId: cityAt(order.lng, order.lat) }) < order.amount) {
    return { ok: false, reason: 'Nicht genug im Lager.' };
  }
  // Losgefahren wird im nächsten Lager, das genug davon hat (sonst im nächsten mit etwas davon).
  const warehouse =
    nearestWarehouse(state, order, { productId: order.productId, amount: order.amount }) ??
    nearestWarehouse(state, order, { productId: order.productId });
  const goods = take(ctx, { productId: order.productId, amount: order.amount, near: warehouse ?? order });
  if (goods.taken === 0) return { ok: false, reason: 'Nicht genug im Lager.' };

  const handover = order.kind === 'wholesale' ? WHOLESALE_HANDOVER_MINUTES : HANDOVER_MINUTES;
  // Fahrzeit über echte Straßen (roads); eine unvorsichtige Rechte Hand verfährt sich manchmal.
  const travel = Math.round(
    (warehouse ? travelMinutes(warehouse, order, speed) : Math.ceil(3000 / speed)) * (detour ? 1.3 : 1),
  );
  order.status = 'enRoute';
  order.deliveredBy = who;
  order.courierId = courierId;
  order.fromWarehouseId = warehouse?.id ?? null;
  order.unitCost = goods.unitCost;
  order.startedAt = ctx.now;
  order.arrivesAt = ctx.now + travel + handover;
  order.quality = goods.quality;
  order.cut = goods.cut;
  if (courierId) assign(ctx, courierId, { kind: 'delivery', targetId: String(order.id) });
  // Auftrag 34: Stammabnehmer ab „Vorkasse“ zahlen die Hälfte beim Annehmen.
  const dealerId = order.kind === 'wholesale' ? dealerOfContact(order.contactId) : null;
  if (dealerId && dealerPrepays(state, dealerId)) {
    order.prepaid = Math.round(order.price * DEALER_PREPAY_SHARE);
    wallet.earn(ctx, order.prepaid, 'dirty', `Vorkasse ${order.contactName}`, {
      category: 'sales.wholesale',
      cityId: cityAt(order.lng, order.lat),
    });
  }
  const name = courierId ? (getStaffMember(state, courierId)?.name ?? 'Deine Rechte Hand') : 'Du';
  journal.add(
    ctx,
    `${name} ${courierId ? 'bringt' : 'bringst'} ${formatProductAmount(order.productId, order.amount)} ` +
      `${productName(order.productId)} zu ${order.contactName}, Ankunft in ca. ${clock.formatDuration(order.arrivesAt - ctx.now)}` +
      (detour ? ' Hat sich erst mal verfahren.' : ''),
  );
  ctx.emit('order.accepted', { orderId: order.id, kind: order.kind, by: who, courierId });
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

/**
 * Der Einsatz "Lieferung" endet mit dem Auftrag, aber nur, wenn die Person noch auf genau dieser Fahrt ist. Ist sie
 * inzwischen woanders eingesetzt (z.B. abberufen und an einen Spot gestellt), bleibt das so.
 */
function endDelivery(ctx: Ctx, order: Order): void {
  const m = order.courierId ? getStaffMember(ctx.state, order.courierId) : undefined;
  if (m?.assignment?.kind === 'delivery' && m.assignment.targetId === String(order.id)) assign(ctx, m.id, null);
}

/** Wer fährt, fällt aus (Haft, verletzt, weg): Die Lieferung platzt, die Ware ist verloren. */
export function courierGone(ctx: Ctx, staffId: string, clearAssignment: boolean): void {
  for (const order of ctx.state.modules.customers.orders) {
    if (order.status !== 'enRoute' || order.courierId !== staffId) continue;
    changeReputation(ctx, REP_ORDER_FAILED, 'Lieferung geplatzt');
    const name = getStaffMember(ctx.state, staffId)?.name ?? 'Deine Rechte Hand';
    journal.add(
      ctx,
      `Lieferung an ${order.contactName} geplatzt: ${name} ist ausgefallen, ` +
        `${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)} sind weg.`,
      'bad',
    );
    finish(ctx, order, 'failed');
    if (clearAssignment) endDelivery(ctx, order);
  }
}

/**
 * Bei der Übergabe kann ein Großhandels-Deal kippen: Konfrontation "Deal kippt" (encounters). Wer selbst liefert,
 * ist dabei; die Rechte Hand muss es allein regeln. Das Ergebnis kommt in onDealResolved an.
 */
function dealGoesWrong(ctx: Ctx, order: Order): boolean {
  if (order.kind !== 'wholesale') return false;
  // Auftrag 34: Wer vorab zahlt, haut dich nicht übers Ohr.
  const dealerId = dealerOfContact(order.contactId);
  if (dealerId && dealerPrepays(ctx.state, dealerId)) return false;
  if (!ctx.chance(WHOLESALE_BETRAYAL_CHANCE)) return false;
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
  endDelivery(ctx, order);
  if (outcome === 'success') {
    complete(ctx, order, true);
    return;
  }
  if (outcome === 'retreat') {
    // Die Ware geht zurück ins Lager, aus dem sie kam (sonst ins nächste der Stadt), mit ihrem Einkaufspreis.
    const home = order.fromWarehouseId ?? nearestWarehouse(ctx.state, order)?.id;
    store(ctx, {
      productId: order.productId,
      amount: order.amount,
      ...(home ? { warehouseId: home } : {}),
      ...(order.unitCost !== undefined ? { unitCost: order.unitCost } : {}),
      ...(order.quality !== null ? { quality: order.quality } : {}),
      ...(order.cut !== null ? { cut: order.cut } : {}),
    });
  }
  // Den Ruf für den geplatzten Deal bucht die Konfrontation selbst (effects in dealGoesWrong), hier nicht noch einmal.
  finish(ctx, order, 'failed');
}

function complete(ctx: Ctx, order: Order, afterFight = false): void {
  if (!afterFight && dealGoesWrong(ctx, order)) return;
  const s = ctx.state.modules.customers;
  const wholesale = order.kind === 'wholesale';
  // Auftrag 46e: Ein Buchhalter holt aus jedem Erlös ein paar Prozent mehr heraus (nur aus dem, was jetzt fließt).
  // Buchhalter und Kasse der Stadt des Auftrags, nicht der gerade aktiven.
  const cityId = cityAt(order.lng, order.lat);
  const due = Math.round((order.price - (order.prepaid ?? 0)) * specialistFactor(ctx.state, 'revenue', cityId));
  if (due > 0)
    wallet.earn(ctx, due, 'dirty', wholesale ? 'Großhandel' : 'Lieferung', {
      category: wholesale ? 'sales.wholesale' : 'sales.delivery',
      cityId,
      ...(order.courierId ? { staffId: order.courierId } : {}),
    });
  s.stats.unitsSold += order.amount;
  s.stats.revenue += order.price;
  if (wholesale) s.stats.wholesaleDeals += 1;
  else s.stats.deliveries += 1;
  // Eine wenig loyale Rechte Hand zweigt manchmal etwas ab (hierarchy entscheidet und bucht).
  if (order.deliveredBy === 'rightHand' && order.courierId) rightHandSkim(ctx, order.courierId, order.price);
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
  endDelivery(ctx, order);
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
    // Sicherheitsnetz, falls das Ablaufen der Nachricht nicht ankam. Eine zurückgezogene Anfrage (die Rechte Hand hat
    // sie bis zur Frist nicht angenommen) läuft still ab: kein Ruf-Abzug, kein Hängenlassen beim Stammabnehmer.
    else if (order.status === 'offered' && order.expiresAt <= ctx.now) {
      if (isWithdrawn(ctx.state, order)) finish(ctx, order, 'expired', { dealerCounts: false });
      else {
        changeReputation(ctx, REP_ORDER_EXPIRED, 'Anfragen ignoriert');
        finish(ctx, order, 'expired');
      }
    }
  }
  if (ctx.now % 60 === 0) {
    offerDelivery(ctx);
    offerWholesale(ctx);
    // Auftrag 34: Stammabnehmer melden sich regelmäßig von selbst, Zwischenhändler holen ihre Wochenlieferung.
    const due = dueDealer(ctx.state, activeCity(ctx.state));
    if (due) offerWholesale(ctx, true, due.id);
    dealersTick(ctx);
  }
  prune(ctx);
}
