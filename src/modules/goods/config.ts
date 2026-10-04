import type { Product, ProductCategory, QualityTier, Warehouse, WarehouseUpgradeKind } from './index';

/**
 * Produkte mit Grundpreis (pro Einheit auf der Straße), Einheit und Zielgruppen (IDs der Kundentypen aus
 * dem customers-Modul). typicalAmount ist die übliche Menge eines Straßenkunden.
 */
export const PRODUCTS: readonly Product[] = [
  {
    id: 'weed',
    name: 'Gras',
    unit: 'g',
    basePrice: 11,
    category: 'flower',
    cuttable: true,
    audiences: ['student', 'stoner', 'tourist', 'party'],
    typicalAmount: [1, 5],
  },
  {
    id: 'haze',
    name: 'Amnesia Haze',
    unit: 'g',
    basePrice: 15,
    category: 'flower',
    cuttable: true,
    audiences: ['party', 'student', 'stoner'],
    typicalAmount: [1, 4],
  },
  {
    id: 'kush',
    name: 'OG Kush',
    unit: 'g',
    basePrice: 18,
    category: 'flower',
    cuttable: true,
    audiences: ['banker', 'party'],
    typicalAmount: [1, 3],
  },
  {
    id: 'hash',
    name: 'Hasch',
    unit: 'g',
    basePrice: 10,
    category: 'hash',
    cuttable: true,
    audiences: ['stoner', 'tourist', 'student'],
    typicalAmount: [1, 5],
  },
  {
    id: 'edibles',
    name: 'Edibles',
    unit: 'Stück',
    basePrice: 8,
    category: 'edible',
    cuttable: false,
    audiences: ['tourist', 'party', 'banker'],
    typicalAmount: [2, 6],
  },
  {
    id: 'oil',
    name: 'Öl',
    unit: 'ml',
    basePrice: 23,
    category: 'oil',
    cuttable: true,
    audiences: ['banker', 'stoner'],
    typicalAmount: [1, 3],
  },
  {
    id: 'vape',
    name: 'Vape-Pen',
    unit: 'Stück',
    basePrice: 34,
    category: 'vape',
    cuttable: false,
    audiences: ['party', 'banker', 'student'],
    typicalAmount: [1, 2],
  },
];

export const DEFAULT_PRODUCT = 'weed';

/**
 * Gewicht pro Einheit in Gramm nach Warenart (Auftrag 30: Ladung einer Fahrt zwischen den Städten, INTERCITY_CAPACITY
 * in logistics): Gras und Hasch pro Gramm, ein Edible 5 g, ein Vape-Pen 20 g, Öl 1 g je ml.
 */
export const UNIT_WEIGHT_GRAMS: Readonly<Record<ProductCategory, number>> = {
  flower: 1,
  hash: 1,
  edible: 5,
  vape: 20,
  oil: 1,
};

/**
 * Lager-Standorte. Das erste hast du von Anfang an, die anderen kaufst du mit sauberem Geld (Immobilien sind legal,
 * das Geld muss also vorher gewaschen werden). Mehrere Lager: kürzere Wege für Lieferungen, und eine Razzia oder
 * ein Überfall trifft nicht alles auf einmal. capacity ist der Platz ohne Ausbau in Gramm (Gewicht pro Einheit:
 * UNIT_WEIGHT_GRAMS): Keller und Garagen sind klein, Hallen groß (Auftrag 33).
 */
export const WAREHOUSES: readonly Warehouse[] = [
  {
    id: 'ehrenfeld',
    cityId: 'koeln',
    name: 'Lager Ehrenfeld',
    lng: 6.918,
    lat: 50.948,
    cost: 0,
    capacity: 20000,
    description: 'Hinterhof an der Venloer Straße. Hier hat alles angefangen.',
  },
  {
    id: 'nippes',
    cityId: 'koeln',
    name: 'Garage Nippes',
    lng: 6.9555,
    lat: 50.964,
    cost: 2000,
    capacity: 12000,
    description: 'Doppelgarage nah an der Neusser Straße. Kurzer Weg zum Niehler Hafen.',
  },
  {
    id: 'suelz',
    cityId: 'koeln',
    name: 'Keller Sülz',
    lng: 6.92,
    lat: 50.9215,
    cost: 2200,
    capacity: 10000,
    description: 'Trockener Keller unter einem Copyshop, mitten im Studentenviertel.',
  },
  {
    id: 'kalk',
    cityId: 'koeln',
    name: 'Halle Kalk',
    lng: 7.006,
    lat: 50.9395,
    cost: 2500,
    capacity: 40000,
    description: 'Alte Werkshalle hinter der Kalker Hauptstraße. Viel Platz, wenig Nachbarn.',
  },
  {
    id: 'muelheim',
    cityId: 'koeln',
    name: 'Werkstatt Mülheim',
    lng: 7.0105,
    lat: 50.962,
    cost: 2800,
    capacity: 25000,
    description: 'Kfz-Werkstatt mit Hinterhof. Transporter fallen hier nicht auf.',
  },
  {
    id: 'bayenthal',
    cityId: 'koeln',
    name: 'Bootshaus Bayenthal',
    lng: 6.97,
    lat: 50.91,
    cost: 3200,
    capacity: 15000,
    description: 'Bootshaus am Rhein im Süden. Teuer, aber diskret.',
  },
  // Hamburg (Auftrag 30): fünf Standorte zum Kaufen, kein kostenloses (dort fängst du ohne Team an). Preise wie
  // vergleichbare Kölner Standorte mal dem Immobilien-Faktor der Stadt (1,5).
  {
    id: 'werkstatt-ottensen',
    cityId: 'hamburg',
    name: 'Werkstatt Ottensen',
    lng: 9.9285,
    lat: 53.5535,
    cost: 4200,
    capacity: 25000,
    description: 'Hinterhofwerkstatt zwischen Bio-Laden und Agentur. Kurze Wege nach Altona und auf den Kiez.',
  },
  {
    id: 'keller-st-georg',
    cityId: 'hamburg',
    name: 'Keller St. Georg',
    lng: 10.0145,
    lat: 53.5585,
    cost: 3300,
    capacity: 10000,
    description: 'Gewölbekeller unter einem Kiosk an der Langen Reihe. Hauptbahnhof um die Ecke.',
  },
  {
    id: 'halle-wilhelmsburg',
    cityId: 'hamburg',
    name: 'Halle Wilhelmsburg',
    lng: 9.995,
    lat: 53.508,
    cost: 3750,
    capacity: 40000,
    description: 'Alte Lagerhalle am Reiherstieg. Viel Platz, Container vor der Tür, der Hafen ist nah.',
  },
  {
    id: 'garage-barmbek',
    cityId: 'hamburg',
    name: 'Garage Barmbek',
    lng: 10.0335,
    lat: 53.5765,
    cost: 3000,
    capacity: 12000,
    description: 'Sammelgarage hinter einem Backsteinblock. Unauffällig und günstig, für Hamburger Verhältnisse.',
  },
  {
    id: 'bootshaus-harburg',
    cityId: 'hamburg',
    name: 'Bootshaus Harburg',
    lng: 9.9829,
    lat: 53.46529,
    cost: 4800,
    capacity: 15000,
    description: 'Bootshaus am Harburger Binnenhafen. Teuer, aber wer kommt hier schon vorbei.',
  },
];

export const DEFAULT_WAREHOUSE = 'ehrenfeld';

/** Bestand zu Spielbeginn (im Standardlager, Standardprodukt). */
export const START_STOCK = 40;
/** Qualität des Startbestands. */
export const START_QUALITY = 0.5;
/** Einkaufspreis des Startbestands pro Einheit (für die Anzeige der Marge). */
export const START_UNIT_COST = 4;

/** Qualität von 0 (Dreck) bis 1 (beste Ware). Ware ohne Angabe hat diese Qualität. */
export const STANDARD_QUALITY = 0.6;

/** Qualitätsstufen, beste zuerst. Eine Ware gehört zur ersten Stufe, deren min sie erreicht. */
export const QUALITY_TIERS: readonly QualityTier[] = [
  { id: 'premium', name: 'Premium', min: 0.85 },
  { id: 'good', name: 'Gut', min: 0.65 },
  { id: 'solid', name: 'Solide', min: 0.45 },
  { id: 'weak', name: 'Schwach', min: 0.25 },
  { id: 'trash', name: 'Dreck', min: 0 },
];

/** Strecken: wählbare Stufen (Anteil zusätzlicher Menge). */
export const CUT_STEPS = [0.1, 0.25, 0.5] as const;
/** Höchstens so viel Streckmittel darf in einem Posten stecken (Anteil an der Menge). */
export const MAX_CUT = 0.5;
/** Qualitätsverlust pro Anteil Streckmittel: +25 % Menge kostet 25 % × 0,9 der Qualität. */
export const CUT_QUALITY_LOSS = 0.9;
/** Streckmittel kostet pro zusätzlicher Einheit (Schwarzgeld). */
export const CUT_AGENT_COST = 0.3;

// --- Ausbau der Lager (Auftrag 33) -----------------------------------------------------------------------------------

export interface UpgradeLevel {
  /** Wirkung der Stufe: Regale Faktor auf die Kapazität, Tresor und Tarnung Anteil des Verlusts (1 = wie ohne). */
  value: number;
  /** Preis in sauberem Geld (mal propertyFactor der Stadt). */
  cost: number;
}

export interface UpgradeDef {
  name: string;
  icon: string;
  /** Ein Satz, was der Ausbau bringt. */
  effect: string;
  levels: readonly UpgradeLevel[];
}

/**
 * Ausbau in Stufen, bezahlt mit sauberem Geld: Regale vergrößern das Lager, der Tresor senkt den Verlust bei Einbruch
 * und Überfall (gangs, encounters), die Tarnung den Anteil, den eine Razzia aus diesem Lager mitnimmt (police).
 */
export const WAREHOUSE_UPGRADES: Readonly<Record<WarehouseUpgradeKind, UpgradeDef>> = {
  shelves: {
    name: 'Regale',
    icon: 'boxes',
    effect: 'Mehr Platz im Lager.',
    levels: [
      { value: 1.5, cost: 1200 },
      { value: 2, cost: 2600 },
      { value: 3, cost: 5500 },
    ],
  },
  vault: {
    name: 'Tresor',
    icon: 'lock',
    effect: 'Weniger Verlust bei Einbruch und Überfall.',
    levels: [
      { value: 0.65, cost: 1500 },
      { value: 0.4, cost: 3600 },
    ],
  },
  cover: {
    name: 'Tarnung',
    icon: 'eyeOff',
    effect: 'Eine Razzia findet hier weniger.',
    levels: [
      { value: 0.6, cost: 1800 },
      { value: 0.35, cost: 4200 },
    ],
  },
};

/** Reihenfolge der Ausbauten in der Oberfläche. */
export const UPGRADE_KINDS: readonly WarehouseUpgradeKind[] = ['shelves', 'vault', 'cover'];

/** Ab diesem Füllstand gilt ein Lager als fast voll (Warnung in der Oberfläche, Bot kauft Regale). */
export const NEARLY_FULL = 0.85;
