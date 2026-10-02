// Bestenliste (Auftrag 29): Das Modul merkt sich, was ein Durchgang erreicht hat (höchstes Vermögen, Tage, Veedel),
// damit die Oberfläche das Ergebnis bei Game Over oder Sieg an die gemeinsame Bestenliste schicken kann
// (ui/index.tsx, Server: api/leaderboard.ts). Gerankt wird nach dem höchsten Vermögen im Durchgang.
//
// Öffentliche API: netWorth(state), getRecord(state), runSummary(state)

import { clock, defineModule, type GameState, wallet } from '../../core';
import { getLots, getProduct } from '../goods';
import { getBatches } from '../laundering';
import { getRelation, getSuppliers } from '../suppliers';
import { controlledBy, PLAYER_FACTION } from '../territory';

export interface LeaderboardState {
  /** Höchstes Vermögen im Durchgang (Euro). */
  peakWorth: number;
  /** Höchste Zahl gleichzeitig kontrollierter Veedel. */
  peakVeedel: number;
}

declare module '../../core' {
  interface ModuleStates {
    leaderboard: LeaderboardState;
  }
}

/** Ergebnis eines Durchgangs, so wie es an die Bestenliste geht. */
export interface RunSummary {
  runId: string;
  mode: 'normal' | 'hardcore';
  /** Punkte = höchstes Vermögen. */
  score: number;
  days: number;
  veedel: number;
  outcome: 'bankrupt' | 'killed' | 'won' | 'running';
}

/**
 * Vermögen: Schwarzgeld, sauberes Geld, Geld in der Wäsche (schon abgebucht, kommt sauber zurück) und Ware im Lager
 * (zum Grundpreis), abzüglich der Schulden bei Lieferanten (sonst treibt ein Kredit die Zahl).
 */
export function netWorth(state: GameState): number {
  let goods = 0;
  for (const lot of getLots(state)) goods += lot.amount * (getProduct(lot.productId)?.basePrice ?? 0);
  let washing = 0;
  for (const batch of getBatches(state)) washing += batch.amount - batch.fee;
  const debt = getSuppliers(state).reduce((sum, s) => sum + getRelation(state, s.id).debt, 0);
  return Math.round(wallet.balance(state, 'dirty') + wallet.balance(state, 'clean') + washing + goods - debt);
}

export function getRecord(state: GameState): LeaderboardState {
  return state.modules.leaderboard;
}

export function runSummary(state: GameState): RunSummary {
  const record = getRecord(state);
  const over = state.outcome.gameOver;
  return {
    runId: state.meta.runId,
    mode: state.meta.mode,
    score: Math.max(record.peakWorth, netWorth(state)),
    days: clock.day(state.time),
    veedel: Math.max(record.peakVeedel, controlledBy(state, PLAYER_FACTION).length),
    outcome: over ? over.reason : state.outcome.won ? 'won' : 'running',
  };
}

function update(state: GameState): void {
  const record = state.modules.leaderboard;
  record.peakWorth = Math.max(record.peakWorth, netWorth(state));
  record.peakVeedel = Math.max(record.peakVeedel, controlledBy(state, PLAYER_FACTION).length);
}

export default defineModule({
  id: 'leaderboard',
  version: 1,
  dependsOn: ['goods', 'territory', 'laundering', 'suppliers'],
  init: (ctx) => ({ peakWorth: netWorth(ctx.state), peakVeedel: 0 }),
  tickEvery: 30,
  tick: (ctx) => update(ctx.state),
  on: {
    'game.over': (ctx) => update(ctx.state),
    'campaign.won': (ctx) => update(ctx.state),
  },
  migrations: {},
});
