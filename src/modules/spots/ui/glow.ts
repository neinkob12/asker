// Merker für die Optik der Spots: letzte Verkäufe (Hotspot-Glimmen) und letzte Razzia (Marker blau). Reine Optik,
// nicht im Spielstand. DOM-frei, damit man es ohne Browser testen kann.
//
// Die Merker gehören zu einem Durchgang (`meta.runId`) und zu einer Spielzeit: Bei „Neues Spiel“ oder dem Laden eines
// anderen Durchgangs werden sie geleert, bei einem früheren Stand desselben Durchgangs fallen Einträge aus der
// „Zukunft“ weg. Sonst zeigte ein Spot nach dem Laden eine Razzia, die es dort nie gab.

import type { GameState } from '../../../core';

/** So viele Spielminuten wirkt ein Verkauf im Hotspot nach (klingt linear ab). */
export const SALE_GLOW_MINUTES = 90;
/** So lange zeigt ein Spot nach einer Razzia den Zustand "Razzia" (Spielminuten). */
export const RAID_SHOW_MINUTES = 120;

/** Letzte Verkäufe je Spot (Spielzeit). */
const recentSales = new Map<string, number[]>();
/** Letzte Razzia je Spot (Spielzeit). */
const recentRaids = new Map<string, number>();
let lastRun: string | null = null;
let lastTime = 0;

/** Alles vergessen. */
export function resetSpotGlow(): void {
  recentSales.clear();
  recentRaids.clear();
  lastRun = null;
  lastTime = 0;
}

/**
 * Vor dem Lesen und Schreiben aufrufen: leert die Merker bei einem anderen Durchgang und wirft Einträge weg, die nach
 * der aktuellen Spielzeit liegen (früherer Spielstand). Billig: zwei Vergleiche, wenn nichts passiert ist.
 */
export function syncSpotGlow(state: GameState): void {
  if (state.meta.runId !== lastRun) {
    resetSpotGlow();
    lastRun = state.meta.runId;
  } else if (state.time < lastTime) {
    for (const [spotId, list] of recentSales) {
      const kept = list.filter((at) => at <= state.time);
      if (kept.length === 0) recentSales.delete(spotId);
      else recentSales.set(spotId, kept);
    }
    for (const [spotId, at] of recentRaids) if (at > state.time) recentRaids.delete(spotId);
  }
  lastTime = state.time;
}

/** Einen Verkauf am Spot für den Hotspot merken. */
export function recordSaleGlow(spotId: string, time: number): void {
  const list = recentSales.get(spotId) ?? [];
  list.push(time);
  while (list.length > 8) list.shift();
  recentSales.set(spotId, list);
}

/** Eine Razzia am Spot merken (der Marker wird eine Weile blau). */
export function recordSpotRaid(spotId: string, time: number): void {
  recentRaids.set(spotId, time);
}

/** Glimmen durch letzte Verkäufe (0 = nichts, je Verkauf bis 1, klingt ab). */
export function saleGlow(spotId: string, now: number): number {
  let glow = 0;
  for (const at of recentSales.get(spotId) ?? []) {
    const age = now - at;
    if (age >= 0 && age < SALE_GLOW_MINUTES) glow += 1 - age / SALE_GLOW_MINUTES;
  }
  return glow;
}

/** Zeigt der Spot gerade noch die Razzia? */
export function raidShown(spotId: string, now: number): boolean {
  const at = recentRaids.get(spotId);
  return at !== undefined && now - at >= 0 && now - at < RAID_SHOW_MINUTES;
}
