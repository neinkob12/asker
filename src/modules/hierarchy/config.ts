import type {
  AbsentPolicy,
  CautionLevel,
  FullPowerTaskKey,
  LieutenantSettings,
  PriceLevel,
  RightHandSettings,
  RightHandTaskKey,
} from './types';

// Einstellbare Werte der Hierarchie. Zeiten in Spielminuten, Geld in Euro (Schwarzgeld).

/** Ab diesem Level kann jemand Leutnant werden. */
export const LIEUTENANT_MIN_LEVEL = 2;
/** So viele Spots führt ein Leutnant höchstens (frei gewählt, auch über Veedel-Grenzen). */
export const MAX_SPOTS_PER_LIEUTENANT = 3;
/**
 * Lohnanspruch eines Leutnants nach Zahl seiner Spots (Index = Spots, 0 und 1 gleich): Wer mehr führt, will mehr.
 * Ein Leutnant mit drei vollen Spots soll sich klar rechnen.
 */
export const LIEUTENANT_DEMAND_BY_SPOTS = [1.3, 1.3, 1.55, 1.8];
/** Höchster Anspruch (alte Spielstände, Prüfungen). */
export const LIEUTENANT_DEMAND = LIEUTENANT_DEMAND_BY_SPOTS[MAX_SPOTS_PER_LIEUTENANT];
/** Loyalität bei Beförderung bzw. Abberufung. */
export const PROMOTION_LOYALTY = 15;
export const DEMOTION_LOYALTY = -10;

/** Wie oft der Leutnant tickt (prüft, ob er handeln oder selbst verkaufen kann). */
export const TICK_EVERY = 5;
/** Abstand zwischen zwei Runden, in denen er sein Veedel ordnet: Grundwert, schneller mit Tempo und Level. */
export const ACTION_INTERVAL_BASE = 80;
export const ACTION_INTERVAL_MIN = 20;

/** Ausbildung: Läufer im Veedel eines Leutnants bekommen pro Verkauf so viel Erfahrung zusätzlich. */
export const TRAINING_XP = 2;
/** Der Leutnant selbst bekommt pro Verkauf in seinem Veedel so viel Erfahrung. */
export const LIEUTENANT_XP_PER_SALE = 2;

export const DEFAULT_SETTINGS: LieutenantSettings = {
  priceLevel: 'keep',
  caution: 'normal',
  mayHire: true,
  hireBudgetPerDay: 800,
  mayOrder: true,
  reserve: 500,
  onAbsent: 'fireAndReplace',
  absentDays: 2,
  orderRules: [
    {
      id: 'r1',
      productId: null,
      supplierId: null,
      packageId: null,
      minStock: 60,
      warehouseId: null,
      paused: null,
    },
  ],
};

/** Auswahl für die Oberfläche und Prüfung der Befehle. */
export const MIN_STOCK_OPTIONS = [0, 25, 50, 100, 200, 400];
export const RESERVE_OPTIONS = [0, 500, 1000, 2000];
export const HIRE_BUDGET_OPTIONS = [0, 400, 800, 1500, 3000];
export const ABSENT_DAYS_OPTIONS = [1, 2, 3];
/** Höchstens so viele Bestellregeln pro Leutnant. */
export const MAX_ORDER_RULES = 6;

export const ABSENT_POLICIES: Record<AbsentPolicy, { name: string; hint: string }> = {
  wait: { name: 'Abwarten', hint: 'Er lässt den Platz frei, bis die Person zurück ist, und fragt dich.' },
  replace: {
    name: 'Ersetzen',
    hint: 'Er stellt sofort jemand anderen hin. Wer zurückkommt, ist frei für andere Spots.',
  },
  fireAndReplace: {
    name: 'Ersetzen, später entlassen',
    hint: 'Er stellt sofort jemand anderen hin und entlässt Leute, die zu lange ausfallen.',
  },
  fireNow: {
    name: 'Sofort entlassen und ersetzen',
    hint: 'Wer sitzt oder verletzt ist, fliegt sofort raus, und er stellt jemand Neues hin. Wer ohne Stillhaltegeld rausfliegt, redet eher.',
  },
};

/**
 * Preisniveau: Der Leutnant setzt an seinen Spots eigene Preise (Befehl 'market.setPrice') als Anteil vom
 * Richtpreis. null = Richtpreis (eigene Preise löschen), 'keep' fasst die Preise nicht an.
 */
export const PRICE_LEVELS: Record<PriceLevel, { name: string; hint: string; factor: number | null }> = {
  keep: { name: 'Lassen', hint: 'Die Preise an seinen Spots lässt er, wie du sie gesetzt hast.', factor: null },
  volume: { name: 'Günstig', hint: '10 % unter Richtpreis: mehr Kundschaft, weniger Marge.', factor: 0.9 },
  fair: { name: 'Richtpreis', hint: 'Verkauft zum Richtpreis des Markts.', factor: 1 },
  premium: { name: 'Teuer', hint: '15 % über Richtpreis: mehr Marge, weniger Kundschaft.', factor: 1.15 },
};
/** So weit darf der eigene Preis vom Ziel abweichen, bevor er nachzieht (der Richtpreis schwankt). */
export const PRICE_TOLERANCE = 0.03;

/** Ab diesem Heat zieht der Leutnant die Läufer von der Straße, darunter (minus Abstand) schickt er sie zurück. */
export const CAUTION_LEVELS: Record<CautionLevel, { name: string; hint: string; heat: number }> = {
  bold: { name: 'Mutig', hint: 'Bleibt draußen, egal wie heiß es wird.', heat: 101 },
  normal: { name: 'Normal', hint: 'Zieht die Leute ab 75 Heat ab.', heat: 75 },
  careful: { name: 'Vorsichtig', hint: 'Zieht die Leute schon ab 45 Heat ab.', heat: 45 },
};
export const HEAT_HYSTERESIS = 15;

// --- Zufriedenheit ---

/** Darunter beschwert sich der Leutnant und verliert Loyalität, darüber gewinnt er. */
export const SATISFACTION_LOW = 35;
export const SATISFACTION_HIGH = 70;
export const SATISFACTION_LOYALTY_LOW = -3;
export const SATISFACTION_LOYALTY_HIGH = 1;
/** Ein zufriedener Leutnant mit Charisma ab 55 hält auch seine Läufer bei Laune (Loyalität pro Tag). */
export const TEAM_LOYALTY = 1;
/** Höchstens so oft beschwert er sich per Nachricht. */
export const COMPLAINT_COOLDOWN = 2 * 1440;
/** Einträge im Protokoll des Leutnants. */
export const LOG_LIMIT = 12;

/** Nach einer Razzia-Warnung bleibt der Leutnant mit seinen Leuten so lange nach der Razzia weg. */
export const HIDE_AFTER_RAID = 60;

// --- Rechte Hand ---

/** Voraussetzungen für die Rechte Hand: Level, Loyalität und so viele Leutnants (dann bietet das Handy die Stelle an). */
export const RIGHT_HAND_MIN_LEVEL = 4;
export const RIGHT_HAND_MIN_LOYALTY = 50;
export const RIGHT_HAND_MIN_LIEUTENANTS = 2;
/** Lohnanspruch der Rechten Hand. */
export const RIGHT_HAND_DEMAND = 2.5;
/** Die Rechte Hand hält immer die Löhne für so viele Tage zurück (gegen Anheuern und Kaution). */
export const PAYROLL_RESERVE_DAYS = 2;
/**
 * Für Nachschub an Ware hält sie nur die Löhne für so viele Tage zurück: Ware bringt das Geld wieder rein. Mit der
 * vollen Rücklage würden die Leutnants bei knapper Kasse gar nicht mehr bestellen, die Spots liefen leer und das
 * Geschäft ginge pleite (Balancing mit 16 Seeds).
 */
export const PAYROLL_RESERVE_DAYS_ORDERS = 1;
/** Uhrzeit des Tagesberichts (Stunde). */
export const REPORT_HOUR = 8;
/** So oft schaut die Rechte Hand nach dem Rechten (Spielminuten). */
export const RIGHT_HAND_INTERVAL = 60;
/** Kaution zahlt sie nur für Leute ab diesem Level (und nur mit Anwalt). */
export const RIGHT_HAND_BAIL_MIN_LEVEL = 3;
/** Höchstens so oft warnt sie, dass die Löhne nicht reichen. */
export const RIGHT_HAND_WARN_COOLDOWN = 1440;

export const DEFAULT_RIGHT_HAND_SETTINGS: RightHandSettings = {
  dailyReport: true,
  coordinate: true,
  payrollGuard: true,
  absences: true,
  budgetPerDay: 2500,
  orders: true,
  orderMaxPrice: 800,
  ordersOwnTurfOnly: false,
  pickup: true,
  restock: false,
  restockRules: [
    { id: 'r1', productId: null, supplierId: null, packageId: null, minStock: 100, warehouseId: null, paused: null },
  ],
  restockBudgetPerDay: 2500,
  staffing: false,
  wholesale: false,
  wholesaleMaxPrice: 2500,
  laundering: false,
  launderAbove: 5000,
  launderShare: 0.5,
  fullPowerTasks: { lieutenants: true, pricing: true, hr: true, expansion: true, diplomacy: true },
  protectionMax: 3000,
  dealMax: 6000,
  expansionBudgetPerDay: 4000,
};
export const RIGHT_HAND_BUDGET_OPTIONS = [1000, 2500, 5000, 10000];

// --- Rechte Hand: Aufgaben und Stufen (Auftrag 28) ---

/**
 * Aufgaben mit Stufen-Schloss. Die Stufe (1 bis RIGHT_HAND_MAX_RANK) steigt mit Erfahrung als Rechte Hand
 * (RIGHT_HAND_RANK_XP), nicht mit dem Level der Person: Beim Antritt hat sie schon Level 4, die Aufgaben soll sie
 * sich trotzdem erst verdienen. Mit allen Aufgaben an läuft Köln ohne den Spieler weiter.
 */
export const RIGHT_HAND_TASKS: readonly {
  key: RightHandTaskKey;
  name: string;
  hint: string;
  icon: string;
  rank: number;
}[] = [
  {
    key: 'orders',
    name: 'Aufträge und Handy',
    hint: 'Nimmt Lieferanfragen an, sagt im Chat für dich zu und fährt selbst mit dem Auto aus, eine Fahrt zur Zeit. Was sie nicht schafft, bleibt bei dir.',
    icon: 'car',
    rank: 1,
  },
  {
    key: 'pickup',
    name: 'Hafen abholen',
    hint: 'Schickt einen freien Fahrer der Logistik, sobald Ware am Kai liegt. Leutnants dürfen dann auch beim Hafen bestellen.',
    icon: 'anchor',
    rank: 1,
  },
  {
    key: 'restock',
    name: 'Nachbestellen für ganz Köln',
    hint: 'Bestellt nach ihren Regeln (Ware, Lieferant, Mindestbestand) mit eigenem Tagesbudget ins Hauptlager.',
    icon: 'boxes',
    rank: 2,
  },
  {
    key: 'staffing',
    name: 'Personal',
    hint: 'Stellt Bewerber für leere Spots ein und ersetzt Ausfälle, bei denen ein Leutnant nicht weiterkommt.',
    icon: 'userPlus',
    rank: 3,
  },
  {
    key: 'wholesale',
    name: 'Großhandel',
    hint: 'Nimmt Großhandels-Deals bis zu ihrem Betrag an und fährt sie selbst. Darüber bleibt es Chefsache.',
    icon: 'handshake',
    rank: 4,
  },
  {
    key: 'laundering',
    name: 'Geldwäsche',
    hint: 'Liegt mehr Schwarzgeld da als ihre Grenze, gibt sie einen Teil des Überschusses in die Wäsche.',
    icon: 'washing',
    rank: 4,
  },
];

/** Erfahrung als Rechte Hand, ab der eine Stufe erreicht ist (Index 0 = Stufe 1). */
export const RIGHT_HAND_RANK_XP = [0, 150, 400, 800, 1400];
export const RIGHT_HAND_MAX_RANK = RIGHT_HAND_RANK_XP.length;
/** Erfahrung pro erledigter Aufgabe (Lieferung, Abholung, Bestellung, Einstellung, Wäsche) und pro gutem Tagesbericht. */
export const XP_RIGHT_HAND_TASK = 15;
export const XP_RIGHT_HAND_REPORT = 30;
/** Lieferanfragen bis zu diesem Betrag traut sie sich je Stufe zu (zusätzlich zur Grenze des Spielers). */
export const RIGHT_HAND_ORDER_LIMIT_BY_RANK = [400, 800, 1500, 3000, Number.POSITIVE_INFINITY];
/** Pro Stufe über der ersten fährt sie so viel schneller (Faktor auf das Tempo). */
export const RIGHT_HAND_SPEED_PER_RANK = 0.08;
/** Fehler: Wenig Vorsicht kostet Zeit (Umwege), wenig Loyalität verleitet zum Abzweigen. */
export const RIGHT_HAND_DETOUR_CHANCE = 0.25;
export const RIGHT_HAND_DETOUR_FACTOR = 1.3;
export const RIGHT_HAND_SKIM_LOYALTY = 40;
export const RIGHT_HAND_SKIM_CHANCE = 0.15;
export const RIGHT_HAND_SKIM_SHARE = 0.1;
/** Nachbestellen: so viel Schwarzgeld fasst sie zusätzlich zur Lohnsicherung nie an. */
export const RIGHT_HAND_RESTOCK_RESERVE = 500;
/** Auswahl für die Oberfläche. */
export const RIGHT_HAND_ORDER_PRICE_OPTIONS = [200, 400, 800, 1500, 3000, 6000];
export const RIGHT_HAND_WHOLESALE_PRICE_OPTIONS = [1000, 2500, 5000, 10000, 20000];
export const RIGHT_HAND_LAUNDER_ABOVE_OPTIONS = [2000, 5000, 10000, 20000];
export const RIGHT_HAND_LAUNDER_SHARE_OPTIONS = [0.25, 0.5, 0.75];
export const RIGHT_HAND_RESTOCK_BUDGET_OPTIONS = [1000, 2500, 5000, 10000];
export const RIGHT_HAND_RESTOCK_MIN_STOCK_OPTIONS = [50, 100, 200, 400, 800];

// --- Vollmacht (Auftrag 30): Die Rechte Hand führt eine Stadt allein ---

/** Ihr Anteil am Tagesgewinn der Stadt (laut Kasse, nur bei Gewinn). */
export const FULL_POWER_SHARE = 0.8;
/** Widerruf: so viel Loyalität weniger, und so lange ist sie verstimmt (Zufriedenheit). */
export const REVOKE_LOYALTY = -20;
export const REVOKE_GRUDGE_DAYS = 7;
export const REVOKE_SATISFACTION = 25;
/** Leutnants ernennt sie ab diesem Level und dieser Loyalität. */
export const FP_LIEUTENANT_MIN_LEVEL = 3;
export const FP_LIEUTENANT_MIN_LOYALTY = 45;
/** Leutnants setzt sie ab: zwei Tage Verlust an ihren Spots oder Loyalität darunter. */
export const FP_DISMISS_LOSS_DAYS = 2;
export const FP_DISMISS_LOYALTY = 30;
/** Personal: Wer darunter liegt oder seit so vielen Tagen keinen Einsatz hatte, fliegt, wenn die Löhne drücken. */
export const FP_FIRE_LOYALTY = 25;
export const FP_FIRE_IDLE_DAYS = 3;
/** Ausbau nur, wenn die Kasse so viele Tage Löhne deckt. */
export const FP_EXPANSION_RUNWAY_DAYS = 14;
/** Preise: Ziel im Verhältnis zum Richtpreis, je nach Lage. */
export const FP_PRICE_PRICE_WAR = 0.92;
export const FP_PRICE_GOOD_REPUTATION = 1.06;
export const FP_PRICE_DEFAULT = 1;
/** Aufgaben mit Vollmacht für die Oberfläche. */
export const FULL_POWER_TASKS: readonly { key: FullPowerTaskKey; name: string; hint: string; icon: string }[] = [
  {
    key: 'lieutenants',
    name: 'Leutnants',
    hint: 'Ernennt Leutnants für Spots ohne Leutnant (ab Level 3, loyal) und setzt ab, wer zwei Tage Verlust macht oder untreu wird.',
    icon: 'crew',
  },
  {
    key: 'pricing',
    name: 'Preise',
    hint: 'Setzt die Preise an Spots ohne Leutnant um den Richtpreis, billiger im Preiskrieg, teurer bei gutem Ruf.',
    icon: 'tag',
  },
  {
    key: 'hr',
    name: 'Personal führen',
    hint: 'Entlässt Untreue und Leute ohne Einsatz, wenn die Löhne drücken.',
    icon: 'userMinus',
  },
  {
    key: 'expansion',
    name: 'Ausbau',
    hint: 'Schaltet Spots frei und kauft Lager, wenn das Tagesbudget es hergibt und die Kasse zwei Wochen Löhne deckt.',
    icon: 'building',
  },
  {
    key: 'diplomacy',
    name: 'Gangs und Chefsache',
    hint: 'Beantwortet Forderungen und Angebote der Gangs: zahlt Schutzgeld bis zu ihrem Betrag, sonst lehnt sie ab; Deals bis zu ihrem Betrag.',
    icon: 'handshake',
  },
];

/** Mit Vollmacht hält die Rechte Hand von jeder Ware so viel auf Lager (Gramm bzw. ml, Stück) und darf dafür bis zu so viel am Tag ausgeben. */
export const FP_STOCK_GRAMS = 1000;
export const FP_STOCK_PIECES = 300;
export const FP_RESTOCK_BUDGET_PER_DAY = 15000;
