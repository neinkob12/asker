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
//   openOrders, pendingDeliveries, orderCoverage, getShipments, getDeliveries, portStock, totalStock, ownedPorts, fairPrice,
//   customerOffer, priceCap, orderValue, playerScore, rivalScores, shareFor, supplierReputation, tradeStats,
//   containerCost, containerRisk, deliveryEstimate, freightCost, weekOf, PRODUCERS, CONTAINER_SIZES, FOREIGN_CITIES;
//   Auftrag 44, Teil 7 (packing.ts): packingFactor, packingParams, maybeStartPacking (Minispiel Container packen)
// Befehle: 'trade.answer', 'trade.acceptAll', 'trade.deliver', 'trade.buy', 'trade.sail', 'trade.rentBerth',
//   'trade.buildHall', 'trade.setPriceLevel'; Auftrag 43 (plans.ts, Fenna): 'trade.setPlan', 'trade.addRestock',
//   'trade.removeRestock'
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
  formatNumber,
  type GameState,
  journal,
  type LngLat,
  MINUTES_PER_DAY,
  messages,
  wallet,
} from '../../core';
import { cityName, getCity, HARBOR_CITY, isBusinessSold, presentCity } from '../city';
import { activeEncounters, startEncounter } from '../encounters';
import {
  getShips,
  getVehicle,
  isShip,
  maybeSeize,
  releaseVehicle,
  useVehicle,
  vehicleName,
  vehicleSpec,
  vehicleStatus,
} from '../fleet';
import { gangContact, gangPower, getGang, getGangs, memoryScore, remember } from '../gangs';
import { getProduct, productName } from '../goods';
import { getRightHand, rightHandTitle } from '../hierarchy';
import { CUSTOMS_OPPONENT, HARBOR_PORTS, type HarborPort, harborPort } from '../logistics';
import { priceIndex } from '../market';
import { customsArrival, customsHeat, customsSeized } from '../police';
import { interCityMinutes, interCityRoute, seaRoute } from '../roads';
import { getStaffMember, staffContact } from '../staff';
import { rivalOffers } from '../suppliers';
import {
  AUTOBAHN_CHECK_MAX,
  AUTOBAHN_CHECK_PER_100KM,
  CHARTER_KM_PER_DAY,
  CONTRACT_SHARE,
  CONTRACT_WARN_DAYS,
  CONTRACT_WEEKS,
  CUSTOMER_KINDS,
  DEMAND_SCALE,
  EUROPE_MIN_RELIABILITY,
  FIRST_ORDER_ANSWER_MINUTES,
  FREIGHT_BASE,
  FREIGHT_PER_KG_100KM,
  GANG_MEMORY_BLOCK,
  GANG_TIP_CHANCE,
  LATE_GRACE_DAYS,
  LATE_PRICE_FACTOR,
  MAX_HALLS,
  MIN_ITEM_GRAMS,
  MIN_ORDER_GRAMS,
  ORDER_ANSWER_MINUTES,
  ORDER_DUE_DAYS,
  ORDER_HOUR,
  ORDER_ROUND_GRAMS,
  PRICE_CAP_MARKUP,
  PRICE_LEVEL_RANGE,
  QUAY_FEE_PER_DAY,
  RELIABILITY_RECOVERY,
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
  UNATTENDED_CUSTOMS_PASS,
  WHOLESALE_SHARE,
} from './config';
import {
  CONTAINER_SIZES,
  COVERS,
  type ContainerSize,
  type Cover,
  EUROPE_CITIES,
  type EuropeCity,
  FOREIGN_CITIES,
  GANG_DEMAND,
  ORG_DEMAND,
  OWN_ORIGINS,
  type OwnOrigin,
  PRODUCERS,
  type Producer,
  type WeeklyDemand,
} from './data';
import { maybeStartPacking, onPackingFinished, packingFactor } from './packing';
import {
  addRestock,
  type CustomerPlan,
  DISPATCH_EVERY,
  dispatcherTick,
  NO_PLAN,
  type RestockRule,
  removeRestock,
  setPlan,
} from './plans';

export {
  CONTRACT_WEEKS,
  CUSTOMER_KINDS,
  EUROPE_MIN_RELIABILITY,
  LATE_GRACE_DAYS,
  LATE_PRICE_FACTOR,
  MAX_HALLS,
  ORDER_DUE_DAYS,
  PRICE_LEVEL_RANGE,
  PRICE_LEVEL_STEP,
  SEIZE_ON_CHECK,
  TRUST,
} from './config';
export {
  CONTAINER_SIZES,
  COVERS,
  type ContainerSize,
  type Cover,
  EUROPE_CITIES,
  type EuropeCity,
  FOREIGN_CITIES,
  OWN_ORIGINS,
  type OwnOrigin,
  PRODUCERS,
  type Producer,
} from './data';
export {
  maybeStartPacking,
  type PackingParams,
  packingFactor,
  packingIds,
  packingParams,
  packingRef,
} from './packing';
export {
  ACCEPT_LABELS,
  type CustomerPlan,
  DELIVER_LABELS,
  hasOwnPlan,
  planFor,
  type RestockRule,
  restockRules,
  stockWithIncoming,
} from './plans';

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
  /** Stadt in Europa (kind 'europe', Auftrag 41). */
  europeId?: string;
  /** Eigener Preisfaktor auf den fairen Preis (Europa), sonst der der Art. */
  priceFactor?: number;
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
  /** Teillieferung: unterwegs ('shipped'), angekommen ('delivered') oder nicht mehr geliefert ('missed'). */
  state?: 'shipped' | 'delivered' | 'missed';
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

/** Auf See, beim Zoll oder am Kai (Auftrag 41: das Lager ist voll, der Rest wartet an Bord). */
export type ShipmentStatus = 'sea' | 'customs' | 'quay';

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
  /** Seit wann der Container am Kai wartet (Liegegeld), nur mit status 'quay'. */
  quaySince?: number;
  /** Deckladung (Auftrag 41). */
  cover: Cover['id'];
  /** Eigenes Schiff (fleet), null = Linienschiff (Charter pro Container). */
  vesselId: number | null;
  /** Auftrag 42: eigene Ware aus den Fincas (grow), mit dem Faktor der Verpackung auf die Chance einer Kontrolle. */
  own?: boolean;
  pack?: number;
  /**
   * Auftrag 44, Teil 7: Score beim Packen (0 bis 1), wenn du selbst gepackt hast (Minispiel 'container'). Faktor auf
   * die Chance einer Kontrolle über packingFactor; fehlt = 1. Nicht zu verwechseln mit pack (eigene Ware aus grow).
   */
  packing?: number;
}

/** Ein Container für eine Bestellung beim Produzenten (trade.buy, trade.sail). */
export interface ContainerLoad {
  productId: string;
  size: ContainerSize['id'];
  cover?: Cover['id'];
  /** Wie viele Container dieser Art (Standard 1). */
  count?: number;
}

export interface DeliveryItem {
  productId: string;
  amount: number;
  quality: number;
  /** Auftrag 42: davon aus eigener Produktion (Gramm). */
  own?: number;
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
  /** Auftrag 42: davon aus eigener Produktion (Gramm); fehlt = 0. */
  own?: number;
}

/** Ware im Ausfuhrlager eines eigenen Ausfuhrhafens (Auftrag 42), mit dem Faktor der Verpackung (gewichteter Schnitt). */
export interface OriginLot {
  amount: number;
  quality: number;
  pack: number;
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
  /** Auftrag 41: Fahrten eigener Schiffe. */
  voyages: number;
  /** Auftrag 42: gelieferte Gramm insgesamt und davon aus eigener Produktion. */
  deliveredGrams: number;
  ownDelivered: number;
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
  /** Auftrag 41: gebaute Hallen pro Hafen (mehr Platz im Lager). */
  halls: Record<string, number>;
  /** Dein Preis als Faktor auf den fairen Preis. */
  priceLevel: number;
  /** Dein Ruf als Lieferant (gleitender Schnitt): pünktlich und Qualität. */
  reliability: number;
  quality: number;
  stats: TradeStats;
  /** Auftrag 42: Ausfuhrlager der eigenen Fincas pro Ausfuhrhafen (OWN_ORIGINS) und Sorte. */
  origins: Record<string, Record<string, OriginLot>>;
  /** Auftrag 43 (plans.ts): Fennas Plan für alle Kunden, eigene Pläne pro Kunde und Nachkauf-Regeln. */
  defaultPlan: CustomerPlan;
  plans: Record<string, CustomerPlan>;
  restock: RestockRule[];
}

declare module '../../core' {
  interface ModuleStates {
    trade: TradeState;
  }
  interface GameCommands {
    /** Bestellung annehmen, ablehnen oder Gegenangebot (factor auf ihr Angebot, nur mit 'counter'). */
    'trade.answer': { orderId: number; choice: 'accept' | 'decline' | 'counter'; factor?: number };
    /** Alle offenen Bestellungen annehmen (nur die mit Abnahmevertrag, wenn guaranteedOnly). */
    'trade.acceptAll': { guaranteedOnly?: boolean; coveredOnly?: boolean };
    /** Angenommene Bestellung ausliefern: aus einem Hafen (Standard: der mit genug Ware, nächster zuerst). */
    'trade.deliver': { orderId: number; portId?: string; vehicleId?: number | null };
    /** Container bei einem Produzenten bestellen, auf dem Linienschiff (Charter pro Container). */
    'trade.buy': {
      producerId: string;
      productId: string;
      size: ContainerSize['id'];
      portId?: string;
      cover?: Cover['id'];
      count?: number;
    };
    /** Auftrag 41: eigenes Schiff zum Produzenten schicken; es holt die Container und bringt sie in den Hafen. */
    'trade.sail': { vesselId: number; producerId: string; portId?: string; load: ContainerLoad[] };
    /** Liegeplatz in einem weiteren Hafen mieten (sauberes Geld). */
    'trade.rentBerth': { portId: string };
    /** Eine Halle mehr im Hafen (sauberes Geld, Auftrag 41). */
    'trade.buildHall': { portId: string };
    /** Deinen Preis setzen (Faktor auf den fairen Preis). */
    'trade.setPriceLevel': { level: number };
    /**
     * Auftrag 43: Was Fenna übernimmt (annehmen, ausliefern), für einen Kunden oder ohne customerId für alle; reset
     * nimmt den eigenen Plan eines Kunden weg (dann gilt der für alle).
     */
    'trade.setPlan': { plan: Partial<CustomerPlan>; customerId?: string; reset?: boolean };
    /** Auftrag 43: Nachkauf-Regel (eine pro Ware und Hafen) anlegen bzw. löschen. */
    'trade.addRestock': {
      productId: string;
      minGrams: number;
      producerId: string;
      size: ContainerSize['id'];
      portId?: string;
    };
    'trade.removeRestock': { ruleId: number };
  }
  interface GameEvents {
    'trade.started': { customers: number };
    'trade.orderPlaced': { orderId: number; customerId: string; amount: number; value: number; guaranteed: boolean };
    'trade.orderAnswered': { orderId: number; choice: string; result: 'accepted' | 'declined' | 'lost' };
    /** ownAmount (Auftrag 42): davon aus eigener Produktion. */
    'trade.delivered': {
      orderId: number;
      customerId: string;
      amount: number;
      revenue: number;
      late: boolean;
      ownAmount: number;
      /** Auftrag 42: die Waren der Lieferung mit ihrem eigenen Anteil (Gramm). */
      items: { productId: string; amount: number; own: number }[];
    };
    'trade.orderFailed': { orderId: number; customerId: string; reason: 'expired' | 'late' };
    'trade.containerOrdered': { shipmentId: number; producerId: string; amount: number; portId: string; cost: number };
    /** stored: was davon gleich ins Lager passte (der Rest wartet am Kai, Auftrag 43). */
    'trade.containerArrived': {
      shipmentId: number;
      portId: string;
      productId: string;
      amount: number;
      stored: number;
      checked: boolean;
      /** Eigene Ernte (Auftrag 42). */
      own: boolean;
    };
    /** Auftrag 41: Das Lager ist voll, der Container (oder sein Rest) wartet am Kai. */
    /** arriving: gleich bei der Ankunft (das Banner der Ankunft sagt es schon). */
    'trade.containerWaiting': { shipmentId: number; portId: string; amount: number; arriving: boolean };
    'trade.hallBuilt': { portId: string; halls: number; cost: number };
    'trade.shipSailed': { vesselId: number; producerId: string; portId: string; containers: number; cost: number };
    'trade.shipReturned': { vesselId: number; portId: string };
    'trade.containerSeized': { shipmentId: number; portId: string; amount: number };
    'trade.deliverySeized': { deliveryId: number; orderId: number; amount: number };
    'trade.dealTipped': { orderId: number; customerId: string; amount: number };
    /** Auftrag 41: Eine Stadt in Europa kauft ab jetzt bei dir. */
    'trade.customerJoined': { customerId: string };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

/** Woher Container kommen können: Produzenten und (Auftrag 42) die eigenen Ausfuhrhäfen. */
/** Takt des Hafens in Spielminuten. */
const TICK_EVERY = 5;

const SOURCE_BY_ID = new Map<string, Producer | OwnOrigin>([...PRODUCERS, ...OWN_ORIGINS].map((p) => [p.id, p]));
const ORIGIN_BY_ID = new Map(OWN_ORIGINS.map((o) => [o.id, o]));
const SIZE_BY_ID = new Map(CONTAINER_SIZES.map((c) => [c.id, c]));
const COVER_BY_ID = new Map(COVERS.map((c) => [c.id, c]));

function tradeState(state: GameState): TradeState | undefined {
  return state.modules.trade as TradeState | undefined;
}

/** Läuft die Hafen-Phase? */
export function isTradeActive(state: GameState): boolean {
  return (tradeState(state)?.startedAt ?? null) !== null;
}

/** Ende des Abnahmevertrags mit den alten Organisationen, null wenn keiner (mehr) läuft (Auftrag 43). */
export function contractEndsAt(state: GameState): number | null {
  const until = tradeState(state)?.contractUntil ?? null;
  return until !== null && state.time < until ? until : null;
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
  const city =
    customer.kind === 'europe'
      ? EUROPE_CITIES.find((c) => c.id === customer.europeId)
      : FOREIGN_CITIES.find((c) => c.id === customer.foreignId);
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
  const factor = customer.priceFactor ?? CUSTOMER_KINDS[customer.kind].priceFactor;
  return round2(fairPrice(state, productId, customer.indexCity) * factor);
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

/** Waren einer Bestellung, die noch nicht unterwegs oder geliefert sind (Teillieferung). */
export function openItems(order: TradeOrder): OrderItem[] {
  return order.items.filter((i) => i.state === undefined);
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

/**
 * Kosten eines Containers (Schwarzgeld): Ware, Fracht auf dem Linienschiff (auf dem eigenen Schiff keine, own) und
 * Deckladung (Anteil am Warenwert, Auftrag 41).
 */
export function containerCost(
  producerId: string,
  productId: string,
  size: ContainerSize['id'],
  cover: Cover['id'] = 'none',
  own = false,
): {
  goods: number;
  freight: number;
  cover: number;
} {
  const producer = SOURCE_BY_ID.get(producerId);
  const container = SIZE_BY_ID.get(size);
  const share = producer?.products[productId];
  if (!producer || !container || share === undefined) return { goods: 0, freight: 0, cover: 0 };
  const base = getProduct(productId)?.basePrice ?? 0;
  const value = Math.round((container.grams * base * share) / 10) * 10;
  // Auftrag 42: Eigene Ware ist schon bezahlt (auf der Finca); die Deckladung richtet sich trotzdem nach ihrem Wert.
  const goods = ORIGIN_BY_ID.has(producerId) ? 0 : value;
  return {
    goods,
    freight: own ? 0 : container.freight,
    cover: Math.round((value * (COVER_BY_ID.get(cover)?.share ?? 0)) / 10) * 10,
  };
}

/**
 * Chance, dass der Zoll einen Container in diesem Hafen kontrolliert (0–1): Grundrisiko der Herkunft × Größe × Hafen ×
 * Deckladung × Schiff (Linie 1, eigenes Schiff sein Kontrollfaktor) × Verpackung eigener Ware (pack) × Packen im
 * Minispiel (packingFactor aus packing, ohne Wert 1) × (1 + Zoll-Heat/50).
 */
export function containerRisk(
  state: GameState,
  producerId: string,
  size: ContainerSize['id'],
  portId: string,
  cover: Cover['id'] = 'none',
  vesselId: number | null = null,
  pack = 1,
  packing?: number,
): number {
  const producer = SOURCE_BY_ID.get(producerId);
  const container = SIZE_BY_ID.get(size);
  const port = harborPort(portId);
  if (!producer || !container || !port) return 0;
  const heat = customsHeat(state, portId);
  const ship = vesselId === null ? 1 : vehicleSpec(state, vesselId).checkFactor;
  const tarn = COVER_BY_ID.get(cover)?.riskFactor ?? 1;
  return Math.min(
    0.9,
    producer.risk *
      container.riskFactor *
      port.customsFactor *
      tarn *
      ship *
      pack *
      packingFactor(packing) *
      (1 + heat / 50),
  );
}

/** Deckladung nach ID. */
export function getCover(id: Cover['id']): Cover | undefined {
  return COVER_BY_ID.get(id);
}

/** Seeweg vom Produzenten in den Hafen (roads, Auftrag 41); null bei Ware per Lkw oder ohne Weg. */
export function producerSeaRoute(producerId: string, portId: string): { path: LngLat[]; km: number } | null {
  const producer = SOURCE_BY_ID.get(producerId);
  if (!producer?.sea || producer.byRoad) return null;
  return seaRoute(producer.sea, portId);
}

/** Laufzeit eines Containers auf dem Linienschiff in Minuten: Verladen plus Seeweg mit CHARTER_KM_PER_DAY. */
export function shippingMinutes(producerId: string, portId: string): number {
  const producer = SOURCE_BY_ID.get(producerId);
  if (!producer || !harborPort(portId)) return MINUTES_PER_DAY;
  const sea = producerSeaRoute(producerId, portId);
  const days = producer.days + (sea ? sea.km / CHARTER_KM_PER_DAY : 0);
  return Math.max(MINUTES_PER_DAY, Math.round(days * MINUTES_PER_DAY));
}

/**
 * Fahrt eines eigenen Schiffs (Auftrag 41): hin zum Produzenten, Verladen (Producer.days), zurück in den Hafen.
 * Minuten pro Strecke und zusammen, Betriebskosten; null ohne Seeweg (Ware per Lkw) oder ohne Schiff.
 */
export function voyagePlan(
  state: GameState,
  vesselId: number,
  producerId: string,
  portId: string,
): { legMinutes: number; loadMinutes: number; minutes: number; km: number; cost: number } | null {
  const spec = vehicleSpec(state, vesselId).ship;
  const producer = SOURCE_BY_ID.get(producerId);
  const sea = producerSeaRoute(producerId, portId);
  if (!spec || !producer || !sea) return null;
  const legMinutes = Math.round((sea.km / spec.kmPerDay) * MINUTES_PER_DAY);
  const loadMinutes = Math.round(producer.days * MINUTES_PER_DAY);
  const minutes = 2 * legMinutes + loadMinutes;
  const cost = Math.round(((minutes / MINUTES_PER_DAY) * spec.costPerDay) / 10) * 10;
  return { legMinutes, loadMinutes, minutes, km: sea.km, cost };
}

export type VoyagePhase = 'out' | 'loading' | 'back';

export interface ShipVoyage {
  producerId: string;
  portId: string;
  departedAt: number;
  arrivesAt: number;
  phase: VoyagePhase;
  /** Fortschritt auf der aktuellen Strecke (0–1). */
  progress: number;
  grams: number;
  containers: number;
}

/** Wo ein eigenes Schiff gerade ist (für Tracker und Karte); null, wenn es im Hafen liegt. */
export function shipVoyage(state: GameState, vesselId: number): ShipVoyage | null {
  const list = getShipments(state).filter((x) => x.vesselId === vesselId && x.status === 'sea');
  if (list.length === 0) return null;
  const first = list[0];
  const plan = voyagePlan(state, vesselId, first.producerId, first.portId);
  const total = Math.max(1, first.arrivesAt - first.orderedAt);
  const leg = Math.max(1, plan ? Math.min(plan.legMinutes, total / 2) : total / 2);
  const elapsed = Math.max(0, state.time - first.orderedAt);
  const phase: VoyagePhase = elapsed < leg ? 'out' : elapsed < total - leg ? 'loading' : 'back';
  const progress =
    phase === 'out' ? elapsed / leg : phase === 'back' ? Math.min(1, (elapsed - (total - leg)) / leg) : 0;
  return {
    producerId: first.producerId,
    portId: first.portId,
    departedAt: first.orderedAt,
    arrivesAt: first.arrivesAt,
    phase,
    progress,
    grams: list.reduce((sum, x) => sum + x.amount, 0),
    containers: list.length,
  };
}

/** Eigene Schiffe (nicht beschlagnahmt) mit ihrer Fahrt, null = liegt im Hafen. */
export function ownShips(state: GameState): { id: number; name: string; voyage: ShipVoyage | null }[] {
  return getShips(state)
    .filter((v) => vehicleStatus(v) !== 'seized')
    .map((v) => ({ id: v.id, name: vehicleName(state, v.id), voyage: shipVoyage(state, v.id) }));
}

/** Platz im Lager eines Hafens in Gramm (Grundfläche plus Hallen, Auftrag 41). */
export function portCapacity(state: GameState, portId: string): number {
  const port = harborPort(portId);
  if (!port) return 0;
  return port.capacity + (tradeState(state)?.halls[portId] ?? 0) * port.hallCapacity;
}

/** Gramm, die im Lager eines Hafens liegen. */
export function portLoad(state: GameState, portId: string): number {
  return Object.values(portStock(state, portId)).reduce((sum, lot) => sum + lot.amount, 0);
}

/** Freier Platz im Lager eines Hafens (Gramm). */
export function portRoom(state: GameState, portId: string): number {
  return Math.max(0, portCapacity(state, portId) - portLoad(state, portId));
}

/** Gebaute Hallen in einem Hafen. */
export function portHalls(state: GameState, portId: string): number {
  return tradeState(state)?.halls[portId] ?? 0;
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

/**
 * Chance einer Zollkontrolle auf dem Weg zum Kunden (0–1): pro 100 km Autobahn, dazu die Grenze nach Europa
 * (Auftrag 41), mal Kontrollfaktor des eigenen Lkw (Spedition 1).
 */
export function deliveryCheckChance(
  state: GameState,
  customer: TradeCustomer,
  portId: string,
  vehicleId: number | null = null,
): number {
  const trip = deliveryEstimate(customer, portId);
  const factor = vehicleId === null ? 1 : vehicleSpec(state, vehicleId).checkFactor;
  const border = europeCityOf(customer)?.border.check ?? 0;
  const road = Math.min(AUTOBAHN_CHECK_MAX, (trip.km / 100) * AUTOBAHN_CHECK_PER_100KM);
  return Math.min(0.8, (road + border) * factor);
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
    voyages: 0,
    deliveredGrams: 0,
    ownDelivered: 0,
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
function addStock(ctx: Ctx, portId: string, productId: string, amount: number, quality: number, own = 0): void {
  const lots = stockAt(ctx, portId);
  const lot = lots[productId] ?? { amount: 0, quality };
  const total = lot.amount + amount;
  const next: StockLot = {
    amount: total,
    quality: total > 0 ? Math.round(((lot.amount * lot.quality + amount * quality) / total) * 1000) / 1000 : quality,
  };
  // Auftrag 42: wie viel davon aus eigener Produktion ist (nur, wenn überhaupt etwas Eigenes drin ist).
  const mine = (lot.own ?? 0) + own;
  if (mine > 0) next.own = Math.min(total, mine);
  lots[productId] = next;
}

/** Ware entnehmen (alles oder nichts). */
function takeStock(ctx: Ctx, portId: string, productId: string, amount: number): StockLot | null {
  const lots = stockAt(ctx, portId);
  const lot = lots[productId];
  if (!lot || lot.amount < amount) return null;
  // Eigene Ware geht anteilig mit (Auftrag 42).
  const own = lot.own ? Math.round((lot.own * amount) / lot.amount) : 0;
  lot.amount -= amount;
  if (lot.own) lot.own = Math.max(0, lot.own - own);
  if (lot.amount <= 0) delete lots[productId];
  return own > 0 ? { amount, quality: lot.quality, own } : { amount, quality: lot.quality };
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

/** Stadt in Europa eines Kunden (Auftrag 41), sonst undefined. */
export function europeCityOf(customer: Pick<TradeCustomer, 'europeId'>): EuropeCity | undefined {
  return customer.europeId ? EUROPE_CITIES.find((c) => c.id === customer.europeId) : undefined;
}

/** Wann sich eine Stadt in Europa meldet: Woche der Hafen-Phase und nötiger Ruf; null, wenn sie schon Kunde ist. */
export function europeStatus(state: GameState, city: EuropeCity): { joined: boolean; week: number; reliable: boolean } {
  const s = tradeState(state);
  const joined = getCustomers(state).some((c) => c.europeId === city.id);
  const start = s?.startedAt ?? state.time;
  return {
    joined,
    week: weekOf(start) + city.joinWeek,
    reliable: (s?.reliability ?? START_RELIABILITY) >= EUROPE_MIN_RELIABILITY,
  };
}

/** Städte in Europa, deren Woche gekommen ist, werden Kunden (wenn dein Ruf reicht); jede schreibt kurz. */
function joinEurope(ctx: Ctx): void {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return;
  for (const city of EUROPE_CITIES) {
    const status = europeStatus(ctx.state, city);
    if (status.joined || weekOf(ctx.now) < status.week || !status.reliable) continue;
    const customer: TradeCustomer = {
      id: `europe:${city.id}`,
      kind: 'europe',
      name: city.name,
      lng: city.at.lng,
      lat: city.at.lat,
      indexCity: city.indexCity,
      weekly: scaled(city.weekly),
      europeId: city.id,
      priceFactor: city.priceFactor,
      trust: CUSTOMER_KINDS.europe.startTrust,
      share: 0,
      topRival: null,
      delivered: 0,
      late: 0,
      failed: 0,
    };
    s.customers.push(customer);
    messages.send(ctx, {
      contact: city.contact,
      text: `Man hört, in Rotterdam liefert jemand pünktlich. ${city.name} braucht jede Woche Ware. Montags kommt meine Bestellung.`,
      silent: true,
    });
    journal.add(ctx, `${city.name} (${city.country}) kauft ab jetzt bei dir.`, 'good');
    ctx.emit('trade.customerJoined', { customerId: customer.id });
  }
}

/**
 * Bestellungen einer Woche: pro Kunde und Ware dein Anteil am Bedarf (Abnahmevertrag mindestens CONTRACT_SHARE). first:
 * die Runde bei der Ankunft (nur Ware, die in der Halle liegt, mehr Zeit zum Antworten; Auftrag 43).
 */
export function placeOrders(ctx: Ctx, first = false): number {
  const s = ctx.state.modules.trade;
  const week = weekOf(ctx.now);
  s.week = week;
  if (s.reliability < START_RELIABILITY) {
    s.reliability =
      Math.round((s.reliability + (START_RELIABILITY - s.reliability) * RELIABILITY_RECOVERY) * 1000) / 1000;
  }
  joinEurope(ctx);
  const contract = s.contractUntil !== null && ctx.now < s.contractUntil;
  // Ware, die in deinen Häfen liegt (für die erste Runde).
  const inStock = new Set(
    s.ports.flatMap((portId) =>
      Object.keys(s.stock[portId] ?? {}).filter((id) => (s.stock[portId]?.[id]?.amount ?? 0) > 0),
    ),
  );
  let placed = 0;
  let waiting = 0;
  for (const customer of s.customers) {
    if (customerBlocked(ctx.state, customer)) {
      customer.share = 0;
      continue;
    }
    // Wartet der Kunde noch auf deine Antwort (z.B. aus der ersten Runde bei der Ankunft), bestellt er nicht doppelt
    // (Auftrag 43: sonst lagen am ersten Montag 32 offene Bestellungen da, jeder Kunde zweimal).
    if (s.orders.some((o) => o.customerId === customer.id && o.status === 'open')) {
      waiting++;
      continue;
    }
    const { share, topRival } = shareFor(ctx.state, customer, week);
    const guaranteed = contract && customer.kind === 'org';
    const mine = guaranteed ? Math.max(share, CONTRACT_SHARE) : share;
    customer.share = Math.round(mine * 1000) / 1000;
    // Unter dem Abnahmevertrag gibt es keine Konkurrenz (Auftrag 43, H14).
    customer.topRival = guaranteed ? null : topRival;
    const items: OrderItem[] = [];
    for (const [productId, weekly] of Object.entries(customer.weekly)) {
      // Kleine Schwankung von Woche zu Woche (±15 %).
      const demand = Math.round(weekly * (0.85 + ctx.random() * 0.3));
      if (first && !inStock.has(productId)) continue;
      s.stats.demand += demand;
      const amount = Math.round((demand * mine) / ORDER_ROUND_GRAMS) * ORDER_ROUND_GRAMS;
      if (amount < MIN_ITEM_GRAMS) continue;
      // Dein Preis (Auftrag 43) wirkt auf beides: Er verschiebt den Anteil (shareFor) und den Preis pro Gramm. Der
      // Abnahmevertrag hat einen festen Preis.
      const offer = guaranteed
        ? fairPrice(ctx.state, productId, customer.indexCity)
        : round2(customerOffer(ctx.state, customer, productId) * s.priceLevel);
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
      answerBy: ctx.now + (first ? FIRST_ORDER_ANSWER_MINUTES : ORDER_ANSWER_MINUTES),
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
    const goods = [...inStock].map(productName).join(' und ');
    messages.send(ctx, {
      contact: dispatcherContact(),
      text: first
        ? `Willkommen. Ich bin Fenna, ich mach hier die Disposition. Für den Anfang hab ich nur ${goods} zugesagt, das liegt in der Halle: ${placed} Bestellungen, du hast drei Tage zum Antworten.`
        : `Neue Woche, ${placed} Bestellungen. Annehmen bis morgen früh, sonst kauft die Konkurrenz.` +
          (waiting > 0 ? ` ${waiting} warten noch auf deine Antwort von vorher.` : ''),
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
/**
 * Was ein Gegenangebot bringt (Auftrag 43, auch für die Oberfläche): Liegt die Konkurrenz zu diesem Preis vorn, kauft
 * der Kunde dort (rival), sonst nimmt er an (rival null). Der Preis ist dein Preis mal dem Faktor auf ihr Angebot.
 */
export function counterOutcome(
  state: GameState,
  order: TradeOrder,
  factor: number,
): { rival: { name: string; score: number } | null } {
  const customer = getCustomer(state, order.customerId);
  if (!customer || order.guaranteed) return { rival: null };
  const level = tradeState(state)?.priceLevel ?? 1;
  const mine = playerScore(state, customer, round2(level * factor));
  const best = rivalScores(state, weekOf(state.time)).reduce<{ name: string; score: number } | null>(
    (top, r) => (!top || r.score > top.score ? r : top),
    null,
  );
  return { rival: best && best.score > mine ? best : null };
}

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
  const best = counterOutcome(ctx.state, order, factor).rival;
  if (best) {
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

/**
 * Reicht die Ware für die offenen Bestellungen? Pro Bestellung die Gramm, die fehlen: Bestand in allen eigenen Häfen plus
 * Container, die vor der Frist ankommen, minus was angenommene Bestellungen schon brauchen. Die offenen Bestellungen
 * zählen der Reihe nach (wer vorn steht, bekommt die Ware zuerst), so wie „Gedeckte annehmen“ sie annimmt.
 */
export function orderCoverage(state: GameState, atSea = true): Map<number, number> {
  const reserved = new Map<string, number>();
  for (const order of getOrders(state)) {
    if (order.status !== 'accepted' && order.status !== 'delivering') continue;
    for (const item of openItems(order))
      reserved.set(item.productId, (reserved.get(item.productId) ?? 0) + item.amount);
  }
  // atSea false (Auftrag 43, H1): nur was schon im Hafen liegt, für „Ware da“ statt „kommt rechtzeitig“.
  const supply = (productId: string, by: number) =>
    totalStock(state, productId) +
    (atSea
      ? getShipments(state)
          .filter((x) => x.productId === productId && x.arrivesAt <= by)
          .reduce((sum, x) => sum + x.amount, 0)
      : 0) -
    (reserved.get(productId) ?? 0);
  const result = new Map<number, number>();
  // Verträge zuerst (Auftrag 43): Die alten Organisationen haben einen Abnahmevertrag, die Ware geht an sie vor den Gangs.
  const ordered = [...openOrders(state)].sort((a, b) => Number(b.guaranteed) - Number(a.guaranteed));
  for (const order of ordered) {
    let missing = 0;
    for (const item of order.items) {
      const free = Math.max(0, supply(item.productId, order.dueAt));
      missing += Math.max(0, item.amount - free);
    }
    result.set(order.id, missing);
    if (missing === 0) {
      for (const item of order.items) reserved.set(item.productId, (reserved.get(item.productId) ?? 0) + item.amount);
    }
  }
  return result;
}

/** Wie weit eine angenommene Bestellung lieferbar ist (deliveryReadiness). */
export interface DeliveryReadiness {
  /** Hafen, aus dem geliefert würde (null: nichts davon liegt ganz da). */
  portId: string | null;
  /** Alle offenen Waren liegen in diesem Hafen. */
  full: boolean;
  /** Gramm, die noch fehlen. */
  missing: number;
}

/**
 * Lieferbereitschaft der angenommenen Bestellungen (Auftrag 43, H1): Der Bestand der Häfen wird der Reihe nach verteilt
 * (Verträge zuerst, dann nach Frist), so dass zwei Bestellungen nie dieselben Kilo zählen. Vorher stand an allen 14
 * „Ware da“, obwohl es nur für einen Teil reichte.
 */
export function deliveryReadiness(state: GameState): Map<number, DeliveryReadiness> {
  const left = new Map<string, Map<string, number>>();
  for (const portId of ownedPorts(state)) {
    left.set(portId, new Map(Object.entries(portStock(state, portId)).map(([id, lot]) => [id, lot.amount])));
  }
  const result = new Map<number, DeliveryReadiness>();
  const orders = [...pendingDeliveries(state)].sort(
    (a, b) => Number(b.guaranteed) - Number(a.guaranteed) || a.dueAt - b.dueAt || a.id - b.id,
  );
  for (const order of orders) {
    const items = openItems(order);
    let best: { portId: string; fits: OrderItem[]; grams: number } | null = null;
    for (const [portId, stock] of left) {
      const fits = items.filter((i) => (stock.get(i.productId) ?? 0) >= i.amount);
      const grams = fits.reduce((sum, i) => sum + i.amount, 0);
      // Ein Hafen, der alles hat, vor einem mit mehr Gramm von einem Teil.
      const full = fits.length === items.length;
      const bestFull = best !== null && best.fits.length === items.length;
      const better = best === null || (full && !bestFull) || (full === bestFull && grams > best.grams);
      if (grams > 0 && better) best = { portId, fits, grams };
    }
    const missing = items.reduce((sum, i) => sum + i.amount, 0) - (best?.grams ?? 0);
    if (best) {
      const stock = left.get(best.portId);
      for (const i of best.fits) stock?.set(i.productId, (stock.get(i.productId) ?? 0) - i.amount);
    }
    result.set(order.id, { portId: best?.portId ?? null, full: !!best && missing === 0, missing });
  }
  return result;
}

/**
 * Kauft der Kunde nicht bei dir (Auftrag 43)? Eine Gang, die sich an zu viel Ärger aus der Stadt-Phase erinnert
 * (memoryScore bis GANG_MEMORY_BLOCK), bestellt nichts; das verblasst mit der Zeit.
 */
export function customerBlocked(state: GameState, customer: TradeCustomer): boolean {
  return customer.kind === 'gang' && !!customer.gangId && memoryScore(state, customer.gangId) <= GANG_MEMORY_BLOCK;
}

/** Alle offenen Bestellungen annehmen (nur Verträge oder nur die, für die die Ware reicht: orderCoverage). */
export function acceptAll(ctx: Ctx, guaranteedOnly = false, coveredOnly = false): CommandResult {
  const coverage = coveredOnly ? orderCoverage(ctx.state) : null;
  const list = openOrders(ctx.state).filter(
    (o) => (!guaranteedOnly || o.guaranteed) && (coverage === null || coverage.get(o.id) === 0),
  );
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

/** Was von den offenen Waren einer Bestellung in diesem Hafen liegt (ganze Posten). */
export function shippableItems(state: GameState, portId: string, order: TradeOrder): OrderItem[] {
  const lots = portStock(state, portId);
  return openItems(order).filter((i) => (lots[i.productId]?.amount ?? 0) >= i.amount);
}

/**
 * Hafen für eine Lieferung: der mit den meisten Gramm der offenen Waren (Teillieferung geht), bei Gleichstand der
 * nächste. null, wenn nirgends etwas davon ganz liegt.
 */
export function portFor(state: GameState, order: TradeOrder): string | null {
  const customer = getCustomer(state, order.customerId);
  if (!customer) return null;
  const grams = (id: string) => shippableItems(state, id, order).reduce((sum, i) => sum + i.amount, 0);
  const ports = ownedPorts(state).filter((id) => grams(id) > 0);
  if (ports.length === 0) return null;
  return ports.sort(
    (a, b) =>
      grams(b) - grams(a) || deliveryEstimate(customer, a).km - deliveryEstimate(customer, b).km || a.localeCompare(b),
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
  const ship = from && s.ports.includes(from) ? shippableItems(ctx.state, from, order) : [];
  if (!from || ship.length === 0) {
    return { ok: false, reason: `Nichts davon liegt im Hafen: ${orderItemsText(openItems(order))}.` };
  }
  const grams = ship.reduce((sum, i) => sum + i.amount, 0);
  const trip = deliveryEstimate(customer, from);
  let vehicle: number | null = null;
  if (vehicleId !== undefined && vehicleId !== null) {
    const v = getVehicle(ctx.state, vehicleId);
    if (v && isShip(v)) return { ok: false, reason: 'Schiffe fahren nicht auf der Straße.' };
    if (!v || v.cityId !== HARBOR_CITY) return { ok: false, reason: 'Dieser Lkw steht nicht in Rotterdam.' };
    if (vehicleSpec(ctx.state, vehicleId).capacity < grams)
      return { ok: false, reason: 'Das passt nicht in den Wagen.' };
    vehicle = vehicleId;
  }
  const freight = vehicle === null ? freightCost(grams, trip.km) : 0;
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
  for (const item of ship) {
    const lot = takeStock(ctx, from, item.productId, item.amount);
    const delivered: DeliveryItem = {
      productId: item.productId,
      amount: item.amount,
      quality: lot?.quality ?? START_QUALITY,
    };
    if (lot?.own) delivered.own = lot.own;
    items.push(delivered);
    item.state = 'shipped';
  }
  const checkChance = deliveryCheckChance(ctx.state, customer, from, vehicle);
  const checkAt = ctx.chance(checkChance) ? ctx.now + Math.round(trip.minutes * (0.2 + ctx.random() * 0.6)) : null;
  s.deliveries.push({
    id,
    orderId,
    customerId: customer.id,
    items,
    amount: grams,
    portId: from,
    departedAt: ctx.now,
    arrivesAt: ctx.now + trip.minutes,
    vehicleId: vehicle,
    checkAt,
  });
  // Ist alles unterwegs, wartet die Bestellung nur noch auf die Ankunft; sonst bleibt der Rest offen.
  if (openItems(order).length === 0) order.status = 'delivering';
  journal.add(ctx, `${orderItemsText(items)} unterwegs nach ${customer.name} (${clock.formatDuration(trip.minutes)}).`);
  return { ok: true, data: { deliveryId: id, arrivesAt: ctx.now + trip.minutes } };
}

type Loaded = { productId: string; size: ContainerSize; cover: Cover; grams: number };

/** Prüft eine Bestellung beim Produzenten; gibt die Container einzeln zurück oder einen Grund. */
function checkLoad(
  ctx: Ctx,
  producerId: string,
  portId: string,
  load: readonly ContainerLoad[],
): { producer: Producer; containers: Loaded[] } | string {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return 'Erst nach dem Verkauf des Geschäfts.';
  const producer = SOURCE_BY_ID.get(producerId);
  if (!producer) return 'Diesen Produzenten gibt es nicht.';
  if (!s.ports.includes(portId)) return 'In diesem Hafen hast du keinen Liegeplatz.';
  // Auftrag 42: Aus dem eigenen Ausfuhrhafen fährt nur, was im Ausfuhrlager liegt (der letzte Container darf kleiner sein).
  const origin = ORIGIN_BY_ID.get(producerId);
  const left = new Map<string, number>();
  if (origin) for (const [id, lot] of Object.entries(s.origins[origin.id] ?? {})) left.set(id, lot.amount);
  const containers: Loaded[] = [];
  for (const item of load) {
    if (producer.products[item.productId] === undefined) {
      return `${producer.name} hat kein ${productName(item.productId)}.`;
    }
    const size = SIZE_BY_ID.get(item.size);
    if (!size) return 'Diese Größe gibt es nicht.';
    const cover = COVER_BY_ID.get(item.cover ?? 'none');
    if (!cover) return 'Diese Deckladung gibt es nicht.';
    const count = item.count ?? 1;
    if (!Number.isInteger(count) || count < 1 || count > 20) return 'Wie viele Container?';
    for (let i = 0; i < count; i++) {
      let grams = size.grams;
      if (origin) {
        grams = Math.min(size.grams, left.get(item.productId) ?? 0);
        if (grams <= 0) return `In ${origin.from} liegt nicht genug ${productName(item.productId)}.`;
        left.set(item.productId, (left.get(item.productId) ?? 0) - grams);
      }
      containers.push({ productId: item.productId, size, cover, grams });
    }
  }
  if (containers.length === 0) return 'Nichts zu laden.';
  return { producer, containers };
}

/** Was eine Ladung kostet (Ware, Fracht auf der Linie, Deckladung). */
export function loadCost(producerId: string, load: readonly ContainerLoad[], own: boolean): number {
  return load.reduce((sum, c) => {
    const cost = containerCost(producerId, c.productId, c.size, c.cover ?? 'none', own);
    return sum + (cost.goods + cost.freight + cost.cover) * (c.count ?? 1);
  }, 0);
}

/** Container anlegen und bezahlen (Ware und Deckladung; Fracht nur auf dem Linienschiff). */
function shipContainers(
  ctx: Ctx,
  producer: Producer,
  portId: string,
  containers: readonly Loaded[],
  vesselId: number | null,
  arrivesAt: number,
): TradeShipment[] {
  const s = ctx.state.modules.trade;
  const port = harborPort(portId)?.name ?? portId;
  const list: TradeShipment[] = [];
  const origin = ORIGIN_BY_ID.get(producer.id);
  for (const c of containers) {
    const cost = containerCost(producer.id, c.productId, c.size.id, c.cover.id, vesselId !== null);
    if (cost.goods > 0) {
      wallet.pay(ctx, cost.goods, 'dirty', `${c.size.label} ${productName(c.productId)} bei ${producer.name}`, {
        category: 'trade.purchase',
        cityId: HARBOR_CITY,
      });
    }
    if (cost.freight > 0) {
      wallet.pay(ctx, cost.freight, 'dirty', `Fracht ${producer.from} – ${port}`, {
        category: 'trade.freight',
        cityId: HARBOR_CITY,
      });
    }
    if (cost.cover > 0) {
      wallet.pay(ctx, cost.cover, 'dirty', `Deckladung ${c.cover.label}`, {
        category: 'trade.freight',
        cityId: HARBOR_CITY,
      });
    }
    // Eigene Ware (Auftrag 42) kommt mit Qualität und Verpackung aus dem Ausfuhrlager, ohne Würfel.
    const lot = origin ? takeOrigin(ctx, origin.id, c.productId, c.grams) : null;
    const quality = lot ? lot.quality : Math.max(0.2, Math.min(1, producer.quality + (ctx.random() * 2 - 1) * 0.05));
    const shipment: TradeShipment = {
      id: ctx.nextId(),
      producerId: producer.id,
      productId: c.productId,
      amount: c.grams,
      quality: Math.round(quality * 1000) / 1000,
      size: c.size.id,
      portId,
      orderedAt: ctx.now,
      arrivesAt,
      status: 'sea',
      cover: c.cover.id,
      vesselId,
    };
    if (lot) {
      shipment.own = true;
      shipment.pack = lot.pack;
    }
    s.shipments.push(shipment);
    s.stats.containers += 1;
    list.push(shipment);
    ctx.emit('trade.containerOrdered', {
      shipmentId: shipment.id,
      producerId: producer.id,
      amount: c.grams,
      portId,
      cost: cost.goods + cost.freight + cost.cover,
    });
  }
  return list;
}

/** Container auf dem Linienschiff bestellen (Charter pro Container). */
export function buyContainer(
  ctx: Ctx,
  producerId: string,
  productId: string,
  size: ContainerSize['id'],
  portId: string = HARBOR_CITY,
  cover: Cover['id'] = 'none',
  count = 1,
): CommandResult {
  const load = [{ productId, size, cover, count }];
  const checked = checkLoad(ctx, producerId, portId, load);
  if (typeof checked === 'string') return { ok: false, reason: checked };
  const total = loadCost(producerId, load, false);
  if (!wallet.canAfford(ctx.state, total, 'dirty')) return { ok: false, reason: `Das kostet ${formatEuro(total)}.` };
  const arrivesAt = ctx.now + shippingMinutes(producerId, portId);
  const list = shipContainers(ctx, checked.producer, portId, checked.containers, null, arrivesAt);
  // Rückmeldung (Auftrag 43, I11): was unterwegs ist und wann es ankommt.
  const grams = list.reduce((sum, x) => sum + x.amount, 0);
  const own = ORIGIN_BY_ID.has(producerId);
  journal.add(
    ctx,
    `${own ? 'Verschifft' : `Bei ${checked.producer.name} bestellt`}: ${list.length === 1 ? 'ein Container' : `${list.length} Container`} ${productName(productId)} (${formatNumber(Math.round(grams / 100) / 10, 1)} kg), Ankunft in ${harborPort(portId)?.name ?? portId} ${clock.weekdayName(arrivesAt, true)} ${clock.formatTime(arrivesAt)}.`,
  );
  return { ok: true, data: { shipmentId: list[0].id, shipmentIds: list.map((x) => x.id), arrivesAt } };
}

/** Eigenes Schiff zum Produzenten schicken (Auftrag 41): Ware, Deckladung und Betrieb für die ganze Fahrt vorab. */
export function sail(
  ctx: Ctx,
  vesselId: number,
  producerId: string,
  portId: string,
  load: readonly ContainerLoad[],
): CommandResult {
  const vessel = getVehicle(ctx.state, vesselId);
  if (!vessel || !isShip(vessel)) return { ok: false, reason: 'Dieses Schiff gibt es nicht.' };
  const name = vehicleName(ctx.state, vesselId);
  if (vehicleStatus(vessel) !== 'free') return { ok: false, reason: `${name} ist nicht im Hafen.` };
  const checked = checkLoad(ctx, producerId, portId, load);
  if (typeof checked === 'string') return { ok: false, reason: checked };
  const plan = voyagePlan(ctx.state, vesselId, producerId, portId);
  if (!plan) return { ok: false, reason: `${checked.producer.name} liefert nicht per Schiff.` };
  const spec = vehicleSpec(ctx.state, vesselId);
  const grams = checked.containers.reduce((sum, c) => sum + c.grams, 0);
  if (grams > spec.capacity) {
    return {
      ok: false,
      reason: `${spec.name} fasst ${Math.round(spec.capacity / 1000)} kg, das sind ${Math.round(grams / 1000)} kg.`,
    };
  }
  const total = loadCost(producerId, load, true) + plan.cost;
  if (!wallet.canAfford(ctx.state, total, 'dirty')) {
    return { ok: false, reason: `Die Fahrt kostet ${formatEuro(total)}.` };
  }
  wallet.pay(ctx, plan.cost, 'dirty', `${name}: Crew und Diesel bis ${checked.producer.from}`, {
    category: 'trade.freight',
    cityId: HARBOR_CITY,
  });
  const list = shipContainers(ctx, checked.producer, portId, checked.containers, vesselId, ctx.now + plan.minutes);
  useVehicle(ctx, vesselId, list[0].id);
  ctx.state.modules.trade.stats.voyages += 1;
  journal.add(
    ctx,
    `${name} legt ab nach ${checked.producer.from}: ${list.length} Container, zurück in ${harborPort(portId)?.name ?? portId} in ${clock.formatDuration(plan.minutes)}`,
  );
  ctx.emit('trade.shipSailed', { vesselId, producerId, portId, containers: list.length, cost: total });
  return { ok: true, data: { shipmentIds: list.map((x) => x.id), arrivesAt: ctx.now + plan.minutes } };
}

/** Ist das letzte Stück eines eigenen Schiffs da, liegt es wieder frei im Hafen. */
function maybeReleaseShip(ctx: Ctx, vesselId: number | null, portId: string): void {
  if (vesselId === null) return;
  if (ctx.state.modules.trade.shipments.some((x) => x.vesselId === vesselId && x.status === 'sea')) return;
  const vessel = getVehicle(ctx.state, vesselId);
  if (!vessel || vehicleStatus(vessel) !== 'busy') return;
  releaseVehicle(ctx, vesselId);
  ctx.emit('trade.shipReturned', { vesselId, portId });
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

/** Eine Halle mehr im Hafen (sauberes Geld). */
export function buildHall(ctx: Ctx, portId: string): CommandResult {
  const s = ctx.state.modules.trade;
  const port = harborPort(portId);
  if (!port || !s.ports.includes(portId)) return { ok: false, reason: 'In diesem Hafen hast du keinen Liegeplatz.' };
  const halls = s.halls[portId] ?? 0;
  if (halls >= MAX_HALLS) return { ok: false, reason: `Mehr als ${MAX_HALLS} Hallen gibt es in ${port.name} nicht.` };
  if (
    !wallet.pay(ctx, port.hallCost, 'clean', `Halle in ${port.name}`, { category: 'expansion', cityId: HARBOR_CITY })
  ) {
    return { ok: false, reason: `Die Halle kostet ${formatEuro(port.hallCost)} sauberes Geld.` };
  }
  s.halls[portId] = halls + 1;
  journal.add(ctx, `Neue Halle in ${port.name}: ${Math.round(port.hallCapacity / 1000)} kg mehr Platz.`, 'good');
  ctx.emit('trade.hallBuilt', { portId, halls: halls + 1, cost: port.hallCost });
  // Was am Kai wartet, kommt gleich herein.
  for (const shipment of [...s.shipments])
    if (shipment.status === 'quay' && shipment.portId === portId) unload(ctx, shipment);
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
  const risk = containerRisk(
    ctx.state,
    shipment.producerId,
    shipment.size,
    shipment.portId,
    shipment.cover,
    shipment.vesselId,
    shipment.pack ?? 1,
    shipment.packing,
  );
  customsArrival(ctx, shipment.portId, shipment.amount / 1000);
  // Das Schiff ist im Hafen: Kontrolliert wird am Kai.
  shipment.status = 'customs';
  maybeReleaseShip(ctx, shipment.vesselId, shipment.portId);
  if (!ctx.chance(risk)) {
    landContainer(ctx, shipment, false);
    return;
  }
  const port = harborPort(shipment.portId);
  const name = port?.name ?? shipment.portId;
  // Bist du nicht in dem Hafen, regeln es die Hafenarbeiter dort (Auftrag 43). Früher startete die Konfrontation ohne
  // jemanden am Kai und endete jedes Mal mit dem Verlust des Containers.
  if (presentCity(ctx.state) !== shipment.portId) {
    if (ctx.chance(UNATTENDED_CUSTOMS_PASS)) {
      journal.add(ctx, `Zoll in ${name}: Die Hafenarbeiter haben den Container durchgeredet.`, 'good');
      landContainer(ctx, shipment, true);
    } else {
      onContainerCheck(ctx, `container:${shipment.id}`, 'failure');
    }
    return;
  }
  const { encounterId } = startEncounter(ctx, {
    kind: 'customsCheck',
    setting: 'port',
    place: `in ${name}`,
    stakes: { goods: shipment.amount },
    skipEffects: true,
    opponent: { ...CUSTOMS_OPPONENT },
    lossCategory: 'loss.customs',
    origin: { module: 'trade', ref: `container:${shipment.id}` },
    // Du bist im Hafen und stehst selbst am Kai: Papiere, Ablenken, Bestechen oder Aufgeben.
    playerPresent: true,
  });
  shipment.encounterId = encounterId;
  journal.add(ctx, `Zoll in ${name}: Sie wollen den Container sehen.`, 'bad');
}

/** Der Zoll ist durch (oder hat nicht geschaut): ab ins Lager, soweit Platz ist. */
function landContainer(ctx: Ctx, shipment: TradeShipment, checked: boolean): void {
  ctx.emit('trade.containerArrived', {
    shipmentId: shipment.id,
    portId: shipment.portId,
    productId: shipment.productId,
    amount: shipment.amount,
    stored: Math.min(shipment.amount, portRoom(ctx.state, shipment.portId)),
    checked,
    own: shipment.own === true,
  });
  unload(ctx, shipment, true);
}

/**
 * Entladen, soweit das Lager Platz hat (Auftrag 41, wie storeFitting in goods): Der Rest wartet an Bord am Kai und
 * kommt herein, sobald Platz ist. Ist alles drin, wird das Liegegeld für die Wartezeit fällig.
 */
function unload(ctx: Ctx, shipment: TradeShipment, arriving = false): void {
  const s = ctx.state.modules.trade;
  const name = harborPort(shipment.portId)?.name ?? shipment.portId;
  const room = portRoom(ctx.state, shipment.portId);
  const amount = Math.min(shipment.amount, room);
  if (amount > 0)
    addStock(ctx, shipment.portId, shipment.productId, amount, shipment.quality, shipment.own ? amount : 0);
  if (amount < shipment.amount) {
    shipment.amount -= amount;
    if (shipment.status !== 'quay') {
      shipment.status = 'quay';
      shipment.quaySince = ctx.now;
      journal.add(
        ctx,
        `Lager in ${name} voll: ${Math.round(shipment.amount / 1000)} kg ${productName(shipment.productId)} warten am Kai (Liegegeld ${formatEuro(QUAY_FEE_PER_DAY)} am Tag).`,
        'bad',
      );
      ctx.emit('trade.containerWaiting', {
        shipmentId: shipment.id,
        portId: shipment.portId,
        amount: shipment.amount,
        arriving,
      });
    }
    return;
  }
  s.shipments = s.shipments.filter((x) => x.id !== shipment.id);
  if (shipment.quaySince !== undefined) {
    const days = Math.max(1, Math.ceil((ctx.now - shipment.quaySince) / MINUTES_PER_DAY));
    // Liegegeld ist eine Rechnung des Hafens (legal): sauberes Geld, so viel da ist.
    const fee = Math.min(days * QUAY_FEE_PER_DAY, ctx.state.wallet.clean);
    if (fee > 0) {
      wallet.pay(ctx, fee, 'clean', `Liegegeld in ${name}`, { category: 'trade.freight', cityId: HARBOR_CITY });
    }
  }
  journal.add(
    ctx,
    `${Math.round(amount / 1000)} kg ${productName(shipment.productId)} in ${name} eingelagert.`,
    'good',
  );
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

/** Waren einer Lieferung in der Bestellung als angekommen (bzw. verloren) markieren. */
function markItems(order: TradeOrder, delivery: TradeDelivery, to: OrderItem['state']): void {
  for (const d of delivery.items) {
    const item = order.items.find((i) => i.productId === d.productId && i.state === 'shipped');
    if (item) item.state = to;
  }
}

/** Ist nichts mehr offen oder unterwegs, ist die Bestellung erledigt (geliefert, wenn etwas ankam). */
function closeIfDone(order: TradeOrder): void {
  if (order.items.some((i) => i.state === undefined || i.state === 'shipped')) return;
  order.status = order.items.some((i) => i.state === 'delivered') ? 'delivered' : 'failed';
}

/** Lieferung angekommen: Zahlung, Vertrauen, Ruf. Bei Gangs kann der Deal kippen. */
function deliveryArrives(ctx: Ctx, delivery: TradeDelivery): void {
  const s = ctx.state.modules.trade;
  s.deliveries = s.deliveries.filter((d) => d.id !== delivery.id);
  if (delivery.vehicleId !== null) releaseVehicle(ctx, delivery.vehicleId);
  const order = s.orders.find((o) => o.id === delivery.orderId);
  const customer = s.customers.find((c) => c.id === delivery.customerId);
  if (!order || !customer) return;
  if (order.status === 'failed') {
    // Der Deal ist schon gekippt: Die Ladung kommt zurück in den Hafen, an der Bestellung ändert sich nichts.
    for (const d of delivery.items) addStock(ctx, delivery.portId, d.productId, d.amount, d.quality, d.own ?? 0);
    journal.add(
      ctx,
      `${customer.name} nimmt nichts mehr an. ${orderItemsText(delivery.items)} sind zurück im Hafen.`,
      'info',
    );
    return;
  }
  const late = ctx.now > order.dueAt;
  if (customer.kind === 'gang' && ctx.chance(GANG_TIP_CHANCE * (1 - customer.trust / 100))) {
    // Der Deal kippt: Die Gang nimmt die Ware und zahlt nicht.
    markItems(order, delivery, 'missed');
    for (const item of order.items) if (item.state === undefined) item.state = 'missed';
    order.status = 'failed';
    s.stats.tipped += 1;
    addTrust(customer, -10);
    journal.add(ctx, `${customer.name} hat die Ware genommen und nicht gezahlt. Der Deal ist gekippt.`, 'bad');
    ctx.emit('trade.dealTipped', { orderId: order.id, customerId: customer.id, amount: delivery.amount });
    return;
  }
  const factor = (order.factor ?? 1) * (late ? LATE_PRICE_FACTOR : 1);
  const revenue = Math.round(
    delivery.items.reduce((sum, d) => {
      const item = order.items.find((i) => i.productId === d.productId);
      return sum + d.amount * (item?.offer ?? 0);
    }, 0) * factor,
  );
  wallet.earn(ctx, revenue, 'dirty', `Lieferung an ${customer.name}`, { category: 'sales.trade', cityId: HARBOR_CITY });
  markItems(order, delivery, 'delivered');
  order.revenue = (order.revenue ?? 0) + revenue;
  closeIfDone(order);
  customer.delivered += 1;
  s.stats.revenue += revenue;
  s.stats.delivered += 1;
  const ownAmount = delivery.items.reduce((sum, i) => sum + (i.own ?? 0), 0);
  s.stats.deliveredGrams += delivery.amount;
  s.stats.ownDelivered += ownAmount;
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
    `${customer.name} hat ${orderItemsText(delivery.items)} bekommen: ${formatEuro(revenue)}${late ? ' (zu spät)' : ''}.`,
    late ? 'info' : 'good',
  );
  ctx.emit('trade.delivered', {
    orderId: order.id,
    customerId: customer.id,
    amount: delivery.amount,
    revenue,
    late,
    ownAmount,
    items: delivery.items.map((i) => ({ productId: i.productId, amount: i.amount, own: i.own ?? 0 })),
  });
}

function ema(old: number, value: number): number {
  return Math.round((old * (1 - REPUTATION_ALPHA) + value * REPUTATION_ALPHA) * 1000) / 1000;
}

/** Wo der Zoll steht: an der Grenze (Europa) oder auf der Autobahn. */
function checkPlace(state: GameState, delivery: TradeDelivery): string {
  const city = europeCityOf(getCustomer(state, delivery.customerId) ?? {});
  return city ? city.border.name : 'auf der Autobahn';
}

/** Zollkontrolle unterwegs: mit SEIZE_ON_CHECK ist die Ladung weg, die Bestellung wartet wieder auf Ware. */
function deliveryCheck(ctx: Ctx, delivery: TradeDelivery): void {
  delivery.checkAt = null;
  const s = ctx.state.modules.trade;
  const order = s.orders.find((o) => o.id === delivery.orderId);
  if (!ctx.chance(SEIZE_ON_CHECK)) {
    delivery.arrivesAt += 60;
    journal.add(
      ctx,
      `Zollkontrolle ${checkPlace(ctx.state, delivery)}: Der Lkw darf nach einer Stunde weiter.`,
      'info',
    );
    return;
  }
  s.deliveries = s.deliveries.filter((d) => d.id !== delivery.id);
  if (delivery.vehicleId !== null) {
    releaseVehicle(ctx, delivery.vehicleId);
    maybeSeize(ctx, delivery.vehicleId);
  }
  s.stats.deliveriesSeized += 1;
  if (order) {
    // Die Waren sind wieder offen: Wer noch Ware hat, kann bis zur Frist neu liefern. Ist die Bestellung schon
    // geplatzt (failOrder 'late'), kommt nichts mehr nach: Die Posten sind verloren, eine zweite Strafe gibt es nicht.
    const over = ctx.now >= order.dueAt + LATE_GRACE_DAYS * MINUTES_PER_DAY;
    for (const d of delivery.items) {
      const item = order.items.find((i) => i.productId === d.productId && i.state === 'shipped');
      if (item) item.state = over ? 'missed' : undefined;
    }
    if (over) closeIfDone(order);
    else if (order.status === 'delivering') order.status = 'accepted';
  }
  journal.add(
    ctx,
    `Zollkontrolle ${checkPlace(ctx.state, delivery)}: ${orderItemsText(delivery.items)} beschlagnahmt. Die Bestellung wartet noch.`,
    'bad',
  );
  ctx.emit('trade.deliverySeized', { deliveryId: delivery.id, orderId: delivery.orderId, amount: delivery.amount });
}

function failOrder(ctx: Ctx, order: TradeOrder, reason: 'expired' | 'late'): void {
  const s = ctx.state.modules.trade;
  const customer = s.customers.find((c) => c.id === order.customerId);
  if (reason === 'expired') order.status = 'expired';
  else {
    // Was nicht unterwegs ist, kommt nicht mehr; was schon ankam, bleibt bezahlt.
    for (const item of order.items) if (item.state === undefined) item.state = 'missed';
    closeIfDone(order);
    if (order.status === 'accepted') order.status = 'delivering';
  }
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

/** Verfallene Bestellungen gehen nicht still verloren (Auftrag 43): Fenna sagt, was die Konkurrenz bekommen hat. */
function reportExpired(ctx: Ctx, orders: readonly TradeOrder[]): void {
  const value = orders.reduce((sum, o) => sum + orderValue(o), 0);
  const names = [...new Set(orders.map((o) => getCustomer(ctx.state, o.customerId)?.name ?? o.customerId))];
  const who = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} und ${names.length - 3} weitere`;
  const count = orders.length === 1 ? 'Eine Bestellung' : `${orders.length} Bestellungen`;
  journal.add(ctx, `${count} ohne Antwort verfallen (${formatEuro(value)}): ${who}.`, 'bad');
  messages.send(ctx, {
    contact: dispatcherContact(),
    text: `${count} sind verfallen, keiner hat geantwortet: ${who}. Das waren ${formatEuro(value)}, die kauft jetzt die Konkurrenz. Wenn du willst, nehm ich die Bestellungen für dich an (Aufträge › Fenna übernimmt).`,
  });
}

/** Eine Woche vor dem Ende des Abnahmevertrags und am Ende selbst schreibt Fenna (Auftrag 43). */
function contractReminders(ctx: Ctx): void {
  const until = ctx.state.modules.trade.contractUntil;
  if (until === null) return;
  const crossed = (at: number) => ctx.now >= at && ctx.now - TICK_EVERY < at;
  if (crossed(until - CONTRACT_WARN_DAYS * MINUTES_PER_DAY)) {
    messages.send(ctx, {
      contact: dispatcherContact(),
      text: `Der Abnahmevertrag mit den alten Organisationen läuft in ${CONTRACT_WARN_DAYS} Tagen aus. Danach bestellen sie nur noch so viel bei dir, wie Preis und Vertrauen hergeben. Liefer bis dahin pünktlich.`,
    });
  } else if (crossed(until)) {
    journal.add(ctx, 'Der Abnahmevertrag ist ausgelaufen. Ab jetzt zählen Preis und Vertrauen.', 'info');
    messages.send(ctx, {
      contact: dispatcherContact(),
      text: 'Der Abnahmevertrag ist ausgelaufen. Ab der nächsten Runde kauft jeder, wo es am besten passt: Preis, Qualität, Pünktlichkeit.',
    });
  }
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.trade;
  if (s.startedAt === null) return;
  // Montag früh: neue Bestellungen (einmal pro Woche).
  const week = weekOf(ctx.now);
  if (week > s.week && clock.weekday(ctx.now) === 0 && ctx.now % MINUTES_PER_DAY >= ORDER_HOUR) placeOrders(ctx);
  const expired: TradeOrder[] = [];
  for (const order of s.orders) {
    if (order.status === 'open' && ctx.now >= order.answerBy) {
      failOrder(ctx, order, 'expired');
      expired.push(order);
    }
    // LATE_GRACE_DAYS nach der Frist ohne Lieferung: geplatzt (bis dahin geht es mit Abschlag).
    else if (order.status === 'accepted' && ctx.now >= order.dueAt + LATE_GRACE_DAYS * MINUTES_PER_DAY)
      failOrder(ctx, order, 'late');
  }
  if (expired.length > 0) reportExpired(ctx, expired);
  contractReminders(ctx);
  for (const shipment of [...s.shipments]) {
    if (shipment.status === 'sea' && ctx.now >= shipment.arrivesAt) containerArrives(ctx, shipment);
    // Am Kai: herein, sobald im Lager Platz ist (der älteste zuerst).
    else if (shipment.status === 'quay' && portRoom(ctx.state, shipment.portId) > 0) unload(ctx, shipment);
  }
  for (const delivery of [...s.deliveries]) {
    if (delivery.checkAt !== null && ctx.now >= delivery.checkAt) deliveryCheck(ctx, delivery);
    else if (ctx.now >= delivery.arrivesAt) deliveryArrives(ctx, delivery);
  }
  // Auftrag 43: Fenna arbeitet einmal pro Stunde ab, was du ihr überlassen hast.
  if (ctx.now % DISPATCH_EVERY === 0) dispatcherTick(ctx);
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
    halls: {},
    priceLevel: 1,
    reliability: START_RELIABILITY,
    quality: START_QUALITY,
    stats: emptyStats(),
    origins: {},
    defaultPlan: { ...NO_PLAN },
    plans: {},
    restock: [],
  };
}

export default defineModule({
  id: 'trade',
  version: 4,
  init: () => initialState(),
  migrations: {
    // Auftrag 41: Hallen pro Hafen; Container, die schon auf See sind, behalten ihre Ankunft.
    // Container von vorher: Linienschiff, ohne Deckladung.
    2: (
      old: Omit<TradeState, 'halls' | 'shipments' | 'stats'> & {
        shipments: Omit<TradeShipment, 'cover' | 'vesselId'>[];
        stats: Omit<TradeStats, 'voyages'>;
      },
    ) => ({
      ...old,
      halls: {},
      shipments: old.shipments.map((x) => ({ ...x, cover: 'none' as const, vesselId: null })),
      stats: { ...old.stats, voyages: 0 },
    }),
    // Auftrag 42: Ausfuhrlager der eigenen Fincas, Gramm insgesamt und aus eigener Produktion.
    3: (
      old: Omit<TradeState, 'origins' | 'stats'> & { stats: Omit<TradeStats, 'deliveredGrams' | 'ownDelivered'> },
    ) => ({
      ...old,
      origins: {},
      stats: { ...old.stats, deliveredGrams: 0, ownDelivered: 0 },
    }),
    // Auftrag 43: Lieferpläne und Nachkauf (Fenna). Alte Stände: Sie macht nichts, bis du es ihr sagst.
    4: (old: Omit<TradeState, 'defaultPlan' | 'plans' | 'restock'>) => ({
      ...old,
      defaultPlan: { ...NO_PLAN },
      plans: {},
      restock: [],
    }),
  },
  tickEvery: TICK_EVERY,
  tick,
  commands: {
    'trade.answer': (ctx, { orderId, choice, factor }) => answerOrder(ctx, orderId, choice, factor),
    'trade.acceptAll': (ctx, payload) =>
      acceptAll(ctx, payload?.guaranteedOnly === true, payload?.coveredOnly === true),
    'trade.deliver': (ctx, { orderId, portId, vehicleId }) => deliver(ctx, orderId, portId, vehicleId),
    // Auftrag 44, Teil 7: Bestellst du selbst, packst du den Container im Minispiel (Fenna ruft buyContainer direkt).
    'trade.buy': (ctx, { producerId, productId, size, portId, cover, count }, meta) =>
      packAfter(
        ctx,
        meta.actor,
        buyContainer(ctx, producerId, productId, size, portId, cover, count),
        producerId,
        null,
      ),
    'trade.sail': (ctx, { vesselId, producerId, portId, load }, meta) =>
      packAfter(
        ctx,
        meta.actor,
        sail(ctx, vesselId, producerId, portId ?? HARBOR_CITY, Array.isArray(load) ? load : []),
        producerId,
        vehicleName(ctx.state, vesselId),
      ),
    'trade.rentBerth': (ctx, { portId }) => rentBerth(ctx, portId),
    'trade.buildHall': (ctx, { portId }) => buildHall(ctx, portId),
    'trade.setPriceLevel': (ctx, { level }) => setPriceLevel(ctx, level),
    'trade.setPlan': (ctx, { plan, customerId, reset }) => setPlan(ctx, plan ?? {}, customerId, reset === true),
    'trade.addRestock': (ctx, rule) => addRestock(ctx, rule),
    'trade.removeRestock': (ctx, { ruleId }) => removeRestock(ctx, ruleId),
  },
  on: {
    'business.sold': (ctx, { cities }) => startTrade(ctx, cities),
    // Ankunft in Rotterdam: die ersten Bestellungen gleich (nicht erst am Montag), nur für die Ware in der Halle.
    'city.arrived': (ctx, { cityId }) => {
      const s = ctx.state.modules.trade;
      if (cityId === HARBOR_CITY && s.startedAt !== null && s.orders.length === 0) placeOrders(ctx, true);
    },
    'encounter.resolved': (ctx, { request, outcome }) => {
      if (request.origin?.module === 'trade') onContainerCheck(ctx, request.origin.ref, outcome);
    },
    // Auftrag 44, Teil 7: Container gepackt, der Score gilt für alle Container der Bestellung.
    'minigame.finished': (ctx, payload) => onPackingFinished(ctx, payload),
  },
  // Pleite-Regel: Ware in einem Hafen, ein Container unterwegs oder eine Lieferung auf der Straße.
  solvency: (state) =>
    isBusinessSold(state) &&
    (totalStock(state) > 0 || getShipments(state).length > 0 || getDeliveries(state).length > 0),
});

/** Nach einer erfolgreichen Bestellung des Spielers selbst: Container packen (Minispiel, Auftrag 44, Teil 7). */
function packAfter(
  ctx: Ctx,
  actor: string,
  result: CommandResult,
  producerId: string,
  vessel: string | null,
): CommandResult {
  if (!result.ok || actor !== 'player') return result;
  const ids = new Set((result.data as { shipmentIds?: number[] } | undefined)?.shipmentIds ?? []);
  const shipments = ctx.state.modules.trade.shipments.filter((x) => ids.has(x.id));
  maybeStartPacking(ctx, shipments, SOURCE_BY_ID.get(producerId)?.from ?? producerId, vessel);
  return result;
}

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

/**
 * Weg eines Containers auf der Karte (nur Darstellung): der Seeweg vom Produzenten in den Hafen (roads.seaRoute, aus
 * Overture-Tiefen); Ware per Lkw (Westland, Jansen) als gerade Linie.
 */
export function shipmentPath(shipment: Pick<TradeShipment, 'producerId' | 'portId'>): LngLat[] {
  const producer = SOURCE_BY_ID.get(shipment.producerId);
  const end = portPoint(shipment.portId);
  const sea = producerSeaRoute(shipment.producerId, shipment.portId);
  if (sea) return sea.path;
  return [producer?.at ?? end, end];
}

/** Weg einer Lieferung auf der Karte (über roads, wie die Fahrzeit). */
export function deliveryPath(state: GameState, delivery: Pick<TradeDelivery, 'portId' | 'customerId'>): LngLat[] {
  const customer = getCustomer(state, delivery.customerId);
  if (!customer) return [];
  return interCityRoute(portPoint(delivery.portId), { lng: customer.lng, lat: customer.lat }).drive;
}

/** Produzent (oder eigener Ausfuhrhafen, Auftrag 42) nach ID. */
export function getProducer(id: string): Producer | undefined {
  return SOURCE_BY_ID.get(id);
}

// ---------------------------------------------------------------------------------------------
// Auftrag 42: eigene Ausfuhrhäfen (Cartagena, Tanger). grow legt verpackte Ware ins Ausfuhrlager, Container und eigene
// Schiffe holen sie wie bei einem Produzenten ab (trade.buy, trade.sail mit der ID des Ausfuhrhafens).

/** Eigener Ausfuhrhafen nach ID (undefined für Produzenten). */
export function ownOrigin(id: string): OwnOrigin | undefined {
  return ORIGIN_BY_ID.get(id);
}

/** Ausfuhrhafen einer Region (grow). */
export function regionOrigin(regionId: string): OwnOrigin | undefined {
  return OWN_ORIGINS.find((o) => o.regionId === regionId);
}

/** Ware im Ausfuhrlager eines eigenen Ausfuhrhafens (Sorte → Menge, Qualität, Verpackung). */
export function originStock(state: GameState, originId: string): Readonly<Record<string, OriginLot>> {
  return tradeState(state)?.origins?.[originId] ?? {};
}

/** Verpackte Ware ins Ausfuhrlager legen (grow). pack = Faktor der Verpackung auf die Chance einer Kontrolle. */
export function storeExport(
  ctx: Ctx,
  originId: string,
  productId: string,
  amount: number,
  quality: number,
  pack: number,
): void {
  if (!(amount > 0)) return;
  const s = ctx.state.modules.trade;
  s.origins[originId] ??= {};
  const lots = s.origins[originId];
  const lot = lots[productId] ?? { amount: 0, quality, pack };
  const total = lot.amount + amount;
  const mix = (a: number, b: number) => Math.round(((lot.amount * a + amount * b) / total) * 1000) / 1000;
  lots[productId] = { amount: total, quality: mix(lot.quality, quality), pack: mix(lot.pack, pack) };
}

/** Ware aus dem Ausfuhrlager nehmen (höchstens, was da ist); null, wenn nichts da ist. */
export function takeOrigin(ctx: Ctx, originId: string, productId: string, amount: number): OriginLot | null {
  const lots = ctx.state.modules.trade.origins[originId];
  const lot = lots?.[productId];
  if (!lot || lot.amount <= 0) return null;
  const taken = Math.min(amount, lot.amount);
  lot.amount -= taken;
  if (lot.amount <= 0) delete lots[productId];
  return { amount: taken, quality: lot.quality, pack: lot.pack };
}

/** Ware aus dem Ausfuhrlager verlieren (Razzia, Kartell; Auftrag 42). Gibt die verlorenen Gramm zurück. */
export function loseOrigin(ctx: Ctx, originId: string, share: number): number {
  const lots = ctx.state.modules.trade.origins[originId] ?? {};
  let lost = 0;
  for (const [id, lot] of Object.entries(lots)) {
    const gone = Math.round(lot.amount * Math.min(1, Math.max(0, share)));
    lot.amount -= gone;
    lost += gone;
    if (lot.amount <= 0) delete lots[id];
  }
  return lost;
}
