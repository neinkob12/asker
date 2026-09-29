import type { Supplier } from './index';

/** Lieferzeit Rotterdam: 12,5 Spielstunden = 2,5 echte Minuten bei 1x. */
export const ROTTERDAM_DELIVERY_TIME = 750;

// Paketpreise: Grundpreis des Produkts × Preisniveau des Lieferanten × Menge, mit Mengenrabatt
// (mittel 7 %, groß 14 %), auf 5 € gerundet. minTrust: erst ab diesem Vertrauen im Sortiment.

export const SUPPLIERS: readonly Supplier[] = [
  {
    id: 'rotterdam',
    name: 'Hafen Rotterdam',
    contactName: 'Jansen',
    kind: 'port',
    lng: 4.4,
    lat: 51.9,
    deliveryTime: ROTTERDAM_DELIVERY_TIME,
    priceLevel: 0.34,
    quality: 0.55,
    reliability: 0.72,
    description: 'Container vom Hafen. Große Mengen, billig, aber es dauert und der Zoll schaut manchmal genauer hin.',
    packages: [
      { id: 'small', label: '200 g Gras', productId: 'weed', amount: 200, price: 680 },
      { id: 'medium', label: '500 g Gras', productId: 'weed', amount: 500, price: 1580 },
      { id: 'large', label: '1 kg Gras', productId: 'weed', amount: 1000, price: 2925 },
      { id: 'hash', label: '500 g Hasch', productId: 'hash', amount: 500, price: 1425 },
      { id: 'haze', label: '500 g Amnesia Haze', productId: 'haze', amount: 500, price: 2055, minTrust: 30 },
      { id: 'kush', label: '500 g OG Kush', productId: 'kush', amount: 500, price: 2530, minTrust: 55 },
    ],
  },
  {
    id: 'frankfurt',
    name: 'Frankfurt',
    contactName: 'Toni',
    kind: 'city',
    lng: 8.682,
    lat: 50.111,
    deliveryTime: 180,
    priceLevel: 0.55,
    quality: 0.62,
    reliability: 0.88,
    description: 'Kurierfahrer über die A3. Schnell und zuverlässig, dafür teuer.',
    packages: [
      { id: 'weed25', label: '25 g Gras', productId: 'weed', amount: 25, price: 140 },
      { id: 'weed50', label: '50 g Gras', productId: 'weed', amount: 50, price: 255 },
      { id: 'haze25', label: '25 g Amnesia Haze', productId: 'haze', amount: 25, price: 180 },
      { id: 'oil20', label: '20 ml Öl', productId: 'oil', amount: 20, price: 220 },
      { id: 'oil50', label: '50 ml Öl', productId: 'oil', amount: 50, price: 510, minTrust: 40 },
    ],
  },
  {
    id: 'berlin',
    name: 'Berlin',
    contactName: 'Mirko',
    kind: 'city',
    lng: 13.405,
    lat: 52.52,
    deliveryTime: 300,
    priceLevel: 0.5,
    quality: 0.74,
    reliability: 0.7,
    description: 'Gute Ware aus der Hauptstadt, Edibles und Vapes. Nicht immer pünktlich.',
    packages: [
      { id: 'haze50', label: '50 g Amnesia Haze', productId: 'haze', amount: 50, price: 300 },
      { id: 'kush25', label: '25 g OG Kush', productId: 'kush', amount: 25, price: 200 },
      { id: 'edibles30', label: '30 Edibles', productId: 'edibles', amount: 30, price: 105 },
      { id: 'vape10', label: '10 Vape-Pens', productId: 'vape', amount: 10, price: 150 },
      { id: 'kush100', label: '100 g OG Kush', productId: 'kush', amount: 100, price: 690, minTrust: 45 },
    ],
  },
  {
    id: 'hamburg',
    name: 'Hamburg',
    contactName: 'Hein',
    kind: 'city',
    lng: 9.993,
    lat: 53.551,
    deliveryTime: 270,
    priceLevel: 0.52,
    quality: 0.6,
    reliability: 0.9,
    description: 'Hanseatisch korrekt. Solide Ware, fast nie Ärger.',
    packages: [
      { id: 'weed50', label: '50 g Gras', productId: 'weed', amount: 50, price: 240 },
      { id: 'hash50', label: '50 g Hasch', productId: 'hash', amount: 50, price: 220 },
      { id: 'edibles30', label: '30 Edibles', productId: 'edibles', amount: 30, price: 110 },
      { id: 'vape10', label: '10 Vape-Pens', productId: 'vape', amount: 10, price: 155 },
      { id: 'vape30', label: '30 Vape-Pens', productId: 'vape', amount: 30, price: 435, minTrust: 40 },
    ],
  },
];

// Beziehung und Vertrauen (0–100)

export const START_TRUST = 10;
/** Vertrauen pro Bestellung plus pro 1000 € Bestellwert. */
export const TRUST_PER_ORDER = 2;
export const TRUST_PER_1000_EUR = 1.5;
/** Bar bezahlt = pünktlich bezahlt. */
export const TRUST_CASH_BONUS = 1;
/** Kredit vor Fälligkeit komplett zurückgezahlt. */
export const TRUST_ON_TIME_REPAYMENT = 4;
/** Kredit überfällig. */
export const TRUST_LATE_PENALTY = 12;

/** Rabatt bei Vertrauen 100, linear ab DISCOUNT_FROM_TRUST (darunter kein Rabatt). */
export const MAX_DISCOUNT = 0.15;
export const DISCOUNT_FROM_TRUST = 20;
/** Qualitätsbonus bei Vertrauen 100 (linear ab 0). */
export const MAX_QUALITY_BONUS = 0.12;
/** Kredit gibt es ab diesem Vertrauen, dann pro Punkt über CREDIT_TRUST_OFFSET so viele Euro. */
export const CREDIT_MIN_TRUST = 25;
export const CREDIT_TRUST_OFFSET = 20;
export const CREDIT_PER_TRUST = 60;
/** Zahlungsziel für Kredit in Spielminuten (2 Tage). */
export const CREDIT_TERM = 2 * 24 * 60;
/** Nach Überschreiten gibt es einen Tag Aufschub, jedes Mal mit Aufschlag auf die Schulden. */
export const OVERDUE_EXTENSION = 24 * 60;
export const LATE_INTEREST = 0.1;

// Lieferprobleme. Wahrscheinlichkeit = (1 - Zuverlässigkeit) × Faktor × (1 - Vertrauen / 200).

export const DELAY_FACTOR = 0.6;
export const BAD_QUALITY_FACTOR = 0.4;
export const SEIZE_FACTOR = 0.15;
/** Zusätzliches Beschlagnahme-Risiko am Hafen (Zoll). */
export const PORT_SEIZE_EXTRA = 0.02;
/** Verspätung als Anteil der Lieferzeit [von, bis]. */
export const DELAY_RANGE: readonly [number, number] = [0.4, 1];
/** Qualitätsverlust bei schlechter Ware [von, bis]. */
export const BAD_QUALITY_LOSS: readonly [number, number] = [0.15, 0.3];
/** An dieser Stelle der Fahrt (Anteil) passiert das Problem. */
export const PROBLEM_AT = 0.45;
/** Qualität schwankt pro Lieferung um ± so viel. */
export const QUALITY_SPREAD = 0.05;

// Hafenlieferungen auf der Karte (nur Darstellung, die Lieferzeit bleibt gleich): Das Schiff kommt aus
// Rotterdam den Rhein hinauf in den Niehler Hafen, dort wird umgeladen, den Rest fährt ein Lkw zum Lager.

/** Hafen, in dem vom Schiff auf den Lkw umgeladen wird. */
export const UNLOADING_PORT = { name: 'Niehler Hafen', lng: 6.9712, lat: 50.9862 } as const;

/**
 * Weg des Schiffs von Rotterdam den Rhein hinauf bis in den Niehler Hafen, [lng, lat] von Norden nach Süden
 * (ungefähr, außerhalb Kölns grob). Ab RHINE_APPROACH_FROM ist das Schiff in Köln und fährt langsamer ein.
 */
export const RHINE_ROUTE: readonly (readonly [number, number])[] = [
  [4.4, 51.9],
  [4.48, 51.905],
  [4.56, 51.885],
  [4.63, 51.84],
  [4.7, 51.815],
  [4.85, 51.82],
  [4.98, 51.83],
  [5.15, 51.81],
  [5.3, 51.81],
  [5.45, 51.885],
  [5.62, 51.885],
  [5.86, 51.853],
  [6.05, 51.855],
  [6.12, 51.86],
  [6.25, 51.83],
  [6.4, 51.77],
  [6.55, 51.68],
  [6.63, 51.65],
  [6.7, 51.56],
  [6.73, 51.46],
  [6.72, 51.37],
  [6.76, 51.29],
  [6.765, 51.235],
  [6.745, 51.2],
  [6.79, 51.17],
  [6.85, 51.13],
  [6.86, 51.1],
  [6.9, 51.075],
  [6.93, 51.058],
  [6.955, 51.04],
  [6.97, 51.022],
  [6.983, 51.006],
  [6.99, 50.995],
  [6.9885, 50.987],
  [6.982, 50.9845],
  [6.976, 50.985],
  [UNLOADING_PORT.lng, UNLOADING_PORT.lat],
];
/** Ab diesem Punkt der Route (Leverkusener Brücke) fährt das Schiff in Köln ein. */
export const RHINE_APPROACH_FROM = 30;
/** Anteil der Schiffszeit für die Einfahrt in Köln, damit man das Schiff auf dem Rhein sieht. */
export const RHINE_APPROACH_SHARE = 0.35;
/** Anteil der Lieferzeit auf dem Schiff, danach fürs Umladen im Hafen; den Rest fährt der Lkw. */
export const SHIP_SHARE = 0.78;
export const UNLOADING_SHARE = 0.05;
