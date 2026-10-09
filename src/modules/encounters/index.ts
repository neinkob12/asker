// Konfrontationen: Überfälle, Polizeiflucht, Verkehrs- und Zollkontrollen, Schulden eintreiben, Übernahmen. Anlässe,
// Handlungen und Absichten sind reine Daten (kinds.ts, actions.ts, intents.ts).
//
// Auftrag 46d: Die Akte (Briefing, Handlungen wählen, Zeiger beobachten) ist als Oberfläche weg. Jede Konfrontation
// wird sofort beim Start entschieden (engine.ts resolveNow): Stärke, Sicherheit am Spot, Heat und Würfel, die Leute
// spielen mit der klugen Strategie (strategy.ts), die bisher der Bot nutzte. Bist du selbst vor Ort (playerPresent),
// kommt stattdessen zuerst das Minispiel des Anlasses (EncounterKind.minigames: Straßenkampf, Verfolgungsjagd,
// Verkehrskontrolle, Papiere), und sein Ausgang bestimmt die Folgen. Das Ergebnis zeigt eine kurze Karte über der
// Karte (ui/). Ohne Oberfläche läuft ein Minispiel nach seiner Frist ab, dann würfeln die Leute aus.
//
// Ablauf für Aufrufer: startEncounter(ctx, {...}) liefert eine ID; das Ergebnis kommt als Ereignis 'encounter.resolved'
// (mit derselben ID, dem origin und dem Ergebnis), in der Regel noch im selben Aufruf. Nur mit dir vor Ort und einem
// scharfen Minispiel wartet die Konfrontation (encounter.minigame); 'encounters.auto' bzw. autoResolveEncounter(ctx, id)
// löst sie vorher auf (das Minispiel gilt dann als nicht gespielt).
//
// Der Spieler kann nur sterben, wenn er selbst dabei ist. Dann löst das Modul Game Over mit 'killed' aus.
//
// Öffentliche API:
//   startEncounter(ctx, request), getEncounter(state, id), activeEncounters(state), autoResolveEncounter(ctx, id),
//   addResultLosses(ctx, id, losses) (Folgen, die der Auslöser selbst bucht, auf der Ergebnis-Karte nachtragen),
//   ENCOUNTER_KINDS, ROLE_NAMES, PLAYER_STATS, TIPOFF_HEAT, minigameParams, apply* (Folgen der Minispiele)
// Befehle: 'encounters.auto'
// Ereignisse: 'encounter.started', 'encounter.round', 'encounter.resolved'

import { type Ctx, defineModule, type GameState } from '../../core';
import { addResultLosses as addLosses, autoResolve, expireDecisions, getKind, stakesFor, start } from './engine';
import { ENCOUNTER_INTENTS } from './intents';
import { onMinigameFinished } from './minigames';
import { buildFoes, firstIntent } from './tactics';
import type {
  Encounter,
  EncounterMode,
  EncounterOutcome,
  EncounterRequest,
  EncounterResult,
  EncountersState,
} from './types';

export { PLAYER_STATS, TIPOFF_HEAT } from './config';
export { ENCOUNTER_KINDS } from './kinds';
export {
  applyBrawl,
  applyChase,
  applyPapers,
  applyTraffic,
  encounterChallenge,
  type MinigameResult,
  minigameParams,
} from './minigames';
export { ROLE_NAMES } from './tactics';
export type {
  Amount,
  Encounter,
  EncounterAction,
  EncounterEffects,
  EncounterEnding,
  EncounterIntent,
  EncounterKind,
  EncounterMinigame,
  EncounterMinigames,
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
    /** Eine wartende Konfrontation (offenes Minispiel) sofort auswürfeln lassen. */
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
      /** Wie die eigene Seite vorgegangen ist (fehlt ohne Briefing; seit Auftrag 46d immer 'crew' oder 'self'). */
      mode?: EncounterMode;
    };
  }
}

/** Konfrontation starten. Das Ergebnis kommt als 'encounter.resolved', meist noch im selben Aufruf. Wirft bei unbekanntem Anlass. */
export function startEncounter(ctx: Ctx, request: EncounterRequest): { encounterId: number } {
  return { encounterId: start(ctx, request).id };
}

/**
 * Folgen, die der Auslöser nach 'encounter.resolved' selbst gebucht hat (z.B. Beschlagnahme und Festnahme nach einer
 * Polizeiflucht), ins Ergebnis nachtragen, damit die Ergebnis-Karte sie zeigt. Bucht selbst nichts.
 */
export function addResultLosses(
  ctx: Ctx,
  encounterId: number,
  losses: { goods?: number; money?: number; staffArrested?: readonly string[] },
): void {
  addLosses(ctx, encounterId, losses);
}

/** Eine wartende Konfrontation sofort auswürfeln, ohne auf den Spieler zu warten (z.B. für Tests anderer Module). */
export function autoResolveEncounter(ctx: Ctx, encounterId: number): void {
  autoResolve(ctx, encounterId);
}

export function getEncounter(state: GameState, id: number): Encounter | undefined {
  const s = state.modules.encounters;
  return s.active.find((e) => e.id === id) ?? s.history.find((e) => e.id === id);
}

/** Konfrontationen, die noch auf ein Minispiel warten (sonst ist alles sofort entschieden). */
export function activeEncounters(state: GameState): readonly Encounter[] {
  return state.modules.encounters.active;
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
      stakes: (kind ? stakesFor(kind, e.request) : []).map((id) => ({ id, damage: 0 })),
      protect: null,
      participants: (e.participants ?? []).map((p) => ({ ...p, move: p.move ?? null, moveUsed: p.moveUsed ?? false })),
    };
    if (!done && kind) {
      encounter.intent = firstIntent(encounter, kind);
      const target = encounter.intent ? ENCOUNTER_INTENTS[encounter.intent]?.stake : undefined;
      const ids = encounter.stakes.map((x) => x.id);
      encounter.protect = target && ids.includes(target) ? target : (ids[0] ?? null);
      encounter.maxRounds = (e.round ?? 0) + clockLeft;
    }
    return encounter;
  };
  return { active: old.active.map(upgrade), history: old.history.map(upgrade) };
}

/** Version 4 → 5 (Auftrag 44): offenes Minispiel einer Konfrontation (alte Stände haben keins). */
export function migrateV4(old: EncountersState): EncountersState {
  return { active: old.active.map((e) => ({ ...e, minigame: e.minigame ?? null })), history: old.history };
}

/**
 * Version 5 → 6 (Auftrag 46d): Ohne Akte wartet nichts mehr auf den Spieler. Laufende Konfrontationen alter Stände
 * (Briefing oder Runden ohne Minispiel) werden beim ersten Schritt ausgewürfelt: Ihre Frist ist abgelaufen
 * (expireDecisions). Nur eine mit offenem Minispiel wartet weiter auf dessen Ausgang.
 */
export function migrateV5(old: EncountersState): EncountersState {
  return {
    active: old.active.map((e) => (e.minigame ? e : { ...e, deadline: Math.min(e.deadline, e.startedAt) })),
    history: old.history,
  };
}

export default defineModule({
  id: 'encounters',
  version: 6,
  init: () => ({ active: [], history: [] }),
  tick: (ctx) => {
    if (ctx.state.modules.encounters.active.length > 0) expireDecisions(ctx);
  },
  commands: {
    'encounters.auto': (ctx, { encounterId }) => autoResolve(ctx, encounterId),
  },
  on: {
    'minigame.finished': onMinigameFinished,
  },
  migrations: {
    2: migrateV1,
    3: migrateV2,
    4: migrateV3,
    5: migrateV4,
    6: migrateV5,
  },
});
