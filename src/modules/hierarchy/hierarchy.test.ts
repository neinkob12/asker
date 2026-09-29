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
import { availablePackages, getSuppliers, packagePrice, shipmentsInTransit } from '../suppliers';
import { LIEUTENANT_DEMAND } from './config';
import { getLieutenant, getLieutenants, getPost, lieutenantSatisfaction, lieutenantVeedel } from './index';

function quietGame(options: { modules?: readonly ModuleDefinition[] } = {}): Simulation {
  const sim = createTestGame(options);
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
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

const appoint = (sim: Simulation, staffId: string, veedelId: string) =>
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId, veedelId } });

describe('hierarchy: ernennen und abberufen', () => {
  it('Leutnant ernennen, abfragen und abberufen', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    expect(appoint(sim, lt.id, 'lindenthal').ok).toBe(true);
    expect(getLieutenant(sim.state, 'lindenthal')).toBe(lt.id);
    expect(getLieutenants(sim.state)).toEqual([['lindenthal', lt.id]]);
    expect(lieutenantVeedel(sim.state, lt.id)).toBe('lindenthal');
    const member = getStaffMember(sim.state, lt.id) as StaffMember;
    expect(member.assignment).toEqual({ kind: 'veedel', targetId: 'lindenthal' });
    expect(member.demand).toBe(LIEUTENANT_DEMAND);
    expect(member.wage).toBe(expectedWage(sim.state, lt.id));
    expect(getStaff(sim.state, { veedelId: 'lindenthal' }).map((m) => m.id)).toEqual([lt.id]);
    expect(eventsOfType(events, 'hierarchy.appointed')[0].payload).toEqual({ staffId: lt.id, veedelId: 'lindenthal' });

    expect(sim.dispatch({ type: 'hierarchy.dismiss', payload: { veedelId: 'lindenthal' } }).ok).toBe(true);
    expect(getLieutenant(sim.state, 'lindenthal')).toBeNull();
    expect(getPost(sim.state, 'lindenthal')).toBeUndefined();
    expect(getStaffMember(sim.state, lt.id)).toMatchObject({ assignment: null, demand: 1 });
  });

  it('nur wer Erfahrung hat, aktiv ist und kein Spezialist', () => {
    const sim = quietGame();
    const rookie = recruit(sim, 'runner', 1);
    const lawyer = recruit(sim, 'lawyer', 3);
    expect(appoint(sim, rookie.id, 'deutz')).toMatchObject({ ok: false, reason: expect.stringMatching(/Level 2/) });
    expect(appoint(sim, lawyer.id, 'deutz').ok).toBe(false);
    addXp(sim.ctx('staff'), rookie.id, 200);
    expect(appoint(sim, rookie.id, 'gibt-es-nicht').ok).toBe(false);
    expect(appoint(sim, rookie.id, 'deutz').ok).toBe(true);
    expect(appoint(sim, rookie.id, 'deutz').ok).toBe(false);
  });

  it('ein neuer Leutnant ersetzt den alten, ein Leutnant kann versetzt werden', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner', 2);
    const b = recruit(sim, 'security', 2);
    appoint(sim, a.id, 'deutz');
    appoint(sim, b.id, 'deutz');
    expect(getLieutenant(sim.state, 'deutz')).toBe(b.id);
    expect(getStaffMember(sim.state, a.id)?.assignment).toBeNull();
    sim.dispatch({ type: 'hierarchy.configure', payload: { veedelId: 'deutz', settings: { minStock: 400 } } });
    appoint(sim, b.id, 'kalk');
    expect(getLieutenants(sim.state)).toEqual([['kalk', b.id]]);
    expect(getPost(sim.state, 'kalk')?.settings.minStock).toBe(400);
  });

  it('wer geht, ist kein Leutnant mehr', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'lindenthal');
    sim.dispatch({ type: 'staff.fire', payload: { staffId: lt.id } });
    expect(getLieutenant(sim.state, 'lindenthal')).toBeNull();
    expect(appoint(sim, lt.id, 'lindenthal').ok).toBe(false);
  });

  it('Einstellungen werden geprüft', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    const configure = (settings: Record<string, unknown>) =>
      sim.dispatch({ type: 'hierarchy.configure', payload: { veedelId: 'deutz', settings } });
    expect(configure({ minStock: 50 }).ok).toBe(false);
    appoint(sim, lt.id, 'deutz');
    expect(configure({ minStock: -5 }).ok).toBe(false);
    expect(configure({ priceLevel: 'gratis' }).ok).toBe(false);
    expect(configure({ caution: 'careful', priceLevel: 'premium', mayHire: true, reserve: 1000 }).ok).toBe(true);
    expect(getPost(sim.state, 'deutz')?.settings).toMatchObject({
      caution: 'careful',
      priceLevel: 'premium',
      mayHire: true,
      reserve: 1000,
    });
  });
});

describe('hierarchy: Delegation', () => {
  it('der Leutnant stellt freie Läufer und Sicherheit an die Spots mit dem meisten Andrang', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    lt.stats.charisma = 40;
    sim.state.modules.spots.unlocked.push('rudolfplatz', 'aachener-weiher');
    const runner = recruit(sim, 'runner');
    const guard = recruit(sim, 'security');
    appoint(sim, lt.id, 'neustadt-sued');
    sim.advance(5);
    // Zülpicher Platz hat den meisten Andrang in Neustadt-Süd.
    expect(runnerAt(sim.state, 'zuelpicher')?.id).toBe(runner.id);
    expect(securityAt(sim.state, { spotId: 'zuelpicher' }).map((m) => m.id)).toEqual([guard.id]);
    const assigned = eventsOfType(events, 'staff.assigned').filter((e) => e.payload.staffId === runner.id);
    expect(assigned).toHaveLength(1);
    expect(getPost(sim.state, 'neustadt-sued')?.log.length).toBeGreaterThan(0);
    expect(sim.state.journal.some((j) => j.source === 'hierarchy' && j.text.includes(runner.name))).toBe(true);
  });

  it('er verkauft selbst an Spots ohne Läufer', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'lindenthal');
    addCustomer(sim, 'uni');
    sim.advance(10);
    const sales = eventsOfType(events, 'sale.completed');
    expect(sales.map((e) => e.payload.sellerId)).toEqual([lt.id]);
    expect(getPost(sim.state, 'lindenthal')?.revenueToday).toBe(sales[0].payload.revenue);
  });

  it('er hält den Bestand und bestellt Nachschub, aber nie an die Rücklage', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'deutz');
    expect(getStock(sim.state)).toBeLessThan(100);
    const cheapest = Math.min(
      ...getSuppliers(sim.state).flatMap((s) =>
        availablePackages(sim.state, s.id).map((p) => packagePrice(sim.state, s.id, p.id)),
      ),
    );
    sim.state.wallet.dirty = 500 + cheapest - 1;
    sim.advance(5);
    // Mit 500 € Rücklage reicht es für kein Paket.
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(getPost(sim.state, 'deutz')?.log[0].text).toMatch(/Geld reicht nicht/);
    sim.state.wallet.dirty = 3000;
    sim.state.modules.hierarchy.posts.deutz.nextActionAt = sim.state.time;
    sim.advance(5);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
    expect(shipmentsInTransit(sim.state)[0].amount).toBeGreaterThanOrEqual(100 - getStock(sim.state));
    expect(sim.state.wallet.dirty).toBeGreaterThanOrEqual(500);
    // Solange die Lieferung unterwegs ist, bestellt er nicht doppelt.
    sim.advance(200);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
  });

  it('er stellt Leute aus dem Pool ein, wenn er darf', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 5000;
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'lindenthal');
    sim.dispatch({ type: 'hierarchy.configure', payload: { veedelId: 'lindenthal', settings: { mayOrder: false } } });
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
    sim.dispatch({ type: 'hierarchy.configure', payload: { veedelId: 'lindenthal', settings: { mayHire: true } } });
    const poolRunner = getCandidates(sim.state).find((c) => c.role === 'runner');
    sim.advance(5);
    const hired = runnerAt(sim.state, 'uni');
    expect(hired).toBeDefined();
    if (poolRunner) expect(hired?.name).toBe(poolRunner.name);
  });

  it('Preisniveau: er setzt eigene Preise an seinen Spots über market.setPrice', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'lindenthal');
    // Standard: Er lässt die Preise, wie sie sind.
    sim.advance(5);
    expect(hasOwnPrice(sim.state, 'uni', 'weed')).toBe(false);
    const configure = (priceLevel: 'premium' | 'fair') =>
      sim.dispatch({ type: 'hierarchy.configure', payload: { veedelId: 'lindenthal', settings: { priceLevel } } });
    configure('premium');
    sim.advance(5);
    expect(priceRatio(sim.state, 'uni', 'weed')).toBeCloseTo(1.15, 1);
    expect(eventsOfType(events, 'market.priceSet').length).toBeGreaterThan(0);
    configure('fair');
    sim.advance(5);
    expect(hasOwnPrice(sim.state, 'uni', 'weed')).toBe(false);
  });

  it('Vorsicht: bei zu viel Heat holt er alle von der Straße und schickt sie später zurück', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    lt.stats.caution = 50;
    const runner = recruit(sim, 'runner');
    appoint(sim, lt.id, 'lindenthal');
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')?.id).toBe(runner.id);
    sim.state.modules.police.heat.lindenthal = 90;
    sim.state.modules.hierarchy.posts.lindenthal.nextActionAt = sim.state.time;
    sim.advance(5);
    expect(runnerAt(sim.state, 'uni')).toBeUndefined();
    expect(getPost(sim.state, 'lindenthal')?.lyingLow).toBe(true);
    // Er verkauft dann auch selbst nicht.
    addCustomer(sim, 'uni');
    sim.advance(20);
    expect(sim.state.modules.customers.waiting).toHaveLength(1);
    sim.state.modules.police.heat.lindenthal = 20;
    sim.advance(120);
    expect(getPost(sim.state, 'lindenthal')?.lyingLow).toBe(false);
    expect(runnerAt(sim.state, 'uni')?.id).toBe(runner.id);
  });

  it('ein Leutnant in Haft führt nicht, danach macht er weiter', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'lindenthal');
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
    lt.stats.charisma = 70; // schafft alle drei Spots
    sim.state.modules.spots.unlocked.push('rudolfplatz', 'aachener-weiher');
    recruit(sim, 'security'); // wird verteilt, Läufer fehlen und werden angeheuert
    addCustomer(sim, 'rudolfplatz');
    appoint(sim, lt.id, 'neustadt-sued');
    sim.dispatch({
      type: 'hierarchy.configure',
      payload: { veedelId: 'neustadt-sued', settings: { mayHire: true, priceLevel: 'premium' } },
    });

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

describe('hierarchy: Zufriedenheit', () => {
  it('Leutnants haben höhere Ansprüche: zu wenig Lohn macht unzufrieden, er beschwert sich', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 100000;
    const lt = recruit(sim, 'runner', 2);
    appoint(sim, lt.id, 'deutz');
    const happy = lieutenantSatisfaction(sim.state, 'deutz') ?? 0;
    // Lohn zurück auf Läufer-Niveau: für einen Leutnant viel zu wenig.
    sim.dispatch({ type: 'staff.setWage', payload: { staffId: lt.id, wage: 80 } });
    const member = getStaffMember(sim.state, lt.id) as StaffMember;
    member.stats.loyalty = 30;
    expect(lieutenantSatisfaction(sim.state, 'deutz')).toBeLessThan(happy);
    expect(lieutenantSatisfaction(sim.state, 'deutz')).toBeLessThan(35);
    sim.advance(1440);
    const complaint = sim.state.messages.list.find((m) => m.contactId === `staff:${lt.id}` && m.options);
    expect(complaint).toBeDefined();
    expect(getStaffMember(sim.state, lt.id)?.stats.loyalty).toBeLessThan(30);
    const result = sim.dispatch({
      type: 'messages.answer',
      payload: { messageId: complaint?.id ?? 0, optionId: 'raise' },
    });
    expect(result.ok).toBe(true);
    expect(getStaffMember(sim.state, lt.id)?.wage).toBeGreaterThanOrEqual(expectedWage(sim.state, lt.id));
  });
});

describe('hierarchy: Spielstände aus dem Fundament', () => {
  it('Version 1 wird migriert, Leutnants bekommen Standard-Einstellungen', () => {
    const sim = quietGame();
    const lt = recruit(sim, 'runner', 2);
    const state = structuredClone(sim.state) as GameState;
    (state.modules as unknown as Record<string, unknown>).hierarchy = { lieutenants: { deutz: lt.id } };
    state.moduleVersions.hierarchy = 1;
    const file = parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    expect(getLieutenant(loaded.state, 'deutz')).toBe(lt.id);
    expect(getPost(loaded.state, 'deutz')?.settings.minStock).toBeGreaterThan(0);
    // Um Mitternacht zieht er auch im Personal als Leutnant ein.
    loaded.advance(1440);
    expect(getStaffMember(loaded.state, lt.id)?.assignment).toEqual({ kind: 'veedel', targetId: 'deutz' });
  });
});

describe('hierarchy: Warnung vor Razzien', () => {
  it('der Leutnant zieht nach der Warnung des Polizei-Kontakts seine Leute ab', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const lt = recruit(sim, 'runner', 3);
    expect(appoint(sim, lt.id, 'lindenthal').ok).toBe(true);
    const runner = recruit(sim, 'runner');
    sim.dispatch({
      type: 'staff.assign',
      payload: { staffId: runner.id, assignment: { kind: 'spot', targetId: 'uni' } },
    });
    const contact = recruit(sim, 'policeContact');
    contact.stats.charisma = 100;
    contact.level = 10;
    const at = sim.state.time + 180;
    sim.ctx('police').emit('police.raidPlanned', { veedelId: 'lindenthal', at });
    sim.step();
    expect(eventsOfType(events, 'staff.raidWarning')).toHaveLength(1);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
    expect(getPost(sim.state, 'lindenthal')?.log[0].text).toContain('Razzia');
    // Solange abgetaucht, stellt er niemanden zurück an den Spot.
    sim.advance(60);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
  });
});
