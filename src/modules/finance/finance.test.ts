import { describe, expect, it } from 'vitest';
import { clock, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { DEFAULT_BOT, newBotStats, playFor } from '../../playtest/bot';
import { getSpots } from '../spots';
import { getStaff } from '../staff';
import { DAYS_KEPT } from './config';
import {
  bookDay,
  categoryLines,
  currentDay,
  dailyProfits,
  dayReport,
  lieutenantResult,
  periodReport,
  spotResult,
  wageRunway,
} from './index';

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
});
