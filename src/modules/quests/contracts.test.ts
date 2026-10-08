// Wochenverträge (Auftrag 32).

import { describe, expect, it } from 'vitest';
import { clock, loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getRelation } from '../suppliers';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { CONTRACT_CONTACTS, CONTRACT_TEMPLATES, contractRewards, contractTarget } from './contracts';
import {
  activeContract,
  canAcceptContract,
  contractOffers,
  contractProgress,
  contractStats,
  contractsOpen,
  contractValue,
} from './index';

/** Tag 1 ist ein Freitag, Tag 4 der erste Montag. */
const MONDAY_8 = clock.at(4, 8);
const NEXT_MONDAY = clock.at(11);

function untilOffers(sim: Simulation): void {
  sim.advance(MONDAY_8 - sim.state.time);
}

/** Köln auf komplett stellen (Meilenstein in territory): Erst danach gibt es Verträge (Auftrag 46d). */
function finishKoeln(sim: Simulation): void {
  const t = sim.state.modules.territory;
  t.milestones ??= {};
  t.milestones.koeln = { majority: sim.state.time, complete: sim.state.time };
}

/** Testspiel, in dem es schon Verträge gibt. */
function game(seed?: number): Simulation {
  const sim = createTestGame(seed === undefined ? {} : { seed });
  finishKoeln(sim);
  return sim;
}

describe('quests: Wochenverträge (nur noch die, Auftrag 46d)', () => {
  it('mindestens zwölf Vorlagen, gemischt, jede mit Figur mit Gesicht und Stimme', () => {
    expect(CONTRACT_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const t of CONTRACT_TEMPLATES) {
      const contact = CONTRACT_CONTACTS.find((c) => c.id === t.contactId);
      expect(contact?.look, t.id).toBeDefined();
      expect(contact?.voice, t.id).toBeDefined();
      expect(!!t.count || !!t.measure || !!t.streak, t.id).toBe(true);
      // Ziele skalieren mit der Größe des Geschäfts.
      expect(contractTarget(t, 2, 3)).toBeGreaterThanOrEqual(contractTarget(t, 0, 3));
    }
    const kinds = new Set(CONTRACT_TEMPLATES.map((t) => (t.streak ? 'streak' : t.measure ? 'measure' : 'count')));
    expect(kinds).toEqual(new Set(['count', 'measure', 'streak']));
  });

  it('Montag 8 Uhr: drei Angebote von drei Figuren, per Handy', () => {
    const sim = game(2);
    const events = recordEvents(sim);
    sim.advance(MONDAY_8 - sim.state.time - 1);
    expect(contractOffers(sim.state)).toHaveLength(0);
    sim.advance(1);
    const offers = contractOffers(sim.state);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((o) => o.contactId)).size).toBe(3);
    for (const o of offers) {
      expect(o.deadline).toBe(NEXT_MONDAY);
      expect(o.cityId).toBe('koeln');
      expect(o.rewards.length).toBeGreaterThan(0);
      const message = sim.state.messages.list.find((m) => m.id === o.messageId);
      expect(message?.options?.[0].command).toEqual({ type: 'quests.acceptContract', payload: { offerId: o.id } });
    }
    expect(eventsOfType(events, 'contract.offered')).toHaveLength(1);
  });

  it('erst nach Köln (Auftrag 46d): am ersten Montag ohne, ist Köln komplett, am Montag danach mit Angeboten', () => {
    const sim = createTestGame({ seed: 2 });
    untilOffers(sim);
    expect(contractsOpen(sim.state)).toBe(false);
    expect(contractOffers(sim.state)).toHaveLength(0);
    finishKoeln(sim);
    expect(contractsOpen(sim.state)).toBe(true);
    // Mitten in der Woche kommt nichts nach, erst wieder am Montag.
    sim.advance(60 * 24);
    expect(contractOffers(sim.state)).toHaveLength(0);
    sim.advance(NEXT_MONDAY + 8 * 60 - sim.state.time);
    expect(contractOffers(sim.state)).toHaveLength(3);
  });

  it('einer wird angenommen, die anderen Angebote sind dann weg', () => {
    const sim = game(2);
    untilOffers(sim);
    const [first, second] = contractOffers(sim.state);
    const answered = sim.dispatch({
      type: 'messages.answer',
      payload: { messageId: first.messageId, optionId: 'accept' },
    });
    expect(answered.ok).toBe(true);
    expect(activeContract(sim.state)?.id).toBe(first.id);
    expect(contractOffers(sim.state)).toHaveLength(0);
    const other = sim.state.messages.list.find((m) => m.id === second.messageId);
    expect(other?.expired).toBe(true);
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: second.id } }).ok).toBe(false);
    expect(contractStats(sim.state).accepted).toBe(1);
  });

  it('Umsatz-Vertrag: Verkäufe zählen, bei Erfolg Belohnung und Vertrauen beim Lieferanten', () => {
    const sim = game(2);
    untilOffers(sim);
    const offer = contractOffers(sim.state)[0];
    // Den Umsatz-Vertrag erzwingen, damit der Test genau zählen kann.
    Object.assign(offer, { templateId: 'revenue', target: 1000, title: 'Test' });
    // Als Kleindealer gibt es kein Geld; für den Test eine Geld-Belohnung dazu (Buchungsgrund prüfen).
    offer.rewards.push({ kind: 'money', money: 'dirty', amount: 400 });
    const trust = offer.rewards.find((r) => r.kind === 'trust');
    const before = trust?.kind === 'trust' ? getRelation(sim.state, trust.supplierId).trust : 0;
    const dirty = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } }).ok).toBe(true);
    const events = recordEvents(sim);
    const sale = {
      channel: 'street' as const,
      spotId: 'uni',
      veedelId: 'lindenthal',
      productId: 'weed',
      amount: 10,
      quality: 0.6,
      revenue: 600,
      sellerId: null,
      customerId: null,
    };
    sim.step();
    sim.ctx('customers').emit('sale.completed', sale);
    sim.step();
    expect(contractProgress(sim.state)).toEqual([600, 1000]);
    // Hamburg zählt für einen Kölner Vertrag nicht.
    sim.ctx('customers').emit('sale.completed', { ...sale, veedelId: 'st-pauli' });
    sim.step();
    expect(contractProgress(sim.state)).toEqual([600, 1000]);
    sim.ctx('customers').emit('sale.completed', sale);
    sim.step();
    expect(activeContract(sim.state)).toBeNull();
    expect(eventsOfType(events, 'contract.finished')[0].payload.result).toBe('done');
    expect(sim.state.wallet.dirty).toBeGreaterThan(dirty);
    const booking = eventsOfType(events, 'wallet.changed').find((e) => e.payload.amount === 400);
    expect(booking?.payload.reason).toMatch(/^Wochenvertrag: /);
    if (trust?.kind === 'trust') expect(getRelation(sim.state, trust.supplierId).trust).toBeGreaterThan(before);
    expect(contractStats(sim.state).done).toBe(1);
  });

  it('Kleindealer bekommen kein Geld mit 0 €, Händler schon', () => {
    for (const t of CONTRACT_TEMPLATES) {
      const small = contractRewards(t, 0, 'frankfurt', 'weed');
      expect(
        small.some((r) => r.kind === 'money' && r.amount <= 0),
        t.id,
      ).toBe(false);
      expect(
        small.some((r) => r.kind === 'trust'),
        t.id,
      ).toBe(true);
      expect(
        contractRewards(t, 1, null, 'weed').some((r) => r.kind === 'money' && r.amount > 0),
        t.id,
      ).toBe(true);
    }
  });

  it('„Ein Veedel dazugewinnen“ zählt ab dem Annehmen, nicht ab dem Angebot', () => {
    const sim = game(2);
    untilOffers(sim);
    const offer = contractOffers(sim.state)[0];
    // Angebot am Montag mit 0 Veedel, inzwischen hält der Spieler eins.
    Object.assign(offer, { templateId: 'expand', target: 1, param: 0 });
    const ctx = sim.ctx('test');
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, 'kalk', f, -100);
    addInfluence(ctx, 'kalk', PLAYER_FACTION, 100);
    sim.step();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } }).ok).toBe(true);
    sim.step();
    expect(eventsOfType(events, 'contract.finished')).toHaveLength(0);
    expect(activeContract(sim.state)?.param).toBe(1);
  });

  it('nicht mehr schaffbare Verträge lassen sich nicht annehmen', () => {
    const sim = game(2);
    untilOffers(sim);
    const [first, second] = contractOffers(sim.state);
    // Serie mit 120 Stunden, aber nur noch knapp sechs Tage bis Sonntag.
    Object.assign(first, { templateId: 'quiet', target: 200 });
    expect(canAcceptContract(sim.state, first).ok).toBe(false);
    expect(sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: first.id } }).ok).toBe(false);
    // Veedel halten: beim Angebot drei, jetzt keins.
    Object.assign(second, { templateId: 'hold', target: 24, param: 3 });
    expect(canAcceptContract(sim.state, second)).toMatchObject({ ok: false });
  });

  it('läuft die Frist ab, platzt der Vertrag, und am Montag kommen neue Angebote', () => {
    const sim = game(2);
    untilOffers(sim);
    const offer = contractOffers(sim.state)[0];
    Object.assign(offer, { templateId: 'revenue', target: 10_000_000 });
    sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } });
    sim.advance(NEXT_MONDAY - sim.state.time - 60);
    expect(activeContract(sim.state)).not.toBeNull();
    sim.advance(60);
    expect(activeContract(sim.state)).toBeNull();
    expect(contractStats(sim.state).failed).toBe(1);
    sim.advance(8 * 60);
    expect(contractOffers(sim.state)).toHaveLength(3);
  });

  it('Angebote ohne Antwort verfallen am Ende der Woche', () => {
    const sim = game(2);
    untilOffers(sim);
    const ids = contractOffers(sim.state).map((o) => o.id);
    sim.advance(NEXT_MONDAY - sim.state.time + 60);
    expect(contractOffers(sim.state).some((o) => ids.includes(o.id))).toBe(false);
  });

  it('gleicher Seed, gleiche Angebote; der Wert eines Angebots ist positiv', () => {
    const offers = () => {
      const sim = game(9);
      untilOffers(sim);
      return contractOffers(sim.state);
    };
    const a = offers();
    expect(a).toEqual(offers());
    for (const o of a) expect(contractValue(o)).toBeGreaterThan(0);
  });

  it('in einer anderen Stadt als Köln gibt es Verträge auch ohne Köln komplett', () => {
    const sim = createTestGame({ seed: 2 });
    expect(contractsOpen(sim.state)).toBe(false);
    sim.state.modules.city.active = 'hamburg';
    expect(contractsOpen(sim.state)).toBe(true);
  });

  it('migriert Version 9 (Peters Quests mit Verträgen als Teil) auf Version 10: nur noch die Verträge', () => {
    const sim = game();
    untilOffers(sim);
    const offers = contractOffers(sim.state);
    expect(offers).toHaveLength(3);
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, Record<string, unknown>>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.quests = {
      index: 7,
      progress: 2,
      done: ['sell10'],
      skipped: [],
      title: 'Boss von Köln',
      startedAt: 0,
      fresh: false,
      orderedIn: ['koeln'],
      contracts: structuredClone(sim.state.modules.quests),
      phoneSteps: true,
    };
    raw.moduleVersions.quests = 9;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.quests).toEqual(sim.state.modules.quests);
    expect(contractOffers(loaded.state)).toHaveLength(3);
    expect(loaded.state.moduleVersions.quests).toBe(10);
    // Noch ältere Stände ohne Verträge fangen leer an.
    raw.modules.quests = { index: 0, progress: 0, done: [], skipped: [], title: null };
    raw.moduleVersions.quests = 2;
    const older = loadSimulation(raw, sim.modules);
    expect(older.state.modules.quests).toEqual({
      offers: [],
      active: null,
      history: [],
      stats: { offered: 0, accepted: 0, done: 0, failed: 0 },
    });
  });
});
