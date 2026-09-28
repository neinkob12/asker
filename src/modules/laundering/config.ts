/** Gebühr für Geldwäsche als Anteil des Betrags (ohne Buchhalter). */
export const LAUNDERING_FEE = 0.2;
/** Die Gebühr sinkt durch Boni (Buchhalter) höchstens bis hierhin. */
export const MIN_LAUNDERING_FEE = 0.05;

/** Kleinster Betrag pro Wäsche. */
export const MIN_LAUNDERING_AMOUNT = 100;
/** So viel Schwarzgeld kann gleichzeitig in der Wäsche sein (Tarnfirmen erhöhen das später). */
export const LAUNDERING_CAPACITY = 5000;

/** Dauer einer Wäsche in Spielminuten: Grundzeit plus Zeit pro 100 €. */
export const LAUNDERING_BASE_MINUTES = 120;
export const LAUNDERING_MINUTES_PER_100 = 6;
