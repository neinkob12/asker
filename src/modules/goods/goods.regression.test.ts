// Regressionstests zu Befunden aus dem Bugreview (Buchung des Lagerkaufs, Ware der verkauften Städte).

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeCity, playableCities } from '../city';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { totalStock } from '../trade';
import { allVeedel } from '../veedel';
import goods, { getStock, store, warehouseSites } from './index';

/** Ganz Deutschland komplett, Jansens Angebot steht (noch nicht verkauft); Kundschaft in den Städten aus. */
function readyToSell(seed = 1): Simulation {
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
  return sim;
}

describe('Lagerkauf bucht in die Stadt des Standorts', () => {
  it('Kauf eines Hamburger Lagers, während Köln aktiv ist, landet in der Kasse von Hamburg', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
    expect(activeCity(sim.state)).toBe('koeln');
    const site = warehouseSites('hamburg').find((w) => w.cost > 0);
    if (!site) throw new Error('kein Lager zu kaufen in Hamburg');
    sim.state.wallet.clean = site.cost + 1000;
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: site.id } }).ok).toBe(true);
    const paid = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.reason === `Kauf ${site.name}`);
    expect(paid).toHaveLength(1);
    expect(paid[0].payload.category).toBe('expansion');
    expect(paid[0].payload.cityId).toBe('hamburg');
  });
});

describe('Verkauf des Geschäfts: die Ware in den deutschen Lagern', () => {
  it('geht an die Statthalter (mit Journal-Eintrag), die Ware im Hafen von Rotterdam bleibt', () => {
    const sim = readyToSell(2);
    const hamburg = warehouseSites('hamburg')[0];
    store(sim.ctx('test'), { warehouseId: hamburg.id, productId: 'hash', amount: 3000, quality: 0.6 });
    expect(getStock(sim.state, { cityId: 'koeln' })).toBeGreaterThan(0);
    expect(getStock(sim.state, { cityId: 'hamburg' })).toBe(3000);
    expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(true);
    for (const city of playableCities()) expect(getStock(sim.state, { cityId: city.id })).toBe(0);
    expect(sim.state.journal.some((j) => j.source === 'goods' && j.text.includes('Statthalter'))).toBe(true);
    // Jansens Halle in Rotterdam (trade) ist voll wie immer nach dem Verkauf.
    expect(totalStock(sim.state)).toBeGreaterThan(0);
  });

  it('Pleite-Regel: Ware, die danach noch in einem alten Lager landet, zählt nicht mehr', () => {
    const sim = readyToSell(3);
    expect(goods.solvency?.(sim.state)).toBe(true);
    expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(true);
    // Eine Lieferung, die nach dem Verkauf noch in Köln ankommt, gehört den Statthaltern.
    store(sim.ctx('test'), { productId: 'weed', amount: 500 });
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(500);
    expect(goods.solvency?.(sim.state)).toBe(false);
  });
});
