// Hierarchie: Boss → Leutnants pro Veedel → Läufer.
// Stand Fundament: minimale API, Leutnants ernennen und abfragen. Die Leutnant-KI baut Auftrag 13.
// Wichtig: Leutnants handeln nur über ctx.dispatch(...) mit actor 'staff:<id>', wie der Spieler.
//
// Öffentliche API:
//   getLieutenant(state, veedelId), getLieutenants(state)
// Befehle: 'hierarchy.appoint', 'hierarchy.dismiss'
// Ereignisse: 'hierarchy.appointed', 'hierarchy.dismissed'

import { defineModule, type GameState } from '../../core';
import { getStaffMember } from '../staff';
import { getVeedel } from '../veedel';

export interface HierarchyState {
  /** Veedel-ID → Mitarbeiter-ID des Leutnants. */
  lieutenants: Record<string, string>;
}

declare module '../../core' {
  interface ModuleStates {
    hierarchy: HierarchyState;
  }
  interface GameCommands {
    'hierarchy.appoint': { staffId: string; veedelId: string };
    'hierarchy.dismiss': { veedelId: string };
  }
  interface GameEvents {
    'hierarchy.appointed': { staffId: string; veedelId: string };
    'hierarchy.dismissed': { staffId: string; veedelId: string };
  }
}

export function getLieutenant(state: GameState, veedelId: string): string | null {
  return state.modules.hierarchy.lieutenants[veedelId] ?? null;
}

/** Alle Leutnants als [veedelId, staffId]. */
export function getLieutenants(state: GameState): [string, string][] {
  return Object.entries(state.modules.hierarchy.lieutenants);
}

export default defineModule({
  id: 'hierarchy',
  version: 1,
  dependsOn: ['staff'],
  init: () => ({ lieutenants: {} }),
  commands: {
    'hierarchy.appoint': (ctx, { staffId, veedelId }) => {
      if (!getStaffMember(ctx.state, staffId)) return { ok: false, reason: 'Diese Person arbeitet nicht für dich.' };
      if (!getVeedel(veedelId)) return { ok: false, reason: 'Unbekanntes Veedel.' };
      ctx.state.modules.hierarchy.lieutenants[veedelId] = staffId;
      ctx.emit('hierarchy.appointed', { staffId, veedelId });
      return { ok: true };
    },
    'hierarchy.dismiss': (ctx, { veedelId }) => {
      const staffId = getLieutenant(ctx.state, veedelId);
      if (!staffId) return { ok: false, reason: 'Dort gibt es keinen Leutnant.' };
      delete ctx.state.modules.hierarchy.lieutenants[veedelId];
      ctx.emit('hierarchy.dismissed', { staffId, veedelId });
      return { ok: true };
    },
  },
  on: {
    // Wer geht, ist auch kein Leutnant mehr.
    'staff.left': (ctx, { staffId }) => {
      for (const [veedelId, id] of getLieutenants(ctx.state)) {
        if (id === staffId) delete ctx.state.modules.hierarchy.lieutenants[veedelId];
      }
    },
  },
});
