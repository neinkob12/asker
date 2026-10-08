// Regressionstests zu Befunden aus dem Bugreview (Wochenverträge und Städte).

import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeCity, cityTravel } from '../city';
import type { Order } from '../customers';
import { operationTier } from '../police';
import { lockedSpots, spotCity } from '../spots';
import { enlist, generateProfile } from '../staff';
import { getRelation, getSuppliers } from '../suppliers';
import { type ContractOffer, getContractTemplate } from './contracts';
import { activeContract, canAcceptContract, contractOffers, contractProgress } from './index';

/** Tag 1 ist ein Freitag, Tag 4 der erste Montag. */
const MONDAY_8 = clock.at(4, 8);

/** Köln komplett (Meilenstein in territory): Erst danach gibt es Verträge. */
function game(seed = 2): Simulation {
  const sim = createTestGame({ seed });
  const t = sim.state.modules.territory;
  t.milestones ??= {};
  t.milestones.koeln = { majority: sim.state.time, complete: sim.state.time };
  return sim;
}

function untilOffers(sim: Simulation): void {
  sim.advance(MONDAY_8 - sim.state.time);
}

function unlockHamburg(sim: Simulation): void {
  expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
}

/** Einen Auftrag (Lieferung oder Großhandel) in einem Veedel ablegen, wie ihn customers führt. */
function addOrder(sim: Simulation, kind: Order['kind'], veedelId: string): number {
  const id = sim.ctx('test').nextId();
  sim.state.modules.customers.orders.push({
    id,
    kind,
    status: 'done',
    contactId: 'test',
    contactName: 'Test',
    typeId: null,
    regularId: null,
    productId: 'weed',
    amount: 10,
    price: 100,
    veedelId,
    lng: 0,
    lat: 0,
    createdAt: sim.state.time,
    expiresAt: sim.state.time + 60,
    messageId: 0,
    deliveredBy: 'player',
    courierId: null,
    startedAt: null,
    arrivesAt: null,
    finishedAt: sim.state.time,
    quality: null,
    cut: null,
  });
  return id;
}

/** Ein Kölner Angebot (wie am Montag) für Zähler-Tests. */
function koelnOffer(templateId: string): ContractOffer {
  return {
    id: 1,
    templateId,
    cityId: 'koeln',
    tier: 0,
    title: 'Test',
    target: 10,
    rewards: [],
    contactId: 'contract:ali',
    deadline: Number.MAX_SAFE_INTEGER,
    messageId: 0,
  };
}

describe('Wochenangebot der verlassenen Stadt bleibt annehmbar', () => {
  it('nach der Fahrt nach Hamburg sind die Kölner Angebote weg und lassen sich nicht mehr annehmen', () => {
    const sim = game();
    untilOffers(sim);
    const offers = [...contractOffers(sim.state)];
    expect(offers).toHaveLength(3);
    unlockHamburg(sim);
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const travel = cityTravel(sim.state);
    if (!travel) throw new Error('keine Fahrt');
    sim.advance(travel.arrivesAt - sim.state.time + 5);
    expect(activeCity(sim.state)).toBe('hamburg');
    expect(contractOffers(sim.state)).toHaveLength(0);
    expect(sim.state.modules.quests.offers).toHaveLength(0);
    expect(canAcceptContract(sim.state, offers[0]).ok).toBe(false);
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offers[0].id } }).ok).toBe(false);
    expect(activeContract(sim.state)).toBeNull();
  });

  it('ein Angebot gilt nur in seiner Stadt: in der Ansicht Hamburg gesperrt, zurück in Köln annehmbar', () => {
    const sim = game();
    untilOffers(sim);
    const offer = contractOffers(sim.state)[0];
    unlockHamburg(sim);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    expect(contractOffers(sim.state)).toHaveLength(0);
    expect(contractOffers(sim.state, 'koeln')).toHaveLength(3);
    const allowed = canAcceptContract(sim.state, offer);
    expect(allowed.ok).toBe(false);
    if (!allowed.ok) expect(allowed.reason).toContain('Köln');
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } }).ok).toBe(true);
    expect(activeContract(sim.state)?.id).toBe(offer.id);
  });
});

describe('Vertragszähler zählen Ereignisse aus der anderen Stadt', () => {
  it('Lieferungen und Großhandel zählen nur in der Stadt des Angebots', () => {
    const sim = game();
    for (const [templateId, kind] of [
      ['deliveries', 'delivery'],
      ['wholesale', 'wholesale'],
    ] as const) {
      const count = getContractTemplate(templateId)?.count?.['order.finished'];
      if (!count) throw new Error(templateId);
      const offer = koelnOffer(templateId);
      const hamburg = addOrder(sim, kind, 'st-pauli');
      const koeln = addOrder(sim, kind, 'lindenthal');
      expect(count({ orderId: hamburg, kind, status: 'done' }, sim.state, offer), templateId).toBe(0);
      expect(count({ orderId: koeln, kind, status: 'done' }, sim.state, offer), templateId).toBe(1);
    }
  });

  it('Stammkunden, Einkäufe, Wäsche und neue Spots zählen nur in der Stadt des Angebots', () => {
    const sim = game();
    const hamburgSpot = lockedSpots(sim.state).find((s) => spotCity(s) === 'hamburg');
    if (!hamburgSpot) throw new Error('kein Spot in Hamburg');
    const regulars = getContractTemplate('regulars')?.count?.['customer.regularGained'];
    const stock = getContractTemplate('stock')?.count?.['shipment.ordered'];
    const launder = getContractTemplate('launder')?.count?.['laundering.completed'];
    const spots = getContractTemplate('spots')?.count;
    if (!regulars || !stock || !launder || !spots?.['spots.unlocked'] || !spots['spots.founded']) {
      throw new Error('Zähler fehlen');
    }
    const offer = koelnOffer('regulars');
    expect(regulars({ regularId: 'r1', spotId: hamburgSpot.id }, sim.state, offer)).toBe(0);
    expect(regulars({ regularId: 'r2', spotId: 'uni' }, sim.state, offer)).toBe(1);
    const shipment = { shipmentId: 1, supplierId: 'x', amount: 50, price: 100 };
    expect(stock({ ...shipment, cityId: 'hamburg' }, sim.state, offer)).toBe(0);
    expect(stock({ ...shipment, cityId: 'koeln' }, sim.state, offer)).toBe(50);
    expect(launder({ amount: 1000, fee: 100, cityId: 'hamburg' }, sim.state, offer)).toBe(0);
    expect(launder({ amount: 1000, fee: 100, cityId: 'koeln' }, sim.state, offer)).toBe(1000);
    expect(spots['spots.unlocked']({ spotId: 'x', veedelId: 'st-pauli' }, sim.state, offer)).toBe(0);
    expect(spots['spots.founded']({ spotId: 'y', veedelId: 'lindenthal' }, sim.state, offer)).toBe(1);
  });

  it('die Wäsche meldet ihre Stadt mit', () => {
    const sim = game();
    sim.state.wallet.dirty = 50_000;
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1000, channel: 'kiosk' } }).ok).toBe(true);
    sim.advance(3 * 1440);
    const done = eventsOfType(events, 'laundering.completed');
    expect(done.length).toBeGreaterThan(0);
    expect(done[0].payload.cityId).toBe('koeln');
  });

  it('Einstellungen in Hamburg zählen nicht für einen Kölner Vertrag, in Köln schon', () => {
    const sim = game();
    untilOffers(sim);
    const offer = contractOffers(sim.state)[0];
    Object.assign(offer, { templateId: 'hire', target: 2, title: 'Test' });
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } }).ok).toBe(true);
    sim.step();
    unlockHamburg(sim);
    const ctx = sim.ctx('staff');
    enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'pool', cityId: 'hamburg' });
    enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'pool', cityId: 'hamburg' });
    sim.step();
    expect(contractProgress(sim.state)).toEqual([0, 2]);
    enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'pool', cityId: 'koeln' });
    sim.step();
    expect(contractProgress(sim.state)).toEqual([1, 2]);
  });

  it('die Geldbelohnung landet in der Kasse der Stadt des Vertrags, auch wenn eine andere aktiv ist', () => {
    const sim = game();
    untilOffers(sim);
    const offer = contractOffers(sim.state)[0];
    Object.assign(offer, { templateId: 'revenue', target: 1000, title: 'Test' });
    offer.rewards.push({ kind: 'money', money: 'dirty', amount: 400 });
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } }).ok).toBe(true);
    sim.step();
    unlockHamburg(sim);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const events = recordEvents(sim);
    sim.ctx('customers').emit('sale.completed', {
      channel: 'street',
      spotId: 'uni',
      veedelId: 'lindenthal',
      productId: 'weed',
      amount: 20,
      quality: 0.6,
      revenue: 1200,
      sellerId: null,
      customerId: null,
    });
    sim.step();
    expect(activeContract(sim.state)).toBeNull();
    const booking = eventsOfType(events, 'wallet.changed').find((e) => e.payload.amount === 400);
    expect(booking?.payload.cityId).toBe('koeln');
    expect(booking?.payload.category).toBe('income.other');
  });
});

describe('Umsatz-Vertrag ohne Belohnung', () => {
  it('ohne Vertrauen bei irgendeinem Lieferanten kommt beim Kleindealer kein Angebot ohne Belohnung', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = game(seed);
      sim.advance(MONDAY_8 - sim.state.time - 1);
      expect(operationTier(sim.state, 'koeln').index).toBe(0);
      // Alle Lieferanten in Köln haben schon volles Vertrauen: Vertrauen gibt es keins mehr.
      for (const s of getSuppliers(sim.state, 'koeln')) {
        sim.state.modules.suppliers.relations[s.id] = { ...getRelation(sim.state, s.id), trust: 100 };
      }
      sim.advance(1);
      const offers = contractOffers(sim.state);
      expect(offers.length, `Seed ${seed}`).toBeGreaterThan(0);
      for (const o of offers) {
        expect(o.rewards.length, `Seed ${seed} ${o.templateId}`).toBeGreaterThan(0);
        const text = sim.state.messages.list.find((m) => m.id === o.messageId)?.text ?? '';
        expect(text, `Seed ${seed} ${o.templateId}`).not.toContain("Dafür gibt's: .");
      }
    }
  });
});
