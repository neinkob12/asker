// Zivi oder Kunde (Auftrag 44, Teil 5): Auslöser am Spot mit Heat, fester Wurf (keine verschobene Würfelfolge),
// Folgen (Kontrolle bei Verkauf an einen Zivi, weniger Heat, Ruf), Rechte Hand, timeout (wie bisher), Migration.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { store } from '../goods';
import { activeChallenge, type Challenge, MINIGAME_KINDS, MINIGAME_TIMEOUT, resolveMinigameNow } from '../minigames';
import { getReputation } from '../reputation';
import { UNDERCOVER_BASE_CHANCE_PER_HOUR, UNDERCOVER_COOLDOWN, UNDERCOVER_HEAT, UNDERCOVER_RELIEF } from './config';
import {
  getHeat,
  type UndercoverParams,
  undercoverChance,
  undercoverOutcome,
  undercoverScore,
  ziviCount,
} from './index';

const SPOT = 'venloer';
const VEEDEL = 'ehrenfeld';

/** Spiel ohne zufällige Kunden, Kontrollen und Razzien; du stehst selbst am Venloer, Ware liegt im Lager. */
function game(seed = 3): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  store(sim.ctx('goods'), { productId: 'weed', amount: 500, warehouseId: 'ehrenfeld' });
  store(sim.ctx('goods'), { productId: 'hash', amount: 100, warehouseId: 'ehrenfeld' });
  const unlock = sim.dispatch({ type: 'spots.unlock', payload: { spotId: SPOT } });
  if (!unlock.ok) throw new Error(unlock.reason);
  const stand = sim.dispatch({ type: 'customers.standAt', payload: { spotId: SPOT } });
  if (!stand.ok) throw new Error(stand.reason);
  quiet(sim);
  return sim;
}

/** Keine Kontrollen und Razzien (die würfeln mit der Polizei-Folge und stören den Ablauf hier). */
function quiet(sim: Simulation): void {
  const police = sim.state.modules.police;
  for (const id of Object.keys(police.heat)) {
    police.checkReadyAt[id] = Infinity;
    police.raidReadyAt[id] = Infinity;
  }
  police.majorReadyAt = Infinity;
}

/** Stunde für Stunde spielen (Heat bleibt oben), bis die Zivis kommen. */
function untilShift(sim: Simulation, heat = 80, hours = 96): Challenge | undefined {
  for (let i = 0; i < hours; i++) {
    sim.state.modules.police.heat[VEEDEL] = heat;
    sim.advance(60);
    const c = activeChallenge(sim.state);
    if (c?.kind === 'undercover') return c;
  }
  return undefined;
}

function finish(sim: Simulation, c: Challenge, score: number, picks: string[]) {
  const result = sim.dispatch({ type: 'minigames.finish', payload: { id: c.id, score, picks } });
  if (!result.ok) throw new Error(result.reason);
}

describe('Zivi oder Kunde', () => {
  it('ist scharf und zählt Vorsicht der Rechten Hand', () => {
    expect(MINIGAME_KINDS.undercover).toMatchObject({ ready: true, stat: 'caution' });
  });

  it('Grundrauschen ohne Heat, ab UNDERCOVER_HEAT steigend mit Heat und Präsenz; Zivis nach Heat', () => {
    expect(undercoverChance(0, 1)).toBe(UNDERCOVER_BASE_CHANCE_PER_HOUR);
    expect(undercoverChance(UNDERCOVER_HEAT - 1, 1)).toBe(UNDERCOVER_BASE_CHANCE_PER_HOUR);
    expect(undercoverChance(UNDERCOVER_HEAT, 1)).toBeGreaterThanOrEqual(UNDERCOVER_BASE_CHANCE_PER_HOUR);
    expect(undercoverChance(0, 0)).toBe(0);
    expect(undercoverChance(80, 1)).toBeGreaterThan(undercoverChance(40, 1));
    expect(undercoverChance(80, 1.5)).toBeGreaterThan(undercoverChance(80, 1));
    expect([ziviCount(20), ziviCount(50), ziviCount(90)]).toEqual([1, 2, 3]);
  });

  it('am Spot mit Heat kommt die Schicht: Spot, Ware, Kunden und Zivis', () => {
    const sim = game();
    const events = recordEvents(sim);
    const c = untilShift(sim);
    expect(c).toMatchObject({
      kind: 'undercover',
      origin: { module: 'police', ref: `undercover:${SPOT}` },
      cityId: 'koeln',
      veedelId: VEEDEL,
    });
    const params = c?.params as unknown as UndercoverParams;
    expect(params.spotId).toBe(SPOT);
    expect(params.zivis).toBe(3);
    expect(params.customers).toBeGreaterThanOrEqual(6);
    expect(params.customers).toBeLessThanOrEqual(10);
    expect(params.goods.map((g) => g.productId)).toContain('weed');
    expect(c?.situation).toContain('Zivis');
    expect(sim.state.modules.police.undercover.shift).toMatchObject({ challengeId: c?.id, spotId: SPOT });
    expect(eventsOfType(events, 'minigame.started')).toHaveLength(1);
  });

  it('ohne Heat seltener, ohne dich am Spot nie', () => {
    // Grundrauschen: Auch ohne Heat kommt irgendwann eine Schicht, mit einem Zivi (Feedback vom 07.10.2026).
    const cold = untilShift(game(), 0, 24 * 14);
    if (!cold) throw new Error('keine Schicht ohne Heat');
    expect((cold.params as unknown as UndercoverParams).zivis).toBe(1);
    const away = game();
    away.dispatch({ type: 'customers.standAt', payload: { spotId: null } });
    expect(untilShift(away, 90, 72)).toBeUndefined();
  });

  it('Verkauf an einen Zivi: Kontrolle gegen dich am Spot, Score gilt als nicht geschafft', () => {
    const sim = game();
    const c = untilShift(sim);
    if (!c) throw new Error('keine Schicht');
    const events = recordEvents(sim);
    const params = c.params as unknown as UndercoverParams;
    const picks = ['soldZivi:1', `spotted:${params.zivis - 1}`, `sold:${params.customers - params.zivis}`];
    const outcome = undercoverOutcome(params, 0, picks, 'player');
    const score = undercoverScore(outcome, params.customers);
    expect(score).toBeLessThan(0.5);
    finish(sim, c, score, picks);
    const check = eventsOfType(events, 'police.check')[0]?.payload;
    expect(check).toMatchObject({ veedelId: VEEDEL, spotId: SPOT, staffId: null });
    expect(sim.state.journal.some((j) => j.text.includes('an einen Zivi verkauft'))).toBe(true);
    expect(sim.state.modules.police.undercover.shift).toBeNull();
  });

  it('alle Zivis erkannt: weniger Heat im Veedel; echte Kunden abgewimmelt kosten Ruf', () => {
    const sim = game();
    const c = untilShift(sim);
    if (!c) throw new Error('keine Schicht');
    const events = recordEvents(sim);
    const params = c.params as unknown as UndercoverParams;
    const heat = getHeat(sim.state, VEEDEL);
    const rep = getReputation(sim.state);
    const real = params.customers - params.zivis;
    const picks = [`spotted:${params.zivis}`, 'turnedAway:2', `sold:${real - 2}`];
    finish(sim, c, undercoverScore(undercoverOutcome(params, 0, picks, 'player'), params.customers), picks);
    expect(getHeat(sim.state, VEEDEL)).toBeCloseTo(heat - UNDERCOVER_RELIEF, 5);
    expect(getReputation(sim.state)).toBeLessThan(rep);
    expect(eventsOfType(events, 'police.check')).toHaveLength(0);
    expect(sim.state.journal.some((j) => j.text.includes('alle Zivis'))).toBe(true);
  });

  it('timeout: nichts passiert (wie bisher), die Abklingzeit gilt trotzdem', () => {
    const sim = game();
    const c = untilShift(sim);
    if (!c) throw new Error('keine Schicht');
    const events = recordEvents(sim);
    const heat = getHeat(sim.state, VEEDEL);
    const rep = getReputation(sim.state);
    resolveMinigameNow(sim.ctx('minigames'), c.id);
    sim.step();
    expect(getHeat(sim.state, VEEDEL)).toBe(heat);
    expect(getReputation(sim.state)).toBe(rep);
    expect(eventsOfType(events, 'police.check')).toHaveLength(0);
    expect(sim.state.modules.police.undercover.shift).toBeNull();
    expect(sim.state.modules.police.undercover.readyAt).toBe(c.startedAt + UNDERCOVER_COOLDOWN);
    // In der Abklingzeit keine neue Schicht.
    expect(untilShift(sim, 90, UNDERCOVER_COOLDOWN / 60 - 2)).toBeUndefined();
  });

  it('ohne Oberfläche läuft die Frist ab, ohne Folgen', () => {
    const sim = game();
    const c = untilShift(sim);
    if (!c) throw new Error('keine Schicht');
    const events = recordEvents(sim);
    sim.advance(MINIGAME_TIMEOUT + 1);
    const done = eventsOfType(events, 'minigame.finished')[0]?.payload;
    expect(done).toMatchObject({ kind: 'undercover', by: 'timeout', score: null });
    expect(eventsOfType(events, 'police.check')).toHaveLength(0);
  });

  it('Rechte Hand: geschafft bedient keinen Zivi, nicht geschafft einen', () => {
    const params = { customers: 8, zivis: 2 };
    expect(undercoverOutcome(params, 0.7, [], 'rightHand')).toEqual({
      soldZivi: 0,
      spotted: 2,
      turnedAway: 2,
      sold: 4,
    });
    expect(undercoverOutcome(params, 0.25, [], 'rightHand')).toMatchObject({ soldZivi: 1, spotted: 1 });
  });

  it('picks werden auf die Zahlen der Schicht begrenzt', () => {
    const params = { customers: 6, zivis: 1 };
    expect(undercoverOutcome(params, 1, ['soldZivi:9', 'spotted:9', 'turnedAway:99', 'sold:99'], 'player')).toEqual({
      soldZivi: 1,
      spotted: 0,
      turnedAway: 5,
      sold: 0,
    });
    expect(undercoverScore({ soldZivi: 0, spotted: 1, turnedAway: 0, sold: 5 }, 6)).toBe(1);
    expect(undercoverScore({ soldZivi: 1, spotted: 0, turnedAway: 0, sold: 5 }, 6)).toBeLessThan(0.5);
  });

  it('der Wurf verschiebt die Würfelfolge der Polizei nicht', () => {
    const play = (ready: boolean) => {
      const before = MINIGAME_KINDS.undercover.ready;
      MINIGAME_KINDS.undercover.ready = ready;
      try {
        const sim = game();
        for (let i = 0; i < 48; i++) {
          sim.state.modules.police.heat[VEEDEL] = 80;
          sim.advance(60);
          const c = activeChallenge(sim.state);
          if (c) resolveMinigameNow(sim.ctx('minigames'), c.id);
        }
        return sim.state.rng.police;
      } finally {
        MINIGAME_KINDS.undercover.ready = before;
      }
    };
    expect(play(true)).toBe(play(false));
  });

  it('Version 7 wird migriert: noch keine Zivis', () => {
    const sim = createTestGame();
    const old = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { police: Record<string, unknown> };
    };
    old.moduleVersions.police = 7;
    delete old.modules.police.undercover;
    const loaded = loadSimulation(old as never, sim.modules);
    expect(loaded.state.moduleVersions.police).toBe(8);
    expect(loaded.state.modules.police.undercover).toEqual({ readyAt: 0, shift: null });
  });
});
