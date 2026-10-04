// Messung der Konfrontationen (Auftrag 24 und 35): 300 Überfälle, nur die Leute vor Ort, ausgewürfelt mit der
// Strategie der Leute (wie beim Bot und ohne Boss), dazu ein Spieler, der zufällig tippt, und einer, der gut spielt.
// Läuft mit `npm run balance` (BALANCE=1), sonst übersprungen.

import { describe, it } from 'vitest';
import type { Simulation } from '../core';
import { createTestGame } from '../core/testing';
import {
  autoResolveEncounter,
  availableActions,
  chooseAuto,
  chooseMove,
  type Encounter,
  getEncounter,
  startEncounter,
} from '../modules/encounters';

const RUNS = 300;

type Player = 'auto' | 'random' | 'good';

interface Tally {
  success: number;
  retreat: number;
  failure: number;
  hurt: number;
}

function raid(seed: number, player: Player): Encounter | undefined {
  const sim: Simulation = createTestGame({ seed });
  const ids: string[] = [];
  for (let i = 0; i < 1; i++) {
    const r = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
    if (r.ok) ids.push((r.data as { staffId: string }).staffId);
  }
  const ctx = sim.ctx('gangs');
  const { encounterId } = startEncounter(ctx, {
    kind: 'raidDefense',
    spotId: 'ebertplatz',
    veedelId: 'neustadt-nord',
    staffIds: ids,
    opponent: { factionId: 'nord', label: 'Die Angreifer', strength: 50, count: ctx.randomInt(2, 4) },
  });
  if (player === 'auto') autoResolveEncounter(ctx, encounterId);
  // Eigener Zufall für den Spieler, damit er die Würfel der Simulation nicht verschiebt.
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < 30; i++) {
    const e = getEncounter(sim.state, encounterId);
    if (!e || e.phase !== 'rounds') break;
    const options = availableActions(e).filter((a) => a !== 'bribe');
    if (player === 'random') {
      const actionId = options[Math.floor(rnd() * options.length)];
      const protect = e.stakes[Math.floor(rnd() * e.stakes.length)]?.id;
      sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId, ...(protect ? { protect } : {}) } });
    } else {
      const move = chooseMove(e, true);
      if (move) {
        sim.dispatch({ type: 'encounters.special', payload: { encounterId, participantId: move } });
        continue;
      }
      const choice = chooseAuto(sim.state, e, true);
      if (!choice) break;
      sim.dispatch({
        type: 'encounters.act',
        payload: { encounterId, actionId: choice.actionId, ...(choice.protect ? { protect: choice.protect } : {}) },
      });
    }
  }
  return getEncounter(sim.state, encounterId);
}

function measure(player: Player): Tally {
  const tally: Tally = { success: 0, retreat: 0, failure: 0, hurt: 0 };
  for (let seed = 1; seed <= RUNS; seed++) {
    const e = raid(seed, player);
    if (!e?.outcome) continue;
    tally[e.outcome] += 1;
    if (e.participants.some((p) => p.condition !== 'ok')) tally.hurt += 1;
  }
  return tally;
}

describe.skipIf(!process.env.BALANCE)('Konfrontationen messen', () => {
  it('300 Überfälle: ausgewürfelt, zufällig getippt, gut gespielt', () => {
    for (const player of ['auto', 'random', 'good'] as const) {
      console.log(`Überfälle (${RUNS}, ein Läufer vor Ort, ${player}):`, measure(player));
    }
  });
});
