// Rat der Rechten Hand (Auftrag 35, Etappe 3).

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { ADVICE_RULES, adviceText, type Encounter, getEncounter, rightHandAdvice, startEncounter } from './index';

function hire(sim: Simulation, spotId = 'ebertplatz'): string {
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

function raid(sim: Simulation, factionId = 'nord'): Encounter {
  const { encounterId } = startEncounter(sim.ctx('gangs'), {
    kind: 'raidDefense',
    spotId: 'ebertplatz',
    veedelId: 'neustadt-nord',
    staffIds: [hire(sim)],
    playerPresent: false,
    opponent: { factionId, label: 'Die Angreifer', strength: 50, count: 3 },
  });
  const e = getEncounter(sim.state, encounterId);
  if (!e) throw new Error('fehlt');
  return e;
}

/** Rechte Hand in Köln (nur der Posten, ohne den ganzen Ablauf der Ernennung). */
function withRightHand(sim: Simulation, staffId: string): void {
  (sim.state.modules.hierarchy as { rightHands: Record<string, unknown> }).rightHands = {
    koeln: { staffId, appointedAt: 0 },
  };
}

describe('Rat der Rechten Hand', () => {
  it('ohne Rechte Hand kein Rat, mit ihr ein Satz zur Lage', () => {
    const sim = createTestGame();
    const e = raid(sim);
    expect(rightHandAdvice(sim.state, e)).toBeNull();
    const boss = hire(sim, 'neumarkt');
    withRightHand(sim, boss);
    const advice = rightHandAdvice(sim.state, e);
    expect(advice?.staffId).toBe(boss);
    expect(advice?.text.length).toBeGreaterThan(10);
  });

  it('der Rat folgt der Lage: Schlägerei, Uhr, Messer, Gang-Stil, Zeiger', () => {
    const sim = createTestGame();
    const e = raid(sim);
    e.brawl = true;
    expect(adviceText(sim.state, e)).toMatch(/Schlägerei/);
    e.brawl = false;
    e.intent = 'knife';
    e.clock = 4;
    expect(adviceText(sim.state, e)).toMatch(/Messer/);
    // Die Hafenkolonne schlägt schnell zu (Gang-Stil): einschüchtern bringt nichts.
    e.intent = 'grabCash';
    e.resolve = 80;
    e.aggression = 30;
    expect(adviceText(sim.state, e)).toBe('Die lassen sich nicht einschüchtern. Zahl oder lass sie ziehen.');
    e.resolve = 40;
    expect(adviceText(sim.state, e)).toMatch(/wackeln/);
    e.resolve = 55;
    expect(adviceText(sim.state, e)).toBe('Die wollen an die Kasse. Deck sie oder geh dazwischen.');
    e.clock = 1;
    expect(adviceText(sim.state, e)).toMatch(/Streife/);
  });

  it('jede Regel hat einen Satz, die letzte passt immer', () => {
    for (const rule of ADVICE_RULES) expect(rule.text.length).toBeGreaterThan(10);
    expect(ADVICE_RULES[ADVICE_RULES.length - 1].when).toEqual({});
  });
});
