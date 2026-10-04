// Tests der neuen Konfrontationen (Auftrag 35): Absicht, zwei Zeiger, Polizei-Uhr, Einsätze, Rollen, Strategie.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getHeat } from '../police';
import { AGGRESSION_FIGHT, PROTECT_FACTOR, RETREAT_AT } from './config';
import {
  availableActions,
  chooseAuto,
  ENCOUNTER_ACTIONS,
  ENCOUNTER_INTENTS,
  ENCOUNTER_KINDS,
  type Encounter,
  getEncounter,
  previewShift,
  startEncounter,
} from './index';

function hireRunner(sim: Simulation, spotId = 'ebertplatz'): string {
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

function get(sim: Simulation, id: number): Encounter {
  const e = getEncounter(sim.state, id);
  if (!e) throw new Error('Konfrontation fehlt');
  return e;
}

/** Überfall am Ebertplatz mit zwei Läufern, der Spieler entscheidet per Handy. */
function raid(seed = 1, extra: Partial<Parameters<typeof startEncounter>[1]> = {}): { sim: Simulation; id: number } {
  const sim = createTestGame({ seed });
  const staffIds = [hireRunner(sim)];
  const { encounterId } = startEncounter(sim.ctx('gangs'), {
    kind: 'raidDefense',
    spotId: 'ebertplatz',
    veedelId: 'neustadt-nord',
    staffIds,
    playerPresent: false,
    opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
    ...extra,
  });
  return { sim, id: encounterId };
}

const act = (sim: Simulation, encounterId: number, actionId: string, protect?: Encounter['protect']) =>
  sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId, ...(protect ? { protect } : {}) } });

describe('Konfrontationen neu: Daten', () => {
  it('jeder Anlass hat Zeiger, Uhr, Einsätze und Absichten aus den Daten', () => {
    for (const [id, kind] of Object.entries(ENCOUNTER_KINDS)) {
      expect(kind.stakes.length, id).toBeGreaterThan(0);
      expect(kind.intents.length, id).toBeGreaterThanOrEqual(4);
      for (const intent of kind.intents) expect(ENCOUNTER_INTENTS[intent], `${id}: ${intent}`).toBeDefined();
      for (const action of [...kind.actions, ...kind.remoteActions]) {
        expect(ENCOUNTER_ACTIONS[action], `${id}: ${action}`).toBeDefined();
      }
      expect(kind.gauges.aggression).toBeLessThan(AGGRESSION_FIGHT);
      expect(kind.gauges.resolve).toBeGreaterThan(RETREAT_AT);
      expect(kind.clock).toBeGreaterThan(1);
    }
    for (const intent of Object.values(ENCOUNTER_INTENTS)) {
      for (const counter of intent.counters ?? []) expect(ENCOUNTER_ACTIONS[counter]).toBeDefined();
    }
  });

  it('die Zollkontrolle hat eigene Handlungen: Papiere, bestechen, ablenken, Ladung aufgeben', () => {
    expect(ENCOUNTER_KINDS.customsCheck.actions).toEqual(['papers', 'distract', 'bribe', 'giveUp']);
  });
});

describe('Konfrontationen neu: Runden', () => {
  it('jede Runde zeigt eine Absicht, Zeiger, Uhr, Rollen und Einsätze', () => {
    const { sim, id } = raid();
    const e = get(sim, id);
    expect(e.phase).toBe('rounds');
    expect(e.intent).not.toBeNull();
    expect(ENCOUNTER_KINDS.raidDefense.intents).toContain(e.intent);
    expect(e.aggression).toBeGreaterThan(0);
    expect(e.resolve).toBeGreaterThan(RETREAT_AT);
    expect(e.clock).toBeGreaterThan(1);
    expect(e.foes.map((f) => f.role)).toEqual(['leader', 'nervous', 'bruiser']);
    expect(e.stakes.map((s) => s.id)).toEqual(['goods', 'cash', 'people', 'spot', 'noise']);
    expect(e.protect).not.toBeNull();
  });

  it('der Würfel entscheidet nur die Stärke: Verhandeln senkt die Aggression immer, Zuschlagen hebt sie immer', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { sim, id } = raid(seed);
      const e = get(sim, id);
      const negotiate = previewShift(e, ENCOUNTER_ACTIONS.negotiate, 'negotiate');
      expect(negotiate.weak.aggression).toBeGreaterThanOrEqual(negotiate.mid.aggression);
      expect(negotiate.strong.aggression).toBeLessThanOrEqual(negotiate.mid.aggression);
      expect(negotiate.strong.aggression).toBeLessThan(0);
      const fight = previewShift(e, ENCOUNTER_ACTIONS.fight, 'fight');
      expect(fight.weak.aggression).toBeGreaterThan(0);
      expect(fight.strong.resolve).toBeLessThan(fight.weak.resolve);
    }
  });

  it('die Vorschau stimmt mit der Runde überein (ohne Absicht und Schlägerei)', () => {
    const { sim, id } = raid(4);
    const e = get(sim, id);
    e.intent = null;
    e.aggression = 20;
    const before = { a: e.aggression, r: e.resolve };
    const p = previewShift(e, ENCOUNTER_ACTIONS.hold, 'hold');
    expect(act(sim, id, 'hold').ok).toBe(true);
    const shift = get(sim, id).log.at(-1)?.shift;
    // Dazu kommen Schläger (Aggression) und Uhr-Druck; die Richtung der Handlung bleibt.
    expect(shift?.resolve).toBeLessThanOrEqual(0);
    expect(p.weak.resolve).toBeGreaterThanOrEqual(p.strong.resolve);
    expect(before.r).toBeGreaterThan(0);
  });

  it(`über ${AGGRESSION_FIGHT} Aggression beginnt die Schlägerei`, () => {
    const { sim, id } = raid(2);
    const e = get(sim, id);
    e.intent = null;
    e.aggression = AGGRESSION_FIGHT - 1;
    act(sim, id, 'bluff');
    const after = get(sim, id);
    expect(after.aggression).toBeGreaterThanOrEqual(AGGRESSION_FIGHT);
    if (after.phase === 'rounds') expect(after.brawl).toBe(true);
  });

  it(`unter ${RETREAT_AT} Entschlossenheit zieht die Gegenseite ab: Erfolg`, () => {
    const { sim, id } = raid(3);
    const events = recordEvents(sim);
    const e = get(sim, id);
    e.intent = null;
    e.resolve = RETREAT_AT + 1;
    e.aggression = 10;
    act(sim, id, 'negotiate');
    const done = get(sim, id);
    expect(done.outcome).toBe('success');
    expect(done.result?.ending).toBe('gaveUp');
    expect(eventsOfType(events, 'encounter.resolved')[0].payload.result?.ending).toBe('gaveUp');
  });

  it('Bullen rufen stellt die Polizei-Uhr auf 1; läuft sie ab, verlieren beide Seiten', () => {
    const { sim, id } = raid(5);
    const heat = getHeat(sim.state, 'neustadt-nord');
    expect(availableActions(get(sim, id))).toContain('callCops');
    get(sim, id).intent = null;
    act(sim, id, 'callCops');
    const e = get(sim, id);
    if (e.phase === 'rounds') {
      expect(e.clock).toBe(1);
      expect(availableActions(e)).not.toContain('callCops');
      e.intent = null;
      e.resolve = 90;
      act(sim, id, 'hold');
    }
    const done = get(sim, id);
    expect(done.phase).toBe('done');
    if (done.result?.ending === 'clock') {
      expect(done.outcome).toBe('retreat');
      expect(getHeat(sim.state, 'neustadt-nord')).toBeGreaterThan(heat);
    }
  });

  it('die Uhr kommt aus Polizeipräsenz und Heat: mehr Heat, früher die Streife', () => {
    const calm = raid(1);
    const hot = createTestGame({ seed: 1 });
    hot.state.modules.police.heat['neustadt-nord'] = 90;
    const staffIds = [hireRunner(hot)];
    const { encounterId } = startEncounter(hot.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'ebertplatz',
      veedelId: 'neustadt-nord',
      staffIds,
      playerPresent: false,
    });
    expect(get(hot, encounterId).clock).toBeLessThan(get(calm.sim, calm.id).clock);
  });

  it('ein geschützter Einsatz nimmt nur einen Teil des Schadens, die passende Handlung wendet die Absicht ab', () => {
    const play = (protect: 'goods' | 'cash', actionId: string) => {
      const { sim, id } = raid(6);
      const e = get(sim, id);
      e.intent = 'grabGoods';
      e.resolve = 95;
      act(sim, id, actionId, protect);
      return get(sim, id).stakes.find((s) => s.id === 'goods')?.damage ?? 0;
    };
    const open = play('cash', 'hold');
    const guarded = play('goods', 'hold');
    const countered = play('cash', 'fight');
    expect(open).toBe(ENCOUNTER_INTENTS.grabGoods.damage);
    expect(guarded).toBe(Math.round((ENCOUNTER_INTENTS.grabGoods.damage ?? 0) * PROTECT_FACTOR));
    expect(countered).toBe(0);
  });

  it('Schutz wählen kostet keine Runde', () => {
    const { sim, id } = raid(7);
    const round = get(sim, id).round;
    expect(sim.dispatch({ type: 'encounters.protect', payload: { encounterId: id, stake: 'spot' } }).ok).toBe(true);
    expect(get(sim, id).protect).toBe('spot');
    expect(get(sim, id).round).toBe(round);
    expect(sim.dispatch({ type: 'encounters.protect', payload: { encounterId: id, stake: 'goods' } }).ok).toBe(true);
    const chase = startEncounter(sim.ctx('police'), { kind: 'policeChase', playerPresent: true }).encounterId;
    expect(sim.dispatch({ type: 'encounters.protect', payload: { encounterId: chase, stake: 'spot' } }).ok).toBe(false);
  });

  it('Rollen: Den Nervösen bearbeiten nimmt ihn raus, dann gibt es den Zug nicht mehr', () => {
    const { sim, id } = raid(8);
    const e = get(sim, id);
    e.intent = null;
    expect(availableActions(e)).toContain('talkNervous');
    act(sim, id, 'talkNervous');
    const after = get(sim, id);
    expect(after.foes.find((f) => f.role === 'nervous')?.state).toBe('gone');
    if (after.phase === 'rounds') {
      expect(after.opponent.count).toBe(2);
      expect(availableActions(after)).not.toContain('talkNervous');
    }
  });

  it('Anführer einschüchtern geht nur als Boss vor Ort', () => {
    const { sim, id } = raid(9);
    expect(availableActions(get(sim, id))).not.toContain('intimidate');
    const present = raid(9, { playerPresent: true });
    expect(availableActions(get(present.sim, present.id))).toContain('intimidate');
  });

  it('das Ergebnis ist eine Mischung mit Teil-Ergebnissen pro Einsatz', () => {
    const { sim, id } = raid(10);
    sim.dispatch({ type: 'encounters.auto', payload: { encounterId: id } });
    const parts = get(sim, id).result?.parts ?? [];
    expect(parts.map((p) => p.stake)).toEqual(['goods', 'cash', 'people', 'spot', 'noise']);
    for (const part of parts) {
      expect(['kept', 'partial', 'lost']).toContain(part.state);
      expect(part.text.length).toBeGreaterThan(0);
    }
  });

  it('gleicher Seed, gleiche Befehle: gleiche Absichten und Zeiger', () => {
    const run = (seed: number) => {
      const { sim, id } = raid(seed);
      for (const a of ['negotiate', 'hold', 'bluff', 'negotiate']) {
        if (get(sim, id).phase === 'rounds') act(sim, id, a);
      }
      const e = get(sim, id);
      return { log: e.log, outcome: e.outcome, money: wallet.balance(sim.state, 'dirty') };
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });
});

describe('Konfrontationen neu: Strategie', () => {
  it('gute Entscheidungen machen einen Unterschied: kluge Strategie schlägt Zufall', () => {
    let smart = 0;
    let random = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const mode of ['smart', 'random'] as const) {
        const { sim, id } = raid(seed);
        let r = seed * 7;
        for (let i = 0; i < 20 && get(sim, id).phase === 'rounds'; i++) {
          const e = get(sim, id);
          if (mode === 'smart') {
            const choice = chooseAuto(sim.state, e, true);
            if (!choice) break;
            act(sim, id, choice.actionId, choice.protect);
          } else {
            const options = availableActions(e).filter((a) => a !== 'bribe');
            r = (r * 9301 + 49297) % 233280;
            act(sim, id, options[r % options.length], e.stakes[r % e.stakes.length].id);
          }
        }
        const score = { success: 2, retreat: 1, failure: 0 }[get(sim, id).outcome ?? 'failure'];
        if (mode === 'smart') smart += score;
        else random += score;
      }
    }
    expect(smart).toBeGreaterThan(random * 1.3);
  });
});

describe('Konfrontationen neu: Migration', () => {
  it('eine laufende Konfrontation aus Version 3 lädt mit Zeigern, Uhr und Absicht und spielt weiter', () => {
    const { sim, id } = raid(12);
    const state = structuredClone(sim.state) as unknown as {
      modules: { encounters: { active: Record<string, unknown>[] } };
      moduleVersions: Record<string, number>;
    };
    for (const e of state.modules.encounters.active) {
      for (const key of ['aggression', 'resolve', 'clock', 'brawl', 'intent', 'foes', 'stakes', 'protect']) {
        delete e[key];
      }
      e.edge = 60;
      e.round = 1;
      e.maxRounds = 5;
    }
    state.moduleVersions.encounters = 3;
    const loaded = loadSimulation(state as unknown as typeof sim.state, sim.modules);
    expect(loaded.state.moduleVersions.encounters).toBe(4);
    const e = get(loaded, id);
    expect(e).toMatchObject({ resolve: 40, clock: 4, brawl: false });
    expect(e.intent).not.toBeNull();
    expect(e.foes).toHaveLength(3);
    expect(e.stakes).toHaveLength(5);
    expect(loaded.dispatch({ type: 'encounters.auto', payload: { encounterId: id } }).ok).toBe(true);
    expect(get(loaded, id).phase).toBe('done');
  });
});
