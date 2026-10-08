// Regressionstests zu Befunden aus dem Bugreview (Lieferanten): Ziel-Lager ohne Wahl, Papiere der Rechten Hand,
// verteilte Sammellieferung, bessere Charge bei Sammellieferungen, Vorstellung bereits freier Lieferanten, Stadt der
// Buchung beim Einkauf.

import { describe, expect, it } from 'vitest';
import { formatEuro, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { unlockCity } from '../city';
import { store, warehouseFree } from '../goods';
import { activeChallenge } from '../minigames';
import {
  defaultWarehouse,
  getSupplier,
  introText,
  isUnlocked,
  type OrderLine,
  orderDestination,
  orderQuote,
  type Shipment,
  shipmentsInTransit,
} from './index';
import { applyArrivalLuck, onPapersFinished } from './troubles';

function rich(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  wallet.earn(sim.ctx('test'), 20_000, 'dirty', 'Test');
  wallet.earn(sim.ctx('test'), 20_000, 'clean', 'Test');
  return sim;
}

/** Ohne Problem und ohne Chance (damit die Ankunft planbar ist). */
function clean(s: Shipment): void {
  if (s.delayMinutes) s.arrivesAt -= s.delayMinutes;
  s.problem = undefined;
  s.delayMinutes = undefined;
  delete s.luck;
}

function group(sim: Simulation, lines: OrderLine[], warehouseId?: string) {
  return sim.dispatch({
    type: 'suppliers.orderBatch',
    payload: { supplierId: 'frankfurt', lines, mode: 'group', ...(warehouseId ? { warehouseId } : {}) },
  });
}

describe('Liefern an zeigt das Lager, in das der Befehl liefert', () => {
  it('ohne Wahl: Ehrenfeld zu voll für das Paket, Anzeige und Lieferung nennen beide die Garage Nippes', () => {
    const sim = rich();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 10 });
    const weight = orderQuote(sim.state, 'frankfurt', [{ packageId: 'weed25', count: 1 }], 'single').weight;
    // Das zeigt die App ohne Wahl (orderTarget nimmt dieselbe Funktion wie der Befehl).
    const shown = defaultWarehouse(sim.state, 'koeln', weight);
    expect(shown).toBe('nippes');
    const r = sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed25' } });
    expect(r.ok).toBe(true);
    expect(shipmentsInTransit(sim.state)[0].warehouseId).toBe(shown);
  });

  it('Sammelbestellung: die Anzeige rechnet mit dem Gewicht der ganzen Auswahl', () => {
    const sim = rich();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    const lines: OrderLine[] = [
      { packageId: 'weed50', count: 1 },
      { packageId: 'haze25', count: 1 },
    ];
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 60 });
    const shown = defaultWarehouse(sim.state, 'koeln', orderQuote(sim.state, 'frankfurt', lines, 'group').weight);
    expect(shown).toBe('nippes');
    expect(group(sim, lines).ok).toBe(true);
    expect(shipmentsInTransit(sim.state)[0].warehouseId).toBe(shown);
  });

  /** Einzeln kaufen, wie die App es tut: mit dem Lager, das orderDestination für genau dieses Paket nennt. */
  function buySingle(sim: Simulation, packageId: string) {
    const target = orderDestination(sim.state, 'frankfurt', [{ packageId, count: 1 }]);
    const r = sim.dispatch({
      type: 'suppliers.order',
      payload: { supplierId: 'frankfurt', packageId, ...(target ? { warehouseId: target } : {}) },
    });
    return { target, ok: r.ok };
  }

  it('Einzeln ohne Wahl: Ehrenfeld voll, Nippes frei, die App schickt Nippes mit und die Bestellung klappt', () => {
    const sim = rich();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 10 });
    // Ausdrücklich ins volle Standardlager scheitert die Bestellung: Das darf die App ohne Wahl nicht mitschicken.
    expect(
      sim.dispatch({
        type: 'suppliers.order',
        payload: { supplierId: 'frankfurt', packageId: 'weed25', warehouseId: 'ehrenfeld' },
      }).ok,
    ).toBe(false);
    expect(buySingle(sim, 'weed25')).toEqual({ target: 'nippes', ok: true });
    expect(shipmentsInTransit(sim.state)[0].warehouseId).toBe('nippes');
  });

  it('Einzeln ohne Wahl: jedes Paket rechnet mit seinem Gewicht, das leichte bleibt im Standardlager', () => {
    const sim = rich();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 30 });
    expect(buySingle(sim, 'weed50')).toEqual({ target: 'nippes', ok: true });
    expect(buySingle(sim, 'weed25')).toEqual({ target: 'ehrenfeld', ok: true });
    expect(shipmentsInTransit(sim.state).map((s) => s.warehouseId)).toEqual(['nippes', 'ehrenfeld']);
  });

  it('gewähltes Lager bleibt gewählt, mit nur einem Lager schickt die App keins mit', () => {
    const sim = rich();
    const line: OrderLine[] = [{ packageId: 'weed25', count: 1 }];
    expect(orderDestination(sim.state, 'frankfurt', line)).toBeUndefined();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    expect(orderDestination(sim.state, 'frankfurt', line, 'nippes')).toBe('nippes');
    expect(orderDestination(sim.state, 'frankfurt', line, 'gibtsnicht')).toBe('ehrenfeld');
  });
});

describe('Papiere der Rechten Hand', () => {
  function threatened(): { sim: Simulation; s: Shipment } {
    const sim = rich();
    expect(
      group(sim, [
        { packageId: 'weed50', count: 1 },
        { packageId: 'haze25', count: 1 },
      ]).ok,
    ).toBe(true);
    const s = shipmentsInTransit(sim.state)[0];
    clean(s);
    s.problem = 'seized';
    s.problemAt = sim.state.time + 30;
    sim.advance(31);
    expect(s.decision?.choices).toContain('papers');
    expect(sim.dispatch({ type: 'suppliers.resolveProblem', payload: { shipmentId: s.id, choice: 'papers' } }).ok).toBe(
      true,
    );
    return { sim, s };
  }

  it('geschafft von der Rechten Hand: das Journal nennt sie, nicht dich', () => {
    const { sim, s } = threatened();
    const c = activeChallenge(sim.state);
    expect(c).toBeTruthy();
    onPapersFinished(sim.ctx('test'), {
      id: c?.id ?? 0,
      origin: c?.origin ?? { module: 'suppliers', ref: '' },
      won: true,
      picks: [],
      by: 'rightHand',
    });
    expect(s.problem).toBeUndefined();
    expect(sim.state.journal.some((j) => j.text.includes('Papiere von deiner Rechten Hand'))).toBe(true);
    expect(sim.state.journal.some((j) => j.text.includes('Papiere selbst gemacht'))).toBe(false);
  });

  it('selbst geschafft: wie bisher „Papiere selbst gemacht“', () => {
    const { sim } = threatened();
    const c = activeChallenge(sim.state);
    sim.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.9, picks: [] } });
    expect(sim.state.journal.some((j) => j.text.includes('Papiere selbst gemacht'))).toBe(true);
  });
});

describe('Sammellieferung auf zwei Lager verteilt', () => {
  it('passt das zweite Paket nicht mehr, nennt das Journal beide Lager und „verteilt“', () => {
    const sim = rich();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    expect(
      group(
        sim,
        [
          { packageId: 'weed50', count: 1 },
          { packageId: 'haze25', count: 1 },
        ],
        'ehrenfeld',
      ).ok,
    ).toBe(true);
    const s = shipmentsInTransit(sim.state)[0];
    clean(s);
    // Nach der Bestellung wird Ehrenfeld voller (z.B. Umlagern): Platz nur noch für die 50 g Gras.
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 50 });
    sim.advance(s.arrivesAt - sim.state.time + 1);
    const entry = sim.state.journal.find((j) => j.text.startsWith('Sammellieferung angekommen'));
    expect(entry?.text).toContain('verteilt');
    expect(entry?.text).toContain('Lager Ehrenfeld');
    expect(entry?.text).toContain('Garage Nippes');
  });
});

describe('bessere Charge bei Sammellieferungen', () => {
  it('der Glückswurf hebt die Qualität aller Pakete, nicht nur des ersten', () => {
    const sim = rich();
    expect(
      group(sim, [
        { packageId: 'weed50', count: 1 },
        { packageId: 'haze25', count: 1 },
        { packageId: 'oil20', count: 1 },
      ]).ok,
    ).toBe(true);
    const s = shipmentsInTransit(sim.state)[0];
    clean(s);
    s.luck = 'betterQuality';
    const before = [s.quality, ...(s.extra ?? []).map((x) => x.quality)];
    expect(before).toHaveLength(3);
    const supplier = getSupplier(sim.state, 'frankfurt');
    if (!supplier) throw new Error('Toni fehlt');
    applyArrivalLuck(sim.ctx('test'), s, supplier);
    const after = [s.quality, ...(s.extra ?? []).map((x) => x.quality)];
    for (let i = 0; i < before.length; i++) {
      expect(after[i], `Paket ${i}`).toBeGreaterThan(before[i]);
    }
  });
});

describe('Vorstellung ohne Vermittlung, wenn der Lieferant schon frei ist', () => {
  it('Hein nennt die Gebühr nur, solange er gesperrt ist', () => {
    const sim = rich();
    const hein = getSupplier(sim.state, 'hamburg');
    if (!hein?.unlock) throw new Error('Hein fehlt');
    const fee = formatEuro(hein.unlock.fee);
    expect(introText(hein)).toContain(fee);
    // Hamburg wird frei, bevor Hein sich vorgestellt hat: Er liefert schon, ohne Vermittlung.
    unlockCity(sim.ctx('test'), 'hamburg');
    sim.step();
    expect(isUnlocked(sim.state, 'hamburg')).toBe(true);
    const text = introText(hein, isUnlocked(sim.state, 'hamburg'));
    expect(text).not.toContain(fee);
    expect(text).not.toMatch(/Vermittlung/);
    expect(text).toMatch(/\S/);
  });
});

describe('Einkauf für ein Lager in einer anderen Stadt wird dort gebucht', () => {
  it('Lager-Kauf, Einzel- und Sammelbestellung tragen die Stadt des Lagers', () => {
    const sim = rich();
    unlockCity(sim.ctx('test'), 'hamburg');
    sim.step();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'keller-st-georg' } }).ok).toBe(true);
    expect(
      sim.dispatch({
        type: 'suppliers.order',
        payload: { supplierId: 'frankfurt', packageId: 'weed25', warehouseId: 'keller-st-georg' },
      }).ok,
    ).toBe(true);
    expect(
      group(
        sim,
        [
          { packageId: 'weed50', count: 1 },
          { packageId: 'haze25', count: 1 },
        ],
        'keller-st-georg',
      ).ok,
    ).toBe(true);
    const bookings = eventsOfType(events, 'wallet.changed').map((e) => e.payload);
    const bought = bookings.filter((b) => b.category === 'expansion');
    const purchases = bookings.filter((b) => b.category === 'goods.purchase');
    expect(bought).toHaveLength(1);
    expect(purchases).toHaveLength(2);
    for (const b of [...bought, ...purchases]) expect(b.cityId).toBe('hamburg');
  });
});
