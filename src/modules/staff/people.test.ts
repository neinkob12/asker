// Auftrag 34, Etappe 1: Leute mit Geschichte (Eigenschaften, Beziehungen). Die Geschichten im Chat sind seit Auftrag 46d weg.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { TRAIT_EXCLUDES, TRAITS } from './config';
import {
  betrayalChance,
  enlist,
  expectedWage,
  generateProfile,
  getStaff,
  getStaffMember,
  relationBetween,
  relationsOf,
  rollTraits,
  type StaffMember,
  type StaffRole,
  serveTime,
  talkChance,
} from './index';
import { addRelation } from './traits';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, patch: Partial<StaffMember> = {}): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role), { origin: 'pool' });
  Object.assign(member, patch);
  return member;
}

describe('Eigenschaften', () => {
  it('zwei bis drei, ohne ausgeschlossene Paare, fest aus dem Schlüssel', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 300; i++) {
      const traits = rollTraits(`k${i}`);
      counts.set(traits.length, (counts.get(traits.length) ?? 0) + 1);
      expect(new Set(traits).size).toBe(traits.length);
      for (const [a, b] of TRAIT_EXCLUDES) expect(traits.includes(a) && traits.includes(b)).toBe(false);
      expect(rollTraits(`k${i}`)).toEqual(traits);
    }
    expect([...counts.keys()].sort()).toEqual([2, 3]);
  });

  it('jede Person bekommt beim Einstellen Eigenschaften, auch von der Straße', () => {
    const sim = quietGame();
    const pool = recruit(sim, 'runner');
    expect(pool.traits.length).toBeGreaterThanOrEqual(2);
    const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
    if (!result.ok) throw new Error(result.reason);
    const street = getStaffMember(sim.state, (result.data as { staffId: string }).staffId);
    expect(street?.traits.length).toBeGreaterThanOrEqual(2);
  });

  it('wirken als kleine Faktoren: Lohnwunsch, Tempo, Verrat, Reden', () => {
    const sim = quietGame();
    const base = recruit(sim, 'runner', { traits: [] });
    const ambitious = recruit(sim, 'runner', { traits: ['ambitious'], level: base.level, demand: base.demand });
    expect(expectedWage(sim.state, ambitious.id)).toBeGreaterThan(expectedWage(sim.state, base.id));
    const nimble = recruit(sim, 'runner', { traits: ['nimble'], stats: { ...base.stats }, level: base.level });
    expect(serveTime(nimble)).toBeLessThan(serveTime(base));
    const loyal = recruit(sim, 'runner', { traits: ['loyal'], stats: { ...base.stats, loyalty: 10 } });
    expect(betrayalChance(loyal)).toBe(0);
    expect(talkChance(loyal)).toBe(0);
    const gambler = recruit(sim, 'runner', { traits: ['gambler'], stats: { ...base.stats, loyalty: 10 } });
    const plain = recruit(sim, 'runner', { traits: [], stats: { ...base.stats, loyalty: 10 } });
    expect(betrayalChance(gambler)).toBeGreaterThan(betrayalChance(plain));
  });

  it('Version 6 → 7: alte Leute bekommen Eigenschaften fest aus der ID', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner', { traits: [] });
    const raw = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { staff: { members: Partial<StaffMember>[]; relations?: unknown } };
    };
    raw.moduleVersions.staff = 6;
    for (const m of raw.modules.staff.members) delete m.traits;
    delete raw.modules.staff.relations;
    const one = loadSimulation(structuredClone(raw), sim.modules);
    const two = loadSimulation(structuredClone(raw), sim.modules);
    const traits = getStaffMember(one.state, a.id)?.traits ?? [];
    expect(traits.length).toBeGreaterThanOrEqual(2);
    expect(getStaffMember(two.state, a.id)?.traits).toEqual(traits);
    expect(one.state.modules.staff.relations).toEqual([]);
    // Der erwartete Lohn bleibt, wie er vorher war (Anspruch gleicht den Lohnfaktor der Eigenschaften aus).
    expect(Math.abs(expectedWage(one.state, a.id) - expectedWage(sim.state, a.id))).toBeLessThanOrEqual(5);
  });

  it('Version 7 → 8 (Auftrag 46d): die Geschichten der Leute fallen aus dem Zustand', () => {
    const sim = quietGame();
    recruit(sim, 'runner');
    const raw = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { staff: Record<string, unknown> };
    };
    raw.moduleVersions.staff = 7;
    raw.modules.staff.stories = { open: [{ id: 'st1' }], lastAt: {}, byPerson: {}, byStory: {}, count: 3 };
    const loaded = loadSimulation(raw, sim.modules);
    expect('stories' in loaded.state.modules.staff).toBe(false);
    expect(loaded.state.moduleVersions.staff).toBe(8);
    expect(getStaff(loaded.state)).toHaveLength(1);
  });

  it('jede Eigenschaft hat Namen, Satz und Symbol', () => {
    for (const info of Object.values(TRAITS)) {
      expect(info.name.length).toBeGreaterThan(2);
      expect(info.hint.endsWith('.')).toBe(true);
      expect(info.icon).toBeTruthy();
    }
  });
});

describe('Beziehungen', () => {
  it('Empfehlungen kennen sich, das Team bekommt nur wenige Beziehungen', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner');
    const ctx = sim.ctx('staff');
    const b = enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'referral', referrerId: a.id });
    expect(relationBetween(sim.state, a.id, b.id)).toMatch(/friends|siblings/);
    for (let i = 0; i < 20; i++) recruit(sim, 'runner');
    const team = getStaff(sim.state).length;
    expect(sim.state.modules.staff.relations.length).toBeLessThanOrEqual(Math.max(1, Math.floor(team / 3)) + 1);
  });

  it('wer jemanden entlässt, verliert die Loyalität der Freunde; Rivalen freuen sich', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner', { traits: [] });
    const friend = recruit(sim, 'runner', { traits: [] });
    const rival = recruit(sim, 'runner', { traits: [] });
    sim.state.modules.staff.relations = [];
    addRelation(sim.ctx('staff'), a.id, friend.id, 'friends');
    addRelation(sim.ctx('staff'), a.id, rival.id, 'rivals');
    friend.stats.loyalty = 60;
    rival.stats.loyalty = 60;
    expect(sim.dispatch({ type: 'staff.fire', payload: { staffId: a.id } }).ok).toBe(true);
    const f = getStaffMember(sim.state, friend.id);
    if (f?.leftAt === null) expect(f.stats.loyalty).toBe(50);
    expect(getStaffMember(sim.state, rival.id)?.stats.loyalty).toBe(64);
  });

  it('Festnahme trifft das Paar, am selben Spot arbeiten Freunde schneller', () => {
    const sim = quietGame();
    const runner = recruit(sim, 'runner', { traits: [], assignment: { kind: 'spot', targetId: 'neumarkt' } });
    const guard = recruit(sim, 'security', { traits: [], assignment: { kind: 'spot', targetId: 'neumarkt' } });
    sim.state.modules.staff.relations = [];
    addRelation(sim.ctx('staff'), runner.id, guard.id, 'couple');
    expect(relationsOf(sim.state, runner.id).map((r) => r.kind)).toEqual(['couple']);
    guard.stats.loyalty = 60;
    sim.ctx('police').emit('police.arrest', { staffId: runner.id, veedelId: 'altstadt-nord' } as never);
    sim.advance(1);
    expect(getStaffMember(sim.state, guard.id)?.stats.loyalty).toBeLessThan(60);
  });
});
