// Spielende: Game Over (pleite, getötet) und Sieg ("Köln übernommen", danach Endlosmodus).

import { journal } from './journal';
import type { Ctx, GameState } from './types';

export type GameOverReason = 'bankrupt' | 'killed';

export const GAME_OVER_TEXT: Record<GameOverReason, string> = {
  bankrupt: 'Pleite. Kein Geld, keine Ware, keine Lieferung unterwegs.',
  killed: 'Du bist tot.',
};

export interface OutcomeState {
  gameOver: { reason: GameOverReason; time: number; detail?: string } | null;
  won: { time: number } | null;
}

declare module './types' {
  interface GameEvents {
    'game.over': { reason: GameOverReason; detail?: string };
    'campaign.won': { time: number };
  }
}

export function createOutcomeState(): OutcomeState {
  return { gameOver: null, won: null };
}

export const outcome = {
  /** Beendet das Spiel. Danach laufen keine Schritte und Befehle mehr. Mehrfaches Auslösen wird ignoriert. */
  gameOver(ctx: Ctx, reason: GameOverReason, detail?: string): void {
    if (ctx.state.outcome.gameOver) return;
    ctx.state.outcome.gameOver = { reason, time: ctx.now };
    if (detail) ctx.state.outcome.gameOver.detail = detail;
    journal.add(ctx, `Game Over: ${detail ?? GAME_OVER_TEXT[reason]}`, 'bad');
    ctx.emit('game.over', detail ? { reason, detail } : { reason });
  },

  /** Kampagne gewonnen. Das Spiel läuft im Endlosmodus weiter. Wird nur einmal ausgelöst. */
  win(ctx: Ctx): void {
    if (ctx.state.outcome.won || ctx.state.outcome.gameOver) return;
    ctx.state.outcome.won = { time: ctx.now };
    journal.add(ctx, 'Köln gehört dir. Das Spiel geht im Endlosmodus weiter.', 'good');
    ctx.emit('campaign.won', { time: ctx.now });
  },

  isOver(state: GameState): boolean {
    return state.outcome.gameOver !== null;
  },

  hasWon(state: GameState): boolean {
    return state.outcome.won !== null;
  },
};
