// Hierarchie: Boss → Leutnants pro Veedel → Läufer.
// Der Spieler befördert einen Mitarbeiter (ab Level 2) zum Leutnant eines Veedels. Der Leutnant führt es
// selbstständig (siehe ai.ts): Läufer und Sicherheit verteilen, Preis-Anweisungen, Bestand halten, selbst
// verkaufen, bei Heat abtauchen. Er handelt nur über ctx.dispatch(...) mit actor 'staff:<id>', wie der Spieler.
// Leutnants haben höhere Ansprüche (Lohn); ihre Zufriedenheit wirkt auf ihre Loyalität und die ihrer Leute.
//
// Öffentliche API:
//   getLieutenant(state, veedelId), getLieutenants(state), getPost(state, veedelId),
//   lieutenantVeedel(state, staffId), canBeLieutenant(state, staffId), lieutenantSatisfaction(state, veedelId),
//   lieutenantCapacity(member), actionInterval(member), managedSpots(state, veedelId, member), postSummary,
//   DEFAULT_SETTINGS, PRICE_LEVELS, CAUTION_LEVELS, MIN_STOCK_OPTIONS, RESERVE_OPTIONS
// Befehle: 'hierarchy.appoint', 'hierarchy.dismiss', 'hierarchy.configure'
// Ereignisse: 'hierarchy.appointed', 'hierarchy.dismissed', 'hierarchy.configured'

import { type CommandResult, type Ctx, defineModule, formatEuro, type GameState, journal, messages } from '../../core';
import {
  addCareer,
  addLoyalty,
  addXp,
  assign,
  expectedWage,
  getStaff,
  getStaffMember,
  isEmployed,
  isSpecialist,
  roleName,
  setDemand,
  setWage,
  staffContact,
} from '../staff';
import { getVeedel, veedelName } from '../veedel';
import { tick } from './ai';
import {
  CAUTION_LEVELS,
  COMPLAINT_COOLDOWN,
  DEFAULT_SETTINGS,
  DEMOTION_LOYALTY,
  LIEUTENANT_DEMAND,
  LIEUTENANT_MIN_LEVEL,
  LIEUTENANT_XP_PER_SALE,
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
import type { HierarchyState, LieutenantPost, LieutenantSettings } from './types';

export { actionInterval, heatThreshold, lieutenantCapacity, managedSpots, postSummary } from './ai';
export {
  CAUTION_LEVELS,
  DEFAULT_SETTINGS,
  LIEUTENANT_MIN_LEVEL,
  MIN_STOCK_OPTIONS,
  PRICE_LEVELS,
  RESERVE_OPTIONS,
} from './config';
export type * from './types';

declare module '../../core' {
  interface ModuleStates {
    hierarchy: HierarchyState;
  }
  interface GameCommands {
    /** Mitarbeiter zum Leutnant eines Veedels befördern (oder als Leutnant dorthin versetzen). */
    'hierarchy.appoint': { staffId: string; veedelId: string };
    'hierarchy.dismiss': { veedelId: string };
    /** Delegations-Einstellungen eines Leutnants ändern. */
    'hierarchy.configure': { veedelId: string; settings: Partial<LieutenantSettings> };
  }
  interface GameEvents {
    'hierarchy.appointed': { staffId: string; veedelId: string };
    'hierarchy.dismissed': { staffId: string; veedelId: string };
    'hierarchy.configured': { staffId: string; veedelId: string };
  }
}

const NOT_EMPLOYED = 'Diese Person arbeitet nicht für dich.';

// --- Lesen ---

export function getLieutenant(state: GameState, veedelId: string): string | null {
  return state.modules.hierarchy.lieutenants[veedelId] ?? null;
}

/** Alle Leutnants als [veedelId, staffId]. */
export function getLieutenants(state: GameState): [string, string][] {
  return Object.entries(state.modules.hierarchy.lieutenants);
}

export function getPost(state: GameState, veedelId: string): LieutenantPost | undefined {
  return state.modules.hierarchy.posts[veedelId];
}

/** Veedel, das die Person als Leutnant führt, sonst null. */
export function lieutenantVeedel(state: GameState, staffId: string): string | null {
  return getLieutenants(state).find(([, id]) => id === staffId)?.[0] ?? null;
}

/** Kann die Person Leutnant werden? */
export function canBeLieutenant(state: GameState, staffId: string): CommandResult {
  const m = getStaffMember(state, staffId);
  if (!m || !isEmployed(state, staffId)) return { ok: false, reason: NOT_EMPLOYED };
  if (isSpecialist(m.role)) return { ok: false, reason: `${roleName(m.role)} führen kein Veedel.` };
  if (m.status !== 'active') return { ok: false, reason: `${m.name} ist gerade nicht einsatzbereit.` };
  if (m.level < LIEUTENANT_MIN_LEVEL) {
    return { ok: false, reason: `${m.name} braucht mindestens Level ${LIEUTENANT_MIN_LEVEL}.` };
  }
  return { ok: true };
}

/**
 * Zufriedenheit eines Leutnants (0–100): Loyalität, Lohn im Verhältnis zu seinen höheren Ansprüchen und
 * wie gut das Veedel gestern lief. Unter 35 beschwert er sich, ab 70 hält er auch seine Leute bei Laune.
 */
export function lieutenantSatisfaction(state: GameState, veedelId: string): number | null {
  const post = getPost(state, veedelId);
  const m = post ? getStaffMember(state, post.staffId) : undefined;
  if (!post || !m) return null;
  const expected = expectedWage(state, m.id);
  const ratio = expected > 0 ? m.wage / expected : 1;
  const wagePart = Math.min(1, ratio / 1.1) * 40;
  const success = Math.min(10, post.revenueYesterday / 150);
  return Math.max(0, Math.min(100, Math.round(m.stats.loyalty * 0.5 + wagePart + success)));
}

// --- Schreiben ---

function newPost(staffId: string, now: number, settings: LieutenantSettings = DEFAULT_SETTINGS): LieutenantPost {
  return {
    staffId,
    appointedAt: now,
    settings: { ...settings },
    nextActionAt: now,
    busyUntil: now,
    lyingLow: false,
    revenueToday: 0,
    revenueYesterday: 0,
    salesTotal: 0,
    revenueTotal: 0,
    complainedAt: null,
    log: [],
  };
}

function removePost(ctx: Ctx, veedelId: string): LieutenantPost | undefined {
  const h = ctx.state.modules.hierarchy;
  const post = h.posts[veedelId];
  delete h.posts[veedelId];
  delete h.lieutenants[veedelId];
  return post;
}

/** Leutnant eines Veedels abberufen. Er wird wieder normaler Mitarbeiter ohne Einsatz. */
function demote(ctx: Ctx, veedelId: string): string | null {
  const staffId = getLieutenant(ctx.state, veedelId);
  if (!staffId) return null;
  removePost(ctx, veedelId);
  const m = getStaffMember(ctx.state, staffId);
  if (m && isEmployed(ctx.state, staffId)) {
    assign(ctx, staffId, null);
    setDemand(ctx, staffId, 1);
    addLoyalty(ctx, staffId, DEMOTION_LOYALTY);
    addCareer(ctx, staffId, `Als Leutnant von ${veedelName(veedelId)} abberufen.`);
    journal.add(ctx, `${m.name} ist nicht mehr Leutnant in ${veedelName(veedelId)}.`, 'info', { veedelId, staffId });
  }
  ctx.emit('hierarchy.dismissed', { staffId, veedelId });
  return staffId;
}

function appoint(ctx: Ctx, staffId: string, veedelId: string): CommandResult {
  if (!getVeedel(veedelId)) return { ok: false, reason: 'Unbekanntes Veedel.' };
  const check = canBeLieutenant(ctx.state, staffId);
  if (!check.ok) return check;
  const m = getStaffMember(ctx.state, staffId) as NonNullable<ReturnType<typeof getStaffMember>>;
  const current = getLieutenant(ctx.state, veedelId);
  if (current === staffId) return { ok: false, reason: `${m.name} führt ${veedelName(veedelId)} schon.` };

  // Schon Leutnant woanders: wird versetzt und nimmt seine Einstellungen mit.
  const previousVeedel = lieutenantVeedel(ctx.state, staffId);
  const previous = previousVeedel ? removePost(ctx, previousVeedel) : undefined;
  if (previousVeedel) ctx.emit('hierarchy.dismissed', { staffId, veedelId: previousVeedel });
  if (current) demote(ctx, veedelId);

  const h = ctx.state.modules.hierarchy;
  h.lieutenants[veedelId] = staffId;
  h.posts[veedelId] = newPost(staffId, ctx.now, previous?.settings);
  assign(ctx, staffId, { kind: 'veedel', targetId: veedelId });
  setDemand(ctx, staffId, LIEUTENANT_DEMAND);
  if (previousVeedel) {
    addCareer(ctx, staffId, `Als Leutnant nach ${veedelName(veedelId)} versetzt.`);
    journal.add(ctx, `${m.name} führt jetzt ${veedelName(veedelId)}.`, 'info', { veedelId, staffId });
  } else {
    // Beförderung: mehr Lohn (auf den neuen Anspruch) und ein Loyalitätsschub.
    setWage(ctx, staffId, Math.max(m.wage, expectedWage(ctx.state, staffId)));
    addLoyalty(ctx, staffId, PROMOTION_LOYALTY);
    addCareer(ctx, staffId, `Zum Leutnant von ${veedelName(veedelId)} befördert.`);
    journal.add(
      ctx,
      `${m.name} ist jetzt dein Leutnant in ${veedelName(veedelId)} (${formatEuro(m.wage)} pro Tag).`,
      'good',
      { veedelId, staffId },
    );
  }
  ctx.emit('hierarchy.appointed', { staffId, veedelId });
  return { ok: true };
}

function configure(ctx: Ctx, veedelId: string, settings: Partial<LieutenantSettings>): CommandResult {
  const post = getPost(ctx.state, veedelId);
  if (!post) return { ok: false, reason: 'Dort gibt es keinen Leutnant.' };
  const next = { ...post.settings };
  if (settings.minStock !== undefined) {
    if (!Number.isInteger(settings.minStock) || settings.minStock < 0 || settings.minStock > 5000) {
      return { ok: false, reason: 'Ungültiger Mindestbestand.' };
    }
    next.minStock = settings.minStock;
  }
  if (settings.reserve !== undefined) {
    if (!(settings.reserve >= 0 && settings.reserve <= 1_000_000)) return { ok: false, reason: 'Ungültige Rücklage.' };
    next.reserve = Math.round(settings.reserve);
  }
  if (settings.priceLevel !== undefined) {
    if (!(settings.priceLevel in PRICE_LEVELS)) return { ok: false, reason: 'Unbekanntes Preisniveau.' };
    next.priceLevel = settings.priceLevel;
  }
  if (settings.caution !== undefined) {
    if (!(settings.caution in CAUTION_LEVELS)) return { ok: false, reason: 'Unbekannte Vorsicht.' };
    next.caution = settings.caution;
  }
  if (settings.mayHire !== undefined) next.mayHire = !!settings.mayHire;
  if (settings.mayOrder !== undefined) next.mayOrder = !!settings.mayOrder;
  post.settings = next;
  // Neue Anweisungen setzt er gleich in der nächsten Runde um.
  post.nextActionAt = Math.min(post.nextActionAt, ctx.now + 1);
  post.log.unshift({ time: ctx.now, text: 'Neue Anweisungen vom Boss.' });
  ctx.emit('hierarchy.configured', { staffId: post.staffId, veedelId });
  return { ok: true };
}

/** Um Mitternacht: Zufriedenheit auswerten, Beschwerden, Umsatz-Zähler weiterschieben. */
function daily(ctx: Ctx): void {
  const h = ctx.state.modules.hierarchy;
  for (const veedelId of Object.keys(h.posts).sort()) {
    const post = h.posts[veedelId];
    const m = getStaffMember(ctx.state, post.staffId);
    if (!m || !isEmployed(ctx.state, m.id)) {
      removePost(ctx, veedelId);
      continue;
    }
    syncLieutenant(ctx, veedelId, post);
    post.revenueYesterday = post.revenueToday;
    post.revenueToday = 0;
    const satisfaction = lieutenantSatisfaction(ctx.state, veedelId) ?? 50;
    if (satisfaction < SATISFACTION_LOW) {
      addLoyalty(ctx, m.id, SATISFACTION_LOYALTY_LOW);
      if (post.complainedAt === null || ctx.now - post.complainedAt >= COMPLAINT_COOLDOWN) {
        post.complainedAt = ctx.now;
        complain(ctx, veedelId, post);
      }
    } else if (satisfaction >= SATISFACTION_HIGH) {
      addLoyalty(ctx, m.id, SATISFACTION_LOYALTY_HIGH);
      // Ein guter Leutnant hält seine Leute bei Laune.
      if (m.stats.charisma >= 55) {
        for (const other of getStaff(ctx.state, { veedelId })) {
          if (other.id !== m.id) addLoyalty(ctx, other.id, TEAM_LOYALTY);
        }
      }
    }
  }
}

function complain(ctx: Ctx, veedelId: string, post: LieutenantPost): void {
  const m = getStaffMember(ctx.state, post.staffId);
  if (!m) return;
  const raise = Math.ceil(Math.max(expectedWage(ctx.state, m.id), m.wage * 1.2) / 10) * 10;
  messages.send(ctx, {
    contact: staffContact(m),
    text: `Chef, ich halte ${veedelName(veedelId)} für dich zusammen und krieg ${formatEuro(m.wage)} am Tag. Das reicht so nicht.`,
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

/** Hält Einsatz und Anspruch des Leutnants passend (z.B. nach dem Laden alter Spielstände). */
function syncLieutenant(ctx: Ctx, veedelId: string, post: LieutenantPost): void {
  const m = getStaffMember(ctx.state, post.staffId);
  if (!m) return;
  const target = m.status === 'active' ? m.assignment : m.returnTo;
  if (target?.kind !== 'veedel' || target.targetId !== veedelId) {
    assign(ctx, m.id, { kind: 'veedel', targetId: veedelId });
  }
  if (m.demand !== LIEUTENANT_DEMAND) setDemand(ctx, m.id, LIEUTENANT_DEMAND);
}

// --- Migration vom Fundament (Version 1) ---

interface HierarchyStateV1 {
  lieutenants: Record<string, string>;
}

export function migrateHierarchyV1(old: HierarchyStateV1, state: GameState): HierarchyState {
  const posts: Record<string, LieutenantPost> = {};
  for (const [veedelId, staffId] of Object.entries(old.lieutenants)) posts[veedelId] = newPost(staffId, state.time);
  return { lieutenants: { ...old.lieutenants }, posts };
}

export default defineModule({
  id: 'hierarchy',
  version: 2,
  dependsOn: ['staff'],
  init: () => ({ lieutenants: {}, posts: {} }),
  tick,
  tickEvery: TICK_EVERY,
  commands: {
    'hierarchy.appoint': (ctx, { staffId, veedelId }) => appoint(ctx, staffId, veedelId),
    'hierarchy.dismiss': (ctx, { veedelId }) =>
      demote(ctx, veedelId) ? { ok: true } : { ok: false, reason: 'Dort gibt es keinen Leutnant.' },
    'hierarchy.configure': (ctx, { veedelId, settings }) => configure(ctx, veedelId, settings),
  },
  on: {
    'clock.dayStarted': daily,
    // Wer geht, ist auch kein Leutnant mehr.
    'staff.left': (ctx, { staffId }) => {
      for (const [veedelId, id] of getLieutenants(ctx.state)) {
        if (id !== staffId) continue;
        removePost(ctx, veedelId);
        journal.add(ctx, `${veedelName(veedelId)} hat keinen Leutnant mehr.`, 'bad', { veedelId });
        ctx.emit('hierarchy.dismissed', { staffId, veedelId });
      }
    },
    'staff.statusChanged': (ctx, { staffId, to }) => {
      const veedelId = lieutenantVeedel(ctx.state, staffId);
      const post = veedelId ? getPost(ctx.state, veedelId) : undefined;
      if (!post) return;
      const text =
        to === 'jailed'
          ? 'Sitzt in Haft. Das Veedel läuft ohne ihn.'
          : to === 'injured'
            ? 'Ist verletzt und fällt aus.'
            : to === 'active'
              ? 'Ist zurück und übernimmt wieder.'
              : '';
      if (text) post.log.unshift({ time: ctx.now, text });
      if (to === 'active') post.nextActionAt = ctx.now;
    },
    // Umsatz im Veedel zählen, Erfahrung für den Leutnant und Ausbildung seiner Leute.
    'sale.completed': (ctx, { veedelId, revenue, sellerId }) => {
      const post = getPost(ctx.state, veedelId);
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
  migrations: { 2: migrateHierarchyV1 },
});
