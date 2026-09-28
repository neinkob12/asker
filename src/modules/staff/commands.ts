// Befehle des Personals. Spieler und Leutnants schicken dieselben Befehle.

import { type CommandMeta, type CommandResult, type Ctx, formatEuro, journal, wallet } from '../../core';
import { getWarehouse } from '../goods';
import { getSpot } from '../spots';
import {
  LOYALTY,
  MAX_SECURITY_PER_WAREHOUSE,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
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
  isEmployed,
  removeMember,
  roleName,
  securityAt,
  setStatus,
  setWage,
  staffVeedel,
} from './members';
import { generateProfile } from './profile';
import { afterFired } from './routines';
import type { StaffAssignment, StaffOrders } from './types';

const NOT_EMPLOYED = 'Diese Person arbeitet nicht für dich.';

/** Läufer von der Straße anheuern und direkt an einen Spot stellen (wie im Prototyp). */
export function hireRunner(ctx: Ctx, spotId: string): CommandResult {
  const spot = getSpot(ctx.state, spotId);
  if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
  if (activeRunnerAt(ctx.state, spotId)) return { ok: false, reason: 'Hier arbeitet schon ein Läufer.' };
  if (!wallet.pay(ctx, RUNNER_HIRE_COST, 'dirty', 'Läufer angeheuert'))
    return { ok: false, reason: 'Nicht genug Geld.' };
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

export function fire(ctx: Ctx, staffId: string): CommandResult {
  const member = getStaffMember(ctx.state, staffId);
  if (!member || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  const veedelId = staffVeedel(ctx.state, member) ?? member.returnTo?.targetId ?? null;
  removeMember(ctx, staffId, 'fired');
  journal.add(ctx, `${member.name} entlassen.`, 'info', { staffId });
  afterFired(ctx, member, veedelId);
  return { ok: true };
}

/** Einsatz ändern (versetzen, abziehen). Prüft, ob Typ und Ort zusammenpassen. */
export function assignCommand(ctx: Ctx, staffId: string, assignment: StaffAssignment | null): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (m.assignment?.kind === 'veedel') {
    return { ok: false, reason: `${m.name} ist Leutnant. Erst als Leutnant abberufen.` };
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
  if (!wallet.pay(ctx, cost, 'dirty', `Kaution ${m.name}`)) {
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

export function setOrders(ctx: Ctx, staffId: string, orders: Partial<StaffOrders>): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (orders.priceFloor !== undefined) {
    if (!(orders.priceFloor >= 0 && orders.priceFloor <= 1.5)) return { ok: false, reason: 'Ungültiger Mindestpreis.' };
    m.orders.priceFloor = Math.round(orders.priceFloor * 100) / 100;
  }
  return { ok: true };
}
