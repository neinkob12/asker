// Daten der Hafen-Phase (Auftrag 40): fremde Städte als Kunden, Bedarf der alten Organisationen und der Gangs,
// Produzenten im Ausland und Container. Mengen pro Woche in Gramm. Namen frei erfunden.

import type { Contact, LngLat } from '../../core';

/** Bedarf pro Woche (Ware → Gramm). */
export type WeeklyDemand = Readonly<Record<string, number>>;

/** Eine fremde Stadt: Nachfrage-Punkt ohne eigene Karte (plan.md: Startliste in Deutschland). */
export interface ForeignCity {
  id: string;
  name: string;
  at: LngLat;
  /** Preisindex dieser Stadt aus market (die nächste deiner alten Städte). */
  indexCity: string;
  weekly: WeeklyDemand;
  contact: Contact;
}

function person(id: string, name: string, role: string, about: string, feminine: boolean, age: number): Contact {
  return {
    id: `trade:${id}`,
    name,
    kind: 'customer',
    role,
    about,
    look: { feminine, age },
    voice: { feminine, pitch: feminine ? 1 : 0.85, rate: 1 },
  };
}

export const FOREIGN_CITIES: readonly ForeignCity[] = [
  {
    id: 'duesseldorf',
    name: 'Düsseldorf',
    at: { lng: 6.776, lat: 51.227 },
    indexCity: 'koeln',
    weekly: { weed: 14_000, haze: 5_000 },
    contact: person(
      'duesseldorf',
      'Marco Bertolini',
      'Düsseldorf, Altstadt',
      'Betreibt drei Bars an der Kö und versorgt die halbe Altstadt.',
      false,
      44,
    ),
  },
  {
    id: 'dortmund',
    name: 'Dortmund',
    at: { lng: 7.468, lat: 51.514 },
    indexCity: 'koeln',
    weekly: { weed: 12_000, hash: 6_000 },
    contact: person(
      'dortmund',
      'Kemal Aydın',
      'Dortmund, Nordstadt',
      'Großhändler für das ganze Ruhrgebiet, zahlt pünktlich, fragt nicht viel.',
      false,
      39,
    ),
  },
  {
    id: 'bremen',
    name: 'Bremen',
    at: { lng: 8.807, lat: 53.075 },
    indexCity: 'hamburg',
    weekly: { weed: 9_000, hash: 4_000 },
    contact: person(
      'bremen',
      'Jana Wessels',
      'Bremen, Viertel',
      'Hat das Viertel und die Häfen in Bremerhaven unter sich.',
      true,
      35,
    ),
  },
  {
    id: 'hannover',
    name: 'Hannover',
    at: { lng: 9.732, lat: 52.375 },
    indexCity: 'hamburg',
    weekly: { weed: 10_000, edibles: 3_000 },
    contact: person(
      'hannover',
      'Stefan Ruhnke',
      'Hannover, Linden',
      'Früher Rocker, heute Geschäftsmann. Messe, Linden, Studenten.',
      false,
      52,
    ),
  },
  {
    id: 'leipzig',
    name: 'Leipzig',
    at: { lng: 12.374, lat: 51.34 },
    indexCity: 'berlin',
    weekly: { weed: 10_000, hash: 4_000 },
    contact: person(
      'leipzig',
      'Paula Krahl',
      'Leipzig, Connewitz',
      'Versorgt Clubs und WGs von Connewitz bis Plagwitz.',
      true,
      31,
    ),
  },
  {
    id: 'stuttgart',
    name: 'Stuttgart',
    at: { lng: 9.18, lat: 48.776 },
    indexCity: 'muenchen',
    weekly: { kush: 4_000, weed: 8_000 },
    contact: person(
      'stuttgart',
      'Ralf Häberle',
      'Stuttgart, Bohnenviertel',
      'Kunden mit Geld, die Qualität wollen und nichts sagen.',
      false,
      48,
    ),
  },
  {
    id: 'nuernberg',
    name: 'Nürnberg',
    at: { lng: 11.077, lat: 49.452 },
    indexCity: 'muenchen',
    weekly: { weed: 8_000, haze: 3_000 },
    contact: person(
      'nuernberg',
      'Sevda Yıldız',
      'Nürnberg, Gostenhof',
      'Hat Gostenhof und die Südstadt, liefert bis nach Erlangen.',
      true,
      37,
    ),
  },
];

/** Bedarf der alten Organisationen pro Woche (nach dem Verkauf deine Kunden, Kontakt ist der Statthalter). */
export const ORG_DEMAND: Readonly<Record<string, WeeklyDemand>> = {
  koeln: { weed: 18_000, hash: 6_000, haze: 4_000 },
  hamburg: { weed: 15_000, hash: 7_000, kush: 3_000 },
  berlin: { weed: 20_000, hash: 6_000, edibles: 3_000 },
  muenchen: { kush: 6_000, haze: 6_000, weed: 8_000 },
  frankfurt: { weed: 12_000, oil: 2_000, vape: 1_500 },
};

/** Bedarf der stärksten Gang einer Stadt pro Woche. */
export const GANG_DEMAND: WeeklyDemand = { weed: 6_000, hash: 4_000 };

/** Ein Produzent im Ausland (plan.md: Marokko Hasch, Spanien und Albanien Gras, Niederlande Edibles, Vapes, Öl). */
export interface Producer {
  id: string;
  name: string;
  country: string;
  /** Hafen oder Ort, von dem aus verschifft wird. */
  from: string;
  at: LngLat;
  /** Ware → Preis als Anteil am Grundpreis der Ware (pro Gramm). */
  products: Readonly<Record<string, number>>;
  quality: number;
  /** Laufzeit bis Rotterdam in Tagen (andere Häfen: HarborPort.shipDays dazu). */
  days: number;
  /** Grundchance einer Kontrolle pro Container (mal Größe, Hafen, Zoll-Heat). */
  risk: number;
  /** Per Lkw statt per Schiff (Niederlande): kein Seeweg auf der Karte. */
  byRoad?: boolean;
  description: string;
}

export const PRODUCERS: readonly Producer[] = [
  {
    id: 'marokko',
    name: 'Rif-Kooperative',
    country: 'Marokko',
    from: 'Tanger',
    at: { lng: -5.81, lat: 35.78 },
    products: { hash: 0.16, weed: 0.2 },
    quality: 0.62,
    days: 5,
    risk: 0.1,
    description: 'Hasch aus dem Rif, billig und viel. Der Zoll kennt die Route.',
  },
  {
    id: 'spanien',
    name: 'Costa-Gärtnerei',
    country: 'Spanien',
    from: 'Algeciras',
    at: { lng: -5.44, lat: 36.13 },
    products: { weed: 0.19, haze: 0.25 },
    quality: 0.66,
    days: 4,
    risk: 0.07,
    description: 'Gewächshäuser an der Küste, gutes Gras, unter Tomaten verladen.',
  },
  {
    id: 'albanien',
    name: 'Brüder Hoxha',
    country: 'Albanien',
    from: 'Durrës',
    at: { lng: 19.45, lat: 41.32 },
    products: { weed: 0.17, kush: 0.24 },
    quality: 0.6,
    days: 6,
    risk: 0.09,
    description: 'Felder in den Bergen, sehr billig, lange auf See um Griechenland herum.',
  },
  {
    id: 'westland',
    name: 'Labor Westland',
    country: 'Niederlande',
    from: 'Naaldwijk',
    at: { lng: 4.2, lat: 51.99 },
    products: { edibles: 0.25, vape: 0.3, oil: 0.28 },
    quality: 0.85,
    days: 1,
    risk: 0.03,
    byRoad: true,
    description: 'Edibles, Vapes und Öl aus einem Labor zwischen den Gewächshäusern. Kommt per Lkw.',
  },
  {
    id: 'jansen',
    name: 'Jansens Netz',
    country: 'Niederlande',
    from: 'Rotterdam',
    at: { lng: 4.4, lat: 51.9 },
    products: { weed: 0.36, hash: 0.34, haze: 0.38, kush: 0.4, edibles: 0.36, oil: 0.38, vape: 0.4 },
    quality: 0.7,
    days: 1,
    risk: 0.03,
    byRoad: true,
    description: 'Alles, sofort, aus Jansens altem Netz. Teurer, aber am nächsten Tag da.',
  },
];

/** Container: Menge, Fracht (Schwarzgeld) und Faktor auf die Chance einer Kontrolle. Kleiner ist sicherer. */
export interface ContainerSize {
  id: 'small' | 'medium' | 'full';
  label: string;
  grams: number;
  freight: number;
  riskFactor: number;
}

export const CONTAINER_SIZES: readonly ContainerSize[] = [
  { id: 'small', label: 'Kiste (20 kg)', grams: 20_000, freight: 3_000, riskFactor: 0.6 },
  { id: 'medium', label: 'Halber Container (50 kg)', grams: 50_000, freight: 6_000, riskFactor: 1 },
  { id: 'full', label: 'Container (120 kg)', grams: 120_000, freight: 10_000, riskFactor: 1.6 },
];

/**
 * Seewege für die Europa-Ansicht (nur Darstellung): Wegpunkte vom Produzenten bis vor den Ärmelkanal, dann je Hafen
 * das letzte Stück. Grob entlang der echten Routen (Gibraltar, Biskaya, Kanal); Produzenten mit byRoad fahren per Lkw.
 */
export const SEA_LANES: Readonly<Record<string, readonly LngLat[]>> = {
  marokko: [
    { lng: -5.81, lat: 35.78 },
    { lng: -6.2, lat: 36.0 },
  ],
  spanien: [
    { lng: -5.44, lat: 36.13 },
    { lng: -6.2, lat: 36.0 },
  ],
  albanien: [
    { lng: 19.45, lat: 41.32 },
    { lng: 18.9, lat: 40.0 },
    { lng: 15.5, lat: 37.4 },
    { lng: 12.0, lat: 37.2 },
    { lng: 8.5, lat: 38.3 },
    { lng: 2.0, lat: 37.6 },
    { lng: -1.0, lat: 36.9 },
    { lng: -5.4, lat: 35.95 },
    { lng: -6.2, lat: 36.0 },
  ],
};

/** Gemeinsamer Weg von Gibraltar bis vor den Kanal. */
export const ATLANTIC_LANE: readonly LngLat[] = [
  { lng: -6.2, lat: 36.0 },
  { lng: -9.3, lat: 36.9 },
  { lng: -9.9, lat: 39.5 },
  { lng: -9.8, lat: 43.2 },
  { lng: -5.6, lat: 48.4 },
  { lng: -2.0, lat: 49.8 },
  { lng: 1.4, lat: 50.95 },
];

/** Das letzte Stück vom Kanal in den Hafen. */
export const PORT_LANES: Readonly<Record<string, readonly LngLat[]>> = {
  rotterdam: [
    { lng: 1.4, lat: 50.95 },
    { lng: 3.6, lat: 51.95 },
    { lng: 4.05, lat: 51.97 },
    { lng: 4.4, lat: 51.9 },
  ],
  antwerpen: [
    { lng: 1.4, lat: 50.95 },
    { lng: 3.5, lat: 51.45 },
    { lng: 4.0, lat: 51.38 },
    { lng: 4.29, lat: 51.29 },
  ],
  hamburg: [
    { lng: 1.4, lat: 50.95 },
    { lng: 4.4, lat: 53.0 },
    { lng: 7.0, lat: 54.0 },
    { lng: 8.4, lat: 53.95 },
    { lng: 9.3, lat: 53.75 },
    { lng: 10.0, lat: 53.53 },
  ],
};
