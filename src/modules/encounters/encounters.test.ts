import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock } from '../goods';
import { getHeat } from '../police';
import { getStaffMember } from '../staff';
import { getInfluence, PLAYER_FACTION } from '../territory';
import { DECISION_TIMEOUT } from './config';
import {
  actionChance,
  activeEncounters,
  autoResolveEncounter,
  availableActions,
  ENCOUNTER_ACTIONS,
  ENCOUNTER_KINDS,
  type Encounter,
  type EncounterEffects,
  getEncounter,
  startEncounter,
} from './index';

function hireRunner(sim: Simulation, spotId: string): string {
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

function encounter(sim: Simulation, id: number): Encounter {
  const e = getEncounter(sim.state, id);
  if (!e) throw new Error('Konfrontation fehlt');
  return e;
}

/** Spielt Runden mit der jeweils besten angebotenen Handlung (ohne Bestechung), bis es vorbei ist. */
function playOut(sim: Simulation, id: number, prefer?: string): void {
  for (let i = 0; i < 20 && encounter(sim, id).phase !== 'done' && !sim.isOver; i++) {
    const e = encounter(sim, id);
    const options = availableActions(e).filter((a) => a !== 'bribe');
    const actionId =
      prefer && options.includes(prefer)
        ? prefer
        : options.reduce((a, b) => (actionChance(e, b) > actionChance(e, a) ? b : a));
    const result = sim.dispatch({ type: 'encounters.act', payload: { encounterId: id, actionId } });
    expect(result.ok).toBe(true);
  }
}

describe('encounters', () => {
  it('kennt die vier Anlässe aus dem Konzept plus den Gang-Überfall, alle als reine Daten', () => {
    for (const id of ['raidDefense', 'policeChase', 'debtCollection', 'dealGoneWrong', 'gangSpotRaid']) {
      expect(ENCOUNTER_KINDS[id]).toBeDefined();
    }
    for (const kind of Object.values(ENCOUNTER_KINDS)) {
      for (const id of [...kind.actions, ...kind.remoteActions]) expect(ENCOUNTER_ACTIONS[id]).toBeDefined();
      for (const id of kind.remoteActions) expect(ENCOUNTER_ACTIONS[id].requiresPlayer).toBeFalsy();
      expect(Object.keys(kind.outcomes).sort()).toEqual(['failure', 'retreat', 'success']);
      // Ohne den Spieler gibt es weniger Möglichkeiten.
      expect(kind.remoteActions.length).toBeLessThan(kind.actions.length);
    }
    const sim = createTestGame();
    expect(() => startEncounter(sim.ctx('x'), { kind: 'picknick' })).toThrow(/Unbekannter Anlass/);
  });

  it('ein neuer Anlass lässt sich als reiner Datensatz ergänzen', () => {
    ENCOUNTER_KINDS.testKind = {
      name: 'Test',
      baseSuccess: 0.5,
      situation: '{opponent} steht {place} im Weg.',
      opponent: { label: 'Ein Türsteher', strength: 40, count: 1 },
      maxRounds: 3,
      joinable: true,
      actions: ['negotiate', 'fight'],
      remoteActions: ['fight'],
      outcomes: { success: { money: 50 }, failure: {}, retreat: {} },
    };
    try {
      const sim = createTestGame();
      const { encounterId } = startEncounter(sim.ctx('test'), {
        kind: 'testKind',
        veedelId: 'kalk',
        playerPresent: true,
      });
      expect(encounter(sim, encounterId).situation).toBe('Ein Türsteher steht in Kalk im Weg.');
      playOut(sim, encounterId);
      expect(encounter(sim, encounterId).outcome).not.toBeNull();
    } finally {
      delete ENCOUNTER_KINDS.testKind;
    }
  });

  it('Anlass mit offener Teilnahme: erst entscheidet der Spieler, selbst dabei gibt es mehr Möglichkeiten', () => {
    const sim = createTestGame();
    const runner = hireRunner(sim, 'ebertplatz');
    const start = () =>
      startEncounter(sim.ctx('gangs'), {
        kind: 'raidDefense',
        spotId: 'ebertplatz',
        veedelId: 'neustadt-nord',
        staffIds: [runner],
        opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
      }).encounterId;

    const alone = start();
    expect(encounter(sim, alone).phase).toBe('briefing');
    expect(availableActions(encounter(sim, alone))).toEqual([]);
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId: alone, actionId: 'fight' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'encounters.join', payload: { encounterId: alone, present: false } }).ok).toBe(true);
    const remote = availableActions(encounter(sim, alone));
    expect(remote).toEqual(['fight', 'hold', 'flee']);
    const remoteChance = actionChance(encounter(sim, alone), 'fight');

    const together = start();
    sim.dispatch({ type: 'encounters.join', payload: { encounterId: together, present: true } });
    const e = encounter(sim, together);
    expect(e.participants.map((p) => p.id)).toEqual(['player', runner]);
    expect(availableActions(e)).toEqual(expect.arrayContaining(['intimidate', 'negotiate', 'bribe']));
    expect(actionChance(e, 'fight')).toBeGreaterThan(remoteChance);
    expect(sim.dispatch({ type: 'encounters.join', payload: { encounterId: together, present: false } }).ok).toBe(
      false,
    );
  });

  it('Runden bis zum Ende: Ergebnis mit Auslöser, Journal und Folgen für die Beteiligten', () => {
    const sim = createTestGame({ seed: 3 });
    const events = recordEvents(sim);
    const runner = hireRunner(sim, 'ebertplatz');
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds: [runner],
      playerPresent: true,
      opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
      origin: { module: 'gangs', ref: 'raid:nord' },
    });
    playOut(sim, encounterId);
    const e = encounter(sim, encounterId);
    expect(e.phase).toBe('done');
    expect(e.log.length).toBe(e.round);
    expect(activeEncounters(sim.state)).toHaveLength(0);
    const resolved = eventsOfType(events, 'encounter.resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].payload.request.origin).toEqual({ module: 'gangs', ref: 'raid:nord' });
    expect(resolved[0].payload.outcome).toBe(e.outcome);
    expect(resolved[0].payload.result).toEqual(e.result);
    expect(eventsOfType(events, 'encounter.round')).toHaveLength(e.round);
    expect(sim.state.journal[0].text).toBe(e.result?.text);
    // Verletzungen landen beim Mitarbeiter.
    const status = getStaffMember(sim.state, runner)?.status;
    if (e.result?.staffInjured.includes(runner)) expect(status).toBe('injured');
    if (e.result?.staffKilled.includes(runner)) expect(status).toBe('dead');
  });

  it('niemand da: sofort verloren, die Folgen des Anlasses greifen', () => {
    const sim = createTestGame();
    const stock = getStock(sim.state);
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'nippes',
      playerPresent: false,
      opponent: { factionId: 'nord' },
    });
    const e = encounter(sim, encounterId);
    expect(e.outcome).toBe('failure');
    expect(getStock(sim.state)).toBeLessThan(stock);
    expect(e.result?.goods).toBe(getStock(sim.state) - stock);
    expect(e.result?.money).toBeLessThan(0);
    expect(getInfluence(sim.state, 'nippes', 'nord')).toBeGreaterThan(60);
  });

  it('ohne Entscheidung würfeln die Leute nach der Frist selbst aus (für Aufrufer ohne Oberfläche)', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const runner = hireRunner(sim, 'neumarkt');
    const { encounterId } = startEncounter(sim.ctx('police'), {
      kind: 'policeChase',
      veedelId: 'altstadt-sued',
      staffIds: [runner],
      origin: { module: 'police', ref: 'kontrolle-1' },
    });
    expect(encounter(sim, encounterId).phase).toBe('rounds');
    sim.advance(DECISION_TIMEOUT);
    expect(eventsOfType(events, 'encounter.resolved')).toHaveLength(1);
    expect(eventsOfType(events, 'encounter.resolved')[0].payload.playerKilled).toBe(false);

    const second = startEncounter(sim.ctx('police'), { kind: 'policeChase', staffIds: [runner] }).encounterId;
    autoResolveEncounter(sim.ctx('police'), second);
    expect(encounter(sim, second).phase).toBe('done');
  });

  it('Folgen laufen über die APIs der anderen Module, der Auslöser kann sie ersetzen oder abschalten', () => {
    const sim = createTestGame();
    const effects: EncounterEffects = { money: 100, stakeMoney: 1, goods: 7, influence: 4, heat: 5, reputation: 1 };
    const money = wallet.balance(sim.state, 'dirty');
    const stock = getStock(sim.state);
    const { encounterId } = startEncounter(sim.ctx('test'), {
      kind: 'debtCollection',
      veedelId: 'kalk',
      playerPresent: false,
      stakes: { money: 250 },
      effects: { success: effects, failure: effects, retreat: effects },
    });
    const e = encounter(sim, encounterId);
    expect(e.result).toMatchObject({ money: 350, goods: 7, influence: 4, heat: 5, reputation: 1 });
    expect(wallet.balance(sim.state, 'dirty')).toBe(money + 350);
    expect(getStock(sim.state)).toBe(stock + 7);
    expect(getHeat(sim.state, 'kalk')).toBe(5);
    expect(getInfluence(sim.state, 'kalk', PLAYER_FACTION)).toBe(4);

    const skipped = startEncounter(sim.ctx('police'), {
      kind: 'policeChase',
      veedelId: 'kalk',
      playerPresent: false,
      skipEffects: true,
    }).encounterId;
    expect(encounter(sim, skipped).result).toMatchObject({ money: 0, goods: 0, heat: 0 });
    expect(getHeat(sim.state, 'kalk')).toBe(5);
  });

  it('Bestechen kostet Schwarzgeld, ohne Geld geht es nicht', () => {
    const sim = createTestGame();
    const { encounterId } = startEncounter(sim.ctx('police'), { kind: 'policeChase', playerPresent: true });
    const e = encounter(sim, encounterId);
    expect(e.bribeCost).toBe(900);
    const before = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId: 'bribe' } }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBe(before - 900);
    if (encounter(sim, encounterId).phase !== 'done') {
      const result = sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId: 'bribe' } });
      expect(result).toEqual({ ok: false, reason: 'Nicht genug Schwarzgeld (900 €).' });
    }
  });

  it('wer selbst dabei ist, kann sterben: Game Over mit Grund killed', () => {
    let deaths = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sim = createTestGame({ seed });
      const events = recordEvents(sim);
      const { encounterId } = startEncounter(sim.ctx('gangs'), {
        kind: 'gangSpotRaid',
        veedelId: 'kalk',
        playerPresent: true,
        opponent: { factionId: 'ost', label: 'Die Wachen', strength: 85, count: 5 },
      });
      playOut(sim, encounterId, 'fight');
      const e = encounter(sim, encounterId);
      if (!e.playerKilled) continue;
      deaths++;
      expect(e.outcome).toBe('failure');
      expect(sim.isOver).toBe(true);
      expect(sim.state.outcome.gameOver?.reason).toBe('killed');
      expect(eventsOfType(events, 'game.over')[0].payload.reason).toBe('killed');
      expect(eventsOfType(events, 'encounter.resolved')[0].payload.playerKilled).toBe(true);
    }
    expect(deaths).toBeGreaterThan(0);
  });

  it('wer nur seine Leute schickt, stirbt nie', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = createTestGame({ seed });
      const runner = hireRunner(sim, 'ebertplatz');
      const { encounterId } = startEncounter(sim.ctx('gangs'), {
        kind: 'gangSpotRaid',
        veedelId: 'kalk',
        staffIds: [runner],
        playerPresent: false,
        opponent: { factionId: 'ost', strength: 90, count: 6 },
      });
      playOut(sim, encounterId, 'fight');
      expect(encounter(sim, encounterId).playerKilled).toBe(false);
      expect(sim.isOver).toBe(false);
    }
  });

  it('ist bei gleichem Seed deterministisch', () => {
    const run = (seed: number) => {
      const sim = createTestGame({ seed });
      const runner = hireRunner(sim, 'ebertplatz');
      return Array.from({ length: 10 }, () => {
        const { encounterId } = startEncounter(sim.ctx('gangs'), {
          kind: 'raidDefense',
          staffIds: [runner],
          playerPresent: true,
        });
        playOut(sim, encounterId);
        return JSON.stringify(encounter(sim, encounterId));
      });
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('Spielstände vom Stub (Version 1) werden migriert', () => {
    const sim = createTestGame();
    const state = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    state.modules.encounters = {
      active: [],
      history: [{ id: 7, request: { kind: 'policeChase' }, startedAt: 100, outcome: 'success', resolvedAt: 100 }],
    };
    state.moduleVersions.encounters = 1;
    const loaded = loadSimulation(state as unknown as typeof sim.state, sim.modules);
    const old = getEncounter(loaded.state, 7);
    expect(old).toMatchObject({ kind: 'policeChase', phase: 'done', outcome: 'success', participants: [] });
    expect(loaded.state.moduleVersions.encounters).toBe(2);
  });
});
