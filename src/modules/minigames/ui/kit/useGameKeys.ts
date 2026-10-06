// Tastatur für Minispiele: gedrückte Tasten und Tasten-Ereignisse. Spieltasten gehören, solange das Spiel läuft, nur
// dem Spiel (Listener am window in der Capture-Phase, preventDefault, stopPropagation): Leertaste und Pfeile gehen
// dann weder an die Spieluhr noch an die Karte noch an einen fokussierten Knopf.

import { useEffect, useRef } from 'preact/hooks';

export interface GameKeys {
  /** Ist diese Taste gerade gedrückt? (KeyboardEvent.code, z.B. 'ArrowLeft', 'KeyA', 'Space', 'ShiftLeft') */
  isDown(code: string): boolean;
  /** Ist Umschalt gerade gedrückt (für feine Schritte)? */
  shift(): boolean;
}

export interface GameKeyPress {
  code: string;
  shift: boolean;
}

/**
 * Spieltasten (codes) abfangen, solange enabled. onPress kommt einmal pro Druck (ohne Wiederholung beim Halten);
 * isDown für gehaltene Tasten in der Bildschleife. Beim Verlassen des Fensters gelten alle als losgelassen.
 */
export function useGameKeys(
  codes: readonly string[],
  onPress?: (press: GameKeyPress) => void,
  enabled = true,
): GameKeys {
  const held = useRef(new Set<string>());
  const shiftHeld = useRef(false);
  const latest = useRef(onPress);
  latest.current = onPress;
  const wanted = codes.join(',');
  useEffect(() => {
    if (!enabled) {
      held.current.clear();
      return;
    }
    const list = new Set(wanted.split(','));
    const down = (e: KeyboardEvent) => {
      shiftHeld.current = e.shiftKey;
      if (!list.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      held.current.add(e.code);
      latest.current?.({ code: e.code, shift: e.shiftKey });
    };
    const up = (e: KeyboardEvent) => {
      shiftHeld.current = e.shiftKey;
      if (!list.has(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      held.current.delete(e.code);
    };
    const clear = () => {
      held.current.clear();
      shiftHeld.current = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [wanted, enabled]);
  const api = useRef<GameKeys>({
    isDown: (code) => held.current.has(code),
    shift: () => shiftHeld.current,
  });
  return api.current;
}
