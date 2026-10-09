// Regressionstests zu Befunden aus dem Bugreview (Hierarchie: Rechte Hand, Leutnants, Vollmacht, Bestellregeln).

import { describe, expect, it } from 'vitest';
import type { Ctx, Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getOrders, offerDelivery } from '../customers';
import { getWarehouses, store, warehouseFree } from '../goods';
import { getCargo, getTrips, receiveCargo } from '../logistics';
import { changeReputation } from '../reputation';
import { lockedSpots } from '../spots';
import {
  enlist,
  expectedWageFor,
  generateProfile,
  getStaffMember,
  invalidateStaffIndex,
  type StaffMember,
  type StaffRole,
  setStatus,
} from '../staff';
import { getSuppliers } from '../suppliers';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { RIGHT_HAND_RANK_XP } from './config';
import {
  appointWage,
  canBeLieutenant,
  getPost,
  getRightHand,
  lieutenantDemand,
  rightHandDriver,
  taskIdleReason,
} from './index';
import { planOrder, runRestock } from './orders';
import { blockedOrderOutcome } from './tasks';
import type { OrderRule } from './types';

const DAY = 24 * 60;

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
  sim.state.modules.customers.directOrders = false;
  sim.state.wallet.dirty = 50000;
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 2, loyalty = 80, cityId = 'koeln'): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = loyalty;
  member.stats.caution = 90;
  if (cityId !== 'koeln') {
    member.cityId = cityId;
    invalidateStaffIndex();
  }
  return member;
}

/** Zwei Leutnants und eine Rechte Hand (aus den Leutnants), alle Aufgaben aus. */
function withRightHand(sim: Simulation, xp = 0): StaffMember {
  const a = recruit(sim, 'runner', 2);
  const b = recruit(sim, 'runner', 2);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  for (const id of [a.id, b.id]) {
    sim.dispatch({ type: 'hierarchy.configure', payload: { staffId: id, settings: { mayOrder: false } } });
  }
  const boss = recruit(sim, 'runner', 5, 90);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } });
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
  const post = getRightHand(sim.state);
  if (!post) throw new Error('keine Rechte Hand');
  post.xp = xp;
  sim.dispatch({
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: { orders: false, pickup: false, restock: false, staffing: false, wholesale: false, laundering: false },
    },
  });
  return boss;
}

const rh = (sim: Simulation) => {
  const post = getRightHand(sim.state);
  if (!post) throw new Error('keine Rechte Hand');
  return post;
};

/** Lager bis auf `room` Gramm mit Hasch füllen (überfüllt, wie Beute). */
function fill(sim: Simulation, warehouseId: string, room = 0): void {
  const free = warehouseFree(sim.state, warehouseId);
  if (free > room) store(sim.ctx('goods'), { productId: 'hash', amount: free - room, warehouseId });
}

/** Alle Kölner Veedel gehören dir (Voraussetzung für die Vollmacht). */
function allKoeln(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel('koeln')) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/** Rechte Hand auf höchster Stufe mit allen Aufgaben an und Vollmacht über Köln. */
function withFullPower(sim: Simulation): void {
  withRightHand(sim, RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1]);
  sim.dispatch({
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: true },
    },
  });
  allKoeln(sim);
  expect(sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }).ok).toBe(true);
}

/** Bis kurz nach 13 Uhr laufen lassen (die Ausbau-Runde der Vollmacht ist um 12 Uhr). */
function pastNoon(sim: Simulation): void {
  const minute = sim.state.time % DAY;
  sim.advance((13 * 60 + 5 - minute + DAY) % DAY);
}

describe('Hafen abholen bleibt nicht am vollen Ziel-Lager hängen', () => {
  function portSetup() {
    const sim = quietGame();
    withRightHand(sim);
    sim.state.wallet.clean = 20000;
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: true } } });
    recruit(sim, 'driver');
    return sim;
  }

  it('ist das bestellte Lager voll, fährt der Fahrer ins nächste mit Platz', () => {
    const sim = portSetup();
    fill(sim, 'ehrenfeld');
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 200,
      quality: 0.6,
      unitCost: 3,
      warehouseId: 'ehrenfeld',
    });
    sim.advance(5);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(getTrips(sim.state).map((t) => t.toId)).toEqual(['nippes']);
    expect(rh(sim).done.pickups).toBe(1);
  });

  it('passt die Ware in kein Lager, sagt die Aufgabe warum', () => {
    const sim = portSetup();
    for (const w of getWarehouses(sim.state, 'koeln')) fill(sim, w.id);
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 200,
      quality: 0.6,
      unitCost: 3,
      warehouseId: 'ehrenfeld',
    });
    sim.advance(5);
    expect(getCargo(sim.state)).toHaveLength(1);
    expect(getTrips(sim.state)).toHaveLength(0);
    expect(taskIdleReason(sim.state, 'pickup')).toMatch(/kein Lager/);
  });

  it('hat das bestellte Lager weniger Platz als ein Stück wiegt, fährt der Fahrer ins nächste, in das es passt', () => {
    const sim = portSetup();
    // 10 g frei, ein Vape-Pen wiegt 20 g: Für logistics ist das Lager „nicht voll“, hinein passt trotzdem nichts.
    fill(sim, 'ehrenfeld', 10);
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'vape',
      amount: 50,
      quality: 0.6,
      unitCost: 3,
      warehouseId: 'ehrenfeld',
    });
    expect(taskIdleReason(sim.state, 'pickup')).toBeNull();
    sim.advance(5);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(getTrips(sim.state).map((t) => t.toId)).toEqual(['nippes']);
    expect(rh(sim).done.pickups).toBe(1);
  });

  it('übergeht auch ein Ausweich-Lager, in das kein Stück mehr passt', () => {
    const sim = portSetup();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'suelz' } }).ok).toBe(true);
    fill(sim, 'ehrenfeld');
    fill(sim, 'nippes', 10);
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'vape',
      amount: 50,
      quality: 0.6,
      unitCost: 3,
      warehouseId: 'ehrenfeld',
    });
    sim.advance(5);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(getTrips(sim.state).map((t) => t.toId)).toEqual(['suelz']);
  });
});

describe('Hafen abholen übergeht Ware, die eine Nachtfahrt eingeteilt hat', () => {
  it('holt die Ware für ein anderes Lager ab, auch wenn die älteste für heute Nacht reserviert ist', () => {
    const sim = quietGame();
    withRightHand(sim);
    sim.state.wallet.clean = 20000;
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    recruit(sim, 'driver');
    recruit(sim, 'driver');
    const night = receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.6,
      unitCost: 3,
      warehouseId: 'ehrenfeld',
    });
    // Tagsüber geplant: Die Nachtfahrt teilt den ersten Container für sich ein.
    sim.state.time = sim.state.time - (sim.state.time % DAY) + 10 * 60;
    const planned = sim.dispatch({
      type: 'logistics.pickup',
      payload: { by: 'driver', cargoIds: [night], choice: 'night' },
    });
    expect(planned.ok).toBe(true);
    expect(getTrips(sim.state).map((t) => t.status)).toEqual(['planned']);
    const other = receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 100,
      quality: 0.6,
      unitCost: 3,
      warehouseId: 'nippes',
    });
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: true } } });
    sim.advance(5);
    expect(getCargo(sim.state).map((c) => c.id)).toEqual([night]);
    expect(getCargo(sim.state).some((c) => c.id === other)).toBe(false);
    expect(getTrips(sim.state).some((t) => t.toId === 'nippes' && t.status !== 'planned')).toBe(true);
    expect(rh(sim).done.pickups).toBe(1);
  });
});

describe('Lagerkauf des Statthalters zählt aufs Ausbau-Budget', () => {
  function expansionGame(budget: number) {
    const sim = quietGame();
    withFullPower(sim);
    // Keine Spots mehr zum Freischalten: Es geht nur um das Lager.
    sim.state.modules.spots.unlocked.push(...lockedSpots(sim.state).map((s) => s.id));
    sim.state.wallet.clean = 50000;
    sim.state.wallet.dirty = 200000;
    rh(sim).settings.expansionBudgetPerDay = budget;
    rh(sim).settings.fullPowerTasks = {
      lieutenants: false,
      pricing: false,
      hr: false,
      expansion: true,
      diplomacy: false,
    };
    return sim;
  }

  it('reicht das Tagesbudget nicht für das billigste Lager, kauft sie keins', () => {
    const sim = expansionGame(1000);
    pastNoon(sim);
    expect(getWarehouses(sim.state, 'koeln')).toHaveLength(1);
  });

  it('kauft sie eins, geht der Preis vom Tagesbudget ab', () => {
    const sim = expansionGame(4000);
    pastNoon(sim);
    expect(getWarehouses(sim.state, 'koeln')).toHaveLength(2);
    expect(rh(sim).fullPower?.spent).toBe(2000);
  });
});

describe('Die Bestätigung beim Ernennen nennt den Lohn, der gezahlt wird', () => {
  it('in Hamburg und mit Eigenschaft: Lohn nach dem Ernennen = angezeigter Lohn', () => {
    const sim = quietGame();
    sim.state.modules.spots.unlocked.push('hansaplatz');
    const m = recruit(sim, 'runner', 2, 80, 'hamburg');
    m.traits = ['ambitious'];
    const shown = appointWage(sim.state, m.id, 1);
    // Der alte Wert ohne Stadt und Eigenschaft war zu niedrig.
    expect(shown).toBeGreaterThan(Math.max(m.wage, expectedWageFor(m.role, m.level, lieutenantDemand(1))));
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds: ['hansaplatz'] } }).ok).toBe(
      true,
    );
    expect(getStaffMember(sim.state, m.id)?.wage).toBe(shown);
  });
});

describe('Bestellung ins volle Lager scheitert nicht mehr still', () => {
  const rule = (patch: Partial<OrderRule> = {}): OrderRule => ({
    id: 'r1',
    productId: 'weed',
    supplierId: 'koeln',
    packageId: null,
    minStock: 500,
    warehouseId: 'ehrenfeld',
    paused: null,
    ...patch,
  });

  it('nimmt nur ein Paket, das ins Lager passt, und ruht mit Grund, wenn keins passt', () => {
    const sim = quietGame();
    fill(sim, 'ehrenfeld', 20);
    const plan = planOrder(sim.state, rule(), null, 100000);
    expect(plan.kind).toBe('order');
    if (plan.kind === 'order') expect(plan.pkg.amount).toBeLessThanOrEqual(20);
    fill(sim, 'ehrenfeld', 0);
    const full = planOrder(sim.state, rule(), null, 100000);
    expect(full).toEqual({ kind: 'pause', reason: expect.stringMatching(/kein Platz/) });
  });

  it('ein Leutnant mit vollem Lager meldet die Pause einmal und bestellt nichts', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, spotIds: ['uni'] } });
    sim.dispatch({ type: 'hierarchy.configure', payload: { staffId: lt.id, settings: { orderRules: [rule()] } } });
    fill(sim, 'ehrenfeld', 0);
    const shipments = sim.state.modules.suppliers.shipments.length;
    sim.advance(3 * 60);
    expect(sim.state.modules.suppliers.shipments.length).toBe(shipments);
    const post = getPost(sim.state, lt.id);
    expect(post?.settings.orderRules[0].paused).toMatch(/kein Platz/);
    expect(post?.log.filter((e) => /Bestellung ruht/.test(e.text))).toHaveLength(1);
  });

  it('lehnt suppliers.order trotzdem ab, ruht die Regel mit dem Grund, ohne bei jedem Durchgang neu zu melden', () => {
    const sim = quietGame();
    const base = sim.ctx('hierarchy');
    const ctx: Ctx = Object.assign(Object.create(base), {
      dispatch: () => ({ ok: false, reason: 'Kalle geht nicht ran.' }),
    });
    const r = rule();
    let paused = 0;
    let resumed = 0;
    const hooks = {
      budget: () => 100000,
      onPause: () => {
        paused += 1;
      },
      onResume: () => {
        resumed += 1;
      },
      onNoMoney: () => {},
      onOrdered: () => {},
    };
    runRestock(ctx, [r], 'ehrenfeld', 'staff:x', hooks);
    runRestock(ctx, [r], 'ehrenfeld', 'staff:x', hooks);
    expect(r.paused).toBe('Kalle geht nicht ran.');
    expect(paused).toBe(1);
    expect(resumed).toBe(0);
  });
});

describe('Steckt die Rechte Hand in einem gekippten Deal, wartet die nächste Anfrage', () => {
  it('eine neue Anfrage mit genug Frist bleibt nicht beim Spieler', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    changeReputation(sim.ctx('test'), 40);
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: true, orderMaxPrice: 3000 } },
    });
    const first = offerDelivery(sim.ctx('customers'), true);
    if (!first) throw new Error('keine Bestellung');
    sim.advance(5);
    const running = getOrders(sim.state).find((o) => o.id === first.id);
    expect(running?.courierId).toBe(boss.id);
    // Der Deal kippt: Die Konfrontation läuft noch, ihr Einsatz bleibt die Lieferung.
    if (running) running.status = 'contested';
    const second = offerDelivery(sim.ctx('customers'), true);
    if (!second) throw new Error('keine zweite Bestellung');
    second.price = 50;
    second.expiresAt = sim.state.time + 600;
    store(sim.ctx('goods'), { productId: second.productId, amount: second.amount + 100 });
    sim.advance(5);
    expect(rh(sim).passed).not.toContain(second.id);
    expect(getOrders(sim.state, { status: 'offered' }).map((o) => o.id)).toContain(second.id);
  });
});

describe('Bleibt eine Anfrage beim Spieler, nennt die Rechte Hand ihren wirklichen Grund', () => {
  function ordersGame() {
    const sim = quietGame();
    const boss = withRightHand(sim);
    changeReputation(sim.ctx('test'), 40);
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: true, orderMaxPrice: 3000 } },
    });
    return { sim, boss };
  }

  it('ist sie mit einer Lieferung unterwegs und reicht die Frist nicht, sagt sie, dass sie noch unterwegs ist', () => {
    const { sim, boss } = ordersGame();
    const first = offerDelivery(sim.ctx('customers'), true);
    if (!first) throw new Error('keine Bestellung');
    sim.advance(5);
    const running = getOrders(sim.state).find((o) => o.id === first.id);
    expect(running?.courierId).toBe(boss.id);
    expect(rightHandDriver(sim.state)).toMatchObject({ ok: false, cause: 'busy' });
    const arrives = running?.arrivesAt ?? sim.state.time;
    expect(arrives).toBeGreaterThan(sim.state.time + 10);
    const second = offerDelivery(sim.ctx('customers'), true);
    if (!second) throw new Error('keine zweite Bestellung');
    second.price = 50;
    // Die Frist endet kurz nach ihrer Rückkehr: zu knapp, um zu warten.
    second.expiresAt = arrives + 10;
    store(sim.ctx('goods'), { productId: second.productId, amount: second.amount + 100 });
    sim.advance(5);
    expect(rh(sim).passed).toContain(second.id);
    const entry = rh(sim).log.find((e) => e.text.startsWith(`Anfrage von ${second.contactName}`));
    expect(entry?.text).toMatch(/ich bin noch unterwegs und die Frist ist zu knapp/);
  });

  it('fällt sie aus, sagt sie das, statt zu behaupten, sie sei unterwegs', () => {
    const { sim, boss } = ordersGame();
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    setStatus(sim.ctx('staff'), boss.id, 'jailed');
    const driver = rightHandDriver(sim.state);
    if (driver.ok) throw new Error('sie dürfte nicht fahren');
    expect(driver.cause).toBe('out');
    const outcome = blockedOrderOutcome(sim.state, boss, order, driver);
    expect(outcome).toEqual({ wait: false, reason: expect.stringMatching(/falle gerade aus/) });
    expect(outcome.wait ? '' : outcome.reason).not.toMatch(/unterwegs/);
  });

  it('hat die Stadt keine Rechte Hand, die fahren könnte, ist auch das ein eigener Satz', () => {
    const { sim, boss } = ordersGame();
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    const driver = rightHandDriver(sim.state, 'hamburg');
    if (driver.ok) throw new Error('in Hamburg gibt es keine Rechte Hand');
    expect(driver.cause).toBe('none');
    const outcome = blockedOrderOutcome(sim.state, boss, order, driver);
    expect(outcome).toEqual({ wait: false, reason: expect.stringMatching(/nicht ausfahren/) });
    expect(outcome.wait ? '' : outcome.reason).not.toMatch(/unterwegs|falle/);
  });
});

describe('Abberufen während einer Lieferfahrt', () => {
  it('sie fährt die Lieferung zu Ende und ist erst danach frei', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    changeReputation(sim.ctx('test'), 40);
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: true, orderMaxPrice: 3000 } },
    });
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    sim.advance(5);
    expect(getStaffMember(sim.state, boss.id)?.assignment?.kind).toBe('delivery');
    expect(sim.dispatch({ type: 'hierarchy.dismissRightHand', payload: {} }).ok).toBe(true);
    expect(getRightHand(sim.state)).toBeNull();
    // Noch unterwegs: kein Spot, kein Leutnant.
    expect(getStaffMember(sim.state, boss.id)?.assignment).toEqual({ kind: 'delivery', targetId: String(order.id) });
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: boss.id, assignment: { kind: 'spot', targetId: 'zuelpicher' } },
      }).ok,
    ).toBe(false);
    expect(canBeLieutenant(sim.state, boss.id).ok).toBe(false);
    const arrives = getOrders(sim.state).find((o) => o.id === order.id)?.arrivesAt ?? sim.state.time;
    sim.advance(Math.max(1, arrives - sim.state.time) + 5);
    expect(getOrders(sim.state).find((o) => o.id === order.id)?.status).not.toBe('enRoute');
    expect(getStaffMember(sim.state, boss.id)?.assignment).toBeNull();
  });
});

describe('Die Vorlage nimmt einen Lieferanten nur mit, wenn er in die Stadt liefert', () => {
  it('ein Hamburger Leutnant bekommt Kalle (nur Köln) nicht, Frankfurt schon', () => {
    const sim = quietGame();
    sim.state.modules.spots.unlocked.push('hansaplatz');
    const base: OrderRule = {
      id: 'r1',
      productId: null,
      supplierId: 'koeln',
      packageId: 'weed25',
      minStock: 100,
      warehouseId: null,
      paused: null,
    };
    sim.state.modules.hierarchy.orderTemplate = [base, { ...base, id: 'r2', supplierId: 'frankfurt' }];
    const hamburger = recruit(sim, 'runner', 2, 80, 'hamburg');
    expect(
      sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: hamburger.id, spotIds: ['hansaplatz'] } }).ok,
    ).toBe(true);
    const rules = getPost(sim.state, hamburger.id)?.settings.orderRules ?? [];
    expect(rules[0]).toMatchObject({ supplierId: null, packageId: null, productId: 'weed' });
    expect(rules[1]).toMatchObject({ supplierId: 'frankfurt', packageId: 'weed25' });
    // In Köln bleibt Kalle.
    const koelner = recruit(sim, 'runner', 2);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: koelner.id, spotIds: ['uni'] } });
    expect(getPost(sim.state, koelner.id)?.settings.orderRules[0]).toMatchObject({ supplierId: 'koeln' });
  });
});

describe('Ersetzen ohne Anheuern kostet den Leutnant nichts', () => {
  it('steht schon jemand am Spot, geht kein Läuferpreis vom Tagesbudget ab', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, spotIds: ['uni'] } }).ok).toBe(true);
    sim.dispatch({
      type: 'hierarchy.configure',
      payload: { staffId: lt.id, settings: { onAbsent: 'replace', mayOrder: false } },
    });
    const runner = recruit(sim, 'runner', 1);
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: runner.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(true);
    setStatus(sim.ctx('staff'), runner.id, 'jailed');
    sim.advance(1);
    expect(getPost(sim.state, lt.id)?.absences[runner.id]).toBeDefined();
    // Jemand anderes steht schon am Spot (wie von "Koordinieren" hingestellt); frei ist niemand.
    const other = recruit(sim, 'runner', 1);
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: other.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(true);
    const post = getPost(sim.state, lt.id);
    if (!post) throw new Error('kein Leutnant');
    post.nextActionAt = sim.state.time;
    sim.advance(60);
    expect(post.absences[runner.id]?.replaced).toBe(true);
    expect(post.hireSpent).toBe(0);
    expect(post.team).not.toContain(other.id);
  });

  it('darf er nicht anheuern, übernimmt trotzdem, wer schon am Spot steht', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, spotIds: ['uni'] } }).ok).toBe(true);
    sim.dispatch({
      type: 'hierarchy.configure',
      payload: { staffId: lt.id, settings: { onAbsent: 'replace', mayOrder: false, mayHire: false } },
    });
    const runner = recruit(sim, 'runner', 1);
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: runner.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(true);
    setStatus(sim.ctx('staff'), runner.id, 'jailed');
    sim.advance(1);
    const other = recruit(sim, 'runner', 1);
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: other.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(true);
    const post = getPost(sim.state, lt.id);
    if (!post) throw new Error('kein Leutnant');
    post.nextActionAt = sim.state.time;
    sim.advance(60);
    expect(post.absences[runner.id]?.replaced).toBe(true);
    expect(post.absences[runner.id]?.stuck).toBeFalsy();
    expect(post.log.some((e) => /niemand einspringen/.test(e.text))).toBe(false);
    expect(post.log.some((e) => e.text.includes(`${other.name} übernimmt`))).toBe(true);
    expect(post.hireSpent).toBe(0);
  });
});
