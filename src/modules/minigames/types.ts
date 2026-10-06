// Typen der Minispiele (Auftrag 44). Reine Daten (JSON), damit sie im Spielstand liegen können.

/** Die zehn Minispiele. Neue Art = neue Datei in kinds/ und ein Eintrag hier. */
export type MinigameKind =
  | 'chase'
  | 'brawl'
  | 'stash'
  | 'traffic'
  | 'undercover'
  | 'safe'
  | 'search'
  | 'container'
  | 'papers'
  | 'interview';

/** Wert der Rechten Hand, der beim Übernehmen zählt (wie in staff). */
export type MinigameStat = 'speed' | 'caution' | 'strength' | 'charisma';

/** Wer ein Minispiel entschieden hat: selbst gespielt, die Rechte Hand oder die Frist ohne Oberfläche. */
export type MinigameBy = 'player' | 'rightHand' | 'timeout';

/** Eine Art Minispiel als Daten (kinds/<art>.ts). */
export interface MinigameKindDef {
  /** Name für Oberfläche und Journal, z.B. „Verfolgungsjagd“. */
  name: string;
  /** Wert der Rechten Hand, der beim Übernehmen zählt. */
  stat: MinigameStat;
  /** Erst true, wenn der Teil fertig ist. Vorher startet der Kern die Art nie, und alles bleibt wie bisher. */
  ready: boolean;
  /** Ab diesem Score gilt es als geschafft (Standard DEFAULT_WIN_AT, 0,5). */
  winAt?: number;
}

/** Wer ein Minispiel gestartet hat, z.B. { module: 'gangs', ref: 'safe:ost:12' }. Pro origin höchstens eins offen. */
export interface MinigameOrigin {
  module: string;
  ref: string;
}

/** Ein offenes Minispiel. */
export interface Challenge {
  id: number;
  kind: MinigameKind;
  origin: MinigameOrigin;
  cityId: string;
  veedelId?: string;
  /** Fest aus Spiel-Seed und id (keyedRandom). Daraus erzeugt die Oberfläche die Inhalte (createRng). */
  seed: number;
  /** 0 = leicht, 1 = sehr schwer. */
  difficulty: number;
  /** Für die Einleitung: Titel und Situation in einem Satz. */
  title: string;
  situation: string;
  /** Nur JSON-Daten für die Oberfläche, je Art (siehe docs/auftraege/44-minispiele.md). */
  params: Record<string, unknown>;
  startedAt: number;
  /** Frist für den Fall ohne Oberfläche (Tests, Bot): danach als timeout aufgelöst. */
  deadline: number;
}

/** Ein entschiedenes Minispiel (die letzten HISTORY_LIMIT). */
export interface MinigameRecord {
  id: number;
  kind: MinigameKind;
  origin: MinigameOrigin;
  /** null bei timeout. */
  score: number | null;
  by: MinigameBy;
  won: boolean;
  at: number;
}

export interface MinigameStats {
  played: number;
  won: number;
  delegated: number;
}

export interface MinigamesState {
  active: Challenge[];
  /** Neueste zuerst. */
  history: MinigameRecord[];
  stats: Record<MinigameKind, MinigameStats>;
  /** Eigener Zähler für die IDs (nicht ctx.nextId: ein Minispiel soll keine anderen IDs verschieben). */
  nextId: number;
}

/** Was ein Modul zum Starten angibt (startMinigame). */
export interface MinigameRequest {
  kind: MinigameKind;
  origin: MinigameOrigin;
  /** Standard: Stadt des Veedels, sonst die aktive Stadt. */
  cityId?: string;
  veedelId?: string;
  /** Standard: minigameDifficulty(state, { cityId, veedelId }). */
  difficulty?: number;
  title: string;
  situation: string;
  params?: Record<string, unknown>;
}
