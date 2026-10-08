import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { missionReward, rewardGoods, rewardMoney } from './reward';

function sale(sim: ReturnType<typeof createTestGame>, productId: string, amount: number, revenue: number): void {
  sim.ctx('customers').emit('sale.completed', {
    channel: 'street',
    spotId: 'neumarkt',
    veedelId: 'ehrenfeld',
    productId,
    amount,
    quality: 0.6,
    revenue,
    sellerId: null,
    customerId: null,
  });
  sim.advance(1);
}

describe('Belohnungsregel (Auftrag 46)', () => {
  it('Geld: 20 % des Umsatzes, unter 1.000 € auf 50 € aufgerundet, sonst auf 100 €, mindestens 100 €', () => {
    expect(rewardMoney(0)).toBe(100);
    expect(rewardMoney(150)).toBe(100);
    expect(rewardMoney(2145)).toBe(450);
    expect(rewardMoney(3430)).toBe(700);
    expect(rewardMoney(4900)).toBe(1000);
    expect(rewardMoney(30133)).toBe(6100);
    expect(rewardMoney(24612)).toBe(5000);
  });

  it('Ware: 20 % der Gramm, unter 100 g auf 5 g aufgerundet, sonst auf 10 g, mindestens 10 g', () => {
    expect(rewardGoods(0)).toBe(10);
    expect(rewardGoods(3)).toBe(10);
    expect(rewardGoods(184)).toBe(40);
    expect(rewardGoods(280)).toBe(60);
    expect(rewardGoods(2184)).toBe(440);
    expect(rewardGoods(499)).toBe(100);
    expect(rewardGoods(501)).toBe(110);
  });

  it('nimmt das Produkt, das am meisten verkauft wurde, und nur Verkäufe der letzten 24 Stunden', () => {
    const sim = createTestGame();
    sim.dispatch({ type: 'tutorial.start', payload: {} });
    // Ohne Verkäufe: Untergrenzen, Gras.
    expect(missionReward(sim.state)).toEqual({ money: 100, productId: 'weed', amount: 10 });
    sale(sim, 'hash', 30, 300);
    sale(sim, 'weed', 20, 200);
    sale(sim, 'weed', 20, 200);
    expect(missionReward(sim.state)).toEqual({ money: 150, productId: 'weed', amount: 15 });
    // Hasch zieht vorbei: 110 g und 2.700 € in 24 Stunden.
    sale(sim, 'hash', 40, 2000);
    expect(missionReward(sim.state)).toEqual({ money: 550, productId: 'hash', amount: 25 });
    // Nach 24 Stunden zählt nichts mehr davon.
    sim.advance(24 * 60 + 2);
    expect(missionReward(sim.state)).toEqual({ money: 100, productId: 'weed', amount: 10 });
    expect(sim.state.modules.tutorial.sales).toEqual([]);
  });
});
