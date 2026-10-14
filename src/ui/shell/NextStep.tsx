// "Nächster Schritt": die Empfehlungen der Module (registerAdvisor). Ein dringender Rat steht in den Mitteilungen
// (HomeNotices.tsx), alle Empfehlungen in der Suche (Strg/⌘+K), die wichtigste in der Leiste unten am
// Handy-Bildschirm. Der pulsierende Hinweis-Ring am Ziel ist weg (Feedback 13.10.2026). Nichts wird gesperrt.

import { formatEuro, type GameState, wallet } from '../../core';
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
