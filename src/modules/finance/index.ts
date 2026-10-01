// Kasse: Buch über Einnahmen und Ausgaben pro Spieltag (heute plus die letzten 14 Tage).
// Hört auf jede Kontobewegung ('wallet.changed', mit Kategorie aus dem Kern) und jeden Verkauf ('sale.completed') und
// führt daraus eine Gewinn- und Verlustrechnung: Summen je Kategorie und Geldart, Buchungstexte, Umsatz und Löhne pro
// Spot und pro Leutnant. Eine Buchung genau um Mitternacht zählt noch zum Tag, der gerade endet (die Löhne, die um
// 0 Uhr gezahlt werden, gehören zum Tag davor). Geldwäsche ist eine Umbuchung ('transfer') und zählt nicht als Gewinn.
//
// Öffentliche API (lesen):
//   bookDay(time), currentDay(state), dayReport(state, daysAgo), periodReport(state, days), dailyProfits(state, days),
//   categoryLines(state, category, days), spotResult(state, spotId, days), spotResults(state, days),
//   lieutenantResult(state, staffId, days), wageRunway(state), DAYS_KEPT, RUNWAY_WARN_DAYS
// Keine Befehle, keine eigenen Ereignisse.

import {
  type Ctx,
  clock,
  defineModule,
  type GameState,
  MONEY_CATEGORIES,
  MONEY_CATEGORY_IDS,
  type MoneyCategory,
  type MoneyGroup,
  type MoneyKind,
} from '../../core';
import { lieutenantOfSpot, teamLeadOf } from '../hierarchy';
import { getStaffMember, payrollDue } from '../staff';
import { DAYS_KEPT, OTHER_REASON, REASON_LIMIT, RUNWAY_WARN_DAYS } from './config';

export { DAYS_KEPT, RUNWAY_WARN_DAYS } from './config';

export interface MoneySplit {
  dirty: number;
  clean: number;
}

export interface ReasonLine {
  amount: number;
  count: number;
}

/** Ergebnis eines Spots oder Leutnants an einem Tag. */
export interface UnitBook {
  /** Umsatz (Straßenverkauf). */
  revenue: number;
  sales: number;
  /** Einkaufspreis der verkauften Ware. */
  goodsCost: number;
  /** Löhne der Leute dort (bzw. im Team des Leutnants, ihn selbst eingeschlossen). */
  wages: number;
  /** Einmalige Kosten (Freischalten, Anheuern). */
  invest: number;
}

export interface DayBook {
  /** Spieltag (ab 1). */
  day: number;
  categories: Partial<Record<MoneyCategory, MoneySplit>>;
  reasons: Partial<Record<MoneyCategory, Record<string, ReasonLine>>>;
  spots: Record<string, UnitBook>;
  lieutenants: Record<string, UnitBook>;
}

export interface FinanceState {
  /** Neuester Tag zuerst, höchstens DAYS_KEPT + 1. */
  days: DayBook[];
}

declare module '../../core' {
  interface ModuleStates {
    finance: FinanceState;
  }
}

// --- Lesen ---

/** Tag, zu dem eine Buchung zur Spielminute time gehört (genau um Mitternacht noch der alte Tag). */
export function bookDay(time: number): number {
  return Math.max(1, clock.day(time - 1));
}

/** Laufender Buchungstag. */
export function currentDay(state: GameState): number {
  return bookDay(state.time);
}

function findDay(state: GameState, day: number): DayBook | undefined {
  return state.modules.finance.days.find((d) => d.day === day);
}

/** Tage der letzten Zeit: heute (daysAgo 0) bis days − 1 Tage zurück, nur die, die im Buch stehen. */
function booksOf(state: GameState, days: number, offset = 0): DayBook[] {
  const today = currentDay(state);
  const result: DayBook[] = [];
  for (let i = offset; i < offset + days; i++) {
    const book = findDay(state, today - i);
    if (book) result.push(book);
  }
  return result;
}

export interface CategoryRow {
  category: MoneyCategory;
  label: string;
  group: MoneyGroup;
  icon: string;
  /** Betrag mit Vorzeichen (Einnahme positiv, Ausgabe negativ). */
  amount: number;
  dirty: number;
  clean: number;
}

export interface Report {
  /** Erster und letzter Tag des Zeitraums. */
  from: number;
  to: number;
  rows: CategoryRow[];
  income: number;
  /** Ausgaben und Verluste als positive Beträge. */
  expenses: number;
  losses: number;
  /** Einnahmen minus Ausgaben minus Verluste (ohne Umbuchungen). */
  profit: number;
  /** Veränderung je Geldart, ohne Umbuchungen. */
  net: MoneySplit;
  /** Summe der Löhne (alle Lohn-Kategorien und Stillhaltegeld) als positiver Betrag. */
  wages: number;
}

function report(books: DayBook[], from: number, to: number): Report {
  const sums = new Map<MoneyCategory, MoneySplit>();
  for (const book of books) {
    for (const [category, split] of Object.entries(book.categories) as [MoneyCategory, MoneySplit][]) {
      const sum = sums.get(category) ?? { dirty: 0, clean: 0 };
      sum.dirty += split.dirty;
      sum.clean += split.clean;
      sums.set(category, sum);
    }
  }
  const rows: CategoryRow[] = [];
  let income = 0;
  let expenses = 0;
  let losses = 0;
  let wages = 0;
  const net = { dirty: 0, clean: 0 };
  for (const category of MONEY_CATEGORY_IDS) {
    const split = sums.get(category);
    if (!split) continue;
    const amount = Math.round(split.dirty + split.clean);
    const info = MONEY_CATEGORIES[category];
    if (amount === 0 && info.group !== 'transfer') continue;
    rows.push({ category, ...info, amount, dirty: Math.round(split.dirty), clean: Math.round(split.clean) });
    if (info.group === 'transfer') continue;
    net.dirty += split.dirty;
    net.clean += split.clean;
    if (info.group === 'income') income += amount;
    else if (info.group === 'loss') losses -= amount;
    else expenses -= amount;
    if (category.startsWith('wages.')) wages -= amount;
  }
  return {
    from,
    to,
    rows,
    income,
    expenses,
    losses,
    profit: income - expenses - losses,
    net: { dirty: Math.round(net.dirty), clean: Math.round(net.clean) },
    wages,
  };
}

/** Gewinn- und Verlustrechnung eines Tages (0 = heute bis jetzt, 1 = gestern …). */
export function dayReport(state: GameState, daysAgo = 0): Report {
  const day = currentDay(state) - daysAgo;
  const book = findDay(state, day);
  return report(book ? [book] : [], day, day);
}

/** Gewinn- und Verlustrechnung der letzten days Tage, heute eingeschlossen. */
export function periodReport(state: GameState, days: number): Report {
  const today = currentDay(state);
  return report(booksOf(state, days), Math.max(1, today - days + 1), today);
}

/** Gewinn pro Tag für die letzten days Tage, ältester zuerst (für den Verlauf). Tage vor Spielbeginn fehlen. */
export function dailyProfits(state: GameState, days: number): { day: number; profit: number }[] {
  const today = currentDay(state);
  const result: { day: number; profit: number }[] = [];
  for (let day = Math.max(1, today - days + 1); day <= today; day++) {
    const book = findDay(state, day);
    result.push({ day, profit: book ? report([book], day, day).profit : 0 });
  }
  return result;
}

/** Buchungen einer Kategorie im Zeitraum, nach Betrag sortiert (größter zuerst). */
export function categoryLines(
  state: GameState,
  category: MoneyCategory,
  days: number,
  offset = 0,
): { reason: string; amount: number; count: number }[] {
  const lines = new Map<string, ReasonLine>();
  for (const book of booksOf(state, days, offset)) {
    for (const [reason, line] of Object.entries(book.reasons[category] ?? {})) {
      const sum = lines.get(reason) ?? { amount: 0, count: 0 };
      sum.amount += line.amount;
      sum.count += line.count;
      lines.set(reason, sum);
    }
  }
  return [...lines.entries()]
    .map(([reason, l]) => ({ reason, amount: Math.round(l.amount), count: l.count }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.reason.localeCompare(b.reason));
}

export interface UnitResult extends UnitBook {
  /** Umsatz minus Wareneinsatz minus Löhne (ohne einmalige Kosten). */
  result: number;
}

function sumUnits(books: UnitBook[]): UnitResult {
  const sum = { revenue: 0, sales: 0, goodsCost: 0, wages: 0, invest: 0 };
  for (const b of books) {
    sum.revenue += b.revenue;
    sum.sales += b.sales;
    sum.goodsCost += b.goodsCost;
    sum.wages += b.wages;
    sum.invest += b.invest;
  }
  const rounded = {
    revenue: Math.round(sum.revenue),
    sales: sum.sales,
    goodsCost: Math.round(sum.goodsCost),
    wages: Math.round(sum.wages),
    invest: Math.round(sum.invest),
  };
  return { ...rounded, result: rounded.revenue - rounded.goodsCost - rounded.wages };
}

/** Ergebnis eines Spots über die letzten days Tage (mit offset: ab so vielen Tagen zurück). */
export function spotResult(state: GameState, spotId: string, days: number, offset = 0): UnitResult {
  return sumUnits(booksOf(state, days, offset).flatMap((b) => (b.spots[spotId] ? [b.spots[spotId]] : [])));
}

/** Ergebnis aller Spots mit Bewegung im Zeitraum, das schwächste zuerst. */
export function spotResults(state: GameState, days: number, offset = 0): (UnitResult & { spotId: string })[] {
  const ids = new Set(booksOf(state, days, offset).flatMap((b) => Object.keys(b.spots)));
  return [...ids]
    .map((spotId) => ({ spotId, ...spotResult(state, spotId, days, offset) }))
    .sort((a, b) => a.result - b.result || a.spotId.localeCompare(b.spotId));
}

/** Ergebnis eines Leutnants (Umsatz an seinen Spots, Löhne seines Teams und sein eigener). */
export function lieutenantResult(state: GameState, staffId: string, days: number, offset = 0): UnitResult {
  return sumUnits(
    booksOf(state, days, offset).flatMap((b) => (b.lieutenants[staffId] ? [b.lieutenants[staffId]] : [])),
  );
}

export interface WageRunway {
  /** Löhne, die heute Nacht fällig werden. */
  due: number;
  /** So viele Nächte reicht das Schwarzgeld für die Löhne (null = keine Löhne). */
  days: number | null;
  /** Unter RUNWAY_WARN_DAYS. */
  warn: boolean;
}

/** Wie lange reicht das Schwarzgeld noch für die Löhne (ohne Einnahmen gerechnet)? */
export function wageRunway(state: GameState): WageRunway {
  const due = payrollDue(state);
  if (due <= 0) return { due: 0, days: null, warn: false };
  const days = Math.floor(Math.max(0, state.wallet.dirty) / due);
  return { due, days, warn: days < RUNWAY_WARN_DAYS };
}

// --- Schreiben (nur über Ereignisse) ---

function emptyDay(day: number): DayBook {
  return { day, categories: {}, reasons: {}, spots: {}, lieutenants: {} };
}

function emptyUnit(): UnitBook {
  return { revenue: 0, sales: 0, goodsCost: 0, wages: 0, invest: 0 };
}

/** Buch des laufenden Tags (legt neue Tage an, alte fallen weg). */
function today(ctx: Ctx): DayBook {
  const f = ctx.state.modules.finance;
  const day = currentDay(ctx.state);
  const latest = f.days[0];
  if (latest?.day === day) return latest;
  if (latest && latest.day > day) return findDay(ctx.state, day) ?? latest;
  // Fehlende Tage (ohne Buchung) leer nachtragen, damit der Verlauf stimmt.
  for (let d = latest ? Math.max(latest.day + 1, day - DAYS_KEPT) : day; d <= day; d++) f.days.unshift(emptyDay(d));
  if (f.days.length > DAYS_KEPT + 1) f.days.length = DAYS_KEPT + 1;
  return f.days[0];
}

function unit(map: Record<string, UnitBook>, id: string): UnitBook {
  map[id] ??= emptyUnit();
  return map[id];
}

function addReason(book: DayBook, category: MoneyCategory, reason: string, amount: number): void {
  book.reasons[category] ??= {};
  const reasons = book.reasons[category];
  const named = reason || MONEY_CATEGORIES[category].label;
  // Neue Buchungstexte nur bis zur Grenze, danach landet alles unter "Weitere".
  const key = reasons[named] || Object.keys(reasons).length < REASON_LIMIT ? named : OTHER_REASON;
  reasons[key] ??= { amount: 0, count: 0 };
  const target = reasons[key];
  target.amount += amount;
  target.count += 1;
}

/** Wo arbeitet die Person (für den Lohn pro Spot)? Auch in Haft zählt der Spot, an den sie zurückkehrt. */
function staffSpot(state: GameState, staffId: string): string | null {
  const m = getStaffMember(state, staffId);
  const place = m?.assignment ?? m?.returnTo;
  return place?.kind === 'spot' ? place.targetId : null;
}

function onWalletChanged(
  ctx: Ctx,
  payload: {
    kind: MoneyKind;
    amount: number;
    reason: string;
    category?: MoneyCategory;
    staffId?: string;
    spotId?: string;
  },
): void {
  const book = today(ctx);
  const category = payload.category ?? (payload.amount > 0 ? 'income.other' : 'expense.other');
  book.categories[category] ??= { dirty: 0, clean: 0 };
  (book.categories[category] as MoneySplit)[payload.kind] += payload.amount;
  addReason(book, category, payload.reason, payload.amount);

  const cost = -payload.amount;
  if (category.startsWith('wages.') && payload.staffId) {
    const spotId = staffSpot(ctx.state, payload.staffId);
    if (spotId) unit(book.spots, spotId).wages += cost;
    const lead = teamLeadOf(ctx.state, payload.staffId);
    if (lead) unit(book.lieutenants, lead).wages += cost;
  } else if ((category === 'hiring' || category === 'expansion') && cost > 0) {
    const spotId = payload.spotId ?? (payload.staffId ? staffSpot(ctx.state, payload.staffId) : null);
    if (spotId) unit(book.spots, spotId).invest += cost;
  }
}

function onSale(
  ctx: Ctx,
  payload: { spotId: string | null; revenue: number; goodsCost?: number; sellerId: string | null },
) {
  if (!payload.spotId) return;
  const book = today(ctx);
  const spot = unit(book.spots, payload.spotId);
  spot.revenue += payload.revenue;
  spot.sales += 1;
  spot.goodsCost += payload.goodsCost ?? 0;
  const lead = lieutenantOfSpot(ctx.state, payload.spotId);
  if (lead) {
    const lt = unit(book.lieutenants, lead);
    lt.revenue += payload.revenue;
    lt.sales += 1;
    lt.goodsCost += payload.goodsCost ?? 0;
  }
}

export default defineModule({
  id: 'finance',
  version: 1,
  init: (ctx) => ({ days: [emptyDay(currentDay(ctx.state))] }),
  on: {
    'wallet.changed': onWalletChanged,
    'sale.completed': onSale,
  },
});
