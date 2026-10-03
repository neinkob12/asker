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

/** Spots an den Landungsbrücken und am Hafenrand (Hafengeburtstag). */
export const HARBOR_SPOTS: readonly string[] = ['landungsbruecken', 'fischmarkt'];

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
];
