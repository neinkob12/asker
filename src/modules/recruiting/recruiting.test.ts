import { describe, expect, it } from 'vitest';
import {
  clock,
  createSaveFile,
  type GameState,
  loadSimulation,
  messages,
  parseSaveFile,
  type Simulation,
  serializeSave,
} from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { enlist, generateProfile, getStaff, getStaffMember, runnerAt, STAT_KEYS, type StaffMember } from '../staff';
import { POOL_START, SEARCH_COST, SEARCH_COUNT } from './config';
import { type Candidate, getCandidate, getCandidates, getContacts, getPool, poolMax, searchPreview } from './index';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.dirty = 50000;
  return sim;
}

const visibleKeys = (c: Candidate) => STAT_KEYS.filter((k) => c.visibleStats[k] !== undefined);

describe('recruiting: Bewerber-Pool', () => {
  it('startet mit ein paar Bewerbern, von denen man nur einen Teil der Werte sieht', () => {
    const sim = quietGame();
    const pool = getPool(sim.state);
    expect(pool).toHaveLength(POOL_START);
    for (const c of pool) {
      expect(visibleKeys(c)).toHaveLength(2);
      expect(c.visibleStats.loyalty).toBeUndefined();
      for (const k of visibleKeys(c)) expect(c.visibleStats[k]).toBe(c.stats[k]);
      expect(c.hireCost).toBeGreaterThan(0);
      expect(c.expiresAt).toBeGreaterThan(sim.state.time);
    }
  });

  it('in regelmäßigen Abständen kommen neue, alte verschwinden', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const first = getPool(sim.state).map((c) => c.id);
    sim.advance(3 * 1440);
    const arrived = eventsOfType(events, 'recruiting.candidateArrived').filter((e) => e.payload.source === 'pool');
    expect(arrived.length).toBeGreaterThanOrEqual(4);
    expect(getPool(sim.state).length).toBeLessThanOrEqual(poolMax(sim.state));
    // Abgelaufene gehen mit einer stillen Notiz.
    expect(eventsOfType(events, 'recruiting.candidateLeft').length).toBeGreaterThan(0);
    expect(sim.state.journal.some((e) => e.text.includes('anderweitig umgesehen'))).toBe(true);
    expect(getPool(sim.state).some((c) => first.includes(c.id))).toBe(false);
    // Die Bewerber sind unterschiedlich.
    const stats = new Set(getCandidates(sim.state).map((c) => JSON.stringify(c.stats)));
    expect(stats.size).toBe(getCandidates(sim.state).length);
  });

  it('einstellen: Handgeld zahlen, bekannte Werte übernehmen, der Rest zeigt sich mit der Zeit', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const c = getPool(sim.state)[0];
    const money = sim.state.wallet.dirty;
    const result = sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } });
    expect(result.ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money - c.hireCost);
    expect(getCandidate(sim.state, c.id)).toBeUndefined();
    const staffId = eventsOfType(events, 'recruiting.hired')[0].payload.staffId;
    const m = getStaffMember(sim.state, staffId) as StaffMember;
    expect(m).toMatchObject({ name: c.name, role: c.role, wage: c.wage, age: c.age, origin: 'pool' });
    expect(m.stats).toEqual(c.stats);
    expect(m.knownStats).toEqual(visibleKeys(c));
    sim.advance(10 * 1440);
    expect(getStaffMember(sim.state, staffId)?.knownStats.length).toBeGreaterThan(visibleKeys(c).length);
  });

  it('einstellen und direkt einsetzen, ablehnen, nicht zweimal einstellen', () => {
    const sim = quietGame();
    const runner = getPool(sim.state)[0];
    runner.role = 'runner'; // nur Läufer stehen an Spots
    const hire = sim.dispatch({
      type: 'recruiting.hire',
      payload: { candidateId: runner.id, assignment: { kind: 'spot', targetId: 'uni' } },
    });
    expect(hire.ok).toBe(true);
    expect(runnerAt(sim.state, 'uni')?.name).toBe(runner.name);
    expect(sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: runner.id } }).ok).toBe(false);
    const other = getPool(sim.state)[0];
    expect(sim.dispatch({ type: 'recruiting.decline', payload: { candidateId: other.id } }).ok).toBe(true);
    expect(getCandidate(sim.state, other.id)).toBeUndefined();
  });

  it('ohne Geld kein Handgeld, keine Einstellung', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 0;
    const c = getPool(sim.state)[0];
    expect(sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } }).ok).toBe(false);
    expect(getStaff(sim.state)).toHaveLength(0);
  });

  it('rumfragen kostet Geld und bringt sofort neue Bewerber, aber nicht ständig', () => {
    const sim = quietGame();
    const before = getPool(sim.state).length;
    const money = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'recruiting.search', payload: {} }).ok).toBe(true);
    expect(getPool(sim.state).length).toBe(before + SEARCH_COUNT);
    expect(sim.state.wallet.dirty).toBe(money - SEARCH_COST);
    expect(sim.dispatch({ type: 'recruiting.search', payload: {} }).ok).toBe(false);
    expect(searchPreview(sim.state).waiting).toBe(true);
    sim.advance(12 * 60);
    expect(sim.dispatch({ type: 'recruiting.search', payload: {} }).ok).toBe(true);
  });

  it('rumfragen nach einer Rolle bringt meist Leute in dieser Rolle', () => {
    let drivers = 0;
    let total = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = quietGame(seed);
      const before = new Set(getPool(sim.state).map((c) => c.id));
      expect(sim.dispatch({ type: 'recruiting.search', payload: { role: 'driver' } }).ok).toBe(true);
      const fresh = getPool(sim.state).filter((c) => !before.has(c.id));
      expect(fresh).toHaveLength(SEARCH_COUNT);
      total += fresh.length;
      drivers += fresh.filter((c) => c.role === 'driver').length;
    }
    expect(drivers / total).toBeGreaterThan(0.5);
    const sim = quietGame();
    expect(searchPreview(sim.state, 'security').roleLabel).toMatch(/Sicherheit/);
    expect(poolMax(sim.state)).toBeGreaterThanOrEqual(POOL_START);
  });
});

describe('recruiting: Kontakte', () => {
  it('loyale Mitarbeiter empfehlen Leute: selten, aber besser, mit Nachricht zum Einstellen', () => {
    const sim = quietGame();
    const loyal: StaffMember[] = [];
    for (let i = 0; i < 4; i++) {
      const ctx = sim.ctx('staff');
      const m = enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'pool' });
      m.stats.loyalty = 90;
      m.wage = 200; // bleibt loyal
      loyal.push(m);
    }
    let referral: Candidate | undefined;
    for (let d = 0; d < 40 && !referral; d++) {
      sim.advance(clock.at(clock.day(sim.state.time) + 1) - sim.state.time);
      referral = getContacts(sim.state).find((c) => c.source === 'referral');
    }
    if (!referral) throw new Error('keine Empfehlung in 40 Tagen');
    expect(referral.level).toBeGreaterThanOrEqual(2);
    expect(referral.visibleStats.loyalty).toBeDefined();
    expect(referral.note).toMatch(/Empfohlen von/);
    const referrer = loyal.find((m) => m.id === referral?.referrerId) as StaffMember;
    const msg = messages.thread(sim.state, `staff:${referrer.id}`).find((m) => m.options?.length);
    expect(msg?.text).toContain(referral.name);
    // Über die Nachricht einstellen.
    const result = sim.dispatch({ type: 'messages.answer', payload: { messageId: msg?.id ?? 0, optionId: 'hire' } });
    expect(result.ok).toBe(true);
    expect(getStaff(sim.state).some((m) => m.name === referral?.name && m.origin === 'referral')).toBe(true);
  });

  it('Leute aus dem Milieu und Kumpels von Stammkunden melden sich von selbst', () => {
    const sim = quietGame(3);
    const events = recordEvents(sim);
    sim.state.modules.customers.regulars.push({
      id: 'r1',
      name: 'Olli',
      typeId: 'student',
      spotId: 'uni',
      productId: 'weed',
      amount: 2,
      visits: 3,
      lastPrice: 10,
      lastQuality: 0.6,
      satisfaction: 0.8,
      since: 0,
      nextVisitAt: 1e9,
      status: 'active',
    });
    // Viele Besuche des Stammkunden, damit er irgendwann jemanden kennt.
    for (let i = 0; i < 300; i++) {
      sim.ctx('customers').emit('sale.completed', {
        channel: 'street',
        spotId: 'uni',
        veedelId: 'lindenthal',
        productId: 'weed',
        amount: 1,
        quality: 0.6,
        revenue: 10,
        sellerId: null,
        customerId: null,
        regularId: 'r1',
      });
      sim.step();
      for (const c of getContacts(sim.state)) {
        sim.dispatch({ type: 'recruiting.decline', payload: { candidateId: c.id } });
      }
    }
    for (let d = 0; d < 30; d++) {
      sim.advance(1440);
      for (const c of getContacts(sim.state)) {
        sim.dispatch({ type: 'recruiting.decline', payload: { candidateId: c.id } });
      }
    }
    const sources = new Set(eventsOfType(events, 'recruiting.candidateArrived').map((e) => e.payload.source));
    expect(sources).toContain('regular');
    expect(sources).toContain('event');
    // Der Stammkunde meldet sich unter seinem Kontakt aus dem Kundenmodul.
    expect(messages.thread(sim.state, 'customer:r1').length).toBeGreaterThan(0);
  });
});

describe('recruiting: Fragen im Chat', () => {
  const hireQuestions = (sim: Simulation, candidateId: string) =>
    messages
      .threads(sim.state)
      .flatMap((t) => messages.thread(sim.state, t.contact.id))
      .filter(
        (m) =>
          messages.canAnswer(sim.state, m) &&
          m.options?.some(
            (o) => o.command?.type === 'recruiting.hire' && o.command.payload.candidateId === candidateId,
          ),
      );

  it('Wer über die App eingestellt wird, steht im Chat nicht mehr zur Wahl', () => {
    let checked = false;
    for (let seed = 1; seed <= 20 && !checked; seed++) {
      const sim = quietGame(seed);
      sim.advance(48 * 60);
      const contact = getContacts(sim.state).find((c) => hireQuestions(sim, c.id).length > 0);
      if (!contact) continue;
      expect(sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: contact.id } }).ok).toBe(true);
      expect(hireQuestions(sim, contact.id)).toHaveLength(0);
      checked = true;
    }
    expect(checked).toBe(true);
  });
});

describe('recruiting: Spielstände aus dem Fundament', () => {
  it('Version 1 (leerer Pool) wird migriert und füllt sich danach', () => {
    const sim = quietGame();
    const state = structuredClone(sim.state) as GameState;
    (state.modules as unknown as Record<string, unknown>).recruiting = {
      candidates: [{ id: 'c1', name: 'Alt', role: 'runner', visibleStats: { speed: 70 }, wage: 80, expiresAt: 99999 }],
    };
    state.moduleVersions.recruiting = 1;
    const file = parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    expect(getCandidate(loaded.state, 'c1')).toMatchObject({ source: 'pool', stats: { speed: 70 } });
    loaded.advance(60);
    expect(getPool(loaded.state).length).toBeGreaterThan(1);
  });

  it('Version 2 → 3: Kurier-Bewerber aus alten Spielständen fallen weg, alle anderen bleiben', () => {
    const sim = quietGame();
    const state = structuredClone(sim.state) as GameState;
    const pool = getPool(state);
    const keep = pool[0];
    const courier = { ...keep, id: 'alt-kurier', role: 'courier' };
    (state.modules.recruiting as { candidates: unknown[] }).candidates = [courier, keep];
    state.moduleVersions.recruiting = 2;
    const file = parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0)));
    const loaded = loadSimulation(file.state, sim.modules);
    expect(getCandidate(loaded.state, 'alt-kurier')).toBeUndefined();
    expect(getCandidate(loaded.state, keep.id)).toBeDefined();
    expect(loaded.state.moduleVersions.recruiting).toBe(4);
  });
});
