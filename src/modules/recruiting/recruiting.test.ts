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
import { activeChallenge, MINIGAME_KINDS, MINIGAME_TIMEOUT } from '../minigames';
import { enlist, generateProfile, getStaff, getStaffMember, runnerAt, STAT_KEYS, type StaffMember } from '../staff';
import { POOL_START, SEARCH_COST, SEARCH_COUNT } from './config';
import {
  type Candidate,
  getCandidate,
  getCandidates,
  getContacts,
  getPool,
  hiddenStatToReveal,
  interviewOutcome,
  knownTraits,
  poolMax,
  searchPreview,
} from './index';

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
    // Abgelaufene gehen still, ohne Zeile im Journal (Auftrag 43, K10).
    expect(eventsOfType(events, 'recruiting.candidateLeft').length).toBeGreaterThan(0);
    expect(sim.state.journal.some((e) => e.text.includes('anderweitig umgesehen'))).toBe(false);
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
  it('loyale Mitarbeiter empfehlen Leute: selten, aber besser, ohne Chat (Auftrag 46d)', () => {
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
    // Kein Chat dazu: Die Empfehlung steht nur in der Personal-App (Auftrag 46d).
    expect(messages.thread(sim.state, `staff:${referrer.id}`).some((m) => m.options?.length)).toBe(false);
    const result = sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: referral.id } });
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
    // Kein Chat dazu (Auftrag 46d): Der Kumpel steht nur in der Personal-App.
    expect(messages.thread(sim.state, 'customer:r1').some((m) => m.options?.length)).toBe(false);
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
    expect(loaded.state.moduleVersions.recruiting).toBe(6);
  });

  it('Version 3 → 4 (Auftrag 34): Bewerber ohne Eigenschaften bekommen zwei bis drei, bei jedem Laden dieselben', () => {
    const sim = quietGame();
    const state = structuredClone(sim.state) as GameState;
    const candidates = (state.modules.recruiting as { candidates: { id: string; traits?: string[] }[] }).candidates;
    for (const c of candidates) delete c.traits;
    state.moduleVersions.recruiting = 3;
    const load = () =>
      loadSimulation(parseSaveFile(serializeSave(createSaveFile(structuredClone(state), 'alt', 0))).state, sim.modules);
    const one = load();
    const two = load();
    for (const c of getPool(one.state)) {
      expect(c.traits.length).toBeGreaterThanOrEqual(2);
      expect(c.traits.length).toBeLessThanOrEqual(3);
      expect(getCandidate(two.state, c.id)?.traits).toEqual(c.traits);
    }
  });

  it('Version 4 → 5 (Auftrag 43): Bewerber bekommen die aktive Stadt', () => {
    const sim = quietGame();
    const state = structuredClone(sim.state) as GameState;
    const candidates = (state.modules.recruiting as { candidates: { cityId?: string }[] }).candidates;
    for (const c of candidates) delete c.cityId;
    state.moduleVersions.recruiting = 4;
    const loaded = loadSimulation(parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0))).state, sim.modules);
    expect(getPool(loaded.state).length).toBe(candidates.length);
    expect(getPool(loaded.state).every((c) => c.cityId === 'koeln')).toBe(true);
  });
});

describe('Bewerber pro Stadt (Auftrag 43)', () => {
  it('Hamburg hat eigene Bewerber mit Hamburger Lohn; Kölner lassen sich dort nicht einstellen', () => {
    const sim = quietGame();
    sim.state.wallet.dirty = 50_000;
    const koeln = getPool(sim.state).map((c) => c.id);
    expect(koeln.length).toBeGreaterThan(0);
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    sim.advance(1);
    // Nach der Ankunft warten Hamburger, die Kölner bleiben in Köln.
    const hamburg = getPool(sim.state);
    expect(hamburg.length).toBeGreaterThan(0);
    expect(hamburg.every((c) => c.cityId === 'hamburg')).toBe(true);
    expect(getPool(sim.state, 'koeln').map((c) => c.id)).toEqual(expect.arrayContaining(koeln.slice(0, 1)));
    const hire = sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: koeln[0] } });
    expect(hire.ok).toBe(false);
    expect(sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: hamburg[0].id } }).ok).toBe(true);
    expect(sim.state.modules.staff.members.find((m) => m.name === hamburg[0].name)?.cityId).toBe('hamburg');
  });
});

describe('Bewerbungsgespräch (Auftrag 44, Teil 9)', () => {
  function interviewed(sim: Simulation, c: Candidate): number {
    const result = sim.dispatch({ type: 'recruiting.interview', payload: { candidateId: c.id } });
    expect(result.ok).toBe(true);
    const challenge = activeChallenge(sim.state);
    expect(challenge).toMatchObject({ kind: 'interview', origin: { module: 'recruiting', ref: c.id } });
    return challenge?.id ?? -1;
  }

  it('neue Bewerber zeigen keine Eigenschaften, alte Stände (Migration 6) alle', () => {
    const sim = quietGame();
    for (const c of getPool(sim.state)) {
      expect(c.revealedTraits).toEqual([]);
      expect(knownTraits(c)).toEqual([]);
    }
    const state = structuredClone(sim.state) as GameState;
    for (const c of state.modules.recruiting.candidates) delete c.revealedTraits;
    state.moduleVersions.recruiting = 5;
    const loaded = loadSimulation(parseSaveFile(serializeSave(createSaveFile(state, 'alt', 0))).state, sim.modules);
    for (const c of getPool(loaded.state)) {
      expect(c.revealedTraits).toEqual(c.traits);
      expect(knownTraits(c)).toEqual(c.traits);
    }
  });

  it('startet das Minispiel mit den Angaben zur Person, einmal je Bewerber', () => {
    expect(MINIGAME_KINDS.interview.ready).toBe(true);
    const sim = quietGame();
    const c = getPool(sim.state)[0];
    interviewed(sim, c);
    const challenge = activeChallenge(sim.state);
    expect(challenge?.params).toMatchObject({
      candidateId: c.id,
      name: c.name,
      age: c.age,
      traits: c.traits,
      known: [],
    });
    expect(challenge?.difficulty).toBeGreaterThan(0);
    expect(getCandidate(sim.state, c.id)?.interviewed).toBe(true);
    const again = sim.dispatch({ type: 'recruiting.interview', payload: { candidateId: c.id } });
    expect(again.ok).toBe(false);
    expect(sim.dispatch({ type: 'recruiting.interview', payload: { candidateId: 'gibtsnicht' } }).ok).toBe(false);
  });

  it('richtig erkannte Eigenschaften werden sichtbar, falsche nicht; gut gelaufen zeigt einen Wert', () => {
    const sim = quietGame();
    const c = getPool(sim.state)[0];
    const id = interviewed(sim, c);
    const hiddenBefore = visibleKeys(c).length;
    const wrong = (['family', 'drinker', 'gambler', 'loyal', 'nimble'] as const).find((t) => !c.traits.includes(t));
    const picks = [c.traits[0], wrong ?? 'none', 'unsinn'];
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id, score: 2 / 3, picks } }).ok).toBe(true);
    const after = getCandidate(sim.state, c.id) as Candidate;
    expect(knownTraits(after)).toEqual([c.traits[0]]);
    expect(visibleKeys(after).length).toBe(hiddenBefore + 1);
    expect(sim.state.journal.at(-1)?.text).toContain(`Gespräch mit ${c.name}`);
    // Nach der Einstellung ist alles sichtbar wie bisher.
    const hired = sim.dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } });
    if (!hired.ok) throw new Error(hired.reason);
    const m = getStaffMember(sim.state, (hired.data as { staffId: string }).staffId) as StaffMember;
    expect(m.traits).toEqual(c.traits);
    expect(m.knownStats.length).toBe(hiddenBefore + 1);
  });

  it('schlecht gelaufen: nur Eigenschaften, kein Wert; Frist ohne Oberfläche: nichts', () => {
    const sim = quietGame();
    const [a, b] = getPool(sim.state);
    const id = interviewed(sim, a);
    sim.dispatch({ type: 'minigames.finish', payload: { id, score: 1 / 3, picks: [a.traits[0]] } });
    expect(knownTraits(getCandidate(sim.state, a.id) as Candidate)).toEqual([a.traits[0]]);
    expect(visibleKeys(getCandidate(sim.state, a.id) as Candidate)).toEqual(visibleKeys(a));
    interviewed(sim, b);
    sim.advance(MINIGAME_TIMEOUT + 60);
    expect(activeChallenge(sim.state)).toBeUndefined();
    const after = getCandidate(sim.state, b.id) as Candidate;
    expect(knownTraits(after)).toEqual([]);
    expect(visibleKeys(after)).toEqual(visibleKeys(b));
  });

  it('Rechte Hand: geschafft deckt eine Eigenschaft auf, sonst nichts', () => {
    const sim = quietGame();
    const [a, b] = getPool(sim.state);
    const finished = (c: Candidate, won: boolean) =>
      sim.ctx('minigames').emit('minigame.finished', {
        id: 99,
        kind: 'interview',
        origin: { module: 'recruiting', ref: c.id },
        cityId: 'koeln',
        score: won ? 0.7 : 0.25,
        won,
        by: 'rightHand',
        picks: [],
      });
    finished(a, true);
    finished(b, false);
    sim.advance(1);
    expect(knownTraits(getCandidate(sim.state, a.id) as Candidate)).toEqual([a.traits[0]]);
    expect(knownTraits(getCandidate(sim.state, b.id) as Candidate)).toEqual([]);
  });

  it('reine Folge: interviewOutcome und hiddenStatToReveal', () => {
    const sim = quietGame();
    const c = getPool(sim.state)[0];
    const stat = hiddenStatToReveal(c);
    expect(stat && c.visibleStats[stat]).toBeUndefined();
    expect(interviewOutcome(c, { by: 'timeout', won: false, picks: c.traits })).toEqual({ traits: [], stat: null });
    expect(interviewOutcome(c, { by: 'player', won: true, picks: [...c.traits, ...c.traits] })).toEqual({
      traits: c.traits,
      stat,
    });
  });
});
