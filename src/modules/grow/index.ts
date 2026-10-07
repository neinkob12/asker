// Eigene Produktion im Ausland (Auftrag 42, Phase 4 aus plan.md). Nach einigen Wochen als Lieferant am Hafen
// (CALL_AFTER_WEEKS, CALL_MIN_REVENUE) rufen Esteban aus Kolumbien und Hassan aus Marokko an; nimmst du an, ist die
// Region frei (city.REGIONS) und die Europa-Ansicht reicht bis Südamerika und Nordafrika.
//
// Die Kette einer Finca:
//   kaufen oder pachten (sauberes Geld) → Arbeiter und Gärtner anheuern (Rollen in staff, die Region ist ihr Ort) →
//   pflanzen (Ware, Genetik als Qualität; im Freien 60 Tage, im Gewächshaus 30) → Ernte → Trocknen → Pressen (nur
//   Hasch) → Verpacken (bessere Verpackung senkt die Chance einer Zollkontrolle) → Ausfuhrlager in Cartagena bzw. Tanger
//   (trade.storeExport). Von dort fahren Container und eigene Schiffe wie bei jedem Produzenten (trade.buy, trade.sail
//   mit dem Ausfuhrhafen als Produzent); in Europa ist die Ware als eigene Produktion markiert.
//
// Zwei Zahlen pro Region, kein neues Drama: der Anteil des Kartells (zahlen oder nicht; ohne Zahlung schlägt es mit
// Chance zu) und die Aufmerksamkeit der Behörden (wie eine Heat; hoch → Razzia auf einer Finca, Schmiergeld senkt sie).
//
// Ziele: „Produzent“ (die Hälfte der gelieferten Gramm aus eigener Produktion) und „Europa“ (jeder Kunde aus eigener
// Produktion versorgt). Danach geht es offen weiter. city liest die Ziele für die Ränge (growGoals).
//
// Zufall: nie ctx.random(). Alles würfelt fest aus Seed, Region und Tag (cityDayDice) bzw. aus einem Schlüssel
// (keyedDice), damit die Produktion den gemeinsamen Würfelstrom nicht verschiebt; vor dem ersten Anruf passiert nichts.
//
// Öffentliche API: growState, isGrowStarted, regionStatus, openRegions, getFincas, getFinca, fincaSites, siteTaken,
//   fincaWorkers, fincaGardener, workersNeeded, fincaQuality, expectedHarvest, fincaRunningCost, cropDays, landPrice,
//   leasePerWeek, greenhouseCost, nextGenetics, regionAttention, cartelPaid, costPerGram, harvestLog, goalShares,
//   growGoals, REGION_ECONOMY, GENETICS, PACKINGS, FINCA_SITES
// Befehle: 'grow.openRegion', 'grow.buyFinca', 'grow.leaseFinca', 'grow.hire', 'grow.dismiss', 'grow.plant',
//   'grow.buildGreenhouse', 'grow.upgradeGenetics', 'grow.setPacking', 'grow.setCartel', 'grow.bribe'
// Ereignisse: 'grow.called', 'grow.regionOpened', 'grow.fincaAcquired', 'grow.planted', 'grow.harvested',
//   'grow.packed', 'grow.raided', 'grow.cartelHit', 'grow.goalReached'

import {
  type CommandResult,
  type Contact,
  type Ctx,
  cityDayDice,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  keyedDice,
  MINUTES_PER_DAY,
  messages,
  wallet,
} from '../../core';
import { getRegion, REGIONS } from '../city';
import { productName } from '../goods';
import {
  addXp,
  enlist,
  getStaffMember,
  type RecruitProfile,
  ROLE_INFO,
  removeMember,
  STAT_KEYS,
  type StaffRole,
  type StaffStats,
  staffContact,
} from '../staff';
import {
  EUROPE_CITIES,
  getCustomers,
  isTradeActive,
  loseOrigin,
  regionOrigin,
  shippingMinutes,
  storeExport,
  tradeStats,
} from '../trade';
import {
  ATTENTION,
  BRIBE_COOLDOWN_DAYS,
  BRIBE_RELIEF,
  CALL_AFTER_WEEKS,
  CALL_MIN_REVENUE,
  CARTEL_HIT_CHANCE,
  CARTEL_HIT_LOSS,
  CROP_PRODUCTS,
  DRY_DAYS,
  EUROPE_SHARE,
  EUROPE_WINDOW_DAYS,
  GARDENER_PER_LEVEL,
  GARDENER_XP_PER_HARVEST,
  GENETICS,
  GREENHOUSE_PER_HA,
  GREENHOUSE_QUALITY,
  GROW_DAYS,
  HASH_YIELD,
  HIRE_DAYS,
  LEASE_LOST_DAYS,
  MAX_QUALITY,
  NO_GARDENER,
  PACK_DAYS,
  PRESS_DAYS,
  PRODUCER_MIN_GRAMS,
  PRODUCER_SHARE,
  PRODUCER_WINDOW_DAYS,
  REGION_ECONOMY,
  type RegionEconomy,
  SECOND_CALL_DELAY,
  STANDING_CROP_DAYS,
  SUPPLIES_PER_HA,
  WORKERS_PER_HA,
  YIELD_PER_HA,
} from './config';
import { CALL_LINES, CALL_TEXTS, FINCA_SITES, type FincaSite, LOCAL_NAMES, PACKINGS, type Packing } from './data';

export {
  CALL_AFTER_WEEKS,
  CALL_MIN_REVENUE,
  CARTEL_HIT_CHANCE,
  CARTEL_HIT_LOSS,
  CROP_PRODUCTS,
  EUROPE_WINDOW_DAYS,
  GENETICS,
  GROW_DAYS,
  PRODUCER_SHARE,
  PRODUCER_WINDOW_DAYS,
  REGION_ECONOMY,
  type RegionEconomy,
} from './config';
export { FINCA_SITES, type FincaSite, PACKINGS, type Packing } from './data';

// ---------------------------------------------------------------------------------------------
// Zustand, Befehle, Ereignisse

/** none: noch kein Anruf; called: der Anruf kam (Angebot steht); open: die Region ist frei. */
export type RegionStatus = 'none' | 'called' | 'open';

export interface GrowRegion {
  status: RegionStatus;
  /** Wann der Anruf kommen soll (Marokko nach Kolumbien), null = schon da oder noch nicht geplant. */
  callAt: number | null;
  /** Zahlst du dem Kartell seinen Anteil? */
  cartelPaid: boolean;
  /** Aufmerksamkeit der Behörden (0–100). */
  attention: number;
  /** Zuletzt geschmiert (Spielminute), null = nie. */
  bribedAt: number | null;
}

/** Was auf dem Feld steht. */
export interface Crop {
  productId: string;
  plantedAt: number;
  readyAt: number;
  /** Was schon verloren ist (Razzia, Kartell), 0–1. */
  loss: number;
}

export type BatchStage = 'drying' | 'pressing' | 'packing';

/** Geerntete Ware auf dem Weg ins Ausfuhrlager. */
export interface Batch {
  productId: string;
  grams: number;
  quality: number;
  stage: BatchStage;
  until: number;
  /** Verpackung, sobald verpackt wird. */
  packing?: Packing['id'];
  /** Was diese Ernte gekostet hat (laufende Kosten seit der Aussaat, für den Preis pro Gramm). */
  cost: number;
}

export interface Finca {
  id: number;
  siteId: string;
  regionId: string;
  name: string;
  hectares: number;
  tenure: 'owned' | 'leased';
  /** Pacht bezahlt bis (Spielminute); danach jeden Tag ein Siebtel der Woche. */
  leasePaidUntil: number;
  greenhouse: boolean;
  /** Stufe in GENETICS. */
  genetics: number;
  /** Was nach der Ernte wieder gepflanzt wird (null = nichts). */
  plan: string | null;
  crop: Crop | null;
  batch: Batch | null;
  packing: Packing['id'];
  workerIds: string[];
  gardenerId: string | null;
  /** Laufende Kosten seit der letzten Aussaat (Löhne, Pacht, Dünger), für den Preis pro Gramm. */
  spent: number;
  /** Tage in Folge ohne Pacht (nach LEASE_LOST_DAYS ist das Land weg). */
  unpaidLease: number;
  /** Heute keine Löhne bezahlt: Die Leute arbeiten nicht. */
  unpaidWages: boolean;
  /** Säen ging nicht (kein Geld), der Gärtner hat es schon gesagt; nächster Versuch täglich. */
  stalled: boolean;
  harvests: number;
  acquiredAt: number;
}

/** Eine fertige Ernte (für den Preis pro Gramm über die Zeit). */
export interface HarvestRecord {
  at: number;
  fincaId: number;
  regionId: string;
  productId: string;
  grams: number;
  cost: number;
}

/** Eine Lieferung an einen Kunden (aus trade.delivered), für die Ziele. */
export interface DeliveryRecord {
  at: number;
  customerId: string;
  grams: number;
  own: number;
  /** Davon Waren, die man anbauen kann (CROP_PRODUCTS), und wie viel davon eigene war. */
  crop: number;
  cropOwn: number;
}

export interface GrowStats {
  harvested: number;
  packed: number;
  cartelTaken: number;
  lostToCartel: number;
  lostToRaids: number;
  raids: number;
  cartelHits: number;
  invested: number;
}

export interface GrowState {
  /** Wann die Anrufe ausgelöst wurden (Beginn der Produktions-Phase), null = noch nicht. */
  startedAt: number | null;
  regions: Record<string, GrowRegion>;
  fincas: Finca[];
  harvests: HarvestRecord[];
  deliveries: DeliveryRecord[];
  /** Ziele erreicht seit (Spielminute), null = noch nicht. */
  goals: { producer: number | null; europe: number | null };
  /** Zuletzt gewürfelter Tag (Razzien, Kartell). */
  day: number;
  stats: GrowStats;
}

declare module '../../core' {
  interface ModuleStates {
    grow: GrowState;
  }
  interface GameCommands {
    /** Angebot aus einer Region annehmen: Die Region ist frei, Fincas lassen sich kaufen oder pachten. */
    'grow.openRegion': { regionId: string };
    'grow.buyFinca': { siteId: string };
    'grow.leaseFinca': { siteId: string };
    /** Leute vor Ort anheuern (Arbeiter: count, Gärtner: einer pro Finca). */
    'grow.hire': { fincaId: number; role: 'worker' | 'gardener'; count?: number };
    'grow.dismiss': { fincaId: number; role: 'worker' | 'gardener'; count?: number };
    /** Pflanzen (oder für die nächste Aussaat vormerken, wenn noch etwas steht). productId null = nichts mehr. */
    'grow.plant': { fincaId: number; productId: string | null };
    'grow.buildGreenhouse': { fincaId: number };
    'grow.upgradeGenetics': { fincaId: number };
    'grow.setPacking': { fincaId: number; packing: Packing['id'] };
    'grow.setCartel': { regionId: string; pay: boolean };
    'grow.bribe': { regionId: string };
  }
  interface GameEvents {
    'grow.called': { regionId: string };
    'grow.regionOpened': { regionId: string };
    'grow.fincaAcquired': { fincaId: number; regionId: string; tenure: 'owned' | 'leased'; cost: number };
    'grow.planted': { fincaId: number; productId: string; readyAt: number };
    'grow.harvested': { fincaId: number; productId: string; grams: number; cartel: number };
    'grow.packed': { fincaId: number; productId: string; grams: number; originId: string; costPerGram: number };
    'grow.raided': { regionId: string; fincaId: number; share: number };
    'grow.cartelHit': { regionId: string; fincaId: number | null; share: number };
    'grow.goalReached': { goal: 'producer' | 'europe' };
    /** Auftrag 43: Lohn oder Pacht nicht bezahlt (der erste Tag), das Feld liegt brach, die Finca ist weg. */
    'grow.unpaid': { fincaId: number; kind: 'wages' | 'lease' };
    'grow.stalled': { fincaId: number };
    'grow.fincaLost': { fincaId: number; regionId: string; name: string };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

const SITE_BY_ID = new Map(FINCA_SITES.map((s) => [s.id, s]));
const PACKING_BY_ID = new Map(PACKINGS.map((p) => [p.id, p]));
const DAY = MINUTES_PER_DAY;

export function growState(state: GameState): GrowState | undefined {
  return state.modules.grow as GrowState | undefined;
}

/** Haben die Anrufe begonnen (Produktions-Phase)? */
export function isGrowStarted(state: GameState): boolean {
  return (growState(state)?.startedAt ?? null) !== null;
}

export function regionStatus(state: GameState, regionId: string): RegionStatus {
  return growState(state)?.regions[regionId]?.status ?? 'none';
}

/** Freie Regionen (Angebot angenommen). */
export function openRegions(state: GameState): string[] {
  return REGIONS.filter((r) => regionStatus(state, r.id) === 'open').map((r) => r.id);
}

/**
 * Wann eine Ernte verpackt im Ausfuhrlager liegt (Auftrag 43, I1): Ende der laufenden Stufe plus die Stufen danach
 * (Hasch: trocknen, pressen, verpacken; sonst trocknen, verpacken).
 */
export function batchStoredAt(batch: Batch): number {
  const later =
    batch.stage === 'drying'
      ? (batch.productId === 'hash' ? PRESS_DAYS : 0) + PACK_DAYS
      : batch.stage === 'pressing'
        ? PACK_DAYS
        : 0;
  return batch.until + later * DAY;
}

export function getFincas(state: GameState, regionId?: string): readonly Finca[] {
  const list = growState(state)?.fincas ?? [];
  return regionId ? list.filter((f) => f.regionId === regionId) : list;
}

export function getFinca(state: GameState, id: number): Finca | undefined {
  return getFincas(state).find((f) => f.id === id);
}

/** Fincas einer Region zum Kaufen oder Pachten. */
export function fincaSites(regionId: string): readonly FincaSite[] {
  return FINCA_SITES.filter((s) => s.regionId === regionId);
}

/** Gehört dir die Finca schon (gekauft oder gepachtet)? */
export function siteTaken(state: GameState, siteId: string): boolean {
  return getFincas(state).some((f) => f.siteId === siteId);
}

function economy(regionId: string): RegionEconomy {
  return REGION_ECONOMY[regionId] ?? REGION_ECONOMY.kolumbien;
}

export function landPrice(site: FincaSite): number {
  return site.hectares * economy(site.regionId).landPrice;
}

export function leasePerWeek(site: Pick<FincaSite, 'hectares' | 'regionId'>): number {
  return site.hectares * economy(site.regionId).leasePerWeek;
}

export function greenhouseCost(finca: Pick<Finca, 'hectares'>): number {
  return finca.hectares * GREENHOUSE_PER_HA;
}

/** Nächste Stufe der Genetik mit Preis, null = schon die beste. */
export function nextGenetics(finca: Pick<Finca, 'genetics'>): { level: number; cost: number } | null {
  const next = GENETICS[finca.genetics + 1];
  return next ? { level: finca.genetics + 1, cost: next.cost } : null;
}

export function workersNeeded(finca: Pick<Finca, 'hectares'>): number {
  return Math.ceil(finca.hectares * WORKERS_PER_HA);
}

export function fincaWorkers(state: GameState, finca: Finca): number {
  // Ohne Lohn arbeitet niemand.
  if (finca.unpaidWages) return 0;
  return finca.workerIds.filter((id) => getStaffMember(state, id)?.status === 'active').length;
}

export function fincaGardener(state: GameState, finca: Finca) {
  return finca.gardenerId ? getStaffMember(state, finca.gardenerId) : undefined;
}

/** Tage bis zur Ernte (Freiland oder Gewächshaus). */
export function cropDays(finca: Pick<Finca, 'greenhouse'>): number {
  return finca.greenhouse ? GROW_DAYS.greenhouse : GROW_DAYS.outdoor;
}

/** Qualität der nächsten Ernte (Genetik, Region, Gewächshaus, Gärtner). */
export function fincaQuality(state: GameState, finca: Finca): number {
  const gardener = fincaGardener(state, finca);
  const bonus = gardener ? (gardener.level - 1) * GARDENER_PER_LEVEL.quality : NO_GARDENER.quality;
  const q =
    (GENETICS[finca.genetics]?.quality ?? GENETICS[0].quality) +
    economy(finca.regionId).qualityBonus +
    (finca.greenhouse ? GREENHOUSE_QUALITY : 0) +
    bonus;
  return Math.round(Math.max(0.3, Math.min(MAX_QUALITY, q)) * 1000) / 1000;
}

/** Ernte in Gramm (fertige Ware, vor dem Anteil des Kartells) mit den Leuten und der Genetik von jetzt. */
export function expectedHarvest(
  state: GameState,
  finca: Finca,
  productId = finca.crop?.productId ?? finca.plan,
): number {
  if (!productId) return 0;
  const gardener = fincaGardener(state, finca);
  const people = Math.min(1, fincaWorkers(state, finca) / Math.max(1, workersNeeded(finca)));
  const care = gardener ? 1 + (gardener.level - 1) * GARDENER_PER_LEVEL.yield : NO_GARDENER.yield;
  const perHa = finca.greenhouse ? YIELD_PER_HA.greenhouse : YIELD_PER_HA.outdoor;
  const press = productId === 'hash' ? HASH_YIELD : 1;
  const loss = 1 - (finca.crop?.loss ?? 0);
  const genetics = GENETICS[finca.genetics]?.yield ?? 1;
  return Math.round((finca.hectares * perHa * genetics * people * care * press * loss) / 100) * 100;
}

/** Löhne pro Tag (Arbeiter und Gärtner), bar vor Ort. */
export function fincaWages(state: GameState, finca: Finca): number {
  return [...finca.workerIds, ...(finca.gardenerId ? [finca.gardenerId] : [])].reduce(
    (sum, id) => sum + (getStaffMember(state, id)?.wage ?? 0),
    0,
  );
}

/** Laufende Kosten pro Tag (Löhne bar, Pacht sauber). */
export function fincaRunningCost(state: GameState, finca: Finca): number {
  const lease = finca.tenure === 'leased' ? leasePerWeek(finca) / 7 : 0;
  return Math.round(fincaWages(state, finca) + lease);
}

/**
 * Tage von der Ernte bis in den Hafen (Rotterdam, Linienschiff): Trocknen, Pressen (Hasch), Verpacken und der Seeweg ab
 * dem Ausfuhrhafen. Marokko ist der schnelle Einstieg, Kolumbien der weite Weg.
 */
export function harvestToHarborDays(regionId: string, productId = economy(regionId).crops[0]): number {
  const origin = regionOrigin(regionId);
  const sea = origin ? shippingMinutes(origin.id, 'rotterdam') / DAY : 0;
  return Math.round(DRY_DAYS + (productId === 'hash' ? PRESS_DAYS : 0) + PACK_DAYS + sea);
}

export function regionAttention(state: GameState, regionId: string): number {
  return growState(state)?.regions[regionId]?.attention ?? 0;
}

export function cartelPaid(state: GameState, regionId: string): boolean {
  return growState(state)?.regions[regionId]?.cartelPaid ?? true;
}

/** Schmieren geht wieder ab (Spielminute), null = jetzt. */
export function bribeReadyAt(state: GameState, regionId: string): number | null {
  const at = growState(state)?.regions[regionId]?.bribedAt ?? null;
  if (at === null) return null;
  const ready = at + BRIBE_COOLDOWN_DAYS * DAY;
  return ready > state.time ? ready : null;
}

export function harvestLog(state: GameState): readonly HarvestRecord[] {
  return growState(state)?.harvests ?? [];
}

/**
 * Was ein Gramm eigener Ware gekostet hat (laufende Kosten der Fincas durch die Gramm im Ausfuhrlager), über die letzten
 * count Ernten (Standard alle); null ohne Ernte. Kauf, Gewächshaus und Genetik sind Investitionen und zählen nicht mit.
 */
export function costPerGram(state: GameState, count?: number): number | null {
  const list = harvestLog(state);
  const take = count === undefined ? list : list.slice(-count);
  const grams = take.reduce((sum, h) => sum + h.grams, 0);
  if (grams <= 0) return null;
  return Math.round((take.reduce((sum, h) => sum + h.cost, 0) / grams) * 100) / 100;
}

export function growStats(state: GameState): GrowStats {
  return growState(state)?.stats ?? emptyStats();
}

/**
 * Anteil eigener Ware in den letzten days Tagen (Standard: das Fenster für „Produzent“): gesamt und pro Kunde (Gramm).
 * cropOnly: nur Waren, die man anbauen kann (für „Europa“; Laborware zählt dort nicht).
 */
export function goalShares(
  state: GameState,
  days: number = PRODUCER_WINDOW_DAYS,
  cropOnly = false,
): {
  grams: number;
  own: number;
  share: number;
  customers: Map<string, { grams: number; own: number }>;
} {
  const from = state.time - days * DAY;
  const customers = new Map<string, { grams: number; own: number }>();
  let grams = 0;
  let own = 0;
  for (const record of growState(state)?.deliveries ?? []) {
    if (record.at < from) continue;
    const d = cropOnly ? { ...record, grams: record.crop, own: record.cropOwn } : record;
    grams += d.grams;
    own += d.own;
    const c = customers.get(d.customerId) ?? { grams: 0, own: 0 };
    c.grams += d.grams;
    c.own += d.own;
    customers.set(d.customerId, c);
  }
  return { grams, own, share: grams > 0 ? own / grams : 0, customers };
}

/** Wie weit „Europa“ ist: Kunden (beliefert in der Zeit) mit genug eigener Ware, Städte in Europa noch ohne. */
export function europeProgress(state: GameState): EuropeProgress {
  const { customers } = goalShares(state, EUROPE_WINDOW_DAYS, true);
  const all = getCustomers(state);
  const missing: string[] = [];
  let supplied = 0;
  let total = 0;
  const customersOk: string[] = [];
  const customersMissing: string[] = [];
  for (const customer of all) {
    const c = customers.get(customer.id);
    const isEurope = customer.kind === 'europe';
    if (!c && !isEurope) continue;
    total++;
    // Wer nur Laborware bekam (nichts zum Anbauen), ist versorgt; eine Stadt in Europa ohne Lieferung nicht.
    if (c && (c.grams === 0 || c.own / c.grams >= EUROPE_SHARE)) {
      supplied++;
      customersOk.push(customer.name);
    } else {
      missing.push(customer.name);
      customersMissing.push(customer.name);
    }
  }
  const citiesMissing: string[] = [];
  for (const city of EUROPE_CITIES) {
    if (all.some((c) => c.europeId === city.id)) continue;
    total++;
    missing.push(city.name);
    citiesMissing.push(city.name);
  }
  return {
    supplied,
    total,
    missing,
    cities: {
      joined: EUROPE_CITIES.length - citiesMissing.length,
      total: EUROPE_CITIES.length,
      missing: citiesMissing,
    },
    customers: {
      supplied: customersOk.length,
      total: customersOk.length + customersMissing.length,
      missing: customersMissing,
    },
  };
}

/**
 * Stand des Ziels „Europa“ (Auftrag 43, I3): zusammen (supplied/total/missing) und getrennt nach den zwei Bedingungen,
 * damit der Nenner nicht mit dem Lieferfenster springt: Städte in Europa, die kaufen (fest), und Kunden der letzten
 * EUROPE_WINDOW_DAYS Tage, die zur Hälfte eigene Ware bekamen.
 */
export interface EuropeProgress {
  supplied: number;
  total: number;
  missing: string[];
  cities: { joined: number; total: number; missing: string[] };
  customers: { supplied: number; total: number; missing: string[] };
}

/** Erreichte Ziele (für die Ränge in city und die Bestenliste). */
export function growGoals(state: GameState): { producer: boolean; europe: boolean } {
  const goals = growState(state)?.goals;
  return { producer: (goals?.producer ?? null) !== null, europe: (goals?.europe ?? null) !== null };
}

// ---------------------------------------------------------------------------------------------
// Schreiben

function emptyStats(): GrowStats {
  return {
    harvested: 0,
    packed: 0,
    cartelTaken: 0,
    lostToCartel: 0,
    lostToRaids: 0,
    raids: 0,
    cartelHits: 0,
    invested: 0,
  };
}

function regionState(ctx: Ctx, regionId: string): GrowRegion {
  const s = ctx.state.modules.grow;
  s.regions[regionId] ??= { status: 'none', callAt: null, cartelPaid: true, attention: 0, bribedAt: null };
  return s.regions[regionId];
}

/**
 * Löhne und Dünger: bar vor Ort (Schwarzgeld), sonst sauberes Geld; false, wenn beides nicht reicht. Die Pacht geht nur
 * sauber; deshalb zuerst schwarz (Auftrag 43: vorher fraßen Löhne das saubere Geld, und die Finca ging an der Pacht
 * verloren, obwohl genug Schwarzgeld da war).
 */
function payLocal(
  ctx: Ctx,
  amount: number,
  reason: string,
  category: 'grow.wages' | 'grow.supplies',
  cityId: string,
): boolean {
  if (amount <= 0) return true;
  const tag = { category, cityId };
  if (wallet.canAfford(ctx.state, amount, 'dirty')) return wallet.pay(ctx, amount, 'dirty', reason, tag);
  return wallet.pay(ctx, amount, 'clean', reason, tag);
}

/** Auslöser: genug Wochen und Umsatz als Lieferant. Die Anrufe kommen nacheinander. */
function maybeStart(ctx: Ctx): void {
  const s = ctx.state.modules.grow;
  if (s.startedAt !== null || !isTradeActive(ctx.state)) return;
  const trade = ctx.state.modules.trade;
  if (trade.startedAt === null || ctx.now - trade.startedAt < CALL_AFTER_WEEKS * 7 * DAY) return;
  if (tradeStats(ctx.state).revenue < CALL_MIN_REVENUE) return;
  s.startedAt = ctx.now;
  REGIONS.forEach((region, i) => {
    regionState(ctx, region.id).callAt = ctx.now + i * SECOND_CALL_DELAY;
  });
  journal.add(ctx, 'Die Produzenten haben von dir gehört. Es wird angerufen.', 'good');
}

/** Ein Anrufer meldet sich (Stimme, Gesicht): Angebot der Region. */
function placeCall(ctx: Ctx, regionId: string): void {
  const region = getRegion(regionId);
  const r = regionState(ctx, regionId);
  r.callAt = null;
  if (!region || r.status !== 'none') return;
  r.status = 'called';
  messages.call(ctx, {
    contact: region.contact,
    lines: [...(CALL_LINES[regionId] ?? [])],
    options: [
      {
        id: `grow-open-${regionId}`,
        label: CALL_TEXTS.accept,
        reply: CALL_TEXTS.acceptReply,
        command: { type: 'grow.openRegion', payload: { regionId } },
      },
      { id: `grow-later-${regionId}`, label: CALL_TEXTS.later, reply: CALL_TEXTS.laterReply },
    ],
    summary: CALL_TEXTS.summary,
    missedText: CALL_TEXTS.missed,
    gaveUpText: CALL_TEXTS.gaveUp,
  });
  journal.add(ctx, `Anruf aus ${region.name}: ${region.contact.name} bietet dir Land für eigene Fincas.`, 'good');
  ctx.emit('grow.called', { regionId });
}

/** Angebot annehmen: Die Region ist frei. Geht auch später noch (Angebot steht). */
export function openRegion(ctx: Ctx, regionId: string): CommandResult {
  const region = getRegion(regionId);
  if (!region) return { ok: false, reason: 'Diese Region gibt es nicht.' };
  const r = regionState(ctx, regionId);
  if (r.status === 'open') return { ok: false, reason: `${region.name} ist schon frei.` };
  if (r.status === 'none') return { ok: false, reason: `Aus ${region.name} hat noch niemand angerufen.` };
  r.status = 'open';
  // Angenommen (im Anruf oder in der App Handel): Rückrufe mit demselben Angebot fallen weg.
  messages.cancelCalls(ctx, region.contact.id);
  messages.retractWhere(
    ctx,
    (m) => m.contactId === region.contact.id && (m.options?.some((o) => o.id === `grow-open-${regionId}`) ?? false),
  );
  messages.send(ctx, { contact: region.contact, text: CALL_TEXTS.openAnswer, silent: true });
  journal.add(ctx, `${region.name} ist frei: ${region.area}, Ausfuhr über ${region.port.name}.`, 'good');
  ctx.emit('grow.regionOpened', { regionId });
  return { ok: true };
}

function siteCheck(ctx: Ctx, siteId: string): FincaSite | string {
  const site = SITE_BY_ID.get(siteId);
  if (!site) return 'Diese Finca gibt es nicht.';
  if (regionStatus(ctx.state, site.regionId) !== 'open')
    return `${getRegion(site.regionId)?.name ?? 'Die Region'} ist noch nicht frei.`;
  if (siteTaken(ctx.state, siteId)) return `${site.name} gehört dir schon.`;
  return site;
}

function addFinca(ctx: Ctx, site: FincaSite, tenure: Finca['tenure'], cost: number): Finca {
  const s = ctx.state.modules.grow;
  const finca: Finca = {
    id: ctx.nextId(),
    siteId: site.id,
    regionId: site.regionId,
    name: site.name,
    hectares: site.hectares,
    tenure,
    leasePaidUntil: tenure === 'leased' ? ctx.now + 7 * DAY : 0,
    greenhouse: false,
    genetics: 0,
    plan: economy(site.regionId).crops[0] ?? null,
    crop: null,
    batch: null,
    packing: 'vacuum',
    workerIds: [],
    gardenerId: null,
    spent: 0,
    unpaidLease: 0,
    unpaidWages: false,
    stalled: false,
    harvests: 0,
    acquiredAt: ctx.now,
  };
  // Auf dem Feld steht noch die Pflanzung des Vorbesitzers (die erste Ware der Region, Landsorte).
  const standing = economy(site.regionId).crops[0];
  if (standing) {
    finca.crop = {
      productId: standing,
      plantedAt: ctx.now - (GROW_DAYS.outdoor - STANDING_CROP_DAYS) * DAY,
      readyAt: ctx.now + STANDING_CROP_DAYS * DAY,
      loss: 0,
    };
  }
  s.fincas.push(finca);
  if (tenure === 'owned') s.stats.invested += cost;
  ctx.emit('grow.fincaAcquired', { fincaId: finca.id, regionId: site.regionId, tenure, cost });
  return finca;
}

/** Finca kaufen (sauberes Geld). */
export function buyFinca(ctx: Ctx, siteId: string): CommandResult {
  const site = siteCheck(ctx, siteId);
  if (typeof site === 'string') return { ok: false, reason: site };
  const price = landPrice(site);
  if (!wallet.pay(ctx, price, 'clean', `${site.name} gekauft`, { category: 'grow.land', cityId: site.regionId })) {
    return { ok: false, reason: `${site.name} kostet ${formatEuro(price)} sauberes Geld.` };
  }
  const finca = addFinca(ctx, site, 'owned', price);
  journal.add(
    ctx,
    `${site.name} gekauft: ${site.hectares} Hektar für ${formatEuro(price)}. Die Pflanzung ist in ${STANDING_CROP_DAYS} Tagen reif.`,
    'good',
  );
  return { ok: true, data: { fincaId: finca.id } };
}

/** Finca pachten: die erste Woche gleich (sauberes Geld), danach jeden Tag ein Siebtel. */
export function leaseFinca(ctx: Ctx, siteId: string): CommandResult {
  const site = siteCheck(ctx, siteId);
  if (typeof site === 'string') return { ok: false, reason: site };
  const week = leasePerWeek(site);
  if (
    !wallet.pay(ctx, week, 'clean', `Pacht ${site.name} (erste Woche)`, {
      category: 'grow.land',
      cityId: site.regionId,
    })
  ) {
    return { ok: false, reason: `Die erste Woche Pacht kostet ${formatEuro(week)} sauberes Geld.` };
  }
  const finca = addFinca(ctx, site, 'leased', week);
  // Die erste Woche ist bezahlt: die tägliche Pacht beginnt danach (spent zählt sie trotzdem für den Preis pro Gramm).
  finca.spent += week;
  journal.add(
    ctx,
    `${site.name} gepachtet: ${site.hectares} Hektar für ${formatEuro(week)} die Woche. Die Pflanzung ist in ${STANDING_CROP_DAYS} Tagen reif.`,
    'good',
  );
  return { ok: true, data: { fincaId: finca.id } };
}

/** Name, Alter und Werte für jemanden vor Ort, fest aus Seed, Finca und laufender Nummer (keyedDice). */
function localProfile(ctx: Ctx, finca: Finca, role: 'worker' | 'gardener', n: number): RecruitProfile {
  const dice = keyedDice(`grow:hire:${ctx.state.meta.seed}:${finca.id}:${role}:${n}:${ctx.now}`);
  const names = LOCAL_NAMES[finca.regionId] ?? LOCAL_NAMES.kolumbien;
  const info = ROLE_INFO[role as StaffRole];
  const stats = { ...info.stats } as StaffStats;
  for (const key of STAT_KEYS)
    stats[key] = Math.max(1, Math.min(100, Math.round(stats[key] + (dice.random() - 0.5) * 30)));
  const level = role === 'gardener' ? dice.randomInt(1, 3) : 1;
  const wage =
    Math.round(
      (info.wage * economy(finca.regionId).wageFactor * (1 + (level - 1) * 0.25) * (0.9 + dice.random() * 0.2)) / 5,
    ) * 5;
  return {
    name: `${dice.pick(names.first)} ${dice.pick(names.last)}`,
    role: role as StaffRole,
    age: dice.randomInt(info.age[0], info.age[1]),
    background:
      role === 'gardener'
        ? 'Kennt jede Sorte am Hang beim Namen und jede Krankheit am Geruch.'
        : 'Hat sein Leben lang auf den Feldern gearbeitet, für wen auch immer.',
    stats,
    level,
    wage,
    portrait: null,
  };
}

function ownFinca(ctx: Ctx, fincaId: number): Finca | string {
  const finca = ctx.state.modules.grow.fincas.find((f) => f.id === fincaId);
  return finca ?? 'Diese Finca gibt es nicht.';
}

/** Leute vor Ort anheuern: Handgeld HIRE_DAYS Tageslöhne (sauberes Geld). */
export function hire(ctx: Ctx, fincaId: number, role: 'worker' | 'gardener', count = 1): CommandResult {
  const finca = ownFinca(ctx, fincaId);
  if (typeof finca === 'string') return { ok: false, reason: finca };
  if (role === 'gardener' && finca.gardenerId) return { ok: false, reason: `${finca.name} hat schon einen Gärtner.` };
  const n = role === 'gardener' ? 1 : Math.max(1, Math.min(50, Math.round(count)));
  const profiles = Array.from({ length: n }, (_, i) =>
    localProfile(ctx, finca, role, finca.workerIds.length + finca.harvests * 100 + i),
  );
  const handgeld = profiles.reduce((sum, p) => sum + p.wage * HIRE_DAYS, 0);
  if (!payLocal(ctx, handgeld, `Leute für ${finca.name}`, 'grow.wages', finca.regionId)) {
    return { ok: false, reason: `Das Handgeld kostet ${formatEuro(handgeld)}.` };
  }
  for (const profile of profiles) {
    const member = enlist(ctx, profile, {
      origin: 'pool',
      cityId: finca.regionId,
      journalText: '',
      note: `Auf ${finca.name}.`,
    });
    if (role === 'gardener') finca.gardenerId = member.id;
    else finca.workerIds.push(member.id);
  }
  journal.add(
    ctx,
    role === 'gardener'
      ? `${profiles[0].name} ist Gärtner auf ${finca.name}.`
      : `${n} Arbeiter für ${finca.name} angeheuert.`,
    'good',
  );
  return { ok: true };
}

/** Leute vor Ort entlassen. */
export function dismiss(ctx: Ctx, fincaId: number, role: 'worker' | 'gardener', count = 1): CommandResult {
  const finca = ownFinca(ctx, fincaId);
  if (typeof finca === 'string') return { ok: false, reason: finca };
  const ids =
    role === 'gardener' ? (finca.gardenerId ? [finca.gardenerId] : []) : finca.workerIds.slice(-Math.max(1, count));
  if (ids.length === 0) return { ok: false, reason: 'Da ist niemand.' };
  for (const id of ids) removeMember(ctx, id, 'fired');
  if (role === 'gardener') finca.gardenerId = null;
  else finca.workerIds = finca.workerIds.filter((id) => !ids.includes(id));
  return { ok: true };
}

/** Aussaat: Dünger und Wasser bezahlen, die Pflanzung steht bis zur Ernte. */
function sow(ctx: Ctx, finca: Finca, productId: string): CommandResult {
  const supplies = finca.hectares * (finca.greenhouse ? SUPPLIES_PER_HA.greenhouse : SUPPLIES_PER_HA.outdoor);
  if (!payLocal(ctx, supplies, `Aussaat auf ${finca.name}`, 'grow.supplies', finca.regionId)) {
    return { ok: false, reason: `Dünger und Wasser kosten ${formatEuro(supplies)}.` };
  }
  finca.spent += supplies;
  const readyAt = ctx.now + cropDays(finca) * DAY;
  finca.crop = { productId, plantedAt: ctx.now, readyAt, loss: 0 };
  ctx.emit('grow.planted', { fincaId: finca.id, productId, readyAt });
  return { ok: true, data: { readyAt } };
}

/**
 * Wieder säen, was vorgemerkt ist. Geht es nicht (kein Geld für Dünger), sagt der Gärtner einmal Bescheid; der nächste
 * Versuch kommt jeden Tag (daily).
 */
function trySow(ctx: Ctx, finca: Finca): void {
  if (!finca.plan || finca.crop) return;
  const result = sow(ctx, finca, finca.plan);
  if (result.ok) {
    finca.stalled = false;
    return;
  }
  if (finca.stalled) return;
  finca.stalled = true;
  ctx.emit('grow.stalled', { fincaId: finca.id });
  notify(
    ctx,
    finca,
    finca.regionId,
    `Kein Geld für Saat und Dünger auf ${finca.name}. Das Feld liegt brach, bis es reicht.`,
  );
  journal.add(ctx, `${finca.name} liegt brach: kein Geld für Saat und Dünger.`, 'bad');
}

/** Pflanzen (sofort, wenn das Feld frei ist; sonst für die nächste Aussaat vorgemerkt). */
export function plant(ctx: Ctx, fincaId: number, productId: string | null): CommandResult {
  const finca = ownFinca(ctx, fincaId);
  if (typeof finca === 'string') return { ok: false, reason: finca };
  if (productId !== null && !economy(finca.regionId).crops.includes(productId)) {
    return { ok: false, reason: `${productName(productId)} wächst hier nicht.` };
  }
  finca.plan = productId;
  if (productId === null || finca.crop) return { ok: true };
  const result = sow(ctx, finca, productId);
  if (result.ok)
    journal.add(ctx, `${finca.name}: ${productName(productId)} gepflanzt, Ernte in ${cropDays(finca)} Tagen.`, 'good');
  return result;
}

export function buildGreenhouse(ctx: Ctx, fincaId: number): CommandResult {
  const finca = ownFinca(ctx, fincaId);
  if (typeof finca === 'string') return { ok: false, reason: finca };
  if (finca.greenhouse) return { ok: false, reason: `${finca.name} hat schon ein Gewächshaus.` };
  const cost = greenhouseCost(finca);
  if (!wallet.pay(ctx, cost, 'clean', `Gewächshaus ${finca.name}`, { category: 'grow.land', cityId: finca.regionId })) {
    return { ok: false, reason: `Das Gewächshaus kostet ${formatEuro(cost)} sauberes Geld.` };
  }
  finca.greenhouse = true;
  ctx.state.modules.grow.stats.invested += cost;
  // Was draußen steht, wächst unter Glas schneller: die Hälfte der Restzeit.
  if (finca.crop && finca.crop.readyAt > ctx.now) {
    finca.crop.readyAt = ctx.now + Math.round((finca.crop.readyAt - ctx.now) / 2);
  }
  journal.add(ctx, `${finca.name} hat ein Gewächshaus: Ernte alle ${GROW_DAYS.greenhouse} Tage.`, 'good');
  return { ok: true };
}

export function upgradeGenetics(ctx: Ctx, fincaId: number): CommandResult {
  const finca = ownFinca(ctx, fincaId);
  if (typeof finca === 'string') return { ok: false, reason: finca };
  const next = nextGenetics(finca);
  if (!next) return { ok: false, reason: 'Bessere Genetik gibt es nicht.' };
  if (
    !wallet.pay(ctx, next.cost, 'dirty', `Genetik für ${finca.name}`, {
      category: 'grow.supplies',
      cityId: finca.regionId,
    })
  ) {
    return { ok: false, reason: `Die Genetik kostet ${formatEuro(next.cost)}.` };
  }
  finca.genetics = next.level;
  ctx.state.modules.grow.stats.invested += next.cost;
  journal.add(ctx, `${finca.name}: bessere Genetik (Stufe ${next.level}), ab der nächsten Aussaat.`, 'good');
  return { ok: true };
}

export function setPacking(ctx: Ctx, fincaId: number, packing: Packing['id']): CommandResult {
  const finca = ownFinca(ctx, fincaId);
  if (typeof finca === 'string') return { ok: false, reason: finca };
  if (!PACKING_BY_ID.has(packing)) return { ok: false, reason: 'Diese Verpackung gibt es nicht.' };
  finca.packing = packing;
  return { ok: true };
}

export function setCartel(ctx: Ctx, regionId: string, pay: boolean): CommandResult {
  const region = getRegion(regionId);
  if (!region) return { ok: false, reason: 'Diese Region gibt es nicht.' };
  const r = regionState(ctx, regionId);
  if (r.cartelPaid === pay) return { ok: true };
  r.cartelPaid = pay;
  messages.send(ctx, {
    contact: region.cartel.contact,
    text: pay
      ? 'Vernünftig. Mein Anteil kommt von jeder Ernte, und keiner stört deine Leute.'
      : 'Du zahlst nicht mehr? Dann pass gut auf deine Felder auf.',
    silent: true,
  });
  journal.add(
    ctx,
    `${region.cartel.name}: ${pay ? 'Du zahlst wieder deinen Anteil.' : 'Du zahlst keinen Anteil mehr.'}`,
    pay ? 'good' : 'bad',
  );
  return { ok: true };
}

export function bribe(ctx: Ctx, regionId: string): CommandResult {
  const region = getRegion(regionId);
  if (!region || regionStatus(ctx.state, regionId) !== 'open')
    return { ok: false, reason: 'Diese Region ist nicht frei.' };
  if (bribeReadyAt(ctx.state, regionId) !== null)
    return { ok: false, reason: 'Gerade erst geschmiert. Warte ein paar Tage.' };
  const cost = economy(regionId).bribeCost;
  if (
    !wallet.pay(ctx, cost, 'dirty', `Schmiergeld ${region.authority}`, { category: 'grow.bribe', cityId: regionId })
  ) {
    return { ok: false, reason: `Das kostet ${formatEuro(cost)}.` };
  }
  const r = regionState(ctx, regionId);
  r.attention = Math.max(0, r.attention - BRIBE_RELIEF);
  r.bribedAt = ctx.now;
  journal.add(ctx, `${region.authority} in ${region.name} schaut eine Weile weg.`, 'good');
  return { ok: true };
}

/** Wer vor Ort schreibt: der Gärtner der Finca, sonst der Anrufer der Region. */
function localContact(ctx: Ctx, finca: Finca | undefined, regionId: string): Contact | null {
  const gardener = finca ? fincaGardener(ctx.state, finca) : undefined;
  if (gardener) return { ...staffContact(gardener), role: `Gärtner auf ${finca?.name ?? ''}` };
  return getRegion(regionId)?.contact ?? null;
}

/** Ernte: Menge mit den Leuten von jetzt, Anteil des Kartells, ab zum Trocknen. Dann gleich neu pflanzen. */
function harvest(ctx: Ctx, finca: Finca): void {
  const s = ctx.state.modules.grow;
  const crop = finca.crop;
  if (!crop) return;
  const grams = expectedHarvest(ctx.state, finca, crop.productId);
  const quality = fincaQuality(ctx.state, finca);
  const r = regionState(ctx, finca.regionId);
  const cartel = r.cartelPaid ? Math.round((grams * economy(finca.regionId).cartelShare) / 100) * 100 : 0;
  const kept = grams - cartel;
  finca.crop = null;
  finca.harvests += 1;
  s.stats.harvested += grams;
  s.stats.cartelTaken += cartel;
  r.attention = Math.min(100, r.attention + (grams / 1000) * ATTENTION.perHarvestKg);
  if (finca.gardenerId) addXp(ctx, finca.gardenerId, GARDENER_XP_PER_HARVEST);
  if (kept > 0) {
    finca.batch = {
      productId: crop.productId,
      grams: kept,
      quality,
      stage: 'drying',
      until: ctx.now + DRY_DAYS * DAY,
      cost: finca.spent,
    };
  }
  finca.spent = 0;
  if (grams <= 0) {
    // Ohne Arbeiter auf dem Feld gibt es nichts zu ernten (Auftrag 43: vorher stand hier „0 kg, jetzt wird getrocknet“).
    journal.add(ctx, `Ernte auf ${finca.name} ausgefallen: Niemand hat auf dem Feld gearbeitet.`, 'bad');
  } else {
    journal.add(
      ctx,
      `Ernte auf ${finca.name}: ${kg(grams)} ${productName(crop.productId)}${cartel > 0 ? `, ${kg(cartel)} für das Kartell` : ''}. Jetzt wird getrocknet.`,
      'good',
    );
  }
  ctx.emit('grow.harvested', { fincaId: finca.id, productId: crop.productId, grams, cartel });
  trySow(ctx, finca);
}

/** Nächster Schritt nach dem Trocknen: Pressen (Hasch), Verpacken, ins Ausfuhrlager. */
function advanceBatch(ctx: Ctx, finca: Finca): void {
  const batch = finca.batch;
  if (!batch || ctx.now < batch.until) return;
  if (batch.stage === 'drying' && batch.productId === 'hash') {
    batch.stage = 'pressing';
    batch.until = ctx.now + PRESS_DAYS * DAY;
    return;
  }
  if (batch.stage === 'drying' || batch.stage === 'pressing') {
    // Verpacken: Kosten pro Kilo (Schwarzgeld); reicht das Geld nicht, kommt die Ware in Ballen.
    let packing = PACKING_BY_ID.get(finca.packing) ?? PACKINGS[0];
    const cost = Math.round((batch.grams / 1000) * packing.perKg);
    if (
      cost > 0 &&
      !wallet.pay(ctx, cost, 'dirty', `Verpackung (${packing.label}) ${finca.name}`, {
        category: 'grow.supplies',
        cityId: finca.regionId,
      })
    ) {
      // Auftrag 43: nicht still zurückfallen, der Spieler hat die Tarnung bewusst gewählt.
      journal.add(
        ctx,
        `${finca.name}: Kein Geld für ${packing.label} (${formatEuro(cost)}), die Ware geht in ${PACKINGS[0].label}.`,
        'bad',
      );
      packing = PACKINGS[0];
    } else batch.cost += cost;
    batch.stage = 'packing';
    batch.until = ctx.now + PACK_DAYS * DAY;
    batch.packing = packing.id;
    return;
  }
  // Fertig verpackt: ins Ausfuhrlager.
  const origin = regionOrigin(finca.regionId);
  const s = ctx.state.modules.grow;
  const packing = PACKING_BY_ID.get(batch.packing ?? finca.packing) ?? PACKINGS[0];
  finca.batch = null;
  if (!origin) return;
  storeExport(ctx, origin.id, batch.productId, batch.grams, batch.quality, packing.risk);
  s.stats.packed += batch.grams;
  const record: HarvestRecord = {
    at: ctx.now,
    fincaId: finca.id,
    regionId: finca.regionId,
    productId: batch.productId,
    grams: batch.grams,
    cost: Math.round(batch.cost),
  };
  s.harvests.push(record);
  if (s.harvests.length > 60) s.harvests.splice(0, s.harvests.length - 60);
  const perGram = Math.round((batch.cost / Math.max(1, batch.grams)) * 100) / 100;
  journal.add(
    ctx,
    `${kg(batch.grams)} ${productName(batch.productId)} von ${finca.name} liegen in ${origin.from} bereit (${perGram.toFixed(2).replace('.', ',')} € pro Gramm).`,
    'good',
  );
  ctx.emit('grow.packed', {
    fincaId: finca.id,
    productId: batch.productId,
    grams: batch.grams,
    originId: origin.id,
    costPerGram: perGram,
  });
}

/**
 * Pacht für einen Tag (nur sauberes Geld). Fehlt es, schreibt der Verpächter am ersten Tag, nach LEASE_LOST_DAYS ist das
 * Land weg und die Leute dort gehen. false, wenn die Finca verloren ist.
 */
function payLease(ctx: Ctx, finca: Finca): boolean {
  const lease = Math.round(leasePerWeek(finca) / 7);
  if (wallet.pay(ctx, lease, 'clean', `Pacht ${finca.name}`, { category: 'grow.land', cityId: finca.regionId })) {
    finca.spent += lease;
    finca.unpaidLease = 0;
    return true;
  }
  finca.unpaidLease += 1;
  if (finca.unpaidLease === 1) ctx.emit('grow.unpaid', { fincaId: finca.id, kind: 'lease' });
  const contact = getRegion(finca.regionId)?.contact;
  if (finca.unpaidLease === 1 && contact) {
    message(
      ctx,
      contact,
      `Der Verpächter von ${finca.name} wartet auf sein Geld (sauber, ${formatEuro(lease)} am Tag). Nach ${LEASE_LOST_DAYS} Tagen nimmt er das Land zurück.`,
    );
  }
  if (finca.unpaidLease < LEASE_LOST_DAYS) return true;
  const s = ctx.state.modules.grow;
  for (const id of [...finca.workerIds, ...(finca.gardenerId ? [finca.gardenerId] : [])])
    removeMember(ctx, id, 'fired');
  s.fincas = s.fincas.filter((f) => f.id !== finca.id);
  journal.add(ctx, `${finca.name} ist weg: ${LEASE_LOST_DAYS} Tage keine Pacht. Die Leute dort sind gegangen.`, 'bad');
  ctx.emit('grow.fincaLost', { fincaId: finca.id, regionId: finca.regionId, name: finca.name });
  return false;
}

/** Mitternacht: Löhne und Pacht, Aufmerksamkeit der Behörden, Razzia und Kartell (fest gewürfelt pro Region und Tag). */
function daily(ctx: Ctx, day: number): void {
  const s = ctx.state.modules.grow;
  for (const finca of [...s.fincas]) {
    const wages = [...finca.workerIds, ...(finca.gardenerId ? [finca.gardenerId] : [])].reduce(
      (sum, id) => sum + (getStaffMember(ctx.state, id)?.wage ?? 0),
      0,
    );
    const paid = wages <= 0 || payLocal(ctx, wages, `Löhne ${finca.name}`, 'grow.wages', finca.regionId);
    if (paid) finca.spent += wages;
    else {
      // Ohne Lohn kein Arbeitstag: Der Tag fehlt der Ernte.
      if (!finca.unpaidWages) {
        ctx.emit('grow.unpaid', { fincaId: finca.id, kind: 'wages' });
        notify(
          ctx,
          finca,
          finca.regionId,
          `Die Leute auf ${finca.name} haben heute keinen Lohn bekommen. Sie bleiben zu Hause.`,
        );
      }
      if (finca.crop) finca.crop.loss = Math.min(1, finca.crop.loss + 1 / cropDays(finca));
    }
    finca.unpaidWages = !paid;
    if (finca.tenure === 'leased' && ctx.now >= finca.leasePaidUntil && !payLease(ctx, finca)) continue;
    trySow(ctx, finca);
  }
  for (const region of REGIONS) {
    const r = s.regions[region.id];
    if (!r || r.status !== 'open') continue;
    const fincas = s.fincas.filter((f) => f.regionId === region.id);
    const growing = fincas.filter((f) => f.crop).reduce((sum, f) => sum + f.hectares, 0);
    r.attention = clamp(
      r.attention + growing * ATTENTION.perHaDay - (r.cartelPaid ? ATTENTION.cartelDecay : ATTENTION.decayPerDay),
    );
    if (fincas.length === 0) continue;
    const dice = cityDayDice(ctx.state.meta.seed, 'grow', region.id, day);
    // Razzia der Behörden: die halbe Pflanzung einer Finca ist weg.
    const raidChance = (Math.max(0, r.attention - ATTENTION.raidFrom) / 100) * ATTENTION.raidScale;
    const roll = dice.random();
    const target = dice.pick(fincas);
    if (roll < raidChance && target.crop) {
      const share = ATTENTION.raidLoss * (1 - target.crop.loss);
      target.crop.loss = Math.min(1, target.crop.loss + share);
      r.attention = clamp(r.attention - ATTENTION.raidRelief);
      s.stats.raids += 1;
      s.stats.lostToRaids += Math.round(
        share * expectedHarvest(ctx.state, { ...target, crop: { ...target.crop, loss: 0 } }),
      );
      notify(
        ctx,
        target,
        region.id,
        `Die ${region.authority} war auf ${target.name}. Sie haben die Hälfte der Pflanzen abgebrannt. Keiner verhaftet.`,
      );
      journal.add(ctx, `Razzia auf ${target.name}: die ${region.authority} hat die halbe Pflanzung vernichtet.`, 'bad');
      ctx.emit('grow.raided', { regionId: region.id, fincaId: target.id, share });
    }
    // Kartell ohne Anteil: Mit Chance brennt ein Teil der Pflanzung, oder Ware im Ausfuhrhafen verschwindet.
    const hit = dice.random();
    const where = dice.random();
    if (!r.cartelPaid && hit < CARTEL_HIT_CHANCE) {
      s.stats.cartelHits += 1;
      const victim = fincas.find((f) => f.crop);
      const origin = regionOrigin(region.id);
      if (victim?.crop && (where < 0.6 || !origin)) {
        const share = CARTEL_HIT_LOSS * (1 - victim.crop.loss);
        victim.crop.loss = Math.min(1, victim.crop.loss + share);
        s.stats.lostToCartel += Math.round(
          share * expectedHarvest(ctx.state, { ...victim, crop: { ...victim.crop, loss: 0 } }),
        );
        message(
          ctx,
          region.cartel.contact,
          `Schade um deine Pflanzen auf ${victim.name}. Feuer ist gefährlich in den Bergen.`,
        );
        journal.add(ctx, `${region.cartel.name}: Feuer auf ${victim.name}, ein Teil der Pflanzung ist weg.`, 'bad');
        ctx.emit('grow.cartelHit', { regionId: region.id, fincaId: victim.id, share });
      } else if (origin) {
        const lost = loseOrigin(ctx, origin.id, CARTEL_HIT_LOSS);
        if (lost > 0) {
          s.stats.lostToCartel += lost;
          message(
            ctx,
            region.cartel.contact,
            `Im Hafen von ${origin.from} verschwindet manchmal etwas. ${kg(lost)} diesmal.`,
          );
          journal.add(
            ctx,
            `${region.cartel.name}: ${kg(lost)} aus dem Ausfuhrlager in ${origin.from} verschwunden.`,
            'bad',
          );
          ctx.emit('grow.cartelHit', { regionId: region.id, fincaId: null, share: CARTEL_HIT_LOSS });
        }
      }
    }
  }
  checkGoals(ctx);
}

function clamp(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
}

function message(ctx: Ctx, contact: Contact, text: string): void {
  messages.send(ctx, { contact, text, silent: true });
}

function notify(ctx: Ctx, finca: Finca, regionId: string, text: string): void {
  const contact = localContact(ctx, finca, regionId);
  if (contact) message(ctx, contact, text);
}

/** Ziele prüfen (täglich und nach jeder Lieferung). */
function checkGoals(ctx: Ctx): void {
  const s = ctx.state.modules.grow;
  if (s.startedAt === null) return;
  const { grams, share } = goalShares(ctx.state);
  if (s.goals.producer === null && grams >= PRODUCER_MIN_GRAMS && share >= PRODUCER_SHARE) {
    s.goals.producer = ctx.now;
    journal.add(ctx, 'Produzent: Die Hälfte deiner Lieferungen kommt aus eigener Produktion.', 'good');
    ctx.emit('grow.goalReached', { goal: 'producer' });
  }
  if (s.goals.europe === null && s.goals.producer !== null) {
    const europe = europeProgress(ctx.state);
    if (europe.total > 0 && europe.missing.length === 0) {
      s.goals.europe = ctx.now;
      journal.add(ctx, 'Europa: Jeder deiner Kunden bekommt Ware aus deinen Fincas. Das Spiel geht weiter.', 'good');
      ctx.emit('grow.goalReached', { goal: 'europe' });
    }
  }
}

function kg(grams: number): string {
  const v = Math.round(grams / 100) / 10;
  return `${String(v).replace('.', ',')} kg`;
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.grow;
  if (s.startedAt === null) {
    maybeStart(ctx);
    if (s.startedAt === null) return;
  }
  for (const region of REGIONS) {
    const r = s.regions[region.id];
    if (r?.callAt != null && ctx.now >= r.callAt) placeCall(ctx, region.id);
  }
  for (const finca of s.fincas) {
    if (finca.crop && ctx.now >= finca.crop.readyAt) harvest(ctx, finca);
    advanceBatch(ctx, finca);
  }
  const day = Math.floor(ctx.now / DAY);
  if (day > s.day) {
    s.day = day;
    daily(ctx, day);
  }
}

function initialState(): GrowState {
  return {
    startedAt: null,
    regions: {},
    fincas: [],
    harvests: [],
    deliveries: [],
    goals: { producer: null, europe: null },
    day: 0,
    stats: emptyStats(),
  };
}

export default defineModule({
  id: 'grow',
  version: 2,
  dependsOn: ['trade'],
  init: () => initialState(),
  migrations: {
    // Review: Folgen unbezahlter Pacht und Löhne, Säen mit neuem Versuch; Lieferungen mit dem Anteil der Waren zum
    // Anbauen (für „Europa“; vorher zählte alles, auch Laborware).
    2: (
      old: Omit<GrowState, 'fincas' | 'deliveries'> & {
        fincas: Omit<Finca, 'unpaidLease' | 'unpaidWages' | 'stalled'>[];
        deliveries: Omit<DeliveryRecord, 'crop' | 'cropOwn'>[];
      },
    ): GrowState => ({
      ...old,
      fincas: old.fincas.map((f) => ({ ...f, unpaidLease: 0, unpaidWages: false, stalled: false })),
      deliveries: old.deliveries.map((d) => ({ ...d, crop: d.grams, cropOwn: d.own })),
    }),
  },
  tickEvery: 60,
  // Versatz (Auftrag 47): nicht mit allen anderen in derselben Minute ticken.
  tickOffset: 41,
  tick,
  commands: {
    'grow.openRegion': (ctx, { regionId }) => openRegion(ctx, regionId),
    'grow.buyFinca': (ctx, { siteId }) => buyFinca(ctx, siteId),
    'grow.leaseFinca': (ctx, { siteId }) => leaseFinca(ctx, siteId),
    'grow.hire': (ctx, { fincaId, role, count }) => hire(ctx, fincaId, role, count),
    'grow.dismiss': (ctx, { fincaId, role, count }) => dismiss(ctx, fincaId, role, count),
    'grow.plant': (ctx, { fincaId, productId }) => plant(ctx, fincaId, productId),
    'grow.buildGreenhouse': (ctx, { fincaId }) => buildGreenhouse(ctx, fincaId),
    'grow.upgradeGenetics': (ctx, { fincaId }) => upgradeGenetics(ctx, fincaId),
    'grow.setPacking': (ctx, { fincaId, packing }) => setPacking(ctx, fincaId, packing),
    'grow.setCartel': (ctx, { regionId, pay }) => setCartel(ctx, regionId, pay),
    'grow.bribe': (ctx, { regionId }) => bribe(ctx, regionId),
  },
  on: {
    'trade.delivered': (ctx, { customerId, amount, ownAmount, items }) => {
      const s = ctx.state.modules.grow;
      if (s.startedAt === null) return;
      const crop = (items ?? []).filter((i) => CROP_PRODUCTS.includes(i.productId));
      s.deliveries.push({
        at: ctx.now,
        customerId,
        grams: amount,
        own: ownAmount ?? 0,
        crop: crop.reduce((sum, i) => sum + i.amount, 0),
        cropOwn: crop.reduce((sum, i) => sum + i.own, 0),
      });
      const from = ctx.now - Math.max(PRODUCER_WINDOW_DAYS, EUROPE_WINDOW_DAYS) * DAY;
      s.deliveries = s.deliveries.filter((d) => d.at >= from);
      checkGoals(ctx);
    },
  },
});
