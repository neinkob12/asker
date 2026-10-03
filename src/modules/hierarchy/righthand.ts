// Die Rechte Hand: genau eine Person über den Leutnants. Sie steht an keinem Spot (Einsatz 'office') und handelt wie
// die Leutnants nur über ctx.dispatch(…, { actor: 'staff:<id>' }). Jede Aufgabe ist einzeln abschaltbar:
//   - Tagesbericht jeden Morgen um 8 Uhr per Handy (still, mit Banner nur bei Problemen): Umsatz, Kosten und Gewinn
//     von gestern, Kasse, Reichweite der Löhne, bis zu drei Empfehlungen.
//   - Koordinieren: freie Läufer an leere Spots, auch über Leutnant-Grenzen; gemeinsames Tagesbudget der Leutnants
//     für Anheuern und Bestellen (doppelte Bestellungen verhindert schon das Zählen pro Lager, siehe orders.ts).
//   - Lohnsicherung: Die Löhne für PAYROLL_RESERVE_DAYS Tage fasst kein Leutnant an (für Nachschub an Ware nur die für
//     PAYROLL_RESERVE_DAYS_ORDERS Tage, sonst stünden die Spots bei knapper Kasse leer); reicht es trotzdem nicht,
//     warnt sie mit Banner.
//   - Ausfälle: Kaution (nur mit Anwalt und für wertvolle Leute) oder Ersetzen, wenn der Leutnant das nicht tut.
// Sitzt sie in Haft oder ist weg, laufen die Leutnants allein weiter.

import {
  type Actor,
  type CommandResult,
  type Ctx,
  clock,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { dayReport, spotResults, wageRunway } from '../finance';
import { playerHeat } from '../police';
import { getSpot, getSpots } from '../spots';
import {
  activeRunnerAt,
  addCareer,
  addLoyalty,
  assign,
  bailCost,
  bonusProvider,
  expectedWage,
  freeStaff,
  getStaff,
  getStaffMember,
  isAbsent,
  isEmployed,
  isSpecialist,
  payrollDue,
  roleName,
  runnerAt,
  runnerHireCost,
  type StaffMember,
  setDemand,
  setWage,
  staffContact,
} from '../staff';
import { campaignProgress } from '../territory';
import { veedelName } from '../veedel';
import {
  DEFAULT_RIGHT_HAND_SETTINGS,
  DEMOTION_LOYALTY,
  FULL_POWER_TASKS,
  LOG_LIMIT,
  MAX_ORDER_RULES,
  PAYROLL_RESERVE_DAYS,
  PAYROLL_RESERVE_DAYS_ORDERS,
  PROMOTION_LOYALTY,
  REPORT_HOUR,
  REVOKE_SATISFACTION,
  RIGHT_HAND_BAIL_MIN_LEVEL,
  RIGHT_HAND_DEMAND,
  RIGHT_HAND_DETOUR_CHANCE,
  RIGHT_HAND_INTERVAL,
  RIGHT_HAND_LAUNDER_SHARE_OPTIONS,
  RIGHT_HAND_MAX_RANK,
  RIGHT_HAND_MIN_LEVEL,
  RIGHT_HAND_MIN_LIEUTENANTS,
  RIGHT_HAND_MIN_LOYALTY,
  RIGHT_HAND_ORDER_LIMIT_BY_RANK,
  RIGHT_HAND_RANK_XP,
  RIGHT_HAND_SKIM_CHANCE,
  RIGHT_HAND_SKIM_LOYALTY,
  RIGHT_HAND_SKIM_SHARE,
  RIGHT_HAND_SPEED_PER_RANK,
  RIGHT_HAND_TASKS,
  RIGHT_HAND_WARN_COOLDOWN,
} from './config';
import { cityLabel, describeFullPowerDone, emptyFullPowerDone, payShare, runFullPowerTasks } from './fullpower';
import {
  getLieutenantIds,
  handlesAbsence,
  isLieutenant,
  isVeedelHidden,
  releaseFromTeams,
  teamLeadOf,
  waitsForReturn,
} from './index';
import { normalizeOrderRules } from './orders';
import { describeDone, pruneTasks, rewardReport, runHourlyTasks, runQuickTasks } from './tasks';
import type { DailyReport, RightHandDone, RightHandPost, RightHandSettings, RightHandTaskKey } from './types';

const NOT_EMPLOYED = 'Diese Person arbeitet nicht für dich.';
const OFFICE = { kind: 'office' as const, targetId: 'rightHand' };

// --- Lesen ---

export function getRightHand(state: GameState): RightHandPost | null {
  return state.modules.hierarchy.rightHand;
}

export function isRightHand(state: GameState, staffId: string): boolean {
  return getRightHand(state)?.staffId === staffId;
}

/** Arbeitet die Rechte Hand gerade (eingestellt, aktiv)? */
export function activeRightHand(state: GameState): RightHandPost | null {
  const rh = getRightHand(state);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  return rh && m?.status === 'active' && isEmployed(state, m.id) ? rh : null;
}

export function emptyDone(): RightHandDone {
  return { deliveries: 0, leftToBoss: 0, pickups: 0, orders: 0, hires: 0, laundered: 0 };
}

/** Stufe der Rechten Hand (1 bis RIGHT_HAND_MAX_RANK) aus ihrer Erfahrung als Rechte Hand. */
export function rankForXp(xp: number): number {
  let rank = 1;
  for (let i = 1; i < RIGHT_HAND_RANK_XP.length; i++) if (xp >= RIGHT_HAND_RANK_XP[i]) rank = i + 1;
  return Math.min(RIGHT_HAND_MAX_RANK, rank);
}

export function rightHandRank(state: GameState): number {
  const rh = getRightHand(state);
  return rh ? rankForXp(rh.xp) : 0;
}

/** Erfahrung bis zur nächsten Stufe: [erreicht, nötig], null auf der höchsten Stufe. */
export function rightHandRankProgress(state: GameState): [number, number] | null {
  const rh = getRightHand(state);
  if (!rh) return null;
  const rank = rankForXp(rh.xp);
  if (rank >= RIGHT_HAND_MAX_RANK) return null;
  return [rh.xp - RIGHT_HAND_RANK_XP[rank - 1], RIGHT_HAND_RANK_XP[rank] - RIGHT_HAND_RANK_XP[rank - 1]];
}

/**
 * Was fehlt, damit die Rechte Hand eine Stadt mit voller Macht übernehmen kann (Auftrag 30)? Leer = alles da. Sie
 * braucht die höchste Stufe und alle Aufgaben an, und alle Veedel der Stadt müssen dir gehören.
 */
export function fullPowerMissing(state: GameState, cityId = 'koeln'): string[] {
  const missing: string[] = [];
  const rh = activeRightHand(state);
  if (!rh) {
    missing.push(getRightHand(state) ? 'Deine Rechte Hand fällt gerade aus.' : 'Du hast keine Rechte Hand.');
  } else {
    const name = getStaffMember(state, rh.staffId)?.name ?? 'Deine Rechte Hand';
    const rank = rankForXp(rh.xp);
    if (rank < RIGHT_HAND_MAX_RANK)
      missing.push(`${name} ist auf Stufe ${rank}, sie braucht Stufe ${RIGHT_HAND_MAX_RANK}.`);
    const off = RIGHT_HAND_TASKS.filter((t) => !rh.settings[t.key]).map((t) => t.name);
    if (off.length > 0) missing.push(`Diese Aufgaben sind aus: ${off.join(', ')}.`);
  }
  const progress = campaignProgress(state, cityId);
  if (progress.controlled < progress.total) {
    missing.push(`Du hältst ${progress.controlled} von ${progress.total} Veedeln, es müssen alle sein.`);
  }
  return missing;
}

/** Ist die Aufgabe für ihre Stufe freigeschaltet? */
export function isTaskUnlocked(state: GameState, key: RightHandTaskKey): boolean {
  const task = RIGHT_HAND_TASKS.find((t) => t.key === key);
  return !!task && rightHandRank(state) >= task.rank;
}

/** Läuft die Aufgabe gerade (Rechte Hand aktiv, Aufgabe an und freigeschaltet)? */
export function isTaskActive(state: GameState, key: RightHandTaskKey): boolean {
  const rh = activeRightHand(state);
  return !!rh && rh.settings[key] && isTaskUnlocked(state, key);
}

/** Nimmt die Rechte Hand gerade Lieferanfragen an (Aufgabe "Aufträge und Handy")? Dann kommen etwas mehr. */
export function rightHandHandlesOrders(state: GameState): boolean {
  return isTaskActive(state, 'orders');
}

/** Faktor auf ihr Tempo beim Ausfahren: je Stufe schneller. */
export function rightHandSpeedFactor(state: GameState): number {
  return 1 + (Math.max(1, rightHandRank(state)) - 1) * RIGHT_HAND_SPEED_PER_RANK;
}

/** Bis zu welchem Betrag sie Lieferanfragen annimmt: Grenze des Spielers, höchstens die ihrer Stufe. */
export function rightHandOrderLimit(state: GameState): number {
  const rh = getRightHand(state);
  if (!rh) return 0;
  return Math.min(rh.settings.orderMaxPrice, RIGHT_HAND_ORDER_LIMIT_BY_RANK[rankForXp(rh.xp) - 1]);
}

/**
 * Kann die Rechte Hand jetzt eine Lieferung fahren? Nur sie fährt Aufträge aus (Auftrag 28), eine Fahrt zur Zeit.
 * Gibt sonst den Grund zurück (keine Rechte Hand, fällt aus, schon unterwegs).
 */
export function rightHandDriver(state: GameState): { ok: true; member: StaffMember } | { ok: false; reason: string } {
  const rh = getRightHand(state);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  if (!rh || !m || !isEmployed(state, m.id))
    return { ok: false, reason: 'Du hast keine Rechte Hand, die ausfahren könnte.' };
  if (m.status !== 'active') return { ok: false, reason: `${m.name} fällt gerade aus.` };
  if (m.assignment?.kind === 'delivery')
    return { ok: false, reason: `${m.name} ist schon mit einer Lieferung unterwegs.` };
  return { ok: true, member: m };
}

/** Kann die Person Rechte Hand werden? (Level, Loyalität und genug Leutnants, die sie führen kann) */
export function canBeRightHand(state: GameState, staffId: string): CommandResult {
  const m = getStaffMember(state, staffId);
  if (!m || !isEmployed(state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (isRightHand(state, staffId)) return { ok: false, reason: `${m.name} ist schon deine Rechte Hand.` };
  if (isSpecialist(m.role)) return { ok: false, reason: `${roleName(m.role)} führen keine Leutnants.` };
  if (m.status !== 'active') return { ok: false, reason: `${m.name} ist gerade nicht einsatzbereit.` };
  if (m.level < RIGHT_HAND_MIN_LEVEL) return { ok: false, reason: `${m.name} braucht Level ${RIGHT_HAND_MIN_LEVEL}.` };
  if (m.stats.loyalty < RIGHT_HAND_MIN_LOYALTY) {
    return { ok: false, reason: `${m.name} ist dir nicht treu genug (Loyalität ab ${RIGHT_HAND_MIN_LOYALTY}).` };
  }
  const others = getLieutenantIds(state).filter((id) => id !== staffId).length;
  if (others < RIGHT_HAND_MIN_LIEUTENANTS) {
    return { ok: false, reason: `Eine Rechte Hand lohnt sich erst ab ${RIGHT_HAND_MIN_LIEUTENANTS} Leutnants.` };
  }
  return { ok: true };
}

/** Bietet das Handy die Stelle an? (genug Leutnants, noch keine Rechte Hand) */
export function rightHandOffered(state: GameState): boolean {
  return !getRightHand(state) && getLieutenantIds(state).length >= RIGHT_HAND_MIN_LIEUTENANTS;
}

/** Zufriedenheit der Rechten Hand (0–100): Loyalität und Lohn im Verhältnis zum hohen Anspruch. */
export function rightHandSatisfaction(state: GameState): number | null {
  const rh = getRightHand(state);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  if (!m) return null;
  const expected = expectedWage(state, m.id);
  const ratio = expected > 0 ? m.wage / expected : 1;
  // Nach einem Widerruf der Vollmacht ist sie eine Weile verstimmt.
  const grudge = rh?.grudgeUntil !== null && (rh?.grudgeUntil ?? 0) > state.time ? REVOKE_SATISFACTION : 0;
  return Math.max(0, Math.min(100, Math.round(m.stats.loyalty * 0.6 + Math.min(1, ratio / 1.1) * 40) - grudge));
}

/** Wofür ein Leutnant Geld ausgibt: Personal (Anheuern, Kaution) oder Ware (Nachschub). */
export type SpendingPurpose = 'staff' | 'goods';

/** Schwarzgeld, das die Lohnsicherung zurückhält (0 ohne Rechte Hand oder ausgeschaltet). */
export function payrollReserve(state: GameState, purpose: SpendingPurpose = 'staff'): number {
  const rh = activeRightHand(state);
  if (!rh?.settings.payrollGuard) return 0;
  return payrollDue(state) * (purpose === 'goods' ? PAYROLL_RESERVE_DAYS_ORDERS : PAYROLL_RESERVE_DAYS);
}

/** Was vom gemeinsamen Tagesbudget heute noch übrig ist (null ohne Rechte Hand oder ohne Koordination). */
export function rightHandBudgetLeft(state: GameState): number | null {
  const rh = activeRightHand(state);
  if (!rh?.settings.coordinate) return null;
  const spent = rh.spentDay === clock.day(state.time) ? rh.spent : 0;
  return Math.max(0, rh.settings.budgetPerDay - spent);
}

/**
 * So viel dürfen Leutnants gerade insgesamt noch ausgeben (Lohnsicherung und Budget der Rechten Hand). Für Ware
 * ('goods') ist die Rücklage kleiner als für Personal ('staff': Anheuern, Kaution).
 */
export function leadSpendingLimit(state: GameState, purpose: SpendingPurpose = 'staff'): number {
  let limit = Number.POSITIVE_INFINITY;
  const reserve = payrollReserve(state, purpose);
  if (reserve > 0) limit = state.wallet.dirty - reserve;
  const budget = rightHandBudgetLeft(state);
  if (budget !== null) limit = Math.min(limit, budget);
  return limit;
}

/** Ausgabe eines Leutnants gegen das Tagesbudget der Rechten Hand buchen. */
export function recordLeadSpending(ctx: Ctx, amount: number): void {
  const rh = getRightHand(ctx.state);
  if (!rh) return;
  const day = clock.day(ctx.now);
  if (rh.spentDay !== day) {
    rh.spentDay = day;
    rh.spent = 0;
  }
  rh.spent += amount;
}

/**
 * Springt die Rechte Hand bei diesem Ausfall wirklich ein? Läufer und Sicherheit am Spot ersetzt sie (außer der
 * Leutnant will abwarten), sonst holt sie nur gegen Kaution raus: mit Anwalt und ab einem Level (RIGHT_HAND_BAIL_MIN_LEVEL).
 * Für alles andere fragt das Handy dich.
 */
function rightHandCovers(state: GameState, m: StaffMember): boolean {
  const rh = activeRightHand(state);
  if (!rh?.settings.absences || m.id === rh.staffId || waitsForReturn(state, m.id)) return false;
  if (m.returnTo?.kind === 'spot' && (m.role === 'runner' || m.role === 'security')) return true;
  return m.status === 'jailed' && !!bonusProvider(state, 'bailDiscount') && m.level >= RIGHT_HAND_BAIL_MIN_LEVEL;
}

/** Kümmert sich jemand (Leutnant oder Rechte Hand) um den Ausfall, sodass niemand den Spieler fragen muss? */
export function absenceHandled(state: GameState, staffId: string): boolean {
  const lead = teamLeadOf(state, staffId);
  if (lead && lead !== staffId && handlesAbsence(state, lead, staffId)) return true;
  const m = getStaffMember(state, staffId);
  return !!m && rightHandCovers(state, m);
}

// --- Fehler der Rechten Hand (Vorsicht und Loyalität zählen) ---

/** Verfährt sie sich auf dieser Fahrt? Je weniger Vorsicht, desto öfter (die Fahrt dauert dann länger). */
export function rightHandDetour(ctx: Ctx): boolean {
  const rh = getRightHand(ctx.state);
  const m = rh ? getStaffMember(ctx.state, rh.staffId) : undefined;
  if (!m) return false;
  return ctx.chance(RIGHT_HAND_DETOUR_CHANCE * (1 - m.stats.caution / 100));
}

/**
 * Zweigt sie von einer Lieferung etwas ab? Nur unter RIGHT_HAND_SKIM_LOYALTY, selten und mild: Ein Anteil des
 * Erlöses fehlt in der Kasse, im Protokoll steht es. Gibt den Betrag zurück (0 = nichts passiert).
 */
export function rightHandSkim(ctx: Ctx, staffId: string, revenue: number): number {
  const rh = getRightHand(ctx.state);
  const m = rh?.staffId === staffId ? getStaffMember(ctx.state, staffId) : undefined;
  if (!rh || !m || m.stats.loyalty >= RIGHT_HAND_SKIM_LOYALTY || !ctx.chance(RIGHT_HAND_SKIM_CHANCE)) return 0;
  const amount = Math.round(revenue * RIGHT_HAND_SKIM_SHARE);
  if (amount <= 0) return 0;
  wallet.lose(ctx, amount, 'dirty', `${m.name} hat abgezweigt`, { category: 'loss.betrayal', staffId });
  rh.log.unshift({ time: ctx.now, text: `Von der Lieferung fehlen ${formatEuro(amount)}. Die Kasse stimmt nicht.` });
  journal.add(
    ctx,
    `${m.name} hat von einer Lieferung ${formatEuro(amount)} abgezweigt. Ihre Loyalität ist niedrig.`,
    'bad',
    {
      staffId,
    },
  );
  return amount;
}

// --- Schreiben ---

function note(ctx: Ctx, rh: RightHandPost, text: string, phone = false, silent = true): void {
  if (rh.log[0]?.text === text) {
    rh.log[0].time = ctx.now;
    return;
  }
  rh.log.unshift({ time: ctx.now, text });
  if (rh.log.length > LOG_LIMIT) rh.log.length = LOG_LIMIT;
  const m = getStaffMember(ctx.state, rh.staffId);
  if (phone && m) messages.send(ctx, { contact: staffContact(m), text, silent });
}

export function appointRightHand(ctx: Ctx, staffId: string): CommandResult {
  const check = canBeRightHand(ctx.state, staffId);
  if (!check.ok) return check;
  const h = ctx.state.modules.hierarchy;
  if (h.rightHand) dismissRightHand(ctx);
  const m = getStaffMember(ctx.state, staffId);
  if (!m) return { ok: false, reason: NOT_EMPLOYED };
  // Ein Leutnant, der aufsteigt, gibt seine Spots ab.
  if (isLieutenant(ctx.state, staffId)) {
    delete h.posts[staffId];
    ctx.emit('hierarchy.dismissed', { staffId, veedelId: '' });
  }
  // Ein Leutnant, der sie angeheuert hat, darf sie nicht mehr als sein Team behandeln (und bei Ausfall entlassen).
  releaseFromTeams(ctx.state, staffId);
  h.rightHand = {
    staffId,
    appointedAt: ctx.now,
    // Tief kopieren: Die Bestellregeln werden später verändert (paused), die Vorgabe darf das nie mitbekommen.
    settings: {
      ...DEFAULT_RIGHT_HAND_SETTINGS,
      restockRules: DEFAULT_RIGHT_HAND_SETTINGS.restockRules.map((r) => ({ ...r, paused: null })),
    },
    nextActionAt: ctx.now,
    reportDay: clock.day(ctx.now),
    lastReport: null,
    spentDay: clock.day(ctx.now),
    spent: 0,
    warnedAt: null,
    handled: [],
    log: [],
    xp: 0,
    done: emptyDone(),
    restockDay: clock.day(ctx.now),
    restockSpent: 0,
    passed: [],
    fullPower: null,
    grudgeUntil: null,
  };
  assign(ctx, staffId, OFFICE);
  setDemand(ctx, staffId, RIGHT_HAND_DEMAND);
  setWage(ctx, staffId, Math.max(m.wage, expectedWage(ctx.state, staffId)));
  addLoyalty(ctx, staffId, PROMOTION_LOYALTY);
  addCareer(ctx, staffId, 'Zur Rechten Hand ernannt.');
  journal.add(ctx, `${m.name} ist jetzt deine Rechte Hand (${formatEuro(m.wage)} pro Tag).`, 'good', { staffId });
  messages.send(ctx, {
    contact: staffContact(m),
    text: 'Ich halte dir den Rücken frei. Jeden Morgen um acht kriegst du von mir die Zahlen.',
    silent: true,
  });
  ctx.emit('hierarchy.rightHandAppointed', { staffId });
  return { ok: true };
}

export function dismissRightHand(ctx: Ctx): CommandResult {
  const h = ctx.state.modules.hierarchy;
  const rh = h.rightHand;
  if (!rh) return { ok: false, reason: 'Du hast keine Rechte Hand.' };
  h.rightHand = null;
  const m = getStaffMember(ctx.state, rh.staffId);
  if (m && isEmployed(ctx.state, m.id)) {
    assign(ctx, m.id, null);
    setDemand(ctx, m.id, 1);
    addLoyalty(ctx, m.id, DEMOTION_LOYALTY);
    addCareer(ctx, m.id, 'Als Rechte Hand abberufen.');
    journal.add(ctx, `${m.name} ist nicht mehr deine Rechte Hand.`, 'info', { staffId: m.id });
  }
  ctx.emit('hierarchy.rightHandDismissed', { staffId: rh.staffId });
  return { ok: true };
}

export function configureRightHand(ctx: Ctx, patch: Partial<RightHandSettings>): CommandResult {
  const rh = getRightHand(ctx.state);
  if (!rh) return { ok: false, reason: 'Du hast keine Rechte Hand.' };
  const next = { ...rh.settings };
  const flags = [
    'dailyReport',
    'coordinate',
    'payrollGuard',
    'absences',
    'orders',
    'ordersOwnTurfOnly',
    'pickup',
    'restock',
    'staffing',
    'wholesale',
    'laundering',
  ] as const;
  for (const key of flags) if (patch[key] !== undefined) next[key] = !!patch[key];
  if (patch.fullPowerTasks !== undefined) {
    const tasks = { ...next.fullPowerTasks };
    for (const task of FULL_POWER_TASKS) {
      const value = patch.fullPowerTasks[task.key];
      if (value !== undefined) tasks[task.key] = !!value;
    }
    next.fullPowerTasks = tasks;
  }
  const amounts = [
    'budgetPerDay',
    'orderMaxPrice',
    'restockBudgetPerDay',
    'wholesaleMaxPrice',
    'launderAbove',
    'protectionMax',
    'dealMax',
    'expansionBudgetPerDay',
  ] as const;
  for (const key of amounts) {
    const value = patch[key];
    if (value === undefined) continue;
    if (!(value >= 0 && value <= 1_000_000)) return { ok: false, reason: 'Ungültiger Betrag.' };
    next[key] = Math.round(value);
  }
  if (patch.launderShare !== undefined) {
    if (!RIGHT_HAND_LAUNDER_SHARE_OPTIONS.includes(patch.launderShare))
      return { ok: false, reason: 'Ungültiger Anteil.' };
    next.launderShare = patch.launderShare;
  }
  if (patch.restockRules !== undefined) {
    if (!Array.isArray(patch.restockRules) || patch.restockRules.length > MAX_ORDER_RULES)
      return { ok: false, reason: 'Ungültige Bestellregeln.' };
    const normalized = normalizeOrderRules(ctx.state, patch.restockRules);
    if (!normalized.ok) return normalized;
    next.restockRules = normalized.rules;
  }
  rh.settings = next;
  rh.nextActionAt = Math.min(rh.nextActionAt, ctx.now + 1);
  rh.log.unshift({ time: ctx.now, text: 'Neue Anweisungen vom Boss.' });
  return { ok: true };
}

/** Die Rechte Hand ist gegangen (entlassen, gekündigt, tot). */
export function onRightHandLeft(ctx: Ctx, staffId: string): void {
  const h = ctx.state.modules.hierarchy;
  if (h.rightHand?.staffId !== staffId) return;
  h.rightHand = null;
  journal.add(ctx, 'Deine Rechte Hand ist weg. Die Leutnants machen allein weiter.', 'bad', { staffId });
  ctx.emit('hierarchy.rightHandDismissed', { staffId });
}

/**
 * Nach einer Auftragsfahrt (customers räumt den Einsatz 'delivery') geht die Rechte Hand zurück ins Büro. Ohne
 * Rechte Hand oder in Haft passiert nichts (dismiss räumt den Posten vorher, Rückkehr regelt onRightHandStatus).
 */
export function onRightHandAssigned(ctx: Ctx, staffId: string, assignment: { kind: string } | null): void {
  const rh = getRightHand(ctx.state);
  if (rh?.staffId !== staffId || assignment !== null) return;
  const m = getStaffMember(ctx.state, staffId);
  if (m?.status === 'active' && isEmployed(ctx.state, staffId) && !m.assignment) assign(ctx, staffId, OFFICE);
}

/** Status der Rechten Hand geändert: Haft und Rückkehr ins Journal. */
export function onRightHandStatus(ctx: Ctx, staffId: string, to: string): void {
  const rh = getRightHand(ctx.state);
  if (rh?.staffId !== staffId) return;
  if (to === 'jailed' || to === 'injured') {
    rh.log.unshift({ time: ctx.now, text: to === 'jailed' ? 'Sitzt in Haft.' : 'Ist verletzt.' });
    journal.add(
      ctx,
      `Deine Rechte Hand ${to === 'jailed' ? 'sitzt in Haft' : 'ist verletzt'}. Die Leutnants machen allein weiter.`,
      'bad',
      { staffId },
    );
  } else if (to === 'active') {
    rh.log.unshift({ time: ctx.now, text: 'Ist zurück.' });
    rh.nextActionAt = ctx.now;
    const m = getStaffMember(ctx.state, staffId);
    if (m && !m.assignment) assign(ctx, staffId, OFFICE);
  }
}

/** Um Mitternacht: erledigte Ausfälle vergessen, wenn die Leute zurück sind; überlassene Anfragen aufräumen. */
export function rightHandDaily(ctx: Ctx): void {
  const rh = getRightHand(ctx.state);
  if (!rh) return;
  pruneTasks(ctx.state, rh);
  rh.handled = rh.handled.filter((id) => {
    const m = getStaffMember(ctx.state, id);
    return !!m && isEmployed(ctx.state, id) && isAbsent(m);
  });
}

/**
 * Alle paar Minuten: Tagesbericht um 8 Uhr, die schnellen Aufgaben (Aufträge, Hafen) jedes Mal, sonst im Abstand
 * RIGHT_HAND_INTERVAL koordinieren, absichern und die stündlichen Aufgaben (Nachbestellen, Personal, Geldwäsche).
 * Während sie selbst ausfährt, laufen ihre anderen Aufgaben weiter.
 */
export function rightHandTick(ctx: Ctx): void {
  const rh = activeRightHand(ctx.state);
  const m = rh ? getStaffMember(ctx.state, rh.staffId) : undefined;
  if (!rh || !m) return;
  const actor: Actor = `staff:${m.id}`;
  const today = clock.day(ctx.now);
  if (rh.settings.dailyReport && clock.hour(ctx.now) >= REPORT_HOUR && rh.reportDay !== today) {
    rh.reportDay = today;
    sendReport(ctx, rh);
  }
  runQuickTasks(ctx, rh, m, actor);
  // Vollmacht: ihr Anteil am Tagesgewinn, sobald ein Buchungstag abgeschlossen ist.
  if (rh.fullPower) payShare(ctx, rh, m);
  if (ctx.now < rh.nextActionAt) return;
  rh.nextActionAt = ctx.now + RIGHT_HAND_INTERVAL;
  if (rh.settings.payrollGuard) guardPayroll(ctx, rh);
  if (rh.settings.coordinate) coordinate(ctx, rh, actor);
  if (rh.settings.absences) handleAbsences(ctx, rh, actor);
  runHourlyTasks(ctx, rh, m, actor);
  if (rh.fullPower) runFullPowerTasks(ctx, rh, m, actor);
}

/** Tagesbericht mit den Zahlen von gestern und bis zu drei Empfehlungen. */
export function buildReport(state: GameState): DailyReport {
  const yesterday = dayReport(state, 1);
  const runway = wageRunway(state);
  const advice: string[] = [];
  if (yesterday.profit < 0) {
    const biggest = yesterday.rows
      .filter((r) => r.group === 'expense' || r.group === 'loss')
      .sort((a, b) => a.amount - b.amount)[0];
    if (biggest) advice.push(`Gestern Minus, größter Posten: ${biggest.label} (${formatEuro(-biggest.amount)}).`);
  }
  const weakest = spotResults(state, 1, 1).find((r) => r.result < 0 && r.wages > 0);
  if (weakest) {
    const name = getSpot(state, weakest.spotId)?.name ?? weakest.spotId;
    advice.push(`Der ${name} hat gestern ${formatEuro(-weakest.result)} mehr gekostet, als er gebracht hat.`);
  }
  const absent = getStaff(state).filter(isAbsent);
  if (absent.length > 0) {
    advice.push(
      absent.length === 1
        ? `${absent[0].name} fällt aus (${absent[0].status === 'jailed' ? 'Haft' : 'verletzt'}).`
        : `${absent.length} Leute fallen aus.`,
    );
  }
  const hot = playerHeat(state);
  if (hot && hot.heat >= 60) advice.push(`In ${veedelName(hot.veedelId)} ist es heiß (Heat ${Math.round(hot.heat)}).`);
  if (runway.warn) advice.unshift(`Die Löhne reichen nur noch für ${runway.days ?? 0} Tage.`);
  const rh = getRightHand(state);
  const done = rh ? describeDone(rh.done) : '';
  return {
    ...(done ? { done } : {}),
    day: yesterday.from,
    revenue: yesterday.income,
    costs: yesterday.expenses + yesterday.losses,
    profit: yesterday.profit,
    cash: Math.round(state.wallet.dirty),
    runwayDays: runway.days,
    advice: advice.slice(0, 3),
  };
}

function sendReport(ctx: Ctx, rh: RightHandPost): void {
  const m = getStaffMember(ctx.state, rh.staffId);
  if (!m) return;
  const report = buildReport(ctx.state);
  rh.lastReport = report;
  const problems = (report.profit < 0 ? 1 : 0) + (wageRunway(ctx.state).warn ? 1 : 0);
  // Mit Vollmacht wird der Tagesbericht zum Bericht aus der Stadt: Ergebnis, ihr Anteil, Erledigtes, Probleme.
  const fp = rh.fullPower;
  const fpDone = fp ? describeFullPowerDone(fp.done) : '';
  const lines = [
    fp ? `Bericht aus ${cityLabel(fp.cityId)}, Tag ${report.day}:` : `Tagesbericht für Tag ${report.day}:`,
    `Umsatz ${formatEuro(report.revenue)}, Kosten ${formatEuro(report.costs)}, ${report.profit >= 0 ? 'Gewinn' : 'Verlust'} ${formatEuro(Math.abs(report.profit))}.`,
    ...(fp
      ? [
          fp.done.share > 0
            ? `Mein Anteil: ${formatEuro(fp.done.share)}, der Rest gehört dir.`
            : 'Kein Gewinn, also kein Anteil für mich.',
        ]
      : []),
    `In der Kasse ${formatEuro(report.cash)}${report.runwayDays !== null ? `, die Löhne reichen ${report.runwayDays} Tage` : ''}.`,
    ...(report.done ? [`Erledigt: ${report.done}.`] : []),
    ...(fpDone ? [`Mit Vollmacht: ${fpDone}.`] : []),
    ...report.advice,
  ];
  if (fp) fp.done = emptyFullPowerDone();
  const absent = getStaff(ctx.state).filter(isAbsent);
  messages.send(ctx, {
    contact: staffContact(m),
    text: lines.join(' '),
    options: [
      { id: 'openFinance', label: 'Kasse öffnen', reply: 'Zeig mal die Kasse.' },
      ...(absent.length > 0 ? [{ id: 'openStaff', label: 'Ausfälle ansehen', reply: 'Wer fällt aus?' }] : []),
      { id: 'ok', label: 'Gut so', reply: 'Gut so.' },
    ],
    expiresIn: 12 * 60,
    silent: problems === 0,
  });
  rh.log.unshift({
    time: ctx.now,
    text: `Tagesbericht: ${report.profit >= 0 ? 'Gewinn' : 'Verlust'} ${formatEuro(report.profit)}.`,
  });
  if (rh.log.length > LOG_LIMIT) rh.log.length = LOG_LIMIT;
  rh.done = emptyDone();
  rewardReport(ctx, rh, m, report.profit);
  ctx.emit('hierarchy.dailyReport', { staffId: m.id, day: report.day, profit: report.profit, problems });
}

/** Lohnsicherung: Reicht das Schwarzgeld nicht für die Löhne heute Nacht, warnt sie mit Banner. */
function guardPayroll(ctx: Ctx, rh: RightHandPost): void {
  const due = payrollDue(ctx.state);
  if (due <= 0 || ctx.state.wallet.dirty >= due) return;
  if (rh.warnedAt !== null && ctx.now - rh.warnedAt < RIGHT_HAND_WARN_COOLDOWN) return;
  rh.warnedAt = ctx.now;
  note(
    ctx,
    rh,
    `Chef, die Löhne heute Nacht (${formatEuro(due)}) sind nicht gedeckt. Die Leutnants geben nichts mehr aus.`,
    true,
    false,
  );
}

/** Freie Läufer an leere Spots, auch über Leutnant-Grenzen. */
function coordinate(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  // Nicht in Veedeln, die gerade von der Straße sind (Razzia-Warnung oder Heat), und nicht auf Plätze, die ein
  // Leutnant für die Rückkehr eines Abwesenden freihält.
  const empty = [...getSpots(ctx.state)]
    .filter((s) => !activeRunnerAt(ctx.state, s.id) && !isVeedelHidden(ctx.state, s.veedelId))
    .filter((s) => {
      const away = runnerAt(ctx.state, s.id);
      return !(away && waitsForReturn(ctx.state, away.id));
    })
    .sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));
  for (const spot of empty) {
    const runner = freeStaff(ctx.state, 'runner')[0];
    if (!runner) return;
    const ok = ctx.dispatch(
      { type: 'staff.assign', payload: { staffId: runner.id, assignment: { kind: 'spot', targetId: spot.id } } },
      { actor },
    ).ok;
    if (ok) note(ctx, rh, `${runner.name} an den ${spot.name} geschickt, da stand keiner.`);
  }
}

/**
 * Ausfälle, um die sich kein Leutnant kümmert: Kaution für wertvolle Leute (nur mit Anwalt, Level ab 3, ohne die
 * Lohnsicherung anzugreifen), sonst am Spot ersetzen.
 */
function handleAbsences(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  for (const m of getStaff(ctx.state)) {
    if (!isAbsent(m) || m.id === rh.staffId || rh.handled.includes(m.id)) continue;
    const lead = teamLeadOf(ctx.state, m.id);
    if (lead && lead !== m.id && handlesAbsence(ctx.state, lead, m.id)) continue;
    // Wartet der Leutnant auf die Rückkehr, entscheidest du (die Frage kam aufs Handy): nichts hinter seinem Rücken.
    if (waitsForReturn(ctx.state, m.id)) continue;
    const lawyer = bonusProvider(ctx.state, 'bailDiscount');
    const cost = m.status === 'jailed' ? bailCost(ctx.state, m.id) : Number.POSITIVE_INFINITY;
    const affordable = cost <= ctx.state.wallet.dirty - payrollReserve(ctx.state);
    if (m.status === 'jailed' && lawyer && m.level >= RIGHT_HAND_BAIL_MIN_LEVEL && affordable) {
      if (ctx.dispatch({ type: 'staff.bail', payload: { staffId: m.id } }, { actor }).ok) {
        rh.handled.push(m.id);
        note(ctx, rh, `${m.name} gegen ${formatEuro(cost)} Kaution rausgeholt, den brauchen wir.`, true);
        continue;
      }
    }
    if (m.returnTo?.kind === 'spot') {
      const spot = getSpot(ctx.state, m.returnTo.targetId)?.name ?? 'Spot';
      // Ersetzen kostet nur, wenn niemand frei ist (Läufer von der Straße): nie an die Lohnsicherung.
      const freeOne = freeStaff(ctx.state, m.role).length > 0;
      const hireCost = m.role === 'runner' ? runnerHireCost(ctx.state, m.returnTo.targetId) : Number.POSITIVE_INFINITY;
      if (!freeOne && hireCost > leadSpendingLimit(ctx.state)) continue;
      if (ctx.dispatch({ type: 'staff.replace', payload: { staffId: m.id } }, { actor }).ok) {
        rh.handled.push(m.id);
        note(ctx, rh, `${m.name} fällt aus, am ${spot} steht jetzt jemand anderes.`, true);
      }
    } else {
      rh.handled.push(m.id);
    }
  }
}
