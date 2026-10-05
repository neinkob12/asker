// Statthalter (Auftrag 36): So heißt die Rechte Hand, die eine Stadt mit Vollmacht führt (rightHandTitle). Keine neue
// Person, nur ein Titel mit Gesicht auf der Deutschland-Ansicht und dem Bericht aus der Stadt.
//
// Das Startpaket aus Auftrag 36 (neue Rechte Hand und Leute aus der alten Stadt) gibt es seit dem Feedback vom
// 05.10.2026 nicht mehr: Leute bleiben in der Stadt, in der du sie angeheuert hast, und arbeiten dort für den
// Statthalter. Bei der Übergabe kommen nur Startgeld und auf Wunsch Fahrzeuge mit (city.handOver).

import type { GameState } from '../../core';
import { cityName } from '../city';
import { hasFullPower } from './fullpower';

/** Titel der Rechten Hand einer Stadt: mit Vollmacht Statthalter. */
export function rightHandTitle(state: GameState, cityId: string): string {
  return hasFullPower(state, cityId) ? `Statthalter von ${cityName(cityId)}` : 'Rechte Hand';
}
