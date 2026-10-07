// Sammel- und Einzelbestellung (Feedback vom 07.10.2026): Rabatt und Risiko, eine Lieferung mit mehreren Paketen,
// Ankunft aller Waren, Beschlagnahme von allem auf einmal, Papiere selbst fälschen (Minispiel).

import { describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock } from '../goods';
import { activeChallenge, resolveMinigameNow } from '../minigames';
import { GROUP_ORDER } from './config';
import {
  forceShipmentProblem,
  groupDiscount,
  groupRiskFactor,
  type OrderLine,
  orderQuote,
  packagePrice,
  type Shipment,
  seizeChance,
  shipmentGoods,
  shipmentItems,
  shipmentsInTransit,
  supplierById,
} from './index';

/** Bei Toni: 2× 50 g Gras, 25 g Haze, 20 ml Öl. */
const LINES: OrderLine[] = [
  { packageId: 'weed50', count: 2 },
  { packageId: 'haze25', count: 1 },
  { packageId: 'oil20', count: 1 },
];

function rich(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  wallet.earn(sim.ctx('test'), 10_000, 'dirty', 'Test');
  return sim;
}

function batch(sim: Simulation, mode: 'group' | 'single', lines: OrderLine[] = LINES) {
  return sim.dispatch({ type: 'suppliers.orderBatch', payload: { supplierId: 'frankfurt', lines, mode } });
}

/** Ohne Problem und ohne Chance (damit die Ankunft planbar ist). */
function clean(s: Shipment): void {
  if (s.delayMinutes) s.arrivesAt -= s.delayMinutes;
  s.problem = undefined;
  s.delayMinutes = undefined;
  delete s.luck;
}

describe('Sammel- und Einzelbestellung', () => {
  it('Rabatt und Aufschlag auf die Beschlagnahme wachsen mit den Paketen, beide gedeckelt', () => {
    expect(groupDiscount(1)).toBe(0);
    expect(groupRiskFactor(1)).toBe(1);
    expect(groupDiscount(2)).toBeCloseTo(GROUP_ORDER.discountPerPackage);
    expect(groupDiscount(3)).toBeGreaterThan(groupDiscount(2));
    expect(groupRiskFactor(3)).toBeGreaterThan(groupRiskFactor(2));
    expect(groupDiscount(50)).toBe(GROUP_ORDER.maxDiscount);
    expect(groupRiskFactor(50)).toBe(GROUP_ORDER.maxRisk);
  });

  it('gesammelt ist billiger, aber riskanter als einzeln', () => {
    const sim = rich();
    const group = orderQuote(sim.state, 'frankfurt', LINES, 'group');
    const single = orderQuote(sim.state, 'frankfurt', LINES, 'single');
    const list =
      2 * packagePrice(sim.state, 'frankfurt', 'weed50') +
      packagePrice(sim.state, 'frankfurt', 'haze25') +
      packagePrice(sim.state, 'frankfurt', 'oil20');
    expect(single.price).toBe(list);
    expect(group.listPrice).toBe(list);
    expect(group.price).toBeLessThan(single.price);
    expect(group.discount).toBeCloseTo(groupDiscount(4));
    expect(group.shipments).toBe(1);
    expect(single.shipments).toBe(4);
    const toni = supplierById('frankfurt');
    if (!toni) throw new Error('Toni fehlt');
    expect(single.seize).toBeCloseTo(seizeChance(toni, 10));
    expect(group.seize).toBeCloseTo(single.seize * groupRiskFactor(4));
  });

  it('Sammelbestellung: eine Lieferung mit allen Paketen, ein Ereignis, Preis wie angezeigt', () => {
    const sim = rich();
    const events = recordEvents(sim);
    const quote = orderQuote(sim.state, 'frankfurt', LINES, 'group');
    const money = sim.state.wallet.dirty;
    const r = batch(sim, 'group');
    expect(r.ok).toBe(true);
    const shipments = shipmentsInTransit(sim.state);
    expect(shipments).toHaveLength(1);
    const s = shipments[0];
    expect(shipmentItems(s).map((x) => [x.productId, x.amount])).toEqual([
      ['weed', 100],
      ['haze', 25],
      ['oil', 20],
    ]);
    expect(s.price).toBe(quote.price);
    expect(shipmentItems(s).reduce((sum, x) => sum + x.price, 0)).toBe(s.price);
    expect(sim.state.wallet.dirty).toBe(money - quote.price);
    expect(shipmentGoods(s)).toBe('100 g Gras, 25 g Amnesia Haze und 20 ml Öl');
    const ordered = eventsOfType(events, 'shipment.ordered');
    expect(ordered).toHaveLength(1);
    expect(ordered[0].payload).toMatchObject({ amount: 145, price: quote.price, items: expect.any(Array) });
  });

  it('Einzelbestellung: jedes Paket als eigene Lieferung zum normalen Preis', () => {
    const sim = rich();
    const events = recordEvents(sim);
    const quote = orderQuote(sim.state, 'frankfurt', LINES, 'single');
    const money = sim.state.wallet.dirty;
    const r = batch(sim, 'single');
    expect(r.ok).toBe(true);
    const shipments = shipmentsInTransit(sim.state);
    expect(shipments).toHaveLength(4);
    expect(shipments.every((s) => !s.extra)).toBe(true);
    // Mit jedem Kauf wächst das Vertrauen, der Preis kann dabei nur sinken.
    expect(money - sim.state.wallet.dirty).toBeLessThanOrEqual(quote.price);
    expect(eventsOfType(events, 'shipment.ordered')).toHaveLength(4);
  });

  it('die Sammellieferung bringt alle Waren ins Lager', () => {
    const sim = rich();
    const before = { weed: getStock(sim.state, { productId: 'weed' }), oil: getStock(sim.state, { productId: 'oil' }) };
    expect(batch(sim, 'group').ok).toBe(true);
    const s = shipmentsInTransit(sim.state)[0];
    clean(s);
    const events = recordEvents(sim);
    sim.advance(s.arrivesAt - sim.state.time + 1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(getStock(sim.state, { productId: 'weed' })).toBe(before.weed + 100);
    expect(getStock(sim.state, { productId: 'haze' })).toBeGreaterThanOrEqual(25);
    expect(getStock(sim.state, { productId: 'oil' })).toBe(before.oil + 20);
    const arrived = eventsOfType(events, 'shipment.arrived');
    expect(arrived).toHaveLength(1);
    expect(arrived[0].payload.items).toHaveLength(3);
    expect(sim.state.journal.some((j) => j.text.startsWith('Sammellieferung angekommen'))).toBe(true);
  });

  it('fliegt die Sammellieferung auf, ist alles auf einmal weg', () => {
    const sim = rich();
    expect(batch(sim, 'group').ok).toBe(true);
    const s = shipmentsInTransit(sim.state)[0];
    const weed = getStock(sim.state, { productId: 'weed' });
    expect(forceShipmentProblem(sim.ctx('suppliers'), s.id, 'seized', false)).toBe(true);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    sim.advance(400);
    expect(getStock(sim.state, { productId: 'weed' })).toBeLessThanOrEqual(weed);
    expect(sim.state.journal.some((j) => j.text.includes('100 g Gras, 25 g Amnesia Haze und 20 ml Öl'))).toBe(true);
  });

  it('erst alles prüfen: zu viele Pakete, Container oder zu wenig Geld ändern nichts', () => {
    const sim = createTestGame({ seed: 1 });
    const money = sim.state.wallet.dirty;
    const tooMany = [{ packageId: 'weed25', count: GROUP_ORDER.maxPackages + 1 }];
    expect(batch(sim, 'group', tooMany).ok).toBe(false);
    expect(batch(sim, 'group', []).ok).toBe(false);
    sim.state.wallet.dirty = 50;
    expect(batch(sim, 'group').ok).toBe(false);
    expect(batch(sim, 'single').ok).toBe(false);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(sim.state.wallet.dirty).toBe(50);
    sim.state.wallet.dirty = money;
  });
});

describe('Papiere für den Zoll (Minispiel statt Schmieren)', () => {
  /** Sammellieferung mit drohender Beschlagnahme und Rückfrage (die kommt bei einer Sammellieferung immer). */
  function threatened(): { sim: Simulation; s: Shipment } {
    const sim = rich();
    expect(batch(sim, 'group').ok).toBe(true);
    const s = shipmentsInTransit(sim.state)[0];
    clean(s);
    s.problem = 'seized';
    s.problemAt = sim.state.time + 30;
    sim.advance(31);
    expect(s.decision?.choices).toEqual(['bribe', 'papers', 'wait']);
    return { sim, s };
  }

  function papers(sim: Simulation, s: Shipment) {
    return sim.dispatch({ type: 'suppliers.resolveProblem', payload: { shipmentId: s.id, choice: 'papers' } });
  }

  it('Papiere fälschen startet das Minispiel, geschafft kommt alles an', () => {
    const { sim, s } = threatened();
    expect(papers(sim, s).ok).toBe(true);
    const c = activeChallenge(sim.state);
    expect(c).toMatchObject({ kind: 'papers', origin: { module: 'suppliers', ref: `shipment:${s.id}` } });
    expect(s.decision).toBeUndefined();
    expect(s.papers?.challengeId).toBe(c?.id);
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.9, picks: [] } }).ok).toBe(
      true,
    );
    expect(s.problem).toBeUndefined();
    expect(s.papers).toBeUndefined();
    sim.advance(s.arrivesAt - sim.state.time + 1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(getStock(sim.state, { productId: 'oil' })).toBeGreaterThanOrEqual(20);
  });

  it('aufgeflogen oder ohne Oberfläche abgelaufen: alles beschlagnahmt', () => {
    const lost = threatened();
    expect(papers(lost.sim, lost.s).ok).toBe(true);
    const c = activeChallenge(lost.sim.state);
    lost.sim.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.1, picks: [] } });
    expect(shipmentsInTransit(lost.sim.state)).toHaveLength(0);

    const timeout = threatened();
    expect(papers(timeout.sim, timeout.s).ok).toBe(true);
    const open = activeChallenge(timeout.sim.state);
    // Die Lieferung kommt nicht an, bevor das Spiel entschieden ist.
    expect(timeout.s.arrivesAt).toBeGreaterThan(open?.deadline ?? 0);
    resolveMinigameNow(timeout.sim.ctx('test'), open?.id ?? 0);
    timeout.sim.step();
    expect(shipmentsInTransit(timeout.sim.state)).toHaveLength(0);
  });

  it('ein Umschlag zu den Papieren kostet das Schmiergeld und bringt die Lieferung durch', () => {
    const { sim, s } = threatened();
    const cost = s.decision?.cost ?? 0;
    expect(papers(sim, s).ok).toBe(true);
    const money = sim.state.wallet.dirty;
    const c = activeChallenge(sim.state);
    sim.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.2, picks: ['bribe'] } });
    expect(sim.state.wallet.dirty).toBe(money - cost);
    expect(s.problem).toBeUndefined();
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
  });
});
