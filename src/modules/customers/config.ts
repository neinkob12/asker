// Alle Zeiten in Spielminuten. Werte aus dem Prototyp.

/** So lange wartet ein Kunde, bevor er abhaut. */
export const CUSTOMER_PATIENCE = 180;
export const MAX_CUSTOMERS_PER_SPOT = 4;
/** Mittlerer Abstand zwischen zwei Kunden an einem Spot mit Andrang 1. */
export const BASE_SPAWN_INTERVAL = 120;
export const CUSTOMER_MIN_AMOUNT = 1;
export const CUSTOMER_MAX_AMOUNT = 5;
/** Preisschwankung pro Kunde: ±10 %. */
export const PRICE_SPREAD = 0.1;

/** Nachfrage je nach Uhrzeit: abends und nachts ist mehr los. */
export function hourDemandMultiplier(hour: number): number {
  if (hour >= 18 || hour < 2) return 1.6;
  if (hour >= 2 && hour < 6) return 0.6;
  if (hour >= 6 && hour < 12) return 0.4;
  return 1.0;
}
