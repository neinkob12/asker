// Auftrag 33, Review: wiederholte Versuche am vollen Lager zählen nicht doppelt, "nachts" wirkt nur nachts, das
// Fahrzeug bleibt nach einer abgebrochenen Fahrt in der Startstadt, Rest am Kai wird gemeldet.
import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { storageStats, store, take, warehouseFree } from '../goods';
import { NIGHT_START } from './config';
import { effectiveChoice, getTrips, receiveCargo } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.clean = 50_000;
  return sim;
}

describe('logistics: Review Auftrag 33', () => {
  it('eine wartende Fahrt zählt den Rest nur einmal als abgelehnt und meldet ihn nur einmal', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } });
    store(sim.ctx('test'), { productId: 'hash', amount: 1000, warehouseId: 'kalk' });
    sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'player' } });
    const [trip] = getTrips(sim.state);
    trip.checkAt = null;
    store(sim.ctx('test'), { productId: 'weed', amount: warehouseFree(sim.state, 'ehrenfeld') });
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(trip.status).toBe('waiting');
    const once = storageStats(sim.state).rejected;
    expect(once).toBe(1000);
    // Einen Tag warten: viele Versuche, aber keine neuen Ablehnungen und keine neuen Meldungen.
    sim.advance(24 * 60);
    expect(storageStats(sim.state).rejected).toBe(once);
    expect(eventsOfType(events, 'goods.storeRejected')).toHaveLength(1);
    expect(eventsOfType(events, 'transport.waiting')[0].payload.driverId).toBeNull();
  });

  it('"nachts" bringt am Tag nichts (Jetzt fahren, Umleiten)', () => {
    const day = 3 * 24 * 60;
    expect(effectiveChoice('night', day + 10 * 60)).toBe('autobahn');
    expect(effectiveChoice('night', day + NIGHT_START + 30)).toBe('night');
    expect(effectiveChoice('night', day + 3 * 60)).toBe('night');
    expect(effectiveChoice('country', day + 10 * 60)).toBe('country');
    expect(effectiveChoice(undefined, day)).toBe('autobahn');
    // Route "nachts" jetzt am Tag fahren: Die Fahrt hat die Wahl, die Kontrollchance ist die der Autobahn.
    const sim = quietGame();
    sim.state.time = sim.state.time - clock.minuteOfDay(sim.state.time) + 10 * 60;
    const trip = { choice: 'night' as const, startedAt: sim.state.time };
    expect(effectiveChoice(trip.choice, trip.startedAt)).toBe('autobahn');
  });

  it('fliegt eine Route zwischen den Städten auf, bleibt das Fahrzeug in der Startstadt', () => {
    let seized = false;
    for (let seed = 1; seed <= 12 && !seized; seed++) {
      const sim = quietGame(seed);
      const events = recordEvents(sim);
      sim.state.wallet.dirty = 50_000;
      sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
      sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'werkstatt-ottensen' } });
      const hired = sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      if (!hired.ok) throw new Error(hired.reason);
      const driverId = (hired.data as { staffId: string }).staffId;
      const bought = sim.dispatch({ type: 'fleet.buy', payload: { model: 'kombi' } });
      if (!bought.ok) throw new Error(bought.reason);
      const vehicleId = (bought.data as { vehicleId: number }).vehicleId;
      store(sim.ctx('test'), { productId: 'weed', amount: 2000, warehouseId: 'ehrenfeld' });
      const added = sim.dispatch({
        type: 'logistics.addRoute',
        payload: {
          driverId,
          vehicleId,
          fromId: 'ehrenfeld',
          toId: 'werkstatt-ottensen',
          items: [{ productId: 'weed', amount: 1000 }],
          departure: (clock.minuteOfDay(sim.state.time) + 10) % 1440,
        },
      });
      if (!added.ok) throw new Error(added.reason);
      sim.dispatch({
        type: 'logistics.runRouteNow',
        payload: { routeId: (added.data as { routeId: number }).routeId },
      });
      const [trip] = getTrips(sim.state);
      expect(trip.vehicleId).toBe(vehicleId);
      trip.checkAt = sim.state.time + 30;
      trip.loadedAt = sim.state.time;
      sim.advance(31);
      // Auftrag 46d: Die Kontrolle ist sofort entschieden.
      const resolved = eventsOfType(events, 'encounter.resolved')[0]?.payload;
      expect(resolved?.kind).toBe('customsCheck');
      if (resolved?.outcome !== 'failure') continue;
      seized = true;
      // Kontrolle verloren, das Fahrzeug wird zufällig nicht beschlagnahmt: Es steht wieder in Köln.
      const vehicle = sim.state.modules.fleet.vehicles[0];
      expect(vehicle.tripId).toBeNull();
      if (vehicle.seizedAt === null) expect(vehicle.cityId).toBe('koeln');
    }
    expect(seized).toBe(true);
  });

  it('Rest am Kai wird gemeldet (Hafen schreibt, Ereignis für das Banner)', () => {
    const sim = quietGame(2);
    const events = recordEvents(sim);
    sim.state.modules.logistics.berths.koeln = { since: 0, level: 0 };
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 900,
      quality: 0.6,
      unitCost: 2,
    });
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 300 });
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(true);
    // Keine Kontrolle unterwegs (du fährst selbst, die kommt öfter): Die Fahrt soll in Ruhe ankommen.
    getTrips(sim.state)[0].checkAt = null;
    sim.step();
    expect(eventsOfType(events, 'cargo.leftBehind')[0].payload).toMatchObject({
      amount: 600,
      reason: 'warehouse',
      items: [{ productId: 'weed', amount: 600 }],
      notify: true,
    });
    expect(sim.state.messages.list.at(-1)?.text).toContain('600 g Gras stehen noch am Kai');
    // Ein zweiter Rest kurz danach: nur Journal, keine zweite Nachricht (Auftrag 43, M5).
    const before = sim.state.messages.list.length;
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 900,
      quality: 0.6,
      unitCost: 2,
    });
    sim.advance(120);
    take(sim.ctx('test'), { productId: 'hash', amount: 100, warehouseId: 'ehrenfeld' });
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(true);
    sim.step();
    expect(eventsOfType(events, 'cargo.leftBehind').at(-1)?.payload.notify).toBe(false);
    expect(sim.state.messages.list.slice(before).some((m) => m.text.startsWith('Nicht alles passte'))).toBe(false);
  });
});
