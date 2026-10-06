// Tests des Moduls minigames (Auftrag 44, Teil 0): starten, Ergebnis mit Grenzen, Rechte Hand, Frist, ready.

import { afterEach, describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getAllSpots, spotCity } from '../spots';
import { enlist, generateProfile } from '../staff';
import {
  activeChallenge,
  delegateChance,
  delegateInfo,
  getChallenge,
  isMinigameReady,
  MINIGAME_KIND_IDS,
  MINIGAME_KINDS,
  MINIGAME_TIMEOUT,
  type MinigameKind,
  minigameDifficulty,
  minigameStats,
  PICKS_MAX,
  RIGHT_HAND_LOSE_SCORE,
  RIGHT_HAND_WIN_SCORE,
  resolveMinigameNow,
  startMinigame,
} from './index';

const origin = { module: 'test', ref: 'eins' };

function start(sim: Simulation, kind: MinigameKind = 'safe', ref = 'eins'): number | null {
  return startMinigame(sim.ctx('minigames'), {
    kind,
    origin: { module: 'test', ref },
    veedelId: 'ehrenfeld',
    title: 'Tresor knacken',
    situation: 'Ein Tresor.',
    params: { max: 1000 },
  });
}

function recruit(sim: Simulation, level: number) {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
  m.stats.loyalty = 70;
  return m;
}

function ok(result: { ok: boolean; reason?: string }) {
  if (!result.ok) throw new Error(result.reason);
}

/** Rechte Hand in Köln (lohnt sich erst ab zwei Leutnants). */
function rightHand(sim: Simulation) {
  const spots = getAllSpots(sim.state).filter((s) => spotCity(s) === 'koeln');
  sim.state.modules.spots.unlocked = spots.map((s) => s.id);
  for (const spot of spots.slice(0, 2)) {
    ok(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: recruit(sim, 4).id, spotIds: [spot.id] } }));
  }
  const m = recruit(sim, 5);
  ok(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: m.id } }));
  return m;
}

const restore: [MinigameKind, boolean][] = [];
afterEach(() => {
  for (const [kind, ready] of restore.splice(0)) MINIGAME_KINDS[kind].ready = ready;
});

describe('Minispiele: Daten', () => {
  it('kennt alle zehn Arten mit Name, Wert und ready; scharf ist in Teil 0 der Tresor', () => {
    expect(MINIGAME_KIND_IDS).toHaveLength(10);
    for (const kind of MINIGAME_KIND_IDS) {
      const def = MINIGAME_KINDS[kind];
      expect(def.name.length).toBeGreaterThan(3);
      expect(['speed', 'caution', 'strength', 'charisma']).toContain(def.stat);
    }
    expect(isMinigameReady('safe')).toBe(true);
    expect(isMinigameReady('nope')).toBe(false);
  });
});

describe('Minispiele: starten', () => {
  it('legt eine Challenge mit festem Seed, Schwierigkeit und Frist an und meldet sie', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const id = start(sim);
    expect(id).toBe(1);
    const c = getChallenge(sim.state, id ?? 0);
    expect(c).toMatchObject({ kind: 'safe', origin, cityId: 'koeln', veedelId: 'ehrenfeld', params: { max: 1000 } });
    expect(c?.deadline).toBe(sim.state.time + MINIGAME_TIMEOUT);
    expect(c?.difficulty).toBeGreaterThanOrEqual(0.2);
    expect(c?.difficulty).toBeLessThanOrEqual(0.95);
    // Gleicher Spiel-Seed und gleiche ID: gleicher Seed des Minispiels.
    const again = createTestGame();
    expect(getChallenge(again.state, start(again) ?? 0)?.seed).toBe(c?.seed);
    sim.advance(1);
    expect(eventsOfType(events, 'minigame.started')[0].payload).toEqual({ id, kind: 'safe', origin, cityId: 'koeln' });
    expect(activeChallenge(sim.state)?.id).toBe(id);
  });

  it('verschiebt weder die Würfelfolge noch die IDs anderer Module', () => {
    const a = createTestGame({ seed: 3 });
    const b = createTestGame({ seed: 3 });
    start(b);
    expect(b.state.nextId).toBe(a.state.nextId);
    expect(b.state.rng).toEqual(a.state.rng);
  });

  it('startet keine Art, die nicht scharf ist, und nur eine pro Auslöser', () => {
    const sim = createTestGame();
    // Eine Art, die (noch) nicht scharf ist: hier die Verfolgungsjagd, kurz abgeschaltet.
    restore.push(['chase', MINIGAME_KINDS.chase.ready]);
    MINIGAME_KINDS.chase.ready = false;
    expect(start(sim, 'chase')).toBeNull();
    expect(start(sim)).not.toBeNull();
    expect(start(sim)).toBeNull();
    expect(start(sim, 'safe', 'zwei')).not.toBeNull();
  });

  it('startet nach dem Spielende nichts mehr', () => {
    const sim = createTestGame();
    sim.state.outcome.gameOver = { reason: 'killed', time: 0, text: '' } as never;
    expect(start(sim)).toBeNull();
  });

  it('Schwierigkeit steigt mit Heat, Polizei-Härte und strengen Städten, bleibt in [0,2; 0,95]', () => {
    const sim = createTestGame();
    const calm = minigameDifficulty(sim.state, { veedelId: 'ehrenfeld' });
    sim.state.modules.police.heat.ehrenfeld = 90;
    const hot = minigameDifficulty(sim.state, { veedelId: 'ehrenfeld' });
    expect(hot).toBeGreaterThan(calm);
    expect(minigameDifficulty(sim.state, { cityId: 'muenchen' })).toBeGreaterThan(
      minigameDifficulty(sim.state, { cityId: 'koeln' }),
    );
    sim.state.modules.police.tiers.koeln = 2;
    sim.state.modules.police.heat.ehrenfeld = 100;
    expect(minigameDifficulty(sim.state, { veedelId: 'ehrenfeld' })).toBeLessThanOrEqual(0.95);
    expect(minigameDifficulty(sim.state, { cityId: 'berlin' })).toBeGreaterThanOrEqual(0.2);
  });
});

describe('Minispiele: Ergebnis', () => {
  it('nimmt Score und picks an, meldet geschafft und zählt die Statistik', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const id = start(sim) ?? 0;
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id, score: 0.8, picks: ['a', 'b'] } }).ok).toBe(true);
    expect(getChallenge(sim.state, id)).toBeUndefined();
    const done = eventsOfType(events, 'minigame.finished')[0].payload;
    expect(done).toMatchObject({ id, kind: 'safe', score: 0.8, won: true, by: 'player', picks: ['a', 'b'] });
    expect(sim.state.modules.minigames.history[0]).toMatchObject({ id, score: 0.8, by: 'player', won: true });
    expect(minigameStats(sim.state).safe).toEqual({ played: 1, won: 1, delegated: 0 });
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id, score: 1 } }).ok).toBe(false);
  });

  it('begrenzt Score und picks (unendlich, NaN, zu viele, zu lang, keine Texte)', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const cases: [unknown, number][] = [
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [-3, 0],
      [7, 1],
      ['0.9', 0],
    ];
    for (const [score, expected] of cases) {
      const id = start(sim) ?? 0;
      const picks = [...Array.from({ length: 30 }, (_, i) => `p${i}`), 'x'.repeat(200), 5, null];
      sim.dispatch({ type: 'minigames.finish', payload: { id, score: score as number, picks: picks as string[] } });
      const done = eventsOfType(events, 'minigame.finished').at(-1)?.payload;
      expect(done?.score).toBe(expected);
      expect(done?.picks.length).toBe(PICKS_MAX);
      expect(done?.picks.every((p) => typeof p === 'string' && p.length <= 40)).toBe(true);
      expect(done?.won).toBe(expected >= 0.5);
    }
  });

  it('läuft ohne Oberfläche nach der Frist als timeout ab (score null, nicht geschafft)', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const id = start(sim) ?? 0;
    sim.advance(MINIGAME_TIMEOUT - 1);
    expect(getChallenge(sim.state, id)).toBeDefined();
    sim.advance(1);
    expect(getChallenge(sim.state, id)).toBeUndefined();
    expect(eventsOfType(events, 'minigame.finished')[0].payload).toMatchObject({
      id,
      score: null,
      won: false,
      by: 'timeout',
      picks: [],
    });
    expect(minigameStats(sim.state).safe).toEqual({ played: 0, won: 0, delegated: 0 });
  });

  it('resolveMinigameNow und der Befehl expire (nur vom System) lösen sofort als timeout auf', () => {
    const sim = createTestGame();
    const a = start(sim) ?? 0;
    expect(resolveMinigameNow(sim.ctx('minigames'), a)).toBe(true);
    expect(resolveMinigameNow(sim.ctx('minigames'), a)).toBe(false);
    const b = start(sim, 'safe', 'zwei') ?? 0;
    expect(sim.dispatch({ type: 'minigames.expire', payload: { id: b } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'minigames.expire', payload: { id: b } }, { actor: 'system' }).ok).toBe(true);
    expect(getChallenge(sim.state, b)).toBeUndefined();
  });

  it('der Verlauf hält die letzten 30', () => {
    const sim = createTestGame();
    for (let i = 0; i < 35; i++) {
      const id = start(sim, 'safe', `r${i}`) ?? 0;
      sim.dispatch({ type: 'minigames.finish', payload: { id, score: 0.1 } });
    }
    expect(sim.state.modules.minigames.history).toHaveLength(30);
    expect(sim.state.modules.minigames.history[0].origin.ref).toBe('r34');
  });
});

describe('Minispiele: Rechte Hand', () => {
  it('ohne Rechte Hand kein Übernehmen', () => {
    const sim = createTestGame();
    const id = start(sim) ?? 0;
    const c = getChallenge(sim.state, id);
    expect(c && delegateInfo(sim.state, c)).toBeNull();
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id } }).ok).toBe(false);
    expect(getChallenge(sim.state, id)).toBeDefined();
  });

  it('mit Rechter Hand: Chance aus Wert und Stufe, fester Score, Journal, Statistik', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const rh = rightHand(sim);
    const id = start(sim) ?? 0;
    const c = getChallenge(sim.state, id);
    const info = c && delegateInfo(sim.state, c);
    expect(info).toMatchObject({ staffId: rh.id, name: rh.name });
    expect(info?.chance).toBeCloseTo(delegateChance(rh.stats.caution, 1), 5);
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id } }).ok).toBe(true);
    const done = eventsOfType(events, 'minigame.finished')[0].payload;
    expect(done.by).toBe('rightHand');
    expect(done.picks).toEqual([]);
    expect([RIGHT_HAND_WIN_SCORE, RIGHT_HAND_LOSE_SCORE]).toContain(done.score);
    expect(done.won).toBe(done.score === RIGHT_HAND_WIN_SCORE);
    expect(sim.state.journal.some((j) => j.text.startsWith(`${rh.name} übernimmt`))).toBe(true);
    expect(minigameStats(sim.state).safe.delegated).toBe(1);
  });

  it('Chance bleibt zwischen 25 und 85 Prozent', () => {
    expect(delegateChance(0, 0)).toBe(0.3);
    expect(delegateChance(0, 0)).toBeGreaterThanOrEqual(0.25);
    expect(delegateChance(100, 5)).toBe(0.85);
    expect(delegateChance(50, 1)).toBeCloseTo(0.58, 5);
  });

  it('nur die Rechte Hand der Stadt der Challenge', () => {
    const sim = createTestGame();
    rightHand(sim);
    const id = startMinigame(sim.ctx('minigames'), {
      kind: 'safe',
      origin,
      cityId: 'hamburg',
      title: 'Tresor',
      situation: '',
    });
    const c = getChallenge(sim.state, id ?? 0);
    expect(c && delegateInfo(sim.state, c)).toBeNull();
  });
});

describe('Minispiele: Spielstand', () => {
  it('ein Spielstand ohne Modul lädt mit leerem Zustand, offene Challenges überstehen Speichern und Laden', () => {
    const sim = createTestGame();
    const id = start(sim) ?? 0;
    const copy = structuredClone(sim.state);
    const loaded = loadSimulation(copy, sim.modules);
    expect(getChallenge(loaded.state, id)?.params).toEqual({ max: 1000 });
    const old = structuredClone(sim.state);
    delete (old.modules as unknown as Record<string, unknown>).minigames;
    delete old.moduleVersions.minigames;
    const fresh = loadSimulation(old, sim.modules);
    expect(fresh.state.modules.minigames).toMatchObject({ active: [], history: [], nextId: 1 });
  });
});
