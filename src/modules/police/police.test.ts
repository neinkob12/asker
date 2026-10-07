import { describe, expect, it } from 'vitest';
import { clock, loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { startEncounter } from '../encounters';
import { getStock, store } from '../goods';
import { enlist, generateProfile, runnerAt } from '../staff';
import { controlledBy, getInfluence } from '../territory';
import { getVeedel } from '../veedel';
import {
  CHASE_ESCAPED_HEAT,
  GANG_RAID_INFLUENCE_LOSS,
  HEAT_DECAY_PER_HOUR,
  HEAT_DECAY_SHARE_PER_HOUR,
  MAJOR_RAID_LEAD_TIME,
  RAID_LEAD_TIME,
  RAID_SCOPES,
  SALE_HEAT_BASE,
  SALE_HEAT_BY_TIER,
  SALE_HEAT_PER_UNIT,
  SNITCH_HEAT,
  VIOLENCE_HEAT,
} from './config';
import {
  activeTipOff,
  addHeat,
  canSnitch,
  getHeat,
  getPoliceStats,
  heatLevel,
  type OperationFacts,
  operationFacts,
  operationTier,
  plannedRaid,
  playerHeat,
} from './index';
import { nextTier } from './tier';

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
    // Am Anfang bist du Kleindealer: Verkäufe fallen weniger auf (SALE_HEAT_BY_TIER).
    const perSale = (SALE_HEAT_BASE + 4 * SALE_HEAT_PER_UNIT) * SALE_HEAT_BY_TIER[0];
    expect(getHeat(sim.state, 'altstadt-nord')).toBeCloseTo(
      perSale * (getVeedel('altstadt-nord')?.policePresence ?? 0),
    );
    expect(getHeat(sim.state, 'bayenthal')).toBeCloseTo(perSale * (getVeedel('bayenthal')?.policePresence ?? 0));
    expect(getHeat(sim.state, 'altstadt-nord')).toBeGreaterThan(getHeat(sim.state, 'bayenthal'));
  });

  it('Heat sinkt mit der Zeit, hohe Heat schneller (fester Abbau plus Anteil)', () => {
    const sim = quietGame();
    addHeat(sim.ctx('test'), 'lindenthal', 20);
    sim.advance(60);
    expect(getHeat(sim.state, 'lindenthal')).toBeCloseTo(20 - HEAT_DECAY_PER_HOUR - 20 * HEAT_DECAY_SHARE_PER_HOUR);
    addHeat(sim.ctx('test'), 'kalk', 80);
    const before = getHeat(sim.state, 'kalk');
    sim.advance(60);
    expect(before - getHeat(sim.state, 'kalk')).toBeGreaterThan(HEAT_DECAY_PER_HOUR + 20 * HEAT_DECAY_SHARE_PER_HOUR);
    sim.advance(3 * 24 * 60);
    expect(getHeat(sim.state, 'lindenthal')).toBe(0);
  });

  it('gleichmäßiger Verkauf pendelt sich ein, statt bis 100 durchzulaufen', () => {
    const sim = quietGame();
    // 60 Verkäufe zu je 3 Einheiten am Tag in der Altstadt (viel Polizei), drei Tage lang.
    for (let h = 0; h < 72; h++) {
      for (let i = 0; i < (h % 2 === 0 ? 3 : 2); i++) sell(sim, 'altstadt-nord', 3);
      sim.advance(60);
    }
    expect(getHeat(sim.state, 'altstadt-nord')).toBeLessThan(40);
    expect(getHeat(sim.state, 'altstadt-nord')).toBeGreaterThan(5);
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

  it('stehst du selbst am Spot im Veedel, trifft die Kontrolle dich und nicht deinen Läufer', () => {
    const sim = quietGame(3);
    const events = recordEvents(sim);
    sim.state.wallet.dirty = 100_000;
    store(sim.ctx('goods'), { productId: 'weed', amount: 1000 });
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'customers.standAt', payload: { spotId: 'neumarkt' } }).ok).toBe(true);
    const checks = () => eventsOfType(events, 'police.check');
    advanceUntil(
      sim,
      () => {
        addHeat(sim.ctx('test'), 'altstadt-sued', 45 - getHeat(sim.state, 'altstadt-sued'));
        return checks().length > 0;
      },
      24 * 10,
    );
    expect(checks()[0]?.payload).toMatchObject({ veedelId: 'altstadt-sued', spotId: 'neumarkt', staffId: null });
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
      expect(sim.state.journal.some((e) => /^Razzia (am|in) /.test(e.text))).toBe(true);
      found = arrests.length > 0;
    }
    expect(found).toBe(true);
  });

  it('Razzia im Veedel eines eigenen Lagers: Das Lager wird mit durchsucht', () => {
    let found = false;
    for (let seed = 1; seed <= 10 && !found; seed++) {
      const sim = quietGame(seed);
      const events = recordEvents(sim);
      sim.state.wallet.dirty = 100_000;
      store(sim.ctx('goods'), { productId: 'weed', amount: 1000 });
      // Spot mit Läufer in Ehrenfeld, wo auch das Lager steht (seit Auftrag 28 der Bahnhof Ehrenfeld).
      const spotId = 'venloer';
      const spot = sim.dispatch({ type: 'spots.unlock', payload: { spotId } });
      if (!spot.ok) throw new Error(spot.reason);
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
      // Mit vier besetzten Spots ist man Händler: Razzien treffen das Veedel samt Lager.
      for (const other of ['ebertplatz', 'neumarkt', 'zuelpicher']) {
        sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: other } });
      }
      const stock = getStock(sim.state, { warehouseId: 'ehrenfeld' });
      const raids = () => eventsOfType(events, 'police.raid');
      advanceUntil(
        sim,
        () => {
          sim.state.modules.police.checkReadyAt.ehrenfeld = Infinity;
          addHeat(sim.ctx('test'), 'ehrenfeld', 100);
          return raids().length > 0;
        },
        24 * 5,
      );
      if (raids().length === 0) continue;
      const raid = raids()[0].payload;
      expect(raid).toMatchObject({ veedelId: 'ehrenfeld', scope: 'veedel' });
      // Mindestens ein Fünftel des Lagers ist weg, mehr als eine normale Razzia.
      expect(raid.goods ?? 0).toBeGreaterThanOrEqual(Math.floor(stock * 0.2));
      // (Der Läufer am neuen Spot verkauft nebenbei auch etwas.)
      expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBeLessThanOrEqual(stock - (raid.goods ?? 0));
      found = true;
    }
    expect(found).toBe(true);
  });

  it('Razzien gegen den Spieler werden vorher geplant und kommen RAID_LEAD_TIME später', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
    advanceUntil(
      sim,
      () => {
        sim.state.modules.police.checkReadyAt['neustadt-sued'] = Infinity;
        addHeat(sim.ctx('test'), 'neustadt-sued', 100);
        return eventsOfType(events, 'police.raidPlanned').length > 0;
      },
      24 * 10,
    );
    const planned = eventsOfType(events, 'police.raidPlanned')[0];
    expect(planned.payload.at - planned.time).toBe(RAID_LEAD_TIME);
    expect(plannedRaid(sim.state, 'neustadt-sued')).toBe(planned.payload.at);
    expect(eventsOfType(events, 'police.raid')).toHaveLength(0);
    sim.advance(planned.payload.at - sim.state.time + 60);
    expect(eventsOfType(events, 'police.raid')).toHaveLength(1);
    expect(plannedRaid(sim.state, 'neustadt-sued')).toBeNull();
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

  it('gescheiterte Flucht in Hamburg beschlagnahmt aus Hamburger Lagern, in Köln aus Kölner', () => {
    const sim = quietGame();
    sim.state.modules.goods.owned.push('werkstatt-ottensen');
    store(sim.ctx('goods'), { productId: 'weed', amount: 1000 });
    store(sim.ctx('goods'), { productId: 'weed', amount: 1000, warehouseId: 'werkstatt-ottensen' });
    const koeln = () => getStock(sim.state, { cityId: 'koeln' });
    const hamburg = () => getStock(sim.state, { cityId: 'hamburg' });
    const lost = (veedelId: string) => {
      sim.ctx('encounters').emit('encounter.resolved', {
        encounterId: 1,
        kind: 'policeChase',
        outcome: 'failure',
        request: { kind: 'policeChase', veedelId, staffIds: [], origin: { module: 'police', ref: 'check' } },
        playerKilled: false,
      });
      sim.step();
    };
    const [k0, h0] = [koeln(), hamburg()];
    lost('st-pauli');
    expect(hamburg()).toBeLessThan(h0);
    expect(koeln()).toBe(k0);
    const h1 = hamburg();
    lost('altstadt-nord');
    expect(koeln()).toBeLessThan(k0);
    expect(hamburg()).toBe(h1);
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
    expect(loaded.state.moduleVersions.police).toBe(8);
    expect(loaded.state.modules.police.plannedRaids).toEqual({});
    expect(loaded.state.modules.police.customs).toEqual({});
    expect(getHeat(loaded.state, 'kalk')).toBe(70);
    expect(loaded.state.modules.police.level.kalk).toBe(heatLevel(70).index);
    expect(getPoliceStats(loaded.state).raids).toBe(0);
    loaded.advance(60);
    expect(getHeat(loaded.state, 'kalk')).toBeLessThan(70);
  });
});

describe('police: Härte nach Größe des Geschäfts (Auftrag 24)', () => {
  const facts = (patch: Partial<OperationFacts> = {}): OperationFacts => ({
    veedel: 0,
    spots: 3,
    people: 3,
    lieutenants: 0,
    warehouses: 1,
    berth: false,
    revenue: 1500,
    ...patch,
  });

  it('Stufen mit Hysterese: Kleindealer, Händler, Großhändler', () => {
    expect(nextTier(facts(), 0)).toBe(0);
    expect(nextTier(facts({ spots: 4 }), 0)).toBe(1);
    expect(nextTier(facts({ veedel: 1 }), 0)).toBe(1);
    expect(nextTier(facts({ lieutenants: 1 }), 0)).toBe(1);
    expect(nextTier(facts({ veedel: 6, people: 6 }), 1)).toBe(2);
    // Vier Veedel in Köln machen noch keinen Großhändler, auch nicht, wer mit drei Leuten viel selbst verkauft.
    expect(nextTier(facts({ veedel: 4, people: 6 }), 1)).toBe(1);
    expect(nextTier(facts({ veedel: 6 }), 1)).toBe(1);
    expect(nextTier(facts({ spots: 8, berth: true, warehouses: 2 }), 1)).toBe(2);
    expect(nextTier(facts({ spots: 8, berth: false, warehouses: 2 }), 1)).toBe(1);
    // Zurück erst deutlich darunter.
    expect(nextTier(facts({ veedel: 5, spots: 4, people: 6 }), 2)).toBe(2);
    expect(nextTier(facts({ veedel: 4, spots: 4, people: 6 }), 2)).toBe(1);
    expect(nextTier(facts({ spots: 3, people: 4, revenue: 5000 }), 1)).toBe(1);
    expect(nextTier(facts({ spots: 3, people: 4, revenue: 3000 }), 1)).toBe(0);
  });

  it('Umsatz pro Tag: Schnitt über volle Tage, der angefangene Tag drückt ihn nicht', () => {
    const sim = quietGame();
    const earn = (amount: number) => {
      wallet.earn(sim.ctx('test'), amount, 'dirty', 'Verkauf', 'sales.street');
      sim.advance(1);
    };
    sim.advance(clock.at(1, 12, 0) - sim.state.time);
    earn(5000);
    // Am ersten Tag gibt es noch keinen vollen Tag: Es zählt der laufende.
    expect(operationFacts(sim.state).revenue).toBe(5000);
    sim.advance(clock.at(2, 12, 0) - sim.state.time);
    earn(5000);
    // Tag 3 ist gerade erst angebrochen: Der Schnitt der zwei vollen Tage bleibt 5.000 (statt 10.000 / 3).
    sim.advance(clock.at(3, 0, 30) - sim.state.time);
    expect(operationFacts(sim.state).revenue).toBe(5000);
    earn(1000);
    expect(operationFacts(sim.state).revenue).toBe(5000);
  });

  /** Heat in allen Veedeln mit Präsenz hochhalten und stundenweise spielen. */
  function hotFor(sim: Simulation, hours: number): void {
    for (let h = 0; h < hours; h++) {
      for (const v of ['neustadt-sued', 'altstadt-sued', 'neustadt-nord', 'lindenthal', 'ehrenfeld']) {
        const heat = getHeat(sim.state, v);
        if (heat < 90) addHeat(sim.ctx('test'), v, 90 - heat);
      }
      sim.advance(60);
    }
  }

  it('drei Spots mit drei Läufern bei Heat 90: in zehn Tagen keine Großrazzia und keine Lager-Durchsuchung', () => {
    const sim = quietGame(4);
    const events = recordEvents(sim);
    sim.state.wallet.dirty = 50_000;
    store(sim.ctx('goods'), { productId: 'weed', amount: 2000 });
    for (const spotId of ['ebertplatz', 'neumarkt', 'zuelpicher']) {
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
    }
    hotFor(sim, 10 * 24);
    expect(operationTier(sim.state).id).toBe('small');
    const raids = eventsOfType(events, 'police.raid').filter((e) => e.payload.target === 'player');
    expect(raids.length).toBeGreaterThan(0);
    expect(raids.every((e) => e.payload.scope === 'spot')).toBe(true);
    // Höchstens ein Anteil der Ware am Ort, nie ein Lager (Spot-Razzien sind klein).
    for (const raid of raids) expect(raid.payload.goods ?? 0).toBeLessThanOrEqual(RAID_SCOPES.spot.goodsMax);
    expect(eventsOfType(events, 'police.raidPlanned').some((e) => e.payload.scope === 'major')).toBe(false);
    // Festnahmen nur am Spot der Razzia.
    for (const raid of raids) {
      for (const id of raid.payload.arrested ?? []) {
        const m = sim.state.modules.staff.members.find((x) => x.id === id);
        expect(m?.returnTo).toEqual({ kind: 'spot', targetId: raid.payload.spotId });
      }
    }
  });

  it('als Großhändler: Aufstieg wird gemeldet, Großrazzia mit einem Tag Vorlauf in mehreren Veedeln', () => {
    const sim = quietGame(2);
    const events = recordEvents(sim);
    sim.state.wallet.dirty = 50_000;
    store(sim.ctx('goods'), { productId: 'weed', amount: 2000 });
    sim.advance(60);
    expect(operationTier(sim.state).id).toBe('small');
    for (const spotId of ['ebertplatz', 'neumarkt', 'zuelpicher', 'uni']) {
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
    }
    sim.advance(60);
    expect(operationTier(sim.state).id).toBe('dealer');
    // Sehr viele Spots plus Liegeplatz und ein zweites Lager.
    sim.state.wallet.clean = 20_000;
    sim.state.modules.spots.unlocked.push('rudolfplatz', 'aachener-weiher', 'friesenplatz', 'breslauer');
    for (const spotId of ['rudolfplatz', 'aachener-weiher', 'friesenplatz', 'breslauer']) {
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
    }
    expect(sim.dispatch({ type: 'logistics.buyBerth', payload: {} }).ok).toBe(true);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    sim.advance(60);
    expect(operationTier(sim.state).id).toBe('kingpin');
    expect(eventsOfType(events, 'police.tierChanged').map((e) => e.payload)).toEqual([
      { from: 0, to: 1, cityId: 'koeln' },
      { from: 1, to: 2, cityId: 'koeln' },
    ]);
    expect(sim.state.messages.list.some((m) => m.text.includes('Ermittlungsgruppe'))).toBe(true);
    // Mit Polizei-Kontakt kommt die Warnung einen Tag vorher.
    const ctx = sim.ctx('staff');
    const contact = enlist(ctx, generateProfile(ctx, 'policeContact'), { origin: 'pool' });
    hotFor(sim, 6 * 24);
    const planned = eventsOfType(events, 'police.raidPlanned').filter((e) => e.payload.scope === 'major');
    expect(planned.length).toBeGreaterThanOrEqual(2);
    expect(planned[0].payload.at - planned[0].time).toBe(MAJOR_RAID_LEAD_TIME);
    expect(
      sim.state.messages.list.some((m) => m.contactId === `staff:${contact.id}` && m.text.includes('Großrazzia')),
    ).toBe(true);
    const majorRaid = () => eventsOfType(events, 'police.raid').find((e) => e.payload.scope === 'major');
    advanceUntil(sim, () => !!majorRaid(), 30);
    const major = majorRaid();
    expect(major).toBeDefined();
    expect(major?.payload.veedelIds?.length).toBeGreaterThanOrEqual(2);
    const journalTexts = eventsOfType(events, 'journal.added').map((e) => e.payload.entry.text);
    expect(journalTexts.some((t) => t.startsWith('Großrazzia in'))).toBe(true);
  });

  it('Version 3 wird migriert: geplante Razzien bekommen ihre Art', () => {
    const sim = createTestGame();
    const old = structuredClone(sim.state) as unknown as {
      modules: { police: Record<string, unknown> };
      moduleVersions: Record<string, number>;
    };
    const { majorRaid: _m, majorReadyAt: _r, tier: _t, ...v3 } = old.modules.police;
    old.modules.police = { ...v3, plannedRaids: { kalk: 500 } };
    old.moduleVersions.police = 3;
    const loaded = loadSimulation(old, sim.modules);
    expect(plannedRaid(loaded.state, 'kalk')).toBe(500);
    expect(loaded.state.modules.police.plannedRaids.kalk).toEqual({ at: 500, scope: 'veedel', spotId: null });
    expect(loaded.state.modules.police.tiers).toEqual({});
    loaded.advance(60);
    expect(loaded.state.modules.police.tiers.koeln).toBe(0);
  });
});
