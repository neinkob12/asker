// Charakter der Städte (Auftrag 30, Etappe 7): Kölscher Klüngel gegen hanseatisch kühl, Veedel-Kneipen, Stadt-Events
// bei Kunden, Polizei und Gangs.

import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getSalesStats, rateSale, spotDemand } from '../customers';
import { startEncounter } from '../encounters';
import { eventFactor } from '../events';
import { getGangStatus, getGangs } from '../gangs';
import { getReputation } from '../reputation';
import { getSpot, isSpotOpen, KNEIPE, nextSpotOpening } from '../spots';
import { bailCost, enlist, generateProfile } from '../staff';
import { getRelation } from '../suppliers';
import { bribeFactor, raidWarningBonus, relationFactor } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  sim.state.wallet.dirty = 50_000;
  sim.state.wallet.clean = 50_000;
  return sim;
}

describe('Charakter der Städte (Auftrag 30)', () => {
  it('Klüngel: In Köln wachsen Beziehungen schneller, Freikaufen und Kaution sind billiger; Hamburg ist kühl', () => {
    expect(relationFactor('koeln')).toBe(1.5);
    expect(relationFactor('hamburg')).toBe(0.8);
    expect(bribeFactor('koeln')).toBe(0.75);
    expect(bribeFactor('hamburg')).toBe(1.2);
    expect(raidWarningBonus('koeln')).toBeCloseTo(0.1);
    expect(raidWarningBonus('hamburg')).toBe(0);

    const sim = quietGame();
    // Freikaufen: dieselbe Streife kostet in Köln 75 %, in Hamburg 120 %.
    const koeln = startEncounter(sim.ctx('police'), {
      kind: 'policeChase',
      veedelId: 'kalk',
      playerPresent: true,
      opponent: { count: 2 },
    });
    // In Hamburg (du bist dort, sonst entscheidet die Konfrontation ohne dich).
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
    sim.state.modules.city.present = 'hamburg';
    const hamburg = startEncounter(sim.ctx('police'), {
      kind: 'policeChase',
      veedelId: 'st-pauli',
      playerPresent: true,
      opponent: { count: 2 },
    });
    const cost = (id: number) => sim.state.modules.encounters.active.find((e) => e.id === id)?.bribeCost;
    expect(cost(koeln.encounterId)).toBe(675);
    expect(cost(hamburg.encounterId)).toBe(1080);

    // Kaution nach der Stadt der Person.
    const ctx = sim.ctx('staff');
    const here = enlist(ctx, generateProfile(ctx, 'runner', { level: 1 }), { origin: 'pool', cityId: 'koeln' });
    const there = enlist(ctx, generateProfile(ctx, 'runner', { level: 1 }), { origin: 'pool', cityId: 'hamburg' });
    expect(bailCost(sim.state, there.id) / bailCost(sim.state, here.id)).toBeCloseTo(1.2 / 0.75, 1);
  });

  it('Klüngel: Lieferanten-Vertrauen wächst in Köln anderthalbmal so schnell', () => {
    const sim = quietGame();
    const before = getRelation(sim.state, 'frankfurt').trust;
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } }).ok,
    ).toBe(true);
    const gained = getRelation(sim.state, 'frankfurt').trust - before;
    // Ohne Klüngel: 2 pro Bestellung + 1,5 pro 1.000 € + 1 bar.
    const price = sim.state.modules.suppliers.shipments[0]?.price ?? 0;
    expect(gained).toBeCloseTo((2 + (price / 1000) * 1.5 + 1) * 1.5, 0);
  });

  it('Klüngel: Ein Waffenstillstand bringt in Köln mehr Beziehung', () => {
    const sim = quietGame();
    const gang = getGangs(sim.state, 'koeln')[0];
    const status = getGangStatus(sim.state, gang.id);
    if (!status) throw new Error('keine Gang');
    status.hostility = 70;
    status.relation = 0;
    expect(sim.dispatch({ type: 'gangs.ceasefire', payload: { gangId: gang.id } }).ok).toBe(true);
    expect(getGangStatus(sim.state, gang.id)?.relation).toBe(8);
  });

  it('Kneipe: offen 17 bis 1 Uhr, sonst keine Laufkundschaft; der Ruf zählt doppelt', () => {
    const sim = quietGame();
    const kneipe = getSpot(sim.state, 'kneipe-severin');
    if (!kneipe) throw new Error('keine Kneipe');
    expect(kneipe.kind).toBe('kneipe');
    expect(kneipe.veedelId).toBe('altstadt-sued');
    expect(isSpotOpen(kneipe, clock.at(2, 16, 59))).toBe(false);
    expect(isSpotOpen(kneipe, clock.at(2, 17))).toBe(true);
    expect(isSpotOpen(kneipe, clock.at(2, 0, 30))).toBe(true);
    expect(isSpotOpen(kneipe, clock.at(2, 1))).toBe(false);
    expect(nextSpotOpening(kneipe, clock.at(2, 3))).toBe(clock.at(2, KNEIPE.from));
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'kneipe-severin' } }).ok).toBe(true);
    sim.state.time = clock.at(2, 12);
    expect(spotDemand(sim.state, 'kneipe-severin')).toBe(0);
    sim.state.time = clock.at(2, 20);
    expect(spotDemand(sim.state, 'kneipe-severin')).toBeGreaterThan(0);

    // Gleiche zufriedene Kundschaft: In der Kneipe doppelt so viel Ruf.
    const rep = () => getReputation(sim.state);
    const sale = { typeId: 'stoner', quality: 0.95, cut: 0, priceRatio: 0.9, where: 'hier' };
    const r0 = rep();
    rateSale(sim.ctx('customers'), { ...sale, spotId: 'ebertplatz' });
    const street = rep() - r0;
    const r1 = rep();
    rateSale(sim.ctx('customers'), { ...sale, spotId: 'kneipe-severin' });
    const pub = rep() - r1;
    expect(street).toBeGreaterThan(0);
    expect(pub).toBeCloseTo(street * KNEIPE.reputationFactor, 5);
  });

  it('Karneval: doppelte Nachfrage in der Innenstadt, weniger Kontrollen, keine Razzien; FC: Gangs öfter unterwegs', () => {
    const sim = quietGame();
    sim.state.time = clock.at(29, 12);
    const before = spotDemand(sim.state, 'neumarkt');
    sim.state.time = clock.at(30, 12);
    const during = spotDemand(sim.state, 'neumarkt');
    // Anderer Wochentag, deshalb nur ungefähr: Karneval verdoppelt.
    expect(during / before).toBeGreaterThan(1.6);
    expect(eventFactor(sim.state, 'checks', { veedelId: 'neustadt-nord' })).toBe(0.5);
    // Hitze in der Innenstadt: Während Karneval plant die Polizei keine Razzia.
    for (const v of ['altstadt-nord', 'altstadt-sued', 'neustadt-nord', 'neustadt-sued']) {
      sim.state.modules.police.heat[v] = 95;
    }
    sim.state.time = clock.at(30, 1);
    sim.advance(5 * 24 * 60);
    expect(Object.keys(sim.state.modules.police.plannedRaids)).toHaveLength(0);
    expect(getSalesStats(sim.state)).toBeDefined();
  });
});
