// Kunden und Vertrieb.
// Straße: Kundentypen (Student, Banker, Tourist, Partygänger, Dauerkiffer) tauchen je nach Uhrzeit, Wochentag,
// Wetter, Ruf und Preis an den Spots auf, wollen ein Produkt ihres Geschmacks und warten eine Weile.
// Zufriedene Kunden werden manchmal Stammkunden mit Namen, die wiederkommen und sich Preis und Qualität merken.
// Lieferdienst und Großhandel: Anfragen kommen als Nachricht ins Handy, ausgeliefert wird vom Spieler selbst
// oder von der Rechten Hand (hierarchy; seit Auftrag 28 fährt niemand sonst Aufträge, Kuriere gibt es nicht mehr).
// Jeder Verkauf löst 'sale.completed' aus.
//
// Öffentliche API:
//   waitingAt(state, spotId), allWaiting(state), getCustomer(state, id), canServe(state, customerId), canServeCustomer,
//   customerRevenue(customer), getSalesStats(state), getCustomerTypes(), customerType(id),
//   getRegulars(state, { spotId?, status? }), getRegular(state, id),
//   getOrders(state, { status?, kind? }), getOrder(state, id), orderProgress(state, order), isPlayerDelivering(state),
//   playerSpot(state) (wo du selbst stehst), isPlayerAway(state) (Lieferung oder Fahrt unterwegs),
//   spotDemand(state, spotId) (aktuelle Nachfrage, z.B. für die Hotspots auf der Karte),
//   Entscheidungen: priceDemandFactor, acceptsPrice, chooseProduct, saleSatisfaction, cutNoticeChance,
//   regularVerdict, regularAfterSale, typeDemandWeight; CUSTOMER_PATIENCE
//   Qualität treibt Nachfrage (Auftrag 32): spotQuality(state, spotId, productId), qualityDemandFactor(...),
//   qualityDemandFor(quality), spotReputation(state, spotId) (Chips "Gras gefragt" / "Gras verschrien")
// Selbst verkaufen geht auch ohne Klick auf jeden Kunden: Stellst du dich an einen Spot ('customers.standAt'),
// bedienst du dort automatisch (PLAYER_SERVE_TIME pro Kunde), solange du nicht mit einer Lieferung unterwegs bist.
// Befehle: 'customers.serve' (auch für Läufer, mit sellerId), 'customers.serveAll', 'customers.standAt',
//   'customers.acceptOrder', 'customers.declineOrder'
// Ereignisse: 'sale.completed', 'customer.arrived', 'customer.left', 'customer.missed', 'customers.selfMoved',
//   'customer.regularGained', 'customer.regularLost', 'order.received', 'order.accepted', 'order.finished'

import { type CommandResult, type Ctx, defineModule, type GameState, journal } from '../../core';
import { cityName, cityOfSpot, isPlayerIn } from '../city';
import { getStock } from '../goods';
import { getSpot, getSpots, isSpotActive } from '../spots';
import { CUSTOMER_TYPES, HANDOVER_MINUTES, WHOLESALE_HANDOVER_MINUTES } from './config';
import { customerType } from './decisions';
import { acceptOrder, courierGone, declineOrder, expireOrderMessage, onDealResolved, ordersTick } from './orders';
import {
  demandRate,
  initialSpawn,
  isPlayerAway,
  onCityEventChanged,
  onCitySwitched,
  onSpotClosed,
  serve,
  streetTick,
} from './street';

export { CUSTOMER_PATIENCE } from './config';
export {
  acceptsPrice,
  chooseProduct,
  customerType,
  cutNoticeChance,
  priceDemandFactor,
  type RegularVerdict,
  regularAfterSale,
  regularVerdict,
  saleSatisfaction,
  typeDemandWeight,
} from './decisions';
// Für Tests und Skripte: eine Anfrage erzwingen (force = true).
export { offerDelivery, offerWholesale } from './orders';
export { qualityDemandFactor, qualityDemandFor, spotQuality, spotReputation } from './quality';
export { isPlayerAway, rateSale } from './street';

export interface CustomerType {
  id: string;
  name: string;
  /** Anteil an der Kundschaft (relativ). */
  share: number;
  /** Erwartete Qualität (0–1). */
  qualityExpectation: number;
  /** 0 = Preis egal, 1,5 = sehr empfindlich. */
  priceSensitivity: number;
  /** Faktor auf die übliche Menge des Produkts. */
  amountFactor: number;
  /** Hauptzeit [von, bis) in Stunden, auch über Mitternacht. */
  peakHours: readonly [number, number];
  /** Faktor pro Wochentag, Mo … So. */
  weekdays: readonly number[];
  /** Neigung, Stammkunde zu werden. */
  loyalty: number;
  /** Merkt Streckmittel (Faktor). */
  expertise: number;
  /** Faktor auf die Wartezeit. */
  patience: number;
  /** Stammkunden kommen etwa alle so viele Tage. */
  visitEvery: number;
}

export interface Customer {
  id: number;
  spotId: string;
  productId: string;
  amount: number;
  /** Preis pro Einheit, den der Kunde zahlt (Preis am Spot, als er kam). */
  pricePerUnit: number;
  arrivedAt: number;
  expiresAt: number;
  /** Kundentyp, fehlt bei alten Spielständen. */
  typeId?: string;
  /** Gesetzt, wenn es ein Stammkunde ist. */
  regularId?: string;
}

export interface Regular {
  id: string;
  name: string;
  typeId: string;
  /** Stamm-Spot. */
  spotId: string;
  productId: string;
  /** Übliche Menge. */
  amount: number;
  visits: number;
  /** Was er beim letzten Mal pro Einheit gezahlt hat. */
  lastPrice: number;
  /** Welche Qualität er beim letzten Mal bekam. */
  lastQuality: number;
  /** 0–1. Unter REGULAR_LOST_BELOW kommt er nicht mehr. */
  satisfaction: number;
  since: number;
  nextVisitAt: number;
  status: 'active' | 'lost';
  lostReason?: string;
}

export type OrderKind = 'delivery' | 'wholesale';
/** contested: Ein Großhandels-Deal ist bei der Übergabe gekippt, die Konfrontation läuft. */
export type OrderStatus = 'offered' | 'enRoute' | 'contested' | 'done' | 'declined' | 'expired' | 'failed';

/** Auftrag über den Lieferdienst oder den Großhandel. */
export interface Order {
  id: number;
  kind: OrderKind;
  status: OrderStatus;
  contactId: string;
  contactName: string;
  /** Kundentyp (Lieferdienst) oder null (Großhändler). */
  typeId: string | null;
  regularId: string | null;
  productId: string;
  amount: number;
  /** Gesamtpreis in Euro. */
  price: number;
  veedelId: string;
  lng: number;
  lat: number;
  createdAt: number;
  expiresAt: number;
  messageId: number;
  /** Wer fährt: du selbst oder die Rechte Hand. 'courier' nur in alten Spielständen (vor Auftrag 28). */
  deliveredBy: 'player' | 'courier' | 'rightHand' | null;
  /** Mitarbeiter, der fährt (die Rechte Hand; früher ein Kurier), null = du selbst. */
  courierId: string | null;
  startedAt: number | null;
  arrivesAt: number | null;
  finishedAt: number | null;
  quality: number | null;
  cut: number | null;
  /** Lager, aus dem die Ware kommt (fehlt bei alten Spielständen: Standardlager). */
  fromWarehouseId?: string | null;
  /** Einkaufspreis je Einheit der mitgenommenen Ware (für den Rückweg bei einem geplatzten Deal; fehlt in alten Ständen). */
  unitCost?: number;
}

export interface SalesStats {
  unitsSold: number;
  revenue: number;
  customersServed: number;
  customersLost: number;
  /** Interessenten, denen der Preis zu hoch war. */
  tooExpensive: number;
  /** Interessenten, die nichts Passendes bekommen hätten. */
  missedDemand: number;
  /** Gefragte Produkte, die nicht auf Lager waren (Produkt-ID → Anzahl). */
  missedByProduct: Record<string, number>;
  cutNoticed: number;
  deliveries: number;
  wholesaleDeals: number;
}

/** Du selbst am Spot: Dort bedienst du automatisch, solange du nicht unterwegs bist. */
export interface SelfSelling {
  spotId: string | null;
  /** Mit dem aktuellen Kunden beschäftigt bis (Spielminute). */
  busyUntil: number;
  /** Seit wann du dort stehst. */
  since: number;
}

export interface CustomersState {
  waiting: Customer[];
  /** Nächster Interessent pro Spot (Spielminute, mit Nachkommastellen). */
  nextSpawnAt: Record<string, number>;
  stats: SalesStats;
  regulars: Regular[];
  orders: Order[];
  self: SelfSelling;
  /** Dürfen Kunden dir direkt schreiben (Lieferanfragen)? Aus: nur Großhandelsaufträge kommen. */
  directOrders: boolean;
  /** Qualität der letzten Straßenverkäufe (gleitender Schnitt): Spot → Ware → 0–1 (Auftrag 32). */
  quality: Record<string, Record<string, number>>;
}

type CustomersStateV2 = Omit<CustomersState, 'self' | 'directOrders' | 'quality'>;
type CustomersStateV3 = Omit<CustomersState, 'directOrders' | 'quality'>;
type CustomersStateV4 = Omit<CustomersState, 'quality'>;

interface CustomersStateV1 {
  waiting: Customer[];
  nextSpawnAt: Record<string, number>;
  stats: { unitsSold: number; revenue: number; customersServed: number; customersLost: number };
}

/** Vertriebsweg eines Verkaufs. */
export type SalesChannel = 'street' | 'delivery' | 'wholesale';

declare module '../../core' {
  interface ModuleStates {
    customers: CustomersState;
  }
  interface GameCommands {
    /** Einen Kunden bedienen. sellerId: Mitarbeiter (Läufer), der verkauft; ohne = der Spieler selbst. */
    'customers.serve': { customerId: number; sellerId?: string };
    /** Alle Kunden an einem Spot bedienen, solange die Ware reicht. */
    'customers.serveAll': { spotId: string };
    /** Selbst an einen Spot stellen und dort automatisch verkaufen (null = weggehen). */
    'customers.standAt': { spotId: string | null };
    /** Kunden direkt schreiben lassen (Lieferanfragen) oder nur Großhandel. */
    'customers.setDirectOrders': { enabled: boolean };
    /**
     * Auftrag annehmen und gleich losschicken: selbst liefern ('player') oder die Rechte Hand fährt ('rightHand',
     * nur sie, eine Fahrt zur Zeit). 'courier' aus alten Spielständen zählt wie 'player'.
     */
    'customers.acceptOrder': { orderId: number; by: 'player' | 'courier' | 'rightHand' };
    'customers.declineOrder': { orderId: number };
  }
  interface GameEvents {
    /** Jeder Verkauf, egal über welchen Vertriebsweg. spotId ist null bei Lieferdienst und Großhandel. */
    'sale.completed': {
      channel: SalesChannel;
      spotId: string | null;
      veedelId: string;
      productId: string;
      amount: number;
      quality: number;
      revenue: number;
      /** Einkaufspreis der verkauften Ware (fehlt bei älteren Aufrufern). */
      goodsCost?: number;
      /** Verkaufender Mitarbeiter (Läufer, Kurier), null = der Spieler selbst. */
      sellerId: string | null;
      customerId: number | null;
      /** Auftrag bei Lieferdienst und Großhandel. */
      orderId?: number;
      /** Stammkunde, falls einer gekauft hat. */
      regularId?: string;
    };
    'customer.arrived': { customerId: number; spotId: string; typeId?: string; regularId?: string };
    /** Kunde ist ohne Ware abgehauen. */
    'customer.left': { customerId: number; spotId: string; productId?: string; amount?: number; veedelId?: string };
    /** Interessent wollte etwas, das nicht auf Lager war (Nachfrage ohne Angebot). */
    'customer.missed': { spotId: string; veedelId: string; productId: string; amount: number; typeId: string };
    'customer.regularGained': { regularId: string; spotId: string };
    /** Du stehst jetzt an einem Spot (spotId) bzw. bist gegangen (null). */
    'customers.selfMoved': { spotId: string | null };
    'customer.regularLost': { regularId: string; reason: string };
    'order.received': { orderId: number; kind: OrderKind };
    'order.accepted': { orderId: number; kind: OrderKind; by: 'player' | 'rightHand'; courierId: string | null };
    'order.finished': { orderId: number; kind: OrderKind; status: 'done' | 'declined' | 'expired' | 'failed' };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

/** Wartende Kunden an einem Spot, dringendste zuerst. */
export function waitingAt(state: GameState, spotId: string): Customer[] {
  return state.modules.customers.waiting.filter((c) => c.spotId === spotId).sort((a, b) => a.expiresAt - b.expiresAt);
}

/**
 * Aktuelle Nachfrage an einem Spot ohne Zufall (1 = ein Kunde alle BASE_SPAWN_INTERVAL Minuten), nach Andrang,
 * Uhrzeit, Wochentag, Wetter, Ruf und Anlaufphase. 0 für unbekannte Spots.
 */
export function spotDemand(state: GameState, spotId: string): number {
  const spot = getSpots(state).find((s) => s.id === spotId);
  return spot ? demandRate(state, spot, state.time) : 0;
}

export function allWaiting(state: GameState): readonly Customer[] {
  return state.modules.customers.waiting;
}

export function getCustomer(state: GameState, id: number): Customer | undefined {
  return state.modules.customers.waiting.find((c) => c.id === id);
}

/** Reicht die Ware für diesen Kunden? */
export function canServe(state: GameState, customerId: number): boolean {
  const c = getCustomer(state, customerId);
  return !!c && canServeCustomer(state, c);
}

/**
 * Wie `canServe`, aber mit dem Kundenobjekt (spart die Suche über die Warteliste). Wer viele Kunden prüft, kann den
 * Bestand mit `stockOf(productId, cityId)` aus einem Zwischenspeicher liefern.
 */
export function canServeCustomer(
  state: GameState,
  c: Pick<Customer, 'spotId' | 'productId' | 'amount'>,
  stockOf: (productId: string, cityId: string) => number = (productId, cityId) =>
    getStock(state, { productId, cityId }),
): boolean {
  return stockOf(c.productId, cityOfSpot(state, c.spotId)) >= c.amount;
}

export function customerRevenue(customer: Pick<Customer, 'amount' | 'pricePerUnit'>): number {
  return Math.round(customer.amount * customer.pricePerUnit);
}

export function getSalesStats(state: GameState): SalesStats {
  return state.modules.customers.stats;
}

export function getCustomerTypes(): readonly CustomerType[] {
  return CUSTOMER_TYPES;
}

export function getRegulars(state: GameState, filter: { spotId?: string; status?: Regular['status'] } = {}): Regular[] {
  return state.modules.customers.regulars.filter(
    (r) => (!filter.spotId || r.spotId === filter.spotId) && (!filter.status || r.status === filter.status),
  );
}

export function getRegular(state: GameState, id: string): Regular | undefined {
  return state.modules.customers.regulars.find((r) => r.id === id);
}

/** Aufträge, neueste zuerst. */
export function getOrders(state: GameState, filter: { status?: OrderStatus; kind?: OrderKind } = {}): Order[] {
  return state.modules.customers.orders
    .filter((o) => (!filter.status || o.status === filter.status) && (!filter.kind || o.kind === filter.kind))
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

export function getOrder(state: GameState, id: number): Order | undefined {
  return state.modules.customers.orders.find((o) => o.id === id);
}

/** Fortschritt einer Auslieferung von 0 bis 1. */
export function orderProgress(state: GameState, order: Order): number {
  if (order.startedAt === null || order.arrivesAt === null) return order.status === 'done' ? 1 : 0;
  const total = order.arrivesAt - order.startedAt;
  return total <= 0 ? 1 : Math.min(1, Math.max(0, (state.time - order.startedAt) / total));
}

/**
 * Wie weit das Lieferauto auf der Straße ist (0–1, für die Karte): Es fährt bis zur Übergabe und steht dann an der
 * Straße, während die Ware übergeben wird (HANDOVER_MINUTES, beim Großhandel WHOLESALE_HANDOVER_MINUTES).
 */
export function orderDriveProgress(state: GameState, order: Order): number {
  if (order.startedAt === null || order.arrivesAt === null) return order.status === 'done' ? 1 : 0;
  const handover = order.kind === 'wholesale' ? WHOLESALE_HANDOVER_MINUTES : HANDOVER_MINUTES;
  const drive = order.arrivesAt - handover - order.startedAt;
  return drive <= 0 ? 1 : Math.min(1, Math.max(0, (state.time - order.startedAt) / drive));
}

/** Ist der Spieler gerade selbst mit einer Lieferung unterwegs? */
export function isPlayerDelivering(state: GameState): boolean {
  return state.modules.customers.orders.some((o) => o.status === 'enRoute' && o.deliveredBy === 'player');
}

/** Spot, an dem du selbst stehst und verkaufst (null = nirgends). */
export function playerSpot(state: GameState): string | null {
  return state.modules.customers.self?.spotId ?? null;
}

/** Name des Kundentyps eines Kunden. */
export function customerTypeName(typeId: string | undefined): string {
  return customerType(typeId).name;
}

/** Selbst an einen Spot stellen oder weggehen. */
function standAt(ctx: Ctx, spotId: string | null): CommandResult {
  const self = ctx.state.modules.customers.self;
  if (spotId === null) {
    if (!self.spotId) return { ok: true };
    const spot = getSpot(ctx.state, self.spotId);
    self.spotId = null;
    journal.add(ctx, `Du gehst vom ${spot?.name ?? 'Spot'} weg.`);
    ctx.emit('customers.selfMoved', { spotId: null });
    return { ok: true };
  }
  const spot = getSpot(ctx.state, spotId);
  if (!spot || !isSpotActive(ctx.state, spotId)) return { ok: false, reason: 'Hier kannst du noch nicht verkaufen.' };
  // Selbst verkaufen geht nur in der Stadt, in der du bist (Auftrag 30).
  const city = cityOfSpot(ctx.state, spotId);
  if (!isPlayerIn(ctx.state, city)) {
    return { ok: false, reason: `Du bist nicht in ${cityName(city)}. Dort verkaufen deine Leute.` };
  }
  if (self.spotId === spotId) return { ok: true };
  self.spotId = spotId;
  self.since = ctx.now;
  self.busyUntil = Math.min(self.busyUntil, ctx.now);
  journal.add(
    ctx,
    `Du stellst dich an den ${spot.name} und verkaufst selbst.` +
      (isPlayerAway(ctx.state) ? ' Sobald du von deiner Fahrt zurück bist.' : ''),
    'info',
    { spotId },
  );
  ctx.emit('customers.selfMoved', { spotId });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Registrierung

export default defineModule({
  id: 'customers',
  version: 5,
  dependsOn: ['spots', 'goods', 'market'],
  init: (ctx) => ({
    waiting: [],
    nextSpawnAt: initialSpawn(ctx, getSpots(ctx.state)),
    stats: {
      unitsSold: 0,
      revenue: 0,
      customersServed: 0,
      customersLost: 0,
      tooExpensive: 0,
      missedDemand: 0,
      missedByProduct: {},
      cutNoticed: 0,
      deliveries: 0,
      wholesaleDeals: 0,
    },
    regulars: [],
    orders: [],
    self: { spotId: null, busyUntil: 0, since: 0 },
    directOrders: false,
    quality: {},
  }),
  tick: (ctx) => {
    streetTick(ctx);
    ordersTick(ctx);
  },
  commands: {
    'customers.serve': (ctx, { customerId, sellerId }) => serve(ctx, customerId, sellerId ?? null),
    'customers.serveAll': (ctx, { spotId }) => {
      let served = 0;
      for (const c of waitingAt(ctx.state, spotId)) {
        if (serve(ctx, c.id, null).ok) served++;
      }
      if (served === 0) return { ok: false, reason: 'Nicht genug im Lager.' };
      return { ok: true, data: { served } };
    },
    'customers.standAt': (ctx, { spotId }) => standAt(ctx, spotId),
    'customers.setDirectOrders': (ctx, { enabled }) => {
      ctx.state.modules.customers.directOrders = enabled;
      return { ok: true };
    },
    'customers.acceptOrder': (ctx, { orderId, by }) => acceptOrder(ctx, orderId, by),
    'customers.declineOrder': (ctx, { orderId }) => declineOrder(ctx, orderId),
  },
  on: {
    'message.expired': (ctx, { messageId, source }) => {
      if (source === 'customers') expireOrderMessage(ctx, messageId);
    },
    'city.switched': (ctx, { from, to }) => onCitySwitched(ctx, from, to),
    // Stadt-Events (Etappe 7): Die Laufkundschaft passt sich sofort der neuen Nachfrage an.
    'events.started': (ctx, { cityId }) => onCityEventChanged(ctx, cityId),
    'events.ended': (ctx, { cityId }) => onCityEventChanged(ctx, cityId),
    // Auftrag 23: Ein eigener Spot wird aufgegeben.
    'spots.closed': (ctx, { spotId, lng, lat }) => onSpotClosed(ctx, spotId, { lng, lat }),
    'staff.statusChanged': (ctx, { staffId, to }) => {
      if (to !== 'active') courierGone(ctx, staffId, true);
    },
    'staff.left': (ctx, { staffId }) => courierGone(ctx, staffId, false),
    'encounter.resolved': (ctx, { request, outcome }) => {
      if (request.origin?.module === 'customers') onDealResolved(ctx, request.origin.ref, outcome);
    },
  },
  migrations: {
    2: (old: CustomersStateV1): CustomersStateV2 => ({
      waiting: old.waiting,
      nextSpawnAt: old.nextSpawnAt,
      stats: {
        ...old.stats,
        tooExpensive: 0,
        missedDemand: 0,
        missedByProduct: {},
        cutNoticed: 0,
        deliveries: 0,
        wholesaleDeals: 0,
      },
      regulars: [],
      orders: [],
    }),
    // Version 3: Du kannst dich selbst an einen Spot stellen.
    3: (old: CustomersStateV2): CustomersStateV3 => ({ ...old, self: { spotId: null, busyUntil: 0, since: 0 } }),
    // Version 4: Direktanfragen von Kunden sind abschaltbar, standardmäßig aus.
    4: (old: CustomersStateV3): CustomersStateV4 => ({ ...old, directOrders: false }),
    // Version 5 (Auftrag 32): Qualität der letzten Verkäufe pro Spot und Ware, alte Stände ohne Verlauf.
    5: (old: CustomersStateV4): CustomersState => ({ ...old, quality: {} }),
  },
});
