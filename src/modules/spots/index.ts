// Spots: Orte, an denen auf der Straße verkauft wird. Jeder Spot liegt in einem Veedel.
// Stand Fundament: die vorgegebenen Spots des Prototyps, alle offen, kein eigener Zustand.
// Freischalten und eigene Spots per Klick baut Auftrag 12.
//
// Öffentliche API:
//   getSpots(state), getSpot(state, id), spotsInVeedel(state, veedelId)

import { defineModule, type GameState } from '../../core';
import { PRESET_SPOTS } from './config';

export interface Spot {
  id: string;
  name: string;
  lng: number;
  lat: number;
  veedelId: string;
  /** Wie oft hier Kunden auftauchen (1 = normal). */
  demand: number;
  /** Aufschlag auf den Richtpreis (1 = normal). */
  priceMultiplier: number;
}

/** Alle Spots, an denen gerade verkauft werden kann. */
export function getSpots(_state: GameState): readonly Spot[] {
  return PRESET_SPOTS;
}

export function getSpot(state: GameState, id: string): Spot | undefined {
  return getSpots(state).find((s) => s.id === id);
}

export function spotsInVeedel(state: GameState, veedelId: string): Spot[] {
  return getSpots(state).filter((s) => s.veedelId === veedelId);
}

export default defineModule({
  id: 'spots',
  version: 1,
  dependsOn: ['veedel'],
});
