// Zufall pro Stadt (Auftrag 40, Etappe 0): Marktindex, Rabatt-Aktionen und Marktereignisse würfeln je Stadt aus eigenem
// Schlüssel (Seed, Stadt, Tag, Zweck). Was Köln würfelt, hängt nicht davon ab, welche und wie viele Städte frei sind.

import { describe, expect, it } from 'vitest';
import { cityDayDice, keyedRandom } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';

const DAY = 1440;

function koelnDice(unlocked: string[]) {
  const sim = createTestGame({ seed: 7 });
  sim.state.modules.city.unlocked = ['koeln', ...unlocked];
  const events = recordEvents(sim);
  sim.advance(30 * DAY);
  return {
    index: sim.state.modules.market.index.koeln,
    deals: eventsOfType(events, 'supplier.dealStarted')
      .map((e) => e.payload)
      .filter((d) => d.cityId === 'koeln')
      .map((d) => [d.supplierId, d.packageId, d.discount, d.endsAt]),
    events: eventsOfType(events, 'events.marketStarted')
      .map((e) => e.payload)
      .filter((r) => r.cityId === 'koeln')
      .map((r) => [r.eventId, r.productId, r.factor, r.endsAt]),
  };
}

describe('Zufall pro Stadt', () => {
  it('keyedRandom und cityDayDice sind fest aus dem Schlüssel', () => {
    const a = keyedRandom('x');
    const b = keyedRandom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(cityDayDice(1, 'market.index', 'koeln', 3).random()).toBe(
      cityDayDice(1, 'market.index', 'koeln', 3).random(),
    );
    expect(cityDayDice(1, 'market.index', 'koeln', 3).random()).not.toBe(
      cityDayDice(1, 'market.index', 'hamburg', 3).random(),
    );
    expect(cityDayDice(1, 'market.index', 'koeln', 3).random()).not.toBe(
      cityDayDice(2, 'market.index', 'koeln', 3).random(),
    );
  });

  it('Kölns Index, Aktionen und Marktereignisse sind gleich, egal welche Städte frei sind', () => {
    const alone = koelnDice([]);
    expect(Object.keys(alone.index).length).toBeGreaterThan(0);
    expect(alone.deals.length + alone.events.length).toBeGreaterThan(0);
    for (const others of [['hamburg'], ['berlin', 'muenchen'], ['frankfurt', 'hamburg', 'berlin', 'muenchen']]) {
      expect(koelnDice(others), others.join(',')).toEqual(alone);
    }
  });
});
