import type { StaffRole, StaffStats, StaffStatus, StatKey } from './types';

// Einstellbare Werte des Personals. Zeiten in Spielminuten, Geld in Euro (Schwarzgeld), Werte von 0 bis 100.

// --- Läufer von der Straße (wie im Prototyp) ---

export const RUNNER_HIRE_COST = 600;
export const RUNNER_DAILY_WAGE = 80;
/** So lange braucht ein Läufer mit Tempo 50 auf Level 1 für einen Kunden. */
export const RUNNER_SERVE_TIME = 20;
/** Schneller als das geht es auch mit Top-Werten nicht. */
export const MIN_SERVE_TIME = 8;

/** Werte, wenn nichts Genaueres bekannt ist (z.B. Spielstände aus dem Fundament). */
export const DEFAULT_STATS: StaffStats = { speed: 50, caution: 50, strength: 50, charisma: 50, loyalty: 50 };

// --- Typen ---

export interface RoleInfo {
  name: string;
  plural: string;
  /** Tageslohn auf Level 1. */
  wage: number;
  /** Durchschnittliche Werte neuer Leute dieses Typs. */
  stats: StaffStats;
  /** Werte, auf die es bei diesem Typ ankommt. Sie steigen beim Level-Aufstieg. */
  keyStats: StatKey[];
  /** Spezialisten arbeiten nicht an Spots, sondern geben Boni. */
  specialist: boolean;
  age: [number, number];
}

export const ROLE_INFO: Record<StaffRole, RoleInfo> = {
  runner: {
    name: 'Läufer',
    plural: 'Läufer',
    wage: RUNNER_DAILY_WAGE,
    stats: { speed: 55, caution: 45, strength: 40, charisma: 50, loyalty: 55 },
    keyStats: ['speed', 'charisma', 'caution'],
    specialist: false,
    age: [17, 31],
  },
  courier: {
    name: 'Kurier',
    plural: 'Kuriere',
    wage: 100,
    stats: { speed: 60, caution: 50, strength: 40, charisma: 40, loyalty: 55 },
    keyStats: ['speed', 'caution'],
    specialist: false,
    age: [19, 42],
  },
  security: {
    name: 'Sicherheit',
    plural: 'Sicherheit',
    wage: 120,
    stats: { speed: 45, caution: 50, strength: 65, charisma: 35, loyalty: 55 },
    keyStats: ['strength', 'caution'],
    specialist: false,
    age: [21, 46],
  },
  lawyer: {
    name: 'Anwalt',
    plural: 'Anwälte',
    wage: 250,
    stats: { speed: 40, caution: 60, strength: 25, charisma: 65, loyalty: 50 },
    keyStats: ['charisma', 'caution'],
    specialist: true,
    age: [31, 64],
  },
  accountant: {
    name: 'Buchhalter',
    plural: 'Buchhalter',
    wage: 200,
    stats: { speed: 45, caution: 65, strength: 25, charisma: 45, loyalty: 50 },
    keyStats: ['caution', 'speed'],
    specialist: true,
    age: [27, 61],
  },
  policeContact: {
    name: 'Polizei-Kontakt',
    plural: 'Polizei-Kontakte',
    wage: 220,
    stats: { speed: 40, caution: 60, strength: 45, charisma: 55, loyalty: 45 },
    keyStats: ['charisma', 'caution'],
    specialist: true,
    age: [29, 58],
  },
};

export const STAT_NAMES: Record<StatKey, string> = {
  speed: 'Tempo',
  caution: 'Vorsicht',
  strength: 'Stärke',
  charisma: 'Charisma',
  loyalty: 'Loyalität',
};

export const STATUS_NAMES: Record<StaffStatus, string> = {
  active: 'aktiv',
  injured: 'verletzt',
  jailed: 'in Haft',
  quit: 'gekündigt',
  dead: 'tot',
};

/** Streuung neuer Werte um den Durchschnitt des Typs (±). */
export const STAT_SPREAD = 25;
/** So viel besser sind Leute mit Qualität 1 (Kontakte, Empfehlungen). */
export const QUALITY_BONUS = 12;

// --- Erfahrung und Level ---

export const MAX_LEVEL = 10;
/** Gesamt-Erfahrung, ab der ein Level erreicht ist. Index 0 = Level 1. */
export const LEVEL_XP = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200];
/** Beim Level-Aufstieg steigt jeder wichtige Wert des Typs um so viel (von, bis). */
export const LEVEL_STAT_GAIN: [number, number] = [2, 5];
/** Lohnanspruch steigt pro Level um diesen Anteil. */
export const WAGE_PER_LEVEL = 0.15;

/** Erfahrung pro Verkauf: fest plus pro Einheit. */
export const XP_PER_SALE = 3;
export const XP_PER_SALE_UNIT = 2;
/** Sicherheit im Einsatz, pro Stunde. */
export const XP_PER_DUTY_HOUR = 3;
/** Spezialisten, pro Tag im Dienst. */
export const XP_PER_SPECIALIST_DAY = 45;
/** Anwalt, wenn er jemanden rausholt. */
export const XP_PER_BAIL = 25;
/** Teilnahme an einer Konfrontation. */
export const XP_PER_ENCOUNTER = 40;

// --- Loyalität ---

export const LOYALTY = {
  /** Tägliche Änderung je nach Lohn im Verhältnis zum Anspruch. */
  wageGenerous: 2, // ab 120 %
  wageFair: 1, // ab 100 %
  wageLow: -1, // unter 85 %
  wageBad: -4, // unter 60 %
  /** Nicht bezahlt: Wer dann nicht direkt kündigt, ist sauer. */
  unpaid: -20,
  /** Festnahme der Person selbst und Angst der anderen im selben Veedel. */
  arrest: -12,
  arrestNearby: -2,
  /** Pro Tag in Haft. */
  jailDay: -2,
  injury: -6,
  /** Konfrontation: Gefahr, bei Niederlage zusätzlich. */
  encounter: -3,
  encounterLost: -4,
  raid: -3,
  /** Pro Tag in einem Veedel mit viel Heat. */
  heatDay: -1,
  bailed: 12,
  levelUp: 2,
  /** Lohnerhöhung um 10 % bringt so viel (höchstens wageRaiseMax), Kürzung um 10 % kostet so viel. */
  wageRaisePer10: 3,
  wageRaiseMax: 10,
  wageCutPer10: -6,
} as const;

/** Ab so viel Heat im Veedel ist die Arbeit gefährlich. */
export const DANGER_HEAT = 60;

// --- Verrat (selten und mild) ---

/** Erst unter dieser Loyalität kann es Verrat geben. */
export const BETRAYAL_THRESHOLD = 30;
/** Tägliche Wahrscheinlichkeit bei Loyalität 0, sinkt linear bis zur Schwelle. */
export const BETRAYAL_MAX_CHANCE = 0.25;
/** Nach einem Vorfall ist so lange Ruhe. */
export const BETRAYAL_COOLDOWN = 3 * 1440;
export const BETRAYAL_WEIGHTS = { goods: 3, money: 3, quit: 2, talk: 2 } as const;
/** Geklaute Ware: Anteil vom Bestand, höchstens so viele Einheiten. */
export const THEFT_GOODS_SHARE = 0.1;
export const THEFT_GOODS_MAX = 30;
/** Geklautes Geld: Anteil vom Schwarzgeld, höchstens so viel. */
export const THEFT_MONEY_SHARE = 0.05;
export const THEFT_MONEY_MAX = 400;
/** Wer redet, bringt so viel Heat ins Veedel. */
export const TALK_HEAT = 15;
/** Wer mit wenig Loyalität entlassen wird, redet mit dieser Wahrscheinlichkeit. */
export const FIRED_TALK_CHANCE = 0.3;
export const FIRED_TALK_LOYALTY = 40;

// --- Haft, Kaution, Verletzung ---

export const JAIL_DURATION = 3 * 1440;
export const INJURY_DURATION = 1.5 * 1440;
export const BAIL_BASE = 800;
export const BAIL_PER_LEVEL = 200;

// --- Spezialisten ---

/** Bonus = Grundwert + pro Level darüber + (Wert − 50) / Teiler, gedeckelt. */
export const SPECIALIST_BONUS = {
  bailDiscount: { role: 'lawyer', stat: 'charisma', base: 0.2, perLevel: 0.04, divisor: 250, max: 0.6 },
  jailReduction: { role: 'lawyer', stat: 'caution', base: 0.25, perLevel: 0.04, divisor: 250, max: 0.6 },
  launderingFeeDiscount: { role: 'accountant', stat: 'caution', base: 0.2, perLevel: 0.04, divisor: 250, max: 0.6 },
  raidWarning: { role: 'policeContact', stat: 'charisma', base: 0.5, perLevel: 0.05, divisor: 200, max: 0.9 },
} as const;

/** Übergangslösung für die Razzia-Warnung: Der Polizei-Kontakt warnt ab so viel Heat, höchstens einmal pro Tag. */
export const RAID_WARNING_HEAT = 60;
export const RAID_WARNING_COOLDOWN = 1440;

// --- Sonstiges ---

/** Pro Tag wird mit dieser Wahrscheinlichkeit ein noch unbekannter Wert sichtbar. */
export const REVEAL_CHANCE = 0.5;
/** So viele Einträge behält die Laufbahn. */
export const CAREER_LIMIT = 20;
/** So viele ehemalige Mitarbeiter bleiben in der Akte. */
export const FORMER_LIMIT = 30;
/** Höchstens so viele Leute von der Sicherheit pro Lager. */
export const MAX_SECURITY_PER_WAREHOUSE = 2;
/** Lohn-Grenzen beim Ändern (Anteil vom Anspruch). */
export const WAGE_MIN_FACTOR = 0.3;
export const WAGE_MAX_FACTOR = 4;

// --- Namen und Hintergründe ---

export const FIRST_NAMES = [
  'Kevin',
  'Murat',
  'Dennis',
  'Jana',
  'Sascha',
  'Luca',
  'Mehmet',
  'Tobi',
  'Chantal',
  'Dragan',
  'Nico',
  'Ayse',
  'Marco',
  'Sven',
  'Leonie',
  'Kemal',
  'Jessica',
  'Hakan',
  'Pascal',
  'Denise',
  'Ali',
  'Mario',
  'Sandra',
  'Yusuf',
  'Timo',
  'Olga',
  'Rico',
  'Vanessa',
  'Emre',
  'Jupp',
  'Ferhat',
  'Nadine',
  'Ilias',
  'Bianca',
  'Sergej',
  'Can',
] as const;

export const LAST_NAMES = ['K.', 'B.', 'S.', 'M.', 'Ö.', 'W.', 'R.', 'T.', 'Y.', 'L.', 'H.', 'D.', 'P.', 'A.'] as const;

export const NICKNAMES = ['Schrank', 'Hase', 'Brikett', 'Nase', 'Professor', 'Blitz', 'Zwiebel', 'Latte', 'Pitter'];
/** So oft hat jemand einen Spitznamen. */
export const NICKNAME_CHANCE = 0.15;

export const BACKGROUNDS: Record<StaffRole, readonly string[]> = {
  runner: [
    'Hat die Schule geschmissen und kennt jeden am Ring.',
    'Studiert im vierzehnten Semester und braucht Geld für die Miete.',
    'Hat früher an der Tanke gejobbt, bis die Kasse nicht stimmte.',
    'Wuchs in Chorweiler auf, hat früh gelernt, den Mund zu halten.',
    'Verkauft seit Jahren an Freunde, jetzt will er mehr.',
    'Kommt aus Porz und hat Schulden bei den falschen Leuten.',
  ],
  courier: [
    'Fährt tagsüber Pizza aus und kennt jede Einbahnstraße.',
    'Ehemaliger Fahrradkurier, schneller als jede Streife.',
    'Hat den Führerschein seit drei Wochen und fährt wie ein Irrer.',
    'Lieferfahrer mit altem Transporter und wenig Fragen.',
  ],
  security: [
    'Ex-Türsteher aus der Altstadt, hat schon alles gesehen.',
    'Kampfsportler, der nach einer Verletzung nicht mehr antreten darf.',
    'War bei der Bundeswehr und redet nicht darüber.',
    'Hat in Kalk ein Fitnessstudio und zu viel Zeit.',
    'Hat für eine der Gangs gearbeitet und ist im Streit gegangen.',
  ],
  lawyer: [
    'Strafverteidiger mit Spielschulden.',
    'Hat eine kleine Kanzlei in Lindenthal und teure Hobbys.',
    'Frisch aus einer großen Kanzlei geflogen, kennt aber die Richter.',
    'Alter Hase am Landgericht, dem niemand mehr etwas beweist.',
  ],
  accountant: [
    'Steuerberater, der zu viel über seine Mandanten weiß.',
    'Hat für eine Shisha-Bar-Kette die Bücher gemacht.',
    'Ehemalige Bankangestellte mit einem Auge für Lücken.',
    'Führt ein Nagelstudio, das nie Kundschaft hat.',
  ],
  policeContact: [
    'Polizeiobermeister in Kalk, kurz vor der Pension.',
    'Sachbearbeiterin im Präsidium mit Zugriff auf die Einsatzpläne.',
    'Streifenpolizist mit Spielsucht.',
    'Hat seine Beförderung nie bekommen und ist entsprechend gelaunt.',
  ],
};
