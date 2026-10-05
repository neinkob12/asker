import { describe, expect, it } from 'vitest';
import { loadSimulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { allProducts, getProduct } from '../goods';
import { packagePrice } from '../suppliers';
import { getVeedel } from '../veedel';
import { INDEX_MAX, INDEX_MIN, PURCHASE_INDEX_SHARE, SATURATION_EUR, SUPPLY_DEMAND_RANGE } from './config';
import {
  averageReferencePrice,
  getCompetitionFactor,
  getPressure,
  getSpotPrice,
  hasOwnPrice,
  indexTrend,
  priceIndex,
  priceRatio,
  purchaseIndex,
  purchasingPowerFactor,
  referencePrice,
  roundPrice,
  setCompetitionFactor,
  spotReferencePrice,
  supplyDemandFactor,
} from './index';

const sale = (veedelId: string, productId: string, amount: number) => ({
  channel: 'street' as const,
  spotId: null,
  veedelId,
  productId,
  amount,
  quality: 0.6,
  revenue: 0,
  sellerId: null,
  customerId: null,
});

describe('market: Richtpreis', () => {
  it('Richtpreis = Grundpreis × Kaufkraft × Angebot/Nachfrage × Konkurrenzfaktor', () => {
    const sim = createTestGame();
    const base = getProduct('weed')?.basePrice ?? 0;
    const kalk = base * purchasingPowerFactor('kalk');
    expect(referencePrice(sim.state, 'weed', 'kalk')).toBeCloseTo(kalk);
    setCompetitionFactor(sim.ctx('gangs'), 'kalk', 0.8);
    expect(referencePrice(sim.state, 'weed', 'kalk')).toBeCloseTo(kalk * 0.8);
    expect(referencePrice(sim.state, 'weed', 'deutz')).toBeCloseTo(base * purchasingPowerFactor('deutz'));
    expect(referencePrice(sim.state, 'gibtsnicht', 'deutz')).toBe(0);
    expect(averageReferencePrice(sim.state, 'weed')).toBeGreaterThan(0);
  });

  it('die Kaufkraft des Veedels wirkt über die veedel-API', () => {
    const power = getVeedel('kalk')?.purchasingPower ?? 1;
    expect(purchasingPowerFactor('kalk')).toBeCloseTo(1 + (power - 1) * 0.8);
    expect(purchasingPowerFactor('gibtsnicht')).toBe(1);
  });

  it('der Konkurrenzfaktor ist begrenzt und wird gemeldet', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    setCompetitionFactor(sim.ctx('gangs'), 'kalk', 0.01);
    sim.step();
    expect(getCompetitionFactor(sim.state, 'kalk')).toBe(0.5);
    expect(eventsOfType(events, 'market.competitionChanged')[0].payload).toEqual({ veedelId: 'kalk', factor: 0.5 });
  });

  it('viele Verkäufe drücken den Preis, Nachfrage ohne Ware treibt ihn, beides gleicht sich wieder aus', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('customers');
    ctx.emit('sale.completed', sale('kalk', 'weed', 300));
    ctx.emit('customer.missed', { spotId: 'x', veedelId: 'nippes', productId: 'kush', amount: 50, typeId: 'banker' });
    const before = referencePrice(sim.state, 'weed', 'kalk');
    const kush = referencePrice(sim.state, 'kush', 'nippes');
    const deutz = referencePrice(sim.state, 'weed', 'deutz');
    sim.step();
    expect(getPressure(sim.state, 'weed', 'kalk')).toBeCloseTo(
      (-300 * (getProduct('weed')?.basePrice ?? 0)) / SATURATION_EUR,
    );
    expect(referencePrice(sim.state, 'weed', 'kalk')).toBeLessThan(before);
    expect(referencePrice(sim.state, 'kush', 'nippes')).toBeGreaterThan(kush);
    expect(supplyDemandFactor(sim.state, 'weed', 'kalk')).toBeGreaterThanOrEqual(1 - SUPPLY_DEMAND_RANGE);
    // In anderen Veedeln ändert sich nichts.
    expect(referencePrice(sim.state, 'weed', 'deutz')).toBe(deutz);
    sim.advance(4 * 24 * 60);
    expect(getPressure(sim.state, 'weed', 'kalk')).toBe(0);
    // Der Preisindex ist in vier Tagen gewandert (Auftrag 32), der Rest ist wieder wie vorher.
    expect(referencePrice(sim.state, 'weed', 'kalk') / priceIndex(sim.state, 'weed', 'koeln')).toBeCloseTo(before);
  });

  it('Kunden, die ohne Ware gehen, zählen als Nachfrage', () => {
    const sim = createTestGame();
    sim.ctx('customers').emit('customer.left', {
      customerId: 1,
      spotId: 'uni',
      productId: 'weed',
      amount: 5,
      veedelId: 'lindenthal',
    });
    sim.step();
    expect(getPressure(sim.state, 'weed', 'lindenthal')).toBeGreaterThan(0);
  });
});

describe('market: eigene Preise', () => {
  it('ohne eigenen Preis gilt der gerundete Richtpreis am Spot', () => {
    const sim = createTestGame();
    expect(hasOwnPrice(sim.state, 'friesenplatz', 'weed')).toBe(false);
    const reference = referencePrice(sim.state, 'weed', 'neustadt-nord') * 1.2;
    expect(spotReferencePrice(sim.state, 'friesenplatz', 'weed')).toBeCloseTo(reference);
    expect(getSpotPrice(sim.state, 'friesenplatz', 'weed')).toBe(roundPrice(reference));
    // Gerundet auf 50 Cent: höchstens ein paar Prozent daneben.
    expect(priceRatio(sim.state, 'friesenplatz', 'weed')).toBeCloseTo(1, 1);
    expect(roundPrice(9.3)).toBe(9.5);
    expect(roundPrice(0.1)).toBe(0.5);
  });

  it('eigenen Preis pro Spot und Produkt setzen und zurücksetzen', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    expect(
      sim.dispatch({ type: 'market.setPrice', payload: { spotId: 'uni', productId: 'haze', price: 16.2 } }),
    ).toEqual({
      ok: true,
      data: { price: 16 },
    });
    expect(getSpotPrice(sim.state, 'uni', 'haze')).toBe(16);
    expect(getSpotPrice(sim.state, 'neumarkt', 'haze')).toBe(
      roundPrice(spotReferencePrice(sim.state, 'neumarkt', 'haze')),
    );
    expect(priceRatio(sim.state, 'uni', 'haze')).toBeCloseTo(16 / spotReferencePrice(sim.state, 'uni', 'haze'));
    expect(
      sim.dispatch({ type: 'market.setPrice', payload: { spotId: 'uni', productId: 'haze', price: null } }).ok,
    ).toBe(true);
    expect(hasOwnPrice(sim.state, 'uni', 'haze')).toBe(false);
    expect(sim.state.modules.market.prices).toEqual({});
    expect(eventsOfType(events, 'market.priceSet').map((e) => e.payload.price)).toEqual([16, null]);
  });

  it('unsinnige Preise werden abgelehnt', () => {
    const sim = createTestGame();
    const set = (price: number, spotId = 'uni', productId = 'weed') =>
      sim.dispatch({ type: 'market.setPrice', payload: { spotId, productId, price } }).ok;
    expect(set(0)).toBe(false);
    expect(set(-3)).toBe(false);
    expect(set(1000)).toBe(false);
    expect(set(10, 'gibtsnicht')).toBe(false);
    expect(set(10, 'uni', 'gibtsnicht')).toBe(false);
  });

  it('migriert Version 1 (nur Konkurrenz)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.market = { competition: { kalk: 0.8 } };
    raw.moduleVersions.market = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.market).toEqual({
      competition: { kalk: 0.8 },
      pressure: {},
      prices: {},
      index: {},
    });
  });

  it('migriert Version 2 (ohne Preisindex)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.market = { competition: {}, pressure: { kalk: { weed: 0.2 } }, prices: { uni: { weed: 12 } } };
    raw.moduleVersions.market = 2;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.market.index).toEqual({});
    expect(loaded.state.modules.market.prices).toEqual({ uni: { weed: 12 } });
    expect(priceIndex(loaded.state, 'weed', 'koeln')).toBe(1);
  });
});

describe('market: Preisindex (Auftrag 32)', () => {
  it('startet bei 1 und macht um Mitternacht einen Schritt, in allen freien Städten', () => {
    const sim = createTestGame();
    // Nicht freie Städte würfeln nicht mit (Auftrag 39), Hamburg ist für den Test frei.
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(priceIndex(sim.state, 'weed', 'koeln')).toBe(1);
    expect(indexTrend(sim.state, 'weed')).toBeNull();
    // Start 18 Uhr: sechs Stunden bis Mitternacht.
    sim.advance(5 * 60);
    expect(sim.state.modules.market.index).toEqual({});
    sim.advance(60);
    const koeln = sim.state.modules.market.index.koeln;
    const hamburg = sim.state.modules.market.index.hamburg;
    expect(Object.keys(koeln)).toHaveLength(allProducts().length);
    expect(Object.keys(hamburg)).toHaveLength(allProducts().length);
    expect(Object.values(koeln).some((v) => v !== 1)).toBe(true);
    expect(sim.state.modules.market.index.frankfurt).toBeUndefined();
  });

  it('bleibt über 60 Tage zwischen INDEX_MIN und INDEX_MAX und kehrt zur Mitte zurück', () => {
    const sim = createTestGame({ seed: 7 });
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    const seen: number[] = [];
    for (let day = 0; day < 60; day++) {
      sim.advance(24 * 60);
      for (const city of ['koeln', 'hamburg']) {
        for (const p of allProducts()) seen.push(priceIndex(sim.state, p.id, city));
      }
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(INDEX_MIN);
    expect(Math.max(...seen)).toBeLessThanOrEqual(INDEX_MAX);
    // Mild: im Schnitt nah an 1, aber sichtbar in Bewegung.
    const mean = seen.reduce((a, b) => a + b, 0) / seen.length;
    expect(Math.abs(mean - 1)).toBeLessThan(0.04);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.08);
  });

  it('gleicher Seed, gleicher Pfad', () => {
    const run = () => {
      const sim = createTestGame({ seed: 3 });
      sim.advance(10 * 24 * 60);
      return sim.state.modules.market.index;
    };
    expect(run()).toEqual(run());
  });

  it('Richtpreis folgt dem Index, der Einkauf mit halben Ausschlägen', () => {
    const sim = createTestGame();
    const reference = referencePrice(sim.state, 'weed', 'kalk');
    const pkg = packagePrice(sim.state, 'frankfurt', 'weed50');
    sim.state.modules.market.index = { koeln: { weed: 1.1 } };
    expect(referencePrice(sim.state, 'weed', 'kalk')).toBeCloseTo(reference * 1.1);
    expect(purchaseIndex(sim.state, 'weed', 'koeln')).toBeCloseTo(1 + 0.1 * PURCHASE_INDEX_SHARE);
    expect(packagePrice(sim.state, 'frankfurt', 'weed50')).toBe(Math.round(pkg * (1 + 0.1 * PURCHASE_INDEX_SHARE)));
    // Andere Produkte und Städte bleiben.
    expect(priceIndex(sim.state, 'haze', 'koeln')).toBe(1);
    expect(priceIndex(sim.state, 'weed', 'hamburg')).toBe(1);
    expect(indexTrend(sim.state, 'weed', 'koeln')).toMatchObject({ up: true, label: 'Gras ↑ 10 %' });
    sim.state.modules.market.index = { koeln: { weed: 0.97 } };
    expect(indexTrend(sim.state, 'weed', 'koeln')).toBeNull();
  });
});
