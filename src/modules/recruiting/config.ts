import type { StaffRole } from '../staff';
import type { CandidateSource } from './index';

// Einstellbare Werte der Rekrutierung. Zeiten in Spielminuten, Geld in Euro (Schwarzgeld).

/** Neue Bewerber kommen alle 4 bis 8 Spielstunden (je 1 bis 3), höchstens so viele warten gleichzeitig (Auftrag 27). */
export const POOL_INTERVAL: [number, number] = [4 * 60, 8 * 60];
export const POOL_ARRIVALS: [number, number] = [1, 3];
/** Grundgröße des Pools; je eigenem Veedel einer mehr, mit gutem Ruf noch mehr, bis zur Obergrenze. */
export const POOL_MAX = 8;
export const POOL_MAX_PER_VEEDEL = 1;
export const POOL_MAX_REPUTATION = 60;
export const POOL_MAX_REPUTATION_BONUS = 2;
export const POOL_MAX_LIMIT = 14;
/** So viele Bewerber warten zu Spielbeginn. */
export const POOL_START = 5;
/** So lange bleibt ein Bewerber verfügbar (von, bis). */
export const CANDIDATE_LIFETIME: [number, number] = [1440, 2.5 * 1440];
export const CONTACT_LIFETIME: [number, number] = [1440, 2 * 1440];

/** Wie oft welcher Typ im Pool auftaucht. Kuriere gibt es seit Auftrag 28 nicht mehr (Gewicht 0). */
export const POOL_ROLE_WEIGHTS: Record<StaffRole, number> = {
  runner: 50,
  courier: 0,
  driver: 10,
  security: 20,
  lawyer: 8,
  accountant: 9,
  policeContact: 8,
  // Auftrag 42: Leute für die Fincas heuert grow vor Ort an, nie über den Aushang.
  worker: 0,
  gardener: 0,
};

/** Kontakte aus dem Milieu sind öfter Spezialisten. */
export const EVENT_ROLE_WEIGHTS: Record<StaffRole, number> = {
  runner: 20,
  courier: 0,
  driver: 10,
  security: 25,
  lawyer: 18,
  accountant: 16,
  policeContact: 16,
  worker: 0,
  gardener: 0,
};

/** Handgeld bei der Einstellung: so viele Tageslöhne. */
export const HIRE_COST_DAYS = 3;
/** Kontakte wollen etwas mehr Handgeld. */
export const CONTACT_HIRE_COST_DAYS = 4;

/** Wie viele Werte man vor der Einstellung sieht. Loyalität sieht man nur bei Empfehlungen. */
export const VISIBLE_STATS: Record<CandidateSource, number> = { pool: 2, referral: 3, regular: 3, event: 3 };

/** Qualität (0–1) und Level von Kontakten. Sie sind oft besser, aber selten. */
export const CONTACT_QUALITY: [number, number] = [0.5, 1];
export const CONTACT_LEVEL: [number, number] = [2, 3];
/** Im Pool hat manchmal jemand schon Erfahrung. */
export const POOL_LEVEL_2_CHANCE = 0.15;

/** Empfehlung: Mitarbeiter ab dieser Loyalität empfehlen pro Tag mit dieser Wahrscheinlichkeit jemanden. */
export const REFERRAL_MIN_LOYALTY = 65;
export const REFERRAL_CHANCE = 0.06;
/** Stammkunden: Wahrscheinlichkeit pro Einkauf eines Stammkunden (mal Charisma-Faktor des Verkäufers). */
export const REGULAR_CHANCE_PER_SALE = 0.03;
/** Ereignis: Wahrscheinlichkeit pro Tag, dass sich jemand aus dem Milieu meldet. */
export const EVENT_CHANCE = 0.12;
/** Wer aus der Haft kommt, bringt manchmal einen Kontakt mit. */
export const JAIL_CONTACT_CHANCE = 0.3;
/** Höchstens so viele offene Kontakte gleichzeitig. */
export const CONTACT_MAX = 3;

/** Rumfragen: kostet Geld, bringt sofort neue Bewerber, danach eine Weile nicht wieder. */
export const SEARCH_COST = 150;
export const SEARCH_COUNT = 3;
export const SEARCH_COOLDOWN = 12 * 60;
/** Mit Rollenwahl kommt jeder Neue mit dieser Wahrscheinlichkeit in der gewünschten Rolle. */
export const SEARCH_ROLE_SHARE = 0.75;

/** Rollen, nach denen man gezielt rumfragen kann. */
export type SearchRole = 'runner' | 'driver' | 'security';
export const SEARCH_ROLES: readonly { value: SearchRole; label: string }[] = [
  { value: 'runner', label: 'Läufer suchen' },
  { value: 'driver', label: 'Fahrer suchen' },
  { value: 'security', label: 'Sicherheit suchen' },
];

export const SOURCE_NAMES: Record<CandidateSource, string> = {
  pool: 'Bewerbung',
  referral: 'Empfehlung',
  regular: 'Stammkunde',
  event: 'Kontakt',
};

/** Texte für Kontakte aus dem Milieu. {name} wird ersetzt. */
export const EVENT_INTROS = [
  'Hab gehört, du suchst Leute. Ich bin {name}. Meld dich, wenn du was Ernstes hast.',
  'Ein Freund von einem Freund sagt, bei dir gibt es Arbeit. {name} hier. Ich mach keinen Kinderkram.',
  '{name}. Ich hab früher für die Konkurrenz gearbeitet. Die zahlen schlecht. Du auch?',
  'Man sagt, du bist der Neue in der Stadt. {name}, ich kann dir helfen. Nicht umsonst.',
];
