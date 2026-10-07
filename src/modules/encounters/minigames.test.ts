// Konfrontationen und Minispiele (Auftrag 44, Teil 0): starten, warten, Folgen je Art mit festen Scores, Rechte Hand,
// timeout, encounters.auto und Migration. Die Arten außer dem Tresor sind in Teil 0 noch nicht scharf; die Tests
// schalten sie für sich ein (MINIGAME_KINDS ist reine Daten) und danach wieder aus.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store } from '../goods';
import { getChallenge, MINIGAME_KINDS, MINIGAME_TIMEOUT, type MinigameKind } from '../minigames';
import { getHeat } from '../police';
import { getAllSpots, spotCity } from '../spots';
import { enlist, generateProfile, getStaffMember } from '../staff';
import { AGGRESSION_FIGHT, BRAWL_AFTER_AGGRESSION, DECISION_TIMEOUT } from './config';
import {
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
  it('ohne den Spieler oder mit einer Art, die nicht scharf ist, bleibt alles wie bisher', () => {
    const sim = createTestGame();
    const remote = begin(sim, { ...chaseRequest, playerPresent: false, staffIds: [hireRunner(sim)] });
    expect(remote.minigame ?? null).toBeNull();
    MINIGAME_KINDS.chase.ready = false;
    const off = begin(sim, { ...chaseRequest, origin: { module: 'police', ref: 'check2' } });
    expect(off.minigame ?? null).toBeNull();
    expect(off.phase).toBe('rounds');
  });

  it('Polizeiflucht mit dir: die Verfolgungsjagd startet sofort, Runden, Schutz und Spezialzüge warten', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const e = begin(sim, chaseRequest);
    expect(e.minigame).toMatchObject({ kind: 'chase', trigger: 'start' });
    const c = getChallenge(sim.state, challengeOf(e));
    expect(c).toMatchObject({ kind: 'chase', origin: { module: 'encounters', ref: String(e.id) }, cityId: 'koeln' });
    expect(c?.params).toMatchObject({ encounterKind: 'policeChase', setting: 'street', clock: e.clock });
    expect(c?.params.start).toHaveLength(2);
    expect(eventsOfType(events, 'minigame.started')).toHaveLength(1);
    const act = sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'run' } });
    expect(act).toEqual({ ok: false, reason: 'Erst das Minispiel.' });
    expect(sim.dispatch({ type: 'encounters.protect', payload: { encounterId: e.id, stake: 'goods' } }).ok).toBe(false);
  });

  it('timeout beim Start: die Runden laufen wie bisher weiter', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    sim.advance(MINIGAME_TIMEOUT);
    const after = get(sim, e.id);
    expect(after.minigame).toBeNull();
    expect(after.phase).toBe('rounds');
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'run' } }).ok).toBe(true);
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

  it('flee ohne scharfe Verfolgungsjagd: die Runde „Gas geben“ wie bisher', () => {
    const sim = createTestGame();
    MINIGAME_KINDS.chase.ready = false;
    const e = begin(sim, trafficRequest);
    finish(sim, challengeOf(e), 0.5, ['flee']);
    const after = get(sim, e.id);
    expect(after.minigame).toBeNull();
    expect(after.log.some((l) => l.actionId === 'speedOff')).toBe(true);
  });

  it('„Gas geben“ in der Runde startet die Verfolgungsjagd; timeout spielt die Runde mit dem alten Würfel', () => {
    const sim = createTestGame();
    const e = begin(sim, trafficRequest);
    // Die Frist der Konfrontation soll hier nicht dazwischenkommen.
    get(sim, e.id).deadline += 1000;
    sim.advance(MINIGAME_TIMEOUT);
    expect(get(sim, e.id).minigame).toBeNull();
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'speedOff' } }).ok).toBe(
      true,
    );
    expect(get(sim, e.id).minigame).toMatchObject({ kind: 'chase', trigger: 'action', actionId: 'speedOff' });
    expect(get(sim, e.id).round).toBe(0);
    sim.advance(MINIGAME_TIMEOUT);
    const after = get(sim, e.id);
    expect(after.log.some((l) => l.actionId === 'speedOff')).toBe(true);
    expect(after.round).toBe(1);
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

  it('die Rechte Hand redet mit ihrem Score; timeout lässt die Runden laufen wie bisher', () => {
    const sim = createTestGame();
    rightHand(sim);
    const e = begin(sim, trafficRequest);
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id: challengeOf(e) } }).ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.phase).toBe('done');
    expect(after.log.at(-1)?.text).toContain('Rechte Hand');

    const waiting = begin(sim, { ...trafficRequest, origin: { module: 'test', ref: 'trip:8' } });
    get(sim, waiting.id).deadline += 1000;
    sim.advance(MINIGAME_TIMEOUT);
    const timedOut = get(sim, waiting.id);
    expect(timedOut.minigame).toBeNull();
    expect(timedOut).toMatchObject({ phase: 'rounds', round: 0 });
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

  it('die Rechte Hand mit ihrem Score; timeout lässt die Runden laufen wie bisher', () => {
    const sim = createTestGame();
    rightHand(sim);
    const e = begin(sim, customsRequest);
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id: challengeOf(e) } }).ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.phase).toBe('done');
    expect(after.log.at(-1)?.text).toContain('Rechte Hand');

    const waiting = begin(sim, { ...customsRequest, origin: { module: 'test', ref: 'trip:9' } });
    get(sim, waiting.id).deadline += 1000;
    sim.advance(MINIGAME_TIMEOUT);
    const timedOut = get(sim, waiting.id);
    expect(timedOut.minigame).toBeNull();
    expect(timedOut).toMatchObject({ phase: 'rounds', round: 0 });
  });
});

describe('applyBrawl', () => {
  it('Zuschlagen startet den Straßenkampf statt der Runde (mit Schutz)', () => {
    const sim = createTestGame();
    const e = raid(sim);
    const act = sim.dispatch({
      type: 'encounters.act',
      payload: { encounterId: e.id, actionId: 'fight', protect: 'cash' },
    });
    expect(act.ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.minigame).toMatchObject({ kind: 'brawl', trigger: 'action', actionId: 'fight', protect: 'cash' });
    expect(after.round).toBe(0);
    const c = getChallenge(sim.state, challengeOf(after));
    expect(c?.params).toMatchObject({ opponent: { count: 3 } });
    expect(c?.params.crew).toHaveLength(1);
  });

  it('alle Gegner am Boden: Erfolg (beaten)', () => {
    const sim = createTestGame();
    const e = raid(sim);
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'fight' } });
    finish(sim, challengeOf(get(sim, e.id)), 1, ['down:2', 'fled:1']);
    const after = get(sim, e.id);
    expect(after).toMatchObject({ phase: 'done', outcome: 'success' });
    expect(after.result?.ending).toBe('beaten');
    expect(after.opponent.down).toBe(2);
  });

  it('ko: Niederlage, du bist verletzt, stirbst aber nie', () => {
    const sim = createTestGame();
    const e = raid(sim);
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'fight' } });
    finish(sim, challengeOf(get(sim, e.id)), 0, ['ko', 'playerHurt']);
    const after = get(sim, e.id);
    expect(after).toMatchObject({ phase: 'done', outcome: 'failure', playerKilled: false });
    expect(after.result?.ending).toBe('overrun');
    expect(after.result?.playerInjured).toBe(true);
    expect(sim.state.outcome.gameOver).toBeNull();
  });

  it('sonst: Aggression auf 60, Entschlossenheit −15 je Gegner am Boden, eigene Verletzte, die Runden laufen weiter', () => {
    const sim = createTestGame();
    const e = raid(sim, 4);
    const staffId = e.participants.find((p) => !p.isPlayer)?.id ?? '';
    get(sim, e.id).resolve = 90;
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'fight' } });
    const mid = get(sim, e.id);
    const resolve = mid.resolve;
    const clock = mid.clock;
    finish(sim, challengeOf(mid), 0.4, ['down:1', `hurt:${staffId}`]);
    const after = get(sim, e.id);
    expect(after.phase).toBe('rounds');
    expect(after.minigame).toBeNull();
    expect(after.aggression).toBeLessThanOrEqual(BRAWL_AFTER_AGGRESSION);
    expect(after.resolve).toBe(resolve - 15);
    expect(after.round).toBe(1);
    expect(after.clock).toBe(clock - 1);
    expect(after.participants.find((p) => p.id === staffId)?.condition).toBe('injured');
    expect(sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'hold' } }).ok).toBe(true);
  });

  it('kippt die Aggression in einer Runde in eine Schlägerei, kommt vor der nächsten Runde der Kampf', () => {
    const sim = createTestGame();
    const e = raid(sim, 4);
    const live = get(sim, e.id);
    live.aggression = AGGRESSION_FIGHT + 20;
    live.resolve = 95;
    live.clock = 6;
    expect(live.brawl).toBe(false);
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'hold' } });
    const after = get(sim, e.id);
    expect(after).toMatchObject({ phase: 'rounds', brawl: true });
    expect(after.minigame).toMatchObject({ kind: 'brawl', trigger: 'brawl' });
    // timeout: weiter wie bisher (keine Runde dazu)
    const round = after.round;
    sim.advance(MINIGAME_TIMEOUT);
    expect(get(sim, e.id).minigame).toBeNull();
    expect(get(sim, e.id).round).toBe(round);
  });

  it('grabbed: einer ist mit der Beute weg, der Einsatz der Absicht nimmt Schaden (geschützt nur zum Teil)', () => {
    const damageOf = (protect: 'goods' | 'cash') => {
      const sim = createTestGame();
      const e = raid(sim, 4);
      get(sim, e.id).intent = 'grabGoods';
      get(sim, e.id).resolve = 95;
      sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'fight', protect } });
      finish(sim, challengeOf(get(sim, e.id)), 0.3, ['down:1', 'fled:1', 'grabbed']);
      const after = get(sim, e.id);
      expect(after.log.at(-1)?.text).toContain('Ware davon');
      return after.stakes.find((s) => s.id === 'goods')?.damage ?? -1;
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
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'fight' } });
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
    sim.dispatch({ type: 'encounters.act', payload: { encounterId: e.id, actionId: 'fight' } });
    const id = challengeOf(get(sim, e.id));
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id } }).ok).toBe(true);
    const after = get(sim, e.id);
    expect(after.minigame).toBeNull();
    expect(after.log.at(-1)?.actionId).toBe('minigame:brawl');
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
    expect(loaded.state.moduleVersions.encounters).toBe(5);
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
