// Ablauf einer Tour (Auftrag 46a), ohne DOM und getestet: Warteschlange der Touren, aktueller Schritt, `before`,
// Warten auf Weiter, ein Ereignis oder eine Bedingung am Spielzustand bzw. an der Oberfläche, Uhr anhalten und das
// Tempo am Ende zurückgeben.
// Was zu sehen ist (Overlay, Box), zeichnet TourHost.tsx aus `current()`.

import type { GameState } from '../../core';
import type { UiState } from '../runtime';
import type { TourApi, TourDef, TourOutcome, TourStep } from './types';

/** Was die Ablaufsteuerung von der Oberfläche braucht (UiRuntime stellt es, Tests eine Attrappe). */
export interface TourHost {
  /** Tempo, mit dem das Spiel läuft bzw. nach einem pausierenden Dialog weiterläuft. */
  speed(): number;
  setSpeed(speed: number): void;
  state(): GameState | null;
  /** Zustand der Oberfläche (Handy, Seiten, Dialoge) für Bedingungen mit `waitFor { ui }`. */
  ui(): UiState;
  /** Ruft fn bei jedem Ereignis dieser Art, gibt die Abmeldung zurück. */
  onEvent(type: string, fn: () => void): () => void;
  /** Ruft fn nach jeder Änderung (Spielschritt, Befehl, Oberfläche), gibt die Abmeldung zurück. */
  onChange(fn: () => void): () => void;
  /** Neuzeichnen anstoßen. */
  render(): void;
}

/** Der laufende Schritt, so wie die Oberfläche ihn zeigt. */
export interface TourView {
  def: TourDef;
  index: number;
  step: TourStep;
  /** Der Spieler muss selbst etwas tun (kein Weiter-Knopf, der Anker bleibt bedienbar). */
  manual: boolean;
  /** Zählt bei jedem Schrittwechsel hoch (für Ton, Fokus, Sprache). */
  tick: number;
}

interface Running {
  def: TourDef;
  resolve: (outcome: TourOutcome) => void;
  index: number;
  /** Abmeldungen des aktuellen Schritts (Ereignis, Zustand). */
  cleanup: Array<() => void>;
  /** Tempo vor der Tour, null: diese Tour hält die Uhr nicht an. */
  resumeSpeed: number | null;
}

export class TourRunner implements TourApi {
  private readonly queue: Array<{ def: TourDef; resolve: (outcome: TourOutcome) => void }> = [];
  private running: Running | null = null;
  /** Schützt vor einem `before`, das erst nach dem Ende oder dem nächsten Schritt fertig wird. */
  private generation = 0;
  private tick = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: TourHost) {}

  start(def: TourDef): Promise<TourOutcome> {
    return new Promise<TourOutcome>((resolve) => {
      this.queue.push({ def, resolve });
      if (!this.running) this.startNext();
    });
  }

  active(): string | null {
    return this.running?.def.id ?? null;
  }

  skip(): void {
    if (this.running) this.finish('skipped');
  }

  /** Weiter (Knopf, Enter, Leertaste). Wirkt nur, wenn der Schritt auf Weiter wartet. */
  next(): void {
    const view = this.current();
    if (!view || view.manual) return;
    this.advance();
  }

  current(): TourView | null {
    const run = this.running;
    if (!run) return null;
    const step = run.def.steps[run.index];
    if (!step) return null;
    const wait = step.waitFor ?? 'next';
    return { def: run.def, index: run.index, step, manual: wait !== 'next', tick: this.tick };
  }

  /** Hält die laufende Tour die Uhr an? */
  pausing(): boolean {
    return this.running?.resumeSpeed !== null && this.running !== null;
  }

  /**
   * Tempo, mit dem es nach der Tour weitergeht. Während die Tour pausiert, landet ein setSpeed von außen hier (der
   * Tempo-Regler als Anker, ein Dialog, der sein Tempo zurückgibt), statt die Uhr wieder anzuwerfen.
   */
  resumeSpeed(): number | null {
    return this.running?.resumeSpeed ?? null;
  }

  resumeWith(speed: number): void {
    if (this.running && this.running.resumeSpeed !== null) {
      this.running.resumeSpeed = speed;
      this.notify();
    }
  }

  /**
   * Neues oder geladenes Spiel: Alle Touren gehören zum alten (Ergebnis 'reset', nicht 'skipped': Der Spieler hat
   * nichts übersprungen). Hielt die laufende die Uhr an, gilt wieder das Tempo von vorher, wie am Ende einer Tour.
   */
  reset(): void {
    const run = this.running;
    if (run) {
      this.generation++;
      this.clearStep(run);
      this.running = null;
      if (run.resumeSpeed !== null) this.host.setSpeed(run.resumeSpeed);
      run.resolve('reset');
    }
    for (const waiting of this.queue.splice(0)) waiting.resolve('reset');
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
    this.host.render();
  }

  private startNext(): void {
    const entry = this.queue.shift();
    if (!entry) return;
    const pause = entry.def.pause !== false;
    const run: Running = {
      def: entry.def,
      resolve: entry.resolve,
      index: -1,
      cleanup: [],
      resumeSpeed: pause ? this.host.speed() : null,
    };
    this.running = run;
    if (pause) this.host.setSpeed(0);
    if (entry.def.steps.length === 0) {
      this.finish('done');
      return;
    }
    void this.enter(run, 0);
  }

  private async enter(run: Running, index: number): Promise<void> {
    const generation = ++this.generation;
    this.clearStep(run);
    const step = run.def.steps[index];
    if (!step) {
      this.finish('done');
      return;
    }
    if (step.before) {
      try {
        await step.before();
      } catch (error) {
        console.error(`Tour ${run.def.id}, Schritt ${step.id}: before`, error);
      }
      // Inzwischen übersprungen, zurückgesetzt oder schon weiter: Dieser Schritt ist nicht mehr dran.
      if (generation !== this.generation || this.running !== run) return;
    }
    run.index = index;
    this.tick++;
    const wait = step.waitFor ?? 'next';
    if (typeof wait === 'object' && 'event' in wait) {
      run.cleanup.push(this.host.onEvent(wait.event, () => this.advance()));
    } else if (typeof wait === 'object') {
      const check = () => {
        let ok = false;
        try {
          if ('state' in wait) {
            const state = this.host.state();
            ok = !!state && wait.state(state);
          } else {
            ok = wait.ui(this.host.ui());
          }
        } catch (error) {
          console.error(`Tour ${run.def.id}, Schritt ${step.id}: waitFor`, error);
        }
        if (ok) this.advance();
        return ok;
      };
      // Gilt die Bedingung schon, ist der Schritt sofort erledigt.
      if (!check()) run.cleanup.push(this.host.onChange(check));
    }
    this.notify();
  }

  private advance(): void {
    const run = this.running;
    if (!run) return;
    const next = run.index + 1;
    if (next >= run.def.steps.length) this.finish('done');
    else void this.enter(run, next);
  }

  private clearStep(run: Running): void {
    for (const off of run.cleanup.splice(0)) off();
  }

  private finish(outcome: TourOutcome): void {
    const run = this.running;
    if (!run) return;
    this.generation++;
    this.clearStep(run);
    this.running = null;
    if (run.resumeSpeed !== null) this.host.setSpeed(run.resumeSpeed);
    run.resolve(outcome);
    this.notify();
    this.startNext();
  }
}
