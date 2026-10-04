// Auftrag 33, Etappe 1: Lager mit Kapazität. Abholung, Umlagern und Routen laden nur, was ins Ziel passt; ist das
// Lager bei der Ankunft voll, wartet der Rest beim Fahrer, bis Platz ist oder die Fahrt umgeleitet wird.
import { describe, expect, it } from 'vitest';
import { messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store, take, warehouseFree } from '../goods';
import { getStaffMember } from '../staff';
import { cargoAmount, getTrips, isPlayerOnTheRoad, receiveCargo, roomFor } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

/** Lager bis auf grams Gramm füllen. */
function fillUp(sim: Simulation, warehouseId: string, grams: number): void {
  store(sim.ctx('test'), { productId: 'weed', amount: warehouseFree(sim.state, warehouseId) - grams, warehouseId });
}

function noChecks(sim: Simulation): void {
  for (const trip of sim.state.modules.logistics.trips) trip.checkAt = null;
}

describe('logistics: Lager mit Kapazität (Auftrag 33)', () => {
  it('Abholung nimmt nur mit, was ins Lager passt; der Rest bleibt am Kai', () => {
    const sim = quietGame();
    sim.state.modules.logistics.berths.koeln = { since: 0, level: 0 };
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'hash',
      amount: 500,
      quality: 0.7,
      unitCost: 2,
    });
    fillUp(sim, 'ehrenfeld', 200);
    const result = sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } });
    if (!result.ok) throw new Error(result.reason);
    expect((result.data as { left: number }).left).toBe(300);
    expect(cargoAmount(sim.state, 'hash')).toBe(300);
    expect(roomFor(sim.state, 'ehrenfeld')).toBe(0);
    // Solange die Fahrt unterwegs ist, gibt es keinen Platz für eine zweite.
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } }).ok).toBe(false);
  });

  it('volles Lager bei der Ankunft: der Rest wartet beim Fahrer, er fragt nach, Umleiten bringt ihn woanders hin', () => {
    const sim = quietGame(2);
    const events = recordEvents(sim);
    sim.state.wallet.clean = 10_000;
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
    const hired = sim.dispatch({ type: 'staff.hireDriver', payload: {} });
    if (!hired.ok) throw new Error(hired.reason);
    const driverId = (hired.data as { staffId: string }).staffId;
    store(sim.ctx('test'), { productId: 'hash', amount: 300, warehouseId: 'kalk' });
    expect(
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'driver' } }).ok,
    ).toBe(true);
    noChecks(sim);
    const [trip] = getTrips(sim.state);
    // Während der Fahrt füllt sich das Lager: Es passen nur noch 100 g hinein.
    fillUp(sim, 'ehrenfeld', 100);
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(trip.status).toBe('waiting');
    expect(trip.items.reduce((sum, i) => sum + i.amount, 0)).toBe(200);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(100);
    expect(getStaffMember(sim.state, driverId)?.assignment?.kind).toBe('transport');
    expect(eventsOfType(events, 'transport.waiting')[0].payload).toMatchObject({ toId: 'ehrenfeld', rest: 200 });
    const ask = messages.thread(sim.state, `staff:${driverId}`).at(-1);
    expect(ask?.options?.map((o) => o.id)).toEqual(['to-kalk', 'wait']);

    // Umleiten: zurück nach Kalk, dort ist Platz.
    expect(sim.dispatch({ type: 'logistics.redirect', payload: { tripId: trip.id, toId: 'kalk' } }).ok).toBe(true);
    noChecks(sim);
    expect(trip.status).toBe('enRoute');
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'kalk' })).toBe(200);
    expect(getStaffMember(sim.state, driverId)?.assignment).toBeNull();
    expect(eventsOfType(events, 'transport.arrived')[0].payload).toMatchObject({ amount: 300 });
  });

  it('wartende Fahrt lädt von selbst ab, sobald Platz ist; deine eigene blockiert dich dabei nicht', () => {
    const sim = quietGame(3);
    sim.state.wallet.clean = 10_000;
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } });
    store(sim.ctx('test'), { productId: 'hash', amount: 50, warehouseId: 'kalk' });
    sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'player' } });
    noChecks(sim);
    const [trip] = getTrips(sim.state);
    fillUp(sim, 'ehrenfeld', 0);
    sim.advance(trip.arrivesAt - sim.state.time);
    expect(trip.status).toBe('waiting');
    expect(isPlayerOnTheRoad(sim.state)).toBe(false);
    take(sim.ctx('test'), { productId: 'weed', amount: 500, warehouseId: 'ehrenfeld' });
    sim.advance(60);
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(50);
  });

  it('Umlagern nimmt nur so viel, wie ins Ziel passt', () => {
    const sim = quietGame();
    sim.state.wallet.clean = 10_000;
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } });
    store(sim.ctx('test'), { productId: 'hash', amount: 400 });
    fillUp(sim, 'nippes', 150);
    const go = () =>
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'ehrenfeld', toId: 'nippes', productId: 'hash', by: 'player' },
      });
    expect(go().ok).toBe(true);
    expect(getTrips(sim.state)[0].items[0].amount).toBe(150);
    expect(getStock(sim.state, { productId: 'hash', warehouseId: 'ehrenfeld' })).toBe(250);
  });
});
