// Hierarchie: Boss → (Rechte Hand) → Leutnants → Läufer.
// Der Spieler befördert einen Mitarbeiter (ab Level 2) zum Leutnant und gibt ihm bis zu drei Spots, frei gewählt und
// auch über Veedel-Grenzen (ein Spot hat höchstens einen Leutnant). Der Leutnant führt sie selbstständig (ai.ts):
// Läufer und Sicherheit verteilen, anheuern (mit Tagesbudget), Ausfälle ersetzen und Abwesende entlassen, Preise,
// Einkauf nach Bestellregeln (Ware, Lieferant, Paket, Mindestbestand im Ziel-Lager), selbst verkaufen, bei Heat
// abtauchen (pro Veedel). Er handelt nur über ctx.dispatch(...) mit actor 'staff:<id>', wie der Spieler.
// Über den Leutnants kann eine Rechte Hand stehen (righthand.ts): Tagesbericht, Koordination, Lohnsicherung.
// Leutnants haben höhere Ansprüche (Lohn, mit der Zahl ihrer Spots); ihre Zufriedenheit wirkt auf ihre Loyalität.
//
// Öffentliche API:
//   getPost(state, staffId), getLieutenants(state), getLieutenantIds(state), isLieutenant(state, staffId),
//   lieutenantOfSpot(state, spotId), lieutenantSpots(state, staffId), lieutenantVeedels(state, staffId),
//   lieutenantsInVeedel(state, veedelId), getLieutenant(state, veedelId) (Kompatibilität: ein Leutnant mit Spot dort),
//   lieutenantVeedel(state, staffId) (Veedel mit den meisten seiner Spots), teamOf(state, staffId),
//   teamLeadOf(state, staffId), handlesAbsence(state, lieutenantId, staffId), canBeLieutenant(state, staffId),
//   checkSpots(state, staffId, spotIds), lieutenantDemand(spotCount), lieutenantSatisfaction(state, staffId),
//   homeWarehouse(state, staffId), postSummary(state, post), actionInterval(member), heatThreshold(caution, member)
//   Rechte Hand: getRightHand, canBeRightHand, rightHandOffered, … (siehe righthand.ts)
// Befehle: 'hierarchy.appoint' ({ staffId, spotIds } oder alt { staffId, veedelId }), 'hierarchy.setSpots',
//   'hierarchy.dismiss' ({ staffId } oder alt { veedelId }), 'hierarchy.configure' ({ staffId | veedelId, settings }),
//   'hierarchy.appointRightHand', 'hierarchy.dismissRightHand', 'hierarchy.configureRightHand'
// Ereignisse: 'hierarchy.appointed', 'hierarchy.dismissed', 'hierarchy.configured', 'hierarchy.spotsChanged',
//   'hierarchy.rightHandAppointed', 'hierarchy.rightHandDismissed', 'hierarchy.dailyReport'
// Capo (Auftrag 34, capo.ts): Leutnant ab Level 5 mit drei Spots führt bis zu drei Leutnants seines Bezirks, vertritt
//   sie bei Ausfall, schickt Sicherheit gegen Gang-Leute; getCapos, isCapo, capoOf, capoDistrict, canBeCapo,
//   capoCandidates; Befehle 'hierarchy.appointCapo', 'hierarchy.dismissCapo'; Ereignisse 'hierarchy.capoAppointed',
//   'hierarchy.capoDismissed'. Rat im Tagesbericht (advice.ts, Daten in REPORT_TIPS).

import {
  type CommandMeta,
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  messages,
  texts,
} from '../../core';
import { cityName } from '../city';
import { nearestWarehouse, type Warehouse, warehouseCity } from '../goods';
import { getSpot, isSpotActive, type Spot, spotCity, spotsInVeedel } from '../spots';
import {
  addCareer,
  addLoyalty,
  addXp,
  assign,
  expectedWage,
  getStaff,
  getStaffMember,
  isEmployed,
  isLyingLow,
  isSpecialist,
  roleName,
  type StaffMember,
  setDemand,
  setWage,
  staffContact,
} from '../staff';
import { getVeedel, veedelName } from '../veedel';
import { tick as lieutenantTick, onRaidWarning } from './ai';
import { appointCapo, capoDemand, capoTick, cleanupCapos, dismissCapo, isCapo } from './capo';
import {
  ABSENT_DAYS_OPTIONS,
  ABSENT_POLICIES,
  CAUTION_LEVELS,
  COMPLAINT_COOLDOWN,
  DEFAULT_RIGHT_HAND_SETTINGS,
  DEFAULT_SETTINGS,
  DEMOTION_LOYALTY,
  HIDE_AFTER_RAID,
  LIEUTENANT_DEMAND_BY_SPOTS,
  LIEUTENANT_MIN_LEVEL,
  LIEUTENANT_XP_PER_SALE,
  MAX_ORDER_RULES,
  MAX_SPOTS_PER_LIEUTENANT,
  PRICE_LEVELS,
  PROMOTION_LOYALTY,
  SATISFACTION_HIGH,
  SATISFACTION_LOW,
  SATISFACTION_LOYALTY_HIGH,
  SATISFACTION_LOYALTY_LOW,
  TEAM_LOYALTY,
  TICK_EVERY,
  TRAINING_XP,
} from './config';
import { grantFullPower, revokeFullPower } from './fullpower';
import { installRightHand } from './handover';
import { nextRuleId, normalizeOrderRules } from './orders';
import {
  appointRightHand,
  configureRightHand,
  dismissRightHand,
  emptyDone,
  isRightHand,
  onRightHandAssigned,
  onRightHandLeft,
  onRightHandStatus,
  rightHandDaily,
  rightHandTick,
} from './righthand';
import { HIERARCHY_TEXTS } from './texts';
import type {
  HierarchyState,
  LieutenantPost,
  LieutenantSettings,
  OrderRule,
  RightHandPost,
  RightHandSettings,
} from './types';

export { REPORT_TIPS, type ReportTip, reportTipFor } from './advice';
export { actionInterval, heatThreshold, postSummary } from './ai';
export {
  canBeCapo,
  capoCandidates,
  capoDemand,
  capoDistrict,
  capoInCharge,
  capoOf,
  getCapo,
  getCapos,
  isCapo,
} from './capo';
export {
  ABSENT_DAYS_OPTIONS,
  ABSENT_POLICIES,
  CAPO_ADVICE_LIEUTENANTS,
  CAPO_MAX_LIEUTENANTS,
  CAPO_MIN_LEVEL,
  CAUTION_LEVELS,
  DEFAULT_RIGHT_HAND_SETTINGS,
  DEFAULT_SETTINGS,
  FULL_POWER_SHARE,
  FULL_POWER_TASKS,
  HIRE_BUDGET_OPTIONS,
  LIEUTENANT_MIN_LEVEL,
  MAX_ORDER_RULES,
  MAX_SPOTS_PER_LIEUTENANT,
  MIN_STOCK_OPTIONS,
  PAYROLL_RESERVE_DAYS,
  PAYROLL_RESERVE_DAYS_ORDERS,
  PRICE_LEVELS,
  RESERVE_OPTIONS,
  RIGHT_HAND_BUDGET_OPTIONS,
  RIGHT_HAND_DEMAND,
  RIGHT_HAND_LAUNDER_ABOVE_OPTIONS,
  RIGHT_HAND_LAUNDER_SHARE_OPTIONS,
  RIGHT_HAND_MAX_RANK,
  RIGHT_HAND_MIN_LEVEL,
  RIGHT_HAND_MIN_LIEUTENANTS,
  RIGHT_HAND_MIN_LOYALTY,
  RIGHT_HAND_ORDER_LIMIT_BY_RANK,
  RIGHT_HAND_ORDER_PRICE_OPTIONS,
  RIGHT_HAND_RANK_XP,
  RIGHT_HAND_RESTOCK_BUDGET_OPTIONS,
  RIGHT_HAND_RESTOCK_MIN_STOCK_OPTIONS,
  RIGHT_HAND_TASKS,
  RIGHT_HAND_WHOLESALE_PRICE_OPTIONS,
  START_PACK_LEADER_MIN_LEVEL,
  START_PACK_MAX_STAFF,
} from './config';
export {
  cityLabel,
  describeFullPowerDone,
  fullPowerActive,
  hasFullPower,
} from './fullpower';
export { installRightHand, rightHandTitle, startPackLeaders, startPackRank, startPackStaff } from './handover';
export { isPortSupplierAllowed, orderRuleLabel, PORT_SUPPLIER_HINT, ruleStock, ruleWarehouse } from './orders';
export {
  absenceHandled,
  activeRightHand,
  allRightHands,
  buildReport,
  canBeRightHand,
  fullPowerMissing,
  getRightHand,
  isRightHand,
  isTaskActive,
  isTaskUnlocked,
  payrollReserve,
  rankForXp,
  rightHandBudgetLeft,
  rightHandCityOf,
  rightHandDetour,
  rightHandDriver,
  rightHandHandlesOrders,
  rightHandOffered,
  rightHandOrderLimit,
  rightHandRank,
  rightHandRankProgress,
  rightHandSatisfaction,
  rightHandSkim,
  rightHandSpeedFactor,
} from './righthand';
export { describeDone, mainWarehouseId, restockBudgetLeft, taskIdleReason } from './tasks';
export type * from './types';

/** Settings-Änderung: wie die Einstellungen, dazu der alte Mindestbestand (wird zur Regel "automatisch"). */
export type SettingsPatch = Partial<LieutenantSettings> & { minStock?: number };

declare module '../../core' {
  interface ModuleStates {
    hierarchy: HierarchyState;
  }
  interface GameCommands {
    /**
     * Mitarbeiter zum Leutnant machen (oder einem Leutnant andere Spots geben). spotIds: bis zu drei Spots. Alte Form
     * mit veedelId: die Spots dieses Veedels mit dem meisten Andrang, die noch keinen Leutnant haben.
     */
    'hierarchy.appoint': { staffId: string; spotIds?: string[]; veedelId?: string };
    /** Spots eines Leutnants ändern (bis zu drei). */
    'hierarchy.setSpots': { staffId: string; spotIds: string[] };
    /** Leutnant abberufen (alte Form: der Leutnant im Veedel). */
    'hierarchy.dismiss': { staffId?: string; veedelId?: string };
    /** Delegations-Einstellungen eines Leutnants ändern (alte Form mit veedelId und minStock geht weiter). */
    'hierarchy.configure': { staffId?: string; veedelId?: string; settings: SettingsPatch };
    /** Rechte Hand ernennen (genau eine Person über den Leutnants). */
    'hierarchy.appointRightHand': { staffId: string };
    /** Rechte Hand abberufen (ohne Stadt: die der aktiven Stadt). */
    'hierarchy.dismissRightHand': { cityId?: string };
    /** Rechte Hand einstellen (ohne Stadt: die der aktiven Stadt). */
    'hierarchy.configureRightHand': { settings: Partial<RightHandSettings>; cityId?: string };
    /** Vollmacht (Auftrag 30, Chefsache): Die Rechte Hand führt die Stadt allein, gegen 80 % vom Tagesgewinn. */
    'hierarchy.grantFullPower': { cityId?: string };
    /**
     * Startpaket (Auftrag 36): Die mitgebrachte Person wird Rechte Hand der Stadt, in der sie angekommen ist. Nur das
     * Spiel selbst (city nach der Ankunft).
     */
    'hierarchy.installRightHand': { staffId: string; cityId: string };
    /** Vollmacht zurückziehen: kostet Loyalität und Laune, Stufe und Aufgaben bleiben. */
    'hierarchy.revokeFullPower': { cityId?: string };
    /** Auftrag 34: Leutnant (ab Level 5, drei Spots) zum Capo machen, mit bis zu drei Leutnants aus seinem Bezirk. */
    'hierarchy.appointCapo': { staffId: string; lieutenantIds: string[] };
    /** Capo abberufen (er bleibt Leutnant). */
    'hierarchy.dismissCapo': { staffId: string };
  }
  interface GameEvents {
    /** veedelId: Veedel mit den meisten seiner Spots (für ältere Zuhörer). */
    'hierarchy.appointed': { staffId: string; veedelId: string; spotIds: string[] };
    'hierarchy.dismissed': { staffId: string; veedelId: string };
    'hierarchy.configured': { staffId: string; veedelId: string };
    'hierarchy.spotsChanged': { staffId: string; spotIds: string[] };
    'hierarchy.rightHandAppointed': { staffId: string };
    'hierarchy.rightHandDismissed': { staffId: string };
    /** Tagesbericht der Rechten Hand (Zahlen von gestern). */
    'hierarchy.dailyReport': { staffId: string; day: number; profit: number; problems: number };
    /** Die Rechte Hand hat eine neue Stufe erreicht (Aufgaben mit diesem Rang sind frei). */
    'hierarchy.rightHandRankUp': { staffId: string; rank: number };
    'hierarchy.fullPowerGranted': { staffId: string; cityId: string };
    'hierarchy.fullPowerRevoked': { staffId: string; cityId: string };
    /** Auftrag 34: Capo ernannt (oder seine Leutnants geändert) bzw. abberufen. */
    'hierarchy.capoAppointed': { staffId: string; lieutenantIds: string[] };
    'hierarchy.capoDismissed': { staffId: string };
    /** Ihr Anteil am Gewinn eines abgeschlossenen Tages ist gebucht. */
    'hierarchy.shareTaken': { staffId: string; cityId: string; day: number; profit: number; amount: number };
  }
}

const NOT_EMPLOYED = 'Diese Person arbeitet nicht für dich.';

// --- Lesen ---

export function getPost(state: GameState, staffId: string): LieutenantPost | undefined {
  return state.modules.hierarchy.posts[staffId];
}

/** Alle Leutnant-Posten, nach Mitarbeiter-ID sortiert. */
export function getLieutenants(state: GameState): LieutenantPost[] {
  const posts = state.modules.hierarchy.posts;
  return Object.keys(posts)
    .sort()
    .map((id) => posts[id]);
}

/** Mitarbeiter-IDs aller Leutnants. */
export function getLieutenantIds(state: GameState): string[] {
  return Object.keys(state.modules.hierarchy.posts).sort();
}

export function isLieutenant(state: GameState, staffId: string): boolean {
  return !!state.modules.hierarchy.posts[staffId];
}

/**
 * Erster Posten (nach Mitarbeiter-ID) mit dieser Eigenschaft, ohne die Liste zu sortieren oder zu kopieren: Die
 * Schleifen in Spot-Listen rufen das oft auf. Bei mehreren Treffern gewinnt die kleinste ID, wie in der sortierten Liste,
 * das Ergebnis hängt also nicht von der Reihenfolge der Schlüssel ab.
 */
function findPost(state: GameState, test: (post: LieutenantPost) => boolean): LieutenantPost | undefined {
  let best: LieutenantPost | undefined;
  for (const post of Object.values(state.modules.hierarchy.posts)) {
    if ((best === undefined || post.staffId < best.staffId) && test(post)) best = post;
  }
  return best;
}

/** Leutnant, der diesen Spot führt, sonst null. */
export function lieutenantOfSpot(state: GameState, spotId: string): string | null {
  return findPost(state, (post) => post.spotIds.includes(spotId))?.staffId ?? null;
}

/** Offene Spots, die der Leutnant führt. */
export function lieutenantSpots(state: GameState, staffId: string): Spot[] {
  const post = getPost(state, staffId);
  if (!post) return [];
  return post.spotIds
    .filter((id) => isSpotActive(state, id))
    .map((id) => getSpot(state, id))
    .filter((s): s is Spot => !!s);
}

/** Veedel, in denen der Leutnant Spots führt, das mit den meisten zuerst. */
export function lieutenantVeedels(state: GameState, staffId: string): string[] {
  const counts = new Map<string, number>();
  for (const spot of lieutenantSpots(state, staffId)) counts.set(spot.veedelId, (counts.get(spot.veedelId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}

/** Wie viele seiner Spots liegen in diesem Veedel? */
export function lieutenantSpotsIn(state: GameState, staffId: string, veedelId: string): number {
  return lieutenantSpots(state, staffId).filter((s) => s.veedelId === veedelId).length;
}

/** Leutnants mit mindestens einem Spot im Veedel (die mit den meisten Spots dort zuerst). */
export function lieutenantsInVeedel(state: GameState, veedelId: string): string[] {
  return getLieutenantIds(state)
    .map((id) => ({ id, n: lieutenantSpotsIn(state, id, veedelId) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
    .map((x) => x.id);
}

/** Kompatibilität: ein Leutnant mit Spot in diesem Veedel (der mit den meisten Spots dort), sonst null. */
export function getLieutenant(state: GameState, veedelId: string): string | null {
  return lieutenantsInVeedel(state, veedelId)[0] ?? null;
}

/** Veedel mit den meisten seiner Spots, sonst null (kein Leutnant oder keine offenen Spots). */
export function lieutenantVeedel(state: GameState, staffId: string): string | null {
  return lieutenantVeedels(state, staffId)[0] ?? null;
}

/**
 * Sein Team: wer an seinen Spots steht (oder nach Haft dorthin zurückkehrt) und wen er selbst angeheuert hat.
 * Ohne ihn selbst.
 */
export function teamOf(state: GameState, staffId: string): StaffMember[] {
  const post = getPost(state, staffId);
  if (!post) return [];
  return getStaff(state).filter((m) => {
    if (m.id === staffId) return false;
    const place = m.assignment ?? m.returnTo;
    if (place?.kind === 'spot' && post.spotIds.includes(place.targetId)) return true;
    // Wen er selbst angeheuert hat, solange die Person nicht selbst führt (Leutnant, Rechte Hand).
    return post.team.includes(m.id) && !isLieutenant(state, m.id) && !isRightHand(state, m.id);
  });
}

/** Wer selbst führt (Leutnant, Rechte Hand), gehört zu keinem Team mehr, und kein Leutnant behandelt seinen Ausfall. */
export function releaseFromTeams(state: GameState, staffId: string): void {
  for (const post of Object.values(state.modules.hierarchy.posts)) {
    post.team = post.team.filter((id) => id !== staffId);
    delete post.absences[staffId];
  }
}

/**
 * Ist das Veedel gerade von der Straße? Entweder nach einer Warnung vor einer Razzia (staff) oder weil ein Leutnant
 * es wegen Heat geräumt hat. Wer jemanden an einen Spot dort stellen will, fragt hier.
 */
export function isVeedelHidden(state: GameState, veedelId: string): boolean {
  return (
    isLyingLow(state, veedelId) ||
    Object.values(state.modules.hierarchy.posts).some((p) => p.lyingLow.includes(veedelId))
  );
}

/** Wartet der Leutnant dieser Person auf ihre Rückkehr (dann bleibt ihr Platz frei und der Spieler wird gefragt)? */
export function waitsForReturn(state: GameState, staffId: string): boolean {
  const lead = teamLeadOf(state, staffId);
  return !!lead && lead !== staffId && getPost(state, lead)?.settings.onAbsent === 'wait';
}

/** Zu welchem Leutnant gehört die Person (für Übersicht und Kasse)? Der Leutnant selbst gehört zu sich. */
export function teamLeadOf(state: GameState, staffId: string): string | null {
  if (isLieutenant(state, staffId)) return staffId;
  if (isRightHand(state, staffId)) return null;
  const m = getStaffMember(state, staffId);
  const place = m?.assignment ?? m?.returnTo;
  if (place?.kind === 'spot') {
    const lead = lieutenantOfSpot(state, place.targetId);
    if (lead) return lead;
  }
  return findPost(state, (p) => p.team.includes(staffId))?.staffId ?? null;
}

/** Kümmert sich der Leutnant selbst um den Ausfall dieser Person (dann fragt niemand den Spieler)? */
export function handlesAbsence(state: GameState, lieutenantId: string, staffId: string): boolean {
  const post = getPost(state, lieutenantId);
  const lt = getStaffMember(state, lieutenantId);
  if (!post || lt?.status !== 'active' || post.settings.onAbsent === 'wait') return false;
  return teamOf(state, lieutenantId).some((m) => m.id === staffId);
}

/** Kann die Person Leutnant werden? */
export function canBeLieutenant(state: GameState, staffId: string): CommandResult {
  const m = getStaffMember(state, staffId);
  if (!m || !isEmployed(state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (isSpecialist(m.role)) return { ok: false, reason: `${roleName(m.role)} führen keine Spots.` };
  // Auch auf einer Lieferfahrt (Einsatz 'delivery') bleibt sie die Rechte Hand.
  if (m.assignment?.kind === 'office' || isRightHand(state, staffId)) {
    return { ok: false, reason: `${m.name} ist deine Rechte Hand.` };
  }
  if (m.status !== 'active') return { ok: false, reason: `${m.name} ist gerade nicht einsatzbereit.` };
  if (m.level < LIEUTENANT_MIN_LEVEL) {
    return { ok: false, reason: `${m.name} braucht mindestens Level ${LIEUTENANT_MIN_LEVEL}.` };
  }
  return { ok: true };
}

/** Prüft eine Spot-Auswahl für einen Leutnant: offen, höchstens drei, keiner gehört einem anderen Leutnant. */
export function checkSpots(state: GameState, staffId: string, spotIds: readonly string[]): CommandResult {
  if (!Array.isArray(spotIds) || spotIds.length === 0) return { ok: false, reason: 'Wähle mindestens einen Spot.' };
  if (new Set(spotIds).size !== spotIds.length) return { ok: false, reason: 'Ein Spot ist doppelt gewählt.' };
  if (spotIds.length > MAX_SPOTS_PER_LIEUTENANT) {
    return { ok: false, reason: `Ein Leutnant führt höchstens ${MAX_SPOTS_PER_LIEUTENANT} Spots.` };
  }
  const member = getStaffMember(state, staffId);
  // Ein Leutnant führt nur in der Stadt, in der er selbst ist (Person und alle Spots in derselben Stadt).
  const memberCity = member ? (member.cityId ?? 'koeln') : null;
  let spotsCity: string | null = null;
  for (const spotId of spotIds) {
    const spot = getSpot(state, spotId);
    if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
    if (!isSpotActive(state, spotId)) return { ok: false, reason: `Der ${spot.name} ist noch nicht freigeschaltet.` };
    const city = spotCity(spot);
    if (spotsCity !== null && city !== spotsCity) {
      return { ok: false, reason: 'Die Spots eines Leutnants liegen alle in einer Stadt.' };
    }
    spotsCity = city;
    if (member && memberCity !== city) {
      return {
        ok: false,
        reason: `${member.name} ist in ${cityName(memberCity ?? 'koeln')}, der ${spot.name} liegt in ${cityName(city)}.`,
      };
    }
    const other = lieutenantOfSpot(state, spotId);
    if (other && other !== staffId) {
      const name = getStaffMember(state, other)?.name ?? 'einem anderen Leutnant';
      return { ok: false, reason: `Den ${spot.name} führt schon ${name}.` };
    }
  }
  return { ok: true };
}

/** Lohnanspruch eines Leutnants mit so vielen Spots (Faktor auf den üblichen Lohn). */
export function lieutenantDemand(spotCount: number): number {
  const i = Math.max(0, Math.min(LIEUTENANT_DEMAND_BY_SPOTS.length - 1, spotCount));
  return LIEUTENANT_DEMAND_BY_SPOTS[i];
}

/** Lager, aus dem seine Spots verkaufen (das nächste zur Mitte seiner Spots). */
export function homeWarehouse(state: GameState, staffId: string): Warehouse | undefined {
  const spots = lieutenantSpots(state, staffId);
  if (spots.length === 0) return undefined;
  const lng = spots.reduce((sum, s) => sum + s.lng, 0) / spots.length;
  const lat = spots.reduce((sum, s) => sum + s.lat, 0) / spots.length;
  return nearestWarehouse(state, { lng, lat });
}

/**
 * Zufriedenheit eines Leutnants (0–100): Loyalität, Lohn im Verhältnis zu seinen höheren Ansprüchen und wie gut
 * seine Spots gestern liefen. Unter 35 beschwert er sich, ab 70 hält er auch seine Leute bei Laune.
 */
export function lieutenantSatisfaction(state: GameState, staffId: string): number | null {
  const post = getPost(state, staffId);
  const m = post ? getStaffMember(state, post.staffId) : undefined;
  if (!post || !m) return null;
  const expected = expectedWage(state, m.id);
  const ratio = expected > 0 ? m.wage / expected : 1;
  const wagePart = Math.min(1, ratio / 1.1) * 40;
  const success = Math.min(10, post.revenueYesterday / 150);
  return Math.max(0, Math.min(100, Math.round(m.stats.loyalty * 0.5 + wagePart + success)));
}

// --- Schreiben ---

function cloneRules(rules: readonly OrderRule[]): OrderRule[] {
  return rules.map((r) => ({ ...r, paused: null }));
}

/** Regeln aus der Vorlage übernehmen: ein festes Lager nur, wenn es in der Stadt des neuen Leutnants liegt. */
function templateRules(rules: readonly OrderRule[], cityId: string): OrderRule[] {
  return rules.map((r) => ({
    ...r,
    paused: null,
    warehouseId: r.warehouseId && warehouseCity(r.warehouseId) === cityId ? r.warehouseId : null,
  }));
}

function newPost(ctx: Ctx, staffId: string, spotIds: string[], settings?: LieutenantSettings): LieutenantPost {
  const template = ctx.state.modules.hierarchy.orderTemplate;
  const base = settings ?? {
    ...DEFAULT_SETTINGS,
    orderRules: template
      ? templateRules(template, getStaffMember(ctx.state, staffId)?.cityId ?? 'koeln')
      : cloneRules(DEFAULT_SETTINGS.orderRules),
  };
  return {
    staffId,
    spotIds: [...spotIds],
    appointedAt: ctx.now,
    settings: { ...base, orderRules: cloneRules(base.orderRules) },
    nextActionAt: ctx.now,
    busyUntil: ctx.now,
    lyingLow: [],
    revenueToday: 0,
    revenueYesterday: 0,
    salesTotal: 0,
    revenueTotal: 0,
    complainedAt: null,
    team: [],
    spentDay: 0,
    hireSpent: 0,
    absences: {},
    log: [],
  };
}

/** Spot-Namen für Texte: "Neumarkt, Zülpicher Platz und Uni-Wiese". */
export function spotList(state: GameState, spotIds: readonly string[]): string {
  const names = spotIds.map((id) => getSpot(state, id)?.name ?? id);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

/** Einsatz (Veedel mit den meisten Spots) und Anspruch zur Zahl der Spots passend halten. */
function syncLieutenant(ctx: Ctx, post: LieutenantPost): void {
  const m = getStaffMember(ctx.state, post.staffId);
  if (!m) return;
  const veedelId = lieutenantVeedel(ctx.state, post.staffId);
  const target = m.status === 'active' ? m.assignment : m.returnTo;
  if (veedelId && (target?.kind !== 'veedel' || target.targetId !== veedelId)) {
    assign(ctx, m.id, { kind: 'veedel', targetId: veedelId });
  }
  // Ein Capo verlangt doppelt so viel wie ein Leutnant mit drei Spots (Auftrag 34).
  const demand = isCapo(ctx.state, m.id) ? capoDemand() : lieutenantDemand(post.spotIds.length);
  if (m.demand !== demand) setDemand(ctx, m.id, demand);
}

/**
 * Startpaket (Auftrag 36): Der Leutnant gibt seine Spots ab, um als neue Rechte Hand in die nächste Stadt zu gehen. Kein
 * Abberufen (keine Loyalität weniger, kein Lohn runter), nur der Posten ist frei.
 */
export function handOffLeader(ctx: Ctx, staffId: string, cityId: string): void {
  const post = getPost(ctx.state, staffId);
  if (!post) return;
  const veedelId = lieutenantVeedel(ctx.state, staffId) ?? '';
  // Ein Capo, der geht, ist kein Capo mehr (Auftrag 34), seine Leutnants sind frei.
  if (isCapo(ctx.state, staffId)) dismissCapo(ctx, staffId, true);
  delete ctx.state.modules.hierarchy.posts[staffId];
  cleanupCapos(ctx);
  if (isEmployed(ctx.state, staffId)) {
    assign(ctx, staffId, null);
    addCareer(ctx, staffId, `Gibt die Spots ab und geht als Rechte Hand nach ${cityName(cityId)}.`);
  }
  ctx.emit('hierarchy.dismissed', { staffId, veedelId });
}

/** Leutnant abberufen. Er wird wieder normaler Mitarbeiter ohne Einsatz. */
function demote(ctx: Ctx, staffId: string): CommandResult {
  const post = getPost(ctx.state, staffId);
  if (!post) return { ok: false, reason: 'Diese Person ist kein Leutnant.' };
  const veedelId = lieutenantVeedel(ctx.state, staffId) ?? '';
  // Wer kein Leutnant mehr ist, ist auch kein Capo und gehört zu keinem Bezirk (Auftrag 34).
  if (isCapo(ctx.state, staffId)) dismissCapo(ctx, staffId, true);
  delete ctx.state.modules.hierarchy.posts[staffId];
  cleanupCapos(ctx);
  const m = getStaffMember(ctx.state, staffId);
  if (m && isEmployed(ctx.state, staffId)) {
    assign(ctx, staffId, null);
    setDemand(ctx, staffId, 1);
    addLoyalty(ctx, staffId, DEMOTION_LOYALTY);
    addCareer(ctx, staffId, 'Als Leutnant abberufen.');
    journal.add(ctx, `${m.name} ist nicht mehr Leutnant.`, 'info', { staffId });
  }
  ctx.emit('hierarchy.dismissed', { staffId, veedelId });
  return { ok: true };
}

/** Alte Form: freie Spots eines Veedels mit dem meisten Andrang. */
function spotsForVeedel(state: GameState, staffId: string, veedelId: string): string[] {
  return [...spotsInVeedel(state, veedelId)]
    .filter((s) => {
      const lt = lieutenantOfSpot(state, s.id);
      return !lt || lt === staffId;
    })
    .sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id))
    .slice(0, MAX_SPOTS_PER_LIEUTENANT)
    .map((s) => s.id);
}

function appoint(ctx: Ctx, staffId: string, spotIds: string[] | undefined, veedelId?: string): CommandResult {
  let chosen = spotIds;
  if (!chosen) {
    if (!veedelId || !getVeedel(veedelId)) return { ok: false, reason: 'Wähle die Spots, die er führen soll.' };
    chosen = spotsForVeedel(ctx.state, staffId, veedelId);
    if (chosen.length === 0) {
      const lead = getLieutenant(ctx.state, veedelId);
      const name = lead ? getStaffMember(ctx.state, lead)?.name : null;
      return {
        ok: false,
        reason: name
          ? `Die Spots in ${veedelName(veedelId)} führt schon ${name}.`
          : `In ${veedelName(veedelId)} gibt es keinen offenen Spot.`,
      };
    }
  }
  if (isLieutenant(ctx.state, staffId)) return setSpots(ctx, staffId, chosen, true);
  const check = canBeLieutenant(ctx.state, staffId);
  if (!check.ok) return check;
  const spots = checkSpots(ctx.state, staffId, chosen);
  if (!spots.ok) return spots;
  const m = getStaffMember(ctx.state, staffId) as StaffMember;
  // Wer bisher an einem Spot stand, räumt ihn: Er führt jetzt, statt selbst zu stehen (Einsatz 'veedel').
  const post = newPost(ctx, staffId, chosen);
  ctx.state.modules.hierarchy.posts[staffId] = post;
  // Er gehörte vielleicht zum Team eines anderen Leutnants (angeheuert): Der darf ihn nicht mehr entlassen.
  releaseFromTeams(ctx.state, staffId);
  syncLieutenant(ctx, post);
  // Beförderung: mehr Lohn (auf den neuen Anspruch) und ein Loyalitätsschub.
  setWage(ctx, staffId, Math.max(m.wage, expectedWage(ctx.state, staffId)));
  addLoyalty(ctx, staffId, PROMOTION_LOYALTY);
  const where = spotList(ctx.state, chosen);
  addCareer(ctx, staffId, `Zum Leutnant befördert: ${where}.`);
  journal.add(ctx, `${m.name} ist jetzt dein Leutnant: ${where} (${formatEuro(m.wage)} pro Tag).`, 'good', {
    staffId,
  });
  post.log.unshift({ time: ctx.now, text: `Übernimmt ${where}.` });
  ctx.emit('hierarchy.appointed', { staffId, veedelId: lieutenantVeedel(ctx.state, staffId) ?? '', spotIds: chosen });
  return { ok: true };
}

function setSpots(ctx: Ctx, staffId: string, spotIds: string[], fromAppoint = false): CommandResult {
  const post = getPost(ctx.state, staffId);
  if (!post) return { ok: false, reason: 'Diese Person ist kein Leutnant.' };
  const check = checkSpots(ctx.state, staffId, spotIds);
  if (!check.ok) return check;
  const m = getStaffMember(ctx.state, staffId) as StaffMember;
  if (post.spotIds.length === spotIds.length && post.spotIds.every((id, i) => id === spotIds[i])) {
    return fromAppoint ? { ok: false, reason: `${m.name} führt diese Spots schon.` } : { ok: true };
  }
  post.spotIds = [...spotIds];
  post.lyingLow = [];
  post.nextActionAt = Math.min(post.nextActionAt, ctx.now + 1);
  syncLieutenant(ctx, post);
  const where = spotList(ctx.state, spotIds);
  post.log.unshift({ time: ctx.now, text: `Führt jetzt ${where}.` });
  addCareer(ctx, staffId, `Führt jetzt ${where}.`);
  journal.add(ctx, `${m.name} führt jetzt ${where}.`, 'info', { staffId });
  ctx.emit('hierarchy.spotsChanged', { staffId, spotIds: [...spotIds] });
  if (fromAppoint) {
    ctx.emit('hierarchy.appointed', { staffId, veedelId: lieutenantVeedel(ctx.state, staffId) ?? '', spotIds });
  }
  return { ok: true };
}

function resolveStaffId(state: GameState, payload: { staffId?: string; veedelId?: string }): string | null {
  if (payload.staffId) return payload.staffId;
  return payload.veedelId ? getLieutenant(state, payload.veedelId) : null;
}

function configure(ctx: Ctx, staffId: string | null, patch: SettingsPatch, meta: CommandMeta): CommandResult {
  const post = staffId ? getPost(ctx.state, staffId) : undefined;
  if (!post) return { ok: false, reason: 'Dort gibt es keinen Leutnant.' };
  const next: LieutenantSettings = { ...post.settings, orderRules: cloneRulesKeepPause(post.settings.orderRules) };
  if (patch.minStock !== undefined) {
    if (!Number.isInteger(patch.minStock) || patch.minStock < 0 || patch.minStock > 5000) {
      return { ok: false, reason: 'Ungültiger Mindestbestand.' };
    }
    // Alte Form: Mindestbestand für die erste automatische Regel (oder eine neue).
    const auto = next.orderRules.find((r) => !r.productId && !r.supplierId);
    if (auto) auto.minStock = patch.minStock;
    else
      next.orderRules.push({
        ...DEFAULT_SETTINGS.orderRules[0],
        id: nextRuleId(next.orderRules),
        minStock: patch.minStock,
      });
  }
  if (patch.reserve !== undefined) {
    if (!(patch.reserve >= 0 && patch.reserve <= 1_000_000)) return { ok: false, reason: 'Ungültige Rücklage.' };
    next.reserve = Math.round(patch.reserve);
  }
  if (patch.hireBudgetPerDay !== undefined) {
    if (!(patch.hireBudgetPerDay >= 0 && patch.hireBudgetPerDay <= 100_000)) {
      return { ok: false, reason: 'Ungültiges Budget.' };
    }
    next.hireBudgetPerDay = Math.round(patch.hireBudgetPerDay);
  }
  if (patch.priceLevel !== undefined) {
    if (!Object.hasOwn(PRICE_LEVELS, patch.priceLevel)) return { ok: false, reason: 'Unbekanntes Preisniveau.' };
    next.priceLevel = patch.priceLevel;
  }
  if (patch.caution !== undefined) {
    if (!Object.hasOwn(CAUTION_LEVELS, patch.caution)) return { ok: false, reason: 'Unbekannte Vorsicht.' };
    next.caution = patch.caution;
  }
  if (patch.onAbsent !== undefined) {
    if (!Object.hasOwn(ABSENT_POLICIES, patch.onAbsent)) return { ok: false, reason: 'Unbekannte Regel für Ausfälle.' };
    next.onAbsent = patch.onAbsent;
  }
  if (patch.absentDays !== undefined) {
    if (!ABSENT_DAYS_OPTIONS.includes(patch.absentDays)) return { ok: false, reason: 'Ungültige Zahl an Tagen.' };
    next.absentDays = patch.absentDays;
  }
  if (patch.mayHire !== undefined) next.mayHire = !!patch.mayHire;
  if (patch.mayOrder !== undefined) next.mayOrder = !!patch.mayOrder;
  if (patch.orderRules !== undefined) {
    if (!Array.isArray(patch.orderRules) || patch.orderRules.length > MAX_ORDER_RULES) {
      return { ok: false, reason: `Höchstens ${MAX_ORDER_RULES} Bestellregeln.` };
    }
    const normalized = normalizeOrderRules(
      ctx.state,
      patch.orderRules,
      getStaffMember(ctx.state, post.staffId)?.cityId,
    );
    if (!normalized.ok) return normalized;
    const rules = normalized.rules;
    next.orderRules = rules;
    // Die letzte Einstellung des Spielers ist die Vorlage für neue Leutnants.
    if (meta.actor === 'player') ctx.state.modules.hierarchy.orderTemplate = cloneRules(rules);
  }
  post.settings = next;
  // Neue Anweisungen setzt er gleich in der nächsten Runde um.
  post.nextActionAt = Math.min(post.nextActionAt, ctx.now + 1);
  post.log.unshift({ time: ctx.now, text: 'Neue Anweisungen vom Boss.' });
  ctx.emit('hierarchy.configured', {
    staffId: post.staffId,
    veedelId: lieutenantVeedel(ctx.state, post.staffId) ?? '',
  });
  return { ok: true };
}

function cloneRulesKeepPause(rules: readonly OrderRule[]): OrderRule[] {
  return rules.map((r) => ({ ...r }));
}

/** Um Mitternacht: Spots aufräumen, Zufriedenheit auswerten, Beschwerden, Umsatz-Zähler weiterschieben. */
function daily(ctx: Ctx): void {
  const h = ctx.state.modules.hierarchy;
  for (const staffId of Object.keys(h.posts).sort()) {
    const post = h.posts[staffId];
    const m = getStaffMember(ctx.state, staffId);
    if (!m || !isEmployed(ctx.state, m.id)) {
      delete h.posts[staffId];
      continue;
    }
    // Geschlossene Spots fallen raus, Leute im Team, die weg sind, auch.
    post.spotIds = post.spotIds.filter((id) => isSpotActive(ctx.state, id));
    post.team = post.team.filter((id) => isEmployed(ctx.state, id));
    for (const id of Object.keys(post.absences)) if (!isEmployed(ctx.state, id)) delete post.absences[id];
    syncLieutenant(ctx, post);
    if (isCapo(ctx.state, staffId) && post.spotIds.length < MAX_SPOTS_PER_LIEUTENANT) {
      journal.add(ctx, `${m.name} führt keine ${MAX_SPOTS_PER_LIEUTENANT} Spots mehr und ist nicht mehr Capo.`, 'info');
      dismissCapo(ctx, staffId, true);
      syncLieutenant(ctx, post);
    }
    post.revenueYesterday = post.revenueToday;
    post.revenueToday = 0;
    const satisfaction = lieutenantSatisfaction(ctx.state, staffId) ?? 50;
    if (satisfaction < SATISFACTION_LOW) {
      addLoyalty(ctx, m.id, SATISFACTION_LOYALTY_LOW);
      if (post.complainedAt === null || ctx.now - post.complainedAt >= COMPLAINT_COOLDOWN) {
        post.complainedAt = ctx.now;
        complain(ctx, post);
      }
    } else if (satisfaction >= SATISFACTION_HIGH) {
      addLoyalty(ctx, m.id, SATISFACTION_LOYALTY_HIGH);
      // Ein guter Leutnant hält seine Leute bei Laune.
      if (m.stats.charisma >= 55)
        for (const other of teamOf(ctx.state, staffId)) addLoyalty(ctx, other.id, TEAM_LOYALTY);
    }
  }
  cleanupCapos(ctx);
  rightHandDaily(ctx);
}

function complain(ctx: Ctx, post: LieutenantPost): void {
  const m = getStaffMember(ctx.state, post.staffId);
  if (!m) return;
  const raise = Math.ceil(Math.max(expectedWage(ctx.state, m.id), m.wage * 1.2) / 10) * 10;
  const what = post.spotIds.length === 1 ? 'den Spot' : `${post.spotIds.length} Spots`;
  messages.send(ctx, {
    contact: staffContact(m),
    text: texts.pick(ctx, 'lieutenant:wageRequest', HIERARCHY_TEXTS.wageRequest, { what, wage: formatEuro(m.wage) }),
    options: [
      {
        id: 'raise',
        label: `Lohn auf ${formatEuro(raise)}`,
        command: { type: 'staff.setWage', payload: { staffId: m.id, wage: raise } },
        reply: 'Geht klar, du kriegst mehr.',
      },
      { id: 'no', label: 'Stell dich nicht so an', reply: 'Stell dich nicht so an.' },
    ],
    expiresIn: 1440,
  });
}

// --- Migration ---

interface HierarchyStateV1 {
  lieutenants: Record<string, string>;
}

/** Posten in Version 2 (pro Veedel). */
interface LieutenantPostV2 {
  staffId: string;
  appointedAt: number;
  settings: {
    minStock: number;
    priceLevel: LieutenantSettings['priceLevel'];
    caution: LieutenantSettings['caution'];
    mayHire: boolean;
    mayOrder: boolean;
    reserve: number;
  };
  nextActionAt: number;
  busyUntil: number;
  lyingLow: boolean;
  revenueToday: number;
  revenueYesterday: number;
  salesTotal: number;
  revenueTotal: number;
  complainedAt: number | null;
  log: LieutenantPost['log'];
}

interface HierarchyStateV2 {
  lieutenants: Record<string, string>;
  posts: Record<string, LieutenantPostV2>;
}

export function migrateHierarchyV1(old: HierarchyStateV1, state: GameState): HierarchyStateV2 {
  const posts: Record<string, LieutenantPostV2> = {};
  for (const [veedelId, staffId] of Object.entries(old.lieutenants)) {
    posts[veedelId] = {
      staffId,
      appointedAt: state.time,
      settings: { minStock: 100, priceLevel: 'keep', caution: 'normal', mayHire: false, mayOrder: true, reserve: 500 },
      nextActionAt: state.time,
      busyUntil: state.time,
      lyingLow: false,
      revenueToday: 0,
      revenueYesterday: 0,
      salesTotal: 0,
      revenueTotal: 0,
      complainedAt: null,
      log: [],
    };
  }
  return { lieutenants: { ...old.lieutenants }, posts };
}

/**
 * Version 2 → 3: Aus jedem Veedel-Posten wird ein Posten pro Leutnant mit den bis zu drei Spots dieses Veedels mit
 * dem meisten Andrang. Einstellungen (alter Mindestbestand wird eine Regel "automatisch"), Protokoll und Umsatz bleiben.
 */
export function migrateHierarchyV2(old: HierarchyStateV2, state: GameState): HierarchyStateV5 {
  const posts: Record<string, LieutenantPost> = {};
  for (const veedelId of Object.keys(old.posts).sort()) {
    const p = old.posts[veedelId];
    if (posts[p.staffId]) continue;
    const spotIds = [...spotsInVeedel(state, veedelId)]
      .sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id))
      .slice(0, MAX_SPOTS_PER_LIEUTENANT)
      .map((s) => s.id);
    const s = p.settings;
    posts[p.staffId] = {
      staffId: p.staffId,
      spotIds,
      appointedAt: p.appointedAt,
      settings: {
        ...DEFAULT_SETTINGS,
        priceLevel: s.priceLevel,
        caution: s.caution,
        mayHire: s.mayHire,
        mayOrder: s.mayOrder,
        reserve: s.reserve,
        orderRules: [{ ...DEFAULT_SETTINGS.orderRules[0], minStock: s.minStock }],
      },
      nextActionAt: p.nextActionAt,
      busyUntil: p.busyUntil,
      lyingLow: p.lyingLow ? [veedelId] : [],
      revenueToday: p.revenueToday,
      revenueYesterday: p.revenueYesterday,
      salesTotal: p.salesTotal,
      revenueTotal: p.revenueTotal,
      complainedAt: p.complainedAt,
      team: [],
      spentDay: 0,
      hireSpent: 0,
      absences: {},
      log: p.log,
    };
  }
  return { posts, rightHand: null, orderTemplate: null };
}

/** Zustand bis Version 5: eine Rechte Hand für alles (Köln). */
type HierarchyStateV5 = Omit<HierarchyState, 'rightHands' | 'capos'> & { rightHand: RightHandPost | null };

type RightHandSettingsV3 = Pick<
  RightHandSettings,
  'dailyReport' | 'coordinate' | 'payrollGuard' | 'absences' | 'budgetPerDay'
>;
type RightHandPostV3 = Omit<RightHandPost, 'settings' | 'xp' | 'done' | 'restockDay' | 'restockSpent' | 'passed'> & {
  settings: RightHandSettingsV3;
};
type HierarchyStateV3 = Omit<HierarchyStateV5, 'rightHand'> & { rightHand: RightHandPostV3 | null };

/**
 * Version 3 → 4 (Auftrag 28): Die Rechte Hand bekommt Aufgaben mit Stufen-Schloss, Erfahrung und eine Liste des
 * Erledigten. Bestehende Einstellungen bleiben, die neuen Aufgaben stehen auf den Standardwerten; sie fängt auf
 * Stufe 1 an.
 */
export function migrateHierarchyV3(old: HierarchyStateV3, state: GameState): HierarchyStateV5 {
  const rh = old.rightHand;
  return {
    ...old,
    rightHand: rh
      ? {
          ...rh,
          settings: {
            ...DEFAULT_RIGHT_HAND_SETTINGS,
            ...rh.settings,
            restockRules: cloneRules(DEFAULT_RIGHT_HAND_SETTINGS.restockRules),
          },
          xp: 0,
          done: emptyDone(),
          restockDay: clock.day(state.time),
          restockSpent: 0,
          passed: [],
        }
      : null,
  };
}

/**
 * Version 5 (Auftrag 30): Vollmacht. Die Rechte Hand bekommt fullPower (aus) und grudgeUntil, ihre Einstellungen die
 * Aufgaben mit Vollmacht und deren Beträge (Standardwerte).
 */
export function migrateHierarchyV4(old: HierarchyStateV4): HierarchyStateV5 {
  const rh = old.rightHand;
  return {
    ...old,
    rightHand: rh
      ? {
          ...rh,
          settings: {
            ...rh.settings,
            fullPowerTasks: { ...DEFAULT_RIGHT_HAND_SETTINGS.fullPowerTasks },
            protectionMax: DEFAULT_RIGHT_HAND_SETTINGS.protectionMax,
            dealMax: DEFAULT_RIGHT_HAND_SETTINGS.dealMax,
            expansionBudgetPerDay: DEFAULT_RIGHT_HAND_SETTINGS.expansionBudgetPerDay,
          },
          fullPower: null,
          grudgeUntil: null,
        }
      : null,
  };
}

/** Zustand in Version 4 (vor der Vollmacht). */
type RightHandSettingsV4 = Omit<
  RightHandSettings,
  'fullPowerTasks' | 'protectionMax' | 'dealMax' | 'expansionBudgetPerDay'
>;
interface HierarchyStateV4 extends Omit<HierarchyStateV5, 'rightHand'> {
  rightHand: (Omit<RightHandPost, 'fullPower' | 'grudgeUntil' | 'settings'> & { settings: RightHandSettingsV4 }) | null;
}

/** Zustand bis Version 6 (vor dem Capo). */
type HierarchyStateV6 = Omit<HierarchyState, 'capos'>;

export default defineModule({
  id: 'hierarchy',
  version: 7,
  dependsOn: ['staff'],
  init: () => ({ posts: {}, capos: {}, rightHands: {}, orderTemplate: null }),
  tick: (ctx) => {
    lieutenantTick(ctx);
    capoTick(ctx);
    rightHandTick(ctx);
  },
  tickEvery: TICK_EVERY,
  commands: {
    'hierarchy.appoint': (ctx, { staffId, spotIds, veedelId }) => appoint(ctx, staffId, spotIds, veedelId),
    'hierarchy.setSpots': (ctx, { staffId, spotIds }) => setSpots(ctx, staffId, spotIds),
    'hierarchy.dismiss': (ctx, payload) => {
      const staffId = resolveStaffId(ctx.state, payload);
      return staffId ? demote(ctx, staffId) : { ok: false, reason: 'Dort gibt es keinen Leutnant.' };
    },
    'hierarchy.configure': (ctx, payload, meta) =>
      configure(ctx, resolveStaffId(ctx.state, payload), payload.settings, meta),
    'hierarchy.appointRightHand': (ctx, { staffId }) => appointRightHand(ctx, staffId),
    'hierarchy.dismissRightHand': (ctx, payload) => dismissRightHand(ctx, payload?.cityId),
    'hierarchy.configureRightHand': (ctx, { settings, cityId }) => configureRightHand(ctx, settings, cityId),
    'hierarchy.grantFullPower': (ctx, { cityId }, meta) => grantFullPower(ctx, cityId ?? 'koeln', meta),
    'hierarchy.installRightHand': (ctx, { staffId, cityId }, meta) =>
      meta.actor === 'system'
        ? installRightHand(ctx, staffId, cityId)
        : { ok: false, reason: 'Das passiert mit dem Startpaket von selbst.' },
    'hierarchy.revokeFullPower': (ctx, payload, meta) => revokeFullPower(ctx, meta, payload?.cityId),
    'hierarchy.appointCapo': (ctx, { staffId, lieutenantIds }) => appointCapo(ctx, staffId, lieutenantIds),
    'hierarchy.dismissCapo': (ctx, { staffId }) => dismissCapo(ctx, staffId),
  },
  on: {
    'clock.dayStarted': daily,
    // Der Polizei-Kontakt warnt vor einer Razzia: Leutnants mit Spots im Veedel ziehen ihre Leute dort ab.
    'staff.raidWarning': (ctx, { veedelId, at }) => {
      for (const staffId of lieutenantsInVeedel(ctx.state, veedelId)) {
        const post = getPost(ctx.state, staffId);
        if (post) onRaidWarning(ctx, veedelId, post, at + HIDE_AFTER_RAID);
      }
    },
    // Wer geht, ist auch kein Leutnant (bzw. keine Rechte Hand) mehr und fällt aus jedem Team.
    'staff.left': (ctx, { staffId }) => {
      const h = ctx.state.modules.hierarchy;
      releaseFromTeams(ctx.state, staffId);
      if (h.posts[staffId]) {
        const veedelId = lieutenantVeedel(ctx.state, staffId) ?? '';
        delete h.posts[staffId];
        cleanupCapos(ctx);
        journal.add(ctx, 'Ein Leutnant ist weg, seine Spots laufen ohne ihn.', 'bad', { staffId });
        ctx.emit('hierarchy.dismissed', { staffId, veedelId });
      }
      onRightHandLeft(ctx, staffId);
    },
    'staff.assigned': (ctx, { staffId, assignment }) => onRightHandAssigned(ctx, staffId, assignment),
    'staff.statusChanged': (ctx, { staffId, to }) => {
      onRightHandStatus(ctx, staffId, to);
      const own = getPost(ctx.state, staffId);
      if (own) {
        const text =
          to === 'jailed'
            ? 'Sitzt in Haft. Die Spots laufen ohne ihn.'
            : to === 'injured'
              ? 'Ist verletzt und fällt aus.'
              : to === 'active'
                ? 'Ist zurück und übernimmt wieder.'
                : '';
        if (text) own.log.unshift({ time: ctx.now, text });
        if (to === 'active') own.nextActionAt = ctx.now;
      }
      // Wer zurück ist, ist kein Ausfall mehr, auch wenn er inzwischen woanders steht (sonst gilt später der alte Eintrag).
      if (to === 'active') for (const p of getLieutenants(ctx.state)) delete p.absences[staffId];
      // Ausfälle im Team merken (seit wann), damit der Leutnant nach seinen Regeln handeln kann.
      const lead = teamLeadOf(ctx.state, staffId);
      const post = lead && lead !== staffId ? getPost(ctx.state, lead) : undefined;
      if (!post) return;
      if (to === 'jailed' || to === 'injured') {
        post.absences[staffId] ??= { since: ctx.now, replaced: false };
        post.nextActionAt = Math.min(post.nextActionAt, ctx.now + 1);
      }
    },
    // Razzia bei dir: Leutnants mit Spots dort schreiben es ins Protokoll.
    'police.raid': (ctx, { veedelId, veedelIds, target, scope, spotId, arrested, empty }) => {
      if (target !== 'player') return;
      const where = veedelIds ?? [veedelId];
      for (const post of getLieutenants(ctx.state)) {
        const hit = lieutenantSpots(ctx.state, post.staffId).filter((s) =>
          scope === 'spot' ? s.id === spotId : where.includes(s.veedelId),
        );
        if (hit.length === 0) continue;
        const kind = scope === 'major' ? 'Großrazzia' : scope === 'spot' ? 'Razzia am Spot' : 'Razzia';
        const text = empty
          ? `${kind} am ${hit[0].name}, aber wir waren weg.`
          : `${kind} am ${hit[0].name}. ${arrested?.length ? `${arrested.length} festgenommen.` : 'Keiner festgenommen.'}`;
        post.log.unshift({ time: ctx.now, text });
      }
    },
    // Umsatz an seinen Spots zählen, Erfahrung für den Leutnant und Ausbildung seiner Leute.
    'sale.completed': (ctx, { spotId, revenue, sellerId }) => {
      const lead = spotId ? lieutenantOfSpot(ctx.state, spotId) : null;
      const post = lead ? getPost(ctx.state, lead) : undefined;
      if (!post) return;
      post.revenueToday += revenue;
      post.revenueTotal += revenue;
      post.salesTotal += 1;
      const lt = getStaffMember(ctx.state, post.staffId);
      if (lt?.status !== 'active') return;
      addXp(ctx, lt.id, LIEUTENANT_XP_PER_SALE);
      if (sellerId && sellerId !== lt.id) addXp(ctx, sellerId, TRAINING_XP);
    },
  },
  migrations: {
    2: migrateHierarchyV1,
    3: migrateHierarchyV2,
    4: migrateHierarchyV3,
    5: migrateHierarchyV4,
    // Version 6 (Auftrag 30, Etappe 5): Rechte Hand pro Stadt. Die bisherige war die von Köln.
    6: (old: HierarchyStateV5): HierarchyStateV6 => {
      const { rightHand, ...rest } = old;
      return { ...rest, rightHands: rightHand ? { koeln: rightHand } : {} };
    },
    // Version 7 (Auftrag 34): Capos. Alte Stände haben noch keine.
    7: (old: HierarchyStateV6): HierarchyState => ({ ...old, capos: {} }),
  },
});
