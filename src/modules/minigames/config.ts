// Einstellbare Werte der Minispiele (Auftrag 44).

/**
 * Frist in Spielminuten: Ohne Oberfläche (Tests, Bot, Autopilot) läuft ein Minispiel danach als timeout ab, und es gilt
 * das alte Verhalten. Kürzer als die Frist der Konfrontationen (DECISION_TIMEOUT 120), damit die Konfrontation danach
 * noch wie gewohnt auswürfeln kann. Mit Oberfläche steht die Spielzeit still, solange das Minispiel offen ist.
 */
export const MINIGAME_TIMEOUT = 60;

/** Ab diesem Score gilt ein Minispiel als geschafft, wenn die Art nichts anderes sagt (winAt). */
export const DEFAULT_WIN_AT = 0.5;

/** Score der Rechten Hand: geschafft bzw. nicht geschafft (fest, damit die Folgen planbar bleiben). */
export const RIGHT_HAND_WIN_SCORE = 0.7;
export const RIGHT_HAND_LOSE_SCORE = 0.25;

/** Chance der Rechten Hand: Grundwert + Anteil ihres Werts (0–100) + pro Stufe, begrenzt. */
export const RIGHT_HAND_CHANCE = { base: 0.3, perStat: 0.5, perRank: 0.03, min: 0.25, max: 0.85 } as const;

/** Grenzen für das Ergebnis aus der Oberfläche: höchstens so viele picks, jeder höchstens so lang. */
export const PICKS_MAX = 20;
export const PICK_MAX_LENGTH = 40;

/** So viele entschiedene Minispiele bleiben im Verlauf. */
export const HISTORY_LIMIT = 30;

/** Schwierigkeit aus der Lage (minigameDifficulty): Grundwert und Gewichte, Ergebnis in [min, max]. */
export const DIFFICULTY = {
  base: 0.3,
  /** pro Punkt Polizeipräsenz über 1 (Kölner Durchschnitt) */
  presence: 0.15,
  /** bei Heat 100 im Veedel */
  heat: 0.25,
  /** pro Stufe der Polizei-Härte (Kleindealer 0, Händler 1, Großhändler 2) */
  tier: 0.1,
  /** pro Punkt Kontrollfaktor der Stadt über 1 (CHECK_FACTOR_BY_CITY) */
  city: 0.2,
  min: 0.2,
  max: 0.95,
} as const;
