// Die Münchner Stadtbezirke im Spiel (Auftrag 38): Eigenschaften, Beschreibung und Verbindungen. Die Grenzen stehen in
// boundaries-muenchen.ts (aus Overture Maps / OpenStreetMap, siehe tools/fetch-divisions.py und build-boundaries.mjs).
//
// Werte: 1 = Kölner Durchschnitt. München ist teuer und streng: die höchste Kaufkraft im Spiel, die Polizei überall
// präsenter als in Köln und Hamburg, die Gangs halten ihre Viertel fest. Die Beschreibungen sind Spieltexte, keine
// Aussagen über echte Menschen.

import type { Veedel } from './data';

export const VEEDEL_MUENCHEN: readonly Veedel[] = [
  {
    id: 'altstadt-lehel',
    cityId: 'muenchen',
    name: 'Altstadt-Lehel',
    district: 'Altstadt-Lehel',
    center: { lng: 11.5755, lat: 48.1385 },
    purchasingPower: 1.7,
    policePresence: 1.8,
    density: 1.4,
    nightlife: 1.2,
    description:
      'Marienplatz, Viktualienmarkt, Maximilianstraße. Touristen tagsüber, Geld rund um die Uhr, und an jeder Ecke ' +
      'eine Streife, die genau weiß, wer hier nicht hingehört.',
    startInfluence: 85,
  },
  {
    id: 'isarvorstadt',
    cityId: 'muenchen',
    name: 'Isarvorstadt',
    district: 'Ludwigsvorstadt-Isarvorstadt',
    center: { lng: 11.5665, lat: 48.1307 },
    purchasingPower: 1.45,
    policePresence: 1.6,
    density: 1.5,
    nightlife: 1.7,
    description:
      'Hauptbahnhof, Glockenbachviertel, Gärtnerplatz und die Theresienwiese. Nachts das meiste Geschäft der Stadt, ' +
      'und zum Oktoberfest steht hier halb Bayern.',
    startInfluence: 80,
  },
  {
    id: 'maxvorstadt',
    cityId: 'muenchen',
    name: 'Maxvorstadt',
    district: 'Maxvorstadt',
    center: { lng: 11.5653, lat: 48.1486 },
    purchasingPower: 1.4,
    policePresence: 1.45,
    density: 1.4,
    nightlife: 1.2,
    description:
      'Uni, Pinakotheken, Königsplatz. Studenten mit Eltern, die zahlen, und Kunstsammler, die nach der Vernissage ' +
      'noch etwas suchen.',
    startInfluence: 75,
  },
  {
    id: 'schwabing-west',
    cityId: 'muenchen',
    name: 'Schwabing-West',
    district: 'Schwabing-West',
    center: { lng: 11.5662, lat: 48.1663 },
    purchasingPower: 1.65,
    policePresence: 1.35,
    density: 1.2,
    description:
      'Altbau, Hohenzollernplatz, Elisabethmarkt. Wer hier wohnt, hat geerbt oder eine Agentur. Leise Kundschaft, ' +
      'die bar zahlt und nichts weitererzählt.',
    startInfluence: 75,
  },
  {
    id: 'au-haidhausen',
    cityId: 'muenchen',
    name: 'Au-Haidhausen',
    district: 'Au-Haidhausen',
    center: { lng: 11.5983, lat: 48.1303 },
    purchasingPower: 1.55,
    policePresence: 1.35,
    density: 1.3,
    nightlife: 1.3,
    description:
      'Franzosenviertel, Wiener Platz, Ostbahnhof. Kneipen, Clubs am Werksviertel und Leute, die gern ausgehen und ' +
      'ungern früh nach Hause.',
    startInfluence: 75,
  },
  {
    id: 'sendling',
    cityId: 'muenchen',
    name: 'Sendling',
    district: 'Sendling',
    center: { lng: 11.5484, lat: 48.1159 },
    purchasingPower: 1.25,
    policePresence: 1.3,
    density: 1.1,
    description:
      'Harras, Großmarkthalle, Flaucher. Ein Viertel zum Arbeiten, mit Lieferwagen um vier Uhr morgens, in denen ' +
      'nicht nur Salat liegt.',
    startInfluence: 80,
  },
  {
    id: 'schwanthalerhoehe',
    cityId: 'muenchen',
    name: 'Westend',
    district: 'Schwanthalerhöhe',
    center: { lng: 11.538, lat: 48.1346 },
    purchasingPower: 1.15,
    policePresence: 1.4,
    density: 1.3,
    description:
      'Schwanthalerhöhe, das Westend. Hinter der Theresienwiese, eng, bunt und billiger als der Rest. Hier wohnen ' +
      'die, die drüben auf der Wiesn die Krüge tragen.',
    startInfluence: 80,
  },
  {
    id: 'neuhausen',
    cityId: 'muenchen',
    name: 'Neuhausen',
    district: 'Neuhausen-Nymphenburg',
    center: { lng: 11.5245, lat: 48.1555 },
    purchasingPower: 1.6,
    policePresence: 1.3,
    density: 1.0,
    description:
      'Rotkreuzplatz, Schloss Nymphenburg, Hirschgarten. Familien mit zwei Autos und Söhne, die am Wochenende im ' +
      'Biergarten mehr wollen als eine Maß.',
    startInfluence: 75,
  },
  {
    id: 'schwabing-freimann',
    cityId: 'muenchen',
    name: 'Schwabing-Freimann',
    district: 'Schwabing-Freimann',
    center: { lng: 11.6005, lat: 48.1702 },
    purchasingPower: 1.5,
    policePresence: 1.4,
    density: 1.1,
    nightlife: 1.2,
    description:
      'Münchner Freiheit, Englischer Garten, und ganz im Norden die Arena. An Spieltagen zieht halb München die ' +
      'U6 hoch, und die Polizei fährt mit.',
    startInfluence: 75,
  },
  {
    id: 'giesing',
    cityId: 'muenchen',
    name: 'Giesing',
    district: 'Obergiesing-Fasangarten',
    center: { lng: 11.5907, lat: 48.1092 },
    purchasingPower: 1.1,
    policePresence: 1.3,
    density: 1.2,
    description:
      'Tegernseer Landstraße, das Sechzger, Wettbüros. Das Giesing der kleinen Leute, stolz und laut, und die ' +
      'Jungs hier verteidigen jede Ecke.',
    startInfluence: 85,
  },
  {
    id: 'bogenhausen',
    cityId: 'muenchen',
    name: 'Bogenhausen',
    district: 'Bogenhausen',
    center: { lng: 11.6135, lat: 48.1495 },
    purchasingPower: 1.9,
    policePresence: 1.5,
    density: 0.7,
    description:
      'Villen an der Isar, Prinzregentenstraße, Arabellapark. Die reichste Kundschaft der Stadt, die nie selbst ' +
      'kommt und eine Lieferung an die Haustür erwartet.',
    startInfluence: 85,
  },
  {
    id: 'milbertshofen',
    cityId: 'muenchen',
    name: 'Milbertshofen',
    district: 'Milbertshofen-Am Hart',
    center: { lng: 11.5713, lat: 48.1875 },
    purchasingPower: 1.05,
    policePresence: 1.25,
    density: 1.1,
    description:
      'Olympiapark, BMW-Werk und die Hochhäuser am Hart. Schichtarbeiter, Studenten im Olympiadorf und eine Gang, ' +
      'die den Norden seit Jahren für sich hat.',
    startInfluence: 85,
  },
];

/**
 * Verbindungen ohne gemeinsame Grenze im Spiel (die Viertel dazwischen gehören nicht zum Spiel): über die Isar und durch
 * Untergiesing, Thalkirchen und den Englischen Garten. So hängen alle Münchner Stadtbezirke zusammen.
 */
export const LINKS_MUENCHEN: readonly { a: string; b: string; why: string }[] = [
  { a: 'giesing', b: 'sendling', why: 'über die Isar bei Thalkirchen' },
  { a: 'giesing', b: 'isarvorstadt', why: 'über die Reichenbachbrücke und Untergiesing' },
];
