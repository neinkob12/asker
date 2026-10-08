// Einstellbare Werte der Konfrontationen. Zeiten in Spielminuten, Chancen von 0 bis 1.

import type { EncounterStats } from './types';

/** Werte des Spielers, solange es keine Charakter-Erstellung gibt. Etwas besser als ein frischer Läufer. */
export const PLAYER_STATS: EncounterStats = { speed: 55, caution: 50, strength: 60, charisma: 70 };

/** So heißt der Spieler in Texten. */
export const PLAYER_NAME = 'Du';

/** Überzahl bei Gewalt: pro Person mehr oder weniger so viel Stärke (Faktor, siehe tactics.ts statFactor). */
export const NUMBERS_BONUS = 0.06;

/** Abzug auf alle Werte eines Verletzten. */
export const INJURY_PENALTY = 15;

/** Trifft es den Spieler, obwohl er schon verletzt ist: so wahrscheinlich ist es tödlich. */
export const PLAYER_LETHAL_CHANCE = 0.6;

/** Auch der erste Treffer kann tödlich sein (Messer, Kugel). */
export const PLAYER_FIRST_HIT_LETHAL = 0.12;

/** Die Gegenseite zielt auf den Boss: So viel wahrscheinlicher trifft es den Spieler als einen seiner Leute. */
export const PLAYER_HIT_WEIGHT = 1.5;

/** Trifft es einen verletzten Mitarbeiter: so wahrscheinlich stirbt er (sonst schwer verletzt). */
export const STAFF_DEATH_CHANCE = 0.3;

/** Sicherheitsnetz: Wartet eine Konfrontation so lange auf ein Minispiel, handeln die Leute selbst (Spielminuten). */
export const DECISION_TIMEOUT = 120;

/** Gegnerstärken bis zu diesem Wert gelten als Faktor auf die Standardstärke des Anlasses. */
export const STRENGTH_FACTOR_LIMIT = 5;

/** So viele abgeschlossene Konfrontationen bleiben im Spielstand. */
export const HISTORY_LIMIT = 20;

/**
 * Heat im Veedel, wenn jemand anonym die Polizei ruft (gangs nutzt den Wert, Auftrag 23). Der Weg im Briefing dazu ist
 * mit der Akte weg (Auftrag 46d).
 */
export const TIPOFF_HEAT = 15;

// ---------------------------------------------------------------------------------------------
// Zeiger, Absicht, Polizei-Uhr, Einsätze (Auftrag 35). Siehe tactics.ts.

/** Ab dieser Aggression der Gegenseite wird geprügelt. */
export const AGGRESSION_FIGHT = 70;
/** Unter dieser Entschlossenheit zieht die Gegenseite ab (bzw. gibt nach). */
export const RETREAT_AT = 30;

/** Grenzen der Startwerte der Zeiger, damit keine Konfrontation schon entschieden beginnt. */
export const GAUGE_START_MIN = 15;
export const GAUGE_START_MAX = 85;
/** Start: pro Person Über- bzw. Unterzahl der Gegenseite so viel mehr Entschlossenheit. */
export const START_RESOLVE_PER_PERSON = 6;
/** Start: pro Punkt Kraftunterschied (Gegenseite minus eure Seite) so viel mehr Entschlossenheit. */
export const START_RESOLVE_PER_STRENGTH = 0.25;
/** Würfel: Stärke einer Runde zwischen diesen Faktoren (1 = mittel). */
export const DICE_MIN = 0.5;
export const DICE_MAX = 1.5;
/** Wert der Beteiligten: pro Punkt über der Gegenseite so viel stärker (Faktor), begrenzt. */
export const STAT_FACTOR_PER_POINT = 0.012;
export const STAT_FACTOR_MIN = 0.55;
export const STAT_FACTOR_MAX = 1.6;
/** Grenzen der Stärke einer Runde (Würfel × Werte × Absicht). */
export const STRENGTH_MIN = 0.3;
export const STRENGTH_MAX = 1.7;
/** Bist du selbst dabei, wirkt alles so viel stärker. */
export const PLAYER_PRESENT_FACTOR = 0.15;

/** Polizei-Uhr: Grenzen und wie Polizeipräsenz und Heat sie verkürzen. */
export const CLOCK_MIN = 2;
export const CLOCK_MAX = 8;
/** Pro 0,1 Polizeipräsenz über 1 eine halbe Runde weniger. */
export const CLOCK_PER_PRESENCE = 5;
/** Pro so viel Heat im Veedel eine Runde weniger. */
export const CLOCK_HEAT_STEP = 30;
/** Je näher die Streife, desto eher wollen sie weg: Entschlossenheit sinkt pro Runde, wenn die Uhr höchstens 2 zeigt. */
export const CLOCK_PRESSURE = 4;
/** Läuft die Uhr ab: Chance pro eigener Person, festgenommen zu werden (Anlässe ohne Polizei als Gegner). */
export const CLOCK_ARREST_CHANCE = 0.2;
/** Läuft die Uhr ab: Schaden an der Ware (ungeschützt bzw. geschützt), dazu Heat. */
export const CLOCK_GOODS_DAMAGE = 60;
export const CLOCK_GOODS_DAMAGE_PROTECTED = 20;
export const CLOCK_HEAT = 6;

/** Schlägerei: Grundchance, dass eure Seite pro Runde einen ausschaltet bzw. sie einen von euch erwischen. */
export const BRAWL_STRIKE = 0.35;
export const BRAWL_HIT = 0.4;
/** Wer die Leute schützt, wird in der Schlägerei so viel seltener getroffen (Faktor). */
export const BRAWL_PROTECTED_FACTOR = 0.5;
/** Ein Gegner geht zu Boden: so viel weniger Entschlossenheit. */
export const KNOCKDOWN_RESOLVE = 12;
/** Einer von euch geht zu Boden: so viel mehr Entschlossenheit. */
export const OWN_DOWN_RESOLVE = 10;
/** Schläger heizen jede Runde ein (Aggression pro Schläger, der noch dabei ist). */
export const BRUISER_DRIFT = 2;

/** Einsatz am Ende ungeschützt verloren: so viel Schaden; geschützt (in der letzten Runde) die Hälfte davon. */
export const END_DAMAGE = 100;
export const END_DAMAGE_PROTECTED = 50;

/** Ein geschützter Einsatz nimmt nur so viel vom Schaden einer Absicht (Treffer-Chance ebenso). */
export const PROTECT_FACTOR = 0.5;

/** Sicherheitsgrenze an Runden, falls die Uhr nicht abläuft. */
export const ROUND_LIMIT = 12;

// ---------------------------------------------------------------------------------------------
// Crew und Spezialzüge (Auftrag 35, Etappe 2). Regeln der Spezialzüge: crew.ts.

/** So viele Leute nimmt man höchstens mit (der Boss zählt nicht). */
export const CREW_MAX = 3;
/** Wer nicht schon vor Ort ist, fährt mit dem Taxi hin: so viel Schwarzgeld pro Person. */
export const CREW_TRAVEL_COST = 100;
/** Ab diesem Charisma gibt es eine zweite Verhandlung, ab diesem Tempo bringt man die halbe Ware weg. */
export const SPECIAL_CHARISMA = 70;
export const SPECIAL_SPEED = 70;
/** Ware in Sicherheit gebracht: Mehr als so viel Prozent der Ware kann nicht mehr verloren gehen. */
export const STASH_CAP = 50;

// ---------------------------------------------------------------------------------------------
// Minispiele (Auftrag 44, minigames.ts)

/** Nach einem Straßenkampf ohne Entscheidung: Aggression steht dann hier (unter AGGRESSION_FIGHT, die Fäuste ruhen). */
export const BRAWL_AFTER_AGGRESSION = 60;
/** Straßenkampf: so viel weniger Entschlossenheit pro Gegner am Boden. */
export const BRAWL_DOWN_RESOLVE = 15;
/** Verkehrskontrolle durch, aber mit Widersprüchen (picks 'lies:<n>'): Er notiert das Kennzeichen, Heat je Widerspruch. */
export const TRAFFIC_NOTED_HEAT = 3;
