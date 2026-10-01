import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import {
  enlist,
  generateProfile,
  getStaffMember,
  payrollDue,
  runnerAt,
  type StaffMember,
  type StaffRole,
} from '../staff';
import { getSuppliers, shipmentsInTransit } from '../suppliers';
import { PAYROLL_RESERVE_DAYS, PAYROLL_RESERVE_DAYS_ORDERS, RIGHT_HAND_DEMAND } from './config';
import { canBeRightHand, getPost, getRightHand, payrollReserve, rightHandOffered } from './index';
import { leadSpendingLimit } from './righthand';

function quietGame(): Simulation {
  const sim = createTestGame();
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 1, loyalty = 60): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = loyalty;
  return member;
}

/** Zwei Leutnants (Uni und Neumarkt) und eine Kandidatin für die Rechte Hand. */
function setup(sim: Simulation) {
  sim.state.wallet.dirty = 20000;
  const a = recruit(sim, 'runner', 2);
  const b = recruit(sim, 'runner', 2);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = recruit(sim, 'runner', 4, 70);
  return { a, b, boss };
}

describe('Rechte Hand', () => {
  it('Voraussetzungen, Ernennen mit hohem Anspruch, steht an keinem Spot', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const weak = recruit(sim, 'runner', 4, 70);
    expect(canBeRightHand(sim.state, weak.id).ok).toBe(false); // noch keine zwei Leutnants
    expect(rightHandOffered(sim.state)).toBe(false);
    const { boss } = setup(sim);
    expect(rightHandOffered(sim.state)).toBe(true);
    const rookie = recruit(sim, 'runner', 3, 70);
    const disloyal = recruit(sim, 'runner', 5, 30);
    expect(canBeRightHand(sim.state, rookie.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/Level 4/) });
    expect(canBeRightHand(sim.state, disloyal.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/treu/) });
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
    expect(getRightHand(sim.state)?.staffId).toBe(boss.id);
    const member = getStaffMember(sim.state, boss.id) as StaffMember;
    expect(member.assignment).toEqual({ kind: 'office', targetId: 'rightHand' });
    expect(member.demand).toBe(RIGHT_HAND_DEMAND);
    expect(eventsOfType(events, 'hierarchy.rightHandAppointed')).toHaveLength(1);
    // Versetzen an einen Spot geht nicht, Leutnant werden auch nicht.
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: boss.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(false);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }).ok).toBe(
      false,
    );
    expect(sim.dispatch({ type: 'hierarchy.dismissRightHand', payload: {} }).ok).toBe(true);
    expect(getStaffMember(sim.state, boss.id)).toMatchObject({ assignment: null, demand: 1 });
  });

  it('Tagesbericht um 8 Uhr: Zahlen von gestern, Knöpfe zur Kasse, still ohne Probleme', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const { boss } = setup(sim);
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    sim.advance(clock.at(2, 8, 10) - sim.state.time);
    const reports = eventsOfType(events, 'hierarchy.dailyReport');
    expect(reports).toHaveLength(1);
    expect(reports[0].payload.day).toBe(1);
    const message = sim.state.messages.list.find(
      (m) => m.contactId === `staff:${boss.id}` && m.text.includes('Tagesbericht'),
    );
    expect(message?.options?.map((o) => o.id)).toContain('openFinance');
    expect(getRightHand(sim.state)?.lastReport?.day).toBe(1);
    // Am selben Tag kein zweiter Bericht.
    sim.advance(120);
    expect(eventsOfType(events, 'hierarchy.dailyReport')).toHaveLength(1);
    // Abschaltbar.
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { dailyReport: false } } });
    sim.advance(1440);
    expect(eventsOfType(events, 'hierarchy.dailyReport')).toHaveLength(1);
  });

  it('Lohnsicherung: Leutnants greifen die Löhne für zwei Tage (Ware: eine Nacht) nicht an, sonst Banner', () => {
    const sim = quietGame();
    const { a, b, boss } = setup(sim);
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    for (const id of [a.id, b.id]) {
      sim.dispatch({ type: 'hierarchy.configure', payload: { staffId: id, settings: { mayHire: false, reserve: 0 } } });
    }
    const reserve = payrollReserve(sim.state);
    expect(reserve).toBe(payrollDue(sim.state) * PAYROLL_RESERVE_DAYS);
    // Für Ware hält sie nur die Löhne einer Nacht zurück, damit die Spots bei knapper Kasse nicht leer laufen.
    const goodsReserve = payrollReserve(sim.state, 'goods');
    expect(goodsReserve).toBe(payrollDue(sim.state) * PAYROLL_RESERVE_DAYS_ORDERS);
    expect(goodsReserve).toBeLessThan(reserve);
    sim.state.wallet.dirty = reserve + 50;
    expect(leadSpendingLimit(sim.state)).toBe(50);
    expect(leadSpendingLimit(sim.state, 'goods')).toBe(reserve + 50 - goodsReserve);
    // Genau so viel Geld wie die Rücklage für Ware plus etwas: Für ein Paket reicht es nicht mehr.
    sim.state.wallet.dirty = goodsReserve + 50;
    expect(leadSpendingLimit(sim.state, 'goods')).toBe(50);
    sim.advance(10);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    // Reicht es nicht einmal für die Löhne heute Nacht: Warnung mit Banner (nicht still).
    sim.state.wallet.dirty = 10;
    const rh = getRightHand(sim.state);
    if (rh) rh.nextActionAt = sim.state.time;
    sim.advance(10);
    const warning = sim.state.messages.list.find(
      (m) => m.contactId === `staff:${boss.id}` && m.text.includes('nicht gedeckt'),
    );
    expect(warning).toBeDefined();
    expect(warning?.silent).toBeFalsy();
  });

  it('gemeinsames Tagesbudget für Anheuern und Bestellen', () => {
    const sim = quietGame();
    const { a, b, boss } = setup(sim);
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { budgetPerDay: 400 } } });
    const before = sim.state.wallet.dirty;
    for (const id of [a.id, b.id]) {
      sim.dispatch({
        type: 'hierarchy.configure',
        payload: { staffId: id, settings: { mayHire: true, hireBudgetPerDay: 5000, orderRules: [] } },
      });
    }
    sim.advance(30);
    // Ein Läufer kostet mindestens 400 €: höchstens einer wurde angeheuert.
    expect(before - sim.state.wallet.dirty).toBeLessThanOrEqual(400 + 1);
    expect(getRightHand(sim.state)?.spent ?? 0).toBeLessThanOrEqual(400);
  });

  it('koordiniert: freie Läufer an leere Spots ohne Leutnant, kümmert sich um Ausfälle', () => {
    const sim = quietGame();
    const { boss } = setup(sim);
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    // Die Leutnants besetzen zuerst ihre eigenen Spots.
    recruit(sim, 'runner');
    recruit(sim, 'runner');
    sim.advance(10);
    const free = recruit(sim, 'runner');
    sim.advance(70);
    // Zülpicher Platz hat keinen Leutnant und den meisten Andrang.
    expect(runnerAt(sim.state, 'zuelpicher')?.id).toBe(free.id);
    // Festnahme dort: Der Spieler wird nicht gefragt, die Rechte Hand ersetzt.
    const spare = recruit(sim, 'runner');
    sim.ctx('police').emit('police.arrest', { staffId: free.id, veedelId: 'neustadt-sued' });
    sim.step();
    expect(sim.state.messages.list.some((m) => m.options?.some((o) => o.id === 'replace'))).toBe(false);
    sim.advance(70);
    expect(runnerAt(sim.state, 'zuelpicher')?.id).toBe(spare.id);
    expect(getRightHand(sim.state)?.log.some((l) => l.text.includes(free.name))).toBe(true);
  });

  it('in Haft laufen die Leutnants allein weiter, wer geht, ist keine Rechte Hand mehr', () => {
    const sim = quietGame();
    const { a, boss } = setup(sim);
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    sim.ctx('police').emit('police.arrest', { staffId: boss.id, veedelId: 'lindenthal' });
    sim.step();
    expect(payrollReserve(sim.state)).toBe(0);
    expect(sim.state.journal.some((j) => j.text.includes('Rechte Hand sitzt'))).toBe(true);
    expect(getPost(sim.state, a.id)).toBeDefined();
    sim.dispatch({ type: 'staff.fire', payload: { staffId: boss.id } });
    expect(getRightHand(sim.state)).toBeNull();
  });
});
