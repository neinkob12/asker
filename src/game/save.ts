import type { GameState } from './engine';

const KEY = 'koeln-tycoon-save-v1';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Speichern ist optional, z.B. im privaten Modus nicht möglich.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorieren
  }
}
