// Konfrontationen (Auftrag 46d): sofort entschieden, Folgen über die anderen Module, Migrationen.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store } from '../goods';
import { MINIGAME_KINDS } from '../minigames';
import { getHeat } from '../police';
import { getStaffMember } from '../staff';
import { getInfluence, PLAYER_FACTION } from '../territory';
import { ENCOUNTER_ACTIONS } from './actions';
import { CREW_TRAVEL_COST } from './config';
import { act } from './engine';
import {
  activeEncounters,
  autoResolveEncounter,
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
      gauges: { aggression: 30, resolve: 50 },
      clock: 4,
      stakes: ['people'],
      intents: ['knife', 'leaderTalks'],
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
      expect(encounter(sim, encounterId).outcome).not.toBeNull();
    } finally {
      delete ENCOUNTER_KINDS.testKind;
    }
  });

  it('sofort entschieden (Auftrag 46d): Ergebnis mit Auslöser, Journal und Folgen für die Beteiligten im selben Aufruf', () => {
    const sim = createTestGame({ seed: 3 });
    const events = recordEvents(sim);
    const runner = hireRunner(sim, 'ebertplatz');
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds: [runner],
      playerPresent: false,
      opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
      origin: { module: 'gangs', ref: 'raid:nord' },
    });
    const e = encounter(sim, encounterId);
    expect(e.phase).toBe('done');
    expect(e.round).toBeGreaterThan(0);
    expect(e.log.length).toBeGreaterThanOrEqual(e.round);
    expect(activeEncounters(sim.state)).toHaveLength(0);
    expect(sim.state.journal[0].text).toBe(e.result?.text);
    // Ereignisse aus einem direkten Aufruf kommen mit dem nächsten Schritt an.
    sim.advance(1);
    const resolved = eventsOfType(events, 'encounter.resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].payload.request.origin).toEqual({ module: 'gangs', ref: 'raid:nord' });
    expect(resolved[0].payload.outcome).toBe(e.outcome);
    expect(resolved[0].payload.result).toEqual(e.result);
    expect(eventsOfType(events, 'encounter.round')).toHaveLength(e.round);
    // Verletzungen landen beim Mitarbeiter.
    const status = getStaffMember(sim.state, runner)?.status;
    if (e.result?.staffInjured.includes(runner)) expect(status).toBe('injured');
    if (e.result?.staffKilled.includes(runner)) expect(status).toBe('dead');
  });

  it('Anlass mit offener Teilnahme (askPlayer): die vorgeschlagene Crew geht hin, Taxi für die, die nicht da sind', () => {
    const sim = createTestGame({ seed: 2 });
    sim.state.wallet.dirty = 10_000;
    const runner = hireRunner(sim, 'ebertplatz');
    const guard = hireRunner(sim, 'neumarkt');
    const m = getStaffMember(sim.state, guard);
    if (!m) throw new Error('fehlt');
    m.assignment = null;
    (m as { role: string }).role = 'security';
    m.stats.strength = 80;
    const before = wallet.balance(sim.state, 'dirty');
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds: [runner],
      askPlayer: true,
      opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
    });
    const e = encounter(sim, encounterId);
    expect(e).toMatchObject({ phase: 'done', mode: 'crew', playerPresent: false });
    expect(e.participants.map((p) => p.id)).toEqual([runner, guard]);
    expect(e.request.staffIds).toEqual([runner, guard]);
    expect(e.result?.travel).toBe(CREW_TRAVEL_COST);
    // Das Taxi ist kein Verlust an die Gegenseite.
    expect(before - wallet.balance(sim.state, 'dirty') + (e.result?.money ?? 0)).toBe(CREW_TRAVEL_COST);
    // Ohne Geld fürs Taxi gehen nur die, die vor Ort sind.
    const poor = createTestGame({ seed: 2 });
    const r2 = hireRunner(poor, 'ebertplatz');
    const g2 = hireRunner(poor, 'neumarkt');
    const m2 = getStaffMember(poor.state, g2);
    if (!m2) throw new Error('fehlt');
    m2.assignment = null;
    (m2 as { role: string }).role = 'security';
    poor.state.wallet.dirty = 10;
    const id2 = startEncounter(poor.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds: [r2],
      askPlayer: true,
      opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
    }).encounterId;
    expect(encounter(poor, id2).participants.map((p) => p.id)).toEqual([r2]);
    expect(encounter(poor, id2).phase).toBe('done');
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

  it('autoResolveEncounter ist auf eine entschiedene Konfrontation ohne Wirkung', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const runner = hireRunner(sim, 'neumarkt');
    const { encounterId } = startEncounter(sim.ctx('police'), {
      kind: 'policeChase',
      veedelId: 'altstadt-sued',
      staffIds: [runner],
      origin: { module: 'police', ref: 'kontrolle-1' },
    });
    expect(encounter(sim, encounterId).phase).toBe('done');
    sim.advance(1);
    expect(eventsOfType(events, 'encounter.resolved')).toHaveLength(1);
    expect(eventsOfType(events, 'encounter.resolved')[0].payload.playerKilled).toBe(false);
    autoResolveEncounter(sim.ctx('police'), encounterId);
    expect(sim.dispatch({ type: 'encounters.auto', payload: { encounterId } }).ok).toBe(false);
    sim.advance(1);
    expect(eventsOfType(events, 'encounter.resolved')).toHaveLength(1);
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

  it('Verkehrskontrolle mit skipEffects: nur der Heat aus den Handlungen ("Gewalt gegen Polizei") zählt', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = createTestGame({ seed });
      const id = startEncounter(sim.ctx('logistics'), {
        kind: 'vehicleCheck',
        veedelId: 'kalk',
        playerPresent: true,
        skipEffects: true,
      }).encounterId;
      // Mit dir vor Ort wartet die Verkehrskontrolle (Minispiel); ungespielt würfeln die Leute aus.
      autoResolveEncounter(sim.ctx('logistics'), id);
      const e = encounter(sim, id);
      expect(e.phase).toBe('done');
      expect(e.result?.heat).toBe(e.extraHeat);
      expect(getHeat(sim.state, 'kalk')).toBe(Math.min(100, e.extraHeat));
    }
  });

  it('Ruf aus einer Konfrontation steht mit Grund in der Liste "Zuletzt"', () => {
    const sim = createTestGame();
    const effects: EncounterEffects = { reputation: 2 };
    const { encounterId } = startEncounter(sim.ctx('test'), {
      kind: 'debtCollection',
      veedelId: 'kalk',
      playerPresent: false,
      effects: { success: effects, failure: effects, retreat: effects },
    });
    expect(encounter(sim, encounterId).phase).toBe('done');
    const recent = sim.state.modules.reputation.recent;
    expect(recent).toHaveLength(1);
    expect(recent[0].delta).toBe(2);
    expect(recent[0].reason).toMatch(/^Schulden eintreiben \((geschafft|verloren|Rückzug)\)$/);
  });

  it('wer selbst dabei ist, kann sterben: Game Over mit Grund killed', () => {
    // Mit dir vor Ort kommt der Straßenkampf (Minispiel); hier wird er weggenommen, und du prügelst Runde für Runde.
    const brawlReady = MINIGAME_KINDS.brawl.ready;
    let deaths = 0;
    try {
      for (let seed = 1; seed <= 60; seed++) {
        MINIGAME_KINDS.brawl.ready = true;
        const sim = createTestGame({ seed });
        const { encounterId } = startEncounter(sim.ctx('gangs'), {
          kind: 'gangSpotRaid',
          veedelId: 'kalk',
          playerPresent: true,
          opponent: { factionId: 'ost', label: 'Die Wachen', strength: 85, count: 5 },
        });
        const e = encounter(sim, encounterId);
        const open = e.minigame;
        if (open) {
          e.minigame = null;
          sim.state.modules.minigames.active = sim.state.modules.minigames.active.filter(
            (c) => c.id !== open.challengeId,
          );
        }
        MINIGAME_KINDS.brawl.ready = false;
        for (let i = 0; i < 20 && e.phase === 'rounds'; i++) act(sim.ctx('gangs'), encounterId, 'fight');
        if (!e.playerKilled) continue;
        deaths++;
        expect(e.outcome).toBe('failure');
        expect(sim.isOver).toBe(true);
        expect(sim.state.outcome.gameOver?.reason).toBe('killed');
        expect(e.result?.text.length ?? 0).toBeGreaterThan(0);
      }
    } finally {
      MINIGAME_KINDS.brawl.ready = brawlReady;
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
    expect(old).toMatchObject({ kind: 'policeChase', phase: 'done', outcome: 'success', participants: [], mode: null });
    expect(loaded.state.moduleVersions.encounters).toBe(6);
  });

  it('Spielstände der Version 2 bekommen den Weg im Briefing und die Beziehung im Ergebnis', () => {
    const sim = createTestGame();
    const runner = hireRunner(sim, 'ebertplatz');
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      staffIds: [runner],
      askPlayer: true,
      spotId: 'ebertplatz',
    });
    const state = structuredClone(sim.state) as unknown as {
      modules: { encounters: { active: Record<string, unknown>[]; history: Record<string, unknown>[] } };
      moduleVersions: Record<string, number>;
    };
    for (const e of [...state.modules.encounters.active, ...state.modules.encounters.history]) {
      delete e.mode;
      if (e.result) delete (e.result as Record<string, unknown>).relation;
    }
    state.moduleVersions.encounters = 2;
    const loaded = loadSimulation(state as unknown as typeof sim.state, sim.modules);
    expect(getEncounter(loaded.state, encounterId)).toMatchObject({ mode: 'crew', result: { relation: 0 } });
  });

  it('Version 5 → 6 (Auftrag 46d): Eine offene Akte aus einem alten Stand wird beim ersten Schritt ausgewürfelt', () => {
    const sim = createTestGame({ seed: 3 });
    const runner = hireRunner(sim, 'ebertplatz');
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds: [runner],
      playerPresent: false,
    });
    const state = structuredClone(sim.state);
    // So sah eine Konfrontation aus, die in der Akte auf den Spieler wartete.
    const done = state.modules.encounters.history.find((e) => e.id === encounterId);
    if (!done) throw new Error('fehlt');
    state.modules.encounters.history = state.modules.encounters.history.filter((e) => e.id !== encounterId);
    state.modules.encounters.active.push({
      ...done,
      phase: 'briefing',
      outcome: null,
      resolvedAt: null,
      result: null,
      deadline: state.time + 120,
    });
    state.moduleVersions.encounters = 5;
    const loaded = loadSimulation(state, sim.modules);
    expect(loaded.state.moduleVersions.encounters).toBe(6);
    expect(activeEncounters(loaded.state)).toHaveLength(1);
    const events = recordEvents(loaded);
    loaded.advance(1);
    expect(activeEncounters(loaded.state)).toHaveLength(0);
    expect(getEncounter(loaded.state, encounterId)?.phase).toBe('done');
    expect(eventsOfType(events, 'encounter.resolved')).toHaveLength(1);
  });
});

describe('Ware und Leute nach Stadt', () => {
  /** Köln ist aktiv, in Hamburg liegt Ware in zwei Lagern (eins davon wird überfallen). */
  function twoCities(): Simulation {
    const sim = createTestGame({ seed: 3 });
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    sim.state.modules.goods.owned.push('werkstatt-ottensen');
    const ctx = sim.ctx('test');
    store(ctx, { productId: 'weed', amount: 400, warehouseId: 'werkstatt-ottensen' });
    return sim;
  }
  const halve: EncounterEffects = { goodsShare: -0.5 };

  it('Überfall auf ein Lager: Ware geht nur aus diesem Lager, der Anteil gilt für dessen Bestand', () => {
    const sim = twoCities();
    const koeln = getStock(sim.state, { cityId: 'koeln' });
    expect(koeln).toBeGreaterThan(0);
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'st-pauli',
      warehouseId: 'werkstatt-ottensen',
      playerPresent: false,
      effects: { failure: halve },
    });
    expect(encounter(sim, encounterId).outcome).toBe('failure');
    expect(getStock(sim.state, { warehouseId: 'werkstatt-ottensen' })).toBe(200);
    expect(encounter(sim, encounterId).result?.goods).toBe(-200);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(koeln);
  });

  it('Konfrontation in Hamburg bei aktivem Köln: Anteil und Verlust nur über die Hamburger Lager', () => {
    const sim = twoCities();
    const koeln = getStock(sim.state, { cityId: 'koeln' });
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'st-pauli',
      playerPresent: false,
      effects: { failure: halve },
    });
    expect(encounter(sim, encounterId).result?.goods).toBe(-200);
    expect(getStock(sim.state, { cityId: 'hamburg' })).toBe(200);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(koeln);
  });
});
