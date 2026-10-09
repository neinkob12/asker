// Bestenliste (Auftrag 29): Das Modul merkt sich, was ein Durchgang erreicht hat (höchstes Vermögen, Tage, Veedel),
// damit die Oberfläche das Ergebnis bei Game Over oder Sieg an die gemeinsame Bestenliste schicken kann
// (ui/index.tsx, Server: api/leaderboard.ts). Gerankt wird nach dem höchsten Vermögen im Durchgang. Mit dabei: der
// Rang des Spielers als Titel (Auftrag 36, city.playerRank: Kleindealer bis Boss von Deutschland) und sein Wert.
//
// Öffentliche API: netWorth(state), getRecord(state), runSummary(state)

import { clock, defineModule, type GameState, wallet } from '../../core';
import { playerRank } from '../city';
import { getLots, getProduct } from '../goods';
import { getBatches } from '../laundering';
import { getRelation, getSuppliers } from '../suppliers';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { getShipments, OWN_ORIGINS, originStock, ownedPorts, portStock } from '../trade';
import { GOODS_FALLBACK_SHARE, HARBOR_GOODS_SHARE } from './config';

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
  /** Komplett übernommene Städte (Auftrag 30). */
  cities: number;
  /** Rang des Spielers als Titel (Auftrag 36), z.B. "Boss von Hamburg". */
  title: string;
  /** Wert des Rangs (größer = höher, siehe city/ranks.ts). */
  rank: number;
}

/** Wert von Ware im Hafen, am Kai oder im Ausfuhrlager (ohne Einkaufspreis je Posten, `HARBOR_GOODS_SHARE`). */
function harborValue(productId: string, amount: number): number {
  return amount * (getProduct(productId)?.basePrice ?? 0) * HARBOR_GOODS_SHARE;
}

/**
 * Vermögen: Schwarzgeld, sauberes Geld, Geld in der Wäsche (schon abgebucht, kommt sauber zurück) und Ware im Lager
 * (konservativ: zum Einkaufspreis des Postens, höchstens zum Straßenpreis; ohne Einkaufspreis mit Abschlag, siehe
 * `GOODS_FALLBACK_SHARE`), dazu Ware im Hafen, am Kai und im Ausfuhrlager (`HARBOR_GOODS_SHARE`), abzüglich der
 * Schulden bei Lieferanten (sonst treibt ein Kredit die Zahl).
 */
export function netWorth(state: GameState): number {
  let goods = 0;
  for (const lot of getLots(state)) {
    const street = getProduct(lot.productId)?.basePrice ?? 0;
    const unit = lot.unitCost > 0 ? Math.min(lot.unitCost, street) : street * GOODS_FALLBACK_SHARE;
    goods += lot.amount * unit;
  }
  // Hafen-Phase (Auftrag 40 bis 42): Die Ware ist bezahlt, sobald sie bestellt ist; im Hafen, am Kai (Lager voll) und im
  // Ausfuhrlager der Fincas gehört sie dir. Früher zählte sie gar nicht, jeder Container kostete Vermögen.
  for (const portId of ownedPorts(state)) {
    for (const [productId, lot] of Object.entries(portStock(state, portId))) {
      goods += harborValue(productId, lot.amount);
    }
  }
  for (const shipment of getShipments(state)) {
    if (shipment.status === 'quay') goods += harborValue(shipment.productId, shipment.amount);
  }
  for (const origin of OWN_ORIGINS) {
    for (const [productId, lot] of Object.entries(originStock(state, origin.id))) {
      goods += harborValue(productId, lot.amount);
    }
  }
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
    // Alte Spielstände mit Sieg ohne Städte-Liste: damals war es Köln.
    cities: state.outcome.won ? (state.outcome.won.cities?.length ?? 1) : 0,
    title: playerRank(state).title,
    rank: playerRank(state).score,
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
  dependsOn: ['goods', 'territory', 'laundering', 'suppliers', 'trade'],
  init: (ctx) => ({ peakWorth: netWorth(ctx.state), peakVeedel: 0 }),
  tickEvery: 30,
  tick: (ctx) => update(ctx.state),
  on: {
    'game.over': (ctx) => update(ctx.state),
    'campaign.won': (ctx) => update(ctx.state),
  },
  migrations: {},
});
