// Übergänge zwischen Minispiel und anderen Dialogen. Es gibt nur einen Dialog-Platz: Ein Minispiel ersetzt den offenen
// Dialog (z.B. die Akte einer Konfrontation). Ist nach dem Minispiel keiner offen (die Folgen öffnen oft selbst einen,
// z.B. die Akte), kommt der ersetzte zurück.

import type { DialogId, UiApi, UiState } from '../../../ui';

type OpenDialog = { id: DialogId; props: unknown };

/** Live-Sicht auf die Oberfläche (von einem dauerhaft gezeigten HUD-Eintrag gesetzt, siehe index.tsx). */
let live: (UiApi & { state: UiState }) | null = null;
/** Der Dialog, den das laufende Minispiel ersetzt hat. */
let replaced: OpenDialog | null = null;

export function setLiveUi(ui: UiApi & { state: UiState }): void {
  live = ui;
}

/** Die Oberfläche (für Dev-Haken außerhalb von Komponenten); null, bevor das HUD steht. */
export function liveUi(): (UiApi & { state: UiState }) | null {
  return live;
}

/** Vor dem Öffnen eines Minispiels: den offenen Dialog merken (außer es ist schon ein Minispiel). */
export function rememberDialog(): void {
  const open = live?.state.dialog;
  replaced = open && open.id !== 'minigames.play' ? { id: open.id, props: open.props } : null;
}

/** Nach dem Minispiel: Ist kein Dialog offen, den ersetzten wieder zeigen. */
export function restoreDialog(ui: UiApi): void {
  const back = replaced;
  replaced = null;
  if (!back || live?.state.dialog) return;
  ui.openDialog(back.id as never, back.props as never);
}

/**
 * Minispiele, die nach einer Konfrontation kommen (Tresor nach dem Überfall, Bude nach dem Eintreiben), warten, bis die
 * Ergebnis-Karte zu ist (Auftrag 46d, früher die Akte): erst „Erfolg, +1.200 €“ lesen, mit „Okay“ dann das Minispiel.
 */
const deferred = new Set<number>();

/** Soll das Minispiel warten? Ja, wenn gerade das Ergebnis einer Konfrontation offen ist und es nicht zu ihr gehört. */
export function shouldDefer(origin: { module: string }): boolean {
  return live?.state.dialog?.id === 'encounters.result' && origin.module !== 'encounters';
}

export function defer(challengeId: number): void {
  deferred.add(challengeId);
}

/** Wartet dieses Minispiel auf das Schließen der Akte? Liefert true genau einmal (dann öffnet es der Aufrufer). */
export function takeDeferred(challengeId: number): boolean {
  return deferred.delete(challengeId);
}

/**
 * Minispiele, deren Rahmen sich schon von selbst geöffnet hat, je Spielzustand (ein geladener oder neuer Stand ist ein
 * anderes Objekt): Ein offenes Minispiel aus einem Spielstand öffnet sich nach dem Laden genau einmal von selbst,
 * danach bleibt der Knopf im HUD.
 */
const opened = new WeakMap<object, Set<number>>();

export function markOpened(state: object, challengeId: number): void {
  let ids = opened.get(state);
  if (!ids) {
    ids = new Set();
    opened.set(state, ids);
  }
  ids.add(challengeId);
}

export function wasOpened(state: object, challengeId: number): boolean {
  return opened.get(state)?.has(challengeId) ?? false;
}

/** Für Screenshots und Playwright (nur Entwicklung): das laufende Spiel sofort gewinnen bzw. verlieren. */
let devFinish: ((won: boolean) => void) | null = null;

export function setDevFinish(fn: ((won: boolean) => void) | null): void {
  devFinish = fn;
}

export function finishFromDev(won: boolean): void {
  devFinish?.(won);
}
