/** Grenzen für den Konkurrenzfaktor im Richtpreis. */
export const MIN_COMPETITION_FACTOR = 0.5;
export const MAX_COMPETITION_FACTOR = 1.5;

/** Wie stark die Kaufkraft des Veedels durchschlägt: Faktor = 1 + (Kaufkraft - 1) × Gewicht. */
export const PURCHASING_POWER_WEIGHT = 0.8;

/**
 * Angebot und Nachfrage: Verkäufe drücken den Druck ins Minus (Markt gesättigt), Kunden ohne passende Ware
 * ins Plus (Nachfrage übersteigt Angebot). Faktor = 1 + SPANNE × tanh(Druck).
 */
export const SUPPLY_DEMAND_RANGE = 0.25;
/** So viel Umsatz (Grundpreis × Menge) verschiebt den Druck um 1. */
export const SATURATION_EUR = 1500;
/** Kunden, die ohne Ware gehen, zählen mit diesem Gewicht als Nachfrage. */
export const LOST_CUSTOMER_WEIGHT = 0.5;
/** Pro Spielstunde nähert sich der Druck so wieder 0 an (Faktor). */
export const PRESSURE_DECAY = 0.9;

/** Eigene Preise: Schrittweite in Euro und Obergrenze als Vielfaches des Grundpreises. */
export const PRICE_STEP = 0.5;
export const MAX_PRICE_FACTOR = 5;

// ---------------------------------------------------------------------------------------------
// Preisindex pro Stadt und Produkt (Auftrag 32): mild, langsam, mit Rückkehr zur Mitte.

/** Grenzen des Index (1 = normal). Marktereignisse wirken innerhalb dieser Grenzen. */
export const INDEX_MIN = 0.85;
export const INDEX_MAX = 1.2;
/** Pro Tag zieht der Index diesen Anteil seines Abstands zurück zur 1. */
export const INDEX_REVERSION = 0.15;
/** Größter Zufallsschritt pro Tag (gleichverteilt zwischen −STEP und +STEP). */
export const INDEX_STEP = 0.04;
/** Wie stark der Index den Einkauf trifft (0,5 = halbe Ausschläge, damit die Marge nicht kippt). */
export const PURCHASE_INDEX_SHARE = 0.5;
/** Ab dieser Abweichung zeigt die Oberfläche einen Chip ("Gras ↑ 8 %"). */
export const INDEX_CHIP_FROM = 0.05;

/** Marktbericht per Handy: Wochentag (0 = Montag) und Stunde. */
export const REPORT_WEEKDAY = 0;
export const REPORT_HOUR = 9;
/** Ab dieser Abweichung nennt der Bericht eine Ware. */
export const REPORT_MIN_CHANGE = 0.03;
