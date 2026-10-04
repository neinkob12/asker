// Marktereignisse (Auftrag 32): ohne Gebiet, mit Ware und Faktor auf den Preisindex.

import { describe, expect, it } from 'vitest';
import { loadSimulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { priceIndex } from '../market';
import { MARKET_EVENTS, MAX_MARKET_EVENTS } from './config';
import { marketEventFactor, marketEvents, marketEventText } from './index';

const DAY = 1440;

describe('events: Marktereignisse', () => {
  it('kommen ab und zu, höchstens zwei pro Stadt, halb rauf und halb runter, und enden wieder', () => {
    let up = 0;
    let down = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = createTestGame({ seed });
      const events = recordEvents(sim);
      for (let d = 0; d < 60; d++) {
        sim.advance(DAY);
        expect(marketEvents(sim.state, 'koeln').length).toBeLessThanOrEqual(MAX_MARKET_EVENTS);
        const products = marketEvents(sim.state, 'koeln').map((r) => r.productId);
        expect(new Set(products).size).toBe(products.length);
      }
      const started = eventsOfType(events, 'events.marketStarted');
      expect(started.length).toBeGreaterThan(3);
      for (const e of started) {
        if (e.payload.factor > 1) up++;
        else down++;
        const days = (e.payload.endsAt - e.time) / DAY;
        expect(days).toBeGreaterThanOrEqual(1.9);
        expect(days).toBeLessThanOrEqual(5.1);
      }
      expect(eventsOfType(events, 'events.marketEnded').length).toBeGreaterThan(0);
    }
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
    expect(Math.abs(up - down) / (up + down)).toBeLessThan(0.4);
  }, 30_000);

  it('schieben den Index der Ware in ihrer Stadt, innerhalb der Grenzen', () => {
    const sim = createTestGame();
    sim.state.modules.events.market.push({
      id: 999,
      eventId: 'customsSeizure',
      cityId: 'koeln',
      productId: 'weed',
      factor: 1.12,
      startedAt: 0,
      endsAt: sim.state.time + 2 * DAY,
    });
    expect(marketEventFactor(sim.state, 'weed', 'koeln')).toBe(1.12);
    expect(marketEventFactor(sim.state, 'weed', 'hamburg')).toBe(1);
    expect(priceIndex(sim.state, 'weed', 'koeln')).toBeCloseTo(1.12);
    expect(priceIndex(sim.state, 'hash', 'koeln')).toBe(1);
    sim.state.modules.market.index = { koeln: { weed: 1.15 } };
    expect(priceIndex(sim.state, 'weed', 'koeln')).toBe(1.2);
    expect(marketEventText({ eventId: 'customsSeizure', productId: 'weed' })).toContain('Gras');
  });

  it('jede Vorlage hat Waren und einen Satz mit Platzhalter', () => {
    expect(MARKET_EVENTS.filter((e) => e.factor > 1).length).toBe(MARKET_EVENTS.filter((e) => e.factor < 1).length);
    for (const def of MARKET_EVENTS) {
      expect(def.products.length).toBeGreaterThan(0);
      expect(def.text).toContain('{product}');
    }
  });

  it('migriert Version 1 (ohne Marktereignisse)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.events = { running: ['dom'], announced: {} };
    raw.moduleVersions.events = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.events).toEqual({ running: ['dom'], announced: {}, market: [] });
  });

  it('gleicher Seed, gleiche Ereignisse', () => {
    const run = () => {
      const sim = createTestGame({ seed: 5 });
      const events = recordEvents(sim);
      sim.advance(20 * DAY);
      return eventsOfType(events, 'events.marketStarted').map((e) => e.payload);
    };
    expect(run()).toEqual(run());
  });
});
