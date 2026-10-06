// Personal: Mitarbeiter mit Namen, Alter, Hintergrund, Werten, Level, Loyalität und Laufbahn.
// Typen: Läufer, Fahrer, Sicherheit und Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt). Kuriere gibt es seit
// Auftrag 28 nicht mehr: Lieferungen fährt allein die Rechte Hand (hierarchy, Einsatz 'delivery' über assign).
// Läufer bedienen Kunden an Spots über denselben Befehl wie der Spieler, Fahrer holt sich die Logistik
// (findAvailable + assign; Abholung am Hafen, Umlagern), Sicherheit steht an Spots und Lagern, Spezialisten geben Boni (bonus()).
// Arbeit bringt Erfahrung, Level-Aufstiege heben die Werte. Loyalität hängt an Lohn, Gefahr, Haft und
// Beförderung; wer kaum noch loyal ist, verrät dich manchmal (mild). Festnahmen bringen Haft, Kaution holt raus.
//
// Öffentliche API (lesen):
//   getStaff(state, filter), getStaffMember(state, id), isEmployed, getStats(state, id),
//   runnerAt(state, spotId) (egal welcher Status), activeRunnerAt(state, spotId) (arbeitet gerade dort), securityAt(state, { spotId | warehouseId }), findAvailable(state, { role }), staffVeedel(state, member),
//   expectedWage(state, id), expectedWageFor(role, level, demand), dailyWages(state), serveTime(member),
//   effectiveWage(member) (in Haft nur Stillhaltegeld, verletzt halber Lohn), payrollDue(state) (heute Nacht fällig),
//   talkChance(member) (redet beim Entlassen?), isAbsent(member), wageCategory(member) (Kategorie in der Kasse),
//   speedFactor, riskFactor, combatValue, defenseStrength(state, { spotId | warehouseId | veedelId }),
//   bonus(state, key), bonusProvider, bailCost, jailDuration, levelProgress, betrayalChance,
//   isSpecialist, isStatKnown, roleName, assignmentLabel, staffContact, ROLE_INFO, STAT_NAMES, STATUS_NAMES, STAT_KEYS
// Öffentliche API (schreiben, mit ctx):
//   assign(ctx, id, assignment), setStatus(ctx, id, status, until?), addXp, addLoyalty, setWage, setDemand,
//   addCareer, revealStat, enlist(ctx, profile, options), generateProfile(ctx, role, options), randomName(ctx)
//   isLyingLow(state, veedelId), lieLow(ctx, veedelId, until)
// Auftrag 34 (Leute mit Geschichte): Eigenschaften (traits, TRAITS in config.ts) mit kleinen Faktoren (traitFactor,
//   hasTrait, traitName, rollTraits fest aus einem Schlüssel), Beziehungen (relationsOf, relationBetween, relationLabel,
//   RELATIONS: Wirkung beim Entlassen, in Haft, am selben Spot), Geschichten (stories.ts: STORIES, openStories,
//   storyChoices, startStory) mit Antwort 'staff.storyChoice' und Ereignissen 'staff.story', 'staff.storyResolved'.
// Befehle: 'staff.hireRunner', 'staff.hireDriver', 'staff.fire', 'staff.assign', 'staff.setWage', 'staff.bail', 'staff.lieLow',
//   (Leute bleiben in der Stadt, in der du sie angeheuert hast; 'staff.relocate' gibt es seit dem 05.10.2026 nicht mehr),
//   'staff.setJailSupport' (Stillhaltegeld), 'staff.replace' (Ausfall am Spot ersetzen, optional entlassen)
// Nach einer Festnahme fragt der Leutnant (sonst die Person selbst) still per Handy: Kaution, Ersetzen, Entlassen, Abwarten.
// Ereignisse: 'staff.hired', 'staff.left', 'staff.statusChanged', 'staff.assigned', 'staff.levelUp',
//   'staff.bailed', 'staff.betrayed', 'staff.raidWarning', 'staff.wentUnderground'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  type MessageOption,
  messages,
  texts,
  withPeriod,
} from '../../core';
import { absenceHandled, teamLeadOf } from '../hierarchy';
import { PLAYER_FACTION } from '../territory';
import { getVeedel, veedelName } from '../veedel';
import {
  assignCommand,
  bail,
  fire,
  hireDriver,
  hireRunner,
  replaceAbsent,
  setJailSupport,
  setWageCommand,
} from './commands';
import {
  CAREER_LIMIT,
  DEFAULT_STATS,
  INJURY_DURATION,
  JAIL_DURATION,
  LOYALTY,
  MAX_HIDE_DURATION,
  RELATIONS,
  XP_PER_ENCOUNTER,
  XP_PER_SALE,
  XP_PER_SALE_UNIT,
  XP_SALE_UNITS_MAX,
} from './config';
import {
  addLoyalty,
  addXp,
  bailCost,
  getStaff,
  getStaffMember,
  removeMember,
  setStatus,
  staffContact,
} from './members';
import { STAT_KEYS } from './profile';
import { daily, hourly, lieLow, tick, warnOfRaid } from './routines';
import { chooseStory, dropStoriesOf, expireStory, maybeStartStory } from './stories';
import { STAFF_TEXTS } from './texts';
import { relationsOf, rollTraits, traitFactor } from './traits';
import type {
  BetrayalKind,
  StaffAssignment,
  StaffLeaveReason,
  StaffMember,
  StaffRole,
  StaffState,
  StaffStats,
  StaffStatus,
  StoryId,
} from './types';

export {
  DEFAULT_STATS,
  DRIVER_HIRE_COST,
  INJURED_WAGE_FACTOR,
  JAIL_WAGE_FACTOR,
  MAX_LEVEL,
  RELATIONS,
  type RelationInfo,
  ROLE_INFO,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  RUNNER_HIRE_COST_MAX,
  RUNNER_HIRE_COST_MIN,
  STAT_NAMES,
  STATUS_NAMES,
  TRAITS,
  type TraitInfo,
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
export {
  openStories,
  STORIES,
  type StoryChoice,
  type StoryEffect,
  type StoryTemplate,
  startStory,
  storyChoices,
} from './stories';
export {
  hasTrait,
  keyedRandom,
  RELATION_KINDS,
  relationBetween,
  relationLabel,
  relationsOf,
  rollTraits,
  TRAIT_IDS,
  traitFactor,
  traitName,
  traitsOf,
} from './traits';
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
    /** Stillhaltegeld in Haft an- oder abstellen (ohne kostet die Person nichts, redet aber eher). */
    'staff.setJailSupport': { staffId: string; enabled: boolean };
    /** Ausfall (Haft, verletzt) am Spot ersetzen; mit fire die Person gleich entlassen. */
    'staff.replace': { staffId: string; fire?: boolean };
    /** Alle Leute an den Spots eines Veedels bis until von der Straße holen (z.B. nach einer Razzia-Warnung). */
    'staff.lieLow': { veedelId: string; until: number };
    /** Antwort auf eine Geschichte (Auftrag 34; kommt aus der Handy-Antwort). */
    'staff.storyChoice': { storyId: string; choice: string };
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
    /** Jemand ist in einer anderen Stadt angekommen (nur noch Leute, die in einem alten Spielstand unterwegs waren). */
    'staff.relocated': { staffId: string; from: string; to: string };
    /** Eine Geschichte hat angefangen (Auftrag 34). */
    'staff.story': { storyId: string; story: StoryId; staffId: string; otherId: string | null };
    /** Auf eine Geschichte wurde geantwortet (oder die Frist ist abgelaufen). */
    'staff.storyResolved': { storyId: string; story: StoryId; staffId: string; choice: string };
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

function upgradeMember(m: StaffMemberV1, state: GameState): StaffMemberV3 {
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

/** Person bis Version 5 (ohne Stadt). */
type StaffMemberV5 = Omit<StaffMember, 'cityId' | 'traits'>;
type StaffStateV5 = Omit<StaffState, 'members' | 'former' | 'relations' | 'stories'> & {
  members: StaffMemberV5[];
  former: StaffMemberV5[];
};
type StaffMemberV3 = Omit<StaffMemberV5, 'jailSupport'>;
type StaffStateV3 = Omit<StaffState, 'members' | 'former' | 'relations' | 'stories'> & {
  members: StaffMemberV3[];
  former: StaffMemberV3[];
};
type StaffStateV2 = Omit<StaffStateV3, 'hiding'> & { warnings: Record<string, number> };

export function migrateStaffV1(old: StaffStateV1, state: GameState): StaffStateV2 {
  const members = old.members.map((m) => upgradeMember(m, state));
  return {
    members: members.filter((m) => m.leftAt === null),
    former: members.filter((m) => m.leftAt !== null),
    warnings: {},
  };
}

/** Version 2 → 3: Die Übergangs-Warnungen fallen weg, dafür gibt es abgetauchte Veedel. */
export function migrateStaffV2(old: StaffStateV2): StaffStateV3 {
  const { warnings: _, ...rest } = old;
  return { ...rest, hiding: {} };
}

/** Version 3 → 4: Stillhaltegeld in Haft (Standard: ja; gezahlt wird jetzt nur noch ein Anteil vom Lohn). */
export function migrateStaffV3(old: StaffStateV3): StaffStateV5 {
  return {
    ...old,
    members: old.members.map((m) => ({ ...m, jailSupport: true })),
    former: old.former.map((m) => ({ ...m, jailSupport: true })),
  };
}

/**
 * Version 4 → 5 (Auftrag 28): Kuriere fallen als Rolle weg, nur die Rechte Hand fährt Aufträge aus. Bestehende
 * Kuriere werden Läufer ohne Einsatz; wer gerade eine Lieferung fährt, fährt sie noch zu Ende.
 */
export function migrateStaffV4(old: StaffStateV5, state: GameState): StaffStateV5 {
  const convert = (m: StaffMemberV5): StaffMemberV5 => {
    if (m.role !== 'courier') return m;
    const onDelivery = m.assignment?.kind === 'delivery';
    return {
      ...m,
      role: 'runner',
      assignment: onDelivery ? m.assignment : null,
      returnTo: m.returnTo?.kind === 'delivery' ? null : m.returnTo,
      career: [
        ...m.career,
        { time: state.time, text: 'Vom Kurier zum Läufer: Aufträge fährt jetzt die Rechte Hand.' },
      ].slice(-CAREER_LIMIT),
    };
  };
  return { ...old, members: old.members.map(convert), former: old.former.map(convert) };
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
  // Angst bei den anderen im selben Veedel (Angsthasen trifft es doppelt, Auftrag 34).
  for (const other of getStaff(ctx.state, { veedelId })) {
    addLoyalty(ctx, other.id, Math.round(LOYALTY.arrestNearby * traitFactor(other, 'fear')));
  }
  // Beziehungen: Geschwister und ein Paar leiden mit, Rivalen nicht.
  for (const { other, kind } of relationsOf(ctx.state, staffId)) addLoyalty(ctx, other.id, RELATIONS[kind].jailed);
  askAboutArrest(ctx, m);
}

/**
 * Nach einer Festnahme fragt der Leutnant (sonst die Person selbst über den Anwalt) still per Handy, was passieren
 * soll: Kaution, Ersetzen, Entlassen und ersetzen oder Abwarten. Regelt der Leutnant Ausfälle selbst, meldet er nur.
 */
function askAboutArrest(ctx: Ctx, m: StaffMember): void {
  const until = m.statusUntil ?? ctx.now;
  const leadId = teamLeadOf(ctx.state, m.id);
  const lead = leadId && leadId !== m.id ? getStaffMember(ctx.state, leadId) : undefined;
  if (absenceHandled(ctx.state, m.id)) return;
  const cost = bailCost(ctx.state, m.id);
  const atSpot = m.returnTo?.kind === 'spot' && (m.role === 'runner' || m.role === 'security');
  const options: MessageOption[] = [];
  if (atSpot) {
    options.push({
      id: 'replace',
      label: 'Ersetzen',
      command: { type: 'staff.replace', payload: { staffId: m.id } },
      reply: 'Stell jemand anderen hin. Wenn er rauskommt, sehen wir weiter.',
    });
  }
  if (ctx.state.wallet.dirty >= cost) {
    options.push({
      id: 'bail',
      label: `Kaution (${formatEuro(cost)})`,
      command: { type: 'staff.bail', payload: { staffId: m.id } },
      reply: 'Zahl die Kaution, hol ihn raus.',
    });
  }
  options.push({
    id: 'fireReplace',
    label: atSpot ? 'Entlassen und ersetzen' : 'Entlassen',
    command: atSpot
      ? { type: 'staff.replace', payload: { staffId: m.id, fire: true } }
      : { type: 'staff.fire', payload: { staffId: m.id } },
    reply: 'Der ist raus.',
  });
  options.push({ id: 'wait', label: 'Abwarten', reply: 'Wir warten, bis er rauskommt.' });
  const day = clock.day(until);
  messages.send(ctx, {
    contact: staffContact(lead ?? m),
    text: lead
      ? `${m.name} sitzt bis Tag ${day}. Kostet jetzt nur Stillhaltegeld. Was machen wir?`
      : `Ich ruf über den Anwalt an: Die halten mich bis Tag ${day} fest. Was machen wir?`,
    options,
    expiresIn: Math.max(60, until - ctx.now),
    silent: true,
  });
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

/**
 * Jemand ist gegangen (Auftrag 34): Wer mit der Person befreundet, verwandt oder zusammen war, nimmt es übel. Nach
 * einer Entlassung geht manchmal jemand mit; Rivalen freuen sich.
 */
function onLeft(ctx: Ctx, staffId: string, reason: StaffLeaveReason): void {
  dropStoriesOf(ctx, staffId);
  const gone = getStaffMember(ctx.state, staffId);
  if (!gone) return;
  for (const r of ctx.state.modules.staff.relations ?? []) {
    if (r.a !== staffId && r.b !== staffId) continue;
    const other = ctx.state.modules.staff.members.find((m) => m.id === (r.a === staffId ? r.b : r.a));
    if (!other) continue;
    const info = RELATIONS[r.kind];
    if (reason === 'dead') addLoyalty(ctx, other.id, info.died);
    else if (reason === 'fired') addLoyalty(ctx, other.id, info.fired);
    if (reason === 'fired' && info.leaveWith > 0 && other.leftAt === null && ctx.chance(info.leaveWith)) {
      messages.send(ctx, {
        contact: staffContact(other),
        text: texts.pick(ctx, 'staff:leaveWith', STAFF_TEXTS.leaveWith, { other: gone.name.split(' ')[0] }),
        silent: true,
      });
      journal.add(ctx, withPeriod(`${other.name} geht mit ${gone.name}`), 'bad', { staffId: other.id });
      removeMember(ctx, other.id, 'quit');
    }
  }
}

/** Person bis Version 6 (ohne Eigenschaften). */
type StaffMemberV6 = Omit<StaffMember, 'traits'>;
type StaffStateV6 = Omit<StaffState, 'members' | 'former' | 'relations' | 'stories'> & {
  members: StaffMemberV6[];
  former: StaffMemberV6[];
};

/**
 * Version 6 → 7 (Auftrag 34): Eigenschaften fest aus der ID (gleicher Stand = gleiche Eigenschaften), noch keine
 * Beziehungen und Geschichten. Der erwartete Lohn bleibt, wie er war (Anspruch geteilt durch den Lohnfaktor).
 */
export function migrateStaffV6(old: StaffStateV6, state: GameState): StaffState {
  // Der Lohnwunsch der neuen Eigenschaften wird über den Anspruch ausgeglichen: Alte Stände bleiben ruhig, niemand ist
  // nach dem Laden plötzlich unterbezahlt und verliert jeden Tag Loyalität.
  const withTraits = (m: StaffMemberV6): StaffMember => {
    const traits = rollTraits(`${state.meta.seed}:${m.id}`);
    const demand = Math.round((m.demand / traitFactor({ traits }, 'wage')) * 1000) / 1000;
    return { ...m, traits, demand };
  };
  return {
    ...old,
    members: old.members.map(withTraits),
    former: old.former.map(withTraits),
    relations: [],
    stories: { open: [], lastAt: {}, byPerson: {}, byStory: {}, count: 0 },
  };
}

export default defineModule({
  id: 'staff',
  version: 7,
  dependsOn: ['spots', 'customers'],
  init: () => ({
    members: [],
    former: [],
    hiding: {},
    relations: [],
    stories: { open: [], lastAt: {}, byPerson: {}, byStory: {}, count: 0 },
  }),
  tick,
  commands: {
    'staff.hireRunner': (ctx, { spotId }) => hireRunner(ctx, spotId),
    'staff.hireDriver': (ctx) => hireDriver(ctx),
    'staff.fire': (ctx, { staffId }, meta) => fire(ctx, staffId, meta),
    'staff.setJailSupport': (ctx, { staffId, enabled }) => setJailSupport(ctx, staffId, !!enabled),
    'staff.replace': (ctx, { staffId, fire: fireToo }, meta) => replaceAbsent(ctx, staffId, !!fireToo, meta),
    'staff.assign': (ctx, { staffId, assignment }) => assignCommand(ctx, staffId, assignment),
    'staff.setWage': (ctx, { staffId, wage }) => setWageCommand(ctx, staffId, wage),
    'staff.bail': (ctx, { staffId }, meta) => bail(ctx, staffId, meta),
    'staff.lieLow': (ctx, { veedelId, until }, meta) => lieLowCommand(ctx, veedelId, until, meta.actor),
    'staff.storyChoice': (ctx, { storyId, choice }) => chooseStory(ctx, storyId, choice),
  },
  on: {
    'clock.dayStarted': daily,
    'clock.hourStarted': (ctx) => {
      hourly(ctx);
      maybeStartStory(ctx);
    },
    'message.expired': (ctx, { messageId, source }) => {
      if (source === 'staff') expireStory(ctx, messageId);
    },
    'staff.left': (ctx, { staffId, reason }) => onLeft(ctx, staffId, reason),
    'police.arrest': (ctx, { staffId, veedelId }) => onArrest(ctx, staffId, veedelId),
    'police.raidPlanned': (ctx, { veedelId, at, scope }) => warnOfRaid(ctx, veedelId, at, scope === 'major'),
    'police.raid': (ctx, { veedelId, veedelIds, target }) => {
      // Nur eine Razzia gegen dich verunsichert deine Leute (eine gegen eine Gang nicht). Die Großrazzia trifft
      // mehrere Veedel.
      if (target !== PLAYER_FACTION) return;
      for (const id of veedelIds && veedelIds.length > 0 ? veedelIds : [veedelId]) {
        for (const m of getStaff(ctx.state, { veedelId: id })) {
          addLoyalty(ctx, m.id, Math.round(LOYALTY.raid * traitFactor(m, 'fear')));
        }
      }
    },
    'sale.completed': (ctx, { sellerId, amount, revenue }) => {
      const m = sellerId ? getStaffMember(ctx.state, sellerId) : undefined;
      if (!m || m.leftAt !== null) return;
      m.record.sales += 1;
      m.record.revenue += revenue;
      addXp(ctx, m.id, XP_PER_SALE + XP_PER_SALE_UNIT * Math.min(amount, XP_SALE_UNITS_MAX));
    },
    'encounter.resolved': (ctx, { request, outcome }) => {
      for (const staffId of request.staffIds ?? []) {
        if (!getStaffMember(ctx.state, staffId)) continue;
        addXp(ctx, staffId, XP_PER_ENCOUNTER);
        addLoyalty(ctx, staffId, LOYALTY.encounter + (outcome === 'failure' ? LOYALTY.encounterLost : 0));
      }
    },
  },
  migrations: {
    2: migrateStaffV1,
    3: migrateStaffV2,
    4: migrateStaffV3,
    5: migrateStaffV4,
    // Version 6 (Auftrag 30): Jede Person ist in einer Stadt; bis dahin waren alle in Köln.
    6: (old: StaffStateV5): StaffStateV6 => {
      const inKoeln = (m: StaffMemberV5): StaffMemberV6 => ({ ...m, cityId: 'koeln' });
      return { ...old, members: old.members.map(inKoeln), former: old.former.map(inKoeln) };
    },
    7: migrateStaffV6,
  },
});
