import type { CustomerType } from './index';

// Alle Zeiten in Spielminuten.

/** So lange wartet ein Kunde (Grundwert, der Kundentyp verlängert oder verkürzt ihn). */
export const CUSTOMER_PATIENCE = 180;
export const MAX_CUSTOMERS_PER_SPOT = 4;
/** Mittlerer Abstand zwischen zwei Kunden an einem Spot mit Andrang 1 (bei Richtpreis). */
export const BASE_SPAWN_INTERVAL = 55;

/**
 * Anlaufphase: Am Anfang kennt dich noch keiner. Die Nachfrage startet bei diesem Anteil und steigt über
 * WARMUP_MINUTES gleichmäßig auf 100 % (1 echte Sekunde sind 4 Spielminuten, 2 Spieltage also 12 Minuten).
 */
export const WARMUP_START_DEMAND = 0.55;
export const WARMUP_MINUTES = 2 * 24 * 60;

export function warmupDemandFactor(minutesPlayed: number): number {
  if (minutesPlayed >= WARMUP_MINUTES) return 1;
  const t = Math.max(0, minutesPlayed) / WARMUP_MINUTES;
  return WARMUP_START_DEMAND + (1 - WARMUP_START_DEMAND) * t;
}

/** Nachfrage je nach Uhrzeit: abends und nachts ist mehr los. */
export function hourDemandMultiplier(hour: number): number {
  if (hour >= 18 || hour < 2) return 1.6;
  if (hour >= 2 && hour < 6) return 0.6;
  if (hour >= 6 && hour < 12) return 0.4;
  return 1.0;
}

/** Nachfrage je nach Wochentag (Mo … So), unabhängig vom Kundentyp. */
export const WEEKDAY_DEMAND: readonly number[] = [0.8, 0.85, 0.9, 1.0, 1.2, 1.3, 0.95];

/**
 * Kundentypen. Welche Produkte sie kaufen, steht bei den Produkten (goods, audiences).
 * share: Anteil an der Kundschaft; peakHours: [von, bis) in Stunden, auch über Mitternacht;
 * weekdays: Faktor Mo … So; loyalty: Neigung, Stammkunde zu werden; expertise: merkt Streckmittel;
 * patience: Faktor auf die Wartezeit; visitEvery: Stammkunden kommen etwa alle so viele Tage.
 */
export const CUSTOMER_TYPES: readonly CustomerType[] = [
  {
    id: 'student',
    name: 'Student',
    share: 1.0,
    qualityExpectation: 0.35,
    priceSensitivity: 1.4,
    amountFactor: 0.8,
    peakHours: [14, 24],
    weekdays: [0.9, 1, 1.1, 1.3, 1.2, 0.9, 0.7],
    loyalty: 1.0,
    expertise: 0.7,
    patience: 1.0,
    visitEvery: 2,
  },
  {
    id: 'banker',
    name: 'Banker',
    share: 0.5,
    qualityExpectation: 0.7,
    priceSensitivity: 0.3,
    amountFactor: 1.3,
    peakHours: [17, 23],
    weekdays: [1.1, 1.1, 1.1, 1.2, 1.3, 0.6, 0.4],
    loyalty: 1.2,
    expertise: 1.0,
    patience: 0.6,
    visitEvery: 3,
  },
  {
    id: 'tourist',
    name: 'Tourist',
    share: 0.6,
    qualityExpectation: 0.4,
    priceSensitivity: 0.6,
    amountFactor: 0.8,
    peakHours: [11, 23],
    weekdays: [0.7, 0.7, 0.8, 0.9, 1.2, 1.5, 1.3],
    loyalty: 0.2,
    expertise: 0.3,
    patience: 0.8,
    visitEvery: 4,
  },
  {
    id: 'party',
    name: 'Partygänger',
    share: 0.8,
    qualityExpectation: 0.5,
    priceSensitivity: 0.8,
    amountFactor: 1.0,
    peakHours: [21, 4],
    weekdays: [0.3, 0.4, 0.6, 0.9, 1.7, 1.9, 0.6],
    loyalty: 0.6,
    expertise: 0.5,
    patience: 0.7,
    visitEvery: 3,
  },
  {
    id: 'stoner',
    name: 'Dauerkiffer',
    share: 1.0,
    qualityExpectation: 0.45,
    priceSensitivity: 1.1,
    amountFactor: 1.5,
    peakHours: [10, 2],
    weekdays: [1, 1, 1, 1, 1, 1, 1],
    loyalty: 1.6,
    expertise: 1.5,
    patience: 1.3,
    visitEvery: 1,
  },
];

/** Kundentyp für Kunden ohne Typ (alte Spielstände). */
export const FALLBACK_TYPE = 'stoner';
/** Außerhalb der Hauptzeit eines Typs kommt nur dieser Anteil. */
export const OFF_PEAK = 0.3;

// Kundenentscheidung

/** Wie stark ein zu hoher Preis abschreckt: Faktor = exp(-ELASTIZITÄT × Empfindlichkeit × (Verhältnis - 1)). */
export const PRICE_ELASTICITY = 3;
/** Wie stark ein niedriger Preis zusätzlich anlockt (Mundpropaganda). */
export const CHEAP_ATTRACTION = 1.5;
/** Mehr als so viel zusätzliche Kundschaft bringt ein Kampfpreis nicht. */
export const MAX_CHEAP_BOOST = 1.5;
/** Ist das Wunschprodukt nicht da, nimmt der Kunde mit dieser Chance etwas anderes aus seinem Geschmack. */
export const SUBSTITUTE_CHANCE = 0.6;
/** Streckmittel fällt auf mit Chance = Streckanteil × Faktor × Kennerschaft des Typs. */
export const CUT_NOTICE_FACTOR = 1.8;

// Ruf

/** Ruf pro Verkauf = Zufriedenheit (-1 bis 1) × dieser Wert. */
export const REP_PER_SATISFACTION = 0.12;
export const REP_CUSTOMER_LOST = -0.4;
export const REP_CUT_NOTICED = -0.8;
export const REP_DELIVERY_DONE = 0.4;
export const REP_WHOLESALE_DONE = 0.8;
export const REP_ORDER_DECLINED = -0.3;
export const REP_ORDER_EXPIRED = -0.6;
export const REP_ORDER_FAILED = -1.5;

// Stammkunden

/** Chance pro zufriedenem Verkauf, dass ein Kunde Stammkunde wird (× Treue des Typs × Ruf-Faktor). */
export const REGULAR_CHANCE = 0.03;
export const MAX_REGULARS = 25;
/** Verlorene Stammkunden, die noch in der Liste bleiben. */
export const LOST_REGULARS_KEPT = 8;
export const REGULAR_START_SATISFACTION = 0.6;
/** Darunter kommt ein Stammkunde nicht mehr. */
export const REGULAR_LOST_BELOW = 0.2;
/** So viel Preiserhöhung nimmt ein Stammkunde hin (geteilt durch seine Preisempfindlichkeit). */
export const REGULAR_PRICE_TOLERANCE = 0.15;
/** Stammkunden warten länger. */
export const REGULAR_PATIENCE_FACTOR = 1.5;

export const REGULAR_NAMES = [
  'Jonas',
  'Lea',
  'Finn',
  'Mia',
  'Ali',
  'Sophie',
  'Tim',
  'Emre',
  'Hannah',
  'Paul',
  'Selin',
  'Max',
  'Laura',
  'Can',
  'Julia',
  'Niklas',
  'Anna',
  'Deniz',
  'Felix',
  'Marie',
  'Jan',
  'Elif',
  'Ben',
  'Sarah',
] as const;

export const REGULAR_NICKNAMES: Readonly<Record<string, readonly string[]>> = {
  student: ['vom Campus', 'aus der WG', 'mit dem Rucksack'],
  banker: ['im Anzug', 'aus der Kanzlei', 'mit dem Tesla'],
  tourist: ['aus Holland', 'aus München', 'mit der Kamera'],
  party: ['aus dem Club', 'vom Ring', 'mit der Sonnenbrille'],
  stoner: ['vom Späti', 'mit dem Hund', 'der Stille'],
};

// Lieferdienst und Großhandel

/**
 * Chance pro Spielstunde auf eine Lieferanfrage (× Ruf-Faktor × Uhrzeit). Auftrag 28: halbiert (vorher 0,18), damit
 * der Spieler hinterherkommt; mit der Rechten Hand auf "Aufträge und Handy" kommt etwas mehr (RIGHT_HAND_ORDER_FACTOR).
 */
export const DELIVERY_CHANCE_PER_HOUR = 0.09;
/** Faktor auf die Chance, wenn die Rechte Hand die Aufträge annimmt und ausfährt (sie schafft sie ja). */
export const RIGHT_HAND_ORDER_FACTOR = 1.5;
/** Aufschlag auf den Richtpreis für die Lieferung. */
export const DELIVERY_MARKUP = 1.25;
export const DELIVERY_MIN_REPUTATION = 15;
/** Höchstens so viele offene Aufträge (Anfragen und Lieferungen) gleichzeitig (vorher 3). */
export const MAX_OPEN_ORDERS = 2;
/** Antwortfrist für Aufträge im Handy (vorher 90). */
export const ORDER_EXPIRES_IN = 150;
/** Übergabe dauert so lange (zusätzlich zur Fahrt). */
export const HANDOVER_MINUTES = 10;
/** Tempo in Metern pro Spielminute: der Spieler mit dem Rad (15 km/h). */
export const PLAYER_SPEED = 250;
/** Selbst am Spot stehen: So lange brauchst du für einen Kunden (schneller als ein neuer Läufer). */
export const PLAYER_SERVE_TIME = 10;
/**
 * Die Rechte Hand fährt Aufträge mit dem Auto (Auftrag 28): Grundtempo plus Tempo-Wert, mal Faktor ihrer Stufe
 * (hierarchy). Bei Tempo 60 rund 28 km/h im Stadtverkehr.
 */
export const RIGHT_HAND_BASE_SPEED = 320;
export const RIGHT_HAND_SPEED_PER_POINT = 2.5;

export const WHOLESALE_CHANCE_PER_HOUR = 0.03;
export const WHOLESALE_MIN_REPUTATION = 30;
/** Großhandel: mögliche Mengen je Einheit. */
export const WHOLESALE_AMOUNTS: Readonly<Record<string, readonly number[]>> = {
  g: [50, 100, 200, 300, 500],
  Stück: [20, 40, 80],
  ml: [20, 50, 100],
};
/** Rabatt, den Großhändler wollen [von, bis]. */
export const WHOLESALE_DISCOUNT: readonly [number, number] = [0.25, 0.4];
export const WHOLESALE_HANDOVER_MINUTES = 20;
/** So oft kippt ein Großhandels-Deal bei der Übergabe (Konfrontation "Deal kippt"). */
export const WHOLESALE_BETRAYAL_CHANCE = 0.12;

/**
 * Dealer, die bei dir im Großen kaufen (Auftrag 34: Stammabnehmer mit Vertrauen, dealers.ts), pro Stadt als Daten.
 * Das Modell ist die Vorlage für die Kunden der Hafen-Phase (Auftrag 40).
 */
export interface DealerInfo {
  id: string;
  name: string;
  cityId: string;
  veedelId: string;
  /** Ein Satz fürs Profil. */
  about: string;
}

export const DEALERS: readonly DealerInfo[] = [
  {
    id: 'oemer',
    name: 'Ömer (Kalk)',
    cityId: 'koeln',
    veedelId: 'kalk',
    about: 'Betreibt einen Kiosk an der Kalker Hauptstraße, verkauft hinten raus.',
  },
  {
    id: 'pitter',
    name: 'Pitter (Mülheim)',
    cityId: 'koeln',
    veedelId: 'muelheim',
    about: 'Alter Hase aus Mülheim, kennt jeden auf der Keupstraße.',
  },
  {
    id: 'hollaender',
    name: 'Der Holländer',
    cityId: 'koeln',
    veedelId: 'deutz',
    about: 'Kommt aus Venlo, kauft für Kunden auf beiden Seiten der Grenze.',
  },
  {
    id: 'jacky',
    name: 'Jacky (Nippes)',
    cityId: 'koeln',
    veedelId: 'nippes',
    about: 'Versorgt die Kneipen in Nippes und hat ein gutes Gedächtnis.',
  },
  {
    id: 'sven',
    name: 'Sven vom Ring',
    cityId: 'koeln',
    veedelId: 'altstadt-sued',
    about: 'Türsteher am Ring, verkauft an die Leute in der Schlange.',
  },
  // Hamburg (Auftrag 30)
  {
    id: 'jojo',
    name: 'Jojo vom Kiez',
    cityId: 'hamburg',
    veedelId: 'st-pauli',
    about: 'Kennt jede Tür auf der Reeperbahn.',
  },
  {
    id: 'kemal',
    name: 'Kemal (St. Georg)',
    cityId: 'hamburg',
    veedelId: 'st-georg',
    about: 'Hat einen Imbiss am Steindamm und viele Cousins.',
  },
  {
    id: 'ole',
    name: 'Ole (Wilhelmsburg)',
    cityId: 'hamburg',
    veedelId: 'wilhelmsburg',
    about: 'Arbeitet am Hafen und versorgt die Schichten.',
  },
  {
    id: 'malte',
    name: 'Malte (Harburg)',
    cityId: 'hamburg',
    veedelId: 'harburg',
    about: 'Student mit großem Freundeskreis südlich der Elbe.',
  },
  // Frankfurt (Auftrag 39)
  {
    id: 'yusuf-ffm',
    name: 'Yusuf (Bahnhofsviertel)',
    cityId: 'frankfurt',
    veedelId: 'bahnhofsviertel',
    about: 'Hat einen Handyladen an der Taunusstraße, hinten im Lager läuft das andere Geschäft.',
  },
  {
    id: 'philipp',
    name: 'Philipp (Westend)',
    cityId: 'frankfurt',
    veedelId: 'westend-sued',
    about: 'Analyst im dritten Jahr. Versorgt seine Abteilung und deren Kunden, zahlt pünktlich.',
  },
  {
    id: 'ilse',
    name: 'Ilse (Sachsenhausen)',
    cityId: 'frankfurt',
    veedelId: 'sachsenhausen-nord',
    about: 'Wirtin in der Kneipengasse. Was die Junggesellenabschiede wollen, besorgt sie.',
  },
  {
    id: 'marco',
    name: 'Marco (Flughafen)',
    cityId: 'frankfurt',
    veedelId: 'flughafen',
    about: 'Fährt Gepäckwagen auf dem Vorfeld und verkauft an Crews, die nur eine Nacht bleiben.',
  },
];

// --- Stammabnehmer (Auftrag 34) ---

/** Vertrauen eines Dealers, mit dem du noch nie gehandelt hast (0–100). */
export const DEALER_START_TRUST = 15;
/** Vertrauen nach einem Deal: erfüllt, abgelehnt, geplatzt oder hängengelassen (Frist verpasst). */
export const DEALER_TRUST = { done: 8, declined: -4, failed: -20, expired: -15 } as const;
/**
 * Stufen nach Vertrauen: regelmäßige Anfragen, Vorkasse (zahlt die Hälfte vorab, der Deal kippt nicht mehr),
 * Exklusivität (kauft nur bei dir, dafür Rabatt), Zwischenhändler für sein Veedel (wöchentliche Lieferung).
 */
export const DEALER_STAGES = [
  { id: 'casual', at: 0, name: 'Gelegentlich' },
  { id: 'regular', at: 30, name: 'Regelmäßig' },
  { id: 'prepay', at: 50, name: 'Vorkasse' },
  { id: 'exclusive', at: 70, name: 'Exklusiv' },
  { id: 'middleman', at: 85, name: 'Zwischenhändler' },
] as const;
export type DealerStageId = (typeof DEALER_STAGES)[number]['id'];
/** Regelmäßige Anfragen spätestens alle so viele Minuten (exklusiv öfter). */
export const DEALER_REGULAR_INTERVAL = 3 * 1440;
export const DEALER_EXCLUSIVE_INTERVAL = 2 * 1440;
/** Vorkasse: Anteil, den der Dealer beim Annehmen zahlt. */
export const DEALER_PREPAY_SHARE = 0.5;
/** Exklusiv: so viel Rabatt zusätzlich. */
export const DEALER_EXCLUSIVE_DISCOUNT = 0.1;
/** Wer so oft in so vielen Tagen hängengelassen wird, geht zu einer Gang (und kommt nach DEALER_RETURN_DAYS wieder). */
export const DEALER_LETDOWNS_TO_LEAVE = 2;
export const DEALER_LETDOWN_DAYS = 14;
export const DEALER_RETURN_DAYS = 21;
/** Ein neues Angebot (Exklusivität, Zwischenhandel) frühestens nach so vielen Minuten. */
export const DEALER_OFFER_GAP = 5 * 1440;
/** Zwischenhändler: Menge pro Woche, Rabatt (geringere Marge) und Einfluss im Veedel pro Lieferung. */
export const MIDDLEMAN_INTERVAL = 7 * 1440;
export const MIDDLEMAN_AMOUNT = 150;
export const MIDDLEMAN_DISCOUNT = 0.45;
export const MIDDLEMAN_INFLUENCE = 6;

/** Abgeschlossene Aufträge, die in der Liste bleiben. */
export const ORDER_HISTORY = 15;

/**
 * Nachtleben (Auftrag 30): In diesen Stunden zählt das Nachtleben eines Veedels (veedel.nightlife, z.B. St. Pauli 2),
 * in Nächten auf Samstag und Sonntag noch einmal mal NIGHTLIFE_WEEKEND.
 */
export const NIGHTLIFE_HOURS = { from: 22, to: 4 } as const;
export const NIGHTLIFE_WEEKEND = 1.3;

// ---------------------------------------------------------------------------------------------
// Qualität treibt Nachfrage (Auftrag 32): Pro Spot und Ware ein gleitender Schnitt der Qualität der letzten
// Straßenverkäufe. Gute Ware spricht sich herum, Dreck auch.

/** Gewicht des neuesten Verkaufs im gleitenden Schnitt (0,2 = etwa die letzten fünf zählen). */
export const QUALITY_MEMORY = 0.2;
/** Solide und gute Ware (Schnitt in diesem Bereich, normale Lieferantenware) ändert nichts. */
export const QUALITY_NEUTRAL: readonly [number, number] = [0.45, 0.8];
/** Ab diesem Schnitt voller Zuschlag (Premium). */
export const QUALITY_PREMIUM_AT = 0.95;
/** Bis zu diesem Schnitt voller Abschlag (Dreck). */
export const QUALITY_TRASH_AT = 0.15;
/** Faktor auf die Nachfrage nach der Ware am Spot: Premium bis +25 %, Dreck bis −33 %. */
export const QUALITY_DEMAND_MAX = 1.25;
export const QUALITY_DEMAND_MIN = 0.67;
/** Ab dieser Abweichung zeigt der Spot einen Chip ("Gras gefragt" bzw. "Gras verschrien"). */
export const QUALITY_CHIP_FROM = 0.08;
