// Einstellbare Werte der Polizei. Zeiten in Spielminuten, Wahrscheinlichkeiten pro Spielstunde.
// Die Polizeipräsenz des Veedels (veedel.policePresence, 1 = Durchschnitt) wirkt auf Heat-Anstieg und Zufallsereignisse.

/** Heat liegt zwischen 0 und MAX_HEAT. */
export const MAX_HEAT = 100;

/** Stufen: ab diesen Werten wird es "wachsam" (Kontrollen), "heiß" (Razzien) und "Großeinsatz". */
export const HEAT_LEVELS = [
  { min: 0, id: 'calm', label: 'ruhig' },
  { min: 30, id: 'watchful', label: 'wachsam' },
  { min: 60, id: 'hot', label: 'heiß' },
  { min: 85, id: 'manhunt', label: 'Großeinsatz' },
] as const;

// --- Heat -----------------------------------------------------------------------------------------------------

/** Heat pro Verkauf im Veedel … */
export const SALE_HEAT_BASE = 0.6;
/** … plus so viel pro verkaufter Einheit. */
export const SALE_HEAT_PER_UNIT = 0.15;
/** Gewalt (Konfrontation im Veedel, reportViolence). */
export const VIOLENCE_HEAT = 15;
/** Nach einer gelungenen Polizeiflucht wird nach den Leuten gesucht. */
export const CHASE_ESCAPED_HEAT = 6;
/** So viel Heat bekommt jedes Veedel einer verpfiffenen Gang. */
export const SNITCH_HEAT = 20;
/** Heat sinkt pro Stunde um so viel. */
export const HEAT_DECAY_PER_HOUR = 0.7;

// --- Kontrollen -----------------------------------------------------------------------------------------------

/** Ab diesem Heat gibt es Kontrollen. */
export const CHECK_THRESHOLD = 30;
/** Wahrscheinlichkeit pro Stunde bei Heat 100 und Präsenz 1 (darunter anteilig ab der Schwelle). */
export const CHECK_CHANCE_PER_HOUR = 0.12;
/** Nach einer Kontrolle ist im Veedel so lange Ruhe. */
export const CHECK_COOLDOWN = 6 * 60;
/** Die Polizei ist erst mal zufrieden: Heat sinkt um so viel. */
export const CHECK_HEAT_RELIEF = 6;
/** Beschlagnahmte Ware bei einer Kontrolle (Einheiten). */
export const CHECK_GOODS = { min: 2, max: 8 } as const;
/** Beschlagnahmtes Schwarzgeld bei einer Kontrolle (Euro). */
export const CHECK_MONEY = { min: 30, max: 150 } as const;
/** Festnahme bei einer Kontrolle ohne Flucht (bei Vorsicht 50). */
export const CHECK_ARREST_CHANCE = 0.2;
/** So oft versucht der Kontrollierte zu fliehen (Konfrontation "Polizeiflucht"). */
export const CHASE_CHANCE = 0.3;
/** Scheitert die Flucht, ist mehr weg. */
export const FAILED_CHASE_FACTOR = 1.5;

// --- Razzien --------------------------------------------------------------------------------------------------

/** Ab diesem Heat gibt es Razzien. */
export const RAID_THRESHOLD = 60;
/** Wahrscheinlichkeit pro Stunde bei Heat 100 und Präsenz 1 (darunter anteilig ab der Schwelle). */
export const RAID_CHANCE_PER_HOUR = 0.06;
/** Eine Razzia gegen den Spieler wird so lange vorher geplant (Zeit für die Warnung des Polizei-Kontakts). */
export const RAID_LEAD_TIME = 3 * 60;
/** Nach einer Razzia ist im Veedel so lange Ruhe. */
export const RAID_COOLDOWN = 24 * 60;
export const RAID_HEAT_RELIEF = 25;
/** Beschlagnahmte Ware bei einer Razzia (Einheiten). */
export const RAID_GOODS = { min: 10, max: 30 } as const;
/** Beschlagnahmtes Schwarzgeld bei einer Razzia (Euro). */
export const RAID_MONEY = { min: 200, max: 900 } as const;
/** Festnahme pro Mitarbeiter im Veedel bei einer Razzia (bei Vorsicht 50). */
export const RAID_ARREST_CHANCE = 0.55;
/** Razzia gegen eine Gang: so viel Einfluss verliert sie im Veedel. */
export const GANG_RAID_INFLUENCE_LOSS = 15;

// --- Verpfeifen -----------------------------------------------------------------------------------------------

/** So lange gilt ein Hinweis gegen eine Gang. */
export const TIP_OFF_DURATION = 48 * 60;
/** Wahrscheinlichkeit pro Stunde für eine Razzia gegen die verpfiffene Gang (Präsenz 1, ohne Heat-Bonus). */
export const TIP_OFF_RAID_CHANCE_PER_HOUR = 0.02;
/** So lange hört die Polizei nach einem Hinweis nicht mehr zu. */
export const SNITCH_COOLDOWN = 24 * 60;
