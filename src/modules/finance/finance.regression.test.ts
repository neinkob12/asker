// Regressionstests aus dem Bugreview (Paket finance-markt): Buchhalter-Zeile je Stadt der Bilanz und die
// Verbform im Satz „Warum“ der Kasse.

import { describe, expect, it } from 'vitest';
import { MONEY_CATEGORIES, type MoneyCategory, type Simulation, wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { enlist, generateProfile, type StaffMember, specialistEffect } from '../staff';
import { ALL_FILTER, accountantGains, type CategoryRow, explainReport, type Report } from './index';

/** Ein Spiel mit Köln und Hamburg, in dem niemand von selbst kauft: Es bewegt sich nur das Geld des Tests. */
function twoCities(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.city.unlocked = ['koeln', 'hamburg'];
  return sim;
}

function accountant(sim: Simulation, cityId: string): StaffMember {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, 'accountant'), { origin: 'pool', cityId });
  m.stats = { speed: 70, caution: 70, strength: 70, charisma: 70, loyalty: 70 };
  return m;
}

/** Umsatz und Löhne einer Stadt buchen (kommt mit dem nächsten Schritt in der Kasse an). */
function book(sim: Simulation, cityId: string, sales: number, wages: number): void {
  const ctx = sim.ctx('test');
  wallet.earn(ctx, sales, 'dirty', 'Verkauf', { category: 'sales.street', cityId });
  wallet.pay(ctx, wages, 'dirty', 'Lohn', { category: 'wages.runner', cityId });
}

function expectedGain(sim: Simulation, cityId: string, sales: number, wages: number) {
  const revenueShare = specialistEffect(sim.state, 'revenue', cityId);
  const wageShare = specialistEffect(sim.state, 'wages', cityId);
  return {
    extra: Math.round((sales * revenueShare) / (1 + revenueShare)),
    saved: Math.round((wages * wageShare) / (1 - wageShare)),
  };
}

describe('Buchhalter-Zeile rechnet je Stadt der Bilanz', () => {
  it('„Alle Städte“ zählt nur Umsatz und Löhne der Stadt mit Buchhalter', () => {
    const sim = twoCities();
    sim.state.wallet.dirty = 40000;
    const koeln = accountant(sim, 'koeln');
    book(sim, 'koeln', 1070, 300);
    book(sim, 'hamburg', 1000, 200);
    sim.advance(1);
    const gains = accountantGains(sim.state, 'today', ALL_FILTER);
    expect(gains).toHaveLength(1);
    expect(gains[0]).toMatchObject({ staffId: koeln.id, cityId: 'koeln', ...expectedGain(sim, 'koeln', 1070, 300) });
  });

  it('Filter auf eine Stadt ohne Buchhalter: keine Zeile; Filter auf Köln aus Hamburg: Kölns Buchhalter', () => {
    const sim = twoCities();
    sim.state.wallet.dirty = 40000;
    const koeln = accountant(sim, 'koeln');
    book(sim, 'koeln', 1070, 300);
    book(sim, 'hamburg', 1000, 200);
    sim.advance(1);
    expect(accountantGains(sim.state, 'today', { kind: 'city', cityId: 'hamburg' })).toEqual([]);
    // Aktive Stadt Hamburg (ohne Buchhalter): Die Zeile fehlte vorher trotz Filter auf Köln.
    sim.state.modules.city.active = 'hamburg';
    const gains = accountantGains(sim.state, 'today', { kind: 'city', cityId: 'koeln' });
    expect(gains).toHaveLength(1);
    expect(gains[0]).toMatchObject({ staffId: koeln.id, cityId: 'koeln', ...expectedGain(sim, 'koeln', 1070, 300) });
    expect(accountantGains(sim.state, 'today', ALL_FILTER)).toEqual(gains);
  });

  it('mit Buchhalter in beiden Städten je Stadt eine Zeile mit ihrem eigenen Anteil', () => {
    const sim = twoCities();
    sim.state.wallet.dirty = 40000;
    accountant(sim, 'koeln');
    const hamburg = accountant(sim, 'hamburg');
    hamburg.stats = { speed: 40, caution: 40, strength: 40, charisma: 40, loyalty: 70 };
    book(sim, 'koeln', 1070, 300);
    book(sim, 'hamburg', 1000, 200);
    sim.advance(1);
    const gains = accountantGains(sim.state, 'today', ALL_FILTER);
    expect(gains.map((g) => g.cityId)).toEqual(['koeln', 'hamburg']);
    expect(gains[0]).toMatchObject(expectedGain(sim, 'koeln', 1070, 300));
    expect(gains[1]).toMatchObject({ staffId: hamburg.id, ...expectedGain(sim, 'hamburg', 1000, 200) });
  });
});

function row(category: MoneyCategory, amount: number): CategoryRow {
  return { category, ...MONEY_CATEGORIES[category], amount, dirty: amount, clean: 0 };
}

function reportOf(rows: CategoryRow[]): Report {
  const sum = (group: string) => rows.filter((r) => r.group === group).reduce((s, r) => s + r.amount, 0);
  const income = sum('income');
  const expenses = -sum('expense');
  const losses = -sum('loss');
  const profit = income - expenses - losses;
  return { from: 1, to: 1, rows, income, expenses, losses, profit, net: { dirty: profit, clean: 0 }, wages: 0 };
}

describe('Verbform im Satz „Warum“ passt zur Bezeichnung', () => {
  it('Posten in der Mehrzahl: „sind höher“ bzw. „bringen“', () => {
    for (const category of ['loss.gang', 'wages.extra', 'trade.freight', 'tribute'] as const) {
      const text = explainReport(reportOf([row(category, -1500), row('sales.street', 1000)]));
      expect(text, category).toContain(`${MONEY_CATEGORIES[category].label} (`);
      expect(text, category).toContain(') sind höher als');
    }
    const trade = explainReport(reportOf([row('sales.trade', 2000), row('goods.purchase', -500)]));
    expect(trade).toContain(`${MONEY_CATEGORIES['sales.trade'].label} bringen `);
  });

  it('Posten in der Einzahl bleiben bei „ist höher“ bzw. „bringt“, auch mit „und“ in Klammern', () => {
    for (const category of ['loss.customs', 'goods.purchase', 'wages.jail'] as const) {
      const text = explainReport(reportOf([row(category, -1500), row('sales.street', 1000)]));
      expect(text, category).toContain(') ist höher als');
    }
    expect(explainReport(reportOf([row('sales.street', 2000)]))).toContain('Straßenverkauf bringt ');
  });
});
