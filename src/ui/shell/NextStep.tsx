// "Nächster Schritt": die Empfehlungen der Module (registerAdvisor). Seit Auftrag 26 gibt es kein festes Widget mehr
// auf dem Startbildschirm: Nur ein dringender Rat erscheint dort als Zeile (PhoneFrame.tsx), alle Empfehlungen stehen
// in der Suche (Strg/⌘+K), die wichtigste in der Leiste unten am Handy-Bildschirm, dazu der sanfte, pulsierende
// Hinweis (Onboarding) am Ziel. Nichts wird gesperrt: Die Karte schlägt nur vor.

import { useEffect, useRef } from 'preact/hooks';
import { clock, formatEuro, type GameState, wallet } from '../../core';
import { useRuntime } from '../hooks';
import { type Advice, advisors } from '../registry';
import { memoState } from '../stateMemo';

/**
 * Alle Empfehlungen, wichtigste zuerst. Fehler einzelner Module werden ignoriert. Einmal pro Spielstand gerechnet
 * (Startbildschirm, Leiste, Suche und Hinweis fragen alle), nicht verändern.
 */
export const collectAdvice: (state: GameState) => Advice[] = memoState(computeAdvice);

function computeAdvice(state: GameState): Advice[] {
  const all: Advice[] = [];
  for (const advisor of advisors.list()) {
    try {
      const result = advisor.advise(state);
      if (Array.isArray(result)) all.push(...result);
      else if (result) all.push(result);
    } catch (error) {
      console.error(`Empfehlung "${advisor.id}"`, error);
    }
  }
  return all.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** Was fehlt für diese Empfehlung? */
export function missingFor(state: GameState, advice: Advice): string | null {
  if (advice.missing) return advice.missing;
  if (advice.cost !== undefined) {
    const lack = advice.cost - wallet.balance(state, 'dirty');
    if (lack > 0) return `Dir fehlen noch ${formatEuro(lack)}`;
  }
  return null;
}

/** Sanfte Hinweise nur am Anfang (die ersten beiden Spieltage). */
export function coachingActive(state: GameState): boolean {
  return clock.day(state.time) <= 2;
}

/** Setzt den pulsierenden Hinweis (Klasse is-coach) an das Ziel der wichtigsten Empfehlung. */
export function CoachHighlight() {
  const runtime = useRuntime();
  const state = runtime.state;
  const selector =
    state && coachingActive(state) && !runtime.ui.dialog ? (collectAdvice(state)[0]?.highlight ?? null) : null;
  const current = useRef<Element | null>(null);
  useEffect(() => {
    let element: Element | null = null;
    try {
      element = selector ? document.querySelector(selector) : null;
    } catch {
      element = null;
    }
    if (element === current.current) return;
    current.current?.classList.remove('is-coach');
    element?.classList.add('is-coach');
    current.current = element;
  });
  useEffect(() => () => current.current?.classList.remove('is-coach'), []);
  return null;
}
