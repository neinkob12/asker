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
import {
  act,
  autoResolve,
  delegateAbsent,
  expireDecisions,
  getKind,
  join,
  protect,
  resolveAction,
  special,
  start,
} from './engine';
import { ENCOUNTER_INTENTS } from './intents';
import { buildFoes, firstIntent } from './tactics';
import type {
  Encounter,
  EncounterAction,
  EncounterMode,
  EncounterOutcome,
  EncounterRequest,
  EncounterResult,
  EncountersState,
  StakeId,
} from './types';

export { ENCOUNTER_ACTIONS } from './actions';
export { ADVICE_RULES, type Advice, type AdviceRule, adviceText, rightHandAdvice } from './advice';
export {
  ABANDON_CASH_MAX,
  ABANDON_CASH_SHARE,
  AGGRESSION_FIGHT,
  BACKUP_COST,
  BACKUP_EDGE_BONUS,
  BACKUP_MAX_PEOPLE,
  CREW_MAX,
  CREW_TRAVEL_COST,
  PAYOFF_RELATION,
  PLAYER_STATS,
  RETREAT_AT,
  TIPOFF_HEAT,
} from './config';
export {
  type CrewCandidate,
  type CrewMemberInfo,
  crewCandidates,
  SPECIAL_MOVE_RULES,
  SPECIAL_MOVES,
  type SpecialMove,
  type SpecialMoveRule,
  specialMoveOf,
  specialMoves,
  suggestedCrew,
} from './crew';
export {
  actionChance,
  activeParticipants,
  availableActions,
  availableMoves,
  type BriefingOption,
  briefingOptions,
  PLAYER_ID,
  payoffCost,
  requestCity,
} from './engine';
export { ENCOUNTER_INTENTS } from './intents';
export { ENCOUNTER_KINDS } from './kinds';
export { autoProtect, chooseAuto, chooseMove, scoreAction } from './strategy';
export {
  foesIn,
  getIntent,
  previewShift,
  ROLE_NAMES,
  type ShiftPreview,
  STAKE_NAMES,
  stakeName,
} from './tactics';
export type {
  Amount,
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterEnding,
  EncounterIntent,
  EncounterKind,
  EncounterMode,
  EncounterOpponentRequest,
  EncounterOutcome,
  EncounterPhase,
  EncounterRequest,
  EncounterResult,
  EncounterResultPart,
  EncounterSetting,
  EncounterSituation,
  EncounterStat,
  EncountersState,
  Foe,
  FoeRole,
  GaugeShift,
  Opponent,
  Participant,
  ParticipantCondition,
  RoundLog,
  SpecialMoveId,
  StakeId,
  StakeState,
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
    'encounters.join': { encounterId: number; mode?: EncounterMode; present?: boolean; crew?: string[] };
    /** Spezialzug einer Person aus der Crew spielen (einmal pro Konfrontation, kostet keine Runde). */
    'encounters.special': { encounterId: number; participantId: string };
    /** Eine Runde mit dieser Handlung spielen, optional mit neuem Schutz (Einsatz). */
    'encounters.act': { encounterId: number; actionId: string; protect?: StakeId };
    /** Einsatz wählen, den die eigene Seite ab jetzt schützt (kostet keine Runde). */
    'encounters.protect': { encounterId: number; stake: StakeId };
    /** Die Leute entscheiden selbst, der Rest wird ausgewürfelt. */
    'encounters.auto': { encounterId: number };
  }
  interface GameEvents {
    'encounter.started': { encounterId: number; kind: string; request: EncounterRequest };
    'encounter.round': {
      encounterId: number;
      round: number;
      actionId: string;
      /** Hat die Runde unterm Strich geholfen? */
      success: boolean;
      /** Zeiger und Polizei-Uhr nach der Runde (Auftrag 35). */
      aggression?: number;
      resolve?: number;
      clock?: number;
    };
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
    aggression: 0,
    resolve: 0,
    clock: 0,
    brawl: false,
    intent: null,
    foes: [],
    stakes: [],
    protect: null,
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
function migrateV2(old: EncountersStateV3): EncountersStateV3 {
  const upgrade = (e: EncounterV3): EncounterV3 => ({
    ...e,
    mode: e.mode ?? (e.phase === 'briefing' || e.request.askPlayer !== true ? null : e.playerPresent ? 'self' : 'crew'),
    result: e.result ? { ...e.result, relation: e.result.relation ?? 0 } : null,
  });
  return { active: old.active.map(upgrade), history: old.history.map(upgrade) };
}

/** Stand bis Version 3: Lage (edge) und Runden statt Zeigern, Uhr, Absicht, Rollen und Einsätzen. */
type EncounterV3 = Omit<
  Encounter,
  'aggression' | 'resolve' | 'clock' | 'brawl' | 'intent' | 'foes' | 'stakes' | 'protect'
> &
  Partial<Pick<Encounter, 'aggression' | 'resolve' | 'clock' | 'brawl' | 'intent' | 'foes' | 'stakes' | 'protect'>>;
interface EncountersStateV3 {
  active: EncounterV3[];
  history: EncounterV3[];
}

/**
 * Version 3 → 4 (Auftrag 35): Zeiger, Polizei-Uhr, Absicht, Gegner mit Rollen und Einsätze. Eine laufende
 * Konfrontation macht dort weiter, wo sie stand: Die Lage wird zur Entschlossenheit (gute Lage = wenig entschlossen),
 * die übrigen Runden zur Uhr, die erste mögliche Absicht des Anlasses steht an (ohne Würfel).
 */
export function migrateV3(old: EncountersStateV3): EncountersState {
  const upgrade = (e: EncounterV3): Encounter => {
    const kind = getKind(e.kind);
    const done = e.phase === 'done';
    const count = Math.max(0, e.opponent?.count ?? 0);
    const foes = buildFoes(e.opponent?.startCount ?? count, kind);
    // Wer schon weg ist, zählt als weg (die Ausgeschalteten zuerst).
    let out = foes.length - count;
    for (let i = foes.length - 1; i >= 0 && out > 0; i--, out--) {
      foes[i].state = i >= foes.length - (e.opponent?.down ?? 0) ? 'down' : 'gone';
    }
    const resolve = Math.min(90, Math.max(35, Math.round(100 - (e.edge ?? 50))));
    const clockLeft = done ? 0 : Math.max(1, (e.maxRounds ?? 0) - (e.round ?? 0));
    const encounter: Encounter = {
      ...e,
      aggression: kind?.gauges.aggression ?? 40,
      resolve,
      clock: clockLeft,
      brawl: false,
      intent: null,
      foes,
      stakes: (kind?.stakes ?? []).map((id) => ({ id, damage: 0 })),
      protect: null,
      participants: (e.participants ?? []).map((p) => ({ ...p, move: p.move ?? null, moveUsed: p.moveUsed ?? false })),
    };
    if (!done && kind) {
      encounter.intent = firstIntent(encounter, kind);
      const target = encounter.intent ? ENCOUNTER_INTENTS[encounter.intent]?.stake : undefined;
      encounter.protect = target && kind.stakes.includes(target) ? target : (kind.stakes[0] ?? null);
      encounter.maxRounds = (e.round ?? 0) + clockLeft;
    }
    return encounter;
  };
  return { active: old.active.map(upgrade), history: old.history.map(upgrade) };
}

export default defineModule({
  id: 'encounters',
  version: 4,
  init: () => ({ active: [], history: [] }),
  tick: (ctx) => {
    if (ctx.state.modules.encounters.active.length > 0) {
      delegateAbsent(ctx);
      expireDecisions(ctx);
    }
  },
  commands: {
    'encounters.join': (ctx, { encounterId, mode, present, crew }) =>
      join(ctx, encounterId, mode ?? (present ? 'self' : 'crew'), crew),
    'encounters.special': (ctx, { encounterId, participantId }) => special(ctx, encounterId, participantId),
    'encounters.act': (ctx, { encounterId, actionId, protect: guard }) => act(ctx, encounterId, actionId, guard),
    'encounters.protect': (ctx, { encounterId, stake }) => protect(ctx, encounterId, stake),
    'encounters.auto': (ctx, { encounterId }) => autoResolve(ctx, encounterId),
  },
  migrations: {
    2: migrateV1,
    3: migrateV2,
    4: migrateV3,
  },
});
