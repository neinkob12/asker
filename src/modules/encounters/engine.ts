// Ablauf einer Konfrontation: anlegen, Spieler entscheidet (selbst hin oder nicht), Runden, Auflösung mit Folgen.
// Alles deterministisch über ctx.random(). Folgen gehen über die APIs der anderen Module.

import {
  type CommandResult,
  type Ctx,
  clock,
  formatAmount,
  formatEuro,
  type GameState,
  outcome as gameOutcome,
  journal,
  type MoneyCategory,
  wallet,
} from '../../core';
import { activeCity, bribeFactor, cityName, isPlayerIn } from '../city';
import {
  allProducts,
  DEFAULT_PRODUCT,
  getProduct,
  getStock,
  getWarehouses,
  store,
  take,
  warehouseCity,
  warehouseModifiers,
} from '../goods';
import { hasFullPower } from '../hierarchy';
import { addHeat } from '../police';
import { changeReputation } from '../reputation';
import { atSpot, getSpot, spotCity } from '../spots';
import { getStaff, getStaffMember, setStatus } from '../staff';
import { addInfluence, PLAYER_FACTION } from '../territory';
import { veedelCity, veedelName } from '../veedel';
import { getWeather } from '../weather';
import { ENCOUNTER_ACTIONS } from './actions';
import {
  ABANDON_CASH_MAX,
  ABANDON_CASH_SHARE,
  AGGRESSION_FIGHT,
  BACKUP_COST,
  BACKUP_MAX_PEOPLE,
  BACKUP_RESOLVE_BONUS,
  BACKUP_ROLES,
  BRAWL_HIT,
  BRAWL_PROTECTED_FACTOR,
  BRAWL_STRIKE,
  BRUISER_DRIFT,
  CLOCK_ARREST_CHANCE,
  CLOCK_GOODS_DAMAGE,
  CLOCK_GOODS_DAMAGE_PROTECTED,
  CLOCK_HEAT,
  CLOCK_PRESSURE,
  CREW_MAX,
  DECISION_TIMEOUT,
  END_DAMAGE,
  END_DAMAGE_PROTECTED,
  HISTORY_LIMIT,
  KNOCKDOWN_RESOLVE,
  OWN_DOWN_RESOLVE,
  PAYOFF_FACTOR,
  PAYOFF_MIN,
  PAYOFF_RELATION,
  PAYOFF_REPUTATION,
  PLAYER_FIRST_HIT_LETHAL,
  PLAYER_HIT_WEIGHT,
  PLAYER_LETHAL_CHANCE,
  PLAYER_NAME,
  PLAYER_STATS,
  PROTECT_FACTOR,
  RETREAT_AT,
  ROUND_LIMIT,
  STAFF_DEATH_CHANCE,
  STASH_CAP,
  STRENGTH_FACTOR_LIMIT,
  TIPOFF_GOODS,
  TIPOFF_HEAT,
} from './config';
import { crewCandidates, crewCost, SPECIAL_MOVES, specialMoveFor } from './crew';
import { ENCOUNTER_KINDS } from './kinds';
import { chooseAuto, chooseMove } from './strategy';
import {
  activeOwn,
  applyShift,
  buildFoes,
  damageStake,
  edgeOf,
  foesIn,
  getIntent,
  removeFoe,
  rollDice,
  rollIntent,
  roundStrength,
  scaleEffects,
  scaleShift,
  splitEffects,
  stakeDamage,
  startClock,
  startGauges,
  statFactor,
} from './tactics';
import type {
  Amount,
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterEnding,
  EncounterKind,
  EncounterMode,
  EncounterOutcome,
  EncounterRequest,
  EncounterResult,
  EncounterResultPart,
  EncounterSetting,
  GaugeShift,
  Participant,
  SpecialMoveId,
  StakeId,
} from './types';

export const PLAYER_ID = 'player';

// ---------------------------------------------------------------------------------------------
// Lesen

export function getKind(kindId: string): EncounterKind | undefined {
  return ENCOUNTER_KINDS[kindId];
}

/** Handlung mit den Anpassungen des Anlasses. */
export function resolveAction(kind: EncounterKind, actionId: string): EncounterAction | undefined {
  const base = ENCOUNTER_ACTIONS[actionId];
  if (!base) return undefined;
  const o = kind.actionOverrides?.[actionId];
  if (!o) return base;
  return { ...base, ...o, shift: { ...base.shift, ...o.shift }, texts: o.texts ?? base.texts };
}

export function activeParticipants(encounter: Encounter): Participant[] {
  return activeOwn(encounter);
}

function playerActive(encounter: Encounter): boolean {
  return encounter.participants.some((p) => p.isPlayer && p.condition !== 'down');
}

/** IDs der Handlungen, die gerade möglich sind. Weniger, wenn der Spieler nicht selbst dabei ist. */
export function availableActions(encounter: Encounter): string[] {
  if (encounter.phase !== 'rounds') return [];
  const kind = getKind(encounter.kind);
  if (!kind) return [];
  const withPlayer = playerActive(encounter);
  return (withPlayer ? kind.actions : kind.remoteActions).filter((id) => {
    const action = resolveAction(kind, id);
    if (!action) return false;
    if (action.requiresPlayer && !withPlayer) return false;
    if (action.costsBribe && encounter.bribeCost <= 0) return false;
    if (action.requiresVeedel && !encounter.request.veedelId) return false;
    if (action.target && foesIn(encounter, action.target) === 0) return false;
    if (action.clock === 'call' && encounter.clock <= 1) return false;
    return true;
  });
}

/**
 * Stärke einer Handlung in der aktuellen Lage (0–1): Wert der Beteiligten und Absicht bei mittlerem Würfel.
 * Früher die Erfolgschance; der Würfel entscheidet jetzt nur, wie stark eine Handlung wirkt.
 */
export function actionChance(encounter: Encounter, actionId: string): number {
  const kind = getKind(encounter.kind);
  const action = kind && resolveAction(kind, actionId);
  if (!action) return 0;
  return Math.min(0.95, Math.max(0.05, roundStrength(encounter, action, actionId, 1) / 2));
}

// ---------------------------------------------------------------------------------------------
// Hilfen

function roll(ctx: Ctx, amount: Amount): number {
  if (typeof amount === 'number') return amount;
  const [a, b] = amount;
  return ctx.randomInt(Math.min(a, b), Math.max(a, b));
}

/**
 * Ersetzt {name} durch Werte. Unbekannte Platzhalter bleiben stehen. {opponent} mit Artikel („Die Streife“) steht nur
 * am Satzanfang groß, mitten im Satz klein („… haben die Angreifer gewartet“, Auftrag 43, K6).
 */
export function fillText(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string, offset: number) => {
    const value = vars[key];
    if (value === undefined) return match;
    if (key !== 'opponent' || !/^(Die|Der|Das) /.test(value)) return value;
    const before = template.slice(0, offset).trimEnd();
    const sentenceStart = before === '' || /[.!?…:“"]$/.test(before);
    return sentenceStart ? value : value[0].toLowerCase() + value.slice(1);
  });
}

function goodsUnit(): string {
  return getProduct(DEFAULT_PRODUCT)?.unit ?? 'g';
}

function placeOf(state: GameState, request: EncounterRequest): string {
  if (request.place) return request.place;
  const spot = request.spotId ? getSpot(state, request.spotId) : undefined;
  if (spot) return atSpot(spot);
  if (request.veedelId) return `in ${veedelName(request.veedelId)}`;
  return 'auf der Straße';
}

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
}

function textVars(encounter: Encounter): Record<string, string> {
  const stakes = encounter.request.stakes ?? {};
  const staff = encounter.participants.filter((p) => !p.isPlayer).map((p) => p.name);
  const us = encounter.participants.some((p) => p.isPlayer) ? 'dich' : staff.length ? names(staff) : 'deine Leute';
  return {
    opponent: encounter.opponent.label,
    place: encounter.place,
    us,
    stakeMoney: formatEuro(stakes.money ?? 0),
    stakeGoods: formatAmount(stakes.goods ?? 0, goodsUnit()),
  };
}

/** Wo eine Anfrage spielt (für die Situationstexte). */
export function settingOf(request: EncounterRequest): EncounterSetting {
  if (request.setting) return request.setting;
  if (request.warehouseId) return 'warehouse';
  if (request.spotId) return 'spot';
  return 'street';
}

/**
 * Situationstext: der Text des Aufrufers, sonst der genaueste passende aus den Situationen des Anlasses (Ort,
 * Tagesabschnitt, Wetter; Wetter zählt am meisten), bei Gleichstand gewürfelt.
 */
function pickSituation(ctx: Ctx, kind: EncounterKind, request: EncounterRequest): string {
  if (request.situation) return request.situation;
  const list = kind.situations ?? [];
  const setting = settingOf(request);
  const phase = clock.dayPhase(ctx.now);
  const weather = ctx.state.modules.weather ? getWeather(ctx.state).kind : null;
  let best: string[] = [];
  let bestScore = -1;
  for (const s of list) {
    if (s.settings && !s.settings.includes(setting)) continue;
    if (s.phases && !s.phases.includes(phase)) continue;
    if (s.weather && (!weather || !s.weather.includes(weather))) continue;
    // Wetter ist am seltensten und fällt am meisten auf, der Ort am wenigsten.
    const score = (s.settings ? 0.5 : 0) + (s.phases ? 1 : 0) + (s.weather ? 1.5 : 0);
    if (score > bestScore) {
      best = [s.text];
      bestScore = score;
    } else if (score === bestScore) best.push(s.text);
  }
  return best.length ? ctx.pick(best) : kind.situation;
}

function addPlayer(encounter: Encounter): void {
  if (encounter.participants.some((p) => p.isPlayer)) return;
  encounter.participants.unshift({
    id: PLAYER_ID,
    name: PLAYER_NAME,
    isPlayer: true,
    stats: { ...PLAYER_STATS },
    condition: 'ok',
    killed: false,
    move: null,
    moveUsed: false,
  });
  encounter.playerPresent = true;
}

/** Zeiger, Uhr und erste Absicht setzen, sobald feststeht, wer dabei ist. */
function setupRounds(ctx: Ctx, encounter: Encounter, kind: EncounterKind): void {
  const gauges = startGauges(ctx.state, encounter, kind);
  encounter.aggression = gauges.aggression;
  encounter.resolve = gauges.resolve;
  encounter.edge = edgeOf(encounter);
  encounter.intent = rollIntent(ctx, encounter, kind);
  encounter.protect = defaultProtect(encounter);
  encounter.maxRounds = encounter.round + encounter.clock;
}

/** Einsätze dieser Konfrontation: je nach Ort (stakesBySetting), sonst die des Anlasses. */
export function stakesFor(kind: EncounterKind, request: EncounterRequest): readonly StakeId[] {
  return kind.stakesBySetting?.[settingOf(request)] ?? kind.stakes;
}

/** Was man ohne Wahl schützt: den Einsatz, auf den die Absicht zielt, sonst den ersten des Anlasses. */
export function defaultProtect(encounter: Encounter): StakeId | null {
  const target = getIntent(encounter.intent)?.stake;
  const ids = encounter.stakes.map((x) => x.id);
  if (target && ids.includes(target)) return target;
  return encounter.protect ?? ids[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Ablauf

/** Konfrontation anlegen. Das Ergebnis kommt später als 'encounter.resolved'. */
export function start(ctx: Ctx, request: EncounterRequest): Encounter {
  const kind = getKind(request.kind);
  if (!kind) throw new Error(`Unbekannter Anlass für eine Konfrontation: ${request.kind}`);
  const count = Math.max(1, Math.round(request.opponent?.count ?? roll(ctx, kind.opponent.count)));
  const rawStrength = request.opponent?.strength;
  const strength =
    rawStrength === undefined
      ? kind.opponent.strength
      : rawStrength <= STRENGTH_FACTOR_LIMIT
        ? Math.round(kind.opponent.strength * rawStrength)
        : rawStrength;
  const clockStart = startClock(ctx.state, request, kind);
  const encounter: Encounter = {
    id: ctx.nextId(),
    kind: request.kind,
    request: structuredClone(request),
    startedAt: ctx.now,
    phase: 'rounds',
    mode: null,
    situation: '',
    place: placeOf(ctx.state, request),
    playerPresent: false,
    participants: [],
    opponent: {
      label: request.opponent?.label ?? kind.opponent.label,
      factionId: request.opponent?.factionId ?? null,
      strength,
      count,
      startCount: count,
      down: 0,
    },
    edge: 50,
    round: 0,
    maxRounds: clockStart,
    aggression: kind.gauges.aggression,
    resolve: kind.gauges.resolve,
    clock: clockStart,
    brawl: false,
    intent: null,
    foes: buildFoes(count, kind),
    stakes: stakesFor(kind, request).map((id) => ({ id, damage: 0 })),
    protect: null,
    log: [],
    // Freikaufen kostet je nach Stadt mehr oder weniger (Kölscher Klüngel, Auftrag 30).
    bribeCost: kind.bribe
      ? Math.round(
          (kind.bribe.base + kind.bribe.perOpponent * count) *
            bribeFactor(request.veedelId ? veedelCity(request.veedelId) : activeCity(ctx.state)),
        )
      : 0,
    extraHeat: 0,
    goodsDropped: 0,
    bribeSpent: 0,
    deadline: ctx.now + DECISION_TIMEOUT,
    outcome: null,
    resolvedAt: null,
    playerKilled: false,
    result: null,
  };
  for (const id of new Set(request.staffIds ?? [])) addStaff(ctx.state, encounter, id);
  // Dabei sein kannst du nur in der Stadt, in der du bist (Auftrag 30).
  if (request.playerPresent === true && playerCanBeThere(ctx.state, encounter)) addPlayer(encounter);
  else if (request.playerPresent === undefined && request.askPlayer && kind.joinable) encounter.phase = 'briefing';
  encounter.situationTemplate = pickSituation(ctx, kind, request);
  encounter.situation = fillText(encounter.situationTemplate, textVars(encounter));
  setupRounds(ctx, encounter, kind);
  ctx.state.modules.encounters.active.push(encounter);
  ctx.emit('encounter.started', { encounterId: encounter.id, kind: request.kind, request: encounter.request });
  if (encounter.phase === 'rounds' && activeParticipants(encounter).length === 0) nobodyThere(ctx, encounter);
  return encounter;
}

function nobodyThere(ctx: Ctx, encounter: Encounter): void {
  encounter.protect = null;
  encounter.log.push({
    round: 0,
    actionId: 'none',
    success: false,
    chance: 0,
    text: 'Niemand von euch war da.',
  });
  finish(ctx, encounter, getKind(encounter.kind)?.ifNobody ?? 'failure', undefined, 'resolved');
}

function findActive(ctx: Ctx, encounterId: number): Encounter | undefined {
  return ctx.state.modules.encounters.active.find((e) => e.id === encounterId);
}

/** Wege im Briefing eines Anlasses (Standard: selbst hin, Leute machen lassen). */
export function briefingModes(kind: EncounterKind | undefined): readonly EncounterMode[] {
  return kind?.briefingOptions ?? ['self', 'crew'];
}

/** Was "Sofort freikaufen" kostet: mindestens PAYOFF_MIN, sonst die Bestechung des Anlasses mal PAYOFF_FACTOR. */
export function payoffCost(encounter: Encounter): number {
  return Math.max(PAYOFF_MIN, Math.round(encounter.bribeCost * PAYOFF_FACTOR));
}

/** Stadt, in der eine Konfrontation spielt: aus Lager, Spot oder Veedel der Anfrage, sonst die aktive Stadt. */
export function requestCity(state: GameState, request: EncounterRequest): string {
  if (request.warehouseId) return warehouseCity(request.warehouseId);
  const spot = request.spotId ? getSpot(state, request.spotId) : undefined;
  if (spot) return spotCity(spot);
  if (request.veedelId) return veedelCity(request.veedelId);
  return activeCity(state);
}

/**
 * Freie Leute, die als Verstärkung hinfahren könnten (aktiv, ohne Einsatz, noch nicht dabei, in der Stadt der
 * Konfrontation), Stärkste zuerst.
 */
export function backupCandidates(state: GameState, encounter: Encounter): string[] {
  const roles: readonly string[] = BACKUP_ROLES;
  const there = new Set(encounter.participants.map((p) => p.id));
  const cityId = requestCity(state, encounter.request);
  return getStaff(state, { cityId })
    .filter((m) => m.status === 'active' && !m.assignment && roles.includes(m.role) && !there.has(m.id))
    .sort((a, b) => b.stats.strength - a.stats.strength || a.id.localeCompare(b.id))
    .slice(0, BACKUP_MAX_PEOPLE)
    .map((m) => m.id);
}

export interface BriefingOption {
  mode: EncounterMode;
  /** Schwarzgeld, das der Weg sofort kostet (0 = nichts). */
  cost: number;
  /** Geht der Weg gerade? Sonst steht in reason, warum nicht. */
  ok: boolean;
  reason?: string;
}

/** Die Wege im Briefing mit Kosten und ob sie gerade gehen (für die Oberfläche und für join). */
export function briefingOptions(state: GameState, encounter: Encounter): BriefingOption[] {
  if (encounter.phase !== 'briefing') return [];
  const money = wallet.balance(state, 'dirty');
  return briefingModes(getKind(encounter.kind)).map((mode): BriefingOption => {
    if (mode === 'backup') {
      const free = backupCandidates(state, encounter).length;
      if (free === 0) return { mode, cost: BACKUP_COST, ok: false, reason: 'Niemand frei, der hinfahren kann.' };
      if (money < BACKUP_COST) {
        return { mode, cost: BACKUP_COST, ok: false, reason: `Nicht genug Schwarzgeld (${formatEuro(BACKUP_COST)}).` };
      }
      return { mode, cost: BACKUP_COST, ok: true };
    }
    if (mode === 'payoff') {
      const cost = payoffCost(encounter);
      if (money < cost) return { mode, cost, ok: false, reason: `Nicht genug Schwarzgeld (${formatEuro(cost)}).` };
      return { mode, cost, ok: true };
    }
    if (mode === 'tipoff' && !encounter.request.veedelId) {
      return { mode, cost: 0, ok: false, reason: 'Kein Veedel, in das die Polizei kommen könnte.' };
    }
    if (mode === 'self' && !playerCanBeThere(state, encounter)) {
      return { mode, cost: 0, ok: false, reason: `Du bist nicht in ${cityName(encounterCity(encounter, state))}.` };
    }
    return { mode, cost: 0, ok: true };
  });
}

/** Stadt einer Konfrontation (Lager, Spot oder Veedel der Anfrage; sonst die aktive Stadt). */
function encounterCity(encounter: Encounter, state: GameState): string {
  return requestCity(state, encounter.request);
}

/** Kannst du selbst hin? Nur in der Stadt, in der du bist (und nicht unterwegs zwischen den Städten). */
function playerCanBeThere(state: GameState, encounter: Encounter): boolean {
  return isPlayerIn(state, encounterCity(encounter, state));
}

/**
 * In einer Stadt, in der du nicht bist: Hat die Rechte Hand dort Vollmacht, entscheidet sie sofort (ihre Leute machen),
 * sonst bleibt es beim Standardweg (Frist, dann entscheiden die Leute selbst).
 */
export function delegateAbsent(ctx: Ctx): void {
  for (const encounter of [...ctx.state.modules.encounters.active]) {
    if (encounter.phase !== 'briefing' || playerCanBeThere(ctx.state, encounter)) continue;
    if (!hasFullPower(ctx.state, encounterCity(encounter, ctx.state))) continue;
    join(ctx, encounter.id, 'crew');
  }
}

/**
 * Spieler entscheidet im Briefing, wie er vorgeht (siehe EncounterMode). Die alte Form (present: true/false) gilt als
 * 'self' bzw. 'crew'. Freikaufen, Bullen rufen und Spot räumen beenden die Konfrontation sofort.
 */
export function join(ctx: Ctx, encounterId: number, mode: EncounterMode, crew?: readonly string[]): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase !== 'briefing') return { ok: false, reason: 'Das ist schon entschieden.' };
  const option = briefingOptions(ctx.state, encounter).find((o) => o.mode === mode);
  if (!option) return { ok: false, reason: 'Das geht hier nicht.' };
  if (!option.ok) return { ok: false, reason: option.reason ?? 'Das geht gerade nicht.' };
  // Crew nur bei den Wegen, bei denen jemand hingeht.
  if (crew && (mode === 'self' || mode === 'crew' || mode === 'backup')) {
    const extra = mode === 'backup' ? option.cost : 0;
    const cityId = requestCity(ctx.state, encounter.request);
    if (wallet.balance(ctx.state, 'dirty') < crewCost(ctx.state, encounter, cityId, crew) + extra) {
      return { ok: false, reason: 'Nicht genug Schwarzgeld für Taxi und Verstärkung.' };
    }
    const taken = takeCrew(ctx, encounter, crew);
    if (!taken.ok) return taken;
  }
  encounter.mode = mode;
  const vars = () => textVars(encounter);
  switch (mode) {
    case 'self':
      addPlayer(encounter);
      enterRounds(ctx, encounter);
      break;
    case 'crew':
      enterRounds(ctx, encounter);
      break;
    case 'backup': {
      if (!wallet.pay(ctx, option.cost, 'dirty', 'Verstärkung', lossCategory(encounter)))
        return { ok: false, reason: 'Nicht genug Schwarzgeld.' };
      // Fahrtkosten: kein Verlust an die Gegenseite, deshalb nicht in result.money.
      encounter.travelSpent = (encounter.travelSpent ?? 0) + option.cost;
      const ids = backupCandidates(ctx.state, encounter);
      for (const id of ids) addStaff(ctx.state, encounter, id);
      // Die Verstärkung gehört dazu (Erfahrung, Loyalität, Verletzungen wie bei allen Beteiligten).
      encounter.request.staffIds = [...(encounter.request.staffIds ?? []), ...ids];
      enterRounds(ctx, encounter);
      if (!encounter.outcome) {
        encounter.resolve = Math.max(0, encounter.resolve - BACKUP_RESOLVE_BONUS);
        encounter.edge = edgeOf(encounter);
      }
      break;
    }
    case 'payoff': {
      if (!wallet.pay(ctx, option.cost, 'dirty', 'Freikaufen', lossCategory(encounter)))
        return { ok: false, reason: 'Nicht genug Schwarzgeld.' };
      encounter.bribeSpent += option.cost;
      encounter.phase = 'rounds';
      encounter.log.push({
        round: 0,
        actionId: 'payoff',
        success: true,
        chance: 1,
        text: 'Ein Umschlag. Sie ziehen ab.',
      });
      finish(
        ctx,
        encounter,
        'success',
        {
          relation: PAYOFF_RELATION,
          reputation: PAYOFF_REPUTATION,
          text: fillText('Freigekauft {place}. {opponent} ziehen ab, mit deinem Geld.', vars()),
        },
        'briefing',
      );
      break;
    }
    case 'tipoff':
      encounter.phase = 'rounds';
      encounter.log.push({
        round: 0,
        actionId: 'tipoff',
        success: true,
        chance: 1,
        text: 'Ein Anruf aus der Telefonzelle. Zehn Minuten später: Blaulicht. Alle rennen.',
      });
      finish(
        ctx,
        encounter,
        'retreat',
        {
          heat: TIPOFF_HEAT,
          goods: TIPOFF_GOODS,
          text: fillText('Bullen gerufen {place}. {opponent} sind weg, die Polizei ist da.', vars()),
        },
        'briefing',
      );
      break;
    case 'abandon':
      encounter.phase = 'rounds';
      encounter.log.push({
        round: 0,
        actionId: 'abandon',
        success: true,
        chance: 1,
        text: 'Ware in die Tasche, ab durch den Hinterhof. Die Kasse bleibt liegen.',
      });
      finish(
        ctx,
        encounter,
        'retreat',
        {
          moneyShare: -ABANDON_CASH_SHARE,
          moneyShareMax: ABANDON_CASH_MAX,
          // Ein Lager hat keine Kasse (Auftrag 43, K2).
          text: fillText(
            settingOf(encounter.request) === 'warehouse'
              ? 'Geräumt {place}. Ihr habt mitgenommen, was ihr tragen konntet.'
              : 'Spot {place} geräumt. Die Ware ist gerettet, die Kasse nicht.',
            vars(),
          ),
        },
        'briefing',
      );
      break;
  }
  return { ok: true };
}

/** Einen Mitarbeiter mit seinen echten Werten dazuholen (nur aktive). */
function addStaff(state: GameState, encounter: Encounter, id: string): void {
  const member = getStaffMember(state, id);
  if (member?.status !== 'active' || encounter.participants.some((p) => p.id === id)) return;
  const { speed, caution, strength, charisma } = member.stats;
  encounter.participants.push({
    id,
    name: member.name,
    isPlayer: false,
    stats: { speed, caution, strength, charisma },
    condition: 'ok',
    killed: false,
    move: specialMoveFor(member, getKind(encounter.kind)?.moves),
    moveUsed: false,
  });
}

/**
 * Crew aus dem Briefing übernehmen (bis zu CREW_MAX, nur Kandidaten): Wer nicht vor Ort ist, kommt mit dem Taxi.
 * Wer vor Ort war und nicht gewählt ist, hält sich raus.
 */
function takeCrew(ctx: Ctx, encounter: Encounter, crew: readonly string[]): CommandResult {
  const ids = [...new Set(crew)];
  if (ids.length > CREW_MAX) return { ok: false, reason: `Höchstens ${CREW_MAX} Leute.` };
  const cityId = requestCity(ctx.state, encounter.request);
  const candidates = crewCandidates(ctx.state, encounter, cityId);
  if (ids.some((id) => !candidates.some((c) => c.id === id))) {
    return { ok: false, reason: 'Diese Person kann nicht mitkommen.' };
  }
  const cost = crewCost(ctx.state, encounter, cityId, ids);
  if (cost > 0) {
    if (!wallet.pay(ctx, cost, 'dirty', 'Taxi für die Crew', lossCategory(encounter))) {
      return { ok: false, reason: `Nicht genug Schwarzgeld fürs Taxi (${formatEuro(cost)}).` };
    }
    encounter.travelSpent = (encounter.travelSpent ?? 0) + cost;
  }
  encounter.participants = encounter.participants.filter((p) => p.isPlayer);
  for (const id of ids) addStaff(ctx.state, encounter, id);
  encounter.request.staffIds = ids;
  return { ok: true };
}

function enterRounds(ctx: Ctx, encounter: Encounter): void {
  encounter.phase = 'rounds';
  const kind = getKind(encounter.kind);
  // Der Text bleibt, nur {us} kann sich ändern (jetzt weiß man, wer hingeht).
  if (kind) {
    encounter.situation = fillText(
      encounter.request.situation ?? encounter.situationTemplate ?? kind.situation,
      textVars(encounter),
    );
    setupRounds(ctx, encounter, kind);
  }
  if (activeParticipants(encounter).length === 0) nobodyThere(ctx, encounter);
}

/** Einsatz wählen, den die eigene Seite ab jetzt schützt (kostet keine Runde). */
export function protect(ctx: Ctx, encounterId: number, stake: StakeId): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (!encounter.stakes.some((s) => s.id === stake))
    return { ok: false, reason: 'Das steht hier nicht auf dem Spiel.' };
  encounter.protect = stake;
  return { ok: true };
}

/** Eine Runde spielen (optional mit neuem Schutz). */
export function act(ctx: Ctx, encounterId: number, actionId: string, guard?: StakeId): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase === 'briefing') return { ok: false, reason: 'Erst entscheiden, ob du selbst hingehst.' };
  const kind = getKind(encounter.kind);
  const action = kind && resolveAction(kind, actionId);
  if (!kind || !action || !availableActions(encounter).includes(actionId)) {
    return { ok: false, reason: 'Das geht gerade nicht.' };
  }
  // Erst alles prüfen, dann ändern.
  if (guard !== undefined && !encounter.stakes.some((s) => s.id === guard)) {
    return { ok: false, reason: 'Das steht hier nicht auf dem Spiel.' };
  }
  if (action.costsBribe && wallet.balance(ctx.state, 'dirty') < encounter.bribeCost) {
    return { ok: false, reason: `Nicht genug Schwarzgeld (${formatEuro(encounter.bribeCost)}).` };
  }
  if (guard !== undefined) encounter.protect = guard;
  if (action.costsBribe) {
    wallet.pay(ctx, encounter.bribeCost, 'dirty', 'Bestechung', lossCategory(encounter));
    encounter.bribeSpent += encounter.bribeCost;
  }
  playRound(ctx, encounter, kind, actionId, action);
  return { ok: true };
}

/** Wen es trifft (der Boss wird bevorzugt). Ohne Treffer, wenn niemand mehr steht. */
function hitOwn(ctx: Ctx, encounter: Encounter): string {
  const active = activeParticipants(encounter);
  if (active.length === 0) return '';
  const lethal = getKind(encounter.kind)?.lethal !== false;
  const weights = active.map((p) => (p.isPlayer ? PLAYER_HIT_WEIGHT : 1));
  let pick = ctx.random() * weights.reduce((a, b) => a + b, 0);
  let target = active[active.length - 1];
  for (let i = 0; i < active.length; i++) {
    pick -= weights[i];
    if (pick < 0) {
      target = active[i];
      break;
    }
  }
  encounter.resolve = Math.min(100, encounter.resolve + (target.condition === 'ok' ? 0 : OWN_DOWN_RESOLVE));
  if (!lethal) {
    // Niemand stirbt, Getroffene werden zu Boden gerissen.
    const who = target.isPlayer ? 'Du' : target.name;
    if (target.condition === 'ok') {
      target.condition = 'injured';
      return target.isPlayer
        ? 'Ein Griff, ein Stoß. Du gehst zu Boden und rappelst dich auf.'
        : `${who} wird zu Boden gerissen.`;
    }
    target.condition = 'down';
    return target.isPlayer ? 'Sie drücken dich auf den Asphalt. Aus.' : `${who} liegt am Boden. Handschellen klicken.`;
  }
  if (target.isPlayer) {
    if (target.condition === 'ok') {
      if (ctx.chance(PLAYER_FIRST_HIT_LETHAL)) {
        target.condition = 'down';
        target.killed = true;
        return 'Ein Stich, zu tief. Du gehst zu Boden und stehst nicht mehr auf.';
      }
      target.condition = 'injured';
      return 'Es erwischt dich. Du blutest.';
    }
    if (ctx.chance(PLAYER_LETHAL_CHANCE)) {
      target.condition = 'down';
      target.killed = true;
      return 'Noch ein Treffer. Du gehst zu Boden und stehst nicht mehr auf.';
    }
    return 'Streifschuss. Du hältst dich gerade noch auf den Beinen.';
  }
  if (target.condition === 'ok') {
    target.condition = 'injured';
    return `${target.name} ist verletzt.`;
  }
  target.condition = 'down';
  if (ctx.chance(STAFF_DEATH_CHANCE)) {
    target.killed = true;
    return `${target.name} rührt sich nicht mehr.`;
  }
  return `${target.name} ist schwer verletzt und fällt aus.`;
}

/** Ein Treffer gegen eure Seite: Ein Spezialzug "Block" fängt ihn ab (crew.ts), sonst trifft es jemanden. */
function takeHit(ctx: Ctx, encounter: Encounter): string {
  const blocked = blockHit(encounter);
  if (blocked) return blocked;
  return hitOwn(ctx, encounter);
}

/** Eure Seite schlägt zu: Chance, einen Gegner auszuschalten (Stärke und Überzahl). */
function strike(ctx: Ctx, encounter: Encounter, chance: number): string | null {
  const fist = ENCOUNTER_ACTIONS.fight;
  const p = Math.min(0.9, chance * statFactor(encounter, fist));
  if (!ctx.chance(p)) return null;
  const role = removeFoe(encounter, 'down');
  if (!role) return null;
  encounter.resolve = Math.max(0, encounter.resolve - KNOCKDOWN_RESOLVE);
  return role === 'leader' ? 'Der Anführer geht zu Boden.' : 'Einer von ihnen geht zu Boden.';
}

/** Die Gegenseite schlägt in der Schlägerei zu. Wer die Leute schützt, wird seltener getroffen. */
function brawlHitChance(encounter: Encounter): number {
  const fist = ENCOUNTER_ACTIONS.fight;
  const own = statFactor(encounter, fist);
  const protectedPeople = encounter.protect === 'people';
  return Math.min(0.9, (BRAWL_HIT / own) * (protectedPeople ? BRAWL_PROTECTED_FACTOR : 1));
}

function playRound(ctx: Ctx, encounter: Encounter, kind: EncounterKind, actionId: string, action: EncounterAction) {
  const intent = getIntent(encounter.intent);
  const before: GaugeShift = { aggression: encounter.aggression, resolve: encounter.resolve };
  const dice = rollDice(ctx);
  const strength = roundStrength(encounter, action, actionId, dice);
  encounter.round += 1;
  if (action.dropsGoods !== undefined) {
    encounter.goodsDropped += loseGoods(ctx, roll(ctx, action.dropsGoods), encounter.request);
  }
  if (action.heat) encounter.extraHeat += action.heat;
  const lines = [ctx.pick(strength >= 1 ? action.texts.strong : action.texts.weak)];

  // 1. Die Handlung verschiebt die Zeiger, der Würfel entscheidet die Stärke.
  applyShift(encounter, scaleShift(action.shift, strength));
  if (action.target && action.removesTarget) {
    if (removeFoe(encounter, 'gone', action.target)) lines.push(`Der ${roleName(action.target)} ist weg.`);
  }
  if (action.strike) {
    const hit = strike(ctx, encounter, action.strike);
    if (hit) lines.push(hit);
  }
  let called = false;
  if (action.clock === 'call') {
    encounter.clock = 1;
    called = true;
  } else if (typeof action.clock === 'number') encounter.clock = Math.max(1, encounter.clock + action.clock);

  // 2. Sofort vorbei (Abhauen, Ladung aufgeben).
  if (action.ends) {
    if (action.endHit && ctx.chance(Math.max(0, action.endHit * (2 - Math.min(1.9, strength))))) {
      lines.push(takeHit(ctx, encounter));
    }
    logRound(ctx, encounter, actionId, strength, lines, before);
    const dead = encounter.participants.some((p) => p.isPlayer && p.killed);
    finish(
      ctx,
      encounter,
      dead ? 'failure' : action.ends,
      undefined,
      dead ? 'overrun' : (action.ending ?? (action.ends === 'retreat' ? 'fled' : 'resolved')),
    );
    return;
  }

  // 3. Die Absicht der Gegenseite: trifft, außer der Einsatz ist geschützt oder die Handlung wendet sie ab.
  if (intent) resolveIntent(ctx, encounter, kind, intent, actionId, action, lines);

  // 4. Schlägerei ab AGGRESSION_FIGHT: Beide Seiten schlagen zu.
  encounter.brawl = encounter.aggression >= AGGRESSION_FIGHT;
  if (encounter.brawl && foesIn(encounter) > 0) {
    if (!action.strike) {
      const hit = strike(ctx, encounter, BRAWL_STRIKE);
      if (hit) lines.push(hit);
    }
    if (foesIn(encounter) > 0 && ctx.chance(brawlHitChance(encounter))) lines.push(takeHit(ctx, encounter));
  }

  // 5. Schläger heizen ein, die Uhr läuft, und je näher die Streife, desto eher wollen sie weg.
  applyShift(encounter, { aggression: BRUISER_DRIFT * foesIn(encounter, 'bruiser') });
  if (!called) encounter.clock -= 1;
  if (encounter.clock <= 2 && (kind.clockOutcome ?? 'retreat') !== 'failure') {
    applyShift(encounter, { resolve: -CLOCK_PRESSURE });
  }
  encounter.edge = edgeOf(encounter);
  encounter.maxRounds = encounter.round + Math.max(0, encounter.clock);
  logRound(ctx, encounter, actionId, strength, lines, before);

  const end = roundOutcome(encounter, kind, action);
  if (end) {
    finish(ctx, encounter, end.outcome, undefined, end.ending);
    return;
  }
  encounter.intent = rollIntent(ctx, encounter, kind);
}

/** Schaden an Ware, Kasse und Spot zusammen (was die Gegenseite schon erbeutet hat). */
export function lootTaken(encounter: Encounter): number {
  return encounter.stakes
    .filter((s) => s.id === 'goods' || s.id === 'cash' || s.id === 'spot')
    .reduce((sum, s) => sum + s.damage, 0);
}

function roleName(role: string): string {
  return role === 'leader' ? 'Anführer' : role === 'nervous' ? 'Nervöse' : 'Schläger';
}

function resolveIntent(
  ctx: Ctx,
  encounter: Encounter,
  kind: EncounterKind,
  intent: NonNullable<ReturnType<typeof getIntent>>,
  actionId: string,
  action: EncounterAction,
  lines: string[],
): void {
  if (intent.counters?.includes(actionId)) {
    if (intent.blockedText) lines.push(intent.blockedText);
    return;
  }
  if (intent.drift) applyShift(encounter, intent.drift);
  if (intent.clock) encounter.clock += intent.clock;
  if (!intent.stake) {
    if (intent.hitText) lines.push(intent.hitText);
    return;
  }
  // Geschützt: nur ein Teil des Schadens, und die Gegenseite wird nicht misstrauisch (onHit).
  const shielded = encounter.protect === intent.stake || action.shields === intent.stake;
  const factor = shielded ? PROTECT_FACTOR : 1;
  if (intent.damage) damageStake(encounter, intent.stake, intent.damage * factor, stakeCap(encounter, intent.stake));
  if (intent.heat && encounter.request.veedelId) {
    const heat = Math.round(intent.heat * factor);
    encounter.extraHeat += heat;
    damageStake(encounter, 'noise', heat * 4);
  }
  const hit = !!intent.hit && ctx.chance(intent.hit * factor);
  lines.push((shielded ? intent.blockedText : intent.hitText) || intent.hitText);
  if (hit) lines.push(takeHit(ctx, encounter));
  if (intent.onHit && !shielded) applyShift(encounter, intent.onHit);
  void kind;
}

function logRound(
  ctx: Ctx,
  encounter: Encounter,
  actionId: string,
  strength: number,
  lines: string[],
  before: GaugeShift,
): void {
  const shift = { aggression: encounter.aggression - before.aggression, resolve: encounter.resolve - before.resolve };
  const success = shift.resolve + Math.max(0, shift.aggression) / 2 < 0;
  encounter.log.push({
    round: encounter.round,
    actionId,
    success,
    chance: Math.min(1, strength / 2),
    text: lines.filter(Boolean).join(' '),
    ...(encounter.intent ? { intent: encounter.intent } : {}),
    shift,
  });
  ctx.emit('encounter.round', {
    encounterId: encounter.id,
    round: encounter.round,
    actionId,
    success,
    aggression: encounter.aggression,
    resolve: encounter.resolve,
    clock: encounter.clock,
  });
}

/** Ist die Konfrontation nach dieser Runde vorbei? Dann mit welchem Ausgang. */
function roundOutcome(
  encounter: Encounter,
  kind: EncounterKind,
  action: EncounterAction,
): { outcome: EncounterOutcome; ending: EncounterEnding } | null {
  if (encounter.participants.some((p) => p.isPlayer && p.killed)) return { outcome: 'failure', ending: 'overrun' };
  if (activeParticipants(encounter).length === 0) return { outcome: 'failure', ending: 'overrun' };
  if (foesIn(encounter) === 0) return { outcome: 'success', ending: 'beaten' };
  if (kind.lootLimit && lootTaken(encounter) >= kind.lootLimit) return { outcome: 'failure', ending: 'looted' };
  if (encounter.resolve < RETREAT_AT) return { outcome: action.gaveUp ?? 'success', ending: 'gaveUp' };
  if (encounter.clock <= 0) return { outcome: kind.clockOutcome ?? 'retreat', ending: 'clock' };
  if (encounter.round >= Math.min(kind.maxRounds, ROUND_LIMIT)) {
    return { outcome: kind.draw ?? 'retreat', ending: 'resolved' };
  }
  return null;
}

/** Die Leute handeln selbst: Runden mit einer einfachen Strategie (strategy.ts), bis es vorbei ist. */
export function autoResolve(ctx: Ctx, encounterId: number): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase === 'briefing') enterRounds(ctx, encounter);
  const kind = getKind(encounter.kind);
  for (let guard = 0; encounter.phase === 'rounds' && kind && guard < 50; guard++) {
    // Spezialzüge kennen die Leute selbst (kosten keine Runde).
    const move = chooseMove(encounter, false);
    if (move) {
      special(ctx, encounter.id, move);
      continue;
    }
    const choice = chooseAuto(ctx.state, encounter);
    if (!choice) {
      finish(ctx, encounter, 'failure', undefined, 'overrun');
      break;
    }
    const action = resolveAction(kind, choice.actionId);
    if (!action) break;
    if (choice.protect) encounter.protect = choice.protect;
    playRound(ctx, encounter, kind, choice.actionId, action);
  }
  return { ok: true };
}

/** Konfrontationen, auf die zu lange niemand reagiert hat, entscheiden die Leute selbst. */
export function expireDecisions(ctx: Ctx): void {
  for (const encounter of [...ctx.state.modules.encounters.active]) {
    if (encounter.phase !== 'done' && encounter.deadline <= ctx.now) autoResolve(ctx, encounter.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Auflösung und Folgen

/** Wo Ware verloren geht: im überfallenen Lager, sonst in den Lagern der Stadt der Konfrontation. */
function goodsScope(state: GameState, request: EncounterRequest): { cityId: string; warehouseId?: string } {
  const cityId = requestCity(state, request);
  return request.warehouseId ? { cityId, warehouseId: request.warehouseId } : { cityId };
}

function loseGoods(ctx: Ctx, amount: number, request: EncounterRequest): number {
  // Überfall auf ein Lager: Ein Tresor schützt einen Teil (goods.warehouseModifiers, Auftrag 33).
  const vault = request.warehouseId ? warehouseModifiers(ctx.state, request.warehouseId).lossFactor : 1;
  let left = Math.max(0, Math.round(amount * vault));
  let lost = 0;
  const scope = goodsScope(ctx.state, request);
  for (const warehouse of getWarehouses(ctx.state, scope.cityId)) {
    if (scope.warehouseId && warehouse.id !== scope.warehouseId) continue;
    for (const product of allProducts()) {
      if (left <= 0) return lost;
      const { taken } = take(ctx, { productId: product.id, amount: left, warehouseId: warehouse.id, partial: true });
      left -= taken;
      lost += taken;
    }
  }
  return lost;
}

/**
 * Kategorie für Geld, das bei einer Konfrontation weggeht (Kasse): wie in der Anfrage angegeben (z.B. Zoll), sonst
 * Überfall, Polizei oder sonst Konfrontation.
 */
function lossCategory(encounter: Pick<Encounter, 'kind' | 'request'>): MoneyCategory {
  if (encounter.request.lossCategory) return encounter.request.lossCategory;
  const kind = encounter.kind;
  if (kind === 'raidDefense') return 'loss.theft';
  if (kind === 'customsCheck') return 'loss.customs';
  if (kind === 'policeChase' || kind === 'vehicleCheck') return 'loss.police';
  return 'loss.encounter';
}

const OUTCOME_VERDICT: Record<EncounterOutcome, string> = {
  success: 'geschafft',
  failure: 'verloren',
  retreat: 'Rückzug',
};

function applyEffects(ctx: Ctx, encounter: Encounter, effects: EncounterEffects, result: EncounterResult): void {
  const stakes = encounter.request.stakes ?? {};
  const reason = getKind(encounter.kind)?.name ?? 'Konfrontation';
  const loss = lossCategory(encounter);

  let money = 0;
  if (effects.money !== undefined) money += roll(ctx, effects.money);
  if (effects.stakeMoney) money += Math.round((stakes.money ?? 0) * effects.stakeMoney);
  if (money > 0) {
    wallet.earn(ctx, money, 'dirty', reason, 'income.other');
    result.money += money;
  } else if (money < 0) {
    result.money -= wallet.lose(ctx, -money, 'dirty', reason, loss);
  }
  if (effects.moneyShare && effects.moneyShare < 0) {
    const share = Math.round(wallet.balance(ctx.state, 'dirty') * -effects.moneyShare);
    result.money -= wallet.lose(ctx, Math.min(share, effects.moneyShareMax ?? share), 'dirty', reason, loss);
  }

  let goods = 0;
  if (effects.goods !== undefined) goods += roll(ctx, effects.goods);
  if (effects.stakeGoods) goods += Math.round((stakes.goods ?? 0) * effects.stakeGoods);
  if (goods > 0) {
    store(ctx, {
      productId: DEFAULT_PRODUCT,
      amount: goods,
      ...(effects.goodsQuality === undefined ? {} : { quality: effects.goodsQuality }),
    });
    result.goods += goods;
  } else if (goods < 0) {
    result.goods -= loseGoods(ctx, -goods, encounter.request);
  }
  if (effects.goodsShare && effects.goodsShare < 0) {
    // Der Anteil gilt für denselben Bestand, aus dem er genommen wird (Lager des Überfalls, sonst die Stadt).
    const scope = goodsScope(ctx.state, encounter.request);
    const stock = getStock(
      ctx.state,
      scope.warehouseId ? { warehouseId: scope.warehouseId } : { cityId: scope.cityId },
    );
    result.goods -= loseGoods(ctx, stock * -effects.goodsShare, encounter.request);
  }

  const veedelId = encounter.request.veedelId;
  if (veedelId) {
    if (effects.influence) {
      addInfluence(ctx, veedelId, PLAYER_FACTION, effects.influence);
      result.influence += effects.influence;
    }
    if (effects.opponentInfluence && encounter.opponent.factionId) {
      addInfluence(ctx, veedelId, encounter.opponent.factionId, effects.opponentInfluence);
    }
    if (effects.heat) {
      addHeat(ctx, veedelId, effects.heat);
      result.heat += effects.heat;
    }
  }
  if (effects.reputation) {
    // Mit Grund, damit die Änderung in Reviere › Ruf › "Zuletzt" steht.
    changeReputation(ctx, effects.reputation, `${reason} (${OUTCOME_VERDICT[encounter.outcome ?? 'success']})`);
    result.reputation += effects.reputation;
  }
  // Die Beziehung zur Gegenseite wendet deren Modul an (gangs liest result.relation).
  if (effects.relation && encounter.opponent.factionId) result.relation += effects.relation;
  if (effects.arrestChance) {
    for (const p of encounter.participants) {
      if (p.isPlayer || p.condition === 'down') continue;
      if (result.staffArrested.includes(p.id)) continue;
      if (ctx.chance(effects.arrestChance) && setStatus(ctx, p.id, 'jailed')) result.staffArrested.push(p.id);
    }
  }
}

/** Einsätze, deren Verluste und Gewinne mit dem Schaden skalieren. Lärm und Leute wirken direkt (Heat, Treffer). */
const SCALED_STAKES: readonly StakeId[] = ['goods', 'cash', 'spot'];

/**
 * Schaden am Ende: Wer verliert oder abhaut, lässt zurück, was nicht geschützt ist (geschützt die Hälfte). Läuft die
 * Polizei-Uhr ab, ist vor allem die Ware weg. Im Briefing entschiedene Wege rühren die Einsätze nicht an.
 */
function endDamage(
  encounter: Encounter,
  outcome: EncounterOutcome,
  ending: EncounterEnding,
): Partial<Record<StakeId, number>> {
  const end: Partial<Record<StakeId, number>> = {};
  if (ending === 'briefing' || outcome === 'success') return end;
  for (const stake of encounter.stakes) {
    if (!SCALED_STAKES.includes(stake.id)) continue;
    const guarded = encounter.protect === stake.id;
    let amount: number;
    if (ending === 'clock') {
      // Die Streife kommt: Die Ware ist zum Teil weg, und der Spot hat Blaulicht vor der Tür (Einfluss).
      if (stake.id === 'goods') amount = guarded ? CLOCK_GOODS_DAMAGE_PROTECTED : CLOCK_GOODS_DAMAGE;
      else if (stake.id === 'spot') amount = guarded ? END_DAMAGE_PROTECTED : END_DAMAGE;
      else continue;
    } else {
      amount = guarded ? END_DAMAGE_PROTECTED : END_DAMAGE;
    }
    if (ending === 'fled' && fledSafely(encounter)) amount = 0;
    end[stake.id] = amount;
  }
  return end;
}

/** Was pro Einsatz tatsächlich gebucht wurde (für die Teil-Ergebnisse). */
type Booked = Partial<Record<StakeId, { money: number; goods: number; influence: number }>>;

/**
 * Folgen nach Einsätzen: Verluste eines Einsatzes zählen anteilig zu seinem Schaden (ein unberührter Einsatz kostet
 * nichts, ein ganz verlorener so viel wie im Ausgang steht), Gewinne schrumpfen mit dem Schaden aus den Runden. Hat der
 * Ausgang für einen beschädigten Einsatz keinen Verlust (z.B. bei Erfolg), gilt der Verlust bei Niederlage als Maßstab.
 */
function applyStakeEffects(
  ctx: Ctx,
  encounter: Encounter,
  kind: EncounterKind,
  effects: EncounterEffects,
  end: Partial<Record<StakeId, number>>,
  result: EncounterResult,
  booked: Booked,
): void {
  const stakes = encounter.stakes.map((x) => x.id).filter((s) => SCALED_STAKES.includes(s));
  const outcome = splitEffects(effects, stakes);
  const failure = splitEffects(encounter.request.effects?.failure ?? kind.outcomes.failure, stakes);
  applyEffects(ctx, encounter, outcome.base, result);
  for (const stake of stakes) {
    const cap = stakeCap(encounter, stake) / 100;
    const rounds = stakeDamage(encounter, stake) / 100;
    const before = { money: result.money, goods: result.goods, influence: result.influence };
    // Verluste aus dem Ausgang zählen mit Runden- und End-Schaden; hat der Ausgang keinen Verlust für diesen Einsatz,
    // gilt der Verlust bei Niederlage, aber nur mit dem Schaden aus den Runden (sonst springt ein Rückzug).
    const own = outcome.losses[stake];
    const scaled = own
      ? { effects: own, factor: Math.min(cap, rounds + (end[stake] ?? 0) / 100) }
      : { effects: failure.losses[stake], factor: Math.min(cap, rounds) };
    if (scaled.effects && scaled.factor > 0) {
      applyEffects(ctx, encounter, scaleEffects(scaled.effects, scaled.factor), result);
    }
    const gain = outcome.gains[stake];
    if (gain && rounds < 1) applyEffects(ctx, encounter, scaleEffects(gain, 1 - rounds), result);
    booked[stake] = {
      money: result.money - before.money,
      goods: result.goods - before.goods,
      influence: result.influence - before.influence,
    };
  }
}

const DEFAULT_TEXT: Record<EncounterOutcome, string> = {
  success: 'Geschafft {place}.',
  failure: 'Verloren {place}.',
  retreat: 'Rückzug {place}.',
};

function describeResult(encounter: Encounter, result: EncounterResult, headline: string): string {
  const nameOf = (id: string) => encounter.participants.find((p) => p.id === id)?.name ?? id;
  const details: string[] = [];
  if (result.opponentLosses > 0) details.push(`${result.opponentLosses} Gegner ausgeschaltet`);
  // Zahl, Einheit und Wort bleiben zusammen (Auftrag 43, K11: „−2 / g Ware“ brach um).
  const keep = (text: string) => text.replace(/ /g, '\u00a0');
  if (result.money !== 0) details.push(keep(`${result.money > 0 ? '+' : '−'}${formatEuro(Math.abs(result.money))}`));
  if (result.goods !== 0) {
    details.push(keep(`${result.goods > 0 ? '+' : '−'}${formatAmount(Math.abs(result.goods), goodsUnit())} Ware`));
  }
  if (result.playerInjured) details.push('du bist verletzt');
  if (result.staffInjured.length) details.push(`${names(result.staffInjured.map(nameOf))} verletzt`);
  if (result.staffKilled.length) details.push(`${names(result.staffKilled.map(nameOf))} tot`);
  if (result.staffArrested.length) details.push(`${names(result.staffArrested.map(nameOf))} festgenommen`);
  return details.length ? `${headline} (${details.join(', ')})` : headline;
}

/**
 * Teil-Ergebnisse pro Einsatz für die Ergebnis-Karte, aus dem, was tatsächlich gebucht wurde (nicht aus dem Schaden).
 * Einsätze, bei denen es etwas zu gewinnen gab (z.B. die Beute beim Überfall auf einen Gang-Spot), heißen ohne Gewinn
 * "nicht erbeutet".
 */
function resultParts(
  encounter: Encounter,
  kind: EncounterKind | undefined,
  result: EncounterResult,
  booked: Booked,
): EncounterResultPart[] {
  const parts: EncounterResultPart[] = [];
  const nameOf = (id: string) => encounter.participants.find((p) => p.id === id)?.name ?? id;
  const stakeIds = encounter.stakes.map((x) => x.id);
  const winnable = splitEffects(encounter.request.effects?.success ?? kind?.outcomes.success, stakeIds).gains;
  const signedPart = (
    stake: StakeId,
    value: number,
    damage: number,
    format: (v: number) => string,
  ): EncounterResultPart => {
    if (value > 0) return { stake, state: 'kept', text: `+${format(value)}` };
    if (value < 0) return { stake, state: damage >= 100 ? 'lost' : 'partial', text: `−${format(-value)}` };
    if (winnable[stake] && encounter.outcome !== 'success') return { stake, state: 'lost', text: 'nicht erbeutet' };
    return { stake, state: 'kept', text: 'gehalten' };
  };
  for (const stake of encounter.stakes) {
    const got = booked[stake.id];
    switch (stake.id) {
      case 'goods': {
        if (encounter.request.skipEffects) {
          const lost = encounter.outcome === 'failure';
          parts.push({ stake: 'goods', state: lost ? 'lost' : 'kept', text: lost ? 'aufgeflogen' : 'sicher' });
          break;
        }
        const value = (got?.goods ?? 0) - encounter.goodsDropped;
        parts.push(signedPart('goods', value, stake.damage, (v) => formatAmount(v, goodsUnit())));
        break;
      }
      case 'cash':
        parts.push(signedPart('cash', got?.money ?? 0, stake.damage, (v) => formatEuro(v)));
        break;
      case 'spot':
        parts.push(signedPart('spot', got?.influence ?? 0, stake.damage, (v) => `Einfluss ${v}`));
        break;
      case 'people': {
        const hurt = [
          ...(result.playerInjured ? ['du verletzt'] : []),
          ...result.staffKilled.map((id) => `${nameOf(id)} tot`),
          ...result.staffInjured.map((id) => `${nameOf(id)} verletzt`),
          ...result.staffArrested.map((id) => `${nameOf(id)} in Haft`),
        ];
        const all = encounter.participants.length;
        const out = encounter.participants.filter((p) => p.condition === 'down' || p.killed).length;
        parts.push({
          stake: 'people',
          state: hurt.length === 0 ? 'kept' : all > 0 && out >= all ? 'lost' : 'partial',
          text: hurt.length === 0 ? 'alle heil' : names(hurt),
        });
        break;
      }
      case 'noise': {
        const heat = result.heat;
        parts.push({
          stake: 'noise',
          state: heat <= 0 ? 'kept' : heat >= 15 ? 'lost' : 'partial',
          text: heat <= 0 ? 'ruhig' : `Heat +${heat}`,
        });
        break;
      }
    }
  }
  return parts;
}

/** Konfrontation beenden. override ersetzt die Folgen (z.B. die Wege im Briefing wie Freikaufen). */
function finish(
  ctx: Ctx,
  encounter: Encounter,
  outcome: EncounterOutcome,
  override?: EncounterEffects,
  ending: EncounterEnding = 'resolved',
): void {
  const kind = getKind(encounter.kind);
  const state = ctx.state.modules.encounters;
  const player = encounter.participants.find((p) => p.isPlayer);
  encounter.phase = 'done';
  encounter.outcome = outcome;
  encounter.resolvedAt = ctx.now;
  encounter.playerKilled = !!player?.killed;
  const end = endDamage(encounter, outcome, ending);
  const booked: Booked = {};

  const result: EncounterResult = {
    money: 0 - encounter.bribeSpent,
    goods: 0 - encounter.goodsDropped,
    opponentLosses: encounter.opponent.down,
    staffInjured: [],
    staffKilled: [],
    staffArrested: [],
    playerInjured: player?.condition === 'injured',
    heat: 0,
    influence: 0,
    reputation: 0,
    relation: 0,
    text: '',
    ending,
    ...(encounter.travelSpent ? { travel: encounter.travelSpent } : {}),
  };
  // Verletzungen gelten immer, auch wenn der Auslöser die übrigen Folgen selbst regelt.
  for (const p of encounter.participants) {
    if (p.isPlayer) continue;
    if (p.killed) {
      setStatus(ctx, p.id, 'dead');
      result.staffKilled.push(p.id);
    } else if (p.condition !== 'ok') {
      setStatus(ctx, p.id, 'injured');
      result.staffInjured.push(p.id);
    }
  }
  const effects =
    override ??
    (encounter.request.skipEffects ? undefined : (encounter.request.effects?.[outcome] ?? kind?.outcomes[outcome]));
  if (!encounter.playerKilled) {
    if (override) {
      // Wege im Briefing (freikaufen, räumen …): alles gehört zu den Einsätzen, die es betrifft.
      const before = { money: result.money, goods: result.goods, influence: result.influence };
      applyEffects(ctx, encounter, override, result);
      booked.cash = { money: result.money - before.money, goods: 0, influence: 0 };
      booked.goods = { money: 0, goods: result.goods - before.goods, influence: 0 };
      booked.spot = { money: 0, goods: 0, influence: result.influence - before.influence };
    } else if (effects && kind) applyStakeEffects(ctx, encounter, kind, effects, end, result, booked);
    // Die Polizei-Uhr ist abgelaufen: Wer nicht schnell genug weg ist, wird festgenommen (nicht bei der Polizei selbst,
    // da regelt der Auslöser die Festnahme).
    if (ending === 'clock' && (kind?.clockOutcome ?? 'retreat') !== 'failure') {
      applyEffects(ctx, encounter, { arrestChance: CLOCK_ARREST_CHANCE }, result);
      encounter.extraHeat += CLOCK_HEAT;
    }
    // Heat aus den Handlungen ("Gewalt gegen Polizei") und dem Lärm gilt immer, auch wenn der Auslöser die Folgen selbst
    // regelt (skipEffects, z.B. die Verkehrskontrolle).
    if (encounter.extraHeat > 0 && encounter.request.veedelId) {
      addHeat(ctx, encounter.request.veedelId, encounter.extraHeat);
      result.heat += encounter.extraHeat;
    }
  }

  const vars = textVars(encounter);
  const lastWords = encounter.log.at(-1)?.text ?? 'Du bist nicht mehr aufgestanden.';
  const headline = encounter.playerKilled
    ? `${kind?.name ?? 'Konfrontation'} ${encounter.place}. ${lastWords}`
    : fillText(effects?.text ?? DEFAULT_TEXT[outcome], vars);
  result.text = describeResult(encounter, result, headline);
  // Für die Anzeige: Schaden aus den Runden plus am Ende.
  for (const stake of encounter.stakes) {
    stake.damage = Math.min(stakeCap(encounter, stake.id), stake.damage + (end[stake.id] ?? 0));
  }
  result.parts = resultParts(encounter, kind, result, booked);
  encounter.result = result;

  const ref: { veedelId?: string; spotId?: string } = {};
  if (encounter.request.veedelId) ref.veedelId = encounter.request.veedelId;
  if (encounter.request.spotId) ref.spotId = encounter.request.spotId;
  if (kind?.journal !== false || encounter.playerKilled) {
    journal.add(ctx, result.text, outcome === 'success' ? 'good' : outcome === 'failure' ? 'bad' : 'info', ref);
  }

  state.active = state.active.filter((e) => e.id !== encounter.id);
  state.history.unshift(encounter);
  if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;

  ctx.emit('encounter.resolved', {
    encounterId: encounter.id,
    kind: encounter.kind,
    outcome,
    request: encounter.request,
    playerKilled: encounter.playerKilled,
    result,
    ...(encounter.mode ? { mode: encounter.mode } : {}),
  });
  if (encounter.playerKilled) gameOutcome.gameOver(ctx, 'killed', headline);
}

// ---------------------------------------------------------------------------------------------
// Spezialzüge der Crew (crew.ts)

/** Erlaubt der Anlass diesen Spezialzug? (bei Polizei und Zoll z.B. kein Fluchtwagen) */
export function moveAllowed(kind: EncounterKind | undefined, move: SpecialMoveId): boolean {
  return !kind?.moves || kind.moves.includes(move);
}

function moveUser(encounter: Encounter, move: SpecialMoveId): Participant | undefined {
  if (!moveAllowed(getKind(encounter.kind), move)) return undefined;
  return encounter.participants.find((p) => p.move === move && !p.moveUsed && p.condition !== 'down');
}

/** Sicherheit fängt den ersten Treffer ab (einmal pro Konfrontation). */
function blockHit(encounter: Encounter): string | null {
  const guard = moveUser(encounter, 'block');
  if (!guard) return null;
  guard.moveUsed = true;
  return `${guard.name} fängt den Schlag ab.`;
}

/** Mit dem Fluchtwagen weg: nichts bleibt zurück. */
function fledSafely(encounter: Encounter): boolean {
  return encounter.participants.some((p) => p.move === 'getaway' && p.moveUsed);
}

/** Wie viel von einem Einsatz höchstens verloren gehen kann (Ware in Sicherheit gebracht: die Hälfte). */
function stakeCap(encounter: Encounter, stake: StakeId): number {
  if (stake === 'goods' && encounter.goodsCap !== undefined) return encounter.goodsCap;
  return 100;
}

/** Spezialzüge, die gerade gehen (wer ihn hat, steht noch und hat ihn nicht genutzt; passive nicht). */
export function availableMoves(encounter: Encounter): { participantId: string; move: SpecialMoveId }[] {
  if (encounter.phase !== 'rounds') return [];
  const kind = getKind(encounter.kind);
  return encounter.participants.flatMap((p) => {
    if (!p.move || p.moveUsed || p.condition === 'down' || SPECIAL_MOVES[p.move].passive) return [];
    if (!moveAllowed(kind, p.move)) return [];
    if (p.move === 'stash' && !encounter.stakes.some((x) => x.id === 'goods')) return [];
    return [{ participantId: p.id, move: p.move }];
  });
}

/** Spezialzug spielen (einmal pro Konfrontation). Kostet keine Runde, außer der Fluchtwagen beendet alles. */
export function special(ctx: Ctx, encounterId: number, participantId: string): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  const kind = getKind(encounter.kind);
  const p = encounter.participants.find((x) => x.id === participantId);
  if (!kind || !p?.move || !availableMoves(encounter).some((m) => m.participantId === participantId)) {
    return { ok: false, reason: 'Das geht gerade nicht.' };
  }
  p.moveUsed = true;
  const before: GaugeShift = { aggression: encounter.aggression, resolve: encounter.resolve };
  const actionId = `special:${p.move}`;
  switch (p.move) {
    case 'getaway':
      logRound(ctx, encounter, actionId, 1, [`${p.name} hat den Motor laufen lassen. Alle rein, weg.`], before);
      finish(ctx, encounter, 'retreat', undefined, 'fled');
      return { ok: true };
    case 'stash':
      // Was schon weg ist, bleibt weg: Die Grenze gilt ab jetzt.
      encounter.goodsCap = Math.max(stakeDamage(encounter, 'goods'), STASH_CAP);
      logRound(ctx, encounter, actionId, 1, [`${p.name} schafft die Hälfte der Ware durch den Hinterausgang.`], before);
      return { ok: true };
    case 'secondTalk': {
      const talk = resolveAction(kind, 'negotiate') ?? ENCOUNTER_ACTIONS.negotiate;
      // Mit dem Charisma dieser Person, ohne dass die Runde weiterläuft (keine Absicht, keine Uhr).
      const solo: Encounter = { ...encounter, participants: [p] };
      const strength = roundStrength(solo, talk, 'negotiate', rollDice(ctx));
      applyShift(encounter, scaleShift(talk.shift, strength));
      encounter.edge = edgeOf(encounter);
      logRound(ctx, encounter, actionId, strength, [`${p.name} redet weiter, ruhig und bestimmt.`], before);
      if (encounter.resolve < RETREAT_AT) finish(ctx, encounter, 'success', undefined, 'gaveUp');
      return { ok: true };
    }
    default:
      return { ok: false, reason: 'Das geht gerade nicht.' };
  }
}
