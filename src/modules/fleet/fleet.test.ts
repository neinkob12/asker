import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { store } from '../goods';
import { getTrips, receiveCargo, speedOf } from '../logistics';
import { getVehicles, PRIVATE_CAR, pickVehicle, VEHICLE_MODELS, vehicleSpec } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.clean = 100_000;
  return sim;
}

function buy(sim: Simulation, model: string): number {
  const result = sim.dispatch({ type: 'fleet.buy', payload: { model } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { vehicleId: number }).vehicleId;
}

describe('fleet (Auftrag 33)', () => {
  it('Modelle haben feste Ladung, Tempo, Kontrollfaktor und Preis; der Lkw kommt später', () => {
    for (const m of VEHICLE_MODELS) {
      expect(m.capacity, m.id).toBeGreaterThan(0);
      expect(m.price, m.id).toBeGreaterThan(0);
    }
    const sim = quietGame();
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'truck' } }).ok).toBe(false);
    sim.state.wallet.clean = 0;
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'van' } }).ok).toBe(false);
  });

  it('kaufen mit sauberem Geld, verkaufen für die Hälfte', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const id = buy(sim, 'kombi');
    const price = VEHICLE_MODELS.find((m) => m.id === 'kombi')?.price ?? 0;
    expect(sim.state.wallet.clean).toBe(100_000 - price);
    expect(getVehicles(sim.state, 'koeln')).toHaveLength(1);
    expect(sim.dispatch({ type: 'fleet.sell', payload: { vehicleId: id } }).ok).toBe(true);
    expect(sim.state.wallet.clean).toBe(100_000 - price / 2);
    sim.step();
    expect(eventsOfType(events, 'fleet.bought')).toHaveLength(1);
  });

  it('wer nichts kauft, fährt das Privatauto wie bisher', () => {
    const sim = quietGame();
    expect(pickVehicle(sim.state, 'koeln', 300)).toBeNull();
    expect(vehicleSpec(sim.state, null)).toBe(PRIVATE_CAR);
    expect(speedOf(sim.state, null)).toBe(speedOf(sim.state, null, null));
  });

  it('Fahrten nehmen das kleinste freie Fahrzeug, in das die Ladung passt', () => {
    const sim = quietGame();
    const scooter = buy(sim, 'scooter');
    const van = buy(sim, 'van');
    expect(pickVehicle(sim.state, 'koeln', 1500)).toBe(scooter);
    expect(pickVehicle(sim.state, 'koeln', 4000)).toBeNull();
    expect(pickVehicle(sim.state, 'koeln', 9000)).toBe(van);
    expect(pickVehicle(sim.state, 'koeln', 900_000)).toBe(van);
    expect(pickVehicle(sim.state, 'hamburg', 1500)).toBeNull();
  });

  it('in der Stadt nimmt das Privatauto alles mit; ein eigenes Fahrzeug begrenzt nur, wenn man es wählt', () => {
    const sim = quietGame();
    sim.state.modules.logistics.berths.koeln = { since: 0, level: 0 };
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } });
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 7000,
      quality: 0.7,
      unitCost: 2,
    });
    const pickup = (vehicleId?: number | 'private') =>
      sim.dispatch({
        type: 'logistics.pickup',
        payload: { by: 'player', warehouseId: 'kalk', ...(vehicleId !== undefined ? { vehicleId } : {}) },
      });
    const reset = () => {
      for (const trip of getTrips(sim.state)) {
        const vehicle = sim.state.modules.fleet.vehicles.find((v) => v.id === trip.vehicleId);
        if (vehicle) vehicle.tripId = null;
      }
      sim.state.modules.logistics.trips = [];
      sim.state.modules.logistics.cargo = [];
      receiveCargo(sim.ctx('suppliers'), {
        supplierId: 'rotterdam',
        productId: 'weed',
        amount: 7000,
        quality: 0.7,
        unitCost: 2,
      });
    };
    // Ohne eigenes Fahrzeug wie bisher: alles in einem Rutsch.
    expect(pickup().ok).toBe(true);
    expect(getTrips(sim.state)[0]).toMatchObject({ items: [expect.objectContaining({ amount: 7000 })] });
    expect(getTrips(sim.state)[0].vehicleId).toBeUndefined();
    // Ein Roller passt nicht: Ohne Wahl fährt trotzdem das Privatauto mit allem.
    const scooter = buy(sim, 'scooter');
    sim.state.modules.logistics.cargo = [];
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 7000,
      quality: 0.7,
      unitCost: 2,
    });
    reset();
    expect(pickup().ok).toBe(true);
    expect(getTrips(sim.state)[0].vehicleId).toBeUndefined();
    // Wer den Roller wählt, nimmt nur 2 kg mit, der Rest bleibt am Kai.
    reset();
    expect(pickup(scooter).ok).toBe(true);
    expect(getTrips(sim.state)[0].items[0].amount).toBe(2000);
    expect(sim.state.modules.logistics.cargo[0].amount).toBe(5000);
    // Ein Transporter, in den alles passt, wird von selbst genommen und ist danach wieder frei.
    reset();
    const van = buy(sim, 'van');
    expect(pickup().ok).toBe(true);
    const [trip] = getTrips(sim.state);
    expect(trip.vehicleId).toBe(van);
    const vanNow = () => getVehicles(sim.state).find((v) => v.id === van);
    expect(vanNow()?.tripId).toBe(trip.id);
    trip.checkAt = null;
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(vanNow()?.tripId).toBeNull();
  });

  it('auf Routen fasst das Privatauto wie bisher 5 kg', () => {
    const sim = quietGame();
    expect(PRIVATE_CAR.capacity).toBe(5000);
    expect(pickVehicle(sim.state, 'koeln', 9000)).toBeNull();
  });

  it('ein Fahrzeug, das unterwegs ist, kann man nicht wählen', () => {
    const sim = quietGame();
    const kombi = buy(sim, 'kombi');
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } });
    store(sim.ctx('test'), { productId: 'hash', amount: 100 });
    const go = () =>
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'ehrenfeld', toId: 'kalk', productId: 'hash', amount: 10, by: 'player', vehicleId: kombi },
      });
    expect(go().ok).toBe(true);
    expect(getTrips(sim.state)[0].vehicleId).toBe(kombi);
    sim.state.modules.logistics.trips[0].driverId = 'niemand';
    expect(go()).toEqual({ ok: false, reason: 'Kombi ist gerade unterwegs.' });
  });

  it('fliegt die Ladung auf, ist das Fahrzeug mit Chance beschlagnahmt', () => {
    let seized = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = quietGame(seed);
      const kombi = buy(sim, 'kombi');
      sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } });
      store(sim.ctx('test'), { productId: 'hash', amount: 100 });
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'ehrenfeld', toId: 'kalk', productId: 'hash', by: 'player', vehicleId: kombi },
      });
      const [trip] = getTrips(sim.state);
      trip.checkAt = sim.state.time + 1;
      sim.advance(2);
      // Kontrolle verlieren: Konfrontation direkt auflösen.
      sim.ctx('test').emit('encounter.resolved', {
        encounterId: trip.encounterId ?? 0,
        request: { kind: 'vehicleCheck', origin: { module: 'logistics', ref: `trip:${trip.id}` } },
        outcome: 'defeat',
      } as never);
      sim.step();
      if (getVehicles(sim.state)[0]?.seizedAt !== null) seized++;
    }
    expect(seized).toBeGreaterThan(0);
    expect(seized).toBeLessThan(12);
  });

  it('migriert Logistik Version 3: Routen ohne festes Fahrzeug', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, { routes?: object[] }>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.logistics.routes = [
      {
        id: 5,
        name: '',
        driverId: null,
        fromId: 'ehrenfeld',
        toId: 'kalk',
        items: [],
        fillTo: [],
        departure: 600,
        days: [],
        roundTrip: false,
        returnItems: [],
        active: true,
        last: null,
        runs: 0,
      },
    ];
    raw.moduleVersions.logistics = 3;
    delete raw.modules.fleet;
    delete raw.moduleVersions.fleet;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.logistics.routes[0].vehicleId).toBeNull();
    expect(loaded.state.modules.fleet.vehicles).toEqual([]);
  });
});
