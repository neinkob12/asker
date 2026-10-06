import { describe, expect, it } from 'vitest';
import { type GameState, journal, loadSimulation, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { allProducts, getStock } from '../goods';
import { CALL_MIN_REVENUE } from '../grow';
import { addHeat } from '../police';
import { addInfluence, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { CHAPTERS, HARBOR_NAME_REVENUE, PETER, QUEST_COUNT_BEFORE_36, QUESTS, QUESTS_ADDED_IN_43 } from './config';
import {
  chapterName,
  completedQuests,
  currentQuest,
  questProgress,
  questsWaiting,
  questTitle,
  rewardText,
} from './index';

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

  it('Ware-Belohnung ohne Lager in der aktiven Stadt landet im anderen eigenen Lager (und der Text sagt es)', () => {
    const sim = createTestGame();
    sim.advance(10);
    // Nur ein Hamburger Lager, aktiv ist Köln.
    sim.state.modules.goods.owned = ['keller-st-georg'];
    jumpTo(sim, 'firstSales');
    sim.state.modules.quests.progress = 2;
    sale(sim);
    sim.advance(1);
    expect(sim.state.modules.quests.done).toContain('firstSales');
    expect(getStock(sim.state, { productId: 'weed', warehouseId: 'keller-st-georg' })).toBe(10);
    expect(journal.entries(sim.state)[0].text).toContain('im Lager');
  });

  it('Ware-Belohnung ohne jedes Lager verpufft nicht still: Journal sagt, dass sie verfallen ist', () => {
    const sim = createTestGame();
    sim.advance(10);
    sim.state.modules.goods.owned = [];
    const before = getStock(sim.state, { productId: 'weed' });
    jumpTo(sim, 'firstSales');
    sim.state.modules.quests.progress = 2;
    sale(sim);
    sim.advance(1);
    expect(sim.state.modules.quests.done).toContain('firstSales');
    expect(getStock(sim.state, { productId: 'weed' })).toBe(before);
    expect(journal.entries(sim.state).some((e) => e.text.includes('verfallen'))).toBe(true);
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

  it('Quests am Zustand: 50.000 € Vermögen geben sauberes Geld, danach kommt Kapitel 6', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'worth50k');
    wallet.earn(sim.ctx('test'), 60000, 'dirty', 'Test', 'income.other');
    sim.advance(10);
    // Der Titel kommt nicht mehr vom Vermögen, sondern mit der Mehrheit der Veedel.
    expect(questTitle(sim.state)).toBeNull();
    expect(wallet.balance(sim.state, 'clean')).toBe(2500);
    expect(currentQuest(sim.state)?.id).toBe('nineVeedel');
    expect(messages.thread(sim.state, PETER.id).some((m) => m.text.includes('Ganz Köln'))).toBe(true);
  });

  it('Meilenstein Mehrheit gibt den Titel "Boss von Köln", alle 12 Veedel schließen Kapitel 6 ab', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'nineVeedel');
    const ctx = sim.ctx('test');
    const ids = allVeedel('koeln').map((v) => v.id);
    for (const id of ids.slice(0, 7)) addInfluence(ctx, id, PLAYER_FACTION, 100);
    sim.advance(10);
    expect(questTitle(sim.state)).toBe('Boss von Köln');
    expect(currentQuest(sim.state)?.id).toBe('nineVeedel');
    for (const id of ids.slice(7)) addInfluence(ctx, id, PLAYER_FACTION, 100);
    sim.advance(10);
    expect(completedQuests(sim.state)).toEqual(expect.arrayContaining(['nineVeedel', 'allVeedel']));
    // Danach wartet Peter auf die nächste Stadt (Auftrag 36: Reihenfolge frei) und macht mit ihrem Kapitel weiter.
    expect(currentQuest(sim.state)).toBeNull();
    expect(questsWaiting(sim.state)).toBe(true);
    const texts = messages.thread(sim.state, PETER.id).map((m) => m.text);
    expect(texts.some((t) => t.includes('Telefon'))).toBe(true);
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhWarehouse');
    expect(questsWaiting(sim.state)).toBe(false);
  });

  it('Kapitel 7 "Moin Hamburg": Lager, Spot, erster Verkauf, Läufer, Bestellung, Liegeplatz in Hamburg', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'hhWarehouse');
    sim.state.wallet.clean = 30000;
    sim.state.wallet.dirty = 30000;
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    // Ein Kölner Lager zählt nicht.
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhWarehouse');
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'keller-st-georg' } }).ok).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhSpot');
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'hansaplatz' } }).ok).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhFirstSale');
    sim.ctx('customers').emit('sale.completed', {
      channel: 'street',
      spotId: 'hansaplatz',
      veedelId: 'st-georg',
      productId: 'weed',
      amount: 1,
      quality: 0.6,
      revenue: 50,
      sellerId: null,
      customerId: null,
    });
    sim.advance(10);
    // Leute aus Köln zählen nicht (Auftrag 43): In Hamburg heuerst du neu an.
    expect(currentQuest(sim.state)?.id).toBe('hhRunner');
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'hansaplatz' } }).ok).toBe(true);
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhOrder');
    // Eine Bestellung für Köln zählt nicht, eine für Hamburg schon.
    sim
      .ctx('suppliers')
      .emit('shipment.ordered', { shipmentId: 1, supplierId: 'toni', amount: 100, price: 500, cityId: 'koeln' });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhOrder');
    sim.ctx('suppliers').emit('shipment.ordered', {
      shipmentId: 2,
      supplierId: 'toni',
      amount: 100,
      price: 500,
      cityId: 'hamburg',
    });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhBerth');
    expect(QUESTS.filter((q) => q.chapter === 6).map((q) => q.id)).toEqual([
      'hhWarehouse',
      'hhSpot',
      'hhFirstSale',
      'hhRunner',
      'hhOrder',
      'hhBerth',
    ]);
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
      // Ohne Belohnung nur mit einem Satz von Peter (die letzte Quest eines Kapitels, z.B. "Ganz Köln").
      expect(q.reward.length > 0 || Boolean(q.doneText)).toBe(true);
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
    expect(loaded.state.moduleVersions.quests).toBe(6);
    // Alles durch: Index am Ende.
    raw.modules.quests = { index: 26, progress: 0, done: QUESTS.map((q) => q.id), skipped: [], title: 'Boss von Köln' };
    expect(currentQuest(loadSimulation(raw, sim.modules).state)).toBeNull();
  });

  it('Migration 3 → 4 (Auftrag 36): Wer mit allen alten Quests durch war, wartet auf die nächste Stadt', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as GameState;
    const old = QUESTS.slice(0, QUEST_COUNT_BEFORE_36).map((q) => q.id);
    raw.modules.quests = { ...raw.modules.quests, index: QUEST_COUNT_BEFORE_36, done: old, skipped: [] };
    raw.moduleVersions.quests = 3;
    const loaded = loadSimulation(raw, sim.modules);
    expect(questsWaiting(loaded.state)).toBe(true);
    expect(currentQuest(loaded.state)).toBeNull();
  });

  it('Migration 4 → 5 (Auftrag 43): Der Index zeigt weiter auf dieselbe Quest, die neuen kommen später dran', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as GameState;
    const added = new Set(QUESTS_ADDED_IN_43);
    const before = QUESTS.filter((q) => !added.has(q.id));
    const at = before.findIndex((q) => q.id === 'beVeedel');
    raw.modules.quests = { ...raw.modules.quests, index: at };
    raw.moduleVersions.quests = 4;
    const loaded = loadSimulation(raw, sim.modules);
    expect(currentQuest(loaded.state)?.id).toBe('beVeedel');
    // Alle durch: Jetzt wartet das Kapitel Rotterdam (es kommt erst nach dem Verkauf, in Rotterdam).
    const done = structuredClone(sim.state) as GameState;
    done.modules.quests = { ...done.modules.quests, index: before.length };
    done.moduleVersions.quests = 4;
    const waiting = loadSimulation(done, sim.modules);
    expect(questsWaiting(waiting.state)).toBe(true);
    waiting.advance(60);
    expect(currentQuest(waiting.state)).toBeNull();
  });

  it('Migration 5 → 6 (Auftrag 43, H15): „Mach dir einen Namen“ schiebt die Produktion eins weiter', () => {
    const sim = createTestGame();
    const v5 = QUESTS.filter((q) => q.id !== 'rtRevenue');
    const raw = structuredClone(sim.state) as GameState;
    raw.modules.quests = {
      ...raw.modules.quests,
      index: v5.findIndex((q) => q.id === 'pdFinca'),
      done: ['rtTruck', 'pdOffer'],
    };
    raw.moduleVersions.quests = 5;
    const loaded = loadSimulation(raw, sim.modules).state.modules.quests;
    expect(QUESTS[loaded.index]?.id).toBe('pdFinca');
    // Wer den Lkw schon hat, bekommt die neue Quest nicht später mit Belohnung nach.
    expect(loaded.done).toContain('rtRevenue');
    // Das Ziel ist der Umsatz, ab dem die Produzenten anrufen.
    expect(HARBOR_NAME_REVENUE).toBe(CALL_MIN_REVENUE);
  });

  it('Kapitel pro Stadt (Auftrag 36): Wer nach Köln eine andere Stadt nimmt, bekommt deren Kapitel', () => {
    const sim = createTestGame();
    sim.advance(10);
    const q = sim.state.modules.quests;
    q.done = QUESTS.filter((x) => !x.cityId).map((x) => x.id);
    q.index = QUESTS.findIndex((x) => x.id === 'allVeedel');
    q.done = q.done.filter((id) => id !== 'allVeedel');
    sim.dispatch({ type: 'quests.skip', payload: {} });
    expect(questsWaiting(sim.state)).toBe(true);
    // Berlin wird frei (als wäre es keine Schablone mehr): Peter nimmt das Berliner Kapitel, Hamburg wartet.
    sim.state.modules.city.unlocked.push('berlin');
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('beWarehouse');
    expect(chapterName(currentQuest(sim.state)?.chapter ?? 0)).toBe('Berliner Nächte');
    for (const id of ['beWarehouse', 'beSpot', 'beFirstSale', 'beRunner', 'beOrder', 'beVeedel']) {
      expect(currentQuest(sim.state)?.id).toBe(id);
      sim.dispatch({ type: 'quests.skip', payload: {} });
    }
    expect(questsWaiting(sim.state)).toBe(true);
    // Danach Hamburg: Das Kapitel steht weiter vorn in der Liste und kommt trotzdem dran.
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhWarehouse');
  });

  it('In der neuen Stadt geht ihr Kapitel vor (Auftrag 43): Liegengebliebenes aus Köln gilt als übersprungen', () => {
    const sim = createTestGame();
    sim.advance(10);
    jumpTo(sim, 'setPrice');
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    sim.advance(10);
    // Noch in Köln: Die Kölner Quest bleibt.
    expect(currentQuest(sim.state)?.id).toBe('setPrice');
    sim.state.modules.city.present = 'hamburg';
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhWarehouse');
    expect(sim.state.modules.quests.skipped).toContain('setPrice');
    // Zurück in Köln bleibt das Hamburger Kapitel dran.
    sim.state.modules.city.present = 'koeln';
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } });
    sim.advance(10);
    expect(currentQuest(sim.state)?.id).toBe('hhWarehouse');
  });
});
