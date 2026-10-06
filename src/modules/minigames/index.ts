// Minispiele (Auftrag 44): kleine Spiele bei Ereignissen, in denen der Spieler selbst betroffen ist (er fährt selbst,
// steht selbst am Spot, ist selbst bei der Konfrontation). Sie sind Pflicht: Der Rahmen in der Oberfläche hat keinen
// Weg zum Überspringen. Nur wenn die Stadt eine aktive Rechte Hand hat, kann sie übernehmen (mit einer Chance aus
// ihrem Wert und ihrer Stufe, gewürfelt hier im Kern).
//
// Ablauf für Aufrufer: startMinigame(ctx, { kind, origin, title, situation, params }) liefert eine ID (oder null, wenn
// die Art nicht scharf ist, siehe unten). Die Oberfläche öffnet den Rahmen auf 'minigame.started', spielt das Spiel
// und schickt das Ergebnis als Befehl 'minigames.finish' { id, score, picks } (der Kern prüft und begrenzt die Werte).
// Das Ergebnis kommt als Ereignis 'minigame.finished' mit demselben origin; das auslösende Modul wendet die Folgen an.
// Ohne Oberfläche (Tests, Bot, Autopilot) läuft nach MINIGAME_TIMEOUT Spielminuten die Frist ab: by 'timeout',
// score null, won false. Dann gilt genau das alte Verhalten (Würfel wie bisher, kein Bonus, kein Abzug).
//
// Eine Art ist erst „scharf“, wenn ihre Datei kinds/<art>.ts ready: true setzt. Vorher liefert startMinigame null,
// und alles bleibt wie bisher. So ist main nach jedem Merge spielbar.
//
// Determinismus: Inhalte eines Minispiels erzeugt die Oberfläche aus challenge.seed (createRng aus dem Kern). Der Seed
// kommt fest aus Spiel-Seed und ID (keyedRandom), die ID aus einem eigenen Zähler: Ein Minispiel verschiebt weder die
// Würfelfolge noch die IDs anderer Module.
//
// Öffentliche API:
//   startMinigame(ctx, request), getChallenge(state, id), activeChallenge(state), isMinigameReady(kind),
//   delegateInfo(state, challenge), minigameDifficulty(state, { cityId, veedelId }), resolveMinigameNow(ctx, id),
//   minigameStats(state), MINIGAME_KINDS, MINIGAME_KIND_IDS, winAt(kind)
// Befehle: 'minigames.finish', 'minigames.delegate', 'minigames.expire' (nur mit Actor 'system', z.B. vom Bot)
// Ereignisse: 'minigame.started', 'minigame.finished'

import { defineModule, type GameState } from '../../core';
import {
  delegateMinigame,
  emptyStats,
  expireChallenges,
  finishMinigame,
  initialState,
  resolveMinigameNow,
} from './engine';
import type { MinigameBy, MinigameKind, MinigameOrigin, MinigameStats, MinigamesState } from './types';

export {
  DEFAULT_WIN_AT,
  MINIGAME_TIMEOUT,
  PICK_MAX_LENGTH,
  PICKS_MAX,
  RIGHT_HAND_LOSE_SCORE,
  RIGHT_HAND_WIN_SCORE,
} from './config';
export {
  activeChallenge,
  challengeSeed,
  cleanPicks,
  cleanScore,
  delegateChance,
  delegateInfo,
  getChallenge,
  isMinigameReady,
  minigameDifficulty,
  resolveMinigameNow,
  startMinigame,
  winAt,
} from './engine';
export { MINIGAME_KIND_IDS, MINIGAME_KINDS } from './kinds';
export type {
  Challenge,
  MinigameBy,
  MinigameKind,
  MinigameKindDef,
  MinigameOrigin,
  MinigameRecord,
  MinigameRequest,
  MinigameStat,
  MinigameStats,
  MinigamesState,
} from './types';

declare module '../../core' {
  interface ModuleStates {
    minigames: MinigamesState;
  }
  interface GameCommands {
    /** Ergebnis des Spielers: score 0 bis 1 (wird begrenzt), picks höchstens 20 kurze Texte (je Art, siehe Auftrag). */
    'minigames.finish': { id: number; score: number; picks?: string[] };
    /** Die Rechte Hand der Stadt übernimmt (nur mit aktiver Rechter Hand). Sie würfelt mit ihrer Chance. */
    'minigames.delegate': { id: number };
    /** Sofort als timeout auflösen (nur Actor 'system', z.B. der Bot). Der Spieler kann nicht überspringen. */
    'minigames.expire': { id: number };
  }
  interface GameEvents {
    'minigame.started': { id: number; kind: MinigameKind; origin: MinigameOrigin; cityId: string };
    'minigame.finished': {
      id: number;
      kind: MinigameKind;
      origin: MinigameOrigin;
      cityId: string;
      /** null bei timeout. */
      score: number | null;
      /** Bei timeout immer false. */
      won: boolean;
      by: MinigameBy;
      /** Was im Spiel passiert ist (je Art, z.B. 'dumped', 'down:2'). Leer bei Rechter Hand und timeout. */
      picks: string[];
    };
  }
}

/** Gespielt, gewonnen und übernommen pro Art. */
export function minigameStats(state: GameState): Record<MinigameKind, MinigameStats> {
  return state.modules.minigames?.stats ?? emptyStats();
}

export default defineModule({
  id: 'minigames',
  version: 1,
  init: () => initialState(),
  tick: (ctx) => {
    if (ctx.state.modules.minigames.active.length > 0) expireChallenges(ctx);
  },
  commands: {
    'minigames.finish': (ctx, { id, score, picks }) => finishMinigame(ctx, id, score, picks),
    'minigames.delegate': (ctx, { id }) => delegateMinigame(ctx, id),
    'minigames.expire': (ctx, { id }, meta) => {
      if (meta.actor !== 'system') return { ok: false, reason: 'Minispiele lassen sich nicht überspringen.' };
      return resolveMinigameNow(ctx, id) ? { ok: true } : { ok: false, reason: 'Dieses Minispiel ist schon vorbei.' };
    },
  },
  migrations: {},
});
