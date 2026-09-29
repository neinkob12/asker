// Einstellbare Werte der Reviere. Zeiten in Spielminuten, Raten pro Spielstunde.

/** Einfluss liegt zwischen 0 und MAX_INFLUENCE. */
export const MAX_INFLUENCE = 100;

/** Ab diesem Einfluss kontrolliert eine Fraktion ein Veedel (wenn sie dort die meiste hat). */
export const CONTROL_THRESHOLD = 50;

/**
 * Wer kontrolliert, verliert die Kontrolle erst unter diesem Wert (oder wenn jemand anders die Schwelle mit mehr
 * Einfluss schafft). Verhindert, dass die Kontrolle um 50 herum ständig hin- und herspringt.
 */
export const LOSE_CONTROL_THRESHOLD = 45;

/** Farbe des Spielers auf der Karte. */
export const PLAYER_COLOR = '#6fdc8c';

/** Farbe für "niemand". */
export const NEUTRAL_COLOR = '#7f8c8d';

// --- Verkäufe -------------------------------------------------------------------------------------------------

/** Einfluss pro Verkauf im Veedel … */
export const SALE_INFLUENCE_BASE = 0.4;
/** … plus so viel pro verkaufter Einheit … */
export const SALE_INFLUENCE_PER_UNIT = 0.08;
/** … höchstens so viel pro Verkauf. */
export const SALE_INFLUENCE_MAX = 1.5;
/** Jeder Verkauf nimmt der stärksten Gang im Veedel diesen Anteil des Gewinns ab. */
export const SALE_DISPLACEMENT = 0.6;

// --- Präsenz und Verfall (stündlich) ------------------------------------------------------------------------

/** So lange nach dem letzten eigenen Verkauf zählt der Spieler im Veedel noch als präsent. */
export const SALE_PRESENCE_MINUTES = 24 * 60;
/** Einfluss pro Stunde und aktivem Mitarbeiter im Veedel … */
export const STAFF_PRESENCE_PER_HOUR = 0.1;
/** … gezählt werden höchstens so viele. */
export const STAFF_PRESENCE_MAX = 3;
/**
 * Ein Leutnant im Veedel bringt zusätzlich so viel Einfluss pro Stunde (Level 1, Charisma 50), plus so viel pro
 * Level darüber. Charisma wirkt als Faktor 0,75 (0) bis 1,25 (100).
 */
export const LIEUTENANT_INFLUENCE_PER_HOUR = 0.15;
export const LIEUTENANT_INFLUENCE_PER_LEVEL = 0.03;
/** Verfall pro Stunde ohne Präsenz. */
export const DECAY_PER_HOUR = 0.15;
/** Eine Gang, die ein Veedel kontrolliert, baut ihren Einfluss wieder auf (bis zum Startwert des Veedels). */
export const GANG_REGEN_PER_HOUR = 0.25;
/**
 * Eine Gang mit Rückhalt (Heimat-Veedel oder kontrolliertes Nachbar-Veedel) drückt in Veedel zurück, die keine
 * andere Gang kontrolliert. So holen sich die Gangs vernachlässigte Veedel langsam zurück.
 */
export const GANG_PRESSURE_PER_HOUR = 0.1;
