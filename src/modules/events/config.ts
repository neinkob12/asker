// Stadt-Events (Auftrag 30, Etappe 7): Feste und Spiele mit festem Kalender in Spieltagen (es gibt kein Datum und keine
// Jahreszeiten). Jedes Event wirkt nur in seiner Stadt und dort nur in seinem Gebiet (Veedel oder einzelne Spots).
// Faktoren: 1 = normal.

import type { Contact } from '../../core';

/** Wann ein Event stattfindet. */
export type EventSchedule =
  /** Ab Tag firstDay alle everyDays Tage, jeweils days ganze Tage (ab Mitternacht). */
  | { kind: 'cycle'; firstDay: number; everyDays: number; days: number }
  /**
   * An einem Wochentag (0 = Montag … 6 = Sonntag) von fromHour bis toHour, jede everyWeeks-te Woche (gezählt ab Tag 1;
   * offset verschiebt, welche Woche zählt).
   */
  | { kind: 'weekly'; weekday: number; everyWeeks: number; offset: number; fromHour: number; toHour: number };

/** Was ein Event bewirkt. Fehlt ein Wert, bleibt alles normal. */
export interface EventEffects {
  /** Laufkundschaft an den Spots im Gebiet. */
  demand?: number;
  /** Heat pro Verkauf im Gebiet. */
  heatPerSale?: number;
  /** Polizei-Kontrollen im Gebiet. */
  checks?: number;
  /** Keine Razzien in der Stadt, solange das Event läuft. */
  noRaids?: boolean;
  /** Überfälle der Gangs auf deine Spots in der Stadt. */
  gangRaids?: number;
}

export interface CityEventDef {
  id: string;
  cityId: string;
  name: string;
  icon: string;
  schedule: EventSchedule;
  /** Gebiet: Veedel (alle Spots dort) und/oder einzelne Spots. */
  area: { veedel?: readonly string[]; spots?: readonly string[] };
  effects: EventEffects;
  /** Ein Satz, was passiert (HUD-Chip, Reviere). */
  text: string;
  /** Ankündigung einen Tag vorher per Handy (fehlt: keine, z.B. beim Kater). */
  announce?: string;
}

/** Wer die Events ankündigt (frei erfunden): der Kiosk-Kumpel der Stadt. */
export const EVENT_CONTACTS: Readonly<Record<string, Contact>> = {
  koeln: { id: 'other:buedchen', name: 'Ömer (Büdchen am Ring)', kind: 'other' },
  hamburg: { id: 'other:kiosk-kiez', name: 'Jens (Kiosk am Hans-Albers-Platz)', kind: 'other' },
  frankfurt: { id: 'other:trinkhalle-ffm', name: 'Sevgi (Trinkhalle an der Konsti)', kind: 'other' },
  berlin: { id: 'other:spaeti-kotti', name: 'Aylin (Späti am Kotti)', kind: 'other' },
  muenchen: { id: 'other:kiosk-glockenbach', name: 'Resi (Kiosk am Sendlinger Tor)', kind: 'other' },
};

/** Innenstadt Köln (Karneval). */
const KOELN_CENTER = ['altstadt-nord', 'altstadt-sued', 'neustadt-nord', 'neustadt-sued'] as const;

/** Spots am Rhein (Kölner Lichter). */
export const RHINE_SPOTS: readonly string[] = [
  'domplatte',
  'breslauer',
  'rheinpark',
  'ottoplatz',
  'rheinufer-bayenthal',
  'muelheimer-hafen',
];

/** Kieze mit Nachtleben in Berlin (Fête de la Musique). */
const BERLIN_PARTY = ['kreuzberg', 'friedrichshain', 'neukoelln', 'mitte', 'prenzlauer-berg', 'alt-treptow'] as const;

/** Spots an den Landungsbrücken und am Hafenrand (Hafengeburtstag). */
export const HARBOR_SPOTS: readonly string[] = ['landungsbruecken', 'fischmarkt'];

/** Spots am Museumsufer und am Mainufer (Museumsuferfest). */
export const MAIN_SPOTS: readonly string[] = ['museumsufer', 'alt-sachsenhausen', 'schweizer-platz', 'roemerberg'];

/** Spots, an denen Messegäste kaufen (Messe, Hotels und Bars drumherum). */
export const MESSE_SPOTS: readonly string[] = ['messe', 'kettenhofweg', 'skyline-plaza', 'bockenheimer-warte'];
/** Spots rund um die Theresienwiese (Oktoberfest). */
export const WIESN_SPOTS: readonly string[] = [
  'theresienwiese',
  'bavariapark',
  'augustiner-keller',
  'hauptbahnhof-muc',
];

export const CITY_EVENTS: readonly CityEventDef[] = [
  // --- Köln ---
  {
    id: 'karneval',
    cityId: 'koeln',
    name: 'Karneval',
    icon: 'party',
    schedule: { kind: 'cycle', firstDay: 30, everyDays: 90, days: 6 },
    area: { veedel: KOELN_CENTER },
    effects: { demand: 2, heatPerSale: 0.7, checks: 0.5, noRaids: true },
    text: 'Die Innenstadt feiert: doppelt so viel Kundschaft, die Polizei hat anderes zu tun, keine Razzien.',
    announce:
      'Morgen geht der Karneval los. Innenstadt dicht, alle jeck, und die Bullen gucken weg. Füll die Lager auf.',
  },
  {
    id: 'kater',
    cityId: 'koeln',
    name: 'Kater nach Karneval',
    icon: 'frown',
    schedule: { kind: 'cycle', firstDay: 36, everyDays: 90, days: 2 },
    area: { veedel: KOELN_CENTER },
    effects: { demand: 0.8 },
    text: 'Aschermittwoch: Die Innenstadt schläft ihren Rausch aus, weniger Kundschaft.',
  },
  {
    id: 'fc',
    cityId: 'koeln',
    name: 'FC-Heimspiel',
    icon: 'flag',
    schedule: { kind: 'weekly', weekday: 5, everyWeeks: 2, offset: 0, fromHour: 15, toHour: 22 },
    area: { veedel: ['lindenthal', 'ehrenfeld'] },
    effects: { demand: 1.6, gangRaids: 1.5 },
    text: 'Der FC spielt zu Hause: viel Kundschaft rund ums Stadion, aber die Gangs sind auch unterwegs.',
    announce:
      'Morgen spielt der FC zu Hause. Ab drei ist Müngersdorf voll, und Ehrenfeld gleich mit. Pass auf deine Spots auf.',
  },
  {
    id: 'lichter',
    cityId: 'koeln',
    name: 'Kölner Lichter',
    icon: 'sparkles',
    schedule: { kind: 'cycle', firstDay: 60, everyDays: 90, days: 1 },
    area: { spots: RHINE_SPOTS },
    effects: { demand: 2.5, checks: 1.5 },
    text: 'Feuerwerk über dem Rhein: Am Ufer ist die Hölle los, aber auch die Polizei.',
    announce: 'Morgen sind Kölner Lichter. Am Rhein stehen die Leute dicht an dicht. Polizei auch.',
  },
  // --- Hamburg ---
  {
    id: 'hafengeburtstag',
    cityId: 'hamburg',
    name: 'Hafengeburtstag',
    icon: 'ship',
    schedule: { kind: 'cycle', firstDay: 50, everyDays: 90, days: 3 },
    area: { spots: HARBOR_SPOTS },
    effects: { demand: 2.5, checks: 1.5 },
    text: 'Drei Tage Schiffe, Bier und Menschenmassen an den Landungsbrücken, und überall Polizei.',
    announce: 'Moin. Ab morgen ist Hafengeburtstag, drei Tage. An den Landungsbrücken kommst du nicht mehr durch.',
  },
  {
    id: 'schlagermove',
    cityId: 'hamburg',
    name: 'Schlagermove',
    icon: 'music',
    schedule: { kind: 'cycle', firstDay: 75, everyDays: 90, days: 1 },
    area: { veedel: ['st-pauli'] },
    effects: { demand: 2 },
    text: 'Schlagermove: St. Pauli in Schlaghosen, doppelt so viel Kundschaft.',
    announce: 'Morgen ist Schlagermove. Ganz St. Pauli in Schlaghosen. Gutes Geschäft.',
  },
  {
    id: 'dom',
    cityId: 'hamburg',
    name: 'Hamburger Dom',
    icon: 'star',
    schedule: { kind: 'cycle', firstDay: 10, everyDays: 90, days: 28 },
    area: { veedel: ['st-pauli'] },
    effects: { demand: 1.4 },
    text: 'Vier Wochen Dom auf dem Heiligengeistfeld: Jeden Abend Leute, die noch was wollen.',
    announce: 'Ab morgen ist wieder Dom auf dem Heiligengeistfeld. Vier Wochen lang.',
  },
  // --- Berlin (Auftrag 37): die Nacht, dreimal im Jahr noch größer ---
  {
    id: 'fete',
    cityId: 'berlin',
    name: 'Fête de la Musique',
    icon: 'music',
    schedule: { kind: 'cycle', firstDay: 40, everyDays: 90, days: 1 },
    area: { veedel: BERLIN_PARTY },
    effects: { demand: 1.8, checks: 0.8 },
    text: 'Musik an jeder Ecke, von mittags bis in die Nacht: viel mehr Kundschaft in den Kiezen, die Polizei lässt laufen.',
    announce: 'Morgen ist Fête de la Musique. Auf jeder Straße eine Bühne, und alle sind draußen. Füll die Lager auf.',
  },
  {
    id: 'csd',
    cityId: 'berlin',
    name: 'CSD',
    icon: 'flag',
    schedule: { kind: 'cycle', firstDay: 55, everyDays: 90, days: 1 },
    area: { veedel: ['schoeneberg', 'mitte'] },
    effects: { demand: 2.2, checks: 0.6, noRaids: true },
    text: 'Der CSD zieht vom Kudamm zum Brandenburger Tor: eine halbe Million Leute, die feiern wollen, keine Razzien.',
    announce: 'Morgen ist CSD. Schöneberg und Mitte voll bis zum Rand, und danach geht es am Nolli weiter.',
  },
  {
    id: 'silvester',
    cityId: 'berlin',
    name: 'Silvester am Brandenburger Tor',
    icon: 'sparkles',
    schedule: { kind: 'cycle', firstDay: 85, everyDays: 90, days: 1 },
    area: { veedel: ['mitte', 'friedrichshain', 'kreuzberg'] },
    effects: { demand: 2.5, checks: 1.3, gangRaids: 1.5 },
    text: 'Silvester: Party am Tor, Böller in jedem Kiez. Riesiges Geschäft, aber auch Polizei und Gangs überall.',
    announce:
      'Morgen ist Silvester. Am Tor eine Million Leute, in Kreuzberg fliegen die Raketen. Pass auf deine Spots auf.',
  },
  // --- München (Auftrag 38) ---
  {
    id: 'oktoberfest',
    cityId: 'muenchen',
    name: 'Oktoberfest',
    icon: 'party',
    schedule: { kind: 'cycle', firstDay: 40, everyDays: 90, days: 16 },
    area: { spots: WIESN_SPOTS },
    effects: { demand: 3, heatPerSale: 1.3, checks: 2 },
    text: 'Zwei Wochen Wiesn: dreimal so viel Kundschaft rund um die Theresienwiese, aber überall Polizei.',
    announce:
      'Servus. Morgen ist Anstich, dann zwei Wochen Wiesn. Rund um die Theresienwiese ist die Hölle los, und die ' +
      'Polizei steht an jedem Eingang. Füll die Lager auf.',
  },
  {
    id: 'bayern',
    cityId: 'muenchen',
    name: 'FC-Bayern-Heimspiel',
    icon: 'flag',
    schedule: { kind: 'weekly', weekday: 5, everyWeeks: 2, offset: 1, fromHour: 14, toHour: 22 },
    area: { veedel: ['schwabing-freimann', 'milbertshofen'] },
    effects: { demand: 1.6, checks: 1.4, gangRaids: 1.3 },
    text: 'Heimspiel in der Arena: Die U6 ist voll, die Kundschaft auch, aber die Polizei fährt mit.',
    announce:
      'Morgen spielt der FC Bayern daheim. Ab zwei ist die U6 voll bis Fröttmaning, und die Polizei ist überall.',
  },
  // --- Frankfurt (Auftrag 39) ---
  {
    id: 'messe',
    cityId: 'frankfurt',
    name: 'Messe',
    icon: 'briefcase',
    schedule: { kind: 'cycle', firstDay: 20, everyDays: 30, days: 4 },
    area: { spots: MESSE_SPOTS, veedel: ['bahnhofsviertel'] },
    effects: { demand: 1.8, checks: 1.2 },
    text: 'Messe: Die Hotels sind voll, und die Gäste auf Spesen wollen abends noch was. Mehr Kundschaft rund um die Messe.',
    announce:
      'Ab morgen ist wieder Messe. Hotels ausgebucht, die Anzugträger wollen abends feiern. Westend und Bahnhof, Ware bereithalten.',
  },
  {
    id: 'museumsuferfest',
    cityId: 'frankfurt',
    name: 'Museumsuferfest',
    icon: 'party',
    schedule: { kind: 'cycle', firstDay: 45, everyDays: 90, days: 3 },
    area: { spots: MAIN_SPOTS },
    effects: { demand: 2.5, checks: 1.5 },
    text: 'Drei Tage Museumsuferfest: Am Main stehen die Leute dicht an dicht, die Polizei auch.',
    announce: 'Ab morgen ist Museumsuferfest. Drei Tage, das ganze Ufer voll. Polizei auch, sag ich nur.',
  },
  {
    id: 'eintracht',
    cityId: 'frankfurt',
    name: 'Eintracht-Heimspiel',
    icon: 'flag',
    schedule: { kind: 'weekly', weekday: 6, everyWeeks: 2, offset: 1, fromHour: 13, toHour: 21 },
    area: { veedel: ['niederrad', 'sachsenhausen-nord'] },
    effects: { demand: 1.6, gangRaids: 1.5 },
    text: 'Die Eintracht spielt zu Hause: Kundschaft rund um Stadion und Sachsenhausen, aber die Gangs sind auch unterwegs.',
    announce: 'Morgen spielt die Eintracht. Ab Mittag ist Niederrad dicht und Sachsenhausen gleich mit. Pass auf.',
  },
];

// ---------------------------------------------------------------------------------------------
// Marktereignisse (Auftrag 32): ohne Gebiet, wirken auf den Preisindex einer Ware in einer Stadt (market.priceIndex).
// Ausgewürfelt um Mitternacht in jeder freien Stadt; die Hälfte treibt die Preise (Chance für den Verkauf), die andere
// Hälfte drückt sie (Problem). Ein Satz pro Ereignis, {product} wird durch die Ware ersetzt.

export interface MarketEventDef {
  id: string;
  name: string;
  icon: string;
  /** Eine davon wird gewürfelt. */
  products: readonly string[];
  /** Faktor auf den Index (über 1 teurer). */
  factor: number;
  /** Ein Satz, was passiert. */
  text: string;
}

export const MARKET_EVENTS: readonly MarketEventDef[] = [
  // --- Preise steigen (Chance) ---
  {
    id: 'customsSeizure',
    name: 'Zollfund in Rotterdam',
    icon: 'ship',
    products: ['weed', 'hash'],
    factor: 1.12,
    text: 'Der Zoll hat in Rotterdam einen ganzen Container {product} gefunden. Die Ware wird knapp, die Preise ziehen an.',
  },
  {
    id: 'gangBust',
    name: 'Großrazzia bei einer Gang',
    icon: 'siren',
    products: ['weed', 'kush', 'haze'],
    factor: 1.1,
    text: 'Die Polizei hat eine Gang hochgenommen, deren {product} ist vom Markt. Wer jetzt liefern kann, verdient.',
  },
  {
    id: 'semester',
    name: 'Semesterstart',
    icon: 'users',
    products: ['weed', 'edibles'],
    factor: 1.08,
    text: 'Die Studis sind zurück und wollen {product}. Die Nachfrage treibt die Preise.',
  },
  // --- Preise fallen (Problem) ---
  {
    id: 'harvest',
    name: 'Gute Ernte in den Niederlanden',
    icon: 'leaf',
    products: ['haze', 'kush'],
    factor: 0.9,
    text: 'Gute Ernte in den Niederlanden: Überall gibt es {product}, die Preise fallen.',
  },
  {
    id: 'hashFlood',
    name: 'Schwemme aus Marokko',
    icon: 'boxes',
    products: ['hash'],
    factor: 0.9,
    text: 'Eine große Ladung {product} aus Marokko ist durchgekommen. Die Straße ist voll, die Preise sacken ab.',
  },
  {
    id: 'onlineShops',
    name: 'Billigware aus dem Netz',
    icon: 'phone',
    products: ['vape', 'oil', 'edibles'],
    factor: 0.92,
    text: 'Online-Shops verschicken {product} billig per Post. Die Kundschaft vergleicht Preise.',
  },
];

/** Chance pro Stadt und Tag, dass ein Marktereignis beginnt. */
export const MARKET_EVENT_CHANCE = 0.18;
/** Höchstens so viele gleichzeitig pro Stadt. */
export const MAX_MARKET_EVENTS = 2;
/** Dauer in Tagen [von, bis]. */
export const MARKET_EVENT_DAYS: readonly [number, number] = [2, 5];
