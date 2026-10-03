// Geld: Schwarzgeld und sauberes Geld getrennt.
// Alles Illegale wird mit Schwarzgeld bezahlt, für Legales braucht man gewaschenes (sauberes) Geld.
// Jede Kontobewegung bekommt eine Kategorie (MoneyCategory), damit die Kasse (Modul finance) eine Gewinn- und
// Verlustrechnung führen kann: wallet.pay(ctx, 80, 'dirty', 'Lohn Murat K.', 'wages.runner').
// Statt der Kategorie geht auch ein Etikett mit Bezug ({ category, staffId?, spotId?, cityId? }), z.B. für Löhne pro Spot.

import type { Ctx, GameState } from './types';

export type MoneyKind = 'dirty' | 'clean';

export interface WalletState {
  dirty: number;
  clean: number;
}

/** Kategorien der Kontobewegungen (für die Gewinn- und Verlustrechnung). */
export type MoneyCategory =
  // Einnahmen
  | 'sales.street'
  | 'sales.delivery'
  | 'sales.wholesale'
  | 'income.other'
  | 'income.city'
  // Ausgaben
  | 'goods.purchase'
  | 'wages.runner'
  | 'wages.security'
  | 'wages.transport'
  | 'wages.lead'
  | 'wages.specialist'
  | 'wages.jail'
  | 'wages.injured'
  | 'hiring'
  | 'bail'
  | 'expansion'
  | 'tribute'
  | 'laundering'
  | 'expense.other'
  | 'share.righthand'
  | 'expense.city'
  // Verluste
  | 'loss.police'
  | 'loss.theft'
  | 'loss.betrayal'
  | 'loss.encounter'
  | 'loss.customs'
  // Umbuchung (Geldwäsche: Schwarzgeld wird sauberes Geld, zählt nicht als Gewinn oder Verlust)
  | 'transfer';

export type MoneyGroup = 'income' | 'expense' | 'loss' | 'transfer';

export interface MoneyCategoryInfo {
  label: string;
  group: MoneyGroup;
  /** Name eines Icons aus src/ui (die Oberfläche löst ihn auf). */
  icon: string;
}

/** Beschriftung, Gruppe und Symbol jeder Kategorie, in der Reihenfolge der Kasse. */
export const MONEY_CATEGORIES: Record<MoneyCategory, MoneyCategoryInfo> = {
  'sales.street': { label: 'Straßenverkauf', group: 'income', icon: 'pin' },
  'sales.delivery': { label: 'Lieferaufträge', group: 'income', icon: 'bike' },
  'sales.wholesale': { label: 'Großhandel', group: 'income', icon: 'package' },
  'income.other': { label: 'Sonstige Einnahmen', group: 'income', icon: 'coinEuro' },
  'goods.purchase': { label: 'Einkauf Ware', group: 'expense', icon: 'truck' },
  'wages.runner': { label: 'Löhne Läufer', group: 'expense', icon: 'runner' },
  'wages.security': { label: 'Löhne Sicherheit', group: 'expense', icon: 'shield' },
  'wages.transport': { label: 'Löhne Fahrer', group: 'expense', icon: 'truck' },
  'wages.lead': { label: 'Löhne Leutnants und Rechte Hand', group: 'expense', icon: 'crew' },
  'wages.specialist': { label: 'Löhne Spezialisten', group: 'expense', icon: 'scale' },
  'wages.jail': { label: 'Stillhaltegeld (Haft)', group: 'expense', icon: 'jail' },
  'wages.injured': { label: 'Halber Lohn (verletzt)', group: 'expense', icon: 'bandage' },
  hiring: { label: 'Anheuern', group: 'expense', icon: 'userPlus' },
  bail: { label: 'Kaution', group: 'expense', icon: 'scale' },
  expansion: { label: 'Ausbau', group: 'expense', icon: 'building' },
  tribute: { label: 'Schutzgeld und Tribut', group: 'expense', icon: 'handshake' },
  laundering: { label: 'Geldwäsche-Gebühr', group: 'expense', icon: 'washing' },
  'expense.other': { label: 'Sonstige Ausgaben', group: 'expense', icon: 'cart' },
  // Auftrag 30: Städte. Die Rechte Hand mit Vollmacht bekommt ihren Anteil am Tagesgewinn, eine schlafende Stadt bucht
  // ihr Tagesergebnis als Ganzes.
  'share.righthand': { label: 'Anteil Rechte Hand', group: 'expense', icon: 'crown' },
  'income.city': { label: 'Ergebnis einer Stadt im Schlafmodus (Rechte Hand)', group: 'income', icon: 'building' },
  'expense.city': { label: 'Verlust einer Stadt im Schlafmodus', group: 'expense', icon: 'building' },
  'loss.police': { label: 'Polizei', group: 'loss', icon: 'siren' },
  'loss.theft': { label: 'Überfälle und Diebstahl', group: 'loss', icon: 'alert' },
  'loss.betrayal': { label: 'Verrat', group: 'loss', icon: 'userMinus' },
  'loss.encounter': { label: 'Konfrontationen', group: 'loss', icon: 'swords' },
  'loss.customs': { label: 'Zoll (Autobahn und Kai)', group: 'loss', icon: 'anchor' },
  transfer: { label: 'Umbuchung', group: 'transfer', icon: 'refresh' },
};

export const MONEY_CATEGORY_IDS = Object.keys(MONEY_CATEGORIES) as MoneyCategory[];

/** Kategorie mit Bezug, z.B. wessen Lohn das ist oder an welchem Spot verkauft wurde. */
export interface MoneyTag {
  category: MoneyCategory;
  staffId?: string;
  spotId?: string;
  /**
   * Stadt, zu der die Buchung gehört (Auftrag 30). Fehlt sie, leitet die Kasse sie aus spotId oder staffId ab, sonst
   * zählt die aktive Stadt.
   */
  cityId?: string;
}

declare module './types' {
  interface GameEvents {
    /**
     * Jede Kontobewegung. amount ist positiv (Einnahme) oder negativ (Ausgabe). category fehlt nur bei Aufrufen ohne
     * Kategorie (alte Stellen), staffId/spotId nur, wenn der Aufrufer einen Bezug mitgibt.
     */
    'wallet.changed': {
      kind: MoneyKind;
      amount: number;
      balance: number;
      reason: string;
      category?: MoneyCategory;
      staffId?: string;
      spotId?: string;
      cityId?: string;
    };
  }
}

/**
 * Ein Betrag ist eine endliche Zahl ab 0. NaN darf nie ins Konto: Danach wäre jeder Vergleich falsch (alles "bezahlbar"),
 * und das Speichern macht daraus null.
 */
function checkAmount(fn: string, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`wallet.${fn}: Betrag muss eine endliche Zahl ab 0 sein (war ${amount})`);
  }
}

function change(ctx: Ctx, kind: MoneyKind, amount: number, reason: string, tag?: MoneyCategory | MoneyTag): void {
  if (amount === 0) return;
  ctx.state.wallet[kind] += amount;
  const t = typeof tag === 'string' ? { category: tag } : tag;
  ctx.emit('wallet.changed', {
    kind,
    amount,
    balance: ctx.state.wallet[kind],
    reason,
    ...(t ? { category: t.category } : {}),
    ...(t?.staffId ? { staffId: t.staffId } : {}),
    ...(t?.spotId ? { spotId: t.spotId } : {}),
    ...(t?.cityId ? { cityId: t.cityId } : {}),
  });
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
  earn(ctx: Ctx, amount: number, kind: MoneyKind = 'dirty', reason = '', category?: MoneyCategory | MoneyTag): void {
    checkAmount('earn', amount);
    change(ctx, kind, amount, reason, category);
  },

  /** Bezahlen. Gibt false zurück und ändert nichts, wenn das Geld nicht reicht. */
  pay(ctx: Ctx, amount: number, kind: MoneyKind = 'dirty', reason = '', category?: MoneyCategory | MoneyTag): boolean {
    checkAmount('pay', amount);
    if (ctx.state.wallet[kind] < amount) return false;
    change(ctx, kind, -amount, reason, category);
    return true;
  },

  /**
   * Geld verlieren (Beschlagnahme, Diebstahl): höchstens so viel, wie da ist (auch Infinity = alles). Gibt den
   * verlorenen Betrag zurück; ein negativer Betrag verliert nichts.
   */
  lose(ctx: Ctx, amount: number, kind: MoneyKind = 'dirty', reason = '', category?: MoneyCategory | MoneyTag): number {
    if (Number.isNaN(amount)) throw new Error('wallet.lose: Betrag ist keine Zahl');
    const lost = Math.max(0, Math.min(amount, ctx.state.wallet[kind]));
    change(ctx, kind, -lost, reason, category);
    return lost;
  },

  /**
   * Geld von einer Art in die andere umbuchen (z.B. Geldwäsche). Die Gebühr wird abgezogen und als eigene Bewegung
   * mit der Kategorie feeCategory verbucht, der Rest als Umbuchung ('transfer').
   */
  convert(
    ctx: Ctx,
    from: MoneyKind,
    to: MoneyKind,
    amount: number,
    fee = 0,
    reason = '',
    feeCategory: MoneyCategory = 'laundering',
  ): boolean {
    // Die Gebühr kann nicht größer sein als der Betrag, sonst entstünde Geld aus dem Nichts.
    checkAmount('convert', amount);
    checkAmount('convert', fee);
    if (fee > amount || ctx.state.wallet[from] < amount) return false;
    change(ctx, from, -(amount - fee), reason, 'transfer');
    if (fee > 0) change(ctx, from, -fee, reason, feeCategory);
    change(ctx, to, amount - fee, reason, 'transfer');
    return true;
  },
};
