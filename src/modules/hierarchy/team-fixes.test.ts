// Fehler aus der Handy-Prüfung bei Leutnants, Rechter Hand und Ausfällen: Teams, Zuständigkeit bei Ausfällen,
// Abtauchen, Entlassen und Einstellen.

import { describe, expect, it } from 'vitest';
import { messages, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { addHeat } from '../police';
import { getSpot } from '../spots';
import {
  enlist,
  freeStaff,
  generateProfile,
  getStaffMember,
  type StaffMember,
  type StaffRole,
  setStatus,
} from '../staff';
import { getSuppliers } from '../suppliers';
import { RIGHT_HAND_RANK_XP } from './config';
import {
  canBeLieutenant,
  getPost,
  getRightHand,
  isLieutenant,
  isVeedelHidden,
  taskIdleReason,
  teamLeadOf,
  teamOf,
} from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
  sim.state.modules.customers.directOrders = false;
  sim.state.wallet.dirty = 40000;
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 1, loyalty = 80): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = loyalty;
  member.stats.caution = 90;
  return member;
}

/** Festnehmen: Der Statuswechsel wird mit dem nächsten Schritt zugestellt (dann reagieren die anderen Module). */
function jail(sim: Simulation, id: string): void {
  setStatus(sim.ctx('staff'), id, 'jailed');
  sim.advance(1);
}

/** Festnahme melden wie die Polizei: staff legt den Ausfall an und fragt dich. */
function arrest(sim: Simulation, staffId: string, veedelId: string): void {
  sim.ctx('police').emit('police.arrest', { staffId, veedelId });
  sim.advance(1);
}

/** Zwei Leutnants (A: uni, B: neumarkt) mit allen Rechten, damit eine Rechte Hand ernannt werden darf. */
function twoLieutenants(sim: Simulation): [StaffMember, StaffMember] {
  const a = recruit(sim, 'runner', 2);
  const b = recruit(sim, 'runner', 2);
  expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } }).ok).toBe(true);
  expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } }).ok).toBe(true);
  return [a, b];
}

describe('Teams: Wer selbst führt, gehört zu keinem Team', () => {
  it('ein Leutnant entlässt seine eigene Rechte Hand nicht, auch wenn er sie angeheuert hat', () => {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    const x = recruit(sim, 'runner', 4);
    getPost(sim.state, a.id)?.team.push(x.id);
    expect(teamOf(sim.state, a.id).map((m) => m.id)).toContain(x.id);
    // Auftrag 46e: Die Rechte Hand kommt aus den Leutnants; der Leutnant A hat sie trotzdem noch im Team stehen.
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: x.id, spotIds: ['ebertplatz'] } });
    getPost(sim.state, a.id)?.team.push(x.id);
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: x.id } }).ok).toBe(true);
    expect(getPost(sim.state, a.id)?.team).not.toContain(x.id);
    expect(teamOf(sim.state, a.id).map((m) => m.id)).not.toContain(x.id);
    expect(teamLeadOf(sim.state, x.id)).toBeNull();
    // Sie sitzt tagelang in Haft: Der alte Chef darf sie weder ersetzen noch entlassen.
    jail(sim, x.id);
    sim.advance(5 * 24 * 60);
    expect(getRightHand(sim.state)?.staffId).toBe(x.id);
    expect(getStaffMember(sim.state, x.id)?.leftAt).toBeNull();
  });

  it('wer befördert wird, verlässt das Team des alten Leutnants samt seiner Ausfall-Einträge', () => {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    const x = recruit(sim, 'runner', 2);
    const post = getPost(sim.state, a.id);
    post?.team.push(x.id);
    if (post) post.absences[x.id] = { since: sim.state.time, replaced: false };
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: x.id, spotIds: ['zuelpicher'] } }).ok).toBe(
      true,
    );
    expect(isLieutenant(sim.state, x.id)).toBe(true);
    expect(getPost(sim.state, a.id)?.team).not.toContain(x.id);
    expect(getPost(sim.state, a.id)?.absences[x.id]).toBeUndefined();
  });

  it('wer zurück ist, hat keinen alten Ausfall-Eintrag mehr, auch nicht nach dem Ersetzen', () => {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const runner = sim.state.modules.staff.members.find((m) => m.assignment?.targetId === 'uni' && m.role === 'runner');
    if (!runner) throw new Error('kein Läufer');
    jail(sim, runner.id);
    const post = getPost(sim.state, a.id);
    expect(post?.absences[runner.id]).toBeDefined();
    // Nach dem Ersetzen ist die Person keinem Spot mehr zugeordnet: Der Leutnant findet sie nicht mehr über den Spot.
    expect(sim.dispatch({ type: 'staff.replace', payload: { staffId: runner.id } }).ok).toBe(true);
    setStatus(sim.ctx('staff'), runner.id, 'active');
    sim.advance(1);
    expect(post?.absences[runner.id]).toBeUndefined();
  });
});

describe('Rechte Hand und Leutnant zugleich geht nicht', () => {
  it('auf einer Lieferfahrt (Einsatz delivery) lässt sie sich nicht zum Leutnant ernennen oder versetzen', () => {
    const sim = quietGame();
    twoLieutenants(sim);
    const boss = recruit(sim, 'runner', 4);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
    const m = getStaffMember(sim.state, boss.id);
    if (!m) throw new Error('weg');
    m.assignment = { kind: 'delivery', targetId: '1' };
    m.returnTo = { kind: 'office', targetId: 'rightHand' };
    expect(canBeLieutenant(sim.state, boss.id).ok).toBe(false);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['zuelpicher'] } }).ok).toBe(
      false,
    );
    // Abziehen und Versetzen sind unterwegs gesperrt.
    expect(sim.dispatch({ type: 'staff.assign', payload: { staffId: boss.id, assignment: null } }).ok).toBe(false);
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: boss.id, assignment: { kind: 'spot', targetId: 'zuelpicher' } },
      }).ok,
    ).toBe(false);
  });
});

describe('Ausfälle: Wer fragt dich, wenn niemand handelt?', () => {
  /** Leutnant mit zwei Spots, ein Läufer am Spot sitzt in Haft; die Rechte Hand hat "Ausfälle" an. */
  function jailedRunner(onAbsent: 'wait' | 'replace') {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    sim.dispatch({ type: 'hierarchy.configure', payload: { staffId: a.id, settings: { onAbsent } } });
    const boss = recruit(sim, 'runner', 4);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { absences: true } } });
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const runner = sim.state.modules.staff.members.find((m) => m.assignment?.targetId === 'uni' && m.role === 'runner');
    if (!runner) throw new Error('kein Läufer');
    return { sim, a, boss, runner };
  }

  const askedAbout = (sim: Simulation, a: StaffMember) =>
    messages
      .thread(sim.state, `staff:${a.id}`)
      .some((m) => m.options?.some((o) => o.id === 'bail') && m.text.includes('sitzt'));

  it('ein Leutnant mit "Abwarten" fragt dich, und die Rechte Hand ersetzt nicht hinter seinem Rücken', () => {
    const { sim, a, runner } = jailedRunner('wait');
    arrest(sim, runner.id, getSpot(sim.state, 'uni')?.veedelId ?? '');
    expect(askedAbout(sim, a)).toBe(true);
    sim.advance(3 * 60);
    // Der Platz bleibt frei, niemand steht dort.
    expect(
      sim.state.modules.staff.members.filter((m) => m.assignment?.targetId === 'uni' && m.status === 'active'),
    ).toHaveLength(0);
  });

  it('ohne Anwalt fragt dich das Handy, wenn ein Leutnant in Haft kommt (die Rechte Hand kann nichts tun)', () => {
    const { sim, a } = jailedRunner('replace');
    arrest(sim, a.id, getSpot(sim.state, 'uni')?.veedelId ?? '');
    const thread = messages.thread(sim.state, `staff:${a.id}`);
    expect(thread.some((m) => m.options?.some((o) => o.id === 'bail'))).toBe(true);
  });

  it('einen Läufer am Spot ersetzt die Rechte Hand, dann bleibt das Handy still', () => {
    const { sim, a, runner } = jailedRunner('replace');
    // Der Leutnant ist nicht erreichbar (in Haft), also springt die Rechte Hand ein.
    jail(sim, a.id);
    arrest(sim, runner.id, getSpot(sim.state, 'uni')?.veedelId ?? '');
    expect(askedAbout(sim, a)).toBe(false);
  });
});

describe('Abtauchen: Die Rechte Hand schickt niemanden in ein Veedel, das gerade von der Straße ist', () => {
  it('Koordinieren stellt keinen freien Läufer an einen Spot in einem Veedel, das ein Leutnant wegen Heat geräumt hat', () => {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    const boss = recruit(sim, 'runner', 4);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { coordinate: true, staffing: false, absences: false } },
    });
    const veedelId = getSpot(sim.state, 'uni')?.veedelId ?? '';
    expect(veedelId).not.toBe('');
    const post = getPost(sim.state, a.id);
    if (post) post.lyingLow = [veedelId];
    addHeat(sim.ctx('police'), veedelId, 95);
    expect(isVeedelHidden(sim.state, veedelId)).toBe(true);
    const free = recruit(sim, 'runner', 1);
    sim.advance(70);
    expect(getStaffMember(sim.state, free.id)?.assignment?.targetId).not.toBe('uni');
  });

  it('wer wegen einer Razzia-Warnung abgetaucht ist, steht anderen nicht als "frei" zur Verfügung', () => {
    const sim = quietGame();
    twoLieutenants(sim);
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
    const runner = sim.state.modules.staff.members.find((m) => m.assignment?.targetId === 'zuelpicher');
    if (!runner) throw new Error('kein Läufer');
    sim.dispatch({
      type: 'staff.lieLow',
      payload: { veedelId: getSpot(sim.state, 'zuelpicher')?.veedelId ?? '', until: sim.state.time + 600 },
    });
    expect(getStaffMember(sim.state, runner.id)?.assignment).toBeNull();
    expect(freeStaff(sim.state, 'runner').map((m) => m.id)).not.toContain(runner.id);
  });
});

describe('Entlassen und ersetzen: Wer rausfliegt, redet eher (Heat im Veedel des Spots)', () => {
  it('"Entlassen und ersetzen" bringt Heat, wenn der Entlassene redet (vorher nie, weil das Veedel fehlte)', () => {
    let talked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sim = quietGame(seed);
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
      const runner = sim.state.modules.staff.members.find((m) => m.assignment?.targetId === 'uni');
      if (!runner) throw new Error('kein Läufer');
      runner.stats.loyalty = 0;
      runner.jailSupport = false;
      jail(sim, runner.id);
      expect(sim.dispatch({ type: 'staff.replace', payload: { staffId: runner.id, fire: true } }).ok).toBe(true);
      if (sim.state.journal.some((j) => j.text.includes('sauer über die Entlassung'))) talked++;
    }
    expect(talked).toBeGreaterThan(5);
  });
});

describe('Rechte Hand: Personal und Erfahrung', () => {
  it('"Personal" ersetzt festhängende Ausfälle nicht, wenn das Geld für die Lohnsicherung gebraucht wird', () => {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    const boss = recruit(sim, 'runner', 4);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    const rh = getRightHand(sim.state);
    if (rh) rh.xp = RIGHT_HAND_RANK_XP[2];
    sim.dispatch({ type: 'hierarchy.configure', payload: { staffId: a.id, settings: { mayHire: false } } });
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { staffing: true, coordinate: false, absences: false, payrollGuard: true } },
    });
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    const runner = sim.state.modules.staff.members.find((m) => m.assignment?.targetId === 'uni' && m.role === 'runner');
    if (!runner) throw new Error('kein Läufer');
    jail(sim, runner.id);
    const post = getPost(sim.state, a.id);
    if (post) post.absences[runner.id] = { since: sim.state.time, replaced: false, stuck: true };
    // Das Geld reicht für einen Läufer von der Straße, aber nicht mehr für die Löhne danach.
    sim.state.wallet.dirty = 1000;
    sim.advance(65);
    const standing = sim.state.modules.staff.members.filter(
      (m) => m.assignment?.targetId === 'uni' && m.status === 'active',
    );
    expect(standing).toHaveLength(0);
  });

  it('"Personal" stellt einen freien Läufer selbst an einen leeren Spot, wenn "Koordinieren" aus ist', () => {
    const sim = quietGame();
    twoLieutenants(sim);
    const boss = recruit(sim, 'runner', 4);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    const rh = getRightHand(sim.state);
    if (rh) rh.xp = RIGHT_HAND_RANK_XP[2];
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { staffing: true, coordinate: false, absences: false } },
    });
    const free = recruit(sim, 'runner', 1);
    expect(getStaffMember(sim.state, free.id)?.assignment).toBeNull();
    sim.advance(65);
    expect(getStaffMember(sim.state, free.id)?.assignment?.kind).toBe('spot');
  });

  it('ein großer Verkauf (500 g Großhandel) bringt keinen Level-Sprung mehr', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner', 1);
    const before = m.xp;
    sim.ctx('customers').emit('sale.completed', {
      channel: 'wholesale',
      spotId: null,
      veedelId: 'lindenthal',
      productId: 'weed',
      amount: 500,
      quality: 0.5,
      revenue: 1500,
      sellerId: m.id,
      customerId: null,
    });
    sim.advance(1);
    const gained = (getStaffMember(sim.state, m.id)?.xp ?? 0) - before;
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(40);
  });
});

describe('Rechte Hand: Einstellungen und Rückmeldung', () => {
  function withRightHand() {
    const sim = quietGame();
    twoLieutenants(sim);
    const boss = recruit(sim, 'runner', 4);
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: ['ebertplatz'] } }); // Auftrag 46e: aus den Leutnants
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
    const rh = getRightHand(sim.state);
    if (rh) rh.xp = RIGHT_HAND_RANK_XP[3];
    return sim;
  }

  it('Bestellregeln der Rechten Hand bekommen eindeutige IDs, Fremdfelder bleiben draußen', () => {
    const sim = withRightHand();
    const rule = { id: 'x', productId: 'weed', supplierId: null, packageId: null, minStock: 100, warehouseId: null };
    const result = sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: {
        settings: {
          restockRules: [{ ...rule, paused: null, boom: 'x' } as never, { ...rule, productId: 'hash', paused: 'alt' }],
        },
      },
    });
    expect(result.ok).toBe(true);
    const rules = getRightHand(sim.state)?.settings.restockRules ?? [];
    expect(new Set(rules.map((r) => r.id)).size).toBe(2);
    expect(rules.every((r) => r.paused === null)).toBe(true);
    expect('boom' in (rules[0] as object)).toBe(false);
  });

  it('Leutnant: Prototyp-Schlüssel wie "toString" sind kein gültiges Preisniveau', () => {
    const sim = quietGame();
    const [a] = twoLieutenants(sim);
    const result = sim.dispatch({
      type: 'hierarchy.configure',
      payload: { staffId: a.id, settings: { priceLevel: 'toString' as never } },
    });
    expect(result.ok).toBe(false);
  });

  it('eine eingeschaltete Aufgabe sagt, warum sie nichts tut (z.B. Hafen ohne Fahrer, Nachbestellen ohne Budget)', () => {
    const sim = withRightHand();
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { pickup: true, restock: true, restockBudgetPerDay: 0 } },
    });
    expect(taskIdleReason(sim.state, 'pickup')).toMatch(/Fahrer/);
    expect(taskIdleReason(sim.state, 'restock')).toMatch(/Budget/);
    recruit(sim, 'driver');
    expect(taskIdleReason(sim.state, 'pickup')).toBeNull();
  });
});
