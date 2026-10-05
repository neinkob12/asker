// Aufgaben der Rechten Hand (Auftrag 28), jede einzeln an- und abschaltbar und nach Stufe freigeschaltet
// (RIGHT_HAND_TASKS in config.ts). Sie handelt nur über ctx.dispatch(…, { actor: 'staff:<id>' }) mit bestehenden
// Befehlen anderer Module und antwortet im Chat über messages.answerAs. Was sie erledigt, zählt sie in rh.done
// (Tagesbericht) und bringt Erfahrung (Stufen).
//
//   Schnell (jeder Tick, alle TICK_EVERY Minuten): Nachbestellen, Aufträge und Handy (Lieferanfragen annehmen und selbst fahren,
//   Großhandel bis zu ihrem Betrag), Hafen abholen (freien Fahrer schicken).
//   Stündlich (RIGHT_HAND_INTERVAL): Personal, Geldwäsche.

import { type Actor, type Ctx, clock, formatEuro, type GameState, messages } from '../../core';
import { activeCity, cityAt, isBusinessSold } from '../city';
import { getOrders, type Order } from '../customers';
import { wageRunway } from '../finance';
import {
  allProducts,
  DEFAULT_WAREHOUSE,
  getStock,
  getWarehouses,
  isWarehouseOwned,
  productName,
  warehouseCity,
} from '../goods';
import { amountInProgress, launderingCapacity, MIN_LAUNDERING_AMOUNT } from '../laundering';
import { freeDrivers, getCargo, harborQuestions, portName } from '../logistics';
import { getSpots } from '../spots';
import {
  activeRunnerAt,
  freeStaff,
  getStaff,
  getStaffMember,
  runnerAt,
  runnerHireCost,
  type StaffMember,
} from '../staff';
import { availablePackages, getSuppliers, isUnlocked } from '../suppliers';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { veedelName } from '../veedel';
import {
  FP_RESTOCK_BUDGET_PER_DAY,
  FP_STOCK_GRAMS,
  FP_STOCK_PIECES,
  RIGHT_HAND_RESTOCK_RESERVE,
  RIGHT_HAND_TASKS,
  XP_RIGHT_HAND_REPORT,
  XP_RIGHT_HAND_TASK,
} from './config';
import { hireRunnerFor } from './hire';
import { getLieutenants, isVeedelHidden, lieutenantOfSpot } from './index';
import { runRestock } from './orders';
import {
  getRightHand,
  isTaskActive,
  payrollReserve,
  rankForXp,
  rightHandDriver,
  rightHandOrderLimit,
} from './righthand';
import type { OrderRule, RightHandDone, RightHandPost, RightHandTaskKey } from './types';

const VIA = 'Rechte Hand';
/** So lange vor Fristende wartet sie noch auf Ware fürs Lager, danach überlässt sie die Anfrage dir. */
const STOCK_WAIT_MINUTES = 30;

/** Protokoll-Eintrag (ohne Doppelte hintereinander). */
function log(ctx: Ctx, rh: RightHandPost, text: string): void {
  if (rh.log[0]?.text === text) {
    rh.log[0].time = ctx.now;
    return;
  }
  rh.log.unshift({ time: ctx.now, text });
  if (rh.log.length > 12) rh.log.length = 12;
}

// --- Erfahrung und Stufen ---

/** Erfahrung als Rechte Hand; steigt die Stufe, sagt sie Bescheid und neue Aufgaben werden frei. */
export function addRightHandXp(ctx: Ctx, rh: RightHandPost, amount: number, member: StaffMember): void {
  const before = rankForXp(rh.xp);
  rh.xp += amount;
  const after = rankForXp(rh.xp);
  if (after <= before) return;
  const unlocked = RIGHT_HAND_TASKS.filter((t) => t.rank === after).map((t) => `"${t.name}"`);
  const text =
    `Ich hab dazugelernt, Stufe ${after}.` +
    (unlocked.length > 0 ? ` Du kannst mir jetzt auch ${unlocked.join(' und ')} überlassen.` : '');
  log(ctx, rh, `Stufe ${after} erreicht.`);
  // Aus einer anderen Stadt (Statthalter) oder nach dem Verkauf steht es nur in ihrem Protokoll (Auftrag 43).
  const here = (member.cityId ?? 'koeln') === activeCity(ctx.state) && !isBusinessSold(ctx.state);
  if (here) messages.send(ctx, { contact: staffContactOf(member), text, silent: false });
  ctx.emit('hierarchy.rightHandRankUp', { staffId: member.id, rank: after });
}

function staffContactOf(member: StaffMember) {
  return { id: `staff:${member.id}`, name: member.name, kind: 'staff' as const };
}

/** Erfahrung für einen guten Tagesbericht (kein Verlust). */
export function rewardReport(ctx: Ctx, rh: RightHandPost, member: StaffMember, profit: number): void {
  if (profit >= 0) addRightHandXp(ctx, rh, XP_RIGHT_HAND_REPORT, member);
}

/** Text fürs Erledigte im Tagesbericht, z.B. "3 Lieferungen gefahren, 1 Abholung, 2 Anfragen dir überlassen". */
export function describeDone(done: RightHandDone): string {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
  if (done.deliveries > 0) parts.push(`${n(done.deliveries, 'Lieferung', 'Lieferungen')} gefahren`);
  if (done.pickups > 0) parts.push(`${n(done.pickups, 'Abholung', 'Abholungen')} am Hafen`);
  if (done.orders > 0) parts.push(n(done.orders, 'Bestellung', 'Bestellungen'));
  if (done.hires > 0) parts.push(`${n(done.hires, 'neue Person', 'neue Leute')} eingestellt`);
  if (done.laundered > 0) parts.push(`${formatEuro(done.laundered)} gewaschen`);
  if (done.leftToBoss > 0) parts.push(`${n(done.leftToBoss, 'Anfrage', 'Anfragen')} dir überlassen`);
  return parts.join(', ');
}

// --- Schnelle Aufgaben: Aufträge und Handy, Hafen abholen ---

/** Läuft jeden Tick. Eine Lieferung pro Durchgang, damit die Fahrt sauber beginnt. */
export function runQuickTasks(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  handleOrders(ctx, rh, member, actor);
  handlePickup(ctx, rh, member, actor);
  restock(ctx, rh, member, actor);
}

/** Eine Anfrage bleibt beim Spieler: einmal merken und ins Protokoll, nicht jede Runde wieder. */
function pass(ctx: Ctx, rh: RightHandPost, order: Order, reason: string): void {
  if (rh.passed.includes(order.id)) return;
  rh.passed.push(order.id);
  rh.done.leftToBoss += 1;
  log(ctx, rh, `Anfrage von ${order.contactName} (${formatEuro(order.price)}) bleibt bei dir: ${reason}.`);
}

/**
 * Lieferanfragen (Aufgabe "Aufträge und Handy") und Großhandel (Aufgabe "Großhandel") annehmen und selbst fahren.
 * Regeln: Betrag bis zu ihrer Grenze, auf Wunsch nur in eigenen Revieren, genug Ware. Ist sie unterwegs, wartet
 * sie, wenn die Frist das hergibt; sonst bleibt die Anfrage beim Spieler (Chefsache).
 */
function handleOrders(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const state = ctx.state;
  const orders = isTaskActive(state, 'orders');
  const wholesale = isTaskActive(state, 'wholesale');
  if (!orders && !wholesale) return;
  const offered = getOrders(state, { status: 'offered' })
    .filter((o) => !rh.passed.includes(o.id))
    .sort((a, b) => a.expiresAt - b.expiresAt || a.id - b.id);
  for (const order of offered) {
    const big = order.kind === 'wholesale';
    if (big ? !wholesale : !orders) continue;
    // Mit Vollmacht nimmt sie Großhandel bis zu ihrem Betrag für Deals an (Gangs und Chefsache).
    const dealLimit = rh.fullPower && rh.settings.fullPowerTasks.diplomacy ? rh.settings.dealMax : 0;
    const limit = big ? Math.max(rh.settings.wholesaleMaxPrice, dealLimit) : rightHandOrderLimit(state);
    if (order.price > limit) {
      pass(ctx, rh, order, `über meiner Grenze von ${formatEuro(limit)}`);
      continue;
    }
    if (!big && rh.settings.ordersOwnTurfOnly && !controlledBy(state, PLAYER_FACTION).includes(order.veedelId)) {
      pass(ctx, rh, order, `${veedelName(order.veedelId)} ist nicht unser Revier`);
      continue;
    }
    // Bestand der Stadt des Auftrags, wie ihn customers.acceptOrder prüft (sonst gibt sie ihn nur an den Boss ab).
    if (getStock(state, { productId: order.productId, cityId: cityAt(order.lng, order.lat) }) < order.amount) {
      // Kommt Ware nach (Bestellung unterwegs), wartet die Anfrage; erst kurz vor Fristende bleibt sie beim Spieler.
      if (order.expiresAt - ctx.now > STOCK_WAIT_MINUTES) continue;
      pass(ctx, rh, order, `nicht genug ${productName(order.productId)} im Lager`);
      continue;
    }
    const driver = rightHandDriver(state);
    if (!driver.ok) {
      // Unterwegs: Reicht die Frist, bis sie zurück ist, nimmt sie die Anfrage danach.
      const current = getOrders(state, { status: 'enRoute' }).find((o) => o.courierId === member.id);
      if (current?.arrivesAt !== null && current?.arrivesAt !== undefined && current.arrivesAt + 15 < order.expiresAt) {
        continue;
      }
      pass(ctx, rh, order, 'ich bin noch unterwegs und die Frist ist zu knapp');
      continue;
    }
    const result = ctx.dispatch(
      { type: 'customers.acceptOrder', payload: { orderId: order.id, by: 'rightHand' } },
      { actor },
    );
    if (!result.ok) {
      pass(ctx, rh, order, result.reason ?? 'ging nicht');
      continue;
    }
    // Im Chat zusagen: mit der Antwort "Rechte Hand schicken", sonst (Anfrage von vor ihrer Ernennung) als "selbst".
    const reply = big ? 'Meine Rechte Hand bringt die Ware.' : 'Rechte Hand hat zugesagt: Ich komm vorbei.';
    if (!messages.answerAs(ctx, { messageId: order.messageId, optionId: 'rightHand', via: VIA, reply })) {
      messages.answerAs(ctx, { messageId: order.messageId, optionId: 'self', via: VIA, reply });
    }
    rh.done.deliveries += 1;
    addRightHandXp(ctx, rh, XP_RIGHT_HAND_TASK, member);
    log(
      ctx,
      rh,
      `${big ? 'Großhandel mit' : 'Lieferung an'} ${order.contactName} übernommen (${formatEuro(order.price)}).`,
    );
    return;
  }
}

/**
 * Hafen abholen: Liegt Ware am Kai und ist ein Fahrer frei, schickt sie ihn los (eine Fahrt pro Ziel-Lager, die älteste
 * Ware zuerst) und beantwortet die Hafen-Fragen zu dieser Ware.
 */
function handlePickup(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const state = ctx.state;
  if (!isTaskActive(state, 'pickup') || getCargo(state).length === 0 || freeDrivers(state).length === 0) return;
  const first = getCargo(state)[0];
  const group = getCargo(state).filter((c) => c.warehouseId === first.warehouseId);
  const cargoIds = group.map((c) => c.id);
  const result = ctx.dispatch(
    {
      type: 'logistics.pickup',
      payload: { by: 'driver', cargoIds, ...(first.warehouseId ? { warehouseId: first.warehouseId } : {}) },
    },
    { actor },
  );
  if (!result.ok) return;
  for (const m of harborQuestions(state, cargoIds)) {
    messages.answerAs(ctx, { messageId: m.id, optionId: 'driver', via: VIA });
  }
  rh.done.pickups += 1;
  addRightHandXp(ctx, rh, XP_RIGHT_HAND_TASK, member);
  log(ctx, rh, `Fahrer zum ${portName(first.cityId)} geschickt, die Ware kommt ins Lager.`);
}

// --- Nachbestellen (jeder Tick), stündlich: Personal, Geldwäsche ---

export function runHourlyTasks(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  staffing(ctx, rh, member, actor);
  launder(ctx, rh, member, actor);
}

/** Hauptlager für ihre Bestellungen in der Stadt, die live ist: das Standardlager, sonst das erste eigene dort. */
export function mainWarehouseId(state: GameState): string | null {
  const city = activeCity(state);
  if (isWarehouseOwned(state, DEFAULT_WAREHOUSE) && warehouseCity(DEFAULT_WAREHOUSE) === city) return DEFAULT_WAREHOUSE;
  return getWarehouses(state, city)[0]?.id ?? null;
}

/** Was sie heute fürs Nachbestellen noch ausgeben darf: Tagesbudget, Lohnsicherung und eine kleine Rücklage. */
export function restockBudgetLeft(state: GameState): number {
  const rh = getRightHand(state);
  if (!rh) return 0;
  const spent = rh.restockDay === clock.day(state.time) ? rh.restockSpent : 0;
  return Math.max(
    0,
    Math.min(
      Math.max(rh.settings.restockBudgetPerDay, rh.fullPower ? FP_RESTOCK_BUDGET_PER_DAY : 0) - spent,
      state.wallet.dirty - payrollReserve(state, 'goods') - RIGHT_HAND_RESTOCK_RESERVE,
    ),
  );
}

/** Die zuletzt gebauten Vollmacht-Regeln pro Rechte Hand (gleiche Waren, dieselben Objekte; nicht im Spielstand). */
const fullPowerRulesCache = new WeakMap<RightHandPost, { key: string; rules: OrderRule[] }>();

/**
 * Je Ware eine Regel (nur Waren, die ein freigeschalteter Lieferant der Stadt gerade anbietet). Läuft jeden Tick: Die
 * Angebote werden einmal durchgezählt und die Regel-Objekte nur neu gebaut, wenn sich die Warenliste ändert.
 */
function fullPowerRules(state: GameState, rh: RightHandPost): OrderRule[] {
  const city = activeCity(state);
  const offered = new Set<string>();
  for (const sup of getSuppliers(state, city)) {
    if (!isUnlocked(state, sup.id)) continue;
    for (const pkg of availablePackages(state, sup.id, city)) offered.add(pkg.productId);
  }
  const products = allProducts().filter((p) => offered.has(p.id));
  const key = `${city}|${products.map((p) => p.id).join(',')}`;
  const cached = fullPowerRulesCache.get(rh);
  if (cached?.key === key) return cached.rules;
  const rules = products.map((p) => ({
    id: `fp-${p.id}`,
    productId: p.id,
    supplierId: null,
    packageId: null,
    minStock: p.unit === 'Stück' ? FP_STOCK_PIECES : FP_STOCK_GRAMS,
    warehouseId: null,
    paused: null,
  }));
  fullPowerRulesCache.set(rh, { key, rules });
  return rules;
}

/** Nachbestellen für ganz Köln nach ihren Regeln (wie die Leutnants, aber ins Hauptlager und mit eigenem Budget). */
function restock(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const state = ctx.state;
  if (!isTaskActive(state, 'restock')) return;
  const day = clock.day(ctx.now);
  if (rh.restockDay !== day) {
    rh.restockDay = day;
    rh.restockSpent = 0;
  }
  // Mit Vollmacht hält sie von jeder Ware, die es zu kaufen gibt, ein Kilo (bzw. FP_STOCK_PIECES Stück) auf Lager.
  const rules = rh.fullPower ? fullPowerRules(state, rh) : rh.settings.restockRules;
  runRestock(ctx, rules, mainWarehouseId(state), actor, {
    cityId: activeCity(state),
    budget: () => restockBudgetLeft(state),
    onPause: (_rule, reason) => {
      if (!rh.fullPower) log(ctx, rh, `Bestellung ruht: ${reason}`);
    },
    onResume: () => {},
    onNoMoney: () => log(ctx, rh, 'Wir brauchen Ware, aber mein Budget reicht gerade nicht.'),
    onOrdered: (plan) => {
      rh.restockSpent += plan.price;
      rh.done.orders += 1;
      addRightHandXp(ctx, rh, XP_RIGHT_HAND_TASK, member);
      log(ctx, rh, `Nachschub bestellt: ${plan.pkg.label} bei ${plan.supplier.name}.${plan.why}`);
    },
  });
}

/** Was sie fürs Personal ausgeben darf: Schwarzgeld über der Lohnsicherung und einer kleinen Rücklage. */
function staffingBudget(state: GameState): number {
  return state.wallet.dirty - payrollReserve(state) - RIGHT_HAND_RESTOCK_RESERVE;
}

/**
 * Personal: Ausfälle, bei denen ein Leutnant feststeckt, ersetzt sie; leere Spots ohne Leutnant besetzt sie mit einem
 * freien Läufer (wenn "Koordinieren" aus ist, sonst macht das dieses), einem Bewerber oder jemandem von der Straße
 * (gemeinsamer Code mit den Leutnants, siehe hire.ts). Eine Maßnahme pro Stunde, nie an die Lohnsicherung und nicht,
 * wenn die Löhne knapp werden.
 */
function staffing(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const state = ctx.state;
  if (!isTaskActive(state, 'staffing')) return;
  const budget = staffingBudget(state);
  for (const post of getLieutenants(state)) {
    for (const [staffId, absence] of Object.entries(post.absences)) {
      if (!absence.stuck || absence.replaced) continue;
      const gone = getStaffMember(state, staffId);
      const spotId = gone?.returnTo?.kind === 'spot' ? gone.returnTo.targetId : null;
      if (!gone || !spotId) continue;
      // Ersetzen kostet nur, wenn niemand frei ist (Läufer von der Straße): dann nie an die Lohnsicherung.
      const needsHire = gone.role === 'runner' && freeStaff(state, 'runner').length === 0;
      if (needsHire && runnerHireCost(state, spotId) > budget) continue;
      if (ctx.dispatch({ type: 'staff.replace', payload: { staffId } }, { actor }).ok) {
        rh.done.hires += 1;
        addRightHandXp(ctx, rh, XP_RIGHT_HAND_TASK, member);
        log(ctx, rh, `Ausfall im Team von ${post.staffId} ersetzt, der Leutnant kam nicht weiter.`);
        return;
      }
    }
  }
  if (wageRunway(state).warn || getStock(state, { cityId: activeCity(state) }) <= 0) return;
  const spot = getSpots(state, activeCity(state))
    .filter((s) => !runnerAt(state, s.id) && !activeRunnerAt(state, s.id))
    .filter((s) => !lieutenantOfSpot(state, s.id) && !isVeedelHidden(state, s.veedelId))
    .sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id))[0];
  if (!spot) return;
  const free = freeStaff(state, 'runner')[0];
  if (free) {
    // Freie Leute verteilt "Koordinieren". Ist das aus, stellt sie den besten selbst hin, statt ihn herumstehen zu lassen.
    if (rh.settings.coordinate) return;
    const placed = ctx.dispatch(
      { type: 'staff.assign', payload: { staffId: free.id, assignment: { kind: 'spot', targetId: spot.id } } },
      { actor },
    );
    if (placed.ok) log(ctx, rh, `${free.name} steht jetzt am ${spot.name}.`);
    return;
  }
  const hired = hireRunnerFor(ctx, actor, spot.id, budget);
  if (!hired) return;
  rh.done.hires += 1;
  addRightHandXp(ctx, rh, XP_RIGHT_HAND_TASK, member);
  log(ctx, rh, `${hired.name} steht jetzt am ${spot.name}.`);
}

/** Geldwäsche nach Regel: Liegt mehr Schwarzgeld da als ihre Grenze, geht ein Anteil des Überschusses in die Wäsche. */
function launder(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const state = ctx.state;
  if (!isTaskActive(state, 'laundering')) return;
  const excess = state.wallet.dirty - payrollReserve(state) - rh.settings.launderAbove;
  if (excess <= 0) return;
  const free = launderingCapacity(state) - amountInProgress(state);
  const amount = Math.floor(Math.min(excess * rh.settings.launderShare, free) / 50) * 50;
  if (amount < MIN_LAUNDERING_AMOUNT) return;
  if (!ctx.dispatch({ type: 'laundering.launder', payload: { amount } }, { actor }).ok) return;
  rh.done.laundered += amount;
  addRightHandXp(ctx, rh, XP_RIGHT_HAND_TASK, member);
  log(ctx, rh, `${formatEuro(amount)} in die Wäsche gegeben.`);
}

/**
 * Warum eine eingeschaltete Aufgabe gerade nichts tut (für die Oberfläche), sonst null. Ohne diese Zeile sieht "tut
 * nichts" aus wie "kaputt", z.B. Hafen abholen ohne Fahrer oder Nachbestellen mit leerem Budget.
 */
export function taskIdleReason(state: GameState, key: RightHandTaskKey): string | null {
  const rh = getRightHand(state);
  if (!rh) return null;
  switch (key) {
    case 'orders':
    case 'wholesale': {
      const driver = rightHandDriver(state);
      return driver.ok ? null : driver.reason;
    }
    case 'pickup':
      if (freeDrivers(state).length > 0) return null;
      return getStaff(state, { role: 'driver', status: 'active' }).length === 0
        ? 'Ohne Fahrer holt niemand ab: Heuer einen unter Personal an.'
        : 'Alle Fahrer sind gerade unterwegs.';
    case 'restock': {
      const paused = rh.settings.restockRules.find((r) => r.paused)?.paused;
      if (paused) return paused;
      return restockBudgetLeft(state) <= 0 ? 'Das Budget für heute ist aufgebraucht, oder die Löhne gehen vor.' : null;
    }
    case 'staffing':
      return wageRunway(state).warn ? 'Die Löhne sind knapp, deshalb stellt sie niemanden ein.' : null;
    case 'laundering': {
      const excess = state.wallet.dirty - payrollReserve(state) - rh.settings.launderAbove;
      return excess <= 0
        ? `Wartet auf mehr als ${formatEuro(rh.settings.launderAbove)} Schwarzgeld über den Löhnen.`
        : null;
    }
    default:
      return null;
  }
}

/** Um Mitternacht: Anfragen vergessen, die nicht mehr offen sind. */
export function pruneTasks(state: GameState, rh: RightHandPost): void {
  const open = new Set(getOrders(state, { status: 'offered' }).map((o) => o.id));
  rh.passed = rh.passed.filter((id) => open.has(id));
}
