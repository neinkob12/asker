// Lagebestimmung der Tour-Box (reine Funktionen, getestet): Wo steht die Box zum Anker, wo zeigt der Keil hin?

import type { TourPlacement } from './types';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type BoxSide = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface BoxPosition {
  left: number;
  top: number;
  /** Auf welcher Seite des Ankers die Box steht ('center': kein Anker oder nirgends Platz genug). */
  side: BoxSide;
  /** Spitze des Keils relativ zur Box (nur mit Seite), zeigt auf die Mitte des Ankers. */
  arrow: { x: number; y: number } | null;
}

export interface PlaceOptions {
  /** Abstand zwischen Anker (samt Rand) und Box. */
  gap?: number;
  /** Mindestabstand der Box zum Fensterrand. */
  margin?: number;
  /** Der Keil bleibt so weit von den Ecken der Box weg. */
  arrowInset?: number;
}

const DEFAULTS: Required<PlaceOptions> = { gap: 14, margin: 12, arrowInset: 22 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max < min ? min : max);

/** Box mittig im Fenster (ohne Anker). */
function centered(viewport: Size, box: Size, margin: number): BoxPosition {
  return {
    left: clamp((viewport.width - box.width) / 2, margin, viewport.width - box.width - margin),
    top: clamp((viewport.height - box.height) / 2, margin, viewport.height - box.height - margin),
    side: 'center',
    arrow: null,
  };
}

/** Freier Platz zu jeder Seite des Ankers. */
function room(anchor: Rect, viewport: Size): Record<Exclude<BoxSide, 'center'>, number> {
  return {
    top: anchor.top,
    bottom: viewport.height - (anchor.top + anchor.height),
    left: anchor.left,
    right: viewport.width - (anchor.left + anchor.width),
  };
}

/**
 * Lage der Box zu einem Anker-Rechteck (schon mit dem Rand des Ausschnitts). 'auto' nimmt die erste Seite mit Platz
 * in der Reihenfolge unten, oben, rechts, links; hat keine Seite Platz, die mit dem meisten; passt die Box nirgends,
 * steht sie mittig. Die Box bleibt immer im Fenster, der Keil zeigt auf die Mitte des Ankers.
 */
export function placeBox(
  anchor: Rect | null,
  viewport: Size,
  box: Size,
  placement: TourPlacement = 'auto',
  options: PlaceOptions = {},
): BoxPosition {
  const { gap, margin, arrowInset } = { ...DEFAULTS, ...options };
  if (!anchor) return centered(viewport, box, margin);
  const space = room(anchor, viewport);
  const needed = { top: box.height + gap, bottom: box.height + gap, left: box.width + gap, right: box.width + gap };
  const order: Array<Exclude<BoxSide, 'center'>> =
    placement === 'auto' ? ['bottom', 'top', 'right', 'left'] : [placement];
  let side = order.find((s) => space[s] >= needed[s] + margin);
  if (!side) {
    // Gewünschte Seite ohne Platz: die mit dem meisten Platz, gemessen am Bedarf.
    const all: Array<Exclude<BoxSide, 'center'>> = ['bottom', 'top', 'right', 'left'];
    side = all.reduce((best, s) => (space[s] / needed[s] > space[best] / needed[best] ? s : best), all[0]);
    if (space[side] < needed[side]) return centered(viewport, box, margin);
  }
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  let left: number;
  let top: number;
  if (side === 'top' || side === 'bottom') {
    top = side === 'top' ? anchor.top - gap - box.height : anchor.top + anchor.height + gap;
    left = clamp(centerX - box.width / 2, margin, viewport.width - box.width - margin);
  } else {
    left = side === 'left' ? anchor.left - gap - box.width : anchor.left + anchor.width + gap;
    top = clamp(centerY - box.height / 2, margin, viewport.height - box.height - margin);
  }
  const arrow =
    side === 'top' || side === 'bottom'
      ? { x: clamp(centerX - left, arrowInset, box.width - arrowInset), y: side === 'top' ? box.height : 0 }
      : { x: side === 'left' ? box.width : 0, y: clamp(centerY - top, arrowInset, box.height - arrowInset) };
  return { left: Math.round(left), top: Math.round(top), side, arrow };
}

/** Rechteck des Ankers um den Rand des Ausschnitts vergrößert. */
export function inflate(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
