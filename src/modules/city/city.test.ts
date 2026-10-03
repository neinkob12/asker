import { describe, expect, it } from 'vitest';
import { CALL_RETRY_MINUTES, CALL_RING_MINUTES, MINUTES_PER_DAY, messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getRightHand, RIGHT_HAND_RANK_XP } from '../hierarchy';
import { enlist, generateProfile } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { HARBOR_CALLER, OFFER_CALL_DELAY, OFFER_REMINDER_DAYS } from './config';
import { hamburgMissing, offerStatus } from './index';

/** Spiel ohne Laufkundschaft, damit nichts dazwischenkommt. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

/** Alle Kölner Veedel für den Spieler, dann bis zum Anruf vorspulen. */
function completeKoeln(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel()) {
    for (const faction of factions(sim.state)) if (faction !== PLAYER_FACTION) addInfluence(ctx, v.id, faction, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/** Rechte Hand auf höchster Stufe mit allen Aufgaben an. */
function readyRightHand(sim: Simulation): void {
  sim.state.wallet.dirty = 50000;
  const ctx = sim.ctx('staff');
  const hire = (level: number, loyalty: number) => {
    const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
    m.stats.loyalty = loyalty;
    return m;
  };
  const a = hire(2, 70);
  const b = hire(2, 70);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = hire(5, 90);
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
  const rh = getRightHand(sim.state);
  if (!rh) throw new Error('keine Rechte Hand');
  rh.xp = RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1];
  sim.dispatch({
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: true },
    },
  });
}

/** Der klingelnde Anruf von Fiete. */
function ringing(sim: Simulation) {
  return messages.ringingCalls(sim.state).find((m) => m.contactId === HARBOR_CALLER.id);
}

function acceptAndAnswer(sim: Simulation, optionId: string): void {
  const call = ringing(sim);
  if (!call) throw new Error('kein Anruf');
  expect(sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: call.id } }).ok).toBe(true);
  expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: call.id, optionId } }).ok).toBe(true);
}

describe('Der Anruf aus Hamburg', () => {
  it('kommt 30 Spielminuten nach Köln komplett, nicht vorher', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    completeKoeln(sim);
    expect(offerStatus(sim.state)).toBe('scheduled');
    sim.advance(OFFER_CALL_DELAY - 5);
    expect(ringing(sim)).toBeUndefined();
    sim.advance(10);
    expect(ringing(sim)?.call?.lines.length).toBeGreaterThanOrEqual(6);
    expect(offerStatus(sim.state)).toBe('calling');
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(1);
  });

  it('wartet, bis eine Konfrontation vorbei ist', () => {
    const sim = quietGame();
    completeKoeln(sim);
    // Eine laufende Konfrontation vortäuschen.
    sim.state.modules.encounters.active.push({ id: 999 } as never);
    sim.advance(OFFER_CALL_DELAY + 30);
    expect(ringing(sim)).toBeUndefined();
    sim.state.modules.encounters.active = [];
    sim.advance(10);
    expect(ringing(sim)).toBeDefined();
  });

  it('"Ich komme": ohne bereite Rechte Hand schreibt er, was fehlt, und ruft später von selbst wieder an', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    completeKoeln(sim);
    sim.advance(OFFER_CALL_DELAY + 5);
    acceptAndAnswer(sim, 'come');
    expect(offerStatus(sim.state)).toBe('house');
    expect(eventsOfType(events, 'city.offerAccepted')).toHaveLength(0);
    const texts = messages.thread(sim.state, HARBOR_CALLER.id).map((m) => m.text);
    expect(texts.some((t) => t.includes('Haus in Ordnung'))).toBe(true);
    expect(texts.some((t) => t.includes('keine Rechte Hand'))).toBe(true);
    expect(hamburgMissing(sim.state).length).toBeGreaterThan(0);

    readyRightHand(sim);
    expect(hamburgMissing(sim.state)).toEqual([]);
    sim.advance(60 + OFFER_CALL_DELAY + 5);
    expect(ringing(sim)).toBeDefined();
    acceptAndAnswer(sim, 'come');
    expect(offerStatus(sim.state)).toBe('accepted');
    expect(eventsOfType(events, 'city.offerAccepted')).toHaveLength(1);
  });

  it('"Ich brauch noch Zeit": alle 7 Tage per Chat, zusagen geht dort', () => {
    const sim = quietGame();
    completeKoeln(sim);
    sim.advance(OFFER_CALL_DELAY + 5);
    acceptAndAnswer(sim, 'later');
    expect(offerStatus(sim.state)).toBe('later');
    const before = messages.thread(sim.state, HARBOR_CALLER.id).length;
    sim.advance(OFFER_REMINDER_DAYS * MINUTES_PER_DAY + 10);
    const thread = messages.thread(sim.state, HARBOR_CALLER.id);
    expect(thread.length).toBeGreaterThan(before);
    const question = thread.find((m) => messages.canAnswer(sim.state, m));
    expect(question?.call).toBeUndefined();
    expect(question?.options?.map((o) => o.id)).toEqual(['come', 'later', 'stay']);
    // Kein neuer Anruf, nur Chat.
    expect(ringing(sim)).toBeUndefined();
    readyRightHand(sim);
    // Ohne Leute auf der Straße bröckelt der Einfluss in einer Woche: Für die Zusage müssen wieder alle Veedel her.
    completeKoeln(sim);
    expect(hamburgMissing(sim.state)).toEqual([]);
    expect(
      sim.dispatch({ type: 'messages.answer', payload: { messageId: question?.id ?? 0, optionId: 'come' } }).ok,
    ).toBe(true);
    expect(offerStatus(sim.state)).toBe('accepted');
  });

  it('"Köln reicht mir": er schreibt einmal, das Angebot steht im Chat', () => {
    const sim = quietGame();
    completeKoeln(sim);
    sim.advance(OFFER_CALL_DELAY + 5);
    acceptAndAnswer(sim, 'stay');
    expect(offerStatus(sim.state)).toBe('declined');
    sim.advance(20 * MINUTES_PER_DAY);
    const open = messages.thread(sim.state, HARBOR_CALLER.id).filter((m) => messages.canAnswer(sim.state, m));
    expect(open).toHaveLength(1);
    expect(open[0].options?.map((o) => o.id)).toEqual(['come']);
    expect(ringing(sim)).toBeUndefined();
  });

  it('nicht rangegangen: er versucht es dreimal, dann steht das Angebot im Chat', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    completeKoeln(sim);
    sim.advance(OFFER_CALL_DELAY + 5);
    sim.advance(3 * CALL_RING_MINUTES + 2 * CALL_RETRY_MINUTES + 10);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(3);
    const open = messages.thread(sim.state, HARBOR_CALLER.id).filter((m) => messages.canAnswer(sim.state, m));
    expect(open).toHaveLength(1);
    expect(open[0].call?.final).toBe(true);
  });

  it('deterministisch über zwei Durchläufe', () => {
    const run = () => {
      const sim = quietGame(5);
      completeKoeln(sim);
      sim.advance(OFFER_CALL_DELAY + CALL_RING_MINUTES + CALL_RETRY_MINUTES + 20);
      return sim.state;
    };
    expect(run()).toEqual(run());
  });
});
