import type { StaffRole } from '../staff';
import type { CandidateSource } from './index';

// Einstellbare Werte der Rekrutierung. Zeiten in Spielminuten, Geld in Euro (Schwarzgeld).

/** Neue Bewerber kommen alle 6 bis 12 Spielstunden, höchstens so viele warten gleichzeitig. */
export const POOL_INTERVAL: [number, number] = [6 * 60, 12 * 60];
export const POOL_MAX = 6;
/** So viele Bewerber warten zu Spielbeginn. */
export const POOL_START = 3;
/** So lange bleibt ein Bewerber verfügbar (von, bis). */
export const CANDIDATE_LIFETIME: [number, number] = [1440, 2.5 * 1440];
export const CONTACT_LIFETIME: [number, number] = [1440, 2 * 1440];

/** Wie oft welcher Typ im Pool auftaucht. */
export const POOL_ROLE_WEIGHTS: Record<StaffRole, number> = {
  runner: 40,
  courier: 15,
  security: 20,
  lawyer: 8,
  accountant: 9,
  policeContact: 8,
};

/** Kontakte aus dem Milieu sind öfter Spezialisten. */
export const EVENT_ROLE_WEIGHTS: Record<StaffRole, number> = {
  runner: 15,
  courier: 10,
  security: 25,
  lawyer: 18,
  accountant: 16,
  policeContact: 16,
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
/** Stammkunden: Wahrscheinlichkeit pro Verkauf auf der Straße (mal Charisma-Faktor des Verkäufers). */
export const REGULAR_CHANCE_PER_SALE = 0.004;
/** Ereignis: Wahrscheinlichkeit pro Tag, dass sich jemand aus dem Milieu meldet. */
export const EVENT_CHANCE = 0.12;
/** Wer aus der Haft kommt, bringt manchmal einen Kontakt mit. */
export const JAIL_CONTACT_CHANCE = 0.3;
/** Höchstens so viele offene Kontakte gleichzeitig. */
export const CONTACT_MAX = 3;

/** Rumfragen: kostet Geld, bringt sofort neue Bewerber, danach eine Weile nicht wieder. */
export const SEARCH_COST = 150;
export const SEARCH_COUNT = 2;
export const SEARCH_COOLDOWN = 12 * 60;

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
