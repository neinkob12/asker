// Farbe einer App-Kachel: eine Bedeutungsfarbe des Spiels oder (für alte Module) eine CSS-Farbe.

import type { JSX } from 'preact';
import { type ChipColor, isChipColor } from '../components';

/** Bedeutungsfarbe oder CSS-Farbe, aus der der Verlauf der Kachel abgeleitet wird (Symbol darauf in Weiß). */
export function tileColor(color: string): { color: ChipColor; style?: JSX.CSSProperties } {
  if (isChipColor(color)) return { color };
  return {
    color: 'system',
    style: {
      '--chip-a': `color-mix(in srgb, ${color} 88%, white)`,
      '--chip-b': `color-mix(in srgb, ${color} 78%, black)`,
      '--chip-on': '#ffffff',
    } as JSX.CSSProperties,
  };
}
