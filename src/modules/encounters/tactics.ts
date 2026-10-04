// Rechenregeln der Konfrontationen (Auftrag 35): Zeiger, Würfel-Stärke, Absicht, Gegner mit Rollen, Einsätze,
// Polizei-Uhr. Reine Funktionen über dem Zustand einer Konfrontation; Zufall nur über ctx.
//
// Zeiger: Aggression (ab AGGRESSION_FIGHT wird geprügelt) und Entschlossenheit (unter RETREAT_AT zieht die Gegenseite
// ab). Eine Handlung hat eine Grundwirkung auf beide (actions.ts). Die Stärke einer Runde M = Würfel × Wert der
// Beteiligten × Faktor der Absicht: Was gut für euch ist (Zeiger runter), wirkt mit M; was schlecht ist (Zeiger hoch),
// mit (2 − M). Ein starker Wurf hilft also doppelt, ein schwacher schadet doppelt, die Richtung bleibt immer gleich.

import type { Ctx, GameState } from '../../core';
import { getGang } from '../gangs';
import { getHeat } from '../police';
import { getVeedel } from '../veedel';
import {
  CLOCK_HEAT_STEP,
  CLOCK_MAX,
  CLOCK_MIN,
  CLOCK_PER_PRESENCE,
  DICE_MAX,
  DICE_MIN,
  GAUGE_START_MAX,
  GAUGE_START_MIN,
  INJURY_PENALTY,
  NUMBERS_BONUS,
  PLAYER_PRESENT_FACTOR,
  START_RESOLVE_PER_PERSON,
  START_RESOLVE_PER_STRENGTH,
  STAT_FACTOR_MAX,
  STAT_FACTOR_MIN,
  STAT_FACTOR_PER_POINT,
  STRENGTH_MAX,
  STRENGTH_MIN,
} from './config';
import { ENCOUNTER_INTENTS } from './intents';
import type {
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterIntent,
  EncounterKind,
  EncounterRequest,
  EncounterStat,
  Foe,
  FoeRole,
  GaugeShift,
  Participant,
  StakeId,
} from './types';

export const STAKE_NAMES: Record<StakeId, string> = {
  goods: 'Ware',
  cash: 'Kasse',
  people: 'Leute',
  spot: 'Spot',
  noise: 'Lärm',
};

export const ROLE_NAMES: Record<FoeRole, string> = {
  leader: 'Anführer',
  nervous: 'Nervöser',
  bruiser: 'Schläger',
};

/** Name eines Einsatzes in diesem Anlass (z.B. "Ladung" statt "Ware"). */
export function stakeName(kind: EncounterKind | undefined, stake: StakeId): string {
  return kind?.stakeLabels?.[stake] ?? STAKE_NAMES[stake];
}

export function getIntent(id: string | null | undefined): EncounterIntent | undefined {
  return id ? ENCOUNTER_INTENTS[id] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Gegner mit Rollen

/** Gegner aufstellen: erst die Anführer, dann die Nervösen, der Rest sind Schläger. */
export function buildFoes(count: number, kind: EncounterKind | undefined): Foe[] {
  const roles = kind?.roles ?? { leader: 1, nervous: 1 };
  const foes: Foe[] = [];
  for (let i = 0; i < count; i++) {
    const role: FoeRole =
      i < roles.leader ? 'leader' : i < roles.leader + (count > 1 ? roles.nervous : 0) ? 'nervous' : 'bruiser';
    foes.push({ role, state: 'in' });
  }
  return foes;
}

export function foesIn(encounter: Encounter, role?: FoeRole): number {
  return encounter.foes.filter((f) => f.state === 'in' && (!role || f.role === role)).length;
}

/** Einen Gegner rausnehmen (zu Boden oder weg). Getroffen werden zuerst die Schläger, der Anführer zuletzt. */
export function removeFoe(encounter: Encounter, how: 'down' | 'gone', role?: FoeRole): FoeRole | null {
  const order: FoeRole[] = role ? [role] : ['bruiser', 'nervous', 'leader'];
  for (const r of order) {
    const foe = encounter.foes.find((f) => f.state === 'in' && f.role === r);
    if (!foe) continue;
    foe.state = how;
    encounter.opponent.count = foesIn(encounter);
    if (how === 'down') encounter.opponent.down += 1;
    return r;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Stärke einer Handlung

export function activeOwn(encounter: Encounter): Participant[] {
  return encounter.participants.filter((p) => p.condition !== 'down');
}

function statOf(p: Participant, stat: EncounterStat): number {
  return p.stats[stat] - (p.condition === 'injured' ? INJURY_PENALTY : 0);
}

/** Wert der Beteiligten als Faktor (1 = so stark wie die Gegenseite), mit Überzahl und Boss vor Ort. */
export function statFactor(encounter: Encounter, action: EncounterAction): number {
  const active = activeOwn(encounter);
  if (active.length === 0) return STAT_FACTOR_MIN;
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
  let factor = 1 + (value - opponent.strength) * STAT_FACTOR_PER_POINT;
  if (action.numbers) factor += NUMBERS_BONUS * (active.length - opponent.count);
  if (player) factor += PLAYER_PRESENT_FACTOR;
  return Math.min(STAT_FACTOR_MAX, Math.max(STAT_FACTOR_MIN, factor));
}

/** Faktor der aktuellen Absicht auf eine Handlung (z.B. Verhandeln ×1,6, wenn der Anführer reden will). */
export function intentFactor(encounter: Encounter, actionId: string): number {
  return getIntent(encounter.intent)?.modifiers?.[actionId] ?? 1;
}

/** Würfel zwischen DICE_MIN und DICE_MAX. */
export function rollDice(ctx: Ctx): number {
  return DICE_MIN + ctx.random() * (DICE_MAX - DICE_MIN);
}

/** Wirkung auf die Zeiger bei Stärke m: Gutes (negativ) mal m, Schlechtes (positiv) mal (2 − m). */
export function scaleShift(base: GaugeShift, m: number): GaugeShift {
  const scale = (v: number) => (v < 0 ? v * m : v * Math.max(0.1, 2 - m));
  return { aggression: Math.round(scale(base.aggression)), resolve: Math.round(scale(base.resolve)) };
}

/** Stärke einer Runde: Würfel × Wert der Beteiligten × Absicht. */
export function roundStrength(encounter: Encounter, action: EncounterAction, actionId: string, dice: number): number {
  const m = dice * statFactor(encounter, action) * intentFactor(encounter, actionId);
  return Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, m));
}

export interface ShiftPreview {
  /** Bei schwachem, mittlerem und starkem Würfel. */
  weak: GaugeShift;
  mid: GaugeShift;
  strong: GaugeShift;
}

/** Was eine Handlung an den Zeigern bewirkt, bevor man tippt (für die Pfeile im Dialog und die Strategie). */
export function previewShift(encounter: Encounter, action: EncounterAction, actionId: string): ShiftPreview {
  const at = (dice: number) => scaleShift(action.shift, roundStrength(encounter, action, actionId, dice));
  return { weak: at(DICE_MIN), mid: at(1), strong: at(DICE_MAX) };
}

export function clampGauge(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function applyShift(encounter: Encounter, shift: Partial<GaugeShift>): void {
  if (shift.aggression) encounter.aggression = clampGauge(encounter.aggression + shift.aggression);
  if (shift.resolve) encounter.resolve = clampGauge(encounter.resolve + shift.resolve);
}

// ---------------------------------------------------------------------------------------------
// Absicht

/** Kann diese Absicht gerade kommen? Die Rolle muss dabei sein, der Einsatz im Anlass vorkommen. */
export function intentPossible(encounter: Encounter, kind: EncounterKind, id: string): boolean {
  const intent = ENCOUNTER_INTENTS[id];
  if (!intent) return false;
  if (intent.needs && foesIn(encounter, intent.needs) === 0) return false;
  if (intent.stake && !encounter.stakes.some((s) => s.id === intent.stake)) return false;
  void kind;
  return true;
}

function intentWeight(encounter: Encounter, intent: EncounterIntent): number {
  const w = intent.weight;
  const a = encounter.aggression / 100;
  const r = encounter.resolve / 100;
  return (
    w.base +
    (w.aggression ?? 0) * a +
    (w.calm ?? 0) * (1 - a) +
    (w.resolve ?? 0) * r +
    (w.doubt ?? 0) * (1 - r) +
    (encounter.brawl ? (w.brawl ?? 0) : 0)
  );
}

/** Nächste Absicht würfeln, gewichtet nach Zeigern; nie zweimal hintereinander dieselbe, wenn es eine andere gibt. */
export function rollIntent(ctx: Ctx, encounter: Encounter, kind: EncounterKind): string | null {
  const ids = kind.intents.filter((id) => intentPossible(encounter, kind, id));
  const pool = ids.length > 1 ? ids.filter((id) => id !== encounter.intent) : ids;
  if (pool.length === 0) return null;
  const weights = pool.map((id) => Math.max(0.01, intentWeight(encounter, ENCOUNTER_INTENTS[id])));
  let pick = ctx.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i];
    if (pick < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Erste mögliche Absicht ohne Würfel (für Migrationen alter Spielstände). */
export function firstIntent(encounter: Encounter, kind: EncounterKind): string | null {
  return kind.intents.find((id) => intentPossible(encounter, kind, id)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Start: Zeiger und Polizei-Uhr

/**
 * Startwerte der Zeiger: Grundwerte des Anlasses, mehr Entschlossenheit bei Überzahl und Kraft der Gegenseite,
 * mehr Aggression bei einer aggressiven Gang.
 */
export function startGauges(state: GameState, encounter: Encounter, kind: EncounterKind): GaugeShift {
  const active = activeOwn(encounter);
  const strength = active.length
    ? active.reduce((sum, p) => sum + statOf(p, 'strength'), 0) / active.length
    : encounter.opponent.strength;
  const resolve =
    kind.gauges.resolve +
    START_RESOLVE_PER_PERSON * (encounter.opponent.count - Math.max(1, active.length)) +
    START_RESOLVE_PER_STRENGTH * (encounter.opponent.strength - strength) -
    (active.some((p) => p.isPlayer) ? 5 : 0);
  const aggression = kind.gauges.aggression * gangTemper(state, encounter.opponent.factionId);
  const clamp = (v: number) => Math.round(Math.min(GAUGE_START_MAX, Math.max(GAUGE_START_MIN, v)));
  return { aggression: clamp(aggression), resolve: clamp(resolve) };
}

/** Wie schnell eine Gang zuschlägt (Gang-Stil, 1 = normal). Ohne Gang 1. */
export function gangTemper(state: GameState, factionId: string | null): number {
  if (!factionId) return 1;
  return gangTraits(state, factionId)?.aggression ?? 1;
}

/** Werte einer Gang, falls die Gegenseite eine ist. */
export function gangTraits(state: GameState, factionId: string): { aggression: number; fighting: number } | undefined {
  return getGang(state, factionId)?.traits;
}

/**
 * Polizei-Uhr zu Beginn: Runden bis zur Streife aus dem Anlass, kürzer bei hoher Polizeipräsenz und Heat im Veedel.
 */
export function startClock(state: GameState, request: EncounterRequest, kind: EncounterKind): number {
  let clock = kind.clock;
  const veedelId = request.veedelId;
  if (veedelId) {
    const presence = getVeedel(veedelId)?.policePresence ?? 1;
    clock -= Math.round((presence - 1) * CLOCK_PER_PRESENCE);
    clock -= Math.floor(getHeat(state, veedelId) / CLOCK_HEAT_STEP);
  }
  return Math.min(CLOCK_MAX, Math.max(CLOCK_MIN, clock));
}

// ---------------------------------------------------------------------------------------------
// Einsätze und Folgen

/** Schaden an einem Einsatz erhöhen (begrenzt auf 0–cap). */
export function damageStake(encounter: Encounter, stake: StakeId, amount: number, cap = 100): void {
  const s = encounter.stakes.find((x) => x.id === stake);
  if (!s) return;
  s.damage = Math.max(s.damage, Math.min(cap, s.damage + Math.max(0, amount)));
}

export function stakeDamage(encounter: Encounter, stake: StakeId): number {
  return encounter.stakes.find((x) => x.id === stake)?.damage ?? 0;
}

type EffectKey = keyof EncounterEffects;

/** Welche Folge zu welchem Einsatz gehört (Verlust bzw. Gewinn). Alles andere gilt für die ganze Sache. */
const STAKE_OF: Partial<Record<EffectKey, StakeId>> = {
  goods: 'goods',
  goodsShare: 'goods',
  stakeGoods: 'goods',
  money: 'cash',
  moneyShare: 'cash',
  stakeMoney: 'cash',
  influence: 'spot',
  opponentInfluence: 'spot',
  heat: 'noise',
  arrestChance: 'people',
};

/** Ist dieser Teil der Folgen ein Verlust für dich? */
function isLoss(key: EffectKey, value: unknown): boolean {
  if (key === 'opponentInfluence' || key === 'heat' || key === 'arrestChance') return Number(value) > 0;
  if (Array.isArray(value)) return Math.min(value[0], value[1]) < 0;
  return typeof value === 'number' && value < 0;
}

export interface SplitEffects {
  /** Gilt unabhängig von den Einsätzen (Text, Ruf, Beziehung …). */
  base: EncounterEffects;
  losses: Partial<Record<StakeId, EncounterEffects>>;
  gains: Partial<Record<StakeId, EncounterEffects>>;
}

/** Folgen nach Einsätzen aufteilen. Einsätze, die der Anlass nicht kennt, bleiben in base (wie bisher). */
export function splitEffects(effects: EncounterEffects | undefined, stakes: readonly StakeId[]): SplitEffects {
  const split: SplitEffects = { base: {}, losses: {}, gains: {} };
  if (!effects) return split;
  for (const [k, value] of Object.entries(effects)) {
    const key = k as EffectKey;
    const stake = STAKE_OF[key];
    if (value === undefined) continue;
    if (!stake || !stakes.includes(stake)) {
      (split.base as Record<string, unknown>)[key] = value;
      continue;
    }
    const bucket = isLoss(key, value) ? split.losses : split.gains;
    bucket[stake] ??= {};
    (bucket[stake] as Record<string, unknown>)[key] = value;
    // Die Obergrenze gehört zum Anteil.
    if (key === 'moneyShare' && effects.moneyShareMax !== undefined) {
      (bucket[stake] as Record<string, unknown>).moneyShareMax = effects.moneyShareMax;
    }
  }
  delete (split.base as Record<string, unknown>).moneyShareMax;
  if (effects.moneyShareMax !== undefined && !stakes.includes('cash')) split.base.moneyShareMax = effects.moneyShareMax;
  if (effects.goodsQuality !== undefined) {
    split.base.goodsQuality = effects.goodsQuality;
    if (split.gains.goods) split.gains.goods.goodsQuality = effects.goodsQuality;
  }
  return split;
}

/** Folgen mit einem Faktor (0–1) skalieren: Mengen, Anteile, Einfluss, Heat, Festnahme-Chance. */
export function scaleEffects(effects: EncounterEffects, factor: number): EncounterEffects {
  const f = Math.max(0, Math.min(1, factor));
  const out: EncounterEffects = {};
  const num = (v: number) => Math.round(v * f);
  const amount = (v: number | readonly [number, number]) =>
    typeof v === 'number' ? num(v) : ([num(v[0]), num(v[1])] as const);
  if (effects.money !== undefined) out.money = amount(effects.money);
  if (effects.goods !== undefined) out.goods = amount(effects.goods);
  if (effects.goodsQuality !== undefined) out.goodsQuality = effects.goodsQuality;
  if (effects.moneyShare !== undefined) out.moneyShare = effects.moneyShare * f;
  if (effects.moneyShareMax !== undefined) out.moneyShareMax = Math.round(effects.moneyShareMax * f);
  if (effects.goodsShare !== undefined) out.goodsShare = effects.goodsShare * f;
  if (effects.stakeMoney !== undefined) out.stakeMoney = effects.stakeMoney * f;
  if (effects.stakeGoods !== undefined) out.stakeGoods = effects.stakeGoods * f;
  if (effects.influence !== undefined) out.influence = num(effects.influence);
  if (effects.opponentInfluence !== undefined) out.opponentInfluence = num(effects.opponentInfluence);
  if (effects.heat !== undefined) out.heat = num(effects.heat);
  if (effects.arrestChance !== undefined) out.arrestChance = effects.arrestChance * f;
  return out;
}

/** Lage für alte Anzeigen und Aufrufer (0 = verloren, 100 = gewonnen): je weniger entschlossen, desto besser. */
export function edgeOf(encounter: Encounter): number {
  return clampGauge(100 - encounter.resolve);
}
