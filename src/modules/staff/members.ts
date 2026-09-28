// Lese- und Schreib-API des Personals. Lesen mit state, schreiben mit ctx.

import { type Contact, type Ctx, type GameState, journal } from '../../core';
import type { Customer } from '../customers';
import { getWarehouse } from '../goods';
import { referencePrice } from '../market';
import { getSpot } from '../spots';
import { veedelAt, veedelName } from '../veedel';
import {
  BAIL_BASE,
  BAIL_PER_LEVEL,
  CAREER_LIMIT,
  FORMER_LIMIT,
  INJURY_DURATION,
  JAIL_DURATION,
  LOYALTY,
  MIN_SERVE_TIME,
  ROLE_INFO,
  RUNNER_SERVE_TIME,
  SPECIALIST_BONUS,
  STAT_NAMES,
} from './config';
import { clampStat, expectedWageFor, levelForXp, levelUpGains, STAT_KEYS } from './profile';
import type {
  RecruitProfile,
  StaffAssignment,
  StaffBonus,
  StaffFilter,
  StaffLeaveReason,
  StaffMember,
  StaffOrigin,
  StaffRole,
  StaffStats,
  StaffStatus,
  StatKey,
} from './types';

// --- Lesen ---

/** Aktuelle Mitarbeiter, gefiltert. Mit status 'quit' oder 'dead' die Ehemaligen. */
export function getStaff(state: GameState, filter: StaffFilter = {}): StaffMember[] {
  const s = state.modules.staff;
  const source = filter.status === 'quit' || filter.status === 'dead' ? s.former : s.members;
  return source.filter((m) => {
    if (filter.role && m.role !== filter.role) return false;
    if (filter.status && m.status !== filter.status) return false;
    if (filter.spotId && !(m.assignment?.kind === 'spot' && m.assignment.targetId === filter.spotId)) return false;
    if (filter.veedelId && staffVeedel(state, m) !== filter.veedelId) return false;
    return true;
  });
}

/** Mitarbeiter nach ID, auch Ehemalige. */
export function getStaffMember(state: GameState, id: string): StaffMember | undefined {
  const s = state.modules.staff;
  return s.members.find((m) => m.id === id) ?? s.former.find((m) => m.id === id);
}

/** Arbeitet die Person gerade für dich (aktiv, verletzt oder in Haft)? */
export function isEmployed(state: GameState, id: string): boolean {
  return state.modules.staff.members.some((m) => m.id === id);
}

/** Werte eines Mitarbeiters, z.B. für Konfrontationen. */
export function getStats(state: GameState, id: string): StaffStats | null {
  const member = getStaffMember(state, id);
  return member ? { ...member.stats } : null;
}

/** Läufer an einem Spot. Wer in Haft oder verletzt ist, hat seinen Spot geräumt. */
export function runnerAt(state: GameState, spotId: string): StaffMember | undefined {
  return getStaff(state, { role: 'runner', spotId })[0];
}

/** Sicherheit an einem Spot oder in einem Lager. */
export function securityAt(state: GameState, target: { spotId?: string; warehouseId?: string }): StaffMember[] {
  return state.modules.staff.members.filter(
    (m) =>
      m.role === 'security' &&
      m.status === 'active' &&
      ((target.spotId && m.assignment?.kind === 'spot' && m.assignment.targetId === target.spotId) ||
        (target.warehouseId && m.assignment?.kind === 'warehouse' && m.assignment.targetId === target.warehouseId)),
  );
}

/** Freier, aktiver Mitarbeiter ohne Einsatz, z.B. ein Kurier für den Lieferdienst. */
export function findAvailable(state: GameState, filter: { role: StaffRole }): StaffMember | undefined {
  return state.modules.staff.members.find((m) => m.role === filter.role && m.status === 'active' && !m.assignment);
}

/** Veedel, in dem jemand eingesetzt ist (Spot, Lager oder als Leutnant), sonst null. */
export function staffVeedel(state: GameState, member: StaffMember): string | null {
  const a = member.assignment;
  if (!a) return null;
  if (a.kind === 'spot') return getSpot(state, a.targetId)?.veedelId ?? null;
  if (a.kind === 'veedel') return a.targetId;
  if (a.kind === 'warehouse') {
    const w = getWarehouse(state, a.targetId);
    return w ? (veedelAt(w.lng, w.lat)?.id ?? null) : null;
  }
  return null;
}

export function isSpecialist(role: StaffRole): boolean {
  return ROLE_INFO[role].specialist;
}

export function roleName(role: StaffRole): string {
  return ROLE_INFO[role].name;
}

/** Kennt der Spieler diesen Wert schon? */
export function isStatKnown(member: StaffMember, stat: StatKey): boolean {
  return member.knownStats.includes(stat);
}

/** Lohn, den die Person erwartet (Typ, Level, Anspruch). */
export function expectedWage(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  return m ? expectedWageFor(m.role, m.level, m.demand) : 0;
}

/** Summe der Tageslöhne aller aktuellen Mitarbeiter. */
export function dailyWages(state: GameState): number {
  return state.modules.staff.members.reduce((sum, m) => sum + m.wage, 0);
}

/** So lange braucht die Person für einen Kunden (Tempo und Level). */
export function serveTime(member: StaffMember): number {
  const factor = (1.4 - member.stats.speed / 125) * (1 - 0.03 * (member.level - 1));
  return Math.max(MIN_SERVE_TIME, Math.round(RUNNER_SERVE_TIME * factor));
}

/** Arbeitstempo als Faktor (1 = normal, größer = schneller), z.B. für Kuriere. */
export function speedFactor(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  if (!m) return 1;
  return Math.round((0.7 + m.stats.speed / 125 + 0.03 * (m.level - 1)) * 100) / 100;
}

/**
 * Faktor für Risiken wie Festnahme oder Entdeckung (1 = normal, kleiner = vorsichtiger).
 * Für die Polizei (Auftrag 10): Chance auf Festnahme mal diesen Faktor.
 */
export function riskFactor(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  if (!m) return 1;
  return Math.round(Math.max(0.4, 1.4 - m.stats.caution / 125 - 0.03 * (m.level - 1)) * 100) / 100;
}

/**
 * Kampfkraft einer Person (etwa 0 bis 130) für Konfrontationen (Auftrag 11):
 * vor allem Stärke, dazu Vorsicht und Level. Wer kaum loyal ist, hält nicht den Kopf hin.
 */
export function combatValue(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  if (m?.status !== 'active') return 0;
  const loyaltyPenalty = m.stats.loyalty < 30 ? 10 : 0;
  return Math.max(0, Math.round(m.stats.strength * 0.7 + m.stats.caution * 0.2 + m.level * 4 - loyaltyPenalty));
}

/**
 * Verteidigung eines Ortes: Kampfkraft der Sicherheit dort plus ein Drittel der Kampfkraft des Läufers.
 * Mit veedelId die Summe über alle Leute im Veedel (Sicherheit voll, andere zu einem Drittel).
 */
export function defenseStrength(
  state: GameState,
  target: { spotId?: string; warehouseId?: string; veedelId?: string },
): number {
  let people: StaffMember[];
  if (target.veedelId) people = getStaff(state, { veedelId: target.veedelId, status: 'active' });
  else {
    people = securityAt(state, target);
    const runner = target.spotId ? runnerAt(state, target.spotId) : undefined;
    if (runner?.status === 'active') people.push(runner);
  }
  const total = people.reduce((sum, m) => sum + combatValue(state, m.id) * (m.role === 'security' ? 1 : 1 / 3), 0);
  return Math.round(total);
}

/**
 * Bonus durch Spezialisten (0 = keiner). Zählt der beste aktive Spezialist des passenden Typs.
 * Werte siehe StaffBonus.
 */
export function bonus(state: GameState, key: StaffBonus): number {
  const rule = SPECIALIST_BONUS[key];
  let best = 0;
  for (const m of state.modules.staff.members) {
    if (m.role !== rule.role || m.status !== 'active') continue;
    const value = rule.base + rule.perLevel * (m.level - 1) + (m.stats[rule.stat] - 50) / rule.divisor;
    best = Math.max(best, Math.min(rule.max, value));
  }
  return Math.round(best * 100) / 100;
}

/** Wer liefert den Bonus? (für die Anzeige) */
export function bonusProvider(state: GameState, key: StaffBonus): StaffMember | undefined {
  const rule = SPECIALIST_BONUS[key];
  return state.modules.staff.members
    .filter((m) => m.role === rule.role && m.status === 'active')
    .sort((a, b) => b.level - a.level || b.stats[rule.stat] - a.stats[rule.stat])[0];
}

/** Kaution für eine Person in Haft (Anwalt macht sie billiger). */
export function bailCost(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  if (!m) return 0;
  const base = BAIL_BASE + BAIL_PER_LEVEL * (m.level - 1);
  return Math.round((base * (1 - bonus(state, 'bailDiscount'))) / 10) * 10;
}

/** Haftdauer für eine neue Festnahme (Anwalt macht sie kürzer). */
export function jailDuration(state: GameState): number {
  return Math.round(JAIL_DURATION * (1 - bonus(state, 'jailReduction')));
}

/** Richtpreis an einem Spot (für die Preis-Anweisung). */
export function spotReferencePrice(state: GameState, spotId: string, productId: string): number {
  const spot = getSpot(state, spotId);
  if (!spot) return 0;
  return referencePrice(state, productId, spot.veedelId) * spot.priceMultiplier;
}

/** Zahlt der Kunde genug für diese Preis-Anweisung? */
export function meetsPriceFloor(state: GameState, customer: Customer, priceFloor: number): boolean {
  if (priceFloor <= 0) return true;
  return customer.pricePerUnit >= spotReferencePrice(state, customer.spotId, customer.productId) * priceFloor;
}

/** Kontakt fürs Handy, z.B. für Nachrichten von dieser Person. */
export function staffContact(member: StaffMember): Contact {
  return { id: `staff:${member.id}`, name: member.name, kind: 'staff' };
}

// --- Schreiben ---

export interface EnlistOptions {
  origin: StaffOrigin;
  /** Werte, die der Spieler schon kennt. Standard: keine. */
  knownStats?: StatKey[];
  /** Erster Eintrag der Laufbahn, z.B. "Empfohlen von Kevin K.". */
  note?: string;
  assignment?: StaffAssignment | null;
  /** Journal-Text statt des Standardtexts, '' = kein Eintrag. */
  journalText?: string;
}

/** Jemanden einstellen (z.B. einen Bewerber aus recruiting). Meldet 'staff.hired'. */
export function enlist(ctx: Ctx, profile: RecruitProfile, options: EnlistOptions): StaffMember {
  const member: StaffMember = {
    id: `s${ctx.nextId()}`,
    name: profile.name,
    role: profile.role,
    status: 'active',
    stats: { ...profile.stats },
    level: profile.level,
    xp: levelXpStart(profile.level),
    wage: profile.wage,
    hiredAt: ctx.now,
    assignment: options.assignment ? { ...options.assignment } : null,
    busyUntil: ctx.now,
    portrait: profile.portrait,
    age: profile.age,
    background: profile.background,
    origin: options.origin,
    knownStats: STAT_KEYS.filter((k) => options.knownStats?.includes(k)),
    demand: 1,
    orders: { priceFloor: 0 },
    statusUntil: null,
    returnTo: null,
    career: [],
    record: { sales: 0, revenue: 0, arrests: 0 },
    lastIncidentAt: null,
    leftAt: null,
    leftReason: null,
  };
  ctx.state.modules.staff.members.push(member);
  addCareer(ctx, member.id, options.note ? `Eingestellt. ${options.note}` : 'Eingestellt.');
  const text = options.journalText ?? `${member.name} als ${roleName(member.role)} eingestellt.`;
  if (text) journal.add(ctx, text, 'good', { staffId: member.id });
  ctx.emit('staff.hired', { staffId: member.id, role: member.role });
  return member;
}

function levelXpStart(level: number): number {
  // Erfahrung, die zum Level passt (Leute mit Level 2 bringen schon etwas mit).
  let xp = 0;
  while (levelForXp(xp) < level) xp += 10;
  return xp;
}

/** Eintrag in die Laufbahn. */
export function addCareer(ctx: Ctx, staffId: string, text: string): void {
  const m = getStaffMember(ctx.state, staffId);
  if (!m) return;
  m.career.push({ time: ctx.now, text });
  if (m.career.length > CAREER_LIMIT) m.career.splice(0, m.career.length - CAREER_LIMIT);
}

/**
 * Einsatz setzen oder aufheben (null). Ohne Prüfung, z.B. für den Lieferdienst.
 * Wer in Haft oder verletzt ist, kehrt danach dorthin zurück.
 */
export function assign(ctx: Ctx, staffId: string, assignment: StaffAssignment | null): boolean {
  const member = getStaffMember(ctx.state, staffId);
  if (!member || member.leftAt !== null) return false;
  const next = assignment ? { ...assignment } : null;
  if (member.status === 'jailed' || member.status === 'injured') {
    member.returnTo = next;
    return true;
  }
  member.assignment = next;
  if (next && next.kind !== 'delivery') addCareer(ctx, staffId, `Eingesetzt: ${assignmentLabel(ctx.state, next)}.`);
  ctx.emit('staff.assigned', { staffId, assignment: member.assignment });
  return true;
}

/** Einsatzort als Text, z.B. "Zülpicher Platz" oder "Leutnant in Ehrenfeld". */
export function assignmentLabel(state: GameState, a: StaffAssignment | null): string {
  if (!a) return 'ohne Einsatz';
  if (a.kind === 'spot') return getSpot(state, a.targetId)?.name ?? a.targetId;
  if (a.kind === 'warehouse') return getWarehouse(state, a.targetId)?.name ?? a.targetId;
  if (a.kind === 'veedel') return `Leutnant in ${veedelName(a.targetId)}`;
  return 'Lieferung';
}

/**
 * Status ändern (verletzt, in Haft, tot …). Optional bis wann (Haft, Verletzung), sonst die Standarddauer.
 * Wer in Haft kommt oder verletzt ist, räumt seinen Einsatz und kehrt danach zurück.
 * 'quit' und 'dead' machen aus der Person einen Ehemaligen.
 */
export function setStatus(ctx: Ctx, staffId: string, status: StaffStatus, until?: number): boolean {
  const member = getStaffMember(ctx.state, staffId);
  if (!member || member.status === status || member.leftAt !== null) return false;
  const from = member.status;
  if (status === 'quit' || status === 'dead') {
    removeMember(ctx, staffId, status === 'dead' ? 'dead' : 'quit');
    ctx.emit('staff.statusChanged', { staffId, from, to: status });
    return true;
  }
  if (status === 'jailed' || status === 'injured') {
    const duration = status === 'jailed' ? jailDuration(ctx.state) : INJURY_DURATION;
    member.statusUntil = until ?? ctx.now + duration;
    if (member.assignment && member.assignment.kind !== 'delivery') member.returnTo = member.assignment;
    if (member.assignment) {
      member.assignment = null;
      ctx.emit('staff.assigned', { staffId, assignment: null });
    }
    if (status === 'jailed') {
      member.record.arrests += 1;
      addLoyalty(ctx, staffId, LOYALTY.arrest);
      addCareer(ctx, staffId, 'Festgenommen.');
    } else {
      addLoyalty(ctx, staffId, LOYALTY.injury);
      addCareer(ctx, staffId, 'Verletzt.');
    }
  }
  member.status = status;
  if (status === 'active') {
    member.statusUntil = null;
    member.busyUntil = ctx.now;
    returnToPost(ctx, member);
  }
  ctx.emit('staff.statusChanged', { staffId, from, to: status });
  return true;
}

/** Nach Haft oder Verletzung zurück an den alten Einsatz, wenn der noch frei ist. */
function returnToPost(ctx: Ctx, member: StaffMember): void {
  const target = member.returnTo;
  member.returnTo = null;
  if (!target || member.assignment) return;
  if (target.kind === 'spot' && member.role === 'runner') {
    if (runnerAt(ctx.state, target.targetId) || !getSpot(ctx.state, target.targetId)) return;
  }
  if (target.kind === 'spot' && member.role === 'security') {
    if (securityAt(ctx.state, { spotId: target.targetId }).length > 0) return;
  }
  member.assignment = { ...target };
  ctx.emit('staff.assigned', { staffId: member.id, assignment: member.assignment });
}

/** Mitarbeiter geht (entlassen, gekündigt, tot) und landet bei den Ehemaligen. */
export function removeMember(ctx: Ctx, staffId: string, reason: StaffLeaveReason): StaffMember | undefined {
  const s = ctx.state.modules.staff;
  const member = s.members.find((m) => m.id === staffId);
  if (!member) return undefined;
  s.members = s.members.filter((m) => m.id !== staffId);
  member.status = reason === 'dead' ? 'dead' : 'quit';
  member.assignment = null;
  member.returnTo = null;
  member.statusUntil = null;
  member.leftAt = ctx.now;
  member.leftReason = reason;
  addCareer(ctx, staffId, reason === 'fired' ? 'Entlassen.' : reason === 'dead' ? 'Gestorben.' : 'Gekündigt.');
  s.former.unshift(member);
  if (s.former.length > FORMER_LIMIT) s.former.length = FORMER_LIMIT;
  ctx.emit('staff.left', { staffId, reason });
  return member;
}

/** Loyalität ändern (auf 0–100 begrenzt). Gibt den neuen Wert zurück. */
export function addLoyalty(ctx: Ctx, staffId: string, delta: number): number {
  const m = getStaffMember(ctx.state, staffId);
  if (!m) return 0;
  m.stats.loyalty = clampStat(m.stats.loyalty + delta);
  return m.stats.loyalty;
}

/** Erfahrung gutschreiben. Beim Level-Aufstieg steigen die wichtigen Werte des Typs. */
export function addXp(ctx: Ctx, staffId: string, amount: number): void {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || m.leftAt !== null || amount <= 0) return;
  m.xp += Math.round(amount);
  const target = levelForXp(m.xp);
  while (m.level < target) {
    m.level += 1;
    const gains = levelUpGains(ctx, m.role);
    for (const [key, gain] of Object.entries(gains)) {
      m.stats[key as StatKey] = clampStat(m.stats[key as StatKey] + (gain ?? 0));
    }
    m.stats.loyalty = clampStat(m.stats.loyalty + LOYALTY.levelUp);
    revealStat(ctx, staffId);
    addCareer(ctx, staffId, `Aufgestiegen auf Level ${m.level}.`);
    journal.add(ctx, `${m.name} ist jetzt Level ${m.level}.`, 'good', { staffId });
    ctx.emit('staff.levelUp', { staffId, level: m.level });
  }
}

/** Einen noch unbekannten Wert sichtbar machen (zufällig oder den genannten). Gibt ihn zurück. */
export function revealStat(ctx: Ctx, staffId: string, stat?: StatKey): StatKey | null {
  const m = getStaffMember(ctx.state, staffId);
  if (!m) return null;
  const unknown = STAT_KEYS.filter((k) => !m.knownStats.includes(k));
  if (unknown.length === 0) return null;
  const key = stat && unknown.includes(stat) ? stat : ctx.pick(unknown);
  m.knownStats = STAT_KEYS.filter((k) => k === key || m.knownStats.includes(k));
  addCareer(ctx, staffId, `Man weiß jetzt mehr: ${STAT_NAMES[key]} ${m.stats[key]}.`);
  return key;
}

/** Anspruch setzen (1 = normal). Z.B. Leutnants verlangen mehr. */
export function setDemand(ctx: Ctx, staffId: string, demand: number): void {
  const m = getStaffMember(ctx.state, staffId);
  if (m) m.demand = Math.max(0.5, demand);
}

/** Lohn ändern. Erhöhung freut, Kürzung ärgert. */
export function setWage(ctx: Ctx, staffId: string, wage: number): boolean {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || m.leftAt !== null) return false;
  const old = m.wage;
  const next = Math.max(0, Math.round(wage));
  if (next === old) return true;
  m.wage = next;
  const change = old > 0 ? (next - old) / old : 1;
  const delta =
    change > 0
      ? Math.min(LOYALTY.wageRaiseMax, Math.round((change / 0.1) * LOYALTY.wageRaisePer10))
      : Math.round((-change / 0.1) * LOYALTY.wageCutPer10);
  addLoyalty(ctx, staffId, delta);
  addCareer(ctx, staffId, `Lohn ${next > old ? 'erhöht' : 'gekürzt'}: ${next} € pro Tag.`);
  return true;
}
