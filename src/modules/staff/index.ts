// Personal: Mitarbeiter mit Rolle, Status, Werten und Einsatz.
// Aus dem Prototyp portiert: Läufer an Spots, die Kunden automatisch bedienen, und tägliche Löhne.
// Individuelle Werte, Level, Loyalität, Kuriere, Sicherheit und Spezialisten baut Auftrag 13.
//
// Öffentliche API:
//   getStaff(state, filter), getStaffMember(state, id), getStats(state, id), runnerAt(state, spotId),
//   findAvailable(state, filter), assign(ctx, staffId, assignment), setStatus(ctx, staffId, status),
//   bonus(state, key), dailyWages(state), RUNNER_HIRE_COST, RUNNER_DAILY_WAGE
// Befehle: 'staff.hireRunner', 'staff.fire', 'staff.assign'
// Ereignisse: 'staff.hired', 'staff.left', 'staff.statusChanged', 'staff.assigned'

import { type CommandResult, type Ctx, defineModule, formatEuro, type GameState, journal, wallet } from '../../core';
import { canServe, waitingAt } from '../customers';
import { getSpot } from '../spots';
import {
  DEFAULT_STATS,
  FIRST_NAMES,
  LAST_NAMES,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  RUNNER_SERVE_TIME,
} from './config';

export { RUNNER_DAILY_WAGE, RUNNER_HIRE_COST } from './config';

export type StaffRole = 'runner' | 'courier' | 'security' | 'lawyer' | 'accountant' | 'policeContact';
export type StaffStatus = 'active' | 'injured' | 'jailed' | 'quit' | 'dead';

/** Werte von 0 bis 100. */
export interface StaffStats {
  speed: number;
  caution: number;
  strength: number;
  charisma: number;
  loyalty: number;
}

/** Einsatzort. kind 'spot' → targetId = Spot-ID, 'delivery' → Auftrags-ID, 'warehouse' → Lager-ID. */
export interface StaffAssignment {
  kind: 'spot' | 'delivery' | 'warehouse';
  targetId: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  stats: StaffStats;
  level: number;
  xp: number;
  /** Lohn pro Spieltag in Euro (Schwarzgeld). */
  wage: number;
  hiredAt: number;
  assignment: StaffAssignment | null;
  /** Beschäftigt bis (Spielminute). */
  busyUntil: number;
  /** Porträt-Bild (URL), vorerst null = Platzhalter. */
  portrait: string | null;
}

export interface StaffState {
  members: StaffMember[];
}

/** Boni von Spezialisten, die andere Module abfragen. */
export type StaffBonus = 'bailDiscount' | 'launderingFeeDiscount' | 'raidWarning';

export interface StaffFilter {
  role?: StaffRole;
  status?: StaffStatus;
  spotId?: string;
  veedelId?: string;
}

declare module '../../core' {
  interface ModuleStates {
    staff: StaffState;
  }
  interface GameCommands {
    /** Läufer anheuern und direkt an einen Spot stellen (wie im Prototyp). */
    'staff.hireRunner': { spotId: string };
    'staff.fire': { staffId: string };
    'staff.assign': { staffId: string; assignment: StaffAssignment | null };
  }
  interface GameEvents {
    'staff.hired': { staffId: string; role: StaffRole };
    'staff.left': { staffId: string; reason: 'fired' | 'quit' };
    'staff.statusChanged': { staffId: string; from: StaffStatus; to: StaffStatus };
    'staff.assigned': { staffId: string; assignment: StaffAssignment | null };
  }
}

export function getStaff(state: GameState, filter: StaffFilter = {}): StaffMember[] {
  return state.modules.staff.members.filter((m) => {
    if (filter.role && m.role !== filter.role) return false;
    if (filter.status && m.status !== filter.status) return false;
    if (filter.spotId && !(m.assignment?.kind === 'spot' && m.assignment.targetId === filter.spotId)) return false;
    if (filter.veedelId) {
      if (m.assignment?.kind !== 'spot') return false;
      if (getSpot(state, m.assignment.targetId)?.veedelId !== filter.veedelId) return false;
    }
    return true;
  });
}

export function getStaffMember(state: GameState, id: string): StaffMember | undefined {
  return state.modules.staff.members.find((m) => m.id === id);
}

/** Werte eines Mitarbeiters, z.B. für Konfrontationen. */
export function getStats(state: GameState, id: string): StaffStats | null {
  const member = getStaffMember(state, id);
  return member ? { ...member.stats } : null;
}

/** Läufer an einem Spot (egal welcher Status). */
export function runnerAt(state: GameState, spotId: string): StaffMember | undefined {
  return getStaff(state, { role: 'runner', spotId })[0];
}

/** Freier, aktiver Mitarbeiter ohne Einsatz, z.B. ein Kurier für den Lieferdienst. */
export function findAvailable(state: GameState, filter: { role: StaffRole }): StaffMember | undefined {
  return state.modules.staff.members.find((m) => m.role === filter.role && m.status === 'active' && !m.assignment);
}

/** Einsatz setzen oder aufheben (null). */
export function assign(ctx: Ctx, staffId: string, assignment: StaffAssignment | null): boolean {
  const member = getStaffMember(ctx.state, staffId);
  if (!member) return false;
  member.assignment = assignment ? { ...assignment } : null;
  ctx.emit('staff.assigned', { staffId, assignment: member.assignment });
  return true;
}

/** Status ändern (verletzt, in Haft …). */
export function setStatus(ctx: Ctx, staffId: string, status: StaffStatus): boolean {
  const member = getStaffMember(ctx.state, staffId);
  if (!member || member.status === status) return false;
  const from = member.status;
  member.status = status;
  ctx.emit('staff.statusChanged', { staffId, from, to: status });
  return true;
}

/** Bonus durch Spezialisten (0 = keiner). Stand Fundament: immer 0, Auftrag 13 füllt das. */
export function bonus(_state: GameState, _key: StaffBonus): number {
  return 0;
}

/** Summe der Tageslöhne. */
export function dailyWages(state: GameState): number {
  return state.modules.staff.members.reduce((sum, m) => sum + m.wage, 0);
}

function hireRunner(ctx: Ctx, spotId: string): CommandResult {
  const spot = getSpot(ctx.state, spotId);
  if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
  if (runnerAt(ctx.state, spotId)) return { ok: false, reason: 'Hier arbeitet schon ein Läufer.' };
  if (!wallet.pay(ctx, RUNNER_HIRE_COST, 'dirty', 'Läufer angeheuert'))
    return { ok: false, reason: 'Nicht genug Geld.' };
  const member: StaffMember = {
    id: `s${ctx.nextId()}`,
    name: `${ctx.pick(FIRST_NAMES)} ${ctx.pick(LAST_NAMES)}`,
    role: 'runner',
    status: 'active',
    stats: { ...DEFAULT_STATS },
    level: 1,
    xp: 0,
    wage: RUNNER_DAILY_WAGE,
    hiredAt: ctx.now,
    assignment: { kind: 'spot', targetId: spotId },
    busyUntil: ctx.now,
    portrait: null,
  };
  ctx.state.modules.staff.members.push(member);
  journal.add(ctx, `Läufer ${member.name} am ${spot.name} angeheuert.`, 'good', { spotId, staffId: member.id });
  ctx.emit('staff.hired', { staffId: member.id, role: member.role });
  return { ok: true, data: { staffId: member.id } };
}

function removeMember(ctx: Ctx, staffId: string, reason: 'fired' | 'quit'): void {
  const state = ctx.state.modules.staff;
  state.members = state.members.filter((m) => m.id !== staffId);
  ctx.emit('staff.left', { staffId, reason });
}

/** Läufer bedienen die Kunden an ihrem Spot, solange Ware da ist. Sie nutzen denselben Befehl wie der Spieler. */
function serveCustomers(ctx: Ctx): void {
  for (const member of [...ctx.state.modules.staff.members]) {
    if (member.role !== 'runner' || member.status !== 'active' || member.assignment?.kind !== 'spot') continue;
    if (member.busyUntil > ctx.now) continue;
    const customer = waitingAt(ctx.state, member.assignment.targetId).find((c) => canServe(ctx.state, c.id));
    if (!customer) continue;
    const result = ctx.dispatch(
      { type: 'customers.serve', payload: { customerId: customer.id, sellerId: member.id } },
      { actor: `staff:${member.id}` },
    );
    if (result.ok) member.busyUntil = ctx.now + RUNNER_SERVE_TIME;
  }
}

/** Löhne um Mitternacht. Wer nicht bezahlt werden kann, kündigt. */
function payWages(ctx: Ctx): void {
  const members = [...ctx.state.modules.staff.members];
  if (members.length === 0) return;
  let paid = 0;
  let total = 0;
  const quitting: StaffMember[] = [];
  for (const m of members) {
    if (wallet.pay(ctx, m.wage, 'dirty', 'Lohn')) {
      paid++;
      total += m.wage;
    } else {
      quitting.push(m);
    }
  }
  if (paid > 0) journal.add(ctx, `Löhne gezahlt: ${formatEuro(total)} für ${paid} ${paid === 1 ? 'Person' : 'Leute'}.`);
  if (quitting.length > 0) {
    for (const m of quitting) removeMember(ctx, m.id, 'quit');
    const n = quitting.length;
    journal.add(
      ctx,
      `Kein Geld für Löhne: ${n} ${n === 1 ? 'Mitarbeiter hat' : 'Mitarbeiter haben'} gekündigt.`,
      'bad',
    );
  }
}

export default defineModule({
  id: 'staff',
  version: 1,
  dependsOn: ['spots', 'customers'],
  init: () => ({ members: [] }),
  tick: serveCustomers,
  commands: {
    'staff.hireRunner': (ctx, { spotId }) => hireRunner(ctx, spotId),
    'staff.fire': (ctx, { staffId }) => {
      const member = getStaffMember(ctx.state, staffId);
      if (!member) return { ok: false, reason: 'Diese Person arbeitet nicht für dich.' };
      removeMember(ctx, staffId, 'fired');
      journal.add(ctx, `${member.name} entlassen.`);
      return { ok: true };
    },
    'staff.assign': (ctx, { staffId, assignment }) =>
      assign(ctx, staffId, assignment) ? { ok: true } : { ok: false, reason: 'Diese Person arbeitet nicht für dich.' },
  },
  on: {
    'clock.dayStarted': payWages,
    'police.arrest': (ctx, { staffId }) => {
      setStatus(ctx, staffId, 'jailed');
    },
  },
});
