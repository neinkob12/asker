// Die Berliner Ortsteile im Spiel (Auftrag 37): Eigenschaften, Beschreibung und Verbindungen. Die Grenzen stehen in
// boundaries-berlin.ts (aus Overture Maps / OpenStreetMap, siehe tools/fetch-divisions.py und build-boundaries.mjs).
//
// Werte: 1 = Kölner Durchschnitt. Berlin ist die Nacht: viel Nachtleben und Andrang, die Polizei eher locker, die
// Kaufkraft gemischt, und die Gangs halten ihre Kieze fest. Die Beschreibungen sind Spieltexte, keine Aussagen über
// echte Menschen.

import type { Veedel } from './data';

export const VEEDEL_BERLIN: readonly Veedel[] = [
  {
    id: 'mitte',
    cityId: 'berlin',
    name: 'Mitte',
    district: 'Mitte',
    center: { lng: 13.3979, lat: 52.5213 },
    purchasingPower: 1.3,
    policePresence: 1.15,
    density: 1.5,
    nightlife: 1.6,
    description:
      'Alexanderplatz, Hackescher Markt, Torstraße. Touristen am Tag, Start-ups am Abend, und nachts alle, die noch ' +
      'nicht nach Hause wollen. Am Alex steht die Wache, sonst schaut man hier lieber aufs Handy.',
    startInfluence: 85,
  },
  {
    id: 'kreuzberg',
    cityId: 'berlin',
    name: 'Kreuzberg',
    district: 'Friedrichshain-Kreuzberg',
    center: { lng: 13.4052, lat: 52.4968 },
    purchasingPower: 1.05,
    policePresence: 1.05,
    density: 1.6,
    nightlife: 2.0,
    description:
      'Kotti, Görli, Schlesisches Tor. Rund um die Uhr wach, jede Ecke vergeben. Wer hier verkaufen will, fragt vorher ' +
      'jemanden, und der fragt wieder jemanden.',
    startInfluence: 90,
  },
  {
    id: 'friedrichshain',
    cityId: 'berlin',
    name: 'Friedrichshain',
    district: 'Friedrichshain-Kreuzberg',
    center: { lng: 13.4524, lat: 52.5112 },
    purchasingPower: 1.05,
    policePresence: 0.9,
    density: 1.5,
    nightlife: 2.2,
    description:
      'Warschauer Straße, RAW-Gelände, Boxi. Von Freitagabend bis Montagfrüh ist die Schlange vor den Clubs länger als ' +
      'die Straße. An jeder Tür steht einer, der für jemanden arbeitet.',
    startInfluence: 90,
  },
  {
    id: 'neukoelln',
    cityId: 'berlin',
    name: 'Neukölln',
    district: 'Neukölln',
    center: { lng: 13.4414, lat: 52.4751 },
    purchasingPower: 0.85,
    policePresence: 1.0,
    density: 1.5,
    nightlife: 1.7,
    description:
      'Hermannplatz, Weserstraße, Sonnenallee. Bars im Hinterhof, Spätis an jeder Ecke, Familien, die seit drei ' +
      'Generationen wissen, wem welche Straße gehört.',
    startInfluence: 90,
  },
  {
    id: 'prenzlauer-berg',
    cityId: 'berlin',
    name: 'Prenzlauer Berg',
    district: 'Pankow',
    center: { lng: 13.4305, lat: 52.5398 },
    purchasingPower: 1.4,
    policePresence: 0.85,
    density: 1.1,
    nightlife: 1.2,
    description:
      'Kollwitzplatz, Mauerpark, Kastanienallee. Altbau, Kinderwagen und Eltern, die am Wochenende doch noch mal ' +
      'ausgehen. Gut bezahlt, ruhig, regelmäßig.',
    startInfluence: 80,
  },
  {
    id: 'wedding',
    cityId: 'berlin',
    name: 'Wedding',
    district: 'Mitte',
    center: { lng: 13.3416, lat: 52.5509 },
    purchasingPower: 0.8,
    policePresence: 1.0,
    density: 1.3,
    nightlife: 1.1,
    description:
      'Leopoldplatz, Müllerstraße, Rehberge. Seit Jahren „kommt“ der Wedding, und solange er kommt, gehört er den ' +
      'Jungs vom Leo. Billig und laut.',
    startInfluence: 85,
  },
  {
    id: 'moabit',
    cityId: 'berlin',
    name: 'Moabit',
    district: 'Mitte',
    center: { lng: 13.3433, lat: 52.5294 },
    purchasingPower: 0.9,
    policePresence: 1.1,
    density: 1.1,
    description:
      'Turmstraße, Hauptbahnhof, Kriminalgericht. Eine Insel zwischen Spree und Kanälen. Wer hier ankommt, braucht ' +
      'etwas, und wer vor Gericht muss, auch.',
    startInfluence: 80,
  },
  {
    id: 'schoeneberg',
    cityId: 'berlin',
    name: 'Schöneberg',
    district: 'Tempelhof-Schöneberg',
    center: { lng: 13.3544, lat: 52.4802 },
    purchasingPower: 1.2,
    policePresence: 0.9,
    density: 1.2,
    nightlife: 1.5,
    description:
      'Nollendorfplatz, Winterfeldtmarkt, Akazienkiez. Bunte Nächte rund um den Nolli, samstags Markt. Die Kundschaft ' +
      'zahlt gut und will vor allem eins: dass es diskret bleibt.',
    startInfluence: 80,
  },
  {
    id: 'charlottenburg',
    cityId: 'berlin',
    name: 'Charlottenburg',
    district: 'Charlottenburg-Wilmersdorf',
    center: { lng: 13.3072, lat: 52.5143 },
    purchasingPower: 1.5,
    policePresence: 1.05,
    density: 1.0,
    description:
      'Kudamm, Savignyplatz, Schloss. Der alte Westen: Pelz, Pinot und Söhne, die sich langweilen. Wenige Kunden, aber ' +
      'die zahlen das Doppelte und wollen es nach Hause gebracht.',
    startInfluence: 85,
  },
  {
    id: 'alt-treptow',
    cityId: 'berlin',
    name: 'Alt-Treptow',
    district: 'Treptow-Köpenick',
    center: { lng: 13.462, lat: 52.4915 },
    purchasingPower: 0.95,
    policePresence: 0.8,
    density: 1.0,
    nightlife: 1.8,
    description:
      'Treptower Park, Spreeufer, alte Hallen. Tagsüber Hunde und Jogger, nachts Open Airs und Clubs in Hallen, in ' +
      'denen früher Busse standen. Kaum Streife.',
    startInfluence: 80,
  },
  {
    id: 'lichtenberg',
    cityId: 'berlin',
    name: 'Lichtenberg',
    district: 'Lichtenberg',
    center: { lng: 13.497, lat: 52.5216 },
    purchasingPower: 0.8,
    policePresence: 0.85,
    density: 1.0,
    description:
      'Platte, Bahnhof Lichtenberg, Weitlingkiez. Weit draußen für Leute aus Mitte, und genau deshalb ein guter Ort für ' +
      'ein Lager. Die Gang aus dem Osten hat hier ihre Werkstätten.',
    startInfluence: 85,
  },
  {
    id: 'tempelhof',
    cityId: 'berlin',
    name: 'Tempelhof',
    district: 'Tempelhof-Schöneberg',
    center: { lng: 13.3907, lat: 52.4665 },
    purchasingPower: 1.0,
    policePresence: 0.95,
    density: 1.0,
    description:
      'Das Feld, der alte Flughafen, Tempelhofer Damm. Im Sommer grillt halb Berlin auf der Startbahn, im Winter ist ' +
      'es ein ruhiger Bezirk mit Reihenhäusern.',
    startInfluence: 80,
  },
];

/**
 * Verbindungen ohne gemeinsame Grenze im Spiel (die Ortsteile dazwischen gehören nicht zum Spiel): durch den
 * Tiergarten, über Gesundbrunnen und über die Rummelsburger Bucht. So hängen alle Berliner Ortsteile zusammen.
 */
export const LINKS_BERLIN: readonly { a: string; b: string; why: string }[] = [
  { a: 'charlottenburg', b: 'mitte', why: 'durch den Tiergarten' },
  { a: 'schoeneberg', b: 'mitte', why: 'über den Potsdamer Platz' },
  { a: 'wedding', b: 'prenzlauer-berg', why: 'über Gesundbrunnen' },
  { a: 'lichtenberg', b: 'alt-treptow', why: 'über die Rummelsburger Bucht' },
];
