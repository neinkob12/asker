// Tests der Konfrontationen (Auftrag 35, seit 46d ohne Akte): Absicht, zwei Zeiger, Polizei-Uhr, Einsätze, Rollen.
// Die Runden laufen im Spiel von selbst (playOut). Um einzelne Runden zu prüfen, halten die Tests eine Konfrontation
// mit dir vor Ort an (sie wartet auf den Straßenkampf), nehmen ihr das Minispiel weg und spielen mit act aus engine.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { MINIGAME_KINDS } from '../minigames';
import { getHeat } from '../police';
import { ENCOUNTER_ACTIONS } from './actions';
import { AGGRESSION_FIGHT, PROTECT_FACTOR, RETREAT_AT } from './config';
import { availableActions, act as engineAct } from './engine';
import { ENCOUNTER_KINDS, type Encounter, getEncounter, startEncounter } from './index';
import { ENCOUNTER_INTENTS } from './intents';
import { previewShift, startClock } from './tactics';

const brawlReady = MINIGAME_KINDS.brawl.ready;
beforeEach(() => {
  MINIGAME_KINDS.brawl.ready = true;
});
afterEach(() => {
  MINIGAME_KINDS.brawl.ready = brawlReady;
});

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

const RAID = {
  kind: 'raidDefense',
  spotId: 'ebertplatz',
  veedelId: 'neustadt-nord',
  opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count: 3 },
} as const;

/**
 * Überfall am Ebertplatz mit einem Läufer und dir vor Ort, angehalten: Der Straßenkampf wird weggenommen und bleibt
 * aus, damit die Runden von Hand laufen.
 */
function held(seed = 1): { sim: Simulation; id: number } {
  MINIGAME_KINDS.brawl.ready = true;
  const sim = createTestGame({ seed });
  const staffIds = [hireRunner(sim)];
  const { encounterId } = startEncounter(sim.ctx('gangs'), { ...RAID, staffIds, playerPresent: true });
  const e = get(sim, encounterId);
  const open = e.minigame;
  if (!open) throw new Error('Der Straßenkampf hätte starten müssen');
  e.minigame = null;
  sim.state.modules.minigames.active = sim.state.modules.minigames.active.filter((c) => c.id !== open.challengeId);
  MINIGAME_KINDS.brawl.ready = false;
  return { sim, id: encounterId };
}

const act = (sim: Simulation, encounterId: number, actionId: string, protect?: Encounter['protect']) =>
  engineAct(sim.ctx('gangs'), encounterId, actionId, protect ?? undefined);

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
    const { sim, id } = held();
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
      const { sim, id } = held(seed);
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

  it(`über ${AGGRESSION_FIGHT} Aggression beginnt die Schlägerei`, () => {
    const { sim, id } = held(2);
    const e = get(sim, id);
    e.intent = null;
    e.aggression = AGGRESSION_FIGHT - 1;
    act(sim, id, 'bluff');
    const after = get(sim, id);
    expect(after.aggression).toBeGreaterThanOrEqual(AGGRESSION_FIGHT);
    if (after.phase === 'rounds') expect(after.brawl).toBe(true);
  });

  it(`unter ${RETREAT_AT} Entschlossenheit zieht die Gegenseite ab: Erfolg`, () => {
    const { sim, id } = held(3);
    const events = recordEvents(sim);
    const e = get(sim, id);
    e.intent = null;
    e.resolve = RETREAT_AT + 1;
    e.aggression = 10;
    act(sim, id, 'negotiate');
    const done = get(sim, id);
    expect(done.outcome).toBe('success');
    expect(done.result?.ending).toBe('gaveUp');
    // Ereignisse aus einem direkten Aufruf kommen mit dem nächsten Schritt an.
    sim.advance(1);
    expect(eventsOfType(events, 'encounter.resolved')[0].payload.result?.ending).toBe('gaveUp');
  });

  it('Bullen rufen stellt die Polizei-Uhr auf 1; läuft sie ab, verlieren beide Seiten', () => {
    const { sim, id } = held(5);
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
    const sim = createTestGame({ seed: 1 });
    const kind = ENCOUNTER_KINDS.raidDefense;
    const calm = startClock(sim.state, { ...RAID }, kind);
    sim.state.modules.police.heat['neustadt-nord'] = 90;
    expect(startClock(sim.state, { ...RAID }, kind)).toBeLessThan(calm);
  });

  it('ein geschützter Einsatz nimmt nur einen Teil des Schadens, die passende Handlung wendet die Absicht ab', () => {
    const play = (protect: 'goods' | 'cash', actionId: string) => {
      const { sim, id } = held(6);
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

  it('Rollen: Den Nervösen bearbeiten nimmt ihn raus, dann gibt es den Zug nicht mehr', () => {
    const { sim, id } = held(8);
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

  it('das Ergebnis ist eine Mischung mit Teil-Ergebnissen pro Einsatz', () => {
    const sim = createTestGame({ seed: 10 });
    const { encounterId } = startEncounter(sim.ctx('gangs'), { ...RAID, staffIds: [hireRunner(sim)] });
    const parts = get(sim, encounterId).result?.parts ?? [];
    expect(parts.map((p) => p.stake)).toEqual(['goods', 'cash', 'people', 'spot', 'noise']);
    for (const part of parts) {
      expect(['kept', 'partial', 'lost']).toContain(part.state);
      expect(part.text.length).toBeGreaterThan(0);
    }
  });

  it('gleicher Seed, gleiche Befehle: gleiche Absichten und Zeiger', () => {
    const run = (seed: number) => {
      const { sim, id } = held(seed);
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

describe('Konfrontationen neu: Migration', () => {
  it('eine laufende Konfrontation aus Version 3 lädt mit Zeigern, Uhr und Absicht und wird ausgewürfelt (46d)', () => {
    const { sim, id } = held(12);
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
    expect(loaded.state.moduleVersions.encounters).toBe(6);
    const e = get(loaded, id);
    expect(e).toMatchObject({ resolve: 40, clock: 4, brawl: false });
    expect(e.intent).not.toBeNull();
    expect(e.foes).toHaveLength(3);
    expect(e.stakes).toHaveLength(5);
    // Ohne Akte wartet nichts mehr: Der erste Schritt würfelt aus.
    loaded.advance(1);
    expect(get(loaded, id).phase).toBe('done');
  });
});

describe('Anlässe: Situationen und Zoll', () => {
  it('jeder Anlass hat mindestens vier Situationstexte nach Ort, Tageszeit und Wetter', () => {
    for (const [id, kind] of Object.entries(ENCOUNTER_KINDS)) {
      expect(kind.situations?.length ?? 0, id).toBeGreaterThanOrEqual(4);
      const tagged = (kind.situations ?? []).filter((s) => s.settings || s.phases || s.weather);
      expect(tagged.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('die Zollkontrolle spielt am Hafen und auf der Autobahn mit eigenen Texten', () => {
    const sim = createTestGame();
    const start = (setting: 'port' | 'autobahn') =>
      get(
        sim,
        startEncounter(sim.ctx('logistics'), {
          kind: 'customsCheck',
          setting,
          place: 'bei Münster',
          stakes: { goods: 500 },
          playerPresent: true,
          skipEffects: true,
        }).encounterId,
      );
    const port = start('port');
    const autobahn = start('autobahn');
    expect(port.situation).toMatch(/Kai|Hafen|Container/);
    expect(autobahn.situation).toMatch(/Transporter/);
    expect(port.stakes.map((s) => s.id)).toEqual(['goods', 'people']);
  });

  it('der Text des Aufrufers hat Vorrang vor den Situationen des Anlasses', () => {
    const sim = createTestGame();
    const e = get(
      sim,
      startEncounter(sim.ctx('gangs'), {
        kind: 'raidDefense',
        veedelId: 'kalk',
        playerPresent: true,
        situation: 'Eigener Text {place}.',
      }).encounterId,
    );
    expect(e.situation).toBe('Eigener Text in Kalk.');
  });

  it('Ladung aufgeben beendet die Zollkontrolle sofort (verloren, aufgegeben)', () => {
    const sim = createTestGame();
    const id = startEncounter(sim.ctx('logistics'), {
      kind: 'customsCheck',
      setting: 'autobahn',
      playerPresent: true,
      skipEffects: true,
    }).encounterId;
    // Auftrag 44, Teil 8: Erst kommt das Minispiel „Papiere fälschen“ (es wartet); das Aufgeben ist sein Ausgang.
    const open = get(sim, id).minigame;
    if (!open) throw new Error('Die Papiere hätten starten müssen');
    sim.dispatch({ type: 'minigames.finish', payload: { id: open.challengeId, score: 0, picks: ['giveUp'] } });
    expect(get(sim, id)).toMatchObject({ phase: 'done', outcome: 'failure', result: { ending: 'surrendered' } });
  });
});

describe('Situationstexte nach Wetter', () => {
  it('bei Schnee kommt der Schnee-Text, wenn nichts Genaueres passt', () => {
    const sim = createTestGame();
    sim.state.modules.weather.kind = 'snow';
    const id = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'kalk',
      playerPresent: true,
    }).encounterId;
    expect(get(sim, id).situation).toMatch(/Schnee/);
  });
});

describe('Review: Rückzug ohne Sprung, Teil-Ergebnisse aus Gebuchtem, Einsätze nach Ort', () => {
  it('Abhauen: etwas Runden-Schaden an der Kasse kostet wenig, nicht gleich den ganzen Niederlage-Verlust', () => {
    const lostCash = (damage: number) => {
      const { sim, id } = held(13);
      wallet.earn(sim.ctx('test'), 10000, 'dirty', 'Test', 'income.other');
      const e = get(sim, id);
      const cash = e.stakes.find((s) => s.id === 'cash');
      if (!cash) throw new Error('keine Kasse');
      cash.damage = damage;
      act(sim, id, 'flee', 'cash');
      return Math.max(0, -(get(sim, id).result?.money ?? 0));
    };
    const none = lostCash(0);
    const little = lostCash(1);
    expect(none).toBe(0);
    expect(little).toBeLessThan(50);
  });

  it('Teil-Ergebnisse zeigen nur Gebuchtes: Rückzug ohne Kassenverlust heißt „gehalten“', () => {
    const { sim, id } = held(14);
    act(sim, id, 'flee', 'goods');
    const cash = get(sim, id).result?.parts?.find((p) => p.stake === 'cash');
    expect(cash).toEqual({ stake: 'cash', state: 'kept', text: 'gehalten' });
  });

  it('Überfall auf einer Auftragsfahrt: kein Spot und keine Kasse, keine Absicht „Spot zerlegen“', () => {
    const sim = createTestGame();
    const id = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'kalk',
      staffIds: [hireRunner(sim)],
      playerPresent: false,
      place: 'in Kalk',
    }).encounterId;
    const e = get(sim, id);
    expect(e.stakes.map((s) => s.id)).toEqual(['goods', 'people', 'noise']);
    for (const entry of e.log) expect(['wreck', 'grabCash']).not.toContain(entry.intent);
  });

  it('ohne Geld für die Bestechung bleibt auch der Schutz, wie er war', () => {
    const { sim, id } = held(15);
    wallet.lose(sim.ctx('test'), wallet.balance(sim.state, 'dirty'), 'dirty', 'Test', 'loss.encounter');
    const before = get(sim, id).protect;
    const result = act(sim, id, 'bribe', before === 'spot' ? 'cash' : 'spot');
    expect(result.ok).toBe(false);
    expect(get(sim, id).protect).toBe(before);
  });
});
