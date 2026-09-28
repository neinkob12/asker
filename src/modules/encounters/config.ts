// Einstellbare Werte der Konfrontationen. Zeiten in Spielminuten, Chancen von 0 bis 1.

import type { EncounterStats } from './types';

/** Werte des Spielers, solange es keine Charakter-Erstellung gibt. Etwas besser als ein frischer Läufer. */
export const PLAYER_STATS: EncounterStats = { speed: 55, caution: 50, strength: 60, charisma: 70 };

/** So heißt der Spieler in Texten. */
export const PLAYER_NAME = 'Du';

/** Bonus auf jede Chance, wenn der Spieler selbst dabei und noch auf den Beinen ist. */
export const PLAYER_PRESENT_BONUS = 0.1;

/** Bonus bzw. Malus pro Person Über- oder Unterzahl bei Gewalt. */
export const NUMBERS_BONUS = 0.06;

/** Abzug auf alle Werte eines Verletzten. */
export const INJURY_PENALTY = 15;

/** Grenzen jeder Chance. Nichts ist sicher. */
export const MIN_CHANCE = 0.05;
export const MAX_CHANCE = 0.95;

/** Die Lage verschiebt jede Chance ein wenig: (Lage - 50) / EDGE_CHANCE_DIVISOR. */
export const EDGE_CHANCE_DIVISOR = 250;

/** Startlage: 50 plus Vorteil durch Überzahl und Stärke, begrenzt. */
export const EDGE_START = 50;
export const EDGE_START_MIN = 25;
export const EDGE_START_MAX = 75;

/** Erreicht die Lage nach den Runden mindestens so viel, gewinnt man; darunter bis RETREAT eine Pattsituation. */
export const EDGE_WIN_AFTER_ROUNDS = 60;
export const EDGE_RETREAT_AFTER_ROUNDS = 40;

/** Trifft es den Spieler, obwohl er schon verletzt ist: so wahrscheinlich ist es tödlich. */
export const PLAYER_LETHAL_CHANCE = 0.6;

/** Auch der erste Treffer kann tödlich sein (Messer, Kugel). */
export const PLAYER_FIRST_HIT_LETHAL = 0.12;

/** Die Gegenseite zielt auf den Boss: So viel wahrscheinlicher trifft es den Spieler als einen seiner Leute. */
export const PLAYER_HIT_WEIGHT = 1.5;

/** Trifft es einen verletzten Mitarbeiter: so wahrscheinlich stirbt er (sonst schwer verletzt). */
export const STAFF_DEATH_CHANCE = 0.3;

/** Ohne Entscheidung (z.B. ohne Oberfläche) handeln die Leute nach dieser Zeit selbst. Der Dialog pausiert das Spiel. */
export const DECISION_TIMEOUT = 120;

/** Gegnerstärken bis zu diesem Wert gelten als Faktor auf die Standardstärke des Anlasses. */
export const STRENGTH_FACTOR_LIMIT = 5;

/** So viele abgeschlossene Konfrontationen bleiben im Spielstand. */
export const HISTORY_LIMIT = 20;
