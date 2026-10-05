// Die Frankfurter Stadtteile im Spiel (Auftrag 39): Eigenschaften, Beschreibung und Verbindungen. Die Grenzen stehen in
// boundaries-frankfurt.ts (aus Overture Maps / OpenStreetMap, siehe tools/fetch-divisions.py und build-boundaries.mjs).
//
// Werte: 1 = Kölner Durchschnitt. Frankfurt hat Geld: Banker im Westend, Messe und Flughafen, die Kaufkraft liegt fast
// überall über Köln. Das Bahnhofsviertel ist der Brennpunkt: die meiste Nachfrage der Stadt und die meiste Polizei.
// Die Beschreibungen sind Spieltexte, keine Aussagen über echte Menschen.

import type { Veedel } from './data';

export const VEEDEL_FRANKFURT: readonly Veedel[] = [
  {
    id: 'bahnhofsviertel',
    cityId: 'frankfurt',
    name: 'Bahnhofsviertel',
    district: 'Innenstadt I',
    center: { lng: 8.6675, lat: 50.1085 },
    purchasingPower: 1.1,
    policePresence: 1.9,
    density: 2.0,
    nightlife: 1.8,
    description:
      'Kaiserstraße, Taunusstraße, Münchener Straße. Zwischen Hauptbahnhof und Bankentürmen wird rund um die Uhr ' +
      'gekauft und verkauft. Die meiste Kundschaft der Stadt, und an jeder Ecke steht eine Streife.',
    startInfluence: 90,
  },
  {
    id: 'innenstadt',
    cityId: 'frankfurt',
    name: 'Innenstadt',
    district: 'Innenstadt I',
    center: { lng: 8.679, lat: 50.1135 },
    purchasingPower: 1.3,
    policePresence: 1.6,
    density: 1.6,
    nightlife: 1.2,
    description:
      'Zeil, Hauptwache, Römer. Tagsüber Einkaufstüten und Reisegruppen, abends die Konstablerwache. Wer hier ' +
      'verkauft, steht im Schaufenster.',
    startInfluence: 75,
  },
  {
    id: 'westend-sued',
    cityId: 'frankfurt',
    name: 'Westend-Süd',
    district: 'Innenstadt II',
    center: { lng: 8.661, lat: 50.12 },
    purchasingPower: 1.9,
    policePresence: 1.2,
    density: 0.9,
    nightlife: 0.8,
    description:
      'Altbauvillen, Kanzleien, die Messe am Rand. Hier wohnen die Banker, und die zahlen jeden Preis, solange keiner ' +
      'davon erfährt. Laufkundschaft gibt es kaum, Lieferungen umso mehr.',
    startInfluence: 80,
  },
  {
    id: 'sachsenhausen-nord',
    cityId: 'frankfurt',
    name: 'Sachsenhausen-Nord',
    district: 'Süd',
    center: { lng: 8.684, lat: 50.0995 },
    purchasingPower: 1.25,
    policePresence: 1.25,
    density: 1.3,
    nightlife: 1.6,
    description:
      'Museumsufer und Alt-Sachsenhausen. Apfelwein in Bembeln, Junggesellenabschiede in der Kneipengasse. Die Wirte ' +
      'wissen, wer was verkauft, und nehmen ihren Teil.',
    startInfluence: 75,
  },
  {
    id: 'nordend-west',
    cityId: 'frankfurt',
    name: 'Nordend-West',
    district: 'Innenstadt III',
    center: { lng: 8.6815, lat: 50.127 },
    purchasingPower: 1.4,
    policePresence: 1.0,
    density: 1.1,
    description:
      'Oeder Weg und Holzhausenpark. Altbau, Lastenräder, Leute mit gutem Gehalt und Wochenende. Ruhig, und ' +
      'genau deshalb fällt hier jeder Fremde auf.',
    startInfluence: 70,
  },
  {
    id: 'bornheim',
    cityId: 'frankfurt',
    name: 'Bornheim',
    district: 'Nord-Ost',
    center: { lng: 8.711, lat: 50.1295 },
    purchasingPower: 1.2,
    policePresence: 0.95,
    density: 1.15,
    nightlife: 1.2,
    description:
      'Die Berger Straße, das lustige Dorf. Kneipen, Wochenmarkt, Stammkunden. Wer hier einmal bekannt ist, muss ' +
      'nicht mehr suchen.',
    startInfluence: 70,
  },
  {
    id: 'ostend',
    cityId: 'frankfurt',
    name: 'Ostend',
    district: 'Innenstadt III',
    center: { lng: 8.712, lat: 50.114 },
    purchasingPower: 1.3,
    policePresence: 1.15,
    density: 1.1,
    nightlife: 1.4,
    description:
      'Die Zentralbank, der Osthafen, Clubs an der Hanauer Landstraße. Neubau neben alten Hallen, und nachts ' +
      'feiert hier die halbe Stadt.',
    startInfluence: 75,
  },
  {
    id: 'gallus',
    cityId: 'frankfurt',
    name: 'Gallus',
    district: 'Innenstadt II',
    center: { lng: 8.648, lat: 50.1035 },
    purchasingPower: 0.95,
    policePresence: 1.2,
    density: 1.2,
    description:
      'Galluswarte und Europaviertel. Alte Arbeiterblocks auf der einen Seite der Gleise, Glas und Beton auf der ' +
      'anderen. Rau, eng, und die Gangs aus dem Bahnhofsviertel kommen gern rüber.',
    startInfluence: 80,
  },
  {
    id: 'bockenheim',
    cityId: 'frankfurt',
    name: 'Bockenheim',
    district: 'West',
    center: { lng: 8.6385, lat: 50.12 },
    purchasingPower: 1.05,
    policePresence: 1.05,
    density: 1.3,
    description:
      'Leipziger Straße und Kurfürstenplatz. Studenten, Kioske, alte Kneipen. Viel Kundschaft mit wenig Geld, die ' +
      'jede Woche wiederkommt.',
    startInfluence: 70,
  },
  {
    id: 'hoechst',
    cityId: 'frankfurt',
    name: 'Höchst',
    district: 'West',
    center: { lng: 8.543, lat: 50.1005 },
    purchasingPower: 0.85,
    policePresence: 1.0,
    density: 1.0,
    description:
      'Schlossplatz, Altstadt und dahinter der Industriepark. Eine Stadt für sich am Westrand. Die Farbwerker haben ' +
      'hier ihre Leute, und die mögen keine Fremden.',
    startInfluence: 85,
  },
  {
    id: 'niederrad',
    cityId: 'frankfurt',
    name: 'Niederrad',
    district: 'Süd',
    center: { lng: 8.635, lat: 50.083 },
    purchasingPower: 1.15,
    policePresence: 0.9,
    density: 0.8,
    description:
      'Bürostadt und Rennbahn. Tagsüber Anzüge in der Mittagspause, abends leere Parkplätze. Wenig los, aber auch ' +
      'wenig Polizei.',
    startInfluence: 75,
  },
  {
    id: 'flughafen',
    cityId: 'frankfurt',
    name: 'Flughafen',
    district: 'Süd',
    center: { lng: 8.571, lat: 50.049 },
    purchasingPower: 1.5,
    policePresence: 1.8,
    density: 0.9,
    description:
      'Terminals, Fernbahnhof, Cargo City. Reisende mit Geld und Zeit, Crews nach der Landung. Bundespolizei und Zoll ' +
      'überall, und trotzdem kommt hier mehr durch als irgendwo sonst.',
    startInfluence: 90,
  },
];

/**
 * Verbindungen ohne gemeinsame Grenze im Spiel (die Stadtteile dazwischen gehören nicht zum Spiel): über die
 * Mainbrücken und die großen Ausfallstraßen. So hängen alle Frankfurter Stadtteile zusammen.
 */
export const LINKS_FRANKFURT: readonly { a: string; b: string; why: string }[] = [
  { a: 'hoechst', b: 'gallus', why: 'über die Mainzer Landstraße' },
  { a: 'hoechst', b: 'bockenheim', why: 'über Rödelheim' },
  { a: 'hoechst', b: 'flughafen', why: 'über Schwanheim' },
  { a: 'flughafen', b: 'niederrad', why: 'über die B43 am Stadion' },
  { a: 'niederrad', b: 'gallus', why: 'über die Niederräder Brücke' },
];
