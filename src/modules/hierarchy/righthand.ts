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
import { activeCity, cityName } from '../city';
import { cityReport, spotResults, wageRunway } from '../finance';
import { playerHeat } from '../police';
import { getSpot, getSpots, spotCity } from '../spots';
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
  isFarmRole,
  isMemberLive,
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
import { veedelCity, veedelName } from '../veedel';
import { reportTip } from './advice';
import { capoInCharge, cleanupCapos, dismissCapo, isCapo } from './capo';
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
  lieutenantOfSpot,
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

/**
 * Rechte Hand einer Stadt (Auftrag 30: eine pro Stadt), Standard: die aktive Stadt. null, wenn die Stadt keine hat.
 */
export function getRightHand(state: GameState, cityId: string = activeCity(state)): RightHandPost | null {
  return state.modules.hierarchy.rightHands?.[cityId] ?? null;
}

/** Alle Rechten Hände mit ihrer Stadt, nach Stadt sortiert. */
export function allRightHands(state: GameState): { cityId: string; post: RightHandPost }[] {
  return Object.entries(state.modules.hierarchy.rightHands ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cityId, post]) => ({ cityId, post }));
}

/** Stadt, deren Rechte Hand die Person ist (null, wenn sie keine ist). */
export function rightHandCityOf(state: GameState, staffId: string): string | null {
  return allRightHands(state).find((r) => r.post.staffId === staffId)?.cityId ?? null;
}

export function isRightHand(state: GameState, staffId: string): boolean {
  return rightHandCityOf(state, staffId) !== null;
}

/** Arbeitet die Rechte Hand der Stadt (Standard: aktive) gerade (eingestellt, aktiv)? */
export function activeRightHand(state: GameState, cityId: string = activeCity(state)): RightHandPost | null {
  const rh = getRightHand(state, cityId);
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

export function rightHandRank(state: GameState, cityId: string = activeCity(state)): number {
  const rh = getRightHand(state, cityId);
  return rh ? rankForXp(rh.xp) : 0;
}

/** Erfahrung bis zur nächsten Stufe: [erreicht, nötig], null auf der höchsten Stufe. */
export function rightHandRankProgress(state: GameState, cityId: string = activeCity(state)): [number, number] | null {
  const rh = getRightHand(state, cityId);
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
  const rh = activeRightHand(state, cityId);
  if (!rh) {
    missing.push(
      getRightHand(state, cityId)
        ? 'Deine Rechte Hand fällt gerade aus.'
        : cityId === 'koeln'
          ? 'Du hast keine Rechte Hand.'
          : `Du hast in ${cityName(cityId)} keine Rechte Hand.`,
    );
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
  // Leute bleiben in ihrer Stadt (Auftrag 43): Rechte Hand wird man nur in der Stadt, in der du gerade spielst. Sonst
  // setzte die Ernennung den Statthalter der anderen Stadt ab.
  if ((m.cityId ?? 'koeln') !== activeCity(state)) {
    return { ok: false, reason: `${m.name} arbeitet in ${cityName(m.cityId ?? 'koeln')}.` };
  }
  if (isSpecialist(m.role) || isFarmRole(m.role)) {
    return { ok: false, reason: `${roleName(m.role)} führen keine Leutnants.` };
  }
  if (m.status !== 'active') return { ok: false, reason: `${m.name} ist gerade nicht einsatzbereit.` };
  if (m.level < RIGHT_HAND_MIN_LEVEL) return { ok: false, reason: `${m.name} braucht Level ${RIGHT_HAND_MIN_LEVEL}.` };
  if (m.stats.loyalty < RIGHT_HAND_MIN_LOYALTY) {
    return { ok: false, reason: `${m.name} ist dir nicht treu genug (Loyalität ab ${RIGHT_HAND_MIN_LOYALTY}).` };
  }
  // Leutnants in ihrer Stadt (Auftrag 30: eine Rechte Hand pro Stadt).
  const others = getLieutenantIds(state).filter(
    (id) => id !== staffId && getStaffMember(state, id)?.cityId === m.cityId,
  ).length;
  if (others < RIGHT_HAND_MIN_LIEUTENANTS) {
    return { ok: false, reason: `Eine Rechte Hand lohnt sich erst ab ${RIGHT_HAND_MIN_LIEUTENANTS} Leutnants.` };
  }
  return { ok: true };
}

/** Bietet das Handy die Stelle an? (genug Leutnants, noch keine Rechte Hand) */
export function rightHandOffered(state: GameState): boolean {
  const city = activeCity(state);
  const lieutenants = getLieutenantIds(state).filter((id) => getStaffMember(state, id)?.cityId === city);
  return !getRightHand(state, city) && lieutenants.length >= RIGHT_HAND_MIN_LIEUTENANTS;
}

/** Zufriedenheit der Rechten Hand (0–100): Loyalität und Lohn im Verhältnis zum hohen Anspruch. */
export function rightHandSatisfaction(state: GameState, cityId: string = activeCity(state)): number | null {
  const rh = getRightHand(state, cityId);
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
  const lawyer = bonusProvider(state, 'bailDiscount', m.cityId ?? 'koeln');
  return m.status === 'jailed' && !!lawyer && m.level >= RIGHT_HAND_BAIL_MIN_LEVEL;
}

/** Kümmert sich jemand (Leutnant oder Rechte Hand) um den Ausfall, sodass niemand den Spieler fragen muss? */
export function absenceHandled(state: GameState, staffId: string): boolean {
  const lead = teamLeadOf(state, staffId);
  if (lead && lead !== staffId && handlesAbsence(state, lead, staffId)) return true;
  // Auftrag 34: Fällt ein Leutnant aus, regelt sein Capo das Team (die Rechte Hand spricht nur mit dem Capo).
  // Der Leutnant selbst (teamLeadOf gibt ihn selbst zurück) zählt nicht: Für seine eigene Festnahme fragt das Handy.
  if (lead && lead !== staffId && capoInCharge(state, lead) && getStaffMember(state, lead)?.status !== 'active') {
    return true;
  }
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
  const city = rightHandCityOf(ctx.state, staffId);
  const rh = city ? getRightHand(ctx.state, city) : null;
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
  const m = getStaffMember(ctx.state, staffId);
  if (!m) return { ok: false, reason: NOT_EMPLOYED };
  // Eine Rechte Hand pro Stadt: die der Stadt, in der die Person ist (Auftrag 30).
  installPost(ctx, m, m.cityId ?? 'koeln', 0);
  journal.add(ctx, `${m.name} ist jetzt deine Rechte Hand (${formatEuro(m.wage)} pro Tag).`, 'good', { staffId });
  messages.send(ctx, {
    contact: staffContact(m),
    text: 'Ich halte dir den Rücken frei. Jeden Morgen um acht kriegst du von mir die Zahlen.',
    silent: true,
  });
  ctx.emit('hierarchy.rightHandAppointed', { staffId });
  return { ok: true };
}

/**
 * Die Person wird Rechte Hand der Stadt (ohne Prüfung): eine bisherige geht, ein Leutnant gibt seine Spots ab. xp =
 * Erfahrung als Rechte Hand zum Start.
 */
function installPost(ctx: Ctx, m: StaffMember, cityId: string, xp: number): RightHandPost {
  const h = ctx.state.modules.hierarchy;
  const staffId = m.id;
  if (h.rightHands[cityId]) dismissRightHand(ctx, cityId);
  // Ein Leutnant, der aufsteigt, gibt seine Spots ab.
  if (isLieutenant(ctx.state, staffId)) {
    // Ein Capo, der aufsteigt, ist auch kein Capo mehr (Auftrag 34), seine Leutnants sind frei.
    if (isCapo(ctx.state, staffId)) dismissCapo(ctx, staffId, true);
    delete h.posts[staffId];
    cleanupCapos(ctx);
    ctx.emit('hierarchy.dismissed', { staffId, veedelId: '' });
  }
  // Ein Leutnant, der sie angeheuert hat, darf sie nicht mehr als sein Team behandeln (und bei Ausfall entlassen).
  releaseFromTeams(ctx.state, staffId);
  const post: RightHandPost = {
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
    xp,
    done: emptyDone(),
    restockDay: clock.day(ctx.now),
    restockSpent: 0,
    passed: [],
    fullPower: null,
    grudgeUntil: null,
  };
  h.rightHands[cityId] = post;
  assign(ctx, staffId, OFFICE);
  setDemand(ctx, staffId, RIGHT_HAND_DEMAND);
  setWage(ctx, staffId, Math.max(m.wage, expectedWage(ctx.state, staffId)));
  addLoyalty(ctx, staffId, PROMOTION_LOYALTY);
  addCareer(ctx, staffId, 'Zur Rechten Hand ernannt.');
  return post;
}

export function dismissRightHand(ctx: Ctx, cityId: string = activeCity(ctx.state)): CommandResult {
  const h = ctx.state.modules.hierarchy;
  const rh = h.rightHands[cityId];
  if (!rh) return { ok: false, reason: 'Du hast keine Rechte Hand.' };
  delete h.rightHands[cityId];
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

export function configureRightHand(
  ctx: Ctx,
  patch: Partial<RightHandSettings>,
  cityId: string = activeCity(ctx.state),
): CommandResult {
  const rh = getRightHand(ctx.state, cityId);
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
    const normalized = normalizeOrderRules(ctx.state, patch.restockRules, cityId);
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
  const city = rightHandCityOf(ctx.state, staffId);
  if (!city) return;
  delete h.rightHands[city];
  journal.add(ctx, 'Deine Rechte Hand ist weg. Die Leutnants machen allein weiter.', 'bad', { staffId });
  ctx.emit('hierarchy.rightHandDismissed', { staffId });
}

/**
 * Nach einer Auftragsfahrt (customers räumt den Einsatz 'delivery') geht die Rechte Hand zurück ins Büro. Ohne
 * Rechte Hand oder in Haft passiert nichts (dismiss räumt den Posten vorher, Rückkehr regelt onRightHandStatus).
 */
export function onRightHandAssigned(ctx: Ctx, staffId: string, assignment: { kind: string } | null): void {
  if (!isRightHand(ctx.state, staffId) || assignment !== null) return;
  const m = getStaffMember(ctx.state, staffId);
  if (m?.status === 'active' && isEmployed(ctx.state, staffId) && !m.assignment) assign(ctx, staffId, OFFICE);
}

/** Status der Rechten Hand geändert: Haft und Rückkehr ins Journal. */
export function onRightHandStatus(ctx: Ctx, staffId: string, to: string): void {
  const city = rightHandCityOf(ctx.state, staffId);
  const rh = city ? getRightHand(ctx.state, city) : null;
  if (!rh) return;
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
  for (const { post: rh } of allRightHands(ctx.state)) {
    pruneTasks(ctx.state, rh);
    rh.handled = rh.handled.filter((id) => {
      const m = getStaffMember(ctx.state, id);
      return !!m && isEmployed(ctx.state, id) && isAbsent(m);
    });
  }
}

/**
 * Alle paar Minuten: Tagesbericht um 8 Uhr, die schnellen Aufgaben (Aufträge, Hafen) jedes Mal, sonst im Abstand
 * RIGHT_HAND_INTERVAL koordinieren, absichern und die stündlichen Aufgaben (Nachbestellen, Personal, Geldwäsche).
 * Während sie selbst ausfährt, laufen ihre anderen Aufgaben weiter.
 */
export function rightHandTick(ctx: Ctx): void {
  for (const { cityId } of allRightHands(ctx.state)) rightHandTurn(ctx, cityId);
}

/** Zug der Rechten Hand einer Stadt. In einer schlafenden Stadt nur Bericht und Anteil. */
function rightHandTurn(ctx: Ctx, cityId: string): void {
  const rh = activeRightHand(ctx.state, cityId);
  const m = rh ? getStaffMember(ctx.state, rh.staffId) : undefined;
  if (!rh || !m) return;
  const actor: Actor = `staff:${m.id}`;
  const today = clock.day(ctx.now);
  if (rh.settings.dailyReport && clock.hour(ctx.now) >= REPORT_HOUR && rh.reportDay !== today) {
    rh.reportDay = today;
    sendReport(ctx, rh, cityId);
  }
  // Vollmacht: ihr Anteil am Tagesgewinn, sobald ein Buchungstag abgeschlossen ist (auch aus der schlafenden Stadt).
  if (rh.fullPower) payShare(ctx, rh, m);
  // Schläft ihre Stadt, arbeitet sie im Tagesergebnis (city), nicht Zug um Zug.
  if (!isMemberLive(ctx.state, m)) return;
  runQuickTasks(ctx, rh, m, actor);
  if (ctx.now < rh.nextActionAt) return;
  rh.nextActionAt = ctx.now + RIGHT_HAND_INTERVAL;
  if (rh.settings.payrollGuard) guardPayroll(ctx, rh);
  if (rh.settings.coordinate) coordinate(ctx, rh, actor);
  if (rh.settings.absences) handleAbsences(ctx, rh, actor);
  runHourlyTasks(ctx, rh, m, actor);
  if (rh.fullPower) runFullPowerTasks(ctx, rh, m, actor);
}

/**
 * Tagesbericht mit den Zahlen von gestern und bis zu drei Empfehlungen. Immer nur die Zahlen ihrer Stadt (Auftrag 30):
 * Umsatz und Kosten, schwache Spots, Ausfälle und Heat; die Kasse und die Lohnreichweite sind dagegen eine für alle.
 */
export function buildReport(state: GameState, cityId: string = activeCity(state)): DailyReport {
  const yesterday = cityReport(state, cityId, 1, 1);
  // Die Lohnreichweite gilt für die Stadt, in der du spielst (Auftrag 43: in den Berichten anderer Städte stand sonst
  // die Reserve der aktiven Stadt).
  const runway = cityId === activeCity(state) ? wageRunway(state) : { due: 0, days: null, warn: false };
  const advice: string[] = [];
  if (yesterday.profit < 0) {
    const biggest = yesterday.rows
      .filter((r) => r.group === 'expense' || r.group === 'loss')
      .sort((a, b) => a.amount - b.amount)[0];
    if (biggest) advice.push(`Gestern Minus, größter Posten: ${biggest.label} (${formatEuro(-biggest.amount)}).`);
  }
  const weakest = spotResults(state, 1, 1).find((r) => {
    if (!(r.result < 0 && r.wages > 0)) return false;
    const spot = getSpot(state, r.spotId);
    return !!spot && spotCity(spot) === cityId;
  });
  if (weakest) {
    const name = getSpot(state, weakest.spotId)?.name ?? weakest.spotId;
    advice.push(`Der ${name} hat gestern ${formatEuro(-weakest.result)} mehr gekostet, als er gebracht hat.`);
  }
  const absent = getStaff(state, { cityId }).filter(isAbsent);
  if (absent.length > 0) {
    advice.push(
      absent.length === 1
        ? `${absent[0].name} fällt aus (${absent[0].status === 'jailed' ? 'Haft' : 'verletzt'}).`
        : `${absent.length} Leute fallen aus.`,
    );
  }
  const hot = playerHeat(state);
  if (hot && hot.heat >= 60 && veedelCity(hot.veedelId) === cityId)
    advice.push(`In ${veedelName(hot.veedelId)} ist es heiß (Heat ${Math.round(hot.heat)}).`);
  if (runway.warn) advice.unshift(`Die Löhne reichen nur noch für ${runway.days ?? 0} Tage.`);
  const rh = getRightHand(state, cityId);
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

function sendReport(ctx: Ctx, rh: RightHandPost, cityId: string): void {
  const m = getStaffMember(ctx.state, rh.staffId);
  if (!m) return;
  const report = buildReport(ctx.state, cityId);
  // Auftrag 34: ein Satz Rat aus Daten (Engpass, teurer Leutnant, Gang-Druck, Capo …).
  const tip = reportTip(ctx, cityId);
  if (tip) report.tip = tip;
  rh.lastReport = report;
  // Aus einer anderen Stadt (Statthalter, Auftrag 43) kommt der Bericht still und ohne Frage: Entscheiden musst du dort
  // nichts, und die Knöpfe würden die Stadt öffnen, in der du gerade bist.
  const live = cityId === activeCity(ctx.state);
  const problems = (report.profit < 0 ? 1 : 0) + (live && wageRunway(ctx.state).warn ? 1 : 0);
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
    ...(report.tip ? [report.tip] : []),
  ];
  if (fp) fp.done = emptyFullPowerDone();
  const absent = getStaff(ctx.state, { cityId }).filter(isAbsent);
  if (live) {
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
  } else {
    messages.send(ctx, { contact: staffContact(m), text: lines.join(' '), silent: true });
  }
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
    // Auftrag 34: Spots im Bezirk eines Capos regelt der Capo.
    .filter((s) => {
      const lead = lieutenantOfSpot(ctx.state, s.id);
      return !lead || !capoInCharge(ctx.state, lead);
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
  // Nur die Leute ihrer Stadt: Wer in der anderen Stadt ausfällt, ist Sache von dort.
  const cityId = rightHandCityOf(ctx.state, rh.staffId) ?? undefined;
  for (const m of getStaff(ctx.state, { cityId })) {
    if (!isAbsent(m) || m.id === rh.staffId || rh.handled.includes(m.id)) continue;
    const lead = teamLeadOf(ctx.state, m.id);
    if (lead && lead !== m.id && handlesAbsence(ctx.state, lead, m.id)) continue;
    // Auftrag 34: Im Bezirk eines Capos spricht sie nur mit ihm, er kümmert sich.
    if (lead && lead !== m.id && capoInCharge(ctx.state, lead)) continue;
    // Wartet der Leutnant auf die Rückkehr, entscheidest du (die Frage kam aufs Handy): nichts hinter seinem Rücken.
    if (waitsForReturn(ctx.state, m.id)) continue;
    const lawyer = bonusProvider(ctx.state, 'bailDiscount', m.cityId ?? 'koeln');
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
