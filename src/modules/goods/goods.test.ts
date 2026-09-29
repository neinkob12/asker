import { describe, expect, it } from 'vitest';
import { loadSimulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { nearestRoadPoint } from '../roads';
import { veedelAt } from '../veedel';
import { CUT_AGENT_COST, CUT_QUALITY_LOSS, START_QUALITY, START_STOCK } from './config';
import {
  allProducts,
  averageQuality,
  getLots,
  getProduct,
  getStock,
  getWarehouse,
  getWarehouses,
  nearestWarehouse,
  qualityTier,
  STANDARD_QUALITY,
  stockSummary,
  store,
  take,
  warehouseSite,
  warehouseSites,
} from './index';

describe('goods', () => {
  it('startet mit dem Startbestand im Standardlager', () => {
    const sim = createTestGame();
    expect(getStock(sim.state)).toBe(START_STOCK);
    expect(getStock(sim.state, { productId: 'weed', warehouseId: 'ehrenfeld' })).toBe(START_STOCK);
    expect(getWarehouses(sim.state)).toHaveLength(1);
    expect(averageQuality(sim.state)).toBe(START_QUALITY);
  });

  it('hat Weed-Sorten, Hasch, Edibles, Öl und Vapes mit Preis, Einheit und Zielgruppen', () => {
    const categories = new Set(allProducts().map((p) => p.category));
    expect([...categories].sort()).toEqual(['edible', 'flower', 'hash', 'oil', 'vape']);
    expect(allProducts().filter((p) => p.category === 'flower').length).toBeGreaterThanOrEqual(3);
    for (const p of allProducts()) {
      expect(p.basePrice).toBeGreaterThan(0);
      expect(p.unit).not.toBe('');
      expect(p.audiences.length).toBeGreaterThan(0);
    }
    expect(getProduct('vape')?.unit).toBe('Stück');
  });

  it('entnimmt alles oder nichts, oder so viel wie da ist', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    expect(take(ctx, { productId: 'weed', amount: START_STOCK + 1 }).taken).toBe(0);
    expect(take(ctx, { productId: 'weed', amount: 10 }).taken).toBe(10);
    expect(take(ctx, { productId: 'weed', amount: 1000, partial: true }).taken).toBe(START_STOCK - 10);
    expect(getStock(sim.state)).toBe(0);
    expect(getLots(sim.state)).toHaveLength(0);
  });

  it('lagert ein, auch in neue Lager, und meldet es', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 100, warehouseId: 'zweitlager' });
    sim.step();
    expect(getStock(sim.state, { warehouseId: 'zweitlager' })).toBe(100);
    expect(eventsOfType(events, 'goods.stored')).toHaveLength(1);
  });

  it('hält Posten mit verschiedener Qualität getrennt und legt gleiche zusammen', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    store(ctx, { productId: 'haze', amount: 50, quality: 0.8, unitCost: 5 });
    store(ctx, { productId: 'haze', amount: 50, quality: 0.8, unitCost: 7 });
    store(ctx, { productId: 'haze', amount: 100, quality: 0.4, unitCost: 3 });
    const lots = getLots(sim.state, { productId: 'haze' });
    expect(lots.map((l) => [l.amount, l.quality, l.unitCost])).toEqual([
      [100, 0.8, 6],
      [100, 0.4, 3],
    ]);
    expect(averageQuality(sim.state, { productId: 'haze' })).toBeCloseTo(0.6);
    expect(stockSummary(sim.state).map((r) => r.productId)).toEqual(['weed', 'haze']);
    expect(qualityTier(0.8).name).toBe('Gut');
    expect(qualityTier(0.1).name).toBe('Dreck');
  });

  it('entnimmt älteste Posten zuerst und meldet die mittlere Qualität', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    store(ctx, { productId: 'hash', amount: 10, quality: 0.9, unitCost: 4 });
    store(ctx, { productId: 'hash', amount: 10, quality: 0.3, unitCost: 2 });
    const result = take(ctx, { productId: 'hash', amount: 15 });
    expect(result.taken).toBe(15);
    expect(result.quality).toBeCloseTo((10 * 0.9 + 5 * 0.3) / 15);
    expect(result.unitCost).toBeCloseTo((10 * 4 + 5 * 2) / 15);
    expect(getLots(sim.state, { productId: 'hash' }).map((l) => l.amount)).toEqual([5]);
  });

  it('Strecken: Menge steigt, Qualität sinkt, Streckmittel kostet', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const [lot] = getLots(sim.state);
    const result = sim.dispatch({ type: 'goods.cut', payload: { lotId: lot.id, ratio: 0.25 } });
    expect(result.ok).toBe(true);
    const [after] = getLots(sim.state);
    expect(after.amount).toBe(START_STOCK + 10);
    expect(after.quality).toBeCloseTo(START_QUALITY * (1 - 0.25 * CUT_QUALITY_LOSS), 2);
    expect(after.cut).toBeCloseTo(0.2);
    expect(sim.state.wallet.dirty).toBeCloseTo(START_DIRTY_MONEY - 10 * CUT_AGENT_COST);
    expect(eventsOfType(events, 'goods.cut')[0].payload).toMatchObject({ added: 10, productId: 'weed' });
    // Die gestreckte Ware verrät sich beim Verkauf über den Streckanteil.
    expect(take(sim.ctx('test'), { productId: 'weed', amount: 5 }).cut).toBeCloseTo(0.2);
  });

  it('Strecken hat Grenzen: nicht zu viel, nicht bei abgepackter Ware', () => {
    const sim = createTestGame();
    const [lot] = getLots(sim.state);
    const cut = (lotId: number, ratio: number) => sim.dispatch({ type: 'goods.cut', payload: { lotId, ratio } });
    expect(cut(lot.id, 0.5).ok).toBe(true);
    expect(cut(lot.id, 0.5)).toEqual({ ok: false, reason: 'Mehr Streckmittel verträgt die Ware nicht.' });
    const vapeLot = store(sim.ctx('test'), { productId: 'vape', amount: 10 }) ?? -1;
    expect(cut(vapeLot, 0.1)).toEqual({ ok: false, reason: 'Vape-Pen lässt sich nicht strecken.' });
    expect(cut(9999, 0.1).ok).toBe(false);
  });

  it('migriert alte Spielstände (Mengen pro Produkt) zu Posten', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.goods = { stock: { ehrenfeld: { weed: 25, hash: 0 } } };
    raw.moduleVersions.goods = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(getLots(loaded.state)).toEqual([
      expect.objectContaining({ productId: 'weed', amount: 25, quality: STANDARD_QUALITY, cut: 0 }),
    ]);
    expect(loaded.state.moduleVersions.goods).toBe(3);
    expect(getWarehouses(loaded.state).map((w) => w.id)).toEqual(['ehrenfeld']);
  });

  it('weitere Lager kauft man mit sauberem Geld, Ware kommt aus dem nächsten Lager', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const buy = (warehouseId: string) => sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId } });
    const kalk = warehouseSite('kalk');
    expect(kalk?.cost).toBeGreaterThan(0);
    expect(getWarehouse(sim.state, 'kalk')).toBeUndefined();
    sim.state.wallet.clean = (kalk?.cost ?? 0) - 1;
    expect(buy('kalk').ok).toBe(false);
    sim.state.wallet.clean = kalk?.cost ?? 0;
    const dirty = sim.state.wallet.dirty;
    expect(buy('kalk').ok).toBe(true);
    expect(sim.state.wallet).toMatchObject({ clean: 0, dirty });
    expect(buy('kalk')).toEqual({ ok: false, reason: 'Halle Kalk gehört dir schon.' });
    expect(buy('mond').ok).toBe(false);
    expect(getWarehouses(sim.state).map((w) => w.id)).toEqual(['ehrenfeld', 'kalk']);
    expect(eventsOfType(events, 'goods.warehouseBought')[0].payload).toEqual({ warehouseId: 'kalk', cost: kalk?.cost });

    // Ware in Kalk: Ein Spot in Kalk bekommt sie von dort, ohne Ort kommt sie zuerst aus Ehrenfeld.
    store(sim.ctx('test'), { productId: 'weed', amount: 30, warehouseId: 'kalk', quality: 0.9 });
    const nearKalk = { lng: 7.0, lat: 50.94 };
    expect(nearestWarehouse(sim.state, nearKalk)?.id).toBe('kalk');
    expect(nearestWarehouse(sim.state, nearKalk, { productId: 'hash' })).toBeUndefined();
    expect(take(sim.ctx('test'), { productId: 'weed', amount: 5, near: nearKalk }).quality).toBe(0.9);
    expect(take(sim.ctx('test'), { productId: 'weed', amount: 5 }).quality).toBe(START_QUALITY);
  });

  it('alle Lager-Standorte liegen in einem Veedel und auf der Karte nah an einer Straße', () => {
    for (const site of warehouseSites()) {
      expect(veedelAt(site.lng, site.lat), site.id).toBeDefined();
      expect(nearestRoadPoint(site)?.meters ?? 999, site.id).toBeLessThan(150);
    }
    expect(
      warehouseSites()
        .filter((w) => w.cost === 0)
        .map((w) => w.id),
    ).toEqual(['ehrenfeld']);
  });
});
