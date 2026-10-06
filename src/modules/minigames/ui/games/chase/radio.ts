// Funk-Zeile der Verfolgungsjagd: Was die Zentrale und die Streifen sagen, mit dem Veedel, in dem es gerade passiert
// (veedelAt). Reine Texte als Daten; welche Zeile kommt, wechselt der Reihe nach (keine direkte Wiederholung).

import type { ChaseState } from './model';

export type RadioKind = 'cop' | 'roadblock' | 'heli' | 'lost' | 'spotted' | 'heading' | 'search';

/** {v} = Veedel (fehlt es, fällt der Teil mit „in“/„Richtung“ weg). */
const LINES: Record<RadioKind, readonly string[]> = {
  cop: [
    'Zentrale: Weitere Streife unterwegs{in}.',
    'Streife 3: Übernehmen{in}, sind gleich dran.',
    'Zentrale: Verstärkung rückt an{in}.',
  ],
  roadblock: [
    'Zentrale: Sperre steht{in}. Kreuzung vor ihm dicht.',
    'Streife 4: Wir machen die Kreuzung zu{in}.',
    'Zentrale: Straßensperre{in}, Einheiten in Position.',
  ],
  heli: ['Zentrale: Hubschrauber ist in der Luft{in}.', 'Hubschrauber: Bin über{at}, Scheinwerfer an.'],
  lost: [
    'Streife 1: Sichtkontakt verloren{in}.',
    'Zentrale: Letzte Position{in}. Alle Einheiten suchen.',
    'Streife 2: Der ist weg. Irgendwo{in}.',
  ],
  spotted: ['Streife 2: Hab ihn wieder{in}!', 'Zentrale: Sichtkontakt{in}, dranbleiben.', 'Streife 1: Da ist er{in}!'],
  heading: [
    'Zentrale: Fahrzeug Richtung{to}.',
    'Streife 1: Er fährt Richtung{to}.',
    'Zentrale: Flüchtiger jetzt in{to}.',
  ],
  search: ['Zentrale: Fahndung ausgeweitet auf{to}.', 'Streife 3: Wir suchen{in}, noch nichts.'],
};

/** Eine Funk-Zeile; n zählt die bisherigen Zeilen (wechselt die Variante). */
export function radioLine(_state: ChaseState, kind: RadioKind, veedel: string, n: number): string {
  const list = LINES[kind];
  const line = list[n % list.length];
  return line
    .replace('{in}', veedel ? ` in ${veedel}` : '')
    .replace('{at}', veedel ? ` ${veedel}` : ' euch')
    .replace('{to}', veedel ? ` ${veedel}` : ' unbekannt');
}
