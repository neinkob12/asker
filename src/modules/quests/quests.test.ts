import { describe, expect, it } from 'vitest';
import { loadSimulation, messages, type Simulation, wallet } from '../../core';
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
    expect(currentQuest(sim.state)?.id).toBe('revenue1k');
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

  it('Reihenfolge: Jede Quest verlangt nur, was die früheren möglich gemacht haben', () => {
    const at = (id: string) => QUESTS.findIndex((q) => q.id === id);
    // Der Liegeplatz im Hafen (4.000 € sauber) und das zweite Lager brauchen sauberes Geld, also erst waschen.
    expect(at('launder')).toBeLessThan(at('warehouse'));
    expect(at('launder')).toBeLessThan(at('pickup'));
    // Die Rechte Hand braucht zwei Leutnants.
    expect(at('lieutenant')).toBeLessThan(at('rightHand'));
    expect(at('rightHand')).toBeLessThan(at('rightHandDelivery'));
    expect(at('rightHand')).toBeLessThan(at('rightHandRank'));
    // Kapitel wachsen nur.
    for (let i = 1; i < QUESTS.length; i++) expect(QUESTS[i].chapter).toBeGreaterThanOrEqual(QUESTS[i - 1].chapter);
  });

  it('eine Aktion, die zwei Ereignisse meldet, erledigt nicht zwei Quests auf einmal', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'runner');
    sim.ctx('staff').emit('staff.hired', { staffId: 's1', role: 'runner', origin: 'pool' } as never);
    sim.ctx('recruiting').emit('recruiting.hired', { candidateId: 'c1', staffId: 's1' });
    sim.advance(1);
    // "Läufer anheuern" ist erledigt, "über Leute finden einstellen" beginnt erst jetzt und zählt das noch nicht mit.
    expect(sim.state.modules.quests.done).toEqual(['runner']);
    expect(currentQuest(sim.state)?.id).toBe('recruit');
    // Der nächste Läufer über "Leute finden" zählt.
    sim.advance(5);
    sim.ctx('recruiting').emit('recruiting.hired', { candidateId: 'c2', staffId: 's2' });
    sim.advance(1);
    expect(sim.state.modules.quests.done).toEqual(['runner', 'recruit']);
  });

  it('Migration 1 → 2: Der Index folgt der neuen Reihenfolge, erledigte und übersprungene Quests bleiben', () => {
    const sim = createTestGame();
    sim.advance(10);
    const raw = structuredClone(sim.state) as unknown as {
      modules: { quests: Record<string, unknown> };
      moduleVersions: Record<string, number>;
    };
    // Alter Stand: Kapitel 1 war mit dem Hafen-Pickup an vierter Stelle, 'pickup' war noch offen.
    raw.modules.quests = {
      index: 3,
      progress: 0,
      done: ['firstSales', 'setPrice', 'order'],
      skipped: [],
      title: null,
    };
    raw.moduleVersions.quests = 1;
    const loaded = loadSimulation(raw, sim.modules);
    // Neu: Nach 'order' folgt 'revenue1k', der Hafen kommt erst später.
    expect(currentQuest(loaded.state)?.id).toBe('revenue1k');
    expect(loaded.state.modules.quests.done).toEqual(['firstSales', 'setPrice', 'order']);
    expect(loaded.state.moduleVersions.quests).toBe(2);
    // Alles durch: Index am Ende.
    raw.modules.quests = { index: 26, progress: 0, done: QUESTS.map((q) => q.id), skipped: [], title: 'Boss von Köln' };
    expect(currentQuest(loadSimulation(raw, sim.modules).state)).toBeNull();
  });
});
