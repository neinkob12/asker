// Auftrag 34, Etappe 3: Stammabnehmer (Dealer mit Vertrauen).

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getStock, store } from '../goods';
import { changeReputation } from '../reputation';
import { getInfluence, PLAYER_FACTION } from '../territory';
import { DEALER_RETURN_DAYS, DEALER_START_TRUST, DEALER_TRUST, MIDDLEMAN_AMOUNT } from './config';
import { dealerRelation, dealerStage, getDealers, getOrder } from './index';
import { offerWholesale } from './orders';

function game(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  changeReputation(sim.ctx('test'), 50);
  store(sim.ctx('test'), { productId: 'weed', amount: 3000, quality: 0.6 });
  return sim;
}

const answer = (sim: Simulation, messageId: number, optionId: string) =>
  sim.dispatch({ type: 'messages.answer', payload: { messageId, optionId } });

function setTrust(sim: Simulation, dealerId: string, trust: number) {
  sim.state.modules.customers.dealers[dealerId] = { ...dealerRelation(sim.state, dealerId), trust };
}

/** Großhandels-Anfrage genau dieses Dealers, selbst ausliefern bis zum Ende. */
function deal(sim: Simulation, dealerId: string) {
  const order = offerWholesale(sim.ctx('customers'), true, dealerId);
  if (!order) throw new Error('keine Anfrage');
  expect(answer(sim, order.messageId, 'self').ok).toBe(true);
  return order;
}

describe('Stammabnehmer', () => {
  it('Dealer pro Stadt als Daten, alle fangen gleich an', () => {
    const koeln = getDealers(createTestGame().state, 'koeln');
    expect(koeln.length).toBeGreaterThanOrEqual(4);
    expect(getDealers(createTestGame().state, 'hamburg').every((d) => d.cityId === 'hamburg')).toBe(true);
    expect(dealerRelation(createTestGame().state, koeln[0].id).trust).toBe(DEALER_START_TRUST);
  });

  it('erfüllte Deals bringen Vertrauen, ab 30 regelmäßige Anfragen mit größeren Mengen', () => {
    const sim = game();
    const order = deal(sim, 'oemer');
    sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
    const status = getOrder(sim.state, order.id)?.status;
    if (status === 'done')
      expect(dealerRelation(sim.state, 'oemer').trust).toBe(DEALER_START_TRUST + DEALER_TRUST.done);
    setTrust(sim, 'oemer', 35);
    expect(dealerStage(sim.state, 'oemer')).toBe('regular');
    sim.state.modules.customers.orders = [];
    sim.state.modules.customers.dealers.oemer.lastRequestAt = sim.state.time - 4 * 1440;
    sim.advance(60);
    const next = sim.state.modules.customers.orders.find((o) => o.contactId === 'dealer:oemer');
    expect(next).toBeDefined();
    expect(next?.amount).toBeGreaterThanOrEqual(200);
  });

  it('ab Vorkasse zahlt der Dealer die Hälfte beim Annehmen, der Deal kippt nicht', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const sim = game(seed);
      setTrust(sim, 'pitter', 55);
      expect(dealerStage(sim.state, 'pitter')).toBe('prepay');
      const before = sim.state.wallet.dirty;
      const order = deal(sim, 'pitter');
      const prepaid = getOrder(sim.state, order.id)?.prepaid ?? 0;
      expect(prepaid).toBe(Math.round(order.price / 2));
      expect(sim.state.wallet.dirty).toBe(before + prepaid);
      sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
      expect(getOrder(sim.state, order.id)?.status).toBe('done');
    }
  });

  it('zweimal hängengelassen: der Dealer geht zu einer Gang und kommt später wieder', () => {
    const sim = game();
    for (let i = 0; i < 2; i++) {
      const order = offerWholesale(sim.ctx('customers'), true, 'jacky');
      if (!order) throw new Error('keine Anfrage');
      sim.advance(order.expiresAt - sim.state.time + 1);
    }
    const r = dealerRelation(sim.state, 'jacky');
    expect(r.status).toBe('gone');
    expect(r.goneTo).toBeTruthy();
    expect(offerWholesale(sim.ctx('customers'), true, 'jacky')?.contactId).not.toBe('dealer:jacky');
    sim.advance(DEALER_RETURN_DAYS * 1440 + 60);
    expect(dealerRelation(sim.state, 'jacky').status).toBe('active');
  });

  it('Exklusivität per Handy, als Zwischenhändler jede Woche Ware gegen Einfluss ohne Spot', () => {
    const sim = game();
    setTrust(sim, 'sven', 69);
    const order = deal(sim, 'sven');
    sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
    const offer = sim.state.messages.list.filter((m) => m.contactId === 'dealer:sven').at(-1);
    expect(offer?.options?.[0].command?.type).toBe('customers.dealerExclusive');
    expect(answer(sim, offer?.id ?? 0, 'accept').ok).toBe(true);
    expect(dealerStage(sim.state, 'sven')).toBe('exclusive');
    setTrust(sim, 'sven', 90);
    expect(sim.dispatch({ type: 'customers.dealerMiddleman', payload: { dealerId: 'sven', accept: true } }).ok).toBe(
      true,
    );
    const stock = getStock(sim.state, { productId: 'weed' });
    const influence = getInfluence(sim.state, 'altstadt-sued', PLAYER_FACTION);
    const money = sim.state.wallet.dirty;
    sim.advance(1440 + 60);
    expect(getStock(sim.state, { productId: 'weed' })).toBeLessThanOrEqual(stock - MIDDLEMAN_AMOUNT);
    expect(getInfluence(sim.state, 'altstadt-sued', PLAYER_FACTION)).toBeGreaterThan(influence);
    expect(sim.state.wallet.dirty).toBeGreaterThan(money);
  });

  it('Version 5 → 6: Stammabnehmer fangen bei null an', () => {
    const sim = game();
    const raw = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { customers: Record<string, unknown> };
    };
    raw.moduleVersions.customers = 5;
    delete raw.modules.customers.dealers;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.customers.dealers).toEqual({});
    expect(dealerRelation(loaded.state, 'oemer').trust).toBe(DEALER_START_TRUST);
  });
});
