// Geskriptete Momente des Tutorials (Auftrag 46c): Bedingung, genau einmal, Beträge, nicht ohne Tutorial.

import { describe, expect, it } from 'vitest';
import { clock, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getOrders } from '../customers';
import { DEFAULT_WAREHOUSE, getStock, store } from '../goods';
import { getSpot } from '../spots';
import { scriptedDone } from './index';
import { MISSIONS } from './missions';

function start(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  const result = sim.dispatch({ type: 'tutorial.start', payload: {} });
  if (!result.ok) throw new Error(result.reason);
  return sim;
}

/** Wie der Dev-Haken: auf Stufe n springen, Missionen davor gelten als erledigt. */
function jump(sim: Simulation, stage: number): void {
  const t = sim.state.modules.tutorial;
  t.stage = stage;
  t.mission = null;
  t.done = MISSIONS.filter((m) => m.stage < stage).map((m) => m.id);
  sim.advance(1);
}

function fill(sim: Simulation, productId: string, amount: number): void {
  store(sim.ctx('goods'), { warehouseId: DEFAULT_WAREHOUSE, productId, amount, quality: 0.6, unitCost: 4 });
}

describe('tutorial: Handy-Bestellung (phoneOrder)', () => {
  it('kommt beim ersten Mal 3.000 € ab Stufe 6, genau einmal, aus dem Veedel des Neumarkts mit Ware auf Lager', () => {
    const sim = start();
    jump(sim, 5);
    fill(sim, 'hash', 200);
    sim.state.wallet.dirty = 3500;
    sim.advance(2);
    expect(scriptedDone(sim.state, 'phoneOrder')).toBe(false);
    expect(getOrders(sim.state)).toEqual([]);
    const events = recordEvents(sim);
    jump(sim, 6);
    sim.advance(2);
    expect(scriptedDone(sim.state, 'phoneOrder')).toBe(true);
    const orders = getOrders(sim.state, { kind: 'delivery' });
    expect(orders).toHaveLength(1);
    expect(orders[0].veedelId).toBe(getSpot(sim.state, 'neumarkt')?.veedelId);
    // Das Produkt mit dem meisten Bestand, eine kleine Menge.
    expect(orders[0].productId).toBe('hash');
    expect(orders[0].amount).toBeLessThanOrEqual(10);
    const moment = eventsOfType(events, 'tutorial.scriptedMoment');
    expect(moment.map((e) => e.payload.key)).toEqual(['phoneOrder']);
    expect(moment[0].payload.ref).toBe(orders[0].contactId);
    expect(messages.thread(sim.state, orders[0].contactId).at(-1)?.options?.length).toBeGreaterThan(0);
    // Nie ein zweites Mal.
    sim.state.wallet.dirty = 9000;
    sim.advance(10);
    expect(getOrders(sim.state, { kind: 'delivery' })).toHaveLength(1);
  });

  it('wartet ohne Geld oder Ware', () => {
    const sim = start();
    jump(sim, 6);
    sim.state.wallet.dirty = 2999;
    fill(sim, 'hash', 50);
    sim.advance(5);
    expect(scriptedDone(sim.state, 'phoneOrder')).toBe(false);
    sim.state.wallet.dirty = 3000;
    sim.advance(2);
    expect(scriptedDone(sim.state, 'phoneOrder')).toBe(true);
  });
});

describe('tutorial: Lager fast leer (lowStockPopup)', () => {
  function lowStock(sim: Simulation): void {
    // Verbrauch heute: 300 g, Bestand darunter.
    sim.state.modules.goods.usage.today['c:koeln:weed'] = 300;
    sim.state.modules.goods.stock[DEFAULT_WAREHOUSE] = [];
    fill(sim, 'weed', 20);
  }

  it('kommt ab Stufe 5, höchstens eins pro Spieltag und dreimal, nur an den ersten fünf Tagen', () => {
    const sim = start();
    jump(sim, 4);
    lowStock(sim);
    sim.advance(5);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(0);
    const events = recordEvents(sim);
    jump(sim, 5);
    sim.advance(1);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(1);
    expect(sim.state.modules.tutorial.scripted.lowStockDay).toBe(clock.day(sim.state.time));
    expect(eventsOfType(events, 'tutorial.scriptedMoment').map((e) => e.payload.key)).toEqual(['lowStockPopup']);
    // Am selben Tag kein zweites.
    sim.advance(60);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(1);
    // Nächster Tag: das zweite, dann das dritte, dann Schluss.
    sim.advance(24 * 60);
    lowStock(sim);
    sim.advance(1);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(2);
    sim.advance(24 * 60);
    lowStock(sim);
    sim.advance(1);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(3);
    sim.advance(24 * 60);
    lowStock(sim);
    sim.advance(1);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(3);
  });

  it('kommt nicht nach dem fünften Tag und nicht mit genug Ware', () => {
    const sim = start();
    jump(sim, 5);
    sim.state.modules.goods.usage.today['c:koeln:weed'] = 10;
    sim.advance(2);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(0);
    sim.advance(6 * 24 * 60);
    lowStock(sim);
    sim.advance(2);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(0);
  });
});

describe('tutorial: erster Gang-Angriff (firstAttack)', () => {
  it('kommt beim ersten Mal 6.000 € ab Stufe 7: 30 % jeder Ware und 40 % des Schwarzgelds weg, genau einmal', () => {
    const sim = start();
    jump(sim, 6);
    sim.state.modules.goods.stock[DEFAULT_WAREHOUSE] = [];
    fill(sim, 'weed', 100);
    fill(sim, 'hash', 50);
    sim.state.wallet.dirty = 6000;
    sim.state.modules.tutorial.scripted.phoneOrder = true;
    sim.advance(2);
    expect(scriptedDone(sim.state, 'firstAttack')).toBe(false);
    expect(wallet.balance(sim.state, 'dirty')).toBe(6000);
    const events = recordEvents(sim);
    jump(sim, 7);
    sim.advance(2);
    expect(scriptedDone(sim.state, 'firstAttack')).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBe(3600);
    expect(getStock(sim.state, { productId: 'weed' })).toBe(70);
    expect(getStock(sim.state, { productId: 'hash' })).toBe(35);
    const raided = eventsOfType(events, 'gang.raided');
    expect(raided).toHaveLength(1);
    expect(raided[0].payload).toMatchObject({ spotId: 'neumarkt', goodsLost: 45, cashLost: 2400 });
    expect(messages.thread(sim.state, `gang:${raided[0].payload.gangId}`).length).toBeGreaterThan(0);
    const moment = eventsOfType(events, 'tutorial.scriptedMoment');
    expect(moment.map((e) => [e.payload.key, e.payload.ref])).toEqual([['firstAttack', raided[0].payload.gangId]]);
    const lost = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.category === 'loss.gang');
    expect(lost.map((e) => e.payload.amount)).toEqual([-2400]);
    // Nie ein zweites Mal.
    sim.state.wallet.dirty = 20000;
    sim.advance(10);
    expect(wallet.balance(sim.state, 'dirty')).toBe(20000);
  });

  it('kommt nicht ohne Tutorial', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 6000;
    sim.advance(5);
    expect(wallet.balance(sim.state, 'dirty')).toBe(6000);
    expect(scriptedDone(sim.state, 'firstAttack')).toBe(false);
  });
});

describe('tutorial: Beschlagnahme (seizure)', () => {
  /** Liegeplatz, Rotterdam frei, eine Bestellung, die gleich ankommt (ohne zufälliges Problem). */
  function orderRotterdam(sim: Simulation): number {
    sim.state.wallet.clean += 10000;
    sim.state.wallet.dirty += 50000;
    if (!sim.state.modules.logistics.berths?.koeln) {
      const berth = sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
      if (!berth.ok) throw new Error(berth.reason);
    }
    sim.dispatch({ type: 'suppliers.unlock', payload: { supplierId: 'rotterdam' } });
    const result = sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'medium' } });
    if (!result.ok) throw new Error(result.reason);
    const id = (result.data as { shipmentId: number }).shipmentId;
    const s = sim.state.modules.suppliers.shipments.find((x) => x.id === id);
    if (!s) throw new Error('Keine Lieferung');
    s.problem = undefined;
    s.problemAt = undefined;
    s.luck = undefined;
    s.arrivesAt = sim.state.time + 2;
    return id;
  }

  it('die zweite Lieferung von Jansen wird ab Stufe 9 komplett beschlagnahmt, genau einmal', () => {
    const sim = start();
    jump(sim, 9);
    sim.state.modules.tutorial.scripted.firstAttack = true;
    sim.state.modules.tutorial.scripted.phoneOrder = true;
    const events = recordEvents(sim);
    orderRotterdam(sim);
    sim.advance(3);
    expect(sim.state.modules.logistics.cargo).toHaveLength(1);
    expect(scriptedDone(sim.state, 'seizure')).toBe(false);
    const second = orderRotterdam(sim);
    sim.advance(3);
    expect(sim.state.modules.logistics.cargo).toHaveLength(1);
    expect(scriptedDone(sim.state, 'seizure')).toBe(true);
    const problems = eventsOfType(events, 'shipment.problem');
    expect(problems.map((e) => [e.payload.shipmentId, e.payload.kind])).toEqual([[second, 'seized']]);
    expect(messages.thread(sim.state, 'police:zoll').at(-1)?.text).toContain('sichergestellt');
    expect(eventsOfType(events, 'tutorial.scriptedMoment').map((e) => e.payload.key)).toEqual(['seizure']);
    // Die dritte kommt an.
    orderRotterdam(sim);
    sim.advance(3);
    expect(sim.state.modules.logistics.cargo).toHaveLength(2);
  });

  it('nicht vor Stufe 9 und nicht ohne Tutorial', () => {
    const sim = start();
    jump(sim, 8);
    orderRotterdam(sim);
    sim.advance(3);
    orderRotterdam(sim);
    sim.advance(3);
    expect(sim.state.modules.logistics.cargo).toHaveLength(2);
    expect(scriptedDone(sim.state, 'seizure')).toBe(false);

    const plain = createTestGame();
    orderRotterdam(plain);
    plain.advance(3);
    orderRotterdam(plain);
    plain.advance(3);
    expect(plain.state.modules.logistics.cargo).toHaveLength(2);
  });
});
