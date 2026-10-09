// Regressionstests zu Befunden aus dem Bugreview (Paket city): Tagesgewinn für den Verkauf ohne Anheuern, Rotterdam
// in cityAt, Erinnerung einer Stadt, die nach einer anderen Zusage wartet, Rotterdam mit sauberem Geld bezahlt.

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getRightHand, RIGHT_HAND_RANK_XP } from '../hierarchy';
import { channelFee, getChannel } from '../laundering';
import { enlist, generateProfile } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { OFFER_CALL_DELAY, OFFER_REMINDER_DAYS, ROTTERDAM_LAUNDERING_CHANNEL } from './config';
import {
  acceptedCity,
  businessDailyProfit,
  cityAt,
  cityContact,
  offerStatus,
  playableCities,
  saleOffer,
} from './index';

const DAY = MINUTES_PER_DAY;

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

/** Alle Veedel einer Stadt gehören dir (die Stadt ist komplett). */
function takeCity(sim: Simulation, cityId: string): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel(cityId)) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
}

/** Rechte Hand in Köln mit allen Aufgaben auf der höchsten Stufe (wie in order.test.ts). */
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
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } });
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

describe('Tagesgewinn für den Verkauf ohne Anheuern', () => {
  it('Anheuern zählt wie Ausbau nicht in den Tagesgewinn, laufende Ausgaben schon', () => {
    const run = (category: 'hiring' | 'expansion' | 'expense.other') => {
      const sim = quietGame();
      sim.state.wallet.dirty = 50_000;
      sim.advance(60);
      expect(wallet.pay(sim.ctx('test'), 4500, 'dirty', 'Test', { category, cityId: 'koeln' })).toBe(true);
      sim.advance(DAY);
      return businessDailyProfit(sim.state);
    };
    const expansion = run('expansion');
    expect(run('hiring')).toBe(expansion);
    // Gegenprobe: Die Buchung liegt im Zeitraum, eine laufende Ausgabe senkt den Tagesgewinn.
    expect(run('expense.other')).toBeLessThan(expansion);
  });
});

describe('cityAt kennt die Orte im Ausland', () => {
  it('ein Punkt in Rotterdam gehört zu Rotterdam, deutsche Punkte bleiben, wo sie waren', () => {
    expect(cityAt(4.39, 51.9)).toBe('rotterdam');
    expect(cityAt(6.958, 50.938)).toBe('koeln');
    expect(cityAt(9.99, 53.55)).toBe('hamburg');
    // Außerhalb aller Rahmen weiter die nächstgelegene deutsche Stadt.
    expect(cityAt(6.0, 51.3)).toBe('koeln');
  });
});

describe('Eine Stadt, die nach einer anderen Zusage wartet, meldet sich wieder', () => {
  it('Zusage an Hamburg, dann an Berlin: Hamburg erinnert nach OFFER_REMINDER_DAYS Tagen per Chat', () => {
    const sim = quietGame();
    readyRightHand(sim);
    takeCity(sim, 'koeln');
    sim.step();
    sim.advance(OFFER_CALL_DELAY + 5);
    const hamburg = cityContact('hamburg').id;
    const call = messages.ringingCalls(sim.state).find((m) => m.contactId === hamburg);
    if (!call) throw new Error('kein Anruf aus Hamburg');
    sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: call.id } });
    sim.dispatch({ type: 'messages.answer', payload: { messageId: call.id, optionId: 'come' } });
    expect(acceptedCity(sim.state)).toBe('hamburg');
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'berlin' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'city.answerOffer', payload: { choice: 'come', cityId: 'berlin' } }).ok).toBe(true);
    expect(acceptedCity(sim.state)).toBe('berlin');
    expect(offerStatus(sim.state, 'hamburg')).toBe('later');
    expect(sim.state.modules.city.offers.hamburg.remindAt).toBe(sim.state.time + OFFER_REMINDER_DAYS * DAY);
    const asked = () =>
      messages
        .thread(sim.state, hamburg)
        .filter((m) => messages.canAnswer(sim.state, m) && (m.options?.some((o) => o.id === 'come') ?? false));
    expect(asked()).toHaveLength(0);
    sim.advance(OFFER_REMINDER_DAYS * DAY + 5);
    expect(offerStatus(sim.state, 'hamburg')).toBe('later');
    expect(asked()).toHaveLength(1);
  });
});

describe('Rotterdam wird mit sauberem Geld bezahlt', () => {
  it('der Anteil geht beim Verkauf durch die Wäsche der Reederei: sauberes Konto gleich, Gebühr als Geldwäsche', () => {
    const sim = quietGame(4);
    for (const city of playableCities()) {
      if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
      takeCity(sim, city.id);
    }
    sim.advance(60);
    sim.state.modules.city.sale = { status: 'calling', callAt: null, sold: null };
    const offer = saleOffer(sim.state);
    const dirty = sim.state.wallet.dirty;
    const clean = sim.state.wallet.clean;
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(true);

    // Gebühr zum Satz der Reederei: so viel Schwarzgeld, dass genau der Preis von Rotterdam sauber herauskommt.
    const rate = channelFee(sim.state, ROTTERDAM_LAUNDERING_CHANNEL);
    const fee = Math.round(offer.rotterdamPrice / (1 - rate)) - offer.rotterdamPrice;
    expect(fee).toBeGreaterThan(0);
    expect(sim.state.wallet.clean).toBeCloseTo(clean, 0);
    expect(sim.state.wallet.dirty).toBeCloseTo(dirty + offer.price - offer.rotterdamPrice - fee, 0);
    expect(offer.rest).toBe(offer.price - offer.rotterdamPrice - fee);

    const changes = eventsOfType(events, 'wallet.changed').map((e) => e.payload);
    const rotterdam = changes.filter((c) => c.category === 'business.rotterdam');
    expect(rotterdam).toHaveLength(1);
    expect(rotterdam[0]).toMatchObject({ kind: 'clean', amount: -offer.rotterdamPrice, cityId: 'rotterdam' });
    const fees = changes.filter((c) => c.category === 'laundering');
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      kind: 'dirty',
      amount: -fee,
      cityId: 'rotterdam',
      reason: `Gebühr ${getChannel(ROTTERDAM_LAUNDERING_CHANNEL).name}`,
    });
  });
});
