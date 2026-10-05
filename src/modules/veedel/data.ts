// Die Kölner Veedel (Stadtteile), um die gespielt wird: Eigenschaften, Beschreibung und Verbindungen.
// Die Grenzen stehen in boundaries.ts (erzeugt aus den amtlichen Stadtteilgrenzen, siehe tools/build-boundaries.mjs).
//
// Werte: 1 = Kölner Durchschnitt. Die Beschreibungen sind Spieltexte, keine Aussagen über echte Menschen.

export interface Veedel {
  id: string;
  /** Stadt, zu der das Veedel gehört (Auftrag 30: 'koeln', 'hamburg'; Auftrag 37: 'berlin'). */
  cityId: string;
  name: string;
  /** Stadtbezirk, zu dem das Veedel gehört. */
  district: string;
  /** Punkt im Veedel für Beschriftung und Kamera (liegt sicher innerhalb der Grenze). */
  center: { lng: number; lat: number };
  /** Kaufkraft, 1 = Kölner Durchschnitt. Wirkt auf den Richtpreis (market). */
  purchasingPower: number;
  /** Polizeipräsenz, 1 = Durchschnitt. Mehr Präsenz: Heat steigt schneller, Kontrollen und Razzien kommen öfter. */
  policePresence: number;
  /** Nachfrage bzw. Dichte, 1 = Durchschnitt. */
  density: number;
  /** Kurzer Text im düsteren Ton. */
  description: string;
  /** Einfluss der Gang, der das Veedel zu Spielbeginn gehört: wie fest sie es im Griff hat (über der Kontrollschwelle). */
  startInfluence: number;
  /**
   * Nachtleben (Auftrag 30), 1 = normal: Nachfrage zwischen 22 und 4 Uhr mal diesem Wert (Freitag und Samstag noch
   * einmal mehr), Kontrollen nachts ebenso. Fehlt = 1.
   */
  nightlife?: number;
}

export const VEEDEL: readonly Veedel[] = [
  {
    id: 'altstadt-nord',
    cityId: 'koeln',
    name: 'Altstadt-Nord',
    district: 'Innenstadt',
    center: { lng: 6.9555, lat: 50.9395 },
    purchasingPower: 1.15,
    policePresence: 1.6,
    density: 1.4,
    description:
      'Dom, Hauptbahnhof, Breslauer Platz. Tagsüber Touristenströme, nachts Leute ohne Ziel und Kundschaft auf der ' +
      'Durchreise. Die Wache am Dom sieht fast alles.',
    startInfluence: 70,
  },
  {
    id: 'altstadt-sued',
    cityId: 'koeln',
    name: 'Altstadt-Süd',
    district: 'Innenstadt',
    center: { lng: 6.952, lat: 50.9325 },
    purchasingPower: 1.1,
    policePresence: 1.3,
    density: 1.3,
    description:
      'Neumarkt und Heumarkt, dahinter das Severinsviertel. An der U-Bahn-Treppe am Neumarkt kennt jeder jeden, ' +
      'und die Zivis kennen alle.',
    startInfluence: 65,
  },
  {
    id: 'neustadt-nord',
    cityId: 'koeln',
    name: 'Neustadt-Nord',
    district: 'Innenstadt',
    center: { lng: 6.944, lat: 50.9475 },
    purchasingPower: 1.15,
    policePresence: 1.2,
    density: 1.3,
    description:
      'Belgisches Viertel und Ebertplatz, ein paar hundert Meter auseinander. Oben Galerien und Flat White, unten in ' +
      'der Betonpassage das harte Geschäft.',
    startInfluence: 65,
  },
  {
    id: 'neustadt-sued',
    cityId: 'koeln',
    name: 'Neustadt-Süd',
    district: 'Innenstadt',
    center: { lng: 6.935, lat: 50.933 },
    purchasingPower: 1.05,
    policePresence: 1.1,
    density: 1.5,
    description:
      'Kwartier Latäng, Zülpicher, Ringe. Studenten, Kneipen, Nachfrage ohne Ende. Freitags steht die Wanne an der ' +
      'Zülpicher Straße, samstags auch.',
    startInfluence: 60,
    nightlife: 1.4,
  },
  {
    id: 'deutz',
    cityId: 'koeln',
    name: 'Deutz',
    district: 'Innenstadt',
    center: { lng: 6.9765, lat: 50.9385 },
    purchasingPower: 1,
    policePresence: 1,
    density: 0.9,
    description:
      'Messe, Arena, Rheinboulevard. Tagsüber Anzüge, abends Konzertpublikum, nachts leere Uferwege mit Blick auf ' +
      'den Dom.',
    startInfluence: 60,
  },
  {
    id: 'ehrenfeld',
    cityId: 'koeln',
    name: 'Ehrenfeld',
    district: 'Ehrenfeld',
    center: { lng: 6.909, lat: 50.9504 },
    purchasingPower: 0.95,
    policePresence: 0.9,
    density: 1.3,
    description:
      'Venloer Straße, Clubs unterm Bahndamm, Kioske bis in den Morgen. Szeneviertel mit kurzen Wegen, langen ' +
      'Nächten und alten Rechnungen.',
    startInfluence: 75,
  },
  {
    id: 'lindenthal',
    cityId: 'koeln',
    name: 'Lindenthal',
    district: 'Lindenthal',
    center: { lng: 6.92, lat: 50.926 },
    purchasingPower: 1.35,
    policePresence: 0.7,
    density: 0.8,
    description:
      'Villen am Stadtwald, Uni-Wiese, Zahnarztkinder. Hier zahlt man gut und redet wenig, aber wer auffällt, hat ' +
      'schnell eine Streife vor der Tür.',
    startInfluence: 55,
  },
  {
    id: 'suelz',
    cityId: 'koeln',
    name: 'Sülz',
    district: 'Lindenthal',
    center: { lng: 6.918, lat: 50.9175 },
    purchasingPower: 1.2,
    policePresence: 0.8,
    density: 1,
    description:
      'Altbau, Lastenräder, Bioläden. Die Kundschaft ist zahlungskräftig, diskret und will Qualität. Ärger will hier ' +
      'keiner, auch nicht die Polizei.',
    startInfluence: 55,
  },
  {
    id: 'nippes',
    cityId: 'koeln',
    name: 'Nippes',
    district: 'Nippes',
    center: { lng: 6.9535, lat: 50.9655 },
    purchasingPower: 0.95,
    policePresence: 0.9,
    density: 1.1,
    description:
      'Neusser Straße, Wochenmarkt, Eckkneipen. Ein echtes Veedel, in dem jeder jeden kennt, auch die Jungs, die ' +
      'hier seit Jahren das Sagen haben.',
    startInfluence: 75,
  },
  {
    id: 'kalk',
    cityId: 'koeln',
    name: 'Kalk',
    district: 'Kalk',
    center: { lng: 7.0035, lat: 50.9385 },
    purchasingPower: 0.8,
    policePresence: 1.3,
    density: 1.2,
    description:
      'Kalker Hauptstraße, Kalk-Post, leere Fabrikhallen. Das Polizeipräsidium liegt um die Ecke, trotzdem regieren ' +
      'hier seit Jahren andere.',
    startInfluence: 85,
  },
  {
    id: 'muelheim',
    cityId: 'koeln',
    name: 'Mülheim',
    district: 'Mülheim',
    center: { lng: 7.0085, lat: 50.9635 },
    purchasingPower: 0.8,
    policePresence: 1.2,
    density: 1.2,
    description:
      'Wiener Platz, Keupstraße, Hafen. Rau, laut und unübersichtlich. Am Wiener Platz stehen die Zivis manchmal ' +
      'öfter als die Kundschaft.',
    startInfluence: 80,
  },
  {
    id: 'bayenthal',
    cityId: 'koeln',
    name: 'Bayenthal',
    district: 'Rodenkirchen',
    center: { lng: 6.9655, lat: 50.9115 },
    purchasingPower: 1.25,
    policePresence: 0.7,
    density: 0.7,
    description:
      'Ruhiges Wohnviertel am Rhein zwischen Südstadt und Marienburg. Wenig Laufkundschaft, aber wer hier kauft, ' +
      'fragt nicht nach dem Preis.',
    startInfluence: 55,
  },
];

/**
 * Verbindungen zwischen Veedeln ohne gemeinsame Grenze. Die Stadtteile dazwischen sind (noch) nicht im Spiel,
 * ohne diese Wege wären Nippes, Kalk und Mülheim Sackgassen. Zählen für neighborsOf() als Nachbarn.
 */
export const LINKS: readonly { a: string; b: string; via: string }[] = [
  { a: 'nippes', b: 'muelheim', via: 'Mülheimer Brücke (über Riehl)' },
  { a: 'kalk', b: 'muelheim', via: 'über Buchforst' },
  { a: 'ehrenfeld', b: 'nippes', via: 'über Neuehrenfeld' },
  { a: 'suelz', b: 'bayenthal', via: 'über Zollstock und Raderberg' },
];
