// Daten der eigenen Produktion (Auftrag 42): Fincas zum Kaufen oder Pachten, Verpackungen, Namen der Leute vor Ort,
// Gespräche der Anrufer. Namen frei erfunden.

import type { LngLat } from '../../core';

/** Eine Finca, die man kaufen oder pachten kann. */
export interface FincaSite {
  id: string;
  regionId: string;
  name: string;
  hectares: number;
  at: LngLat;
  description: string;
}

export const FINCA_SITES: readonly FincaSite[] = [
  {
    id: 'el-tigre',
    regionId: 'kolumbien',
    name: 'Finca El Tigre',
    hectares: 8,
    at: { lng: -74.05, lat: 10.98 },
    description: 'Ein Hang über dem Río Frío, schwer zu sehen, schwer zu erreichen.',
  },
  {
    id: 'la-esperanza',
    regionId: 'kolumbien',
    name: 'Finca La Esperanza',
    hectares: 15,
    at: { lng: -73.88, lat: 10.79 },
    description: 'Alte Kaffeefinca mit Terrassen und Wasser aus den Bergen.',
  },
  {
    id: 'san-isidro',
    regionId: 'kolumbien',
    name: 'Hacienda San Isidro',
    hectares: 25,
    at: { lng: -73.72, lat: 10.9 },
    description: 'Groß, flach, gut erreichbar. Auch für die Antinarcóticos.',
  },
  {
    id: 'ketama-hang',
    regionId: 'marokko',
    name: 'Hang bei Ketama',
    hectares: 6,
    at: { lng: -4.6, lat: 34.9 },
    description: 'Terrassen über dem Dorf, Beldia seit drei Generationen.',
  },
  {
    id: 'bab-berred',
    regionId: 'marokko',
    name: 'Felder bei Bab Berred',
    hectares: 12,
    at: { lng: -4.98, lat: 35.01 },
    description: 'Breites Tal an der Straße nach Chefchaouen, guter Boden.',
  },
  {
    id: 'issaguen',
    regionId: 'marokko',
    name: 'Hochebene Issaguen',
    hectares: 20,
    at: { lng: -4.42, lat: 34.84 },
    description: 'Viel Platz und Sonne. Die Gendarmerie hat hier eine Wache.',
  },
];

/** Verpackung nach dem Trocknen: Kosten pro Kilo (Schwarzgeld) und Faktor auf die Chance einer Zollkontrolle. */
export interface Packing {
  id: 'bale' | 'vacuum' | 'hidden';
  label: string;
  perKg: number;
  risk: number;
  description: string;
}

export const PACKINGS: readonly Packing[] = [
  { id: 'bale', label: 'Ballen', perKg: 0, risk: 1, description: 'In Folie gepresst. Billig, und der Hund riecht es.' },
  {
    id: 'vacuum',
    label: 'Vakuum',
    perKg: 25,
    risk: 0.8,
    description: 'Eingeschweißt in Kilo-Blöcken, kaum Geruch.',
  },
  {
    id: 'hidden',
    label: 'Versteckt',
    perKg: 70,
    risk: 0.6,
    description: 'In Kaffeesäcken, Konservendosen und doppelten Böden. Teuer, aber kaum zu finden.',
  },
];

/** Vor- und Nachnamen der Leute vor Ort (Arbeiter, Gärtner) pro Region. */
export const LOCAL_NAMES: Readonly<Record<string, { first: readonly string[]; last: readonly string[] }>> = {
  kolumbien: {
    first: ['Jhon', 'Wilmer', 'Yesid', 'Luz', 'Diana', 'Alirio', 'Edwin', 'Marleny', 'Arnulfo', 'Yuliana', 'Duvan'],
    last: ['Ospina', 'Rincón', 'Barrios', 'Mendoza', 'Quintero', 'Cárdenas', 'Pabón', 'Arias', 'Gutiérrez'],
  },
  marokko: {
    first: ['Mohamed', 'Abdelkader', 'Fatima', 'Rachid', 'Said', 'Aicha', 'Mustapha', 'Hamid', 'Khadija', 'Yassine'],
    last: ['El Idrissi', 'Bouzid', 'Ait Taleb', 'Benali', 'Ouazzani', 'El Khattabi', 'Amrani', 'Chakir'],
  },
};

/** Was die Anrufer sagen (Anruf mit Stimme, Zeile für Zeile). {name} = Spieler. */
export const CALL_LINES: Readonly<Record<string, readonly string[]>> = {
  kolumbien: [
    'Buenas. Esteban Mejía, aus Cartagena. Wir haben uns nie gesehen, aber deine Container kenne ich.',
    'Du kaufst bei anderen und zahlst den Preis, den sie dir sagen. Das ist dumm, und du bist nicht dumm.',
    'In der Sierra Nevada stehen Fincas leer. Kauf eine oder pachte sie, ich verlade für dich in Cartagena.',
    'Vier Wochen von der Ernte bis Rotterdam. Und das Gramm kostet dich einen Bruchteil.',
  ],
  marokko: [
    'Salam. Hassan, von der Kooperative in Ketama. Du kaufst seit Wochen bei uns.',
    'Warum kaufst du das Hasch, wenn du die Felder haben kannst? Im Rif wird Land frei.',
    'Die Familie Haddou in Tanger will ihren Anteil, die Gendarmen ihre Ruhe. Das regeln wir.',
    'Drei Wochen von der Ernte bis in deinen Hafen. Komm und schau es dir an.',
  ],
};

/** Antworten am Ende des Anrufs. */
export const CALL_TEXTS = {
  accept: 'Ich schau es mir an',
  later: 'Später',
  acceptReply: 'Zeig mir das Land.',
  laterReply: 'Noch nicht. Ich melde mich.',
  summary: 'Anruf: eigene Produktion',
  missed: 'Ruf zurück, wenn du Zeit hast. Das Land wartet nicht ewig, aber eine Weile.',
  gaveUp: 'Gut. Wenn du willst, schreib mir. Das Angebot steht.',
  laterAnswer: 'Wie du willst. Wenn du so weit bist, sag Bescheid.',
  openAnswer:
    'Gut. Die Fincas stehen in deiner Kunden-App unter Anbau. Pachten geht schnell, kaufen ist auf Dauer billiger.',
} as const;
