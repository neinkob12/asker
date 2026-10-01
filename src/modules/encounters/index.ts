// Konfrontationen: taktische, rundenbasierte Situationen wie Überfälle, Polizeiflucht, Schulden eintreiben
// oder ein Deal, der kippt. Anlässe und Handlungen sind reine Daten (kinds.ts, actions.ts).
//
// Ablauf für Aufrufer: startEncounter(ctx, {...}) liefert eine ID. Mit askPlayer (und einem Anlass mit "joinable")
// entscheidet der Spieler zuerst, wie er vorgeht (briefing, 'encounters.join' mit mode): selbst hin, Leute machen
// lassen, Verstärkung schicken, sofort freikaufen, anonym die Bullen rufen oder Ware retten und den Spot räumen
// (welche Wege ein Anlass anbietet: briefingOptions in kinds.ts, Werte in config.ts). Dann laufen Runden, in denen er
// Handlungen wählt ('encounters.act') oder seine Leute machen lässt ('encounters.auto'). Das Ergebnis kommt als
// Ereignis 'encounter.resolved' (mit derselben ID, dem origin und dem Ergebnis). Ohne Entscheidung (keine
// Oberfläche, z.B. in Tests) würfeln die Leute nach DECISION_TIMEOUT Spielminuten selbst aus; sofort geht das
// mit autoResolveEncounter(ctx, id).
//
// Der Spieler kann nur sterben, wenn er selbst dabei ist. Dann löst das Modul Game Over mit 'killed' aus.
//
// Öffentliche API:
//   startEncounter(ctx, request), getEncounter(state, id), activeEncounters(state), pendingEncounter(state),
//   availableActions(encounter), actionChance(encounter, actionId), autoResolveEncounter(ctx, id),
//   briefingOptions(state, encounter) (Wege mit Kosten und ob sie gehen), payoffCost(encounter),
//   getEncounterAction(kindId, actionId), ENCOUNTER_KINDS, ENCOUNTER_ACTIONS, PLAYER_STATS
// Befehle: 'encounters.join', 'encounters.act', 'encounters.auto'
// Ereignisse: 'encounter.started', 'encounter.round', 'encounter.resolved'

import { type Ctx, defineModule, type GameState } from '../../core';
import { act, autoResolve, expireDecisions, getKind, join, resolveAction, start } from './engine';
import type {
  Encounter,
  EncounterAction,
  EncounterMode,
  EncounterOutcome,
  EncounterRequest,
  EncounterResult,
  EncountersState,
} from './types';

export { ENCOUNTER_ACTIONS } from './actions';
export {
  ABANDON_CASH_MAX,
  ABANDON_CASH_SHARE,
  BACKUP_COST,
  BACKUP_EDGE_BONUS,
  BACKUP_MAX_PEOPLE,
  PAYOFF_RELATION,
  PLAYER_STATS,
  TIPOFF_HEAT,
} from './config';
export {
  actionChance,
  activeParticipants,
  availableActions,
  type BriefingOption,
  briefingOptions,
  PLAYER_ID,
  payoffCost,
} from './engine';
export { ENCOUNTER_KINDS } from './kinds';
export type {
  Amount,
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterKind,
  EncounterMode,
  EncounterOpponentRequest,
  EncounterOutcome,
  EncounterPhase,
  EncounterRequest,
  EncounterResult,
  EncounterStat,
  EncountersState,
  Opponent,
  Participant,
  ParticipantCondition,
  RoundLog,
} from './types';

declare module '../../core' {
  interface ModuleStates {
    encounters: EncountersState;
  }
  interface GameCommands {
    /**
     * Spieler entscheidet im Briefing, wie er vorgeht (mode, siehe EncounterMode). Die alte Form present: true/false
     * gilt weiter als 'self' bzw. 'crew'.
     */
    'encounters.join': { encounterId: number; mode?: EncounterMode; present?: boolean };
    /** Eine Runde mit dieser Handlung spielen. */
    'encounters.act': { encounterId: number; actionId: string };
    /** Die Leute entscheiden selbst, der Rest wird ausgewürfelt. */
    'encounters.auto': { encounterId: number };
  }
  interface GameEvents {
    'encounter.started': { encounterId: number; kind: string; request: EncounterRequest };
    'encounter.round': { encounterId: number; round: number; actionId: string; success: boolean };
    'encounter.resolved': {
      encounterId: number;
      kind: string;
      outcome: EncounterOutcome;
      request: EncounterRequest;
      playerKilled: boolean;
      /**
       * Was passiert ist, aus Sicht des Spielers (Geld, Ware, ausgeschaltete Gegner, Verletzte …). Setzt encounters
       * immer; optional, damit andere Module (und Tests) das Ereignis weiter ohne auslösen können.
       */
      result?: EncounterResult;
      /** Wie der Spieler im Briefing vorgegangen ist (fehlt ohne Briefing). */
      mode?: EncounterMode;
    };
  }
}

/** Konfrontation starten. Das Ergebnis kommt als 'encounter.resolved'. Wirft bei unbekanntem Anlass. */
export function startEncounter(ctx: Ctx, request: EncounterRequest): { encounterId: number } {
  return { encounterId: start(ctx, request).id };
}

/** Sofort auswürfeln, ohne auf den Spieler zu warten (z.B. für Tests anderer Module). */
export function autoResolveEncounter(ctx: Ctx, encounterId: number): void {
  autoResolve(ctx, encounterId);
}

export function getEncounter(state: GameState, id: number): Encounter | undefined {
  const s = state.modules.encounters;
  return s.active.find((e) => e.id === id) ?? s.history.find((e) => e.id === id);
}

export function activeEncounters(state: GameState): readonly Encounter[] {
  return state.modules.encounters.active;
}

/** Die älteste laufende Konfrontation, die auf den Spieler wartet (für die Oberfläche). */
export function pendingEncounter(state: GameState): Encounter | undefined {
  return state.modules.encounters.active[0];
}

/** Handlung mit den Anpassungen des Anlasses (Beschriftung, Hinweis …). */
export function getEncounterAction(kindId: string, actionId: string): EncounterAction | undefined {
  const kind = getKind(kindId);
  return kind && resolveAction(kind, actionId);
}

// Spielstand-Formate älterer Versionen.
interface EncounterV1 {
  id: number;
  request: EncounterRequest;
  startedAt: number;
  outcome: EncounterOutcome | null;
  resolvedAt: number | null;
}
interface EncountersStateV1 {
  active: EncounterV1[];
  history: EncounterV1[];
}

/** Version 1 (Stub) → 2: Runden, Beteiligte, Ergebnis. Der Stub hat alles sofort entschieden. */
function migrateV1(old: EncountersStateV1): EncountersState {
  const upgrade = (e: EncounterV1): Encounter => ({
    id: e.id,
    kind: e.request.kind,
    request: e.request,
    startedAt: e.startedAt,
    phase: 'done',
    mode: null,
    situation: '',
    place: '',
    playerPresent: !!e.request.playerPresent,
    participants: [],
    opponent: {
      label: '',
      factionId: e.request.opponent?.factionId ?? null,
      strength: 0,
      count: 0,
      startCount: 0,
      down: 0,
    },
    edge: 50,
    round: 0,
    maxRounds: 0,
    log: [],
    bribeCost: 0,
    extraHeat: 0,
    goodsDropped: 0,
    bribeSpent: 0,
    deadline: e.startedAt,
    outcome: e.outcome ?? 'failure',
    resolvedAt: e.resolvedAt ?? e.startedAt,
    playerKilled: false,
    result: null,
  });
  return { active: [], history: [...old.active, ...old.history].map(upgrade) };
}

/** Version 2 → 3: Weg im Briefing (mode) und Beziehung zur Gegenseite im Ergebnis. */
function migrateV2(old: EncountersState): EncountersState {
  const upgrade = (e: Encounter): Encounter => ({
    ...e,
    mode: e.mode ?? (e.phase === 'briefing' || e.request.askPlayer !== true ? null : e.playerPresent ? 'self' : 'crew'),
    result: e.result ? { ...e.result, relation: e.result.relation ?? 0 } : null,
  });
  return { active: old.active.map(upgrade), history: old.history.map(upgrade) };
}

export default defineModule({
  id: 'encounters',
  version: 3,
  init: () => ({ active: [], history: [] }),
  tick: (ctx) => {
    if (ctx.state.modules.encounters.active.length > 0) expireDecisions(ctx);
  },
  commands: {
    'encounters.join': (ctx, { encounterId, mode, present }) =>
      join(ctx, encounterId, mode ?? (present ? 'self' : 'crew')),
    'encounters.act': (ctx, { encounterId, actionId }) => act(ctx, encounterId, actionId),
    'encounters.auto': (ctx, { encounterId }) => autoResolve(ctx, encounterId),
  },
  migrations: {
    2: migrateV1,
    3: migrateV2,
  },
});
