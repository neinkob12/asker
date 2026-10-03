// Die Hamburger Stadtteile im Spiel (Auftrag 30): Eigenschaften, Beschreibung und Verbindungen. Die Grenzen stehen in
// boundaries-hamburg.ts (aus Overture Maps / OpenStreetMap, siehe tools/fetch-divisions.py und build-boundaries.mjs).
//
// Werte: 1 = Kölner Durchschnitt. Hamburg ist reicher (Kaufkraft), die Polizei überall präsenter, die Gangs halten ihre
// Viertel fester. Die Beschreibungen sind Spieltexte, keine Aussagen über echte Menschen.

import type { Veedel } from './data';

export const VEEDEL_HAMBURG: readonly Veedel[] = [
  {
    id: 'st-pauli',
    cityId: 'hamburg',
    name: 'St. Pauli',
    district: 'Hamburg-Mitte',
    center: { lng: 9.9684, lat: 53.5546 },
    purchasingPower: 1.05,
    policePresence: 1.5,
    density: 1.6,
    nightlife: 2.0,
    description:
      'Reeperbahn, Hans-Albers-Platz, Landungsbrücken. Nachts das größte Geschäft der Stadt, dafür steht die ' +
      'Davidwache mittendrin, und an jeder Tür steht einer, der für jemanden arbeitet.',
    startInfluence: 85,
  },
  {
    id: 'sternschanze',
    cityId: 'hamburg',
    name: 'Sternschanze',
    district: 'Altona',
    center: { lng: 9.9657, lat: 53.5624 },
    purchasingPower: 1.15,
    policePresence: 1.35,
    density: 1.5,
    nightlife: 1.6,
    description:
      'Schulterblatt, Flora, Piazza. Studenten, Kreative und Touristen, die sich für eins von beidem halten. Die ' +
      'Szene ist vernetzt, und wer hier verkauft, wird gesehen.',
    startInfluence: 75,
  },
  {
    id: 'altona-altstadt',
    cityId: 'hamburg',
    name: 'Altona-Altstadt',
    district: 'Altona',
    center: { lng: 9.9465, lat: 53.5502 },
    purchasingPower: 1.1,
    policePresence: 1.25,
    density: 1.2,
    description:
      'Fischmarkt am Sonntagmorgen, dazwischen Altbau und Sozialbau. Wer nach der Nacht auf dem Kiez noch nicht ' +
      'genug hat, landet hier.',
    startInfluence: 75,
  },
  {
    id: 'ottensen',
    cityId: 'hamburg',
    name: 'Ottensen',
    district: 'Altona',
    center: { lng: 9.9222, lat: 53.5515 },
    purchasingPower: 1.35,
    policePresence: 1.2,
    density: 1.2,
    description:
      'Ottenser Hauptstraße, Bio-Läden, Werbeagenturen. Gut verdienende Kundschaft, die nicht mit dir gesehen werden ' +
      'will und trotzdem jede Woche anruft.',
    startInfluence: 70,
  },
  {
    id: 'st-georg',
    cityId: 'hamburg',
    name: 'St. Georg',
    district: 'Hamburg-Mitte',
    center: { lng: 10.0125, lat: 53.5567 },
    purchasingPower: 1.1,
    policePresence: 1.45,
    density: 1.3,
    nightlife: 1.3,
    description:
      'Hansaplatz und Lange Reihe, hinter dem Hauptbahnhof. Zwei Straßen, zwei Welten, und eine Waffenverbotszone, ' +
      'die die Zivis sehr ernst nehmen.',
    startInfluence: 80,
  },
  {
    id: 'hafencity',
    cityId: 'hamburg',
    name: 'HafenCity',
    district: 'Hamburg-Mitte',
    center: { lng: 10.005, lat: 53.5398 },
    purchasingPower: 1.5,
    policePresence: 1.3,
    density: 0.9,
    description:
      'Glas, Wasser, Elbphilharmonie. Wenig Laufkundschaft, aber Banker und Touristen, die nicht nach dem Preis fragen. ' +
      'Kameras an jeder Ecke.',
    startInfluence: 70,
  },
  {
    id: 'eimsbuettel',
    cityId: 'hamburg',
    name: 'Eimsbüttel',
    district: 'Eimsbüttel',
    center: { lng: 9.9561, lat: 53.5737 },
    purchasingPower: 1.3,
    policePresence: 1.2,
    density: 1.1,
    description:
      'Osterstraße und Altbauwohnungen. Familien, Studenten, junge Anwälte. Ruhige Kundschaft, regelmäßige Kundschaft.',
    startInfluence: 70,
  },
  {
    id: 'eppendorf',
    cityId: 'hamburg',
    name: 'Eppendorf',
    district: 'Hamburg-Nord',
    center: { lng: 9.983, lat: 53.5929 },
    purchasingPower: 1.45,
    policePresence: 1.25,
    density: 0.9,
    description:
      'Eppendorfer Baum und Isemarkt. Altes Geld, Ärzte vom UKE, Söhne mit Anwälten. Hier zahlt man mehr und redet ' +
      'weniger.',
    startInfluence: 75,
  },
  {
    id: 'barmbek-sued',
    cityId: 'hamburg',
    name: 'Barmbek-Süd',
    district: 'Hamburg-Nord',
    center: { lng: 10.0377, lat: 53.5781 },
    purchasingPower: 1.0,
    policePresence: 1.2,
    density: 1.0,
    description:
      'Fuhlsbüttler Straße, Backstein und Kanäle. Arbeiterviertel mit Museum. Kein Glamour, dafür ein Markt, um den ' +
      'sich wenige streiten.',
    startInfluence: 70,
  },
  {
    id: 'wilhelmsburg',
    cityId: 'hamburg',
    name: 'Wilhelmsburg',
    district: 'Hamburg-Mitte',
    center: { lng: 10.0038, lat: 53.4959 },
    purchasingPower: 0.9,
    policePresence: 1.25,
    density: 1.0,
    description:
      'Die Insel zwischen den Elbarmen, Stübenplatz und Reiherstieg. Container, Kanäle, viel Platz. Wer hier was ' +
      'lagert, hat den Hafen vor der Tür.',
    startInfluence: 80,
  },
  {
    id: 'harburg',
    cityId: 'hamburg',
    name: 'Harburg',
    district: 'Harburg',
    center: { lng: 9.9853, lat: 53.4613 },
    purchasingPower: 0.9,
    policePresence: 1.2,
    density: 1.0,
    description:
      'Südlich der Elbe, eine Stadt für sich. Rathausplatz, Sand, die Uni am Hang. Die Hafen-Truppe hat hier ihre ' +
      'Leute, und die sind nicht zimperlich.',
    startInfluence: 80,
  },
  {
    id: 'blankenese',
    cityId: 'hamburg',
    name: 'Blankenese',
    district: 'Altona',
    center: { lng: 9.7947, lat: 53.5632 },
    purchasingPower: 1.6,
    policePresence: 1.3,
    density: 0.6,
    description:
      'Treppenviertel und Villen an der Elbe. Kaum Laufkundschaft, dafür Kunden, die das Doppelte zahlen und eine ' +
      'Lieferung an die Haustür erwarten.',
    startInfluence: 85,
  },
];

/**
 * Verbindungen ohne gemeinsame Grenze im Spiel (die Nachbarstadtteile dazwischen gehören nicht zum Spiel): über die
 * Elbe, entlang der Elbchaussee und durch die Viertel, die im Spiel fehlen. So hängen alle Hamburger Stadtteile zusammen.
 */
export const LINKS_HAMBURG: readonly { a: string; b: string; why: string }[] = [
  { a: 'st-pauli', b: 'wilhelmsburg', why: 'Elbbrücken und Alter Elbtunnel' },
  { a: 'hafencity', b: 'wilhelmsburg', why: 'Elbbrücken' },
  { a: 'st-pauli', b: 'hafencity', why: 'Baumwall und Landungsbrücken' },
  { a: 'hafencity', b: 'st-georg', why: 'über die Altstadt und den Hauptbahnhof' },
  { a: 'st-georg', b: 'barmbek-sued', why: 'über Uhlenhorst' },
  { a: 'eimsbuettel', b: 'eppendorf', why: 'über Hoheluft' },
  { a: 'eppendorf', b: 'barmbek-sued', why: 'über Winterhude' },
  { a: 'ottensen', b: 'blankenese', why: 'entlang der Elbchaussee' },
  { a: 'st-pauli', b: 'st-georg', why: 'über die Innenstadt' },
];
