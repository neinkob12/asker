// Konfrontationen: taktische Situationen wie Überfälle oder Polizeiflucht.
// Stand Fundament: Der Stub entscheidet sofort per Zufall. Auftrag 11 baut das rundenbasierte System.
//
// Ablauf für Aufrufer: startEncounter(ctx, {...}) liefert eine ID. Das Ergebnis kommt als Ereignis
// 'encounter.resolved' (mit derselben ID und dem mitgegebenen origin). Beim Stub passiert das sofort,
// später erst nach den Runden, in denen der Spieler entscheidet.
//
// Öffentliche API:
//   startEncounter(ctx, request), getEncounter(state, id), activeEncounters(state), ENCOUNTER_KINDS
// Ereignisse: 'encounter.started', 'encounter.resolved'

import { type Ctx, defineModule, type GameState } from '../../core';
import { ENCOUNTER_KINDS, type EncounterKind } from './kinds';

export { ENCOUNTER_KINDS, type EncounterKind } from './kinds';

export type EncounterOutcome = 'success' | 'failure' | 'retreat';

export interface EncounterRequest {
  /** Anlass, Schlüssel aus ENCOUNTER_KINDS, z.B. 'policeChase'. */
  kind: string;
  veedelId?: string;
  spotId?: string;
  /** Beteiligte eigene Leute (staff-IDs). */
  staffIds?: string[];
  /** Ist der Spieler selbst dabei? Dann bessere Chancen, aber Todesgefahr. */
  playerPresent?: boolean;
  /** Gegenseite, z.B. eine Gang oder die Polizei. */
  opponent?: { factionId?: string; label?: string; strength?: number };
  /** Wer die Konfrontation ausgelöst hat, damit er das Ergebnis zuordnen kann. */
  origin?: { module: string; ref?: string };
}

export interface Encounter {
  id: number;
  request: EncounterRequest;
  startedAt: number;
  outcome: EncounterOutcome | null;
  resolvedAt: number | null;
}

export interface EncountersState {
  active: Encounter[];
  /** Die letzten abgeschlossenen, neueste zuerst. */
  history: Encounter[];
}

const HISTORY_LIMIT = 20;

declare module '../../core' {
  interface ModuleStates {
    encounters: EncountersState;
  }
  interface GameEvents {
    'encounter.started': { encounterId: number; kind: string; request: EncounterRequest };
    'encounter.resolved': {
      encounterId: number;
      kind: string;
      outcome: EncounterOutcome;
      request: EncounterRequest;
      playerKilled: boolean;
    };
  }
}

/** Konfrontation starten. Das Ergebnis kommt als 'encounter.resolved'. */
export function startEncounter(ctx: Ctx, request: EncounterRequest): { encounterId: number } {
  const kind: EncounterKind | undefined = ENCOUNTER_KINDS[request.kind];
  if (!kind) throw new Error(`Unbekannter Anlass für eine Konfrontation: ${request.kind}`);
  const state = ctx.state.modules.encounters;
  const encounter: Encounter = {
    id: ctx.nextId(),
    request: structuredClone(request),
    startedAt: ctx.now,
    outcome: null,
    resolvedAt: null,
  };
  state.active.push(encounter);
  ctx.emit('encounter.started', { encounterId: encounter.id, kind: request.kind, request });

  // Stub: sofort auswürfeln.
  const chance = Math.min(0.95, kind.baseSuccess + (request.playerPresent ? 0.1 : 0));
  resolve(ctx, encounter, ctx.chance(chance) ? 'success' : 'failure');
  return { encounterId: encounter.id };
}

function resolve(ctx: Ctx, encounter: Encounter, outcome: EncounterOutcome): void {
  const state = ctx.state.modules.encounters;
  encounter.outcome = outcome;
  encounter.resolvedAt = ctx.now;
  state.active = state.active.filter((e) => e.id !== encounter.id);
  state.history.unshift(encounter);
  if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
  ctx.emit('encounter.resolved', {
    encounterId: encounter.id,
    kind: encounter.request.kind,
    outcome,
    request: encounter.request,
    playerKilled: false,
  });
}

export function getEncounter(state: GameState, id: number): Encounter | undefined {
  const s = state.modules.encounters;
  return s.active.find((e) => e.id === id) ?? s.history.find((e) => e.id === id);
}

export function activeEncounters(state: GameState): readonly Encounter[] {
  return state.modules.encounters.active;
}

export default defineModule({
  id: 'encounters',
  version: 1,
  init: () => ({ active: [], history: [] }),
});
