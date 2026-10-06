// Einfache Bot-Strategie für die Balancing-Simulation (balance.test.ts, `npm run balance`).
// Der Bot spielt wie ein vernünftiger, aber nicht perfekter Spieler: Er verkauft anfangs selbst an wenigen Spots,
// bestellt Ware nach, schaltet Lieferanten frei, sobald sie sich melden, wäscht Geld für einen Liegeplatz im Hafen,
// heuert einen Fahrer an und lässt Schiffsware abholen, heuert Läufer an, schaltet Spots frei, ernennt Leutnants
// mit bis zu drei Spots (mit einer einfachen Bestellregel) und später eine Rechte Hand, stellt Sicherheit ein,
// beantwortet die Nachricht nach einer Festnahme (gute Leute per Kaution, sonst ersetzen), wenn die Gangs ungemütlich werden, antwortet auf Handy-Nachrichten und lässt
// Konfrontationen von seinen Leuten auswürfeln. Er schickt nur Befehle, genau wie die Oberfläche.
//
// Lager und Fahrzeuge (Auftrag 33): Weist ein volles Lager Ware ab, baut der Bot Regale ein; stehen mehr als 2 kg am Kai,
// kauft er einen Kombi (fällt weniger auf). Hafenware holt er nachts ab, wenn sie bis dahin sicher am Kai steht. In
// einer neuen Stadt nimmt er das günstigste Lager mit genug Platz. Container bestellt er nicht (zu viel Geld auf einmal).
//
// Städte (Auftrag 30 und 36): Der Bot spielt immer die aktive Stadt (Spots, Lager, Leute, Lieferanten, Hafen und Gangs
// dort). Gehören ihm alle Veedel einer Stadt und erfüllt die Rechte Hand alles, wählt er die nächste Stadt selbst (die
// günstigste: Lager und Löhne, bei Gleichstand die nächste) und übergibt mit Startpaket (die beste neue Rechte Hand,
// bis zu fünf freie Leute, ein Fahrzeug; city.handOver). In einer neuen Stadt kauft er zuerst ein Lager (sauberes Geld,
// notfalls gewaschen).
//
// Markt und Verträge (Auftrag 32): Peters „eigenen Preis setzen“ probiert er einmal aus (sonst kämen keine Verträge, J15).
// Jeden Montag nimmt er den Wochenvertrag mit der höchsten Belohnung, den er schaffen
// kann (Vorlagen, die zu seinem Spiel passen, Umsatzziele nur bis zu seinem Umsatz der letzten Woche), und bei einer
// Rabatt-Aktion kauft er das Paket einmal, wenn das Geld über der Reserve reicht und das Lager nicht voll ist.
//
// Verkauf und Hafen-Phase (Auftrag 40): botTrade.ts.
//
// Liegt außerhalb von src/modules, weil er alle Module zusammen benutzt (wie ein Spieler).

import { type Command, type GameState, messages, type Simulation } from '../core';
import {
  activeCity,
  CITY_OFFERS,
  citiesUnlocked,
  cityContact,
  freeCities,
  getCity,
  isBusinessSold,
  isPlayerIn,
  isPlayerTraveling,
  NEXT_CITY,
  playableCities,
  presentCity,
  travelMinutesBetween,
} from '../modules/city';
import { allWaiting, canServe, dealerStage } from '../modules/customers';
import {
  activeEncounters,
  chooseAuto,
  chooseMove,
  getEncounter,
  requestCity,
  suggestedCrew,
} from '../modules/encounters';
import { periodReport } from '../modules/finance';
import { freeVehicles, getVehicles, VEHICLE_MODELS, vehiclePrice } from '../modules/fleet';
import { ceasefireCost, getGangs, tributeAmount } from '../modules/gangs';
import {
  getStock,
  getWarehouses,
  NEARLY_FULL,
  stockWeight,
  storageStats,
  upgradeCost,
  warehouseCapacity,
  warehouseLoad,
  warehouseSites,
} from '../modules/goods';
import {
  CAPO_ADVICE_LIEUTENANTS,
  CAPO_MAX_LIEUTENANTS,
  canBeCapo,
  canBeRightHand,
  capoCandidates,
  fullPowerMissing,
  getCapos,
  getRightHand,
  hasFullPower,
  isLieutenant,
  lieutenantOfSpot,
  MAX_SPOTS_PER_LIEUTENANT,
  rightHandHandlesOrders,
} from '../modules/hierarchy';
import { amountInProgress, launderingCapacity } from '../modules/laundering';
import {
  berthCost,
  cargoAmount,
  cargoRiskFrom,
  departureFor,
  freeDrivers,
  getCargo,
  hasBerth,
  inTransitAmount,
  PORTS,
} from '../modules/logistics';
import { getSpotPrice } from '../modules/market';
import { activeContract, contractOffers, contractValue, currentQuest } from '../modules/quests';
import { getCandidates } from '../modules/recruiting';
import {
  canFoundSpotAt,
  customSpots,
  getSpots,
  lockedSpots,
  SPOT_UPGRADES,
  spotAwareness,
  spotCity,
  spotUpgrades,
} from '../modules/spots';
import { bailCost, getStaff, openStories, runnerHireCost, type StoryId, securityAt } from '../modules/staff';
import {
  availableCredit,
  availablePackages,
  canUnlock,
  getDeals,
  getRelation,
  getSuppliers,
  isUnlocked,
  packagePrice,
  shipmentsInTransit,
} from '../modules/suppliers';
import { campaignProgress, controlledBy, PLAYER_FACTION } from '../modules/territory';
import { allVeedel, neighborsOf } from '../modules/veedel';
import { growTurn } from './botGrow';
import { sellWhenOffered, tradeTurn } from './botTrade';

export interface BotOptions {
  /** An so vielen Spots ohne Läufer verkauft der Bot selbst (ein Mensch schafft nicht alle gleichzeitig). */
  personalSpots: number;
  /** Alle so viele Spielminuten schaut der Bot aufs Spiel. */
  attentionEvery: number;
  /** Schläft der Bot nachts (keine eigenen Verkäufe von 3 bis 9 Uhr)? */
  sleeps: boolean;
  /** Höchstens so viele Läufer (fehlt: beliebig viele). */
  maxRunners?: number;
  /** Baut der Bot aus (Spots freischalten und gründen, Leutnants, Hafen)? Fehlt: ja. */
  expand?: boolean;
  /** Holt der Bot gute Leute per Kaution aus der Haft? Fehlt: ja. */
  bail?: boolean;
  /**
   * Reihenfolge der Städte nach Köln (Auftrag 38, für den Balancing-Bericht): die erste freie daraus. Fehlt: die
   * günstigste zum Anfangen (chooseNextCity).
   */
  cityOrder?: readonly string[];
  /** Verkauft der Bot das Geschäft, sobald Jansen anruft (Auftrag 40)? Fehlt: ja. */
  sellBusiness?: boolean;
  /** Baut der Bot eigene Produktion auf, wenn Kolumbien und Marokko anrufen (Auftrag 42)? Fehlt: ja. */
  grow?: boolean;
}

/**
 * Ein vorsichtiger Spieler: zwei, drei Spots mit Läufern, kein weiterer Ausbau, keine Kaution (wer sitzt, sitzt die
 * Haft aus; ersetzt wird nur mit freien Leuten). Zum Messen, ob man ansparen kann.
 */
export const CAREFUL_BOT: BotOptions = {
  personalSpots: 2,
  attentionEvery: 10,
  sleeps: true,
  maxRunners: 2,
  expand: false,
  bail: false,
};

export const DEFAULT_BOT: BotOptions = { personalSpots: 2, attentionEvery: 10, sleeps: true };

export interface BotStats {
  commands: number;
  failed: number;
  byType: Record<string, number>;
  /** Rabatt-Aktionen, bei denen er schon gekauft hat (Auftrag 32). */
  deals?: number[];
  /** Übergaben (Auftrag 36): von wo nach wo, an welchem Tag, wie viele Leute im Startpaket. */
  cities?: { from: string; to: string; day: number }[];
  /**
   * Gramm, die beim letzten Blick aufs Lager schon abgewiesen waren. Gehört zum Lauf, nicht zum Spielstand: Ein geladener
   * Stand mit neuen Stats spielt so genauso weiter wie der ungeladene (früher eine WeakMap am Zustand, die nach dem Laden
   * leer war).
   */
  rejectedSeen?: number;
}

function money(state: GameState): number {
  return state.wallet.dirty;
}

function run(sim: Simulation, stats: BotStats, command: Command): boolean {
  const result = sim.dispatch(command);
  stats.commands++;
  stats.byType[command.type] = (stats.byType[command.type] ?? 0) + 1;
  if (!result.ok) stats.failed++;
  return result.ok;
}

/** Laufende Kosten für einen Tag: Löhne der Leute in der aktiven Stadt plus Puffer (die schlafende zahlt ihre selbst). */
function reserve(state: GameState): number {
  const wages = getStaff(state, { cityId: activeCity(state) }).reduce((sum, m) => sum + m.wage, 0);
  return Math.round(wages * 1.5) + 500;
}

/** Selbst verkaufen: an den Spots ohne Läufer mit den meisten Wartenden. */
function sellPersonally(sim: Simulation, stats: BotStats, options: BotOptions): void {
  const state = sim.state;
  const hour = Math.floor((state.time % 1440) / 60);
  if (options.sleeps && hour >= 3 && hour < 9) return;
  if (!isPlayerIn(state, activeCity(state))) return;
  const staffed = new Set(
    getStaff(state, { role: 'runner', status: 'active' })
      .filter((m) => m.assignment?.kind === 'spot')
      .map((m) => m.assignment?.targetId),
  );
  const bySpot = new Map<string, number[]>();
  for (const c of allWaiting(state)) {
    if (staffed.has(c.spotId) || !canServe(state, c.id)) continue;
    bySpot.set(c.spotId, [...(bySpot.get(c.spotId) ?? []), c.id]);
  }
  const spots = [...bySpot.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, options.personalSpots);
  for (const [, ids] of spots) {
    for (const id of ids) run(sim, stats, { type: 'customers.serve', payload: { customerId: id } });
  }
}

/** Teurere Läufer stellt der Bot nicht ein. */
const MAX_RUNNER_WAGE = 120;

/** Gewünschter Produktmix (grob nach Kundschaft). */
const PRODUCT_MIX: Record<string, number> = { weed: 0.35, hash: 0.2, haze: 0.15, edibles: 0.12, vape: 0.1, kush: 0.08 };

/**
 * Nachbestellen, wenn Vorrat plus Lieferungen unter dem Ziel liegen. Bestellt das Produkt, das im Verhältnis zum
 * Mix am knappsten ist, beim günstigsten Paket pro Einheit, das ins Budget passt.
 */
function restock(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const city = activeCity(state);
  if (getWarehouses(state, city).length === 0) return;
  const stock = getStock(state, { cityId: city });
  const incoming =
    shipmentsInTransit(state).reduce((sum, s) => sum + s.amount, 0) + cargoAmount(state) + inTransitAmount(state);
  const sellers = getStaff(state, { role: 'runner' }).length + 1;
  const want = 80 + sellers * 70;
  if (stock + incoming >= want) return;
  // Ware geht vor: Ist fast nichts mehr da, bestellt er auch mit dem Geld, das er sonst für die Löhne zurückhält
  // (ohne Ware kein Umsatz, dann reicht es für die Löhne erst recht nicht).
  const budget = money(state) - (stock + incoming < want / 3 ? 0 : reserve(state));
  const have = (productId: string) =>
    getStock(state, { productId, cityId: city }) +
    cargoAmount(state, productId) +
    inTransitAmount(state, productId) +
    shipmentsInTransit(state)
      .filter((s) => s.productId === productId)
      .reduce((sum, s) => sum + s.amount, 0);
  const products = Object.keys(PRODUCT_MIX).sort(
    (a, b) => have(a) / PRODUCT_MIX[a] - have(b) / PRODUCT_MIX[b] || a.localeCompare(b),
  );
  for (const productId of products) {
    let best: { supplierId: string; packageId: string; price: number; perUnit: number } | null = null;
    for (const supplier of getSuppliers(state, city)) {
      for (const pkg of availablePackages(state, supplier.id)) {
        if (pkg.productId !== productId) continue;
        const price = packagePrice(state, supplier.id, pkg.id);
        if (price > budget) continue;
        // Rotterdam dauert: nur, wenn noch genug im Lager ist, um die Zeit zu überbrücken.
        if (supplier.kind === 'port' && stock < 40) continue;
        const perUnit = price / pkg.amount;
        if (!best || perUnit < best.perUnit) best = { supplierId: supplier.id, packageId: pkg.id, price, perUnit };
      }
    }
    if (best) {
      const payload = { supplierId: best.supplierId, packageId: best.packageId };
      if (run(sim, stats, { type: 'suppliers.order', payload })) return;
    }
  }
  // Kein Geld mehr: auf Kredit, wenn ein Lieferant welchen gibt.
  if (stock + incoming > 0) return;
  for (const supplier of getSuppliers(state, city)) {
    const pkg = availablePackages(state, supplier.id)
      .filter((p) => packagePrice(state, supplier.id, p.id) <= availableCredit(state, supplier.id))
      .sort((a, b) => packagePrice(state, supplier.id, a.id) - packagePrice(state, supplier.id, b.id))[0];
    if (!pkg) continue;
    const payload = { supplierId: supplier.id, packageId: pkg.id, onCredit: true };
    if (run(sim, stats, { type: 'suppliers.order', payload })) return;
  }
}

/** Vorlagen, die der Bot mit seinem Spiel schafft (er liefert nicht selbst, macht keinen Großhandel). */
const BOT_CONTRACTS = new Set([
  'revenue',
  'product',
  'stock',
  'night',
  'hold',
  'expand',
  'regulars',
  'hire',
  'spots',
  'quiet',
]);

/**
 * Peters Quest „Setz einen eigenen Preis“ erledigt der Bot sonst nie (er verkauft zum Richtpreis). Die Wochenverträge
 * kommen aber erst nach Peters erstem Kapitel (J15): Wie ein Neuling probiert er es einmal aus und stellt gleich zurück.
 */
function tryOwnPrice(sim: Simulation, stats: BotStats): void {
  if (currentQuest(sim.state)?.id !== 'setPrice') return;
  const spot = getSpots(sim.state, activeCity(sim.state))[0];
  if (!spot) return;
  const price = getSpotPrice(sim.state, spot.id, 'weed');
  if (run(sim, stats, { type: 'market.setPrice', payload: { spotId: spot.id, productId: 'weed', price } })) {
    run(sim, stats, { type: 'market.setPrice', payload: { spotId: spot.id, productId: 'weed', price: null } });
  }
}

/** Montags: den Vertrag mit der höchsten Belohnung nehmen, den er schaffen kann. */
function takeContract(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  if (activeContract(state)) return;
  // Umsatz der letzten sieben Tage (Kasse) als Maß, was in einer Woche geht.
  const week = periodReport(state, 7).income;
  const feasible = contractOffers(state).filter(
    (o) =>
      BOT_CONTRACTS.has(o.templateId) &&
      (o.templateId !== 'revenue' || o.target <= week * 0.9) &&
      (o.templateId !== 'product' || (o.productId !== undefined && o.productId in PRODUCT_MIX)),
  );
  const best = [...feasible].sort((a, b) => contractValue(b) - contractValue(a))[0];
  if (best) run(sim, stats, { type: 'quests.acceptContract', payload: { offerId: best.id } });
}

/** Rabatt-Aktion: einmal pro Aktion zugreifen, wenn Geld und Platz da sind und die Ware zum Mix passt. */
function buyDeals(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const city = activeCity(state);
  stats.deals ??= [];
  const bought = stats.deals;
  for (const deal of getDeals(state, city)) {
    if (bought.includes(deal.id)) continue;
    const pkg = availablePackages(state, deal.supplierId).find((p) => p.id === deal.packageId);
    // Container (Auftrag 33) kauft der Bot nicht, auch nicht im Angebot: zu viel Geld auf einmal.
    if (!pkg || pkg.container || !(pkg.productId in PRODUCT_MIX)) continue;
    const supplier = getSuppliers(state, city).find((x) => x.id === deal.supplierId);
    if (supplier?.kind === 'port' && freeDrivers(state).length === 0) continue;
    const price = packagePrice(state, deal.supplierId, deal.packageId);
    if (price > money(state) - reserve(state) * 2) continue;
    if (getStock(state, { cityId: city }) > 1500) continue;
    bought.push(deal.id);
    run(sim, stats, { type: 'suppliers.order', payload: { supplierId: deal.supplierId, packageId: deal.packageId } });
  }
}

/** Lieferanten freischalten, sobald es geht und die Gebühr aus der Portokasse kommt. */
function unlockSuppliers(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  for (const supplier of getSuppliers(state, activeCity(state))) {
    if (isUnlocked(state, supplier.id) || !canUnlock(state, supplier.id).ok) continue;
    if ((supplier.unlock?.fee ?? 0) > (money(state) - reserve(state)) / 2) continue;
    run(sim, stats, { type: 'suppliers.unlock', payload: { supplierId: supplier.id } });
  }
}

/**
 * Hafen: Ist genug Geld übrig, wäscht der Bot Geld für den Liegeplatz und mietet ihn. Danach heuert er einen Fahrer
 * an und lässt Schiffsware abholen, sobald sie am Kai steht.
 */
/** Sauberes Geld für einen Kauf (Liegeplatz, Lager) in Raten waschen. */
function launderFor(sim: Simulation, stats: BotStats, cost: number): void {
  const state = sim.state;
  if (amountInProgress(state) > 0) return;
  const needed = Math.ceil((cost - state.wallet.clean) / 0.8) + 50;
  const spare = money(state) - reserve(state) - 400;
  const amount = Math.min(Math.max(needed, 150), spare, launderingCapacity(state));
  if (amount >= Math.min(needed, 300)) run(sim, stats, { type: 'laundering.launder', payload: { amount } });
}

function harbor(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const city = activeCity(state);
  if (!PORTS[city] || getWarehouses(state, city).length === 0) return;
  if (!hasBerth(state)) {
    const cost = berthCost(city);
    if (state.wallet.clean >= cost) {
      run(sim, stats, { type: 'logistics.buyBerth', payload: {} });
      return;
    }
    // Sparen in Raten: Sobald das Geschäft läuft (zwei Läufer, Lager voll genug), geht übriges Geld in die Wäsche. In
    // einer späteren Stadt (Auftrag 36) erst die Spots: Der Liegeplatz kommt ab fünf Läufern.
    const runners = getStaff(state, { role: 'runner', cityId: city }).length;
    const later = citiesUnlocked(state).length > 1;
    if (getStock(state, { cityId: city }) < 150 || runners < (later ? LATER_CITY_BERTH_RUNNERS : 2)) return;
    launderFor(sim, stats, cost);
    return;
  }
  const drivers = getStaff(state, { role: 'driver', cityId: city }).length;
  if (drivers === 0 && money(state) > reserve(state) + 800) {
    run(sim, stats, { type: 'staff.hireDriver', payload: {} });
  }
  const cargo = getCargo(state);
  if (cargo.length > 0 && freeDrivers(state).length > 0) {
    // Nachts, wenn alles bis zur Abfahrt (und eine Stunde Puffer) sicher am Kai steht (Auftrag 33).
    const night = departureFor(state.time, 'night');
    const safe = cargo.every((c) => cargoRiskFrom(c, state) > night + 60);
    run(sim, stats, { type: 'logistics.pickup', payload: { by: 'driver', choice: safe ? 'night' : 'autobahn' } });
  }
  // Viel Hafenware (ab 2 kg am Kai, nach Gewicht): ein Kombi, der fasst 8 kg und fällt weniger auf als das Privatauto
  // (Auftrag 33). In der Stadt passt ins Privatauto zwar alles, aber jede Kontrolle kostet die ganze Ladung.
  if (getVehicles(state, city).length === 0 && stockWeight(getCargo(state, city)) >= BIG_PICKUP_GRAMS) {
    const kombi = VEHICLE_MODELS.find((m) => m.id === 'kombi');
    if (kombi) {
      const price = vehiclePrice(kombi, city);
      if (state.wallet.clean >= price) run(sim, stats, { type: 'fleet.buy', payload: { model: 'kombi' } });
      else launderFor(sim, stats, price);
    }
  }
}

/** In einer späteren Stadt spart der Bot erst ab so vielen Läufern für den Liegeplatz (Auftrag 36). */
const LATER_CITY_BERTH_RUNNERS = 5;

/** Ab so viel Hafenware am Kai (Gramm) kauft der Bot einen Kombi (Auftrag 33). */
const BIG_PICKUP_GRAMS = 2000;

/**
 * Regale bei Bedarf (Auftrag 33): Hat ein volles Lager seit dem letzten Blick mehr als ein halbes Kilo abgewiesen,
 * baut der Bot im vollsten Lager der Stadt Regale ein (sauberes Geld, notfalls gewaschen).
 */
function warehouseUpkeep(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const rejected = storageStats(state).rejected;
  if (rejected - (stats.rejectedSeen ?? 0) < 500) return;
  const fullest = [...getWarehouses(state, activeCity(state))]
    .filter((w) => upgradeCost(state, w.id, 'shelves') !== null)
    .sort(
      (a, b) =>
        warehouseLoad(state, b.id) / warehouseCapacity(state, b.id) -
        warehouseLoad(state, a.id) / warehouseCapacity(state, a.id),
    )[0];
  if (!fullest || warehouseLoad(state, fullest.id) < warehouseCapacity(state, fullest.id) * NEARLY_FULL) {
    stats.rejectedSeen = rejected;
    return;
  }
  const cost = upgradeCost(state, fullest.id, 'shelves') ?? 0;
  if (state.wallet.clean >= cost) {
    if (run(sim, stats, { type: 'goods.upgradeWarehouse', payload: { warehouseId: fullest.id, kind: 'shelves' } }))
      stats.rejectedSeen = rejected;
  } else {
    launderFor(sim, stats, cost);
  }
}

/** Läufer anheuern, Spots freischalten, Leutnants befördern, Sicherheit einstellen. */
function grow(sim: Simulation, stats: BotStats, options: BotOptions): void {
  const state = sim.state;
  const city = activeCity(state);
  const expand = options.expand !== false;
  // Neue Stadt ohne Lager: erst ein Lager, sonst geht nichts. Das günstigste mit genug Platz (Auftrag 33: kleine
  // Garagen laufen mit Hafenware schnell voll), sonst das günstigste überhaupt.
  if (getWarehouses(state, city).length === 0) {
    const sites = [...warehouseSites(city)].sort((a, b) => a.cost - b.cost);
    const site = sites.find((w) => w.capacity >= 6000) ?? sites[0];
    if (!site) return;
    if (state.wallet.clean >= site.cost)
      run(sim, stats, { type: 'goods.buyWarehouse', payload: { warehouseId: site.id } });
    else launderFor(sim, stats, site.cost);
    return;
  }
  const home = getWarehouses(state, city)[0].id;
  const runnersNow = getStaff(state, { role: 'runner', cityId: city }).length;
  const mayHire = options.maxRunners === undefined || runnersNow < options.maxRunners;
  // Spots ohne aktiven Läufer (ein Durchgang über die Leute statt einer Suche pro Spot).
  const free = () => {
    const manned = new Set<string>();
    for (const m of getStaff(state, { status: 'active', role: 'runner', cityId: city })) {
      if (m.assignment?.kind === 'spot') manned.add(m.assignment.targetId);
    }
    return getSpots(state, city).filter((s) => !manned.has(s.id));
  };
  const stock = getStock(state, { cityId: city });
  const locked = () => lockedSpots(state).filter((s) => spotCity(s) === city);

  // Bewerber mit Level zuerst, sonst von der Straße.
  const openSpots = free().sort((a, b) => b.demand - a.demand);
  if (
    mayHire &&
    openSpots.length > 0 &&
    stock > 60 &&
    money(state) > runnerHireCost(state, openSpots[0].id) + reserve(state) + 1000
  ) {
    // Günstige Leute zuerst: Ein Läufer soll mehr einbringen, als er kostet.
    const candidate = getCandidates(state)
      .filter(
        (c) => c.role === 'runner' && c.wage <= MAX_RUNNER_WAGE && c.hireCost <= money(state) - reserve(state) - 400,
      )
      .sort((a, b) => a.wage - b.wage || b.level - a.level)[0];
    if (candidate) {
      run(sim, stats, {
        type: 'recruiting.hire',
        payload: { candidateId: candidate.id, assignment: { kind: 'spot', targetId: openSpots[0].id } },
      });
    } else {
      run(sim, stats, { type: 'staff.hireRunner', payload: { spotId: openSpots[0].id } });
    }
  }

  if (!expand) return;
  // Freischalten, wenn alle Spots besetzt sind und Geld übrig ist.
  if (free().length === 0) {
    const next = locked().sort((a, b) => (a.unlockCost ?? 0) - (b.unlockCost ?? 0))[0];
    if (next && money(state) > (next.unlockCost ?? 0) + reserve(state) + runnerHireCost(state, next.id) + 600) {
      run(sim, stats, { type: 'spots.unlock', payload: { spotId: next.id } });
    }
  }

  // Später: eigene Spots in Nachbar-Veedeln gründen, um weiter zu wachsen (Köln übernehmen).
  if (locked().length === 0 && free().length === 0 && money(state) > reserve(state) + 3000) {
    const mine = new Set(controlledBy(state, PLAYER_FACTION));
    const withSpot = new Set(getSpots(state, city).map((s) => s.veedelId));
    const target = allVeedel(city)
      .filter((v) => !mine.has(v.id) && !withSpot.has(v.id) && neighborsOf(v.id).some((n) => mine.has(n)))
      .sort((a, b) => b.purchasingPower - a.purchasingPower || a.id.localeCompare(b.id))[0];
    if (target) {
      for (const [dx, dy] of [
        [0, 0],
        [0.003, 0],
        [0, 0.003],
        [-0.003, 0],
        [0, -0.003],
      ]) {
        const lng = target.center.lng + dx;
        const lat = target.center.lat + dy;
        if (!canFoundSpotAt(state, lng, lat).ok) continue;
        // Auftrag 23: In dichten Veedeln ein Bahnhof (viel Andrang), sonst eine Straßenecke.
        const kind = (target.density ?? 1) >= 1.2 ? 'station' : 'corner';
        run(sim, stats, { type: 'spots.found', payload: { lng, lat, kind } });
        break;
      }
    }
  }

  // Auftrag 23: Eigene Spots mit Stammplatz ausbauen, damit sie sich schneller herumsprechen.
  for (const spot of customSpots(state)) {
    if (spotAwareness(state, spot.id) >= 0.8 || spotUpgrades(state, spot.id).includes('regular')) continue;
    if (money(state) < reserve(state) + SPOT_UPGRADES.regular.cost + 1000) break;
    run(sim, stats, { type: 'spots.upgrade', payload: { spotId: spot.id, upgrade: 'regular' } });
  }

  appointLieutenants(sim, stats);
  appointRightHand(sim, stats);
  appointCapo(sim, stats);

  // Sicherheit: eine pro Veedel mit Leuten, sobald eine Gang droht.
  const threatened = getGangs(state, city).some((g) => (state.modules.gangs.gangs[g.id]?.hostility ?? 0) >= 40);
  if (threatened) {
    const guards = getStaff(state, { role: 'security', cityId: city }).length;
    const runners = getStaff(state, { role: 'runner', cityId: city }).length;
    if (guards < Math.ceil(runners / 3) + 1) {
      const candidate = getCandidates(state)
        .filter(
          (c) =>
            c.role === 'security' &&
            c.wage <= MAX_RUNNER_WAGE * 1.5 &&
            c.hireCost <= money(state) - reserve(state) - 500,
        )
        .sort((a, b) => a.wage - b.wage || b.level - a.level)[0];
      // Erst das Lager, dann die Spots mit dem meisten Andrang.
      const warehouseGuarded = securityAt(state, { warehouseId: home }).length > 0;
      const spot = getSpots(state, city)
        .filter((s) => getStaff(state, { spotId: s.id, role: 'security' }).length === 0)
        .sort((a, b) => b.demand - a.demand)[0];
      const assignment = !warehouseGuarded
        ? { kind: 'warehouse' as const, targetId: home }
        : spot
          ? { kind: 'spot' as const, targetId: spot.id }
          : null;
      if (candidate && assignment) {
        run(sim, stats, { type: 'recruiting.hire', payload: { candidateId: candidate.id, assignment } });
      }
    }
  }
}

/**
 * Leutnants: Sobald zwei Spots ohne Leutnant laufen (oder das Team groß genug ist), bekommt der erfahrenste Läufer
 * bis zu drei davon, möglichst im selben Veedel (gebündelt bringt mehr Einfluss). Er bestellt nach einer einfachen
 * Regel (alles nach Nachfrage) und heuert selbst an.
 */
function appointLieutenants(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const city = activeCity(state);
  const unled = getSpots(state, city)
    .filter((s) => !lieutenantOfSpot(state, s.id))
    .sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));
  if (unled.length < 2 && !(unled.length >= 1 && getStaff(state, { cityId: city }).length >= 4)) return;
  if (money(state) <= reserve(state) + 800) return;
  const best = getStaff(state, { status: 'active', role: 'runner', cityId: city })
    .filter((m) => m.level >= 2 && !isLieutenant(state, m.id))
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))[0];
  if (!best) return;
  // Das Veedel mit den meisten freien Spots zuerst, dann die übrigen nach Andrang.
  const count = (veedelId: string) => unled.filter((s) => s.veedelId === veedelId).length;
  const spotIds = [...unled]
    .sort((a, b) => count(b.veedelId) - count(a.veedelId) || b.demand - a.demand || a.id.localeCompare(b.id))
    .slice(0, MAX_SPOTS_PER_LIEUTENANT)
    .map((s) => s.id);
  if (run(sim, stats, { type: 'hierarchy.appoint', payload: { staffId: best.id, spotIds } })) {
    // Einfache Bestellregel: alles nach Nachfrage, beim günstigsten Lieferanten, ab 80 Einheiten im Lager seiner Spots.
    const orderRules = [
      { id: 'r1', productId: null, supplierId: null, packageId: null, minStock: 80, warehouseId: null, paused: null },
    ];
    run(sim, stats, { type: 'hierarchy.configure', payload: { staffId: best.id, settings: { orderRules } } });
  }
}

/**
 * Auftrag 34: Ab acht Leutnants in der Stadt macht er den erfahrensten, der es kann (Level 5, drei Spots), zum Capo,
 * mit bis zu drei Leutnants aus dessen Bezirk. Kommen neue Leutnants in den Bezirk, füllt er auf.
 */
function appointCapo(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const city = activeCity(state);
  const lieutenants = getStaff(state, { cityId: city }).filter((m) => isLieutenant(state, m.id));
  if (lieutenants.length < CAPO_ADVICE_LIEUTENANTS) return;
  const existing = getCapos(state, city);
  for (const capo of existing) {
    if (capo.lieutenants.length >= CAPO_MAX_LIEUTENANTS) continue;
    const more = capoCandidates(state, capo.staffId).filter((id) => !capo.lieutenants.includes(id));
    if (more.length === 0) continue;
    const ids = [...capo.lieutenants, ...more].slice(0, CAPO_MAX_LIEUTENANTS);
    run(sim, stats, { type: 'hierarchy.appointCapo', payload: { staffId: capo.staffId, lieutenantIds: ids } });
  }
  if (existing.length > 0 || money(state) <= reserve(state) + 1000) return;
  const best = lieutenants
    .filter((m) => canBeCapo(state, m.id).ok)
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))[0];
  if (!best) return;
  const ids = capoCandidates(state, best.id).slice(0, CAPO_MAX_LIEUTENANTS);
  run(sim, stats, { type: 'hierarchy.appointCapo', payload: { staffId: best.id, lieutenantIds: ids } });
}

/**
 * Später: eine Rechte Hand, sobald es zwei Leutnants gibt und jemand die Voraussetzungen erfüllt. Der Bot gibt ihr
 * alle Aufgaben (sie laufen an, sobald ihre Stufe reicht): Aufträge fährt sie, den Hafen holt sie ab, bestellt nach,
 * stellt ein, macht Großhandel bis 10.000 € und wäscht über 8.000 € die Hälfte.
 */
function appointRightHand(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  if (getRightHand(state) || money(state) <= reserve(state) + 500) return;
  const candidate = getStaff(state, { status: 'active', cityId: activeCity(state) })
    .filter((m) => canBeRightHand(state, m.id).ok && !isLieutenant(state, m.id))
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))[0];
  if (!candidate) return;
  if (!run(sim, stats, { type: 'hierarchy.appointRightHand', payload: { staffId: candidate.id } })) return;
  run(sim, stats, {
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: {
        orders: true,
        orderMaxPrice: 3000,
        pickup: true,
        restock: true,
        staffing: true,
        wholesale: true,
        wholesaleMaxPrice: 10000,
        laundering: true,
        launderAbove: 8000,
        launderShare: 0.5,
      },
    },
  });
}

/** Darf der Bot einen Ausfall ersetzen? Ohne Läufer-Grenze immer, sonst nur unter der Grenze oder mit freien Leuten. */
function mayReplace(state: GameState, options: BotOptions): boolean {
  if (options.maxRunners === undefined) return true;
  const runners = getStaff(state, { role: 'runner' });
  return runners.length < options.maxRunners || runners.some((m) => m.status === 'active' && !m.assignment);
}

/**
 * Geschichten der Leute (Auftrag 34): kleine Geldbitten aus der Portokasse (höchstens ein Zehntel), Kaution für
 * Geschwister bis zu einem Viertel, frei geben, verwarnen statt kürzen, versprechen statt Lohn. Gibt true zurück, wenn
 * die Nachricht eine Geschichte war.
 */
function answerStory(
  sim: Simulation,
  stats: BotStats,
  messageId: number,
  options: readonly { id: string; command?: Command }[],
): boolean {
  const command = options.find((o) => o.command?.type === 'staff.storyChoice')?.command;
  if (command?.type !== 'staff.storyChoice') return false;
  const story = openStories(sim.state).find((s) => s.id === command.payload.storyId);
  if (!story) return false;
  const cheap = story.amount <= money(sim.state) / 10;
  const PREFER: Record<StoryId, string[]> = {
    loan: cheap ? ['give'] : ['refuse'],
    familyTime: ['off'],
    drunk: ['warn'],
    hangover: ['ok'],
    debt: cheap ? ['pay'] : ['refuse'],
    gamblerWin: ['cheer'],
    promotion: ['promise'],
    raise: ['yes'],
    bragged: ['shut'],
    scared: ['pull'],
    loyalTip: ['hide'],
    hothead: ['warn'],
    rivalsFight: ['both'],
    friendsParty: cheap ? ['pay'] : ['no'],
    coupleMoveIn: cheap ? ['pay'] : ['no'],
    siblingJailed: story.amount <= money(sim.state) / 4 ? ['bail', 'wait'] : ['wait'],
  };
  for (const optionId of [...PREFER[story.story], ...options.map((o) => o.id)]) {
    if (!options.some((o) => o.id === optionId)) continue;
    if (run(sim, stats, { type: 'messages.answer', payload: { messageId, optionId } })) break;
  }
  return true;
}

/**
 * Offene Handy-Nachrichten beantworten. Schutzgeld und Waffenstillstand nur, wenn es aus der Portokasse geht
 * (höchstens ein Viertel des Geldes), sonst ablehnen. Aufträge und Angebote lehnt er ab, Warnungen nimmt er ernst.
 */
function answerMessages(sim: Simulation, stats: BotStats, botOptions: BotOptions): void {
  const state = sim.state;
  // Auftrag 23: Abwerben mit mehr Lohn kontern, nach einem Einbruch die Leute die Täter suchen lassen, Gefallen und
  // Warnungen der Gangs annehmen, Erpressung ablehnen.
  const PREFERENCE = [
    'tribute',
    'ceasefire',
    'raise',
    'bribe',
    'detour',
    'hunt',
    'accept',
    'thanks',
    'lieLow',
    'refuse',
    'decline',
    'no',
    'later',
    'ignore',
  ];
  for (const m of [...state.messages.list]) {
    if (!messages.canAnswer(state, m)) continue;
    if (CITY_CONTACTS.has(m.contactId)) continue;
    // Auftrag 34: Geschichten der Leute beantwortet er wie ein vernünftiger Chef.
    if (answerStory(sim, stats, m.id, m.options ?? [])) continue;
    // Auftrag 34: Großhandel von Dealern: mit der Rechten Hand immer, selbst nur für Stammabnehmer (ab „regelmäßig“).
    // Fremde Dealer lehnt er ohne Rechte Hand höflich ab (ablehnen kostet weniger Vertrauen als hängenlassen).
    if (
      m.contactId.startsWith('dealer:') &&
      (m.options ?? []).some((o) => o.command?.type === 'customers.acceptOrder')
    ) {
      const regular = dealerStage(state, m.contactId.slice(7)) !== 'casual';
      for (const optionId of regular ? ['rightHand', 'self', 'decline'] : ['rightHand', 'decline']) {
        if (!(m.options ?? []).some((o) => o.id === optionId)) continue;
        if (run(sim, stats, { type: 'messages.answer', payload: { messageId: m.id, optionId } })) break;
      }
      continue;
    }
    // Auftrag 34: Im Gang-Krieg liefert er Ware, wenn das Lager voll genug ist, sonst hält er sich raus.
    if ((m.options ?? []).some((o) => o.command?.type === 'gangs.supportWar')) {
      const plenty = getStock(state, { cityId: activeCity(state) }) >= 300;
      for (const optionId of plenty ? ['goods', 'stay'] : ['stay']) {
        if (run(sim, stats, { type: 'messages.answer', payload: { messageId: m.id, optionId } })) break;
      }
      continue;
    }
    // Routine (Lieferanfragen, Hafen) überlässt der Bot seiner Rechten Hand, sobald sie das Handy übernimmt.
    if (m.routine && rightHandHandlesOrders(state)) continue;
    const options = m.options ?? [];
    const affordable = (id: string) => {
      const option = options.find((o) => o.id === id);
      const command = option?.command;
      if (!command) return true;
      if (command.type === 'gangs.payTribute') return tributeAmount(state, command.payload.gangId) <= money(state) / 4;
      if (command.type === 'gangs.ceasefire') return ceasefireCost(state, command.payload.gangId) <= money(state) / 4;
      return true;
    };
    // Festnahme: gute Leute (ab Level 3) per Kaution raus, wenn es aus der Portokasse geht, sonst ersetzen. Der
    // vorsichtige Bot zahlt keine Kaution und ersetzt nur mit freien Leuten (mehr Läufer will er nicht), sonst wartet er.
    const arrest = options.find((o) => o.id === 'replace' || o.id === 'fireReplace');
    if (arrest) {
      const bail = options.find((o) => o.id === 'bail')?.command;
      const staffId = arrest.command?.type === 'staff.replace' ? arrest.command.payload.staffId : null;
      const member = staffId ? getStaff(state).find((x) => x.id === staffId) : undefined;
      const order = [
        ...(botOptions.bail !== false &&
        bail?.type === 'staff.bail' &&
        member &&
        member.level >= 3 &&
        bailCost(state, member.id) <= money(state) / 4
          ? ['bail']
          : []),
        ...(mayReplace(state, botOptions) ? ['replace'] : []),
        'wait',
      ];
      for (const optionId of order.filter((id) => options.some((o) => o.id === id))) {
        if (run(sim, stats, { type: 'messages.answer', payload: { messageId: m.id, optionId } })) break;
      }
      continue;
    }
    const choices = PREFERENCE.filter((p) => options.some((o) => o.id === p) && affordable(p));
    for (const optionId of choices) {
      if (run(sim, stats, { type: 'messages.answer', payload: { messageId: m.id, optionId } })) break;
    }
  }
}

/**
 * Konfrontationen (Auftrag 35): Der Bot geht nie selbst hin, schickt aber die vorgeschlagene Crew und gibt per Handy
 * Anweisungen wie ein guter Spieler (Absicht abwenden, Einsatz schützen, Spezialzüge nutzen). Was übrig bleibt,
 * würfeln die Leute aus.
 */
function handleEncounters(sim: Simulation, stats: BotStats): void {
  for (const e of [...activeEncounters(sim.state)]) {
    if (e.phase === 'done') continue;
    if (e.phase === 'briefing') {
      const crew = suggestedCrew(sim.state, e, requestCity(sim.state, e.request));
      const joined = run(sim, stats, { type: 'encounters.join', payload: { encounterId: e.id, mode: 'crew', crew } });
      if (!joined) run(sim, stats, { type: 'encounters.join', payload: { encounterId: e.id, present: false } });
    }
    for (let i = 0; i < 20; i++) {
      const current = getEncounter(sim.state, e.id);
      if (current?.phase !== 'rounds') break;
      const move = chooseMove(current, true);
      if (move) {
        if (!run(sim, stats, { type: 'encounters.special', payload: { encounterId: e.id, participantId: move } }))
          break;
        continue;
      }
      const choice = chooseAuto(sim.state, current, true);
      const payload = {
        encounterId: e.id,
        actionId: choice?.actionId ?? '',
        ...(choice?.protect ? { protect: choice.protect } : {}),
      };
      if (!choice || !run(sim, stats, { type: 'encounters.act', payload })) break;
    }
    if (getEncounter(sim.state, e.id)?.phase === 'rounds') {
      run(sim, stats, { type: 'encounters.auto', payload: { encounterId: e.id } });
    }
  }
}

/** Kredit bei Lieferanten zurückzahlen, sobald das Geld reicht. */
function repay(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  for (const supplier of getSuppliers(state)) {
    const debt = getRelation(state, supplier.id).debt;
    if (debt > 0 && money(state) > reserve(state) + debt) {
      run(sim, stats, { type: 'suppliers.repay', payload: { supplierId: supplier.id, amount: debt } });
    }
  }
}

/**
 * Die nächste Stadt, die der Bot wählt (Auftrag 36: Reihenfolge frei): die günstigste zum Anfangen (Faktoren für Lager
 * und Löhne), bei Gleichstand die schnellste Fahrt. null, wenn keine frei ist.
 */
export function chooseNextCity(state: GameState, from: string, order?: readonly string[]): string | null {
  const preferred = order?.find((id) => freeCities(state).includes(id));
  if (preferred) return preferred;
  const cost = (id: string) => (getCity(id)?.propertyFactor ?? 1) + (getCity(id)?.wageFactor ?? 1);
  const list = [...freeCities(state)].sort(
    (a, b) => cost(a) - cost(b) || travelMinutesBetween(from, a) - travelMinutesBetween(from, b),
  );
  return list[0] ?? null;
}

/**
 * Städte (Auftrag 30 und 36): Gehört dir die ganze Stadt und erfüllt die Rechte Hand alles, übergibt der Bot mit
 * Startpaket an den Statthalter und fährt in die Stadt, die er gewählt hat. Ist er in einer Stadt mit Vollmacht (z.B.
 * zurück zu Besuch), fährt er in eine freie Stadt ohne Vollmacht.
 */
function moveOn(sim: Simulation, stats: BotStats, options: BotOptions): void {
  const state = sim.state;
  if (isPlayerTraveling(state)) return;
  const here = presentCity(state);
  if (here === null) return;
  const progress = campaignProgress(state, here);
  if (
    !hasFullPower(state, here) &&
    progress.controlled >= progress.total &&
    fullPowerMissing(state, here).length === 0
  ) {
    const next = chooseNextCity(state, here, options.cityOrder);
    if (next) {
      // Leute bleiben in ihrer Stadt; ein Fahrzeug kommt mit.
      const vehicleIds = freeVehicles(state, here)
        .slice(0, 1)
        .map((v) => v.id);
      const pack = { vehicleIds };
      const done = run(sim, stats, { type: 'city.handOver', payload: { cityId: here, toCityId: next, pack } });
      if (done) {
        stats.cities ??= [];
        stats.cities.push({ from: here, to: next, day: Math.floor(state.time / 1440) + 1 });
        return;
      }
    }
    run(sim, stats, { type: 'hierarchy.grantFullPower', payload: { cityId: here } });
  }
  if (!hasFullPower(state, here)) return;
  const next = citiesUnlocked(state).find((c) => c !== here && !hasFullPower(state, c));
  if (next) run(sim, stats, { type: 'city.travel', payload: { cityId: next } });
}

/** Nachrichten der Städte (Angebote) beantwortet der Bot nicht im Chat: Er entscheidet selbst (moveOn). */
const CITY_CONTACTS = new Set(NEXT_CITY.filter((id) => CITY_OFFERS[id]).map((id) => cityContact(id).id));

/** Ein Blick aufs Spiel. */
export function botTurn(sim: Simulation, stats: BotStats, options: BotOptions = DEFAULT_BOT): void {
  if (sim.state.outcome.gameOver) return;
  // Auftrag 40: Als Boss von Deutschland verkauft er, danach spielt er die Hafen-Phase (botTrade.ts).
  const command = (c: Command) => run(sim, stats, c);
  if (options.sellBusiness !== false) sellWhenOffered(sim.state, command);
  if (isBusinessSold(sim.state)) {
    handleEncounters(sim, stats);
    answerMessages(sim, stats, options);
    if (!isPlayerTraveling(sim.state)) {
      tradeTurn(sim.state, command);
      if (options.grow !== false) growTurn(sim.state, command);
    }
    return;
  }
  moveOn(sim, stats, options);
  // Unterwegs zwischen den Städten: nur das Nötigste (Handy, Konfrontationen).
  if (isPlayerTraveling(sim.state)) {
    handleEncounters(sim, stats);
    answerMessages(sim, stats, options);
    return;
  }
  handleEncounters(sim, stats);
  tryOwnPrice(sim, stats);
  takeContract(sim, stats);
  answerMessages(sim, stats, options);
  sellPersonally(sim, stats, options);
  repay(sim, stats);
  unlockSuppliers(sim, stats);
  if (options.expand !== false) harbor(sim, stats);
  if (options.expand !== false) warehouseUpkeep(sim, stats);
  buyDeals(sim, stats);
  restock(sim, stats);
  grow(sim, stats, options);
}

/** Lässt den Bot so viele Spielminuten spielen. */
export function playFor(sim: Simulation, minutes: number, stats: BotStats, options: BotOptions = DEFAULT_BOT): void {
  const end = sim.state.time + minutes;
  while (sim.state.time < end && !sim.state.outcome.gameOver) {
    botTurn(sim, stats, options);
    sim.advance(Math.min(options.attentionEvery, end - sim.state.time));
  }
}

export function newBotStats(): BotStats {
  return { commands: 0, failed: 0, byType: {}, deals: [] };
}

/** Kurzbericht eines Spielstands. */
export function snapshot(state: GameState) {
  const gangs = state.modules.gangs;
  return {
    day: Math.floor(state.time / 1440) + 1,
    dirty: Math.round(state.wallet.dirty),
    clean: Math.round(state.wallet.clean),
    stock: getStock(state),
    staff: getStaff(state).length,
    runners: getStaff(state, { role: 'runner' }).length,
    suppliers: getSuppliers(state).filter((s) => isUnlocked(state, s.id)).length,
    berth: hasBerth(state),
    security: getStaff(state, { role: 'security' }).length,
    lieutenants: Object.keys(state.modules.hierarchy.posts).length,
    spots: getSpots(state).length,
    veedel: controlledBy(state, PLAYER_FACTION).length,
    /** Aktive Stadt und Veedel pro Stadt (Auftrag 30). */
    city: activeCity(state),
    koeln: campaignProgress(state, 'koeln').controlled,
    hamburg: campaignProgress(state, 'hamburg').controlled,
    /** Veedel unter deiner Kontrolle pro spielbarer Stadt (Auftrag 38, für den Bericht „Tage pro Stadt“). */
    controlled: Object.fromEntries(playableCities().map((c) => [c.id, campaignProgress(state, c.id).controlled])),
    reputation: Math.round(state.modules.reputation.value),
    maxHostility: Math.round(Math.max(...Object.values(gangs.gangs).map((s) => s.hostility))),
    gameOver: state.outcome.gameOver?.reason ?? null,
    /** Einlagern mit Kapazität (Auftrag 33): Anteil der Gramm, die nicht ins Lager passten. */
    rejected: storageStats(state).offered > 0 ? storageStats(state).rejected / storageStats(state).offered : 0,
    vehicles: getVehicles(state).length,
    /** Tag, an dem Köln komplett war (alle Veedel, Auftrag 30). */
    won: state.outcome.won ? Math.floor(state.outcome.won.time / 1440) + 1 : null,
    /** Tag des Meilensteins "Boss von Köln" (Mehrheit der Veedel). */
    boss: state.modules.territory.milestones?.koeln?.majority
      ? Math.floor(state.modules.territory.milestones.koeln.majority / 1440) + 1
      : null,
  };
}
