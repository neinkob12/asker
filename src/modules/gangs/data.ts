// Die Gangs, die Köln zu Beginn unter sich aufgeteilt haben. Alle frei erfunden.
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
  /** Wie oft sie dir Ware anbietet (1 = normal, 0 = nie). */
  dealing: number;
  /** Startwerte. */
  start: { money: number; people: number; goods: number };
}

export interface Gang {
  id: string;
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
      dealing: 0.3,
      start: { money: 18000, people: 16, goods: 900 },
    },
  },
  {
    id: 'west',
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
      dealing: 0.6,
      start: { money: 45000, people: 14, goods: 1200 },
    },
  },
  {
    id: 'ost',
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
      dealing: 1.5,
      start: { money: 25000, people: 14, goods: 2500 },
    },
  },
  {
    id: 'sued',
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
      dealing: 0.5,
      start: { money: 70000, people: 10, goods: 600 },
    },
  },
];
