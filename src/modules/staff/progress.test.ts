// Level-Aufstieg, Loyalität und Verrat.

import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock } from '../goods';
import { getHeat } from '../police';
import { BETRAYAL_THRESHOLD, LEVEL_XP, LOYALTY, THEFT_GOODS_MAX, THEFT_MONEY_MAX } from './config';
import {
  addXp,
  betrayalChance,
  enlist,
  expectedWage,
  generateProfile,
  getStaff,
  getStaffMember,
  levelForXp,
  levelProgress,
  ROLE_INFO,
  type StaffMember,
  type StaffRole,
} from './index';
import { betray } from './routines';

function quietGame(): Simulation {
  const sim = createTestGame();
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, patch: Partial<StaffMember> = {}): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role), { origin: 'pool' });
  Object.assign(member, patch);
  return member;
}

const toMidnight = (sim: Simulation, days = 1) =>
  sim.advance(clock.at(clock.day(sim.state.time) + days) - sim.state.time);

describe('Erfahrung und Level', () => {
  it('Level-Tabelle und Fortschritt', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(LEVEL_XP[1] - 1)).toBe(1);
    expect(levelForXp(LEVEL_XP[1])).toBe(2);
    expect(levelForXp(1e9)).toBe(LEVEL_XP.length);
    expect(levelProgress(1, LEVEL_XP[1] / 2).fraction).toBeCloseTo(0.5);
    expect(levelProgress(LEVEL_XP.length, 1e9).fraction).toBe(1);
  });

  it('Arbeit bringt Erfahrung, beim Level-Aufstieg steigen die Werte des Typs', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
    const runner = getStaff(sim.state)[0];
    const before = { ...runner.stats };
    // Verkäufe bringen Erfahrung (hier direkt über das Ereignis).
    for (let i = 0; i < 15; i++) {
      sim.ctx('customers').emit('sale.completed', {
        channel: 'street',
        spotId: 'neumarkt',
        veedelId: 'altstadt-sued',
        productId: 'weed',
        amount: 3,
        quality: 0.6,
        revenue: 30,
        sellerId: runner.id,
        customerId: null,
      });
      sim.step();
    }
    const after = getStaffMember(sim.state, runner.id) as StaffMember;
    expect(after.xp).toBeGreaterThanOrEqual(LEVEL_XP[1]);
    expect(after.level).toBe(2);
    expect(after.record.sales).toBe(15);
    for (const key of ROLE_INFO.runner.keyStats) {
      if (key !== 'loyalty') expect(after.stats[key]).toBeGreaterThan(before[key]);
    }
    expect(after.stats.strength).toBe(before.strength);
    expect(eventsOfType(events, 'staff.levelUp').map((e) => e.payload)).toEqual([{ staffId: runner.id, level: 2 }]);
    expect(after.career.some((c) => c.text.includes('Level 2'))).toBe(true);
    // Höherer Level = höherer Lohnanspruch.
    expect(expectedWage(sim.state, runner.id)).toBeGreaterThan(ROLE_INFO.runner.wage);
  });

  it('mehrere Level auf einmal, Sicherheit lernt im Dienst, Spezialisten mit der Zeit', () => {
    const sim = quietGame();
    const runner = recruit(sim, 'runner');
    addXp(sim.ctx('staff'), runner.id, LEVEL_XP[3]);
    expect(getStaffMember(sim.state, runner.id)?.level).toBe(4);

    const guard = recruit(sim, 'security');
    const lawyer = recruit(sim, 'lawyer');
    sim.dispatch({
      type: 'staff.assign',
      payload: { staffId: guard.id, assignment: { kind: 'warehouse', targetId: 'ehrenfeld' } },
    });
    toMidnight(sim);
    expect(getStaffMember(sim.state, guard.id)?.xp).toBeGreaterThan(0);
    expect(getStaffMember(sim.state, lawyer.id)?.xp).toBeGreaterThan(0);
  });

  it('unbekannte Werte zeigen sich mit der Zeit', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner');
    expect(m.knownStats).toEqual([]);
    for (let d = 0; d < 20; d++) toMidnight(sim);
    expect(getStaffMember(sim.state, m.id)?.knownStats.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Loyalität', () => {
  it('sinkt bei zu niedrigem Lohn und steigt bei gutem Lohn', () => {
    const sim = quietGame();
    const cheap = recruit(sim, 'runner');
    const rich = recruit(sim, 'runner');
    cheap.stats.loyalty = 50;
    rich.stats.loyalty = 50;
    cheap.wage = Math.round(expectedWage(sim.state, cheap.id) * 0.5);
    rich.wage = Math.round(expectedWage(sim.state, rich.id) * 1.3);
    sim.state.wallet.dirty = 100000;
    for (let d = 0; d < 3; d++) toMidnight(sim);
    expect(getStaffMember(sim.state, cheap.id)?.stats.loyalty).toBe(50 + 3 * LOYALTY.wageBad);
    expect(getStaffMember(sim.state, rich.id)?.stats.loyalty).toBe(50 + 3 * LOYALTY.wageGenerous);
  });

  it('Lohnerhöhung freut sofort, Kürzung ärgert', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner', { wage: 100 });
    m.stats.loyalty = 50;
    sim.dispatch({ type: 'staff.setWage', payload: { staffId: m.id, wage: 120 } });
    expect(getStaffMember(sim.state, m.id)?.stats.loyalty).toBe(50 + 2 * LOYALTY.wageRaisePer10);
    sim.dispatch({ type: 'staff.setWage', payload: { staffId: m.id, wage: 60 } });
    expect(getStaffMember(sim.state, m.id)?.stats.loyalty).toBeLessThan(40);
  });

  it('Gefahr kostet Loyalität: Festnahme, Angst im Veedel, Razzia, Konfrontation', () => {
    const sim = quietGame();
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'rudolfplatz' } });
    const [a, b] = getStaff(sim.state);
    a.stats.loyalty = 60;
    b.stats.loyalty = 60;
    sim.ctx('police').emit('police.arrest', { staffId: a.id, veedelId: 'neustadt-sued' });
    sim.step();
    expect(getStaffMember(sim.state, a.id)?.stats.loyalty).toBe(60 + LOYALTY.arrest);
    expect(getStaffMember(sim.state, b.id)?.stats.loyalty).toBe(60 + LOYALTY.arrestNearby);
    sim.ctx('police').emit('police.raid', { veedelId: 'neustadt-sued', target: 'player' });
    sim.step();
    expect(getStaffMember(sim.state, b.id)?.stats.loyalty).toBe(60 + LOYALTY.arrestNearby + LOYALTY.raid);
    sim.ctx('encounters').emit('encounter.resolved', {
      encounterId: 1,
      kind: 'raidDefense',
      outcome: 'failure',
      request: { kind: 'raidDefense', staffIds: [b.id] },
      playerKilled: false,
    });
    sim.step();
    expect(getStaffMember(sim.state, b.id)?.stats.loyalty).toBe(
      60 + LOYALTY.arrestNearby + LOYALTY.raid + LOYALTY.encounter + LOYALTY.encounterLost,
    );
  });

  it('Beförderung zum Leutnant hebt Loyalität und Lohn', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner');
    addXp(sim.ctx('staff'), m.id, LEVEL_XP[1]);
    m.stats.loyalty = 50;
    const wage = m.wage;
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, veedelId: 'neustadt-sued' } }).ok).toBe(
      true,
    );
    const after = getStaffMember(sim.state, m.id) as StaffMember;
    expect(after.stats.loyalty).toBeGreaterThanOrEqual(50 + 15);
    expect(after.wage).toBeGreaterThan(wage);
  });
});

describe('Verrat', () => {
  it('gibt es nur bei niedriger Loyalität', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner');
    m.stats.loyalty = BETRAYAL_THRESHOLD;
    expect(betrayalChance(m)).toBe(0);
    m.stats.loyalty = 0;
    expect(betrayalChance(m)).toBeGreaterThan(0);
    expect(betrayalChance(m)).toBeLessThanOrEqual(0.25);
  });

  it('ist mild: etwas Ware, etwas Geld, Kündigung oder etwas Heat', () => {
    const sim = quietGame();
    const ctx = sim.ctx('staff');
    sim.state.wallet.dirty = 100000;
    sim.state.modules.goods.stock.ehrenfeld.weed = 1000;
    const thief = recruit(sim, 'runner');
    expect(betray(ctx, thief, 'goods')).toBeLessThanOrEqual(THEFT_GOODS_MAX);
    expect(getStock(sim.state)).toBe(1000 - THEFT_GOODS_MAX);
    expect(betray(ctx, thief, 'money')).toBe(THEFT_MONEY_MAX);
    expect(sim.state.wallet.dirty).toBe(100000 - THEFT_MONEY_MAX);
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const talker = getStaff(sim.state, { spotId: 'uni' })[0];
    betray(ctx, talker, 'talk');
    expect(getHeat(sim.state, 'lindenthal')).toBe(15);
    betray(ctx, talker, 'quit');
    expect(getStaffMember(sim.state, talker.id)?.status).toBe('quit');
  });

  it('passiert bei Loyalität 0 irgendwann von selbst, danach ist erst mal Ruhe', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.state.wallet.dirty = 100000;
    const members = [recruit(sim, 'runner'), recruit(sim, 'courier'), recruit(sim, 'security')];
    for (const m of members) {
      m.stats.loyalty = 0;
      m.wage = expectedWage(sim.state, m.id);
    }
    for (let d = 0; d < 10; d++) {
      for (const m of getStaff(sim.state)) m.stats.loyalty = 0;
      toMidnight(sim);
    }
    const betrayals = eventsOfType(events, 'staff.betrayed');
    expect(betrayals.length).toBeGreaterThan(0);
    // Höchstens ein Vorfall pro Person alle drei Tage.
    for (const m of members) expect(betrayals.filter((e) => e.payload.staffId === m.id).length).toBeLessThanOrEqual(4);
  });
});
