import { describe, expect, it } from 'vitest';
import { loadSimulation, messages, type Simulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getLots, getStock } from '../goods';
import { CREDIT_TERM, ROTTERDAM_DELIVERY_TIME, START_TRUST, SUPPLIERS, TRUST_LATE_PENALTY } from './config';
import {
  availableCredit,
  availablePackages,
  cheapestPackagePrice,
  creditLimit,
  deliveryLeg,
  getRelation,
  getSupplier,
  isBlocked,
  packagePrice,
  RHINE_APPROACH_FROM,
  RHINE_ROUTE,
  rollShipmentProblem,
  type Shipment,
  shipmentProgress,
  shipmentsInTransit,
  supplierDiscount,
  UNLOADING_PORT,
} from './index';

const small = SUPPLIERS[0].packages[0];

const order = (sim: Simulation, supplierId: string, packageId: string, onCredit = false) =>
  sim.dispatch({ type: 'suppliers.order', payload: { supplierId, packageId, onCredit } });

/** Ausgewürfeltes Lieferproblem entfernen, damit der Test genau rechnen kann. */
function clean(shipment: Shipment): Shipment {
  if (shipment.delayMinutes) shipment.arrivesAt -= shipment.delayMinutes;
  if (shipment.promisedQuality) shipment.quality = shipment.promisedQuality;
  for (const key of ['problem', 'problemAt', 'delayMinutes', 'problemRevealed', 'promisedQuality'] as const) {
    delete shipment[key];
  }
  return shipment;
}

function lastShipment(sim: Simulation): Shipment {
  const list = shipmentsInTransit(sim.state);
  return list[list.length - 1] as Shipment;
}

describe('suppliers', () => {
  it('Bestellung in Rotterdam kommt nach der Lieferzeit im Lager an', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const stock = getStock(sim.state);
    expect(order(sim, 'rotterdam', 'small').ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(START_DIRTY_MONEY - small.price);
    const shipment = clean(lastShipment(sim));
    sim.advance(ROTTERDAM_DELIVERY_TIME / 2);
    expect(shipmentProgress(sim.state, shipment)).toBeCloseTo(0.5);
    sim.state.modules.goods.stock.ehrenfeld[0].amount = stock; // keine Verkäufe mitzählen
    sim.advance(ROTTERDAM_DELIVERY_TIME / 2 - 1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
    sim.advance(1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(getStock(sim.state)).toBe(stock + small.amount);
    expect(eventsOfType(events, 'shipment.arrived')[0].payload).toMatchObject({
      amount: 200,
      warehouseId: 'ehrenfeld',
      quality: shipment.quality,
    });
    expect(sim.state.journal.some((j) => j.text === 'Lieferung angekommen: 200 g Gras im Lager Ehrenfeld.')).toBe(true);
    // Der Einkaufspreis landet im Posten (für die Marge).
    const lot = getLots(sim.state).find((l) => l.quality === shipment.quality);
    expect(lot?.unitCost).toBeCloseTo(small.price / small.amount);
  });

  it('Großstädte: klein, schnell, teurer; Hafen: groß, langsam, günstiger', () => {
    const sim = createTestGame();
    const unitPrice = (id: string) => {
      const s = getSupplier(sim.state, id);
      const weed = s?.packages.find((p) => p.productId === 'weed');
      return weed ? weed.price / weed.amount : Infinity;
    };
    const port = getSupplier(sim.state, 'rotterdam');
    for (const city of SUPPLIERS.filter((s) => s.kind === 'city')) {
      expect(city.deliveryTime).toBeLessThan(port?.deliveryTime ?? 0);
      expect(Math.max(...city.packages.map((p) => p.amount))).toBeLessThan(
        Math.min(...(port?.packages.map((p) => p.amount) ?? [])),
      );
    }
    expect(unitPrice('frankfurt')).toBeGreaterThan(unitPrice('rotterdam'));
    expect(unitPrice('hamburg')).toBeGreaterThan(unitPrice('rotterdam'));
    expect(SUPPLIERS.map((s) => s.id)).toEqual(['rotterdam', 'frankfurt', 'berlin', 'hamburg']);
  });

  it('ohne genug Geld keine Bestellung', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 10;
    expect(order(sim, 'rotterdam', 'small')).toEqual({ ok: false, reason: 'Nicht genug Geld.' });
  });

  it('der Hafen schreibt zu Beginn eine Nachricht, über die man bestellen kann', () => {
    const sim = createTestGame();
    const [thread] = messages.threads(sim.state);
    expect(thread.contact.id).toBe('supplier:rotterdam');
    const result = sim.dispatch({ type: 'messages.answer', payload: { messageId: thread.last.id, optionId: 'order' } });
    expect(result.ok).toBe(true);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
  });

  it('Pleite: kein Geld für eine Bestellung, keine Ware, keine Lieferung → Game Over', () => {
    const sim = createTestGame();
    sim.state.modules.goods.stock.ehrenfeld = [];
    sim.state.wallet.dirty = cheapestPackagePrice(sim.state) - 1;
    sim.step();
    expect(sim.state.outcome.gameOver?.reason).toBe('bankrupt');
  });

  it('keine Pleite, solange eine Lieferung unterwegs ist oder Kredit da ist', () => {
    const sim = createTestGame();
    order(sim, 'rotterdam', 'small');
    clean(lastShipment(sim));
    sim.state.modules.goods.stock.ehrenfeld = [];
    sim.state.wallet.dirty = 0;
    sim.advance(ROTTERDAM_DELIVERY_TIME - 1);
    expect(sim.isOver).toBe(false);
    sim.advance(1);
    expect(getStock(sim.state)).toBeGreaterThan(0);
    expect(sim.isOver).toBe(false);

    const broke = createTestGame();
    broke.state.modules.suppliers.relations.hamburg.trust = 60;
    broke.state.modules.goods.stock.ehrenfeld = [];
    broke.state.wallet.dirty = 0;
    broke.step();
    expect(broke.isOver).toBe(false);
  });

  it('gesperrte Lieferanten machen nicht pleite, solange das Geld für Schulden und ein Paket reicht', () => {
    const sim = createTestGame();
    sim.state.modules.goods.stock.ehrenfeld = [];
    for (const rel of Object.values(sim.state.modules.suppliers.relations)) {
      rel.debt = 500;
      rel.dueAt = sim.state.time + 1440;
      rel.overdue = 1;
    }
    sim.state.wallet.dirty = 500 + cheapestPackagePrice(sim.state);
    sim.step();
    expect(sim.isOver).toBe(false);
    sim.state.wallet.dirty = 400;
    sim.step();
    expect(sim.state.outcome.gameOver?.reason).toBe('bankrupt');
  });

  it('Vertrauen steigt mit Käufen und bringt Rabatt, Kredit und besseres Sortiment', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    expect(getRelation(sim.state, 'rotterdam').trust).toBe(START_TRUST);
    expect(creditLimit(sim.state, 'rotterdam')).toBe(0);
    expect(availablePackages(sim.state, 'rotterdam').map((p) => p.id)).not.toContain('haze');
    sim.state.wallet.dirty = 100000;
    for (let i = 0; i < 5; i++) order(sim, 'rotterdam', 'large');
    const trust = getRelation(sim.state, 'rotterdam').trust;
    expect(trust).toBeGreaterThan(START_TRUST + 5 * 2);
    expect(supplierDiscount(sim.state, 'rotterdam')).toBeGreaterThan(0);
    expect(packagePrice(sim.state, 'rotterdam', 'large')).toBeLessThan(SUPPLIERS[0].packages[2].price);
    expect(creditLimit(sim.state, 'rotterdam')).toBeGreaterThan(0);
    expect(availablePackages(sim.state, 'rotterdam').map((p) => p.id)).toContain('haze');
    expect(eventsOfType(events, 'supplier.trustChanged').length).toBe(5);
    // Mit mehr Vertrauen kommt bessere Ware (im Mittel).
    const fresh = createTestGame();
    fresh.state.wallet.dirty = 100000;
    order(fresh, 'rotterdam', 'large');
    const trusted = createTestGame();
    trusted.state.wallet.dirty = 100000;
    trusted.state.modules.suppliers.relations.rotterdam.trust = 100;
    order(trusted, 'rotterdam', 'large');
    expect(clean(lastShipment(trusted)).quality).toBeGreaterThan(clean(lastShipment(fresh)).quality);
  });

  it('Kredit: Ware jetzt, später zahlen; pünktlich zahlen bringt Vertrauen', () => {
    const sim = createTestGame();
    sim.state.modules.suppliers.relations.hamburg.trust = 50;
    const money = sim.state.wallet.dirty;
    expect(order(sim, 'hamburg', 'weed50', true).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money);
    const rel = getRelation(sim.state, 'hamburg');
    const debt = rel.debt;
    expect(rel.debt).toBeGreaterThan(0);
    expect(rel.dueAt).toBe(sim.state.time + CREDIT_TERM);
    expect(availableCredit(sim.state, 'hamburg')).toBe(creditLimit(sim.state, 'hamburg') - rel.debt);
    const trust = rel.trust;
    expect(sim.dispatch({ type: 'suppliers.repay', payload: { supplierId: 'hamburg' } }).ok).toBe(true);
    expect(getRelation(sim.state, 'hamburg')).toMatchObject({ debt: 0, dueAt: null });
    expect(getRelation(sim.state, 'hamburg').trust).toBeGreaterThan(trust);
    expect(sim.state.wallet.dirty).toBe(money - debt);
    expect(sim.dispatch({ type: 'suppliers.repay', payload: { supplierId: 'hamburg' } }).ok).toBe(false);
  });

  it('Kredit ohne Vertrauen gibt es nicht, zu viel Kredit auch nicht', () => {
    const sim = createTestGame();
    expect(order(sim, 'rotterdam', 'small', true)).toEqual({
      ok: false,
      reason: 'Jansen gibt dir noch keinen Kredit.',
    });
    sim.state.modules.suppliers.relations.rotterdam.trust = 26;
    expect(order(sim, 'rotterdam', 'large', true)).toEqual({
      ok: false,
      reason: 'So viel Kredit gibt dir Jansen nicht.',
    });
  });

  it('überfällige Schulden: Aufschlag, weniger Vertrauen, keine Lieferungen mehr', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    sim.state.modules.suppliers.relations.frankfurt.trust = 50;
    order(sim, 'frankfurt', 'weed25', true);
    const debt = getRelation(sim.state, 'frankfurt').debt;
    const trust = getRelation(sim.state, 'frankfurt').trust;
    sim.advance(CREDIT_TERM);
    expect(getRelation(sim.state, 'frankfurt').debt).toBe(Math.round(debt * 1.1));
    expect(getRelation(sim.state, 'frankfurt').trust).toBe(trust - TRUST_LATE_PENALTY);
    expect(isBlocked(sim.state, 'frankfurt')).toBe(true);
    expect(order(sim, 'frankfurt', 'weed25').ok).toBe(false);
    expect(eventsOfType(events, 'supplier.overdue')).toHaveLength(1);
    expect(messages.thread(sim.state, 'supplier:frankfurt').at(-1)?.text).toMatch(/schuldest/);
    sim.dispatch({ type: 'suppliers.repay', payload: { supplierId: 'frankfurt' } });
    expect(isBlocked(sim.state, 'frankfurt')).toBe(false);
    expect(order(sim, 'frankfurt', 'weed25').ok).toBe(true);
  });

  it('Lieferprobleme: je unzuverlässiger, desto öfter; Vertrauen hilft', () => {
    const port = SUPPLIERS[0];
    const hamburg = SUPPLIERS[3];
    const rate = (supplier: typeof port, trust: number) => {
      let n = 0;
      for (let i = 0; i < 1000; i++) if (rollShipmentProblem(i / 1000, supplier, trust)) n++;
      return n / 1000;
    };
    expect(rate(port, 0)).toBeGreaterThan(rate(hamburg, 0));
    expect(rate(port, 100)).toBeLessThan(rate(port, 0));
    expect(rollShipmentProblem(0, port, 0)).toBe('seized');
    expect(rollShipmentProblem(0.999, port, 0)).toBeNull();
  });

  it('verspätete Lieferung bleibt unterwegs stehen und kommt später, mit Nachricht', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    order(sim, 'frankfurt', 'weed25');
    const s = clean(lastShipment(sim));
    s.problem = 'delayed';
    s.problemAt = s.orderedAt + 60;
    s.delayMinutes = 100;
    s.arrivesAt += 100;
    sim.advance(60);
    const before = shipmentProgress(sim.state, s);
    sim.advance(50);
    expect(shipmentProgress(sim.state, s)).toBeCloseTo(before);
    expect(eventsOfType(events, 'shipment.problem')[0].payload.kind).toBe('delayed');
    expect(messages.thread(sim.state, 'supplier:frankfurt').at(-1)?.text).toMatch(/später/);
    sim.advance(s.arrivesAt - sim.state.time - 1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
    sim.advance(1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
  });

  it('beschlagnahmte Lieferung ist weg, schlechte Ware kommt mit weniger Qualität', () => {
    const sim = createTestGame();
    order(sim, 'hamburg', 'vape10');
    const seized = clean(lastShipment(sim));
    seized.problem = 'seized';
    seized.problemAt = sim.state.time + 30;
    order(sim, 'hamburg', 'edibles30');
    const bad = clean(lastShipment(sim));
    bad.problem = 'badQuality';
    bad.promisedQuality = bad.quality;
    bad.quality = 0.2;
    sim.advance(30);
    expect(shipmentsInTransit(sim.state).map((s) => s.id)).toEqual([bad.id]);
    sim.advance(bad.arrivesAt - sim.state.time);
    expect(getStock(sim.state, { productId: 'vape' })).toBe(0);
    expect(getLots(sim.state, { productId: 'edibles' })[0].quality).toBe(0.2);
    expect(sim.state.journal.some((j) => j.text.includes('schlechter als versprochen'))).toBe(true);
  });

  it('migriert Version 1 (nur Lieferungen) mit neuen Beziehungen', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.suppliers = { shipments: [] };
    raw.moduleVersions.suppliers = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(getRelation(loaded.state, 'berlin')).toMatchObject({ trust: START_TRUST, debt: 0 });
  });
});

describe('suppliers: Darstellung der Hafenlieferung', () => {
  it('teilt die Lieferung in Schiff, Umladen und Lkw, die Großstädte fahren nur Straße', () => {
    const port = { kind: 'port' as const };
    expect(deliveryLeg(port, 0)).toEqual({ stage: 'ship', t: 0 });
    expect(deliveryLeg(port, 0.39).stage).toBe('ship');
    expect(deliveryLeg(port, 0.39).t).toBeCloseTo(0.5);
    expect(deliveryLeg(port, 0.8).stage).toBe('unloading');
    expect(deliveryLeg(port, 0.9).stage).toBe('road');
    expect(deliveryLeg(port, 1)).toEqual({ stage: 'road', t: 1 });
    expect(deliveryLeg({ kind: 'city' }, 0.3)).toEqual({ stage: 'road', t: 0.3 });
    // Ohne Lücken: Jeder Abschnitt endet, wo der nächste beginnt.
    let last = deliveryLeg(port, 0);
    for (let p = 0.001; p <= 1; p += 0.001) {
      const leg = deliveryLeg(port, p);
      if (leg.stage === last.stage) expect(leg.t).toBeGreaterThanOrEqual(last.t);
      last = leg;
    }
  });

  it('das Schiff fährt von Rotterdam den Rhein hinauf in den Niehler Hafen', () => {
    const rotterdam = getSupplier(createTestGame().state, 'rotterdam');
    const [firstLng, firstLat] = RHINE_ROUTE[0];
    expect(firstLng).toBeCloseTo(rotterdam?.lng ?? 0);
    expect(firstLat).toBeCloseTo(rotterdam?.lat ?? 0);
    expect(RHINE_ROUTE[RHINE_ROUTE.length - 1]).toEqual([UNLOADING_PORT.lng, UNLOADING_PORT.lat]);
    // Von Norden: Die Einfahrt nach Köln liegt nördlich des Hafens.
    expect(RHINE_ROUTE[RHINE_APPROACH_FROM][1]).toBeGreaterThan(UNLOADING_PORT.lat);
    expect(RHINE_APPROACH_FROM).toBeLessThan(RHINE_ROUTE.length - 1);
  });
});
