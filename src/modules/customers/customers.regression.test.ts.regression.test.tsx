// Regressionstests zu Befunden aus dem Bugreview (Paket customers).

import { describe, expect, it } from 'vitest';
import type { Ctx, Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { bookingCity } from '../finance';
import { store } from '../goods';
import { changeReputation, getReputation, recentReputationChanges } from '../reputation';
import { getSpots } from '../spots';
import { weatherDemandFactor } from '../weather';
import { type Customer, customerRevenue, dealerRelation, getOrder, servableAt, waitingAt } from './index';
import { offerDelivery, offerWholesale, onDealResolved } from './orders';
import { onCityEventChanged } from './street';

/** Spiel ohne zufällig auftauchende Kunden, damit die Tests genau zählen können. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function addCustomer(sim: Simulation, spotId: string, amount: number, extra: Partial<Customer> = {}): Customer {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit: 10,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 100,
    ...extra,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

function emptyStock(sim: Simulation): void {
  for (const id of Object.keys(sim.state.modules.goods.stock)) sim.state.modules.goods.stock[id] = [];
}

const answer = (sim: Simulation, messageId: number, optionId: string) =>
  sim.dispatch({ type: 'messages.answer', payload: { messageId, optionId } });

describe('Selbst verkaufen nur in der Stadt, in der du bist', () => {
  it('auf der Fahrt nach Hamburg lehnen „Verkaufen“ und „Alle bedienen“ in Köln ab', () => {
    const sim = quietGame();
    store(sim.ctx('test'), { productId: 'weed', amount: 40 });
    const a = addCustomer(sim, 'neumarkt', 3);
    addCustomer(sim, 'neumarkt', 2);
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const money = sim.state.wallet.dirty;
    const served = sim.state.modules.customers.stats.customersServed;

    const one = sim.dispatch({ type: 'customers.serve', payload: { customerId: a.id } });
    expect(one).toMatchObject({ ok: false, reason: expect.stringContaining('Köln') });
    const all = sim.dispatch({ type: 'customers.serveAll', payload: { spotId: 'neumarkt' } });
    expect(all).toMatchObject({ ok: false, reason: expect.stringContaining('Köln') });

    expect(sim.state.wallet.dirty).toBe(money);
    expect(sim.state.modules.customers.stats.customersServed).toBe(served);
    expect(waitingAt(sim.state, 'neumarkt')).toHaveLength(2);
  });

  it('in Köln verkaufst du selbst wie bisher, Leute mit sellerId sind nicht betroffen', () => {
    const sim = quietGame();
    store(sim.ctx('test'), { productId: 'weed', amount: 40 });
    const a = addCustomer(sim, 'neumarkt', 3);
    expect(sim.dispatch({ type: 'customers.serve', payload: { customerId: a.id } }).ok).toBe(true);
  });
});

describe('Geplatzter Großhandels-Deal bucht den Ruf nur einmal', () => {
  for (const outcome of ['failure', 'retreat'] as const) {
    it(`Ausgang ${outcome}: onDealResolved bucht keinen zweiten Ruf-Abzug`, () => {
      const sim = quietGame();
      changeReputation(sim.ctx('test'), 50);
      store(sim.ctx('test'), { productId: 'hash', amount: 600, quality: 0.6 });
      const order = offerWholesale(sim.ctx('customers'), true);
      if (!order) throw new Error('keine Anfrage');
      expect(answer(sim, order.messageId, 'self').ok).toBe(true);
      const accepted = getOrder(sim.state, order.id);
      if (!accepted) throw new Error('kein Auftrag');
      accepted.status = 'contested';
      const before = getReputation(sim.state);
      onDealResolved(sim.ctx('customers'), `order:${order.id}`, outcome);
      expect(getOrder(sim.state, order.id)?.status).toBe('failed');
      expect(getReputation(sim.state)).toBe(before);
      expect(recentReputationChanges(sim.state).some((c) => c.reason === 'Deal geplatzt')).toBe(false);
    });
  }

  it('die Konfrontation des gekippten Deals trägt den Ruf für Niederlage und Rückzug selbst', () => {
    let checked = false;
    for (let seed = 1; seed <= 60 && !checked; seed++) {
      const sim = quietGame(seed);
      changeReputation(sim.ctx('test'), 50);
      store(sim.ctx('test'), { productId: 'hash', amount: 600, quality: 0.6 });
      const events = recordEvents(sim);
      const order = offerWholesale(sim.ctx('customers'), true);
      if (!order) continue;
      expect(answer(sim, order.messageId, 'self').ok).toBe(true);
      sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
      const started = eventsOfType(events, 'encounter.started').find((e) => e.payload.kind === 'dealGoneWrong');
      if (!started) continue;
      expect(started.payload.request.effects?.failure?.reputation).toBeLessThan(0);
      expect(started.payload.request.effects?.retreat?.reputation).toBeLessThan(0);
      checked = true;
    }
    expect(checked).toBe(true);
  });
});

describe('„Alle bedienen“ zählt nur, wen die Ware wirklich bedient', () => {
  it('drei Kunden (3, 5, 5 g), Ware für 4 g: nur der erste zählt, serveAll bedient genau ihn', () => {
    const sim = quietGame();
    emptyStock(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 4 });
    const first = addCustomer(sim, 'neumarkt', 3, { expiresAt: sim.state.time + 50 });
    addCustomer(sim, 'neumarkt', 5, { expiresAt: sim.state.time + 60 });
    addCustomer(sim, 'neumarkt', 5, { expiresAt: sim.state.time + 70 });
    const servable = servableAt(sim.state, 'neumarkt');
    expect(servable.map((c) => c.id)).toEqual([first.id]);
    expect(servable.reduce((sum, c) => sum + customerRevenue(c), 0)).toBe(30);
    const before = sim.state.wallet.dirty;
    const result = sim.dispatch({ type: 'customers.serveAll', payload: { spotId: 'neumarkt' } });
    expect(result).toMatchObject({ ok: true, data: { served: 1 } });
    expect(sim.state.wallet.dirty - before).toBe(30);
    expect(waitingAt(sim.state, 'neumarkt')).toHaveLength(2);
  });

  it('drei Kunden mit je 3 g, Ware für 4 g: auch dann nur einer, obwohl jeder allein bedienbar wäre', () => {
    const sim = quietGame();
    emptyStock(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 4 });
    for (let i = 0; i < 3; i++) addCustomer(sim, 'neumarkt', 3, { expiresAt: sim.state.time + 50 + i });
    expect(servableAt(sim.state, 'neumarkt')).toHaveLength(1);
    const result = sim.dispatch({ type: 'customers.serveAll', payload: { spotId: 'neumarkt' } });
    expect(result).toMatchObject({ ok: true, data: { served: 1 } });
  });
});

describe('Wieder freigeschalteter Spot holt die Sperrzeit nicht nach', () => {
  it('nach tutorial.skip kommen an den Spots keine Kunden mit Ankunft in der Vergangenheit', () => {
    const sim = createTestGame({ seed: 1 });
    expect(sim.dispatch({ type: 'tutorial.start', payload: {} }).ok).toBe(true);
    const locked = [...sim.state.modules.tutorial.lockedAtStart];
    expect(locked.length).toBeGreaterThan(0);
    sim.advance(300);
    const unlockedAt = sim.state.time;
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'tutorial.skip', payload: {} }).ok).toBe(true);
    sim.advance(2);
    const arrived = sim.state.modules.customers.waiting.filter((c) => locked.includes(c.spotId));
    for (const c of arrived) expect(c.arrivedAt).toBeGreaterThanOrEqual(unlockedAt);
    const left = eventsOfType(events, 'customer.left').filter((e) => locked.includes(e.payload.spotId));
    expect(left).toEqual([]);
    for (const spotId of locked) {
      expect(sim.state.modules.customers.nextSpawnAt[spotId]).toBeGreaterThanOrEqual(unlockedAt);
    }
  });
});

describe('Lieferdienst folgt dem Wetter', () => {
  /** Chance, mit der offerDelivery bei diesem Wetter eine Anfrage schickt, und der Wetter-Faktor des Lieferdienstes. */
  function deliveryChance(kind: 'clear' | 'storm' | 'rain'): { chance: number; factor: number } {
    const sim = quietGame();
    sim.dispatch({ type: 'customers.setDirectOrders', payload: { enabled: true } });
    changeReputation(sim.ctx('test'), 30);
    store(sim.ctx('test'), { productId: 'weed', amount: 500 });
    sim.state.modules.weather.kind = kind;
    const seen: number[] = [];
    const ctx: Ctx = {
      ...sim.ctx('customers'),
      chance: (p: number) => {
        seen.push(p);
        return false;
      },
    };
    expect(offerDelivery(ctx)).toBeNull();
    expect(seen.length).toBeGreaterThan(0);
    return { chance: seen[0], factor: weatherDemandFactor(sim.state, 'delivery') };
  }

  it('bei Gewitter und Regen kommen Anfragen so viel öfter, wie die Einstellungen anzeigen', () => {
    const clear = deliveryChance('clear');
    for (const kind of ['storm', 'rain'] as const) {
      const bad = deliveryChance(kind);
      expect(bad.factor).toBeGreaterThan(clear.factor);
      expect(bad.chance / clear.chance).toBeCloseTo(bad.factor / clear.factor, 6);
    }
  });
});

describe('Vorkasse und Rückzahlung zählen in der Stadt des Deals', () => {
  it('Köln-Deal, angenommen und geplatzt, während Hamburg die aktive Stadt ist', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 50);
    store(sim.ctx('test'), { productId: 'weed', amount: 3000, quality: 0.6 });
    sim.state.modules.customers.dealers.pitter = { ...dealerRelation(sim.state, 'pitter'), trust: 55 };
    const order = offerWholesale(sim.ctx('customers'), true, 'pitter');
    if (!order) throw new Error('keine Anfrage');
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const events = recordEvents(sim);
    expect(answer(sim, order.messageId, 'self').ok).toBe(true);
    expect(getOrder(sim.state, order.id)?.prepaid).toBeGreaterThan(0);
    const accepted = getOrder(sim.state, order.id);
    if (accepted) {
      accepted.courierId = 'weg';
      accepted.deliveredBy = 'rightHand';
    }
    sim.ctx('staff').emit('staff.left', { staffId: 'weg', reason: 'quit' });
    sim.advance(1);
    expect(getOrder(sim.state, order.id)?.status).toBe('failed');
    const bookings = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.reason.includes('Vorkasse'));
    expect(bookings).toHaveLength(2);
    for (const b of bookings) expect(bookingCity(sim.state, b.payload)).toBe('koeln');
  });

  it('der Rest bei der Übergabe zählt ebenfalls in Köln', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 50);
    store(sim.ctx('test'), { productId: 'weed', amount: 3000, quality: 0.6 });
    const order = offerWholesale(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Anfrage');
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(answer(sim, order.messageId, 'self').ok).toBe(true);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const events = recordEvents(sim);
    sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
    const status = getOrder(sim.state, order.id)?.status;
    // Ein gekippter Deal (Konfrontation) zahlt hier nichts aus; dann gibt es nichts zu prüfen.
    if (status !== 'done') return;
    const earned = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.category === 'sales.wholesale');
    expect(earned.length).toBeGreaterThan(0);
    for (const b of earned) expect(bookingCity(sim.state, b.payload)).toBe('koeln');
  });
});

describe('Ende eines Stadt-Events würfelt den nächsten Kunden neu aus', () => {
  it('ein früher Termin aus der Event-Nachfrage bleibt nicht stehen', () => {
    const sim = createTestGame({ seed: 1 });
    const now = sim.state.time;
    const spots = getSpots(sim.state, 'koeln');
    for (const spot of spots) sim.state.modules.customers.nextSpawnAt[spot.id] = now + 0.5;
    onCityEventChanged(sim.ctx('customers'), 'koeln');
    const next = spots.map((s) => sim.state.modules.customers.nextSpawnAt[s.id]);
    expect(next.every((t) => t >= now)).toBe(true);
    // Mit Math.min läge jeder Termin bei höchstens now + 0,5.
    expect(next.some((t) => t > now + 0.5)).toBe(true);
  });
});
