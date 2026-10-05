// Hafen-Phase (Auftrag 40): Nach dem Verkauf des Geschäfts (city, 'business.sold') bist du Lieferant für alle, vom
// Hafen in Rotterdam aus. Kunden sind die alten Organisationen (zuverlässig, fairer Preis, in den ersten vier Wochen ein
// Abnahmevertrag), je Stadt die stärkste Gang (zahlt mehr, Deals können kippen, das Gedächtnis aus Auftrag 34 zählt)
// und fremde Städte ohne eigene Karte (data.ts). Jeder Kunde hat einen Wochenbedarf, eine Preisgrenze, Vertrauen und
// erwartet Zuverlässigkeit.
//
// Die Woche:
//   1. Montag 6 Uhr kommen die Bestellungen (ORDER_HOUR). Die Menge ist dein Anteil am Wochenbedarf des Kunden: Er
//      vergleicht dich mit der Konkurrenz (suppliers.rivalOffers: Toni, Hein, Mirko, Daan) nach Preis, Qualität,
//      Zuverlässigkeit und Vertrauen (weiche Aufteilung, SHARE_TEMPERATURE). Du nimmst an, lehnst ab oder machst ein
//      Gegenangebot (bis zur Preisgrenze; liegt die Konkurrenz dann vorn, ist der Auftrag weg).
//   2. Beschaffung: Container bei Produzenten im Ausland (Laufzeit, Qualität, Zollrisiko) oder schnell aus Jansens
//      Netz ('trade.buy'). Ankunft in einem deiner Häfen (Rotterdam, dazu mietbar Antwerpen und Hamburg; Daten in
//      logistics.HARBOR_PORTS). Jeder Container wird mit Chance kontrolliert (Herkunft, Größe, Hafen, Zoll-Heat aus
//      police): Zollkontrolle als Konfrontation (encounters, setting 'port'). Die Ware liegt danach im Hafen.
//   3. Auslieferung mit dem Lkw (fleet, nur in der Hafen-Phase) oder einer Spedition ('trade.deliver') über das
//      Autobahn-Netz (roads.interCityRoute), unterwegs mit Chance eine Zollkontrolle. Zahlung bei Ankunft; pünktlich
//      bringt Vertrauen und Ruf, zu spät oder gar nicht kostet beides.
//
// Würfe nur über ctx.random() (bzw. fest aus dem Schlüssel für die Konkurrenz in suppliers). Alles, was an einem Ort
// hängt, hat einen Hafen oder Kunden mit Koordinaten; die Hafen-Phase läuft unabhängig von der aktiven Stadt.
//
// Öffentliche API: isTradeActive, getCustomers, getCustomer, customerName, customerContact, getOrders, getOrder,
//   openOrders, pendingDeliveries, getShipments, getDeliveries, portStock, totalStock, ownedPorts, fairPrice,
//   customerOffer, priceCap, orderValue, playerScore, rivalScores, shareFor, supplierReputation, tradeStats,
//   containerCost, containerRisk, deliveryEstimate, freightCost, weekOf, PRODUCERS, CONTAINER_SIZES, FOREIGN_CITIES
// Befehle: 'trade.answer', 'trade.deliver', 'trade.buy', 'trade.rentBerth', 'trade.setPriceLevel'
// Ereignisse: 'trade.started', 'trade.orderPlaced', 'trade.orderAnswered', 'trade.delivered', 'trade.orderFailed',
//   'trade.containerOrdered', 'trade.containerArrived', 'trade.containerSeized', 'trade.deliverySeized',
//   'trade.dealTipped'

import {
  type CommandResult,
  type Contact,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  type LngLat,
  MINUTES_PER_DAY,
  messages,
  wallet,
} from '../../core';
import { cityName, getCity, HARBOR_CITY, isBusinessSold } from '../city';
import { activeEncounters, startEncounter } from '../encounters';
import { getVehicle, maybeSeize, releaseVehicle, useVehicle, vehicleSpec } from '../fleet';
import { gangContact, gangPower, getGang, getGangs, memoryScore, remember } from '../gangs';
import { getProduct, productName } from '../goods';
import { getRightHand, rightHandTitle } from '../hierarchy';
import { CUSTOMS_OPPONENT, HARBOR_PORTS, type HarborPort, harborPort } from '../logistics';
import { priceIndex } from '../market';
import { customsArrival, customsHeat, customsSeized } from '../police';
import { interCityMinutes, interCityRoute } from '../roads';
import { getStaffMember, staffContact } from '../staff';
import { rivalOffers } from '../suppliers';
import {
  AUTOBAHN_CHECK_PER_100KM,
  CONTRACT_SHARE,
  CONTRACT_WEEKS,
  CUSTOMER_KINDS,
  DEMAND_SCALE,
  FREIGHT_BASE,
  FREIGHT_PER_KG_100KM,
  GANG_MEMORY_BLOCK,
  GANG_TIP_CHANCE,
  LATE_PRICE_FACTOR,
  MIN_ITEM_GRAMS,
  MIN_ORDER_GRAMS,
  ORDER_ANSWER_MINUTES,
  ORDER_DUE_DAYS,
  ORDER_HOUR,
  ORDER_ROUND_GRAMS,
  PRICE_CAP_MARKUP,
  PRICE_LEVEL_RANGE,
  REPUTATION_ALPHA,
  SCORE_WEIGHTS,
  SEIZE_ON_CHECK,
  SHARE_TEMPERATURE,
  START_QUALITY,
  START_RELIABILITY,
  START_STOCK,
  START_STOCK_QUALITY,
  TRUCK_CITY_SPEED,
  TRUST,
  WHOLESALE_SHARE,
} from './config';
import {
  CONTAINER_SIZES,
  type ContainerSize,
  FOREIGN_CITIES,
  GANG_DEMAND,
  ORG_DEMAND,
  PRODUCERS,
  type Producer,
  type WeeklyDemand,
} from './data';

export { CONTRACT_WEEKS, CUSTOMER_KINDS, PRICE_LEVEL_RANGE, PRICE_LEVEL_STEP } from './config';
export { CONTAINER_SIZES, type ContainerSize, FOREIGN_CITIES, PRODUCERS, type Producer } from './data';

// ---------------------------------------------------------------------------------------------
// Zustand, Befehle, Ereignisse

export type CustomerKind = keyof typeof CUSTOMER_KINDS;

/** Ein Kunde der Hafen-Phase (beim Verkauf angelegt; Daten mit im Zustand, weil Gangs und Städte vom Spiel abhängen). */
export interface TradeCustomer {
  id: string;
  kind: CustomerKind;
  name: string;
  /** Lieferort. */
  lng: number;
  lat: number;
  /** Preisindex aus dieser Stadt (market). */
  indexCity: string;
  weekly: Record<string, number>;
  /** Gang (kind 'gang'). */
  gangId?: string;
  /** Alte Stadt (kind 'org'). */
  cityId?: string;
  /** Fremde Stadt (kind 'city'). */
  foreignId?: string;
  /** Vertrauen 0–100. */
  trust: number;
  /** Dein Anteil am Wochenbedarf in der letzten Runde (0–1) und wer sonst am meisten liefert. */
  share: number;
  topRival: string | null;
  delivered: number;
  late: number;
  failed: number;
}

export type OrderStatus = 'open' | 'accepted' | 'delivering' | 'delivered' | 'declined' | 'lost' | 'expired' | 'failed';

/** Eine Ware in einer Bestellung. */
export interface OrderItem {
  productId: string;
  /** Gramm. */
  amount: number;
  /** Ihr Angebot pro Gramm. */
  offer: number;
}

/** Eine Bestellung pro Kunde und Woche, mit allen Waren, die er bei dir kauft. */
export interface TradeOrder {
  id: number;
  customerId: string;
  items: OrderItem[];
  /** Gramm zusammen. */
  amount: number;
  /** Vereinbarter Preis als Faktor auf ihr Angebot (1 = angenommen, mehr = Gegenangebot), null vor der Antwort. */
  factor: number | null;
  /** Abnahmevertrag der alten Organisationen: keine Konkurrenz. */
  guaranteed: boolean;
  placedAt: number;
  answerBy: number;
  dueAt: number;
  status: OrderStatus;
  /** An wen der Auftrag ging, wenn er verloren ist. */
  lostTo?: string;
  /** Erlös bei Lieferung. */
  revenue?: number;
}

export type ShipmentStatus = 'sea' | 'customs';

export interface TradeShipment {
  id: number;
  producerId: string;
  productId: string;
  amount: number;
  quality: number;
  size: ContainerSize['id'];
  portId: string;
  orderedAt: number;
  arrivesAt: number;
  status: ShipmentStatus;
  encounterId?: number;
}

export interface DeliveryItem {
  productId: string;
  amount: number;
  quality: number;
}

export interface TradeDelivery {
  id: number;
  orderId: number;
  customerId: string;
  items: DeliveryItem[];
  /** Gramm zusammen. */
  amount: number;
  portId: string;
  departedAt: number;
  arrivesAt: number;
  /** Eigener Lkw (fleet), null = Spedition. */
  vehicleId: number | null;
  /** Zeitpunkt einer Kontrolle unterwegs, null = keine. */
  checkAt: number | null;
}

export interface StockLot {
  amount: number;
  quality: number;
}

export interface TradeStats {
  revenue: number;
  delivered: number;
  onTime: number;
  late: number;
  failed: number;
  lost: number;
  containers: number;
  seized: number;
  seizedGrams: number;
  deliveriesSeized: number;
  tipped: number;
  /** Bedarf aller Kunden und dein Anteil daran, aufsummiert über die Wochen (für den Marktanteil). */
  demand: number;
  ordered: number;
}

export interface TradeState {
  /** Beginn der Hafen-Phase (Spielminute), null = noch nicht verkauft. */
  startedAt: number | null;
  /** Ende des Abnahmevertrags. */
  contractUntil: number | null;
  /** Letzte Woche, für die Bestellungen kamen (weekOf). */
  week: number;
  customers: TradeCustomer[];
  orders: TradeOrder[];
  shipments: TradeShipment[];
  deliveries: TradeDelivery[];
  /** Ware pro Hafen und Sorte. */
  stock: Record<string, Record<string, StockLot>>;
  /** Deine Häfen (Rotterdam nach dem Kauf, weitere gemietet). */
  ports: string[];
  /** Dein Preis als Faktor auf den fairen Preis. */
  priceLevel: number;
  /** Dein Ruf als Lieferant (gleitender Schnitt): pünktlich und Qualität. */
  reliability: number;
  quality: number;
  stats: TradeStats;
}

declare module '../../core' {
  interface ModuleStates {
    trade: TradeState;
  }
  interface GameCommands {
    /** Bestellung annehmen, ablehnen oder Gegenangebot (factor auf ihr Angebot, nur mit 'counter'). */
    'trade.answer': { orderId: number; choice: 'accept' | 'decline' | 'counter'; factor?: number };
    /** Alle offenen Bestellungen annehmen (nur die mit Abnahmevertrag, wenn guaranteedOnly). */
    'trade.acceptAll': { guaranteedOnly?: boolean };
    /** Angenommene Bestellung ausliefern: aus einem Hafen (Standard: der mit genug Ware, nächster zuerst). */
    'trade.deliver': { orderId: number; portId?: string; vehicleId?: number | null };
    /** Container bei einem Produzenten bestellen. */
    'trade.buy': { producerId: string; productId: string; size: ContainerSize['id']; portId?: string };
    /** Liegeplatz in einem weiteren Hafen mieten (sauberes Geld). */
    'trade.rentBerth': { portId: string };
    /** Deinen Preis setzen (Faktor auf den fairen Preis). */
    'trade.setPriceLevel': { level: number };
  }
  interface GameEvents {
    'trade.started': { customers: number };
    'trade.orderPlaced': { orderId: number; customerId: string; amount: number; value: number; guaranteed: boolean };
    'trade.orderAnswered': { orderId: number; choice: string; result: 'accepted' | 'declined' | 'lost' };
    'trade.delivered': { orderId: number; customerId: string; amount: number; revenue: number; late: boolean };
    'trade.orderFailed': { orderId: number; customerId: string; reason: 'expired' | 'late' };
    'trade.containerOrdered': { shipmentId: number; producerId: string; amount: number; portId: string; cost: number };
    'trade.containerArrived': { shipmentId: number; portId: string; amount: number; checked: boolean };
    'trade.containerSeized': { shipmentId: number; portId: string; amount: number };
    'trade.deliverySeized': { deliveryId: number; orderId: number; amount: number };
    'trade.dealTipped': { orderId: number; customerId: string; amount: number };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

const PRODUCER_BY_ID = new Map(PRODUCERS.map((p) => [p.id, p]));
const SIZE_BY_ID = new Map(CONTAINER_SIZES.map((c) => [c.id, c]));

function tradeState(state: GameState): TradeState | undefined {
  return state.modules.trade as TradeState | undefined;
}

/** Läuft die Hafen-Phase? */
export function isTradeActive(state: GameState): boolean {
  return (tradeState(state)?.startedAt ?? null) !== null;
}

/** Woche seit Spielbeginn (Montag bis Sonntag), z.B. für die Bestellungen. */
export function weekOf(time: number): number {
  // Tag 1 ist ein Freitag (clock.weekday 4): Woche 0 endet am ersten Sonntag.
  return Math.floor((Math.floor(time / MINUTES_PER_DAY) + clock.weekday(0)) / 7);
}

export function getCustomers(state: GameState): readonly TradeCustomer[] {
  return tradeState(state)?.customers ?? [];
}

export function getCustomer(state: GameState, id: string): TradeCustomer | undefined {
  return getCustomers(state).find((c) => c.id === id);
}

export function customerName(state: GameState, id: string): string {
  return getCustomer(state, id)?.name ?? id;
}

/** Kontakt eines Kunden im Handy: Statthalter, Gang oder die Figur der fremden Stadt. */
export function customerContact(state: GameState, customer: TradeCustomer): Contact {
  if (customer.kind === 'gang' && customer.gangId) {
    const gang = getGang(state, customer.gangId);
    if (gang) return gangContact(gang);
  }
  if (customer.kind === 'org' && customer.cityId) {
    const rh = getRightHand(state, customer.cityId);
    const m = rh ? getStaffMember(state, rh.staffId) : undefined;
    if (m)
      return { ...staffContact(m), role: `${rightHandTitle(state, customer.cityId)} ${cityName(customer.cityId)}` };
    return { id: `trade:org-${customer.cityId}`, name: customer.name, kind: 'customer', look: {} };
  }
  const city = FOREIGN_CITIES.find((c) => c.id === customer.foreignId);
  return city?.contact ?? { id: `trade:${customer.id}`, name: customer.name, kind: 'customer', look: {} };
}

export function getOrders(state: GameState): readonly TradeOrder[] {
  return tradeState(state)?.orders ?? [];
}

export function getOrder(state: GameState, id: number): TradeOrder | undefined {
  return getOrders(state).find((o) => o.id === id);
}

/** Bestellungen, auf die du noch antworten musst. */
export function openOrders(state: GameState): TradeOrder[] {
  return getOrders(state).filter((o) => o.status === 'open');
}

/** Angenommen, noch nicht unterwegs (du musst ausliefern). */
export function pendingDeliveries(state: GameState): TradeOrder[] {
  return getOrders(state).filter((o) => o.status === 'accepted');
}

export function getShipments(state: GameState): readonly TradeShipment[] {
  return tradeState(state)?.shipments ?? [];
}

export function getDeliveries(state: GameState): readonly TradeDelivery[] {
  return tradeState(state)?.deliveries ?? [];
}

/** Deine Häfen. */
export function ownedPorts(state: GameState): string[] {
  return tradeState(state)?.ports ?? [];
}

/** Ware in einem Hafen (Sorte → Menge, Qualität). */
export function portStock(state: GameState, portId: string): Readonly<Record<string, StockLot>> {
  return tradeState(state)?.stock[portId] ?? {};
}

/** Ware einer Sorte in allen Häfen zusammen (Gramm). */
export function totalStock(state: GameState, productId?: string): number {
  let sum = 0;
  for (const lots of Object.values(tradeState(state)?.stock ?? {})) {
    for (const [id, lot] of Object.entries(lots)) if (!productId || id === productId) sum += lot.amount;
  }
  return sum;
}

/** Fairer Großhandelspreis pro Gramm für einen Kunden (Grundpreis × WHOLESALE_SHARE × Index seiner Stadt). */
export function fairPrice(state: GameState, productId: string, indexCity: string): number {
  const base = getProduct(productId)?.basePrice ?? 0;
  return round2(base * WHOLESALE_SHARE * priceIndex(state, productId, indexCity));
}

/** Was der Kunde von sich aus pro Gramm bietet (fairer Preis × Art). */
export function customerOffer(state: GameState, customer: TradeCustomer, productId: string): number {
  return round2(fairPrice(state, productId, customer.indexCity) * CUSTOMER_KINDS[customer.kind].priceFactor);
}

/** Höchster Faktor auf ihr Angebot, den ein Kunde bei einem Gegenangebot zahlt (Preisgrenze). */
export function maxFactor(order: TradeOrder): number {
  return order.guaranteed ? 1 : round2(1 + PRICE_CAP_MARKUP);
}

/** Wert einer Bestellung (vereinbart oder ihr Angebot), mit einem Faktor auf ihr Angebot. */
export function orderValue(order: TradeOrder, factor: number = order.factor ?? 1): number {
  return Math.round(order.items.reduce((sum, item) => sum + item.amount * item.offer, 0) * factor);
}

/** Waren einer Bestellung als Text, z.B. „11,5 kg Gras, 3 kg Hasch“. */
export function orderItemsText(items: readonly { productId: string; amount: number }[]): string {
  return items.map((i) => `${formatKg(i.amount)} ${productName(i.productId)}`).join(', ');
}

function formatKg(grams: number): string {
  const kg = Math.round(grams / 100) / 10;
  return `${String(kg).replace('.', ',')} kg`;
}

/** Dein Ruf als Lieferant (gleitender Schnitt über die Lieferungen). */
export function supplierReputation(state: GameState): { reliability: number; quality: number } {
  const s = tradeState(state);
  return { reliability: s?.reliability ?? START_RELIABILITY, quality: s?.quality ?? START_QUALITY };
}

export function tradeStats(state: GameState): TradeStats {
  return tradeState(state)?.stats ?? emptyStats();
}

/** Punkte eines Angebots aus Sicht des Kunden (price als Faktor auf den fairen Preis). */
function score(price: number, quality: number, reliability: number): number {
  const w = SCORE_WEIGHTS;
  return quality * w.quality + reliability * w.reliability - (price - 1) * w.price;
}

/** Deine Punkte bei einem Kunden zu einem Preis (Faktor auf den fairen Preis). */
export function playerScore(state: GameState, customer: TradeCustomer, price: number): number {
  const rep = supplierReputation(state);
  // Erwartet ein Kunde mehr Zuverlässigkeit, als du hast, zählt der Abstand doppelt.
  const gap = Math.max(0, CUSTOMER_KINDS[customer.kind].expects - rep.reliability);
  return score(price, rep.quality, rep.reliability - gap) + ((customer.trust - 50) / 100) * SCORE_WEIGHTS.trust;
}

/** Punkte der Konkurrenz in einer Woche. */
export function rivalScores(state: GameState, week: number): { name: string; score: number; price: number }[] {
  return rivalOffers(state, week).map((r) => ({
    name: r.name,
    score: score(r.price, r.quality, r.reliability),
    price: r.price,
  }));
}

/** Dein Anteil am Bedarf eines Kunden (weich nach Punkten), dazu der stärkste Konkurrent. */
export function shareFor(
  state: GameState,
  customer: TradeCustomer,
  week: number,
  price = tradeState(state)?.priceLevel ?? 1,
): { share: number; topRival: string | null } {
  const mine = playerScore(state, customer, price);
  const rivals = rivalScores(state, week);
  const weights = [mine, ...rivals.map((r) => r.score)].map((x) => Math.exp(x / SHARE_TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  const best = rivals.reduce<{ name: string; score: number } | null>(
    (top, r) => (!top || r.score > top.score ? r : top),
    null,
  );
  return { share: total > 0 ? weights[0] / total : 0, topRival: best?.name ?? null };
}

/** Kosten eines Containers: Ware (Schwarzgeld) und Fracht. */
export function containerCost(
  producerId: string,
  productId: string,
  size: ContainerSize['id'],
): {
  goods: number;
  freight: number;
} {
  const producer = PRODUCER_BY_ID.get(producerId);
  const container = SIZE_BY_ID.get(size);
  const share = producer?.products[productId];
  if (!producer || !container || share === undefined) return { goods: 0, freight: 0 };
  const base = getProduct(productId)?.basePrice ?? 0;
  return { goods: Math.round((container.grams * base * share) / 10) * 10, freight: container.freight };
}

/** Chance, dass der Zoll einen Container in diesem Hafen kontrolliert (0–1). */
export function containerRisk(state: GameState, producerId: string, size: ContainerSize['id'], portId: string): number {
  const producer = PRODUCER_BY_ID.get(producerId);
  const container = SIZE_BY_ID.get(size);
  const port = harborPort(portId);
  if (!producer || !container || !port) return 0;
  const heat = customsHeat(state, portId);
  return Math.min(0.9, producer.risk * container.riskFactor * port.customsFactor * (1 + heat / 50));
}

/** Laufzeit eines Containers in Minuten. */
export function shippingMinutes(producerId: string, portId: string): number {
  const producer = PRODUCER_BY_ID.get(producerId);
  const port = harborPort(portId);
  if (!producer || !port) return MINUTES_PER_DAY;
  return Math.max(1, producer.days + (producer.byRoad ? 0 : port.shipDays)) * MINUTES_PER_DAY;
}

function portPoint(portId: string): LngLat {
  const port = harborPort(portId);
  return port ? { lng: port.lng, lat: port.lat } : { lng: 4.4, lat: 51.9 };
}

/** Fahrt vom Hafen zum Kunden: Minuten und Kilometer (über roads). */
export function deliveryEstimate(customer: TradeCustomer, portId: string): { minutes: number; km: number } {
  const from = portPoint(portId);
  const to = { lng: customer.lng, lat: customer.lat };
  const route = interCityRoute(from, to);
  return { minutes: interCityMinutes(from, to, TRUCK_CITY_SPEED), km: Math.round(route.meters / 1000) };
}

/** Spedition statt eigenem Lkw: Grundpreis plus pro Kilo und 100 km. */
export function freightCost(grams: number, km: number): number {
  return Math.round((FREIGHT_BASE + (grams / 1000) * (km / 100) * FREIGHT_PER_KG_100KM) / 10) * 10;
}

// ---------------------------------------------------------------------------------------------
// Schreiben

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyStats(): TradeStats {
  return {
    revenue: 0,
    delivered: 0,
    onTime: 0,
    late: 0,
    failed: 0,
    lost: 0,
    containers: 0,
    seized: 0,
    seizedGrams: 0,
    deliveriesSeized: 0,
    tipped: 0,
    demand: 0,
    ordered: 0,
  };
}

function scaled(weekly: WeeklyDemand): Record<string, number> {
  return Object.fromEntries(Object.entries(weekly).map(([id, g]) => [id, Math.round(g * DEMAND_SCALE)]));
}

/** Kunden beim Verkauf anlegen: die verkauften Städte, je Stadt die stärkste Gang, die fremden Städte. */
function buildCustomers(state: GameState, cities: readonly string[]): TradeCustomer[] {
  const base = (id: string, kind: CustomerKind) => ({
    id,
    kind,
    trust: CUSTOMER_KINDS[kind].startTrust,
    share: 0,
    topRival: null,
    delivered: 0,
    late: 0,
    failed: 0,
  });
  const list: TradeCustomer[] = [];
  for (const cityId of cities) {
    const def = getCity(cityId);
    if (!def) continue;
    list.push({
      ...base(`org:${cityId}`, 'org'),
      name: `Organisation ${def.name}`,
      lng: def.center.lng,
      lat: def.center.lat,
      indexCity: cityId,
      weekly: scaled(ORG_DEMAND[cityId] ?? { weed: 10_000 }),
      cityId,
    });
  }
  for (const cityId of cities) {
    const def = getCity(cityId);
    const gangs = [...getGangs(state, cityId)].sort(
      (a, b) => gangPower(state, b.id) - gangPower(state, a.id) || a.id.localeCompare(b.id),
    );
    const gang = gangs[0];
    if (!def || !gang) continue;
    const customer: TradeCustomer = {
      ...base(`gang:${gang.id}`, 'gang'),
      name: gang.name,
      lng: def.center.lng,
      lat: def.center.lat,
      indexCity: cityId,
      weekly: scaled(GANG_DEMAND),
      gangId: gang.id,
    };
    // Was die Gang aus der Stadt-Phase noch weiß (Auftrag 34), zählt ins Vertrauen.
    customer.trust = clampTrust(customer.trust + memoryScore(state, gang.id) / 2);
    list.push(customer);
  }
  for (const city of FOREIGN_CITIES) {
    list.push({
      ...base(`city:${city.id}`, 'city'),
      name: city.name,
      lng: city.at.lng,
      lat: city.at.lat,
      indexCity: city.indexCity,
      weekly: scaled(city.weekly),
      foreignId: city.id,
    });
  }
  return list;
}

function clampTrust(n: number): number {
  return Math.max(0, Math.min(TRUST.max, Math.round(n)));
}

function addTrust(customer: TradeCustomer, amount: number): void {
  customer.trust = clampTrust(customer.trust + amount);
}

/** Lager eines Hafens anlegen bzw. holen. */
function stockAt(ctx: Ctx, portId: string): Record<string, StockLot> {
  const s = ctx.state.modules.trade;
  s.stock[portId] ??= {};
  return s.stock[portId];
}

/** Ware einlagern (Qualität als gewichteter Schnitt). */
function addStock(ctx: Ctx, portId: string, productId: string, amount: number, quality: number): void {
  const lots = stockAt(ctx, portId);
  const lot = lots[productId] ?? { amount: 0, quality };
  const total = lot.amount + amount;
  lots[productId] = {
    amount: total,
    quality: total > 0 ? Math.round(((lot.amount * lot.quality + amount * quality) / total) * 1000) / 1000 : quality,
  };
}

/** Ware entnehmen (alles oder nichts). */
function takeStock(ctx: Ctx, portId: string, productId: string, amount: number): StockLot | null {
  const lots = stockAt(ctx, portId);
  const lot = lots[productId];
  if (!lot || lot.amount < amount) return null;
  lot.amount -= amount;
  if (lot.amount <= 0) delete lots[productId];
  return { amount, quality: lot.quality };
}

/** Die Hafen-Phase beginnt (nach dem Verkauf). */
export function startTrade(ctx: Ctx, cities: readonly string[]): void {
  const s = ctx.state.modules.trade;
  if (s.startedAt !== null) return;
  s.startedAt = ctx.now;
  s.contractUntil = ctx.now + CONTRACT_WEEKS * 7 * MINUTES_PER_DAY;
  s.customers = buildCustomers(ctx.state, cities);
  s.ports = [HARBOR_CITY];
  for (const [productId, amount] of Object.entries(START_STOCK)) {
    addStock(ctx, HARBOR_CITY, productId, amount, START_STOCK_QUALITY);
  }
  journal.add(
    ctx,
    `Hafen-Phase: ${s.customers.length} Kunden, Jansens Halle in Rotterdam. Die ersten Bestellungen kommen bei deiner Ankunft.`,
    'good',
  );
  ctx.emit('trade.started', { customers: s.customers.length });
}

/** Bestellungen einer Woche: pro Kunde und Ware dein Anteil am Bedarf (Abnahmevertrag mindestens CONTRACT_SHARE). */
export function placeOrders(ctx: Ctx): number {
  const s = ctx.state.modules.trade;
  const week = weekOf(ctx.now);
  s.week = week;
  const contract = s.contractUntil !== null && ctx.now < s.contractUntil;
  let placed = 0;
  for (const customer of s.customers) {
    if (customer.kind === 'gang' && customer.gangId && memoryScore(ctx.state, customer.gangId) <= GANG_MEMORY_BLOCK) {
      customer.share = 0;
      continue;
    }
    const { share, topRival } = shareFor(ctx.state, customer, week);
    const guaranteed = contract && customer.kind === 'org';
    const mine = guaranteed ? Math.max(share, CONTRACT_SHARE) : share;
    customer.share = Math.round(mine * 1000) / 1000;
    customer.topRival = topRival;
    const items: OrderItem[] = [];
    for (const [productId, weekly] of Object.entries(customer.weekly)) {
      // Kleine Schwankung von Woche zu Woche (±15 %).
      const demand = Math.round(weekly * (0.85 + ctx.random() * 0.3));
      s.stats.demand += demand;
      const amount = Math.round((demand * mine) / ORDER_ROUND_GRAMS) * ORDER_ROUND_GRAMS;
      if (amount < MIN_ITEM_GRAMS) continue;
      const offer = guaranteed
        ? fairPrice(ctx.state, productId, customer.indexCity)
        : customerOffer(ctx.state, customer, productId);
      items.push({ productId, amount, offer });
    }
    const amount = items.reduce((sum, item) => sum + item.amount, 0);
    if (amount < MIN_ORDER_GRAMS) continue;
    const order: TradeOrder = {
      id: ctx.nextId(),
      customerId: customer.id,
      items,
      amount,
      factor: null,
      guaranteed,
      placedAt: ctx.now,
      answerBy: ctx.now + ORDER_ANSWER_MINUTES,
      dueAt: ctx.now + ORDER_DUE_DAYS * MINUTES_PER_DAY,
      status: 'open',
    };
    s.orders.push(order);
    s.stats.ordered += amount;
    placed++;
    ctx.emit('trade.orderPlaced', {
      orderId: order.id,
      customerId: customer.id,
      amount,
      value: orderValue(order),
      guaranteed,
    });
  }
  if (placed > 0) {
    messages.send(ctx, {
      contact: dispatcherContact(),
      text: `Neue Woche, ${placed} Bestellungen. Annehmen bis morgen früh, sonst kauft die Konkurrenz.`,
      silent: true,
    });
  }
  // Alte, erledigte Bestellungen fallen nach drei Wochen weg.
  s.orders = s.orders.filter((o) => isOpenStatus(o.status) || ctx.now - o.placedAt < 21 * MINUTES_PER_DAY);
  return placed;
}

function isOpenStatus(status: OrderStatus): boolean {
  return status === 'open' || status === 'accepted' || status === 'delivering';
}

/** Die Disponentin in Jansens Kontor schreibt die Wochenübersicht. */
function dispatcherContact(): Contact {
  return {
    id: 'trade:dispo',
    name: 'Fenna de Wit',
    kind: 'other',
    role: 'Disponentin in Rotterdam',
    about: 'Hat zwanzig Jahre Jansens Kontor geführt. Kennt jeden Kunden und jede Frist.',
    look: { feminine: true, age: 46 },
    voice: { feminine: true, pitch: 1, rate: 1.05 },
  };
}

/** Antwort auf eine Bestellung. */
export function answerOrder(
  ctx: Ctx,
  orderId: number,
  choice: 'accept' | 'decline' | 'counter',
  factor?: number,
): CommandResult {
  const s = ctx.state.modules.trade;
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: 'Diese Bestellung gibt es nicht.' };
  if (order.status !== 'open') return { ok: false, reason: 'Auf diese Bestellung ist schon geantwortet.' };
  const customer = s.customers.find((c) => c.id === order.customerId);
  if (!customer) return { ok: false, reason: 'Diesen Kunden gibt es nicht.' };
  if (choice === 'decline') {
    order.status = 'declined';
    addTrust(customer, TRUST.declined);
    ctx.emit('trade.orderAnswered', { orderId, choice, result: 'declined' });
    return { ok: true };
  }
  if (choice === 'accept') {
    order.status = 'accepted';
    order.factor = 1;
    ctx.emit('trade.orderAnswered', { orderId, choice, result: 'accepted' });
    return { ok: true };
  }
  // Gegenangebot: bis zur Preisgrenze. Liegt die Konkurrenz zu deinem Preis vorn, kauft der Kunde dort.
  if (order.guaranteed) return { ok: false, reason: 'Der Abnahmevertrag hat einen festen Preis.' };
  if (!(factor !== undefined && factor > 0 && Number.isFinite(factor))) return { ok: false, reason: 'Welcher Preis?' };
  if (factor > maxFactor(order) + 1e-9) {
    return {
      ok: false,
      reason: `Mehr als ${formatEuro(orderValue(order, maxFactor(order)))} zahlt ${customer.name} nicht.`,
    };
  }
  const mine = playerScore(ctx.state, customer, factor);
  const rivals = rivalScores(ctx.state, weekOf(ctx.now));
  const best = rivals.reduce<{ name: string; score: number } | null>(
    (top, r) => (!top || r.score > top.score ? r : top),
    null,
  );
  if (best && best.score > mine) {
    order.status = 'lost';
    order.lostTo = best.name;
    s.stats.lost += 1;
    ctx.emit('trade.orderAnswered', { orderId, choice, result: 'lost' });
    journal.add(ctx, `${customer.name} kauft lieber bei ${best.name}: dein Preis war zu hoch.`, 'bad');
    return { ok: true, data: { result: 'lost', to: best.name } };
  }
  order.status = 'accepted';
  order.factor = round2(factor);
  ctx.emit('trade.orderAnswered', { orderId, choice, result: 'accepted' });
  return { ok: true, data: { result: 'accepted' } };
}

/** Alle offenen Bestellungen annehmen. */
export function acceptAll(ctx: Ctx, guaranteedOnly = false): CommandResult {
  const list = openOrders(ctx.state).filter((o) => !guaranteedOnly || o.guaranteed);
  if (list.length === 0) return { ok: false, reason: 'Keine offenen Bestellungen.' };
  for (const order of list) answerOrder(ctx, order.id, 'accept');
  return { ok: true, data: { accepted: list.length } };
}

/** Liegt alles für eine Bestellung in diesem Hafen? */
export function portHas(
  state: GameState,
  portId: string,
  items: readonly { productId: string; amount: number }[],
): boolean {
  const lots = portStock(state, portId);
  return items.every((i) => (lots[i.productId]?.amount ?? 0) >= i.amount);
}

/** Hafen mit allem für eine Bestellung, der nächste zuerst (null, wenn keiner alles hat). */
export function portFor(state: GameState, order: TradeOrder): string | null {
  const customer = getCustomer(state, order.customerId);
  const ports = ownedPorts(state).filter((id) => portHas(state, id, order.items));
  if (ports.length === 0 || !customer) return null;
  return ports.sort(
    (a, b) => deliveryEstimate(customer, a).km - deliveryEstimate(customer, b).km || a.localeCompare(b),
  )[0];
}

/** Ausliefern: Ware aus dem Hafen, Lkw oder Spedition, unterwegs vielleicht eine Kontrolle. */
export function deliver(ctx: Ctx, orderId: number, portId?: string, vehicleId?: number | null): CommandResult {
  const s = ctx.state.modules.trade;
  const order = s.orders.find((o) => o.id === orderId);
  if (!order || order.status !== 'accepted')
    return { ok: false, reason: 'Diese Bestellung wartet nicht auf eine Lieferung.' };
  const customer = s.customers.find((c) => c.id === order.customerId);
  if (!customer) return { ok: false, reason: 'Diesen Kunden gibt es nicht.' };
  const from = portId ?? portFor(ctx.state, order);
  if (!from || !s.ports.includes(from) || !portHas(ctx.state, from, order.items)) {
    return { ok: false, reason: `Nicht alles im Hafen: ${orderItemsText(order.items)}.` };
  }
  const trip = deliveryEstimate(customer, from);
  let vehicle: number | null = null;
  if (vehicleId !== undefined && vehicleId !== null) {
    const v = getVehicle(ctx.state, vehicleId);
    if (!v || v.cityId !== HARBOR_CITY) return { ok: false, reason: 'Dieser Lkw steht nicht in Rotterdam.' };
    if (vehicleSpec(ctx.state, vehicleId).capacity < order.amount)
      return { ok: false, reason: 'Das passt nicht in den Wagen.' };
    vehicle = vehicleId;
  }
  const freight = vehicle === null ? freightCost(order.amount, trip.km) : 0;
  if (freight > 0 && !wallet.canAfford(ctx.state, freight, 'dirty')) {
    return { ok: false, reason: `Die Spedition will ${formatEuro(freight)}.` };
  }
  const id = ctx.nextId();
  if (vehicle !== null && !useVehicle(ctx, vehicle, id)) return { ok: false, reason: 'Der Lkw ist gerade unterwegs.' };
  if (freight > 0) {
    wallet.pay(ctx, freight, 'dirty', `Spedition nach ${customer.name}`, {
      category: 'trade.freight',
      cityId: HARBOR_CITY,
    });
  }
  const items: DeliveryItem[] = [];
  for (const item of order.items) {
    const lot = takeStock(ctx, from, item.productId, item.amount);
    items.push({ productId: item.productId, amount: item.amount, quality: lot?.quality ?? START_QUALITY });
  }
  const factor = vehicle === null ? 1 : vehicleSpec(ctx.state, vehicle).checkFactor;
  const checkChance = Math.min(0.8, (trip.km / 100) * AUTOBAHN_CHECK_PER_100KM * factor);
  const checkAt = ctx.chance(checkChance) ? ctx.now + Math.round(trip.minutes * (0.2 + ctx.random() * 0.6)) : null;
  s.deliveries.push({
    id,
    orderId,
    customerId: customer.id,
    items,
    amount: order.amount,
    portId: from,
    departedAt: ctx.now,
    arrivesAt: ctx.now + trip.minutes,
    vehicleId: vehicle,
    checkAt,
  });
  order.status = 'delivering';
  journal.add(
    ctx,
    `${orderItemsText(order.items)} unterwegs nach ${customer.name} (${clock.formatDuration(trip.minutes)}).`,
  );
  return { ok: true, data: { deliveryId: id, arrivesAt: ctx.now + trip.minutes } };
}

/** Container bestellen. */
export function buyContainer(
  ctx: Ctx,
  producerId: string,
  productId: string,
  size: ContainerSize['id'],
  portId: string = HARBOR_CITY,
): CommandResult {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return { ok: false, reason: 'Erst nach dem Verkauf des Geschäfts.' };
  const producer = PRODUCER_BY_ID.get(producerId);
  if (!producer) return { ok: false, reason: 'Diesen Produzenten gibt es nicht.' };
  if (producer.products[productId] === undefined) {
    return { ok: false, reason: `${producer.name} hat kein ${productName(productId)}.` };
  }
  const container = SIZE_BY_ID.get(size);
  if (!container) return { ok: false, reason: 'Diese Größe gibt es nicht.' };
  if (!s.ports.includes(portId)) return { ok: false, reason: 'In diesem Hafen hast du keinen Liegeplatz.' };
  const cost = containerCost(producerId, productId, size);
  if (!wallet.canAfford(ctx.state, cost.goods + cost.freight, 'dirty')) {
    return { ok: false, reason: `Das kostet ${formatEuro(cost.goods + cost.freight)}.` };
  }
  wallet.pay(ctx, cost.goods, 'dirty', `${container.label} ${productName(productId)} bei ${producer.name}`, {
    category: 'trade.purchase',
    cityId: HARBOR_CITY,
  });
  wallet.pay(ctx, cost.freight, 'dirty', `Fracht ${producer.from} – ${harborPort(portId)?.name ?? portId}`, {
    category: 'trade.freight',
    cityId: HARBOR_CITY,
  });
  const quality = Math.max(0.2, Math.min(1, producer.quality + (ctx.random() * 2 - 1) * 0.05));
  const shipment: TradeShipment = {
    id: ctx.nextId(),
    producerId,
    productId,
    amount: container.grams,
    quality: Math.round(quality * 1000) / 1000,
    size,
    portId,
    orderedAt: ctx.now,
    arrivesAt: ctx.now + shippingMinutes(producerId, portId),
    status: 'sea',
  };
  s.shipments.push(shipment);
  s.stats.containers += 1;
  ctx.emit('trade.containerOrdered', {
    shipmentId: shipment.id,
    producerId,
    amount: container.grams,
    portId,
    cost: cost.goods + cost.freight,
  });
  return { ok: true, data: { shipmentId: shipment.id, arrivesAt: shipment.arrivesAt } };
}

/** Liegeplatz in einem weiteren Hafen mieten (sauberes Geld). */
export function rentBerth(ctx: Ctx, portId: string): CommandResult {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return { ok: false, reason: 'Erst nach dem Verkauf des Geschäfts.' };
  const port = harborPort(portId);
  if (!port) return { ok: false, reason: 'Diesen Hafen gibt es nicht.' };
  if (s.ports.includes(portId)) return { ok: false, reason: `In ${port.name} hast du schon einen Liegeplatz.` };
  if (
    port.berthCost > 0 &&
    !wallet.pay(ctx, port.berthCost, 'clean', `Liegeplatz ${port.name}`, { category: 'expansion', cityId: HARBOR_CITY })
  ) {
    return { ok: false, reason: `Der Liegeplatz kostet ${formatEuro(port.berthCost)} sauberes Geld.` };
  }
  s.ports.push(portId);
  journal.add(ctx, `Liegeplatz in ${port.name} gemietet.`, 'good');
  return { ok: true };
}

/** Deinen Preis setzen. */
export function setPriceLevel(ctx: Ctx, level: number): CommandResult {
  if (!Number.isFinite(level)) return { ok: false, reason: 'Welcher Preis?' };
  const [min, max] = PRICE_LEVEL_RANGE;
  ctx.state.modules.trade.priceLevel = Math.round(Math.min(max, Math.max(min, level)) * 100) / 100;
  return { ok: true };
}

/** Ein Container kommt an: vielleicht eine Zollkontrolle (Konfrontation am Kai), sonst gleich ins Lager. */
function containerArrives(ctx: Ctx, shipment: TradeShipment): void {
  const risk = containerRisk(ctx.state, shipment.producerId, shipment.size, shipment.portId);
  customsArrival(ctx, shipment.portId, shipment.amount / 1000);
  if (!ctx.chance(risk)) {
    landContainer(ctx, shipment, false);
    return;
  }
  const port = harborPort(shipment.portId);
  shipment.status = 'customs';
  const { encounterId } = startEncounter(ctx, {
    kind: 'customsCheck',
    setting: 'port',
    place: `in ${port?.name ?? shipment.portId}`,
    stakes: { goods: shipment.amount },
    skipEffects: true,
    opponent: { ...CUSTOMS_OPPONENT },
    lossCategory: 'loss.customs',
    origin: { module: 'trade', ref: `container:${shipment.id}` },
  });
  shipment.encounterId = encounterId;
  journal.add(ctx, `Zoll in ${port?.name ?? shipment.portId}: Sie wollen den Container sehen.`, 'bad');
}

function landContainer(ctx: Ctx, shipment: TradeShipment, checked: boolean): void {
  const s = ctx.state.modules.trade;
  s.shipments = s.shipments.filter((x) => x.id !== shipment.id);
  addStock(ctx, shipment.portId, shipment.productId, shipment.amount, shipment.quality);
  journal.add(
    ctx,
    `${Math.round(shipment.amount / 1000)} kg ${productName(shipment.productId)} in ${harborPort(shipment.portId)?.name ?? shipment.portId} angekommen.`,
    'good',
  );
  ctx.emit('trade.containerArrived', {
    shipmentId: shipment.id,
    portId: shipment.portId,
    amount: shipment.amount,
    checked,
  });
}

function onContainerCheck(ctx: Ctx, ref: string | undefined, outcome: string): void {
  const id = Number(ref?.replace('container:', ''));
  const s = ctx.state.modules.trade;
  const shipment = s.shipments.find((x) => x.id === id);
  if (!shipment || shipment.status !== 'customs') return;
  if (outcome === 'success' || outcome === 'retreat') {
    landContainer(ctx, shipment, true);
    return;
  }
  s.shipments = s.shipments.filter((x) => x.id !== shipment.id);
  s.stats.seized += 1;
  s.stats.seizedGrams += shipment.amount;
  customsSeized(ctx, shipment.portId);
  journal.add(
    ctx,
    `Container aufgeflogen: ${Math.round(shipment.amount / 1000)} kg ${productName(shipment.productId)} beim Zoll in ${harborPort(shipment.portId)?.name ?? shipment.portId}.`,
    'bad',
  );
  ctx.emit('trade.containerSeized', { shipmentId: shipment.id, portId: shipment.portId, amount: shipment.amount });
}

/** Lieferung angekommen: Zahlung, Vertrauen, Ruf. Bei Gangs kann der Deal kippen. */
function deliveryArrives(ctx: Ctx, delivery: TradeDelivery): void {
  const s = ctx.state.modules.trade;
  s.deliveries = s.deliveries.filter((d) => d.id !== delivery.id);
  if (delivery.vehicleId !== null) releaseVehicle(ctx, delivery.vehicleId);
  const order = s.orders.find((o) => o.id === delivery.orderId);
  const customer = s.customers.find((c) => c.id === delivery.customerId);
  if (!order || !customer) return;
  const late = ctx.now > order.dueAt;
  if (customer.kind === 'gang' && ctx.chance(GANG_TIP_CHANCE * (1 - customer.trust / 100))) {
    // Der Deal kippt: Die Gang nimmt die Ware und zahlt nicht.
    order.status = 'failed';
    s.stats.tipped += 1;
    addTrust(customer, -10);
    journal.add(ctx, `${customer.name} hat die Ware genommen und nicht gezahlt. Der Deal ist gekippt.`, 'bad');
    ctx.emit('trade.dealTipped', { orderId: order.id, customerId: customer.id, amount: delivery.amount });
    return;
  }
  const revenue = Math.round(orderValue(order) * (late ? LATE_PRICE_FACTOR : 1));
  wallet.earn(ctx, revenue, 'dirty', `Lieferung an ${customer.name}`, { category: 'sales.trade', cityId: HARBOR_CITY });
  order.status = 'delivered';
  order.revenue = revenue;
  customer.delivered += 1;
  s.stats.revenue += revenue;
  s.stats.delivered += 1;
  if (late) {
    customer.late += 1;
    s.stats.late += 1;
    addTrust(customer, TRUST.late);
  } else {
    s.stats.onTime += 1;
    addTrust(customer, TRUST.onTime);
  }
  s.reliability = ema(s.reliability, late ? 0.3 : 1);
  s.quality = ema(
    s.quality,
    delivery.items.reduce((sum, i) => sum + i.amount * i.quality, 0) / Math.max(1, delivery.amount),
  );
  if (customer.kind === 'gang' && customer.gangId) remember(ctx, customer.gangId, 'deal');
  journal.add(
    ctx,
    `${customer.name} hat ${orderItemsText(order.items)} bekommen: ${formatEuro(revenue)}${late ? ' (zu spät)' : ''}.`,
    late ? 'info' : 'good',
  );
  ctx.emit('trade.delivered', { orderId: order.id, customerId: customer.id, amount: order.amount, revenue, late });
}

function ema(old: number, value: number): number {
  return Math.round((old * (1 - REPUTATION_ALPHA) + value * REPUTATION_ALPHA) * 1000) / 1000;
}

/** Zollkontrolle unterwegs: mit SEIZE_ON_CHECK ist die Ladung weg, die Bestellung wartet wieder auf Ware. */
function deliveryCheck(ctx: Ctx, delivery: TradeDelivery): void {
  delivery.checkAt = null;
  const s = ctx.state.modules.trade;
  const order = s.orders.find((o) => o.id === delivery.orderId);
  if (!ctx.chance(SEIZE_ON_CHECK)) {
    delivery.arrivesAt += 60;
    journal.add(ctx, 'Zollkontrolle auf der Autobahn: Der Lkw darf nach einer Stunde weiter.', 'info');
    return;
  }
  s.deliveries = s.deliveries.filter((d) => d.id !== delivery.id);
  if (delivery.vehicleId !== null) {
    releaseVehicle(ctx, delivery.vehicleId);
    maybeSeize(ctx, delivery.vehicleId);
  }
  s.stats.deliveriesSeized += 1;
  if (order) order.status = 'accepted';
  journal.add(
    ctx,
    `Zollkontrolle auf der Autobahn: ${orderItemsText(delivery.items)} beschlagnahmt. Die Bestellung wartet noch.`,
    'bad',
  );
  ctx.emit('trade.deliverySeized', { deliveryId: delivery.id, orderId: delivery.orderId, amount: delivery.amount });
}

function failOrder(ctx: Ctx, order: TradeOrder, reason: 'expired' | 'late'): void {
  const s = ctx.state.modules.trade;
  const customer = s.customers.find((c) => c.id === order.customerId);
  order.status = reason === 'expired' ? 'expired' : 'failed';
  if (customer) {
    addTrust(customer, reason === 'expired' ? TRUST.expired : TRUST.failed);
    if (reason === 'late') customer.failed += 1;
  }
  if (reason === 'late') {
    s.stats.failed += 1;
    s.reliability = ema(s.reliability, 0);
    journal.add(
      ctx,
      `Lieferung an ${customer?.name ?? order.customerId} nicht geschafft. Das spricht sich rum.`,
      'bad',
    );
  }
  ctx.emit('trade.orderFailed', { orderId: order.id, customerId: order.customerId, reason });
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return;
  // Montag früh: neue Bestellungen (einmal pro Woche).
  const week = weekOf(ctx.now);
  if (week > s.week && clock.weekday(ctx.now) === 0 && ctx.now % MINUTES_PER_DAY >= ORDER_HOUR) placeOrders(ctx);
  for (const order of s.orders) {
    if (order.status === 'open' && ctx.now >= order.answerBy) failOrder(ctx, order, 'expired');
    // Eine Woche nach der Frist ohne Lieferung: geplatzt (bis dahin geht es mit Abschlag).
    else if (order.status === 'accepted' && ctx.now >= order.dueAt + 2 * MINUTES_PER_DAY) failOrder(ctx, order, 'late');
  }
  for (const shipment of [...s.shipments]) {
    if (shipment.status === 'sea' && ctx.now >= shipment.arrivesAt) containerArrives(ctx, shipment);
  }
  for (const delivery of [...s.deliveries]) {
    if (delivery.checkAt !== null && ctx.now >= delivery.checkAt) deliveryCheck(ctx, delivery);
    else if (ctx.now >= delivery.arrivesAt) deliveryArrives(ctx, delivery);
  }
}

function initialState(): TradeState {
  return {
    startedAt: null,
    contractUntil: null,
    week: -1,
    customers: [],
    orders: [],
    shipments: [],
    deliveries: [],
    stock: {},
    ports: [],
    priceLevel: 1,
    reliability: START_RELIABILITY,
    quality: START_QUALITY,
    stats: emptyStats(),
  };
}

export default defineModule({
  id: 'trade',
  version: 1,
  init: () => initialState(),
  tickEvery: 5,
  tick,
  commands: {
    'trade.answer': (ctx, { orderId, choice, factor }) => answerOrder(ctx, orderId, choice, factor),
    'trade.acceptAll': (ctx, payload) => acceptAll(ctx, payload?.guaranteedOnly === true),
    'trade.deliver': (ctx, { orderId, portId, vehicleId }) => deliver(ctx, orderId, portId, vehicleId),
    'trade.buy': (ctx, { producerId, productId, size, portId }) =>
      buyContainer(ctx, producerId, productId, size, portId),
    'trade.rentBerth': (ctx, { portId }) => rentBerth(ctx, portId),
    'trade.setPriceLevel': (ctx, { level }) => setPriceLevel(ctx, level),
  },
  on: {
    'business.sold': (ctx, { cities }) => startTrade(ctx, cities),
    // Ankunft in Rotterdam: die ersten Bestellungen gleich (nicht erst am Montag).
    'city.arrived': (ctx, { cityId }) => {
      const s = ctx.state.modules.trade;
      if (cityId === HARBOR_CITY && s.startedAt !== null && s.orders.length === 0) placeOrders(ctx);
    },
    'encounter.resolved': (ctx, { request, outcome }) => {
      if (request.origin?.module === 'trade') onContainerCheck(ctx, request.origin.ref, outcome);
    },
  },
  // Pleite-Regel: Ware in einem Hafen, ein Container unterwegs oder eine Lieferung auf der Straße.
  solvency: (state) =>
    isBusinessSold(state) &&
    (totalStock(state) > 0 || getShipments(state).length > 0 || getDeliveries(state).length > 0),
});

/** Ein Container wartet am Kai auf die Entscheidung in der Zollkontrolle (für die Oberfläche). */
export function containerInCustoms(state: GameState): TradeShipment | undefined {
  const active = new Set(activeEncounters(state).map((e) => e.id));
  return getShipments(state).find(
    (x) => x.status === 'customs' && x.encounterId !== undefined && active.has(x.encounterId),
  );
}

/** Häfen mit Daten (gemietet oder nicht), für die Oberfläche. */
export function harborPorts(): readonly HarborPort[] {
  return HARBOR_PORTS;
}

/** Produzent nach ID. */
export function getProducer(id: string): Producer | undefined {
  return PRODUCER_BY_ID.get(id);
}
