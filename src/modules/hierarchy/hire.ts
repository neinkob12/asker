// Einen Läufer für einen Spot besorgen: gemeinsam für die Leutnants (ai.ts) und die Rechte Hand (tasks.ts), damit beide
// dieselben Regeln haben (Bewerber vor Straße, nie über das Budget) und nicht auseinanderlaufen.

import type { Actor, Ctx } from '../../core';
import { getCandidates } from '../recruiting';
import { runnerHireCost } from '../staff';

export interface HiredRunner {
  /** ID der neuen Person (fehlt, wenn der Befehl sie nicht zurückgab). */
  staffId: string | null;
  name: string;
  /** Was die Einstellung gekostet hat. */
  cost: number;
  /** Aus dem Bewerber-Pool (sonst von der Straße). */
  fromPool: boolean;
}

const idOf = (data: unknown): string | null => (data as { staffId?: string } | undefined)?.staffId ?? null;

/**
 * Stellt einen neuen Läufer an den Spot: am liebsten den billigsten Bewerber aus dem Pool, den das Budget zulässt,
 * sonst jemanden von der Straße. null, wenn das Budget nicht reicht oder die Einstellung scheitert. Gebucht wird über
 * die Befehle (Geld, Journal), das Budget der Aufrufer führen sie selbst.
 */
export function hireRunnerFor(ctx: Ctx, actor: Actor, spotId: string, budget: number): HiredRunner | null {
  const candidate = getCandidates(ctx.state)
    .filter((c) => c.role === 'runner' && c.hireCost <= budget && c.expiresAt > ctx.now)
    .sort((a, b) => a.hireCost - b.hireCost || a.id.localeCompare(b.id))[0];
  if (candidate) {
    const result = ctx.dispatch(
      {
        type: 'recruiting.hire',
        payload: { candidateId: candidate.id, assignment: { kind: 'spot', targetId: spotId } },
      },
      { actor },
    );
    return result.ok
      ? { staffId: idOf(result.data), name: candidate.name, cost: candidate.hireCost, fromPool: true }
      : null;
  }
  const cost = runnerHireCost(ctx.state, spotId);
  if (cost > budget) return null;
  const result = ctx.dispatch({ type: 'staff.hireRunner', payload: { spotId } }, { actor });
  return result.ok ? { staffId: idOf(result.data), name: 'Jemand von der Straße', cost, fromPool: false } : null;
}
