// Markt: Richtpreis pro Produkt und Veedel.
// Stand Fundament: Grundpreis × Kaufkraft des Veedels × Konkurrenzfaktor. Angebot und Nachfrage
// sowie eigene Preise baut Auftrag 12. Den Konkurrenzfaktor setzen die Gangs (Auftrag 11).
//
// Öffentliche API:
//   referencePrice(state, productId, veedelId), getCompetitionFactor(state, veedelId),
//   setCompetitionFactor(ctx, veedelId, factor)
// Ereignisse: 'market.competitionChanged'

import { type Ctx, defineModule, type GameState } from '../../core';
import { getProduct } from '../goods';
import { getVeedel } from '../veedel';
import { MAX_COMPETITION_FACTOR, MIN_COMPETITION_FACTOR } from './config';

export interface MarketState {
  /** Preisfaktor durch Konkurrenz pro Veedel. 1 = neutral, 0,8 = Preise um 20 % gedrückt. */
  competition: Record<string, number>;
}

declare module '../../core' {
  interface ModuleStates {
    market: MarketState;
  }
  interface GameEvents {
    'market.competitionChanged': { veedelId: string; factor: number };
  }
}

/** Richtpreis in Euro pro Einheit. */
export function referencePrice(state: GameState, productId: string, veedelId: string): number {
  const product = getProduct(productId);
  if (!product) return 0;
  const purchasingPower = getVeedel(veedelId)?.purchasingPower ?? 1;
  return product.basePrice * purchasingPower * getCompetitionFactor(state, veedelId);
}

export function getCompetitionFactor(state: GameState, veedelId: string): number {
  return state.modules.market.competition[veedelId] ?? 1;
}

/** Konkurrenzdruck setzen, z.B. wenn eine Gang die Preise drückt. */
export function setCompetitionFactor(ctx: Ctx, veedelId: string, factor: number): void {
  const clamped = Math.min(MAX_COMPETITION_FACTOR, Math.max(MIN_COMPETITION_FACTOR, factor));
  ctx.state.modules.market.competition[veedelId] = clamped;
  ctx.emit('market.competitionChanged', { veedelId, factor: clamped });
}

export default defineModule({
  id: 'market',
  version: 1,
  dependsOn: ['goods', 'veedel'],
  init: () => ({ competition: {} }),
});
