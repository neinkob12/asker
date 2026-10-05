// Die Gangs, die die Städte zu Beginn unter sich aufgeteilt haben: vier in Köln, seit Auftrag 30 vier in Hamburg
// (Präfix hh-, etwa ein Viertel stärker: Kampfkraft, Geld, Leute), seit Auftrag 37 vier in Berlin (Präfix be-, noch
// einmal stärker und mit mehr Leuten), seit Auftrag 38 vier in München (Präfix mu-, reicher und besser vernetzt). Alle
// frei erfunden, keine echten Gruppen.
// IDs und Heimat-Veedel bleiben stabil (territory verteilt danach die Veedel, andere Module nutzen die IDs).

export interface GangTraits {
  /** Wie schnell Feindseligkeit in Gewalt umschlägt (1 = normal). */
  aggression: number;
  /** Expansionsdrang (1 = normal). */
  expansion: number;
  /** Kampfkraft ihrer Leute in Konfrontationen (0–100, wie ein Mitarbeiter-Wert). */
  fighting: number;
  /** Vernetzung 0–1: schützt vor Razzien, und sie erfahren eher, wer gepetzt hat. */
  network: number;
  /** Konkurrenzfaktor, mit dem sie die Preise in ihren Veedeln drückt (market). */
  priceFactor: number;
  /** Einkaufspreis pro Einheit Ware. */
  goodsCost: number;
  /** Qualität ihrer Ware (0–1), z.B. bei Angeboten an dich. */
  goodsQuality: number;
  /** Wie oft sie dir Ware anbietet (1 = normal, 0 = nie). */
  dealing: number;
  /** Startwerte. */
  start: { money: number; people: number; goods: number };
  /**
   * Wie die Gang Druck macht (Auftrag 23): Gewichte der Methoden, ab Stufe 2 (Abwerben schon ab Stufe 1). Fehlt eine
   * Methode, nutzt die Gang sie nie. Der Überfall läuft ab Stufe 3 über die Eskalation (ai.ts); sein Gewicht zeigt
   * nur die Gangs-Seite.
   */
  methods: Partial<Record<GangMethod, number>>;
}

/**
 * Methoden einer Gang: raid Überfall (Konfrontation), intimidate Leute an deinen Spot stellen, burglary nachts ins
 * Lager einbrechen, poach deine Leute abwerben, tipOff der Polizei einen Tipp geben, blackmail mit deinem Lager
 * erpressen.
 */
export type GangMethod = 'raid' | 'intimidate' | 'burglary' | 'poach' | 'tipOff' | 'blackmail';

export interface Gang {
  id: string;
  /** Stadt der Gang (Auftrag 30). Sie handelt nur dort und nur, wenn die Stadt live ist. */
  cityId: string;
  name: string;
  /** Farbe auf der Karte (CSS-Farbe). */
  color: string;
  /** Veedel, von dem aus die Gang ihr Revier aufgebaut hat. */
  homeVeedelId: string;
  /** Name des Bosses. */
  boss: string;
  /** Ihre Leute als Satzanfang im Plural, z.B. in Konfrontationen: "Leute der Hafenkolonne tauchen auf." */
  crew: string;
  /** Emblem (Emoji), bis es Grafiken gibt. */
  emblem: string;
  /** Stil in einem Satz. */
  style: string;
  /** Stärken als Stichworte, z.B. 'brutal'. */
  strengths: string[];
  /** Schwäche als Stichwort. */
  weakness: string;
  traits: GangTraits;
}

export const GANGS: readonly Gang[] = [
  {
    id: 'nord',
    cityId: 'koeln',
    name: 'Hafenkolonne',
    color: '#c0392b',
    homeVeedelId: 'nippes',
    boss: 'Jupp „Kran“ Wendeler',
    crew: 'Leute der Hafenkolonne',
    emblem: '⚓',
    style: 'Alte Schule aus dem Niehler Hafen. Erst zuschlagen, dann reden, und meistens nicht mal das.',
    strengths: ['brutal', 'viele Leute'],
    weakness: 'wenig Geld',
    traits: {
      aggression: 1.4,
      expansion: 1.1,
      fighting: 62,
      network: 0.2,
      priceFactor: 0.9,
      goodsCost: 4.2,
      goodsQuality: 0.6,
      dealing: 0.3,
      start: { money: 18000, people: 16, goods: 900 },
      methods: { raid: 3, intimidate: 3, burglary: 1, poach: 0.5 },
    },
  },
  {
    id: 'west',
    cityId: 'koeln',
    name: 'Venloer Syndikat',
    color: '#2e86de',
    homeVeedelId: 'ehrenfeld',
    boss: 'Nadine Schrader, genannt „die Notarin“',
    crew: 'Leute des Venloer Syndikats',
    emblem: '🕸',
    style: 'Kioske, Clubs und Wettbüros entlang der Venloer. Freunde im Präsidium, Anwälte auf Kurzwahl.',
    strengths: ['gut vernetzt', 'reich'],
    weakness: 'kämpft ungern selbst',
    traits: {
      aggression: 0.8,
      expansion: 1.0,
      fighting: 48,
      network: 0.75,
      priceFactor: 0.9,
      goodsCost: 4.0,
      goodsQuality: 0.65,
      dealing: 0.6,
      start: { money: 45000, people: 14, goods: 1200 },
      methods: { tipOff: 3, burglary: 2.5, poach: 1, intimidate: 0.5, raid: 1 },
    },
  },
  {
    id: 'ost',
    cityId: 'koeln',
    name: 'Schäl Sick',
    color: '#d68910',
    homeVeedelId: 'kalk',
    boss: 'Kalle Brenner',
    crew: 'Leute der Schäl Sick',
    emblem: '🔥',
    style: 'Die rechte Rheinseite. Masse statt Klasse: billiges Zeug, niedrige Preise, keine Fragen.',
    strengths: ['billige Ware', 'Preiskrieg'],
    weakness: 'schlechte Qualität',
    traits: {
      aggression: 1.0,
      expansion: 1.3,
      fighting: 52,
      network: 0.35,
      priceFactor: 0.8,
      goodsCost: 3.0,
      goodsQuality: 0.45,
      dealing: 1.5,
      start: { money: 25000, people: 14, goods: 2500 },
      methods: { poach: 3, intimidate: 1.5, raid: 1.5, burglary: 1 },
    },
  },
  {
    id: 'sued',
    cityId: 'koeln',
    name: 'Marienburger Kreis',
    color: '#8e44ad',
    homeVeedelId: 'bayenthal',
    boss: 'Dr. Konstantin Aldenhoven',
    crew: 'Leute des Marienburger Kreises',
    emblem: '♛',
    style: 'Villen, Rheinblick, Kundschaft mit Kanzlei. Diskret, teuer, und wer stört, verschwindet.',
    strengths: ['viel Geld', 'diskret'],
    weakness: 'wenig Leute',
    traits: {
      aggression: 0.9,
      expansion: 0.8,
      fighting: 60,
      network: 0.6,
      priceFactor: 0.95,
      goodsCost: 4.5,
      goodsQuality: 0.8,
      dealing: 0.5,
      start: { money: 70000, people: 10, goods: 600 },
      methods: { blackmail: 3, burglary: 2.5, tipOff: 1, raid: 1 },
    },
  },
  // --- Hamburg (Auftrag 30) ---
  {
    id: 'hh-kiez',
    cityId: 'hamburg',
    name: 'Neonkrone',
    color: '#e84393',
    homeVeedelId: 'st-pauli',
    boss: 'Rocco Brandt, genannt „der Portier“',
    crew: 'Türsteher der Neonkrone',
    emblem: '🌹',
    style: 'Kiez-Kartell zwischen Reeperbahn und Hamburger Berg. Jede Tür, jede Bar, jede Ecke zahlt an sie.',
    strengths: ['Türsteher', 'Nachtgeschäft'],
    weakness: 'zu viele Augen auf dem Kiez',
    traits: {
      aggression: 1.3,
      expansion: 1.0,
      fighting: 72,
      network: 0.55,
      priceFactor: 0.95,
      goodsCost: 4.8,
      goodsQuality: 0.7,
      dealing: 0.6,
      start: { money: 65000, people: 20, goods: 1600 },
      methods: { intimidate: 3, raid: 2, poach: 1, blackmail: 1 },
    },
  },
  {
    id: 'hh-hafen',
    cityId: 'hamburg',
    name: 'Containerjungs',
    color: '#16a085',
    homeVeedelId: 'wilhelmsburg',
    boss: 'Hinnerk „Brecher“ Matthiesen',
    crew: 'Leute der Containerjungs',
    emblem: '⛓',
    style: 'Hafenarbeiter von der Insel bis Harburg. Was aus dem Container fällt, gehört ihnen. Grob und laut.',
    strengths: ['brutal', 'viel Ware'],
    weakness: 'kaum Freunde bei den Behörden',
    traits: {
      aggression: 1.5,
      expansion: 1.2,
      fighting: 76,
      network: 0.25,
      priceFactor: 0.85,
      goodsCost: 3.6,
      goodsQuality: 0.55,
      dealing: 1.3,
      start: { money: 30000, people: 22, goods: 3500 },
      methods: { raid: 3, burglary: 2, intimidate: 1.5 },
    },
  },
  {
    id: 'hh-schanze',
    cityId: 'hamburg',
    name: 'Das Kollektiv',
    color: '#27ae60',
    homeVeedelId: 'sternschanze',
    boss: 'Merle Asmussen, genannt „die Kassenwartin“',
    crew: 'Leute vom Kollektiv',
    emblem: '✊',
    style: 'Vernetzt bis in jede WG der Schanze. Wenn die Polizei kommt, wissen sie es eine Stunde vorher.',
    strengths: ['bestens vernetzt', 'gute Ware'],
    weakness: 'zerstritten, sobald es ums Geld geht',
    traits: {
      aggression: 0.8,
      expansion: 1.0,
      fighting: 56,
      network: 0.92,
      priceFactor: 0.9,
      goodsCost: 4.4,
      goodsQuality: 0.75,
      dealing: 0.8,
      start: { money: 45000, people: 17, goods: 1500 },
      methods: { tipOff: 2.5, poach: 2, burglary: 1, raid: 1 },
    },
  },
  {
    id: 'hh-elbchaussee',
    cityId: 'hamburg',
    name: 'Elbchaussee-Club',
    color: '#d4ac0d',
    homeVeedelId: 'blankenese',
    boss: 'Frederik Brodersen-Lüth',
    crew: 'Leute des Elbchaussee-Clubs',
    emblem: '⛵',
    style: 'Reiche Söhne aus Blankenese und Eppendorf, mit Segelboot und Anwalt. Teure Ware, teure Preise.',
    strengths: ['viel Geld', 'Anwälte'],
    weakness: 'wenig Leute, die sich die Hände schmutzig machen',
    traits: {
      aggression: 0.9,
      expansion: 0.9,
      fighting: 64,
      network: 0.8,
      priceFactor: 1.05,
      goodsCost: 5.5,
      goodsQuality: 0.9,
      dealing: 0.4,
      start: { money: 100000, people: 13, goods: 800 },
      methods: { blackmail: 3, tipOff: 2, burglary: 1.5, raid: 1 },
    },
  },
  // --- Berlin (Auftrag 37): die stärksten Gangs bisher (mehr Leute, mehr Kampfkraft), dafür kaum Polizei. ---
  {
    id: 'be-tuer',
    cityId: 'berlin',
    name: 'Die Türsteher',
    color: '#6c5ce7',
    homeVeedelId: 'friedrichshain',
    boss: 'Goran „Gästeliste“ Vuković',
    crew: 'Leute von der Tür',
    emblem: '🎧',
    style: 'Wer am Wochenende in einen Club will, kommt an ihnen vorbei. Und wer drinnen verkauft, zahlt an sie.',
    strengths: ['Nachtgeschäft', 'Türsteher'],
    weakness: 'tagsüber kaum zu sehen',
    traits: {
      aggression: 1.3,
      expansion: 1.0,
      fighting: 80,
      network: 0.6,
      priceFactor: 0.95,
      goodsCost: 4.6,
      goodsQuality: 0.75,
      dealing: 0.7,
      start: { money: 70000, people: 26, goods: 2200 },
      methods: { intimidate: 3, raid: 2, poach: 1.5 },
    },
  },
  {
    id: 'be-kotti',
    cityId: 'berlin',
    name: 'Kotti-Familie',
    color: '#b03a5b',
    homeVeedelId: 'neukoelln',
    boss: 'Tarek Haddad, genannt „der Onkel“',
    crew: 'Cousins der Kotti-Familie',
    emblem: '🗝',
    style: 'Eine große Familie von der Sonnenallee bis zum Kotti. Jeder Späti, jede Shisha-Bar gehört einem Cousin.',
    strengths: ['viele Leute', 'Zusammenhalt'],
    weakness: 'Streit, sobald es um die Erbfolge geht',
    traits: {
      aggression: 1.4,
      expansion: 1.2,
      fighting: 78,
      network: 0.7,
      priceFactor: 0.88,
      goodsCost: 4.0,
      goodsQuality: 0.6,
      dealing: 1.1,
      start: { money: 55000, people: 28, goods: 3000 },
      methods: { raid: 3, intimidate: 2, blackmail: 1 },
    },
  },
  {
    id: 'be-leo',
    cityId: 'berlin',
    name: 'Leo-Gang',
    color: '#e67e22',
    homeVeedelId: 'wedding',
    boss: 'Kevin „Kralle“ Schulz',
    crew: 'Jungs vom Leo',
    emblem: '🐺',
    style: 'Junge Typen vom Leopoldplatz, schnell, laut und billig. Was sie nicht kaufen können, holen sie sich.',
    strengths: ['brutal', 'billige Ware'],
    weakness: 'keine Disziplin',
    traits: {
      aggression: 1.6,
      expansion: 1.3,
      fighting: 76,
      network: 0.3,
      priceFactor: 0.82,
      goodsCost: 3.5,
      goodsQuality: 0.5,
      dealing: 1.4,
      start: { money: 30000, people: 24, goods: 3200 },
      methods: { raid: 3, burglary: 2.5, poach: 1 },
    },
  },
  {
    id: 'be-westend',
    cityId: 'berlin',
    name: 'Kudamm-Kreis',
    color: '#95a5a6',
    homeVeedelId: 'charlottenburg',
    boss: 'Konstantin von Arnim',
    crew: 'Leute des Kudamm-Kreises',
    emblem: '🥂',
    style:
      'Alter Westen mit neuem Geld. Liefern an Villen in Grunewald und an Hotelsuiten am Kudamm, mit Anwalt im Auto.',
    strengths: ['viel Geld', 'Anwälte'],
    weakness: 'wenig Leute für die Straße',
    traits: {
      aggression: 1.0,
      expansion: 0.9,
      fighting: 70,
      network: 0.85,
      priceFactor: 1.05,
      goodsCost: 5.4,
      goodsQuality: 0.9,
      dealing: 0.5,
      start: { money: 110000, people: 18, goods: 1000 },
      methods: { blackmail: 3, tipOff: 2.5, burglary: 1 },
    },
  },
  // --- München (Auftrag 38): Geld haben sie alle, die Gangs sind vernetzter als anderswo (Präfix mu-) ---
  {
    id: 'mu-bahnhof',
    cityId: 'muenchen',
    name: 'Goldene Hand',
    color: '#fdcb6e',
    homeVeedelId: 'isarvorstadt',
    boss: 'Dragan Kovač, genannt „der Schaffner“',
    crew: 'Leute der Goldenen Hand',
    emblem: '✋',
    style: 'Hauptbahnhof bis Glockenbach. Wer am Bahnhof aussteigt und etwas sucht, findet zuerst ihre Leute.',
    strengths: ['viele Leute', 'Nachtgeschäft'],
    weakness: 'die Bundespolizei am Bahnhof kennt sie alle',
    traits: {
      aggression: 1.2,
      expansion: 1.2,
      fighting: 68,
      network: 0.6,
      priceFactor: 0.95,
      goodsCost: 5,
      goodsQuality: 0.65,
      dealing: 0.9,
      start: { money: 70000, people: 21, goods: 1800 },
      methods: { intimidate: 2.5, poach: 2, raid: 1.5, burglary: 1 },
    },
  },
  {
    id: 'mu-giesing',
    cityId: 'muenchen',
    name: 'Giasinga Buam',
    color: '#3498db',
    homeVeedelId: 'giesing',
    boss: 'Xaver „Wasti“ Huber',
    crew: 'Giasinga Buam',
    emblem: '🦁',
    style: 'Giesinger von Geburt: Fußball, Wettbüros, Fäuste. Wer in ihr Viertel will, muss erst an ihnen vorbei.',
    strengths: ['brutal', 'Heimvorteil'],
    weakness: 'mit allen anderen zerstritten',
    traits: {
      aggression: 1.5,
      expansion: 0.8,
      fighting: 78,
      network: 0.45,
      priceFactor: 0.9,
      goodsCost: 4.4,
      goodsQuality: 0.55,
      dealing: 0.7,
      start: { money: 40000, people: 22, goods: 1400 },
      methods: { raid: 3, intimidate: 2, burglary: 1.5 },
    },
  },
  {
    id: 'mu-isar',
    cityId: 'muenchen',
    name: 'Isar-Konsortium',
    color: '#a29bfe',
    homeVeedelId: 'bogenhausen',
    boss: 'Dr. Benedikt von Arnim',
    crew: 'Leute des Isar-Konsortiums',
    emblem: '💎',
    style: 'Anwälte, Ärzte, Erben. Teure Ware für teure Kundschaft, und Freunde bis ins Präsidium.',
    strengths: ['viel Geld', 'Freunde bei der Polizei'],
    weakness: 'keiner will sich die Hände schmutzig machen',
    traits: {
      aggression: 0.8,
      expansion: 0.9,
      fighting: 60,
      network: 0.95,
      priceFactor: 1.1,
      goodsCost: 6,
      goodsQuality: 0.92,
      dealing: 0.4,
      start: { money: 140000, people: 13, goods: 900 },
      methods: { tipOff: 3, blackmail: 3, poach: 1, raid: 0.5 },
    },
  },
  {
    id: 'mu-nord',
    cityId: 'muenchen',
    name: 'Nordblock',
    color: '#ff7675',
    homeVeedelId: 'milbertshofen',
    boss: 'Serkan Aydın, genannt „Beton“',
    crew: 'Leute vom Nordblock',
    emblem: '🏭',
    style:
      'Die Hochhäuser am Hart, das Werk, die U2. Der Norden gehört ihnen seit zwanzig Jahren, und sie halten zusammen.',
    strengths: ['viel Ware', 'loyal'],
    weakness: 'weit weg von der Innenstadt',
    traits: {
      aggression: 1.2,
      expansion: 1.1,
      fighting: 72,
      network: 0.6,
      priceFactor: 0.85,
      goodsCost: 4,
      goodsQuality: 0.6,
      dealing: 1.2,
      start: { money: 45000, people: 19, goods: 3000 },
      methods: { raid: 2, burglary: 2.5, intimidate: 1.5, poach: 1 },
    },
  },
  // --- Frankfurt (Auftrag 39) ---
  {
    id: 'ff-bahnhof',
    cityId: 'frankfurt',
    name: 'Kaisersack-Clan',
    color: '#ff6b5b',
    homeVeedelId: 'bahnhofsviertel',
    boss: 'Dragan Ilić, genannt „der Schaffner“',
    crew: 'Leute vom Kaisersack',
    emblem: 'route',
    style:
      'Hält das Bahnhofsviertel von der Kaiserstraße bis zur Münchener. Was am Hauptbahnhof ankommt, geht durch ihre Hände.',
    strengths: ['viele Leute', 'Straßengeschäft'],
    weakness: 'die Polizei steht bei ihnen vor der Tür',
    traits: {
      aggression: 1.4,
      expansion: 1.1,
      fighting: 70,
      network: 0.4,
      priceFactor: 0.9,
      goodsCost: 4.2,
      goodsQuality: 0.55,
      dealing: 1.2,
      start: { money: 50000, people: 24, goods: 2500 },
      methods: { intimidate: 3, raid: 2.5, poach: 1.5 },
    },
  },
  {
    id: 'ff-westend',
    cityId: 'frankfurt',
    name: 'Mainkapital',
    color: '#5dade2',
    homeVeedelId: 'westend-sued',
    boss: 'Dr. Konstantin Wehrle',
    crew: 'Leute von Mainkapital',
    emblem: '💼',
    style:
      'Händler aus den Türmen, die nebenbei die Vorstandsetagen versorgen. Sie kämpfen mit Anwälten, Kontakten und Geld.',
    strengths: ['viel Geld', 'Kontakte bis ins Präsidium'],
    weakness: 'keiner von ihnen macht sich die Hände schmutzig',
    traits: {
      aggression: 0.7,
      expansion: 0.9,
      fighting: 55,
      network: 0.95,
      priceFactor: 1.1,
      goodsCost: 6,
      goodsQuality: 0.92,
      dealing: 0.3,
      start: { money: 140000, people: 11, goods: 700 },
      methods: { blackmail: 3, tipOff: 3, poach: 1.5, raid: 0.5 },
    },
  },
  {
    id: 'ff-sachsenhausen',
    cityId: 'frankfurt',
    name: 'Die Bembel',
    color: '#b07cc6',
    homeVeedelId: 'sachsenhausen-nord',
    boss: 'Gisela Hartmann, genannt „Mutter Bembel“',
    crew: 'Leute der Bembel',
    emblem: '🍺',
    style:
      'Wirte und Türsteher aus Alt-Sachsenhausen. Jede Kneipe am Main zahlt, und jeder Wirt erzählt ihnen, wer was verkauft.',
    strengths: ['bestens vernetzt', 'Kneipen'],
    weakness: 'alt geworden, die Jungen laufen weg',
    traits: {
      aggression: 0.9,
      expansion: 1.0,
      fighting: 60,
      network: 0.8,
      priceFactor: 0.95,
      goodsCost: 4.8,
      goodsQuality: 0.7,
      dealing: 0.8,
      start: { money: 60000, people: 16, goods: 1400 },
      methods: { tipOff: 2.5, burglary: 2, intimidate: 1, raid: 1 },
    },
  },
  {
    id: 'ff-hoechst',
    cityId: 'frankfurt',
    name: 'Farbwerker',
    color: '#a3cb38',
    homeVeedelId: 'hoechst',
    boss: 'Erkan Doğan, genannt „Chemie“',
    crew: 'Leute der Farbwerker',
    emblem: 'flask',
    style:
      'Aus den Blocks hinter dem Industriepark, mit Cousins in der Cargo City. Was am Flughafen vom Band fällt, landet bei ihnen.',
    strengths: ['brutal', 'Leute am Flughafen'],
    weakness: 'weit weg von der Innenstadt',
    traits: {
      aggression: 1.5,
      expansion: 1.2,
      fighting: 75,
      network: 0.3,
      priceFactor: 0.85,
      goodsCost: 3.8,
      goodsQuality: 0.6,
      dealing: 1.3,
      start: { money: 35000, people: 20, goods: 3000 },
      methods: { raid: 3, burglary: 2.5, intimidate: 1.5 },
    },
  },
];

/**
 * Wie die Gangs einer Stadt zueinander stehen (Auftrag 34), -100 (Todfeinde) bis 100 (Freunde). Schlüssel: die beiden
 * IDs alphabetisch, mit „|“ getrennt. Fehlt ein Paar, gilt 0. Vorstöße ins Revier einer Gang verschlechtern das
 * Verhältnis (Laufzeit in GangsState.rivalry); ab WAR_AT wird daraus ein Gang-Krieg.
 */
export const GANG_RIVALRY: Readonly<Record<string, number>> = {
  // Köln: Die Hafenkolonne hasst die Schäl Sick (Hafen gegen rechtsrheinisch), Syndikat und Kreis dulden sich.
  'nord|ost': -70,
  'nord|west': -30,
  'nord|sued': -20,
  'ost|west': -40,
  'ost|sued': -50,
  'sued|west': 20,
  // Hamburg: Kiez gegen Hafen, das Kollektiv gegen den Club an der Elbchaussee.
  'hh-hafen|hh-kiez': -50,
  'hh-kiez|hh-schanze': -30,
  'hh-elbchaussee|hh-kiez': 10,
  'hh-hafen|hh-schanze': -20,
  'hh-elbchaussee|hh-hafen': -60,
  'hh-elbchaussee|hh-schanze': -70,
  // Berlin: Tür gegen Familie um die Clubs in Kreuzberg, der Leo hasst alle, der Kudamm-Kreis kauft sich Frieden.
  'be-kotti|be-tuer': -60,
  'be-leo|be-tuer': -30,
  'be-tuer|be-westend': 20,
  'be-kotti|be-leo': -50,
  'be-kotti|be-westend': -20,
  'be-leo|be-westend': -70,
  // München: Giesing gegen alle, das Konsortium lässt die Goldene Hand für sich am Bahnhof arbeiten.
  'mu-bahnhof|mu-giesing': -60,
  'mu-bahnhof|mu-isar': 30,
  'mu-bahnhof|mu-nord': -40,
  'mu-giesing|mu-isar': -50,
  'mu-giesing|mu-nord': -30,
  'mu-isar|mu-nord': -20,
  // Frankfurt: Bahnhof gegen Höchst (beide wollen die Straße), die Türme kaufen bei den Bembel und verachten den Rest.
  'ff-bahnhof|ff-hoechst': -60,
  'ff-bahnhof|ff-westend': -30,
  'ff-bahnhof|ff-sachsenhausen': -40,
  'ff-hoechst|ff-westend': -50,
  'ff-hoechst|ff-sachsenhausen': -20,
  'ff-sachsenhausen|ff-westend': 30,
};

/** Schlüssel eines Gang-Paars (alphabetisch). */
export function rivalryKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
