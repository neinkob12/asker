// Befehle des Personals. Spieler und Leutnants schicken dieselben Befehle.

import { type CommandMeta, type CommandResult, type Ctx, formatEuro, journal, wallet } from '../../core';
import { getWarehouse } from '../goods';
import { getSpot, isSpotActive } from '../spots';
import {
  DRIVER_HIRE_COST,
  LOYALTY,
  MAX_SECURITY_PER_WAREHOUSE,
  ROLE_INFO,
  RUNNER_DAILY_WAGE,
  WAGE_MAX_FACTOR,
  WAGE_MIN_FACTOR,
  XP_PER_BAIL,
} from './config';
import {
  activeRunnerAt,
  addCareer,
  addLoyalty,
  addXp,
  assign,
  bailCost,
  bonusProvider,
  enlist,
  expectedWage,
  getStaffMember,
  isAbsent,
  isEmployed,
  removeMember,
  roleName,
  runnerHireCost,
  securityAt,
  setStatus,
  setWage,
  staffVeedel,
  talkChance,
} from './members';
import { generateProfile } from './profile';
import { afterFired } from './routines';
import type { StaffAssignment } from './types';

const NOT_EMPLOYED = 'Diese Person arbeitet nicht für dich.';

/** Läufer von der Straße anheuern und direkt an einen Spot stellen (wie im Prototyp). */
export function hireRunner(ctx: Ctx, spotId: string): CommandResult {
  const spot = getSpot(ctx.state, spotId);
  if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
  if (!isSpotActive(ctx.state, spotId)) return { ok: false, reason: 'Der Spot ist noch nicht freigeschaltet.' };
  if (activeRunnerAt(ctx.state, spotId)) return { ok: false, reason: 'Hier arbeitet schon ein Läufer.' };
  const cost = runnerHireCost(ctx.state, spotId);
  if (!wallet.pay(ctx, cost, 'dirty', 'Läufer angeheuert', { category: 'hiring', spotId }))
    return { ok: false, reason: `Nicht genug Geld (${formatEuro(cost)}).` };
  const profile = generateProfile(ctx, 'runner');
  // Von der Straße: Lohn wie im Prototyp, man weiß fast nichts über die Person.
  profile.wage = RUNNER_DAILY_WAGE;
  const member = enlist(ctx, profile, {
    origin: 'street',
    knownStats: ['speed'],
    assignment: { kind: 'spot', targetId: spotId },
    note: `Von der Straße, am ${spot.name}.`,
    journalText: `Läufer ${profile.name} am ${spot.name} angeheuert.`,
  });
  return { ok: true, data: { staffId: member.id } };
}

/** Fahrer von der Straße anheuern (ohne Einsatz, die Logistik schickt ihn los). */
export function hireDriver(ctx: Ctx): CommandResult {
  if (!wallet.pay(ctx, DRIVER_HIRE_COST, 'dirty', 'Fahrer angeheuert', 'hiring')) {
    return { ok: false, reason: `Nicht genug Geld (${formatEuro(DRIVER_HIRE_COST)}).` };
  }
  const profile = generateProfile(ctx, 'driver');
  profile.wage = ROLE_INFO.driver.wage;
  const member = enlist(ctx, profile, {
    origin: 'street',
    knownStats: ['caution'],
    assignment: null,
    note: 'Von der Straße, mit eigenem Transporter.',
    journalText: `Fahrer ${profile.name} angeheuert.`,
  });
  return { ok: true, data: { staffId: member.id } };
}

export function fire(ctx: Ctx, staffId: string, meta: CommandMeta = { actor: 'player' }): CommandResult {
  const member = getStaffMember(ctx.state, staffId);
  if (!member || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  const place = member.assignment ?? member.returnTo;
  const veedelId =
    staffVeedel(ctx.state, member) ??
    (place?.kind === 'spot' ? (getSpot(ctx.state, place.targetId)?.veedelId ?? null) : (place?.targetId ?? null));
  // Vor dem Entlassen bestimmen: Wer in Haft ohne Stillhaltegeld sitzt, redet eher.
  const chance = talkChance(member);
  removeMember(ctx, staffId, 'fired');
  const by = meta.actor === 'player' ? '' : ` (von ${actorName(ctx, meta.actor)})`;
  journal.add(ctx, `${member.name} entlassen${by}.`, 'info', { staffId });
  afterFired(ctx, member, veedelId, chance);
  return { ok: true };
}

function actorName(ctx: Ctx, actor: string): string {
  return getStaffMember(ctx.state, actor.replace('staff:', ''))?.name ?? 'deinem Leutnant';
}

/** Stillhaltegeld in Haft an- oder abstellen. */
export function setJailSupport(ctx: Ctx, staffId: string, enabled: boolean): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (m.jailSupport === enabled) return { ok: true };
  m.jailSupport = enabled;
  addCareer(ctx, staffId, enabled ? 'Bekommt in Haft wieder Stillhaltegeld.' : 'Kein Stillhaltegeld mehr in Haft.');
  journal.add(
    ctx,
    enabled
      ? `${m.name} bekommt in Haft wieder Stillhaltegeld.`
      : `Kein Stillhaltegeld mehr für ${m.name}. Wer sitzt und nichts kriegt, redet eher.`,
    'info',
    { staffId },
  );
  return { ok: true };
}

/**
 * Ausfall ersetzen: Für jemanden in Haft oder verletzt kommt ein anderer an den Spot (ein freier Läufer bzw. eine
 * freie Sicherheit, sonst ein Läufer von der Straße). Die ausgefallene Person kommt danach in den freien Pool, mit
 * fire wird sie gleich entlassen. Spieler, Leutnants und die Rechte Hand schicken denselben Befehl.
 */
export function replaceAbsent(ctx: Ctx, staffId: string, fireToo: boolean, meta: CommandMeta): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (!isAbsent(m)) return { ok: false, reason: `${m.name} fällt gar nicht aus.` };
  const spotId = m.returnTo?.kind === 'spot' ? m.returnTo.targetId : null;
  if (!spotId || (m.role !== 'runner' && m.role !== 'security')) {
    if (fireToo) return fire(ctx, staffId, meta);
    return { ok: false, reason: `Für ${m.name} gibt es keinen Platz zu besetzen.` };
  }
  const spot = getSpot(ctx.state, spotId);
  if (!spot || !isSpotActive(ctx.state, spotId)) {
    m.returnTo = null;
    return fireToo ? fire(ctx, staffId, meta) : { ok: true };
  }
  let replacementId: string | null = null;
  const occupied = m.role === 'runner' ? activeRunnerAt(ctx.state, spotId) : securityAt(ctx.state, { spotId })[0];
  if (occupied) {
    replacementId = occupied.id;
  } else {
    const free = ctx.state.modules.staff.members
      .filter((o) => o.role === m.role && o.status === 'active' && !o.assignment)
      .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))[0];
    if (free) {
      assign(ctx, free.id, { kind: 'spot', targetId: spotId });
      replacementId = free.id;
    } else if (m.role === 'runner') {
      const hired = hireRunner(ctx, spotId);
      if (!hired.ok) return hired;
      replacementId = (hired.data as { staffId: string }).staffId;
    } else {
      return { ok: false, reason: 'Keine freie Sicherheit, die einspringen kann.' };
    }
  }
  m.returnTo = null;
  const replacement = replacementId ? getStaffMember(ctx.state, replacementId) : undefined;
  addCareer(ctx, staffId, `Am ${spot.name} ersetzt.`);
  const by = meta.actor === 'player' ? '' : ` (${actorName(ctx, meta.actor)})`;
  journal.add(ctx, `Für ${m.name} steht jetzt ${replacement?.name ?? 'jemand Neues'} am ${spot.name}${by}.`, 'info', {
    staffId,
    spotId,
  });
  if (fireToo) fire(ctx, staffId, meta);
  return { ok: true, data: { staffId: replacementId } };
}

/** Einsatz ändern (versetzen, abziehen). Prüft, ob Typ und Ort zusammenpassen. */
export function assignCommand(ctx: Ctx, staffId: string, assignment: StaffAssignment | null): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (m.assignment?.kind === 'veedel') {
    return { ok: false, reason: `${m.name} ist Leutnant. Erst als Leutnant abberufen.` };
  }
  if (m.assignment?.kind === 'office') {
    return { ok: false, reason: `${m.name} ist deine Rechte Hand. Erst von der Stelle abberufen.` };
  }
  if (m.status === 'jailed') return { ok: false, reason: `${m.name} sitzt in Haft.` };
  if (m.status === 'injured') return { ok: false, reason: `${m.name} ist verletzt.` };
  if (!assignment) {
    if (!m.assignment) return { ok: true };
    assign(ctx, staffId, null);
    return { ok: true };
  }
  if (m.assignment?.kind === assignment.kind && m.assignment.targetId === assignment.targetId) return { ok: true };
  if (assignment.kind === 'spot') {
    if (!getSpot(ctx.state, assignment.targetId)) return { ok: false, reason: 'Unbekannter Spot.' };
    if (!isSpotActive(ctx.state, assignment.targetId)) {
      return { ok: false, reason: 'Der Spot ist noch nicht freigeschaltet.' };
    }
    if (m.role === 'runner') {
      const other = activeRunnerAt(ctx.state, assignment.targetId);
      if (other && other.id !== m.id) return { ok: false, reason: `Dort arbeitet schon ${other.name}.` };
    } else if (m.role === 'security') {
      const other = securityAt(ctx.state, { spotId: assignment.targetId }).find((s) => s.id !== m.id);
      if (other) return { ok: false, reason: `Dort passt schon ${other.name} auf.` };
    } else {
      return { ok: false, reason: `${roleName(m.role)} arbeiten nicht an Spots.` };
    }
  } else if (assignment.kind === 'warehouse') {
    if (m.role !== 'security') return { ok: false, reason: 'Ins Lager kommt nur die Sicherheit.' };
    if (!getWarehouse(ctx.state, assignment.targetId)) return { ok: false, reason: 'Unbekanntes Lager.' };
    const guards = securityAt(ctx.state, { warehouseId: assignment.targetId }).filter((s) => s.id !== m.id);
    if (guards.length >= MAX_SECURITY_PER_WAREHOUSE) return { ok: false, reason: 'Das Lager ist schon bewacht.' };
  } else if (assignment.kind === 'veedel') {
    return { ok: false, reason: 'Leutnants werden befördert, nicht versetzt.' };
  } else if (assignment.kind === 'office') {
    return { ok: false, reason: 'Die Rechte Hand ernennst du in der Hierarchie.' };
  } else if (assignment.kind === 'transport') {
    return { ok: false, reason: 'Fahrer schickst du über die Logistik los.' };
  } else {
    return { ok: false, reason: 'Kuriere setzt der Lieferdienst ein.' };
  }
  assign(ctx, staffId, assignment);
  return { ok: true };
}

export function setWageCommand(ctx: Ctx, staffId: string, wage: number): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (!Number.isFinite(wage)) return { ok: false, reason: 'Ungültiger Lohn.' };
  const expected = expectedWage(ctx.state, staffId);
  const min = Math.round(expected * WAGE_MIN_FACTOR);
  const max = Math.round(expected * WAGE_MAX_FACTOR);
  if (wage < min) return { ok: false, reason: `Für weniger als ${formatEuro(min)} am Tag macht ${m.name} das nicht.` };
  if (wage > max) return { ok: false, reason: `Mehr als ${formatEuro(max)} am Tag wäre verdächtig.` };
  setWage(ctx, staffId, wage);
  return { ok: true };
}

/** Kaution zahlen: Die Person kommt sofort raus. Ein Anwalt macht es billiger. */
export function bail(ctx: Ctx, staffId: string, meta: CommandMeta): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (m.status !== 'jailed') return { ok: false, reason: `${m.name} sitzt nicht in Haft.` };
  const cost = bailCost(ctx.state, staffId);
  if (!wallet.pay(ctx, cost, 'dirty', `Kaution ${m.name}`, { category: 'bail', staffId })) {
    return { ok: false, reason: `Nicht genug Geld für die Kaution (${formatEuro(cost)}).` };
  }
  setStatus(ctx, staffId, 'active');
  addLoyalty(ctx, staffId, LOYALTY.bailed);
  addCareer(ctx, staffId, `Gegen ${formatEuro(cost)} Kaution rausgeholt.`);
  const lawyer = bonusProvider(ctx.state, 'bailDiscount');
  if (lawyer) addXp(ctx, lawyer.id, XP_PER_BAIL);
  const by = meta.actor === 'player' ? '' : ' (vom Leutnant bezahlt)';
  journal.add(ctx, `${m.name} gegen ${formatEuro(cost)} Kaution rausgeholt${by}.`, 'good', { staffId });
  ctx.emit('staff.bailed', { staffId, cost });
  return { ok: true, data: { cost } };
}
