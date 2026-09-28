// Geldwäsche: Schwarzgeld wird zu sauberem Geld.
// Stand Fundament: sofort, gegen feste Gebühr. Wäsche über Zeit und Tarnfirmen kommen später (Auftrag 12 ff.).
//
// Öffentliche API:
//   launderingFee(state), getLaunderingStats(state)
// Befehle: 'laundering.launder'
// Ereignisse: 'laundering.completed'

import { defineModule, formatEuro, type GameState, journal, wallet } from '../../core';
import { LAUNDERING_FEE } from './config';

export interface LaunderingState {
  /** Insgesamt gewaschen (vor Gebühr). */
  totalLaundered: number;
  totalFees: number;
}

declare module '../../core' {
  interface ModuleStates {
    laundering: LaunderingState;
  }
  interface GameCommands {
    'laundering.launder': { amount: number };
  }
  interface GameEvents {
    'laundering.completed': { amount: number; fee: number };
  }
}

/** Gebühr als Anteil (0,2 = 20 %). */
export function launderingFee(_state: GameState): number {
  return LAUNDERING_FEE;
}

export function getLaunderingStats(state: GameState): LaunderingState {
  return state.modules.laundering;
}

export default defineModule({
  id: 'laundering',
  version: 1,
  init: () => ({ totalLaundered: 0, totalFees: 0 }),
  commands: {
    'laundering.launder': (ctx, { amount }) => {
      if (!(amount > 0)) return { ok: false, reason: 'Ungültiger Betrag.' };
      const fee = Math.round(amount * launderingFee(ctx.state));
      if (!wallet.convert(ctx, 'dirty', 'clean', amount, fee, 'Geldwäsche')) {
        return { ok: false, reason: 'Nicht genug Schwarzgeld.' };
      }
      const s = ctx.state.modules.laundering;
      s.totalLaundered += amount;
      s.totalFees += fee;
      journal.add(ctx, `${formatEuro(amount)} gewaschen, Gebühr ${formatEuro(fee)}.`);
      ctx.emit('laundering.completed', { amount, fee });
      return { ok: true };
    },
  },
});
