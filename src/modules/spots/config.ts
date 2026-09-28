import type { Spot } from './index';

/**
 * Vorgegebene Spots. Die mit unlockCost 0 sind von Anfang an offen, die anderen muss man freischalten
 * (Schwarzgeld für Kontakte vor Ort). audience: wie stark ein Kundentyp hier vertreten ist (1 = normal).
 */
export const PRESET_SPOTS: readonly Spot[] = [
  {
    id: 'ebertplatz',
    name: 'Ebertplatz',
    lng: 6.9575,
    lat: 50.9497,
    veedelId: 'neustadt-nord',
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
    veedelId: 'altstadt-sued',
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
    veedelId: 'neustadt-sued',
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
    veedelId: 'neustadt-sued',
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
    veedelId: 'neustadt-sued',
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
    veedelId: 'neustadt-nord',
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
    veedelId: 'altstadt-nord',
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
    veedelId: 'deutz',
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
    veedelId: 'neustadt-nord',
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
    veedelId: 'lindenthal',
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
