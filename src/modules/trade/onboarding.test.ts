// Einführung in die Hafen-Phase (Auftrag 43): Nach dem Verkauf fallen die alten Kapitel weg, in Rotterdam führt Jansen
// Schritt für Schritt durch den neuen Job, und die erste Runde Bestellungen passt zur Ware in der Halle.

import { describe, expect, it } from 'vitest';
import { messages, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { jansenContact, playableCities, presentCity } from '../city';
import { currentQuest, QUESTS } from '../quests';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { FIRST_ORDER_ANSWER_MINUTES, START_STOCK } from './config';
import {
  customerOffer,
  getCustomer,
  getOrders,
  openOrders,
  orderCoverage,
  PRODUCERS,
  pendingDeliveries,
  placeOrders,
} from './index';

const DAY = 1440;

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

/** Alle Städte komplett, Jansen ruft an, verkauft, in Rotterdam angekommen. */
function soldAndArrived(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const city of playableCities()) {
    if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
    for (const v of allVeedel(city.id)) {
      for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
      addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    }
  }
  sim.advance(60);
  for (let i = 0; i < 48 && sim.state.modules.city.sale.status !== 'calling'; i++) sim.advance(60);
  expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(true);
  for (let i = 0; i < 72 && presentCity(sim.state) !== 'rotterdam'; i++) sim.advance(60);
  expect(presentCity(sim.state)).toBe('rotterdam');
  sim.advance(10);
}

describe('Einführung in die Hafen-Phase (Auftrag 43)', () => {
  it('nach dem Verkauf fallen die alten Kapitel weg, in Rotterdam schickt Jansen die Schritte', () => {
    const sim = quietGame();
    soldAndArrived(sim);
    const quest = currentQuest(sim.state);
    expect(quest?.id).toBe('rtAnswer');
    expect(quest?.voice).toBe('jansen');
    // Alles aus Deutschland ist erledigt oder übersprungen, nichts mehr offen.
    const q = sim.state.modules.quests;
    const finished = new Set([...q.done, ...q.skipped]);
    expect(QUESTS.filter((x) => x.voice === undefined && !finished.has(x.id))).toEqual([]);
    expect(q.contracts.active).toBeNull();
    // Jansen schreibt die Aufgabe.
    const thread = messages.thread(sim.state, jansenContact(sim.state).id).map((m) => m.text);
    expect(thread.some((t) => t.includes('Das ist die Halle'))).toBe(true);
  });

  it('die erste Runde bestellt nur, was in der Halle liegt, mit drei Tagen zum Antworten', () => {
    const sim = quietGame(2);
    soldAndArrived(sim);
    const orders = openOrders(sim.state);
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) {
      for (const item of o.items) expect(Object.keys(START_STOCK)).toContain(item.productId);
      expect(o.answerBy - o.placedAt).toBe(FIRST_ORDER_ANSWER_MINUTES);
    }
  });

  it('annehmen, ausliefern, Container, Lkw: jeder Schritt hakt sich ab', () => {
    const sim = quietGame(3);
    soldAndArrived(sim);
    sim.state.wallet.clean = 200_000;
    sim.state.wallet.dirty = 200_000;
    const coverage = orderCoverage(sim.state);
    const covered = openOrders(sim.state).find((o) => coverage.get(o.id) === 0);
    if (!covered) throw new Error('keine gedeckte Bestellung');
    expect(sim.dispatch({ type: 'trade.answer', payload: { orderId: covered.id, choice: 'accept' } }).ok).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('rtDeliver');
    const order = pendingDeliveries(sim.state)[0];
    expect(sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id } }).ok).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('rtBuy');
    const producer = PRODUCERS.find((p) => p.products.weed !== undefined && !p.byRoad);
    if (!producer) throw new Error('kein Produzent');
    expect(
      sim.dispatch({ type: 'trade.buy', payload: { producerId: producer.id, productId: 'weed', size: 'small' } }).ok,
    ).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('rtTruck');
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'truck', cityId: 'rotterdam' } }).ok).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('rtOnTime');
    // Pünktliche Lieferungen zählen, nach fünf ist Jansen raus.
    sim.advance(3 * DAY);
    expect(getOrders(sim.state).some((o) => o.status === 'delivered')).toBe(true);
  });

  it('dein Preis wirkt auf den Preis pro Gramm (nicht nur auf den Anteil), der Abnahmevertrag bleibt fest', () => {
    const sim = quietGame(4);
    soldAndArrived(sim);
    sim.state.modules.trade.priceLevel = 0.9;
    const before = new Set(getOrders(sim.state).map((o) => o.id));
    placeOrders(sim.ctx('trade'));
    const fresh = getOrders(sim.state).filter((o) => !before.has(o.id));
    const free = fresh.find((o) => !o.guaranteed);
    if (!free) throw new Error('keine freie Bestellung');
    const customer = getCustomer(sim.state, free.customerId);
    if (!customer) throw new Error('kein Kunde');
    const item = free.items[0];
    expect(item.offer).toBeCloseTo(customerOffer(sim.state, customer, item.productId) * 0.9, 1);
  });
});
