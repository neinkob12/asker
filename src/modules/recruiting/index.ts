// Rekrutierung: Bewerber-Pool und Kontakte.
// Stand Fundament: leerer Pool mit minimaler API. Auftrag 13 füllt ihn.
//
// Öffentliche API:
//   getCandidates(state)

import { defineModule, type GameState } from '../../core';
import type { StaffRole, StaffStats } from '../staff';

export interface Candidate {
  id: string;
  name: string;
  role: StaffRole;
  /** Vor der Einstellung sichtbare Werte (nur ein Teil). */
  visibleStats: Partial<StaffStats>;
  wage: number;
  /** Bis dahin ist der Kandidat verfügbar (Spielminute). */
  expiresAt: number;
}

export interface RecruitingState {
  candidates: Candidate[];
}

declare module '../../core' {
  interface ModuleStates {
    recruiting: RecruitingState;
  }
}

export function getCandidates(state: GameState): readonly Candidate[] {
  return state.modules.recruiting.candidates;
}

export default defineModule({
  id: 'recruiting',
  version: 1,
  dependsOn: ['staff'],
  init: () => ({ candidates: [] }),
});
