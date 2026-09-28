import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { START_STOCK } from './config';
import { allProducts, getStock, getWarehouses, store, take } from './index';

describe('goods', () => {
  it('startet mit dem Startbestand im Standardlager', () => {
    const sim = createTestGame();
    expect(getStock(sim.state)).toBe(START_STOCK);
    expect(getStock(sim.state, { productId: 'weed', warehouseId: 'ehrenfeld' })).toBe(START_STOCK);
    expect(getWarehouses(sim.state)).toHaveLength(1);
    expect(allProducts().map((p) => p.id)).toContain('weed');
  });

  it('entnimmt alles oder nichts, oder so viel wie da ist', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    expect(take(ctx, { productId: 'weed', amount: START_STOCK + 1 }).taken).toBe(0);
    expect(take(ctx, { productId: 'weed', amount: 10 }).taken).toBe(10);
    expect(take(ctx, { productId: 'weed', amount: 1000, partial: true }).taken).toBe(START_STOCK - 10);
    expect(getStock(sim.state)).toBe(0);
  });

  it('lagert ein, auch in neue Lager, und meldet es', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 100, warehouseId: 'zweitlager' });
    sim.step();
    expect(getStock(sim.state, { warehouseId: 'zweitlager' })).toBe(100);
    expect(eventsOfType(events, 'goods.stored')).toHaveLength(1);
  });
});
