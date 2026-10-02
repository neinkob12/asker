import { describe, expect, it } from 'vitest';
import { messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { allProducts, getStock } from '../goods';
import { addHeat } from '../police';
import { CHAPTERS, PETER, QUESTS } from './config';
import { currentQuest, questProgress, questTitle, rewardText } from './index';

function jumpTo(sim: Simulation, questId: string): void {
  sim.state.modules.quests.index = QUESTS.findIndex((q) => q.id === questId);
  sim.state.modules.quests.progress = 0;
}

function sale(sim: Simulation, sellerId: string | null = null, revenue = 50): void {
  sim.ctx('customers').emit('sale.completed', {
    channel: 'street',
    spotId: null,
    veedelId: 'ehrenfeld',
    productId: 'weed',
    amount: 1,
    quality: 0.6,
    revenue,
    sellerId,
    customerId: null,
  });
}

describe('quests', () => {
  it('Peter meldet sich am Anfang und schickt die erste Quest', () => {
    const sim = createTestGame();
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe(QUESTS[0].id);
    const thread = messages.thread(sim.state, PETER.id);
    expect(thread.length).toBe(2);
    expect(thread[1].text).toContain('Dafür gibt');
  });

  it('zählt Ereignisse ab Beginn der Quest und gibt die Belohnung (Ware ins Lager)', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    sim.advance(10);
    const before = getStock(sim.state, { productId: 'weed' });
    sale(sim, 'staff:1'); // Läufer zählt nicht, nur selbst bedient
    sale(sim);
    sale(sim);
    sim.advance(1);
    expect(questProgress(sim.state)).toEqual([2, 3]);
    sale(sim);
    sim.advance(1);
    expect(sim.state.modules.quests.done).toEqual(['firstSales']);
    expect(getStock(sim.state, { productId: 'weed' })).toBe(before + 10);
    expect(currentQuest(sim.state)?.id).toBe('setPrice');
    expect(eventsOfType(events, 'quest.completed')[0].payload).toEqual({ questId: 'firstSales', skipped: false });
  });

  it('überspringen geht ohne Belohnung', () => {
    const sim = createTestGame();
    sim.advance(10);
    const money = wallet.balance(sim.state, 'dirty');
    jumpTo(sim, 'order');
    expect(sim.dispatch({ type: 'quests.skip', payload: {} }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money);
    expect(sim.state.modules.quests.skipped).toEqual(['order']);
    expect(currentQuest(sim.state)?.id).toBe('pickup');
  });

  it('Quests am Zustand: 50.000 € Vermögen geben Titel und sauberes Geld', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'worth50k');
    wallet.earn(sim.ctx('test'), 60000, 'dirty', 'Test', 'income.other');
    sim.advance(10);
    expect(questTitle(sim.state)).toBe('Boss von Köln');
    expect(wallet.balance(sim.state, 'clean')).toBe(2500);
    expect(currentQuest(sim.state)).toBeNull();
    expect(messages.thread(sim.state, PETER.id).at(-1)?.text).toContain('Boss');
  });

  it('Serie: Heat einen Tag lang niedrig, eine heiße Stunde setzt zurück', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'lowHeat');
    for (const id of Object.keys(sim.state.modules.police.heat)) sim.state.modules.police.heat[id] = 0;
    sim.advance(60 * 5);
    expect(questProgress(sim.state)[0]).toBeGreaterThanOrEqual(4);
    addHeat(sim.ctx('police'), 'ehrenfeld', 80);
    sim.advance(60);
    expect(questProgress(sim.state)[0]).toBe(0);
  });

  it('jede Quest ist sinnvoll angelegt', () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    expect(ids.size).toBe(QUESTS.length);
    expect(QUESTS.length).toBeGreaterThanOrEqual(25);
    const products = new Set(allProducts().map((p) => p.id));
    for (const q of QUESTS) {
      expect(q.chapter).toBeLessThan(CHAPTERS.length);
      expect(q.target).toBeGreaterThan(0);
      expect(Boolean(q.measure) || Boolean(q.count) || Boolean(q.streak)).toBe(true);
      expect(q.reward.length).toBeGreaterThan(0);
      for (const r of q.reward) {
        if (r.kind === 'goods') expect(products.has(r.productId)).toBe(true);
        expect(rewardText(r).length).toBeGreaterThan(0);
      }
    }
    // Belohnungen sind abwechslungsreich, nicht nur Ware.
    expect(new Set(QUESTS.flatMap((q) => q.reward.map((r) => r.kind))).size).toBeGreaterThanOrEqual(7);
  });
});
