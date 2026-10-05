// Boss von Deutschland und Verkauf (Auftrag 40): Jansen ruft an, die Statthalter bieten den Preis nach der Formel,
// Verkauf mit Rotterdam, danach keine Kasse pro Stadt mehr; alte Spielstände bleiben unberührt.

import { describe, expect, it } from 'vitest';
import { loadSimulation, messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { ROTTERDAM_SHARE, SALE_CALL_DELAY, SALE_PRICE_MIN, SALE_PROFIT_DAYS, SALE_REMINDER_DAYS } from './config';
import {
  activeCity,
  isBossOfGermany,
  isBusinessSold,
  jansenContact,
  ownedCities,
  playableCities,
  playerRank,
  presentCity,
  saleBlocker,
  salePriceFor,
  saleRecord,
  saleStatus,
} from './index';

const DAY = 1440;

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

/** Alle spielbaren Städte frei und komplett. */
function germany(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const city of playableCities()) {
    if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
    for (const v of allVeedel(city.id)) {
      for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
      addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    }
  }
  sim.advance(60);
}

describe('Verkaufspreis (Auftrag 40)', () => {
  it('90 Tagesgewinne, Rotterdam drei Viertel davon, nie unter der Untergrenze', () => {
    const offer = salePriceFor(40_000);
    expect(offer.price).toBe(40_000 * SALE_PROFIT_DAYS);
    expect(offer.rotterdamPrice).toBe(Math.round((offer.price * ROTTERDAM_SHARE) / 1000) * 1000);
    expect(offer.rest).toBe(offer.price - offer.rotterdamPrice);
    expect(salePriceFor(-5_000).price).toBe(SALE_PRICE_MIN);
  });
});

describe('Boss von Deutschland und Verkauf (Auftrag 40)', () => {
  it('Jansen ruft an, die Statthalter bieten, nach dem Verkauf bist du in Rotterdam und die Städte schlafen nicht mehr', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    expect(saleBlocker(sim.state)).not.toBeNull();
    germany(sim);
    expect(isBossOfGermany(sim.state)).toBe(true);
    expect(playerRank(sim.state).title).toBe('Boss von Deutschland');
    expect(saleStatus(sim.state)).toBe('scheduled');
    sim.advance(SALE_CALL_DELAY + 10);
    expect(saleStatus(sim.state)).toBe('calling');
    expect(eventsOfType(events, 'city.saleOffered')).toHaveLength(1);
    expect(messages.ringingCalls(sim.state).some((m) => m.contactId === jansenContact(sim.state).id)).toBe(true);
    // Verkaufen nur der Spieler.
    expect(sim.dispatch({ type: 'city.sell', payload: {} }, { actor: 'system' }).ok).toBe(false);
    const before = sim.state.wallet.dirty;
    const result = sim.dispatch({ type: 'city.sell', payload: {} });
    expect(result.ok).toBe(true);
    const record = saleRecord(sim.state);
    expect(record).not.toBeNull();
    expect(record?.cities).toEqual(playableCities().map((c) => c.id));
    expect(sim.state.wallet.dirty).toBeCloseTo(before + (record?.price ?? 0) - (record?.rotterdamPrice ?? 0), 0);
    expect(isBusinessSold(sim.state)).toBe(true);
    expect(ownedCities(sim.state)).toEqual([]);
    expect(eventsOfType(events, 'business.sold')).toHaveLength(1);
    // Auf dem Weg nach Rotterdam, danach dort; die alten Städte sind keine Ziele mehr.
    sim.advance(2 * DAY);
    expect(presentCity(sim.state)).toBe('rotterdam');
    expect(activeCity(sim.state)).toBe('rotterdam');
    expect(playerRank(sim.state).title).toBe('Importeur');
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'koeln' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'berlin' } }).ok).toBe(false);
    const slept = eventsOfType(events, 'city.slept').filter((e) => e.time > (record?.at ?? 0));
    expect(slept).toHaveLength(0);
    expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(false);
  });

  it('„Noch nicht“: Jansen meldet sich nach ein paar Tagen wieder per Chat', () => {
    const sim = quietGame(2);
    germany(sim);
    sim.advance(SALE_CALL_DELAY + 10);
    expect(sim.dispatch({ type: 'city.postponeSale', payload: {} }).ok).toBe(true);
    expect(saleStatus(sim.state)).toBe('later');
    const id = jansenContact(sim.state).id;
    const asked = () =>
      messages.thread(sim.state, id).filter((m) => m.options?.some((o) => o.id === 'sell') && !m.answer);
    sim.advance(SALE_REMINDER_DAYS * DAY + 30);
    expect(asked().length).toBeGreaterThanOrEqual(1);
    expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(true);
  });

  it('alte Spielstände ohne Verkauf bleiben unberührt (Migration auf Version 6)', () => {
    const sim = quietGame(3);
    const raw = JSON.parse(JSON.stringify(sim.state));
    delete raw.modules.city.sale;
    raw.moduleVersions.city = 5;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.city.sale).toEqual({ status: 'none', callAt: null, sold: null });
    expect(isBusinessSold(loaded.state)).toBe(false);
    loaded.advance(DAY);
    expect(saleStatus(loaded.state)).toBe('none');
  });
});
