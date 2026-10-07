// Razzia-Countdown (Auftrag 44, Teil 3): Auslöser beim Planen einer Razzia, versteckter Anteil aus dem Score,
// Minderung der Beschlagnahme, Rechte Hand, timeout (wie bisher), Großrazzia und Migration.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store } from '../goods';
import { activeChallenge, MINIGAME_KINDS, MINIGAME_TIMEOUT } from '../minigames';
import { RAID_LEAD_TIME, STASH_MAX } from './config';
import { type StashParams, stashShare, tipOffAgainstPlayer } from './index';

/** Spiel ohne zufällig auftauchende Kunden, mit Ware im Lager Ehrenfeld und Schwarzgeld. */
function game(seed = 3): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.dirty = 20_000;
  store(sim.ctx('goods'), { productId: 'weed', amount: 1000, warehouseId: 'ehrenfeld' });
  store(sim.ctx('goods'), { productId: 'kush', amount: 200, warehouseId: 'ehrenfeld' });
  return sim;
}

/** Händler mit einem Läufer in Ehrenfeld (dort steht das Lager): Razzien treffen das ganze Veedel samt Lager. */
function dealerInEhrenfeld(sim: Simulation): void {
  const spot = sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'venloer' } });
  if (!spot.ok) throw new Error(spot.reason);
  for (const spotId of ['venloer', 'ebertplatz', 'neumarkt', 'zuelpicher']) {
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  }
  sim.advance(60);
  // Ohne Läufer verkauft niemand nebenher: Die Ware im Lager bleibt bis zur Razzia, wie sie ist.
  for (const m of sim.state.modules.staff.members) m.assignment = null;
  sim.state.modules.staff.members[0].assignment = { kind: 'spot', targetId: 'venloer' };
}

/** Plant eine Razzia gegen dich in Ehrenfeld (Tipp einer Gang), gibt zurück, ob sie geplant wurde. */
function planEhrenfeld(sim: Simulation): boolean {
  return tipOffAgainstPlayer(sim.ctx('gangs'), 'ehrenfeld', 0, true);
}

/** Bis kurz nach der Razzia spielen und ihr Ereignis holen. */
function raidAfter(sim: Simulation, events: ReturnType<typeof recordEvents>) {
  sim.advance(RAID_LEAD_TIME + 60);
  return eventsOfType(events, 'police.raid').find((e) => e.payload.target === 'player')?.payload;
}

describe('Razzia-Countdown', () => {
  it('ist scharf und zählt Vorsicht der Rechten Hand', () => {
    expect(MINIGAME_KINDS.stash).toMatchObject({ ready: true, stat: 'caution' });
  });

  it('eine geplante Razzia im Veedel deines Lagers startet das Minispiel mit Lager, Partien und Tipp', () => {
    const sim = game();
    dealerInEhrenfeld(sim);
    const events = recordEvents(sim);
    expect(planEhrenfeld(sim)).toBe(true);
    const c = activeChallenge(sim.state);
    expect(c).toMatchObject({
      kind: 'stash',
      origin: { module: 'police', ref: 'raid:ehrenfeld' },
      cityId: 'koeln',
      veedelId: 'ehrenfeld',
    });
    const params = c?.params as unknown as StashParams;
    expect(params).toMatchObject({ scope: 'veedel', setting: 'warehouse', minutes: RAID_LEAD_TIME });
    expect(params.warehouse).toMatchObject({ id: 'ehrenfeld', vault: 0, cover: 0 });
    expect(params.lots.map((l) => l.productId).sort()).toEqual(['kush', 'weed']);
    expect(params.lots.find((l) => l.productId === 'weed')?.amount).toBeGreaterThanOrEqual(1000);
    expect(params.money).toBeGreaterThan(0);
    // Ohne Kontakt bei der Polizei kommt der Tipp vom Büdchen.
    expect(c?.situation).toContain('Ömer');
    sim.step();
    expect(eventsOfType(events, 'minigame.started')).toHaveLength(1);
  });

  it('gut versteckt: weniger Ware und Geld weg, das Ereignis sagt, was gerettet wurde', () => {
    const plain = game();
    dealerInEhrenfeld(plain);
    const plainEvents = recordEvents(plain);
    planEhrenfeld(plain);
    plain.state.modules.minigames.active = [];
    const before = getStock(plain.state, { warehouseId: 'ehrenfeld' });
    const full = raidAfter(plain, plainEvents);

    const sim = game();
    dealerInEhrenfeld(sim);
    const events = recordEvents(sim);
    planEhrenfeld(sim);
    const id = activeChallenge(sim.state)?.id ?? 0;
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id, score: 1, picks: ['vault:2'] } }).ok).toBe(true);
    expect(sim.state.modules.police.plannedRaids.ehrenfeld.stash).toBe(STASH_MAX);
    const raid = raidAfter(sim, events);

    expect(full?.goods ?? 0).toBeGreaterThan(0);
    expect(raid?.goods ?? 0).toBeLessThan(full?.goods ?? 0);
    expect(raid?.goods ?? 0).toBeLessThanOrEqual(Math.ceil((full?.goods ?? 0) * (1 - STASH_MAX)) + 2);
    expect(raid?.money ?? 0).toBeLessThan(full?.money ?? 0);
    expect(raid?.stashed).toMatchObject({ share: STASH_MAX });
    // Gerettet plus beschlagnahmt ist etwa die volle Beute (die Ware am Ort zählt nach dem Lager, gerundet wird je Posten).
    const sum = (raid?.stashed?.goods ?? 0) + (raid?.goods ?? 0);
    expect(Math.abs(sum - (full?.goods ?? 0))).toBeLessThanOrEqual((full?.goods ?? 0) * 0.05);
    expect(raid?.stashed?.money ?? 0).toBeGreaterThan(0);
    // (Der Läufer am Spot verkauft nebenbei auch etwas.)
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBeLessThanOrEqual(before - (raid?.goods ?? 0));
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBeGreaterThan(before - (full?.goods ?? 0));
    const texts = sim.state.journal.map((e) => e.text);
    expect(texts.some((t) => t.includes('vor der Razzia aufgeräumt'))).toBe(true);
    expect(texts.some((t) => t.includes('Gut versteckt'))).toBe(true);
  });

  it('Score wird zum Anteil, höchstens STASH_MAX', () => {
    expect(stashShare(0)).toBe(0);
    expect(stashShare(0.42)).toBe(0.42);
    expect(stashShare(1)).toBe(STASH_MAX);
    expect(stashShare(Number.NaN)).toBe(0);
  });

  it('ohne Oberfläche (timeout): genau wie ohne Minispiel', () => {
    const old = game();
    dealerInEhrenfeld(old);
    const oldEvents = recordEvents(old);
    MINIGAME_KINDS.stash.ready = false;
    try {
      planEhrenfeld(old);
      expect(activeChallenge(old.state)).toBeUndefined();
    } finally {
      MINIGAME_KINDS.stash.ready = true;
    }
    const expected = raidAfter(old, oldEvents);

    const sim = game();
    dealerInEhrenfeld(sim);
    const events = recordEvents(sim);
    planEhrenfeld(sim);
    expect(activeChallenge(sim.state)?.kind).toBe('stash');
    sim.advance(MINIGAME_TIMEOUT);
    expect(activeChallenge(sim.state)).toBeUndefined();
    expect(eventsOfType(events, 'minigame.finished')[0].payload).toMatchObject({ by: 'timeout', score: null });
    expect(sim.state.modules.police.plannedRaids.ehrenfeld.stash).toBeUndefined();
    sim.advance(RAID_LEAD_TIME + 60 - MINIGAME_TIMEOUT);
    const raid = eventsOfType(events, 'police.raid').find((e) => e.payload.target === 'player')?.payload;
    expect(raid).toEqual(expected);
    expect(raid?.stashed).toBeUndefined();
    expect(sim.state.wallet.dirty).toBe(old.state.wallet.dirty);
  });

  it('die Rechte Hand übernimmt: ihr Score gilt wie beim Spieler', () => {
    const sim = game();
    dealerInEhrenfeld(sim);
    planEhrenfeld(sim);
    const c = activeChallenge(sim.state);
    if (!c) throw new Error('kein Minispiel');
    sim.state.modules.minigames.active = [];
    sim.ctx('minigames').emit('minigame.finished', {
      id: c.id,
      kind: 'stash',
      origin: c.origin,
      cityId: 'koeln',
      score: 0.25,
      won: false,
      by: 'rightHand',
      picks: [],
    });
    sim.step();
    expect(sim.state.modules.police.plannedRaids.ehrenfeld.stash).toBe(0.25);
    expect(sim.state.journal.some((e) => e.text.startsWith('Deine Rechte Hand hat vor der Razzia'))).toBe(true);
  });

  it('Kleindealer: Razzia am Spot, die Bühne ist die Straße', () => {
    const sim = game();
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
    sim.advance(60);
    expect(tipOffAgainstPlayer(sim.ctx('gangs'), 'neustadt-sued', 0, true)).toBe(true);
    const params = activeChallenge(sim.state)?.params as unknown as StashParams;
    expect(params).toMatchObject({ scope: 'spot', setting: 'street' });
    expect(params.warehouse).toBeUndefined();
    expect(params.lots.length).toBeGreaterThan(0);
    expect(params.place.startsWith('am ') || params.place.startsWith('an ') || params.place.startsWith('auf ')).toBe(
      true,
    );
  });

  it('kein Minispiel ohne Ware oder wenn du nicht in der Stadt bist', () => {
    const empty = createTestGame({ seed: 3 });
    empty.state.modules.goods.stock = {};
    empty.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
    empty.advance(60);
    expect(tipOffAgainstPlayer(empty.ctx('gangs'), 'neustadt-sued', 0, true)).toBe(true);
    expect(activeChallenge(empty.state)).toBeUndefined();

    const away = game();
    away.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
    away.advance(60);
    away.state.modules.city.present = 'hamburg';
    expect(tipOffAgainstPlayer(away.ctx('gangs'), 'neustadt-sued', 0, true)).toBe(true);
    expect(activeChallenge(away.state)).toBeUndefined();
  });

  it('Großrazzia: der Anteil gilt für alle Veedel', () => {
    const sim = game();
    dealerInEhrenfeld(sim);
    const events = recordEvents(sim);
    sim.state.modules.police.majorRaid = { at: sim.state.time + 120, veedelIds: ['ehrenfeld', 'neustadt-sued'] };
    sim.ctx('minigames').emit('minigame.finished', {
      id: 99,
      kind: 'stash',
      origin: { module: 'police', ref: 'raid:major' },
      cityId: 'koeln',
      score: 0.5,
      won: true,
      by: 'player',
      picks: [],
    });
    sim.step();
    expect(sim.state.modules.police.majorRaid?.stash).toBe(0.5);
    sim.advance(180);
    const major = eventsOfType(events, 'police.raid').find((e) => e.payload.scope === 'major')?.payload;
    expect(major?.stashed?.share).toBe(0.5);
    expect(major?.stashed?.goods ?? 0).toBeGreaterThan(0);
  });

  it('Version 6 wird migriert: geplante Razzien ohne versteckten Anteil', () => {
    const sim = createTestGame();
    const old = structuredClone(sim.state);
    old.moduleVersions.police = 6;
    old.modules.police.plannedRaids = { kalk: { at: 500, scope: 'veedel', spotId: null } };
    old.modules.police.majorRaid = { at: 900, veedelIds: ['kalk', 'mülheim'] };
    const loaded = loadSimulation(old, sim.modules);
    expect(loaded.state.moduleVersions.police).toBe(8);
    expect(loaded.state.modules.police.plannedRaids.kalk).toEqual({ at: 500, scope: 'veedel', spotId: null });
    expect(loaded.state.modules.police.majorRaid).toEqual({ at: 900, veedelIds: ['kalk', 'mülheim'] });
  });
});
