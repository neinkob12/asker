// Ruf: ein globaler Wert für das ganze Geschäft (0–100).
// Stand Fundament: lesen und ändern. Was den Ruf bewegt und was er bewirkt, baut Auftrag 12.
//
// Öffentliche API:
//   getReputation(state), changeReputation(ctx, delta)
// Ereignisse: 'reputation.changed'

import { type Ctx, defineModule, type GameState } from '../../core';

export const START_REPUTATION = 50;

export interface ReputationState {
  value: number;
}

declare module '../../core' {
  interface ModuleStates {
    reputation: ReputationState;
  }
  interface GameEvents {
    'reputation.changed': { value: number; delta: number };
  }
}

export function getReputation(state: GameState): number {
  return state.modules.reputation.value;
}

/** Ruf ändern, begrenzt auf 0–100. Gibt den neuen Wert zurück. */
export function changeReputation(ctx: Ctx, delta: number): number {
  const rep = ctx.state.modules.reputation;
  const before = rep.value;
  rep.value = Math.min(100, Math.max(0, rep.value + delta));
  if (rep.value !== before) ctx.emit('reputation.changed', { value: rep.value, delta: rep.value - before });
  return rep.value;
}

export default defineModule({
  id: 'reputation',
  version: 1,
  init: () => ({ value: START_REPUTATION }),
});
