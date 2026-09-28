// Gangs: die Gegner, die Köln zu Beginn unter sich aufgeteilt haben.
// Stand Fundament: 3 Platzhalter-Gangs ohne eigenen Zustand und ohne KI. Auftrag 11 baut sie aus.
//
// Öffentliche API:
//   getGangs(state), getGang(state, id)
//
// Achtung Abhängigkeiten: territory hängt von gangs ab (Startverteilung der Reviere). gangs darf deshalb
// nicht dependsOn: ['territory'] eintragen (Zyklus). Für API-Aufrufe zur Laufzeit ist das auch nicht nötig.

import { defineModule, type GameState } from '../../core';

export interface Gang {
  id: string;
  name: string;
  /** Farbe auf der Karte (CSS-Farbe). */
  color: string;
  /** Veedel, von dem aus die Gang ihr Revier aufgebaut hat. */
  homeVeedelId: string;
}

/** Platzhalter. Auftrag 11 ersetzt sie durch frei erfundene Gangs mit eigener Identität. */
const GANGS: readonly Gang[] = [
  { id: 'nord', name: 'Gang Nord', color: '#c0392b', homeVeedelId: 'nippes' },
  { id: 'west', name: 'Gang West', color: '#2e86de', homeVeedelId: 'ehrenfeld' },
  { id: 'ost', name: 'Gang Ost', color: '#d68910', homeVeedelId: 'kalk' },
];

/** Alle Gangs. Nimmt den Zustand, weil Gangs später entstehen und verschwinden können. */
export function getGangs(_state: GameState): readonly Gang[] {
  return GANGS;
}

export function getGang(state: GameState, id: string): Gang | undefined {
  return getGangs(state).find((g) => g.id === id);
}

export default defineModule({
  id: 'gangs',
  version: 1,
  dependsOn: ['veedel'],
});
