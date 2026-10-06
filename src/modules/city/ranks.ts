// Ränge des Spielers (Auftrag 36): die Stufen des Bogens als Titel, ohne Boni. Kleindealer, Händler und Großhändler
// sind die Stufen der Polizei (police.operationTier, die höchste über alle deine Städte), Boss von Köln der Meilenstein
// (Mehrheit der Kölner Veedel), Boss von <Stadt> je weitere komplette Stadt, Boss von Deutschland, wenn alle
// spielbaren Städte komplett sind, Importeur nach dem Verkauf (Auftrag 40), Produzent und der Titel Europa mit den Zielen
// der eigenen Produktion (Auftrag 42, grow.growGoals). Ein Rang geht nie verloren: city merkt sich den höchsten
// (CityState.rank).

import type { GameState } from '../../core';
import { operationTier } from '../police';
import { campaignProgress, cityMilestones } from '../territory';

export type PlayerRankKind = 'tier' | 'milestone' | 'city' | 'germany' | 'later';

export interface PlayerRankDef {
  id: string;
  /** Titel im HUD und in der Bestenliste; {city} = die Stadt (nur bei 'city'). */
  title: string;
  kind: PlayerRankKind;
  /** Stufe des Geschäfts (nur 'tier'). */
  tier?: number;
  /** Ein Satz, wofür es den Titel gibt (Profil, Banner). */
  hint: string;
}

export const PLAYER_RANKS: readonly PlayerRankDef[] = [
  { id: 'smallDealer', title: 'Kleindealer', kind: 'tier', tier: 0, hint: 'Ein paar Gramm, ein Spot, ein Handy.' },
  { id: 'dealer', title: 'Händler', kind: 'tier', tier: 1, hint: 'Mehrere Spots, Leute, ein Lager.' },
  { id: 'wholesaler', title: 'Großhändler', kind: 'tier', tier: 2, hint: 'Die Kripo ermittelt gegen dich.' },
  { id: 'bossKoeln', title: 'Boss von Köln', kind: 'milestone', hint: 'Die Mehrheit der Kölner Veedel hört auf dich.' },
  { id: 'bossCity', title: 'Boss von {city}', kind: 'city', hint: 'Eine weitere Stadt komplett übernommen.' },
  { id: 'bossGermany', title: 'Boss von Deutschland', kind: 'germany', hint: 'Alle Städte gehören dir.' },
  { id: 'importer', title: 'Importeur', kind: 'later', hint: 'Lieferant für alle, vom Hafen aus.' },
  {
    id: 'producer',
    title: 'Produzent',
    kind: 'later',
    hint: 'Die Hälfte deiner Lieferungen kommt aus eigener Produktion.',
  },
  // Auftrag 42: der Titel am Ende des Bogens (danach geht es offen weiter).
  { id: 'europe', title: 'Europa', kind: 'later', hint: 'Jeder Kunde in Europa bekommt Ware aus deinen Fincas.' },
];

/** Die Stadt, deren Mehrheit "Boss von Köln" macht. */
const MILESTONE_CITY = 'koeln';

/**
 * Macht die Mehrheit der Veedel in dieser Stadt einen Rang („Boss von Köln“)? In den anderen Städten erst die ganze
 * Stadt (Auftrag 43, N8: Reviere und Banner sagten „Boss von Hamburg“ schon bei 7 von 12).
 */
export function majorityMakesBoss(cityId: string): boolean {
  return cityId === MILESTONE_CITY;
}

/** Wert eines Rangs zum Vergleichen: Platz in PLAYER_RANKS mal STEP, bei 'city' plus Zahl der weiteren Städte. */
const STEP = 10;

export interface PlayerRank {
  id: string;
  title: string;
  /** Größer = höher (zum Vergleichen und für die Bestenliste). */
  score: number;
}

export interface RankInput {
  /** Spielbare Städte (ohne Schablonen). */
  cities: readonly string[];
  /** Deine Städte. */
  unlocked: readonly string[];
  /** Name einer Stadt für den Titel. */
  name: (cityId: string) => string;
  /** So viele komplette Städte braucht Boss von Deutschland mindestens (GERMANY_MIN_CITIES). */
  minGermany: number;
  /** Geschäft verkauft (Auftrag 40): Importeur, Lieferant für alle vom Hafen aus. */
  sold?: boolean;
  /** Ziele der eigenen Produktion (Auftrag 42): Produzent, Europa. */
  producer?: boolean;
  europe?: boolean;
}

/**
 * Der Rang, den der Stand gerade hergibt (ohne Gedächtnis). Bei 'city' zählt jede weitere komplette Stadt eine Stufe,
 * der Titel nennt die letzte in der Reihenfolge, in der du sie freigeschaltet hast.
 */
export function reachedRank(state: GameState, input: RankInput): PlayerRank {
  const { cities, unlocked, name, minGermany, sold, producer, europe } = input;
  const at = (id: string) => PLAYER_RANKS.findIndex((r) => r.id === id);
  const make = (id: string, extra = 0, city?: string): PlayerRank => {
    const def = PLAYER_RANKS[at(id)];
    return { id, title: def.title.replace('{city}', city ?? ''), score: at(id) * STEP + extra };
  };
  if (sold && europe) return make('europe');
  if (sold && producer) return make('producer');
  if (sold) return make('importer');
  const complete = cities.filter((c) => campaignProgress(state, c).complete);
  if (complete.length >= minGermany && complete.length === cities.length) return make('bossGermany');
  const others = unlocked.filter((c) => c !== MILESTONE_CITY && complete.includes(c));
  if (others.length > 0) return make('bossCity', others.length, name(others[others.length - 1]));
  if (cityMilestones(state, MILESTONE_CITY).majority !== null || complete.includes(MILESTONE_CITY)) {
    return make('bossKoeln');
  }
  const tier = Math.max(0, ...unlocked.map((c) => operationTier(state, c).index));
  const def = PLAYER_RANKS.find((r) => r.kind === 'tier' && r.tier === tier) ?? PLAYER_RANKS[0];
  return make(def.id);
}
