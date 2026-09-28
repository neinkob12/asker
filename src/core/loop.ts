// Fester Zeitschritt: Die Simulation läuft in Schritten von einer Spielminute, unabhängig von der Bildrate.
// Das Tempo ändert nur, wie viele Schritte pro echter Sekunde laufen. Die Zeit läuft nur, solange gespielt wird:
// Ist der Tab im Hintergrund, pausiert requestAnimationFrame, und große Zeitsprünge werden gekappt.

import { GAME_MINUTES_PER_REAL_SECOND, MAX_STEPS_PER_FRAME } from './config';

export interface FrameScheduler {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

export interface GameLoopOptions {
  /** Führt n Simulationsschritte aus. */
  step: (steps: number) => void;
  /** Nach jedem Bild, z.B. für Autosave und UI. dtSeconds = echte Zeit seit dem letzten Bild. */
  frame?: (dtSeconds: number) => void;
  scheduler?: FrameScheduler;
  minutesPerSecond?: number;
}

/** Längste echte Zeit, die ein Bild zählt. Längere Pausen (Tab im Hintergrund) laufen nicht nach. */
const MAX_FRAME_SECONDS = 0.25;

export class GameLoop {
  speed = 1;
  private carry = 0;
  private handle: number | null = null;
  private last: number | null = null;
  private readonly minutesPerSecond: number;

  constructor(private readonly options: GameLoopOptions) {
    this.minutesPerSecond = options.minutesPerSecond ?? GAME_MINUTES_PER_REAL_SECOND;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /**
   * Echte Zeit vergehen lassen. Gibt die Zahl der ausgeführten Schritte zurück.
   * Bruchteile werden ins nächste Bild übertragen, damit kein Schritt verloren geht.
   */
  advanceReal(dtSeconds: number): number {
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, dtSeconds));
    if (this.speed === 0) return 0;
    this.carry += dt * this.minutesPerSecond * this.speed;
    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(this.carry + 1e-9));
    this.carry = Math.max(0, this.carry - steps);
    if (steps > 0) this.options.step(steps);
    return steps;
  }

  start(): void {
    const scheduler = this.options.scheduler;
    if (!scheduler || this.handle !== null) return;
    const frame = (now: number) => {
      const dt = this.last === null ? 0 : (now - this.last) / 1000;
      this.last = now;
      this.advanceReal(dt);
      this.options.frame?.(Math.min(MAX_FRAME_SECONDS, dt));
      this.handle = scheduler.request(frame);
    };
    this.handle = scheduler.request(frame);
  }

  stop(): void {
    if (this.handle !== null) this.options.scheduler?.cancel(this.handle);
    this.handle = null;
    this.last = null;
  }
}

export function animationFrameScheduler(): FrameScheduler {
  return {
    request: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
  };
}
