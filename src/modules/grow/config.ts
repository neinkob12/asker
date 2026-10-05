// Einstellbare Werte der eigenen Produktion (Auftrag 42): Auslöser, Preise der Fincas, Ernte, Kette, Kartell,
// Behörden und Ziele. Mengen in Gramm, Zeiten in Tagen, Geld in Euro. Die Fincas selbst stehen in data.ts.

/** Die Anrufe kommen, wenn die Hafen-Phase so viele Wochen läuft und so viel Umsatz gemacht hat. */
export const CALL_AFTER_WEEKS = 3;
export const CALL_MIN_REVENUE = 1_500_000;
/** Marokko ruft so viele Minuten nach Kolumbien an. */
export const SECOND_CALL_DELAY = 6 * 60;

/** Was eine Region kostet und bringt (Werte pro Region als Daten, nie ein Sonderfall im Ablauf). */
export interface RegionEconomy {
  /** Kaufpreis pro Hektar (sauberes Geld). */
  landPrice: number;
  /** Pacht pro Hektar und Woche (sauberes Geld, täglich abgebucht). */
  leasePerWeek: number;
  /** Was hier wächst (Ware im Spiel). */
  crops: readonly string[];
  /** Qualität kommt zur Genetik dazu (Klima, Böden). */
  qualityBonus: number;
  /** Anteil der Ernte, den das Kartell nimmt, wenn du zahlst. */
  cartelShare: number;
  /** Schmiergeld an die Behörden (Schwarzgeld): senkt die Aufmerksamkeit um BRIBE_RELIEF. */
  bribeCost: number;
  /** Lohnfaktor der Leute vor Ort (Arbeiter und Gärtner, auf ROLE_INFO in staff). */
  wageFactor: number;
}

export const REGION_ECONOMY: Readonly<Record<string, RegionEconomy>> = {
  kolumbien: {
    landPrice: 30_000,
    leasePerWeek: 450,
    crops: ['weed', 'haze', 'kush'],
    qualityBonus: 0.04,
    cartelShare: 0.2,
    bribeCost: 40_000,
    wageFactor: 1,
  },
  marokko: {
    landPrice: 20_000,
    leasePerWeek: 350,
    crops: ['hash', 'weed'],
    qualityBonus: 0,
    cartelShare: 0.15,
    bribeCost: 25_000,
    wageFactor: 0.85,
  },
};

/**
 * Ernte pro Hektar (getrocknet, vor dem Anteil des Kartells): im Freien alle 42 Tage, im Gewächshaus alle 21. Kürzer als
 * die 60 und 30 Tage aus plan.md (Review: zwei Monate ohne eigene Ware waren zu zäh; eine Stadt dauert 8 bis 15 Tage).
 */
export const GROW_DAYS = { outdoor: 42, greenhouse: 21 } as const;
export const YIELD_PER_HA = { outdoor: 28_000, greenhouse: 17_000 } as const;
/**
 * Eine Finca kommt mit der Pflanzung des Vorbesitzers (Landsorte, die erste Ware der Region): reif nach so vielen
 * Tagen. So gibt es die erste eigene Ernte nach drei Wochen statt nach sechs.
 */
export const STANDING_CROP_DAYS = 21;
/** Hasch: aus so viel Pflanze wird ein Gramm gepresstes Harz (Ernte mal diesen Faktor). */
export const HASH_YIELD = 0.6;
/** Gewächshaus pro Hektar (sauberes Geld) und Bonus auf die Qualität. */
export const GREENHOUSE_PER_HA = 15_000;
export const GREENHOUSE_QUALITY = 0.03;
/** Dünger, Wasser, Strom pro Hektar und Aussaat (sauberes Geld). Im Gewächshaus pro Durchgang etwas weniger. */
export const SUPPLIES_PER_HA = { outdoor: 4_000, greenhouse: 3_000 } as const;

/** Nach der Ernte: Trocknen, Pressen (nur Hasch), Verpacken (Tage). */
export const DRY_DAYS = 7;
export const PRESS_DAYS = 3;
export const PACK_DAYS = 2;

/** So viele Arbeiter braucht ein Hektar; mit weniger wird die Ernte im selben Anteil kleiner. */
export const WORKERS_PER_HA = 0.5;
/** Ohne Gärtner: Ernte und Qualität schlechter. Mit Gärtner pro Level über 1 ein Bonus. */
export const NO_GARDENER = { yield: 0.85, quality: -0.1 } as const;
export const GARDENER_PER_LEVEL = { yield: 0.03, quality: 0.015 } as const;
/** Erfahrung für den Gärtner pro Ernte. */
export const GARDENER_XP_PER_HARVEST = 60;
/** Handgeld beim Anheuern vor Ort: so viele Tageslöhne (sauberes Geld). */
export const HIRE_DAYS = 3;

/** Genetik als Qualität (Stufe 0 bis 3): Qualität, Faktor auf die Ernte, Preis der Stufe (Schwarzgeld). */
export interface GeneticsLevel {
  quality: number;
  yield: number;
  cost: number;
}

export const GENETICS: readonly GeneticsLevel[] = [
  { quality: 0.58, yield: 1, cost: 0 },
  { quality: 0.68, yield: 1.1, cost: 25_000 },
  { quality: 0.78, yield: 1.2, cost: 60_000 },
  { quality: 0.88, yield: 1.3, cost: 120_000 },
];
export const MAX_QUALITY = 0.95;

/**
 * Aufmerksamkeit der Behörden pro Region (0–100), wie eine Heat: Hektar unter Anbau und jede Ernte treiben sie, jeden
 * Tag kühlt sie ab (schneller, wenn das Kartell seinen Anteil bekommt: die Polizei vor Ort steht auf seiner Liste). Über
 * RAID_FROM kommt mit Chance eine Razzia auf einer Finca (die halbe Pflanzung ist weg).
 */
export const ATTENTION = {
  perHaDay: 0.08,
  perHarvestKg: 0.05,
  decayPerDay: 1.2,
  cartelDecay: 1.6,
  raidFrom: 45,
  /** Chance einer Razzia pro Tag = (Aufmerksamkeit − raidFrom) / 100 × raidScale. */
  raidScale: 0.12,
  raidLoss: 0.5,
  raidRelief: 25,
} as const;
/** Schmiergeld senkt die Aufmerksamkeit so stark, höchstens einmal in BRIBE_COOLDOWN_DAYS Tagen. */
export const BRIBE_RELIEF = 30;
export const BRIBE_COOLDOWN_DAYS = 7;

/**
 * Kartell: Zahlst du nicht, schlägt es mit dieser Chance pro Tag zu (ein Teil der Pflanzung brennt, oder Ware im
 * Ausfuhrhafen verschwindet).
 */
export const CARTEL_HIT_CHANCE = 0.04;
export const CARTEL_HIT_LOSS = 0.3;

/**
 * Ziele (plan.md): „Produzent“, sobald in den letzten PRODUCER_WINDOW_DAYS Tagen mindestens PRODUCER_SHARE der
 * gelieferten Gramm aus eigener Produktion stammen (und mindestens PRODUCER_MIN_GRAMS geliefert wurden); „Europa“, sobald
 * alle Städte in Europa Kunden sind und jeder Kunde, der in den letzten EUROPE_WINDOW_DAYS Tagen beliefert wurde, bei
 * den Waren, die man anbauen kann (CROP_PRODUCTS: ohne Edibles, Öl, Vapes aus dem Labor), mindestens EUROPE_SHARE
 * eigene Ware bekam (jede Stadt in Europa mit mindestens einer Lieferung).
 */
export const PRODUCER_WINDOW_DAYS = 14;
export const EUROPE_WINDOW_DAYS = 28;
export const PRODUCER_SHARE = 0.5;
export const PRODUCER_MIN_GRAMS = 50_000;
export const EUROPE_SHARE = 0.5;

/** Waren, die auf den Fincas wachsen (alle Regionen zusammen). Laborware (Edibles, Öl, Vapes) zählt für Europa nicht. */
export const CROP_PRODUCTS: readonly string[] = [...new Set(Object.values(REGION_ECONOMY).flatMap((r) => r.crops))];

/**
 * Pacht ist legal und geht nur mit sauberem Geld. Fehlt es, schreibt der Verpächter am ersten Tag; nach
 * LEASE_LOST_DAYS Tagen ohne Pacht ist das Land weg (die Leute dort gehen). Löhne und Dünger zahlt man notfalls bar
 * (Schwarzgeld); reicht auch das nicht, arbeiten die Leute an dem Tag nicht (die Ernte wird kleiner).
 */
export const LEASE_LOST_DAYS = 5;
