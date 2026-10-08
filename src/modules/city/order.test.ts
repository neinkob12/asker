// Freie Reihenfolge nach Köln (Auftrag 36): Angebote pro Stadt, die nächstgelegene ruft zuerst an, die anderen melden
// sich per Chat, ein Tipp auf die Karte holt den Anruf, nur eine Zusage gilt, Übergabe in die gewählte Stadt.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSaveFile,
  type GameState,
  loadSimulation,
  MINUTES_PER_DAY,
  messages,
  parseSaveFile,
  type Simulation,
  serializeSave,
} from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getRightHand, hasFullPower, RIGHT_HAND_RANK_XP } from '../hierarchy';
import { enlist, generateProfile } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { OFFER_CALL_DELAY, OFFER_NEXT_DELAY } from './config';
import { CITIES, type CityDef } from './data';
import {
  acceptedCity,
  cityContact,
  currentOffer,
  freeCities,
  isCityUnlocked,
  nextCityAfter,
  offerCities,
  offerFrom,
  offerStatus,
  presentCity,
} from './index';

const berlin = CITIES.find((c) => c.id === 'berlin') as CityDef & { template?: boolean };
const muenchen = CITIES.find((c) => c.id === 'muenchen') as CityDef & { template?: boolean };
const frankfurt = CITIES.find((c) => c.id === 'frankfurt') as CityDef & { template?: boolean };
/** Schablonen-Flags aller Städte, wie sie in den Daten stehen (vor jedem Test gesichert, danach zurück). */
const templates = new Map(CITIES.map((c) => [c.id, c.template]));
/**
 * Die Tests hier prüfen die Reihenfolge mit Hamburg, Berlin und Frankfurt (offerRank 1, meldet sich zuletzt): Berlin ist
 * zunächst Schablone und wird pro Test freigeschaltet, München bleibt Schablone (der letzte Test prüft München selbst).
 */
beforeEach(() => {
  berlin.template = true;
  muenchen.template = true;
});
afterEach(() => {
  for (const c of CITIES as (CityDef & { template?: boolean })[]) {
    const flag = templates.get(c.id);
    if (flag === undefined) delete c.template;
    else c.template = flag;
  }
});

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

function completeKoeln(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel('koeln')) {
    for (const faction of factions(sim.state)) if (faction !== PLAYER_FACTION) addInfluence(ctx, v.id, faction, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

function takeCity(sim: Simulation, cityId: string): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel(cityId)) {
    for (const faction of factions(sim.state)) if (faction !== PLAYER_FACTION) addInfluence(ctx, v.id, faction, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/** Köln komplett, übergeben, in Hamburg angekommen. */
function moveToHamburg(sim: Simulation): void {
  readyRightHand(sim);
  completeKoeln(sim);
  expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'hamburg' } }).ok).toBe(true);
  sim.advance(6 * 60);
  expect(presentCity(sim.state)).toBe('hamburg');
}

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
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
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

function ringingFrom(sim: Simulation, cityId: string) {
  return messages.ringingCalls(sim.state).find((m) => m.contactId === cityContact(cityId).id);
}

describe('Freie Reihenfolge (Auftrag 36)', () => {
  it('jede Stadt hat einen Kontakt mit Gesicht und Stimme und einen Satz Dreh', () => {
    for (const city of CITIES.filter((c) => c.id !== 'koeln')) {
      expect(city.contact.look, city.id).toBeDefined();
      expect(city.contact.voice, city.id).toBeDefined();
      expect(city.pitch.length, city.id).toBeGreaterThan(10);
    }
    expect(new Set(CITIES.map((c) => c.contact.id)).size).toBe(CITIES.length);
  });

  it('Schablonen bleiben gesperrt, Frankfurt kommt zuletzt: Nach Köln komplett ruft Hamburg an', () => {
    const sim = quietGame();
    expect(freeCities(sim.state)).toEqual(['hamburg', 'frankfurt']);
    completeKoeln(sim);
    expect(offerFrom(sim.state)).toBe('koeln');
    // Frankfurt liegt näher an Köln, meldet sich als optionale Stadt aber erst nach Hamburg (offerRank).
    expect(offerCities(sim.state)).toEqual(['hamburg', 'frankfurt']);
    expect(offerStatus(sim.state, 'hamburg')).toBe('scheduled');
    expect(offerStatus(sim.state, 'frankfurt')).toBe('queued');
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'berlin' } }).ok).toBe(false);
    sim.advance(OFFER_CALL_DELAY + 5);
    expect(ringingFrom(sim, 'hamburg')).toBeDefined();
  });

  it('die nächstgelegene ruft zuerst an, die andere meldet sich per Chat und ruft auf Wunsch an', () => {
    berlin.template = false;
    const sim = quietGame();
    readyRightHand(sim);
    completeKoeln(sim);
    // Von Köln aus ist Hamburg näher als Berlin; Frankfurt kommt zuletzt.
    expect(offerCities(sim.state)).toEqual(['hamburg', 'berlin', 'frankfurt']);
    expect(offerStatus(sim.state, 'berlin')).toBe('queued');
    sim.advance(OFFER_CALL_DELAY + 5);
    const call = ringingFrom(sim, 'hamburg');
    expect(call).toBeDefined();
    // Solange Hamburg klingelt, ruft keine andere Stadt an.
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'berlin' } }).ok).toBe(false);
    // Hamburg später; Berlin meldet sich danach per Chat.
    if (!call) throw new Error('kein Anruf');
    sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: call.id } });
    sim.dispatch({ type: 'messages.answer', payload: { messageId: call.id, optionId: 'later' } });
    expect(offerStatus(sim.state, 'hamburg')).toBe('later');
    sim.advance(OFFER_NEXT_DELAY);
    expect(offerStatus(sim.state, 'berlin')).toBe('pitched');
    const pitch = messages.thread(sim.state, cityContact('berlin').id).find((m) => messages.canAnswer(sim.state, m));
    expect(pitch?.options?.[0].id).toBe('callMe');
    // Berlin per Tipp anrufen lassen und zusagen.
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'berlin' } }).ok).toBe(true);
    const fromBerlin = ringingFrom(sim, 'berlin');
    expect(fromBerlin).toBeDefined();
    if (!fromBerlin) throw new Error('kein Anruf aus Berlin');
    const events = recordEvents(sim);
    sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: fromBerlin.id } });
    sim.dispatch({ type: 'messages.answer', payload: { messageId: fromBerlin.id, optionId: 'come' } });
    expect(offerStatus(sim.state, 'berlin')).toBe('accepted');
    expect(acceptedCity(sim.state)).toBe('berlin');
    expect(eventsOfType(events, 'city.offerAccepted').map((e) => e.payload)).toEqual([
      { cityId: 'berlin', from: 'koeln' },
    ]);
    // Übergeben: Berlin wird frei, nicht Hamburg, und du fährst hin.
    expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'berlin' } }).ok).toBe(true);
    expect(hasFullPower(sim.state, 'koeln')).toBe(true);
    expect(isCityUnlocked(sim.state, 'berlin')).toBe(true);
    expect(isCityUnlocked(sim.state, 'hamburg')).toBe(false);
    expect(offerFrom(sim.state)).toBeNull();
    // Die Runde ist vorbei: Hamburgs offene Fragen sind weg, das Angebot ruht bis zur nächsten kompletten Stadt.
    expect(offerStatus(sim.state, 'hamburg')).toBe('none');
    sim.advance(MINUTES_PER_DAY);
    expect(presentCity(sim.state)).toBe('berlin');
  });

  it('offerRank: Auch mit Berlin und München frei ruft Frankfurt nie zuerst an', () => {
    berlin.template = false;
    muenchen.template = false;
    const sim = quietGame();
    readyRightHand(sim);
    completeKoeln(sim);
    const order = offerCities(sim.state);
    // Nach Entfernung von Köln: Hamburg, München, Berlin; Frankfurt (am nächsten) mit Rang 1 zuletzt.
    expect(order).toEqual(['hamburg', 'muenchen', 'berlin', 'frankfurt']);
    sim.advance(OFFER_CALL_DELAY + 5);
    expect(ringingFrom(sim, 'hamburg')).toBeDefined();
    expect(ringingFrom(sim, 'frankfurt')).toBeUndefined();
  });

  it('Frankfurt (offerRank 1): Hamburg ruft an, Frankfurt meldet sich per Chat und lässt sich trotzdem zusagen', () => {
    const sim = quietGame();
    readyRightHand(sim);
    completeKoeln(sim);
    expect(offerCities(sim.state)).toEqual(['hamburg', 'frankfurt']);
    sim.advance(OFFER_CALL_DELAY + 5);
    const call = ringingFrom(sim, 'hamburg');
    expect(call).toBeDefined();
    expect(ringingFrom(sim, 'frankfurt')).toBeUndefined();
    if (!call) throw new Error('kein Anruf');
    sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: call.id } });
    sim.dispatch({ type: 'messages.answer', payload: { messageId: call.id, optionId: 'later' } });
    sim.advance(OFFER_NEXT_DELAY);
    // Frankfurt schreibt: „Ruf mich an“.
    expect(offerStatus(sim.state, 'frankfurt')).toBe('pitched');
    const pitch = messages.thread(sim.state, cityContact('frankfurt').id).find((m) => messages.canAnswer(sim.state, m));
    expect(pitch?.options?.[0].id).toBe('callMe');
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'frankfurt' } }).ok).toBe(true);
    const fromFrankfurt = ringingFrom(sim, 'frankfurt');
    if (!fromFrankfurt) throw new Error('kein Anruf aus Frankfurt');
    sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: fromFrankfurt.id } });
    sim.dispatch({ type: 'messages.answer', payload: { messageId: fromFrankfurt.id, optionId: 'come' } });
    expect(acceptedCity(sim.state)).toBe('frankfurt');
    expect(sim.dispatch({ type: 'city.handOver', payload: { cityId: 'koeln', toCityId: 'frankfurt' } }).ok).toBe(true);
    expect(isCityUnlocked(sim.state, 'frankfurt')).toBe(true);
    expect(isCityUnlocked(sim.state, 'hamburg')).toBe(false);
    sim.advance(MINUTES_PER_DAY);
    expect(presentCity(sim.state)).toBe('frankfurt');
  });

  it('nur eine Zusage gilt: Wer danach einer anderen Stadt zusagt, lässt die erste warten', () => {
    berlin.template = false;
    const sim = quietGame();
    readyRightHand(sim);
    completeKoeln(sim);
    sim.advance(OFFER_CALL_DELAY + 5);
    const call = ringingFrom(sim, 'hamburg');
    if (!call) throw new Error('kein Anruf');
    sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: call.id } });
    sim.dispatch({ type: 'messages.answer', payload: { messageId: call.id, optionId: 'come' } });
    expect(acceptedCity(sim.state)).toBe('hamburg');
    sim.dispatch({ type: 'city.answerOffer', payload: { choice: 'come', cityId: 'berlin' } });
    // Berlin hat sich noch nicht gemeldet: keine Zusage möglich.
    expect(acceptedCity(sim.state)).toBe('hamburg');
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'berlin' } }).ok).toBe(true);
    sim.dispatch({ type: 'city.answerOffer', payload: { choice: 'come', cityId: 'berlin' } });
    expect(acceptedCity(sim.state)).toBe('berlin');
    expect(offerStatus(sim.state, 'hamburg')).toBe('later');
    // Die Vollmacht direkt (Seite der Rechten Hand) schaltet die zugesagte Stadt frei.
    expect(sim.dispatch({ type: 'hierarchy.grantFullPower', payload: { cityId: 'koeln' } }).ok).toBe(true);
    expect(isCityUnlocked(sim.state, 'berlin')).toBe(true);
    expect(isCityUnlocked(sim.state, 'hamburg')).toBe(false);
  });

  it('alte Spielstände (Version 3) bekommen Hamburgs Angebot als Angebot pro Stadt', () => {
    const sim = quietGame();
    const saved = structuredClone(sim.state) as GameState;
    const { offers: _o, offerFrom: _f, rounds: _r, ...rest } = saved.modules.city;
    (saved.modules as unknown as Record<string, unknown>).city = {
      ...rest,
      offer: { status: 'later', callAt: null, remindAt: 123 },
    };
    saved.moduleVersions.city = 3;
    const file = parseSaveFile(serializeSave(createSaveFile(saved, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    expect(offerStatus(loaded.state, 'hamburg')).toBe('later');
    expect(offerStatus(loaded.state)).toBe('later');
    expect(offerFrom(loaded.state)).toBe('koeln');
    expect(loaded.state.modules.city.rounds).toEqual(['koeln']);
  });

  it('zwei Runden: Nach Hamburg komplett zählen Berlin und Frankfurt, Hamburgs erledigtes Angebot nicht mehr', () => {
    const sim = quietGame();
    moveToHamburg(sim);
    berlin.template = false;
    expect(offerStatus(sim.state, 'hamburg')).toBe('none');
    takeCity(sim, 'hamburg');
    expect(offerFrom(sim.state)).toBe('hamburg');
    expect(offerCities(sim.state)).toEqual(['berlin', 'frankfurt']);
    expect(sim.dispatch({ type: 'city.requestCall', payload: { cityId: 'berlin' } }).ok).toBe(true);
    sim.dispatch({ type: 'city.answerOffer', payload: { choice: 'later', cityId: 'berlin' } });
    expect(currentOffer(sim.state)).toBe('berlin');
    expect(offerStatus(sim.state)).toBe('later');
    // Ohne Zusage und ohne Anruf wird keine andere Stadt frei.
    expect(nextCityAfter(sim.state, 'koeln')).toBeNull();
  });

  it('eine leere Runde (keine Stadt frei) kommt nach, sobald eine Stadt spielbar wird', () => {
    frankfurt.template = true;
    const sim = quietGame();
    moveToHamburg(sim);
    takeCity(sim, 'hamburg');
    // Berlin ist noch Schablone: keine Runde, nichts verbraucht.
    expect(offerFrom(sim.state)).toBeNull();
    expect(sim.state.modules.city.rounds).not.toContain('hamburg');
    berlin.template = false;
    sim.advance(60);
    expect(offerFrom(sim.state)).toBe('hamburg');
    // Berlin ruft an (oder gleich).
    expect(['scheduled', 'calling']).toContain(offerStatus(sim.state, 'berlin'));
  });

  it('Version 4 → 5: leere Runden fallen weg, ein zu früh vergebener Boss von Deutschland wird neu bestimmt', () => {
    const sim = quietGame();
    moveToHamburg(sim);
    const saved = structuredClone(sim.state) as GameState;
    const city = saved.modules.city as unknown as Record<string, unknown>;
    delete city.startMoneyPaid;
    city.rounds = ['koeln', 'hamburg'];
    city.rank = { id: 'bossGermany', title: 'Boss von Deutschland', score: 50, at: 100 };
    saved.moduleVersions.city = 4;
    const file = parseSaveFile(serializeSave(createSaveFile(saved, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    expect(loaded.state.modules.city.rounds).toEqual(['koeln']);
    expect(loaded.state.modules.city.startMoneyPaid).toEqual([]);
    expect(loaded.state.modules.city.rank.quiet).toBe(true);
    // Der nächste Schritt übernimmt still, was der Stand hergibt (Köln komplett: Boss von Köln), ohne Banner.
    const events = recordEvents(loaded);
    loaded.advance(60);
    expect(loaded.state.modules.city.rank.title).toBe('Boss von Köln');
    expect(loaded.state.modules.city.rank.quiet).toBeUndefined();
    expect(eventsOfType(events, 'player.rankUp')).toHaveLength(0);
  });
});
