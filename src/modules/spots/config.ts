import type { Spot } from './index';

/** Vorgegebener Spot ohne Veedel: Das Veedel ergibt sich aus der Lage (veedelAt, siehe presetSpots in index.ts). */
export type PresetSpot = Omit<Spot, 'veedelId'>;

/**
 * Vorgegebene Spots. Die mit unlockCost 0 sind von Anfang an offen, die anderen muss man freischalten
 * (Schwarzgeld für Kontakte vor Ort). audience: wie stark ein Kundentyp hier vertreten ist (1 = normal).
 */
export const PRESET_SPOTS: readonly PresetSpot[] = [
  {
    id: 'ebertplatz',
    name: 'Ebertplatz',
    lng: 6.9575,
    lat: 50.9497,
    demand: 1.4,
    priceMultiplier: 0.9,
    unlockCost: 0,
    audience: { stoner: 1.6, party: 1.2, banker: 0.3 },
  },
  {
    id: 'neumarkt',
    name: 'Neumarkt',
    lng: 6.9476,
    lat: 50.9362,
    demand: 1.3,
    priceMultiplier: 1.0,
    unlockCost: 0,
    audience: { tourist: 1.6, banker: 1.2 },
  },
  {
    id: 'aachener-weiher',
    name: 'Aachener Weiher',
    lng: 6.9282,
    lat: 50.9356,
    demand: 1.1,
    priceMultiplier: 1.1,
    unlockCost: 450,
    audience: { student: 1.5, stoner: 1.3 },
  },
  {
    id: 'zuelpicher',
    name: 'Zülpicher Platz',
    lng: 6.9398,
    lat: 50.9317,
    demand: 1.5,
    priceMultiplier: 1.05,
    unlockCost: 0,
    audience: { student: 1.5, party: 1.8 },
  },
  {
    id: 'rudolfplatz',
    name: 'Rudolfplatz',
    lng: 6.9392,
    lat: 50.9366,
    demand: 1.0,
    priceMultiplier: 1.15,
    unlockCost: 600,
    audience: { party: 1.6, banker: 1.3 },
  },
  {
    id: 'friesenplatz',
    name: 'Friesenplatz',
    lng: 6.9395,
    lat: 50.9407,
    demand: 0.9,
    priceMultiplier: 1.2,
    unlockCost: 700,
    audience: { party: 1.8, banker: 1.2 },
  },
  {
    id: 'breslauer',
    name: 'Breslauer Platz',
    lng: 6.9612,
    lat: 50.9442,
    demand: 1.0,
    priceMultiplier: 0.85,
    unlockCost: 350,
    audience: { tourist: 1.8, stoner: 1.3 },
  },
  {
    id: 'rheinpark',
    name: 'Rheinpark',
    lng: 6.979,
    lat: 50.9468,
    demand: 0.7,
    priceMultiplier: 1.1,
    unlockCost: 300,
    audience: { tourist: 1.5, stoner: 1.2 },
  },
  {
    id: 'stadtgarten',
    name: 'Stadtgarten',
    lng: 6.933,
    lat: 50.9422,
    demand: 0.8,
    priceMultiplier: 1.1,
    unlockCost: 400,
    audience: { student: 1.2, stoner: 1.3 },
  },
  {
    id: 'uni',
    name: 'Uni-Wiese',
    lng: 6.929,
    lat: 50.9282,
    demand: 1.0,
    priceMultiplier: 1.0,
    unlockCost: 0,
    audience: { student: 2.5, banker: 0.3 },
  },
];

/** Eigenen Spot gründen kostet so viel Schwarzgeld. */
export const FOUND_SPOT_COST = 800;
/** Höchstens so viele eigene Spots. */
export const MAX_CUSTOM_SPOTS = 6;
/** Mindestabstand eines neuen Spots zu allen anderen in Metern. */
export const MIN_SPOT_DISTANCE = 200;
/** Andrang eines eigenen Spots (wird mit der Dichte des Veedels multipliziert). */
export const CUSTOM_SPOT_DEMAND = 0.8;

/**
 * Plakette neben dem Spot-Schild auf der Karte (Look "Glas"): Seite und senkrechter Versatz in px (positiv = nach
 * unten), damit sich in der Innenstadt (Rudolfplatz, Neumarkt, Zülpicher, Friesenplatz) nichts überdeckt. Geprüft
 * beim Standard-Zoom (13,6) mit allen Spots offen. Eigene Spots und fehlende Einträge: rechts, ohne Versatz.
 */
export const SPOT_LABELS: Readonly<Record<string, { labelSide: 'left' | 'right'; labelOffsetY: number }>> = {
  ebertplatz: { labelSide: 'right', labelOffsetY: 0 },
  neumarkt: { labelSide: 'right', labelOffsetY: 0 },
  'aachener-weiher': { labelSide: 'left', labelOffsetY: 0 },
  zuelpicher: { labelSide: 'left', labelOffsetY: 0 },
  rudolfplatz: { labelSide: 'right', labelOffsetY: 0 },
  friesenplatz: { labelSide: 'right', labelOffsetY: 0 },
  breslauer: { labelSide: 'right', labelOffsetY: 0 },
  rheinpark: { labelSide: 'right', labelOffsetY: 0 },
  stadtgarten: { labelSide: 'left', labelOffsetY: 0 },
  uni: { labelSide: 'left', labelOffsetY: 0 },
};
