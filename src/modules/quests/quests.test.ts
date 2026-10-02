import { describe, expect, it } from 'vitest';
import { messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { allProducts, getStock } from '../goods';
import { addHeat } from '../police';
import { CHAPTERS, PETER, QUESTS } from './config';
import questsModule, { currentQuest, type QuestsState, questProgress, questTitle, rewardText } from './index';

/** Alle Quests vor questId gelten als erledigt. */
function jumpTo(sim: Simulation, questId: string): void {
  const q = sim.state.modules.quests;
  q.done = QUESTS.slice(
    0,
    QUESTS.findIndex((x) => x.id === questId),
  ).map((x) => x.id);
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
    expect(currentQuest(sim.state)?.id).toBe('delivery');
  });

  it('Quests am Zustand: 50.000 € Vermögen geben Titel und sauberes Geld', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'worth');
    wallet.earn(sim.ctx('test'), 40000, 'dirty', 'Test', 'income.other');
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
    sim.advance(5);
    for (const id of Object.keys(sim.state.modules.police.heat)) sim.state.modules.police.heat[id] = 0;
    sim.advance(60 * 5);
    expect(questProgress(sim.state)[0]).toBeGreaterThanOrEqual(4);
    addHeat(sim.ctx('police'), 'ehrenfeld', 80);
    sim.advance(60);
    expect(questProgress(sim.state)[0]).toBe(0);
  });

  it('Peter schickt jede neue Quest, auch nach dem Überspringen', () => {
    const sim = createTestGame();
    sim.advance(10);
    sim.dispatch({ type: 'quests.skip', payload: {} });
    sim.advance(5);
    const last = messages.thread(sim.state, PETER.id).at(-1)?.text ?? '';
    expect(last).toContain(QUESTS[1].task);
  });

  it('Spielstände von Version 1 behalten erledigte Quests, die nächste offene wird aktiv', () => {
    const sim = createTestGame();
    sim.advance(10);
    // Alter Stand: Quest 4 von damals ("Hol die Ware vom Hafen") war aktiv.
    const v1 = { index: 3, progress: 0, done: ['firstSales', 'setPrice', 'order'], skipped: [], title: null };
    const migrate = questsModule.migrations?.[2] as unknown as (old: unknown) => QuestsState;
    const migrated = migrate(v1);
    expect(migrated.done).toEqual(['firstSales', 'setPrice', 'order']);
    sim.state.modules.quests = migrated;
    sim.advance(5);
    expect(currentQuest(sim.state)?.id).toBe('delivery');
    expect(sim.state.modules.quests.activeId).toBe('delivery');
  });

  it('die Reihenfolge passt zu den Regeln: Rechte Hand erst nach zwei Leutnants, Hafen nach der Geldwäsche', () => {
    const at = (id: string) => QUESTS.findIndex((q) => q.id === id);
    expect(at('lieutenant2')).toBeLessThan(at('rightHand'));
    expect(at('rightHand')).toBeLessThan(at('rightHandDelivery'));
    expect(at('launder')).toBeLessThan(at('berth'));
    expect(at('berth')).toBeLessThan(at('pickup'));
    // Im ersten Kapitel kostet nichts mehr als das Startgeld hergibt: kein Hafen, kein Lager.
    const first = QUESTS.filter((q) => q.chapter === 0).map((q) => q.id);
    expect(first).not.toContain('pickup');
    expect(first).not.toContain('berth');
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
