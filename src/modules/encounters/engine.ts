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
  wallet,
} from '../../core';
import { allProducts, DEFAULT_PRODUCT, getProduct, getStock, getWarehouses, store, take } from '../goods';
import { addHeat } from '../police';
import { changeReputation } from '../reputation';
import { getSpot } from '../spots';
import { getStaffMember, setStatus } from '../staff';
import { addInfluence, PLAYER_FACTION } from '../territory';
import { veedelName } from '../veedel';
import { ENCOUNTER_ACTIONS } from './actions';
import {
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
  PLAYER_FIRST_HIT_LETHAL,
  PLAYER_HIT_WEIGHT,
  PLAYER_LETHAL_CHANCE,
  PLAYER_NAME,
  PLAYER_PRESENT_BONUS,
  PLAYER_STATS,
  STAFF_DEATH_CHANCE,
} from './config';
import { ENCOUNTER_KINDS } from './kinds';
import type {
  Amount,
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterKind,
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
  const participants: Participant[] = [];
  for (const id of new Set(request.staffIds ?? [])) {
    const member = getStaffMember(ctx.state, id);
    if (member?.status !== 'active') continue;
    const { speed, caution, strength, charisma } = member.stats;
    participants.push({
      id,
      name: member.name,
      isPlayer: false,
      stats: { speed, caution, strength, charisma },
      condition: 'ok',
      killed: false,
    });
  }
  const count = Math.max(1, Math.round(request.opponent?.count ?? roll(ctx, kind.opponent.count)));
  const encounter: Encounter = {
    id: ctx.nextId(),
    kind: request.kind,
    request: structuredClone(request),
    startedAt: ctx.now,
    phase: 'rounds',
    situation: '',
    place: placeOf(ctx.state, request),
    playerPresent: false,
    participants,
    opponent: {
      label: request.opponent?.label ?? kind.opponent.label,
      factionId: request.opponent?.factionId ?? null,
      strength: request.opponent?.strength ?? kind.opponent.strength,
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
    bribeSpent: 0,
    deadline: ctx.now + DECISION_TIMEOUT,
    outcome: null,
    resolvedAt: null,
    playerKilled: false,
    result: null,
  };
  if (request.playerPresent === true) addPlayer(encounter);
  else if (request.playerPresent === undefined && kind.joinable) encounter.phase = 'briefing';
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

/** Spieler entscheidet: selbst hin (mehr Möglichkeiten, bessere Chancen, Todesgefahr) oder die Leute machen lassen. */
export function join(ctx: Ctx, encounterId: number, present: boolean): CommandResult {
  const encounter = findActive(ctx, encounterId);
  if (!encounter) return { ok: false, reason: 'Diese Konfrontation ist schon vorbei.' };
  if (encounter.phase !== 'briefing') return { ok: false, reason: 'Das ist schon entschieden.' };
  if (present) addPlayer(encounter);
  enterRounds(ctx, encounter);
  return { ok: true };
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
    if (!wallet.pay(ctx, encounter.bribeCost, 'dirty', 'Bestechung')) {
      return { ok: false, reason: `Nicht genug Schwarzgeld (${formatEuro(encounter.bribeCost)}).` };
    }
    encounter.bribeSpent += encounter.bribeCost;
  }
  playRound(ctx, encounter, actionId, action);
  return { ok: true };
}

function hitOwn(ctx: Ctx, encounter: Encounter): string {
  const active = activeParticipants(encounter);
  if (active.length === 0) return '';
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
  return encounter.edge >= EDGE_RETREAT_AFTER_ROUNDS ? 'retreat' : 'failure';
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
  for (const warehouse of getWarehouses(ctx.state)) {
    for (const product of allProducts()) {
      if (left <= 0) return lost;
      const { taken } = take(ctx, { productId: product.id, amount: left, warehouseId: warehouse.id, partial: true });
      left -= taken;
      lost += taken;
    }
  }
  return lost;
}

function applyEffects(ctx: Ctx, encounter: Encounter, effects: EncounterEffects, result: EncounterResult): void {
  const stakes = encounter.request.stakes ?? {};
  const reason = getKind(encounter.kind)?.name ?? 'Konfrontation';

  let money = 0;
  if (effects.money !== undefined) money += roll(ctx, effects.money);
  if (effects.stakeMoney) money += Math.round((stakes.money ?? 0) * effects.stakeMoney);
  if (money > 0) {
    wallet.earn(ctx, money, 'dirty', reason);
    result.money += money;
  } else if (money < 0) {
    result.money -= wallet.lose(ctx, -money, 'dirty', reason);
  }
  if (effects.moneyShare && effects.moneyShare < 0) {
    const share = Math.round(wallet.balance(ctx.state, 'dirty') * -effects.moneyShare);
    result.money -= wallet.lose(ctx, Math.min(share, effects.moneyShareMax ?? share), 'dirty', reason);
  }

  let goods = 0;
  if (effects.goods !== undefined) goods += roll(ctx, effects.goods);
  if (effects.stakeGoods) goods += Math.round((stakes.goods ?? 0) * effects.stakeGoods);
  if (goods > 0) {
    store(ctx, { productId: DEFAULT_PRODUCT, amount: goods });
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
    changeReputation(ctx, effects.reputation);
    result.reputation += effects.reputation;
  }
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

function finish(ctx: Ctx, encounter: Encounter, outcome: EncounterOutcome): void {
  const kind = getKind(encounter.kind);
  const state = ctx.state.modules.encounters;
  const player = encounter.participants.find((p) => p.isPlayer);
  encounter.phase = 'done';
  encounter.outcome = outcome;
  encounter.resolvedAt = ctx.now;
  encounter.playerKilled = !!player?.killed;

  const result: EncounterResult = {
    money: 0 - encounter.bribeSpent,
    goods: 0,
    opponentLosses: encounter.opponent.down,
    staffInjured: [],
    staffKilled: [],
    staffArrested: [],
    playerInjured: player?.condition === 'injured',
    heat: 0,
    influence: 0,
    reputation: 0,
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
  const effects = encounter.request.skipEffects
    ? undefined
    : (encounter.request.effects?.[outcome] ?? kind?.outcomes[outcome]);
  if (effects && !encounter.playerKilled) applyEffects(ctx, encounter, effects, result);

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
  journal.add(ctx, result.text, outcome === 'success' ? 'good' : outcome === 'failure' ? 'bad' : 'info', ref);

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
  });
  if (encounter.playerKilled) gameOutcome.gameOver(ctx, 'killed', headline);
}
