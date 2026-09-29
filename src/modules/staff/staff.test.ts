import { describe, expect, it } from 'vitest';
import { clock, type Simulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import type { Customer } from '../customers';
import { LOYALTY, RUNNER_DAILY_WAGE, RUNNER_HIRE_COST } from './config';
import {
  assign,
  bonus,
  enlist,
  findAvailable,
  generateProfile,
  getStaff,
  getStaffMember,
  getStats,
  runnerAt,
  type StaffMember,
  type StaffRole,
  securityAt,
  serveTime,
} from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function addCustomer(sim: Simulation, spotId: string, amount: number, pricePerUnit = 10): Customer {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 100,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

/** Jemanden eines Typs direkt einstellen (ohne Pool). */
function recruit(sim: Simulation, role: StaffRole, patch: Partial<StaffMember> = {}): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role), { origin: 'pool' });
  Object.assign(member, patch);
  return member;
}

const hire = (sim: Simulation, spotId: string) => sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });

describe('staff', () => {
  it('Läufer anheuern kostet Geld, ein Läufer pro Spot', () => {
    const sim = quietGame();
    expect(hire(sim, 'neumarkt').ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(START_DIRTY_MONEY - RUNNER_HIRE_COST);
    expect(hire(sim, 'neumarkt')).toEqual({ ok: false, reason: 'Hier arbeitet schon ein Läufer.' });
    const runner = runnerAt(sim.state, 'neumarkt');
    expect(runner).toMatchObject({ role: 'runner', status: 'active', wage: RUNNER_DAILY_WAGE, level: 1 });
    expect(runner?.name).toMatch(/\S+ \S+/);
  });

  it('Mitarbeiter sind Individuen mit Alter, Hintergrund, Laufbahn und eigenen Werten', () => {
    const sim = quietGame();
    hire(sim, 'neumarkt');
    hire(sim, 'uni');
    const [a, b] = getStaff(sim.state);
    expect(a.age).toBeGreaterThanOrEqual(17);
    expect(a.background.length).toBeGreaterThan(10);
    expect(a.portrait).toBeNull();
    expect(a.career[0].text).toMatch(/Eingestellt/);
    expect(a.stats).not.toEqual(b.stats);
    // Von der Straße weiß man fast nichts.
    expect(a.knownStats).toEqual(['speed']);
  });

  it('Werte hängen vom Typ ab: Sicherheit ist stärker, Läufer schneller', () => {
    const sim = quietGame();
    const avg = (role: StaffRole, key: 'speed' | 'strength') => {
      let sum = 0;
      for (let i = 0; i < 30; i++) sum += generateProfile(sim.ctx('staff'), role).stats[key];
      return sum / 30;
    };
    expect(avg('security', 'strength')).toBeGreaterThan(avg('runner', 'strength') + 10);
    expect(avg('courier', 'speed')).toBeGreaterThan(avg('security', 'speed') + 5);
  });

  it('Läufer bedienen Kunden an ihrem Spot automatisch, über denselben Befehl wie der Spieler', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    hire(sim, 'neumarkt');
    const runner = runnerAt(sim.state, 'neumarkt');
    addCustomer(sim, 'neumarkt', 2);
    addCustomer(sim, 'uni', 2);
    sim.step();
    expect(sim.state.modules.customers.waiting.map((c) => c.spotId)).toEqual(['uni']);
    const sale = eventsOfType(events, 'sale.completed')[0].payload;
    expect(sale.sellerId).toBe(runner?.id);
    expect(getStaffMember(sim.state, runner?.id ?? '')?.record).toMatchObject({ sales: 1, revenue: sale.revenue });
  });

  it('Tempo bestimmt, wie schnell ein Läufer bedient', () => {
    const sim = quietGame();
    const slow = recruit(sim, 'runner');
    const fast = recruit(sim, 'runner');
    slow.stats.speed = 10;
    fast.stats.speed = 95;
    expect(serveTime(fast)).toBeLessThan(serveTime(slow));
    fast.level = 5;
    expect(serveTime(fast)).toBeLessThan(15);
  });

  it('an gesperrten Spots wird niemand eingesetzt', () => {
    const sim = quietGame();
    expect(hire(sim, 'rudolfplatz')).toEqual({ ok: false, reason: 'Der Spot ist noch nicht freigeschaltet.' });
    const runner = recruit(sim, 'runner');
    const toLocked = { kind: 'spot' as const, targetId: 'rudolfplatz' };
    expect(sim.dispatch({ type: 'staff.assign', payload: { staffId: runner.id, assignment: toLocked } }).ok).toBe(
      false,
    );
  });

  it('Löhne um Mitternacht pro Person: wer leer ausgeht, ist sauer und kündigt am zweiten Tag', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    hire(sim, 'neumarkt');
    hire(sim, 'uni');
    const [a, b] = getStaff(sim.state);
    a.stats.loyalty = 80;
    b.stats.loyalty = 70;
    sim.state.wallet.dirty = RUNNER_DAILY_WAGE;
    sim.advance(clock.at(2) - sim.state.time); // bis Mitternacht
    // Die Loyalere bekommt ihr Geld, der andere wartet, schreibt und ist sauer.
    expect(sim.state.wallet.dirty).toBe(0);
    expect(getStaff(sim.state)).toHaveLength(2);
    expect(getStaffMember(sim.state, b.id)?.stats.loyalty).toBeLessThanOrEqual(70 + LOYALTY.unpaid + 2);
    expect(getStaffMember(sim.state, b.id)?.unpaidDays).toBe(1);
    expect(sim.state.messages.list.some((m) => m.contactId === `staff:${b.id}` && m.text.includes('Geld'))).toBe(true);
    // Zweiter Tag ohne Geld: Er geht, sie wartet (für sie ist es der erste Tag).
    sim.advance(clock.at(3) - sim.state.time);
    expect(getStaff(sim.state).map((m) => m.id)).toEqual([a.id]);
    expect(eventsOfType(events, 'staff.left').map((e) => e.payload)).toEqual([{ staffId: b.id, reason: 'quit' }]);
  });

  it('wer ohne Lohn kaum noch loyal ist, kündigt sofort', () => {
    const sim = quietGame();
    hire(sim, 'neumarkt');
    const [a] = getStaff(sim.state);
    a.stats.loyalty = 40;
    sim.state.wallet.dirty = 0;
    sim.advance(clock.at(2) - sim.state.time);
    expect(getStaff(sim.state)).toHaveLength(0);
    expect(getStaff(sim.state, { status: 'quit' })).toHaveLength(1);
  });

  it('filtert nach Veedel (Spot, Lager) und liefert Werte für Konfrontationen', () => {
    const sim = quietGame();
    hire(sim, 'zuelpicher');
    hire(sim, 'ebertplatz');
    expect(getStaff(sim.state, { veedelId: 'neustadt-sued' }).map((m) => m.assignment?.targetId)).toEqual([
      'zuelpicher',
    ]);
    const id = getStaff(sim.state)[0].id;
    expect(getStats(sim.state, id)).toMatchObject({ strength: expect.any(Number), loyalty: expect.any(Number) });
    expect(findAvailable(sim.state, { role: 'courier' })).toBeUndefined();
    expect(bonus(sim.state, 'bailDiscount')).toBe(0);
    const guard = recruit(sim, 'security');
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: guard.id, assignment: { kind: 'warehouse', targetId: 'ehrenfeld' } },
      }).ok,
    ).toBe(true);
    expect(securityAt(sim.state, { warehouseId: 'ehrenfeld' }).map((m) => m.id)).toEqual([guard.id]);
    expect(getStaff(sim.state, { veedelId: 'ehrenfeld' }).map((m) => m.id)).toEqual([guard.id]);
  });

  it('Kuriere findet der Lieferdienst über findAvailable und bindet sie mit assign', () => {
    const sim = quietGame();
    const courier = recruit(sim, 'courier');
    expect(findAvailable(sim.state, { role: 'courier' })?.id).toBe(courier.id);
    // So nutzt Auftrag 12 die Schnittstelle.
    expect(assign(sim.ctx('customers'), courier.id, { kind: 'delivery', targetId: 'o1' })).toBe(true);
    expect(findAvailable(sim.state, { role: 'courier' })).toBeUndefined();
    assign(sim.ctx('customers'), courier.id, null);
    expect(findAvailable(sim.state, { role: 'courier' })?.id).toBe(courier.id);
    const toSpot = { kind: 'spot' as const, targetId: 'uni' };
    expect(sim.dispatch({ type: 'staff.assign', payload: { staffId: courier.id, assignment: toSpot } }).ok).toBe(false);
  });

  it('versetzen prüft Typ und Ort', () => {
    const sim = quietGame();
    hire(sim, 'neumarkt');
    const other = recruit(sim, 'runner');
    const lawyer = recruit(sim, 'lawyer');
    const guard = recruit(sim, 'security');
    const move = (staffId: string, kind: 'spot' | 'warehouse', targetId: string) =>
      sim.dispatch({ type: 'staff.assign', payload: { staffId, assignment: { kind, targetId } } });
    expect(move(other.id, 'spot', 'neumarkt').ok).toBe(false);
    expect(move(other.id, 'spot', 'uni').ok).toBe(true);
    expect(move(lawyer.id, 'spot', 'rheinpark').ok).toBe(false);
    expect(move(other.id, 'warehouse', 'ehrenfeld').ok).toBe(false);
    expect(move(guard.id, 'spot', 'uni').ok).toBe(true);
    expect(runnerAt(sim.state, 'uni')?.id).toBe(other.id);
    expect(sim.dispatch({ type: 'staff.assign', payload: { staffId: other.id, assignment: null } }).ok).toBe(true);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
  });

  it('entlassen: die Akte bleibt bei den Ehemaligen', () => {
    const sim = quietGame();
    hire(sim, 'uni');
    const id = getStaff(sim.state)[0].id;
    expect(sim.dispatch({ type: 'staff.fire', payload: { staffId: id } }).ok).toBe(true);
    expect(getStaff(sim.state)).toHaveLength(0);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
    expect(getStaffMember(sim.state, id)).toMatchObject({ status: 'quit', leftReason: 'fired' });
    expect(sim.dispatch({ type: 'staff.fire', payload: { staffId: id } }).ok).toBe(false);
  });

  it('Lohn ändern: Grenzen je nach Anspruch', () => {
    const sim = quietGame();
    hire(sim, 'uni');
    const id = getStaff(sim.state)[0].id;
    expect(sim.dispatch({ type: 'staff.setWage', payload: { staffId: id, wage: 10 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'staff.setWage', payload: { staffId: id, wage: 5000 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'staff.setWage', payload: { staffId: id, wage: 100 } }).ok).toBe(true);
    expect(getStaffMember(sim.state, id)?.wage).toBe(100);
  });
});
