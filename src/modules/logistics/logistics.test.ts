import { describe, expect, it } from 'vitest';
import { loadSimulation, messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeEncounters } from '../encounters';
import { getStock, store } from '../goods';
import { roadDistance } from '../roads';
import { getStaff, getStaffMember } from '../staff';
import { BERTH_COST, CARGO_SAFE_MINUTES, DRIVER_BASE_SPEED, DRIVER_SPEED_PER_POINT, LOAD_MINUTES } from './config';
import {
  cargoAmount,
  freeDrivers,
  getCargo,
  getTrip,
  getTrips,
  hasBerth,
  isPlayerOnTheRoad,
  portPlace,
  receiveCargo,
  tripProgress,
  tripRoute,
} from './index';

/** Ruhiges Spiel: keine Laufkundschaft, damit Bestände genau stimmen. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function withCargo(sim: Simulation, amount = 500): number {
  sim.state.modules.logistics.berths.koeln = { since: sim.state.time };
  return receiveCargo(sim.ctx('suppliers'), {
    supplierId: 'rotterdam',
    productId: 'hash',
    amount,
    quality: 0.7,
    unitCost: 2.5,
  });
}

function hireDriver(sim: Simulation): string {
  const result = sim.dispatch({ type: 'staff.hireDriver', payload: {} });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

/** Keine Kontrolle unterwegs, damit der Test genau rechnen kann. */
function noChecks(sim: Simulation): void {
  for (const trip of sim.state.modules.logistics.trips) trip.checkAt = null;
}

describe('logistics: Hafen', () => {
  it('den Liegeplatz mietet man mit sauberem Geld', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const buy = () => sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
    expect(hasBerth(sim.state)).toBe(false);
    expect(buy().ok).toBe(false);
    sim.state.wallet.clean = BERTH_COST;
    expect(buy().ok).toBe(true);
    expect(sim.state.wallet.clean).toBe(0);
    expect(hasBerth(sim.state)).toBe(true);
    expect(buy()).toEqual({ ok: false, reason: 'Du hast dort schon einen Liegeplatz.' });
    expect(eventsOfType(events, 'logistics.berthBought')).toHaveLength(1);
    expect(messages.thread(sim.state, 'other:harbor')).toHaveLength(1);
  });

  it('Schiffsware wartet am Kai, der Hafenmeister schreibt, zu lange stehen lassen ruft den Zoll', () => {
    const sim = quietGame(3);
    const events = recordEvents(sim);
    withCargo(sim, 300);
    expect(cargoAmount(sim.state)).toBe(300);
    expect(cargoAmount(sim.state, 'weed')).toBe(0);
    const note = messages.thread(sim.state, 'other:harbor').at(-1);
    expect(note?.options?.map((o) => o.id)).toEqual(['driver', 'self', 'later']);
    // Die ersten Stunden ist die Ware sicher.
    sim.advance(CARGO_SAFE_MINUTES - 1);
    expect(getCargo(sim.state)).toHaveLength(1);
    // Danach findet der Zoll sie irgendwann.
    sim.advance(10 * 24 * 60);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(eventsOfType(events, 'cargo.seized')[0].payload).toMatchObject({ productId: 'hash', amount: 300 });
    expect(sim.state.modules.logistics.stats.seized).toBe(300);
  });

  it('alte Spielstände: Wer schon in Rotterdam bestellt hat, behält einen Liegeplatz', () => {
    const sim = createTestGame();
    sim.state.modules.suppliers.relations.rotterdam.orders = 2;
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    delete raw.modules.logistics;
    delete raw.moduleVersions.logistics;
    expect(hasBerth(loadSimulation(raw, sim.modules).state)).toBe(true);
    raw.modules.suppliers = { ...(raw.modules.suppliers as object), relations: {} };
    expect(hasBerth(loadSimulation(raw, sim.modules).state)).toBe(false);
  });
});

describe('logistics: Fahrten', () => {
  it('ein Fahrer holt die Ware am Kai ab und bringt sie über die Straßen ins Lager', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const cargoId = withCargo(sim);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } })).toEqual({
      ok: false,
      reason: 'Kein freier Fahrer. Heuer einen an (Logistik-App oder Leute).',
    });
    const driverId = hireDriver(sim);
    expect(freeDrivers(sim.state).map((m) => m.id)).toEqual([driverId]);
    const stock = getStock(sim.state);
    const result = sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', cargoIds: [cargoId] } });
    expect(result.ok).toBe(true);
    noChecks(sim);
    expect(getCargo(sim.state)).toHaveLength(0);
    const [trip] = getTrips(sim.state);
    expect(trip).toMatchObject({ kind: 'pickup', driverId, fromId: 'port', toId: 'ehrenfeld' });
    expect(getStaffMember(sim.state, driverId)?.assignment).toEqual({ kind: 'transport', targetId: String(trip.id) });
    expect(freeDrivers(sim.state)).toHaveLength(0);

    // Fahrzeit aus der Straßenlänge: hin, laden, zurück.
    const speed = DRIVER_BASE_SPEED + (getStaffMember(sim.state, driverId)?.stats.speed ?? 50) * DRIVER_SPEED_PER_POINT;
    const warehouse = { lng: 6.918, lat: 50.948 };
    const oneWay = Math.ceil(roadDistance(warehouse, portPlace()) / speed);
    expect(trip.loadedAt - trip.startedAt).toBe(Math.ceil(roadDistance(warehouse, portPlace()) / speed) + LOAD_MINUTES);
    expect(trip.arrivesAt - trip.loadedAt).toBe(Math.ceil(roadDistance(portPlace(), warehouse) / speed));
    expect(oneWay).toBeGreaterThan(10);

    // Die Karte bekommt beide Wege über die Straßen.
    const route = tripRoute(sim.state, trip);
    expect(route.approach?.length).toBeGreaterThan(5);
    expect(route.delivery[0]).toEqual({ lng: portPlace().lng, lat: portPlace().lat });
    expect(tripProgress(sim.state, trip).leg).toBe('toPickup');
    sim.advance(trip.loadedAt - LOAD_MINUTES / 2 - sim.state.time);
    expect(tripProgress(sim.state, trip).leg).toBe('loading');
    sim.advance(trip.loadedAt + 1 - sim.state.time);
    expect(tripProgress(sim.state, trip).leg).toBe('delivering');

    sim.advance(trip.arrivesAt - sim.state.time - 1);
    expect(getStock(sim.state, { productId: 'hash' })).toBe(0);
    sim.advance(1);
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(getStock(sim.state)).toBe(stock + 500);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(500);
    expect(getStaffMember(sim.state, driverId)?.assignment).toBeNull();
    expect(getStaffMember(sim.state, driverId)?.xp).toBeGreaterThan(0);
    expect(eventsOfType(events, 'transport.arrived')[0].payload).toMatchObject({ kind: 'pickup', amount: 500 });
  });

  it('selbst abholen: Du bist unterwegs und kannst nicht gleichzeitig ausliefern', () => {
    const sim = quietGame();
    withCargo(sim, 200);
    withCargo(sim, 100);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(true);
    noChecks(sim);
    const [trip] = getTrips(sim.state);
    expect(trip.driverId).toBeNull();
    expect(trip.items.reduce((sum, i) => sum + i.amount, 0)).toBe(300);
    expect(isPlayerOnTheRoad(sim.state)).toBe(true);
    withCargo(sim, 50);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } })).toEqual({
      ok: false,
      reason: 'Du bist schon mit einer Fahrt unterwegs.',
    });
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(isPlayerOnTheRoad(sim.state)).toBe(false);
    expect(getStock(sim.state, { productId: 'hash' })).toBe(300);
  });

  it('Umlagern bringt Ware von einem eigenen Lager ins andere', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.state.wallet.clean = 10000;
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: 80, quality: 0.66 });
    const transfer = (payload: Partial<{ productId: string; amount: number; toId: string }>) =>
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'ehrenfeld', toId: 'kalk', by: 'player', ...payload },
      });
    expect(transfer({ toId: 'ehrenfeld' }).ok).toBe(false);
    expect(transfer({ toId: 'muelheim' }).ok).toBe(false);
    expect(transfer({ productId: 'vape' }).ok).toBe(false);
    expect(transfer({ productId: 'hash', amount: 30 }).ok).toBe(true);
    noChecks(sim);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(50);
    const [trip] = getTrips(sim.state);
    expect(trip).toMatchObject({ kind: 'transfer', fromId: 'ehrenfeld', toId: 'kalk' });
    expect(tripRoute(sim.state, trip).approach).toBeNull();
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'kalk' })).toBe(30);
    expect(eventsOfType(events, 'transport.arrived')[0].payload).toMatchObject({ kind: 'transfer', toId: 'kalk' });
  });

  it('Verkehrskontrolle: Die Fahrt steht, bis die Konfrontation vorbei ist, dann weiter oder Ladung weg', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 40 && results.size < 2; seed++) {
      const sim = quietGame(seed);
      const events = recordEvents(sim);
      withCargo(sim, 400);
      const driverId = hireDriver(sim);
      expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } }).ok).toBe(true);
      const trip = getTrips(sim.state)[0];
      trip.checkAt = trip.loadedAt + 3;
      sim.advance(trip.checkAt - sim.state.time);
      expect(getTrip(sim.state, trip.id)?.status).toBe('stopped');
      expect(tripProgress(sim.state, trip).leg).toBe('stopped');
      const started = eventsOfType(events, 'encounter.started')[0].payload;
      expect(started.kind).toBe('vehicleCheck');
      expect(started.request).toMatchObject({ staffIds: [driverId], playerPresent: false, stakes: { goods: 400 } });
      // Die Fahrt steht, solange die Konfrontation läuft.
      const arrivesAt = trip.arrivesAt;
      sim.advance(5);
      expect(getTrip(sim.state, trip.id)?.arrivesAt).toBe(arrivesAt);
      const encounterId = activeEncounters(sim.state)[0].id;
      expect(sim.dispatch({ type: 'encounters.auto', payload: { encounterId } }).ok).toBe(true);
      const outcome = eventsOfType(events, 'encounter.resolved')[0].payload.outcome;
      if (outcome === 'failure') {
        expect(getTrips(sim.state)).toHaveLength(0);
        expect(eventsOfType(events, 'transport.seized')[0].payload.amount).toBe(400);
        const driver = getStaffMember(sim.state, driverId);
        const arrested = eventsOfType(events, 'transport.seized')[0].payload.arrested;
        // Wer bei der Kontrolle zu Boden ging, ist verletzt statt in Haft.
        if (arrested) expect(driver?.status).toBe('jailed');
        else expect(['active', 'injured']).toContain(driver?.status);
        expect(driver?.assignment).toBeNull();
        expect(driver?.returnTo).toBeNull();
        sim.advance(24 * 60);
        expect(getStock(sim.state, { productId: 'hash' })).toBe(0);
        results.add('seized');
      } else {
        const current = getTrip(sim.state, trip.id);
        expect(current?.status).toBe('enRoute');
        expect(current?.arrivesAt).toBeGreaterThan(arrivesAt);
        sim.advance((current?.arrivesAt ?? 0) - sim.state.time);
        expect(getStock(sim.state, { productId: 'hash' })).toBe(400);
        results.add('passed');
      }
    }
    expect(results.size).toBe(2);
  });

  it('fällt der Fahrer unterwegs aus, ist die Ladung weg', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    withCargo(sim, 100);
    const driverId = hireDriver(sim);
    sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } });
    noChecks(sim);
    sim.advance(5);
    sim.dispatch({ type: 'staff.fire', payload: { staffId: driverId } });
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(eventsOfType(events, 'transport.lost')[0].payload.amount).toBe(100);
    expect(getStaff(sim.state, { role: 'driver' })).toHaveLength(0);
  });

  it('keine Pleite, solange Ware am Kai steht oder unterwegs ist', () => {
    const sim = quietGame();
    withCargo(sim, 100);
    sim.state.modules.goods.stock.ehrenfeld = [];
    sim.state.wallet.dirty = 0;
    sim.step();
    expect(sim.isOver).toBe(false);
  });
});
