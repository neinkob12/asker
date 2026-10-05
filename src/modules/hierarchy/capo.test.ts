// Auftrag 34, Etappe 4: Capo und Rat im Tagesbericht.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getAllSpots, getSpots, spotCity } from '../spots';
import { activeRunnerAt, enlist, generateProfile, getStaffMember, type StaffMember } from '../staff';
import { neighborsOf } from '../veedel';
import { CAPO_DEMAND_FACTOR, LIEUTENANT_DEMAND_BY_SPOTS, RIGHT_HAND_DEMAND } from './config';
import {
  absenceHandled,
  canBeCapo,
  capoCandidates,
  capoOf,
  getCapos,
  isCapo,
  REPORT_TIPS,
  reportTipFor,
} from './index';

function game(): Simulation {
  const sim = createTestGame();
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.spots.unlocked = getAllSpots(sim.state)
    .filter((s) => spotCity(s) === 'koeln')
    .map((s) => s.id);
  return sim;
}

function recruit(sim: Simulation, level: number): StaffMember {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
  m.stats.loyalty = 70;
  return m;
}

function appoint(sim: Simulation, m: StaffMember, spotIds: string[]) {
  const result = sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds } });
  if (!result.ok) throw new Error(result.reason);
}

/** Ein Veedel mit Nachbarn: drei Spots für den Capo (Veedel und Nachbar), je ein Spot für Leutnants nebenan. */
function district(sim: Simulation) {
  const spots = getSpots(sim.state, 'koeln');
  const byVeedel = (v: string) => spots.filter((s) => s.veedelId === v).map((s) => s.id);
  const center = spots
    .map((s) => s.veedelId)
    .find((v) => byVeedel(v).length >= 2 && neighborsOf(v).filter((n) => byVeedel(n).length >= 2).length >= 2);
  if (!center) throw new Error('kein passendes Veedel');
  const [n1, n2] = neighborsOf(center).filter((n) => byVeedel(n).length >= 2);
  const far = spots.find(
    (s) =>
      s.veedelId !== center &&
      !neighborsOf(center).includes(s.veedelId) &&
      !neighborsOf(n1).includes(s.veedelId) &&
      !neighborsOf(n2).includes(s.veedelId),
  );
  return {
    capoSpots: [...byVeedel(center).slice(0, 2), byVeedel(n1)[0]],
    nearA: [byVeedel(n1)[1]],
    nearB: [byVeedel(n2)[0]],
    far: far ? [far.id] : [],
  };
}

describe('Capo', () => {
  it('Leutnant ab Level 5 mit drei Spots führt bis zu drei Leutnants in seinem Bezirk, Lohnanspruch doppelt', () => {
    const sim = game();
    const d = district(sim);
    const capo = recruit(sim, 5);
    const a = recruit(sim, 3);
    const b = recruit(sim, 3);
    appoint(sim, capo, d.capoSpots.slice(0, 2));
    expect(canBeCapo(sim.state, capo.id).ok).toBe(false);
    appoint(sim, capo, d.capoSpots);
    appoint(sim, a, d.nearA);
    appoint(sim, b, d.nearB);
    expect(canBeCapo(sim.state, capo.id).ok).toBe(true);
    expect(capoCandidates(sim.state, capo.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const wage = getStaffMember(sim.state, capo.id)?.wage ?? 0;
    const result = sim.dispatch({
      type: 'hierarchy.appointCapo',
      payload: { staffId: capo.id, lieutenantIds: [a.id, b.id] },
    });
    expect(result.ok).toBe(true);
    expect(isCapo(sim.state, capo.id)).toBe(true);
    expect(capoOf(sim.state, a.id)).toBe(capo.id);
    expect(getCapos(sim.state, 'koeln').map((c) => c.staffId)).toEqual([capo.id]);
    expect(getStaffMember(sim.state, capo.id)?.demand).toBe(LIEUTENANT_DEMAND_BY_SPOTS[3] * CAPO_DEMAND_FACTOR);
    expect(getStaffMember(sim.state, capo.id)?.wage).toBeGreaterThan(wage);
    // Ein Tag später bleibt der Anspruch (der Leutnant-Abgleich überschreibt ihn nicht).
    sim.advance(1440);
    expect(getStaffMember(sim.state, capo.id)?.demand).toBe(LIEUTENANT_DEMAND_BY_SPOTS[3] * CAPO_DEMAND_FACTOR);
  });

  it('Leutnants außerhalb des Bezirks und mehr als drei gehen nicht', () => {
    const sim = game();
    const d = district(sim);
    const capo = recruit(sim, 6);
    appoint(sim, capo, d.capoSpots);
    const out = recruit(sim, 3);
    if (d.far.length === 0) return;
    appoint(sim, out, d.far);
    const result = sim.dispatch({
      type: 'hierarchy.appointCapo',
      payload: { staffId: capo.id, lieutenantIds: [out.id] },
    });
    expect(result.ok).toBe(false);
  });

  it('fällt ein Leutnant aus, springt der Capo ein und stellt jemanden an den leeren Spot', () => {
    const sim = game();
    const d = district(sim);
    const capo = recruit(sim, 5);
    const a = recruit(sim, 3);
    appoint(sim, capo, d.capoSpots);
    appoint(sim, a, d.nearA);
    expect(
      sim.dispatch({ type: 'hierarchy.appointCapo', payload: { staffId: capo.id, lieutenantIds: [a.id] } }).ok,
    ).toBe(true);
    // Alle Spots besetzt, dann fällt der Leutnant aus und sein Läufer geht.
    for (let i = 0; i < 4; i++) recruit(sim, 1);
    sim.advance(90);
    const lt = getStaffMember(sim.state, a.id);
    if (lt) lt.status = 'jailed';
    const runner = activeRunnerAt(sim.state, d.nearA[0]);
    if (runner) runner.assignment = null;
    expect(activeRunnerAt(sim.state, d.nearA[0])).toBeUndefined();
    sim.advance(90);
    expect(activeRunnerAt(sim.state, d.nearA[0])).toBeDefined();
    expect(sim.state.modules.hierarchy.capos[capo.id].standIns).toBeGreaterThan(0);
  });

  it('abberufen: bleibt Leutnant; als Leutnant abberufen: auch kein Capo mehr', () => {
    const sim = game();
    const d = district(sim);
    const capo = recruit(sim, 5);
    appoint(sim, capo, d.capoSpots);
    sim.dispatch({ type: 'hierarchy.appointCapo', payload: { staffId: capo.id, lieutenantIds: [] } });
    expect(sim.dispatch({ type: 'hierarchy.dismissCapo', payload: { staffId: capo.id } }).ok).toBe(true);
    expect(isCapo(sim.state, capo.id)).toBe(false);
    expect(getStaffMember(sim.state, capo.id)?.demand).toBe(LIEUTENANT_DEMAND_BY_SPOTS[3]);
    sim.dispatch({ type: 'hierarchy.appointCapo', payload: { staffId: capo.id, lieutenantIds: [] } });
    sim.dispatch({ type: 'hierarchy.dismiss', payload: { staffId: capo.id } });
    expect(isCapo(sim.state, capo.id)).toBe(false);
  });

  it('Version 6 → 7: noch keine Capos', () => {
    const sim = game();
    const raw = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { hierarchy: Record<string, unknown> };
    };
    raw.moduleVersions.hierarchy = 6;
    delete raw.modules.hierarchy.capos;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.hierarchy.capos).toEqual({});
  });
});

describe('Rat im Tagesbericht', () => {
  it('jede Regel hat Varianten, alle Platzhalter werden ersetzt', () => {
    expect(REPORT_TIPS.length).toBeGreaterThanOrEqual(5);
    for (const tip of REPORT_TIPS) expect(tip.texts.length, tip.id).toBeGreaterThanOrEqual(3);
  });

  it('Engpass im Lager und Gang-Druck kommen aus den Daten, Capo ab acht Leutnants', () => {
    const sim = game();
    sim.state.modules.goods.usage = { ...(sim.state.modules.goods.usage ?? {}) } as never;
    const g = sim.state.modules.gangs.gangs.nord;
    g.stage = 2;
    g.hostility = 60;
    expect(reportTipFor(sim.state, 'koeln')?.tip.id).toBe('gangPressure');
    const spots = getSpots(sim.state, 'koeln');
    const capo = recruit(sim, 5);
    appoint(
      sim,
      capo,
      spots.slice(0, 3).map((s) => s.id),
    );
    for (let i = 0; i < 7; i++) appoint(sim, recruit(sim, 2), [spots[3 + i].id]);
    expect(reportTipFor(sim.state, 'koeln')?.tip.id).toBe('capo');
  });

  it('der Tagesbericht trägt den Rat', () => {
    const sim = game();
    const spots = getSpots(sim.state, 'koeln');
    const a = recruit(sim, 4);
    const b = recruit(sim, 4);
    const rh = recruit(sim, 5);
    appoint(sim, a, [spots[0].id]);
    appoint(sim, b, [spots[1].id]);
    sim.state.modules.gangs.gangs.nord.stage = 2;
    sim.state.modules.gangs.gangs.nord.hostility = 60;
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: rh.id } }).ok).toBe(true);
    sim.advance(1440 * 2);
    const report = sim.state.modules.hierarchy.rightHands.koeln?.lastReport;
    expect(report?.tip ?? '').toMatch(/^Mein Rat:/);
  });
});

describe('Review: Capo und Rechte Hand', () => {
  it('ein Capo, der Rechte Hand wird, behält ihren Lohnanspruch über Mitternacht', () => {
    const sim = game();
    const d = district(sim);
    const capo = recruit(sim, 6);
    const a = recruit(sim, 4);
    appoint(sim, capo, d.capoSpots);
    appoint(sim, a, d.nearA);
    const b = recruit(sim, 4);
    appoint(sim, b, d.nearB);
    sim.dispatch({ type: 'hierarchy.appointCapo', payload: { staffId: capo.id, lieutenantIds: [a.id, b.id] } });
    const m = getStaffMember(sim.state, capo.id);
    if (m) m.stats.loyalty = 80;
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: capo.id } }).ok).toBe(true);
    expect(isCapo(sim.state, capo.id)).toBe(false);
    expect(capoOf(sim.state, a.id)).toBeNull();
    sim.advance(1440);
    expect(getStaffMember(sim.state, capo.id)?.demand).toBe(RIGHT_HAND_DEMAND);
  });

  it('wird ein Leutnant unter einem Capo festgenommen, fragt das Handy (der Capo regelt nur sein Team)', () => {
    const sim = game();
    const d = district(sim);
    const capo = recruit(sim, 6);
    const a = recruit(sim, 4);
    appoint(sim, capo, d.capoSpots);
    appoint(sim, a, d.nearA);
    sim.dispatch({ type: 'hierarchy.appointCapo', payload: { staffId: capo.id, lieutenantIds: [a.id] } });
    const lt = getStaffMember(sim.state, a.id);
    if (lt) lt.status = 'jailed';
    expect(absenceHandled(sim.state, a.id)).toBe(false);
  });

  it('der Rat „Leute ohne Einsatz“ zählt in der Stadt des Berichts', () => {
    const sim = game();
    for (let i = 0; i < 4; i++) recruit(sim, 1);
    expect(reportTipFor(sim.state, 'koeln')?.tip.id).toBe('idle');
    expect(reportTipFor(sim.state, 'hamburg')?.tip.id).not.toBe('idle');
  });
});
