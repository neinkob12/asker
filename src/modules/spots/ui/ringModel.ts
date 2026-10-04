// Geduld-Ring am Spot-Marker (nur Rechnen, kein DOM): wie viel Geduld der ungeduldigste wartende Kunde noch hat.
// Der Bodenring zeigt das als Bogen: voll = frisch angekommen, fast leer = geht gleich.

import { CUSTOMER_PATIENCE, type Customer } from '../../customers';

/** Schrittweite in Prozent: so oft ändert sich der Ring höchstens, nicht mit jeder Spielminute. */
export const RING_STEP = 5;

/**
 * Anteil der Geduld (0–100, in RING_STEP-Schritten), den der ungeduldigste Kunde noch hat. Ohne Wartende ist der
 * Ring voll. Solange jemand wartet, bleibt ein Rest sichtbar (mindestens RING_STEP), sonst sähe der Ring leer aus.
 * Stammkunden warten länger als CUSTOMER_PATIENCE, dann ist der Ring einfach voll.
 */
export function patienceFill(now: number, waiting: readonly Pick<Customer, 'expiresAt'>[]): number {
  if (waiting.length === 0) return 100;
  const minLeft = waiting.reduce((least, c) => Math.min(least, c.expiresAt - now), Number.POSITIVE_INFINITY);
  const share = Math.min(1, Math.max(0, minLeft / CUSTOMER_PATIENCE));
  const steps = Math.round((share * 100) / RING_STEP);
  return Math.max(RING_STEP, steps * RING_STEP);
}
