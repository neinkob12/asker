// Pause-Knopf für die Minispiele (Auftrag 49): Am Desktop hält Esc an, am Handy gibt es keine Taste. Jedes Spiel setzt
// den Knopf dorthin, wo er in seiner HUD-Leiste passt (z.B. als erstes Kind von HudBar):
//
//   <HudBar><PauseButton /><HudTimer … /></HudBar>
//
// Der Rahmen gibt über PauseContext die Pause nur, solange das Spiel läuft; sonst zeichnet der Knopf nichts. In
// Einleitung, 3-2-1 und Ergebnis ist er also weg, und Spiele außerhalb des Rahmens (Tests) brauchen nichts.

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { Icon } from '../../../../ui';

/** Pause auslösen (vom Rahmen gesetzt, solange das Spiel läuft), sonst null. */
export const PauseContext = createContext<(() => void) | null>(null);

export function PauseButton(props: { class?: string }) {
  const pause = useContext(PauseContext);
  if (!pause) return null;
  return (
    <button
      type="button"
      class={`mg-pause ${props.class ?? ''}`}
      aria-label="Pause"
      title="Pause (Esc)"
      // Das Spiel soll den Tipp nicht als eigene Eingabe sehen (manche hören am Fenster auf Zeiger).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).blur();
        pause();
      }}
    >
      <Icon name="pause" />
    </button>
  );
}
