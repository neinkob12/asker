// Einstellbare Werte der Logistik. Zeiten in Spielminuten, Geld in Euro, Tempo in Metern pro Spielminute.
import type { Contact } from '../../core';

/** Liegeplatz im Niehler Hafen: Miete für immer, bezahlt mit sauberem Geld (der Hafen ist legal). */
export const BERTH_COST = 4000;

/** So lange steht Ware am Kai, bevor der Zoll neugierig wird. */
export const CARGO_SAFE_MINUTES = 16 * 60;
/** Danach findet der Zoll die Ware mit dieser Chance pro Stunde. */
export const CUSTOMS_CHANCE_PER_HOUR = 0.05;

/** Tempo mit dem Transporter in der Stadt: Grundwert plus pro Punkt Tempo des Fahrers. */
export const DRIVER_BASE_SPEED = 300;
export const DRIVER_SPEED_PER_POINT = 2;
/** Du selbst mit dem Auto. */
export const PLAYER_DRIVE_SPEED = 380;
/** Laden am Hafen bzw. im Lager. */
export const LOAD_MINUTES = 20;
export const TRANSFER_LOAD_MINUTES = 10;
/** Am vollen Lager versucht der Fahrer so oft wieder abzuladen (Spielminuten, Auftrag 33). */
export const UNLOAD_RETRY_MINUTES = 30;

/** Chance auf eine Verkehrskontrolle pro Fahrt mit Ware (× Heat-Faktor × Vorsicht des Fahrers). */
export const CHECK_CHANCE = 0.08;
/**
 * Fährst du selbst (Feedback vom 07.10.2026, Minispiele öfter): Kontrollen und Zoll treffen dich so viel öfter als
 * einen durchschnittlichen Fahrer (Verkehrskontrolle, Papiere, Verfolgungsjagd als Minispiel). Der Bot fährt nie selbst.
 */
export const PLAYER_CHECK_FACTOR = 2;
/** Heat im Ziel-Veedel erhöht die Chance: Faktor = 1 + Heat / HEAT_DIVISOR. */
export const CHECK_HEAT_DIVISOR = 50;
/** So lange hält eine Kontrolle die Fahrt auf (zusätzlich zur Dauer der Konfrontation). */
export const CHECK_DELAY = 15;
/** Ladung weg: Chance, dass der Fahrer festgenommen wird (× Vorsicht). Der Spieler selbst kommt nie in Haft. */
export const SEIZE_ARREST_CHANCE = 0.6;
/** Heat im Ziel-Veedel, wenn eine Ladung auffliegt bzw. der Fahrer den Bullen davonfährt. */
export const SEIZE_HEAT = 12;
export const ESCAPE_HEAT = 8;

/** Erfahrung für den Fahrer pro abgeschlossener Fahrt. */
export const XP_PER_TRIP = 20;

/** So viele abgeschlossene Fahrten bleiben im Protokoll. */
export const LOG_LIMIT = 8;

/** Kontakt im Handy für Nachrichten vom Hafen. */
export const HARBOR_CONTACT: Contact = {
  id: 'other:harbor',
  // Hieß bis Auftrag 23 Kalle wie der Lieferant aus Kalk und der Boss der Schäl Sick; die Kontakt-ID bleibt.
  name: 'Willi Esser (Hafenmeister)',
  kind: 'other',
  role: 'Niehler Hafen',
  about: 'Hafenmeister in Niehl. Sieht viel, sagt wenig, und für den richtigen Preis sieht er auch mal weg.',
  look: {
    feminine: false,
    age: 52,
    skin: 1,
    hair: 'bald',
    hairColor: 5,
    beard: 'moustache',
    glasses: 'square',
    hat: 'none',
    top: 'jacket',
    topColor: 5,
    face: 'round',
    brows: 'heavy',
    eyes: 'heavy',
    mouth: 'hard',
    mouthItem: 'cigarette',
    extra: 'none',
  },
};

/** Rest am Kai nach einer Abholung: So lange schreibt der Hafen nicht noch einmal (Auftrag 43, M5). */
export const LEFT_BEHIND_NOTE_MINUTES = 12 * 60;

/** Hafen einer Stadt (Auftrag 30): Liegeplatz, Kai und Zoll sind pro Stadt. */
export interface PortConfig {
  /** Ort der Fahrten am Hafen (Trip.fromId); Köln behält 'port' aus alten Spielständen. */
  placeId: string;
  name: string;
  /** Fluss, auf dem die Schiffe kommen, mit Präposition für Texte („Schiff auf dem Rhein“). */
  river: { name: string; on: string };
  /** Lage; fehlt sie, gilt der Umschlagplatz der Lieferanten (Köln: Niehler Hafen). */
  lng?: number;
  lat?: number;
  /** Liegeplatz in sauberem Geld. */
  berthCost: number;
  /** So lange ist Ware am Kai sicher, danach findet der Zoll sie mit customsChancePerHour pro Stunde. */
  safeMinutes: number;
  customsChancePerHour: number;
  /** Platz am Kai für die Begrüßung. */
  quay: string;
  /** Ausbau des Liegeplatzes in sauberem Geld (Auftrag 33): Stufe 1 Halle am Kai, Stufe 2 Kran. */
  upgradeCosts: readonly number[];
  /** Orte am Wasserweg für den Schiffs-Tracker (vom Meer zum Kai). */
  shipPlaces: readonly { name: string; lng: number; lat: number }[];
}

/**
 * Stufen des Liegeplatzes (Auftrag 33): Kai, Halle am Kai, Kran. Ware steht länger sicher (safeFactor auf
 * safeMinutes), der Zoll schaut seltener (customsFactor) und das Laden geht schneller (loadFactor auf LOAD_MINUTES).
 */
export const BERTH_LEVELS: readonly {
  name: string;
  effect: string;
  safeFactor: number;
  customsFactor: number;
  loadFactor: number;
}[] = [
  { name: 'Kai', effect: 'Ein Platz am Kai.', safeFactor: 1, customsFactor: 1, loadFactor: 1 },
  {
    name: 'Halle am Kai',
    effect: 'Ware steht unter Dach: länger sicher, der Zoll schaut seltener.',
    safeFactor: 1.75,
    customsFactor: 0.7,
    loadFactor: 0.7,
  },
  {
    name: 'Kran',
    effect: 'Eigener Kran: Laden in Minuten, die Ware ist noch länger sicher.',
    safeFactor: 2.5,
    customsFactor: 0.5,
    loadFactor: 0.35,
  },
];

export const PORTS: Readonly<Record<string, PortConfig>> = {
  koeln: {
    placeId: 'port',
    name: 'Niehler Hafen',
    river: { name: 'Rhein', on: 'auf dem Rhein' },
    berthCost: BERTH_COST,
    safeMinutes: CARGO_SAFE_MINUTES,
    customsChancePerHour: CUSTOMS_CHANCE_PER_HOUR,
    quay: 'Kai 7',
    upgradeCosts: [5000, 12000],
    shipPlaces: [
      { name: 'Rotterdam', lng: 4.48, lat: 51.9 },
      { name: 'Dordrecht', lng: 4.67, lat: 51.81 },
      { name: 'Nijmegen', lng: 5.86, lat: 51.85 },
      { name: 'Emmerich', lng: 6.25, lat: 51.83 },
      { name: 'Wesel', lng: 6.6, lat: 51.66 },
      { name: 'Duisburg', lng: 6.73, lat: 51.43 },
      { name: 'Düsseldorf', lng: 6.77, lat: 51.23 },
      { name: 'Leverkusen', lng: 6.96, lat: 51.04 },
      { name: 'Niehl', lng: 6.97, lat: 50.99 },
    ],
  },
  // Hamburg: Container direkt am O'Swaldkai. Teurer, und der Zoll ist wacher.
  hamburg: {
    placeId: 'port:hamburg',
    name: 'Hamburger Hafen',
    river: { name: 'Elbe', on: 'auf der Elbe' },
    lng: 9.99978,
    lat: 53.52789,
    berthCost: 12000,
    safeMinutes: 10 * 60,
    customsChancePerHour: 0.08,
    quay: 'Schuppen 52 am O’Swaldkai',
    upgradeCosts: [9000, 20000],
    shipPlaces: [
      { name: 'Cuxhaven', lng: 8.7, lat: 53.87 },
      { name: 'Brunsbüttel', lng: 9.14, lat: 53.89 },
      { name: 'Glückstadt', lng: 9.42, lat: 53.78 },
      { name: 'Stade', lng: 9.5, lat: 53.62 },
      { name: 'Wedel', lng: 9.7, lat: 53.57 },
      { name: 'Finkenwerder', lng: 9.86, lat: 53.54 },
      { name: 'O’Swaldkai', lng: 10.0, lat: 53.53 },
    ],
  },
};

// --- Routen mit Fahrplan (Auftrag 30, Etappe 6) ---------------------------------------------------------------

/** Ladung einer Fahrt auf einer Route in Gramm (Gewicht pro Einheit: UNIT_WEIGHT_GRAMS in goods). */
export const INTERCITY_CAPACITY = 5000;
/** Laden im Startlager (und vor der Rückfahrt im Ziellager). */
export const ROUTE_LOAD_MINUTES = 20;
/** So viele Routen kann man anlegen. */
export const ROUTE_LIMIT = 12;

/** Zoll auf der Autobahn: Chance pro Fahrt zwischen den Städten (× Heat-Faktor der Zielstadt × Vorsicht). */
export const AUTOBAHN_CHECK_CHANCE = 0.15;
/** So lange hält eine Zollkontrolle die Fahrt auf (zusätzlich zur Dauer der Konfrontation). */
export const AUTOBAHN_CHECK_DELAY = 60;
/** Auf der Autobahn landet der Fahrer eher in Haft: Faktor auf SEIZE_ARREST_CHANCE. */
export const AUTOBAHN_ARREST_FACTOR = 1.4;
/** Die Gegenseite bei der Zollkontrolle. */
export const CUSTOMS_OPPONENT = { label: 'Der Zoll', strength: 62, count: 3 };

/** Orte an der A1 für die Texte ("auf der A1 bei Münster"), von Köln nach Hamburg. */
export const A1_PLACES: readonly { name: string; lng: number; lat: number }[] = [
  { name: 'Leverkusen', lng: 7.0, lat: 51.06 },
  { name: 'Wuppertal', lng: 7.2, lat: 51.27 },
  { name: 'Schwerte', lng: 7.56, lat: 51.44 },
  { name: 'Kamen', lng: 7.66, lat: 51.59 },
  { name: 'Münster', lng: 7.63, lat: 51.92 },
  { name: 'Osnabrück', lng: 8.05, lat: 52.28 },
  { name: 'Vechta', lng: 8.29, lat: 52.73 },
  { name: 'Bremen', lng: 8.8, lat: 53.05 },
  { name: 'Sittensen', lng: 9.5, lat: 53.28 },
  { name: 'Harburg', lng: 9.98, lat: 53.43 },
];

// --- Routenwahl (Auftrag 33) ---------------------------------------------------------------------------------------

/** Wahl der Strecke für eine Fahrt mit Ware. */
export type RouteChoice = 'autobahn' | 'country' | 'night';

export interface RouteChoiceDef {
  name: string;
  /** Ein Satz für die Auswahl. */
  hint: string;
  /** Faktor auf die Chance einer Kontrolle. */
  checkFactor: number;
  /** Autobahn meiden (länger, roads.AVOID_MOTORWAY). */
  avoidMotorway: boolean;
  /** Abfahrt erst nachts (NIGHT_START bis NIGHT_END). */
  night: boolean;
}

export const ROUTE_CHOICES: Readonly<Record<RouteChoice, RouteChoiceDef>> = {
  autobahn: { name: 'Autobahn', hint: 'Schnellster Weg.', checkFactor: 1, avoidMotorway: false, night: false },
  country: {
    name: 'Landstraße',
    hint: 'Länger, halb so viele Kontrollen.',
    checkFactor: 0.5,
    avoidMotorway: true,
    night: false,
  },
  night: {
    name: 'Nachts',
    hint: 'Abfahrt ab 23 Uhr, ein Drittel der Kontrollen.',
    checkFactor: 1 / 3,
    avoidMotorway: false,
    night: true,
  },
};

/** Reihenfolge in der Oberfläche. */
export const ROUTE_CHOICE_ORDER: readonly RouteChoice[] = ['autobahn', 'country', 'night'];

/** Nachtfahrt: Abfahrt frühestens um 23 Uhr; zwischen 23 und 5 Uhr fährt sie sofort. */
export const NIGHT_START = 23 * 60;
export const NIGHT_END = 5 * 60;

/**
 * Häfen der Hafen-Phase (Auftrag 40): Hier kommen die Container aus dem Ausland an. Rotterdam gehört nach dem Verkauf
 * dir (Jansens Liegeplatz, berthCost 0), Antwerpen und Hamburg mietest du dazu (sauberes Geld). customsFactor: wie
 * scharf der Zoll dort hinschaut (1 = Rotterdam). Wie weit ein Schiff fährt, kommt aus den Seewegen
 * (roads.seaRoute, Auftrag 41). Das Lager am Kai fasst capacity Gramm, jede Halle (trade.buildHall) hallCapacity mehr.
 */
export interface HarborPort {
  id: string;
  name: string;
  /** Land für die Anzeige. */
  country: string;
  lng: number;
  lat: number;
  /** Miete für den Liegeplatz (sauberes Geld), 0 = gehört dir mit Rotterdam. */
  berthCost: number;
  customsFactor: number;
  /** Lager am Kai in Gramm (Auftrag 41); was nicht passt, wartet auf dem Schiff (Liegegeld). */
  capacity: number;
  /** Eine Halle mehr (sauberes Geld): so viel Platz dazu. */
  hallCapacity: number;
  hallCost: number;
  /** Ein Satz zum Hafen. */
  description: string;
}

export const HARBOR_PORTS: readonly HarborPort[] = [
  {
    id: 'rotterdam',
    name: 'Rotterdam',
    country: 'Niederlande',
    lng: 4.4,
    lat: 51.9,
    berthCost: 0,
    customsFactor: 1,
    capacity: 400_000,
    hallCapacity: 200_000,
    hallCost: 60_000,
    description: 'Jansens Liegeplatz im Waalhaven: der größte Hafen Europas, der Zoll kennt jeden Container.',
  },
  {
    id: 'antwerpen',
    name: 'Antwerpen',
    country: 'Belgien',
    lng: 4.29,
    lat: 51.29,
    berthCost: 90_000,
    customsFactor: 0.8,
    capacity: 250_000,
    hallCapacity: 150_000,
    hallCost: 45_000,
    description: 'Riesig und unübersichtlich. Der Zoll schaut seltener hin, die Hafenarbeiter wollen ihren Anteil.',
  },
  {
    id: 'hamburg',
    name: 'Hamburg',
    country: 'Deutschland',
    lng: 9.99978,
    lat: 53.52789,
    berthCost: 120_000,
    customsFactor: 1.15,
    capacity: 250_000,
    hallCapacity: 150_000,
    hallCost: 50_000,
    description: 'Länger auf See, dafür näher an Bremen, Leipzig und Kopenhagen. Der Zoll ist wach.',
  },
];
