// Auftrag 33, Etappe 3: Routenwahl (Autobahn, Landstraße, nachts).
import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getStock, store } from '../goods';
import { veedelAt } from '../veedel';
import { NIGHT_START } from './config';
import { cargoAmount, departureFor, getTrips, receiveCargo, tripProgress } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.clean = 20_000;
  sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } });
  store(sim.ctx('test'), { productId: 'hash', amount: 300 });
  return sim;
}

const transfer = (sim: Simulation, choice?: 'autobahn' | 'country' | 'night') =>
  sim.dispatch({
    type: 'logistics.transfer',
    payload: { fromId: 'ehrenfeld', toId: 'kalk', productId: 'hash', by: 'player', ...(choice ? { choice } : {}) },
  });

describe('logistics: Routenwahl (Auftrag 33)', () => {
  it('Landstraße dauert länger als die Autobahn', () => {
    const a = quietGame();
    transfer(a, 'autobahn');
    const b = quietGame();
    transfer(b, 'country');
    const fast = getTrips(a.state)[0];
    const slow = getTrips(b.state)[0];
    expect(slow.choice).toBe('country');
    expect(slow.arrivesAt - slow.startedAt).toBeGreaterThan(fast.arrivesAt - fast.startedAt);
  });

  it('Landstraße und Nacht werden seltener kontrolliert', () => {
    const kalk = veedelAt(7.006, 50.9395)?.id ?? '';
    const checks = { autobahn: 0, country: 0, night: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      for (const choice of ['autobahn', 'country', 'night'] as const) {
        const sim = quietGame(seed);
        sim.state.modules.police.heat[kalk] = 100;
        sim.state.time = sim.state.time - clock.minuteOfDay(sim.state.time) + NIGHT_START;
        transfer(sim, choice);
        if (getTrips(sim.state)[0]?.checkAt !== null) checks[choice]++;
      }
    }
    expect(checks.autobahn).toBeGreaterThan(checks.country);
    expect(checks.country).toBeGreaterThan(checks.night);
  });

  it('nachts: Abfahrt erst um 23 Uhr, bis dahin steht die Ware im Hof', () => {
    const sim = quietGame();
    const day = sim.state.time - clock.minuteOfDay(sim.state.time);
    expect(departureFor(day + 10 * 60, 'night')).toBe(day + NIGHT_START);
    expect(departureFor(day + 23 * 60 + 30, 'night')).toBe(day + 23 * 60 + 30);
    expect(departureFor(day + 2 * 60, 'night')).toBe(day + 2 * 60);
    expect(departureFor(day + 10 * 60, 'country')).toBe(day + 10 * 60);
    expect(transfer(sim, 'night').ok).toBe(true);
    const [trip] = getTrips(sim.state);
    expect(trip.status).toBe('planned');
    expect(tripProgress(sim.state, trip).leg).toBe('planned');
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(0);
    // Du bist bis dahin frei, eine zweite Nachtfahrt geht aber nicht.
    expect(transfer(sim, 'night').ok).toBe(false);
    sim.advance(trip.startedAt - sim.state.time);
    expect(trip.status).toBe('enRoute');
    trip.checkAt = null;
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'kalk' })).toBe(300);
  });

  it('nächtliche Abholung: Container bleiben am Kai, bis der Fahrer um 23 Uhr losfährt', () => {
    const sim = quietGame(2);
    sim.state.modules.logistics.berths.koeln = { since: 0, level: 0 };
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 500,
      quality: 0.7,
      unitCost: 2,
    });
    sim.dispatch({ type: 'staff.hireDriver', payload: {} });
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', choice: 'night' } }).ok).toBe(true);
    expect(cargoAmount(sim.state, 'weed')).toBe(500);
    // Eine zweite Abholung findet nichts: Die Container sind eingeteilt.
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(false);
    const [trip] = getTrips(sim.state);
    sim.advance(trip.startedAt - sim.state.time);
    expect(cargoAmount(sim.state, 'weed')).toBe(0);
    expect(trip.items[0].amount).toBe(500);
    expect(trip.choice).toBe('night');
  });

  it('Routen mit Wahl der Strecke: nachts fährt sie frühestens um 23 Uhr', () => {
    const sim = quietGame();
    const result = sim.dispatch({
      type: 'logistics.addRoute',
      payload: {
        fromId: 'ehrenfeld',
        toId: 'kalk',
        items: [{ productId: 'hash', amount: 10 }],
        departure: 8 * 60,
        choice: 'night',
      },
    });
    if (!result.ok) throw new Error(result.reason);
    const route = sim.state.modules.logistics.routes[0];
    expect(route).toMatchObject({ choice: 'night', departure: NIGHT_START });
    sim.dispatch({
      type: 'logistics.updateRoute',
      payload: { routeId: route.id, choice: 'country', departure: 8 * 60 },
    });
    expect(route).toMatchObject({ choice: 'country', departure: 8 * 60 });
  });
});
