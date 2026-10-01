// Hooks für Komponenten: Zugriff auf Spielzustand, Befehle und UI-Funktionen.

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Command, CommandResult, GameSession, GameState } from '../core';
import { PageContext } from './phone/page';
import type { UiApi, UiRuntime, UiState } from './runtime';

export const RuntimeContext = createContext<UiRuntime | null>(null);

export function useRuntime(): UiRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime: keine UiRuntime im Kontext');
  return runtime;
}

/**
 * Spielzustand (nur lesen!) und dispatch. Komponenten werden nach jedem Simulationsschritt neu gezeichnet
 * (ca. 10 Mal pro Sekunde), deshalb kein memo() auf Basis des Zustands verwenden.
 */
export function useGame(): { state: GameState; dispatch: (command: Command) => CommandResult } {
  const runtime = useRuntime();
  const state = runtime.state;
  if (!state) throw new Error('useGame: kein Spiel geladen');
  return { state, dispatch: runtime.api.dispatch };
}

/**
 * UI-Funktionen und UI-Zustand. In einer Seite des Handys zeigt state.phone.app/params die Parameter dieser Seite:
 * Chat-Liste und Chat sind dieselbe App, beide bleiben im Stapel montiert und lesen ihre eigenen Parameter.
 */
export function useUi(): UiApi & { state: UiState } {
  const runtime = useRuntime();
  const page = useContext(PageContext);
  const ui = runtime.ui;
  const entry = page?.entry;
  if (entry?.kind === 'app' && (ui.phone.app !== entry.id || ui.phone.params !== entry.params)) {
    const phone = { ...ui.phone, app: entry.id };
    if (entry.params) phone.params = entry.params;
    else delete phone.params;
    return { ...runtime.api, state: { ...ui, phone } };
  }
  return { ...runtime.api, state: ui };
}

export function useSession(): GameSession {
  return useRuntime().session;
}
