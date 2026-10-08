// Regressionstests aus dem Bugreview (Paket tutorial): wann eine Tour als gesehen gilt (Überspringen, Reset durch ein
// neues oder geladenes Spiel, „Tutorial beenden“) und die Tour der Stufe 9 ohne Beschlagnahme in Stufe 9.

import { describe, expect, it } from 'vitest';
import type { Command, CommandResult, GameState, Simulation } from '../../../core';
import { createTestGame } from '../../../core/testing';
import type { TourApi, TourDef, TourOutcome, UiApi } from '../../../ui';
import { MISSIONS } from '../index';
import { startStageTour } from './index';

/** Touren wie der TourRunner: eingereiht, skip beendet und startet sofort die nächste, reset beendet alle. */
class FakeTours implements TourApi {
  private readonly queue: Array<{ def: TourDef; resolve: (outcome: TourOutcome) => void }> = [];
  private running: { def: TourDef; resolve: (outcome: TourOutcome) => void } | null = null;

  start(def: TourDef): Promise<TourOutcome> {
    return new Promise((resolve) => {
      this.queue.push({ def, resolve });
      if (!this.running) this.startNext();
    });
  }

  active(): string | null {
    return this.running?.def.id ?? null;
  }

  current(): TourDef | null {
    return this.running?.def ?? null;
  }

  skip(): void {
    this.end('skipped');
  }

  finish(): void {
    this.end('done');
  }

  reset(): void {
    const run = this.running;
    this.running = null;
    run?.resolve('reset');
    for (const waiting of this.queue.splice(0)) waiting.resolve('reset');
  }

  private end(outcome: TourOutcome): void {
    const run = this.running;
    if (!run) return;
    this.running = null;
    run.resolve(outcome);
    this.startNext();
  }

  private startNext(): void {
    this.running = this.queue.shift() ?? null;
  }
}

/** Oberfläche als Attrappe: Befehle gehen an das Spiel, das gerade läuft (wie ui.dispatch über die Sitzung). */
function harness(first: Simulation) {
  const tours = new FakeTours();
  let current = first;
  const failed: string[] = [];
  const dispatch = (command: Command): CommandResult => {
    const result = current.dispatch(command);
    if (!result.ok) failed.push(`${command.type}: ${result.reason}`);
    return result;
  };
  const ui = new Proxy({} as UiApi, {
    get: (_, prop) => {
      if (prop === 'tour') return tours;
      if (prop === 'dispatch') return dispatch;
      return () => undefined;
    },
  });
  return {
    ui,
    tours,
    failed,
    /** Neues oder geladenes Spiel: die Sitzung wechselt, die Oberfläche setzt die Touren zurück. */
    switchTo: (sim: Simulation) => {
      current = sim;
      tours.reset();
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function tutorialGame(seed: number): Simulation {
  const sim = createTestGame({ seed });
  const result = sim.dispatch({ type: 'tutorial.start', payload: {} });
  if (!result.ok) throw new Error(result.reason);
  return sim;
}

/** Wie der Dev-Haken: auf Stufe n, Missionen davor erledigt, Touren davor gesehen. */
function atStage(sim: Simulation, stage: number, seen: number[] = []): GameState {
  const t = sim.state.modules.tutorial;
  t.stage = stage;
  t.mission = null;
  t.done = MISSIONS.filter((m) => m.stage < stage).map((m) => m.id);
  t.toursSeen = seen;
  return sim.state;
}

const upTo = (stage: number) => Array.from({ length: stage }, (_, i) => i);

describe('Tour-Abbruch durch neues oder geladenes Spiel', () => {
  it('ein neues Spiel während der Tour der Stufe 10 bekommt weder die Tour noch einen Stufenwechsel', async () => {
    const old = tutorialGame(501);
    atStage(old, 10, upTo(10));
    const h = harness(old);
    startStageTour(h.ui, old.state);
    expect(h.tours.active()).toBe('tutorial:10');
    expect(h.tours.current()?.skippable).toBe(true);
    // Wie NewGameDialog: session.newGame (setSim, dabei tours.reset), dann tutorial.start.
    const fresh = createTestGame({ seed: 502 });
    h.switchTo(fresh);
    fresh.dispatch({ type: 'tutorial.start', payload: {} });
    await flush();
    expect(fresh.state.modules.tutorial.stage).toBe(0);
    expect(fresh.state.modules.tutorial.toursSeen).toEqual([]);
    expect(old.state.modules.tutorial.stage).toBe(10);
    expect(old.state.modules.tutorial.toursSeen).not.toContain(10);
    expect(h.failed).toEqual([]);
  });

  it('ein geladener Stand ohne Tutorial bekommt keine Befehle (kein „Kein Tutorial.“)', async () => {
    const old = tutorialGame(503);
    atStage(old, 7, upTo(7));
    const h = harness(old);
    startStageTour(h.ui, old.state);
    expect(h.tours.active()).toBe('tutorial:7');
    h.switchTo(createTestGame({ seed: 504 }));
    await flush();
    expect(h.failed).toEqual([]);
  });

  it('„Tutorial beenden“ während der Tour der Stufe 10 meldet keinen Fehler', async () => {
    const sim = tutorialGame(505);
    atStage(sim, 10, upTo(10));
    const h = harness(sim);
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBe('tutorial:10');
    // Wie TutorialSettings: erst die Tour, dann das Tutorial beenden.
    h.tours.skip();
    h.ui.dispatch({ type: 'tutorial.skip', payload: {} });
    await flush();
    expect(h.failed).toEqual([]);
    expect(sim.state.modules.tutorial.skipped).toBe(true);
  });
});

describe('Überspringen wird gemerkt, auch wenn gleich eine eingereihte Tour startet', () => {
  it('Stufe 7 übersprungen, die Gang-Tour wartet: Stufe 7 gilt als gesehen und kommt nicht wieder', async () => {
    const sim = tutorialGame(506);
    atStage(sim, 7, upTo(7));
    const h = harness(sim);
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBe('tutorial:7');
    void h.ui.tour.start({ id: 'tutorial:firstAttack', steps: [{ id: 'a', text: 'Überfall.' }], pause: false });
    h.tours.skip();
    expect(h.tours.active()).toBe('tutorial:firstAttack');
    await flush();
    expect(sim.state.modules.tutorial.toursSeen).toContain(7);
    expect(h.failed).toEqual([]);
    // Ein weiterer Anstoß (TourStarter nach einer Änderung) reiht Stufe 7 nicht noch einmal ein.
    h.tours.finish();
    await flush();
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBeNull();
  });

  it('Überspringen der Erklär-Stufe 10 mit eingereihter Tour schaltet weiter', async () => {
    const sim = tutorialGame(507);
    atStage(sim, 10, upTo(10));
    const h = harness(sim);
    startStageTour(h.ui, sim.state);
    void h.ui.tour.start({ id: 'andere', steps: [{ id: 'a', text: 'Noch was.' }] });
    h.tours.skip();
    await flush();
    expect(sim.state.modules.tutorial.toursSeen).toContain(10);
    expect(sim.state.modules.tutorial.stage).toBe(11);
  });
});

describe('Tour der Stufe 9 ohne Beschlagnahme in Stufe 9', () => {
  it('ohne Beschlagnahme wartet Stufe 9, mit dem Wechsel auf Stufe 10 kommt erst ihre Tour, dann die der 10', async () => {
    const sim = tutorialGame(508);
    atStage(sim, 9, upTo(9));
    const h = harness(sim);
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBeNull();
    // Mission „Vier Leutnants“ erledigt, keine zweite Lieferung von Jansen: weiter auf Stufe 10.
    sim.state.modules.tutorial.stage = 10;
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBe('tutorial:9');
    const police = h.tours.current()?.steps[0];
    expect(police?.id).toBe('police');
    expect(police?.text).not.toContain('Zoll');
    h.tours.finish();
    await flush();
    expect(sim.state.modules.tutorial.toursSeen).toContain(9);
    // Stufe 9 schaltet nicht weiter (keine Erklär-Stufe), danach kommt die Tour der Stufe 10.
    expect(sim.state.modules.tutorial.stage).toBe(10);
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBe('tutorial:10');
  });

  it('eine Beschlagnahme erst in Stufe 11 startet die fehlende Tour der Stufe 9 (mit dem Satz zum Zoll)', () => {
    const sim = tutorialGame(509);
    atStage(sim, 11, [...upTo(9), 10, 11]);
    sim.state.modules.tutorial.scripted.seizure = true;
    const h = harness(sim);
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBe('tutorial:9');
    expect(h.tours.current()?.steps[0].text).toContain('Der Zoll hat deinen Container kassiert.');
  });

  it('mit Beschlagnahme in Stufe 9 wie bisher, am Ende des Tutorials keine nachgeholte Tour', () => {
    const sim = tutorialGame(510);
    atStage(sim, 9, upTo(9));
    sim.state.modules.tutorial.scripted.seizure = true;
    const h = harness(sim);
    startStageTour(h.ui, sim.state);
    expect(h.tours.active()).toBe('tutorial:9');

    const done = tutorialGame(511);
    atStage(done, 12, [...upTo(9), 10, 11]);
    const h2 = harness(done);
    startStageTour(h2.ui, done.state);
    expect(h2.tours.active()).toBe('tutorial:12');
  });
});
