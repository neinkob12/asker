// Einstellbare Werte der Kasse.

/** So viele vergangene Tage hält das Buch fest (dazu der laufende Tag). Ältere fallen weg. */
export const DAYS_KEPT = 30;

/**
 * Nur für die jüngsten Tage merkt sich das Buch die einzelnen Buchungstexte; bei älteren bleiben die Tageswerte je
 * Kategorie, Spot und Leutnant (begrenzt den Spielstand).
 */
export const REASON_DAYS_KEPT = 7;

/** So viele verschiedene Buchungstexte merkt sich das Buch pro Kategorie und Tag, der Rest landet in "Weitere". */
export const REASON_LIMIT = 40;
export const OTHER_REASON = 'Weitere';

/** Unter so vielen Tagen Reichweite der Löhne warnt die Kasse (Warnfarbe, Nächster Schritt). */
export const RUNWAY_WARN_DAYS = 2;
