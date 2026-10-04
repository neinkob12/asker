// Wann muss die Veedel-Ebene der Karte neu gesetzt werden? Nur, wenn sich etwas Sichtbares ändert. DOM-frei, damit
// man es ohne Browser testen kann.

import type { GameState } from '../../../core';
import { getHeat } from '../../police';
import { allVeedel } from '../../veedel';
import { controllerOf } from '../index';
import type { VeedelMapView } from './view';

/** So grob wird Heat auf der Karte gerundet: Die Farbe (0 bis 75) und die Deckkraft (0 bis 100) ändern sich darunter nicht sichtbar. */
export const HEAT_BUCKET = 5;

export function heatBucket(heat: number): number {
  return Math.round(heat / HEAT_BUCKET) * HEAT_BUCKET;
}

/**
 * Kennung für "hat sich etwas Sichtbares geändert?", damit die Daten nicht bei jedem Schritt neu gesetzt werden.
 * Heat zählt nur in der Heat-Ansicht und nur in Stufen (`HEAT_BUCKET`): Bei Tempo 4× ändert er sich sonst fast jede Minute.
 */
export function veedelSignature(state: GameState, view: VeedelMapView): string {
  return `${view}|${allVeedel()
    .map((v) => {
      const owner = controllerOf(state, v.id);
      return view === 'heat' ? `${owner}:${heatBucket(getHeat(state, v.id))}` : `${owner}`;
    })
    .join(',')}`;
}
