import type { AbsentPolicy, CautionLevel, LieutenantSettings, PriceLevel, RightHandSettings } from './types';

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
/** Die Rechte Hand hält immer die Löhne für so viele Tage zurück. */
export const PAYROLL_RESERVE_DAYS = 2;
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
};
export const RIGHT_HAND_BUDGET_OPTIONS = [1000, 2500, 5000, 10000];
