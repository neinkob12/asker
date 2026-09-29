import type { Product, QualityTier, Warehouse } from './index';

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

/** Lager. Die Datenstruktur erlaubt mehrere, vorerst gibt es eins. */
export const WAREHOUSES: readonly Warehouse[] = [{ id: 'ehrenfeld', name: 'Lager Ehrenfeld', lng: 6.918, lat: 50.948 }];

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
