// Personal: Mitarbeiter mit Namen, Alter, Hintergrund, Werten, Level, Loyalität und Laufbahn.
// Typen: Läufer, Kuriere, Fahrer, Sicherheit und Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt).
// Läufer bedienen Kunden an Spots über denselben Befehl wie der Spieler, Kuriere holt sich der Lieferdienst
// (findAvailable + assign), Fahrer die Logistik (Abholung am Hafen, Umlagern), Sicherheit steht an Spots und Lagern, Spezialisten geben Boni (bonus()).
// Arbeit bringt Erfahrung, Level-Aufstiege heben die Werte. Loyalität hängt an Lohn, Gefahr, Haft und
// Beförderung; wer kaum noch loyal ist, verrät dich manchmal (mild). Festnahmen bringen Haft, Kaution holt raus.
//
// Öffentliche API (lesen):
//   getStaff(state, filter), getStaffMember(state, id), isEmployed, getStats(state, id),
//   runnerAt(state, spotId) (egal welcher Status), activeRunnerAt(state, spotId) (arbeitet gerade dort), securityAt(state, { spotId | warehouseId }), findAvailable(state, { role }), staffVeedel(state, member),
//   expectedWage(state, id), expectedWageFor(role, level, demand), dailyWages(state), serveTime(member),
//   speedFactor, riskFactor, combatValue, defenseStrength(state, { spotId | warehouseId | veedelId }),
//   bonus(state, key), bonusProvider, bailCost, jailDuration, levelProgress, betrayalChance,
//   isSpecialist, isStatKnown, roleName, assignmentLabel, staffContact, ROLE_INFO, STAT_NAMES, STATUS_NAMES, STAT_KEYS
// Öffentliche API (schreiben, mit ctx):
//   assign(ctx, id, assignment), setStatus(ctx, id, status, until?), addXp, addLoyalty, setWage, setDemand,
//   addCareer, revealStat, enlist(ctx, profile, options), generateProfile(ctx, role, options), randomName(ctx)
//   isLyingLow(state, veedelId), lieLow(ctx, veedelId, until)
// Befehle: 'staff.hireRunner', 'staff.hireDriver', 'staff.fire', 'staff.assign', 'staff.setWage', 'staff.bail', 'staff.lieLow'
// Ereignisse: 'staff.hired', 'staff.left', 'staff.statusChanged', 'staff.assigned', 'staff.levelUp',
//   'staff.bailed', 'staff.betrayed', 'staff.raidWarning', 'staff.wentUnderground'

import { type CommandResult, type Ctx, clock, defineModule, formatEuro, type GameState, journal } from '../../core';
import { getVeedel, veedelName } from '../veedel';
import { assignCommand, bail, fire, hireDriver, hireRunner, setWageCommand } from './commands';
import {
  DEFAULT_STATS,
  INJURY_DURATION,
  JAIL_DURATION,
  LOYALTY,
  MAX_HIDE_DURATION,
  XP_PER_ENCOUNTER,
  XP_PER_SALE,
  XP_PER_SALE_UNIT,
} from './config';
import { addLoyalty, addXp, bailCost, getStaff, getStaffMember, setStatus } from './members';
import { STAT_KEYS } from './profile';
import { daily, hourly, lieLow, tick, warnOfRaid } from './routines';
import type {
  BetrayalKind,
  StaffAssignment,
  StaffLeaveReason,
  StaffMember,
  StaffRole,
  StaffState,
  StaffStats,
  StaffStatus,
} from './types';

export {
  DEFAULT_STATS,
  DRIVER_HIRE_COST,
  MAX_LEVEL,
  ROLE_INFO,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  STAT_NAMES,
  STATUS_NAMES,
} from './config';
export * from './members';
export {
  clampStat,
  expectedWageFor,
  type GenerateOptions,
  generateProfile,
  levelForXp,
  levelProgress,
  randomName,
  STAT_KEYS,
} from './profile';
export { betrayalChance, isLyingLow, lieLow } from './routines';
export type * from './types';

declare module '../../core' {
  interface ModuleStates {
    staff: StaffState;
  }
  interface GameCommands {
    /** Läufer von der Straße anheuern und direkt an einen Spot stellen (wie im Prototyp). */
    'staff.hireRunner': { spotId: string };
    /** Fahrer von der Straße anheuern (für Abholungen am Hafen und Fahrten zwischen Lagern). */
    'staff.hireDriver': Record<string, never>;
    'staff.fire': { staffId: string };
    /** Versetzen oder abziehen (null). Läufer an Spots, Sicherheit an Spots oder in Lager. */
    'staff.assign': { staffId: string; assignment: StaffAssignment | null };
    /** Tageslohn ändern. */
    'staff.setWage': { staffId: string; wage: number };
    /** Kaution zahlen und jemanden aus der Haft holen. */
    'staff.bail': { staffId: string };
    /** Alle Leute an den Spots eines Veedels bis until von der Straße holen (z.B. nach einer Razzia-Warnung). */
    'staff.lieLow': { veedelId: string; until: number };
  }
  interface GameEvents {
    'staff.hired': { staffId: string; role: StaffRole };
    'staff.left': { staffId: string; reason: StaffLeaveReason };
    'staff.statusChanged': { staffId: string; from: StaffStatus; to: StaffStatus };
    'staff.assigned': { staffId: string; assignment: StaffAssignment | null };
    'staff.levelUp': { staffId: string; level: number };
    'staff.bailed': { staffId: string; cost: number };
    /** Verrat: amount = Einheiten Ware, Euro oder Heat (je nach kind). */
    'staff.betrayed': { staffId: string; kind: BetrayalKind; amount: number };
    /** Der Polizei-Kontakt warnt vor einer geplanten Razzia (at = wann sie kommt). */
    'staff.raidWarning': { veedelId: string; staffId: string; heat: number; at: number };
    /** Die Leute in einem Veedel sind abgetaucht (pulled = so viele von der Straße geholt). */
    'staff.wentUnderground': { veedelId: string; until: number; pulled: number };
  }
}

// --- Migration vom Fundament (Version 1) ---

interface StaffMemberV1 {
  id: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  stats: StaffStats;
  level: number;
  xp: number;
  wage: number;
  hiredAt: number;
  assignment: StaffAssignment | null;
  busyUntil: number;
  portrait: string | null;
}

interface StaffStateV1 {
  members: StaffMemberV1[];
}

function upgradeMember(m: StaffMemberV1, state: GameState): StaffMember {
  const away = m.status === 'jailed' || m.status === 'injured';
  const gone = m.status === 'quit' || m.status === 'dead';
  return {
    ...m,
    stats: { ...DEFAULT_STATS, ...m.stats },
    assignment: away || gone ? null : m.assignment,
    age: 24,
    background: '',
    origin: 'street',
    // Im Fundament hatten alle dieselben Werte, da gibt es nichts zu entdecken.
    knownStats: [...STAT_KEYS],
    demand: 1,
    statusUntil: m.status === 'jailed' ? state.time + JAIL_DURATION : away ? state.time + INJURY_DURATION : null,
    returnTo: away ? m.assignment : null,
    career: [{ time: m.hiredAt, text: 'Eingestellt.' }],
    record: { sales: 0, revenue: 0, arrests: m.status === 'jailed' ? 1 : 0 },
    lastIncidentAt: null,
    leftAt: gone ? state.time : null,
    leftReason: m.status === 'dead' ? 'dead' : m.status === 'quit' ? 'quit' : null,
  };
}

type StaffStateV2 = Omit<StaffState, 'hiding'> & { warnings: Record<string, number> };

export function migrateStaffV1(old: StaffStateV1, state: GameState): StaffStateV2 {
  const members = old.members.map((m) => upgradeMember(m, state));
  return {
    members: members.filter((m) => m.leftAt === null),
    former: members.filter((m) => m.leftAt !== null),
    warnings: {},
  };
}

/** Version 2 → 3: Die Übergangs-Warnungen fallen weg, dafür gibt es abgetauchte Veedel. */
export function migrateStaffV2(old: StaffStateV2): StaffState {
  const { warnings: _, ...rest } = old;
  return { ...rest, hiding: {} };
}

// --- Reaktionen auf andere Module ---

function onArrest(ctx: Ctx, staffId: string, veedelId: string): void {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !setStatus(ctx, staffId, 'jailed')) return;
  const until = m.statusUntil ?? ctx.now;
  journal.add(
    ctx,
    `${m.name} sitzt in Haft bis ${clock.format(until)}. Kaution: ${formatEuro(bailCost(ctx.state, staffId))}.`,
    'bad',
    { staffId, veedelId },
  );
  // Angst bei den anderen im selben Veedel.
  for (const other of getStaff(ctx.state, { veedelId })) addLoyalty(ctx, other.id, LOYALTY.arrestNearby);
}

function lieLowCommand(ctx: Ctx, veedelId: string, until: number, actor: string): CommandResult {
  if (!getVeedel(veedelId)) return { ok: false, reason: 'Unbekanntes Veedel.' };
  if (!(until > ctx.now) || until - ctx.now > MAX_HIDE_DURATION) return { ok: false, reason: 'Ungültige Dauer.' };
  const pulled = lieLow(ctx, veedelId, until);
  const by =
    actor === 'player' ? '' : ` (${getStaffMember(ctx.state, actor.replace('staff:', ''))?.name ?? 'Leutnant'})`;
  journal.add(
    ctx,
    `${veedelName(veedelId)} taucht ab${by}: ${pulled === 1 ? 'eine Person' : `${pulled} Leute`} bis ${clock.formatTime(until)} von der Straße.`,
    'info',
    { veedelId },
  );
  ctx.emit('staff.wentUnderground', { veedelId, until, pulled });
  return { ok: true };
}

export default defineModule({
  id: 'staff',
  version: 3,
  dependsOn: ['spots', 'customers'],
  init: () => ({ members: [], former: [], hiding: {} }),
  tick,
  commands: {
    'staff.hireRunner': (ctx, { spotId }) => hireRunner(ctx, spotId),
    'staff.hireDriver': (ctx) => hireDriver(ctx),
    'staff.fire': (ctx, { staffId }) => fire(ctx, staffId),
    'staff.assign': (ctx, { staffId, assignment }) => assignCommand(ctx, staffId, assignment),
    'staff.setWage': (ctx, { staffId, wage }) => setWageCommand(ctx, staffId, wage),
    'staff.bail': (ctx, { staffId }, meta) => bail(ctx, staffId, meta),
    'staff.lieLow': (ctx, { veedelId, until }, meta) => lieLowCommand(ctx, veedelId, until, meta.actor),
  },
  on: {
    'clock.dayStarted': daily,
    'clock.hourStarted': hourly,
    'police.arrest': (ctx, { staffId, veedelId }) => onArrest(ctx, staffId, veedelId),
    'police.raidPlanned': (ctx, { veedelId, at }) => warnOfRaid(ctx, veedelId, at),
    'police.raid': (ctx, { veedelId }) => {
      for (const m of getStaff(ctx.state, { veedelId })) addLoyalty(ctx, m.id, LOYALTY.raid);
    },
    'sale.completed': (ctx, { sellerId, amount, revenue }) => {
      const m = sellerId ? getStaffMember(ctx.state, sellerId) : undefined;
      if (!m || m.leftAt !== null) return;
      m.record.sales += 1;
      m.record.revenue += revenue;
      addXp(ctx, m.id, XP_PER_SALE + XP_PER_SALE_UNIT * amount);
    },
    'encounter.resolved': (ctx, { request, outcome }) => {
      for (const staffId of request.staffIds ?? []) {
        if (!getStaffMember(ctx.state, staffId)) continue;
        addXp(ctx, staffId, XP_PER_ENCOUNTER);
        addLoyalty(ctx, staffId, LOYALTY.encounter + (outcome === 'failure' ? LOYALTY.encounterLost : 0));
      }
    },
  },
  migrations: { 2: migrateStaffV1, 3: migrateStaffV2 },
});
