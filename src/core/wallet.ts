// Geld: Schwarzgeld und sauberes Geld getrennt.
// Alles Illegale wird mit Schwarzgeld bezahlt, für Legales braucht man gewaschenes (sauberes) Geld.

import type { Ctx, GameState } from './types';

export type MoneyKind = 'dirty' | 'clean';

export interface WalletState {
  dirty: number;
  clean: number;
}

declare module './types' {
  interface GameEvents {
    /** Jede Kontobewegung. amount ist positiv (Einnahme) oder negativ (Ausgabe). */
    'wallet.changed': { kind: MoneyKind; amount: number; balance: number; reason: string };
  }
}

function change(ctx: Ctx, kind: MoneyKind, amount: number, reason: string): void {
  if (amount === 0) return;
  ctx.state.wallet[kind] += amount;
  ctx.emit('wallet.changed', { kind, amount, balance: ctx.state.wallet[kind], reason });
}

export const wallet = {
  /** Kontostand einer Geldart, ohne Angabe die Summe aus beiden. */
  balance(state: GameState, kind?: MoneyKind): number {
    return kind ? state.wallet[kind] : state.wallet.dirty + state.wallet.clean;
  },

  canAfford(state: GameState, amount: number, kind: MoneyKind = 'dirty'): boolean {
    return state.wallet[kind] >= amount;
  },

  /** Einnahme verbuchen. */
  earn(ctx: Ctx, amount: number, kind: MoneyKind = 'dirty', reason = ''): void {
    if (amount < 0) throw new Error('wallet.earn: Betrag muss positiv sein');
    change(ctx, kind, amount, reason);
  },

  /** Bezahlen. Gibt false zurück und ändert nichts, wenn das Geld nicht reicht. */
  pay(ctx: Ctx, amount: number, kind: MoneyKind = 'dirty', reason = ''): boolean {
    if (amount < 0) throw new Error('wallet.pay: Betrag muss positiv sein');
    if (ctx.state.wallet[kind] < amount) return false;
    change(ctx, kind, -amount, reason);
    return true;
  },

  /** Geld verlieren (Beschlagnahme, Diebstahl): höchstens so viel, wie da ist. Gibt den verlorenen Betrag zurück. */
  lose(ctx: Ctx, amount: number, kind: MoneyKind = 'dirty', reason = ''): number {
    const lost = Math.max(0, Math.min(amount, ctx.state.wallet[kind]));
    change(ctx, kind, -lost, reason);
    return lost;
  },

  /** Geld von einer Art in die andere umbuchen (z.B. Geldwäsche). Gebühr wird abgezogen. */
  convert(ctx: Ctx, from: MoneyKind, to: MoneyKind, amount: number, fee = 0, reason = ''): boolean {
    if (!wallet.pay(ctx, amount, from, reason)) return false;
    change(ctx, to, amount - fee, reason);
    return true;
  },
};
