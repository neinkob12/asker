import type { CautionLevel, LieutenantSettings, PriceLevel } from './types';

// Einstellbare Werte der Hierarchie. Zeiten in Spielminuten, Geld in Euro (Schwarzgeld).

/** Ab diesem Level kann jemand Leutnant werden. */
export const LIEUTENANT_MIN_LEVEL = 2;
/** Leutnants verlangen so viel mehr Lohn als üblich (Anspruch). */
export const LIEUTENANT_DEMAND = 1.8;
/** Loyalität bei Beförderung bzw. Abberufung. */
export const PROMOTION_LOYALTY = 15;
export const DEMOTION_LOYALTY = -10;

/** Wie oft der Leutnant tickt (prüft, ob er handeln oder selbst verkaufen kann). */
export const TICK_EVERY = 5;
/** Abstand zwischen zwei Runden, in denen er sein Veedel ordnet: Grundwert, schneller mit Tempo und Level. */
export const ACTION_INTERVAL_BASE = 80;
export const ACTION_INTERVAL_MIN = 20;

/** So viele Spots hält ein Leutnant auf Level 1 besetzt, dazu einer mehr je zwei Level und bei Charisma ab 60. */
export const BASE_CAPACITY = 1;

/** Ausbildung: Läufer im Veedel eines Leutnants bekommen pro Verkauf so viel Erfahrung zusätzlich. */
export const TRAINING_XP = 2;
/** Der Leutnant selbst bekommt pro Verkauf in seinem Veedel so viel Erfahrung. */
export const LIEUTENANT_XP_PER_SALE = 2;

export const DEFAULT_SETTINGS: LieutenantSettings = {
  minStock: 100,
  priceLevel: 'volume',
  caution: 'normal',
  mayHire: false,
  mayOrder: true,
  reserve: 500,
};

/** Auswahl für die Oberfläche und Prüfung der Befehle. */
export const MIN_STOCK_OPTIONS = [0, 50, 100, 200, 400];
export const RESERVE_OPTIONS = [0, 500, 1000, 2000];

export const PRICE_LEVELS: Record<PriceLevel, { name: string; hint: string; priceFloor: number }> = {
  volume: { name: 'Masse', hint: 'Jeder Kunde wird bedient.', priceFloor: 0 },
  fair: { name: 'Normal', hint: 'Keine Billigkäufer (ab 95 % des Richtpreises).', priceFloor: 0.95 },
  premium: { name: 'Teuer', hint: 'Nur gut zahlende Kunden (ab 102 %). Weniger Verkäufe.', priceFloor: 1.02 },
};

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
