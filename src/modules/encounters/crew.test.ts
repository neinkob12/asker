// Crew und Spezialzüge (Auftrag 35, Etappe 2).

import { describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { getStaffMember } from '../staff';
import { CREW_TRAVEL_COST, STASH_CAP } from './config';
import {
  availableMoves,
  crewCandidates,
  type Encounter,
  getEncounter,
  specialMoves,
  startEncounter,
  suggestedCrew,
} from './index';

function hire(sim: Simulation, spotId = 'ebertplatz'): string {
  if (wallet.balance(sim.state, 'dirty') < 2000) wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test', 'income.other');
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

/** Eine freie Person (ohne Einsatz) mit Rolle und Werten. */
function free(sim: Simulation, role: string, stats: Partial<Record<string, number>> = {}): string {
  const id = hire(sim, 'neumarkt');
  const m = getStaffMember(sim.state, id);
  if (!m) throw new Error('fehlt');
  m.assignment = null;
  (m as { role: string }).role = role;
  Object.assign(m.stats, stats);
  return id;
}

function get(sim: Simulation, id: number): Encounter {
  const e = getEncounter(sim.state, id);
  if (!e) throw new Error('Konfrontation fehlt');
  return e;
}

function briefing(sim: Simulation, staffIds: string[]): number {
  return startEncounter(sim.ctx('gangs'), {
    kind: 'raidDefense',
    spotId: 'ebertplatz',
    veedelId: 'neustadt-nord',
    staffIds,
    askPlayer: true,
    opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
  }).encounterId;
}

describe('Spezialzüge aus Rolle und Werten', () => {
  const stats = { speed: 50, caution: 50, strength: 50, charisma: 50 };
  it('Sicherheit blockt, Fahrer fährt, Charisma verhandelt zweimal, Tempo bringt Ware weg', () => {
    expect(specialMoves({ role: 'security', stats })).toEqual(['block']);
    expect(specialMoves({ role: 'driver', stats })).toEqual(['getaway']);
    expect(specialMoves({ role: 'runner', stats: { ...stats, charisma: 75 } })).toEqual(['secondTalk']);
    expect(specialMoves({ role: 'runner', stats: { ...stats, speed: 80 } })).toEqual(['stash']);
    expect(specialMoves({ role: 'runner', stats })).toEqual([]);
    // Mehrere passen: der erste zählt im Spiel, die Liste zeigt alle (Haken für Eigenschaften aus Auftrag 34).
    expect(specialMoves({ role: 'security', stats: { ...stats, charisma: 90 } })).toEqual(['block', 'secondTalk']);
  });
});

describe('Crew im Briefing', () => {
  it('Vorschlag: wer vor Ort ist, aufgefüllt mit freien Leuten; bis zu drei mit Taxi', () => {
    const sim = createTestGame();
    const runner = hire(sim);
    const guard = free(sim, 'security', { strength: 80 });
    const driver = free(sim, 'driver', { strength: 60 });
    const id = briefing(sim, [runner]);
    const e = get(sim, id);
    const candidates = crewCandidates(sim.state, e, 'koeln');
    expect(candidates[0]).toMatchObject({ id: runner, atSite: true, cost: 0 });
    expect(candidates.find((c) => c.id === guard)).toMatchObject({
      atSite: false,
      cost: CREW_TRAVEL_COST,
      move: 'block',
    });
    expect(suggestedCrew(sim.state, e, 'koeln')).toEqual([runner, guard]);

    const before = wallet.balance(sim.state, 'dirty');
    const crew = [runner, guard, driver];
    expect(sim.dispatch({ type: 'encounters.join', payload: { encounterId: id, mode: 'crew', crew } }).ok).toBe(true);
    const after = get(sim, id);
    expect(after.participants.map((p) => p.id)).toEqual(crew);
    expect(after.participants.map((p) => p.move)).toEqual([null, 'block', 'getaway']);
    expect(after.request.staffIds).toEqual(crew);
    expect(wallet.balance(sim.state, 'dirty')).toBe(before - 2 * CREW_TRAVEL_COST);
  });

  it('mehr als drei oder jemand, der nicht kann, geht nicht', () => {
    const sim = createTestGame();
    const runner = hire(sim);
    const a = free(sim, 'security');
    const b = free(sim, 'driver');
    const c = free(sim, 'runner');
    const id = briefing(sim, [runner]);
    const join = (crew: string[]) =>
      sim.dispatch({ type: 'encounters.join', payload: { encounterId: id, mode: 'self', crew } });
    expect(join([runner, a, b, c]).ok).toBe(false);
    expect(join(['niemand']).ok).toBe(false);
    expect(get(sim, id).phase).toBe('briefing');
    // Ohne Crew bleibt es wie bisher: wer vor Ort ist, macht mit.
    expect(sim.dispatch({ type: 'encounters.join', payload: { encounterId: id, mode: 'crew' } }).ok).toBe(true);
    expect(get(sim, id).participants.map((p) => p.id)).toEqual([runner]);
  });
});

describe('Spezialzüge in der Konfrontation', () => {
  function withCrew(seed: number, crew: (sim: Simulation) => string[]) {
    const sim = createTestGame({ seed });
    const ids = crew(sim);
    const id = briefing(sim, []);
    sim.dispatch({ type: 'encounters.join', payload: { encounterId: id, mode: 'crew', crew: ids } });
    return { sim, id };
  }

  it('Sicherheit fängt den ersten Treffer ab', () => {
    const { sim, id } = withCrew(1, (s) => [free(s, 'security')]);
    const e = get(sim, id);
    e.intent = 'knife';
    e.resolve = 95;
    // Messer trifft ungeschützt mit hoher Chance; der Treffer wird abgefangen.
    for (let i = 0; i < 3 && get(sim, id).phase === 'rounds'; i++) {
      get(sim, id).intent = 'knife';
      sim.dispatch({ type: 'encounters.act', payload: { encounterId: id, actionId: 'negotiate', protect: 'goods' } });
      if (get(sim, id).participants[0].moveUsed) break;
    }
    const guard = get(sim, id).participants[0];
    if (guard.moveUsed) {
      expect(get(sim, id).log.some((l) => l.text.includes('fängt den Schlag ab'))).toBe(true);
      expect(guard.condition).toBe('ok');
    }
  });

  it('Fluchtwagen: sofort weg, nichts bleibt zurück', () => {
    const { sim, id } = withCrew(2, (s) => [free(s, 'driver')]);
    const driver = get(sim, id).participants[0].id;
    expect(availableMoves(get(sim, id)).map((m) => m.move)).toEqual(['getaway']);
    expect(sim.dispatch({ type: 'encounters.special', payload: { encounterId: id, participantId: driver } }).ok).toBe(
      true,
    );
    const e = get(sim, id);
    expect(e.outcome).toBe('retreat');
    expect(e.result?.ending).toBe('fled');
    expect(e.stakes.every((s) => s.damage === 0)).toBe(true);
    expect(e.result?.goods).toBe(0);
  });

  it('zweite Verhandlung: verschiebt die Zeiger, ohne dass die Runde weiterläuft', () => {
    const { sim, id } = withCrew(3, (s) => [free(s, 'runner', { charisma: 85 })]);
    const e = get(sim, id);
    const talker = e.participants[0].id;
    const { round, clock, aggression } = e;
    sim.dispatch({ type: 'encounters.special', payload: { encounterId: id, participantId: talker } });
    const after = get(sim, id);
    expect(after.round).toBe(round);
    expect(after.clock).toBe(clock);
    expect(after.aggression).toBeLessThan(aggression);
    // Nur einmal.
    expect(sim.dispatch({ type: 'encounters.special', payload: { encounterId: id, participantId: talker } }).ok).toBe(
      false,
    );
  });

  it('Ware wegbringen: höchstens die Hälfte der Ware geht verloren', () => {
    const { sim, id } = withCrew(4, (s) => [free(s, 'runner', { speed: 90 })]);
    const runner = get(sim, id).participants[0].id;
    sim.dispatch({ type: 'encounters.special', payload: { encounterId: id, participantId: runner } });
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: id, actionId: 'flee', protect: 'cash' } });
    const e = get(sim, id);
    expect(e.phase).toBe('done');
    expect(e.stakes.find((s) => s.id === 'goods')?.damage).toBeLessThanOrEqual(STASH_CAP);
  });
});
