// Städte als Grundlage (Auftrag 30, Etappe 4): Freischalten mit der Übergabe, Umschalten, nur eine Stadt live,
// Schlafmodus mit Tageszusammenfassung, Kasse pro Stadt, alte Spielstände.

import { describe, expect, it } from 'vitest';
import { loadSimulation, MINUTES_PER_DAY, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { balance, cityDayProfit, cityReport } from '../finance';
import { getGangStatus } from '../gangs';
import { getStock, store } from '../goods';
import { FULL_POWER_SHARE, getRightHand, RIGHT_HAND_RANK_XP } from '../hierarchy';
import { berthCost, cargoRiskFrom, getCargo, hasBerth } from '../logistics';
import { getHeat } from '../police';
import { enlist, generateProfile, getStaff } from '../staff';
import { availablePackages, getSuppliers, isUnlocked, packagePrice, supplierIn } from '../suppliers';
import { addInfluence, controllerOf, factions, getInfluence, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { HARBOR_CALLER, SLEEP_FACTOR_MAX, SLEEP_FACTOR_MIN } from './config';
import {
  activeCity,
  CITIES,
  citiesUnlocked,
  cityAt,
  cityOfSpot,
  isCityLive,
  isVeedelLive,
  liveVeedel,
  playableCities,
  sleepInfo,
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

/** Alle Kölner Veedel für den Spieler, Rechte Hand bereit, Vollmacht erteilt: Hamburg ist frei. */
function handOverKoeln(sim: Simulation): string {
  sim.state.wallet.dirty = 50000;
  const ctx = sim.ctx('staff');
  const hire = (level: number, loyalty: number) => {
    const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
    m.stats.loyalty = loyalty;
    m.stats.caution = 90;
    return m;
  };
  const a = hire(2, 80);
  const b = hire(2, 80);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = hire(5, 95);
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
  const t = sim.ctx('test');
  for (const v of allVeedel('koeln')) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(t, v.id, f, -100);
    addInfluence(t, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
  expect(sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }).ok).toBe(true);
  return boss.id;
}

describe('Städte (Auftrag 30)', () => {
  it('Daten: Köln, Hamburg, Berlin und die Schablonen München, Frankfurt; je 12 Veedel, Schablonen gesperrt', () => {
    expect(CITIES.map((c) => c.id)).toEqual(['koeln', 'hamburg', 'berlin', 'muenchen', 'frankfurt']);
    expect(playableCities().map((c) => c.id)).toEqual(['koeln', 'hamburg', 'berlin']);
    expect(allVeedel('koeln')).toHaveLength(12);
    expect(allVeedel('hamburg')).toHaveLength(12);
    expect(allVeedel('berlin')).toHaveLength(12);
    expect(allVeedel('muenchen')).toHaveLength(0);
    for (const c of playableCities()) {
      const [w, s, e, n] = c.bounds;
      for (const v of allVeedel(c.id)) {
        expect(v.center.lng, v.id).toBeGreaterThan(w);
        expect(v.center.lng, v.id).toBeLessThan(e);
        expect(v.center.lat, v.id).toBeGreaterThan(s);
        expect(v.center.lat, v.id).toBeLessThan(n);
        expect(cityAt(v.center.lng, v.center.lat)).toBe(c.id);
      }
    }
    // Der Niehler Hafen liegt in keinem Veedel, gehört aber zu Köln; der Hamburger Hafen zu Hamburg.
    expect(cityAt(6.9712, 50.9862)).toBe('koeln');
    expect(cityAt(10.0045, 53.5282)).toBe('hamburg');
    expect(cityAt(13.4125, 52.5215)).toBe('berlin');
    expect(cityAt(8.68, 50.11)).toBe('koeln');
  });

  it('am Anfang ist nur Köln frei und live; umschalten geht erst nach der Übergabe, nur durch den Spieler', () => {
    const sim = quietGame();
    expect(activeCity(sim.state)).toBe('koeln');
    expect(citiesUnlocked(sim.state)).toEqual(['koeln']);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'berlin' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }).ok).toBe(false);

    const events = recordEvents(sim);
    handOverKoeln(sim);
    expect(citiesUnlocked(sim.state)).toEqual(['koeln', 'hamburg']);
    expect(eventsOfType(events, 'city.unlocked').map((e) => e.payload)).toEqual([{ cityId: 'hamburg' }]);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }, { actor: 'staff:x' }).ok).toBe(false);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    expect(activeCity(sim.state)).toBe('hamburg');
    expect(isCityLive(sim.state, 'koeln')).toBe(false);
    expect(liveVeedel(sim.state).every((v) => v.cityId === 'hamburg')).toBe(true);
    expect(isVeedelLive(sim.state, 'st-pauli')).toBe(true);
    expect(isVeedelLive(sim.state, 'kalk')).toBe(false);
    expect(eventsOfType(events, 'city.switched').map((e) => e.payload)).toEqual([{ from: 'koeln', to: 'hamburg' }]);
    expect(sleepInfo(sim.state, 'koeln')?.since).toBe(sim.state.time);
  });

  it('Hamburg startet wie ein neues Spiel: vier Gangs teilen die Stadtteile, kein Einfluss, keine Heat, keine Spots', () => {
    const sim = quietGame();
    for (const v of allVeedel('hamburg')) {
      const owner = controllerOf(sim.state, v.id);
      expect(owner?.startsWith('hh-'), v.id).toBe(true);
      expect(getInfluence(sim.state, v.id, PLAYER_FACTION)).toBe(0);
      expect(getHeat(sim.state, v.id)).toBe(0);
    }
    // Kölner Gangs haben in Hamburg nichts, Hamburger Gangs in Köln nichts.
    for (const v of allVeedel('koeln'))
      for (const g of ['hh-kiez', 'hh-hafen']) expect(getInfluence(sim.state, v.id, g)).toBe(0);
    expect(cityOfSpot(sim.state, 'spielbudenplatz')).toBe('hamburg');
    expect(sim.state.modules.spots.unlocked.some((id) => cityOfSpot(sim.state, id) === 'hamburg')).toBe(false);
    // Spots in Hamburg kosten das 1,5-Fache und gehen erst, wenn Hamburg frei ist.
    sim.state.wallet.dirty = 100000;
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'spielbudenplatz' } }).ok).toBe(false);
  });

  it('nur eine Stadt live: Solange Köln live ist, ruhen Hamburgs Gangs; schaust du auf Hamburg, ruht Köln', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    const kiez = () => JSON.stringify(getGangStatus(sim.state, 'hh-kiez'));
    const hamburgInfluence = () =>
      allVeedel('hamburg').map((v) => JSON.stringify(sim.state.modules.territory.influence[v.id]));
    const before = { gang: kiez(), influence: hamburgInfluence() };
    sim.advance(2 * DAY);
    expect(kiez()).toBe(before.gang);
    expect(hamburgInfluence()).toEqual(before.influence);

    sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
    const koeln = () => allVeedel('koeln').map((v) => JSON.stringify(sim.state.modules.territory.influence[v.id]));
    const nord = () => JSON.stringify(getGangStatus(sim.state, 'nord'));
    const koelnBefore = { influence: koeln(), gang: nord() };
    sim.advance(2 * DAY);
    expect(koeln()).toEqual(koelnBefore.influence);
    expect(nord()).toBe(koelnBefore.gang);
  });

  it('Schlafmodus: Köln schläft 10 Tage, Ergebnis und Anteil werden gebucht, Lager bleiben; aufwachen ohne Nachrechnen', () => {
    const sim = quietGame();
    const bossId = handOverKoeln(sim);
    // Zwei Tage live in Köln mit gutem Umsatz (gebucht auf Köln, die aktive Stadt).
    for (let d = 0; d < 2; d++) {
      sim.advance(DAY - (sim.state.time % DAY) - 60);
      // Reichlich Umsatz: Die Rechte Hand kauft an einem Tag schon mal für 20.000 € nach (Bestellregeln).
      wallet.earn(sim.ctx('test'), 35000, 'dirty', 'Test', 'sales.street');
      sim.advance(90);
    }
    expect(sleepInfo(sim.state, 'koeln')?.results.length).toBeGreaterThanOrEqual(2);
    store(sim.ctx('test'), { productId: 'weed', amount: 500, warehouseId: 'ehrenfeld' });
    const stock = getStock(sim.state, { cityId: 'koeln' });
    const staff = getStaff(sim.state).length;

    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    sim.advance(10 * DAY);
    const slept = eventsOfType(events, 'city.slept').filter((e) => e.payload.cityId === 'koeln');
    expect(slept.length).toBeGreaterThanOrEqual(9);
    // Der Schnitt: die ganz live gespielten Tage (der angefangene Tag des Umschaltens zählt nicht), danach ändert er sich nicht.
    const results = sleepInfo(sim.state, 'koeln')?.results ?? [];
    const average = results.reduce((a, b) => a + b, 0) / results.length;
    expect(average).toBeGreaterThan(0);
    for (const e of slept) {
      expect(e.payload.amount).toBeGreaterThanOrEqual(Math.floor(average * SLEEP_FACTOR_MIN));
      expect(e.payload.amount).toBeLessThanOrEqual(Math.ceil(average * SLEEP_FACTOR_MAX));
    }
    // Gebucht als Ergebnis von Köln, und die Rechte Hand nimmt ihren Anteil daraus.
    const week = cityReport(sim.state, 'koeln', 7);
    expect(week.rows.find((r) => r.category === 'income.city')?.amount).toBeGreaterThan(0);
    const shares = eventsOfType(events, 'hierarchy.shareTaken');
    expect(shares.length).toBeGreaterThanOrEqual(8);
    for (const s of shares) {
      expect(s.payload.cityId).toBe('koeln');
      expect(s.payload.amount).toBe(Math.round(s.payload.profit * FULL_POWER_SHARE));
    }
    // Hamburg hat nichts damit zu tun.
    expect(cityReport(sim.state, 'hamburg', 7).rows.some((r) => r.category === 'share.righthand')).toBe(false);
    // Lager und Leute bleiben (nur Lieferungen, die vor dem Umschalten bestellt waren, kommen noch an), keine
    // Einzel-Löhne in Köln.
    const delivered = eventsOfType(events, 'shipment.arrived')
      .filter((e) => !e.payload.atPort)
      .reduce((sum, e) => sum + e.payload.amount, 0);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(stock + delivered);
    expect(getStaff(sim.state).length).toBe(staff);
    expect(week.rows.some((r) => r.category.startsWith('wages.'))).toBe(false);
    // Die schlafenden Tage zählen nicht als eigenes Geschäft (sonst würde der Schnitt sich selbst füttern).
    const lastDay = slept[slept.length - 1].payload.day;
    expect(cityDayProfit(sim.state, 'koeln', lastDay)).toBe(0);

    // Aufwachen: Köln ist wieder live, die Rechte Hand arbeitet weiter, nichts wird nachgerechnet.
    const before = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } }).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(before);
    expect(getRightHand(sim.state)?.staffId).toBe(bossId);
    expect(getRightHand(sim.state)?.fullPower?.cityId).toBe('koeln');
    sim.advance(DAY);
    expect(eventsOfType(events, 'city.slept').filter((e) => e.payload.cityId === 'koeln').length).toBe(slept.length);
  });

  it('Tagesergebnis einer live gespielten Stadt enthält die Löhne dieses Tages (Schnitt wird nicht zu hoch)', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    // Ein Tag ohne Umsatz: Das Ergebnis des Tages sind nur die Löhne.
    sim.advance(DAY + 10 - sim.state.time);
    const results = sleepInfo(sim.state, 'koeln')?.results ?? [];
    expect(results).toHaveLength(1);
    const day1 = cityReport(sim.state, 'koeln', 1, 1);
    expect(day1.wages).toBeGreaterThan(0);
    expect(results[0]).toBe(Math.round(cityDayProfit(sim.state, 'koeln', day1.to) ?? Number.NaN));
    expect(results[0]).toBeLessThanOrEqual(-Math.round(day1.wages));
  });

  it('Teiltage zählen nicht: Wer mitten am Tag umschaltet, bekommt für diesen Tag weder Eintrag noch Zusammenfassung', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    // Tag 1 ganz in Köln, Tag 2 um 12 Uhr nach Hamburg.
    sim.advance(DAY + 12 * 60 - sim.state.time);
    expect(sleepInfo(sim.state, 'koeln')?.results).toHaveLength(1);
    const events = recordEvents(sim);
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
    sim.advance(DAY);
    // Mitternacht nach Tag 2: Köln war nur halb live, Hamburg nur halb zu Hause.
    expect(sleepInfo(sim.state, 'koeln')?.results).toHaveLength(1);
    expect(sleepInfo(sim.state, 'hamburg')?.results ?? []).toHaveLength(0);
    expect(eventsOfType(events, 'city.slept').filter((e) => e.payload.cityId === 'koeln')).toHaveLength(0);
    // Tag 3 hat Köln ganz geschlafen: Zusammenfassung, Hamburg zählt als ganzer live gespielter Tag.
    sim.advance(DAY);
    expect(eventsOfType(events, 'city.slept').filter((e) => e.payload.cityId === 'koeln')).toHaveLength(1);
    expect(sleepInfo(sim.state, 'hamburg')?.results).toHaveLength(1);
  });

  it('Kasse pro Stadt: Buchungen am Spot, durch Leute und ohne Bezug landen in ihrer Stadt; Filter Stadt', () => {
    const sim = quietGame();
    handOverKoeln(sim);
    const ctx = sim.ctx('test');
    wallet.earn(ctx, 1000, 'dirty', 'Köln', { category: 'sales.street', spotId: 'neumarkt' });
    wallet.earn(ctx, 700, 'dirty', 'Hamburg', { category: 'sales.street', spotId: 'spielbudenplatz' });
    wallet.pay(ctx, 300, 'dirty', 'Hamburg', { category: 'expense.other', cityId: 'hamburg' });
    wallet.earn(ctx, 50, 'dirty', 'ohne Bezug', 'income.other');
    sim.step();
    expect(balance(sim.state, 'today', { kind: 'city', cityId: 'hamburg' }).profit).toBe(400);
    const koeln = balance(sim.state, 'today', { kind: 'city', cityId: 'koeln' });
    expect(koeln.rows.find((r) => r.category === 'sales.street')?.amount).toBe(1000);
    expect(koeln.rows.find((r) => r.category === 'income.other')?.amount).toBe(50);
    const all = balance(sim.state, 'today');
    expect(all.rows.find((r) => r.category === 'sales.street')?.amount).toBe(1700);
  });

  it('deterministisch über zwei Städte (gleicher Seed, gleiche Befehle mit Umschalten)', () => {
    const run = () => {
      const sim = createTestGame({ seed: 7 });
      handOverKoeln(sim);
      sim.advance(DAY);
      sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
      sim.advance(2 * DAY);
      sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } });
      sim.advance(DAY);
      return JSON.stringify(sim.state);
    };
    expect(run()).toBe(run());
  });

  it('alter Spielstand (Auftrag 29) lädt: alles in Köln, Hamburg verschlossen, Hamburg wie bei einem neuen Spiel', () => {
    const sim = quietGame();
    sim.advance(DAY);
    // So sah ein Stand nach Auftrag 29 aus: ohne Modul city, Kasse ohne Städte, ein Liegeplatz, eine Polizei-Stufe,
    // Leute ohne Stadt, nur Kölner Gangs, Einfluss und Heat nur in Köln.
    const old = structuredClone(sim.state) as unknown as {
      modules: Record<string, Record<string, unknown>>;
      moduleVersions: Record<string, number>;
    };
    const m = old.modules;
    delete m.city;
    delete old.moduleVersions.city;
    for (const day of m.finance.days as Record<string, unknown>[]) delete day.cities;
    old.moduleVersions.finance = 1;
    const { berths, ...logistics } = m.logistics as { berths: Record<string, unknown> };
    m.logistics = { ...logistics, berth: (berths as { koeln?: unknown }).koeln ?? null };
    old.moduleVersions.logistics = 1;
    const { tiers, ...police } = m.police as { tiers: Record<string, number> };
    m.police = { ...police, tier: tiers.koeln ?? null };
    old.moduleVersions.police = 4;
    for (const list of ['members', 'former']) {
      for (const p of m.staff[list] as Record<string, unknown>[]) delete p.cityId;
    }
    old.moduleVersions.staff = 5;
    const gangs = m.gangs.gangs as Record<string, unknown>;
    for (const id of Object.keys(gangs)) if (id.startsWith('hh-')) delete gangs[id];
    old.moduleVersions.gangs = 2;
    const t = m.territory as { influence: Record<string, unknown>; controller: Record<string, unknown> };
    for (const v of allVeedel('hamburg')) {
      delete t.influence[v.id];
      delete t.controller[v.id];
      delete (m.police.heat as Record<string, unknown>)[v.id];
    }
    old.moduleVersions.territory = 3;

    const loaded = loadSimulation(old as never, sim.modules);
    expect(activeCity(loaded.state)).toBe('koeln');
    expect(citiesUnlocked(loaded.state)).toEqual(['koeln']);
    expect(getStaff(loaded.state).every((p) => p.cityId === 'koeln')).toBe(true);
    expect(loaded.state.modules.finance.days[0].cities.koeln).toEqual(loaded.state.modules.finance.days[0].categories);
    expect(loaded.state.modules.police.tiers).toEqual(sim.state.modules.police.tiers);
    expect(getGangStatus(loaded.state, 'hh-kiez')?.people).toBeGreaterThan(0);
    expect(controllerOf(loaded.state, 'st-pauli')).toBe(controllerOf(sim.state, 'st-pauli'));
    expect(loaded.state.modules.territory.influence.kalk).toEqual(sim.state.modules.territory.influence.kalk);
    loaded.advance(DAY);
    expect(loaded.isOver).toBe(false);
    expect(citiesUnlocked(loaded.state)).toEqual(['koeln']);
  });
});

describe('Hamburger Hafen und Lieferanten (Auftrag 30)', () => {
  /** Köln übergeben und nach Hamburg umschalten, mit sauberem Geld und einem Hamburger Lager. */
  function inHamburg(): Simulation {
    const sim = quietGame();
    handOverKoeln(sim);
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    sim.state.wallet.clean = 40000;
    sim.state.wallet.dirty = 60000;
    return sim;
  }

  it('Liegeplatz in Hamburg: 12.000 € sauber, eigener Kai; Daan wird Hafen-Großhändler', () => {
    const sim = inHamburg();
    const events = recordEvents(sim);
    expect(hasBerth(sim.state, 'hamburg')).toBe(false);
    expect(hasBerth(sim.state, 'koeln')).toBe(false);
    expect(berthCost('hamburg')).toBe(12000);
    expect(sim.dispatch({ type: 'logistics.buyBerth', payload: {} }).ok).toBe(true);
    expect(sim.state.wallet.clean).toBe(28000);
    expect(hasBerth(sim.state, 'hamburg')).toBe(true);
    expect(hasBerth(sim.state, 'koeln')).toBe(false);
    expect(eventsOfType(events, 'logistics.berthBought').map((e) => e.payload)).toEqual([
      { cost: 12000, cityId: 'hamburg' },
    ]);
    expect(isUnlocked(sim.state, 'hamburg')).toBe(true);
    // Hein liefert in Hamburg wie in Köln aus der Stadt ins Lager, Amsterdam ist der Hafen mit den großen Mengen.
    expect(supplierIn(getSuppliers(sim.state)[3], 'hamburg').kind).toBe('city');
    expect(supplierIn(getSuppliers(sim.state)[4], 'hamburg').kind).toBe('port');
    sim.state.modules.suppliers.unlocked.push('amsterdam');
    const daan = availablePackages(sim.state, 'amsterdam', 'hamburg');
    expect(daan.map((p) => p.id)).toContain('hh-haze1kg');
    // Rotterdam und Kalle liefern nicht nach Hamburg.
    expect(getSuppliers(sim.state, 'hamburg').map((s) => s.id)).toEqual([
      'frankfurt',
      'berlin',
      'hamburg',
      'amsterdam',
    ]);
    expect(sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'large' } }).ok).toBe(
      false,
    );
  });

  it('Container am Hamburger Kai: sicher 10 Stunden, dann findet der Zoll sie mit 8 % pro Stunde', () => {
    const sim = inHamburg();
    sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
    sim.state.modules.suppliers.unlocked.push('amsterdam');
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'amsterdam', packageId: 'hh-haze1kg' } }).ok,
    ).toBe(true);
    const shipment = sim.state.modules.suppliers.shipments[0];
    expect(shipment.cityId).toBe('hamburg');
    expect(shipment.arrivesAt - shipment.orderedAt).toBeGreaterThanOrEqual(360);
    sim.advance(shipment.arrivesAt - sim.state.time + 1);
    const cargo = getCargo(sim.state, 'hamburg');
    expect(cargo).toHaveLength(1);
    expect(getCargo(sim.state, 'koeln')).toHaveLength(0);
    expect(cargoRiskFrom(cargo[0])).toBe(cargo[0].arrivedAt + 10 * 60);
    // Fiete meldet den Container.
    expect(messages.thread(sim.state, HARBOR_CALLER.id).some((m) => m.options?.some((o) => o.id === 'driver'))).toBe(
      true,
    );
    // Lange stehen lassen: Irgendwann ist er weg.
    sim.advance(5 * DAY);
    expect(getCargo(sim.state, 'hamburg')).toHaveLength(0);
  });

  it('Toni liefert nach Hamburg: 330 Minuten, zehn Prozent Aufschlag, ins Hamburger Lager', () => {
    const sim = inHamburg();
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } }),
    ).toEqual({ ok: false, reason: 'In Hamburg hast du noch kein Lager.' });
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'werkstatt-ottensen' } }).ok).toBe(true);
    expect(packagePrice(sim.state, 'frankfurt', 'weed50', 'hamburg')).toBe(
      Math.round(packagePrice(sim.state, 'frankfurt', 'weed50', 'koeln') * 1.1),
    );
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } }).ok,
    ).toBe(true);
    const s = sim.state.modules.suppliers.shipments[0];
    expect(s.warehouseId).toBe('werkstatt-ottensen');
    expect(s.arrivesAt - s.orderedAt).toBeGreaterThanOrEqual(330);
    sim.advance(s.arrivesAt - sim.state.time + 1);
    expect(getStock(sim.state, { cityId: 'hamburg', productId: 'weed' })).toBe(50);
  });
});
