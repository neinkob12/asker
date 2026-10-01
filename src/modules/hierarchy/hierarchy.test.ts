import { describe, expect, it } from 'vitest';
import {
  type CommandHandler,
  type CommandType,
  createSaveFile,
  type GameState,
  loadSimulation,
  type ModuleDefinition,
  parseSaveFile,
  type Simulation,
  serializeSave,
} from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import type { Customer } from '../customers';
import { getStock } from '../goods';
import { hasOwnPrice, priceRatio } from '../market';
import { getCandidates } from '../recruiting';
import {
  addXp,
  enlist,
  expectedWage,
  generateProfile,
  getStaff,
  getStaffMember,
  runnerAt,
  type StaffMember,
  type StaffRole,
  securityAt,
} from '../staff';
import { getSuppliers, shipmentsInTransit } from '../suppliers';
import { LIEUTENANT_DEMAND_BY_SPOTS } from './config';
import {
  checkSpots,
  getLieutenant,
  getLieutenants,
  getPost,
  homeWarehouse,
  lieutenantDemand,
  lieutenantOfSpot,
  lieutenantSatisfaction,
  lieutenantSpots,
  lieutenantVeedel,
  lieutenantVeedels,
  migrateHierarchyV2,
  teamOf,
} from './index';
import type { OrderRule } from './types';

function quietGame(options: { modules?: readonly ModuleDefinition[] } = {}): Simulation {
  const sim = createTestGame(options);
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

/** Alle Großstädte liefern schon (sonst hat der Leutnant am Anfang nur Frankfurt). */
function openSuppliers(sim: Simulation): void {
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
}

function unlockAll(sim: Simulation): void {
  sim.state.modules.spots.unlocked.push('rudolfplatz', 'aachener-weiher', 'friesenplatz', 'breslauer', 'stadtgarten');
}

function recruit(sim: Simulation, role: StaffRole, level = 1): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = 60;
  return member;
}

function addCustomer(sim: Simulation, spotId: string, amount = 2): Customer {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit: 12,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 170,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

const appoint = (sim: Simulation, staffId: string, spotIds: string[]) =>
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId, spotIds } });
const configure = (sim: Simulation, staffId: string, settings: Record<string, unknown>) =>
  sim.dispatch({ type: 'hierarchy.configure', payload: { staffId, settings } });
const rule = (patch: Partial<OrderRule>): OrderRule => ({
  id: 'r1',
  productId: null,
  supplierId: null,
  packageId: null,
  minStock: 100,
  warehouseId: null,
  paused: null,
  ...patch,
});
/** Gleich in der nächsten Minute handeln lassen. */
const wake = (sim: Simulation, staffId: string) => {
  const post = getPost(sim.state, staffId);
  if (post) post.nextActionAt = sim.state.time;
};

describe('hierarchy: ernennen mit Spots', () => {
  it('Leutnant mit drei Spots über zwei Veedel ernennen, abfragen und abberufen', () => {
    const sim = quietGame();
    unlockAll(sim);
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    expect(appoint(sim, lt.id, ['zuelpicher', 'rudolfplatz', 'neumarkt']).ok).toBe(true);
    expect(lieutenantSpots(sim.state, lt.id).map((s) => s.id)).toEqual(['zuelpicher', 'rudolfplatz', 'neumarkt']);
    expect(lieutenantVeedels(sim.state, lt.id)).toEqual(['neustadt-sued', 'altstadt-sued']);
    expect(lieutenantVeedel(sim.state, lt.id)).toBe('neustadt-sued');
    expect(lieutenantOfSpot(sim.state, 'neumarkt')).toBe(lt.id);
    expect(getLieutenant(sim.state, 'altstadt-sued')).toBe(lt.id);
    expect(getLieutenants(sim.state).map((p) => p.staffId)).toEqual([lt.id]);
    const member = getStaffMember(sim.state, lt.id) as StaffMember;
    expect(member.assignment).toEqual({ kind: 'veedel', targetId: 'neustadt-sued' });
    expect(member.demand).toBe(LIEUTENANT_DEMAND_BY_SPOTS[3]);
    expect(member.wage).toBe(expectedWage(sim.state, lt.id));
    expect(eventsOfType(events, 'hierarchy.appointed')[0].payload).toEqual({
      staffId: lt.id,
      veedelId: 'neustadt-sued',
      spotIds: ['zuelpicher', 'rudolfplatz', 'neumarkt'],
    });

    expect(sim.dispatch({ type: 'hierarchy.dismiss', payload: { staffId: lt.id } }).ok).toBe(true);
    expect(getPost(sim.state, lt.id)).toBeUndefined();
    expect(lieutenantOfSpot(sim.state, 'neumarkt')).toBeNull();
    expect(getStaffMember(sim.state, lt.id)).toMatchObject({ assignment: null, demand: 1 });
  });

  it('der Lohnanspruch wächst mit der Zahl der Spots', () => {
    expect(lieutenantDemand(1)).toBeLessThan(lieutenantDemand(2));
    expect(lieutenantDemand(2)).toBeLessThan(lieutenantDemand(3));
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    expect(getStaffMember(sim.state, lt.id)?.demand).toBe(lieutenantDemand(1));
    expect(
      sim.dispatch({ type: 'hierarchy.setSpots', payload: { staffId: lt.id, spotIds: ['uni', 'neumarkt'] } }).ok,
    ).toBe(true);
    expect(getStaffMember(sim.state, lt.id)?.demand).toBe(lieutenantDemand(2));
  });

  it('prüft die Spots: offen, höchstens drei, keiner gehört einem anderen Leutnant', () => {
    const sim = quietGame();
    unlockAll(sim);
    const a = recruit(sim, 'runner', 2);
    const b = recruit(sim, 'runner', 2);
    appoint(sim, a.id, ['zuelpicher']);
    expect(appoint(sim, b.id, ['zuelpicher'])).toMatchObject({ ok: false, reason: expect.stringContaining(a.name) });
    expect(appoint(sim, b.id, ['uni', 'neumarkt', 'ebertplatz', 'breslauer']).ok).toBe(false);
    expect(appoint(sim, b.id, ['uni', 'uni']).ok).toBe(false);
    expect(appoint(sim, b.id, []).ok).toBe(false);
    expect(appoint(sim, b.id, ['rheinpark']).ok).toBe(false); // noch gesperrt
    expect(checkSpots(sim.state, b.id, ['uni', 'neumarkt']).ok).toBe(true);
  });

  it('nur wer Erfahrung hat, aktiv ist und kein Spezialist', () => {
    const sim = quietGame();
    const rookie = recruit(sim, 'runner', 1);
    const lawyer = recruit(sim, 'lawyer', 3);
    expect(appoint(sim, rookie.id, ['uni'])).toMatchObject({ ok: false, reason: expect.stringMatching(/Level 2/) });
    expect(appoint(sim, lawyer.id, ['uni']).ok).toBe(false);
    addXp(sim.ctx('staff'), rookie.id, 200);
    expect(appoint(sim, rookie.id, ['uni']).ok).toBe(true);
    expect(appoint(sim, rookie.id, ['uni']).ok).toBe(false);
  });

  it('alte Befehlsformen mit veedelId gehen weiter', () => {
    const sim = quietGame();
    unlockAll(sim);
    const lt = recruit(sim, 'runner', 2);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, veedelId: 'neustadt-sued' } }).ok).toBe(
      true,
    );
    // Die drei Spots des Veedels mit dem meisten Andrang.
    expect(getPost(sim.state, lt.id)?.spotIds).toEqual(['zuelpicher', 'aachener-weiher', 'rudolfplatz']);
    expect(
      sim.dispatch({ type: 'hierarchy.configure', payload: { veedelId: 'neustadt-sued', settings: { minStock: 400 } } })
        .ok,
    ).toBe(true);
    expect(getPost(sim.state, lt.id)?.settings.orderRules[0].minStock).toBe(400);
    expect(sim.dispatch({ type: 'hierarchy.dismiss', payload: { veedelId: 'neustadt-sued' } }).ok).toBe(true);
    expect(getPost(sim.state, lt.id)).toBeUndefined();
  });

  it('wer geht, ist kein Leutnant mehr', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    sim.dispatch({ type: 'staff.fire', payload: { staffId: lt.id } });
    expect(getLieutenant(sim.state, 'lindenthal')).toBeNull();
    expect(appoint(sim, lt.id, ['uni']).ok).toBe(false);
  });

  it('Einstellungen werden geprüft', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    expect(configure(sim, lt.id, { reserve: 100 }).ok).toBe(false);
    appoint(sim, lt.id, ['uni']);
    expect(configure(sim, lt.id, { minStock: -5 }).ok).toBe(false);
    expect(configure(sim, lt.id, { priceLevel: 'gratis' }).ok).toBe(false);
    expect(configure(sim, lt.id, { onAbsent: 'egal' }).ok).toBe(false);
    expect(configure(sim, lt.id, { orderRules: [rule({ supplierId: 'rotterdam' })] }).ok).toBe(false);
    expect(configure(sim, lt.id, { orderRules: [rule({ productId: 'weed', packageId: 'hash50' })] }).ok).toBe(false);
    expect(configure(sim, lt.id, { caution: 'careful', priceLevel: 'premium', mayHire: false, reserve: 1000 }).ok).toBe(
      true,
    );
    expect(getPost(sim.state, lt.id)?.settings).toMatchObject({
      caution: 'careful',
      priceLevel: 'premium',
      mayHire: false,
      reserve: 1000,
    });
  });

  it('die letzte Bestellregel des Spielers ist die Vorlage für neue Leutnants', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner', 2);
    const b = recruit(sim, 'runner', 2);
    appoint(sim, a.id, ['uni']);
    configure(sim, a.id, { orderRules: [rule({ productId: 'hash', supplierId: 'frankfurt', minStock: 50 })] });
    appoint(sim, b.id, ['neumarkt']);
    expect(getPost(sim.state, b.id)?.settings.orderRules).toEqual([
      rule({ productId: 'hash', supplierId: 'frankfurt', minStock: 50 }),
    ]);
  });
});

describe('hierarchy: Delegation', () => {
  it('der Leutnant stellt freie Läufer und Sicherheit an seine Spots, den mit dem meisten Andrang zuerst', () => {
    const sim = quietGame();
    unlockAll(sim);
    const lt = recruit(sim, 'runner', 2);
    const runner = recruit(sim, 'runner');
    const guard = recruit(sim, 'security');
    appoint(sim, lt.id, ['rudolfplatz', 'zuelpicher']);
    configure(sim, lt.id, { mayHire: false, mayOrder: false });
    sim.advance(5);
    expect(runnerAt(sim.state, 'zuelpicher')?.id).toBe(runner.id);
    expect(securityAt(sim.state, { spotId: 'zuelpicher' }).map((m) => m.id)).toEqual([guard.id]);
    expect(runnerAt(sim.state, 'rudolfplatz')).toBeUndefined();
    expect(
      teamOf(sim.state, lt.id)
        .map((m) => m.id)
        .sort(),
    ).toEqual([runner.id, guard.id].sort());
    expect(sim.state.journal.some((j) => j.source === 'hierarchy' && j.text.includes(runner.name))).toBe(true);
  });

  it('er verkauft selbst an seinen Spots ohne Läufer', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayHire: false, mayOrder: false });
    addCustomer(sim, 'uni');
    sim.advance(10);
    const sales = eventsOfType(events, 'sale.completed');
    expect(sales.map((e) => e.payload.sellerId)).toEqual([lt.id]);
    expect(getPost(sim.state, lt.id)?.revenueToday).toBe(sales[0].payload.revenue);
  });

  it('er heuert mit Tagesbudget an (Standard an) und nimmt die Leute in sein Team', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 5000;
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayOrder: false, hireBudgetPerDay: 0 });
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
    configure(sim, lt.id, { hireBudgetPerDay: 1500 });
    const poolRunner = getCandidates(sim.state).find((c) => c.role === 'runner');
    sim.advance(5);
    const hired = runnerAt(sim.state, 'uni');
    expect(hired).toBeDefined();
    if (poolRunner) expect(hired?.name).toBe(poolRunner.name);
    expect(getPost(sim.state, lt.id)?.team).toContain(hired?.id);
    expect(getPost(sim.state, lt.id)?.hireSpent).toBeGreaterThan(0);
  });

  it('Bestellregel: zählt den Bestand im Ziel-Lager, bestellt nie an die Rücklage', () => {
    const sim = quietGame();
    openSuppliers(sim);
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, {
      mayHire: false,
      orderRules: [rule({ productId: 'weed', supplierId: 'frankfurt', minStock: 100 })],
    });
    const home = homeWarehouse(sim.state, lt.id)?.id as string;
    expect(getStock(sim.state, { warehouseId: home, productId: 'weed' })).toBeLessThan(100);
    sim.state.wallet.dirty = 500 + 50;
    sim.advance(5);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(getPost(sim.state, lt.id)?.log[0].text).toMatch(/Geld reicht nicht/);
    sim.state.wallet.dirty = 3000;
    wake(sim, lt.id);
    sim.advance(5);
    const shipments = shipmentsInTransit(sim.state);
    expect(shipments).toHaveLength(1);
    expect(shipments[0]).toMatchObject({ supplierId: 'frankfurt', productId: 'weed', warehouseId: home });
    expect(sim.state.wallet.dirty).toBeGreaterThanOrEqual(500);
    // Solange die Lieferung unterwegs ist, bestellt er nicht doppelt.
    sim.advance(200);
    expect(shipmentsInTransit(sim.state).length).toBeLessThanOrEqual(2);
    const ordered = shipmentsInTransit(sim.state).reduce((sum, s) => sum + s.amount, 0);
    expect(getStock(sim.state, { warehouseId: home, productId: 'weed' }) + ordered).toBeLessThan(100 + 101);
  });

  it('zwei Leutnants mit demselben Lager bestellen nicht doppelt', () => {
    const sim = quietGame();
    openSuppliers(sim);
    sim.state.wallet.dirty = 10000;
    const a = recruit(sim, 'runner', 2);
    const b = recruit(sim, 'runner', 2);
    appoint(sim, a.id, ['uni']);
    appoint(sim, b.id, ['neumarkt']);
    expect(homeWarehouse(sim.state, a.id)?.id).toBe(homeWarehouse(sim.state, b.id)?.id);
    const rules = [rule({ productId: 'oil', supplierId: 'frankfurt', packageId: 'oil20', minStock: 15 })];
    configure(sim, a.id, { mayHire: false, orderRules: rules });
    configure(sim, b.id, { mayHire: false, orderRules: rules });
    sim.advance(5);
    // Ein Paket mit 20 ml reicht für beide (Mindestbestand 15 im selben Lager).
    expect(shipmentsInTransit(sim.state).filter((s) => s.productId === 'oil')).toHaveLength(1);
  });

  it('ein gesperrter Lieferant lässt die Regel ruhen, ohne auszuweichen', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 5000;
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayHire: false, orderRules: [rule({ supplierId: 'hamburg', minStock: 500 })] });
    sim.advance(5);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    const post = getPost(sim.state, lt.id);
    expect(post?.settings.orderRules[0].paused).toMatch(/liefert noch nicht/);
    expect(sim.state.messages.list.some((m) => m.contactId === `staff:${lt.id}` && m.text.includes('ruht'))).toBe(true);
    // Mit "automatisch" kauft er beim, der liefert.
    configure(sim, lt.id, { orderRules: [rule({ minStock: 500 })] });
    sim.advance(5);
    expect(shipmentsInTransit(sim.state).length).toBeGreaterThan(0);
  });

  it('er bestellt, wonach die Kunden fragen (Regel automatisch)', () => {
    const sim = quietGame();
    openSuppliers(sim);
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayHire: false, orderRules: [rule({ minStock: 400 })] });
    sim.state.modules.customers.stats.missedByProduct = { hash: 12, weed: 1 };
    sim.state.wallet.dirty = 5000;
    sim.advance(5);
    expect(shipmentsInTransit(sim.state).length).toBeGreaterThan(0);
    expect(shipmentsInTransit(sim.state)[0].productId).toBe('hash');
    expect(getPost(sim.state, lt.id)?.log.some((l) => /fragen danach/.test(l.text))).toBe(true);
  });

  it('Preisniveau: er setzt eigene Preise an seinen Spots über market.setPrice', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayHire: false, mayOrder: false });
    sim.advance(5);
    expect(hasOwnPrice(sim.state, 'uni', 'weed')).toBe(false);
    configure(sim, lt.id, { priceLevel: 'premium' });
    sim.advance(5);
    expect(priceRatio(sim.state, 'uni', 'weed')).toBeCloseTo(1.15, 1);
    expect(eventsOfType(events, 'market.priceSet').length).toBeGreaterThan(0);
    configure(sim, lt.id, { priceLevel: 'fair' });
    sim.advance(5);
    expect(hasOwnPrice(sim.state, 'uni', 'weed')).toBe(false);
  });

  it('Vorsicht pro Veedel: bei Heat holt er nur dort die Leute von der Straße', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    lt.stats.caution = 50;
    const a = recruit(sim, 'runner');
    const b = recruit(sim, 'runner');
    appoint(sim, lt.id, ['uni', 'neumarkt']);
    configure(sim, lt.id, { mayHire: false, mayOrder: false });
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')).toBeDefined();
    expect(runnerAt(sim.state, 'neumarkt')).toBeDefined();
    sim.state.modules.police.heat.lindenthal = 90;
    wake(sim, lt.id);
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
    expect(runnerAt(sim.state, 'neumarkt')).toBeDefined();
    expect(getPost(sim.state, lt.id)?.lyingLow).toEqual(['lindenthal']);
    // Am abgetauchten Spot verkauft er auch selbst nicht.
    addCustomer(sim, 'uni');
    sim.advance(20);
    expect(sim.state.modules.customers.waiting.some((c) => c.spotId === 'uni')).toBe(true);
    sim.state.modules.police.heat.lindenthal = 20;
    sim.advance(120);
    expect(getPost(sim.state, lt.id)?.lyingLow).toEqual([]);
    expect([a.id, b.id]).toContain(runnerAt(sim.state, 'uni')?.id);
  });

  it('ein Leutnant in Haft führt nicht, danach macht er weiter', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayHire: false, mayOrder: false });
    sim.ctx('police').emit('police.arrest', { staffId: lt.id, veedelId: 'lindenthal' });
    sim.step();
    const runner = recruit(sim, 'runner');
    sim.advance(60);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
    sim.dispatch({ type: 'staff.bail', payload: { staffId: lt.id } });
    expect(getStaffMember(sim.state, lt.id)?.assignment).toEqual({ kind: 'veedel', targetId: 'lindenthal' });
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')?.id).toBe(runner.id);
  });

  it('der Leutnant handelt nur über Befehle, nie durch direktes Ändern fremder Zustände', () => {
    // Alle Befehle der anderen Module werden während des Leutnant-Ticks nur mitgeschrieben, nicht ausgeführt.
    // Handelt der Leutnant nur über Befehle, bleibt dann alles außer seinem eigenen Zustand unverändert.
    const log: { type: string; actor: string }[] = [];
    let intercept = false;
    const wrap = (m: ModuleDefinition): ModuleDefinition => {
      if (m.id === 'hierarchy') {
        return {
          ...m,
          tick: (ctx) => {
            intercept = true;
            try {
              m.tick?.(ctx);
            } finally {
              intercept = false;
            }
          },
        };
      }
      const commands: Record<string, CommandHandler<CommandType>> = {};
      for (const [type, handler] of Object.entries(m.commands ?? {})) {
        commands[type] = (ctx, payload, meta) => {
          if (!intercept) return (handler as CommandHandler<CommandType>)(ctx, payload, meta);
          log.push({ type, actor: meta.actor });
          return { ok: true };
        };
      }
      return { ...m, commands };
    };
    const sim = quietGame({ modules: createTestGame().modules.map(wrap) });
    sim.state.wallet.dirty = 5000;
    const lt = recruit(sim, 'runner', 2);
    unlockAll(sim);
    recruit(sim, 'security'); // wird verteilt, Läufer fehlen und werden angeheuert
    addCustomer(sim, 'rudolfplatz');
    appoint(sim, lt.id, ['zuelpicher', 'aachener-weiher', 'rudolfplatz']);
    configure(sim, lt.id, { priceLevel: 'premium', orderRules: [rule({ minStock: 400 })] });

    const others = (state: GameState) => {
      const { hierarchy: _own, ...rest } = state.modules;
      return JSON.stringify({ modules: rest, wallet: state.wallet });
    };
    const before = others(sim.state);
    const hierarchy = sim.modules.find((m) => m.id === 'hierarchy') as ModuleDefinition;
    hierarchy.tick?.(sim.ctx('hierarchy'));
    expect(others(sim.state)).toBe(before);

    const types = new Set(log.map((l) => l.type));
    expect(types).toContain('staff.assign');
    expect(types).toContain('suppliers.order');
    expect(types).toContain('customers.serve');
    expect(types).toContain('market.setPrice');
    expect(types.has('recruiting.hire') || types.has('staff.hireRunner')).toBe(true);
    expect(new Set(log.map((l) => l.actor))).toEqual(new Set([`staff:${lt.id}`]));
  });
});

describe('hierarchy: Ausfälle im Team', () => {
  function teamWithRunner(sim: Simulation) {
    sim.state.wallet.dirty = 5000;
    const lt = recruit(sim, 'runner', 2);
    const runner = recruit(sim, 'runner');
    appoint(sim, lt.id, ['uni']);
    configure(sim, lt.id, { mayOrder: false });
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')?.id).toBe(runner.id);
    return { lt, runner };
  }

  it('Standard: sofort ersetzen, nach zwei Tagen Haft entlassen, den Spieler nicht fragen', () => {
    const sim = quietGame();
    const { lt, runner } = teamWithRunner(sim);
    const free = recruit(sim, 'runner');
    sim.ctx('police').emit('police.arrest', { staffId: runner.id, veedelId: 'lindenthal' });
    sim.step();
    // Keine Frage an den Spieler, der Leutnant regelt das und meldet es still.
    expect(sim.state.messages.list.some((m) => m.options?.some((o) => o.id === 'replace'))).toBe(false);
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')?.id).toBe(free.id);
    expect(sim.state.messages.list.some((m) => m.contactId === `staff:${lt.id}` && m.text.includes(runner.name))).toBe(
      true,
    );
    // Nach zwei Tagen Haft ist er raus (über staff.fire mit dem Leutnant als Akteur).
    sim.advance(2 * 1440 + 100);
    expect(getStaff(sim.state).some((m) => m.id === runner.id)).toBe(false);
    expect(getStaffMember(sim.state, runner.id)?.leftReason).toBe('fired');
  });

  it('"Ersetzen" behält die Person, aktive Leute entlässt er nie', () => {
    const sim = quietGame();
    const { lt, runner } = teamWithRunner(sim);
    configure(sim, lt.id, { onAbsent: 'replace' });
    setInjured(sim, runner.id);
    sim.advance(3 * 1440);
    expect(getStaff(sim.state).some((m) => m.id === runner.id)).toBe(true);
    expect(getStaffMember(sim.state, runner.id)?.status).toBe('active');
    expect(runnerAt(sim.state, 'uni')?.id).not.toBe(runner.id);
  });

  it('"Abwarten" lässt den Platz frei und fragt den Spieler', () => {
    const sim = quietGame();
    const { lt, runner } = teamWithRunner(sim);
    configure(sim, lt.id, { onAbsent: 'wait' });
    recruit(sim, 'runner');
    sim.ctx('police').emit('police.arrest', { staffId: runner.id, veedelId: 'lindenthal' });
    sim.step();
    wake(sim, lt.id);
    sim.advance(10);
    expect(getStaff(sim.state, { spotId: 'uni', role: 'runner' })).toHaveLength(0);
    const ask = sim.state.messages.list.find((m) => m.options?.some((o) => o.id === 'replace'));
    expect(ask?.contactId).toBe(`staff:${lt.id}`);
  });
});

function setInjured(sim: Simulation, staffId: string): void {
  const ctx = sim.ctx('staff');
  const m = getStaffMember(sim.state, staffId) as StaffMember;
  m.returnTo = m.assignment;
  m.assignment = null;
  m.status = 'injured';
  m.statusUntil = sim.state.time + 1440;
  ctx.emit('staff.statusChanged', { staffId, from: 'active', to: 'injured' });
  sim.step();
}

describe('hierarchy: Zufriedenheit', () => {
  it('Leutnants haben höhere Ansprüche: zu wenig Lohn macht unzufrieden, er beschwert sich', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 100000;
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, ['uni', 'neumarkt']);
    const happy = lieutenantSatisfaction(sim.state, lt.id) ?? 0;
    // Lohn zurück auf Läufer-Niveau: für einen Leutnant viel zu wenig.
    sim.dispatch({ type: 'staff.setWage', payload: { staffId: lt.id, wage: 80 } });
    const member = getStaffMember(sim.state, lt.id) as StaffMember;
    member.stats.loyalty = 20;
    expect(lieutenantSatisfaction(sim.state, lt.id)).toBeLessThan(happy);
    expect(lieutenantSatisfaction(sim.state, lt.id)).toBeLessThan(35);
    sim.advance(1440);
    const complaint = sim.state.messages.list.find((m) => m.contactId === `staff:${lt.id}` && m.options);
    expect(complaint).toBeDefined();
    expect(getStaffMember(sim.state, lt.id)?.stats.loyalty).toBeLessThan(20);
    const result = sim.dispatch({
      type: 'messages.answer',
      payload: { messageId: complaint?.id ?? 0, optionId: 'raise' },
    });
    expect(result.ok).toBe(true);
    expect(getStaffMember(sim.state, lt.id)?.wage).toBeGreaterThanOrEqual(expectedWage(sim.state, lt.id));
  });
});

describe('hierarchy: alte Spielstände', () => {
  it('Version 1 wird migriert, Leutnants bekommen Spots in ihrem Veedel und Standard-Einstellungen', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    const state = structuredClone(sim.state) as GameState;
    (state.modules as unknown as Record<string, unknown>).hierarchy = { lieutenants: { lindenthal: lt.id } };
    state.moduleVersions.hierarchy = 1;
    const file = parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    expect(getPost(loaded.state, lt.id)?.spotIds).toEqual(['uni']);
    expect(getPost(loaded.state, lt.id)?.settings.orderRules[0].minStock).toBe(100);
    // Um Mitternacht zieht er auch im Personal als Leutnant ein.
    loaded.advance(1440);
    expect(getStaffMember(loaded.state, lt.id)?.assignment).toEqual({ kind: 'veedel', targetId: 'lindenthal' });
  });

  it('Version 2 → 3: bestehende Leutnants behalten die Spots ihres Veedels, Einstellungen und Protokoll', () => {
    const sim = quietGame();
    unlockAll(sim);
    const lt = recruit(sim, 'runner', 2);
    const v2 = {
      lieutenants: { 'neustadt-sued': lt.id },
      posts: {
        'neustadt-sued': {
          staffId: lt.id,
          appointedAt: 100,
          settings: {
            minStock: 200,
            priceLevel: 'premium',
            caution: 'careful',
            mayHire: false,
            mayOrder: true,
            reserve: 1000,
          },
          nextActionAt: 0,
          busyUntil: 0,
          lyingLow: true,
          revenueToday: 120,
          revenueYesterday: 900,
          salesTotal: 50,
          revenueTotal: 5000,
          complainedAt: null,
          log: [{ time: 90, text: 'Alt.' }],
        },
      },
    };
    const v3 = migrateHierarchyV2(v2 as Parameters<typeof migrateHierarchyV2>[0], sim.state);
    const post = v3.posts[lt.id];
    expect(post.spotIds).toEqual(['zuelpicher', 'aachener-weiher', 'rudolfplatz']);
    expect(post.settings).toMatchObject({ priceLevel: 'premium', caution: 'careful', mayHire: false, reserve: 1000 });
    expect(post.settings.orderRules).toEqual([rule({ minStock: 200 })]);
    expect(post).toMatchObject({ lyingLow: ['neustadt-sued'], revenueYesterday: 900, revenueTotal: 5000 });
    expect(post.log).toEqual([{ time: 90, text: 'Alt.' }]);
    expect(v3.rightHand).toBeNull();

    const state = structuredClone(sim.state) as GameState;
    (state.modules as unknown as Record<string, unknown>).hierarchy = v2;
    state.moduleVersions.hierarchy = 2;
    const loaded = loadSimulation(state, sim.modules);
    expect(lieutenantOfSpot(loaded.state, 'rudolfplatz')).toBe(lt.id);
    loaded.advance(120);
  });
});

describe('hierarchy: Warnung vor Razzien', () => {
  it('der Leutnant zieht nach der Warnung des Polizei-Kontakts seine Leute im Veedel ab', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 3);
    expect(appoint(sim, lt.id, ['uni', 'neumarkt']).ok).toBe(true);
    configure(sim, lt.id, { mayHire: false, mayOrder: false });
    const runner = recruit(sim, 'runner');
    const other = recruit(sim, 'runner');
    sim.dispatch({
      type: 'staff.assign',
      payload: { staffId: runner.id, assignment: { kind: 'spot', targetId: 'uni' } },
    });
    sim.dispatch({
      type: 'staff.assign',
      payload: { staffId: other.id, assignment: { kind: 'spot', targetId: 'neumarkt' } },
    });
    const contact = recruit(sim, 'policeContact');
    contact.stats.charisma = 100;
    contact.level = 10;
    const at = sim.state.time + 180;
    sim.ctx('police').emit('police.raidPlanned', { veedelId: 'lindenthal', at });
    sim.step();
    expect(eventsOfType(events, 'staff.raidWarning')).toHaveLength(1);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
    expect(getStaffMember(sim.state, other.id)?.assignment).toEqual({ kind: 'spot', targetId: 'neumarkt' });
    expect(getPost(sim.state, lt.id)?.log[0].text).toContain('Razzia');
    // Solange abgetaucht, stellt er niemanden zurück an den Spot.
    sim.advance(60);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
  });
});
