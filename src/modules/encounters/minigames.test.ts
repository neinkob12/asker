// Konfrontationen und Minispiele (Auftrag 44): starten, warten, Folgen je Art mit festen Scores, Rechte Hand, timeout,
// encounters.auto und Migration. Die Tests schalten die Arten für sich scharf (MINIGAME_KINDS ist reine Daten) und
// danach zurück. Seit Auftrag 46d gibt es keine Akte: Was nach dem Minispiel noch offen ist, spielen die Leute sofort
// aus (playOut), ein Minispiel ohne Ausgang (timeout) ebenso.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store } from '../goods';
import { getChallenge, MINIGAME_KINDS, MINIGAME_TIMEOUT, type MinigameKind } from '../minigames';
import { getHeat } from '../police';
import { getAllSpots, spotCity } from '../spots';
import { enlist, generateProfile, getStaffMember } from '../staff';
import { AGGRESSION_FIGHT, DECISION_TIMEOUT } from './config';
import { act as engineAct } from './engine';
import {
  applyBrawl,
  ENCOUNTER_KINDS,
  type Encounter,
  type EncounterRequest,
  getEncounter,
  migrateV4,
  startEncounter,
} from './index';

const READY: MinigameKind[] = ['chase', 'brawl', 'traffic', 'papers'];
const before = new Map<MinigameKind, boolean>();
beforeEach(() => {
  for (const kind of READY) {
    before.set(kind, MINIGAME_KINDS[kind].ready);
    MINIGAME_KINDS[kind].ready = true;
  }
});
afterEach(() => {
  for (const [kind, ready] of before) MINIGAME_KINDS[kind].ready = ready;
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

function begin(sim: Simulation, request: EncounterRequest): Encounter {
  const { encounterId } = startEncounter(sim.ctx('police'), request);
  sim.advance(1);
  return get(sim, encounterId);
}

const chaseRequest: EncounterRequest = {
  kind: 'policeChase',
  veedelId: 'ehrenfeld',
  playerPresent: true,
  opponent: { label: 'Polizei', strength: 1 },
  origin: { module: 'police', ref: 'check' },
};

const trafficRequest: EncounterRequest = {
  kind: 'vehicleCheck',
  veedelId: 'ehrenfeld',
  playerPresent: true,
  place: 'in Ehrenfeld',
  stakes: { goods: 40 },
  skipEffects: true,
  origin: { module: 'test', ref: 'trip:1' },
};

const customsRequest: EncounterRequest = {
  kind: 'customsCheck',
  playerPresent: true,
  setting: 'autobahn',
  place: 'an der A1',
  stakes: { goods: 40 },
  skipEffects: true,
  origin: { module: 'test', ref: 'trip:2' },
};

function raid(sim: Simulation, count = 3): Encounter {
  return begin(sim, {
    kind: 'raidDefense',
    spotId: 'ebertplatz',
    veedelId: 'neustadt-nord',
    staffIds: [hireRunner(sim)],
    playerPresent: true,
    opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count },
  });
}

const finish = (sim: Simulation, id: number, score: number, picks: string[] = []) =>
  sim.dispatch({ type: 'minigames.finish', payload: { id, score, picks } });

function challengeOf(e: Encounter): number {
  if (!e.minigame) throw new Error('Kein Minispiel offen');
  return e.minigame.challengeId;
}

function rightHand(sim: Simulation) {
  const recruit = (level: number) => {
    const ctx = sim.ctx('staff');
    const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
    m.stats.loyalty = 70;
    return m;
  };
  const spots = getAllSpots(sim.state).filter((s) => spotCity(s) === 'koeln');
  sim.state.modules.spots.unlocked = spots.map((s) => s.id);
  for (const spot of spots.slice(0, 2)) {
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: recruit(4).id, spotIds: [spot.id] } });
  }
  const m = recruit(5);
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: m.id } }).ok).toBe(true);
  return m;
}

describe('Konfrontationen mit Minispielen: Daten', () => {
  it('die Anlässe nennen ihre Minispiele wie im Auftrag', () => {
    expect(ENCOUNTER_KINDS.policeChase.minigames).toEqual({ start: 'chase' });
    expect(ENCOUNTER_KINDS.vehicleCheck.minigames).toEqual({ start: 'traffic', actions: { speedOff: 'chase' } });
    expect(ENCOUNTER_KINDS.customsCheck.minigames).toEqual({ start: 'papers' });
    for (const id of ['raidDefense', 'dealGoneWrong', 'recoverLoot', 'gangSpotRaid', 'debtCollection']) {
      expect(ENCOUNTER_KINDS[id].minigames).toEqual({ actions: { fight: 'brawl' }, brawl: 'brawl' });
    }
  });
});

describe('Konfrontationen mit Minispielen: starten und warten', () => {
  it('ohne den Spieler oder mit einer Art, die nicht scharf ist, ist alles sofort entschieden', () => {
    const sim = createTestGame();
    const remote = begin(sim, { ...chaseRequest, playerPresent: false, staffIds: [hireRunner(sim)] });
    expect(remote.minigame ?? null).toBeNull();
    expect(remote.phase).toBe('done');
    MINIGAME_KINDS.chase.ready = false;
    const off = begin(sim, { ...chaseRequest, origin: { module: 'police', ref: 'check2' } });
    expect(off.minigame ?? null).toBeNull();
    expect(off.phase).toBe('done');
  });

  it('Polizeiflucht mit dir: die Verfolgungsjagd startet sofort, die Konfrontation wartet auf ihren Ausgang', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const e = begin(sim, chaseRequest);
    expect(e.phase).toBe('rounds');
    expect(e.minigame).toMatchObject({ kind: 'chase', trigger: 'start' });
    const c = getChallenge(sim.state, challengeOf(e));
    expect(c).toMatchObject({ kind: 'chase', origin: { module: 'encounters', ref: String(e.id) }, cityId: 'koeln' });
    expect(c?.params).toMatchObject({ encounterKind: 'policeChase', setting: 'street', clock: e.clock });
    expect(c?.params.start).toHaveLength(2);
    expect(eventsOfType(events, 'minigame.started')).toHaveLength(1);
    expect(eventsOfType(events, 'encounter.resolved')).toHaveLength(0);
    // Die Runde läuft nicht, solange das Minispiel offen ist.
    expect(engineAct(sim.ctx('police'), e.id, 'run')).toEqual({ ok: false, reason: 'Erst das Minispiel.' });
  });

  it('timeout beim Start: die Leute spielen sofort aus (Auftrag 46d)', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    sim.advance(MINIGAME_TIMEOUT);
    const after = get(sim, e.id);
    expect(after.minigame).toBeNull();
    expect(after.phase).toBe('done');
    expect(after.round).toBeGreaterThan(0);
  });

  it('encounters.auto löst ein offenes Minispiel als timeout auf und würfelt wie bisher aus', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    const id = challengeOf(e);
    expect(sim.dispatch({ type: 'encounters.auto', payload: { encounterId: e.id } }).ok).toBe(true);
    expect(getChallenge(sim.state, id)).toBeUndefined();
    expect(get(sim, e.id).phase).toBe('done');
    expect(sim.state.modules.minigames.history[0]).toMatchObject({ id, by: 'timeout' });
  });

  it('die Frist der Konfrontation löst auch eine wartende Konfrontation auf (nichts bleibt hängen)', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    sim.advance(DECISION_TIMEOUT + 1);
    expect(get(sim, e.id).phase).toBe('done');
    expect(sim.state.modules.minigames.active).toHaveLength(0);
  });
});

describe('applyChase', () => {
  it('geschafft: entkommen (Erfolg), nicht geschafft: gefasst (Niederlage)', () => {
    const sim = createTestGame();
    const won = begin(sim, chaseRequest);
    expect(finish(sim, challengeOf(won), 0.8).ok).toBe(true);
    expect(get(sim, won.id)).toMatchObject({ phase: 'done', outcome: 'success' });
    expect(get(sim, won.id).result?.ending).toBe('fled');
    const lost = begin(sim, { ...chaseRequest, origin: { module: 'police', ref: 'check2' } });
    finish(sim, challengeOf(lost), 0.2);
    expect(get(sim, lost.id)).toMatchObject({ phase: 'done', outcome: 'failure' });
  });

  it('dumped: Ware aus dem Fenster', () => {
    const sim = createTestGame();
    store(sim.ctx('goods'), { productId: 'weed', amount: 200 });
    const stock = getStock(sim.state);
    const e = begin(sim, chaseRequest);
    finish(sim, challengeOf(e), 0.9, ['dumped']);
    const after = get(sim, e.id);
    expect(after.goodsDropped).toBeGreaterThanOrEqual(5);
    expect(getStock(sim.state)).toBe(stock - after.goodsDropped);
  });
});

describe('applyTraffic', () => {
  it('geschafft: weiterfahren; nicht geschafft: Ladung aufgeflogen', () => {
    const sim = createTestGame();
    const won = begin(sim, trafficRequest);
    expect(won.minigame).toMatchObject({ kind: 'traffic', trigger: 'start' });
    finish(sim, challengeOf(won), 0.6);
    expect(get(sim, won.id).outcome).toBe('success');
    const lost = begin(sim, { ...trafficRequest, origin: { module: 'test', ref: 'trip:9' } });
    finish(sim, challengeOf(lost), 0.3);
    expect(get(sim, lost.id).outcome).toBe('failure');
  });

  it('bribe: Bestechungsgeld zahlen, Erfolg', () => {
    const sim = createTestGame();
    const e = begin(sim, trafficRequest);
    const money = wallet.balance(sim.state, 'dirty');
    finish(sim, challengeOf(e), 0.3, ['bribe']);
    const after = get(sim, e.id);
    expect(after.outcome).toBe('success');
    expect(after.bribeSpent).toBe(e.bribeCost);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money - e.bribeCost);
  });

  it('flee: Gas geben startet die Verfolgungsjagd; entkommen heißt davongefahren (Rückzug)', () => {
    const sim = createTestGame();
    const e = begin(sim, trafficRequest);
    finish(sim, challengeOf(e), 0.5, ['flee']);
    const chasing = get(sim, e.id);
    expect(chasing.minigame).toMatchObject({ kind: 'chase', trigger: 'action', actionId: 'speedOff' });
    finish(sim, challengeOf(chasing), 0.9);
    expect(get(sim, e.id)).toMatchObject({ phase: 'done', outcome: 'retreat' });
  });

  it('flee ohne scharfe Verfolgungsjagd: die Runde „Gas geben“ wie bisher, danach entschieden', () => {
    const sim = createTestGame();
    MINIGAME_KINDS.chase.ready = false;
    const e = begin(sim, trafficRequest);
    finish(sim, challengeOf(e), 0.5, ['flee']);
    const after = get(sim, e.id);
    expect(after.minigame).toBeNull();
    expect(after.log.some((l) => l.actionId === 'speedOff')).toBe(true);
    expect(after.phase).toBe('done');
  });

  it('timeout der Verkehrskontrolle: die Leute spielen sofort aus; nur „Gas geben“ wartet wieder auf dich', () => {
    const sim = createTestGame();
    const e = begin(sim, trafficRequest);
    get(sim, e.id).deadline += 1000;
    sim.advance(MINIGAME_TIMEOUT);
    const after = get(sim, e.id);
    const waiting = after.phase === 'rounds';
    if (waiting) expect(after.minigame).toMatchObject({ kind: 'chase', trigger: 'action', actionId: 'speedOff' });
    expect(sim.dispatch({ type: 'encounters.auto', payload: { encounterId: e.id } }).ok).toBe(waiting);
    expect(get(sim, e.id).phase).toBe('done');
    expect(sim.state.modules.minigames.active).toHaveLength(0);
  });
});

describe('applyTraffic (Teil 4)', () => {
  it('Schein ohne genug Schwarzgeld: aufgeflogen, nichts bezahlt', () => {
    const sim = createTestGame();
    const e = begin(sim, trafficRequest);
    const dirty = wallet.balance(sim.state, 'dirty');
    wallet.pay(sim.ctx('test'), dirty, 'dirty', 'Test', 'loss.police');
    finish(sim, challengeOf(e), 0.6, ['bribe']);
    const after = get(sim, e.id);
    expect(after.outcome).toBe('failure');
    expect(after.bribeSpent).toBe(0);
    expect(after.log.at(-1)?.text).toContain('Schein fehlt');
  });

  it('durch, aber mit Widersprüchen: er notiert das Kennzeichen (Heat, höchstens zwei zählen)', () => {
    const sim = createTestGame();
    const clean = begin(sim, trafficRequest);
    finish(sim, challengeOf(clean), 0.8);
    expect(get(sim, clean.id)).toMatchObject({ outcome: 'success', extraHeat: 0 });
    const heat = getHeat(sim.state, 'ehrenfeld');
    const noted = begin(sim, { ...trafficRequest, origin: { module: 'test', ref: 'trip:7' } });
    finish(sim, challengeOf(noted), 0.6, ['lies:5']);
    const after = get(sim, noted.id);
    expect(after.outcome).toBe('success');
    expect(after.extraHeat).toBe(6);
    expect(after.log.at(-1)?.text).toContain('Kennzeichen');
    expect(getHeat(sim.state, 'ehrenfeld')).toBeGreaterThan(heat);
  });

  it('die Rechte Hand redet mit ihrem Score; timeout entscheidet sofort', () => {
    const sim = createTestGame();
    rightHand(sim);
    const e = begin(sim, trafficRequest);
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id: challengeOf(e) } }).ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.phase).toBe('done');
    expect(after.log.some((l) => l.text.includes('Rechte Hand'))).toBe(true);

    const waiting = begin(sim, { ...trafficRequest, origin: { module: 'test', ref: 'trip:8' } });
    get(sim, waiting.id).deadline += 1000;
    sim.advance(MINIGAME_TIMEOUT);
    const timedOut = get(sim, waiting.id);
    // Entschieden, oder die Leute sind in die Verfolgungsjagd gefahren (die wartet wieder auf dich).
    if (timedOut.minigame) expect(timedOut.minigame.kind).toBe('chase');
    else expect(timedOut.phase).toBe('done');
  });
});

describe('applyPapers', () => {
  it('geschafft, nicht geschafft, bestechen und aufgeben', () => {
    const sim = createTestGame();
    const won = begin(sim, customsRequest);
    expect(won.minigame).toMatchObject({ kind: 'papers', trigger: 'start' });
    finish(sim, challengeOf(won), 0.7);
    expect(get(sim, won.id).outcome).toBe('success');

    const lost = begin(sim, { ...customsRequest, origin: { module: 'test', ref: 'trip:3' } });
    finish(sim, challengeOf(lost), 0.2);
    expect(get(sim, lost.id)).toMatchObject({ outcome: 'failure' });
    expect(get(sim, lost.id).result?.ending).toBe('resolved');

    const bribe = begin(sim, { ...customsRequest, origin: { module: 'test', ref: 'trip:4' } });
    finish(sim, challengeOf(bribe), 0.1, ['bribe']);
    expect(get(sim, bribe.id).outcome).toBe('success');
    expect(get(sim, bribe.id).bribeSpent).toBe(bribe.bribeCost);

    const giveUp = begin(sim, { ...customsRequest, origin: { module: 'test', ref: 'trip:5' } });
    finish(sim, challengeOf(giveUp), 0.1, ['giveUp']);
    expect(get(sim, giveUp.id)).toMatchObject({ outcome: 'failure' });
    expect(get(sim, giveUp.id).result?.ending).toBe('surrendered');
  });
});

describe('applyPapers (Teil 8)', () => {
  it('der Zoll am Kai gibt Ort und Bestechungsgeld mit', () => {
    const sim = createTestGame();
    const e = begin(sim, { ...customsRequest, setting: 'port', place: 'in Rotterdam' });
    const c = getChallenge(sim.state, challengeOf(e));
    expect(c?.kind).toBe('papers');
    expect(c?.params).toMatchObject({ setting: 'port', bribeCost: e.bribeCost });
    expect(e.bribeCost).toBeGreaterThan(0);
  });

  it('Schein ohne genug Schwarzgeld: aufgeflogen, nichts bezahlt', () => {
    const sim = createTestGame();
    const e = begin(sim, customsRequest);
    wallet.pay(sim.ctx('test'), wallet.balance(sim.state, 'dirty'), 'dirty', 'Test', 'loss.police');
    finish(sim, challengeOf(e), 0.6, ['bribe', 'hits:1']);
    const after = get(sim, e.id);
    expect(after).toMatchObject({ outcome: 'failure', bribeSpent: 0 });
    expect(after.log.at(-1)?.text).toContain('Umschlag ist leer');
  });

  it('mit einem Fehler durch: abgefertigt, er notiert sich die Spedition', () => {
    const sim = createTestGame();
    const e = begin(sim, customsRequest);
    finish(sim, challengeOf(e), 0.5, ['fixed:2', 'hits:1']);
    const after = get(sim, e.id);
    expect(after.outcome).toBe('success');
    expect(after.log.at(-1)?.text).toContain('Spedition');
  });

  it('die Rechte Hand mit ihrem Score; timeout entscheidet sofort', () => {
    const sim = createTestGame();
    rightHand(sim);
    const e = begin(sim, customsRequest);
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id: challengeOf(e) } }).ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.phase).toBe('done');
    expect(after.log.some((l) => l.text.includes('Rechte Hand'))).toBe(true);

    const waiting = begin(sim, { ...customsRequest, origin: { module: 'test', ref: 'trip:9' } });
    get(sim, waiting.id).deadline += 1000;
    sim.advance(MINIGAME_TIMEOUT);
    const timedOut = get(sim, waiting.id);
    expect(timedOut.minigame).toBeNull();
    expect(timedOut.phase).toBe('done');
  });
});

describe('applyBrawl', () => {
  it('Überfall mit dir vor Ort: der Straßenkampf startet sofort, mit dem Schutz der Runde (Auftrag 46d)', () => {
    const sim = createTestGame();
    const e = raid(sim);
    expect(e.minigame).toMatchObject({ kind: 'brawl', trigger: 'brawl', protect: e.protect });
    expect(e.round).toBe(0);
    expect(e.phase).toBe('rounds');
    const c = getChallenge(sim.state, challengeOf(e));
    expect(c?.params).toMatchObject({ opponent: { count: 3 } });
    expect(c?.params.crew).toHaveLength(1);
  });

  it('alle Gegner am Boden: Erfolg (beaten)', () => {
    const sim = createTestGame();
    const e = raid(sim);
    finish(sim, challengeOf(get(sim, e.id)), 1, ['down:2', 'fled:1']);
    const after = get(sim, e.id);
    expect(after).toMatchObject({ phase: 'done', outcome: 'success' });
    expect(after.result?.ending).toBe('beaten');
    expect(after.opponent.down).toBe(2);
  });

  it('ko: Niederlage, du bist verletzt, stirbst aber nie', () => {
    const sim = createTestGame();
    const e = raid(sim);
    finish(sim, challengeOf(get(sim, e.id)), 0, ['ko', 'playerHurt']);
    const after = get(sim, e.id);
    expect(after).toMatchObject({ phase: 'done', outcome: 'failure', playerKilled: false });
    expect(after.result?.ending).toBe('overrun');
    expect(after.result?.playerInjured).toBe(true);
    expect(sim.state.outcome.gameOver).toBeNull();
  });

  it('sonst: der Kampf zählt als Runde, eigene Verletzte bleiben, die Leute spielen den Rest sofort aus (46d)', () => {
    const sim = createTestGame();
    const e = raid(sim, 4);
    const staffId = e.participants.find((p) => !p.isPlayer)?.id ?? '';
    get(sim, e.id).resolve = 90;
    finish(sim, challengeOf(get(sim, e.id)), 0.4, ['down:1', `hurt:${staffId}`]);
    const after = get(sim, e.id);
    // Entschieden, oder die Leute schlagen wieder zu (ein neuer Straßenkampf wartet auf dich).
    if (after.minigame) expect(after.minigame).toMatchObject({ kind: 'brawl' });
    else expect(after.phase).toBe('done');
    expect(after.log[0]).toMatchObject({ round: 1, actionId: 'minigame:brawl' });
    expect(after.round).toBeGreaterThanOrEqual(1);
    expect(after.participants.find((p) => p.id === staffId)?.condition).not.toBe('ok');
    expect(after.opponent.down).toBeGreaterThanOrEqual(1);
  });

  it('kippt die Aggression in einer Runde in eine Schlägerei, kommt vor der nächsten Runde der Kampf', () => {
    const sim = createTestGame();
    const e = raid(sim, 4);
    // Den Kampf vom Start wegnehmen, damit eine Runde von Hand läuft.
    const open = challengeOf(e);
    get(sim, e.id).minigame = null;
    sim.state.modules.minigames.active = sim.state.modules.minigames.active.filter((c) => c.id !== open);
    const live = get(sim, e.id);
    live.aggression = AGGRESSION_FIGHT + 20;
    live.resolve = 95;
    live.clock = 6;
    expect(live.brawl).toBe(false);
    expect(engineAct(sim.ctx('gangs'), e.id, 'hold').ok).toBe(true);
    const after = get(sim, e.id);
    expect(after).toMatchObject({ phase: 'rounds', brawl: true });
    expect(after.minigame).toMatchObject({ kind: 'brawl', trigger: 'brawl' });
    // timeout: die Leute spielen den Rest aus.
    sim.advance(MINIGAME_TIMEOUT);
    expect(get(sim, e.id).minigame).toBeNull();
    expect(get(sim, e.id).phase).toBe('done');
  });

  it('grabbed: einer ist mit der Beute weg, der Einsatz der Absicht nimmt Schaden (geschützt nur zum Teil)', () => {
    // Die Folge direkt anwenden: So ist der Schaden am Einsatz zu sehen, bevor die Leute weiterspielen.
    const damageOf = (protect: 'goods' | 'cash') => {
      const sim = createTestGame();
      const e = raid(sim, 4);
      const live = get(sim, e.id);
      const open = live.minigame;
      if (!open) throw new Error('kein Kampf');
      live.minigame = null;
      live.intent = 'grabGoods';
      live.resolve = 95;
      live.protect = protect;
      const kind = ENCOUNTER_KINDS.raidDefense;
      const result = { score: 0.3, won: false, picks: ['down:1', 'fled:1', 'grabbed'], by: 'player' as const };
      applyBrawl(sim.ctx('gangs'), live, kind, { ...open, protect }, result);
      expect(live.log.at(-1)?.text).toContain('Ware davon');
      return live.stakes.find((s) => s.id === 'goods')?.damage ?? -1;
    };
    const open = damageOf('cash');
    const shielded = damageOf('goods');
    expect(open).toBeGreaterThan(0);
    expect(shielded).toBeGreaterThan(0);
    expect(shielded).toBeLessThan(open);
  });

  it('sirens: die Polizei-Uhr lief im Kampf ab, die Konfrontation endet wie bei abgelaufener Uhr', () => {
    const sim = createTestGame();
    const e = raid(sim, 4);
    get(sim, e.id).resolve = 95;
    get(sim, e.id).clock = 5;
    finish(sim, challengeOf(get(sim, e.id)), 0.3, ['down:1', 'sirens']);
    const after = get(sim, e.id);
    expect(after.phase).toBe('done');
    expect(after.result?.ending).toBe('clock');
    expect(after.opponent.down).toBe(1);
  });

  it('die Rechte Hand übernimmt mit ihrem Score (ohne picks)', () => {
    const sim = createTestGame();
    rightHand(sim);
    const e = raid(sim, 2);
    const id = challengeOf(get(sim, e.id));
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id } }).ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.minigame).toBeNull();
    expect(after.log[0]?.actionId).toBe('minigame:brawl');
    expect(getStaffMember(sim.state, after.participants[1]?.id ?? '')).toBeDefined();
  });
});

describe('Konfrontationen mit Minispielen: Spielstand', () => {
  it('Migration 4 → 5: laufende Konfrontationen bekommen minigame null', () => {
    const sim = createTestGame();
    const e = raid(sim);
    const state = structuredClone(sim.state);
    for (const x of state.modules.encounters.active) delete x.minigame;
    state.moduleVersions.encounters = 4;
    const loaded = loadSimulation(state, sim.modules);
    expect(loaded.state.moduleVersions.encounters).toBe(6);
    expect(get(loaded, e.id).minigame).toBeNull();
    expect(migrateV4({ active: [], history: [] })).toEqual({ active: [], history: [] });
  });

  it('ein offenes Minispiel übersteht Speichern und Laden und lässt sich danach beenden', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    const loaded = loadSimulation(structuredClone(sim.state), sim.modules);
    expect(finish(loaded, challengeOf(get(loaded, e.id)), 0.9).ok).toBe(true);
    expect(get(loaded, e.id).outcome).toBe('success');
  });
});
