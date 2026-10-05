// Lese- und Schreib-API des Personals. Lesen mit state, schreiben mit ctx.

import { type Contact, type Ctx, type GameState, journal, type MoneyCategory, personLook } from '../../core';
import { activeCity, bribeFactor, cityName, getCity, isCityLive } from '../city';
import { getWarehouse } from '../goods';
import { lieutenantOfSpot } from '../hierarchy';
import { getSpot, isSpotActive } from '../spots';
import { veedelAt, veedelName } from '../veedel';
import {
  BAIL_BASE,
  BAIL_PER_LEVEL,
  CAREER_LIMIT,
  FIRED_TALK_CHANCE,
  FIRED_TALK_LOYALTY,
  FORMER_LIMIT,
  INJURED_WAGE_FACTOR,
  INJURY_DURATION,
  JAIL_DURATION,
  JAIL_WAGE_FACTOR,
  LOYALTY,
  MIN_SERVE_TIME,
  RELATIONS,
  ROLE_INFO,
  RUNNER_HIRE_COST,
  RUNNER_HIRE_COST_MAX,
  RUNNER_HIRE_COST_MIN,
  RUNNER_SERVE_TIME,
  SPECIALIST_BONUS,
  STAT_NAMES,
  UNSUPPORTED_TALK_CHANCE,
  UNSUPPORTED_TALK_LOYALTY,
} from './config';
import { clampStat, expectedWageFor, levelForXp, levelUpGains, STAT_KEYS } from './profile';
import { relateNewMember, relationsOf, rollTraits, traitFactor } from './traits';
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
    if (filter.cityId && (m.cityId ?? 'koeln') !== filter.cityId) return false;
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

/**
 * Läufer an einem Spot, egal welcher Status. Wer in Haft oder verletzt ist, räumt den Spot zwar (andere können
 * ihn übernehmen), gilt aber weiter als Läufer des Spots, solange dort niemand anderes steht.
 */
export function runnerAt(state: GameState, spotId: string): StaffMember | undefined {
  return (
    activeRunnerAt(state, spotId) ??
    state.modules.staff.members.find(
      (m) => m.role === 'runner' && m.returnTo?.kind === 'spot' && m.returnTo.targetId === spotId,
    )
  );
}

/** Läufer, der gerade an einem Spot arbeitet (eingesetzt und aktiv). */
export function activeRunnerAt(state: GameState, spotId: string): StaffMember | undefined {
  return getStaff(state, { role: 'runner', spotId }).find((m) => m.status === 'active');
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

/** Freier, aktiver Mitarbeiter ohne Einsatz, z.B. ein Fahrer für die Logistik. */
/** Freie Person dieser Rolle in der Stadt, die live ist (oder der angegebenen). */
export function findAvailable(state: GameState, filter: { role: StaffRole; cityId?: string }): StaffMember | undefined {
  const city = filter.cityId ?? activeCity(state);
  return state.modules.staff.members.find(
    (m) => m.role === filter.role && m.status === 'active' && !m.assignment && (m.cityId ?? 'koeln') === city,
  );
}

/** Wohin die Person nach dem Abtauchen zurückgeht (null, wenn sie nicht abgetaucht ist). */
export function hidingReturn(state: GameState, staffId: string): StaffAssignment | null {
  for (const hiding of Object.values(state.modules.staff.hiding)) {
    const entry = hiding.returns.find((r) => r.staffId === staffId);
    if (entry) return entry.assignment;
  }
  return null;
}

/** Wer nach dem Abtauchen an seinen Platz zurück soll, steht anderen nicht zur Verfügung (sonst fehlt er dort später). */
function reservedForReturn(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const hiding of Object.values(state.modules.staff.hiding)) for (const r of hiding.returns) ids.add(r.staffId);
  return ids;
}

/**
 * Freie Leute einer Rolle für Spots (aktiv, ohne Einsatz, nicht fürs Zurückkehren nach dem Abtauchen vorgemerkt), die
 * besten zuerst. Eine Stelle für alle, die jemanden hinstellen: Spieler, Leutnants, Rechte Hand, Ersatz bei Ausfall.
 */
/** Freie Leute dieser Rolle in der Stadt, die live ist (die besten zuerst). */
export function freeStaff(state: GameState, role: StaffRole): StaffMember[] {
  const reserved = reservedForReturn(state);
  const city = activeCity(state);
  return state.modules.staff.members
    .filter((m) => m.role === role && m.status === 'active' && !m.assignment && !reserved.has(m.id))
    .filter((m) => (m.cityId ?? 'koeln') === city)
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
}

/** Veedel eines Einsatzortes (Spot, Lager oder Veedel eines Leutnants), sonst null (Büro, Fahrt, Lieferung). */
export function placeVeedel(state: GameState, place: StaffAssignment | null | undefined): string | null {
  if (!place) return null;
  if (place.kind === 'spot') return getSpot(state, place.targetId)?.veedelId ?? null;
  if (place.kind === 'veedel') return place.targetId;
  if (place.kind === 'warehouse') {
    const w = getWarehouse(state, place.targetId);
    return w ? (veedelAt(w.lng, w.lat)?.id ?? null) : null;
  }
  return null;
}

/** Veedel, in dem jemand eingesetzt ist (Spot, Lager oder als Leutnant), sonst null. */
export function staffVeedel(state: GameState, member: StaffMember): string | null {
  return placeVeedel(state, member.assignment);
}

/** Arbeiter und Gärtner auf den Fincas (Auftrag 42): nie in einer Stadt, nie im Team einer Stadt. */
export function isFarmRole(role: StaffRole): boolean {
  return role === 'worker' || role === 'gardener';
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
  if (!m) return 0;
  // Eigenschaften (Auftrag 34): Ehrgeizige und Familienmenschen wollen etwas mehr.
  return Math.round(expectedWageFor(m.role, m.level, m.demand) * cityWageFactor(m.cityId) * traitFactor(m, 'wage'));
}

/** Lohnniveau der Stadt (Auftrag 30, CITIES.wageFactor; Köln 1). */
export function cityWageFactor(cityId: string | undefined): number {
  return getCity(cityId ?? 'koeln')?.wageFactor ?? 1;
}

/** Ist die Person in der Stadt, die gerade live ist? (Schlafende Städte: keine Einzel-Löhne, keine Ereignisse.) */
export function isMemberLive(state: GameState, member: StaffMember): boolean {
  return isCityLive(state, member.cityId ?? 'koeln');
}

/** Kategorie des Lohns in der Kasse: nach Rolle, Leutnants und Rechte Hand extra. */
export function wageCategory(member: StaffMember): MoneyCategory {
  const post = member.assignment ?? member.returnTo;
  // Lieferungen fährt nur die Rechte Hand: Ihr Lohn bleibt auch auf der Fahrt ein Lohn der Führung.
  if (post?.kind === 'veedel' || post?.kind === 'office' || post?.kind === 'delivery') return 'wages.lead';
  if (member.role === 'runner') return 'wages.runner';
  if (member.role === 'security') return 'wages.security';
  if (member.role === 'courier' || member.role === 'driver') return 'wages.transport';
  return 'wages.specialist';
}

/** Summe der Tageslöhne aller aktuellen Mitarbeiter. */
export function dailyWages(state: GameState): number {
  return state.modules.staff.members.reduce((sum, m) => sum + m.wage, 0);
}

/**
 * Was die Person heute Nacht wirklich kostet: in Haft nur Stillhaltegeld (oder nichts, wenn abgestellt), verletzt
 * den halben Lohn, sonst den vollen.
 */
export function effectiveWage(member: StaffMember): number {
  if (member.status === 'jailed') return member.jailSupport ? Math.round(member.wage * JAIL_WAGE_FACTOR) : 0;
  if (member.status === 'injured') return Math.round(member.wage * INJURED_WAGE_FACTOR);
  return member.wage;
}

/** Was um Mitternacht an Löhnen fällig wird (Summe über alle aktuellen Mitarbeiter, Haft und Verletzung anteilig). */
export function payrollDue(state: GameState): number {
  return state.modules.staff.members.reduce((sum, m) => sum + (isMemberLive(state, m) ? effectiveWage(m) : 0), 0);
}

/**
 * Wie wahrscheinlich redet die Person, wenn sie jetzt entlassen wird (bzw. ohne Stillhaltegeld aus der Haft kommt)?
 * 0 = sie hält dicht.
 */
export function talkChance(member: StaffMember): number {
  // Eigenschaften (Auftrag 34): Wer treu wie Gold ist, hält dicht; ein Maulheld redet eher.
  const factor = traitFactor(member, 'talk');
  const unsupported = member.status === 'jailed' && !member.jailSupport;
  if (unsupported && member.stats.loyalty < UNSUPPORTED_TALK_LOYALTY)
    return Math.min(1, UNSUPPORTED_TALK_CHANCE * factor);
  if (member.stats.loyalty < FIRED_TALK_LOYALTY) return Math.min(1, FIRED_TALK_CHANCE * factor);
  return 0;
}

/** Fällt die Person gerade aus (Haft oder verletzt)? */
export function isAbsent(member: StaffMember): boolean {
  return member.status === 'jailed' || member.status === 'injured';
}

/** So lange braucht die Person für einen Kunden (Tempo und Level). */
export function serveTime(member: StaffMember): number {
  const factor = (1.4 - member.stats.speed / 125) * (1 - 0.03 * (member.level - 1)) * traitFactor(member, 'pace');
  return Math.max(MIN_SERVE_TIME, Math.round(RUNNER_SERVE_TIME * factor));
}

/**
 * Beziehungen am selben Spot (Auftrag 34): Faktor auf die Zeit pro Kunde. Befreundete, Geschwister und ein Paar
 * arbeiten Hand in Hand (kleiner = schneller), Rivalen streiten (größer). Zählt, wer am Spot steht (Läufer, Sicherheit)
 * und der Leutnant des Spots.
 */
export function relationPace(state: GameState, member: StaffMember): number {
  const spotId = member.assignment?.kind === 'spot' ? member.assignment.targetId : null;
  if (!spotId) return 1;
  const lead = lieutenantOfSpot(state, spotId);
  let factor = 1;
  for (const { other, kind } of relationsOf(state, member.id)) {
    if (other.status !== 'active') continue;
    const here = other.id === lead || (other.assignment?.kind === 'spot' && other.assignment.targetId === spotId);
    if (here) factor *= RELATIONS[kind].samePlace;
  }
  return factor;
}

/** Arbeitstempo als Faktor (1 = normal, größer = schneller), z.B. für Fahrer. */
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
  const base = Math.max(0.4, 1.4 - m.stats.caution / 125 - 0.03 * (m.level - 1));
  return Math.round(base * traitFactor(m, 'risk') * 100) / 100;
}

/**
 * Kampfkraft einer Person (etwa 0 bis 130) für Konfrontationen (Auftrag 11):
 * vor allem Stärke, dazu Vorsicht und Level. Wer kaum loyal ist, hält nicht den Kopf hin.
 */
export function combatValue(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  if (m?.status !== 'active') return 0;
  const loyaltyPenalty = m.stats.loyalty < 30 ? 10 : 0;
  const base = m.stats.strength * 0.7 + m.stats.caution * 0.2 + m.level * 4 - loyaltyPenalty;
  return Math.max(0, Math.round(base * traitFactor(m, 'combat')));
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
    const runner = target.spotId ? activeRunnerAt(state, target.spotId) : undefined;
    if (runner) people.push(runner);
  }
  const total = people.reduce((sum, m) => sum + combatValue(state, m.id) * (m.role === 'security' ? 1 : 1 / 3), 0);
  return Math.round(total);
}

/**
 * Bonus durch Spezialisten (0 = keiner). Zählt der beste aktive Spezialist des passenden Typs in der Stadt (ohne
 * Angabe die aktive): Ein Kölner Anwalt hilft in Hamburg nicht (Auftrag 43). Werte siehe StaffBonus.
 */
export function bonus(state: GameState, key: StaffBonus, cityId = activeCity(state)): number {
  const rule = SPECIALIST_BONUS[key];
  let best = 0;
  for (const m of state.modules.staff.members) {
    if (m.role !== rule.role || m.status !== 'active' || (m.cityId ?? 'koeln') !== cityId) continue;
    const value = rule.base + rule.perLevel * (m.level - 1) + (m.stats[rule.stat] - 50) / rule.divisor;
    best = Math.max(best, Math.min(rule.max, value));
  }
  return Math.round(best * 100) / 100;
}

/** Wer liefert den Bonus in der Stadt (ohne Angabe die aktive)? */
export function bonusProvider(state: GameState, key: StaffBonus, cityId = activeCity(state)): StaffMember | undefined {
  const rule = SPECIALIST_BONUS[key];
  return state.modules.staff.members
    .filter((m) => m.role === rule.role && m.status === 'active' && (m.cityId ?? 'koeln') === cityId)
    .sort((a, b) => b.level - a.level || b.stats[rule.stat] - a.stats[rule.stat])[0];
}

/** Kaution für eine Person in Haft (ein Anwalt aus ihrer Stadt macht sie billiger). */
export function bailCost(state: GameState, id: string): number {
  const m = getStaffMember(state, id);
  if (!m) return 0;
  const base = (BAIL_BASE + BAIL_PER_LEVEL * (m.level - 1)) * bribeFactor(m.cityId);
  return Math.round((base * (1 - bonus(state, 'bailDiscount', m.cityId ?? 'koeln'))) / 10) * 10;
}

/** Haftdauer für eine neue Festnahme in der Stadt (ein Anwalt dort macht sie kürzer). */
export function jailDuration(state: GameState, cityId = activeCity(state)): number {
  return Math.round(JAIL_DURATION * (1 - bonus(state, 'jailReduction', cityId)));
}

/** Kontakt fürs Handy, z.B. für Nachrichten von dieser Person. */
export function staffContact(member: StaffMember): Contact {
  return {
    id: `staff:${member.id}`,
    name: member.name,
    kind: member.role === 'policeContact' ? 'police' : 'staff',
    role: ROLE_INFO[member.role].name,
    about: member.background,
    look: personLook(member.name, member.age),
  };
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
  /** Stadt, in der die Person anfängt. Standard: die aktive Stadt. */
  cityId?: string;
  /** Wer die Person empfohlen hat (Auftrag 34: die beiden kennen sich). */
  referrerId?: string | null;
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
    statusUntil: null,
    returnTo: null,
    career: [],
    record: { sales: 0, revenue: 0, arrests: 0 },
    lastIncidentAt: null,
    leftAt: null,
    leftReason: null,
    jailSupport: true,
    cityId: options.cityId ?? activeCity(ctx.state),
    traits: profile.traits
      ? [...profile.traits]
      : rollTraits(`${ctx.state.meta.seed}:${ctx.now}:${profile.name}:${profile.age}`),
  };
  ctx.state.modules.staff.members.push(member);
  // Auftrag 34: Manche kennen schon jemanden im Team.
  relateNewMember(ctx, member, options.referrerId);
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
  // Lieferungen und Fahrten sind kurz, die kommen nicht in die Laufbahn.
  if (next && next.kind !== 'delivery' && next.kind !== 'transport' && next.kind !== 'travel') {
    addCareer(ctx, staffId, `Eingesetzt: ${assignmentLabel(ctx.state, next)}.`);
  }
  ctx.emit('staff.assigned', { staffId, assignment: member.assignment });
  return true;
}

/** Einsatzort als Text, z.B. "Zülpicher Platz" oder "Leutnant in Ehrenfeld". */
export function assignmentLabel(state: GameState, a: StaffAssignment | null): string {
  if (!a) return 'ohne Einsatz';
  if (a.kind === 'spot') return getSpot(state, a.targetId)?.name ?? a.targetId;
  if (a.kind === 'warehouse') return getWarehouse(state, a.targetId)?.name ?? a.targetId;
  if (a.kind === 'veedel') return `Leutnant in ${veedelName(a.targetId)}`;
  if (a.kind === 'transport') return 'Fahrt';
  if (a.kind === 'travel') return `Unterwegs nach ${cityName(a.targetId)}`;
  if (a.kind === 'office') return 'Rechte Hand';
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
    const duration = status === 'jailed' ? jailDuration(ctx.state, member.cityId ?? 'koeln') : INJURY_DURATION;
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
    if (activeRunnerAt(ctx.state, target.targetId) || !isSpotActive(ctx.state, target.targetId)) return;
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
  // Arbeiter und Gärtner der Fincas (Auftrag 42) verdrängen nicht die Ehemaligen aus den Städten (FORMER_LIMIT).
  if (!isFarmRole(member.role)) s.former.unshift(member);
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
  m.xp += Math.round(amount * traitFactor(m, 'xp'));
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
  // Gerundet wird immer gegen die Person: Gewinn nach unten, Verlust nach oben. Sonst brächte schon eine kleine
  // Erhöhung +1 und die Rücknahme in Schritten 0, und per Skript käme man kostenlos auf Loyalität 100.
  const eps = 1e-9;
  const delta =
    change > 0
      ? Math.min(LOYALTY.wageRaiseMax, Math.floor((change / 0.1) * LOYALTY.wageRaisePer10 + eps))
      : -Math.ceil((-change / 0.1) * -LOYALTY.wageCutPer10 - eps);
  addLoyalty(ctx, staffId, delta);
  addCareer(ctx, staffId, `Lohn ${next > old ? 'erhöht' : 'gekürzt'}: ${next} € pro Tag.`);
  return true;
}

/** Was ein Läufer von der Straße an diesem Spot kostet (unbekannter Spot: Grundpreis). */
export function runnerHireCost(state: GameState, spotId: string): number {
  const spot = getSpot(state, spotId);
  if (!spot) return RUNNER_HIRE_COST;
  const raw = RUNNER_HIRE_COST * spot.demand * spot.priceMultiplier;
  return Math.min(RUNNER_HIRE_COST_MAX, Math.max(RUNNER_HIRE_COST_MIN, Math.round(raw / 50) * 50));
}
