// Routen mit Fahrplan (Auftrag 30, Etappe 6): Köln–Hamburg über die A1, Kapazität, Rückfahrt, Zoll, Nachkauf für
// schlafende Städte.

import { describe, expect, it } from 'vitest';
import { clock, loadSimulation, MINUTES_PER_DAY, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeCity, isCityLive } from '../city';
import { activeEncounters } from '../encounters';
import { getStock, store } from '../goods';
import { getStaffMember } from '../staff';
import { INTERCITY_CAPACITY, ROUTE_LOAD_MINUTES } from './config';
import {
  driverWhereabouts,
  getRoute,
  getRoutes,
  getTrips,
  isInterCityTrip,
  nextDeparture,
  type RouteInput,
  routeLoadPreview,
} from './index';

const DAY = MINUTES_PER_DAY;
const KOELN = 'ehrenfeld';
const HAMBURG = 'werkstatt-ottensen';

/** Ruhiges Spiel mit Hamburg frei, einem Hamburger Lager und Geld. */
function twoCities(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  sim.state.wallet.dirty = 50_000;
  sim.state.wallet.clean = 50_000;
  expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
  expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: HAMBURG } }).ok).toBe(true);
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

function addRoute(sim: Simulation, input: Omit<RouteInput, 'departure'> & { departure?: number }): number {
  const departure = input.departure ?? (clock.minuteOfDay(sim.state.time) + 10) % DAY;
  const result = sim.dispatch({ type: 'logistics.addRoute', payload: { ...input, departure } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { routeId: number }).routeId;
}

/** Bis zur nächsten Abfahrt der Route vorspulen. */
function untilDeparture(sim: Simulation, routeId: number): void {
  const route = getRoute(sim.state, routeId);
  const at = route ? nextDeparture(sim.state, route) : null;
  if (at === null) throw new Error('keine Abfahrt');
  sim.advance(at - sim.state.time);
}

/** Laufende Fahrt der Route ohne Kontrolle zu Ende fahren. */
function finishTrip(sim: Simulation, routeId: number): void {
  const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
  if (!trip) throw new Error('keine Fahrt');
  trip.checkAt = null;
  sim.advance(trip.arrivesAt - sim.state.time);
}

describe('Routen mit Fahrplan (Auftrag 30)', () => {
  it('tägliche Route bringt Ware von Köln nach Hamburg: Bestand sinkt und steigt, der Fahrer kommt leer zurück', () => {
    const sim = twoCities();
    const events = recordEvents(sim);
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 3000, warehouseId: KOELN, quality: 0.8 });
    const before = getStock(sim.state, { warehouseId: KOELN, productId: 'weed' });
    const routeId = addRoute(sim, {
      driverId,
      fromId: KOELN,
      toId: HAMBURG,
      items: [{ productId: 'weed', amount: 2000 }],
    });
    expect(getRoute(sim.state, routeId)).toMatchObject({ active: true, days: [], roundTrip: false, runs: 0 });

    untilDeparture(sim, routeId);
    const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
    expect(trip).toMatchObject({ kind: 'route', leg: 'out', driverId, fromId: KOELN, toId: HAMBURG });
    if (!trip) return;
    expect(isInterCityTrip(sim.state, trip)).toBe(true);
    expect(getStock(sim.state, { warehouseId: KOELN, productId: 'weed' })).toBe(before - 2000);
    // Über die A1: laden, dann 4 bis 5 Stunden Fahrt.
    const drive = trip.arrivesAt - trip.loadedAt;
    expect(trip.loadedAt - trip.startedAt).toBe(ROUTE_LOAD_MINUTES);
    expect(drive).toBeGreaterThanOrEqual(4 * 60);
    expect(drive).toBeLessThanOrEqual(5 * 60);
    expect(eventsOfType(events, 'route.departed')[0].payload).toMatchObject({ routeId, amount: 2000, interCity: true });
    expect(driverWhereabouts(sim.state, driverId).trip?.id).toBe(trip.id);

    finishTrip(sim, routeId);
    expect(getStock(sim.state, { warehouseId: HAMBURG, productId: 'weed' })).toBe(2000);
    // Leute bleiben in ihrer Stadt (Feedback vom 05.10.2026): Der Fahrer gehört weiter zu Köln und fährt leer zurück.
    expect(getStaffMember(sim.state, driverId)?.cityId).toBe('koeln');
    expect(eventsOfType(events, 'staff.relocated')).toHaveLength(0);
    const back = getTrips(sim.state).find((t) => t.routeId === routeId);
    expect(back).toMatchObject({ leg: 'back', fromId: HAMBURG, toId: KOELN, items: [] });
    finishTrip(sim, routeId);
    expect(getStaffMember(sim.state, driverId)?.assignment).toBeNull();
    expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'done' });

    // Am nächsten Tag fährt die Route wieder.
    untilDeparture(sim, routeId);
    expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'started' });
    expect(eventsOfType(events, 'route.skipped')).toHaveLength(0);
  });

  it('lädt höchstens 5 kg je Fahrt (Edibles 5 g, Vapes 20 g) und füllt bis zum Zielbestand auf', () => {
    const sim = twoCities();
    const driverId = hireDriver(sim);
    const tooMuch = sim.dispatch({
      type: 'logistics.addRoute',
      payload: { driverId, fromId: KOELN, toId: HAMBURG, items: [{ productId: 'weed', amount: 6000 }], departure: 600 },
    });
    expect(tooMuch.ok).toBe(false);
    store(sim.ctx('test'), { productId: 'weed', amount: 9000, warehouseId: KOELN });
    store(sim.ctx('test'), { productId: 'vape', amount: 400, warehouseId: KOELN });
    store(sim.ctx('test'), { productId: 'weed', amount: 500, warehouseId: HAMBURG });
    const fill = addRoute(sim, {
      driverId,
      fromId: KOELN,
      toId: HAMBURG,
      fillTo: [
        { productId: 'weed', target: 3000 },
        { productId: 'vape', target: 300 },
      ],
    });
    const route = getRoute(sim.state, fill);
    if (!route) return;
    // 2.500 g Gras fehlen in Hamburg; danach passen noch 2.500 g, also 125 Vapes.
    expect(routeLoadPreview(sim.state, route)).toEqual([
      { productId: 'weed', amount: 2500 },
      { productId: 'vape', amount: 125 },
    ]);
    expect(2500 + 125 * 20).toBe(INTERCITY_CAPACITY);
  });

  it('Rückfahrt bringt Hafenware aus Hamburg nach Köln, der Fahrer ist wieder zu Hause', () => {
    const sim = twoCities();
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 1000, warehouseId: KOELN });
    // Was der Hafen gebracht hat, liegt im Hamburger Lager.
    store(sim.ctx('test'), { productId: 'hash', amount: 800, warehouseId: HAMBURG, quality: 0.7, unitCost: 2.5 });
    const routeId = addRoute(sim, {
      driverId,
      fromId: KOELN,
      toId: HAMBURG,
      items: [{ productId: 'weed', amount: 1000 }],
      roundTrip: true,
      returnItems: [{ productId: 'hash', amount: 600 }],
    });
    untilDeparture(sim, routeId);
    finishTrip(sim, routeId);
    expect(getStock(sim.state, { warehouseId: HAMBURG, productId: 'weed' })).toBe(1000);
    const back = getTrips(sim.state).find((t) => t.routeId === routeId);
    expect(back).toMatchObject({
      leg: 'back',
      fromId: HAMBURG,
      toId: KOELN,
      items: [{ productId: 'hash', amount: 600 }],
    });
    expect(getStock(sim.state, { warehouseId: HAMBURG, productId: 'hash' })).toBe(200);
    finishTrip(sim, routeId);
    expect(getStock(sim.state, { warehouseId: KOELN, productId: 'hash' })).toBe(600);
    expect(getStaffMember(sim.state, driverId)?.cityId).toBe('koeln');
    expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'done' });
    expect(getRoute(sim.state, routeId)?.runs).toBe(1);
  });

  it('Zoll auf der A1: Die Fahrt steht, fliegt die Ladung auf, ist sie ganz weg und die Zielstadt wird heißer', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 40 && results.size < 2; seed++) {
      const sim = twoCities(seed);
      const events = recordEvents(sim);
      const driverId = hireDriver(sim);
      store(sim.ctx('test'), { productId: 'weed', amount: 2000, warehouseId: KOELN });
      const routeId = addRoute(sim, {
        driverId,
        fromId: KOELN,
        toId: HAMBURG,
        items: [{ productId: 'weed', amount: 2000 }],
      });
      untilDeparture(sim, routeId);
      const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
      if (!trip) throw new Error('keine Fahrt');
      trip.checkAt = trip.loadedAt + 120;
      const heatBefore = sim.state.modules.police.heat.ottensen ?? 0;
      sim.advance(trip.checkAt - sim.state.time);
      const started = eventsOfType(events, 'encounter.started')[0].payload;
      expect(started.kind).toBe('customsCheck');
      expect(started.request).toMatchObject({ opponent: { label: 'Der Zoll' }, lossCategory: 'loss.customs' });
      expect(started.request.place).toMatch(/^auf der A1 bei /);
      // Auftrag 46d: Die Kontrolle ist sofort entschieden.
      expect(activeEncounters(sim.state)).toHaveLength(0);
      const outcome = eventsOfType(events, 'encounter.resolved')[0].payload.outcome;
      if (outcome === 'failure') {
        expect(getTrips(sim.state)).toHaveLength(0);
        expect(eventsOfType(events, 'transport.seized')[0].payload.amount).toBe(2000);
        expect(getRoute(sim.state, routeId)?.last).toMatchObject({ result: 'seized' });
        expect(sim.state.modules.police.heat.ottensen ?? 0).toBeGreaterThan(heatBefore);
        sim.advance(DAY);
        expect(getStock(sim.state, { productId: 'weed', warehouseId: HAMBURG })).toBe(0);
        results.add('seized');
      } else {
        // Weiter nach einer Stunde Aufenthalt.
        expect(trip.status).toBe('enRoute');
        results.add('passed');
      }
    }
    expect(results.size).toBe(2);
  });


  it('schlafendes Köln: Was die Route nimmt, kauft die Rechte Hand um Mitternacht nach', () => {
    const sim = twoCities();
    const driverId = hireDriver(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 2500, warehouseId: KOELN, quality: 0.8, unitCost: 4 });
    // Die Route legst du in Köln an (dort fährt sie los), dann geht es nach Hamburg.
    const routeId = addRoute(sim, {
      driverId,
      fromId: KOELN,
      toId: HAMBURG,
      items: [{ productId: 'weed', amount: 2000 }],
      departure: 8 * 60,
    });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    expect(activeCity(sim.state)).toBe('hamburg');
    expect(isCityLive(sim.state, 'koeln')).toBe(false);
    const before = getStock(sim.state, { warehouseId: KOELN, productId: 'weed' });
    // In Hamburg tauchen Kölner Routen nicht auf und lassen sich nicht ändern (Auftrag 43).
    expect(getRoutes(sim.state, 'hamburg')).toEqual([]);
    expect(getRoutes(sim.state, 'koeln')).toHaveLength(1);
    expect(sim.dispatch({ type: 'logistics.updateRoute', payload: { routeId, departure: 9 * 60 } }).ok).toBe(false);
    untilDeparture(sim, routeId);
    expect(getStock(sim.state, { warehouseId: KOELN, productId: 'weed' })).toBe(before - 2000);
    expect(sim.state.modules.logistics.restock).toEqual([
      expect.objectContaining({ warehouseId: KOELN, productId: 'weed', amount: 2000 }),
    ]);
    const dirty = sim.state.wallet.dirty;
    const events = recordEvents(sim);
    sim.advance(DAY - clock.minuteOfDay(sim.state.time) + 1);
    expect(getStock(sim.state, { warehouseId: KOELN, productId: 'weed' })).toBe(before);
    expect(sim.state.modules.logistics.restock).toEqual([]);
    const purchase = eventsOfType(events, 'wallet.changed').find((e) => e.payload.category === 'goods.purchase');
    expect(purchase?.payload).toMatchObject({ cityId: 'koeln' });
    expect(sim.state.wallet.dirty).toBeLessThan(dirty);
  });

  it('ohne Fahrer oder Ware fällt die Route aus; fehlt etwas, fährt sie mit dem, was da ist', () => {
    const sim = twoCities();
    const events = recordEvents(sim);
    store(sim.ctx('test'), { productId: 'weed', amount: 300, warehouseId: KOELN });
    const have = getStock(sim.state, { warehouseId: KOELN, productId: 'weed' });
    const lonely = addRoute(sim, { fromId: KOELN, toId: HAMBURG, items: [{ productId: 'weed', amount: have + 200 }] });
    expect(sim.dispatch({ type: 'logistics.runRouteNow', payload: { routeId: lonely } })).toEqual({
      ok: false,
      reason: 'Kein Fahrer eingeteilt.',
    });
    const driverId = hireDriver(sim);
    expect(sim.dispatch({ type: 'logistics.updateRoute', payload: { routeId: lonely, driverId } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'logistics.runRouteNow', payload: { routeId: lonely } }).ok).toBe(true);
    expect(getTrips(sim.state).find((t) => t.routeId === lonely)?.items[0].amount).toBe(have);
    expect(getRoute(sim.state, lonely)?.last?.note).toContain('nicht alles da');
    // Ausschalten: keine Abfahrt mehr.
    expect(sim.dispatch({ type: 'logistics.updateRoute', payload: { routeId: lonely, active: false } }).ok).toBe(true);
    const route = getRoute(sim.state, lonely);
    expect(route && nextDeparture(sim.state, route)).toBeNull();
    expect(sim.dispatch({ type: 'logistics.removeRoute', payload: { routeId: lonely } }).ok).toBe(true);
    expect(getRoute(sim.state, lonely)).toBeUndefined();
    expect(eventsOfType(events, 'route.departed')).toHaveLength(1);
  });

  it('nur an bestimmten Wochentagen', () => {
    const sim = twoCities();
    const driverId = hireDriver(sim);
    const today = clock.weekday(sim.state.time);
    const routeId = addRoute(sim, {
      driverId,
      fromId: KOELN,
      toId: HAMBURG,
      items: [{ productId: 'weed', amount: 10 }],
      departure: 23 * 60,
      days: [(today + 2) % 7],
    });
    const route = getRoute(sim.state, routeId);
    const at = route ? nextDeparture(sim.state, route) : null;
    expect(at).not.toBeNull();
    expect(clock.weekday(at ?? 0)).toBe((today + 2) % 7);
    expect(clock.minuteOfDay(at ?? 0)).toBe(23 * 60);
  });

  it('alte Spielstände (Version 2) bekommen leere Routen', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, Record<string, unknown>>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.logistics.routes;
    delete raw.modules.logistics.restock;
    raw.moduleVersions.logistics = 2;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.logistics.routes).toEqual([]);
    expect(loaded.state.modules.logistics.restock).toEqual([]);
  });

  it('mit festem Transporter fährt die Route mehr als 5 kg, Fahrer und Transporter kommen zurück (Auftrag 33)', () => {
    const sim = twoCities(4);
    const driverId = hireDriver(sim);
    const bought = sim.dispatch({ type: 'fleet.buy', payload: { model: 'van' } });
    if (!bought.ok) throw new Error(bought.reason);
    const vehicleId = (bought.data as { vehicleId: number }).vehicleId;
    store(sim.ctx('test'), { productId: 'weed', amount: 9000, warehouseId: KOELN });
    expect(() =>
      addRoute(sim, { driverId, fromId: KOELN, toId: HAMBURG, items: [{ productId: 'weed', amount: 8000 }] }),
    ).toThrow();
    const routeId = addRoute(sim, {
      driverId,
      vehicleId,
      fromId: KOELN,
      toId: HAMBURG,
      items: [{ productId: 'weed', amount: 8000 }],
    });
    untilDeparture(sim, routeId);
    const trip = getTrips(sim.state).find((t) => t.routeId === routeId);
    expect(trip?.vehicleId).toBe(vehicleId);
    expect(trip?.items[0].amount).toBe(8000);
    finishTrip(sim, routeId);
    expect(getStock(sim.state, { warehouseId: HAMBURG, productId: 'weed' })).toBe(8000);
    // Leer zurück nach Köln, mit demselben Transporter.
    expect(getTrips(sim.state).find((t) => t.routeId === routeId)).toMatchObject({ leg: 'back', vehicleId });
    finishTrip(sim, routeId);
    expect(sim.state.modules.fleet.vehicles[0]).toMatchObject({ cityId: 'koeln', tripId: null });
  });
});
