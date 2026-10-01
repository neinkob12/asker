// Treibt Federn Bild für Bild an (requestAnimationFrame, nur in der Oberfläche, nie in der Simulation) und kennt
// "Weniger Bewegung": Dann werden aus Federn kurze Überblendungen ohne Zoom und Parallaxe.

import { Spring, type SpringConfig } from './spring';

/** Möchte der Nutzer weniger Bewegung (Systemeinstellung)? */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Dauer der Überblendung bei weniger Bewegung. */
export const REDUCED_FADE_MS = 160;

/** Längstes Bild, das eine Feder auf einmal weiterrechnet: Ein langsames erstes Bild verschluckt so nicht die Bewegung. */
const MAX_FRAME = 1 / 30;

export interface Motion {
  /** Läuft die Bewegung noch? */
  readonly running: boolean;
  /** Anhalten (der Wert bleibt, wo er ist). */
  stop(): void;
}

/**
 * Lässt eine Feder laufen, bis sie in Ruhe ist. onFrame bekommt jedes Bild den Wert, onRest einmal am Ende
 * (nicht nach stop()).
 */
export function runSpring(spring: Spring, onFrame: (value: number) => void, onRest?: () => void): Motion {
  let frame = 0;
  let last = performance.now();
  let running = true;
  const tick = (now: number) => {
    const dt = Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000));
    last = now;
    onFrame(spring.step(dt));
    if (spring.settled) {
      running = false;
      onRest?.();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  onFrame(spring.value);
  if (spring.settled) {
    running = false;
    onRest?.();
  } else {
    frame = requestAnimationFrame(tick);
  }
  return {
    get running() {
      return running;
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
  };
}

/**
 * Bewegung von `from` nach `to`: mit Feder, bei weniger Bewegung als kurzer linearer Übergang. Die Feder (zum
 * Umlenken oder Weiterführen) liefert `spring`; ohne Feder wird eine neue angelegt.
 */
export function animateValue(options: {
  config: SpringConfig;
  from: number;
  to: number;
  velocity?: number;
  spring?: Spring;
  onFrame: (value: number) => void;
  onRest?: () => void;
}): { motion: Motion; spring: Spring } {
  const spring = options.spring ?? new Spring(options.config, options.from);
  spring.config = options.config;
  if (reducedMotion()) {
    // Weniger Bewegung: kurzer gleichmäßiger Übergang, keine Federn, kein Nachschwingen.
    const start = performance.now();
    const from = spring.value;
    const to = options.to;
    let frame = 0;
    let running = true;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REDUCED_FADE_MS);
      spring.jump(from + (to - from) * t, to);
      options.onFrame(spring.value);
      if (t >= 1) {
        running = false;
        options.onRest?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return {
      spring,
      motion: {
        get running() {
          return running;
        },
        stop() {
          running = false;
          cancelAnimationFrame(frame);
        },
      },
    };
  }
  spring.setTarget(options.to, options.velocity ?? spring.velocity);
  return { spring, motion: runSpring(spring, options.onFrame, options.onRest) };
}
