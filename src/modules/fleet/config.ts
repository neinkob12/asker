// Einstellbare Werte des Fuhrparks (Auftrag 33). Ladung in Gramm (Gewicht pro Einheit: UNIT_WEIGHT_GRAMS in goods),
// Tempo als Faktor auf das Tempo des Fahrers, Kontrollfaktor auf die Chance einer Kontrolle, Preis in sauberem Geld.
import type { VehicleModel } from './index';

/**
 * Modelle. Feste Werte, kein Alter, keine Kennzeichen, keine Werkstatt. Der Lkw kommt erst mit der Hafen-Phase
 * (available: false, Aufträge 40 und 41).
 */
export const VEHICLE_MODELS: readonly VehicleModel[] = [
  {
    id: 'scooter',
    name: 'Roller',
    capacity: 2000,
    speed: 1.15,
    checkFactor: 0.6,
    price: 1800,
    mapKind: 'courier',
    available: true,
    description: 'Klein, schnell, fällt kaum auf. Für kurze Wege mit wenig Ware.',
  },
  {
    id: 'kombi',
    name: 'Kombi',
    capacity: 8000,
    speed: 1,
    checkFactor: 0.9,
    price: 5500,
    mapKind: 'car',
    available: true,
    description: 'Familienauto mit großem Kofferraum. Unauffällig, fasst einiges.',
  },
  {
    id: 'van',
    name: 'Transporter',
    capacity: 25000,
    speed: 0.9,
    checkFactor: 1.3,
    price: 14000,
    mapKind: 'van',
    available: true,
    description: 'Viel Platz für Hafenware und lange Routen. Wird öfter rausgewunken.',
  },
  {
    id: 'truck',
    name: 'Lkw',
    capacity: 80000,
    speed: 0.75,
    checkFactor: 1.8,
    price: 42000,
    mapKind: 'truck',
    available: false,
    description: 'Kommt mit dem eigenen Hafen.',
  },
];

/**
 * Ohne eigenes Fahrzeug fährt der Fahrer (oder du) das eigene Auto, mit Tempo und Kontrollen wie bisher. Innerhalb einer
 * Stadt (Abholen, Umlagern) passt alles hinein wie bisher; capacity gilt nur für Routen (INTERCITY_CAPACITY in logistics).
 */
export const PRIVATE_CAR: VehicleModel = {
  id: 'private',
  name: 'Privatauto',
  capacity: 5000,
  speed: 1,
  checkFactor: 1,
  price: 0,
  mapKind: 'van',
  available: false,
  description: 'Das eigene Auto des Fahrers.',
};

/** Fliegt eine Ladung auf, ist das Fahrzeug mit dieser Chance beschlagnahmt. */
export const VEHICLE_SEIZE_CHANCE = 0.5;
/** So lange steht ein beschlagnahmtes Fahrzeug noch in der Liste (Spielminuten), dann ist es weg. */
export const SEIZED_VISIBLE_MINUTES = 3 * 24 * 60;
/** Beim Verkauf gibt es diesen Anteil vom Preis zurück (sauberes Geld). */
export const RESALE_SHARE = 0.5;
/** So viele Fahrzeuge kann man insgesamt haben. */
export const FLEET_LIMIT = 12;
