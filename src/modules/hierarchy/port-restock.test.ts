// Hafen und Bestellregeln: Schiffsware zählt auf See und am Kai mit, die Abholung fährt ins Lager der Regel, und die
// Hafen-Fragen erledigen sich, wenn der Container abgeholt oder weg ist (Fehler aus der Handy-Prüfung).

import { describe, expect, it } from 'vitest';
import { messages, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getStock } from '../goods';
import { getCargo, getTrips, receiveCargo } from '../logistics';
import { enlist, generateProfile, type StaffMember, type StaffRole } from '../staff';
import { getSuppliers } from '../suppliers';
import { DEFAULT_RIGHT_HAND_SETTINGS, RIGHT_HAND_RANK_XP } from './config';
import { getRightHand, isPortSupplierAllowed } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
  sim.state.modules.customers.directOrders = false;
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 1): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = 80;
  member.stats.caution = 90;
  return member;
}

/** Rechte Hand (Stufe 2) mit zwei ruhigen Leutnants, Liegeplatz, Garage Nippes und einem Fahrer. */
function portGame(): Simulation {
  const sim = quietGame();
  sim.state.wallet.dirty = 60000;
  sim.state.wallet.clean = 20000;
  expect(sim.dispatch({ type: 'logistics.buyBerth', payload: {} }).ok).toBe(true);
  expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
  const a = recruit(sim, 'runner', 2);
  const b = recruit(sim, 'runner', 2);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  // Die Leutnants bestellen hier nicht mit, es geht um die Rechte Hand.
  for (const id of [a.id, b.id])
    sim.dispatch({ type: 'hierarchy.configure', payload: { staffId: id, settings: { mayOrder: false } } });
  const boss = recruit(sim, 'runner', 4);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
  recruit(sim, 'driver');
  const post = getRightHand(sim.state);
  if (post) post.xp = RIGHT_HAND_RANK_XP[1];
  return sim;
}

describe('Hafen-Bestellregeln der Rechten Hand', () => {
  it('bestellt Schiffsware nur einmal, holt sie ab und liefert ins Lager der Regel (nicht ins Hafenlager)', () => {
    const sim = portGame();
    const before = getStock(sim.state, { warehouseId: 'ehrenfeld', productId: 'weed' });
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: {
        settings: {
          orders: false,
          restock: true,
          pickup: true,
          restockBudgetPerDay: 20000,
          restockRules: [
            {
              id: 'r1',
              productId: 'weed',
              supplierId: 'rotterdam',
              packageId: null,
              minStock: before + 300,
              warehouseId: 'ehrenfeld',
              paused: null,
            },
          ],
        },
      },
    });
    expect(isPortSupplierAllowed(sim.state)).toBe(true);
    // Das Schiff braucht zehn Stunden: Bis dahin darf nichts nachbestellt werden.
    sim.advance(9 * 60);
    expect(sim.state.modules.suppliers.relations.rotterdam?.orders).toBe(1);
    // Danach kommt es an den Kai, der Fahrer holt es ab und bringt es nach Ehrenfeld (Nippes liegt näher am Hafen).
    sim.advance(24 * 60);
    expect(sim.state.modules.suppliers.relations.rotterdam?.orders).toBe(1);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld', productId: 'weed' })).toBe(before + 500);
    expect(getStock(sim.state, { warehouseId: 'nippes', productId: 'weed' })).toBe(0);
  });

  it('ohne Zielwunsch (Bestellung des Spielers) fährt die Abholung wie bisher ins Lager am Hafen', () => {
    const sim = portGame();
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.5,
      unitCost: 3,
    });
    sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } });
    expect(getTrips(sim.state)[0].toId).toBe('nippes');
  });

  it('mit Zielwunsch fährt die Abholung dorthin, eine ausdrückliche Wahl hat Vorrang', () => {
    const sim = portGame();
    const ctx = sim.ctx('suppliers');
    const item = { supplierId: 'rotterdam', productId: 'weed', amount: 100, quality: 0.5, unitCost: 3 };
    const a = receiveCargo(ctx, { ...item, warehouseId: 'ehrenfeld' });
    sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', cargoIds: [a] } });
    expect(getTrips(sim.state)[0].toId).toBe('ehrenfeld');
    const b = receiveCargo(ctx, { ...item, warehouseId: 'ehrenfeld' });
    const second = recruit(sim, 'driver');
    sim.dispatch({
      type: 'logistics.pickup',
      payload: { by: 'driver', driverId: second.id, cargoIds: [b], warehouseId: 'nippes' },
    });
    expect(getTrips(sim.state).at(-1)?.toId).toBe('nippes');
  });

  it('Rechte Hand beantwortet die Hafen-Frage, wie sie wirklich gesendet wird (aus dem Kontext der Lieferanten)', () => {
    const sim = portGame();
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: false, pickup: true, restock: false } },
    });
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.5,
      unitCost: 3,
    });
    const question = messages.openRoutine(sim.state).find((m) => m.contactId === 'other:harbor');
    expect(question).toBeDefined();
    sim.advance(5);
    expect(getTrips(sim.state)).toHaveLength(1);
    expect(messages.get(sim.state, question?.id ?? 0)?.answer).toBe('driver');
  });

  it('holt der Spieler den Container selbst ab, erledigt sich die Hafen-Frage', () => {
    const sim = portGame();
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: false } } });
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.5,
      unitCost: 3,
    });
    const question = messages.openRoutine(sim.state).find((m) => m.contactId === 'other:harbor');
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } }).ok).toBe(true);
    sim.advance(2);
    const after = question && messages.get(sim.state, question.id);
    expect(after && messages.canAnswer(sim.state, after)).toBe(false);
    expect(after?.expired).toBe(true);
    expect(messages.openRoutine(sim.state).filter((m) => m.contactId === 'other:harbor')).toHaveLength(0);
  });

  it('der Zoll nimmt den Container: die alte Frage ist nicht mehr offen', () => {
    const sim = portGame();
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: false } } });
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.5,
      unitCost: 3,
    });
    sim.state.modules.logistics.cargo = [];
    sim.advance(2);
    expect(messages.openRoutine(sim.state).filter((m) => m.contactId === 'other:harbor')).toHaveLength(0);
  });

  it('ein Fahrer in Haft zählt nicht: Hafen-Lieferanten bleiben für die Regeln gesperrt', () => {
    const sim = portGame();
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: true } } });
    expect(isPortSupplierAllowed(sim.state)).toBe(true);
    for (const m of sim.state.modules.staff.members) if (m.role === 'driver') m.status = 'jailed';
    expect(isPortSupplierAllowed(sim.state)).toBe(false);
  });

  it('die Standard-Bestellregel der Rechten Hand wird nicht zwischen Spielen geteilt', () => {
    const first = portGame();
    const rule = getRightHand(first.state)?.settings.restockRules[0];
    expect(rule).toBeDefined();
    if (rule) rule.paused = 'Kein Lieferant hat die Ware.';
    expect(DEFAULT_RIGHT_HAND_SETTINGS.restockRules[0].paused).toBeNull();
    const second = portGame();
    expect(getRightHand(second.state)?.settings.restockRules[0].paused).toBeNull();
  });
});
