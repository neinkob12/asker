// Ablauf einer Konfrontation: anlegen, Spieler entscheidet (selbst hin oder nicht), Runden, Auflösung mit Folgen.
// Alles deterministisch über ctx.random(). Folgen gehen über die APIs der anderen Module.

import {
  type CommandResult,
  type Ctx,
  formatAmount,
  formatEuro,
  type GameState,
  outcome as gameOutcome,
  journal,
  type MoneyCategory,
  wallet,
} from '../../core';
import { activeCity, cityName, isPlayerIn } from '../city';
import { allProducts, DEFAULT_PRODUCT, getProduct, getStock, getWarehouses, store, take } from '../goods';
import { hasFullPower } from '../hierarchy';
import { addHeat } from '../police';
import { changeReputation } from '../reputation';
import { getSpot } from '../spots';
import { getStaff, getStaffMember, setStatus } from '../staff';
import { addInfluence, PLAYER_FACTION } from '../territory';
import { veedelCity, veedelName } from '../veedel';
import { ENCOUNTER_ACTIONS } from './actions';
import {
  ABANDON_CASH_MAX,
  ABANDON_CASH_SHARE,
  BACKUP_COST,
  BACKUP_EDGE_BONUS,
  BACKUP_MAX_PEOPLE,
  BACKUP_ROLES,
  DECISION_TIMEOUT,
  EDGE_CHANCE_DIVISOR,
  EDGE_RETREAT_AFTER_ROUNDS,
  EDGE_START,
  EDGE_START_MAX,
  EDGE_START_MIN,
  EDGE_WIN_AFTER_ROUNDS,
  HISTORY_LIMIT,
  INJURY_PENALTY,
  MAX_CHANCE,
  MIN_CHANCE,
  NUMBERS_BONUS,
  PAYOFF_FACTOR,
  PAYOFF_MIN,
  PAYOFF_RELATION,
  PAYOFF_REPUTATION,
  PLAYER_FIRST_HIT_LETHAL,
  PLAYER_HIT_WEIGHT,
  PLAYER_LETHAL_CHANCE,
  PLAYER_NAME,
  PLAYER_PRESENT_BONUS,
  PLAYER_STATS,
  STAFF_DEATH_CHANCE,
  STRENGTH_FACTOR_LIMIT,
  TIPOFF_GOODS,
  TIPOFF_HEAT,
} from './config';
import { ENCOUNTER_KINDS } from './kinds';
import type {
  Amount,
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterKind,
  EncounterMode,
  EncounterOutcome,
  EncounterRequest,
  EncounterResult,
  EncounterStat,
  Participant,
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
  return {
    ...base,
    ...o,
    onSuccess: { ...base.onSuccess, ...o.onSuccess },
    onFailure: { ...base.onFailure, ...o.onFailure },
  };
}

export function activeParticipants(encounter: Encounter): Participant[] {
  return encounter.participants.filter((p) => p.condition !== 'down');
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
    return true;
  });
}

function statOf(p: Participant, stat: EncounterStat): number {
  return p.stats[stat] - (p.condition === 'injured' ? INJURY_PENALTY : 0);
}

/** Erfolgschance einer Handlung in der aktuellen Lage (0–1). */
export function actionChance(encounter: Encounter, actionId: string): number {
  const kind = getKind(encounter.kind);
  const action = kind && resolveAction(kind, actionId);
  if (!action) return 0;
  return computeChance(encounter, action);
}

function computeChance(encounter: Encounter, action: EncounterAction): number {
  const active = activeParticipants(encounter);
  if (active.length === 0) return 0;
  const player = active.find((p) => p.isPlayer);
  const opponent = encounter.opponent;
  let value: number;
  if (action.stat === 'none') {
    value = opponent.strength;
  } else if (action.requiresPlayer && player) {
    value = statOf(player, action.stat);
  } else {
    const stat = action.stat;
    const values = active.map((p) => statOf(p, stat));
    value = action.statMode === 'best' ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  }
  let chance = action.base + (value - opponent.strength) / 100;
  if (action.numbers) chance += NUMBERS_BONUS * (active.length - opponent.count);
  if (player) chance += PLAYER_PRESENT_BONUS;
  chance += (encounter.edge - 50) / EDGE_CHANCE_DIVISOR;
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, chance));
}

// ---------------------------------------------------------------------------------------------
// Hilfen

function roll(ctx: Ctx, amount: Amount): number {
  if (typeof amount === 'number') return amount;
  const [a, b] = amount;
  return ctx.randomInt(Math.min(a, b), Math.max(a, b));
}

/** Ersetzt {name} durch Werte. Unbekannte Platzhalter bleiben stehen. */
export function fillText(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

function goodsUnit(): string {
  return getProduct(DEFAULT_PRODUCT)?.unit ?? 'g';
}

function placeOf(state: GameState, request: EncounterRequest): string {
  if (request.place) return request.place;
  const spot = request.spotId ? getSpot(state, request.spotId) : undefined;
  if (spot) return `am ${spot.name}`;
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

function addPlayer(encounter: Encounter): void {
  if (encounter.participants.some((p) => p.isPlayer)) return;
  encounter.participants.unshift({
    id: PLAYER_ID,
    name: PLAYER_NAME,
    isPlayer: true,
    stats: { ...PLAYER_STATS },
    condition: 'ok',
    killed: false,
  });
  encounter.playerPresent = true;
}

function startEdge(encounter: Encounter): number {
  const active = activeParticipants(encounter);
  if (active.length === 0) return EDGE_START;
  const strength = active.reduce((sum, p) => sum + statOf(p, 'strength'), 0) / active.length;
  const edge =
    EDGE_START + 5 * (active.length - encounter.opponent.count) + (strength - encounter.opponent.strength) / 4;
  return Math.round(Math.min(EDGE_START_MAX, Math.max(EDGE_START_MIN, edge)));
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
    edge: EDGE_START,
    round: 0,
    maxRounds: kind.maxRounds,
    log: [],
    bribeCost: kind.bribe ? kind.bribe.base + kind.bribe.perOpponent * count : 0,
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
  encounter.situation = fillText(request.situation ?? kind.situation, textVars(encounter));
  encounter.edge = startEdge(encounter);
  ctx.state.modules.encounters.active.push(encounter);
  ctx.emit('encounter.started', { encounterId: encounter.id, kind: request.kind, request: encounter.request });
  if (encounter.phase === 'rounds' && activeParticipants(encounter).length === 0) nobodyThere(ctx, encounter);
  return encounter;
}

function nobodyThere(ctx: Ctx, encounter: Encounter): void {
  encounter.log.push({
    round: 0,
    actionId: 'none',
    success: false,
    chance: 0,
    text: 'Niemand von euch war da.',
  });
  finish(ctx, encounter, getKind(encounter.kind)?.ifNobody ?? 'failure');
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

/** Freie Leute, die als Verstärkung hinfahren könnten (aktiv, ohne Einsatz, noch nicht dabei), Stärkste zuerst. */
export function backupCandidates(state: GameState, encounter: Encounter): string[] {
  const roles: readonly string[] = BACKUP_ROLES;
  const there = new Set(encounter.participants.map((p) => p.id));
  return getStaff(state)
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
      return { mode, cost: 0, ok: false, reason: `Du bist nicht in ${cityName(encounterCity(encounter))}.` };
    }
    return { mode, cost: 0, ok: true };
  });
}

/** Stadt einer Konfrontation (über ihr Veedel; ohne Veedel die aktive Stadt). */
function encounterCity(encounter: Encounter, state?: GameState): string {
  const veedelId = encounter.request.veedelId;
  return veedelId ? veedelCity(veedelId) : state ? activeCity(state) : 'koeln';
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
export function join(ctx: Ctx, encounterId: number, mode: EncounterMode): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase !== 'briefing') return { ok: false, reason: 'Das ist schon entschieden.' };
  const option = briefingOptions(ctx.state, encounter).find((o) => o.mode === mode);
  if (!option) return { ok: false, reason: 'Das geht hier nicht.' };
  if (!option.ok) return { ok: false, reason: option.reason ?? 'Das geht gerade nicht.' };
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
      encounter.bribeSpent += option.cost;
      const ids = backupCandidates(ctx.state, encounter);
      for (const id of ids) addStaff(ctx.state, encounter, id);
      // Die Verstärkung gehört dazu (Erfahrung, Loyalität, Verletzungen wie bei allen Beteiligten).
      encounter.request.staffIds = [...(encounter.request.staffIds ?? []), ...ids];
      enterRounds(ctx, encounter);
      if (!encounter.outcome) encounter.edge = Math.min(EDGE_START_MAX, encounter.edge + BACKUP_EDGE_BONUS);
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
      finish(ctx, encounter, 'success', {
        relation: PAYOFF_RELATION,
        reputation: PAYOFF_REPUTATION,
        text: fillText('Freigekauft {place}. {opponent} ziehen ab, mit deinem Geld.', vars()),
      });
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
      finish(ctx, encounter, 'retreat', {
        heat: TIPOFF_HEAT,
        goods: TIPOFF_GOODS,
        text: fillText('Bullen gerufen {place}. {opponent} sind weg, die Polizei ist da.', vars()),
      });
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
      finish(ctx, encounter, 'retreat', {
        moneyShare: -ABANDON_CASH_SHARE,
        moneyShareMax: ABANDON_CASH_MAX,
        text: fillText('Spot {place} geräumt. Die Ware ist gerettet, die Kasse nicht.', vars()),
      });
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
  });
}

function enterRounds(ctx: Ctx, encounter: Encounter): void {
  encounter.phase = 'rounds';
  encounter.situation = fillText(
    encounter.request.situation ?? getKind(encounter.kind)?.situation ?? '',
    textVars(encounter),
  );
  encounter.edge = startEdge(encounter);
  if (activeParticipants(encounter).length === 0) nobodyThere(ctx, encounter);
}

/** Eine Runde spielen. */
export function act(ctx: Ctx, encounterId: number, actionId: string): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase === 'briefing') return { ok: false, reason: 'Erst entscheiden, ob du selbst hingehst.' };
  const kind = getKind(encounter.kind);
  const action = kind && resolveAction(kind, actionId);
  if (!kind || !action || !availableActions(encounter).includes(actionId)) {
    return { ok: false, reason: 'Das geht gerade nicht.' };
  }
  if (action.costsBribe) {
    if (!wallet.pay(ctx, encounter.bribeCost, 'dirty', 'Bestechung', lossCategory(encounter))) {
      return { ok: false, reason: `Nicht genug Schwarzgeld (${formatEuro(encounter.bribeCost)}).` };
    }
    encounter.bribeSpent += encounter.bribeCost;
  }
  playRound(ctx, encounter, actionId, action);
  return { ok: true };
}

/** Kosten einer Handlung, die sofort anfallen (weggeworfene Ware). */
function payActionCosts(ctx: Ctx, encounter: Encounter, action: EncounterAction): void {
  if (action.dropsGoods !== undefined) encounter.goodsDropped += loseGoods(ctx, roll(ctx, action.dropsGoods));
}

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

function playRound(ctx: Ctx, encounter: Encounter, actionId: string, action: EncounterAction): void {
  const chance = computeChance(encounter, action);
  const success = ctx.random() < chance;
  encounter.round += 1;
  payActionCosts(ctx, encounter, action);
  const lines = [ctx.pick(success ? action.texts.success : action.texts.failure)];
  if (action.heat) encounter.extraHeat += action.heat;
  const opponent = encounter.opponent;
  const effect = success ? action.onSuccess : action.onFailure;
  encounter.edge = Math.min(100, Math.max(0, encounter.edge + (effect.edge ?? 0)));
  if (success && action.onSuccess.knockdown && opponent.count > 0 && ctx.chance(action.onSuccess.knockdown)) {
    opponent.count -= 1;
    opponent.down += 1;
    lines.push('Einer von ihnen geht zu Boden.');
  }
  if (success && action.onSuccess.scare && opponent.count > 0 && ctx.chance(action.onSuccess.scare)) {
    opponent.count -= 1;
    lines.push('Einer von ihnen haut ab.');
  }
  if (effect.hitChance && ctx.chance(effect.hitChance)) lines.push(hitOwn(ctx, encounter));
  encounter.log.push({ round: encounter.round, actionId, success, chance, text: lines.join(' ') });
  ctx.emit('encounter.round', { encounterId: encounter.id, round: encounter.round, actionId, success });

  const outcome = roundOutcome(encounter, effect.resolve);
  if (outcome) finish(ctx, encounter, outcome);
}

/** Ist die Konfrontation nach dieser Runde vorbei? Dann mit welchem Ausgang. */
function roundOutcome(encounter: Encounter, resolve: EncounterOutcome | undefined): EncounterOutcome | null {
  if (encounter.participants.some((p) => p.isPlayer && p.killed)) return 'failure';
  if (resolve) return resolve;
  if (activeParticipants(encounter).length === 0) return 'failure';
  if (encounter.opponent.count <= 0 || encounter.edge >= 100) return 'success';
  if (encounter.edge <= 0) return 'failure';
  if (encounter.round < encounter.maxRounds) return null;
  if (encounter.edge >= EDGE_WIN_AFTER_ROUNDS) return 'success';
  return encounter.edge >= EDGE_RETREAT_AFTER_ROUNDS ? (getKind(encounter.kind)?.draw ?? 'retreat') : 'failure';
}

/** Die Leute handeln selbst: Runden werden ausgewürfelt, bis es vorbei ist. Ohne Bestechung (kein Geld ohne dich). */
export function autoResolve(ctx: Ctx, encounterId: number): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase === 'briefing') enterRounds(ctx, encounter);
  const kind = getKind(encounter.kind);
  for (let guard = 0; encounter.phase === 'rounds' && kind && guard < 50; guard++) {
    let best: { id: string; action: EncounterAction; score: number } | null = null;
    for (const id of availableActions(encounter)) {
      const action = resolveAction(kind, id);
      if (!action || action.costsBribe) continue;
      const resolve = action.onSuccess.resolve;
      const gain =
        resolve === 'success'
          ? 100
          : resolve === 'retreat'
            ? encounter.edge < 30
              ? 60
              : 0
            : (action.onSuccess.edge ?? 0);
      const score = computeChance(encounter, action) * gain;
      if (!best || score > best.score) best = { id, action, score };
    }
    if (!best) {
      finish(ctx, encounter, 'failure');
      break;
    }
    playRound(ctx, encounter, best.id, best.action);
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

function loseGoods(ctx: Ctx, amount: number): number {
  let left = Math.max(0, Math.round(amount));
  let lost = 0;
  // Was bei einer Konfrontation verloren geht, liegt in der Stadt, in der sie spielt (die aktive).
  for (const warehouse of getWarehouses(ctx.state, activeCity(ctx.state))) {
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
    result.goods -= loseGoods(ctx, -goods);
  }
  if (effects.goodsShare && effects.goodsShare < 0) {
    result.goods -= loseGoods(ctx, getStock(ctx.state) * -effects.goodsShare);
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
    const heat = (effects.heat ?? 0) + encounter.extraHeat;
    if (heat) {
      addHeat(ctx, veedelId, heat);
      result.heat += heat;
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
      if (ctx.chance(effects.arrestChance) && setStatus(ctx, p.id, 'jailed')) result.staffArrested.push(p.id);
    }
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
  if (result.money !== 0) details.push(`${result.money > 0 ? '+' : '−'}${formatEuro(Math.abs(result.money))}`);
  if (result.goods !== 0) {
    details.push(`${result.goods > 0 ? '+' : '−'}${formatAmount(Math.abs(result.goods), goodsUnit())} Ware`);
  }
  if (result.playerInjured) details.push('du bist verletzt');
  if (result.staffInjured.length) details.push(`${names(result.staffInjured.map(nameOf))} verletzt`);
  if (result.staffKilled.length) details.push(`${names(result.staffKilled.map(nameOf))} tot`);
  if (result.staffArrested.length) details.push(`${names(result.staffArrested.map(nameOf))} festgenommen`);
  return details.length ? `${headline} (${details.join(', ')})` : headline;
}

/** Konfrontation beenden. override ersetzt die Folgen (z.B. die Wege im Briefing wie Freikaufen). */
function finish(ctx: Ctx, encounter: Encounter, outcome: EncounterOutcome, override?: EncounterEffects): void {
  const kind = getKind(encounter.kind);
  const state = ctx.state.modules.encounters;
  const player = encounter.participants.find((p) => p.isPlayer);
  encounter.phase = 'done';
  encounter.outcome = outcome;
  encounter.resolvedAt = ctx.now;
  encounter.playerKilled = !!player?.killed;

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
  if (effects && !encounter.playerKilled) applyEffects(ctx, encounter, effects, result);
  else if (!effects && !encounter.playerKilled && encounter.extraHeat > 0 && encounter.request.veedelId) {
    // Der Auslöser regelt die Folgen selbst (skipEffects, z.B. die Verkehrskontrolle), der Heat aus den Handlungen
    // ("Gewalt gegen Polizei") gilt trotzdem.
    addHeat(ctx, encounter.request.veedelId, encounter.extraHeat);
    result.heat += encounter.extraHeat;
  }

  const vars = textVars(encounter);
  const lastWords = encounter.log.at(-1)?.text ?? 'Du bist nicht mehr aufgestanden.';
  const headline = encounter.playerKilled
    ? `${kind?.name ?? 'Konfrontation'} ${encounter.place}. ${lastWords}`
    : fillText(effects?.text ?? DEFAULT_TEXT[outcome], vars);
  result.text = describeResult(encounter, result, headline);
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
