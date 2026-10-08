// Regressionstests zum Bugreview (Paket trade-grow): Arbeiter-Regler bei unbezahltem Lohn, Pacht vor Löhnen beim
// sauberen Geld.

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { playableCities } from '../city';
import { activeEncounters, autoResolveEncounter } from '../encounters';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { CALL_AFTER_WEEKS, CALL_MIN_REVENUE } from './config';
import { fincaWages, fincaWorkers, getFincas, hiredWorkers, leasePerWeek, workersNeeded } from './index';

const DAY = 1440;

/** Ganz Deutschland, verkauft, in Rotterdam angekommen, beide Regionen frei, viel Geld. */
function openGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  const ctx = sim.ctx('test');
  for (const city of playableCities()) {
    if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
    for (const v of allVeedel(city.id)) {
      for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
      addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    }
  }
  sim.advance(60);
  sim.state.modules.city.sale = { status: 'calling', callAt: null, sold: null };
  const sold = sim.dispatch({ type: 'city.sell', payload: {} });
  if (!sold.ok) throw new Error(sold.reason);
  while (sim.state.modules.city.travel) sim.advance(30);
  const trade = sim.state.modules.trade;
  trade.startedAt = sim.state.time - CALL_AFTER_WEEKS * 7 * DAY;
  trade.stats.revenue = CALL_MIN_REVENUE;
  sim.advance(8 * 60);
  for (const id of ['kolumbien', 'marokko']) {
    const r = sim.dispatch({ type: 'grow.openRegion', payload: { regionId: id } });
    if (!r.ok) throw new Error(r.reason);
  }
  sim.state.wallet.clean = 5_000_000;
  sim.state.wallet.dirty = 5_000_000;
  return sim;
}

function settle(sim: Simulation, minutes: number): void {
  for (let t = 0; t < minutes; t += 60) {
    sim.advance(60);
    for (const e of activeEncounters(sim.state)) autoResolveEncounter(sim.ctx('test'), e.id);
  }
}

/** Eine gepachtete Finca mit allen Arbeitern. */
function leased(sim: Simulation) {
  expect(sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'el-tigre' } }).ok).toBe(true);
  const finca = getFincas(sim.state)[0];
  const hired = sim.dispatch({
    type: 'grow.hire',
    payload: { fincaId: finca.id, role: 'worker', count: workersNeeded(finca) },
  });
  expect(hired.ok).toBe(true);
  return finca;
}

describe('Arbeiter-Regler bei unbezahltem Lohn', () => {
  it('nach einem Tag ohne Lohn arbeitet niemand, angestellt bleiben aber alle (der Regler zeigt sie)', () => {
    const sim = openGame();
    const finca = leased(sim);
    const needed = workersNeeded(finca);
    sim.state.wallet.clean = 0;
    sim.state.wallet.dirty = 0;
    settle(sim, DAY + 60);
    const now = getFincas(sim.state)[0];
    expect(now.unpaidWages).toBe(true);
    // Für die Ernte zählt niemand, der Regler steht aber auf den Angestellten: „+“ heuert genau einen dazu.
    expect(fincaWorkers(sim.state, now)).toBe(0);
    expect(hiredWorkers(sim.state, now)).toBe(needed);
    expect(now.workerIds).toHaveLength(needed);
  });
});

describe('Löhne verdrängen die Pacht nicht vom sauberen Geld', () => {
  it('ohne Schwarzgeld zahlen Löhne sauber nur über der Tagespacht; die Pacht geht vor', () => {
    const sim = openGame();
    const events = recordEvents(sim);
    const finca = leased(sim);
    const wages = fincaWages(sim.state, finca);
    const lease = Math.round(leasePerWeek(finca) / 7);
    expect(wages).toBeGreaterThan(0);
    // Die erste Woche ist vorbei: Die Pacht ist an der nächsten Mitternacht fällig.
    getFincas(sim.state)[0].leasePaidUntil = sim.state.time;
    sim.state.wallet.dirty = 0;
    // Reicht für die Löhne oder für die Pacht, nicht für beides.
    sim.state.wallet.clean = wages + lease - 1;
    const pays = () => eventsOfType(events, 'wallet.changed').filter((e) => e.payload.amount < 0);
    let seen = pays().length;
    settle(sim, DAY);
    let day = pays().slice(seen);
    expect(day.filter((e) => e.payload.reason.startsWith('Pacht'))).toHaveLength(1);
    expect(day.filter((e) => e.payload.reason.startsWith('Löhne'))).toHaveLength(0);
    let now = getFincas(sim.state)[0];
    expect(now.unpaidLease).toBe(0);
    expect(now.unpaidWages).toBe(true);
    // Genau Löhne plus Tagespacht: beides wird bezahlt, die Löhne sauber.
    sim.state.wallet.clean = wages + lease;
    seen = pays().length;
    settle(sim, DAY);
    day = pays().slice(seen);
    const wagePays = day.filter((e) => e.payload.reason.startsWith('Löhne'));
    expect(wagePays).toHaveLength(1);
    expect(wagePays[0].payload.kind).toBe('clean');
    expect(day.filter((e) => e.payload.reason.startsWith('Pacht'))).toHaveLength(1);
    now = getFincas(sim.state)[0];
    expect(now.unpaidLease).toBe(0);
    expect(now.unpaidWages).toBe(false);
  });
});
