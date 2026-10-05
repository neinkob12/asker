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

/** Wer ein Veedel übernehmen will, braucht so viel mehr Einfluss als der bisherige Herr. */
export const TAKEOVER_MARGIN = 5;

/** Farbe des Spielers auf der Karte. */
export const PLAYER_COLOR = '#6fdc8c';

/** Farbe für "niemand". */
export const NEUTRAL_COLOR = '#7f8c8d';

// --- Verkäufe -------------------------------------------------------------------------------------------------

/** Einfluss pro Verkauf im Veedel … */
export const SALE_INFLUENCE_BASE = 0.25;
/** … plus so viel pro verkaufter Einheit … */
export const SALE_INFLUENCE_PER_UNIT = 0.05;
/** … höchstens so viel pro Verkauf. */
export const SALE_INFLUENCE_MAX = 1;
/** Jeder Verkauf nimmt der stärksten Gang im Veedel diesen Anteil des Gewinns ab. */
export const SALE_DISPLACEMENT = 0.5;
/**
 * Einfluss pro Verkauf je Stadt (Auftrag 30, fehlt: 1). In Hamburg sitzen die Gangs fester: Wer aus Köln kommt, hat
 * viel Geld und Leute; das erste Hamburger Veedel soll trotzdem etwa 7 bis 10 Tage dauern (Balancing-Bericht).
 */
export const SALE_INFLUENCE_FACTOR_BY_CITY: Readonly<Record<string, number>> = { hamburg: 0.6, frankfurt: 0.7 };

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
export const LIEUTENANT_INFLUENCE_PER_HOUR = 0.08;
export const LIEUTENANT_INFLUENCE_PER_LEVEL = 0.03;
/**
 * Ein Leutnant führt bis zu drei Spots, auch in verschiedenen Veedeln. Sein Einfluss verteilt sich nach der Zahl seiner
 * Spots dort, und jeder weitere Spot im selben Veedel wirkt um so viel stärker (drei Spots in einem Veedel bringen dort
 * mehr als drei verstreute zusammen): Anteil × (1 + Bonus × (Spots dort − 1)).
 */
export const LIEUTENANT_CLUSTER_BONUS = 0.25;
/** Verfall pro Stunde ohne Präsenz. */
export const DECAY_PER_HOUR = 0.15;
/** Eine Gang, die ein Veedel kontrolliert, baut ihren Einfluss wieder auf (bis zum Startwert des Veedels). */
export const GANG_REGEN_PER_HOUR = 0.2;
/**
 * Eine Gang mit Rückhalt (Heimat-Veedel oder kontrolliertes Nachbar-Veedel) drückt in Veedel zurück, die keine
 * andere Gang kontrolliert. So holen sich die Gangs vernachlässigte Veedel langsam zurück.
 */
export const GANG_PRESSURE_PER_HOUR = 0.1;
