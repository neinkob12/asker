import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getGangs } from '../gangs';
import { enlist, generateProfile } from '../staff';
import { allVeedel, getVeedel } from '../veedel';
import {
  CONTROL_THRESHOLD,
  DECAY_PER_HOUR,
  GANG_REGEN_PER_HOUR,
  LIEUTENANT_CLUSTER_BONUS,
  LIEUTENANT_INFLUENCE_PER_HOUR,
  LIEUTENANT_INFLUENCE_PER_LEVEL,
  LOSE_CONTROL_THRESHOLD,
  SALE_DISPLACEMENT,
  SALE_INFLUENCE_BASE,
  SALE_INFLUENCE_PER_UNIT,
  STAFF_PRESENCE_PER_HOUR,
} from './config';
import {
  addInfluence,
  campaignProgress,
  controlledBy,
  controllerOf,
  factionColor,
  factions,
  getInfluence,
  hasPlayerPresence,
  lieutenantInfluence,
  PLAYER_FACTION,
  playerPresence,
} from './index';

/** Spiel ohne zufällig auftauchende Kunden. */
function quietGame(): Simulation {
  const sim = createTestGame();
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

/** Ein eigener Verkauf im Veedel, wie ihn customers meldet. */
function sell(sim: Simulation, veedelId: string, amount = 3): void {
  sim.ctx('customers').emit('sale.completed', {
    channel: 'street',
    spotId: null,
    veedelId,
    productId: 'weed',
    amount,
    quality: 1,
    revenue: amount * 10,
    sellerId: null,
    customerId: null,
  });
  sim.step();
}

describe('territory', () => {
  it('zu Beginn haben die Gangs Köln unter sich aufgeteilt, der Spieler hat nichts', () => {
    const sim = createTestGame();
    const gangIds = getGangs(sim.state).map((g) => g.id);
    for (const v of allVeedel('koeln')) {
      const owner = controllerOf(sim.state, v.id);
      expect(gangIds).toContain(owner);
      expect(getInfluence(sim.state, v.id, owner ?? '')).toBe(v.startInfluence);
      expect(getInfluence(sim.state, v.id, PLAYER_FACTION)).toBe(0);
    }
    for (const g of getGangs(sim.state)) {
      expect(controlledBy(sim.state, g.id)).toContain(g.homeVeedelId);
    }
    expect(controlledBy(sim.state, PLAYER_FACTION)).toEqual([]);
    expect(factions(sim.state)).toEqual([PLAYER_FACTION, ...gangIds]);
    expect(campaignProgress(sim.state)).toEqual({
      controlled: 0,
      needed: 12,
      majority: 7,
      total: 12,
      won: false,
      majorityReached: false,
      complete: false,
    });
  });

  it('Einfluss ist begrenzt, Kontrollwechsel werden gemeldet', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    const owner = controllerOf(sim.state, 'deutz');
    expect(addInfluence(ctx, 'deutz', PLAYER_FACTION, 500)).toBe(100);
    expect(controllerOf(sim.state, 'deutz')).toBe(PLAYER_FACTION);
    addInfluence(ctx, 'deutz', PLAYER_FACTION, -100);
    addInfluence(ctx, 'deutz', owner ?? '', -100);
    expect(controllerOf(sim.state, 'deutz')).toBeNull();
    sim.step();
    expect(eventsOfType(events, 'territory.controlChanged').map((e) => e.payload)).toEqual([
      { veedelId: 'deutz', from: owner, to: PLAYER_FACTION },
      { veedelId: 'deutz', from: PLAYER_FACTION, to: owner },
      { veedelId: 'deutz', from: owner, to: null },
    ]);
    expect(sim.state.journal.some((e) => e.text.startsWith('Deutz gehört jetzt dir'))).toBe(true);
    expect(sim.state.journal.some((e) => e.text.startsWith('Du hast Deutz verloren'))).toBe(true);
  });

  it('unter der Schwelle kontrolliert niemand', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    const owner = controllerOf(sim.state, 'kalk') ?? '';
    addInfluence(ctx, 'kalk', owner, -100);
    addInfluence(ctx, 'kalk', PLAYER_FACTION, CONTROL_THRESHOLD - 1);
    expect(controllerOf(sim.state, 'kalk')).toBeNull();
    expect(factionColor(sim.state, PLAYER_FACTION)).toMatch(/^#/);
  });

  it('wer kontrolliert, verliert die Kontrolle erst unter der unteren Schwelle', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    const owner = controllerOf(sim.state, 'nippes') ?? '';
    addInfluence(ctx, 'nippes', owner, LOSE_CONTROL_THRESHOLD - getInfluence(sim.state, 'nippes', owner));
    expect(controllerOf(sim.state, 'nippes')).toBe(owner);
    addInfluence(ctx, 'nippes', PLAYER_FACTION, CONTROL_THRESHOLD - 1);
    expect(controllerOf(sim.state, 'nippes')).toBe(owner); // mehr Einfluss, aber unter der Schwelle
    addInfluence(ctx, 'nippes', PLAYER_FACTION, 1);
    // 50 gegen 45: Übernehmen braucht TAKEOVER_MARGIN mehr als der bisherige Herr.
    expect(controllerOf(sim.state, 'nippes')).toBe(owner);
    addInfluence(ctx, 'nippes', PLAYER_FACTION, 1);
    expect(controllerOf(sim.state, 'nippes')).toBe(PLAYER_FACTION); // 51
    addInfluence(ctx, 'nippes', PLAYER_FACTION, -4);
    expect(controllerOf(sim.state, 'nippes')).toBe(PLAYER_FACTION); // 47: hält noch
    addInfluence(ctx, 'nippes', PLAYER_FACTION, -3);
    expect(controllerOf(sim.state, 'nippes')).toBeNull(); // 44: weg, und die Gang hat nur 45
  });

  it('eigene Verkäufe bringen Einfluss und drängen die Gang zurück', () => {
    const sim = quietGame();
    const owner = controllerOf(sim.state, 'neustadt-sued') ?? '';
    const before = getInfluence(sim.state, 'neustadt-sued', owner);
    sell(sim, 'neustadt-sued', 4);
    const gain = SALE_INFLUENCE_BASE + 4 * SALE_INFLUENCE_PER_UNIT;
    expect(getInfluence(sim.state, 'neustadt-sued', PLAYER_FACTION)).toBeCloseTo(gain);
    expect(getInfluence(sim.state, 'neustadt-sued', owner)).toBeCloseTo(before - gain * SALE_DISPLACEMENT);
    expect(playerPresence(sim.state, 'neustadt-sued')).toEqual({ staff: 0, recentSale: true });
    expect(hasPlayerPresence(sim.state, 'kalk')).toBe(false);
  });

  it('ein echter Verkauf am Spot zählt für das Veedel des Spots', () => {
    const sim = quietGame();
    sim.state.modules.customers.waiting.push({
      id: sim.state.nextId++,
      spotId: 'zuelpicher',
      productId: 'weed',
      amount: 3,
      pricePerUnit: 10,
      arrivedAt: sim.state.time,
      expiresAt: sim.state.time + 100,
    });
    const [customer] = sim.state.modules.customers.waiting;
    expect(sim.dispatch({ type: 'customers.serve', payload: { customerId: customer.id } }).ok).toBe(true);
    expect(getInfluence(sim.state, 'neustadt-sued', PLAYER_FACTION)).toBeGreaterThan(0);
  });

  it('mit genug Verkäufen kippt ein Veedel an den Spieler', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const owner = controllerOf(sim.state, 'altstadt-sued');
    let sales = 0;
    while (controllerOf(sim.state, 'altstadt-sued') !== PLAYER_FACTION && sales < 300) {
      sell(sim, 'altstadt-sued', 3);
      sales++;
    }
    expect(controllerOf(sim.state, 'altstadt-sued')).toBe(PLAYER_FACTION);
    expect(sales).toBeGreaterThan(50); // spürbar, aber kein Selbstläufer (ein Spot schafft 10–20 am Tag)
    expect(sales).toBeLessThan(180);
    // Die Gang rutscht zuerst unter die untere Schwelle (Veedel offen), dann übernimmt der Spieler.
    expect(eventsOfType(events, 'territory.controlChanged').map((e) => e.payload)).toEqual([
      { veedelId: 'altstadt-sued', from: owner, to: null },
      { veedelId: 'altstadt-sued', from: null, to: PLAYER_FACTION },
    ]);
  });

  it('ohne Präsenz sinkt der Einfluss langsam, mit Leuten vor Ort steigt er', () => {
    const sim = quietGame();
    const ctx = sim.ctx('test');
    addInfluence(ctx, 'kalk', PLAYER_FACTION, 30);
    addInfluence(ctx, 'lindenthal', PLAYER_FACTION, 30);
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } }).ok).toBe(true);
    sim.advance(10 * 60);
    expect(getInfluence(sim.state, 'kalk', PLAYER_FACTION)).toBeCloseTo(30 - 10 * DECAY_PER_HOUR);
    expect(getInfluence(sim.state, 'lindenthal', PLAYER_FACTION)).toBeCloseTo(30 + 10 * STAFF_PRESENCE_PER_HOUR);
  });

  it('ein Leutnant bringt zusätzlich Einfluss, bessere Leutnants mehr', () => {
    const sim = quietGame();
    const ctx = sim.ctx('staff');
    addInfluence(sim.ctx('test'), 'lindenthal', PLAYER_FACTION, 20);
    const lt = enlist(ctx, generateProfile(ctx, 'runner', { level: 3 }), { origin: 'pool' });
    lt.stats.charisma = 50;
    expect(lieutenantInfluence(sim.state, 'lindenthal')).toBe(0);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, spotIds: ['uni'] } }).ok).toBe(true);
    const perHour = lieutenantInfluence(sim.state, 'lindenthal');
    expect(perHour).toBeCloseTo(LIEUTENANT_INFLUENCE_PER_HOUR + 2 * LIEUTENANT_INFLUENCE_PER_LEVEL);
    lt.stats.charisma = 100;
    expect(lieutenantInfluence(sim.state, 'lindenthal')).toBeGreaterThan(perHour);
    lt.stats.charisma = 50;
    const before = getInfluence(sim.state, 'lindenthal', PLAYER_FACTION);
    sim.advance(10 * 60);
    // Leutnant zählt als eine Person vor Ort plus sein eigener Beitrag, statt Verfall.
    expect(getInfluence(sim.state, 'lindenthal', PLAYER_FACTION)).toBeGreaterThanOrEqual(
      before + 10 * (perHour + STAFF_PRESENCE_PER_HOUR) - 1,
    );
  });

  it('drei Spots in einem Veedel wirken dort stärker als drei verstreute', () => {
    const sim = quietGame();
    sim.state.modules.spots.unlocked.push('rudolfplatz', 'aachener-weiher');
    const ctx = sim.ctx('staff');
    const a = enlist(ctx, generateProfile(ctx, 'runner', { level: 3 }), { origin: 'pool' });
    a.stats.charisma = 50;
    const appoint = (spotIds: string[]) =>
      sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds } }).ok;
    // Zwei Spots in Neustadt-Süd, einer in der Altstadt.
    expect(appoint(['zuelpicher', 'rudolfplatz', 'neumarkt'])).toBe(true);
    const base = LIEUTENANT_INFLUENCE_PER_HOUR + 2 * LIEUTENANT_INFLUENCE_PER_LEVEL;
    const split = lieutenantInfluence(sim.state, 'neustadt-sued');
    expect(split).toBeCloseTo(base * (2 / 3) * (1 + LIEUTENANT_CLUSTER_BONUS));
    expect(lieutenantInfluence(sim.state, 'altstadt-sued')).toBeCloseTo(base / 3);
    // Alle drei in Neustadt-Süd: dort deutlich mehr als zusammen verstreut.
    expect(appoint(['zuelpicher', 'rudolfplatz', 'aachener-weiher'])).toBe(true);
    const together = lieutenantInfluence(sim.state, 'neustadt-sued');
    expect(together).toBeCloseTo(base * (1 + 2 * LIEUTENANT_CLUSTER_BONUS));
    expect(together).toBeGreaterThan(split + base / 3);
    expect(lieutenantInfluence(sim.state, 'altstadt-sued')).toBe(0);
  });

  it('ein kürzlicher Verkauf hält den Einfluss, danach sinkt er', () => {
    const sim = quietGame();
    sell(sim, 'deutz', 3);
    const value = getInfluence(sim.state, 'deutz', PLAYER_FACTION);
    sim.advance(20 * 60);
    expect(getInfluence(sim.state, 'deutz', PLAYER_FACTION)).toBeCloseTo(value);
    sim.advance(10 * 60);
    expect(getInfluence(sim.state, 'deutz', PLAYER_FACTION)).toBeLessThan(value);
  });

  it('Gangs bauen ihren Einfluss im eigenen Veedel wieder auf, höchstens bis zum Startwert', () => {
    const sim = quietGame();
    const ctx = sim.ctx('test');
    const start = getVeedel('kalk')?.startInfluence ?? 0;
    const owner = controllerOf(sim.state, 'kalk') ?? '';
    addInfluence(ctx, 'kalk', owner, -20);
    sim.advance(8 * 60);
    expect(getInfluence(sim.state, 'kalk', owner)).toBeCloseTo(start - 20 + 8 * GANG_REGEN_PER_HOUR);
    sim.advance(10 * 24 * 60);
    expect(getInfluence(sim.state, 'kalk', owner)).toBe(start);
  });

  it('Meilenstein bei der Mehrheit (kein Sieg), Köln komplett erst mit allen Veedeln, danach geht es weiter', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    const ids = allVeedel('koeln').map((v) => v.id);
    for (const id of ids.slice(0, 6)) addInfluence(ctx, id, PLAYER_FACTION, 100);
    sim.step();
    expect(campaignProgress(sim.state)).toMatchObject({ controlled: 6, needed: 12, majority: 7, won: false });
    expect(eventsOfType(events, 'campaign.milestone')).toHaveLength(0);

    // 7 von 12: Meilenstein "Boss von Köln", aber kein Sieg.
    addInfluence(ctx, ids[6], PLAYER_FACTION, 100);
    sim.step();
    expect(eventsOfType(events, 'campaign.milestone').map((e) => e.payload)).toEqual([
      { kind: 'majority', cityId: 'koeln', controlled: 7, total: 12 },
    ]);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(0);
    expect(sim.state.outcome.won).toBeNull();
    expect(campaignProgress(sim.state)).toMatchObject({ controlled: 7, won: false, majorityReached: true });

    // Ein Veedel verlieren und wiedergewinnen: Der Meilenstein kommt nicht noch einmal.
    addInfluence(ctx, ids[6], PLAYER_FACTION, -100);
    sim.advance(60);
    addInfluence(ctx, ids[6], PLAYER_FACTION, 100);
    sim.step();
    expect(eventsOfType(events, 'campaign.milestone')).toHaveLength(1);

    // Alle 12: Köln komplett.
    for (const id of ids.slice(7)) addInfluence(ctx, id, PLAYER_FACTION, 100);
    sim.step();
    expect(eventsOfType(events, 'campaign.won').map((e) => e.payload)).toEqual([
      expect.objectContaining({ cityId: 'koeln', cityName: 'Köln', next: expect.stringContaining('Telefon') }),
    ]);
    expect(sim.state.outcome.won).toMatchObject({ cities: ['koeln'] });
    expect(campaignProgress(sim.state)).toMatchObject({ controlled: 12, won: true, complete: true });

    // Endlosmodus: Das Spiel läuft weiter, ein zweiter Sieg wird nicht gemeldet.
    addInfluence(ctx, ids[6], PLAYER_FACTION, -100);
    sim.advance(60);
    addInfluence(ctx, ids[6], PLAYER_FACTION, 100);
    sim.advance(60);
    expect(sim.isOver).toBe(false);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(1);
  });

  it('alter Spielstand mit Sieg bei 7 von 12 behält den Sieg, bekommt den Meilenstein und später Köln komplett', () => {
    const sim = quietGame();
    const ctx = sim.ctx('test');
    const ids = allVeedel('koeln').map((v) => v.id);
    for (const id of ids.slice(0, 7)) addInfluence(ctx, id, PLAYER_FACTION, 100);
    sim.step();
    // So sah ein Stand nach Auftrag 29 aus: gewonnen bei 7, Territory in Version 2, Sieg ohne Städte-Liste.
    const old = structuredClone(sim.state) as unknown as {
      outcome: { won: unknown };
      modules: { territory: Record<string, unknown> };
      moduleVersions: Record<string, number>;
    };
    old.outcome.won = { time: sim.state.time };
    delete old.modules.territory.milestones;
    old.moduleVersions.territory = 2;
    const loaded = loadSimulation(old, sim.modules);
    expect(loaded.state.outcome.won).toEqual({ time: sim.state.time });
    expect(loaded.state.modules.territory.milestones).toEqual({ koeln: { majority: sim.state.time, complete: null } });
    expect(campaignProgress(loaded.state)).toMatchObject({ controlled: 7, won: true, majorityReached: true });
    const events = recordEvents(loaded);
    for (const id of ids.slice(7)) addInfluence(loaded.ctx('test'), id, PLAYER_FACTION, 100);
    loaded.step();
    expect(eventsOfType(events, 'campaign.milestone')).toHaveLength(0);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(1);
    expect(loaded.state.outcome.won).toMatchObject({ time: sim.state.time, cities: ['koeln'] });
  });

  it('lädt Spielstände aus Version 1 (ohne lastSaleAt)', () => {
    const sim = createTestGame();
    const old = structuredClone(sim.state) as unknown as {
      modules: { territory: Record<string, unknown> };
      moduleVersions: Record<string, number>;
    };
    delete old.modules.territory.lastSaleAt;
    old.moduleVersions.territory = 1;
    const loaded = loadSimulation(old, sim.modules);
    expect(loaded.state.modules.territory.lastSaleAt).toEqual({});
    expect(loaded.state.modules.territory.controller).toEqual(sim.state.modules.territory.controller);
    expect(loaded.state.moduleVersions.territory).toBe(4);
    expect(loaded.state.modules.territory.milestones).toEqual({ koeln: { majority: null, complete: null } });
    sell(loaded, 'kalk');
    expect(getInfluence(loaded.state, 'kalk', PLAYER_FACTION)).toBeGreaterThan(0);
  });
});
