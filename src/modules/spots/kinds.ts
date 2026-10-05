// Spot-Arten, Bekanntheit und Ausbau (Auftrag 23) als Daten. Eigene Spots wählen beim Gründen eine Art; die
// vorgegebenen Spots tragen ihre Art als Bezeichnung (Icon, Name), ihre Werte stehen schon im Spot (Andrang, Kundschaft,
// Preis), deshalb wirken Tageskurve, Öffnungszeiten und Heat-Faktor der Art nur bei eigenen Spots.

export type SpotKind = 'corner' | 'spaeti' | 'club' | 'park' | 'station' | 'campus' | 'kneipe';

export interface SpotType {
  id: SpotKind;
  name: string;
  /** Icon-Name aus src/ui (Karte und Handy). */
  icon: string;
  /** Ein Satz für das Gründen-Blatt. */
  description: string;
  /** Kann man diese Art selbst gründen? (Kneipen gibt es nur vorgegeben.) */
  foundable: boolean;
  /** Gründungskosten in Schwarzgeld. */
  foundCost: number;
  /** Andrang (mal Dichte des Veedels und CUSTOM_SPOT_DEMAND). */
  demand: number;
  /** Kundschaft: Faktor pro Kundentyp. */
  audience: Readonly<Record<string, number>>;
  /** Heat pro Verkauf (1 = normal). */
  heatFactor: number;
  /** Preisniveau (Aufschlag auf den Richtpreis). */
  priceMultiplier: number;
  /** Öffnungszeiten [von, bis) in Stunden, null = immer. */
  hours: readonly [number, number] | null;
  /** Nachfrage nachts (20–4 Uhr) bzw. tagsüber mal diesem Faktor. */
  night: number;
  day: number;
  /** Am Wochenende (Freitagabend bis Sonntag) mal diesem Faktor. */
  weekend: number;
  /** Bei Regen, Sturm oder Schnee mal diesem Faktor (1 = egal). */
  rain: number;
}

export const SPOT_TYPES: Readonly<Record<SpotKind, SpotType>> = {
  corner: {
    id: 'corner',
    name: 'Straßenecke',
    icon: 'pin',
    description: 'Der Klassiker: immer offen, gemischte Kundschaft, normales Risiko.',
    foundable: true,
    foundCost: 800,
    demand: 1,
    audience: {},
    heatFactor: 1,
    priceMultiplier: 1,
    hours: null,
    night: 1,
    day: 1,
    weekend: 1,
    rain: 1,
  },
  spaeti: {
    id: 'spaeti',
    name: 'Späti-Hinterzimmer',
    icon: 'store',
    description: 'Diskret und gemütlich: weniger Andrang, wenig Heat, treue Kundschaft.',
    foundable: true,
    foundCost: 1200,
    demand: 0.8,
    audience: { stoner: 1.4, student: 1.2 },
    heatFactor: 0.6,
    priceMultiplier: 1.05,
    hours: [10, 2],
    night: 1.1,
    day: 0.9,
    weekend: 1.1,
    rain: 1.1,
  },
  club: {
    id: 'club',
    name: 'Club',
    icon: 'music',
    description: 'Nur abends und nachts, am Wochenende voll, gute Preise, viel Heat.',
    foundable: true,
    foundCost: 1600,
    demand: 1.4,
    audience: { party: 2, tourist: 1.2, banker: 0.7 },
    heatFactor: 1.25,
    priceMultiplier: 1.15,
    hours: [21, 5],
    night: 1.3,
    day: 1,
    weekend: 1.5,
    rain: 1,
  },
  park: {
    id: 'park',
    name: 'Park',
    icon: 'leaf',
    description: 'Tagsüber, bei gutem Wetter voll, bei Regen leer. Billig zu haben.',
    foundable: true,
    foundCost: 600,
    demand: 1.1,
    audience: { stoner: 1.5, student: 1.3 },
    heatFactor: 0.9,
    priceMultiplier: 0.95,
    hours: [9, 23],
    night: 0.7,
    day: 1.2,
    weekend: 1.3,
    rain: 0.4,
  },
  station: {
    id: 'station',
    name: 'Bahnhof/Haltestelle',
    icon: 'route',
    description: 'Viel Durchgangsverkehr rund um die Uhr, aber auch viel Polizei.',
    foundable: true,
    foundCost: 1000,
    demand: 1.4,
    audience: { tourist: 1.4, banker: 1.1 },
    heatFactor: 1.4,
    priceMultiplier: 0.9,
    hours: null,
    night: 0.8,
    day: 1.1,
    weekend: 1,
    rain: 1,
  },
  campus: {
    id: 'campus',
    name: 'Campus',
    icon: 'journal',
    description: 'Studenten in der Woche, am Wochenende tote Hose. Wenig Heat, kleine Preise.',
    foundable: true,
    foundCost: 900,
    demand: 1.1,
    audience: { student: 2.2, banker: 0.4 },
    heatFactor: 0.8,
    priceMultiplier: 0.9,
    hours: [8, 21],
    night: 1,
    day: 1.1,
    weekend: 0.4,
    rain: 0.9,
  },
  kneipe: {
    id: 'kneipe',
    name: 'Kneipe',
    icon: 'beer',
    description: 'Veedel-Kneipe: abends offen, viele Stammgäste.',
    foundable: false,
    foundCost: 0,
    demand: 0.6,
    audience: {},
    heatFactor: 1,
    priceMultiplier: 1,
    hours: [17, 1],
    night: 1,
    day: 1,
    weekend: 1,
    rain: 1,
  },
};

export const SPOT_KINDS = Object.keys(SPOT_TYPES) as SpotKind[];

/** Art der vorgegebenen Spots (fehlt: Straßenecke). Nur Bezeichnung, die Werte stehen im Spot. */
export const PRESET_KINDS: Readonly<Record<string, SpotKind>> = {
  neumarkt: 'station',
  breslauer: 'station',
  domplatte: 'station',
  zuelpicher: 'club',
  rudolfplatz: 'club',
  friesenplatz: 'club',
  'aachener-weiher': 'park',
  rheinpark: 'park',
  stadtgarten: 'park',
  stadtwald: 'park',
  suedpark: 'park',
  'rheinufer-bayenthal': 'park',
  uni: 'campus',
  spielbudenplatz: 'club',
  'hans-albers-platz': 'club',
  landungsbruecken: 'station',
  hansaplatz: 'station',
  schanzenpark: 'park',
  'am-weiher': 'park',
  strandweg: 'park',
  'sendlinger-tor': 'station',
  'hauptbahnhof-muc': 'station',
  'ostbahnhof-muc': 'club',
  'uni-muc': 'campus',
  'weissenburger-platz': 'club',
  'muenchner-freiheit': 'club',
  bavariapark: 'park',
  hirschgarten: 'park',
  olympiadorf: 'campus',
  scheidplatz: 'station',
  froettmaning: 'station',
};

// --- Bekanntheit -------------------------------------------------------------------------------

/** Startwert eines neuen eigenen Spots (vorgegebene Spots sind voll bekannt). */
export const AWARENESS_START = 0.2;
/** Andrang mal (AWARENESS_FLOOR + (1 − AWARENESS_FLOOR) × Bekanntheit): Auch ein neuer Spot hat etwas Laufkundschaft. */
export const AWARENESS_FLOOR = 0.35;
/** Pro verkaufter Einheit, pro neuem Stammkunden, pro Tag mit Leuten dort (mal Ruf/50, höchstens 1,5). */
export const AWARENESS_PER_UNIT = 0.0015;
export const AWARENESS_PER_REGULAR = 0.03;
export const AWARENESS_PER_STAFFED_DAY = 0.05;
/** Ein Tag ohne Leute dort: so viel weniger (nie unter AWARENESS_MIN). */
export const AWARENESS_DECAY_PER_DAY = 0.04;
export const AWARENESS_MIN = 0.1;

// --- Verlegen, aufgeben --------------------------------------------------------------------------

/** Verlegen kostet so viel Schwarzgeld und behält diesen Anteil der Bekanntheit. */
export const MOVE_COST = 400;
export const MOVE_KEEP_AWARENESS = 0.6;

// --- Ausbau ------------------------------------------------------------------------------------

export type SpotUpgradeId = 'lookout' | 'stash' | 'regular';

export interface SpotUpgrade {
  id: SpotUpgradeId;
  name: string;
  icon: string;
  description: string;
  cost: number;
}

export const SPOT_UPGRADES: Readonly<Record<SpotUpgradeId, SpotUpgrade>> = {
  lookout: {
    id: 'lookout',
    name: 'Späher',
    icon: 'eye',
    description: 'Sieht die Streife kommen: Kontrollen am Spot gehen oft ins Leere.',
    cost: 900,
  },
  stash: {
    id: 'stash',
    name: 'Versteck',
    icon: 'package',
    description: 'Ware liegt nicht am Mann: halb so viel Verlust bei Kontrolle oder Überfall.',
    cost: 700,
  },
  regular: {
    id: 'regular',
    name: 'Stammplatz',
    icon: 'heart',
    description: 'Fester Treffpunkt: mehr Stammkunden, der Spot spricht sich schneller rum.',
    cost: 600,
  },
};

export const SPOT_UPGRADE_IDS = Object.keys(SPOT_UPGRADES) as SpotUpgradeId[];

/** Späher: Chance, dass eine Kontrolle am Spot ins Leere geht. Versteck: Faktor auf Verluste. Stammplatz: Faktoren. */
export const LOOKOUT_AVOID = 0.5;
export const STASH_LOSS_FACTOR = 0.5;
export const REGULAR_PLACE_FACTOR = 1.5;
