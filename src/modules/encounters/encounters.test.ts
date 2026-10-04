import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store } from '../goods';
import { getHeat } from '../police';
import { getStaffMember } from '../staff';
import { getInfluence, PLAYER_FACTION } from '../territory';
import { DECISION_TIMEOUT } from './config';
import { backupCandidates } from './engine';
import {
  ABANDON_CASH_MAX,
  ABANDON_CASH_SHARE,
  actionChance,
  activeEncounters,
  autoResolveEncounter,
  availableActions,
  BACKUP_COST,
  briefingOptions,
  ENCOUNTER_ACTIONS,
  ENCOUNTER_KINDS,
  type Encounter,
  type EncounterEffects,
  type EncounterMode,
  getEncounter,
  PAYOFF_RELATION,
  payoffCost,
  startEncounter,
  TIPOFF_HEAT,
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
        askPlayer: true,
        opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
      }).encounterId;

    const alone = start();
    expect(encounter(sim, alone).phase).toBe('briefing');
    expect(availableActions(encounter(sim, alone))).toEqual([]);
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId: alone, actionId: 'fight' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'encounters.join', payload: { encounterId: alone, present: false } }).ok).toBe(true);
    const remote = availableActions(encounter(sim, alone));
    // Per Handy geht fast alles, nur Einschüchtern braucht den Boss vor Ort.
    expect(remote).toEqual(['fight', 'hold', 'negotiate', 'bribe', 'flee']);
    expect(remote).not.toContain('intimidate');
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

  it('Verkehrskontrolle: friedlich ohne Heat, "Gewalt gegen Polizei" bringt ihn trotz skipEffects', () => {
    const request = { kind: 'vehicleCheck', veedelId: 'kalk', playerPresent: true, skipEffects: true } as const;
    // Ruhig bleiben: Eine Kontrolle ist keine Gewalt im Veedel (die Polizei bekam sonst +15 Heat gemeldet).
    const calm = createTestGame();
    const quiet = startEncounter(calm.ctx('logistics'), request).encounterId;
    playOut(calm, quiet, 'negotiate');
    calm.advance(1);
    expect(encounter(calm, quiet).phase).toBe('done');
    expect(getHeat(calm.state, 'kalk')).toBe(0);
    // Mit der Faust auf die Streife: Der angekündigte Heat der Handlung gilt, auch wenn der Auslöser die Folgen regelt.
    const fight = createTestGame();
    const brawl = startEncounter(fight.ctx('logistics'), request).encounterId;
    playOut(fight, brawl, 'fight');
    fight.advance(1);
    const e = encounter(fight, brawl);
    expect(e.extraHeat).toBeGreaterThanOrEqual(20);
    expect(e.result?.heat).toBe(e.extraHeat);
    expect(getHeat(fight.state, 'kalk')).toBe(Math.min(100, e.extraHeat));
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

  it('Bestechen kostet Schwarzgeld, ohne Geld geht es nicht', () => {
    const sim = createTestGame();
    const { encounterId } = startEncounter(sim.ctx('police'), { kind: 'policeChase', playerPresent: true });
    const e = encounter(sim, encounterId);
    // 500 + 2 × 200, in Köln ein Viertel günstiger (Klüngel, Auftrag 30).
    expect(e.bribeCost).toBe(675);
    const before = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId: 'bribe' } }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBe(before - 675);
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
    expect(old).toMatchObject({ kind: 'policeChase', phase: 'done', outcome: 'success', participants: [], mode: null });
    expect(loaded.state.moduleVersions.encounters).toBe(3);
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
    sim.dispatch({ type: 'encounters.join', payload: { encounterId, present: false } });
    playOut(sim, encounterId);
    const pending = startEncounter(sim.ctx('gangs'), { kind: 'raidDefense', staffIds: [runner], askPlayer: true });
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
    expect(getEncounter(loaded.state, pending.encounterId)).toMatchObject({ phase: 'briefing', mode: null });
  });
});

describe('Wege im Briefing', () => {
  const raid = (sim: Simulation, staffIds: string[], extra: Partial<Parameters<typeof startEncounter>[1]> = {}) =>
    startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds,
      askPlayer: true,
      opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
      ...extra,
    }).encounterId;
  const join = (sim: Simulation, encounterId: number, mode: EncounterMode) =>
    sim.dispatch({ type: 'encounters.join', payload: { encounterId, mode } });

  it('jeder Anlass bietet nur seine Wege an; der Überfall alle sechs, die Polizeiflucht keine Bullen', () => {
    expect(ENCOUNTER_KINDS.raidDefense.briefingOptions).toEqual([
      'self',
      'crew',
      'backup',
      'payoff',
      'tipoff',
      'abandon',
    ]);
    expect(ENCOUNTER_KINDS.policeChase.briefingOptions).not.toContain('tipoff');
    const sim = createTestGame();
    const runner = hireRunner(sim, 'ebertplatz');
    const debt = startEncounter(sim.ctx('gangs'), { kind: 'debtCollection', staffIds: [runner], askPlayer: true });
    const result = join(sim, debt.encounterId, 'payoff');
    expect(result.ok).toBe(false);
    expect(briefingOptions(sim.state, encounter(sim, debt.encounterId)).map((o) => o.mode)).toEqual([
      'self',
      'crew',
      'backup',
    ]);
  });

  it('die alte Form { present } geht weiter', () => {
    const sim = createTestGame();
    const runner = hireRunner(sim, 'ebertplatz');
    const id = raid(sim, [runner]);
    expect(sim.dispatch({ type: 'encounters.join', payload: { encounterId: id, present: true } }).ok).toBe(true);
    expect(encounter(sim, id)).toMatchObject({ phase: 'rounds', mode: 'self', playerPresent: true });
  });

  it('Verstärkung: kostet Schwarzgeld, freie Leute fahren hin, die Lage startet besser', () => {
    const sim = createTestGame({ seed: 4 });
    sim.state.wallet.dirty = 10_000;
    const runner = hireRunner(sim, 'ebertplatz');
    const plain = raid(sim, [runner]);
    join(sim, plain, 'crew');
    // Ohne freie Leute geht es nicht.
    const noFree = raid(sim, [runner]);
    expect(join(sim, noFree, 'backup').ok).toBe(false);
    // Zwei Leute ohne Einsatz.
    const extra = [hireRunner(sim, 'neumarkt'), hireRunner(sim, 'zuelpicher')];
    for (const id of extra) sim.dispatch({ type: 'staff.assign', payload: { staffId: id, assignment: null } });
    const before = wallet.balance(sim.state, 'dirty');
    const events = recordEvents(sim);
    expect(join(sim, noFree, 'backup').ok).toBe(true);
    const e = encounter(sim, noFree);
    expect(wallet.balance(sim.state, 'dirty')).toBe(before - BACKUP_COST);
    expect(e.participants.map((p) => p.id).sort()).toEqual([runner, ...extra].sort());
    expect(e.request.staffIds?.sort()).toEqual([runner, ...extra].sort());
    expect(e.playerPresent).toBe(false);
    expect(e.edge).toBeGreaterThan(encounter(sim, plain).edge);
    autoResolveEncounter(sim.ctx('gangs'), noFree);
    sim.advance(1);
    // Die Verstärkung bekommt Erfahrung wie alle Beteiligten.
    for (const id of extra) expect(getStaffMember(sim.state, id)?.xp ?? 0).toBeGreaterThan(0);
    expect(eventsOfType(events, 'encounter.resolved')[0].payload.mode).toBe('backup');
  });

  it('Sofort freikaufen: Erfolg ohne Runde, Geld weg, Beziehung zur Gang sinkt', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 5_000;
    const runner = hireRunner(sim, 'ebertplatz');
    const id = raid(sim, [runner]);
    const cost = payoffCost(encounter(sim, id));
    expect(cost).toBeGreaterThanOrEqual(600);
    const relation = sim.state.modules.gangs.gangs.nord.relation;
    const hostility = sim.state.modules.gangs.gangs.nord.hostility;
    const before = wallet.balance(sim.state, 'dirty');
    const events = recordEvents(sim);
    expect(join(sim, id, 'payoff').ok).toBe(true);
    sim.advance(1);
    const e = encounter(sim, id);
    expect(e).toMatchObject({ phase: 'done', outcome: 'success', round: 0, mode: 'payoff' });
    expect(wallet.balance(sim.state, 'dirty')).toBe(before - cost);
    expect(e.result?.money).toBe(-cost);
    expect(e.result?.relation).toBe(PAYOFF_RELATION);
    expect(sim.state.modules.gangs.gangs.nord.relation).toBeLessThan(relation);
    // Keine neue Wut wie nach einem abgewehrten Überfall.
    expect(sim.state.modules.gangs.gangs.nord.hostility).toBeLessThanOrEqual(hostility);
    expect(eventsOfType(events, 'encounter.resolved')[0].payload).toMatchObject({ outcome: 'success', mode: 'payoff' });
    // Zu wenig Geld: geht nicht.
    sim.state.wallet.dirty = 10;
    expect(join(sim, raid(sim, [runner]), 'payoff').ok).toBe(false);
  });

  it('Anonym die Bullen rufen: Rückzug, Heat im Veedel steigt, etwas Ware ist weg', () => {
    const sim = createTestGame();
    const runner = hireRunner(sim, 'ebertplatz');
    const id = raid(sim, [runner]);
    const heat = getHeat(sim.state, 'neustadt-nord');
    const stock = getStock(sim.state);
    expect(join(sim, id, 'tipoff').ok).toBe(true);
    const e = encounter(sim, id);
    expect(e).toMatchObject({ phase: 'done', outcome: 'retreat', mode: 'tipoff' });
    expect(getHeat(sim.state, 'neustadt-nord')).toBeGreaterThanOrEqual(heat + TIPOFF_HEAT);
    expect(getStock(sim.state)).toBeLessThan(stock);
  });

  it('Ware retten, Spot räumen: Rückzug, die Ware bleibt, die Kasse ist weg', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 4_000;
    const runner = hireRunner(sim, 'ebertplatz');
    const id = raid(sim, [runner]);
    const stock = getStock(sim.state);
    const before = wallet.balance(sim.state, 'dirty');
    expect(join(sim, id, 'abandon').ok).toBe(true);
    const e = encounter(sim, id);
    expect(e).toMatchObject({ phase: 'done', outcome: 'retreat', mode: 'abandon' });
    expect(getStock(sim.state)).toBe(stock);
    const lost = before - wallet.balance(sim.state, 'dirty');
    expect(lost).toBe(Math.min(ABANDON_CASH_MAX, Math.round(before * ABANDON_CASH_SHARE)));
  });

  it('deterministisch: gleicher Seed, gleiche Wege, gleiches Ergebnis', () => {
    const run = () => {
      const sim = createTestGame({ seed: 9 });
      sim.state.wallet.dirty = 10_000;
      const runner = hireRunner(sim, 'ebertplatz');
      const results = (['tipoff', 'abandon', 'payoff', 'crew'] as const).map((mode) => {
        const id = raid(sim, [runner]);
        join(sim, id, mode);
        if (encounter(sim, id).phase !== 'done') autoResolveEncounter(sim.ctx('gangs'), id);
        return JSON.stringify(encounter(sim, id).result);
      });
      return results;
    };
    expect(run()).toEqual(run());
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

  it('Verstärkung kommt aus der Stadt der Konfrontation, nicht aus der schlafenden', () => {
    const sim = createTestGame({ seed: 4 });
    sim.state.wallet.dirty = 10_000;
    const runner = hireRunner(sim, 'ebertplatz');
    const extra = [hireRunner(sim, 'neumarkt'), hireRunner(sim, 'zuelpicher')];
    for (const id of extra) sim.dispatch({ type: 'staff.assign', payload: { staffId: id, assignment: null } });
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds: [runner],
      askPlayer: true,
    });
    expect(backupCandidates(sim.state, encounter(sim, encounterId)).sort()).toEqual([...extra].sort());
    const away = getStaffMember(sim.state, extra[0]);
    if (!away) throw new Error('Person fehlt');
    away.cityId = 'hamburg';
    expect(backupCandidates(sim.state, encounter(sim, encounterId))).toEqual([extra[1]]);
  });
});
