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
  /**
   * Per Lkw: Tage bis in den Hafen. Per Schiff: Tage bis das Schiff ablegt (Verladen); die Fahrt kommt aus dem Seeweg
   * (roads.seaRoute ab dem Knoten sea, Auftrag 41).
   */
  days: number;
  /** Knoten im Seewege-Netz (roads), an dem das Schiff ablegt; fehlt bei Ware per Lkw. */
  sea?: string;
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
    days: 1,
    sea: 'tanger',
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
    days: 1,
    sea: 'algeciras',
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
    days: 1,
    sea: 'durres',
    risk: 0.09,
    description: 'Felder in den Bergen, sehr billig, aber eine Woche auf See: durchs ganze Mittelmeer.',
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
 * Deckladung (Auftrag 41): was oben im Container liegt. Bessere Tarnung kostet mehr (Anteil am Warenwert des
 * Containers) und senkt die Chance einer Kontrolle. Die Wahl: billig und riskant oder teuer und sicher.
 */
export interface Cover {
  id: 'none' | 'tiles' | 'bananas';
  label: string;
  /** Kosten als Anteil am Warenwert des Containers. */
  share: number;
  /** Faktor auf die Chance einer Zollkontrolle. */
  riskFactor: number;
  description: string;
}

export const COVERS: readonly Cover[] = [
  { id: 'none', label: 'Ohne', share: 0, riskFactor: 1, description: 'Nichts drüber. Wer aufmacht, sieht die Ware.' },
  {
    id: 'tiles',
    label: 'Fliesen',
    share: 0.015,
    riskFactor: 0.7,
    description: 'Paletten voller Fliesen: schwer, langweilig, der Hund riecht wenig.',
  },
  {
    id: 'bananas',
    label: 'Bananen',
    share: 0.04,
    riskFactor: 0.45,
    description: 'Kühlcontainer mit Obst. Teuer, aber der Zoll winkt verderbliche Ware meist durch.',
  },
];

/**
 * Auftrag 41: Städte in Europa als Kunden. Sie melden sich nach und nach (joinWeek: Wochen nach dem Start der
 * Hafen-Phase, und nur bei gutem Ruf), zahlen mehr als die deutschen Städte (priceFactor auf den fairen Preis), aber
 * auf dem Weg liegt eine Grenze mit Zoll (border: Chance einer Kontrolle pro Lieferung, mal Kontrollfaktor des Wagens).
 * Der Lkw fährt über die Autobahn-Linien in roads (Rotterdam – Amsterdam, Antwerpen – Brüssel – Paris, Hamburg –
 * Kopenhagen, München – Wien, München – Mailand über den Brenner, Frankfurt – Zürich). Namen frei erfunden.
 */
export interface EuropeCity extends ForeignCity {
  country: string;
  priceFactor: number;
  joinWeek: number;
  border: { name: string; check: number };
}

export const EUROPE_CITIES: readonly EuropeCity[] = [
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    country: 'Niederlande',
    at: { lng: 4.83, lat: 52.33 },
    indexCity: 'koeln',
    priceFactor: 0.95,
    joinWeek: 1,
    border: { name: 'keine Grenze ab Rotterdam', check: 0.01 },
    weekly: { hash: 10_000, weed: 8_000 },
    contact: person(
      'amsterdam',
      'Joost Visser',
      'Amsterdam, Coffeeshops',
      'Beliefert ein Dutzend Coffeeshops durch die Hintertür. Will Menge, nicht Luxus.',
      false,
      51,
    ),
  },
  {
    id: 'bruessel',
    name: 'Brüssel',
    country: 'Belgien',
    at: { lng: 4.45, lat: 50.9 },
    indexCity: 'koeln',
    priceFactor: 1.1,
    joinWeek: 1,
    border: { name: 'Grenze bei Antwerpen', check: 0.02 },
    weekly: { weed: 9_000, hash: 5_000 },
    contact: person(
      'bruessel',
      'Nadia El Amrani',
      'Brüssel, Molenbeek',
      'Hat die Straßen um den Gare du Midi und Verbindungen bis Lüttich.',
      true,
      36,
    ),
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'Frankreich',
    at: { lng: 2.36, lat: 48.91 },
    indexCity: 'frankfurt',
    priceFactor: 1.2,
    joinWeek: 2,
    border: { name: 'Grenze bei Valenciennes', check: 0.05 },
    weekly: { hash: 14_000, weed: 8_000 },
    contact: person(
      'paris',
      'Karim Benali',
      'Paris, Seine-Saint-Denis',
      'Kauft für die Banlieue im Norden. Groß, schnell, misstrauisch.',
      false,
      42,
    ),
  },
  {
    id: 'kopenhagen',
    name: 'Kopenhagen',
    country: 'Dänemark',
    at: { lng: 12.4, lat: 55.63 },
    indexCity: 'hamburg',
    priceFactor: 1.3,
    joinWeek: 3,
    border: { name: 'Grenze bei Padborg', check: 0.06 },
    weekly: { weed: 8_000, hash: 4_000 },
    contact: person(
      'kopenhagen',
      'Mads Kjær',
      'Kopenhagen, Christianshavn',
      'Die Pusher Street ist zu, die Kundschaft nicht. Zahlt gut für Ruhe.',
      false,
      45,
    ),
  },
  {
    id: 'wien',
    name: 'Wien',
    country: 'Österreich',
    at: { lng: 16.215, lat: 48.205 },
    indexCity: 'muenchen',
    priceFactor: 1.15,
    joinWeek: 3,
    border: { name: 'Grenze am Walserberg', check: 0.05 },
    weekly: { weed: 9_000, haze: 3_000 },
    contact: person(
      'wien',
      'Ferdinand Grubhofer',
      'Wien, Favoriten',
      'Höflich, pünktlich, gnadenlos, wenn etwas fehlt.',
      false,
      58,
    ),
  },
  {
    id: 'zuerich',
    name: 'Zürich',
    country: 'Schweiz',
    at: { lng: 8.47, lat: 47.4 },
    indexCity: 'muenchen',
    priceFactor: 1.4,
    joinWeek: 4,
    border: { name: 'Grenze bei Basel (Schweiz, scharf)', check: 0.1 },
    weekly: { kush: 4_000, haze: 4_000 },
    contact: person(
      'zuerich',
      'Beat Sutter',
      'Zürich, Langstrasse',
      'Banker als Kundschaft, Qualität vor Preis, nie ein lautes Wort.',
      false,
      49,
    ),
  },
  {
    id: 'mailand',
    name: 'Mailand',
    country: 'Italien',
    at: { lng: 9.23, lat: 45.52 },
    indexCity: 'muenchen',
    priceFactor: 1.25,
    joinWeek: 5,
    border: { name: 'Grenzen bei Kufstein und am Brenner', check: 0.1 },
    weekly: { hash: 8_000, weed: 6_000 },
    contact: person(
      'mailand',
      'Giulia Ferraro',
      'Mailand, Quarto Oggiaro',
      'Familie aus Kalabrien, Geschäft in der Lombardei. Testet erst, kauft dann groß.',
      true,
      40,
    ),
  },
];
