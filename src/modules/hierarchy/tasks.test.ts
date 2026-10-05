import { describe, expect, it } from 'vitest';
import { loadSimulation, messages, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getOrders, offerDelivery, offerWholesale } from '../customers';
import { getStock, store } from '../goods';
import { getBatches } from '../laundering';
import { getCargo, getTrips, receiveCargo } from '../logistics';
import { changeReputation } from '../reputation';
import { enlist, generateProfile, getStaff, getStaffMember, type StaffMember, type StaffRole } from '../staff';
import { getSuppliers, shipmentsInTransit } from '../suppliers';
import { DEFAULT_RIGHT_HAND_SETTINGS, RIGHT_HAND_RANK_XP, RIGHT_HAND_TASKS } from './config';
import {
  getLieutenantIds,
  getRightHand,
  isPortSupplierAllowed,
  isTaskActive,
  isTaskUnlocked,
  lieutenantOfSpot,
  rightHandOrderLimit,
  rightHandRank,
} from './index';
import { describeDone } from './tasks';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
  // Keine zufälligen Anfragen dazwischen.
  sim.state.modules.customers.directOrders = false;
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 1, loyalty = 60): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = loyalty;
  member.stats.caution = 90; // keine Umwege im Test
  return member;
}

/** Zwei Leutnants und eine Rechte Hand auf Stufe 1, alle Aufgaben aus. */
function withRightHand(sim: Simulation): StaffMember {
  sim.state.wallet.dirty = 20000;
  const a = recruit(sim, 'runner', 2);
  const b = recruit(sim, 'runner', 2);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = recruit(sim, 'runner', 4, 80);
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
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

describe('Rechte Hand: Aufgaben (Auftrag 28)', () => {
  it('Stufen schalten Aufgaben frei; Stufe 1 kann Aufträge und Hafen, Großhandel und Geldwäsche erst ab Stufe 4', () => {
    const sim = quietGame();
    withRightHand(sim);
    expect(rightHandRank(sim.state)).toBe(1);
    expect(isTaskUnlocked(sim.state, 'orders')).toBe(true);
    expect(isTaskUnlocked(sim.state, 'pickup')).toBe(true);
    expect(isTaskUnlocked(sim.state, 'restock')).toBe(false);
    expect(isTaskUnlocked(sim.state, 'wholesale')).toBe(false);
    // Angeschaltet, aber gesperrt: läuft nicht.
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { laundering: true } } });
    expect(isTaskActive(sim.state, 'laundering')).toBe(false);
    rh(sim).xp = RIGHT_HAND_RANK_XP[3];
    expect(rightHandRank(sim.state)).toBe(4);
    expect(isTaskActive(sim.state, 'laundering')).toBe(true);
    expect(RIGHT_HAND_TASKS.map((t) => t.key).sort()).toEqual(
      ['laundering', 'orders', 'pickup', 'restock', 'staffing', 'wholesale'].sort(),
    );
  });

  it('Aufträge und Handy: nimmt eine Lieferanfrage an, sagt im Chat zu, fährt selbst und bekommt Erfahrung', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    changeReputation(sim.ctx('test'), 40);
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: true, orderMaxPrice: 3000 } },
    });
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    expect(messages.get(sim.state, order.messageId)?.routine).toBe(true);
    const events = recordEvents(sim);
    sim.advance(5);
    expect(getOrders(sim.state, { status: 'enRoute' })[0]).toMatchObject({
      id: order.id,
      deliveredBy: 'rightHand',
      courierId: boss.id,
    });
    expect(eventsOfType(events, 'order.accepted')[0].payload).toMatchObject({ by: 'rightHand', courierId: boss.id });
    // Der Chat zeigt die Zusage im Namen der Rechten Hand.
    const thread = messages.thread(sim.state, order.contactId);
    expect(thread.at(-1)).toMatchObject({ from: 'player', via: 'Rechte Hand' });
    expect(thread.at(-1)?.text).toMatch(/Rechte Hand hat zugesagt/);
    expect(messages.get(sim.state, order.messageId)?.answer).toBe('rightHand');
    expect(rh(sim).done.deliveries).toBe(1);
    expect(rh(sim).xp).toBeGreaterThan(0);
    // Eine Fahrt zur Zeit: Die zweite Anfrage mit zu knapper Frist bleibt beim Spieler.
    const second = offerDelivery(sim.ctx('customers'), true);
    if (!second) throw new Error('keine zweite Bestellung');
    second.expiresAt = sim.state.time + 20;
    sim.advance(5);
    expect(getOrders(sim.state, { status: 'offered' }).map((o) => o.id)).toEqual([second.id]);
    expect(rh(sim).passed).toContain(second.id);
    expect(rh(sim).done.leftToBoss).toBe(1);
    expect(rh(sim).log[0].text).toMatch(/bleibt bei dir/);
  });

  it('Regeln: über ihrer Grenze oder außerhalb der eigenen Reviere bleibt die Anfrage beim Spieler', () => {
    const sim = quietGame();
    withRightHand(sim);
    changeReputation(sim.ctx('test'), 40);
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: true, orderMaxPrice: 10, ordersOwnTurfOnly: true } },
    });
    expect(rightHandOrderLimit(sim.state)).toBe(10);
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    sim.advance(5);
    expect(getOrders(sim.state, { status: 'offered' }).map((o) => o.id)).toEqual([order.id]);
    expect(rh(sim).log[0].text).toMatch(/über meiner Grenze/);
    // Die Grenze ihrer Stufe gilt zusätzlich zur Einstellung des Spielers.
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { orderMaxPrice: 100000 } } });
    expect(rightHandOrderLimit(sim.state)).toBe(400);
    sim.dispatch({ type: 'customers.declineOrder', payload: { orderId: order.id } });
    const far = offerDelivery(sim.ctx('customers'), true);
    if (!far) throw new Error('keine Bestellung');
    far.price = 50;
    sim.advance(5);
    // Kein eigenes Revier zu Beginn: bleibt beim Spieler.
    expect(getOrders(sim.state, { status: 'offered' }).map((o) => o.id)).toEqual([far.id]);
    expect(rh(sim).log[0].text).toMatch(/nicht unser Revier/);
  });

  it('Großhandel erst mit Aufgabe und bis zu ihrem Betrag, sonst Chefsache', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    changeReputation(sim.ctx('test'), 60);
    store(sim.ctx('goods'), { productId: 'weed', amount: 2000 });
    const chefsache = offerWholesale(sim.ctx('customers'), true);
    if (!chefsache) throw new Error('kein Großhandel');
    expect(messages.get(sim.state, chefsache.messageId)?.routine).toBeUndefined();
    sim.advance(5);
    expect(getOrders(sim.state, { status: 'offered' }).map((o) => o.id)).toEqual([chefsache.id]);
    sim.dispatch({ type: 'customers.declineOrder', payload: { orderId: chefsache.id } });
    rh(sim).xp = RIGHT_HAND_RANK_XP[3];
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { wholesale: true, wholesaleMaxPrice: 100000 } },
    });
    const deal = offerWholesale(sim.ctx('customers'), true);
    if (!deal) throw new Error('kein Großhandel');
    expect(messages.get(sim.state, deal.messageId)?.routine).toBe(true);
    sim.advance(5);
    expect(getOrders(sim.state, { status: 'enRoute' })[0]).toMatchObject({ id: deal.id, courierId: boss.id });
  });

  it('Hafen abholen: schickt einen freien Fahrer, beantwortet den Hafen-Chat, Leutnants dürfen beim Hafen bestellen', () => {
    const sim = quietGame();
    withRightHand(sim);
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: true } } });
    expect(isPortSupplierAllowed(sim.state)).toBe(false); // noch kein Fahrer
    recruit(sim, 'driver');
    expect(isPortSupplierAllowed(sim.state)).toBe(true);
    // Wie im Spiel: Das Schiff legt im Schritt der Lieferanten an, die Frage kommt also von "suppliers".
    const cargoId = receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 200,
      quality: 0.6,
      unitCost: 3,
    });
    expect(getCargo(sim.state).map((c) => c.id)).toEqual([cargoId]);
    const harbor = messages.openRoutine(sim.state).find((m) => m.contactId === 'other:harbor');
    expect(harbor).toBeDefined();
    sim.advance(5);
    expect(getCargo(sim.state)).toHaveLength(0);
    expect(getTrips(sim.state)).toHaveLength(1);
    expect(getTrips(sim.state)[0].driverId).not.toBeNull();
    expect(messages.get(sim.state, harbor?.id ?? 0)?.answer).toBe('driver');
    expect(rh(sim).done.pickups).toBe(1);
  });

  it('Nachbestellen für ganz Köln nach Regel mit eigenem Budget (Stufe 2)', () => {
    const sim = quietGame();
    withRightHand(sim);
    rh(sim).xp = RIGHT_HAND_RANK_XP[1];
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: {
        settings: {
          restock: true,
          restockBudgetPerDay: 2000,
          restockRules: [
            {
              id: 'r1',
              productId: 'weed',
              supplierId: null,
              packageId: null,
              minStock: 5000,
              warehouseId: null,
              paused: null,
            },
          ],
        },
      },
    });
    const before = shipmentsInTransit(sim.state).length;
    const money = sim.state.wallet.dirty;
    sim.advance(70);
    expect(shipmentsInTransit(sim.state).length).toBeGreaterThan(before);
    expect(sim.state.wallet.dirty).toBeLessThan(money);
    expect(rh(sim).restockSpent).toBeGreaterThan(0);
    expect(rh(sim).restockSpent).toBeLessThanOrEqual(2000);
    expect(rh(sim).done.orders).toBeGreaterThan(0);
    // Ungültige Regeln lehnt der Befehl ab.
    expect(
      sim.dispatch({
        type: 'hierarchy.configureRightHand',
        payload: {
          settings: {
            restockRules: [
              {
                id: 'x',
                productId: 'gibt-es-nicht',
                supplierId: null,
                packageId: null,
                minStock: 1,
                warehouseId: null,
                paused: null,
              },
            ],
          },
        },
      }).ok,
    ).toBe(false);
  });

  it('Geldwäsche nach Regel: über der Grenze geht ein Anteil des Überschusses in die Wäsche (Stufe 4)', () => {
    const sim = quietGame();
    withRightHand(sim);
    rh(sim).xp = RIGHT_HAND_RANK_XP[3];
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { laundering: true, launderAbove: 5000, launderShare: 0.5, payrollGuard: false } },
    });
    // Die Leutnants geben derweil nichts aus, damit die Rechnung aufgeht.
    for (const id of getLieutenantIds(sim.state)) {
      sim.dispatch({
        type: 'hierarchy.configure',
        payload: { staffId: id, settings: { mayHire: false, mayOrder: false } },
      });
    }
    sim.state.wallet.dirty = 9000;
    sim.advance(10);
    // Überschuss 4.000 €, davon die Hälfte.
    expect(getBatches(sim.state)).toHaveLength(1);
    expect(getBatches(sim.state)[0].amount).toBe(2000);
    expect(rh(sim).done.laundered).toBe(2000);
    // Darunter passiert nichts mehr.
    sim.state.wallet.dirty = 4000;
    sim.advance(70);
    expect(getBatches(sim.state).length).toBeLessThanOrEqual(1);
    expect(
      sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { launderShare: 0.33 } } }).ok,
    ).toBe(false);
  });

  it('Personal (Stufe 3): besetzt einen leeren Spot ohne Leutnant mit einem Bewerber oder jemandem von der Straße', () => {
    const sim = quietGame();
    withRightHand(sim);
    rh(sim).xp = RIGHT_HAND_RANK_XP[2];
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { staffing: true } } });
    store(sim.ctx('goods'), { productId: 'weed', amount: 500 });
    const before = getStaff(sim.state).length;
    sim.advance(10);
    // Eine Einstellung pro Stunde durch sie (die Leutnants heuern daneben für ihre eigenen Spots).
    expect(getStaff(sim.state).length).toBeGreaterThan(before);
    expect(rh(sim).done.hires).toBe(1);
    expect(rh(sim).log.some((e) => /steht jetzt am/.test(e.text))).toBe(true);
    const hired = getStaff(sim.state).filter(
      (m) =>
        m.role === 'runner' && m.assignment?.kind === 'spot' && !lieutenantOfSpot(sim.state, m.assignment.targetId),
    );
    expect(hired.length).toBeGreaterThanOrEqual(1);
  });

  it('Tagesbericht nennt das Erledigte, ein guter Bericht bringt Erfahrung, dann wird die Liste geleert', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    const post = rh(sim);
    post.done.deliveries = 3;
    post.done.pickups = 1;
    post.done.leftToBoss = 2;
    expect(describeDone(post.done)).toBe('3 Lieferungen gefahren, 1 Abholung am Hafen, 2 Anfragen dir überlassen');
    const xp = post.xp;
    // Bis 8 Uhr am nächsten Morgen.
    sim.advance(24 * 60);
    const report = rh(sim).lastReport;
    expect(report?.done).toBe('3 Lieferungen gefahren, 1 Abholung am Hafen, 2 Anfragen dir überlassen');
    const text = messages.thread(sim.state, `staff:${boss.id}`).at(-1)?.text ?? '';
    expect(text).toMatch(/Erledigt: 3 Lieferungen gefahren/);
    expect(rh(sim).done.deliveries).toBe(0);
    if ((report?.profit ?? -1) >= 0) expect(rh(sim).xp).toBeGreaterThan(xp);
  });

  it('Stufenaufstieg: sie sagt Bescheid und schaltet Aufgaben frei', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    const events = recordEvents(sim);
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { pickup: true } } });
    recruit(sim, 'driver');
    rh(sim).xp = RIGHT_HAND_RANK_XP[1] - 1;
    receiveCargo(sim.ctx('logistics'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 50,
      quality: 0.5,
      unitCost: 3,
    });
    sim.advance(5);
    expect(rightHandRank(sim.state)).toBe(2);
    expect(eventsOfType(events, 'hierarchy.rightHandRankUp')[0].payload).toEqual({ staffId: boss.id, rank: 2 });
    expect(messages.thread(sim.state, `staff:${boss.id}`).at(-1)?.text).toMatch(/Stufe 2.*Nachbestellen/);
  });

  it('Version 3 → 4: Eine bestehende Rechte Hand bekommt die Aufgaben mit Standardwerten und fängt auf Stufe 1 an', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    const raw = structuredClone(sim.state) as unknown as {
      modules: {
        hierarchy: {
          rightHand: Record<string, unknown> & { settings: Record<string, unknown> };
          rightHands?: Record<string, unknown>;
        };
      };
      moduleVersions: Record<string, number>;
    };
    // Bis Version 5 gab es eine Rechte Hand (Köln), seit Version 6 eine pro Stadt.
    raw.modules.hierarchy.rightHand = raw.modules.hierarchy.rightHands?.koeln as typeof raw.modules.hierarchy.rightHand;
    delete raw.modules.hierarchy.rightHands;
    const old = raw.modules.hierarchy.rightHand;
    old.settings = { dailyReport: true, coordinate: false, payrollGuard: true, absences: true, budgetPerDay: 5000 };
    for (const key of ['xp', 'done', 'restockDay', 'restockSpent', 'passed', 'fullPower', 'grudgeUntil'])
      delete old[key];
    raw.moduleVersions.hierarchy = 3;
    const loaded = loadSimulation(raw, sim.modules);
    const post = getRightHand(loaded.state);
    expect(post?.staffId).toBe(boss.id);
    expect(post?.settings).toMatchObject({ ...DEFAULT_RIGHT_HAND_SETTINGS, coordinate: false, budgetPerDay: 5000 });
    expect(post?.xp).toBe(0);
    expect(post?.done.deliveries).toBe(0);
    expect(post?.passed).toEqual([]);
    // Danach gleich weiter auf Version 5 (Vollmacht, Auftrag 30): aus.
    expect(post?.fullPower).toBeNull();
    expect(loaded.state.moduleVersions.hierarchy).toBe(7);
    expect(getStaffMember(loaded.state, boss.id)?.assignment).toEqual({ kind: 'office', targetId: 'rightHand' });
    expect(getStock(loaded.state)).toBe(getStock(sim.state));
  });
});
