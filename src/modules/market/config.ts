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
