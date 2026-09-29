import { describe, expect, it } from 'vitest';
import { clock, loadSimulation, messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeEncounters as getEncounters } from '../encounters';
import { allProducts, getProduct, getStock, store } from '../goods';
import { getPressure, getSpotPrice, spotReferencePrice, supplyDemandFactor } from '../market';
import { changeReputation, getReputation } from '../reputation';
import { CUSTOMER_TYPES, MAX_CUSTOMERS_PER_SPOT, MAX_REGULARS, REGULAR_START_SATISFACTION } from './config';
import { inPeak } from './decisions';
import {
  acceptsPrice,
  type Customer,
  canServe,
  chooseProduct,
  customerRevenue,
  customerType,
  cutNoticeChance,
  getOrder,
  getOrders,
  getRegulars,
  getSalesStats,
  isPlayerDelivering,
  priceDemandFactor,
  type Regular,
  regularAfterSale,
  regularVerdict,
  saleSatisfaction,
  typeDemandWeight,
  waitingAt,
} from './index';
import { offerDelivery, offerWholesale } from './orders';

function addCustomer(
  sim: Simulation,
  spotId: string,
  amount: number,
  pricePerUnit = 10,
  extra: Partial<Customer> = {},
) {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 100,
    ...extra,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

/** Spielt eine Weile und bedient dabei alle paar Minuten jeden Kunden, damit die Spots nie voll sind. */
function playServing(sim: Simulation, minutes: number): void {
  for (let t = 0; t < minutes; t += 10) {
    sim.advance(10);
    for (const c of [...sim.state.modules.customers.waiting]) serve(sim, c.id);
  }
}

/** Spiel ohne zufällig auftauchende Kunden und Aufträge, damit Tests genau zählen können. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  changeReputation(sim.ctx('test'), -40); // unter der Schwelle für Lieferanfragen
  return sim;
}

const serve = (sim: Simulation, customerId: number) =>
  sim.dispatch({ type: 'customers.serve', payload: { customerId } });

const weekdayOf = (day: number) => clock.weekday(clock.at(day));

describe('customers: Straße', () => {
  it('Kunden verschiedener Typen tauchen mit der Zeit an den Spots auf', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    sim.advance(180);
    const waiting = sim.state.modules.customers.waiting;
    expect(waiting.length).toBeGreaterThan(0);
    expect(eventsOfType(events, 'customer.arrived').length).toBe(
      waiting.length + getSalesStats(sim.state).customersLost,
    );
    for (const c of waiting) expect(CUSTOMER_TYPES.map((t) => t.id)).toContain(c.typeId);
  });

  it('nie mehr als die Höchstzahl Kunden pro Spot', () => {
    const sim = createTestGame();
    sim.advance(24 * 60);
    for (const spotId of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
      expect(waitingAt(sim.state, spotId).length).toBeLessThanOrEqual(MAX_CUSTOMERS_PER_SPOT);
    }
  });

  it('Kunden zahlen den Preis am Spot: Richtpreis oder den eigenen Preis', () => {
    const sim = createTestGame();
    sim.dispatch({ type: 'market.setPrice', payload: { spotId: 'uni', productId: 'weed', price: 8 } });
    sim.advance(6 * 60);
    expect(sim.state.modules.customers.waiting.length).toBeGreaterThan(0);
    for (const c of sim.state.modules.customers.waiting) {
      if (c.spotId === 'uni') expect(c.pricePerUnit).toBe(8);
      else expect(c.pricePerUnit).toBeCloseTo(spotReferencePrice(sim.state, c.spotId, c.productId), 0);
    }
  });

  it('Verkauf: Geld rein, Ware raus, Kunde weg, Ereignis mit Spot, Veedel und Qualität', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const money = sim.state.wallet.dirty;
    const stock = getStock(sim.state);
    const c = addCustomer(sim, 'zuelpicher', 3, 10, { typeId: 'student' });
    expect(serve(sim, c.id).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money + 30);
    expect(getStock(sim.state)).toBe(stock - 3);
    expect(sim.state.modules.customers.waiting).toHaveLength(0);
    expect(eventsOfType(events, 'sale.completed')[0].payload).toMatchObject({
      channel: 'street',
      spotId: 'zuelpicher',
      veedelId: 'neustadt-sued',
      productId: 'weed',
      amount: 3,
      quality: 0.5,
      revenue: 30,
      sellerId: null,
    });
    expect(getSalesStats(sim.state)).toMatchObject({ unitsSold: 3, revenue: 30, customersServed: 1 });
  });

  it('nicht mehr verkaufen als im Lager ist', () => {
    const sim = quietGame();
    sim.state.modules.goods.stock.ehrenfeld[0].amount = 2;
    const c = addCustomer(sim, 'neumarkt', 3);
    expect(canServe(sim.state, c.id)).toBe(false);
    expect(serve(sim, c.id)).toEqual({ ok: false, reason: 'Nicht genug im Lager.' });
    expect(sim.state.modules.customers.waiting).toHaveLength(1);
  });

  it('alle am Spot bedienen, solange die Ware reicht', () => {
    const sim = quietGame();
    sim.state.modules.goods.stock.ehrenfeld[0].amount = 5;
    addCustomer(sim, 'neumarkt', 3);
    addCustomer(sim, 'neumarkt', 3);
    addCustomer(sim, 'uni', 1);
    const result = sim.dispatch({ type: 'customers.serveAll', payload: { spotId: 'neumarkt' } });
    expect(result).toEqual({ ok: true, data: { served: 1 } });
    expect(sim.state.modules.customers.waiting.map((c) => c.spotId).sort()).toEqual(['neumarkt', 'uni']);
  });

  it('Kunden hauen ab, wenn ihre Geduld zu Ende ist, und das kostet Ruf', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const reputation = getReputation(sim.state);
    addCustomer(sim, 'uni', 1);
    sim.advance(100);
    expect(sim.state.modules.customers.waiting).toHaveLength(0);
    expect(getSalesStats(sim.state).customersLost).toBe(1);
    expect(sim.state.journal[0].text).toBe('Kunde am Uni-Wiese ist gegangen: niemand hat rechtzeitig verkauft.');
    expect(eventsOfType(events, 'customer.left')[0].payload).toMatchObject({
      spotId: 'uni',
      productId: 'weed',
      amount: 1,
      veedelId: 'lindenthal',
    });
    expect(getReputation(sim.state)).toBeLessThan(reputation);
  });

  it('Geduld und Umsatz eines Kunden', () => {
    const sim = createTestGame();
    sim.advance(180);
    const c = sim.state.modules.customers.waiting[0];
    expect(c.expiresAt - c.arrivedAt).toBeGreaterThan(0);
    expect(customerRevenue(c)).toBe(Math.round(c.amount * c.pricePerUnit));
  });

  it('gestreckte Ware fällt Kennern auf und kostet Ruf', () => {
    const sim = quietGame();
    const [lot] = sim.state.modules.goods.stock.ehrenfeld;
    lot.cut = 0.5;
    const reputation = getReputation(sim.state);
    for (let i = 0; i < 10; i++) serve(sim, addCustomer(sim, 'ebertplatz', 1, 9, { typeId: 'stoner' }).id);
    expect(getSalesStats(sim.state).cutNoticed).toBeGreaterThan(5);
    expect(getReputation(sim.state)).toBeLessThan(reputation - 5);
  });

  it('gute Qualität bringt Ruf', () => {
    const sim = quietGame();
    sim.state.modules.goods.stock.ehrenfeld[0].quality = 0.9;
    const reputation = getReputation(sim.state);
    for (let i = 0; i < 5; i++) serve(sim, addCustomer(sim, 'uni', 1, 10, { typeId: 'student' }).id);
    expect(getReputation(sim.state)).toBeGreaterThan(reputation);
  });
});

describe('customers: Kundenentscheidung', () => {
  it('der Preis wirkt: teurer vertreibt, billiger lockt, Banker sind weniger empfindlich', () => {
    const student = customerType('student');
    const banker = customerType('banker');
    expect(priceDemandFactor(1, student.priceSensitivity)).toBe(1);
    expect(priceDemandFactor(1.3, student.priceSensitivity)).toBeLessThan(0.5);
    expect(priceDemandFactor(0.8, student.priceSensitivity)).toBeGreaterThan(1);
    expect(priceDemandFactor(1.3, banker.priceSensitivity)).toBeGreaterThan(priceDemandFactor(1.3, 1.4));
    expect(priceDemandFactor(0.1, 5)).toBe(1.5);
    expect(acceptsPrice(1, 1, 0.5)).toBe(true);
    expect(acceptsPrice(2, 1.4, 0.1)).toBe(false);
  });

  it('der Kunde will ein Produkt seines Geschmacks, nimmt Ersatz oder geht leer aus', () => {
    const products = allProducts();
    const roll = (...values: number[]) => {
      const list = [...values];
      return () => list.shift() ?? 0;
    };
    const onlyWeed = (id: string) => (id === 'weed' ? 10 : 0);
    // Banker mögen kein Standard-Gras: nichts Passendes da.
    expect(chooseProduct('banker', products, onlyWeed, roll(0, 0)).productId).toBeNull();
    // Student will Haze (nicht da) und nimmt Gras als Ersatz …
    const wantsHaze = chooseProduct('student', products, onlyWeed, roll(0.3, 0.1, 0));
    expect(wantsHaze).toEqual({ wanted: 'haze', productId: 'weed' });
    // … oder geht leer aus.
    expect(chooseProduct('student', products, onlyWeed, roll(0.3, 0.9))).toEqual({ wanted: 'haze', productId: null });
    // Was da ist, wird genommen.
    expect(chooseProduct('student', products, onlyWeed, roll(0)).productId).toBe('weed');
  });

  it('Zufriedenheit hängt an Qualität, Streckmittel und Preis', () => {
    const base = { quality: 0.7, expectation: 0.4, noticedCut: false, priceRatio: 1 };
    expect(saleSatisfaction(base)).toBeGreaterThan(0);
    expect(saleSatisfaction({ ...base, quality: 0.2 })).toBeLessThan(0);
    expect(saleSatisfaction({ ...base, noticedCut: true })).toBeLessThan(saleSatisfaction(base));
    expect(saleSatisfaction({ ...base, priceRatio: 1.5 })).toBeLessThan(saleSatisfaction(base));
    expect(cutNoticeChance(0, 1.5)).toBe(0);
    expect(cutNoticeChance(0.3, 1.5)).toBeGreaterThan(cutNoticeChance(0.3, 0.3));
  });

  it('Uhrzeit und Wochentag: Partygänger nachts am Wochenende, Banker unter der Woche', () => {
    const party = customerType('party');
    const banker = customerType('banker');
    expect(inPeak(23, party.peakHours)).toBe(true);
    expect(inPeak(2, party.peakHours)).toBe(true);
    expect(inPeak(12, party.peakHours)).toBe(false);
    const saturday = weekdayOf(2);
    const tuesday = weekdayOf(5);
    expect(clock.weekdayName(clock.at(2))).toBe('Samstag');
    expect(typeDemandWeight(party, undefined, 23, saturday)).toBeGreaterThan(
      typeDemandWeight(party, undefined, 23, tuesday) * 2,
    );
    expect(typeDemandWeight(banker, undefined, 19, tuesday)).toBeGreaterThan(
      typeDemandWeight(banker, undefined, 19, saturday),
    );
    expect(typeDemandWeight(banker, { banker: 0.3 }, 19, tuesday)).toBeLessThan(
      typeDemandWeight(banker, undefined, 19, tuesday),
    );
  });

  it('zu teuer heißt weniger Kunden', () => {
    const count = (price: number | null) => {
      const sim = createTestGame({ seed: 5 });
      if (price !== null) {
        for (const spotId of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
          sim.dispatch({ type: 'market.setPrice', payload: { spotId, productId: 'weed', price } });
        }
      }
      store(sim.ctx('test'), { productId: 'weed', amount: 5000 });
      const events = recordEvents(sim);
      playServing(sim, 2 * 24 * 60);
      return {
        arrived: eventsOfType(events, 'customer.arrived').length,
        tooExpensive: getSalesStats(sim.state).tooExpensive,
      };
    };
    const normal = count(null);
    const expensive = count(25);
    const cheap = count(6);
    expect(expensive.arrived).toBeLessThan(normal.arrived * 0.5);
    expect(expensive.tooExpensive).toBeGreaterThan(normal.tooExpensive);
    expect(cheap.arrived).toBeGreaterThan(normal.arrived);
  });

  it('ein besserer Ruf bringt mehr Kundschaft', () => {
    const count = (delta: number) => {
      const sim = createTestGame({ seed: 3 });
      changeReputation(sim.ctx('test'), delta);
      store(sim.ctx('test'), { productId: 'weed', amount: 5000 });
      const events = recordEvents(sim);
      playServing(sim, 24 * 60);
      return eventsOfType(events, 'customer.arrived').length;
    };
    expect(count(50)).toBeGreaterThan(count(-50));
  });

  it('Nachfrage ohne Ware wird gemeldet und treibt den Richtpreis', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    sim.advance(24 * 60);
    const missed = eventsOfType(events, 'customer.missed');
    expect(missed.length).toBeGreaterThan(0);
    expect(getSalesStats(sim.state).missedDemand).toBe(missed.length);
    const last = missed[missed.length - 1].payload;
    expect(last.productId).not.toBe('weed');
    expect(getPressure(sim.state, last.productId, last.veedelId)).toBeGreaterThan(0);
    expect(getSalesStats(sim.state).missedByProduct[last.productId]).toBeGreaterThan(0);
    expect(supplyDemandFactor(sim.state, last.productId, last.veedelId)).toBeGreaterThan(1);
  });
});

describe('customers: Stammkunden', () => {
  const regular = (sim: Simulation, extra: Partial<Regular> = {}): Regular => {
    const r: Regular = {
      id: 'r-test',
      name: 'Jonas vom Campus',
      typeId: 'student',
      spotId: 'uni',
      productId: 'weed',
      amount: 2,
      visits: 3,
      lastPrice: getSpotPrice(sim.state, 'uni', 'weed'),
      lastQuality: 0.5,
      satisfaction: REGULAR_START_SATISFACTION,
      since: 0,
      nextVisitAt: sim.state.time + 1,
      status: 'active',
      ...extra,
    };
    sim.state.modules.customers.regulars.push(r);
    return r;
  };

  it('zufriedene Kunden werden Stammkunden mit Namen', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.state.modules.goods.stock.ehrenfeld[0].quality = 0.9;
    for (let i = 0; i < 300 && getRegulars(sim.state).length === 0; i++) {
      serve(sim, addCustomer(sim, 'uni', 1, 10, { typeId: 'stoner' }).id);
      sim.state.modules.goods.stock.ehrenfeld[0].amount = 40;
    }
    const [r] = getRegulars(sim.state);
    expect(r).toMatchObject({ typeId: 'stoner', spotId: 'uni', productId: 'weed', status: 'active' });
    expect(r.name).toMatch(/\S/);
    expect(r.nextVisitAt).toBeGreaterThan(sim.state.time);
    expect(eventsOfType(events, 'customer.regularGained')).toHaveLength(1);
    expect(getRegulars(sim.state).length).toBeLessThanOrEqual(MAX_REGULARS);
  });

  it('Stammkunden kommen wieder und erinnern sich an Preis und Qualität', () => {
    const sim = quietGame();
    const r = regular(sim);
    sim.step();
    const [c] = waitingAt(sim.state, 'uni');
    expect(c).toMatchObject({ regularId: 'r-test', productId: 'weed', amount: 2 });
    expect(r.nextVisitAt).toBeGreaterThan(sim.state.time);
    sim.state.modules.goods.stock.ehrenfeld[0].quality = 0.3; // schlechter als letztes Mal
    serve(sim, c.id);
    expect(r.visits).toBe(4);
    expect(r.lastQuality).toBe(0.3);
    expect(r.satisfaction).toBeLessThan(REGULAR_START_SATISFACTION);
  });

  it('wird es deutlich teurer, bleiben Stammkunden weg und kommen irgendwann gar nicht mehr', () => {
    const student = customerType('student');
    const memory = { lastPrice: 10, satisfaction: 0.6 };
    expect(regularVerdict(memory, student, { price: 10, available: true }).verdict).toBe('visit');
    expect(regularVerdict(memory, student, { price: 10, available: false }).verdict).toBe('skip');
    expect(regularVerdict(memory, student, { price: 14, available: true }).verdict).toBe('skip');
    expect(regularVerdict({ ...memory, satisfaction: 0.3 }, student, { price: 14, available: true }).verdict).toBe(
      'quit',
    );
    // Banker sind nicht so empfindlich.
    expect(regularVerdict(memory, customerType('banker'), { price: 14, available: true }).verdict).toBe('visit');
    expect(
      regularAfterSale({ lastPrice: 10, lastQuality: 0.6, satisfaction: 0.5 }, student, {
        price: 10,
        quality: 0.6,
        noticedCut: false,
      }),
    ).toBeGreaterThan(0.5);

    const sim = quietGame();
    const events = recordEvents(sim);
    const r = regular(sim, { lastPrice: 5, satisfaction: 0.3 });
    sim.step();
    expect(r.status).toBe('lost');
    expect(eventsOfType(events, 'customer.regularLost')[0].payload.regularId).toBe('r-test');
    expect(waitingAt(sim.state, 'uni')).toHaveLength(0);
  });
});

describe('customers: Lieferdienst und Großhandel', () => {
  function withCourier(sim: Simulation): string {
    sim.state.wallet.dirty += 1000;
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const member = sim.state.modules.staff.members[sim.state.modules.staff.members.length - 1];
    member.role = 'courier';
    member.assignment = null;
    return member.id;
  }

  const answer = (sim: Simulation, messageId: number, optionId: string) =>
    sim.dispatch({ type: 'messages.answer', payload: { messageId, optionId } });

  it('Bestellungen kommen als Nachricht; selbst ausliefern bringt Geld und sale.completed', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 40);
    const events = recordEvents(sim);
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    const message = messages.get(sim.state, order.messageId);
    expect(message?.options?.map((o) => o.id)).toEqual(['self', 'courier', 'decline']);
    const stock = getStock(sim.state);
    const money = sim.state.wallet.dirty;
    expect(answer(sim, order.messageId, 'self').ok).toBe(true);
    expect(getOrder(sim.state, order.id)?.status).toBe('enRoute');
    expect(isPlayerDelivering(sim.state)).toBe(true);
    expect(getStock(sim.state)).toBe(stock - order.amount);
    sim.advance((order.arrivesAt ?? 0) - sim.state.time);
    expect(getOrder(sim.state, order.id)?.status).toBe('done');
    expect(sim.state.wallet.dirty).toBe(money + order.price);
    expect(eventsOfType(events, 'sale.completed')[0].payload).toMatchObject({
      channel: 'delivery',
      spotId: null,
      veedelId: order.veedelId,
      revenue: order.price,
      sellerId: null,
      orderId: order.id,
    });
    expect(getSalesStats(sim.state).deliveries).toBe(1);
  });

  it('Kurier ausliefern lassen: freien Kurier über staff finden, danach wieder frei', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 40);
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    expect(answer(sim, order.messageId, 'courier')).toEqual({ ok: false, reason: 'Kein freier Kurier.' });
    expect(messages.canAnswer(sim.state, messages.get(sim.state, order.messageId) ?? ({} as never))).toBe(true);
    const courierId = withCourier(sim);
    const events = recordEvents(sim);
    expect(answer(sim, order.messageId, 'courier').ok).toBe(true);
    expect(sim.state.modules.staff.members.find((m) => m.id === courierId)?.assignment).toEqual({
      kind: 'delivery',
      targetId: String(order.id),
    });
    sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
    expect(eventsOfType(events, 'sale.completed')[0].payload.sellerId).toBe(courierId);
    expect(sim.state.modules.staff.members.find((m) => m.id === courierId)?.assignment).toBeNull();
  });

  it('fällt der Kurier aus, platzt die Lieferung', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 40);
    const courierId = withCourier(sim);
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    answer(sim, order.messageId, 'courier');
    const reputation = getReputation(sim.state);
    sim.ctx('police').emit('police.arrest', { staffId: courierId, veedelId: 'ehrenfeld' });
    sim.step();
    expect(getOrder(sim.state, order.id)?.status).toBe('failed');
    expect(getReputation(sim.state)).toBeLessThan(reputation);
  });

  it('Ablehnen und Ignorieren kosten etwas Ruf', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 40);
    const a = offerDelivery(sim.ctx('customers'), true);
    const b = offerDelivery(sim.ctx('customers'), true);
    if (!a || !b) throw new Error('keine Bestellung');
    const reputation = getReputation(sim.state);
    expect(answer(sim, a.messageId, 'decline').ok).toBe(true);
    expect(getOrder(sim.state, a.id)?.status).toBe('declined');
    expect(getReputation(sim.state)).toBeLessThan(reputation);
    sim.advance(b.expiresAt - sim.state.time);
    expect(getOrder(sim.state, b.id)?.status).toBe('expired');
    expect(getOrders(sim.state, { status: 'declined' }).map((o) => o.id)).toEqual([a.id]);
  });

  it('Großhandel: große Menge mit Rabatt, Verkauf über den Kanal wholesale', () => {
    const sim = quietGame();
    changeReputation(sim.ctx('test'), 50);
    store(sim.ctx('test'), { productId: 'hash', amount: 600, quality: 0.6 });
    sim.state.modules.goods.stock.ehrenfeld = sim.state.modules.goods.stock.ehrenfeld.filter(
      (l) => l.productId === 'hash',
    );
    const events = recordEvents(sim);
    const order = offerWholesale(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Anfrage');
    expect(order.kind).toBe('wholesale');
    expect(order.amount).toBeGreaterThanOrEqual(50);
    const base = getProduct('hash')?.basePrice ?? 0;
    expect(order.price / order.amount).toBeLessThan(base * 0.8);
    expect(answer(sim, order.messageId, 'self').ok).toBe(true);
    sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
    expect(eventsOfType(events, 'sale.completed')[0].payload).toMatchObject({ channel: 'wholesale', spotId: null });
    expect(getSalesStats(sim.state).wholesaleDeals).toBe(1);
  });

  it('Großhandel: Ein Deal kann bei der Übergabe kippen, dann entscheidet eine Konfrontation', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 60 && outcomes.size < 2; seed++) {
      const sim = createTestGame({ seed });
      for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
        sim.state.modules.customers.nextSpawnAt[key] = Infinity;
      }
      changeReputation(sim.ctx('test'), 50);
      store(sim.ctx('test'), { productId: 'hash', amount: 600, quality: 0.6 });
      const events = recordEvents(sim);
      const order = offerWholesale(sim.ctx('customers'), true);
      if (!order) continue;
      expect(answer(sim, order.messageId, 'self').ok).toBe(true);
      sim.advance((getOrder(sim.state, order.id)?.arrivesAt ?? 0) - sim.state.time);
      if (getOrder(sim.state, order.id)?.status !== 'contested') continue;
      const started = eventsOfType(events, 'encounter.started')[0].payload;
      expect(started.kind).toBe('dealGoneWrong');
      expect(started.request.playerPresent).toBe(true);
      const encounterId = getEncounters(sim.state)[0].id;
      expect(sim.dispatch({ type: 'encounters.auto', payload: { encounterId } }).ok).toBe(true);
      const resolved = eventsOfType(events, 'encounter.resolved')[0].payload;
      if (resolved.playerKilled) continue;
      const status = getOrder(sim.state, order.id)?.status;
      if (resolved.outcome === 'success') {
        expect(status).toBe('done');
        expect(eventsOfType(events, 'sale.completed')).toHaveLength(1);
      } else {
        expect(status).toBe('failed');
        expect(eventsOfType(events, 'sale.completed')).toHaveLength(0);
      }
      outcomes.add(resolved.outcome === 'success' ? 'success' : 'lost');
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it('Anfragen kommen im Spielverlauf von selbst', () => {
    const sim = createTestGame({ seed: 2 });
    changeReputation(sim.ctx('test'), 30);
    store(sim.ctx('test'), { productId: 'weed', amount: 500 });
    const events = recordEvents(sim);
    sim.advance(2 * 24 * 60);
    expect(eventsOfType(events, 'order.received').length).toBeGreaterThan(0);
  });
});

describe('customers: Spielstand', () => {
  it('migriert Version 1 ohne Stammkunden und Aufträge', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.customers = {
      waiting: [],
      nextSpawnAt: { uni: 1200 },
      stats: { unitsSold: 5, revenue: 50, customersServed: 2, customersLost: 1 },
    };
    raw.moduleVersions.customers = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(getSalesStats(loaded.state)).toMatchObject({ unitsSold: 5, deliveries: 0, missedDemand: 0 });
    expect(getRegulars(loaded.state)).toEqual([]);
    loaded.advance(60);
  });
});
