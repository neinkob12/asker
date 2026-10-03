// Kasse: Buch über Einnahmen und Ausgaben pro Spieltag (heute plus die letzten 30 Tage, Auftrag 27).
// Hört auf jede Kontobewegung ('wallet.changed', mit Kategorie aus dem Kern) und jeden Verkauf ('sale.completed') und
// führt daraus eine Gewinn- und Verlustrechnung: Summen je Kategorie und Geldart, Buchungstexte, Umsatz und Löhne pro
// Spot und pro Leutnant, dazu seit Auftrag 30 Summen je Kategorie pro Stadt (Filter "Stadt", Anteil der Rechten Hand,
// Schlafmodus). Eine Buchung genau um Mitternacht zählt noch zum Tag, der gerade endet (die Löhne, die um
// 0 Uhr gezahlt werden, gehören zum Tag davor). Geldwäsche ist eine Umbuchung ('transfer') und zählt nicht als Gewinn.
//
// Öffentliche API (lesen):
//   bookDay(time), currentDay(state), dayReport(state, daysAgo), periodReport(state, days, offset?), dailyProfits(state, days),
//   categoryLines(state, category, days), spotResult(state, spotId, days), spotResults(state, days),
//   lieutenantResult(state, staffId, days), wageRunway(state), DAYS_KEPT, RUNWAY_WARN_DAYS
//   Bilanz (Auftrag 27): PERIODS, periodSpan(period), balance(state, period, filter), balanceHistory(state, period,
//   filter), explainReport(report), FinanceFilter, filterTargets(state)
//   Städte (Auftrag 30): cityReport(state, cityId, days, offset?), cityDayProfit(state, cityId, day), bookingCity(state, …)
// Keine Befehle, keine eigenen Ereignisse.

import {
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  MONEY_CATEGORIES,
  MONEY_CATEGORY_IDS,
  type MoneyCategory,
  type MoneyGroup,
  type MoneyKind,
} from '../../core';
import { activeCity, cityOfSpot } from '../city';
import { getLieutenantIds, lieutenantOfSpot, teamLeadOf } from '../hierarchy';
import { getAllSpots, getSpots, type Spot } from '../spots';
import { getStaffMember, payrollDue } from '../staff';
import { DAYS_KEPT, OTHER_REASON, REASON_DAYS_KEPT, REASON_LIMIT, RUNWAY_WARN_DAYS } from './config';

export { DAYS_KEPT, REASON_DAYS_KEPT, RUNWAY_WARN_DAYS } from './config';

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

type CategorySums = Partial<Record<MoneyCategory, MoneySplit>>;

export interface DayBook {
  /** Spieltag (ab 1). */
  day: number;
  categories: CategorySums;
  /** Dieselben Summen pro Stadt (Auftrag 30). Ihre Summe ergibt categories. */
  cities: Record<string, CategorySums>;
  reasons: Partial<Record<MoneyCategory, Record<string, ReasonLine>>>;
  spots: Record<string, UnitBook>;
  lieutenants: Record<string, UnitBook>;
}

export interface FinanceState {
  /** Neuester Tag zuerst, höchstens DAYS_KEPT + 1. */
  days: DayBook[];
}

/** Tagesbuch in Version 1 (ohne Städte). */
type DayBookV1 = Omit<DayBook, 'cities'>;

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

function report(books: DayBook[], from: number, to: number, cityId?: string): Report {
  const sums = new Map<MoneyCategory, MoneySplit>();
  for (const book of books) {
    const categories = cityId === undefined ? book.categories : book.cities?.[cityId];
    if (!categories) continue;
    for (const [category, split] of Object.entries(categories) as [MoneyCategory, MoneySplit][]) {
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

/** Gewinn- und Verlustrechnung der letzten days Tage, heute eingeschlossen (mit offset: ab so vielen Tagen zurück). */
export function periodReport(state: GameState, days: number, offset = 0): Report {
  const to = currentDay(state) - offset;
  return report(booksOf(state, days, offset), Math.max(1, to - days + 1), to);
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

// --- Bilanz (Auftrag 27): Zeitraum und Filter ---

/** Zeiträume der Bilanz. */
export type Period = 'today' | 'yesterday' | 'week' | 'month';

export const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'yesterday', label: 'Gestern' },
  { value: 'week', label: '7 Tage' },
  { value: 'month', label: '30 Tage' },
];

/** Tage und Versatz eines Zeitraums (für die Lese-Funktionen der Kasse). */
export function periodSpan(period: Period): { days: number; offset: number } {
  if (period === 'yesterday') return { days: 1, offset: 1 };
  if (period === 'week') return { days: 7, offset: 0 };
  if (period === 'month') return { days: 30, offset: 0 };
  return { days: 1, offset: 0 };
}

/** Worauf die Bilanz schaut: alles, eine Stadt, ein Veedel, ein Spot oder ein Leutnant. */
export type FinanceFilter =
  | { kind: 'all' }
  | { kind: 'city'; cityId: string }
  | { kind: 'veedel'; veedelId: string }
  | { kind: 'spot'; spotId: string }
  | { kind: 'lieutenant'; staffId: string };

export const ALL_FILTER: FinanceFilter = { kind: 'all' };

/**
 * Worauf sich die Bilanz filtern lässt: offene Spots (auch selbst gegründete, die nicht in "unlocked" stehen), deren
 * Veedel und die Leutnants.
 */
export function filterTargets(state: GameState): {
  spots: readonly Spot[];
  veedelIds: string[];
  lieutenantIds: string[];
} {
  const spots = getSpots(state);
  return {
    spots,
    veedelIds: [...new Set(spots.map((s) => s.veedelId))],
    lieutenantIds: getLieutenantIds(state),
  };
}

/** Spots eines Veedels (auch gesperrte, falls dort früher verkauft wurde). */
function spotsOfVeedel(state: GameState, veedelId: string): string[] {
  return getAllSpots(state)
    .filter((s) => s.veedelId === veedelId)
    .map((s) => s.id);
}

/** Tagesbuch einer Einheit (Spot, Veedel, Leutnant) als Zeilen einer Bilanz. */
function unitReport(units: UnitBook[], from: number, to: number): Report {
  const sum = sumUnits(units);
  const rows: CategoryRow[] = [];
  const push = (category: MoneyCategory, label: string, amount: number) => {
    if (amount === 0) return;
    const info = MONEY_CATEGORIES[category];
    const dirty = Math.round(amount);
    rows.push({ category, label, group: info.group, icon: info.icon, amount: dirty, dirty, clean: 0 });
  };
  push('sales.street', 'Straßenverkauf', sum.revenue);
  push('goods.purchase', 'Einkauf der verkauften Ware', -sum.goodsCost);
  push('wages.runner', 'Löhne der Leute dort', -sum.wages);
  push('hiring', 'Anheuern und Ausbau', -sum.invest);
  const income = sum.revenue;
  const expenses = sum.goodsCost + sum.wages + sum.invest;
  return {
    from,
    to,
    rows,
    income,
    expenses,
    losses: 0,
    profit: income - expenses,
    net: { dirty: income - expenses, clean: 0 },
    wages: sum.wages,
  };
}

function unitsOf(state: GameState, filter: FinanceFilter, books: DayBook[]): UnitBook[] {
  if (filter.kind === 'spot') return books.flatMap((b) => (b.spots[filter.spotId] ? [b.spots[filter.spotId]] : []));
  if (filter.kind === 'lieutenant') {
    return books.flatMap((b) => (b.lieutenants[filter.staffId] ? [b.lieutenants[filter.staffId]] : []));
  }
  if (filter.kind === 'veedel') {
    const ids = spotsOfVeedel(state, filter.veedelId);
    return books.flatMap((b) => ids.flatMap((id) => (b.spots[id] ? [b.spots[id]] : [])));
  }
  return [];
}

/**
 * Bilanz eines Zeitraums: ganz Köln mit allen Kategorien, sonst Umsatz, Wareneinsatz, Löhne und einmalige Kosten der
 * Spots bzw. des Leutnants (die Kasse kennt Löhne und Verkäufe pro Spot, aber keine Gebühren pro Veedel).
 */
export function balance(state: GameState, period: Period, filter: FinanceFilter = ALL_FILTER): Report {
  const { days, offset } = periodSpan(period);
  const today = currentDay(state);
  const to = today - offset;
  const from = Math.max(1, to - days + 1);
  const books = booksOf(state, days, offset);
  if (filter.kind === 'all') return report(books, from, to);
  if (filter.kind === 'city') return report(books, from, to, filter.cityId);
  return unitReport(unitsOf(state, filter, books), from, to);
}

/** Gewinn je Tag im Zeitraum (ältester zuerst) für den Verlauf; Heute und Gestern zeigen die letzte Woche. */
export function balanceHistory(
  state: GameState,
  period: Period,
  filter: FinanceFilter = ALL_FILTER,
): { day: number; profit: number }[] {
  const days = period === 'month' ? 30 : 7;
  const today = currentDay(state);
  const result: { day: number; profit: number }[] = [];
  for (let day = Math.max(1, today - days + 1); day <= today; day++) {
    const book = findDay(state, day);
    if (!book) {
      result.push({ day, profit: 0 });
      continue;
    }
    const profit =
      filter.kind === 'all'
        ? report([book], day, day).profit
        : filter.kind === 'city'
          ? report([book], day, day, filter.cityId).profit
          : unitReport(unitsOf(state, filter, [book]), day, day).profit;
    result.push({ day, profit });
  }
  return result;
}

// --- Städte (Auftrag 30) ---

/** Gewinn- und Verlustrechnung einer Stadt über die letzten days Tage (mit offset: ab so vielen Tagen zurück). */
export function cityReport(state: GameState, cityId: string, days: number, offset = 0): Report {
  const to = currentDay(state) - offset;
  return report(booksOf(state, days, offset), Math.max(1, to - days + 1), to, cityId);
}

/** Kategorien, die nicht zum eigenen Ergebnis einer Stadt zählen (Anteil der Rechten Hand, Schlafmodus). */
const NOT_OPERATING: readonly MoneyCategory[] = ['share.righthand', 'income.city', 'expense.city'];

/**
 * Ergebnis einer Stadt an einem Buchungstag aus dem eigenen Geschäft, ohne den Anteil der Rechten Hand und ohne
 * Ergebnisse aus dem Schlafmodus (für den Schnitt der Tageszusammenfassung). null, wenn der Tag nicht im Buch steht.
 */
export function cityDayProfit(state: GameState, cityId: string, day: number): number | null {
  const book = findDay(state, day);
  if (!book) return null;
  const r = report([book], day, day, cityId);
  return r.profit - r.rows.filter((row) => NOT_OPERATING.includes(row.category)).reduce((s, row) => s + row.amount, 0);
}

/** Zu welcher Stadt eine Buchung gehört: angegeben, sonst über den Spot oder die Person, sonst die aktive Stadt. */
export function bookingCity(state: GameState, payload: { cityId?: string; spotId?: string; staffId?: string }): string {
  if (payload.cityId) return payload.cityId;
  if (payload.spotId) return cityOfSpot(state, payload.spotId);
  const member = payload.staffId ? getStaffMember(state, payload.staffId) : undefined;
  return member?.cityId ?? activeCity(state);
}

/** Ein Satz, warum der Zeitraum Gewinn oder Verlust gemacht hat (größter Posten). */
export function explainReport(r: Report): string {
  const income = r.rows.filter((x) => x.group === 'income').sort((a, b) => b.amount - a.amount);
  const costs = r.rows.filter((x) => x.group === 'expense' || x.group === 'loss').sort((a, b) => a.amount - b.amount);
  if (r.rows.length === 0) return 'Keine Kontobewegung.';
  // Es gibt nur Umbuchungen (eine Wäsche läuft an oder ist fertig): weder Gewinn noch Verlust.
  if (r.income === 0 && r.expenses + r.losses === 0) return 'Nur Umbuchung (Geldwäsche), weder Gewinn noch Verlust.';
  const top = costs[0];
  const best = income[0];
  if (r.profit < 0) {
    if (top && best && -top.amount > best.amount) {
      return `${top.label} (${formatEuro(-top.amount)}) ${plural(top.label)} höher als ${bestPhrase(best)}.`;
    }
    if (top)
      return `Die Ausgaben übersteigen die Einnahmen, größter Posten: ${top.label} (${formatEuro(-top.amount)}).`;
    return 'Verlust ohne Einnahmen.';
  }
  if (best && top) {
    return `${best.label} ${plural(best.label) === 'sind' ? 'bringen' : 'bringt'} ${formatEuro(best.amount)}, größter Posten bei den Ausgaben: ${top.label} (${formatEuro(-top.amount)}).`;
  }
  if (best)
    return `${best.label} ${plural(best.label) === 'sind' ? 'bringen' : 'bringt'} ${formatEuro(best.amount)}, keine Ausgaben.`;
  return 'Ausgeglichen.';
}

/** "Löhne Läufer sind" vs. "Einkauf Ware ist". */
function plural(label: string): 'sind' | 'ist' {
  return /^(Löhne|Konfrontationen|Überfälle|Lieferaufträge|Sonstige)/.test(label) ? 'sind' : 'ist';
}

function bestPhrase(best: CategoryRow): string {
  return `${best.label === 'Straßenverkauf' ? 'der Umsatz' : best.label} (${formatEuro(best.amount)})`;
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
  return { day, categories: {}, cities: {}, reasons: {}, spots: {}, lieutenants: {} };
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
  // Einzelne Buchungstexte nur für die jüngsten Tage, ältere behalten nur ihre Tageswerte.
  for (const book of f.days) {
    if (book.day < day - REASON_DAYS_KEPT && Object.keys(book.reasons).length > 0) book.reasons = {};
  }
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
    cityId?: string;
  },
): void {
  const book = today(ctx);
  const category = payload.category ?? (payload.amount > 0 ? 'income.other' : 'expense.other');
  book.categories[category] ??= { dirty: 0, clean: 0 };
  (book.categories[category] as MoneySplit)[payload.kind] += payload.amount;
  const cityId = bookingCity(ctx.state, payload);
  book.cities ??= {};
  book.cities[cityId] ??= {};
  const city = book.cities[cityId];
  city[category] ??= { dirty: 0, clean: 0 };
  (city[category] as MoneySplit)[payload.kind] += payload.amount;
  addReason(book, category, payload.reason, payload.amount);

  const cost = -payload.amount;
  if (category.startsWith('wages.') && payload.staffId) {
    // Der Spot kommt mit der Buchung (die Löhne wissen, wo jemand arbeitet, auch wenn er abgetaucht ist oder im selben
    // Schritt kündigt); erst ohne Angabe wird er aus dem Einsatz geschlossen.
    const spotId = payload.spotId ?? staffSpot(ctx.state, payload.staffId);
    if (spotId) unit(book.spots, spotId).wages += cost;
    const lead = teamLeadOf(ctx.state, payload.staffId) ?? (spotId ? lieutenantOfSpot(ctx.state, spotId) : null);
    if (lead) unit(book.lieutenants, lead).wages += cost;
  } else if ((category === 'hiring' || category === 'expansion') && cost > 0) {
    const spotId = payload.spotId ?? (payload.staffId ? staffSpot(ctx.state, payload.staffId) : null);
    if (spotId) {
      unit(book.spots, spotId).invest += cost;
      const lead = lieutenantOfSpot(ctx.state, spotId);
      if (lead) unit(book.lieutenants, lead).invest += cost;
    }
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
  version: 2,
  init: (ctx) => ({ days: [emptyDay(currentDay(ctx.state))] }),
  migrations: {
    // Version 2 (Auftrag 30): Summen pro Stadt. Bis dahin war alles Köln.
    2: (old: { days: DayBookV1[] }): FinanceState => ({
      days: old.days.map((d) => ({ ...d, cities: { koeln: structuredClone(d.categories) } })),
    }),
  },
  on: {
    'wallet.changed': onWalletChanged,
    'sale.completed': onSale,
  },
});
