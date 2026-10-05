// Lieferpläne und Nachkauf (Auftrag 43): Fenna nimmt an, liefert aus und kauft nach, so weit du es ihr sagst.

import { describe, expect, it } from 'vitest';
import { type GameState, loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { playableCities } from '../city';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import {
  getDeliveries,
  getOrders,
  getShipments,
  openOrders,
  orderCoverage,
  planFor,
  restockRules,
  stockWithIncoming,
} from './index';
import { DISPATCH_EVERY, NO_PLAN } from './plans';

/** Ganz Deutschland, verkauft und in Rotterdam angekommen; Kundschaft in den Städten aus. */
function soldGame(seed = 1): Simulation {
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
  return sim;
}

describe('Lieferpläne (Auftrag 43)', () => {
  it('ohne Plan macht Fenna nichts', () => {
    const sim = soldGame();
    const open = openOrders(sim.state).length;
    expect(open).toBeGreaterThan(0);
    sim.advance(2 * DISPATCH_EVERY);
    expect(openOrders(sim.state)).toHaveLength(open);
    expect(planFor(sim.state, openOrders(sim.state)[0].customerId)).toEqual(NO_PLAN);
  });

  it('für alle: nimmt gedeckte Bestellungen an und liefert sie per Spedition aus', () => {
    const sim = soldGame(2);
    sim.state.wallet.dirty = 500_000;
    const coverage = orderCoverage(sim.state);
    const covered = openOrders(sim.state).filter((o) => coverage.get(o.id) === 0);
    expect(covered.length).toBeGreaterThan(0);
    expect(
      sim.dispatch({ type: 'trade.setPlan', payload: { plan: { accept: 'covered', deliver: 'freight' } } }).ok,
    ).toBe(true);
    sim.advance(DISPATCH_EVERY + 5);
    for (const o of covered) expect(getOrders(sim.state).find((x) => x.id === o.id)?.status).not.toBe('open');
    expect(getDeliveries(sim.state).length).toBeGreaterThan(0);
    expect(getDeliveries(sim.state).every((d) => d.vehicleId === null)).toBe(true);
  });

  it('eigener Plan eines Kunden geht vor; reset nimmt ihn weg', () => {
    const sim = soldGame(3);
    const customerId = openOrders(sim.state)[0].customerId;
    sim.dispatch({ type: 'trade.setPlan', payload: { plan: { accept: 'all' } } });
    sim.dispatch({ type: 'trade.setPlan', payload: { plan: { accept: 'off' }, customerId } });
    expect(planFor(sim.state, customerId).accept).toBe('off');
    sim.advance(DISPATCH_EVERY + 5);
    expect(openOrders(sim.state).every((o) => o.customerId === customerId)).toBe(true);
    sim.dispatch({ type: 'trade.setPlan', payload: { plan: {}, customerId, reset: true } });
    expect(planFor(sim.state, customerId).accept).toBe('all');
  });
});

describe('Nachkauf (Auftrag 43)', () => {
  it('liegt weniger da als die Regel will, kommt ein Container, aber nicht jede Stunde noch einer', () => {
    const sim = soldGame(4);
    sim.state.wallet.dirty = 500_000;
    const rule = { productId: 'weed', minGrams: 200_000, producerId: 'spanien', size: 'medium' as const };
    expect(sim.dispatch({ type: 'trade.addRestock', payload: rule }).ok).toBe(true);
    expect(restockRules(sim.state)).toHaveLength(1);
    sim.advance(DISPATCH_EVERY + 5);
    const first = getShipments(sim.state).filter((x) => x.productId === 'weed').length;
    expect(first).toBeGreaterThan(0);
    // Jede Stunde einer, bis Bestand plus unterwegs reicht.
    for (let i = 0; i < 8; i++) sim.advance(DISPATCH_EVERY);
    expect(stockWithIncoming(sim.state, 'rotterdam', 'weed')).toBeGreaterThanOrEqual(200_000);
    const after = getShipments(sim.state).filter((x) => x.productId === 'weed').length;
    sim.advance(3 * DISPATCH_EVERY);
    expect(getShipments(sim.state).filter((x) => x.productId === 'weed').length).toBe(after);
    // Falsche Regeln lehnt sie ab.
    expect(
      sim.dispatch({ type: 'trade.addRestock', payload: { ...rule, producerId: 'marokko', productId: 'edibles' } }).ok,
    ).toBe(false);
  });

  it('alte Stände ohne Pläne laden (Migration 4)', () => {
    const sim = soldGame(5);
    const raw = structuredClone(sim.state) as GameState;
    const { defaultPlan: _a, plans: _b, restock: _c, ...old } = raw.modules.trade;
    (raw.modules as unknown as Record<string, unknown>).trade = old;
    raw.moduleVersions.trade = 3;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.trade.defaultPlan).toEqual(NO_PLAN);
    expect(loaded.state.modules.trade.restock).toEqual([]);
  });
});
