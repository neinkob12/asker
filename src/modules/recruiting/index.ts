// Rekrutierung: Bewerber-Pool und Kontakte.
// In regelmäßigen Abständen kommen neue Bewerber mit unterschiedlichen Werten. Seltener tauchen Kontakte auf:
// Empfehlungen von loyalen Mitarbeitern, Kumpels von Stammkunden, Leute aus dem Milieu oder aus dem Knast.
// Kontakte sind oft besser. Vor der Einstellung sieht man nur einen Teil der Werte, der Rest zeigt sich
// mit der Zeit (siehe staff: knownStats, revealStat).
//
// Öffentliche API:
//   getCandidates(state, cityId?), getCandidate(state, id), getPool(state, cityId?), getContacts(state, cityId?),
//   searchReadyAt(state),
//   poolMax(state), searchPreview(state, role?), SOURCE_NAMES, SEARCH_COST, SEARCH_ROLES
// Befehle: 'recruiting.hire', 'recruiting.decline', 'recruiting.search' (mit role: gezielt nach einer Rolle)
// Ereignisse: 'recruiting.candidateArrived', 'recruiting.hired', 'recruiting.candidateLeft'

import {
  type CommandMeta,
  type CommandResult,
  type Contact,
  type Ctx,
  clock,
  defineModule,
  fillText,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
  withPeriod,
} from '../../core';
import { activeCity, cityName, isBusinessSold } from '../city';
import { getRegular } from '../customers';
import { getReputation } from '../reputation';
import { atSpot, getSpot } from '../spots';
import {
  addLoyalty,
  DEFAULT_STATS,
  enlist,
  generateProfile,
  getStaff,
  getStaffMember,
  isEmployed,
  isFarmRole,
  type RecruitProfile,
  ROLE_INFO,
  roleName,
  rollTraits,
  STAT_KEYS,
  type StaffAssignment,
  type StaffRole,
  type StaffStats,
  type StatKey,
  staffContact,
  type TraitId,
} from '../staff';
import { controlledBy, PLAYER_FACTION } from '../territory';
import {
  CANDIDATE_LIFETIME,
  CONTACT_HIRE_COST_DAYS,
  CONTACT_LEVEL,
  CONTACT_LIFETIME,
  CONTACT_MAX,
  CONTACT_QUALITY,
  EVENT_CHANCE,
  EVENT_INTROS,
  EVENT_ROLE_WEIGHTS,
  HIRE_COST_DAYS,
  JAIL_CONTACT_CHANCE,
  POOL_ARRIVALS,
  POOL_INTERVAL,
  POOL_LEVEL_2_CHANCE,
  POOL_MAX,
  POOL_MAX_LIMIT,
  POOL_MAX_PER_VEEDEL,
  POOL_MAX_REPUTATION,
  POOL_MAX_REPUTATION_BONUS,
  POOL_ROLE_WEIGHTS,
  POOL_START,
  REFERRAL_CHANCE,
  REFERRAL_MIN_LOYALTY,
  REGULAR_CHANCE_PER_SALE,
  SEARCH_COOLDOWN,
  SEARCH_COST,
  SEARCH_COUNT,
  SEARCH_ROLE_SHARE,
  SEARCH_ROLES,
  type SearchRole,
  VISIBLE_STATS,
} from './config';

export { SEARCH_COST, SEARCH_COUNT, SEARCH_ROLES, type SearchRole, SOURCE_NAMES } from './config';

/** Woher ein Kandidat kommt: Pool (Bewerbung) oder Kontakt (Empfehlung, Stammkunde, Ereignis). */
export type CandidateSource = 'pool' | 'referral' | 'regular' | 'event';

export interface Candidate {
  id: string;
  name: string;
  role: StaffRole;
  /** Vor der Einstellung sichtbare Werte (nur ein Teil). */
  visibleStats: Partial<StaffStats>;
  /** Verlangter Tageslohn. */
  wage: number;
  /** Bis dahin ist der Kandidat verfügbar (Spielminute). */
  expiresAt: number;
  age: number;
  background: string;
  level: number;
  portrait: string | null;
  source: CandidateSource;
  /** Wie der Kontakt zustande kam, z.B. "Empfohlen von Kevin K.". */
  note: string;
  /** Handgeld bei der Einstellung. */
  hireCost: number;
  /** Alle Werte. Die Oberfläche zeigt davon nur visibleStats. */
  stats: StaffStats;
  arrivedAt: number;
  /** Wer ihn empfohlen hat (Mitarbeiter-ID). */
  referrerId: string | null;
  /** Eigenschaften (Auftrag 34), sichtbar schon vor der Einstellung. */
  traits: TraitId[];
  /**
   * Stadt, in der die Person Arbeit sucht (Auftrag 43). Jede Stadt hat ihre eigenen Bewerber, mit Lohn und Handgeld von
   * dort; eingestellt wird nur, wer in der Stadt ist, in der du bist.
   */
  cityId: string;
}

export interface RecruitingState {
  /** Bewerber und Kontakte, älteste zuerst. */
  candidates: Candidate[];
  /** Nächste Bewerber kommen um (Spielminute). */
  nextPoolAt: number;
  /** Ab dann kann wieder rumgefragt werden. */
  searchReadyAt: number;
}

declare module '../../core' {
  interface ModuleStates {
    recruiting: RecruitingState;
  }
  interface GameCommands {
    /** Kandidaten einstellen (Handgeld zahlen). Optional direkt einsetzen. */
    'recruiting.hire': { candidateId: string; assignment?: StaffAssignment | null };
    'recruiting.decline': { candidateId: string };
    /** Rumfragen: kostet Geld, bringt sofort neue Bewerber; mit role meist welche in dieser Rolle. */
    'recruiting.search': { role?: SearchRole };
  }
  interface GameEvents {
    'recruiting.candidateArrived': { candidateId: string; source: CandidateSource };
    'recruiting.hired': { candidateId: string; staffId: string };
    /** Ein Bewerber oder Kontakt ist abgelaufen (still, nur eine Notiz im Verlauf). */
    'recruiting.candidateLeft': { candidateId: string; name: string; role: StaffRole; source: CandidateSource };
  }
}

// --- Lesen ---

/** Stadt eines Kandidaten (alte Stände ohne Angabe: Köln). */
function candidateCity(c: Candidate): string {
  return c.cityId ?? 'koeln';
}

/** Kandidaten einer Stadt (ohne Angabe die aktive): Bewerber aus dem Pool und Kontakte. */
export function getCandidates(state: GameState, cityId = activeCity(state)): readonly Candidate[] {
  return state.modules.recruiting.candidates.filter((c) => candidateCity(c) === cityId);
}

export function getCandidate(state: GameState, id: string): Candidate | undefined {
  return state.modules.recruiting.candidates.find((c) => c.id === id);
}

/** Bewerber aus dem Pool einer Stadt (ohne Angabe die aktive, noch verfügbar). */
export function getPool(state: GameState, cityId = activeCity(state)): Candidate[] {
  return getCandidates(state, cityId).filter((c) => c.source === 'pool' && c.expiresAt > state.time);
}

/** Kontakte einer Stadt (ohne Angabe die aktive): Empfehlungen, Stammkunden, Ereignisse (noch verfügbar). */
export function getContacts(state: GameState, cityId = activeCity(state)): Candidate[] {
  return getCandidates(state, cityId).filter((c) => c.source !== 'pool' && c.expiresAt > state.time);
}

export function searchReadyAt(state: GameState): number {
  return state.modules.recruiting.searchReadyAt;
}

/** Wie viele Bewerber gleichzeitig warten: mehr mit eigenen Veedeln und gutem Ruf. */
export function poolMax(state: GameState): number {
  const veedel = state.modules.territory ? controlledBy(state, PLAYER_FACTION).length : 0;
  const reputation = state.modules.reputation ? getReputation(state) : 0;
  const bonus = reputation >= POOL_MAX_REPUTATION ? POOL_MAX_REPUTATION_BONUS : 0;
  return Math.min(POOL_MAX_LIMIT, POOL_MAX + veedel * POOL_MAX_PER_VEEDEL + bonus);
}

/** Was Rumfragen kostet und bringt (für die Oberfläche, bevor man es tut). */
export function searchPreview(
  state: GameState,
  role?: SearchRole,
): { cost: number; count: number; readyAt: number; waiting: boolean; roleLabel: string } {
  const readyAt = searchReadyAt(state);
  const roleLabel = role ? (ROLE_INFO[role].plural ?? roleName(role)) : 'gemischt, meist Läufer';
  return { cost: SEARCH_COST, count: SEARCH_COUNT, readyAt, waiting: readyAt > state.time, roleLabel };
}

// --- Kandidaten erzeugen ---

function pickWeighted<K extends string>(ctx: Ctx, weights: Record<K, number>): K {
  // Ohne Gewicht nie (Auftrag 42: Arbeiter und Gärtner; sonst landete der Rückfall am Ende auf ihnen).
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  let roll = ctx.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Welche Werte man vorher sieht: ein wichtiger Wert des Typs, dann zufällige. Loyalität nur bei Empfehlungen. */
function pickVisible(ctx: Ctx, role: StaffRole, source: CandidateSource): StatKey[] {
  const chosen: StatKey[] = source === 'referral' ? ['loyalty'] : [];
  chosen.push(ctx.pick(ROLE_INFO[role].keyStats.filter((k) => k !== 'loyalty')));
  while (chosen.length < VISIBLE_STATS[source]) {
    const rest = STAT_KEYS.filter((k) => k !== 'loyalty' && !chosen.includes(k));
    if (rest.length === 0) break;
    chosen.push(ctx.pick(rest));
  }
  return STAT_KEYS.filter((k) => chosen.includes(k));
}

interface CandidateOptions {
  quality?: number;
  level?: number;
  note: string;
  referrerId?: string | null;
}

function addCandidate(ctx: Ctx, role: StaffRole, source: CandidateSource, options: CandidateOptions): Candidate {
  const profile = generateProfile(ctx, role, { quality: options.quality ?? 0, level: options.level ?? 1 });
  const visible = pickVisible(ctx, role, source);
  const days = source === 'pool' ? HIRE_COST_DAYS : CONTACT_HIRE_COST_DAYS;
  const lifetime = source === 'pool' ? CANDIDATE_LIFETIME : CONTACT_LIFETIME;
  const candidate: Candidate = {
    id: `c${ctx.nextId()}`,
    name: profile.name,
    role,
    visibleStats: Object.fromEntries(visible.map((k) => [k, profile.stats[k]])),
    wage: profile.wage,
    expiresAt: ctx.now + ctx.randomInt(lifetime[0], lifetime[1]),
    age: profile.age,
    background: profile.background,
    level: profile.level,
    portrait: profile.portrait,
    source,
    note: options.note,
    hireCost: Math.round((profile.wage * days) / 10) * 10,
    stats: profile.stats,
    arrivedAt: ctx.now,
    referrerId: options.referrerId ?? null,
    traits: profile.traits ? [...profile.traits] : [],
    cityId: activeCity(ctx.state),
  };
  ctx.state.modules.recruiting.candidates.push(candidate);
  ctx.emit('recruiting.candidateArrived', { candidateId: candidate.id, source });
  return candidate;
}

function addPoolCandidate(ctx: Ctx, wanted?: SearchRole): Candidate {
  const role = wanted && ctx.chance(SEARCH_ROLE_SHARE) ? wanted : pickWeighted(ctx, POOL_ROLE_WEIGHTS);
  const level = ctx.chance(POOL_LEVEL_2_CHANCE) ? 2 : 1;
  const note = wanted ? `Hat gehört, dass du ${roleName(wanted)} suchst.` : 'Hat sich auf deinen Aushang gemeldet.';
  return addCandidate(ctx, role, 'pool', { level, note });
}

/** Kontakte sind besser als der Durchschnitt und haben schon Erfahrung. */
function addContact(
  ctx: Ctx,
  role: StaffRole,
  source: CandidateSource,
  note: string,
  referrerId: string | null = null,
): Candidate | null {
  if (getContacts(ctx.state).length >= CONTACT_MAX) return null;
  const quality = CONTACT_QUALITY[0] + ctx.random() * (CONTACT_QUALITY[1] - CONTACT_QUALITY[0]);
  const level = ctx.randomInt(CONTACT_LEVEL[0], CONTACT_LEVEL[1]);
  return addCandidate(ctx, role, source, { quality, level, note, referrerId });
}

/** Antwortmöglichkeiten für die Nachricht zu einem Kontakt. */
function contactOptions(c: Candidate) {
  return [
    {
      id: 'hire',
      label: `Einstellen (${formatEuro(c.hireCost)} Handgeld)`,
      command: { type: 'recruiting.hire' as const, payload: { candidateId: c.id } },
      reply: 'Schick vorbei, ich stell ein.',
    },
    {
      id: 'decline',
      label: 'Kein Bedarf',
      command: { type: 'recruiting.decline' as const, payload: { candidateId: c.id } },
      reply: 'Kein Bedarf.',
    },
  ];
}

function announce(ctx: Ctx, c: Candidate, contact: Contact, text: string): void {
  messages.send(ctx, { contact, text, options: contactOptions(c), expiresIn: c.expiresAt - ctx.now });
}

const describe = (c: Candidate) => `${c.name}, ${c.age}, ${roleName(c.role)}`;

/** Empfehlung eines loyalen Mitarbeiters (höchstens eine pro Tag). */
function maybeReferral(ctx: Ctx): void {
  // Nur Leute der Stadt, in der du bist, kennen dort wen (Auftrag 43); nach dem Verkauf niemand mehr.
  if (isBusinessSold(ctx.state)) return;
  const loyal = getStaff(ctx.state, { status: 'active', cityId: activeCity(ctx.state) })
    .filter((m) => m.stats.loyalty >= REFERRAL_MIN_LOYALTY && !isFarmRole(m.role))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const m of loyal) {
    if (!ctx.chance(REFERRAL_CHANCE)) continue;
    // Man empfiehlt Leute, die einem ähnlich sind, manchmal auch was ganz anderes.
    // Alte Kuriere (vor Auftrag 28) empfehlen Läufer.
    const own = m.role === 'courier' ? 'runner' : m.role;
    const role = ctx.chance(0.6) ? own : pickWeighted(ctx, POOL_ROLE_WEIGHTS);
    const c = addContact(ctx, role, 'referral', withPeriod(`Empfohlen von ${m.name}`), m.id);
    if (c) {
      announce(
        ctx,
        c,
        staffContact(m),
        `Chef, ich kenn da wen: ${describe(c)}. ${c.background} Soll ich das klarmachen?`,
      );
    }
    return;
  }
}

/** Jemand aus dem Milieu meldet sich. */
function maybeEventContact(ctx: Ctx): void {
  if (isBusinessSold(ctx.state) || !ctx.chance(EVENT_CHANCE)) return;
  const c = addContact(ctx, pickWeighted(ctx, EVENT_ROLE_WEIGHTS), 'event', 'Hat sich von selbst gemeldet.');
  if (!c) return;
  // fillText: „{name}.“ mit „Nico R.“ wird kein „Nico R..“ (J3).
  const intro = fillText(ctx.pick(EVENT_INTROS), { name: c.name });
  announce(ctx, c, { id: `recruit:${c.id}`, name: c.name, kind: 'other' }, `${intro} (${roleName(c.role)})`);
}

/** Ein Stammkunde (customers) kennt jemanden. Charismatische Verkäufer bringen öfter Kontakte. */
function maybeRegular(ctx: Ctx, regularId: string, sellerId: string | null): void {
  const regular = getRegular(ctx.state, regularId);
  if (regular?.status !== 'active') return;
  const seller = sellerId ? getStaffMember(ctx.state, sellerId) : undefined;
  const factor = seller ? 0.5 + seller.stats.charisma / 100 : 1;
  if (!ctx.chance(REGULAR_CHANCE_PER_SALE * factor)) return;
  const spot = getSpot(ctx.state, regular.spotId);
  const where = spot ? ` ${atSpot(spot)}` : '';
  const c = addContact(
    ctx,
    pickWeighted(ctx, POOL_ROLE_WEIGHTS),
    'regular',
    `Kumpel von Stammkunde ${regular.name}${where}.`,
  );
  if (!c) return;
  announce(
    ctx,
    c,
    // Derselbe Kontakt wie im Kundenmodul (Lieferdienst), damit es ein Chat bleibt.
    { id: `customer:${regular.id}`, name: regular.name, kind: 'customer' },
    `Ey, kurze Frage: Ein Kumpel sucht Arbeit. ${describe(c)}. Soll ich die Nummer weitergeben?`,
  );
}

/** Wer aus der Haft kommt, hat dort manchmal jemanden kennengelernt. */
function maybeJailContact(ctx: Ctx, staffId: string): void {
  const m = getStaffMember(ctx.state, staffId);
  // Den Kontakt gibt es nur, wenn die Person in der Stadt ist, in der du bist (Auftrag 43).
  if (!m || (m.cityId ?? 'koeln') !== activeCity(ctx.state) || !ctx.chance(JAIL_CONTACT_CHANCE)) return;
  const c = addContact(ctx, pickWeighted(ctx, EVENT_ROLE_WEIGHTS), 'event', `Hat ${m.name} im Knast kennengelernt.`);
  if (!c) return;
  announce(
    ctx,
    c,
    staffContact(m),
    `Bin wieder draußen. Drinnen hab ich wen kennengelernt: ${describe(c)}. Taugt was.`,
  );
}

// --- Ablauf ---

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.recruiting;
  const gone = s.candidates.filter((c) => c.expiresAt <= ctx.now);
  if (gone.length > 0) {
    s.candidates = s.candidates.filter((c) => c.expiresAt > ctx.now);
    // Wer abläuft, verschwindet still (Auftrag 43, K10: bis zu zwölf Journal-Zeilen am Tag drängten Wichtiges heraus).
    for (const c of gone) {
      ctx.emit('recruiting.candidateLeft', { candidateId: c.id, name: c.name, role: c.role, source: c.source });
    }
  }
  // Nach dem Verkauf sucht niemand mehr Arbeit bei dir (Auftrag 43).
  if (ctx.now < s.nextPoolAt || isBusinessSold(ctx.state)) return;
  const count = ctx.randomInt(POOL_ARRIVALS[0], POOL_ARRIVALS[1]);
  const max = poolMax(ctx.state);
  for (let i = 0; i < count && getPool(ctx.state).length < max; i++) addPoolCandidate(ctx);
  s.nextPoolAt = ctx.now + ctx.randomInt(POOL_INTERVAL[0], POOL_INTERVAL[1]);
}

/** Kommst du in eine Stadt ohne Bewerber, warten gleich ein paar von dort (Auftrag 43). */
function freshPool(ctx: Ctx, cityId: string): void {
  if (isBusinessSold(ctx.state) || activeCity(ctx.state) !== cityId || getPool(ctx.state, cityId).length > 0) return;
  for (let i = 0; i < POOL_START; i++) addPoolCandidate(ctx);
}

function profileOf(c: Candidate): RecruitProfile {
  return {
    name: c.name,
    role: c.role,
    age: c.age,
    background: c.background,
    stats: { ...c.stats },
    level: c.level,
    wage: c.wage,
    portrait: c.portrait,
    traits: [...(c.traits ?? [])],
  };
}

function hire(ctx: Ctx, candidateId: string, assignment: StaffAssignment | null, meta: CommandMeta): CommandResult {
  const c = getCandidate(ctx.state, candidateId);
  if (!c || c.expiresAt <= ctx.now) return { ok: false, reason: 'Die Person ist nicht mehr zu haben.' };
  if (candidateCity(c) !== activeCity(ctx.state)) {
    return { ok: false, reason: `${c.name} sucht in ${cityName(candidateCity(c))} Arbeit.` };
  }
  // Kommt die Person an einen Spot, gehört das Handgeld zu dessen Kosten (Kasse: Pro Spot und Pro Leutnant).
  const tag = assignment?.kind === 'spot' ? { category: 'hiring' as const, spotId: assignment.targetId } : 'hiring';
  if (!wallet.pay(ctx, c.hireCost, 'dirty', `Handgeld ${c.name}`, tag)) {
    return { ok: false, reason: `Nicht genug Geld für das Handgeld (${formatEuro(c.hireCost)}).` };
  }
  const s = ctx.state.modules.recruiting;
  s.candidates = s.candidates.filter((x) => x.id !== c.id);
  const member = enlist(ctx, profileOf(c), {
    cityId: candidateCity(c),
    origin: c.source,
    knownStats: STAT_KEYS.filter((k) => c.visibleStats[k] !== undefined),
    note: c.note,
    // Auftrag 34: Wer empfohlen wurde, kennt die empfehlende Person (befreundet oder verwandt).
    referrerId: c.referrerId && isEmployed(ctx.state, c.referrerId) ? c.referrerId : null,
  });
  if (c.referrerId && isEmployed(ctx.state, c.referrerId)) addLoyalty(ctx, c.referrerId, 3);
  // Fragen im Chat zu genau diesem Bewerber (Empfehlung, Bewerbung) sind erledigt, auch wenn er über die App kam.
  messages.retractWhere(
    ctx,
    (m) => !!m.options?.some((o) => o.command?.type === 'recruiting.hire' && o.command.payload.candidateId === c.id),
  );
  ctx.emit('recruiting.hired', { candidateId: c.id, staffId: member.id });
  if (assignment) ctx.dispatch({ type: 'staff.assign', payload: { staffId: member.id, assignment } }, meta);
  return { ok: true, data: { staffId: member.id } };
}

function search(ctx: Ctx, role?: SearchRole): CommandResult {
  const s = ctx.state.modules.recruiting;
  if (role && !SEARCH_ROLES.some((r) => r.value === role)) return { ok: false, reason: 'Diese Rolle gibt es nicht.' };
  if (ctx.now < s.searchReadyAt) {
    return { ok: false, reason: `Du hast gerade erst rumgefragt. Wieder ab ${clock.formatTime(s.searchReadyAt)}.` };
  }
  if (!wallet.pay(ctx, SEARCH_COST, 'dirty', 'Rumgefragt', 'hiring')) return { ok: false, reason: 'Nicht genug Geld.' };
  const added: Candidate[] = [];
  for (let i = 0; i < SEARCH_COUNT; i++) added.push(addPoolCandidate(ctx, role));
  s.searchReadyAt = ctx.now + SEARCH_COOLDOWN;
  const hits = role ? added.filter((c) => c.role === role).length : 0;
  journal.add(
    ctx,
    role
      ? `Rumgefragt nach ${ROLE_INFO[role].plural ?? roleName(role)}: ${SEARCH_COUNT} neue Bewerber, davon ${hits} passend.`
      : `Rumgefragt: ${SEARCH_COUNT} neue Bewerber.`,
  );
  return { ok: true, data: { candidateIds: added.map((c) => c.id) } };
}

// --- Migration vom Fundament (Version 1) ---

interface CandidateV1 {
  id: string;
  name: string;
  role: StaffRole;
  visibleStats: Partial<StaffStats>;
  wage: number;
  expiresAt: number;
}

interface RecruitingStateV1 {
  candidates: CandidateV1[];
}

type CandidateV3 = Omit<Candidate, 'traits' | 'cityId'>;
type RecruitingStateV3 = Omit<RecruitingState, 'candidates'> & { candidates: CandidateV3[] };

export function migrateRecruitingV1(old: RecruitingStateV1, state: GameState): RecruitingStateV3 {
  return {
    candidates: old.candidates.map((c) => ({
      ...c,
      age: 25,
      background: '',
      level: 1,
      portrait: null,
      source: 'pool',
      note: '',
      hireCost: c.wage * HIRE_COST_DAYS,
      stats: { ...DEFAULT_STATS, ...c.visibleStats },
      arrivedAt: state.time,
      referrerId: null,
    })),
    nextPoolAt: state.time,
    searchReadyAt: 0,
  };
}

type CandidateV4 = Omit<Candidate, 'cityId'>;
type RecruitingStateV4 = Omit<RecruitingState, 'candidates'> & { candidates: CandidateV4[] };

/** Version 3 → 4 (Auftrag 34): Bewerber bekommen Eigenschaften, fest aus ihrer ID. */
export function migrateRecruitingV3(old: RecruitingStateV3, state: GameState): RecruitingStateV4 {
  return {
    ...old,
    candidates: old.candidates.map((c) => ({ ...c, traits: rollTraits(`${state.meta.seed}:${c.id}`) })),
  };
}

/** Version 4 → 5 (Auftrag 43): Bewerber suchen in der Stadt Arbeit, in der du gerade bist. */
export function migrateRecruitingV4(old: RecruitingStateV4, state: GameState): RecruitingState {
  const cityId = activeCity(state);
  return { ...old, candidates: old.candidates.map((c) => ({ ...c, cityId })) };
}

export default defineModule({
  id: 'recruiting',
  version: 5,
  dependsOn: ['staff', 'territory', 'reputation'],
  init: (ctx) => {
    const state: RecruitingState = { candidates: [], nextPoolAt: 0, searchReadyAt: 0 };
    // Die ersten Bewerber warten schon (addCandidate schreibt in den eigenen Zustand).
    ctx.state.modules.recruiting = state;
    for (let i = 0; i < POOL_START; i++) addPoolCandidate(ctx);
    state.nextPoolAt = ctx.now + ctx.randomInt(POOL_INTERVAL[0], POOL_INTERVAL[1]);
    return state;
  },
  tick,
  tickEvery: 60,
  commands: {
    'recruiting.hire': (ctx, { candidateId, assignment }, meta) => hire(ctx, candidateId, assignment ?? null, meta),
    'recruiting.decline': (ctx, { candidateId }) => {
      const s = ctx.state.modules.recruiting;
      if (!getCandidate(ctx.state, candidateId)) return { ok: false, reason: 'Die Person ist nicht mehr zu haben.' };
      s.candidates = s.candidates.filter((c) => c.id !== candidateId);
      return { ok: true };
    },
    'recruiting.search': (ctx, { role }) => search(ctx, role),
  },
  on: {
    // Nach dem Verkauf (Auftrag 43, H9): Bewerber und Kontakte gehen an die Statthalter, ohne Notizen im Verlauf.
    'business.sold': (ctx) => {
      ctx.state.modules.recruiting.candidates = [];
    },
    'clock.dayStarted': (ctx) => {
      maybeReferral(ctx);
      maybeEventContact(ctx);
    },
    'sale.completed': (ctx, { regularId, sellerId }) => {
      if (regularId) maybeRegular(ctx, regularId, sellerId);
    },
    'staff.statusChanged': (ctx, { staffId, from, to }) => {
      if (from === 'jailed' && to === 'active') maybeJailContact(ctx, staffId);
    },
    // In einer neuen Stadt warten gleich ein paar Bewerber von dort (Auftrag 43), nicht erst nach Stunden.
    'city.arrived': (ctx, { cityId }) => freshPool(ctx, cityId),
    'city.switched': (ctx, { to }) => freshPool(ctx, to),
  },
  migrations: {
    2: migrateRecruitingV1,
    // Version 3 (Auftrag 28): Kurier-Bewerber gibt es nicht mehr. Wer einen aus einem alten Spielstand einstellte, hatte
    // jemanden, der nirgends arbeiten kann und trotzdem Lohn kostet.
    3: (old: RecruitingStateV3): RecruitingStateV3 => ({
      ...old,
      candidates: old.candidates.filter((c) => c.role !== 'courier'),
    }),
    4: migrateRecruitingV3,
    5: migrateRecruitingV4,
  },
});
