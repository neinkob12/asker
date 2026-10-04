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
  name: 'Kalle (Hafenmeister)',
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

/** Hafen einer Stadt (Auftrag 30): Liegeplatz, Kai und Zoll sind pro Stadt. */
export interface PortConfig {
  /** Ort der Fahrten am Hafen (Trip.fromId); Köln behält 'port' aus alten Spielständen. */
  placeId: string;
  name: string;
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
}

export const PORTS: Readonly<Record<string, PortConfig>> = {
  koeln: {
    placeId: 'port',
    name: 'Niehler Hafen',
    berthCost: BERTH_COST,
    safeMinutes: CARGO_SAFE_MINUTES,
    customsChancePerHour: CUSTOMS_CHANCE_PER_HOUR,
    quay: 'Kai 7',
  },
  // Hamburg: Container direkt am O'Swaldkai. Teurer, und der Zoll ist wacher.
  hamburg: {
    placeId: 'port:hamburg',
    name: 'Hamburger Hafen',
    lng: 9.99978,
    lat: 53.52789,
    berthCost: 12000,
    safeMinutes: 10 * 60,
    customsChancePerHour: 0.08,
    quay: 'Schuppen 52 am O’Swaldkai',
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
