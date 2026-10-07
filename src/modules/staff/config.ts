import type { RelationKind, StaffRole, StaffStats, StaffStatus, StatKey, StoryId, TraitId } from './types';

// Einstellbare Werte des Personals. Zeiten in Spielminuten, Geld in Euro (Schwarzgeld), Werte von 0 bis 100.

// --- Läufer von der Straße (wie im Prototyp) ---

/**
 * Grundpreis für einen Läufer von der Straße. Der echte Preis hängt vom Spot ab: Wo viel los ist und die Preise
 * hoch sind, will der Läufer mehr (Grundpreis × Andrang × Preisniveau, auf 50 € gerundet, siehe runnerHireCost).
 */
export const RUNNER_HIRE_COST = 500;
export const RUNNER_HIRE_COST_MIN = 400;
export const RUNNER_HIRE_COST_MAX = 900;
export const RUNNER_DAILY_WAGE = 80;
/** Fahrer von der Straße (für Abholungen am Hafen und Fahrten zwischen Lagern). */
export const DRIVER_HIRE_COST = 450;
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
  // Altlast (vor Auftrag 28): wird nicht mehr vergeben, alte Spielstände machen aus Kurieren Läufer.
  courier: {
    name: 'Kurier (alt)',
    plural: 'Kuriere (alt)',
    wage: 100,
    stats: { speed: 60, caution: 50, strength: 40, charisma: 40, loyalty: 55 },
    keyStats: ['speed', 'caution'],
    specialist: false,
    age: [19, 42],
  },
  driver: {
    name: 'Fahrer',
    plural: 'Fahrer',
    wage: 110,
    stats: { speed: 55, caution: 60, strength: 45, charisma: 35, loyalty: 55 },
    keyStats: ['caution', 'speed'],
    specialist: false,
    age: [21, 58],
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
  // Auftrag 42: Leute auf den Fincas (grow). Löhne vor Ort zahlt grow (sauberes Geld), die Region ist nie live.
  worker: {
    name: 'Arbeiter',
    plural: 'Arbeiter',
    wage: 25,
    stats: { speed: 55, caution: 45, strength: 60, charisma: 35, loyalty: 60 },
    keyStats: ['strength', 'speed'],
    specialist: false,
    age: [17, 60],
  },
  gardener: {
    name: 'Gärtner',
    plural: 'Gärtner',
    wage: 140,
    stats: { speed: 45, caution: 60, strength: 40, charisma: 45, loyalty: 60 },
    keyStats: ['caution', 'speed'],
    specialist: false,
    age: [28, 66],
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
/** Mehr als so viele Einheiten zählen pro Verkauf nicht (500 g Großhandel sind kein Level-Sprung). */
export const XP_SALE_UNITS_MAX = 10;
/** Sicherheit im Einsatz, pro Stunde. */
export const XP_PER_DUTY_HOUR = 3;
/** Spezialisten, pro Tag im Dienst. */
export const XP_PER_SPECIALIST_DAY = 45;
/** Anwalt, wenn er jemanden rausholt. */
export const XP_PER_BAIL = 25;
/** Erfahrung für den Polizei-Kontakt pro Warnung vor einer Razzia. */
export const XP_PER_WARNING = 20;
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
  /** Pro Tag in Haft (mit Stillhaltegeld) bzw. ohne. */
  jailDay: -2,
  jailDayUnsupported: -7,
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

/** Ohne Lohn kündigt, wer schon so viele Tage leer ausging oder danach unter dieser Loyalität liegt. */
export const UNPAID_DAYS_TO_QUIT = 2;
export const UNPAID_QUIT_LOYALTY = 30;

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
/** Wer in Haft kein Stillhaltegeld bekommt, redet beim Rauskommen oder Entlassen eher (bis zu dieser Loyalität). */
export const UNSUPPORTED_TALK_CHANCE = 0.6;
export const UNSUPPORTED_TALK_LOYALTY = 70;

// --- Haft, Kaution, Verletzung ---

export const JAIL_DURATION = 3 * 1440;
/** In Haft gibt es keinen Lohn, nur Stillhaltegeld (Anteil vom Lohn, pro Person abstellbar). */
export const JAIL_WAGE_FACTOR = 0.25;
/** Verletzte bekommen diesen Anteil vom Lohn. */
export const INJURED_WAGE_FACTOR = 0.5;
export const INJURY_DURATION = 1.5 * 1440;
export const BAIL_BASE = 800;
export const BAIL_PER_LEVEL = 200;

// --- Spezialisten ---

/**
 * Bonus = Grundwert + pro Level darüber + (Wert − 50) / Teiler, gedeckelt. Nur noch Kaution und Razzia-Warnung; die
 * Wirkungen auf Zoll, Heat, Kontrollen, Verhaftungen, Haft, Erlös und Löhne stehen in SPECIALIST_EFFECTS (Auftrag 46e).
 * Die Geldwäsche-Gebühr macht der Buchhalter seit Auftrag 46e nicht mehr billiger („sonst wird nichts günstiger“).
 */
export const SPECIALIST_BONUS = {
  bailDiscount: { role: 'lawyer', stat: 'charisma', base: 0.2, perLevel: 0.04, divisor: 250, max: 0.6 },
  raidWarning: { role: 'policeContact', stat: 'charisma', base: 0.5, perLevel: 0.05, divisor: 200, max: 0.9 },
} as const;

// --- Wirkungen der Spezialisten (Auftrag 46e) ---

/** Eine Wirkung eines Spezialisten: Rolle, Richtung und Anteil (normal bzw. gut), dazu Texte für die Oberfläche. */
export interface SpecialistEffectDef {
  role: StaffRole;
  /** 'less': Chance, Dauer oder Betrag mal (1 − Anteil); 'more': mal (1 + Anteil). */
  kind: 'less' | 'more';
  /** Anteil bei Schlüsselwerten um SPECIALIST_NORMAL_STAT … */
  normal: number;
  /** … und ab SPECIALIST_GOOD_STAT („gut“), dazwischen linear. */
  good: number;
  /** Kurz für den Chip („Zoll −30 %“). */
  label: string;
  /** Ein Satzteil für „Mehr dazu“ („Beschlagnahme am Kai und auf Routen“). */
  hint: string;
  icon: string;
}

/**
 * Mittel der Schlüsselwerte (ROLE_INFO.keyStats), bis zu dem die normale Wirkung gilt, und ab dem die gute gilt.
 * Dazwischen skaliert die Wirkung linear mit der Person (wie bei traitFactor zählen die Werte, auf die es ankommt).
 */
export const SPECIALIST_NORMAL_STAT = 50;
export const SPECIALIST_GOOD_STAT = 70;

/**
 * Was Polizei-Kontakt, Anwalt und Buchhalter bewirken (Auftrag 46e). Pro Stadt wirkt eine Person, die beste ihrer
 * Rolle; mehrere stapeln nicht. Die Module fragen specialistFactor(state, key, cityId) an der Stelle, an der sie
 * würfeln oder buchen, nie `if (role === 'accountant')` im Ablauf.
 */
export const SPECIALIST_EFFECTS = {
  /** Polizei-Kontakt: Beschlagnahme am Kai und auf Routen (Zoll), auch bei Lieferungen über eine Grenze. */
  seizure: {
    role: 'policeContact',
    kind: 'less',
    normal: 0.3,
    good: 0.5,
    label: 'Zoll',
    hint: 'Beschlagnahme am Kai, auf Routen und an der Grenze',
    icon: 'anchor',
  },
  /** Polizei-Kontakt: Heat-Zuwachs in der Stadt. */
  heatGain: {
    role: 'policeContact',
    kind: 'less',
    normal: 0.15,
    good: 0.25,
    label: 'Heat',
    hint: 'jeder Heat-Zuwachs in der Stadt',
    icon: 'flame',
  },
  /** Polizei-Kontakt: Chance auf Polizei- und Verkehrskontrollen. */
  checks: {
    role: 'policeContact',
    kind: 'less',
    normal: 0.25,
    good: 0.4,
    label: 'Kontrollen',
    hint: 'Polizei- und Verkehrskontrollen',
    icon: 'siren',
  },
  /** Anwalt: Festnahmen der eigenen Leute (Kontrollen, Razzien, aufgeflogene Ladungen). */
  arrests: {
    role: 'lawyer',
    kind: 'less',
    normal: 0.3,
    good: 0.5,
    label: 'Verhaftungen',
    hint: 'Festnahmen deiner Leute bei Kontrollen, Razzien und aufgeflogenen Ladungen',
    icon: 'jail',
  },
  /** Anwalt: Haft halb so lang. */
  jailTime: {
    role: 'lawyer',
    kind: 'less',
    normal: 0.5,
    good: 0.5,
    label: 'Haft',
    hint: 'Haftdauer deiner Leute',
    icon: 'clock',
  },
  /** Buchhalter: jeder Verkaufserlös (Straße, Lieferungen, Großhandel). */
  revenue: {
    role: 'accountant',
    kind: 'more',
    normal: 0.03,
    good: 0.07,
    label: 'Erlös',
    hint: 'jeder Verkaufserlös (Straße, Lieferungen, Großhandel)',
    icon: 'cash',
  },
  /** Buchhalter: Löhne aller Leute der Stadt. */
  wages: {
    role: 'accountant',
    kind: 'less',
    normal: 0.05,
    good: 0.1,
    label: 'Löhne',
    hint: 'die Löhne aller Leute in der Stadt',
    icon: 'users',
  },
} as const satisfies Record<string, SpecialistEffectDef>;

export type SpecialistEffect = keyof typeof SPECIALIST_EFFECTS;

/** Rollen, von denen es pro Stadt nur eine Person geben darf (Auftrag 46e: nur ein Buchhalter, kein Stapeln). */
export const ONE_PER_CITY_ROLES: readonly StaffRole[] = ['accountant'];

/** Nach der angekündigten Razzia bleiben abgetauchte Leute noch so lange weg, dann gehen sie zurück an ihren Platz. */
export const HIDE_AFTER_RAID = 60;
/** Länger als so lange taucht niemand ab. */
export const MAX_HIDE_DURATION = 2 * 1440;

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

/**
 * Hintergründe pro Rolle. {veedel} wird beim Anheuern mit einem Veedel der Stadt gefüllt (Auftrag 43: kein Chorweiler in
 * Hamburg), fest aus Name und Zeit, ohne die Würfelfolge zu verschieben.
 */
export const BACKGROUNDS: Record<StaffRole, readonly string[]> = {
  runner: [
    'Hat die Schule geschmissen und kennt jeden in {veedel}.',
    'Studiert im vierzehnten Semester und braucht Geld für die Miete.',
    'Hat früher an der Tanke gejobbt, bis die Kasse nicht stimmte.',
    'Wuchs in {veedel} auf, hat früh gelernt, den Mund zu halten.',
    'Verkauft seit Jahren an Freunde, jetzt will er mehr.',
    'Kommt aus {veedel} und hat Schulden bei den falschen Leuten.',
  ],
  courier: [
    'Fährt tagsüber Pizza aus und kennt jede Einbahnstraße.',
    'Ehemaliger Fahrradkurier, schneller als jede Streife.',
    'Hat den Führerschein seit drei Wochen und fährt wie ein Irrer.',
    'Lieferfahrer mit altem Transporter und wenig Fragen.',
  ],
  driver: [
    'Ist zwanzig Jahre Lkw gefahren, bis der Rücken nicht mehr wollte.',
    'Hat einen Sprinter ohne Firmenlogo und stellt keine Fragen.',
    'Kennt jede Kontrollstelle rund um {veedel}.',
    'Fährt nachts Pakete und tagsüber das, was sonst keiner fahren will.',
  ],
  security: [
    'Ex-Türsteher aus {veedel}, hat schon alles gesehen.',
    'Kampfsportler, der nach einer Verletzung nicht mehr antreten darf.',
    'War bei der Bundeswehr und redet nicht darüber.',
    'Hat in {veedel} ein Fitnessstudio und zu viel Zeit.',
    'Hat für eine der Gangs gearbeitet und ist im Streit gegangen.',
  ],
  lawyer: [
    'Strafverteidiger mit Spielschulden.',
    'Hat eine kleine Kanzlei in {veedel} und teure Hobbys.',
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
    'Polizeiobermeister in {veedel}, kurz vor der Pension.',
    'Sachbearbeiterin im Präsidium mit Zugriff auf die Einsatzpläne.',
    'Streifenpolizist mit Spielsucht.',
    'Hat seine Beförderung nie bekommen und ist entsprechend gelaunt.',
  ],
  worker: [
    'Hat sein Leben lang auf den Feldern gearbeitet, für wen auch immer.',
    'Kommt aus dem Dorf unten am Fluss und schickt jeden Peso nach Hause.',
    'Hat früher Kaffee gepflückt, bis der Preis fiel.',
  ],
  gardener: [
    'Züchtet seit zwanzig Jahren Pflanzen, die nicht im Katalog stehen.',
    'Hat Agrarwissenschaft studiert und weiß, was er nicht sagen darf.',
    'Kennt jede Sorte am Hang beim Namen und jede Krankheit am Geruch.',
  ],
};

// --- Eigenschaften (Auftrag 34) ---

/**
 * Wie eine Eigenschaft wirkt. Alle Faktoren sind klein (1 = keine Wirkung) und gleichen sich über ein Team aus:
 * abwechslungsreicher, nicht härter. Der Lohnwunsch liegt im Schnitt bei 1 (mehr: Familie, Ehrgeiz, Charme; weniger:
 * Trinker, Angsthasen, Treue, Hitzköpfe); ohne diesen Ausgleich brauchte Köln komplett anderthalb Tage länger.
 */
export interface TraitInfo {
  name: string;
  /** Name für Frauen, wenn er anders lautet. */
  nameFeminine?: string;
  /** Ein Satz für die Oberfläche. */
  hint: string;
  icon: string;
  /** Färbung des Chips: gut, schlecht oder beides. */
  tone: 'good' | 'bad' | 'mixed';
  /** Gewicht beim Würfeln. */
  weight: number;
  /** Loyalität pro Tag. */
  loyaltyDay?: number;
  /** Faktor auf den erwarteten Lohn. */
  wage?: number;
  /** Faktor auf das Risiko (Festnahme, Entdeckung). */
  risk?: number;
  /** Faktor auf die Zeit pro Kunde (kleiner = schneller). */
  pace?: number;
  /** Faktor auf die Kampfkraft. */
  combat?: number;
  /** Faktor auf die Erfahrung. */
  xp?: number;
  /** Faktor auf die Chance für Verrat. */
  betrayal?: number;
  /** Faktor auf die Chance, dass jemand redet (Entlassung, Haft). */
  talk?: number;
  /** Faktor auf Angst (Loyalität bei Festnahmen nebenan, Razzien, Heat). */
  fear?: number;
}

export const TRAITS: Record<TraitId, TraitInfo> = {
  family: {
    name: 'Familienvater',
    nameFeminine: 'Familienmutter',
    hint: 'Vorsichtig, braucht aber öfter Geld oder einen freien Tag.',
    icon: 'home',
    tone: 'mixed',
    weight: 3,
    risk: 0.9,
    wage: 1.1,
  },
  drinker: {
    name: 'Trinkt',
    hint: 'Billig zu haben, fällt aber öfter auf und lässt auch mal den Spot stehen.',
    icon: 'beer',
    tone: 'bad',
    weight: 3,
    wage: 0.9,
    risk: 1.15,
    pace: 1.05,
  },
  gambler: {
    name: 'Spielt',
    hint: 'Hat Schulden bei den falschen Leuten. Wer klamm ist, greift eher in die Kasse.',
    icon: 'dice',
    tone: 'bad',
    weight: 2,
    betrayal: 1.5,
  },
  ambitious: {
    name: 'Ehrgeizig',
    hint: 'Lernt schneller, will aber mehr Geld und irgendwann mehr Verantwortung.',
    icon: 'rocket',
    tone: 'mixed',
    weight: 3,
    xp: 1.15,
    wage: 1.15,
  },
  coward: {
    name: 'Angsthase',
    hint: 'Will wenig, hält sich aus Ärger raus und rettet zuerst die Ware. Razzien schlagen auf die Laune.',
    icon: 'frown',
    tone: 'mixed',
    weight: 2,
    wage: 0.9,
    combat: 0.75,
    risk: 0.85,
    fear: 2,
  },
  braggart: {
    name: 'Maulheld',
    hint: 'Redet zu viel, in der Kneipe und bei den Bullen.',
    icon: 'megaphone',
    tone: 'bad',
    weight: 2,
    risk: 1.1,
    talk: 1.5,
  },
  loyal: {
    name: 'Treu wie Gold',
    hint: 'Verrät dich nicht und hält in Haft dicht.',
    icon: 'heart',
    tone: 'good',
    weight: 2,
    wage: 0.95,
    betrayal: 0,
    talk: 0,
  },
  hothead: {
    name: 'Hitzkopf',
    hint: 'Geht bei Ärger dazwischen und fängt einen Treffer ab, schlägt aber auch mal einen Kunden.',
    icon: 'flame',
    tone: 'mixed',
    weight: 2,
    wage: 0.95,
    combat: 1.2,
    risk: 1.05,
  },
  charmer: {
    name: 'Charmant',
    hint: 'Kunden bleiben gern stehen; in Konfrontationen eine zweite Verhandlung.',
    icon: 'smile',
    tone: 'good',
    weight: 2,
    pace: 0.95,
    wage: 1.05,
  },
  nimble: {
    name: 'Flink',
    hint: 'Bedient schneller und bringt in Konfrontationen die halbe Ware in Sicherheit.',
    icon: 'bolt',
    tone: 'good',
    weight: 2,
    pace: 0.95,
  },
};

/** Paare, die nicht zusammen vorkommen. */
export const TRAIT_EXCLUDES: readonly (readonly [TraitId, TraitId])[] = [
  ['coward', 'hothead'],
  ['loyal', 'gambler'],
  ['charmer', 'braggart'],
];

/** So oft hat jemand drei statt zwei Eigenschaften. */
export const THIRD_TRAIT_CHANCE = 0.35;

// --- Beziehungen (Auftrag 34) ---

export interface RelationInfo {
  name: string;
  icon: string;
  tone: 'good' | 'bad';
  /** Gewicht, wenn beim Einstellen eine Beziehung entsteht. */
  weight: number;
  /** Loyalität der anderen Person, wenn eine entlassen wird bzw. stirbt bzw. festgenommen wird. */
  fired: number;
  died: number;
  jailed: number;
  /** Chance, dass die andere Person mitgeht, wenn eine entlassen wird. */
  leaveWith: number;
  /** Faktor auf die Zeit pro Kunde, wenn beide am selben Spot sind (kleiner = schneller). */
  samePlace: number;
  /** Loyalität pro Tag, solange beide aktiv sind bzw. eine von beiden sitzt. */
  dayTogether: number;
  dayApart: number;
}

export const RELATIONS: Record<RelationKind, RelationInfo> = {
  friends: {
    name: 'Befreundet',
    icon: 'handshake',
    tone: 'good',
    weight: 4,
    fired: -10,
    died: -15,
    jailed: -3,
    leaveWith: 0.1,
    samePlace: 0.9,
    dayTogether: 0,
    dayApart: 0,
  },
  siblings: {
    name: 'Geschwister',
    icon: 'users',
    tone: 'good',
    weight: 1,
    fired: -20,
    died: -30,
    jailed: -6,
    leaveWith: 0.3,
    samePlace: 0.9,
    dayTogether: 0,
    dayApart: -1,
  },
  rivals: {
    name: 'Rivalen',
    icon: 'swords',
    tone: 'bad',
    weight: 3,
    fired: 4,
    died: -3,
    jailed: 2,
    leaveWith: 0,
    samePlace: 1.15,
    dayTogether: 0,
    dayApart: 0,
  },
  couple: {
    name: 'Ein Paar',
    icon: 'heart',
    tone: 'good',
    weight: 1,
    fired: -25,
    died: -40,
    jailed: -8,
    leaveWith: 0.4,
    samePlace: 0.9,
    dayTogether: 1,
    dayApart: -2,
  },
};

/** Chance, dass beim Einstellen eine Beziehung zu jemandem im Team entsteht. */
export const RELATION_CHANCE = 0.3;
/** Empfehlungen: So oft ist die neue Person mit der empfehlenden befreundet (sonst Geschwister oder Paar). */
export const REFERRAL_FRIENDS_SHARE = 0.7;
/** Höchstens so viele Beziehungen pro Person. */
export const RELATIONS_PER_PERSON = 2;
/** Höchstens eine Beziehung auf so viele Leute im Team (wenige pro Team). */
export const RELATION_TEAM_SHARE = 3;

// --- Geschichten (Auftrag 34) ---

/** Mindestabstand zwischen zwei Geschichten in einer Stadt. */
export const STORY_GAP = 1.5 * 1440;
/** Danach pro Stunde (tagsüber) diese Chance auf eine Geschichte. */
export const STORY_CHANCE_PER_HOUR = 0.06;
/** Geschichten kommen zwischen diesen Stunden. */
export const STORY_HOURS: [number, number] = [9, 22];
/** Abstand pro Person und pro Vorlage. */
export const STORY_PERSON_GAP = 7 * 1440;
export const STORY_TEMPLATE_GAP = 4 * 1440;
/** Antwortfrist. */
export const STORY_EXPIRES = 8 * 60;
/** Ab so vielen Leuten in der Stadt gibt es Geschichten. */
export const STORY_MIN_TEAM = 2;
/** Gewichte der Vorlagen beim Würfeln (Vorlagen in stories.ts). */
export const STORY_WEIGHTS: Record<StoryId, number> = {
  loan: 3,
  familyTime: 2,
  drunk: 3,
  hangover: 2,
  debt: 3,
  gamblerWin: 1,
  promotion: 3,
  raise: 2,
  bragged: 3,
  scared: 3,
  loyalTip: 2,
  hothead: 3,
  rivalsFight: 4,
  friendsParty: 2,
  coupleMoveIn: 2,
  siblingJailed: 4,
};
