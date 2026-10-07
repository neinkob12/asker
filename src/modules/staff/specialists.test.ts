// Wirkungen der Spezialisten (Auftrag 46e): Polizei-Kontakt (Zoll, Heat, Kontrollen), Anwalt (Verhaftungen, Haft),
// Buchhalter (nur einer, Erlös, Löhne). Werte aus SPECIALIST_EFFECTS, Wirkung nur über die Lesefunktionen.

import { describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import type { Customer } from '../customers';
import { addHeat, arrestChanceFor, getHeat } from '../police';
import type { Candidate } from '../recruiting';
import { SPECIALIST_EFFECTS, SPECIALIST_GOOD_STAT, SPECIALIST_NORMAL_STAT } from './config';
import {
  canHireRole,
  enlist,
  generateProfile,
  isGoodSpecialist,
  jailDuration,
  payrollDue,
  riskFactor,
  runnerAt,
  type StaffMember,
  type StaffRole,
  specialistEffect,
  specialistEffectsOf,
  specialistFactor,
  specialistProvider,
  specialistShareOf,
  wageFactor,
} from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

/** Spezialist mit festen Schlüsselwerten (keyStats der Rolle alle auf value). */
function specialist(sim: Simulation, role: StaffRole, value: number, cityId = 'koeln'): StaffMember {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, role), { origin: 'pool', cityId });
  m.stats = { speed: value, caution: value, strength: value, charisma: value, loyalty: 70 };
  return m;
}

function addCustomer(sim: Simulation, spotId: string, amount: number, pricePerUnit = 10): Customer {
  const c: Customer = {
    id: sim.state.nextId++,
    spotId,
    productId: 'weed',
    amount,
    pricePerUnit,
    arrivedAt: sim.state.time,
    expiresAt: sim.state.time + 100,
  };
  sim.state.modules.customers.waiting.push(c);
  return c;
}

describe('Spezialisten (Auftrag 46e): Anteil nach Rolle und Wert', () => {
  it('ohne Person 0 und Faktor 1, normal bis 50, gut ab 70, dazwischen linear, nur in der eigenen Stadt', () => {
    const sim = quietGame();
    for (const key of Object.keys(SPECIALIST_EFFECTS) as (keyof typeof SPECIALIST_EFFECTS)[]) {
      expect(specialistEffect(sim.state, key)).toBe(0);
      expect(specialistFactor(sim.state, key)).toBe(1);
    }
    const normal = specialist(sim, 'policeContact', SPECIALIST_NORMAL_STAT);
    expect(specialistShareOf(normal, 'seizure')).toBe(SPECIALIST_EFFECTS.seizure.normal);
    expect(isGoodSpecialist(normal)).toBe(false);
    expect(specialistFactor(sim.state, 'seizure')).toBe(1 - 0.3);
    expect(specialistFactor(sim.state, 'heatGain')).toBe(1 - 0.15);
    expect(specialistFactor(sim.state, 'checks')).toBe(1 - 0.25);
    // Ein zweiter, besserer Kontakt ersetzt den ersten, stapelt aber nicht.
    const good = specialist(sim, 'policeContact', SPECIALIST_GOOD_STAT);
    expect(isGoodSpecialist(good)).toBe(true);
    expect(specialistProvider(sim.state, 'seizure')?.id).toBe(good.id);
    expect(specialistEffect(sim.state, 'seizure')).toBe(SPECIALIST_EFFECTS.seizure.good);
    expect(specialistEffect(sim.state, 'heatGain')).toBe(0.25);
    expect(specialistEffect(sim.state, 'checks')).toBe(0.4);
    // Dazwischen linear: Mitte zwischen normal und gut.
    const half = specialist(sim, 'lawyer', (SPECIALIST_NORMAL_STAT + SPECIALIST_GOOD_STAT) / 2);
    expect(specialistShareOf(half, 'arrests')).toBeCloseTo(0.4, 5);
    // Darüber nicht mehr, darunter nicht weniger als normal.
    expect(specialistShareOf(specialist(sim, 'lawyer', 100), 'arrests')).toBe(0.5);
    expect(specialistShareOf(specialist(sim, 'lawyer', 10), 'arrests')).toBe(0.3);
    // Rolle passt nicht: 0; Hamburg hat nichts vom Kölner Kontakt.
    expect(specialistShareOf(half, 'seizure')).toBe(0);
    expect(specialistEffect(sim.state, 'seizure', 'hamburg')).toBe(0);
    // Wer in Haft sitzt, wirkt nicht.
    good.status = 'jailed';
    normal.status = 'jailed';
    expect(specialistEffect(sim.state, 'seizure')).toBe(0);
    good.status = 'active';
    expect(specialistEffectsOf(good).map((l) => l.key)).toEqual(['seizure', 'heatGain', 'checks']);
  });
});

describe('Polizei-Kontakt', () => {
  it('dämpft jeden Heat-Zuwachs, nicht den Abbau', () => {
    const sim = quietGame();
    addHeat(sim.ctx('test'), 'ehrenfeld', 20);
    expect(getHeat(sim.state, 'ehrenfeld')).toBe(20);
    specialist(sim, 'policeContact', SPECIALIST_GOOD_STAT);
    addHeat(sim.ctx('test'), 'ehrenfeld', 20);
    expect(getHeat(sim.state, 'ehrenfeld')).toBeCloseTo(20 + 20 * 0.75, 3);
    addHeat(sim.ctx('test'), 'ehrenfeld', -10);
    expect(getHeat(sim.state, 'ehrenfeld')).toBeCloseTo(25, 3);
    // In Hamburg wirkt er nicht.
    addHeat(sim.ctx('test'), 'st-pauli', 20);
    expect(getHeat(sim.state, 'st-pauli')).toBe(20);
  });
});

describe('Anwalt', () => {
  it('senkt die Chance auf Festnahmen seiner Leute und halbiert die Haft', () => {
    const sim = quietGame();
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
    const runner = runnerAt(sim.state, 'neumarkt') as StaffMember;
    const plain = arrestChanceFor(sim.state, runner.id, 0.5);
    expect(plain).toBeCloseTo(0.5 * riskFactor(sim.state, runner.id), 5);
    const jail = jailDuration(sim.state);
    specialist(sim, 'lawyer', SPECIALIST_NORMAL_STAT);
    expect(arrestChanceFor(sim.state, runner.id, 0.5)).toBeCloseTo(plain * 0.7, 5);
    expect(jailDuration(sim.state)).toBe(Math.round(jail * 0.5));
    specialist(sim, 'lawyer', SPECIALIST_GOOD_STAT);
    expect(arrestChanceFor(sim.state, runner.id, 0.5)).toBeCloseTo(plain * 0.5, 5);
    // Höchstens 1, und in Hamburg nichts.
    expect(arrestChanceFor(sim.state, runner.id, 5)).toBe(1);
    expect(jailDuration(sim.state, 'hamburg')).toBe(jail);
  });
});

describe('Buchhalter', () => {
  it('nur einer pro Stadt: Bewerber mit der Rolle lassen sich nicht einstellen, solange einer da ist', () => {
    const sim = quietGame();
    expect(canHireRole(sim.state, 'accountant').ok).toBe(true);
    expect(canHireRole(sim.state, 'lawyer').ok).toBe(true);
    const first = specialist(sim, 'accountant', 60);
    const check = canHireRole(sim.state, 'accountant');
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toContain(first.name);
    // Auch in Haft zählt er; in Hamburg darf ein eigener dazu.
    first.status = 'jailed';
    expect(canHireRole(sim.state, 'accountant').ok).toBe(false);
    expect(canHireRole(sim.state, 'accountant', 'hamburg').ok).toBe(true);
    expect(canHireRole(sim.state, 'lawyer').ok).toBe(true);
    // Über recruiting: ein Bewerber mit der Rolle wird abgelehnt, mit Grund.
    sim.state.wallet.dirty = 50000;
    const ctx = sim.ctx('recruiting');
    const profile = generateProfile(ctx, 'accountant');
    const candidate: Candidate = {
      id: 'c-acc',
      source: 'pool',
      name: profile.name,
      role: 'accountant',
      age: profile.age,
      background: profile.background,
      stats: profile.stats,
      visibleStats: {},
      level: 1,
      wage: profile.wage,
      hireCost: 500,
      portrait: null,
      note: '',
      expiresAt: sim.state.time + 1000,
      arrivedAt: sim.state.time,
      referrerId: null,
      traits: profile.traits ?? [],
      revealedTraits: [],
      cityId: 'koeln',
    } as Candidate;
    sim.state.modules.recruiting.candidates.push(candidate);
    const hired = sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: 'c-acc' } });
    expect(hired).toMatchObject({ ok: false, reason: expect.stringContaining(first.name) });
  });

  it('bringt auf jeden Verkaufserlös ein paar Prozent mehr (normal 3, gut 7)', () => {
    const base = quietGame();
    const events = recordEvents(base);
    const money = base.state.wallet.dirty;
    const c = addCustomer(base, 'neumarkt', 5, 10);
    expect(base.dispatch({ type: 'customers.serve', payload: { customerId: c.id } }).ok).toBe(true);
    expect(base.state.wallet.dirty - money).toBe(50);
    expect(eventsOfType(events, 'sale.completed').at(-1)?.payload.revenue).toBe(50);

    for (const [value, share] of [
      [SPECIALIST_NORMAL_STAT, SPECIALIST_EFFECTS.revenue.normal],
      [SPECIALIST_GOOD_STAT, SPECIALIST_EFFECTS.revenue.good],
    ] as const) {
      const sim = quietGame();
      const withEvents = recordEvents(sim);
      specialist(sim, 'accountant', value);
      expect(specialistFactor(sim.state, 'revenue')).toBe(1 + share);
      const before = sim.state.wallet.dirty;
      const customer = addCustomer(sim, 'neumarkt', 5, 10);
      expect(sim.dispatch({ type: 'customers.serve', payload: { customerId: customer.id } }).ok).toBe(true);
      const expected = Math.round(50 * (1 + share));
      expect(sim.state.wallet.dirty - before).toBe(expected);
      expect(eventsOfType(withEvents, 'sale.completed').at(-1)?.payload.revenue).toBe(expected);
    }
  });

  it('spart Löhne aller Leute der Stadt (normal 5, gut 10 %), nachts beim Zahlen wie in der Vorschau', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 50000;
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const plain = payrollDue(sim.state);
    const accountant = specialist(sim, 'accountant', SPECIALIST_GOOD_STAT);
    expect(wageFactor(sim.state, 'koeln')).toBe(1 - SPECIALIST_EFFECTS.wages.good);
    expect(wageFactor(sim.state, 'hamburg')).toBe(1);
    const due = payrollDue(sim.state);
    const expected = sim.state.modules.staff.members.reduce((sum, m) => sum + Math.round(m.wage * 0.9), 0);
    expect(due).toBe(expected);
    expect(due).toBeLessThan(plain + Math.round(accountant.wage * 0.9));
    // Um Mitternacht wird genau das gebucht.
    const before = sim.state.wallet.dirty;
    const spent: number[] = [];
    sim.onEvent((e) => {
      if (e.type === 'wallet.changed' && e.payload.category?.startsWith('wages.')) spent.push(-e.payload.amount);
    });
    sim.advance(1440 - (sim.state.time % 1440));
    expect(spent.reduce((a, b) => a + b, 0)).toBe(due);
    expect(before - sim.state.wallet.dirty).toBeGreaterThanOrEqual(due);
    expect(wallet.balance(sim.state, 'dirty')).toBeLessThan(before);
  });
});
