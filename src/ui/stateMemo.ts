// Auszüge aus dem Spielzustand, die die Oberfläche bei jedem Neuzeichnen braucht (Chat-Liste, Live-Aktivitäten,
// Empfehlungen), nur einmal pro Spielstand rechnen. Ohne das rechnete jede Komponente sie selbst, zehnmal pro Sekunde
// (siehe docs/perf/2026-10-messung.md, Hotspots 3 und 9).
//
// Wann ist es "derselbe Stand"? Die UiRuntime zählt eine Revision hoch, sobald die Sitzung etwas meldet, das den
// Zustand ändern kann (Schritte mit neuer Spielzeit, Befehle, neues oder geladenes Spiel). Zur Sicherheit gehören
// auch Spielzeit und nextId zum Schlüssel. Ohne UiRuntime (Tests der reinen Modelle) wird nichts gemerkt.

import type { GameState } from '../core';

let enabled = false;
let revision = 0;

/** Von der UiRuntime: ab jetzt merken (nur mit einer Laufzeit, die die Revision pflegt). */
export function enableStateMemo(): void {
  enabled = true;
}

/** Von der UiRuntime: Der Zustand kann sich geändert haben. */
export function bumpStateRevision(): void {
  revision++;
}

/** Aktuelle Revision (für Komponenten, die selbst etwas merken wollen). */
export function stateRevision(): number {
  return revision;
}

/** Merkt sich das Ergebnis von fn(state) bis zur nächsten Änderung des Zustands. Nur für reine Lesefunktionen. */
export function memoState<R>(fn: (state: GameState) => R): (state: GameState) => R {
  let lastState: GameState | null = null;
  let lastRevision = -1;
  let lastTime = -1;
  let lastNextId = -1;
  let value: R;
  return (state) => {
    if (!enabled) return fn(state);
    if (state === lastState && revision === lastRevision && state.time === lastTime && state.nextId === lastNextId) {
      return value;
    }
    value = fn(state);
    lastState = state;
    lastRevision = revision;
    lastTime = state.time;
    lastNextId = state.nextId;
    return value;
  };
}

/**
 * Wie memoState, aber für Lesefunktionen mit Argumenten (Zeitraum, Filter): Je Schlüssel (`keyOf`) wird das Ergebnis
 * bis zur nächsten Änderung des Zustands gemerkt. Die Argumente müssen allein durch den Schlüssel bestimmt sein.
 */
export function memoStateKeyed<A extends unknown[], R>(
  fn: (state: GameState, ...args: A) => R,
  keyOf: (...args: A) => string,
): (state: GameState, ...args: A) => R {
  let lastState: GameState | null = null;
  let lastRevision = -1;
  let lastTime = -1;
  let lastNextId = -1;
  let values = new Map<string, R>();
  return (state, ...args) => {
    if (!enabled) return fn(state, ...args);
    if (state !== lastState || revision !== lastRevision || state.time !== lastTime || state.nextId !== lastNextId) {
      values = new Map();
      lastState = state;
      lastRevision = revision;
      lastTime = state.time;
      lastNextId = state.nextId;
    }
    const key = keyOf(...args);
    if (values.has(key)) return values.get(key) as R;
    const value = fn(state, ...args);
    values.set(key, value);
    return value;
  };
}
