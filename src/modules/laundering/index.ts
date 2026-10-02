// Geldwäsche: Schwarzgeld wird über Zeit und gegen Gebühr zu sauberem Geld.
// Seit Auftrag 27 gibt es drei Wege (config.ts): den Kumpel mit Kiosk von Anfang an, den Waschsalon zum Freischalten
// mit sauberem oder Schwarzgeld, den Bauunternehmer spät (braucht Ruf oder Reviere). Jeder Weg hat Gebühr, Dauer,
// Obergrenze und Risiko (Heat im Veedel des Geschäfts, wenn zu viel auf einmal läuft). Das Schwarzgeld geht beim Start
// weg, das saubere Geld (abzüglich Gebühr) kommt, wenn die Wäsche fertig ist. Ohne Angabe des Wegs nimmt der Befehl
// den billigsten freien Weg und teilt große Beträge auf (so arbeiten der Bot und die Rechte Hand).
//
// Öffentliche API:
//   getChannels(state), getChannel(id), isChannelUnlocked(state, id), channelFee(state, id), channelDuration(id, amount),
//   channelFree(state, id), canUnlockChannel(state, id), launderingFee(state), launderingDuration(amount, id?),
//   launderingCapacity(state), amountInProgress(state, id?), getBatches(state), batchProgress(state, batch),
//   getLaunderingStats(state), LAUNDERING_CHANNELS, MIN_LAUNDERING_AMOUNT
// Befehle: 'laundering.launder', 'laundering.unlock'
// Ereignisse: 'laundering.started', 'laundering.completed', 'laundering.unlocked'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { addHeat } from '../police';
import { getReputation, reputationLabel } from '../reputation';
import { bonus } from '../staff';
import { controlledBy, PLAYER_FACTION } from '../territory';
import {
  LAUNDERING_CHANNELS,
  type LaunderingChannel,
  type LaunderingChannelId,
  MIN_LAUNDERING_AMOUNT,
  MIN_LAUNDERING_FEE,
} from './config';

export { LAUNDERING_CHANNELS, type LaunderingChannel, type LaunderingChannelId, MIN_LAUNDERING_AMOUNT } from './config';

export interface LaunderingBatch {
  id: number;
  /** Schwarzgeld, das hineinging. */
  amount: number;
  fee: number;
  startedAt: number;
  readyAt: number;
  /** Über welchen Weg. */
  channel: LaunderingChannelId;
}

export interface LaunderingState {
  /** Insgesamt gewaschen (vor Gebühr, nur fertige Wäschen). */
  totalLaundered: number;
  totalFees: number;
  /** Laufende Wäschen, früheste zuerst. */
  batches: LaunderingBatch[];
  /** Freigeschaltete Wege. */
  unlocked: LaunderingChannelId[];
}

interface LaunderingStateV1 {
  totalLaundered: number;
  totalFees: number;
}

interface LaunderingStateV2 extends LaunderingStateV1 {
  batches: Omit<LaunderingBatch, 'channel'>[];
}

declare module '../../core' {
  interface ModuleStates {
    laundering: LaunderingState;
  }
  interface GameCommands {
    /** Waschen; ohne channel den billigsten freien Weg (große Beträge werden aufgeteilt). */
    'laundering.launder': { amount: number; channel?: LaunderingChannelId };
    /** Einen Weg freischalten, bezahlt mit sauberem oder mit Schwarzgeld. */
    'laundering.unlock': { channel: LaunderingChannelId; pay: 'clean' | 'dirty' };
  }
  interface GameEvents {
    'laundering.started': {
      batchId: number;
      amount: number;
      fee: number;
      readyAt: number;
      channel: LaunderingChannelId;
    };
    'laundering.completed': { amount: number; fee: number; batchId?: number; channel?: LaunderingChannelId };
    'laundering.unlocked': { channel: LaunderingChannelId; pay: 'clean' | 'dirty'; cost: number };
  }
}

// --- Wege ---

/** Weg nach ID, undefined bei einer unbekannten (für Befehle, die von außen kommen). */
function findChannel(id: string): LaunderingChannel | undefined {
  return LAUNDERING_CHANNELS.find((c) => c.id === id);
}

export function getChannel(id: LaunderingChannelId): LaunderingChannel {
  const channel = findChannel(id);
  if (!channel) throw new Error(`Unbekannter Weg der Geldwäsche: ${id}`);
  return channel;
}

export function isChannelUnlocked(state: GameState, id: LaunderingChannelId): boolean {
  return state.modules.laundering.unlocked.includes(id);
}

/** Alle Wege in der Reihenfolge der Freischaltung. */
export function getChannels(_state: GameState): readonly LaunderingChannel[] {
  return LAUNDERING_CHANNELS;
}

/** Gebühr eines Wegs als Anteil (0,2 = 20 %), inklusive Rabatt durch Buchhalter. */
export function channelFee(state: GameState, id: LaunderingChannelId): number {
  const fee = getChannel(id).fee - bonus(state, 'launderingFeeDiscount');
  return Math.round(Math.max(MIN_LAUNDERING_FEE, fee) * 1000) / 1000;
}

/** Dauer einer Wäsche über einen Weg in Spielminuten. */
export function channelDuration(id: LaunderingChannelId, amount: number): number {
  const c = getChannel(id);
  return Math.round(c.baseMinutes + (Math.max(0, amount) / 100) * c.minutesPer100);
}

/** Schwarzgeld, das gerade gewaschen wird (über alle Wege oder über einen). */
export function amountInProgress(state: GameState, id?: LaunderingChannelId): number {
  return state.modules.laundering.batches.filter((b) => !id || b.channel === id).reduce((sum, b) => sum + b.amount, 0);
}

/** Wie viel über einen Weg gerade noch hineinpasst. */
export function channelFree(state: GameState, id: LaunderingChannelId): number {
  if (!isChannelUnlocked(state, id)) return 0;
  return Math.max(0, getChannel(id).capacity - amountInProgress(state, id));
}

/** Billigster freigeschalteter Weg (für Anzeigen ohne Wahl, z.B. die Gebühr im Personal). */
function cheapestUnlocked(state: GameState): LaunderingChannel {
  const open = LAUNDERING_CHANNELS.filter((c) => isChannelUnlocked(state, c.id));
  return [...open].sort((a, b) => a.fee - b.fee)[0] ?? LAUNDERING_CHANNELS[0];
}

/** Gebühr des billigsten freien Wegs (Anteil). */
export function launderingFee(state: GameState): number {
  return channelFee(state, cheapestUnlocked(state).id);
}

/** Dauer einer Wäsche in Spielminuten (ohne Weg: Kumpel mit Kiosk). */
export function launderingDuration(amount: number, id: LaunderingChannelId = 'kiosk'): number {
  return channelDuration(id, amount);
}

/** Wie viel Schwarzgeld über alle freigeschalteten Wege gleichzeitig in der Wäsche sein kann. */
export function launderingCapacity(state: GameState): number {
  return LAUNDERING_CHANNELS.filter((c) => isChannelUnlocked(state, c.id)).reduce((sum, c) => sum + c.capacity, 0);
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

/** Kann der Weg freigeschaltet werden (Ruf oder Reviere reichen)? Geld prüft erst der Befehl. */
export function canUnlockChannel(state: GameState, id: LaunderingChannelId): CommandResult {
  const c = getChannel(id);
  if (isChannelUnlocked(state, id)) return { ok: false, reason: 'Schon freigeschaltet.' };
  if (!c.unlock) return { ok: true };
  const needsRep = c.unlock.reputation !== undefined;
  const needsVeedel = c.unlock.veedel !== undefined;
  if (!needsRep && !needsVeedel) return { ok: true };
  const rep = getReputation(state);
  const veedel = controlledBy(state, PLAYER_FACTION).length;
  if ((needsRep && rep >= (c.unlock.reputation ?? 0)) || (needsVeedel && veedel >= (c.unlock.veedel ?? 0))) {
    return { ok: true };
  }
  const parts: string[] = [];
  if (needsRep)
    parts.push(
      `Ruf ab ${c.unlock.reputation} (${reputationLabel(c.unlock.reputation ?? 0)}), jetzt ${Math.round(rep)}`,
    );
  if (needsVeedel) parts.push(`${c.unlock.veedel} eigene Veedel, jetzt ${veedel}`);
  return { ok: false, reason: `Braucht ${parts.join(' oder ')}.` };
}

// --- Befehle ---

/** Eine Wäsche über einen Weg starten (Geld muss da sein, Betrag muss passen). */
function startBatch(ctx: Ctx, channel: LaunderingChannel, amount: number): LaunderingBatch {
  const fee = Math.round(amount * channelFee(ctx.state, channel.id));
  // Die Gebühr ist eine Ausgabe, der Rest nur eine Umbuchung (kommt später als sauberes Geld zurück).
  wallet.pay(ctx, amount - fee, 'dirty', `Geldwäsche ${channel.name}`, 'transfer');
  if (fee > 0) wallet.pay(ctx, fee, 'dirty', `Gebühr ${channel.name}`, 'laundering');
  const batch: LaunderingBatch = {
    id: ctx.nextId(),
    amount,
    fee,
    startedAt: ctx.now,
    readyAt: ctx.now + channelDuration(channel.id, amount),
    channel: channel.id,
  };
  ctx.state.modules.laundering.batches.push(batch);
  // Risiko: Läuft über diesen Weg mehr als die Schwelle, steigt der Heat im Veedel des Geschäfts.
  const running = amountInProgress(ctx.state, channel.id);
  if (channel.heatPer1000 > 0 && running > channel.heatAbove) {
    const over = Math.min(amount, running - channel.heatAbove);
    addHeat(ctx, channel.veedelId, (over / 1000) * channel.heatPer1000);
  }
  ctx.emit('laundering.started', { batchId: batch.id, amount, fee, readyAt: batch.readyAt, channel: channel.id });
  return batch;
}

/**
 * Verteilt einen Betrag auf freie Wege, billigster zuerst (nach der Gebühr, die wirklich gilt, bei gleicher Gebühr der
 * schnellere: Ein Buchhalter drückt alle Wege auf die Mindestgebühr, dann gehört kleines Geld zum Kiosk). Liefert null,
 * wenn er nicht hineinpasst.
 */
function plan(state: GameState, amount: number): { channel: LaunderingChannel; amount: number }[] | null {
  const open = LAUNDERING_CHANNELS.filter((c) => isChannelUnlocked(state, c.id)).sort(
    (a, b) =>
      channelFee(state, a.id) - channelFee(state, b.id) ||
      channelDuration(a.id, amount) - channelDuration(b.id, amount) ||
      a.fee - b.fee,
  );
  // Passt alles in einen Weg, nimm den billigsten davon.
  const whole = open.find((c) => amount >= c.minAmount && amount <= channelFree(state, c.id));
  if (whole) return [{ channel: whole, amount }];
  const parts: { channel: LaunderingChannel; amount: number }[] = [];
  let left = amount;
  for (const c of open) {
    const free = channelFree(state, c.id);
    if (left <= 0 || free < c.minAmount) continue;
    const take = Math.min(left, free);
    if (take < c.minAmount) continue;
    parts.push({ channel: c, amount: take });
    left -= take;
  }
  return left > 0 ? null : parts;
}

function launder(ctx: Ctx, amount: number, channelId?: LaunderingChannelId): CommandResult {
  if (!(amount > 0) || !Number.isFinite(amount)) return { ok: false, reason: 'Ungültiger Betrag.' };
  const rounded = Math.round(amount);
  if (rounded < MIN_LAUNDERING_AMOUNT) {
    return { ok: false, reason: `Unter ${formatEuro(MIN_LAUNDERING_AMOUNT)} lohnt sich das nicht.` };
  }
  if (!wallet.canAfford(ctx.state, rounded)) return { ok: false, reason: 'Nicht genug Schwarzgeld.' };
  let parts: { channel: LaunderingChannel; amount: number }[];
  if (channelId !== undefined) {
    const c = findChannel(channelId);
    if (!c) return { ok: false, reason: 'Diesen Weg gibt es nicht.' };
    if (!isChannelUnlocked(ctx.state, c.id)) return { ok: false, reason: `${c.name} ist noch nicht freigeschaltet.` };
    if (rounded < c.minAmount) return { ok: false, reason: `${c.name} nimmt erst ab ${formatEuro(c.minAmount)}.` };
    const free = channelFree(ctx.state, c.id);
    if (rounded > free) {
      return { ok: false, reason: `Mehr geht bei ${c.name} gerade nicht, frei sind noch ${formatEuro(free)}.` };
    }
    parts = [{ channel: c, amount: rounded }];
  } else {
    const planned = plan(ctx.state, rounded);
    if (!planned) {
      const free = LAUNDERING_CHANNELS.reduce((sum, c) => sum + channelFree(ctx.state, c.id), 0);
      return { ok: false, reason: `Mehr geht gerade nicht, frei sind noch ${formatEuro(free)}.` };
    }
    parts = planned;
  }
  const batches = parts.map((p) => startBatch(ctx, p.channel, p.amount));
  const last = Math.max(...batches.map((b) => b.readyAt));
  const where = parts.length === 1 ? ` (${parts[0].channel.name})` : ` (${parts.length} Wege)`;
  journal.add(
    ctx,
    `${formatEuro(rounded)} in die Wäsche gegeben${where}, fertig in ca. ${clock.formatDuration(last - ctx.now)}.`,
  );
  return { ok: true, data: { batchId: batches[0].id, batchIds: batches.map((b) => b.id) } };
}

function unlock(ctx: Ctx, channelId: LaunderingChannelId, pay: 'clean' | 'dirty'): CommandResult {
  const c = findChannel(channelId);
  if (!c) return { ok: false, reason: 'Diesen Weg gibt es nicht.' };
  // Ohne diese Prüfung wäre der Preis undefined und der Weg gratis.
  if (pay !== 'clean' && pay !== 'dirty')
    return { ok: false, reason: 'Bezahlen geht nur mit sauberem Geld oder Schwarzgeld.' };
  const check = canUnlockChannel(ctx.state, channelId);
  if (!check.ok) return check;
  const cost = c.unlock ? c.unlock[pay] : 0;
  if (cost > 0 && !wallet.pay(ctx, cost, pay, `Einstieg ${c.name}`, 'expansion')) {
    return {
      ok: false,
      reason: `Nicht genug ${pay === 'clean' ? 'sauberes Geld' : 'Schwarzgeld'} (${formatEuro(cost)}).`,
    };
  }
  ctx.state.modules.laundering.unlocked.push(channelId);
  journal.add(
    ctx,
    `${c.name} wäscht jetzt für dich (${formatEuro(cost)} ${pay === 'clean' ? 'sauber' : 'schwarz'}).`,
    'good',
  );
  messages.send(ctx, {
    contact: { id: `laundering:${c.id}`, name: c.name, kind: 'other' },
    text: `Alles klar, wir sind im Geschäft. Bis ${formatEuro(c.capacity)} auf einmal, Gebühr ${Math.round(c.fee * 100)} %. Übertreib es nicht.`,
    silent: true,
  });
  ctx.emit('laundering.unlocked', { channel: channelId, pay, cost });
  return { ok: true };
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.laundering;
  const done = s.batches.filter((b) => b.readyAt <= ctx.now);
  if (done.length === 0) return;
  s.batches = s.batches.filter((b) => b.readyAt > ctx.now);
  for (const b of done) {
    wallet.earn(ctx, b.amount - b.fee, 'clean', `Geldwäsche ${getChannel(b.channel).name}`, 'transfer');
    s.totalLaundered += b.amount;
    s.totalFees += b.fee;
    journal.add(ctx, `${formatEuro(b.amount - b.fee)} sind sauber (Gebühr ${formatEuro(b.fee)}).`, 'good');
    ctx.emit('laundering.completed', { amount: b.amount, fee: b.fee, batchId: b.id, channel: b.channel });
  }
}

export default defineModule({
  id: 'laundering',
  version: 3,
  init: () => ({ totalLaundered: 0, totalFees: 0, batches: [], unlocked: ['kiosk'] }),
  tick,
  commands: {
    'laundering.launder': (ctx, { amount, channel }) => launder(ctx, amount, channel),
    'laundering.unlock': (ctx, { channel, pay }) => unlock(ctx, channel, pay),
  },
  migrations: {
    2: (old: LaunderingStateV1): LaunderingStateV2 => ({ ...old, batches: [] }),
    // Auftrag 27: laufende Wäschen bleiben gültig und laufen über den Kiosk, der von Anfang an frei ist.
    3: (old: LaunderingStateV2): LaunderingState => ({
      ...old,
      batches: old.batches.map((b) => ({ ...b, channel: 'kiosk' as const })),
      unlocked: ['kiosk'],
    }),
  },
});
