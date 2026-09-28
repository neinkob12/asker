// Alle Zeiten in Spielminuten.
export const GAME_MINUTES_PER_REAL_SECOND = 5;

export const START_TIME = 18 * 60; // Tag 1, 18:00
export const START_MONEY = 1500;
export const START_STOCK = 40;

export const BASE_STREET_PRICE = 10; // Euro pro Gramm

export interface Package {
  id: string;
  label: string;
  grams: number;
  price: number;
}

export const PACKAGES: Package[] = [
  { id: 'small', label: '100 g', grams: 100, price: 450 },
  { id: 'medium', label: '500 g', grams: 500, price: 2000 },
  { id: 'large', label: '1 kg', grams: 1000, price: 3600 },
];

export const SHIPMENT_DURATION = 750; // 12,5 Spielstunden = 2,5 echte Minuten

export const CUSTOMER_PATIENCE = 180;
export const MAX_CUSTOMERS_PER_SPOT = 4;
export const BASE_SPAWN_INTERVAL = 120;
export const CUSTOMER_MIN_GRAMS = 1;
export const CUSTOMER_MAX_GRAMS = 5;

export const RUNNER_HIRE_COST = 600;
export const RUNNER_DAILY_WAGE = 80;
export const RUNNER_SERVE_TIME = 20;

export const LOG_LIMIT = 40;

/** Nachfrage je nach Uhrzeit: abends und nachts ist mehr los. */
export function hourDemandMultiplier(hour: number): number {
  if (hour >= 18 || hour < 2) return 1.6;
  if (hour >= 2 && hour < 6) return 0.6;
  if (hour >= 6 && hour < 12) return 0.4;
  return 1.0;
}
