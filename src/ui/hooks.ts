// Hooks für Komponenten: Zugriff auf Spielzustand, Befehle und UI-Funktionen.

import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { Command, CommandResult, GameSession, GameState } from '../core';
import { pageUiState } from './pageUi';
import { PageContext } from './phone/page';
import type { UiApi, UiRuntime, UiState } from './runtime';
import { createSelection, type Equals } from './selector';

export { type Equals, shallowEqual } from './selector';

export const RuntimeContext = createContext<UiRuntime | null>(null);

export function useRuntime(): UiRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime: keine UiRuntime im Kontext');
  return runtime;
}

/**
 * Spielzustand (nur lesen!) und dispatch. Komponenten werden nach jedem Simulationsschritt neu gezeichnet
 * (ca. 10 Mal pro Sekunde), deshalb kein memo() auf Basis des Zustands verwenden: Der Zustand ist veränderbar, ein
 * Vergleich seiner Identität sagt nichts. Wer oft neu gezeichnete Teile entlasten will, liest mit `useGameSelector`
 * (Vergleich eines kleinen Auszugs beim Tick) und packt die Komponente ohne Props in `memo()`.
 */
export function useGame(): { state: GameState; dispatch: (command: Command) => CommandResult } {
  const runtime = useRuntime();
  const state = runtime.state;
  if (!state) throw new Error('useGame: kein Spiel geladen');
  return { state, dispatch: runtime.api.dispatch };
}

/**
 * Liest einen kleinen Auszug aus dem Spielzustand und zeichnet die Komponente nur neu, wenn sich dieser Auszug
 * ändert (Vergleich mit `equals`, Standard `Object.is`, für frisch gebaute Objekte und Listen `shallowEqual`). Sie
 * hat eine eigene Abo-Leitung an der UiRuntime und braucht deshalb kein Neuzeichnen von oben.
 *
 * Der Zustand ist veränderbar: Der Selektor muss Zahlen, Texte oder frisch gebaute Auszüge liefern, nie eine
 * Referenz auf ein Objekt aus dem Zustand (die bliebe immer "gleich"). Er läuft bei jedem Neuzeichnen der
 * Runtime (ca. 10 Mal pro Sekunde), also kurz halten. Damit Eltern-Neuzeichnen sie überspringt, packt man die
 * Komponente ohne Props in `memo()`; das ist sicher, weil sie nur über diesen Hook liest. Wer zusätzlich UI-Zustand
 * (Popover, Handy) braucht, nimmt `useRuntimeSelector`.
 */
export function useGameSelector<T>(select: (state: GameState) => T, equals: Equals<T> = Object.is): T {
  const runtime = useRuntime();
  return useSelection(() => {
    const state = runtime.state;
    if (!state) throw new Error('useGameSelector: kein Spiel geladen');
    return select(state);
  }, equals);
}

/** Wie `useGameSelector`, liest aber aus der ganzen UiRuntime (Spielzustand, UI-Zustand `ui`, Tempo). */
export function useRuntimeSelector<T>(select: (runtime: UiRuntime) => T, equals: Equals<T> = Object.is): T {
  const runtime = useRuntime();
  return useSelection(() => select(runtime), equals);
}

function useSelection<T>(read: () => T, equals: Equals<T>): T {
  const runtime = useRuntime();
  const [, rerender] = useState(0);
  const selection = useRef<ReturnType<typeof createSelection<T>>>(null);
  if (!selection.current) selection.current = createSelection<T>();
  const sel = selection.current;
  const value = sel.update(read, equals);
  useEffect(() => {
    const check = () => {
      if (sel.changed()) rerender((n) => n + 1);
    };
    // Zwischen Zeichnen und Abo kann sich schon etwas geändert haben.
    check();
    return runtime.subscribe(check);
  }, [runtime, sel]);
  return value;
}

/**
 * UI-Funktionen und UI-Zustand. In einer Seite des Handys zeigt state.phone.app/params die Parameter dieser Seite:
 * Chat-Liste und Chat sind dieselbe App, beide bleiben im Stapel montiert und lesen ihre eigenen Parameter.
 */
export function useUi(): UiApi & { state: UiState } {
  const runtime = useRuntime();
  const entry = useContext(PageContext)?.entry;
  // In einer App-Seite eine Sicht, die app/params dieser Seite zeigt, der Rest bleibt live (keine Kopie, die in
  // Timern und nach await veraltet).
  return { ...runtime.api, state: entry?.kind === 'app' ? pageUiState(runtime.ui, entry) : runtime.ui };
}

export function useSession(): GameSession {
  return useRuntime().session;
}
