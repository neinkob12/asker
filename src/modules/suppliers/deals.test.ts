// Rabatt-Aktionen der Lieferanten (Auftrag 32).

import { describe, expect, it } from 'vitest';
import { loadSimulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeDeal, getDeals, packagePrice, supplierContactId } from './index';

const DAY = 1440;

describe('suppliers: Rabatt-Aktionen', () => {
  it('kommen etwa einmal pro Woche und Stadt, still per Handy, und machen das Paket billiger', () => {
    const sim = createTestGame({ seed: 2 });
    const events = recordEvents(sim);
    let seen = 0;
    for (let d = 0; d < 42; d++) {
      sim.advance(DAY);
      const deals = getDeals(sim.state, 'koeln');
      expect(deals.length).toBeLessThanOrEqual(1);
      if (deals.length > 0) seen++;
    }
    const started = eventsOfType(events, 'supplier.dealStarted').filter((e) => e.payload.cityId === 'koeln');
    expect(started.length).toBeGreaterThanOrEqual(3);
    expect(started.length).toBeLessThanOrEqual(9);
    expect(seen).toBeGreaterThan(10);
    for (const e of started) {
      expect(e.payload.discount).toBeGreaterThanOrEqual(0.1);
      expect(e.payload.discount).toBeLessThanOrEqual(0.25);
      const days = (e.payload.endsAt - e.time) / DAY;
      expect(days).toBeGreaterThanOrEqual(3);
      expect(days).toBeLessThanOrEqual(5);
      const msg = sim.state.messages.list.find(
        (m) => m.contactId === supplierContactId(e.payload.supplierId) && m.time === e.time,
      );
      expect(msg?.text).toContain(`${Math.round(e.payload.discount * 100)} %`);
    }
    // Mehrere Wochen Spielzeit: unter Last knapp über den 5 Sekunden Standard.
  }, 30_000);

  it('der Rabatt gilt nur für das Paket, die Stadt und die Laufzeit', () => {
    const sim = createTestGame();
    const before = packagePrice(sim.state, 'frankfurt', 'weed50');
    sim.state.modules.suppliers.deals.push({
      id: 1,
      supplierId: 'frankfurt',
      packageId: 'weed50',
      cityId: 'koeln',
      discount: 0.2,
      startedAt: sim.state.time,
      endsAt: sim.state.time + DAY,
    });
    expect(activeDeal(sim.state, 'frankfurt', 'weed50')).toBeDefined();
    expect(packagePrice(sim.state, 'frankfurt', 'weed50')).toBe(Math.round(before * 0.8));
    expect(packagePrice(sim.state, 'frankfurt', 'weed25')).toBe(
      packagePrice(createTestGame().state, 'frankfurt', 'weed25'),
    );
    expect(activeDeal(sim.state, 'frankfurt', 'weed50', 'hamburg')).toBeUndefined();
    const ordered = sim.dispatch({
      type: 'suppliers.order',
      payload: { supplierId: 'frankfurt', packageId: 'weed50' },
    });
    expect(ordered.ok).toBe(true);
    expect(sim.state.modules.suppliers.shipments.at(-1)?.price).toBe(Math.round(before * 0.8));
    sim.state.time += DAY;
    expect(activeDeal(sim.state, 'frankfurt', 'weed50')).toBeUndefined();
  });

  it('migriert Version 4 (ohne Aktionen)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, Record<string, unknown>>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.suppliers.deals;
    raw.moduleVersions.suppliers = 4;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.suppliers.deals).toEqual([]);
  });
});
