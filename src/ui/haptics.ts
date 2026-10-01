// Haptik wie bei iOS (UIFeedbackGenerator): kurze Vibrationen, wo der Browser das kann (navigator.vibrate, z.B.
// Android), dazu leise Klicks aus src/audio. iOS Safari kann nicht vibrieren; dort bleibt es beim Klick.
// Folgt der Einstellung "Vibrieren" (Einstellungen › Spiel). Nicht beim Scrollen und nicht pro Bild aufrufen,
// sondern bei Momenten: Schalter, Segment, Rasten eines Blatts, langer Druck, Erfolg, Warnung, Fehler.
//
//   import { haptic } from '../../../ui';
//   haptic('selection');   // Auswahl geändert (Segment, Stepper, Schalter)
//   haptic('light');       // leichter Stoß (Blatt rastet ein, Wischen ausgelöst)
//   haptic('medium');      // deutlicher Stoß (langer Druck öffnet das Kontextmenü)
//   haptic('success' | 'warning' | 'error');

import { audio } from '../audio';

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

/** Vibrationsmuster in ms (an, aus, an …): kurz und leise wie die Taptic Engine, nie ein Brummen. */
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 6,
  light: 10,
  medium: 18,
  success: [12, 60, 18],
  warning: [20, 80, 20],
  error: [24, 50, 24, 50, 24],
};

/** Klicks als Ersatz (Lautstärke relativ zu den Effekten, Abstände in Sekunden): mehr Stöße = mehr Klicks. */
const CLICKS: Record<HapticKind, { volume: number; at: number[] }> = {
  selection: { volume: 0.18, at: [0] },
  light: { volume: 0.26, at: [0] },
  medium: { volume: 0.4, at: [0] },
  success: { volume: 0.3, at: [0, 0.07] },
  warning: { volume: 0.32, at: [0, 0.1] },
  error: { volume: 0.34, at: [0, 0.07, 0.14] },
};

let enabled = true;
let last = 0;

/** Haptik an oder aus (die Oberfläche setzt das aus der Einstellung "Vibrieren"). */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Kurze Rückmeldung zum Fühlen (und Hören). Mehrere Aufrufe kurz hintereinander werden zusammengefasst. */
export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - last < 35) return;
  last = now;
  try {
    navigator.vibrate?.(HAPTIC_PATTERNS[kind]);
  } catch {
    // Nicht jedes Gerät kann vibrieren (iOS Safari gar nicht): dann nur der Klick.
  }
  const click = CLICKS[kind];
  for (const delay of click.at) audio.play('click', { volume: click.volume, delay });
}
