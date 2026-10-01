// Regeln der Gesten im Handy, ohne DOM (getestet in gestureModel.test.ts): Geschwindigkeit messen, Achse erkennen,
// entscheiden, ob ein Wischen zählt. Die Gesten selbst (Pointer Events) stehen in drag.ts und PhoneFrame.tsx.
// Alles in Pixeln und Millisekunden; Maus, Trackpad und Touch werden gleich behandelt.

/** Rand-Wischen beginnt höchstens so weit vom linken Rand (wie bei iOS). */
export const EDGE_ZONE = 24;
/** Ab dieser Bewegung entscheidet sich, ob es eine Geste ist (sonst bleibt es ein Tippen). */
export const SLOP = 8;
/** Schnelles Wischen (px/ms): zählt auch, wenn der Weg kurz ist. */
export const FLING = 0.5;
/** Langer Druck (ms). */
export const LONG_PRESS_MS = 500;
/** Fenster für die Geschwindigkeit: nur die letzten Millisekunden zählen (sonst bremst ein langsamer Anfang). */
const VELOCITY_WINDOW = 100;

export interface Sample {
  x: number;
  y: number;
  t: number;
}

/** Misst die Geschwindigkeit eines Zeigers aus den letzten Bewegungen (px/ms). */
export class VelocityTracker {
  private samples: Sample[] = [];

  add(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    const cutoff = t - VELOCITY_WINDOW;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Geschwindigkeit in px/ms über das Fenster, 0 ohne genug Bewegung. */
  velocity(): { vx: number; vy: number } {
    const s = this.samples;
    if (s.length < 2) return { vx: 0, vy: 0 };
    const first = s[0];
    const last = s[s.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  reset(): void {
    this.samples = [];
  }
}

/** Welche Achse nimmt die Bewegung? null, solange sie unter der Schwelle bleibt. */
export function dragAxis(dx: number, dy: number, slop = SLOP): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** Rand-Wischen zurück: mehr als die Hälfte geschafft (und nicht zurück unterwegs) oder schnell nach rechts. */
export function edgeSwipeCommits(progress: number, vx: number): boolean {
  if (vx > FLING) return true;
  if (vx < -FLING / 2) return false;
  return progress > 0.5;
}

/** Wie weit die Seite beim Rand-Wischen ist (0–1), aus dem Weg des Fingers. */
export function edgeSwipeProgress(dx: number, width: number): number {
  return Math.min(1, Math.max(0, dx / Math.max(1, width)));
}

/** Hochwischen am Home-Balken: Öffnung der App (1 = Vollbild, 0 = Kachel) aus dem Weg nach oben. */
export function homeSwipeOpenness(dy: number, height: number): number {
  return Math.min(1, Math.max(0, 1 + dy / Math.max(1, height * 0.6)));
}

/** Hochwischen zählt ab einem Achtel der Höhe oder schnell nach oben. */
export function homeSwipeCommits(dy: number, height: number, vy: number): boolean {
  if (vy < -FLING) return true;
  if (vy > FLING / 2) return false;
  return -dy > height / 8;
}

/** Banner: hoch wischen = weg, herunterziehen = Mitteilungszentrale, sonst zurück. */
export function bannerSwipe(dy: number, vy: number): 'dismiss' | 'center' | 'stay' {
  if (dy < -24 || vy < -FLING) return 'dismiss';
  if (dy > 56 || vy > FLING) return 'center';
  return 'stay';
}

/** Gummiband wie bei iOS: über die Grenze hinaus folgt die Fläche immer zäher. */
export function rubberBand(offset: number, dimension: number, constant = 0.55): number {
  if (offset === 0) return 0;
  const sign = Math.sign(offset);
  const d = Math.abs(offset);
  return sign * (1 - 1 / ((d * constant) / Math.max(1, dimension) + 1)) * dimension;
}
