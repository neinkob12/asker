// Lieferanten: Bestellungen, Lieferungen und Beziehungen.
// Zwei Arten: Großstädte (Frankfurt, Hamburg, Berlin, Amsterdam: kleine Mengen, schnell, teurer) und der Hafen
// Rotterdam (große Mengen, langsam, günstiger). Jeder Lieferant hat Preis, Qualität, Zuverlässigkeit, Lieferzeit
// und Sortiment. Vertrauen wächst mit Käufen und pünktlicher Zahlung und bringt Rabatt, Kredit und bessere Ware.
// Freischalten: Am Anfang liefert nur Frankfurt. Die anderen melden sich, sobald du genug Umsatz, Veedel unter
// Kontrolle oder einen Liegeplatz im Hafen hast (unlock in config.ts), und wollen eine Vermittlungsgebühr
// ('suppliers.unlock'). Lieferprobleme (verspätet, schlechte Ware, beschlagnahmt) werden bei der Bestellung
// ausgewürfelt und zeigen sich unterwegs bzw. bei der Ankunft. Transporter fahren auf der Karte über echte Straßen
// (roads) ins gewählte Lager. Hafenware kommt per Schiff über den Rhein an deinen Liegeplatz im Niehler Hafen und
// wartet dort, bis jemand sie abholt (logistics).
// Städte (Auftrag 30): Jeder Lieferant liefert in bestimmte Städte (cities, Standard Köln), mit eigener Lieferzeit
// (deliveryTimes) und Aufschlag (priceFactors); in einer Stadt kann er anders auftreten (inCity, z.B. ein Hafen-Großhändler
// in einer Stadt). Bestellt wird für die Stadt des Ziel-Lagers, ohne Lager für die aktive. Freigeschaltete
// Lieferanten und Vertrauen gelten in allen Städten. Hein schaltet sich mit Hamburg frei.
//
// Öffentliche API:
//   getSuppliers(state, cityId?), getSupplier(state, id), supplierIn(supplier, cityId), deliversTo(supplier, cityId),
//   supplierVia(supplier, cityId) (Autobahn des Kuriers in die Stadt, nur Karte),
//   deliveryTimeTo(supplier, cityId), supplierContactId(id), assortment(supplier),
//   isUnlocked(state, id), unlockRequirements(state, id), canUnlock(state, id),
//   shipmentsInTransit(state, cityId?), shipmentCity(shipment), shipmentProgress(state, shipment), expectedArrival(shipment),
//   cheapestPackagePrice(state), getRelation(state, id), trustLabel(trust), supplierDiscount(state, id),
//   supplierQualityBonus(state, id), creditLimit(state, id), availableCredit(state, id), isBlocked(state, id),
//   availablePackages(state, id), packagePrice(state, supplierId, packageId), rollShipmentProblem(...),
//   Rabatt-Aktionen (Auftrag 32): getDeals(state, cityId?), activeDeal(state, supplierId, packageId, cityId?),
//   supplierContact(supplier) (Kontakt im Handy, z.B. für den Marktbericht), addSupplierTrust(ctx, id, amount), supplierById(id)
//   deliveryLeg(supplier, progress, toPort?) (Darstellung: Schiff, Umladen oder Straße; Weg: roads.shipRoute,
//   UNLOADING_PORT)
// Befehle: 'suppliers.order' (onCredit für Kredit, warehouseId als Ziel), 'suppliers.repay', 'suppliers.unlock'
// Ereignisse: 'shipment.ordered', 'shipment.arrived' (atPort bei Schiffsware), 'shipment.problem',
//   'supplier.trustChanged', 'supplier.repaid', 'supplier.overdue', 'supplier.unlocked', 'supplier.dealStarted'

import {
  type CommandResult,
  type Contact,
  type Ctx,
  cityDayDice,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  keyedDice,
  MINUTES_PER_DAY,
  messages,
  wallet,
} from '../../core';
import { activeCity, citiesUnlocked, cityName, getCity, isBusinessSold, relationFactor } from '../city';
import { getSalesStats } from '../customers';
import {
  DEFAULT_WAREHOUSE,
  formatProductAmount,
  getWarehouse,
  getWarehouses,
  nearestWarehouse,
  productName,
  store,
  storeFitting,
  unitWeight,
  warehouseFree,
} from '../goods';
import { hasBerth, portName, receiveCargo } from '../logistics';
import { purchaseIndex } from '../market';
import { getReputation } from '../reputation';
import { controlledBy, PLAYER_FACTION } from '../territory';
import {
  BAD_QUALITY_FACTOR,
  BAD_QUALITY_LOSS,
  CREDIT_MIN_TRUST,
  CREDIT_PER_TRUST,
  CREDIT_TERM,
  CREDIT_TRUST_OFFSET,
  DEAL_CHANCE_PER_DAY,
  DEAL_DAYS,
  DEAL_DISCOUNT,
  DEAL_PITCHES,
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
  RIVAL_WEEKLY_SWING,
  RIVALS,
  SEIZE_FACTOR,
  SHARED_CONTAINER_RISK,
  SHIP_SHARE,
  START_TRUST,
  SUPPLIER_LOOKS,
  SUPPLIERS,
  TRUST_CASH_BONUS,
  TRUST_LATE_PENALTY,
  TRUST_ON_TIME_REPAYMENT,
  TRUST_PER_1000_EUR,
  TRUST_PER_ORDER,
  UNLOADING_SHARE,
} from './config';
import type { RouteKind } from './problems';
import {
  applyArrivalLuck,
  type ProblemChoice,
  resolveProblem,
  revealProblem,
  rollLuck,
  rollReason,
  type ShipmentDecision,
  type ShipmentLuck,
  upkeepDecisions,
  voice,
} from './troubles';

export { CITY_APPROACH_SHARE, SHIP_SHARE, UNLOADING_PORT, UNLOADING_SHARE } from './config';
export { PROBLEM_REASONS, type ProblemReason, ROUTE_NAMES, type RouteKind, routeKindOf } from './problems';
export {
  CHOICE_NAMES,
  type ProblemChoice,
  type ShipmentDecision,
  type ShipmentLuck,
  shipmentReason,
} from './troubles';

export interface SupplierPackage {
  id: string;
  label: string;
  productId: string;
  amount: number;
  /** Listenpreis ohne Rabatt. */
  price: number;
  /** Erst ab diesem Vertrauen im Sortiment. */
  minTrust?: number;
  /**
   * Container-Paket der Hafen-Lieferanten (Auftrag 33): 'full' ein ganzer Container (groß, billig pro Gramm),
   * 'shared' ein geteilter (noch billiger, aber fliegt die fremde Hälfte auf, ist die eigene mit weg).
   */
  container?: 'full' | 'shared';
}

/** Bedingungen, bevor ein Lieferant mit dir Geschäfte macht (alle müssen erfüllt sein). */
export interface SupplierRequirements {
  /** Umsatz insgesamt in Euro (alle Verkäufe). */
  revenue?: number;
  /** So viele Veedel unter deiner Kontrolle (Einfluss). */
  veedel?: number;
  /** Mindest-Ruf (0–100). */
  reputation?: number;
  /** Eigener Liegeplatz im Niehler Hafen (logistics). */
  berth?: boolean;
  /** Diese Stadt ist freigeschaltet (Auftrag 38: Lieferanten, die nur in eine spätere Stadt liefern). */
  city?: string;
}

export interface SupplierUnlock {
  requires: SupplierRequirements;
  /** Vermittlungsgebühr in Schwarzgeld. */
  fee: number;
  /** Erste Nachricht, wenn die Bedingungen erfüllt sind. {fee} wird ersetzt. */
  pitch: string;
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
  /** Fehlt: von Anfang an zu haben. */
  unlock?: SupplierUnlock;
  /** Städte, in die geliefert wird (Auftrag 30). Fehlt: nur Köln. */
  cities?: readonly string[];
  /** Lieferzeit pro Stadt; fehlt eine Stadt, gilt deliveryTime. */
  deliveryTimes?: Readonly<Record<string, number>>;
  /** Aufschlag auf die Preise pro Stadt (1,1 = zehn Prozent mehr). */
  priceFactors?: Readonly<Record<string, number>>;
  /** Anderes Auftreten in einer Stadt (Art, Sortiment, Beschreibung). */
  inCity?: Readonly<Record<string, Partial<Pick<Supplier, 'kind' | 'packages' | 'description' | 'priceLevel'>>>>;
  /**
   * Autobahn pro Stadt, über die der Kurier hereinkommt (roads: roadApproach), nur für die Karte, z.B. Frankfurt
   * { koeln: 'A3', hamburg: 'A7' }. Fehlt die Stadt, nimmt roads die Zufahrt in der besten Richtung.
   */
  via?: Readonly<Record<string, string>>;
  /**
   * Hier zu Hause (Auftrag 37, allgemein statt nur Hein in Hamburg): Betrittst du die Stadt zum ersten Mal, ist er ohne
   * Vermittlung dabei und meldet sich mit welcome.
   */
  home?: { cityId: string; welcome: string };
  /**
   * Zoll an einer Grenze (Auftrag 38, z.B. am Brenner): zusätzliche Chance auf Beschlagnahme pro Lieferung, wie
   * PORT_SEIZE_EXTRA am Hafen. Fehlt: 0.
   */
  customs?: number;
}

/** Autobahn, über die der Kurier in die Stadt kommt (supplier.via), oder undefined. */
export function supplierVia(supplier: Supplier, cityId: string): string | undefined {
  return supplier.via?.[cityId];
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
  /** Schiffsware: kommt an den Kai im Niehler Hafen statt ins Lager (logistics holt sie ab). */
  toPort?: boolean;
  /** Schiffsware: das Lager, für das bestellt wurde (Abholung fährt dorthin, Bestellregeln zählen die Ware dafür mit). */
  destinationId?: string;
  /** Stadt, für die bestellt wurde (Auftrag 30; fehlt: Köln). */
  cityId?: string;
  /** Geteilter Container (Auftrag 33): Beschlagnahme kam über die fremde Hälfte. */
  shared?: boolean;
  /** Ausgewürfeltes Lieferproblem, der Spieler erfährt es erst, wenn es passiert. */
  problem?: ShipmentProblem;
  /** Wann das Problem unterwegs auftritt (Verspätung, Beschlagnahme). */
  problemAt?: number;
  delayMinutes?: number;
  problemRevealed?: boolean;
  /** Versprochene Qualität, falls die Ware schlechter ankommt. */
  promisedQuality?: number;
  /** Bestellt von Leuten (Rechte Hand, Leutnant), nicht vom Spieler (Auftrag 43, K4): kein Banner, keine Plauder-Chats. */
  orderedBy?: string;
  /** Weg der Lieferung und Grund des Problems (Auftrag 23, problems.ts), gesetzt, sobald es bekannt ist. */
  route?: RouteKind;
  reasonId?: string;
  /** Offene Rückfrage zum Problem (troubles.ts) und die gewählte Antwort. */
  decision?: ShipmentDecision;
  choice?: ProblemChoice;
  /** Chance: früher da, Ware obendrauf, bessere Qualität (gemeldet bei der Ankunft). */
  luck?: ShipmentLuck;
  luckShown?: boolean;
  /** Rest einer Teillieferung: ID der Lieferung, von der er abgeteilt wurde. */
  partOf?: number;
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

/** Rabatt-Aktion eines Lieferanten auf ein Paket in einer Stadt (Auftrag 32). */
export interface SupplierDeal {
  id: number;
  supplierId: string;
  packageId: string;
  cityId: string;
  /** Rabatt als Anteil (0,15 = 15 %). */
  discount: number;
  startedAt: number;
  endsAt: number;
}

export interface SuppliersState {
  /** Laufende Rabatt-Aktionen (Auftrag 32). */
  deals: SupplierDeal[];
  shipments: Shipment[];
  relations: Record<string, SupplierRelation>;
  /** Lieferanten, die mit dir Geschäfte machen. */
  unlocked: string[];
  /** Lieferanten, die sich schon mit einem Angebot gemeldet haben. */
  offered: string[];
}

interface SuppliersStateV1 {
  shipments: Shipment[];
}

type SuppliersStateV2 = Omit<SuppliersState, 'unlocked' | 'offered' | 'deals'>;
type SuppliersStateV4 = Omit<SuppliersState, 'deals'>;

declare module '../../core' {
  interface ModuleStates {
    suppliers: SuppliersState;
  }
  interface GameCommands {
    /** Paket bestellen. onCredit: jetzt liefern, später zahlen (braucht Vertrauen). */
    'suppliers.order': { supplierId: string; packageId: string; onCredit?: boolean; warehouseId?: string };
    /** Lieferanten freischalten (Bedingungen erfüllt, Vermittlungsgebühr zahlen). */
    'suppliers.unlock': { supplierId: string };
    /** Antwort auf ein Lieferproblem mit Rückfrage (Auftrag 23): Umweg, Teillieferung, Umleiten, Schmieren, abwarten. */
    'suppliers.resolveProblem': { shipmentId: number; choice: ProblemChoice };
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
      /** Stadt, für die bestellt wurde (Auftrag 43). */
      cityId?: string;
    };
    'shipment.arrived': {
      shipmentId: number;
      supplierId: string;
      productId: string;
      amount: number;
      warehouseId: string;
      quality?: number;
      /** Schiffsware am Kai im Niehler Hafen (warehouseId ist dann 'port'). */
      atPort?: boolean;
      /** Von deinen Leuten bestellt (Auftrag 43, K4). */
      byStaff?: boolean;
      /** Lager waren zu voll, die Ware liegt in mehreren (Auftrag 33): "300 g im Lager Ehrenfeld, 200 g im …". */
      placedIn?: string;
      /** Stadt, für die bestellt wurde (Auftrag 43; die Oberfläche meldet nur die Stadt, in der du spielst). */
      cityId?: string;
    };
    /** Lieferproblem ist eingetreten. */
    'shipment.problem': { shipmentId: number; supplierId: string; kind: ShipmentProblem; reason?: string };
    /** Antwort auf ein Lieferproblem (Auftrag 23). */
    'shipment.decided': { shipmentId: number; supplierId: string; choice: ProblemChoice };
    /** Chance bei einer Lieferung (Auftrag 23). */
    'shipment.luck': { shipmentId: number; supplierId: string; kind: ShipmentLuck };
    'supplier.trustChanged': { supplierId: string; trust: number; delta: number };
    'supplier.repaid': { supplierId: string; amount: number; debt: number };
    'supplier.overdue': { supplierId: string; debt: number };
    'supplier.unlocked': { supplierId: string; fee: number };
    'supplier.dealStarted': {
      dealId: number;
      supplierId: string;
      packageId: string;
      cityId: string;
      discount: number;
      endsAt: number;
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

/** Alle Lieferanten, mit Stadt nur die, die dorthin liefern (so, wie sie dort auftreten). */
export function getSuppliers(_state: GameState, cityId?: string): readonly Supplier[] {
  if (cityId === undefined) return SUPPLIERS;
  return SUPPLIERS.filter((s) => deliversTo(s, cityId)).map((s) => supplierIn(s, cityId));
}

/** Liefert der Lieferant in diese Stadt? */
export function deliversTo(supplier: Supplier, cityId: string): boolean {
  return (supplier.cities ?? ['koeln']).includes(cityId);
}

/** Lieferzeit in eine Stadt. */
export function deliveryTimeTo(supplier: Supplier, cityId: string): number {
  return supplier.deliveryTimes?.[cityId] ?? supplier.deliveryTime;
}

const inCityCache = new Map<string, Supplier>();

/** Der Lieferant, wie er in einer Stadt auftritt (Art, Sortiment, Lieferzeit). */
export function supplierIn(supplier: Supplier, cityId: string): Supplier {
  const key = `${supplier.id}|${cityId}`;
  let found = inCityCache.get(key);
  if (!found) {
    found = { ...supplier, ...supplier.inCity?.[cityId], deliveryTime: deliveryTimeTo(supplier, cityId) };
    inCityCache.set(key, found);
  }
  return found;
}

/** Lieferant nach ID, ohne Spielstand (Stammdaten, z.B. für Texte). */
export function supplierById(id: string): Supplier | undefined {
  return SUPPLIERS.find((s) => s.id === id);
}

export function getSupplier(state: GameState, id: string): Supplier | undefined {
  return getSuppliers(state).find((s) => s.id === id);
}

/** Ein Angebot der Konkurrenz an einen Kunden der Hafen-Phase (Auftrag 40). */
export interface RivalOffer {
  supplierId: string;
  /** Name im Satz, z.B. „Toni“. */
  name: string;
  /** Faktor auf den fairen Großhandelspreis. */
  price: number;
  quality: number;
  reliability: number;
}

/**
 * Was die Konkurrenz (Toni, Hein, Mirko, Daan; RIVALS) in einer Woche anbietet: Preis um den fairen Preis mit einer
 * kleinen Schwankung pro Woche (fest aus Seed, Woche und Lieferant, kein ctx.random), Qualität und Zuverlässigkeit des
 * Lieferanten.
 */
export function rivalOffers(state: GameState, week: number): RivalOffer[] {
  return RIVALS.flatMap((r) => {
    const supplier = getSupplier(state, r.supplierId);
    if (!supplier) return [];
    const dice = keyedDice(`suppliers.rival:${state.meta.seed}:${r.supplierId}:${week}`);
    const swing = (dice.random() * 2 - 1) * RIVAL_WEEKLY_SWING;
    return [
      {
        supplierId: supplier.id,
        name: supplier.contactName,
        price: Math.round(r.price * (1 + swing) * 1000) / 1000,
        quality: supplier.quality,
        reliability: supplier.reliability,
      },
    ];
  });
}

/** Kontakt-ID im Handy. */
export function supplierContactId(supplierId: string): string {
  return `supplier:${supplierId}`;
}

/** Macht der Lieferant schon Geschäfte mit dir? */
export function isUnlocked(state: GameState, supplierId: string): boolean {
  return state.modules.suppliers.unlocked.includes(supplierId);
}

/** Bedingungen fürs Freischalten mit Stand, z.B. "1 von 3 Veedeln". Leer bei Lieferanten ohne Bedingungen. */
export function unlockRequirements(
  state: GameState,
  supplierId: string,
): { label: string; done: boolean; progress: number }[] {
  const requires = getSupplier(state, supplierId)?.unlock?.requires;
  if (!requires) return [];
  const rows: { label: string; done: boolean; progress: number }[] = [];
  if (requires.revenue !== undefined) {
    const revenue = getSalesStats(state).revenue;
    rows.push({
      label: `${formatEuro(requires.revenue)} Umsatz (bisher ${formatEuro(Math.round(revenue))})`,
      done: revenue >= requires.revenue,
      progress: Math.min(1, revenue / requires.revenue),
    });
  }
  if (requires.veedel !== undefined) {
    const veedel = controlledBy(state, PLAYER_FACTION).length;
    rows.push({
      label: `${requires.veedel === 1 ? 'Ein Veedel' : `${requires.veedel} Veedel`} unter deiner Kontrolle (jetzt ${veedel})`,
      done: veedel >= requires.veedel,
      progress: Math.min(1, veedel / requires.veedel),
    });
  }
  if (requires.reputation !== undefined) {
    const reputation = getReputation(state);
    rows.push({
      label: `Ruf ${requires.reputation} (jetzt ${Math.round(reputation)})`,
      done: reputation >= requires.reputation,
      progress: Math.min(1, reputation / requires.reputation),
    });
  }
  if (requires.berth) {
    const berth = hasBerth(state, 'koeln');
    rows.push({ label: 'Eigener Liegeplatz im Niehler Hafen', done: berth, progress: berth ? 1 : 0 });
  }
  if (requires.city) {
    const there = citiesUnlocked(state).includes(requires.city);
    rows.push({ label: `Du bist in ${cityName(requires.city)}`, done: there, progress: there ? 1 : 0 });
  }
  return rows;
}

/** Kann der Lieferant jetzt freigeschaltet werden? Gibt den Grund zurück, wenn nicht. */
export function canUnlock(state: GameState, supplierId: string): CommandResult {
  const supplier = getSupplier(state, supplierId);
  if (!supplier) return { ok: false, reason: 'Unbekannter Lieferant.' };
  if (isUnlocked(state, supplierId)) return { ok: false, reason: `${supplier.contactName} liefert schon an dich.` };
  const missing = unlockRequirements(state, supplierId).find((r) => !r.done);
  if (missing) return { ok: false, reason: `${supplier.contactName} will erst mehr sehen: ${missing.label}.` };
  return { ok: true };
}

/** Sortiment: Produkt-IDs, die der Lieferant grundsätzlich hat. */
export function assortment(supplier: Supplier): string[] {
  return [...new Set(supplier.packages.map((p) => p.productId))];
}

export function shipmentsInTransit(state: GameState, cityId?: string): readonly Shipment[] {
  const all = state.modules.suppliers.shipments;
  return cityId === undefined ? all : all.filter((s) => shipmentCity(s) === cityId);
}

/** Stadt, für die eine Lieferung bestellt wurde (alte Lieferungen ohne Angabe: Köln). */
export function shipmentCity(shipment: Shipment): string {
  return shipment.cityId ?? 'koeln';
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

export type DeliveryStage = 'ship' | 'unloading' | 'road';

/**
 * Welcher Teil der Lieferung gerade zu sehen ist (reine Darstellung, die Lieferzeit bleibt gleich):
 * Vom Hafen kommt die Ware per Schiff (SHIP_SHARE), wird im Niehler Hafen umgeladen (UNLOADING_SHARE) und
 * fährt dann mit dem Lkw zum Lager. Großstädte liefern die ganze Strecke über die Straße.
 * t ist der Fortschritt innerhalb des Abschnitts (0–1).
 */
export function deliveryLeg(
  supplier: Pick<Supplier, 'kind'>,
  progress: number,
  toPort = false,
): { stage: DeliveryStage; t: number } {
  const p = Math.min(1, Math.max(0, progress));
  if (supplier.kind !== 'port') return { stage: 'road', t: p };
  // Mit Liegeplatz: Das Schiff fährt die ganze Zeit und legt am Kai an.
  if (toPort) return { stage: 'ship', t: p };
  if (p < SHIP_SHARE) return { stage: 'ship', t: p / SHIP_SHARE };
  if (p < SHIP_SHARE + UNLOADING_SHARE) return { stage: 'unloading', t: (p - SHIP_SHARE) / UNLOADING_SHARE };
  return { stage: 'road', t: (p - SHIP_SHARE - UNLOADING_SHARE) / (1 - SHIP_SHARE - UNLOADING_SHARE) };
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

/**
 * Pakete, die der Lieferant dir bei deinem Vertrauen anbietet. Leer, solange er noch nicht freigeschaltet ist (und
 * beim Hafen ohne eigenen Liegeplatz).
 */
export function availablePackages(
  state: GameState,
  supplierId: string,
  cityId: string = activeCity(state),
): SupplierPackage[] {
  const base = getSupplier(state, supplierId);
  if (!base || !isUnlocked(state, supplierId) || !deliversTo(base, cityId)) return [];
  const supplier = supplierIn(base, cityId);
  if (supplier.kind === 'port' && !hasBerth(state, cityId)) return [];
  const { trust } = getRelation(state, supplierId);
  return supplier.packages.filter((p) => (p.minTrust ?? 0) <= trust);
}

/**
 * Preis nach Rabatt (und Aufschlag der Stadt, Standard: die aktive). Seit Auftrag 32 bewegt der Preisindex des Markts
 * den Einkauf mit (gedämpft, purchaseIndex).
 */
export function packagePrice(
  state: GameState,
  supplierId: string,
  packageId: string,
  cityId: string = activeCity(state),
): number {
  const base = getSupplier(state, supplierId);
  const pkg = base ? supplierIn(base, cityId).packages.find((p) => p.id === packageId) : undefined;
  if (!base || !pkg) return Number.POSITIVE_INFINITY;
  const factor = (base.priceFactors?.[cityId] ?? 1) * purchaseIndex(state, pkg.productId, cityId);
  const deal = activeDeal(state, supplierId, packageId, cityId)?.discount ?? 0;
  return Math.round(pkg.price * factor * (1 - supplierDiscount(state, supplierId)) * (1 - deal));
}

/** Laufende Rabatt-Aktionen, in einer Stadt oder überall. */
export function getDeals(state: GameState, cityId?: string): readonly SupplierDeal[] {
  const deals = (state.modules.suppliers.deals ?? []).filter((d) => d.endsAt > state.time);
  return cityId ? deals.filter((d) => d.cityId === cityId) : deals;
}

/** Rabatt-Aktion auf ein Paket in einer Stadt (Standard: die aktive), oder undefined. */
export function activeDeal(
  state: GameState,
  supplierId: string,
  packageId: string,
  cityId: string = activeCity(state),
): SupplierDeal | undefined {
  return (state.modules.suppliers.deals ?? []).find(
    (d) => d.supplierId === supplierId && d.packageId === packageId && d.cityId === cityId && d.endsAt > state.time,
  );
}

/**
 * Lieferproblem auswürfeln. roll ist eine Zufallszahl in [0, 1).
 * Wahrscheinlichkeit steigt mit schlechter Zuverlässigkeit, sinkt mit Vertrauen; am Hafen kommt der Zoll dazu, bei
 * Lieferanten mit eigenem Zoll (customs, z.B. Fracht am Flughafen) dessen Zusatz.
 */
export function rollShipmentProblem(roll: number, supplier: Supplier, trust: number): ShipmentProblem | null {
  const risk = (1 - supplier.reliability) * (1 - trust / 200);
  const seize = risk * SEIZE_FACTOR + (supplier.kind === 'port' ? PORT_SEIZE_EXTRA : 0) + (supplier.customs ?? 0);
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

function addTrust(ctx: Ctx, supplierId: string, raw: number, cityId: string = activeCity(ctx.state)): void {
  const rel = relationFor(ctx, supplierId);
  const before = rel.trust;
  // Kölscher Klüngel (Auftrag 30): Vertrauen wächst je nach Stadt schneller (Köln) oder langsamer (Hamburg).
  const delta = raw > 0 ? raw * relationFactor(cityId) : raw;
  rel.trust = Math.round(Math.min(100, Math.max(0, rel.trust + delta)) * 10) / 10;
  if (rel.trust !== before) {
    ctx.emit('supplier.trustChanged', {
      supplierId,
      trust: rel.trust,
      delta: Math.round((rel.trust - before) * 10) / 10,
    });
  }
}

/** Vertrauen bei einem Lieferanten schenken (z.B. als Belohnung eines Wochenvertrags, Auftrag 32). */
export function addSupplierTrust(ctx: Ctx, supplierId: string, amount: number): void {
  if (!getSupplier(ctx.state, supplierId) || !(amount > 0)) return;
  addTrust(ctx, supplierId, amount);
}

/** Kontakt des Lieferanten im Handy (für Nachrichten anderer Module, z.B. den Marktbericht). */
export function supplierContact(supplier: Supplier): Contact {
  return contactOf(supplier);
}

/** Kontakt des Lieferanten im Handy (mit Aussehen). */
export function contactOf(supplier: Supplier): Contact {
  return {
    id: supplierContactId(supplier.id),
    name: `${supplier.contactName} (${supplier.name})`,
    kind: 'supplier',
    role: `Lieferant aus ${supplier.name}`,
    about: supplier.description,
    look: SUPPLIER_LOOKS[supplier.id] ?? {},
  };
}

export function tell(ctx: Ctx, supplier: Supplier, text: string): void {
  messages.send(ctx, { contact: contactOf(supplier), text });
}

/** Liefert die Lieferung in die Stadt, in der du bist (und gehört das Geschäft noch dir)? */
export function shipmentHere(state: GameState, s: { cityId?: string }): boolean {
  return (s.cityId ?? 'koeln') === activeCity(state) && !isBusinessSold(state);
}

/**
 * Über eine Lieferung schreiben, aber nur, wenn sie in die Stadt geht, in der du bist (Auftrag 43: nach dem Umzug
 * kamen Chats wie „Freie Bahn. Bin früher da.“ über Lieferungen nach Köln). Sonst steht es nur im Journal.
 */
export function tellAbout(
  ctx: Ctx,
  supplier: Supplier,
  s: { cityId?: string; orderedBy?: string },
  text: string,
  important = false,
): void {
  // Was deine Leute bestellt haben, plaudert der Lieferant nicht mit dir aus, außer es ist etwas verloren (Auftrag 43,
  // K4: Die Rechte Hand bestellte stündlich Kleinkram, und jede Lieferung brachte Chats und Banner).
  if (s.orderedBy && !important) return;
  if (shipmentHere(ctx.state, s)) tell(ctx, supplier, text);
}

function order(
  ctx: Ctx,
  supplierId: string,
  packageId: string,
  onCredit: boolean,
  warehouseId: string | undefined,
  actor: string = 'player',
): CommandResult {
  const base = getSupplier(ctx.state, supplierId);
  const warehouse = warehouseId ? getWarehouse(ctx.state, warehouseId) : undefined;
  if (warehouseId && !warehouse) return { ok: false, reason: 'Dieses Lager gehört dir nicht.' };
  // Bestellt wird für die Stadt des Ziel-Lagers, ohne Lager für die aktive Stadt.
  const cityId = warehouse?.cityId ?? activeCity(ctx.state);
  const supplier = base ? supplierIn(base, cityId) : undefined;
  const pkg = supplier?.packages.find((p) => p.id === packageId);
  if (!base || !supplier || !pkg) return { ok: false, reason: 'Unbekanntes Paket.' };
  if (!isUnlocked(ctx.state, supplierId)) {
    return { ok: false, reason: `${supplier.contactName} macht noch keine Geschäfte mit dir.` };
  }
  if (!deliversTo(base, cityId))
    return { ok: false, reason: `${supplier.contactName} liefert nicht nach ${cityName(cityId)}.` };
  const toPort = supplier.kind === 'port';
  if (toPort && !hasBerth(ctx.state, cityId)) {
    return { ok: false, reason: `Ohne eigenen Liegeplatz im ${portName(cityId)} kann kein Schiff für dich anlegen.` };
  }
  const weight = pkg.amount * unitWeight(pkg.productId);
  // Der Kurier lädt im Lager ab: Es muss Platz haben (Auftrag 33). Ohne Angabe ein Lager der Stadt, in das es passt.
  const target = toPort ? null : (warehouse?.id ?? defaultWarehouse(ctx.state, cityId, weight));
  if (!toPort && !target) return { ok: false, reason: `In ${cityName(cityId)} hast du noch kein Lager.` };
  if (target && courierRoom(ctx.state, target) < weight) {
    const name = getWarehouse(ctx.state, target)?.name ?? 'Lager';
    return { ok: false, reason: `Im ${name} ist kein Platz mehr für ${pkg.label}. Bau Regale ein oder lager um.` };
  }
  const rel = relationFor(ctx, supplierId);
  if ((pkg.minTrust ?? 0) > rel.trust) {
    return { ok: false, reason: `Dafür vertraut dir ${supplier.contactName} noch nicht genug.` };
  }
  if (isBlocked(ctx.state, supplierId)) {
    return { ok: false, reason: `${supplier.contactName} liefert erst wieder, wenn du deine Schulden bezahlt hast.` };
  }
  const price = packagePrice(ctx.state, supplierId, packageId, cityId);
  if (onCredit) {
    if (creditLimit(ctx.state, supplierId) === 0) {
      return { ok: false, reason: `${supplier.contactName} gibt dir noch keinen Kredit.` };
    }
    if (price > availableCredit(ctx.state, supplierId)) {
      return { ok: false, reason: `So viel Kredit gibt dir ${supplier.contactName} nicht.` };
    }
    rel.debt += price;
    // Ein neuer Kredit schiebt die Frist hinaus: Er erbt nicht die der ältesten offenen Schuld (sonst wäre er sofort fällig).
    rel.dueAt = Math.max(rel.dueAt ?? 0, ctx.now + CREDIT_TERM);
  } else if (!wallet.pay(ctx, price, 'dirty', `Bestellung ${supplier.name}`, 'goods.purchase')) {
    return { ok: false, reason: 'Nicht genug Geld.' };
  }

  const quality = clampQuality(
    supplier.quality + supplierQualityBonus(ctx.state, supplierId) + (ctx.random() * 2 - 1) * QUALITY_SPREAD,
  );
  let problem = rollShipmentProblem(ctx.random(), supplier, rel.trust);
  // Geteilter Container: Fliegt die fremde Hälfte auf, ist die eigene mit weg (Auftrag 33).
  const sharedBust = pkg.container === 'shared' && problem !== 'seized' && ctx.chance(SHARED_CONTAINER_RISK);
  if (sharedBust) problem = 'seized';
  const shipment: Shipment = {
    id: ctx.nextId(),
    supplierId,
    packageId,
    productId: pkg.productId,
    amount: pkg.amount,
    quality,
    warehouseId: target ?? 'port',
    price,
    orderedAt: ctx.now,
    arrivesAt: ctx.now + supplier.deliveryTime,
  };
  if (cityId !== 'koeln') shipment.cityId = cityId;
  if (actor.startsWith('staff:')) shipment.orderedBy = actor;
  if (onCredit) shipment.onCredit = true;
  if (sharedBust) shipment.shared = true;
  if (toPort) {
    shipment.toPort = true;
    if (warehouse) shipment.destinationId = warehouse.id;
  }
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
  } else rollLuck(ctx, shipment, supplier.deliveryTime);
  ctx.state.modules.suppliers.shipments.push(shipment);

  rel.orders += 1;
  rel.spent += price;
  addTrust(
    ctx,
    supplierId,
    TRUST_PER_ORDER + (price / 1000) * TRUST_PER_1000_EUR + (onCredit ? 0 : TRUST_CASH_BONUS),
    cityId,
  );
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
    cityId,
  });
  return { ok: true, data: { shipmentId: shipment.id } };
}

/**
 * Ein Lieferproblem sofort eintreten lassen (Tests, Dev-Abkürzungen, Szenen für Screenshots), mit ask=true immer mit
 * Rückfrage. Gibt zurück, ob es die Lieferung gibt.
 */
export function forceShipmentProblem(ctx: Ctx, shipmentId: number, problem: 'delayed' | 'seized', ask = true): boolean {
  const s = ctx.state.modules.suppliers.shipments.find((x) => x.id === shipmentId);
  const supplier = s ? getSupplier(ctx.state, s.supplierId) : undefined;
  if (!s || !supplier) return false;
  if (s.delayMinutes) s.arrivesAt -= s.delayMinutes;
  s.luck = undefined;
  s.problem = problem;
  s.problemAt = ctx.now;
  s.problemRevealed = true;
  s.delayMinutes = problem === 'delayed' ? Math.round(supplier.deliveryTime * 0.6) : undefined;
  if (s.delayMinutes) s.arrivesAt += s.delayMinutes;
  revealProblem(ctx, s, supplier, ask);
  return true;
}

/**
 * Lager, in das Lieferungen ohne Angabe gehen: in Köln das Standardlager, sonst das erste eigene der Stadt. Passt die
 * Ware (weight Gramm) dort nicht mehr hinein, das erste Lager der Stadt, in das sie passt.
 */
function defaultWarehouse(state: GameState, cityId: string, weight = 0): string | null {
  const standard = getWarehouse(state, DEFAULT_WAREHOUSE);
  const first = standard && standard.cityId === cityId ? standard.id : (getWarehouses(state, cityId)[0]?.id ?? null);
  if (!first || courierRoom(state, first) >= weight) return first;
  return getWarehouses(state, cityId).find((w) => courierRoom(state, w.id) >= weight)?.id ?? first;
}

/** Platz in einem Lager in Gramm, abzüglich der Kurier-Lieferungen, die schon dorthin unterwegs sind. */
function courierRoom(state: GameState, warehouseId: string): number {
  let inbound = 0;
  for (const s of state.modules.suppliers.shipments) {
    if (!s.toPort && s.warehouseId === warehouseId) inbound += s.amount * unitWeight(s.productId);
  }
  return warehouseFree(state, warehouseId) - inbound;
}

/**
 * Kurier-Ware abladen (Auftrag 33): erst ins Ziel-Lager, was dort nicht passt, in die anderen Lager der Stadt (das
 * nächste zuerst). Ist alles voll, stellt der Kurier den Rest trotzdem ab (das Lager ist dann überfüllt). Gibt zurück,
 * wie viel in welchem Lager landete (für die Meldung).
 */
function unloadCourier(
  ctx: Ctx,
  s: Shipment,
  first: string,
  cityId: string,
): { warehouseId: string; amount: number }[] {
  const item = { productId: s.productId, quality: s.quality, unitCost: s.price / s.amount };
  const placed: { warehouseId: string; amount: number }[] = [];
  const put = (warehouseId: string, amount: number, retry: boolean) => {
    const result = storeFitting(ctx, { ...item, amount, warehouseId }, { retry });
    if (result.stored > 0) placed.push({ warehouseId, amount: result.stored });
    return result.rest;
  };
  let rest = put(first, s.amount, false);
  if (rest <= 0) return placed;
  const site = getWarehouse(ctx.state, first);
  const others = getWarehouses(ctx.state, cityId)
    .filter((w) => w.id !== first)
    .sort((a, b) => (site ? distance(site, a) - distance(site, b) : 0));
  // Dieselbe Ware in einem weiteren Lager zählt nicht noch einmal als abgelehnt.
  for (const w of others) {
    if (rest <= 0) break;
    rest = put(w.id, rest, true);
  }
  if (rest > 0) {
    store(ctx, { ...item, amount: rest, warehouseId: first });
    const same = placed.find((p) => p.warehouseId === first);
    if (same) same.amount += rest;
    else placed.push({ warehouseId: first, amount: rest });
    journal.add(
      ctx,
      `Alle Lager sind voll: ${formatProductAmount(s.productId, rest)} ${productName(s.productId)} stehen zusätzlich im ` +
        `${site?.name ?? 'Lager'}. Bau Regale ein oder kauf ein Lager dazu.`,
      'bad',
    );
  }
  return placed;
}

/** Wo die Ware einer Lieferung liegt, als Text: "im Lager Ehrenfeld" oder "300 g im Lager Ehrenfeld, 200 g im …". */
function placedText(state: GameState, productId: string, placed: readonly { warehouseId: string; amount: number }[]) {
  const name = (id: string) => getWarehouse(state, id)?.name ?? 'Lager';
  if (placed.length <= 1) return `im ${name(placed[0]?.warehouseId ?? '')}`;
  return placed.map((p) => `${formatProductAmount(productId, p.amount)} im ${name(p.warehouseId)}`).join(', ');
}

/** Abstand zweier Orte in Grad (reicht zum Sortieren innerhalb einer Stadt). */
const distance = (a: { lng: number; lat: number }, b: { lng: number; lat: number }) =>
  Math.hypot((a.lng - b.lng) * 0.63, a.lat - b.lat);

/**
 * Eine Stadt ist frei: Lieferanten, die dort zu Hause sind (home, z.B. Hein in Hamburg, Mirko in Berlin), sind ab jetzt
 * dabei (ohne Vermittlung). Bescheid sagen sie bei deiner Ankunft (onCityArrived).
 */
function onCityUnlocked(ctx: Ctx, cityId: string): void {
  const s = ctx.state.modules.suppliers;
  for (const supplier of getSuppliers(ctx.state)) {
    if (supplier.home?.cityId !== cityId) continue;
    if (!s.unlocked.includes(supplier.id)) {
      s.unlocked.push(supplier.id);
      if (!s.offered.includes(supplier.id)) s.offered.push(supplier.id);
      relationFor(ctx, supplier.id);
      ctx.emit('supplier.unlocked', { supplierId: supplier.id, fee: 0 });
    }
  }
}

/** Bei der ersten Ankunft in seiner Stadt meldet er sich (Auftrag 43: vorher schon bei der Zusage, vor der Fahrt). */
function onCityArrived(ctx: Ctx, cityId: string): void {
  for (const supplier of getSuppliers(ctx.state)) {
    if (supplier.home?.cityId === cityId) tell(ctx, supplier, supplier.home.welcome);
  }
}

/**
 * Rabatt-Aktionen (Auftrag 32), um Mitternacht: Abgelaufene fallen weg; in jeder freien Stadt ohne laufende Aktion
 * startet mit DEAL_CHANCE_PER_DAY eine neue bei einem Lieferanten, der dort an dich liefert. Er sagt es still per Handy.
 */
function rollDeals(ctx: Ctx): void {
  const s = ctx.state.modules.suppliers;
  s.deals = s.deals.filter((d) => d.endsAt > ctx.now);
  // Nach dem Verkauf kaufst du nicht mehr bei den alten Lieferanten (Auftrag 43).
  if (isBusinessSold(ctx.state)) return;
  const day = Math.floor(ctx.now / MINUTES_PER_DAY);
  for (const cityId of citiesUnlocked(ctx.state)) {
    // Würfel pro Stadt und Tag (Auftrag 40): unabhängig davon, welche Städte sonst frei sind.
    const dice = cityDayDice(ctx.state.meta.seed, 'suppliers.deal', cityId, day);
    if (s.deals.some((d) => d.cityId === cityId) || !dice.chance(DEAL_CHANCE_PER_DAY)) continue;
    const offers = getSuppliers(ctx.state, cityId)
      .filter((supplier) => !isBlocked(ctx.state, supplier.id))
      .flatMap((supplier) => availablePackages(ctx.state, supplier.id, cityId).map((pkg) => ({ supplier, pkg })));
    if (offers.length === 0) continue;
    const { supplier, pkg } = dice.pick(offers);
    const [minDiscount, maxDiscount] = DEAL_DISCOUNT;
    const discount = Math.round((minDiscount + dice.random() * (maxDiscount - minDiscount)) * 20) / 20;
    const [minDays, maxDays] = DEAL_DAYS;
    const deal: SupplierDeal = {
      id: ctx.nextId(),
      supplierId: supplier.id,
      packageId: pkg.id,
      cityId,
      discount,
      startedAt: ctx.now,
      endsAt: ctx.now + dice.randomInt(minDays, maxDays) * MINUTES_PER_DAY,
    };
    s.deals.push(deal);
    const until = `${clock.weekdayName(deal.endsAt - 1)} Abend`;
    const text = dice
      .pick(DEAL_PITCHES)
      .replace('{package}', `${pkg.label}${citiesUnlocked(ctx.state).length > 1 ? ` für ${cityName(cityId)}` : ''}`)
      .replace('{discount}', `${Math.round(discount * 100)} %`)
      .replace('{until}', until);
    // Gesagt wird es nur für die Stadt, in der du bist (Auftrag 43); die Aktion anderswo steht in der App dieser Stadt.
    if (cityId === activeCity(ctx.state)) messages.send(ctx, { contact: contactOf(supplier), text, silent: true });
    ctx.emit('supplier.dealStarted', {
      dealId: deal.id,
      supplierId: supplier.id,
      packageId: pkg.id,
      cityId,
      discount,
      endsAt: deal.endsAt,
    });
  }
}

function unlock(ctx: Ctx, supplierId: string): CommandResult {
  const allowed = canUnlock(ctx.state, supplierId);
  if (!allowed.ok) return allowed;
  const supplier = getSupplier(ctx.state, supplierId);
  if (!supplier) return { ok: false, reason: 'Unbekannter Lieferant.' };
  const fee = supplier.unlock?.fee ?? 0;
  if (fee > 0 && !wallet.pay(ctx, fee, 'dirty', `Vermittlung ${supplier.name}`, 'expansion')) {
    return { ok: false, reason: `${supplier.contactName} will ${formatEuro(fee)} für den Einstieg.` };
  }
  const s = ctx.state.modules.suppliers;
  s.unlocked.push(supplierId);
  if (!s.offered.includes(supplierId)) s.offered.push(supplierId);
  relationFor(ctx, supplierId);
  journal.add(
    ctx,
    `${supplier.contactName} (${supplier.name}) liefert jetzt an dich${fee > 0 ? ` (${formatEuro(fee)} Vermittlung)` : ''}.`,
    'good',
  );
  // Das Angebot des Lieferanten im Chat ist erledigt, auch wenn er über die App freigeschaltet wurde.
  messages.retractWhere(
    ctx,
    (m) =>
      !!m.options?.some((o) => o.command?.type === 'suppliers.unlock' && o.command.payload.supplierId === supplierId),
  );
  tell(ctx, supplier, voice(ctx, supplier, 'unlocked'));
  ctx.emit('supplier.unlocked', { supplierId, fee });
  return { ok: true };
}

/** Wer die Bedingungen erfüllt und sich noch nicht gemeldet hat, schreibt dem Spieler (einmal). */
function offerUnlocks(ctx: Ctx): void {
  const s = ctx.state.modules.suppliers;
  for (const supplier of getSuppliers(ctx.state)) {
    if (!supplier.unlock || s.offered.includes(supplier.id) || !canUnlock(ctx.state, supplier.id).ok) continue;
    s.offered.push(supplier.id);
    const fee = supplier.unlock.fee;
    messages.send(ctx, {
      contact: contactOf(supplier),
      text: supplier.unlock.pitch.replace('{fee}', formatEuro(fee)),
      options: [
        {
          id: 'unlock',
          label: fee > 0 ? `Einsteigen (${formatEuro(fee)})` : 'Geschäfte machen',
          reply: 'Deal.',
          command: { type: 'suppliers.unlock', payload: { supplierId: supplier.id } },
        },
        { id: 'later', label: 'Später', reply: 'Ich überleg es mir.' },
      ],
    });
    journal.add(ctx, `${supplier.contactName} aus ${supplier.name} will mit dir Geschäfte machen.`, 'good');
  }
}

function repay(ctx: Ctx, supplierId: string, amount?: number): CommandResult {
  const supplier = getSupplier(ctx.state, supplierId);
  if (!supplier) return { ok: false, reason: 'Unbekannter Lieferant.' };
  const rel = relationFor(ctx, supplierId);
  if (rel.debt <= 0) return { ok: false, reason: `Du hast keine Schulden bei ${supplier.contactName}.` };
  const pay = Math.round(Math.min(rel.debt, amount ?? rel.debt));
  if (!(pay > 0)) return { ok: false, reason: 'Ungültiger Betrag.' };
  if (!wallet.pay(ctx, pay, 'dirty', `Schulden ${supplier.name}`, 'goods.purchase'))
    return { ok: false, reason: 'Nicht genug Geld.' };
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
    revealProblem(ctx, s, supplier);
  }
}

function deliver(ctx: Ctx): void {
  const state = ctx.state.modules.suppliers;
  const arrived = state.shipments.filter((s) => s.arrivesAt <= ctx.now);
  if (arrived.length === 0) return;
  state.shipments = state.shipments.filter((s) => s.arrivesAt > ctx.now);
  const placedIn = new Map<number, string>();
  for (const s of arrived) {
    const supplier = getSupplier(ctx.state, s.supplierId);
    if (supplier) applyArrivalLuck(ctx, s, supplier);
    if (s.toPort) {
      // Schiffsware: am Kai abladen, abholen muss der Spieler (logistics schreibt Journal und Nachricht).
      receiveCargo(ctx, {
        supplierId: s.supplierId,
        productId: s.productId,
        amount: s.amount,
        quality: s.quality,
        unitCost: Math.round((s.price / s.amount) * 100) / 100,
        cityId: s.cityId ?? 'koeln',
        ...(s.destinationId && getWarehouse(ctx.state, s.destinationId) ? { warehouseId: s.destinationId } : {}),
      });
    } else {
      // Gehört das Ziel-Lager nicht mehr dir, geht die Ware ins nächste eigene.
      const warehouse =
        getWarehouse(ctx.state, s.warehouseId) ??
        nearestWarehouse(ctx.state, getCity(s.cityId ?? 'koeln')?.center ?? supplier ?? { lng: 0, lat: 0 });
      const placed = unloadCourier(ctx, s, warehouse?.id ?? s.warehouseId, s.cityId ?? 'koeln');
      const goods = `${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)}`;
      const where = placedText(ctx.state, s.productId, placed);
      // Aus einer anderen Stadt mit Stadtname (Auftrag 43, G10: im Hamburger Verlauf standen Kölner Lieferungen ohne Ort).
      const city = s.cityId ?? 'koeln';
      const prefix = city === activeCity(ctx.state) ? '' : `${cityName(city)}: `;
      // Was deine Leute bestellt haben, steht nicht im Journal (Auftrag 43, K10: 16 von 60 Einträgen waren Lieferungen),
      // außer die Ware musste verteilt werden.
      if (!s.orderedBy || placed.length > 1) {
        journal.add(
          ctx,
          `${prefix}Lieferung angekommen: ${goods}${placed.length > 1 ? ', verteilt: ' : ' '}${where}.`,
          'good',
        );
      }
      if (placed.length > 1) placedIn.set(s.id, where);
    }
    if (s.problem === 'badQuality' && supplier) {
      s.problemRevealed = true;
      const why = rollReason(ctx, s, supplier, 'badQuality');
      tellAbout(ctx, supplier, s, voice(ctx, supplier, 'badQuality', why));
      journal.add(ctx, `Die Ware von ${supplier.name} ist schlechter als versprochen (${why.reasonLabel}).`, 'bad');
      ctx.emit('shipment.problem', {
        shipmentId: s.id,
        supplierId: s.supplierId,
        kind: 'badQuality',
        reason: why.reasonLabel,
      });
    }
    ctx.emit('shipment.arrived', {
      shipmentId: s.id,
      supplierId: s.supplierId,
      productId: s.productId,
      amount: s.amount,
      warehouseId: s.toPort ? 'port' : s.warehouseId,
      quality: s.quality,
      ...(s.toPort ? { atPort: true } : {}),
      ...(placedIn.has(s.id) ? { placedIn: placedIn.get(s.id) } : {}),
      ...(s.orderedBy ? { byStaff: true } : {}),
      cityId: shipmentCity(s),
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
      voice(ctx, supplier, rel.overdue === 1 ? 'overdue' : 'overdueAgain', { debt: formatEuro(rel.debt) }),
    );
    journal.add(ctx, `Schulden bei ${supplier.name} überfällig: ${formatEuro(rel.debt)} inkl. Aufschlag.`, 'bad');
    ctx.emit('supplier.overdue', { supplierId, debt: rel.debt });
  }
}

const clampQuality = (q: number) => Math.round(Math.min(0.98, Math.max(0.05, q)) * 100) / 100;

function initialRelations(): Record<string, SupplierRelation> {
  return Object.fromEntries(SUPPLIERS.map((s) => [s.id, newRelation()]));
}

/** Lieferanten ohne Bedingungen (am Anfang zu haben). */
function openFromStart(): string[] {
  return SUPPLIERS.filter((s) => !s.unlock).map((s) => s.id);
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
  version: 6,
  dependsOn: ['goods'],
  init: (ctx) => {
    const frankfurt = SUPPLIERS.find((s) => s.id === 'frankfurt') ?? SUPPLIERS[0];
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
    return {
      deals: [],
      shipments: [],
      relations: initialRelations(),
      unlocked: openFromStart(),
      offered: openFromStart(),
    };
  },
  tick: (ctx) => {
    revealProblems(ctx);
    upkeepDecisions(ctx);
    deliver(ctx);
    checkDebts(ctx);
    if (ctx.now % 60 === 0) offerUnlocks(ctx);
    if (ctx.now % MINUTES_PER_DAY === 0) rollDeals(ctx);
  },
  commands: {
    'suppliers.order': (ctx, { supplierId, packageId, onCredit, warehouseId }, meta) =>
      order(ctx, supplierId, packageId, !!onCredit, warehouseId, meta.actor),
    'suppliers.repay': (ctx, { supplierId, amount }) => repay(ctx, supplierId, amount),
    'suppliers.resolveProblem': (ctx, { shipmentId, choice }) => resolveProblem(ctx, shipmentId, choice),
    'suppliers.unlock': (ctx, { supplierId }) => unlock(ctx, supplierId),
  },
  on: {
    'city.unlocked': (ctx, { cityId }) => onCityUnlocked(ctx, cityId),
    'city.arrived': (ctx, { cityId, first }) => {
      if (first) onCityArrived(ctx, cityId);
    },
  },
  migrations: {
    2: (old: SuppliersStateV1): SuppliersStateV2 => ({ shipments: old.shipments, relations: initialRelations() }),
    // Version 3: Lieferanten werden freigeschaltet. Alte Spielstände kennen schon alle bisherigen Lieferanten.
    3: (old: SuppliersStateV2): SuppliersStateV4 => {
      const known = ['rotterdam', 'frankfurt', 'berlin', 'hamburg'];
      return { ...old, unlocked: [...known], offered: [...known] };
    },
    // Version 4: Lieferanten ohne Bedingungen (Köln, Kalle) sind von Anfang an zu haben. Alte Spielstände hatten ihn
    // nie bekommen, er blieb "bereit" ohne Knopf zum Freischalten.
    4: (old: SuppliersStateV4): SuppliersStateV4 => {
      const open = openFromStart();
      const withOpen = (ids: string[]) => [...ids, ...open.filter((id) => !ids.includes(id))];
      return { ...old, unlocked: withOpen(old.unlocked), offered: withOpen(old.offered) };
    },
    // Version 5 (Auftrag 32): Rabatt-Aktionen.
    5: (old: SuppliersStateV4): SuppliersState => ({ ...old, deals: [] }),
    // Version 6 (Auftrag 23): Lieferungen tragen Weg, Grund, Rückfrage, Antwort und Chance (alles optional). Alte
    // Lieferungen laufen ohne Grund weiter; eine schon bekannte Verspätung bekommt keine Rückfrage mehr.
    6: (old: SuppliersState): SuppliersState => ({
      ...old,
      shipments: old.shipments.map((s) => ({ ...s })),
    }),
  },
  // Pleite-Regel: Wer eine Lieferung erwartet oder sich eine leisten kann (bar oder auf Kredit), macht weiter.
  solvency: (state) =>
    state.modules.suppliers.shipments.length > 0 || getSuppliers(state).some((s) => canRestock(state, s)),
});
