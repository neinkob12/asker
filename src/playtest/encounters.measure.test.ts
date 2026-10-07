// Messung der Konfrontationen (Auftrag 24, 35 und 46d): 300 Überfälle, ein Läufer vor Ort, sofort entschieden mit der
// klugen Strategie der Leute (so, wie seit Auftrag 46d jede Konfrontation läuft). Läuft mit `npm run balance`
// (BALANCE=1), sonst übersprungen.

import { describe, it } from 'vitest';
import type { Simulation } from '../core';
import { createTestGame } from '../core/testing';
import { type Encounter, getEncounter, startEncounter } from '../modules/encounters';

const RUNS = 300;

interface Tally {
  success: number;
  retreat: number;
  failure: number;
  hurt: number;
}

function raid(seed: number): Encounter | undefined {
  const sim: Simulation = createTestGame({ seed });
  const ids: string[] = [];
  const r = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
  if (r.ok) ids.push((r.data as { staffId: string }).staffId);
  const ctx = sim.ctx('gangs');
  const { encounterId } = startEncounter(ctx, {
    kind: 'raidDefense',
    spotId: 'ebertplatz',
    veedelId: 'neustadt-nord',
    staffIds: ids,
    opponent: { factionId: 'nord', label: 'Die Angreifer', strength: 50, count: ctx.randomInt(2, 4) },
  });
  return getEncounter(sim.state, encounterId);
}

function measure(): Tally {
  const tally: Tally = { success: 0, retreat: 0, failure: 0, hurt: 0 };
  for (let seed = 1; seed <= RUNS; seed++) {
    const e = raid(seed);
    if (!e?.outcome) continue;
    tally[e.outcome] += 1;
    if (e.participants.some((p) => p.condition !== 'ok')) tally.hurt += 1;
  }
  return tally;
}

describe.skipIf(!process.env.BALANCE)('Konfrontationen messen', () => {
  it('300 Überfälle, sofort entschieden', () => {
    console.log(`Überfälle (${RUNS}, ein Läufer vor Ort, sofort entschieden):`, measure());
  });
});
