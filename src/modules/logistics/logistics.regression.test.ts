// Regressionstests zum Bugreview (Paket Logistik): feste Routen-Fahrer, Kontrollen mit verletztem Fahrer, weggefallene
// Fahrzeuge, Teillieferungen am vollen Lager, Nachkauf, schlafender Kai, Nachtfahrten, Kran, Schiffe, Landstraße
// zwischen zwei Städten.

import { describe, expect, it } from 'vitest';
import { clock, MINUTES_PER_DAY, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import type { EncounterRequest } from '../encounters';
import {
  getStock,
  storageStats,
  store,
  storeFitting,
  take,
  warehouseCapacity,
  warehouseFree,
  warehouseLoad,
  warehousePlace,
} from '../goods';
import { getStaffMember, setStatus } from '../staff';
import { allVeedel } from '../veedel';
import { LOAD_MINUTES } from './config';
import {
  freeDrivers,
  getCargo,
  getRoute,
  getTrips,
  itemsText,
  nextDeparture,
  type RouteChoice,
  type RouteInput,
  receiveCargo,
  type Trip,
  tripProgress,
} from './index';

const DAY = MINUTES_PER_DAY;

/** Ruhiges Spiel: keine Laufkundschaft, Geld da, zweites Kölner Lager in Kalk. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  sim.state.wallet.dirty = 50_000;
  sim.state.wallet.clean = 50_000;
  expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
  return sim;
}

function hireDriver(sim: Simulation): string {
  const result = sim.dispatch({ type: 'staff.hireDriver', payload: {} });
  if (!result.ok) throw new Error(result.reason);
  const id = (result.data as { staffId: string }).staffId;
  const m = getStaffMember(sim.state, id);
  if (m) m.stats.loyalty = 95;
  return id;
}

function addRoute(sim: Simulation, input: RouteInput): number {
  const result = sim.dispatch({ type: 'logistics.addRoute', payload: input });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { routeId: number }).routeId;
}

/** Abfahrt in minutes Minuten ab jetzt (Minute des Tages). */
function departureIn(sim: Simulation, minutes: number): number {
  return (clock.minuteOfDay(sim.state.time) + minutes + DAY) % DAY;
}

function noChecks(sim: Simulation): void {
  for (const trip of sim.state.modules.logistics.trips) trip.checkAt = null;
}

/** Lager bis auf grams Gramm füllen (Gras wiegt 1 g pro Einheit). */
function fillUp(sim: Simulation, warehouseId: string, grams: number): void {
  storeFitting(sim.ctx('test'), {
    productId: 'weed',
    amount: warehouseFree(sim.state, warehouseId) - grams,
    warehouseId,
  });
}

function withCargo(sim: Simulation, amount = 500): void {
  sim.state.modules.logistics.berths.koeln = { since: sim.state.time, level: 0 };
  receiveCargo(sim.ctx('suppliers'), { supplierId: 'rotterdam', productId: 'hash', amount, quality: 0.7, unitCost: 2 });
}

/** Kontrolle von Hand anhalten und mit diesem Ausgang beenden, nachdem der Fahrer verletzt wurde (wie engine.finish). */
function injuredDuringCheck(sim: Simulation, trip: Trip, driverId: string, outcome: 'success' | 'retreat'): void {
  trip.status = 'stopped';
  trip.stoppedAt = sim.state.time;
  trip.encounterId = 424_242;
  trip.checkAt = null;
  const ctx = sim.ctx('encounters');
  // Reihenfolge wie in der Konfrontation: erst staff.statusChanged, dann encounter.resolved.
  setStatus(ctx, driverId, 'injured');
  const request: EncounterRequest = {
    kind: 'vehicleCheck',
    staffIds: [driverId],
    playerPresent: false,
    skipEffects: true,
    origin: { module: 'logistics', ref: `trip:${trip.id}` },
  };
  ctx.emit('encounter.resolved', {
    encounterId: 424_242,
    kind: 'vehicleCheck',
    outcome,
    request,
    playerKilled: false,
  });
  sim.step();
}

describe('Fester Routen-Fahrer bleibt für seine Route', () => {
  it('Abholung ohne Fahrerwahl kurz vor der Abfahrt nimmt nicht den einzigen Routen-Fahrer, die Route fährt', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 1000, warehouseId: 'ehrenfeld' });
    const routeId = addRoute(sim, {
      driverId,
      fromId: 'ehrenfeld',
      toId: 'kalk',
      items: [{ productId: 'weed', amount: 500 }],
      departure: departureIn(sim, 5),
    });
    withCargo(sim);
    const result = sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('die Route');
    // Auch ausdrücklich gewählt nicht (der Hafen-Knopf schickt den ersten freien mit ID).
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', driverId } }).ok).toBe(false);
    expect(
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'ehrenfeld', toId: 'kalk', by: 'driver' } }).ok,
    ).toBe(false);
    expect(getStaffMember(sim.state, driverId)?.assignment).toBeNull();
    sim.advance(5);
    expect(eventsOfType(events, 'route.skipped')).toHaveLength(0);
    expect(eventsOfType(events, 'route.departed')).toHaveLength(1);
    expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'started' });
  });

  it('ist ein zweiter Fahrer frei, fährt der; ist die Route noch lange hin, darf auch der Routen-Fahrer', () => {
    const sim = quietGame(2);
    const routeDriver = hireDriver(sim);
    const other = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 1000, warehouseId: 'ehrenfeld' });
    const routeId = addRoute(sim, {
      driverId: routeDriver,
      fromId: 'ehrenfeld',
      toId: 'kalk',
      items: [{ productId: 'weed', amount: 500 }],
      departure: departureIn(sim, 5),
    });
    // Wer keine Route fährt, steht vorn (für „Fahrer schicken“ in der Oberfläche).
    expect(freeDrivers(sim.state).map((m) => m.id)).toEqual([other, routeDriver]);
    withCargo(sim);
    const result = sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } });
    expect(result.ok).toBe(true);
    expect(getTrips(sim.state)[0].driverId).toBe(other);

    // Abfahrt erst in fast einem Tag: Die Abholung ist lange vorher zurück.
    expect(
      sim.dispatch({ type: 'logistics.updateRoute', payload: { routeId, departure: departureIn(sim, -60) } }).ok,
    ).toBe(true);
    const route = getRoute(sim.state, routeId);
    expect(route && (nextDeparture(sim.state, route) ?? 0) - sim.state.time).toBeGreaterThan(20 * 60);
    withCargo(sim, 200);
    const again = sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } });
    expect(again.ok).toBe(true);
    expect(getStaffMember(sim.state, routeDriver)?.assignment?.kind).toBe('transport');
  });
});

describe('Kontrolle bestanden, aber der Fahrer ist verletzt', () => {
  it('die Fahrt platzt wie bei jedem ausgefallenen Fahrer, die Ladung kommt nicht an', () => {
    const sim = quietGame(3);
    const events = recordEvents(sim);
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'hash', amount: 400, warehouseId: 'kalk' });
    const before = getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' });
    expect(
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'kalk', toId: 'ehrenfeld', productId: 'hash', by: 'driver' },
      }).ok,
    ).toBe(true);
    const [trip] = getTrips(sim.state);
    injuredDuringCheck(sim, trip, driverId, 'success');
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(eventsOfType(events, 'transport.lost')[0]?.payload).toMatchObject({ tripId: trip.id, amount: 400 });
    sim.advance(3 * 60);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(before);
    expect(eventsOfType(events, 'transport.arrived')).toHaveLength(0);
  });

  it('auf einer Route steht danach „Fahrer ausgefallen“, nicht „angekommen“', () => {
    const sim = quietGame(4);
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 600, warehouseId: 'ehrenfeld' });
    const routeId = addRoute(sim, {
      driverId,
      fromId: 'ehrenfeld',
      toId: 'kalk',
      items: [{ productId: 'weed', amount: 400 }],
      departure: 600,
    });
    expect(sim.dispatch({ type: 'logistics.runRouteNow', payload: { routeId } }).ok).toBe(true);
    const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
    if (!trip) throw new Error('keine Fahrt');
    injuredDuringCheck(sim, trip, driverId, 'retreat');
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'lost' });
  });
});

describe('Route, deren festes Fahrzeug weg ist', () => {
  it('fährt mit dem passenden Fahrzeug weiter, die tote ID ist weg und das Journal sagt es', () => {
    const sim = quietGame(5);
    const events = recordEvents(sim);
    const driverId = hireDriver(sim);
    const bought = sim.dispatch({ type: 'fleet.buy', payload: { model: 'van' } });
    if (!bought.ok) throw new Error(bought.reason);
    const vehicleId = (bought.data as { vehicleId: number }).vehicleId;
    store(sim.ctx('test'), { productId: 'weed', amount: 1000, warehouseId: 'ehrenfeld' });
    const routeId = addRoute(sim, {
      driverId,
      vehicleId,
      fromId: 'ehrenfeld',
      toId: 'kalk',
      items: [{ productId: 'weed', amount: 500 }],
      departure: 600,
    });
    expect(sim.dispatch({ type: 'fleet.sell', payload: { vehicleId } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'logistics.runRouteNow', payload: { routeId } }).ok).toBe(true);
    expect(getRoute(sim.state, routeId)?.vehicleId).toBeNull();
    expect(getTrips(sim.state)[0].vehicleId).toBeUndefined();
    expect(sim.state.journal.some((e) => e.text.includes('festes Fahrzeug gibt es nicht mehr'))).toBe(true);
    expect(eventsOfType(events, 'route.skipped')).toHaveLength(0);
  });
});

describe('Ankunft nach Teillieferung am vollen Lager', () => {
  it('transport.arrived und Journal nennen die ganze Ladung in Gramm', () => {
    const sim = quietGame(6);
    const events = recordEvents(sim);
    hireDriver(sim);
    store(sim.ctx('test'), { productId: 'hash', amount: 300, warehouseId: 'kalk' });
    expect(
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'driver' } }).ok,
    ).toBe(true);
    noChecks(sim);
    const [trip] = getTrips(sim.state);
    fillUp(sim, 'ehrenfeld', 100);
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(trip.status).toBe('waiting');
    take(sim.ctx('test'), { productId: 'weed', amount: 500, warehouseId: 'ehrenfeld' });
    sim.advance(60);
    expect(getTrips(sim.state)).toHaveLength(0);
    const arrived = eventsOfType(events, 'transport.arrived')[0]?.payload;
    expect(arrived).toMatchObject({ amount: 300, items: [{ productId: 'hash', amount: 300 }] });
    const text = `${itemsText([{ productId: 'hash', amount: 300 }])} im Lager Ehrenfeld angekommen.`;
    expect(sim.state.journal.some((e) => e.text === text)).toBe(true);
  });

  it('nach dem Umleiten nennen Menge, Liste, Journal und Fahrtenbuch nur, was im neuen Lager ankommt', () => {
    const sim = quietGame(6);
    const events = recordEvents(sim);
    hireDriver(sim);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: 300, warehouseId: 'kalk' });
    expect(
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'driver' } }).ok,
    ).toBe(true);
    noChecks(sim);
    const [trip] = getTrips(sim.state);
    fillUp(sim, 'ehrenfeld', 100);
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(trip.status).toBe('waiting');
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(100);
    expect(sim.dispatch({ type: 'logistics.redirect', payload: { tripId: trip.id, toId: 'nippes' } }).ok).toBe(true);
    noChecks(sim);
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'nippes' })).toBe(200);
    const arrived = eventsOfType(events, 'transport.arrived')[0]?.payload;
    expect(arrived).toMatchObject({ toId: 'nippes', amount: 200, items: [{ productId: 'hash', amount: 200 }] });
    // Die Meldung „Fahrt angekommen“ nennt die Ware nur, wenn Menge und Liste zusammenpassen.
    expect(arrived?.items?.reduce((sum, i) => sum + i.amount, 0)).toBe(arrived?.amount);
    const text = `${itemsText([{ productId: 'hash', amount: 200 }])} ${warehousePlace('Garage Nippes', 'in')} angekommen.`;
    expect(sim.state.journal.some((e) => e.text === text)).toBe(true);
    expect(sim.state.modules.logistics.log[0]).toMatchObject({
      id: trip.id,
      result: 'done',
      toId: 'nippes',
      amount: 200,
    });
  });
});

describe('Nachkauf der Rechten Hand passt ins Lager', () => {
  it('lagert nur ein, was Platz hat, bezahlt nur das, der Rest bleibt offen', () => {
    const sim = quietGame(7);
    const hamburg = 'werkstatt-ottensen';
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: hamburg } }).ok).toBe(true);
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 2500, warehouseId: 'ehrenfeld', quality: 0.8, unitCost: 4 });
    const routeId = addRoute(sim, {
      driverId,
      fromId: 'ehrenfeld',
      toId: hamburg,
      items: [{ productId: 'weed', amount: 2000 }],
      departure: 8 * 60,
    });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const route = getRoute(sim.state, routeId);
    const at = route ? nextDeparture(sim.state, route) : null;
    if (at === null) throw new Error('keine Abfahrt');
    sim.advance(at - sim.state.time);
    expect(sim.state.modules.logistics.restock).toEqual([expect.objectContaining({ amount: 2000 })]);
    // Bis Mitternacht füllt sich das Kölner Lager wieder bis auf 500 g.
    fillUp(sim, 'ehrenfeld', 500);
    const events = recordEvents(sim);
    sim.advance(DAY - clock.minuteOfDay(sim.state.time) + 1);
    expect(warehouseLoad(sim.state, 'ehrenfeld')).toBeLessThanOrEqual(warehouseCapacity(sim.state, 'ehrenfeld'));
    const open = sim.state.modules.logistics.restock;
    expect(open).toHaveLength(1);
    expect(open[0].amount).toBeGreaterThan(0);
    expect(open[0].amount).toBeLessThan(2000);
    const paid = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.category === 'goods.purchase');
    expect(paid).toHaveLength(1);
  });
});

describe('Fahrer fällt aus, während die Routenfahrt am vollen Lager wartet', () => {
  it('die Ware wird abgeladen und die Fahrt zählt als angekommen, die Route ist fertig', () => {
    const sim = quietGame(8);
    const events = recordEvents(sim);
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'hash', amount: 400, warehouseId: 'kalk' });
    const routeId = addRoute(sim, {
      driverId,
      fromId: 'kalk',
      toId: 'ehrenfeld',
      items: [{ productId: 'hash', amount: 300 }],
      departure: 600,
    });
    expect(sim.dispatch({ type: 'logistics.runRouteNow', payload: { routeId } }).ok).toBe(true);
    noChecks(sim);
    const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
    if (!trip) throw new Error('keine Fahrt');
    fillUp(sim, 'ehrenfeld', 100);
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(trip.status).toBe('waiting');
    const trips = sim.state.modules.logistics.stats.trips;
    setStatus(sim.ctx('test'), driverId, 'injured');
    sim.step();
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(sim.state.modules.logistics.stats.trips).toBe(trips + 1);
    expect(eventsOfType(events, 'transport.arrived')[0]?.payload).toMatchObject({
      tripId: trip.id,
      amount: 300,
      items: [{ productId: 'hash', amount: 300 }],
    });
    expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'done' });
  });
});

describe('Rest am Kai einer schlafenden Stadt', () => {
  it('zählt nur beim ersten Eingang als abgewiesen, nicht jede Stunde wieder', () => {
    const sim = createTestGame({ seed: 3 });
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    // Noch 3 g frei: Platz, aber kein Vape (20 g) passt mehr.
    fillUp(sim, 'ehrenfeld', 3);
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'vape',
      amount: 50,
      quality: 0.6,
      unitCost: 2,
      cityId: 'koeln',
    });
    sim.step();
    const stats = { ...storageStats(sim.state) };
    expect(stats.rejected).toBeGreaterThanOrEqual(50 * 20);
    sim.advance(6 * 60);
    expect(getCargo(sim.state, 'koeln')).toHaveLength(1);
    expect(storageStats(sim.state)).toEqual(stats);
  });
});

describe('Nachtfahrt meldet sich einmal', () => {
  it('transport.started erst bei der Abfahrt um 23 Uhr, mit der echten Ankunft', () => {
    const sim = quietGame(9);
    const events = recordEvents(sim);
    sim.state.time = sim.state.time - clock.minuteOfDay(sim.state.time) + 10 * 60;
    store(sim.ctx('test'), { productId: 'hash', amount: 300, warehouseId: 'ehrenfeld' });
    expect(
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'ehrenfeld', toId: 'kalk', productId: 'hash', by: 'player', choice: 'night' },
      }).ok,
    ).toBe(true);
    const [trip] = getTrips(sim.state);
    expect(trip.status).toBe('planned');
    expect(eventsOfType(events, 'transport.started')).toHaveLength(0);
    sim.advance(trip.startedAt - sim.state.time);
    const started = eventsOfType(events, 'transport.started');
    expect(started).toHaveLength(1);
    expect(started[0].payload.arrivesAt).toBeGreaterThan(sim.state.time);
  });
});

describe('Kran-Ausbau während der Abholung', () => {
  it('der Abschnitt „Laden“ beginnt weiter zur alten Zeit', () => {
    const sim = quietGame(10);
    withCargo(sim);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(true);
    noChecks(sim);
    const [trip] = getTrips(sim.state);
    // Mit dem Kai (Stufe 0) lädt die Fahrt LOAD_MINUTES; jetzt wird der Kran fertig.
    sim.state.modules.logistics.berths.koeln.level = 2;
    sim.advance(trip.loadedAt - LOAD_MINUTES + 5 - sim.state.time);
    expect(tripProgress(sim.state, trip).leg).toBe('loading');
  });
});

describe('Seeschiffe fahren nicht auf der Straße', () => {
  it('weder beim Umlagern noch fest auf einer Route', () => {
    const sim = quietGame(11);
    const driverId = hireDriver(sim);
    const shipId = 987_654;
    sim.state.modules.fleet.vehicles.push({
      id: shipId,
      model: 'coaster',
      cityId: 'koeln',
      tripId: null,
      seizedAt: null,
      number: 1,
    });
    store(sim.ctx('test'), { productId: 'hash', amount: 300, warehouseId: 'ehrenfeld' });
    expect(
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'ehrenfeld', toId: 'kalk', by: 'player', vehicleId: shipId },
      }),
    ).toEqual({ ok: false, reason: 'Schiffe fahren nicht auf der Straße.' });
    expect(
      sim.dispatch({
        type: 'logistics.addRoute',
        payload: {
          driverId,
          vehicleId: shipId,
          fromId: 'ehrenfeld',
          toId: 'kalk',
          items: [{ productId: 'hash', amount: 100 }],
          departure: 600,
        },
      }),
    ).toEqual({ ok: false, reason: 'Schiffe fahren nicht auf der Straße.' });
    expect(sim.state.modules.fleet.vehicles.find((v) => v.id === shipId)?.tripId).toBeNull();
  });
});

describe('Route zwischen zwei Städten mit Landstraße', () => {
  /** Route von Köln nach Hamburg mit dieser Wahl bis zur Abfahrt; Hamburg mit hoher Heat, der Zoll kontrolliert oft. */
  function departed(seed: number, choice: RouteChoice): { sim: Simulation; trip: Trip } {
    const sim = quietGame(seed);
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'werkstatt-ottensen' } }).ok).toBe(true);
    for (const v of allVeedel('hamburg')) sim.state.modules.police.heat[v.id] = 100;
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 2000, warehouseId: 'ehrenfeld', quality: 0.8 });
    const routeId = addRoute(sim, {
      driverId,
      fromId: 'ehrenfeld',
      toId: 'werkstatt-ottensen',
      items: [{ productId: 'weed', amount: 1000 }],
      departure: departureIn(sim, 10),
      choice,
    });
    const route = getRoute(sim.state, routeId);
    const at = route ? nextDeparture(sim.state, route) : null;
    if (at === null) throw new Error('keine Abfahrt');
    sim.advance(at - sim.state.time);
    const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
    if (!trip) throw new Error('keine Fahrt');
    return { sim, trip };
  }

  /** Bis zur Kontrolle fahren: der Text im Journal ("Zollkontrolle auf der A1 bei …"). */
  function customsText(sim: Simulation, trip: Trip): string | undefined {
    sim.advance((trip.checkAt ?? sim.state.time) - sim.state.time);
    return sim.state.journal.find((e) => e.text.startsWith('Zollkontrolle'))?.text;
  }

  it('fährt die A1 wie mit Autobahn: gleiche Fahrzeit, der Zoll kontrolliert genauso und am selben Ort', () => {
    let checks = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const fast = departed(seed, 'autobahn');
      const slow = departed(seed, 'country');
      expect(slow.trip.choice).toBe('country');
      expect(slow.trip.arrivesAt - slow.trip.loadedAt).toBe(fast.trip.arrivesAt - fast.trip.loadedAt);
      // Gleicher Seed und gleiche Chance: Die Kontrolle fällt auf dieselbe Minute (oder bleibt bei beiden aus).
      expect(slow.trip.checkAt).toBe(fast.trip.checkAt);
      if (fast.trip.checkAt === null) continue;
      checks++;
      const text = customsText(fast.sim, fast.trip);
      expect(text).toMatch(/^Zollkontrolle auf der A1 bei /);
      expect(customsText(slow.sim, slow.trip)).toBe(text);
    }
    expect(checks).toBeGreaterThan(0);
  });
});
