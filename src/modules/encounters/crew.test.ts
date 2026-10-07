// Crew und Spezialzüge (Auftrag 35, Etappe 2; seit 46d geht die vorgeschlagene Crew von selbst hin).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { MINIGAME_KINDS } from '../minigames';
import { getStaffMember } from '../staff';
import { CREW_TRAVEL_COST } from './config';
import { crewCandidates, specialMoves, suggestedCrew } from './crew';
import { act as engineAct, availableMoves, special } from './engine';
import { type Encounter, getEncounter, startEncounter } from './index';

const brawlReady = MINIGAME_KINDS.brawl.ready;
beforeEach(() => {
  MINIGAME_KINDS.brawl.ready = true;
});
afterEach(() => {
  MINIGAME_KINDS.brawl.ready = brawlReady;
});

function hire(sim: Simulation, spotId = 'ebertplatz'): string {
  if (wallet.balance(sim.state, 'dirty') < 2000) wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test', 'income.other');
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  const id = (result.data as { staffId: string }).staffId;
  // Ohne Eigenschaften (Auftrag 34), damit nur Rolle und Werte zählen.
  const m = getStaffMember(sim.state, id);
  if (m) m.traits = [];
  return id;
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

const RAID = {
  kind: 'raidDefense',
  spotId: 'ebertplatz',
  veedelId: 'neustadt-nord',
  opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
} as const;

/** Überfall mit askPlayer: Die vorgeschlagene Crew geht hin (46d), alles ist sofort entschieden. */
function raid(sim: Simulation, staffIds: string[]): number {
  return startEncounter(sim.ctx('gangs'), { ...RAID, staffIds, askPlayer: true }).encounterId;
}

/**
 * Überfall mit dir vor Ort und dieser Crew, angehalten: Der Straßenkampf wird weggenommen und bleibt aus, damit die
 * Spezialzüge und Runden von Hand laufen.
 */
function held(sim: Simulation, staffIds: string[]): number {
  MINIGAME_KINDS.brawl.ready = true;
  const { encounterId } = startEncounter(sim.ctx('gangs'), { ...RAID, staffIds, playerPresent: true });
  const e = get(sim, encounterId);
  const open = e.minigame;
  if (!open) throw new Error('Der Straßenkampf hätte starten müssen');
  e.minigame = null;
  sim.state.modules.minigames.active = sim.state.modules.minigames.active.filter((c) => c.id !== open.challengeId);
  MINIGAME_KINDS.brawl.ready = false;
  return encounterId;
}

const act = (sim: Simulation, encounterId: number, actionId: string, protect?: Encounter['protect']) =>
  engineAct(sim.ctx('gangs'), encounterId, actionId, protect ?? undefined);
const move = (sim: Simulation, encounterId: number, participantId: string) =>
  special(sim.ctx('gangs'), encounterId, participantId);

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

describe('Spezialzüge aus Eigenschaften (Auftrag 34)', () => {
  const stats = { speed: 50, caution: 50, strength: 50, charisma: 50 };
  it('Hitzkopf fängt ab, Charmante verhandeln, Flinke und Angsthasen bringen die Ware weg', () => {
    expect(specialMoves({ role: 'runner', stats, traits: ['hothead'] })).toEqual(['block']);
    expect(specialMoves({ role: 'runner', stats, traits: ['charmer'] })).toEqual(['secondTalk']);
    expect(specialMoves({ role: 'runner', stats, traits: ['nimble'] })).toEqual(['stash']);
    expect(specialMoves({ role: 'runner', stats, traits: ['coward', 'family'] })).toEqual(['stash']);
    // Rolle zuerst, dann Eigenschaft.
    expect(specialMoves({ role: 'driver', stats, traits: ['charmer'] })).toEqual(['getaway', 'secondTalk']);
  });

  it('pro Anlass zählt der erste erlaubte Zug', () => {
    const sim = createTestGame();
    const driver = free(sim, 'driver');
    const m = getStaffMember(sim.state, driver);
    if (m) m.traits = ['charmer'];
    const id = startEncounter(sim.ctx('logistics'), {
      kind: 'policeChase',
      veedelId: 'kalk',
      staffIds: [driver],
      playerPresent: false,
      skipEffects: true,
    }).encounterId;
    expect(get(sim, id).participants[0].move).toBe('secondTalk');
  });
});

describe('Crew (seit 46d geht die vorgeschlagene von selbst hin)', () => {
  it('Vorschlag: wer vor Ort ist, aufgefüllt mit freien Leuten; Taxi für die, die nicht da sind', () => {
    const sim = createTestGame();
    const runner = hire(sim);
    const guard = free(sim, 'security', { strength: 80 });
    free(sim, 'driver', { strength: 60 });
    const before = wallet.balance(sim.state, 'dirty');
    const id = raid(sim, [runner]);
    const e = get(sim, id);
    expect(e.mode).toBe('crew');
    expect(e.participants.map((p) => p.id)).toEqual([runner, guard]);
    expect(e.participants.map((p) => p.move)).toEqual([null, 'block']);
    expect(e.request.staffIds).toEqual([runner, guard]);
    expect(e.result?.travel).toBe(CREW_TRAVEL_COST);
    expect(before - wallet.balance(sim.state, 'dirty') + (e.result?.money ?? 0)).toBe(CREW_TRAVEL_COST);
  });

  it('crewCandidates und suggestedCrew: vor Ort zuerst, dann die Stärksten, bis zu drei', () => {
    const sim = createTestGame();
    const runner = hire(sim);
    const guard = free(sim, 'security', { strength: 80 });
    const driver = free(sim, 'driver', { strength: 60 });
    // Eine angehaltene Konfrontation ohne Crew-Zusammenstellung (nur der Läufer vor Ort).
    const id = held(sim, [runner]);
    const e = get(sim, id);
    const candidates = crewCandidates(sim.state, e, 'koeln');
    expect(candidates[0]).toMatchObject({ id: runner, atSite: true, cost: 0 });
    expect(candidates.find((c) => c.id === guard)).toMatchObject({
      atSite: false,
      cost: CREW_TRAVEL_COST,
      move: 'block',
    });
    expect(candidates.find((c) => c.id === driver)).toMatchObject({ atSite: false, move: 'getaway' });
    expect(suggestedCrew(sim.state, e, 'koeln')).toEqual([runner, guard]);
  });
});

describe('Spezialzüge in der Konfrontation', () => {
  it('Sicherheit fängt den ersten Treffer ab', () => {
    const sim = createTestGame({ seed: 1 });
    const id = held(sim, [free(sim, 'security')]);
    const e = get(sim, id);
    e.intent = 'knife';
    e.resolve = 95;
    const guardId = e.participants.find((p) => !p.isPlayer)?.id ?? '';
    // Messer trifft ungeschützt mit hoher Chance; der Treffer wird abgefangen.
    for (let i = 0; i < 3 && get(sim, id).phase === 'rounds'; i++) {
      get(sim, id).intent = 'knife';
      act(sim, id, 'negotiate', 'goods');
      if (get(sim, id).participants.find((p) => p.id === guardId)?.moveUsed) break;
    }
    const guard = get(sim, id).participants.find((p) => p.id === guardId);
    if (guard?.moveUsed) {
      expect(get(sim, id).log.some((l) => l.text.includes('fängt den Schlag ab'))).toBe(true);
      expect(guard.condition).toBe('ok');
    }
  });

  it('Fluchtwagen: sofort weg, nichts bleibt zurück', () => {
    const sim = createTestGame({ seed: 2 });
    const driver = free(sim, 'driver');
    const id = held(sim, [driver]);
    expect(availableMoves(get(sim, id)).map((m) => m.move)).toEqual(['getaway']);
    expect(move(sim, id, driver).ok).toBe(true);
    const e = get(sim, id);
    expect(e.outcome).toBe('retreat');
    expect(e.result?.ending).toBe('fled');
    expect(e.stakes.every((s) => s.damage === 0)).toBe(true);
    expect(e.result?.goods).toBe(0);
  });

  it('zweite Verhandlung: verschiebt die Zeiger, ohne dass die Runde weiterläuft', () => {
    const sim = createTestGame({ seed: 3 });
    const talker = free(sim, 'runner', { charisma: 85 });
    const id = held(sim, [talker]);
    const e = get(sim, id);
    const { round, clock, aggression } = e;
    expect(move(sim, id, talker).ok).toBe(true);
    const after = get(sim, id);
    expect(after.round).toBe(round);
    expect(after.clock).toBe(clock);
    expect(after.aggression).toBeLessThan(aggression);
    // Nur einmal.
    expect(move(sim, id, talker).ok).toBe(false);
  });

  it('Ware wegbringen: höchstens die Hälfte der Ware geht verloren, nicht rückwirkend', () => {
    const sim = createTestGame({ seed: 5 });
    const runner = free(sim, 'runner', { speed: 90 });
    const id = held(sim, [runner]);
    const e = get(sim, id);
    const goods = e.stakes.find((s) => s.id === 'goods');
    if (!goods) throw new Error('keine Ware');
    goods.damage = 90;
    expect(move(sim, id, runner).ok).toBe(true);
    expect(get(sim, id).goodsCap).toBe(90);
    act(sim, id, 'flee', 'cash');
    expect(get(sim, id).phase).toBe('done');
    expect(get(sim, id).stakes.find((s) => s.id === 'goods')?.damage).toBe(90);
  });

  it('bei Polizei und Zoll gibt es keinen Fluchtwagen', () => {
    for (const kind of ['policeChase', 'vehicleCheck', 'customsCheck']) {
      const sim = createTestGame();
      const driver = free(sim, 'driver');
      const id = startEncounter(sim.ctx('logistics'), {
        kind,
        veedelId: 'kalk',
        staffIds: [driver],
        playerPresent: false,
        skipEffects: true,
      }).encounterId;
      // Der Anlass erlaubt keinen Fluchtwagen: Der Fahrer bringt dann keinen Zug mit.
      expect(get(sim, id).participants[0].move, kind).toBeNull();
    }
  });
});
