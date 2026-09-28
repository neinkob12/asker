// Ruf: ein globaler Wert für das ganze Geschäft (0–100).
// Steigt durch gute Qualität und Zuverlässigkeit, sinkt durch gestreckte Ware und abgewiesene Kunden
// (die Anlässe meldet vor allem das customers-Modul). Wirkt auf die Nachfrage und auf Stammkunden.
//
// Öffentliche API:
//   getReputation(state), changeReputation(ctx, delta, reason?), reputationDemandFactor(state),
//   reputationLabel(value), recentReputationChanges(state), START_REPUTATION
// Ereignisse: 'reputation.changed'

import { type Ctx, defineModule, type GameState } from '../../core';
import {
  DAILY_DRIFT,
  DEMAND_FACTOR_MAX,
  DEMAND_FACTOR_MIN,
  RECENT_LIMIT,
  RECENT_MERGE_MINUTES,
  REPUTATION_LABELS,
  START_REPUTATION,
} from './config';

export { START_REPUTATION } from './config';

export interface ReputationChange {
  time: number;
  delta: number;
  reason: string;
}

export interface ReputationState {
  value: number;
  /** Letzte Änderungen mit Grund, neueste zuerst (gleiche Gründe zusammengefasst). */
  recent: ReputationChange[];
}

interface ReputationStateV1 {
  value: number;
}

declare module '../../core' {
  interface ModuleStates {
    reputation: ReputationState;
  }
  interface GameEvents {
    'reputation.changed': { value: number; delta: number; reason?: string };
  }
}

export function getReputation(state: GameState): number {
  return state.modules.reputation.value;
}

/** Faktor auf die Nachfrage: 0,7 bei Ruf 0, 1 bei 50, 1,3 bei 100. */
export function reputationDemandFactor(state: GameState): number {
  const v = getReputation(state) / 100;
  return DEMAND_FACTOR_MIN + (DEMAND_FACTOR_MAX - DEMAND_FACTOR_MIN) * v;
}

/** Bezeichnung für einen Rufwert, z.B. "Bekannt". */
export function reputationLabel(value: number): string {
  return (REPUTATION_LABELS.find((l) => value >= l.min) ?? REPUTATION_LABELS[REPUTATION_LABELS.length - 1]).name;
}

export function recentReputationChanges(state: GameState): readonly ReputationChange[] {
  return state.modules.reputation.recent;
}

/** Ruf ändern, begrenzt auf 0–100. Gibt den neuen Wert zurück. */
export function changeReputation(ctx: Ctx, delta: number, reason?: string): number {
  const rep = ctx.state.modules.reputation;
  const before = rep.value;
  rep.value = Math.round(Math.min(100, Math.max(0, rep.value + delta)) * 100) / 100;
  const applied = Math.round((rep.value - before) * 100) / 100;
  if (applied === 0) return rep.value;
  if (reason) remember(rep, ctx.now, applied, reason);
  ctx.emit(
    'reputation.changed',
    reason ? { value: rep.value, delta: applied, reason } : { value: rep.value, delta: applied },
  );
  return rep.value;
}

function remember(rep: ReputationState, time: number, delta: number, reason: string): void {
  const same = rep.recent.find((c) => c.reason === reason && time - c.time <= RECENT_MERGE_MINUTES);
  if (same) {
    same.delta = Math.round((same.delta + delta) * 100) / 100;
    same.time = time;
    rep.recent = [same, ...rep.recent.filter((c) => c !== same)];
  } else {
    rep.recent.unshift({ time, delta, reason });
  }
  if (rep.recent.length > RECENT_LIMIT) rep.recent.length = RECENT_LIMIT;
}

export default defineModule({
  id: 'reputation',
  version: 2,
  init: () => ({ value: START_REPUTATION, recent: [] }),
  on: {
    'clock.dayStarted': (ctx) => {
      const value = getReputation(ctx.state);
      if (value === START_REPUTATION) return;
      const drift = Math.min(DAILY_DRIFT, Math.abs(value - START_REPUTATION));
      changeReputation(ctx, value > START_REPUTATION ? -drift : drift);
    },
  },
  migrations: {
    2: (old: ReputationStateV1): ReputationState => ({ value: old.value, recent: [] }),
  },
});
