// Erster Abend einer Stadt (Auftrag 52): bei der ersten Ankunft ein kleiner, eigener Einstieg aus CITIES.opening.

import { describe, expect, it } from 'vitest';
import { messages, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getOrders } from '../customers';
import { getStock, storeFitting, warehouseSites } from '../goods';
import { getCargo } from '../logistics';
import { getSpots, spotDemandFactor } from '../spots';
import { activeCity, CITIES, cityContact } from './index';

/** Schickt dich ohne Fahrtzeit in eine Stadt (wie nach der Übergabe) und lässt dich ankommen. */
function arriveIn(sim: Simulation, cityId: string): void {
  sim.dispatch({ type: 'city.unlock', payload: { cityId } }, { actor: 'system' });
  const c = sim.state.modules.city;
  c.travel = { from: c.present, to: cityId, departedAt: sim.state.time, arrivesAt: sim.state.time + 1 };
  sim.advance(5);
  expect(activeCity(sim.state)).toBe(cityId);
}

function lastText(sim: Simulation, cityId: string): string[] {
  return messages.thread(sim.state, cityContact(cityId).id).map((m) => m.text);
}

describe('Erster Abend (Auftrag 52)', () => {
  it('jede Stadt nach Köln hat einen eigenen ersten Abend', () => {
    const later = CITIES.filter((c) => c.id !== 'koeln' && !c.template && !c.abroad);
    for (const city of later) expect(city.opening, city.id).toBeDefined();
  });

  it('Hamburg: Ware wartet am Kai', () => {
    const sim = createTestGame();
    arriveIn(sim, 'hamburg');
    const cargo = getCargo(sim.state).filter((c) => c.cityId === 'hamburg');
    expect(cargo.map((c) => c.amount)).toEqual([300]);
    expect(lastText(sim, 'hamburg').some((t) => t.includes('300 Gramm'))).toBe(true);
  });

  it('Berlin: der Club ist geschenkt und hat am ersten Wochenende doppelte Kundschaft', () => {
    const sim = createTestGame();
    const money = sim.state.wallet.dirty;
    arriveIn(sim, 'berlin');
    const club = getSpots(sim.state, 'berlin').find((s) => s.id === 'club-koepenicker');
    expect(club).toBeDefined();
    expect(sim.state.wallet.dirty).toBe(money);
    const boost = sim.state.modules.spots.boosts['club-koepenicker'];
    expect(boost.factor).toBe(2);
    if (!club) return;
    expect(spotDemandFactor(sim.state, club, boost.until - 60)).toBe(
      2 * spotDemandFactor(sim.state, club, boost.until),
    );
  });

  it('Frankfurt: die Probe kommt ins erste Lager, sobald es eines gibt', () => {
    const sim = createTestGame();
    sim.state.wallet.clean = 900000;
    arriveIn(sim, 'frankfurt');
    sim.advance(120);
    expect(getStock(sim.state, { cityId: 'frankfurt' })).toBe(0);
    expect(sim.state.modules.city.openings).toContain('frankfurt:delivery');
    const site = warehouseSites('frankfurt')[0];
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: site.id } }).ok).toBe(true);
    sim.advance(60);
    expect(getStock(sim.state, { cityId: 'frankfurt', productId: 'kush' })).toBe(150);
    expect(sim.state.modules.city.openings).toEqual([]);
  });

  it('München: eine Bestellung zum doppelten Preis wartet auf Ware im Lager', () => {
    const sim = createTestGame();
    arriveIn(sim, 'muenchen');
    expect(sim.state.modules.city.openings).toEqual(['muenchen:order']);
    const bogenhausen = () => getOrders(sim.state).filter((o) => o.veedelId === 'bogenhausen');
    expect(bogenhausen()).toEqual([]);
    sim.state.wallet.clean = 900000;
    const site = warehouseSites('muenchen')[0];
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: site.id } }).ok).toBe(true);
    const ctx = sim.ctx('test');
    storeFitting(ctx, { warehouseId: site.id, productId: 'weed', amount: 100, quality: 0.6 });
    sim.advance(60);
    expect(bogenhausen().map((o) => o.amount)).toEqual([40]);
    expect(sim.state.modules.city.openings).toEqual([]);
  });

  it('nur bei der ersten Ankunft', () => {
    const sim = createTestGame();
    arriveIn(sim, 'hamburg');
    arriveIn(sim, 'koeln');
    arriveIn(sim, 'hamburg');
    expect(getCargo(sim.state).filter((c) => c.cityId === 'hamburg').length).toBeLessThanOrEqual(1);
  });
});
