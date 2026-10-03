// Einstellbare Werte der Logistik. Zeiten in Spielminuten, Geld in Euro, Tempo in Metern pro Spielminute.

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
export const HARBOR_CONTACT = { id: 'other:harbor', name: 'Kalle (Hafenmeister)', kind: 'other' as const };

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
    lng: 10.0045,
    lat: 53.5282,
    berthCost: 12000,
    safeMinutes: 10 * 60,
    customsChancePerHour: 0.08,
    quay: 'Schuppen 52 am O’Swaldkai',
  },
};
