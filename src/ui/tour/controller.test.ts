import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../core';
import { type TourHost, TourRunner } from './controller';
import type { TourDef } from './types';

/** Attrappe der Oberfläche: Tempo, Zustand, Ereignisse und Änderungen von Hand auslösen. */
function fakeHost() {
  const events = new Map<string, Set<() => void>>();
  const changes = new Set<() => void>();
  const host: TourHost & {
    speedValue: number;
    stateValue: GameState;
    emit(type: string): void;
    change(): void;
    renders: number;
  } = {
    speedValue: 2,
    stateValue: { time: 0, modules: {} } as unknown as GameState,
    renders: 0,
    speed: () => host.speedValue,
    setSpeed: (speed) => {
      host.speedValue = speed;
    },
    state: () => host.stateValue,
    onEvent: (type, fn) => {
      const set = events.get(type) ?? new Set<() => void>();
      events.set(type, set);
      set.add(fn);
      return () => set.delete(fn);
    },
    onChange: (fn) => {
      changes.add(fn);
      return () => changes.delete(fn);
    },
    render: () => {
      host.renders++;
    },
    emit: (type) => {
      for (const fn of events.get(type) ?? []) fn();
    },
    change: () => {
      for (const fn of changes) fn();
    },
  };
  return host;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const simple = (id: string, count = 2): TourDef => ({
  id,
  steps: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i + 1}`, text: `Schritt ${i + 1}` })),
});

describe('TourRunner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hält die Uhr an, geht mit Weiter durch die Schritte und gibt das Tempo am Ende zurück', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    const outcome = runner.start(simple('t', 3));
    await flush();
    expect(host.speedValue).toBe(0);
    expect(runner.active()).toBe('t');
    expect(runner.pausing()).toBe(true);
    expect(runner.current()?.step.id).toBe('t-1');
    expect(runner.current()?.manual).toBe(false);
    runner.next();
    await flush();
    expect(runner.current()?.step.id).toBe('t-2');
    runner.next();
    await flush();
    expect(runner.current()?.index).toBe(2);
    runner.next();
    await flush();
    expect(await outcome).toBe('done');
    expect(runner.active()).toBeNull();
    expect(runner.current()).toBeNull();
    expect(host.speedValue).toBe(2);
  });

  it('ohne pause bleibt das Tempo, wie es ist', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    void runner.start({ ...simple('t', 1), pause: false });
    await flush();
    expect(host.speedValue).toBe(2);
    expect(runner.pausing()).toBe(false);
    expect(runner.resumeSpeed()).toBeNull();
  });

  it('ein Tempo-Wunsch während der Pause gilt nach der Tour', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    const outcome = runner.start(simple('t', 1));
    await flush();
    runner.resumeWith(4);
    expect(host.speedValue).toBe(0);
    runner.next();
    expect(await outcome).toBe('done');
    expect(host.speedValue).toBe(4);
  });

  it('wartet auf ein Ereignis: Weiter tut nichts, das Ereignis geht weiter', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    const outcome = runner.start({
      id: 't',
      steps: [
        { id: 'a', text: 'Verkauf mal.', waitFor: { event: 'sale.completed' } },
        { id: 'b', text: 'Fertig.' },
      ],
    });
    await flush();
    expect(runner.current()?.manual).toBe(true);
    runner.next();
    await flush();
    expect(runner.current()?.step.id).toBe('a');
    host.emit('wallet.changed');
    await flush();
    expect(runner.current()?.step.id).toBe('a');
    host.emit('sale.completed');
    await flush();
    expect(runner.current()?.step.id).toBe('b');
    // Das alte Ereignis ist abgemeldet und bewegt nichts mehr.
    host.emit('sale.completed');
    await flush();
    expect(runner.current()?.step.id).toBe('b');
    runner.next();
    expect(await outcome).toBe('done');
  });

  it('wartet auf eine Bedingung am Zustand, prüft sie sofort und bei jeder Änderung', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    let ready = false;
    void runner.start({
      id: 't',
      steps: [
        { id: 'a', text: 'Mach das.', waitFor: { state: () => ready } },
        { id: 'b', text: 'Und das.', waitFor: { state: () => true } },
        { id: 'c', text: 'Fertig.' },
      ],
    });
    await flush();
    expect(runner.current()?.step.id).toBe('a');
    host.change();
    await flush();
    expect(runner.current()?.step.id).toBe('a');
    ready = true;
    host.change();
    await flush();
    // b gilt sofort und wird übersprungen.
    expect(runner.current()?.step.id).toBe('c');
    expect(runner.current()?.manual).toBe(false);
  });

  it('führt before vor dem Schritt aus und wartet auf Promises', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    const log: string[] = [];
    let release: () => void = () => {};
    void runner.start({
      id: 't',
      steps: [
        {
          id: 'a',
          text: '1',
          before: () => {
            log.push('a');
          },
        },
        {
          id: 'b',
          text: '2',
          before: () =>
            new Promise<void>((resolve) => {
              release = resolve;
              log.push('b');
            }),
        },
      ],
    });
    await flush();
    expect(log).toEqual(['a']);
    runner.next();
    await flush();
    // before von b läuft noch: Der Schritt ist noch nicht dran.
    expect(log).toEqual(['a', 'b']);
    expect(runner.current()?.step.id).toBe('a');
    release();
    await flush();
    expect(runner.current()?.step.id).toBe('b');
  });

  it('ein before, das wirft, hält die Tour nicht auf', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    void runner.start({
      id: 't',
      steps: [
        {
          id: 'a',
          text: '1',
          before: () => {
            throw new Error('kaputt');
          },
        },
      ],
    });
    await flush();
    expect(runner.current()?.step.id).toBe('a');
    expect(console.error).toHaveBeenCalled();
  });

  it('reiht eine zweite Tour ein und startet sie nach der ersten', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    const first = runner.start(simple('eins', 1));
    const second = runner.start(simple('zwei', 1));
    await flush();
    expect(runner.active()).toBe('eins');
    runner.next();
    await flush();
    expect(await first).toBe('done');
    expect(runner.active()).toBe('zwei');
    expect(host.speedValue).toBe(0);
    runner.skip();
    expect(await second).toBe('skipped');
    expect(runner.active()).toBeNull();
    expect(host.speedValue).toBe(2);
  });

  it('skip beendet die laufende Tour mit skipped und gibt das Tempo zurück', async () => {
    const host = fakeHost();
    host.speedValue = 4;
    const runner = new TourRunner(host);
    const outcome = runner.start(simple('t', 3));
    await flush();
    runner.skip();
    expect(await outcome).toBe('skipped');
    expect(host.speedValue).toBe(4);
    // Ohne Tour tut skip nichts.
    runner.skip();
    expect(runner.active()).toBeNull();
  });

  it('eine Tour ohne Schritte ist sofort fertig', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    expect(await runner.start({ id: 'leer', steps: [] })).toBe('done');
    expect(host.speedValue).toBe(2);
  });

  it('reset bei neuem Spiel: alles weg, als übersprungen, Tempo bleibt unangetastet', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    const first = runner.start(simple('eins', 2));
    const second = runner.start(simple('zwei', 2));
    await flush();
    runner.reset();
    expect(await first).toBe('skipped');
    expect(await second).toBe('skipped');
    expect(runner.active()).toBeNull();
    expect(host.speedValue).toBe(0);
  });

  it('meldet jeden Schrittwechsel an Zuhörer und zählt tick hoch', async () => {
    const host = fakeHost();
    const runner = new TourRunner(host);
    let calls = 0;
    runner.subscribe(() => calls++);
    void runner.start(simple('t', 2));
    await flush();
    const firstTick = runner.current()?.tick;
    runner.next();
    await flush();
    expect(runner.current()?.tick).toBe((firstTick ?? 0) + 1);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(host.renders).toBeGreaterThanOrEqual(2);
  });
});
