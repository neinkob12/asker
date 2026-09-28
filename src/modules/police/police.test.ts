import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { startEncounter } from '../encounters';
import { getStock, store } from '../goods';
import { runnerAt } from '../staff';
import { controlledBy, getInfluence } from '../territory';
import { getVeedel } from '../veedel';
import {
  CHASE_ESCAPED_HEAT,
  GANG_RAID_INFLUENCE_LOSS,
  HEAT_DECAY_PER_HOUR,
  SALE_HEAT_BASE,
  SALE_HEAT_PER_UNIT,
  SNITCH_HEAT,
  VIOLENCE_HEAT,
} from './config';
import { activeTipOff, addHeat, canSnitch, getHeat, getPoliceStats, heatLevel, playerHeat } from './index';

/** Spiel ohne zufällig auftauchende Kunden. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function sell(sim: Simulation, veedelId: string, amount: number, sellerId: string | null = null): void {
  sim.ctx('customers').emit('sale.completed', {
    channel: 'street',
    spotId: null,
    veedelId,
    productId: 'weed',
    amount,
    quality: 1,
    revenue: amount * 10,
    sellerId,
    customerId: null,
  });
  sim.step();
}

/** Spielt stundenweise, bis ein Ereignis kommt (höchstens maxHours). */
function advanceUntil(sim: Simulation, done: () => boolean, maxHours: number): void {
  for (let h = 0; h < maxHours && !done(); h++) sim.advance(60);
}

describe('police', () => {
  it('Heat pro Veedel lesen und erhöhen, begrenzt auf 0–100', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    expect(getHeat(sim.state, 'kalk')).toBe(0);
    expect(addHeat(ctx, 'kalk', 30)).toBe(30);
    expect(addHeat(ctx, 'kalk', 500)).toBe(100);
    expect(addHeat(ctx, 'kalk', -500)).toBe(0);
  });

  it('Verkäufe treiben den Heat, je nach Polizeipräsenz im Veedel', () => {
    const sim = quietGame();
    sell(sim, 'altstadt-nord', 4);
    sell(sim, 'bayenthal', 4);
    const perSale = SALE_HEAT_BASE + 4 * SALE_HEAT_PER_UNIT;
    expect(getHeat(sim.state, 'altstadt-nord')).toBeCloseTo(
      perSale * (getVeedel('altstadt-nord')?.policePresence ?? 0),
    );
    expect(getHeat(sim.state, 'bayenthal')).toBeCloseTo(perSale * (getVeedel('bayenthal')?.policePresence ?? 0));
    expect(getHeat(sim.state, 'altstadt-nord')).toBeGreaterThan(getHeat(sim.state, 'bayenthal'));
  });

  it('Heat sinkt mit der Zeit', () => {
    const sim = quietGame();
    addHeat(sim.ctx('test'), 'lindenthal', 20);
    sim.advance(10 * 60);
    expect(getHeat(sim.state, 'lindenthal')).toBeCloseTo(20 - 10 * HEAT_DECAY_PER_HOUR);
    sim.advance(3 * 24 * 60);
    expect(getHeat(sim.state, 'lindenthal')).toBe(0);
  });

  it('Gewalt im Veedel treibt den Heat', () => {
    const sim = quietGame();
    startEncounter(sim.ctx('gangs'), { kind: 'raidDefense', veedelId: 'kalk' });
    sim.step();
    expect(getHeat(sim.state, 'kalk')).toBeCloseTo(VIOLENCE_HEAT * (getVeedel('kalk')?.policePresence ?? 0), 0);
  });

  it('Heat-Stufen werden gemeldet, bei eigener Präsenz auch im Journal', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sell(sim, 'kalk', 1);
    addHeat(sim.ctx('test'), 'kalk', 65);
    sim.step();
    expect(eventsOfType(events, 'police.heatLevelChanged').map((e) => e.payload.to)).toEqual(['hot']);
    expect(sim.state.journal.some((e) => e.text.startsWith('In Kalk wird es heiß'))).toBe(true);
    expect(heatLevel(0).label).toBe('ruhig');
    expect(heatLevel(90).id).toBe('manhunt');
    expect(playerHeat(sim.state)?.veedelId).toBe('kalk');
  });

  it('bei hohem Heat kommt es zu Kontrollen bei den eigenen Leuten', () => {
    const sim = quietGame(3);
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } }).ok).toBe(true);
    const checks = () => eventsOfType(events, 'police.check');
    advanceUntil(
      sim,
      () => {
        addHeat(sim.ctx('test'), 'altstadt-sued', 45 - getHeat(sim.state, 'altstadt-sued'));
        return checks().length > 0;
      },
      24 * 10,
    );
    expect(checks().length).toBeGreaterThan(0);
    expect(checks()[0].payload).toMatchObject({ veedelId: 'altstadt-sued', spotId: 'neumarkt' });
    expect(getPoliceStats(sim.state).checks).toBeGreaterThan(0);
    expect(eventsOfType(events, 'police.raid')).toHaveLength(0); // unter der Razzia-Schwelle
  });

  it('Razzia: Ware und Geld werden beschlagnahmt, Leute festgenommen', () => {
    let found = false;
    for (let seed = 1; seed <= 10 && !found; seed++) {
      const sim = quietGame(seed);
      const events = recordEvents(sim);
      sim.state.wallet.dirty = 100_000;
      store(sim.ctx('goods'), { productId: 'weed', amount: 1000 });
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'rudolfplatz' } });
      const stock = getStock(sim.state);
      const money = sim.state.wallet.dirty;
      const raids = () => eventsOfType(events, 'police.raid');
      advanceUntil(
        sim,
        () => {
          sim.state.modules.police.checkReadyAt['neustadt-sued'] = Infinity; // nur Razzien
          addHeat(sim.ctx('test'), 'neustadt-sued', 100);
          return raids().length > 0;
        },
        24 * 5,
      );
      if (raids().length === 0) continue;
      const raid = raids()[0].payload;
      expect(raid).toMatchObject({ veedelId: 'neustadt-sued', target: 'player' });
      expect(raid.goods).toBeGreaterThan(0);
      expect(getStock(sim.state)).toBe(stock - (raid.goods ?? 0));
      expect(sim.state.wallet.dirty).toBeLessThanOrEqual(money - (raid.money ?? 0));
      const arrests = eventsOfType(events, 'police.arrest').map((e) => e.payload.staffId);
      expect(arrests).toEqual(raid.arrested);
      for (const id of arrests) {
        expect(sim.state.modules.staff.members.find((m) => m.id === id)?.status).toBe('jailed');
      }
      expect(sim.state.journal.some((e) => e.text.startsWith('Razzia am'))).toBe(true);
      found = arrests.length > 0;
    }
    expect(found).toBe(true);
  });

  it('Polizeiflucht: gescheitert heißt Festnahme, geglückt mehr Heat', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const runner = runnerAt(sim.state, 'uni');
    if (!runner) throw new Error('kein Läufer');
    const request = {
      kind: 'policeChase',
      veedelId: 'lindenthal',
      spotId: 'uni',
      staffIds: [runner.id],
      origin: { module: 'police', ref: 'check' },
    };
    const encounters = sim.ctx('encounters');
    encounters.emit('encounter.resolved', {
      encounterId: 1,
      kind: 'policeChase',
      outcome: 'success',
      request,
      playerKilled: false,
    });
    sim.step();
    expect(getHeat(sim.state, 'lindenthal')).toBeCloseTo(CHASE_ESCAPED_HEAT);
    expect(runnerAt(sim.state, 'uni')?.status).toBe('active');

    encounters.emit('encounter.resolved', {
      encounterId: 2,
      kind: 'policeChase',
      outcome: 'failure',
      request,
      playerKilled: false,
    });
    sim.step();
    expect(eventsOfType(events, 'police.arrest').map((e) => e.payload)).toEqual([
      { staffId: runner.id, veedelId: 'lindenthal' },
    ]);
    expect(runnerAt(sim.state, 'uni')?.status).toBe('jailed');
  });

  it('Kontrollen können eine Polizeiflucht über encounters starten', () => {
    const sim = quietGame(2);
    const events = recordEvents(sim);
    sim.state.wallet.dirty = 100_000; // genug Geld und Ware, damit die Kontrollen nicht in die Pleite führen
    store(sim.ctx('goods'), { productId: 'weed', amount: 1000 });
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'breslauer' } });
    const chases = () => eventsOfType(events, 'encounter.started').filter((e) => e.payload.kind === 'policeChase');
    advanceUntil(
      sim,
      () => {
        sim.state.modules.police.checkReadyAt['altstadt-nord'] = 0;
        sim.state.modules.territory.lastSaleAt['altstadt-nord'] = sim.state.time; // präsent, auch wenn der Läufer sitzt
        addHeat(sim.ctx('test'), 'altstadt-nord', 55 - getHeat(sim.state, 'altstadt-nord'));
        return chases().length > 0;
      },
      24 * 10,
    );
    expect(chases().length).toBeGreaterThan(0);
    expect(chases()[0].payload.request).toMatchObject({
      veedelId: 'altstadt-nord',
      origin: { module: 'police', ref: 'check' },
    });
    expect(eventsOfType(events, 'police.check').some((e) => e.payload.chase)).toBe(true);
  });

  it('eine Gang verpfeifen erhöht den Heat in ihren Veedeln', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const veedelIds = controlledBy(sim.state, 'ost');
    expect(sim.dispatch({ type: 'police.snitch', payload: { gangId: 'ost' } }).ok).toBe(true);
    for (const id of veedelIds) {
      expect(getHeat(sim.state, id)).toBe(SNITCH_HEAT);
      expect(activeTipOff(sim.state, id)?.gangId).toBe('ost');
    }
    expect(eventsOfType(events, 'police.tipOff')[0].payload).toEqual({ gangId: 'ost', veedelIds });
    expect(sim.dispatch({ type: 'police.snitch', payload: { gangId: 'gibtsnicht' } }).ok).toBe(false);
    // Die Polizei hört erst später wieder zu.
    expect(canSnitch(sim.state, 'nord').ok).toBe(false);
    expect(sim.dispatch({ type: 'police.snitch', payload: { gangId: 'nord' } }).ok).toBe(false);
    sim.advance(24 * 60);
    expect(canSnitch(sim.state, 'nord').ok).toBe(true);
  });

  it('nach dem Verpfeifen kommt es zu Razzien gegen die Gang, die Einfluss kosten', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const veedelIds = controlledBy(sim.state, 'ost');
    const before = Object.fromEntries(veedelIds.map((id) => [id, getInfluence(sim.state, id, 'ost')]));
    sim.dispatch({ type: 'police.snitch', payload: { gangId: 'ost' } });
    sim.advance(48 * 60);
    const raids = eventsOfType(events, 'police.raid').filter((e) => e.payload.target === 'ost');
    expect(raids.length).toBeGreaterThan(0);
    for (const raid of raids) {
      expect(raid.payload.influenceLost).toBe(GANG_RAID_INFLUENCE_LOSS);
      expect(getInfluence(sim.state, raid.payload.veedelId, 'ost')).toBeLessThan(before[raid.payload.veedelId]);
    }
    expect(getPoliceStats(sim.state).gangRaids).toBe(raids.length);
    expect(sim.state.journal.some((e) => e.text.includes('Dein Hinweis hat gesessen'))).toBe(true);
    for (const id of veedelIds) expect(activeTipOff(sim.state, id)).toBeNull();
  });

  it('lädt Spielstände aus Version 1 (nur Heat)', () => {
    const sim = createTestGame();
    const old = structuredClone(sim.state) as unknown as {
      modules: { police: unknown };
      moduleVersions: Record<string, number>;
    };
    old.modules.police = { heat: { kalk: 70, deutz: 10 } };
    old.moduleVersions.police = 1;
    const loaded = loadSimulation(old, sim.modules);
    expect(loaded.state.moduleVersions.police).toBe(2);
    expect(getHeat(loaded.state, 'kalk')).toBe(70);
    expect(loaded.state.modules.police.level.kalk).toBe(heatLevel(70).index);
    expect(getPoliceStats(loaded.state).raids).toBe(0);
    loaded.advance(60);
    expect(getHeat(loaded.state, 'kalk')).toBeLessThan(70);
  });
});
