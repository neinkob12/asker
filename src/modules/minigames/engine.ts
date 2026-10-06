// Ablauf der Minispiele im Simulationskern: starten, Ergebnis prüfen und melden, Rechte Hand würfeln, Frist.
// Das Spiel selbst läuft in der Oberfläche (ui/); in die Simulation kommt nur das Ergebnis als Befehl.

import { type CommandResult, type Ctx, type GameState, journal, keyedRandom } from '../../core';
import { activeCity } from '../city';
import { activeRightHand, rightHandRank } from '../hierarchy';
import { CHECK_FACTOR_BY_CITY, getHeat, operationTier } from '../police';
import { getStaffMember } from '../staff';
import { getVeedel, veedelCity } from '../veedel';
import {
  DEFAULT_WIN_AT,
  DIFFICULTY,
  HISTORY_LIMIT,
  MINIGAME_TIMEOUT,
  PICK_MAX_LENGTH,
  PICKS_MAX,
  RIGHT_HAND_CHANCE,
  RIGHT_HAND_LOSE_SCORE,
  RIGHT_HAND_WIN_SCORE,
} from './config';
import { MINIGAME_KIND_IDS, MINIGAME_KINDS } from './kinds';
import type { Challenge, MinigameBy, MinigameKind, MinigameRequest, MinigameStats, MinigamesState } from './types';

// ---------------------------------------------------------------------------------------------
// Lesen

export function emptyStats(): Record<MinigameKind, MinigameStats> {
  return Object.fromEntries(MINIGAME_KIND_IDS.map((k) => [k, { played: 0, won: 0, delegated: 0 }])) as Record<
    MinigameKind,
    MinigameStats
  >;
}

export function initialState(): MinigamesState {
  return { active: [], history: [], stats: emptyStats(), nextId: 1 };
}

/** Ist die Art scharf (ready: true)? Unbekannte Arten nie. */
export function isMinigameReady(kind: string): boolean {
  return MINIGAME_KINDS[kind as MinigameKind]?.ready === true;
}

export function getChallenge(state: GameState, id: number): Challenge | undefined {
  return state.modules.minigames?.active.find((c) => c.id === id);
}

/** Das älteste offene Minispiel (für die Oberfläche), sonst undefined. */
export function activeChallenge(state: GameState): Challenge | undefined {
  return state.modules.minigames?.active[0];
}

/** Ab welchem Score die Art als geschafft gilt. */
export function winAt(kind: MinigameKind): number {
  return MINIGAME_KINDS[kind]?.winAt ?? DEFAULT_WIN_AT;
}

/** Chance der Rechten Hand aus ihrem Wert (0–100) und ihrer Stufe. */
export function delegateChance(stat: number, rank: number): number {
  const c = RIGHT_HAND_CHANCE;
  return Math.min(c.max, Math.max(c.min, c.base + (c.perStat * stat) / 100 + c.perRank * rank));
}

/**
 * Kann die Rechte Hand übernehmen, und mit welcher Chance? Nur mit aktiver Rechter Hand in der Stadt des Minispiels
 * (`activeRightHand` aus hierarchy), sonst null.
 */
export function delegateInfo(
  state: GameState,
  challenge: Challenge,
): { staffId: string; name: string; chance: number } | null {
  const post = activeRightHand(state, challenge.cityId);
  const member = post ? getStaffMember(state, post.staffId) : undefined;
  if (!post || !member) return null;
  const stat = member.stats[MINIGAME_KINDS[challenge.kind].stat] ?? 0;
  return {
    staffId: member.id,
    name: member.name,
    chance: delegateChance(stat, rightHandRank(state, challenge.cityId)),
  };
}

/**
 * Schwierigkeit eines Minispiels aus der Lage (0,2 bis 0,95): Polizeipräsenz und Heat im Veedel, Polizei-Härte
 * in der Stadt (police tier) und wie streng die Stadt kontrolliert (CHECK_FACTOR_BY_CITY).
 */
export function minigameDifficulty(state: GameState, where: { cityId?: string; veedelId?: string }): number {
  const veedel = where.veedelId ? getVeedel(where.veedelId) : undefined;
  const cityId = where.cityId ?? (veedel ? veedelCity(veedel.id) : activeCity(state));
  const d = DIFFICULTY;
  const presence = veedel?.policePresence ?? 1;
  const heat = veedel && state.modules.police ? getHeat(state, veedel.id) : 0;
  const tier = state.modules.police ? operationTier(state, cityId).index : 0;
  const city = CHECK_FACTOR_BY_CITY[cityId] ?? 1;
  const value =
    d.base + d.presence * (presence - 1) + (d.heat * Math.min(100, heat)) / 100 + d.tier * tier + d.city * (city - 1);
  return round2(Math.min(d.max, Math.max(d.min, value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/** Seed eines Minispiels: fest aus Spiel-Seed und ID, ohne einen Wurf aus einem Zufallsstrom. */
export function challengeSeed(gameSeed: number, id: number): number {
  return Math.floor(keyedRandom(`minigame:${gameSeed}:${id}`)() * 2 ** 31);
}

/**
 * Minispiel starten. null, wenn die Art nicht scharf ist (ready: false), das Spiel vorbei ist oder für diesen
 * Auslöser (origin) schon eins offen ist. Die Oberfläche öffnet den Rahmen auf 'minigame.started'.
 */
export function startMinigame(ctx: Ctx, request: MinigameRequest): number | null {
  if (!isMinigameReady(request.kind) || ctx.state.outcome.gameOver) return null;
  const s = ctx.state.modules.minigames;
  const origin = { module: request.origin.module, ref: request.origin.ref };
  if (s.active.some((c) => c.origin.module === origin.module && c.origin.ref === origin.ref)) return null;
  const cityId = request.cityId ?? (request.veedelId ? veedelCity(request.veedelId) : activeCity(ctx.state));
  const id = s.nextId++;
  const difficulty = request.difficulty ?? minigameDifficulty(ctx.state, { cityId, veedelId: request.veedelId });
  const challenge: Challenge = {
    id,
    kind: request.kind,
    origin,
    cityId,
    ...(request.veedelId ? { veedelId: request.veedelId } : {}),
    seed: challengeSeed(ctx.state.meta.seed, id),
    difficulty: round2(Math.min(1, Math.max(0, Number.isFinite(difficulty) ? difficulty : 0.5))),
    title: request.title,
    situation: request.situation,
    params: structuredClone(request.params ?? {}),
    startedAt: ctx.now,
    deadline: ctx.now + MINIGAME_TIMEOUT,
  };
  s.active.push(challenge);
  ctx.emit('minigame.started', { id, kind: challenge.kind, origin, cityId });
  return id;
}

/** Score aus der Oberfläche: endlich und in [0, 1], sonst 0. */
export function cleanScore(score: unknown): number {
  return typeof score === 'number' && Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
}

/** picks aus der Oberfläche: nur kurze Texte, höchstens PICKS_MAX. */
export function cleanPicks(picks: unknown): string[] {
  if (!Array.isArray(picks)) return [];
  return picks
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .slice(0, PICKS_MAX)
    .map((p) => p.slice(0, PICK_MAX_LENGTH));
}

/** Minispiel entscheiden: aus der Liste nehmen, Verlauf und Statistik, Ereignis 'minigame.finished'. */
function resolve(ctx: Ctx, challenge: Challenge, by: MinigameBy, score: number | null, picks: string[]): void {
  const s = ctx.state.modules.minigames;
  const won = score !== null && score >= winAt(challenge.kind);
  s.active = s.active.filter((c) => c.id !== challenge.id);
  s.history.unshift({ id: challenge.id, kind: challenge.kind, origin: challenge.origin, score, by, won, at: ctx.now });
  if (s.history.length > HISTORY_LIMIT) s.history.length = HISTORY_LIMIT;
  s.stats[challenge.kind] ??= { played: 0, won: 0, delegated: 0 };
  const stats = s.stats[challenge.kind];
  if (by !== 'timeout') stats.played += 1;
  if (won) stats.won += 1;
  if (by === 'rightHand') stats.delegated += 1;
  ctx.emit('minigame.finished', {
    id: challenge.id,
    kind: challenge.kind,
    origin: challenge.origin,
    cityId: challenge.cityId,
    score,
    won,
    by,
    picks,
  });
}

/** Ergebnis des Spielers (Befehl 'minigames.finish'). Score und picks werden geprüft und begrenzt. */
export function finishMinigame(ctx: Ctx, id: number, score: unknown, picks?: unknown): CommandResult {
  const challenge = getChallenge(ctx.state, id);
  if (!challenge) return { ok: false, reason: 'Dieses Minispiel ist schon vorbei.' };
  resolve(ctx, challenge, 'player', cleanScore(score), cleanPicks(picks));
  return { ok: true };
}

/** Die Rechte Hand übernimmt (Befehl 'minigames.delegate'): Würfel mit ihrer Chance, fester Score. */
export function delegateMinigame(ctx: Ctx, id: number): CommandResult {
  const challenge = getChallenge(ctx.state, id);
  if (!challenge) return { ok: false, reason: 'Dieses Minispiel ist schon vorbei.' };
  const info = delegateInfo(ctx.state, challenge);
  if (!info) return { ok: false, reason: 'Hier hast du keine Rechte Hand, die übernehmen könnte.' };
  const won = ctx.chance(info.chance);
  const name = MINIGAME_KINDS[challenge.kind].name;
  journal.add(
    ctx,
    `${info.name} übernimmt: ${challenge.title || name}. ${won ? 'Geschafft.' : 'Nicht geschafft.'}`,
    won ? 'good' : 'bad',
    challenge.veedelId ? { veedelId: challenge.veedelId } : undefined,
  );
  resolve(ctx, challenge, 'rightHand', won ? RIGHT_HAND_WIN_SCORE : RIGHT_HAND_LOSE_SCORE, []);
  return { ok: true };
}

/**
 * Sofort als timeout auflösen, wie nach Ablauf der Frist (für Tests, Bot und Module, die nicht warten können):
 * Dann gilt das alte Verhalten (score null, won false).
 */
export function resolveMinigameNow(ctx: Ctx, id: number): boolean {
  const challenge = getChallenge(ctx.state, id);
  if (!challenge) return false;
  resolve(ctx, challenge, 'timeout', null, []);
  return true;
}

/** Abgelaufene Fristen (tick). */
export function expireChallenges(ctx: Ctx): void {
  for (const challenge of [...ctx.state.modules.minigames.active]) {
    if (challenge.deadline <= ctx.now) resolve(ctx, challenge, 'timeout', null, []);
  }
}
