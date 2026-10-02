import { describe, expect, it } from 'vitest';
import { clock, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { DEFAULT_BOT, newBotStats, playFor } from '../../playtest/bot';
import { getPool } from '../recruiting';
import { customSpots, getSpots } from '../spots';
import { enlist, generateProfile, getStaff } from '../staff';
import { DAYS_KEPT, REASON_DAYS_KEPT } from './config';
import {
  balance,
  balanceHistory,
  bookDay,
  categoryLines,
  currentDay,
  dailyProfits,
  dayReport,
  explainReport,
  filterTargets,
  lieutenantResult,
  periodReport,
  spotResult,
  wageRunway,
} from './index';

/** Ein Spiel, in dem niemand von selbst kauft: Es bewegt sich nur das Geld, das der Test bewegt. */
function quietGame(seed = 1) {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.dirty = 40000;
  return sim;
}

/** Läufer mit Stufe 2 und guten Werten (wird Leutnant). */
function recruitRunner(sim: ReturnType<typeof quietGame>, level = 2) {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
  member.stats.loyalty = 80;
  member.stats.caution = 90;
  return member;
}

describe('Kasse', () => {
  it('jede Kontobewegung im Bot-Lauf hat eine Kategorie', () => {
    const sim = createTestGame({ seed: 3 });
    const events = recordEvents(sim);
    playFor(sim, 5 * 1440, newBotStats(), DEFAULT_BOT);
    const changes = eventsOfType(events, 'wallet.changed');
    expect(changes.length).toBeGreaterThan(100);
    const missing = changes.filter((e) => !e.payload.category).map((e) => e.payload.reason);
    expect(missing).toEqual([]);
  });

  it('bucht nach Tagen, Mitternacht zählt zum alten Tag, höchstens 14 Tage zurück', () => {
    expect(bookDay(clock.at(2, 0, 0))).toBe(1);
    expect(bookDay(clock.at(2, 0, 1))).toBe(2);
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    // Ereignisse aus ctx kommen mit dem nächsten Schritt an.
    wallet.earn(ctx, 100, 'dirty', 'Test', 'income.other');
    sim.advance(1);
    expect(dayReport(sim.state).income).toBe(100);
    sim.advance(clock.at(2, 0, 0) - 1 - sim.state.time);
    wallet.pay(ctx, 30, 'dirty', 'Mitternacht', 'expense.other');
    sim.advance(1);
    expect(dayReport(sim.state).profit).toBe(70);
    expect(currentDay(sim.state)).toBe(1);
    wallet.pay(ctx, 50, 'dirty', 'Morgens', 'goods.purchase');
    sim.advance(1);
    expect(currentDay(sim.state)).toBe(2);
    expect(dayReport(sim.state).profit).toBe(-50);
    expect(dayReport(sim.state, 1).profit).toBe(70);
    expect(periodReport(sim.state, 7).profit).toBe(20);
    expect(categoryLines(sim.state, 'goods.purchase', 7)).toEqual([{ reason: 'Morgens', amount: -50, count: 1 }]);
    // Weit vorspulen: alte Tage fallen weg, leere Tage werden nachgetragen.
    sim.advance(20 * 1440);
    wallet.earn(ctx, 10, 'dirty', 'Später', 'income.other');
    sim.advance(1);
    expect(sim.state.modules.finance.days.length).toBeLessThanOrEqual(DAYS_KEPT + 1);
    expect(dayReport(sim.state, 1).profit).toBe(0);
    expect(dailyProfits(sim.state, 7)).toHaveLength(7);
    // 30 Tage Tageswerte, einzelne Buchungstexte nur für die jüngsten Tage.
    expect(DAYS_KEPT).toBe(30);
    const old = sim.state.modules.finance.days.filter((d) => d.day < currentDay(sim.state) - REASON_DAYS_KEPT);
    expect(old.length).toBeGreaterThan(0);
    expect(old.every((d) => Object.keys(d.reasons).length === 0)).toBe(true);
    // Tag 1 (70 €) und Tag 2 (−50 €) stehen nach 20 Tagen noch im Buch, dazu die 10 € von heute.
    expect(dayReport(sim.state, 21).profit).toBe(70);
    expect(dayReport(sim.state, 20).profit).toBe(-50);
    expect(balance(sim.state, 'month').profit).toBe(30);
  });

  it('Bilanz nach Zeitraum und Filter mit einem Satz, warum', () => {
    const sim = createTestGame();
    const spot = getSpots(sim.state)[0];
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: spot.id } }).ok).toBe(true);
    playFor(sim, 1440, newBotStats(), { ...DEFAULT_BOT, personalSpots: 0 });
    const all = balance(sim.state, 'week');
    expect(all.rows.some((r) => r.category === 'sales.street')).toBe(true);
    expect(explainReport(all)).toMatch(/Straßenverkauf|Löhne|Einkauf|Anheuern/);
    const bySpot = balance(sim.state, 'week', { kind: 'spot', spotId: spot.id });
    expect(bySpot.income).toBe(spotResult(sim.state, spot.id, 7).revenue);
    expect(bySpot.rows.find((r) => r.category === 'wages.runner')?.amount).toBe(
      -spotResult(sim.state, spot.id, 7).wages,
    );
    const byVeedel = balance(sim.state, 'week', { kind: 'veedel', veedelId: spot.veedelId });
    expect(byVeedel.income).toBeGreaterThanOrEqual(bySpot.income);
    expect(balance(sim.state, 'week', { kind: 'lieutenant', staffId: 'niemand' }).rows).toEqual([]);
    expect(balanceHistory(sim.state, 'month').length).toBeLessThanOrEqual(30);
    expect(balanceHistory(sim.state, 'week', { kind: 'spot', spotId: spot.id }).at(-1)?.profit).toBe(
      balance(sim.state, 'today', { kind: 'spot', spotId: spot.id }).profit,
    );
    expect(explainReport({ ...all, rows: [], income: 0, expenses: 0, losses: 0, profit: 0 })).toBe(
      'Keine Kontobewegung.',
    );
  });

  it('Geldwäsche ist eine Umbuchung, nur die Gebühr ist eine Ausgabe', () => {
    const sim = createTestGame();
    wallet.earn(sim.ctx('test'), 2000, 'dirty', 'Start', 'income.other');
    sim.advance(1);
    const before = dayReport(sim.state).profit;
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1000 } }).ok).toBe(true);
    const report = dayReport(sim.state);
    const fee = report.rows.find((r) => r.category === 'laundering')?.amount ?? 0;
    expect(fee).toBeLessThan(0);
    expect(report.profit).toBe(before + fee);
  });

  it('rechnet Umsatz und Löhne pro Spot und Leutnant', () => {
    const sim = createTestGame();
    const spot = getSpots(sim.state)[0];
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: spot.id } }).ok).toBe(true);
    const runner = getStaff(sim.state, { spotId: spot.id })[0];
    playFor(sim, 1440, newBotStats(), { ...DEFAULT_BOT, personalSpots: 0 });
    const result = spotResult(sim.state, spot.id, 2);
    expect(result.sales).toBeGreaterThan(0);
    expect(result.revenue).toBeGreaterThan(0);
    expect(result.invest).toBeGreaterThan(0);
    // Der Lohn um Mitternacht zählt für den Spot, an dem der Läufer steht.
    expect(result.wages).toBeGreaterThanOrEqual(runner.wage);
    expect(result.result).toBe(result.revenue - result.goodsCost - result.wages);
    // Ohne Leutnant gibt es kein Leutnant-Ergebnis.
    expect(lieutenantResult(sim.state, runner.id, 2).revenue).toBe(0);
  });

  it('Reichweite der Löhne', () => {
    const sim = createTestGame();
    expect(wageRunway(sim.state)).toEqual({ due: 0, days: null, warn: false });
    const spot = getSpots(sim.state)[0];
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: spot.id } });
    const runway = wageRunway(sim.state);
    expect(runway.due).toBeGreaterThan(0);
    expect(runway.days).toBe(Math.floor(sim.state.wallet.dirty / runway.due));
    wallet.lose(sim.ctx('test'), sim.state.wallet.dirty, 'dirty', 'Weg', 'loss.theft');
    sim.advance(1);
    expect(wageRunway(sim.state).warn).toBe(true);
  });
  it('der Bilanz-Filter kennt auch selbst gegründete Spots und ihr Veedel', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'spots.found', payload: { lng: 7.0035, lat: 50.9385 } }).ok).toBe(true);
    const [own] = customSpots(sim.state);
    // Eigene Spots stehen nicht in "unlocked": Sie dürfen im Filter trotzdem nicht fehlen (sonst tut der Tipp auf
    // "Pro Spot" nichts, weil der Filter sofort auf "Ganz Köln" zurückfällt).
    expect(sim.state.modules.spots.unlocked).not.toContain(own.id);
    const targets = filterTargets(sim.state);
    expect(targets.spots.map((s) => s.id)).toContain(own.id);
    expect(targets.veedelIds).toContain(own.veedelId);
    expect(targets.spots.map((s) => s.id).sort()).toEqual(
      getSpots(sim.state)
        .map((s) => s.id)
        .sort(),
    );
  });

  it('Handgeld eines Bewerbers zählt zu den einmaligen Kosten seines Spots und seines Leutnants', () => {
    const sim = quietGame();
    const lieutenant = recruitRunner(sim);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lieutenant.id, spotIds: ['uni'] } }).ok).toBe(
      true,
    );
    const candidate = getPool(sim.state)[0];
    candidate.role = 'runner';
    expect(
      sim.dispatch({
        type: 'recruiting.hire',
        payload: { candidateId: candidate.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(true);
    expect(spotResult(sim.state, 'uni', 1).invest).toBe(candidate.hireCost);
    expect(lieutenantResult(sim.state, lieutenant.id, 1).invest).toBe(candidate.hireCost);
    // Der Filter für den Leutnant zeigt die Kosten (die Erklärung verspricht "Anheuern, Freischalten").
    const filtered = balance(sim.state, 'today', { kind: 'lieutenant', staffId: lieutenant.id });
    expect(filtered.rows.find((r) => r.category === 'hiring')?.amount).toBe(-candidate.hireCost);
  });

  it('der Lohn eines Abgetauchten zählt weiter für seinen Spot und seinen Leutnant', () => {
    const sim = quietGame();
    const lieutenant = recruitRunner(sim);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lieutenant.id, spotIds: ['uni'] } }).ok).toBe(
      true,
    );
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } }).ok).toBe(true);
    const runner = getStaff(sim.state, { spotId: 'uni' })[0];
    // Kurz vor Mitternacht taucht das Veedel ab: Der Läufer hat keinen Einsatz mehr, wenn der Lohn gebucht wird und die
    // Kasse die Buchung liest.
    sim.advance(clock.at(2, 0, 0) - 5 - sim.state.time);
    const veedelId = getSpots(sim.state).find((s) => s.id === 'uni')?.veedelId ?? '';
    expect(sim.dispatch({ type: 'staff.lieLow', payload: { veedelId, until: sim.state.time + 600 } }).ok).toBe(true);
    expect(runner.assignment).toBeNull();
    sim.advance(10);
    expect(sim.state.modules.staff.hiding[veedelId]).toBeDefined();
    expect(spotResult(sim.state, 'uni', 2).wages).toBe(runner.wage);
    expect(lieutenantResult(sim.state, lieutenant.id, 2).wages).toBe(runner.wage + lieutenant.wage);
  });

  it('der Lohn trägt den Spot der Person schon bei der Buchung (die Kasse liest ihn erst später im Schritt)', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } }).ok).toBe(true);
    const runner = getStaff(sim.state, { spotId: 'uni' })[0];
    sim.advance(clock.at(2, 0, 0) + 1 - sim.state.time);
    const wage = eventsOfType(events, 'wallet.changed').find((e) => e.payload.category === 'wages.runner');
    expect(wage?.payload).toMatchObject({ staffId: runner.id, spotId: 'uni', amount: -runner.wage });
  });

  it('eine Bilanz mit nur einer Umbuchung sagt das, statt "Keine Kontobewegung"', () => {
    const sim = quietGame();
    // Kurz vor Mitternacht anfangen: Die Wäsche läuft über die Tagesgrenze, der neue Tag hat nur die Umbuchung.
    sim.advance(clock.at(2, 0, 0) - 30 - sim.state.time);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 2000, channel: 'kiosk' } }).ok).toBe(true);
    sim.advance(clock.at(2, 3, 0) - sim.state.time);
    const today = balance(sim.state, 'today');
    expect(today.rows.map((r) => r.category)).toEqual(['transfer']);
    expect(today.rows[0].clean).toBeGreaterThan(0);
    expect(today.profit).toBe(0);
    expect(explainReport(today)).toMatch(/Umbuchung/);
    expect(explainReport(today)).not.toMatch(/Keine Kontobewegung/);
  });

  it('30-Tage-Summe einer Kategorie ist mehr als die Summe der Buchungstexte (das Panel nimmt die Bilanz, nicht die Texte)', () => {
    const sim = quietGame();
    const ctx = sim.ctx('test');
    for (let day = 0; day < 12; day++) {
      wallet.pay(ctx, 100, 'dirty', `Einkauf ${day}`, 'goods.purchase');
      sim.advance(1440);
    }
    const month = balance(sim.state, 'month').rows.find((r) => r.category === 'goods.purchase');
    expect(month?.amount).toBe(-1200);
    // Texte gibt es nur für die jüngsten Tage: Aus ihnen allein wäre die Summe zu klein.
    const fromTexts = categoryLines(sim.state, 'goods.purchase', 30).reduce((sum, l) => sum + l.amount, 0);
    expect(fromTexts).toBeGreaterThan(-1200);
  });
});
