// Haft, Kaution, Spezialisten-Boni und Migration alter Spielstände.

import { describe, expect, it } from 'vitest';
import {
  createSaveFile,
  type GameState,
  loadSimulation,
  parseSaveFile,
  type Simulation,
  serializeSave,
} from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { BAIL_BASE, INJURED_WAGE_FACTOR, JAIL_DURATION, JAIL_WAGE_FACTOR, LOYALTY } from './config';
import {
  activeRunnerAt,
  bailCost,
  bonus,
  enlist,
  generateProfile,
  getStaff,
  getStaffMember,
  isLyingLow,
  jailDuration,
  payrollDue,
  runnerAt,
  type StaffMember,
  type StaffRole,
  setStatus,
  talkChance,
} from './index';

function quietGame(): Simulation {
  const sim = createTestGame();
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

function arrest(sim: Simulation, staffId: string, veedelId = 'altstadt-sued'): void {
  sim.ctx('police').emit('police.arrest', { staffId, veedelId });
  sim.step();
}

function runnerAtNeumarkt(sim: Simulation): StaffMember {
  sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
  return runnerAt(sim.state, 'neumarkt') as StaffMember;
}

describe('Haft', () => {
  it('Festnahme: Haft-Status mit Dauer, Spot wird frei, Inhaftierte arbeiten nicht', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const runner = runnerAtNeumarkt(sim);
    arrest(sim, runner.id);
    const jailed = getStaffMember(sim.state, runner.id) as StaffMember;
    expect(jailed.status).toBe('jailed');
    expect(jailed.statusUntil).toBe(sim.state.time + JAIL_DURATION);
    expect(jailed.record.arrests).toBe(1);
    // Der Spot ist frei, der Läufer gilt aber weiter als Läufer des Spots (runnerAt: egal welcher Status).
    expect(activeRunnerAt(sim.state, 'neumarkt')).toBeUndefined();
    expect(runnerAt(sim.state, 'neumarkt')?.status).toBe('jailed');
    expect(getStaff(sim.state, { status: 'jailed' })).toHaveLength(1);
    expect(eventsOfType(events, 'staff.statusChanged').at(-1)?.payload).toEqual({
      staffId: runner.id,
      from: 'active',
      to: 'jailed',
    });
    sim.state.modules.customers.waiting.push({
      id: 999,
      spotId: 'neumarkt',
      productId: 'weed',
      amount: 1,
      pricePerUnit: 10,
      arrivedAt: sim.state.time,
      expiresAt: sim.state.time + 100,
    });
    sim.advance(5);
    expect(sim.state.modules.customers.waiting).toHaveLength(1);
  });

  it('nach abgesessener Haft wieder frei und zurück am alten Spot', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    arrest(sim, runner.id);
    sim.advance(JAIL_DURATION);
    const free = getStaffMember(sim.state, runner.id) as StaffMember;
    expect(free.status).toBe('active');
    expect(free.statusUntil).toBeNull();
    expect(runnerAt(sim.state, 'neumarkt')?.id).toBe(runner.id);
    expect(free.career.map((c) => c.text)).toContain('Aus der Haft entlassen.');
  });

  it('ist der Spot inzwischen besetzt, kommt die Person ohne Einsatz zurück', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    arrest(sim, runner.id);
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } }).ok).toBe(true);
    expect(runnerAt(sim.state, 'neumarkt')?.status).toBe('active');
    sim.advance(JAIL_DURATION);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
  });

  it('Verletzung heilt von selbst', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    // So nutzen die Konfrontationen (Auftrag 11) die Schnittstelle.
    expect(setStatus(sim.ctx('encounters'), runner.id, 'injured')).toBe(true);
    expect(getStaffMember(sim.state, runner.id)?.status).toBe('injured');
    expect(activeRunnerAt(sim.state, 'neumarkt')).toBeUndefined();
    sim.advance(2 * 1440);
    expect(getStaffMember(sim.state, runner.id)?.status).toBe('active');
    expect(runnerAt(sim.state, 'neumarkt')?.id).toBe(runner.id);
  });

  it('tot ist tot: die Person landet bei den Ehemaligen', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    expect(setStatus(sim.ctx('encounters'), runner.id, 'dead')).toBe(true);
    expect(getStaff(sim.state)).toHaveLength(0);
    expect(getStaff(sim.state, { status: 'dead' }).map((m) => m.id)).toEqual([runner.id]);
  });
});

describe('Kaution', () => {
  it('holt sofort raus, kostet Geld und bringt Loyalität', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const runner = runnerAtNeumarkt(sim);
    runner.stats.loyalty = 50;
    arrest(sim, runner.id);
    const cost = bailCost(sim.state, runner.id);
    expect(cost).toBe(BAIL_BASE);
    const money = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'staff.bail', payload: { staffId: runner.id } })).toEqual({ ok: true, data: { cost } });
    expect(sim.state.wallet.dirty).toBe(money - cost);
    const out = getStaffMember(sim.state, runner.id) as StaffMember;
    expect(out.status).toBe('active');
    expect(out.stats.loyalty).toBe(50 + LOYALTY.arrest + LOYALTY.bailed);
    expect(runnerAt(sim.state, 'neumarkt')?.id).toBe(runner.id);
    expect(eventsOfType(events, 'staff.bailed')[0].payload).toEqual({ staffId: runner.id, cost });
  });

  it('geht nur für Leute in Haft und mit genug Geld', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    expect(sim.dispatch({ type: 'staff.bail', payload: { staffId: runner.id } }).ok).toBe(false);
    arrest(sim, runner.id);
    sim.state.wallet.dirty = 10;
    const result = sim.dispatch({ type: 'staff.bail', payload: { staffId: runner.id } });
    expect(result.ok).toBe(false);
    expect(getStaffMember(sim.state, runner.id)?.status).toBe('jailed');
  });

  it('ein Anwalt macht die Kaution billiger und die Haft kürzer', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    const withoutLawyer = jailDuration(sim.state);
    arrest(sim, runner.id);
    const expensive = bailCost(sim.state, runner.id);
    const lawyer = recruit(sim, 'lawyer');
    lawyer.stats.charisma = 50;
    lawyer.stats.caution = 50;
    expect(bonus(sim.state, 'bailDiscount')).toBe(0.2);
    expect(bonus(sim.state, 'jailReduction')).toBe(0.25);
    expect(bailCost(sim.state, runner.id)).toBe(Math.round((expensive * 0.8) / 10) * 10);
    expect(jailDuration(sim.state)).toBe(Math.round(withoutLawyer * 0.75));
    // Ein Anwalt in Haft hilft niemandem.
    arrest(sim, lawyer.id);
    expect(bonus(sim.state, 'bailDiscount')).toBe(0);
  });

  it('Buchhalter und Polizei-Kontakt geben ihre Boni, bessere Spezialisten mehr', () => {
    const sim = quietGame();
    expect(bonus(sim.state, 'launderingFeeDiscount')).toBe(0);
    expect(bonus(sim.state, 'raidWarning')).toBe(0);
    const accountant = recruit(sim, 'accountant');
    accountant.stats.caution = 50;
    const contact = recruit(sim, 'policeContact');
    contact.stats.charisma = 50;
    expect(bonus(sim.state, 'launderingFeeDiscount')).toBe(0.2);
    expect(bonus(sim.state, 'raidWarning')).toBe(0.5);
    accountant.level = 5;
    expect(bonus(sim.state, 'launderingFeeDiscount')).toBeGreaterThan(0.3);
  });

  it('der Polizei-Kontakt warnt vor einer geplanten Razzia, abtauchen lässt sie ins Leere laufen', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const runner = runnerAtNeumarkt(sim);
    const contact = recruit(sim, 'policeContact');
    contact.stats.charisma = 100; // Warnung fast sicher
    contact.level = 10;
    const at = sim.state.time + 180;
    sim.ctx('police').emit('police.raidPlanned', { veedelId: 'altstadt-sued', at });
    sim.step();
    const warnings = eventsOfType(events, 'staff.raidWarning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].payload).toMatchObject({ veedelId: 'altstadt-sued', staffId: contact.id, at });
    const message = sim.state.messages.list.find((m) => m.contactId === `staff:${contact.id}`);
    expect(sim.state.messages.contacts[`staff:${contact.id}`].kind).toBe('police');
    expect(message?.options?.map((o) => o.id)).toEqual(['lieLow', 'ignore']);

    // Antwort "Leute abziehen": Der Läufer verlässt den Spot und kommt nach der Razzia zurück.
    const answer = sim.dispatch({
      type: 'messages.answer',
      payload: { messageId: message?.id ?? 0, optionId: 'lieLow' },
    });
    expect(answer.ok).toBe(true);
    expect(isLyingLow(sim.state, 'altstadt-sued')).toBe(true);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
    expect(eventsOfType(events, 'staff.wentUnderground')[0].payload).toMatchObject({
      veedelId: 'altstadt-sued',
      pulled: 1,
    });

    sim.state.modules.police.plannedRaids['altstadt-sued'] = { at, scope: 'veedel', spotId: null };
    sim.advance(at - sim.state.time + 60);
    const raid = eventsOfType(events, 'police.raid')[0];
    expect(raid.payload).toMatchObject({ target: 'player', empty: true, arrested: [] });
    sim.advance(120);
    expect(isLyingLow(sim.state, 'altstadt-sued')).toBe(false);
    expect(getStaffMember(sim.state, runner.id)?.assignment).toEqual({ kind: 'spot', targetId: 'neumarkt' });
  });
});

describe('Spielstände aus dem Fundament', () => {
  it('Version 1 wird migriert: Werte bleiben, Neues bekommt Standardwerte', () => {
    const sim = quietGame();
    const v1Member = {
      id: 's5',
      name: 'Kevin K.',
      role: 'runner',
      status: 'active',
      stats: { speed: 50, caution: 50, strength: 50, charisma: 50, loyalty: 50 },
      level: 1,
      xp: 0,
      wage: 80,
      hiredAt: 1080,
      assignment: { kind: 'spot', targetId: 'uni' },
      busyUntil: 1080,
      portrait: null,
    };
    const state = structuredClone(sim.state) as GameState;
    const modules = state.modules as unknown as Record<string, unknown>;
    modules.staff = {
      members: [
        v1Member,
        { ...v1Member, id: 's6', status: 'jailed', assignment: { kind: 'spot', targetId: 'neumarkt' } },
      ],
    };
    state.moduleVersions.staff = 1;
    const file = parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    const [a, b] = getStaff(loaded.state);
    expect(a).toMatchObject({ id: 's5', knownStats: expect.any(Array), demand: 1, statusUntil: null });
    expect(a.assignment).toEqual({ kind: 'spot', targetId: 'uni' });
    expect(b).toMatchObject({ status: 'jailed', assignment: null, returnTo: { kind: 'spot', targetId: 'neumarkt' } });
    expect(b.statusUntil).toBeGreaterThan(loaded.state.time);
    expect(loaded.state.modules.staff.former).toEqual([]);
    loaded.advance(60);
  });
});

describe('Löhne bei Ausfall (Auftrag 24)', () => {
  const midnight = (sim: Simulation) => sim.advance(1440 - (sim.state.time % 1440));

  it('in Haft nur Stillhaltegeld, verletzt halber Lohn, jeweils mit eigener Kategorie', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const jailed = recruit(sim, 'runner', { wage: 100 });
    const injured = recruit(sim, 'runner', { wage: 100 });
    const working = recruit(sim, 'runner', { wage: 100 });
    arrest(sim, jailed.id);
    setStatus(sim.ctx('staff'), injured.id, 'injured');
    expect(payrollDue(sim.state)).toBe(
      Math.round(100 * JAIL_WAGE_FACTOR) + Math.round(100 * INJURED_WAGE_FACTOR) + 100,
    );
    midnight(sim);
    const wages = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.category?.startsWith('wages.'));
    const byStaff = Object.fromEntries(wages.map((e) => [e.payload.staffId, e.payload]));
    expect(byStaff[jailed.id]).toMatchObject({ amount: -25, category: 'wages.jail' });
    expect(byStaff[injured.id]).toMatchObject({ amount: -50, category: 'wages.injured' });
    expect(byStaff[working.id]).toMatchObject({ amount: -100, category: 'wages.runner' });
  });

  it('ohne Stillhaltegeld kostet die Haft nichts, aber die Loyalität sinkt schneller', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const a = recruit(sim, 'runner', { wage: 100 });
    const b = recruit(sim, 'runner', { wage: 100 });
    arrest(sim, a.id);
    arrest(sim, b.id);
    expect(sim.dispatch({ type: 'staff.setJailSupport', payload: { staffId: b.id, enabled: false } }).ok).toBe(true);
    const before = { a: a.stats.loyalty, b: b.stats.loyalty };
    midnight(sim);
    const paid = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.staffId === b.id);
    expect(paid).toEqual([]);
    expect(before.b - b.stats.loyalty).toBeGreaterThan(before.a - a.stats.loyalty);
    expect(LOYALTY.jailDayUnsupported).toBeLessThan(LOYALTY.jailDay);
    // Wer ohne Stillhaltegeld sitzt und wenig loyal ist, redet beim Entlassen eher.
    b.stats.loyalty = 50;
    expect(talkChance(b)).toBeGreaterThan(talkChance({ ...b, jailSupport: true }));
  });

  it('Festnahme: Nachricht mit Kaution, Ersetzen, Entlassen und Abwarten; Ersetzen stellt jemand Neues hin', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 5000;
    const runner = runnerAtNeumarkt(sim);
    arrest(sim, runner.id);
    const message = sim.state.messages.list.find((m) => m.contactId === `staff:${runner.id}`);
    expect(message?.options?.map((o) => o.id)).toEqual(['replace', 'bail', 'fireReplace', 'wait']);
    expect(message?.text).toContain('Was machen wir?');
    const answer = sim.dispatch({
      type: 'messages.answer',
      payload: { messageId: message?.id ?? 0, optionId: 'replace' },
    });
    expect(answer.ok).toBe(true);
    const replacement = activeRunnerAt(sim.state, 'neumarkt');
    expect(replacement && replacement.id !== runner.id).toBe(true);
    // Nach der Haft kommt Murat in den freien Pool, der Spot bleibt beim Neuen.
    sim.advance(JAIL_DURATION + 10);
    expect(getStaffMember(sim.state, runner.id)).toMatchObject({ status: 'active', assignment: null });
    expect(activeRunnerAt(sim.state, 'neumarkt')?.id).toBe(replacement?.id);
    expect(getStaff(sim.state, { spotId: 'neumarkt', role: 'runner' })).toHaveLength(1);
  });

  it('Entlassen und ersetzen: die Person ist weg, ein freier Läufer springt ein', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    const free = recruit(sim, 'runner');
    arrest(sim, runner.id);
    expect(sim.dispatch({ type: 'staff.replace', payload: { staffId: runner.id, fire: true } }).ok).toBe(true);
    expect(getStaff(sim.state).some((m) => m.id === runner.id)).toBe(false);
    expect(activeRunnerAt(sim.state, 'neumarkt')?.id).toBe(free.id);
    // Wer nicht ausfällt, wird nicht ersetzt.
    expect(sim.dispatch({ type: 'staff.replace', payload: { staffId: free.id } }).ok).toBe(false);
  });

  it('Version 3 wird migriert: alle bekommen Stillhaltegeld', () => {
    const sim = quietGame();
    const runner = runnerAtNeumarkt(sim);
    const state = structuredClone(sim.state) as GameState;
    for (const m of state.modules.staff.members) delete (m as Partial<StaffMember>).jailSupport;
    state.moduleVersions.staff = 3;
    const loaded = loadSimulation(state, sim.modules);
    expect(getStaffMember(loaded.state, runner.id)?.jailSupport).toBe(true);
    loaded.advance(60);
  });
});
