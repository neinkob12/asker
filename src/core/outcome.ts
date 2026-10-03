// Spielende: Game Over (pleite, getötet) und Sieg pro Stadt ("Köln komplett", später "Hamburg komplett"), danach
// läuft das Spiel im Endlosmodus weiter. Der erste Sieg setzt `won`, jede weitere Stadt kommt in `won.cities`.

import { journal } from './journal';
import type { Ctx, GameEvents, GameState } from './types';

export type GameOverReason = 'bankrupt' | 'killed';

export const GAME_OVER_TEXT: Record<GameOverReason, string> = {
  bankrupt: 'Pleite. Kein Geld, keine Ware, keine Lieferung unterwegs.',
  killed: 'Du bist tot.',
};

export interface OutcomeState {
  gameOver: { reason: GameOverReason; time: number; detail?: string } | null;
  /**
   * Erster Sieg. cities: Städte, die komplett übernommen sind (fehlt bei alten Spielständen: Dort galt die Mehrheit
   * von Köln schon als Sieg, Köln komplett kommt dann noch).
   */
  won: { time: number; cities?: string[] } | null;
}

/** Wer eine Stadt komplett übernommen hat (Auftrag 30): Stadt, Name und ein Satz, wie es weitergeht. */
export interface CityWin {
  cityId: string;
  cityName: string;
  /** Hinweis im Sieg-Bildschirm, z.B. dass gleich jemand anruft. */
  next?: string;
}

declare module './types' {
  interface GameEvents {
    'game.over': { reason: GameOverReason; detail?: string };
    /** Eine Stadt ist komplett übernommen (alle Veedel). cityId und cityName fehlen nur bei sehr alten Zuhörern. */
    'campaign.won': { time: number; cityId?: string; cityName?: string; next?: string };
  }
}

const KOELN_WIN: CityWin = { cityId: 'koeln', cityName: 'Köln' };

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

  /**
   * Eine Stadt ist komplett übernommen. Das Spiel läuft im Endlosmodus weiter. Pro Stadt nur einmal (ohne Angabe: Köln).
   */
  win(ctx: Ctx, city: CityWin = KOELN_WIN): void {
    const o = ctx.state.outcome;
    if (o.gameOver || o.won?.cities?.includes(city.cityId)) return;
    if (o.won) o.won.cities = [...(o.won.cities ?? []), city.cityId];
    else o.won = { time: ctx.now, cities: [city.cityId] };
    journal.add(
      ctx,
      `${city.cityName} komplett: Alle Veedel hören auf dich.${city.next ? ` ${city.next}` : ' Das Spiel geht weiter.'}`,
      'good',
    );
    const payload: GameEvents['campaign.won'] = { time: ctx.now, cityId: city.cityId, cityName: city.cityName };
    if (city.next) payload.next = city.next;
    ctx.emit('campaign.won', payload);
  },

  isOver(state: GameState): boolean {
    return state.outcome.gameOver !== null;
  },

  /** Ist (irgendeine) Stadt gewonnen? Alte Spielstände mit dem Sieg bei 7 von 12 zählen mit (Endlosmodus). */
  hasWon(state: GameState): boolean {
    return state.outcome.won !== null;
  },

  /** Ist diese Stadt komplett übernommen? */
  hasWonCity(state: GameState, cityId: string): boolean {
    return state.outcome.won?.cities?.includes(cityId) ?? false;
  },
};
