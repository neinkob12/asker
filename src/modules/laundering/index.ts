// Geldwäsche: Schwarzgeld wird über Zeit und gegen Gebühr zu sauberem Geld.
// Das Schwarzgeld geht beim Start weg, das saubere Geld (abzüglich Gebühr) kommt, wenn die Wäsche fertig ist.
// Tarnfirmen mit eigener Kapazität kommen später.
//
// Öffentliche API:
//   launderingFee(state), launderingDuration(amount), launderingCapacity(state), amountInProgress(state),
//   getBatches(state), batchProgress(state, batch), getLaunderingStats(state)
// Befehle: 'laundering.launder'
// Ereignisse: 'laundering.started', 'laundering.completed'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  wallet,
} from '../../core';
import { bonus } from '../staff';
import {
  LAUNDERING_BASE_MINUTES,
  LAUNDERING_CAPACITY,
  LAUNDERING_FEE,
  LAUNDERING_MINUTES_PER_100,
  MIN_LAUNDERING_AMOUNT,
  MIN_LAUNDERING_FEE,
} from './config';

export interface LaunderingBatch {
  id: number;
  /** Schwarzgeld, das hineinging. */
  amount: number;
  fee: number;
  startedAt: number;
  readyAt: number;
}

export interface LaunderingState {
  /** Insgesamt gewaschen (vor Gebühr, nur fertige Wäschen). */
  totalLaundered: number;
  totalFees: number;
  /** Laufende Wäschen, früheste zuerst. */
  batches: LaunderingBatch[];
}

interface LaunderingStateV1 {
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
    'laundering.started': { batchId: number; amount: number; fee: number; readyAt: number };
    'laundering.completed': { amount: number; fee: number; batchId?: number };
  }
}

/** Gebühr als Anteil (0,2 = 20 %), inklusive Rabatt durch Buchhalter. */
export function launderingFee(state: GameState): number {
  return Math.max(MIN_LAUNDERING_FEE, LAUNDERING_FEE - bonus(state, 'launderingFeeDiscount'));
}

/** Dauer einer Wäsche in Spielminuten. */
export function launderingDuration(amount: number): number {
  return Math.round(LAUNDERING_BASE_MINUTES + (Math.max(0, amount) / 100) * LAUNDERING_MINUTES_PER_100);
}

/** Wie viel Schwarzgeld gleichzeitig in der Wäsche sein kann. */
export function launderingCapacity(_state: GameState): number {
  return LAUNDERING_CAPACITY;
}

/** Schwarzgeld, das gerade gewaschen wird. */
export function amountInProgress(state: GameState): number {
  return state.modules.laundering.batches.reduce((sum, b) => sum + b.amount, 0);
}

export function getBatches(state: GameState): readonly LaunderingBatch[] {
  return state.modules.laundering.batches;
}

/** Fortschritt einer Wäsche von 0 bis 1. */
export function batchProgress(state: GameState, batch: LaunderingBatch): number {
  const total = batch.readyAt - batch.startedAt;
  return total <= 0 ? 1 : Math.min(1, Math.max(0, (state.time - batch.startedAt) / total));
}

export function getLaunderingStats(state: GameState): LaunderingState {
  return state.modules.laundering;
}

function launder(ctx: Ctx, amount: number): CommandResult {
  if (!(amount > 0) || !Number.isFinite(amount)) return { ok: false, reason: 'Ungültiger Betrag.' };
  const rounded = Math.round(amount);
  if (rounded < MIN_LAUNDERING_AMOUNT) {
    return { ok: false, reason: `Unter ${formatEuro(MIN_LAUNDERING_AMOUNT)} lohnt sich das nicht.` };
  }
  const free = launderingCapacity(ctx.state) - amountInProgress(ctx.state);
  if (rounded > free) {
    return { ok: false, reason: `Mehr geht gerade nicht, frei sind noch ${formatEuro(Math.max(0, free))}.` };
  }
  if (!wallet.pay(ctx, rounded, 'dirty', 'Geldwäsche')) return { ok: false, reason: 'Nicht genug Schwarzgeld.' };
  const batch: LaunderingBatch = {
    id: ctx.nextId(),
    amount: rounded,
    fee: Math.round(rounded * launderingFee(ctx.state)),
    startedAt: ctx.now,
    readyAt: ctx.now + launderingDuration(rounded),
  };
  ctx.state.modules.laundering.batches.push(batch);
  journal.add(
    ctx,
    `${formatEuro(rounded)} in die Wäsche gegeben, fertig in ca. ${clock.formatDuration(batch.readyAt - ctx.now)}.`,
  );
  ctx.emit('laundering.started', { batchId: batch.id, amount: rounded, fee: batch.fee, readyAt: batch.readyAt });
  return { ok: true, data: { batchId: batch.id } };
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.laundering;
  const done = s.batches.filter((b) => b.readyAt <= ctx.now);
  if (done.length === 0) return;
  s.batches = s.batches.filter((b) => b.readyAt > ctx.now);
  for (const b of done) {
    wallet.earn(ctx, b.amount - b.fee, 'clean', 'Geldwäsche');
    s.totalLaundered += b.amount;
    s.totalFees += b.fee;
    journal.add(ctx, `${formatEuro(b.amount - b.fee)} sind sauber (Gebühr ${formatEuro(b.fee)}).`, 'good');
    ctx.emit('laundering.completed', { amount: b.amount, fee: b.fee, batchId: b.id });
  }
}

export default defineModule({
  id: 'laundering',
  version: 2,
  init: () => ({ totalLaundered: 0, totalFees: 0, batches: [] }),
  tick,
  commands: {
    'laundering.launder': (ctx, { amount }) => launder(ctx, amount),
  },
  migrations: {
    2: (old: LaunderingStateV1): LaunderingState => ({ ...old, batches: [] }),
  },
});
