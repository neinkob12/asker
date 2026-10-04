import { describe, expect, it } from 'vitest';
import { wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { DEFAULT_WAREHOUSE, getProduct, store } from '../goods';
import { GOODS_FALLBACK_SHARE } from './config';
import { netWorth } from './index';

describe('leaderboard: Vermögen', () => {
  it('Ware zählt zum Einkaufspreis des Postens, höchstens zum Straßenpreis, ohne Einkaufspreis mit Abschlag', () => {
    const sim = createTestGame();
    sim.advance(1);
    sim.state.modules.goods.stock = {};
    const street = getProduct('weed')?.basePrice ?? 0;
    expect(street).toBeGreaterThan(0);
    const money = wallet.balance(sim.state, 'dirty') + wallet.balance(sim.state, 'clean');
    const stockAt = (unitCost: number) => {
      sim.state.modules.goods.stock = {};
      store(sim.ctx('test'), { warehouseId: DEFAULT_WAREHOUSE, productId: 'weed', amount: 100, unitCost });
      return netWorth(sim.state);
    };
    expect(stockAt(street * 0.4)).toBe(Math.round(money + 100 * street * 0.4));
    // Ein zu hoher Einkaufspreis (z.B. Eilbestellung) bläht das Vermögen nicht über den Straßenpreis auf.
    expect(stockAt(street * 3)).toBe(Math.round(money + 100 * street));
    // Beute und Belohnungen haben keinen Einkaufspreis: Abschlag statt voller Straßenpreis.
    expect(stockAt(0)).toBe(Math.round(money + 100 * street * GOODS_FALLBACK_SHARE));
    expect(GOODS_FALLBACK_SHARE).toBeLessThan(1);
  });
});
