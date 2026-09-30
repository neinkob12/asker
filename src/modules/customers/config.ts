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

/** Chance pro Spielstunde auf eine Lieferanfrage (× Ruf-Faktor × Uhrzeit). */
export const DELIVERY_CHANCE_PER_HOUR = 0.18;
/** Aufschlag auf den Richtpreis für die Lieferung. */
export const DELIVERY_MARKUP = 1.25;
export const DELIVERY_MIN_REPUTATION = 15;
export const MAX_OPEN_ORDERS = 3;
/** Antwortfrist für Aufträge im Handy. */
export const ORDER_EXPIRES_IN = 90;
/** Übergabe dauert so lange (zusätzlich zur Fahrt). */
export const HANDOVER_MINUTES = 10;
/** Tempo in Metern pro Spielminute: der Spieler mit dem Rad (15 km/h), Kuriere je nach Tempo-Wert. */
export const PLAYER_SPEED = 250;
/** Selbst am Spot stehen: So lange brauchst du für einen Kunden (schneller als ein neuer Läufer). */
export const PLAYER_SERVE_TIME = 10;
export const COURIER_BASE_SPEED = 200;
export const COURIER_SPEED_PER_POINT = 3;

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

export const DEALERS: readonly { id: string; name: string; veedelId: string }[] = [
  { id: 'oemer', name: 'Ömer (Kalk)', veedelId: 'kalk' },
  { id: 'pitter', name: 'Pitter (Mülheim)', veedelId: 'muelheim' },
  { id: 'hollaender', name: 'Der Holländer', veedelId: 'deutz' },
  { id: 'jacky', name: 'Jacky (Nippes)', veedelId: 'nippes' },
  { id: 'sven', name: 'Sven vom Ring', veedelId: 'altstadt-sued' },
];

/** Abgeschlossene Aufträge, die in der Liste bleiben. */
export const ORDER_HISTORY = 15;
