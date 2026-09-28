import { describe, expect, it } from 'vitest';
import { clock, type Simulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import type { Customer } from '../customers';
import { RUNNER_DAILY_WAGE, RUNNER_HIRE_COST } from './config';
import { bonus, findAvailable, getStaff, getStats, runnerAt } from './index';

function quietGame(): Simulation {
  const sim = createTestGame();
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function addCustomer(sim: Simulation, spotId: string, amount: number): Customer {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit: 10,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 100,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

const hire = (sim: Simulation, spotId: string) => sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });

describe('staff', () => {
  it('Läufer anheuern kostet Geld, ein Läufer pro Spot', () => {
    const sim = quietGame();
    expect(hire(sim, 'neumarkt').ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(START_DIRTY_MONEY - RUNNER_HIRE_COST);
    expect(hire(sim, 'neumarkt')).toEqual({ ok: false, reason: 'Hier arbeitet schon ein Läufer.' });
    const runner = runnerAt(sim.state, 'neumarkt');
    expect(runner).toMatchObject({ role: 'runner', status: 'active', wage: RUNNER_DAILY_WAGE });
    expect(runner?.name).toMatch(/\S+ \S+/);
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
    expect(eventsOfType(events, 'sale.completed')[0].payload.sellerId).toBe(runner?.id);
  });

  it('Löhne um Mitternacht, wer nicht bezahlt wird, kündigt', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    hire(sim, 'neumarkt');
    hire(sim, 'uni');
    sim.state.wallet.dirty = RUNNER_DAILY_WAGE;
    sim.advance(clock.at(2) - sim.state.time); // bis Mitternacht
    expect(getStaff(sim.state)).toHaveLength(1);
    expect(sim.state.wallet.dirty).toBe(0);
    expect(eventsOfType(events, 'staff.left')[0].payload.reason).toBe('quit');
  });

  it('Festnahme durch die Polizei setzt den Haft-Status, Inhaftierte arbeiten nicht', () => {
    const sim = quietGame();
    hire(sim, 'neumarkt');
    const runner = runnerAt(sim.state, 'neumarkt');
    if (!runner) throw new Error('kein Läufer');
    sim.ctx('police').emit('police.arrest', { staffId: runner.id, veedelId: 'altstadt-sued' });
    sim.step();
    expect(runnerAt(sim.state, 'neumarkt')?.status).toBe('jailed');
    addCustomer(sim, 'neumarkt', 1);
    sim.advance(5);
    expect(sim.state.modules.customers.waiting).toHaveLength(1);
  });

  it('filtert nach Veedel und liefert Werte für Konfrontationen', () => {
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
  });

  it('entlassen', () => {
    const sim = quietGame();
    hire(sim, 'uni');
    const id = getStaff(sim.state)[0].id;
    expect(sim.dispatch({ type: 'staff.fire', payload: { staffId: id } }).ok).toBe(true);
    expect(getStaff(sim.state)).toHaveLength(0);
  });
});
