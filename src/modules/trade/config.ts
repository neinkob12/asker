// Einstellbare Werte der Hafen-Phase (Auftrag 40): Preise, Wettbewerb, Fristen, Vertrauen, Container und Zoll.
// Die Kunden, Produzenten und Container selbst stehen in data.ts.

/** Fairer Großhandelspreis pro Gramm: Grundpreis der Ware mal diesen Anteil mal Preisindex der Stadt (market). */
export const WHOLESALE_SHARE = 0.5;

/** Art eines Kunden: Preisfaktor auf den fairen Preis, Startvertrauen, erwartete Zuverlässigkeit. */
export interface CustomerKindInfo {
  label: string;
  /** Sie bieten so viel mal den fairen Preis (Gangs ein Fünftel mehr). */
  priceFactor: number;
  startTrust: number;
  /** Erwartete Zuverlässigkeit (0–1): Liegt dein Ruf darunter, kaufen sie weniger bei dir. */
  expects: number;
  icon: string;
}

export const CUSTOMER_KINDS = {
  org: { label: 'Alte Organisation', priceFactor: 1, startTrust: 80, expects: 0.85, icon: 'crown' },
  gang: { label: 'Gang', priceFactor: 1.2, startTrust: 40, expects: 0.6, icon: 'skull' },
  city: { label: 'Fremde Stadt', priceFactor: 1.05, startTrust: 30, expects: 0.75, icon: 'building' },
  // Auftrag 41: Städte in Europa (der Preisfaktor steht pro Stadt in data.ts, EUROPE_CITIES).
  europe: { label: 'Europa', priceFactor: 1.15, startTrust: 25, expects: 0.8, icon: 'globe' },
} as const satisfies Record<string, CustomerKindInfo>;

/** Europa-Kunden melden sich erst, wenn dein Ruf (Pünktlichkeit) mindestens so gut ist. */
export const EUROPE_MIN_RELIABILITY = 0.7;

/** Preisgrenze: so viel über ihrem Angebot zahlt ein Kunde höchstens (Gegenangebot). */
export const PRICE_CAP_MARKUP = 0.15;
/** Dein Preis als Faktor auf den fairen Preis (trade.setPriceLevel), erlaubt von … bis. */
export const PRICE_LEVEL_RANGE: readonly [number, number] = [0.85, 1.25];
export const PRICE_LEVEL_STEP = 0.05;

/**
 * Wie ein Kunde Angebote vergleicht: Punkte = Qualität × QUALITY + Zuverlässigkeit × RELIABILITY − (Preis − 1) ×
 * PRICE, dazu für dich das Vertrauen ((Vertrauen − 50) / 100 × TRUST). Die Menge teilt sich weich nach Punkten auf
 * (SHARE_TEMPERATURE: je kleiner, desto mehr bekommt der Beste).
 */
export const SCORE_WEIGHTS = { quality: 1, reliability: 1, price: 3, trust: 0.5 } as const;
export const SHARE_TEMPERATURE = 0.2;
/** Unter so viel Gramm gibt es für dich keine Bestellung (zu klein), eine Ware darin mindestens MIN_ITEM_GRAMS. */
export const MIN_ORDER_GRAMS = 2000;
export const MIN_ITEM_GRAMS = 1000;
/** Bestellmengen auf so viele Gramm gerundet. */
export const ORDER_ROUND_GRAMS = 500;

/** Montags um diese Uhrzeit kommen die Bestellungen (Minuten nach Mitternacht). */
export const ORDER_HOUR = 6 * 60;
/** So lange kannst du eine Bestellung annehmen, ablehnen oder ein Gegenangebot machen. */
export const ORDER_ANSWER_MINUTES = 24 * 60;
/** Frist für die Lieferung ab Bestellung. */
export const ORDER_DUE_DAYS = 6;
/** Zu spät geliefert: nur so viel vom Preis. */
export const LATE_PRICE_FACTOR = 0.8;
/** So viele Tage nach der Frist geht es noch mit Abschlag, danach ist die Bestellung geplatzt. */
export const LATE_GRACE_DAYS = 2;

/** Vertrauen (0–100) nach einem Geschäft. */
export const TRUST = {
  onTime: 4,
  late: -4,
  failed: -12,
  declined: -1,
  expired: -3,
  max: 100,
} as const;

/** Dein Ruf als Lieferant: gleitender Schnitt über Lieferungen (Anteil der neuen Lieferung). */
export const REPUTATION_ALPHA = 0.2;
/** Jansens Ruf geht mit dem Hafen auf dich über. */
export const START_RELIABILITY = 0.85;
/**
 * Auftrag 42: Ein schlechter Ruf verblasst. Jeden Montag rückt die Pünktlichkeit um diesen Anteil zurück Richtung
 * START_RELIABILITY (nur nach oben). Ohne das blieb nach ein paar geplatzten Lieferungen der Anteil bei fast null, es
 * kamen keine Bestellungen mehr und damit nie wieder eine Gelegenheit, pünktlich zu sein.
 */
export const RELIABILITY_RECOVERY = 0.3;
export const START_QUALITY = 0.7;

/**
 * Abnahmevertrag (plan.md): Die alten Organisationen bestellen in den ersten CONTRACT_WEEKS Wochen garantiert
 * mindestens CONTRACT_SHARE ihres Bedarfs bei dir, zum fairen Preis, ohne Konkurrenz.
 */
export const CONTRACT_WEEKS = 4;
export const CONTRACT_SHARE = 0.6;

/** Gangs: Ein Deal kippt mit dieser Chance (mal (1 − Vertrauen/100)); unter dieser Erinnerung kaufen sie nicht. */
export const GANG_TIP_CHANCE = 0.15;
export const GANG_MEMORY_BLOCK = -20;

/**
 * Auslieferung: Zollkontrolle auf der Autobahn mit dieser Chance pro 100 km (mal Kontrollfaktor des Fahrzeugs);
 * fliegt die Ladung mit SEIZE_ON_CHECK auf, ist sie weg (die Bestellung bleibt offen, solange die Frist läuft).
 */
export const AUTOBAHN_CHECK_PER_100KM = 0.015;
/** Auftrag 41: Mehr als so viel Kontroll-Chance bringt die Strecke allein nicht (lange Wege nach Europa). */
export const AUTOBAHN_CHECK_MAX = 0.08;
export const SEIZE_ON_CHECK = 0.45;
/** Ohne eigenen Lkw fährt eine Spedition: Grundpreis plus pro Kilo und 100 km (Schwarzgeld). */
export const FREIGHT_BASE = 800;
export const FREIGHT_PER_KG_100KM = 30;
/** Tempo in der Stadt (Meter pro Minute) für die Fahrzeit über roads. */
export const TRUCK_CITY_SPEED = 450;

/** Jansens Halle in Rotterdam: was beim Kauf schon drinliegt (Gramm), mit Qualität. */
export const START_STOCK: Readonly<Record<string, number>> = { weed: 40_000, hash: 20_000 };
export const START_STOCK_QUALITY = 0.6;

/** Mengen der Bestellungen gesamt (Stellschraube fürs Balancing, 1 = Daten wie in data.ts). */
export const DEMAND_SCALE = 1;

/**
 * Auftrag 41: Ein Linienschiff (Charter pro Container) schafft so viele Kilometer am Tag auf dem Seeweg (roads.seaRoute),
 * mit den Stopps unterwegs. Dazu kommen die Tage bis zum Ablegen (Producer.days).
 */
export const CHARTER_KM_PER_DAY = 650;

/** Hallen im Hafen (trade.buildHall): höchstens so viele pro Hafen, Platz und Preis stehen am Hafen (logistics). */
export const MAX_HALLS = 2;
/** Passt ein Container nicht mehr ins Lager, wartet der Rest an Bord: Liegegeld pro Tag und Container (sauberes Geld). */
export const QUAY_FEE_PER_DAY = 1_500;
