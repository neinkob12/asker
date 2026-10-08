// Regressionstests aus dem Bugreview (Paket tutorial, Teil src/ui): Ergebnis einer Tour bei Reset und Überspringen,
// Tempo nach einem Reset, Enter und Leertaste bei einem Dialog über der Tour.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameSession, GameState } from '../../core';
import { registerDialog } from '../registry';
import { UiRuntime } from '../runtime';
import { bindKeys } from '../shell/keys';
import { type TourHost, TourRunner } from './controller';
import type { TourDef } from './types';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const simple = (id: string, count = 2, extra: Partial<TourDef> = {}): TourDef => ({
  id,
  steps: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i + 1}`, text: `Schritt ${i + 1}` })),
  ...extra,
});

/** Attrappe der Oberfläche für den TourRunner allein. */
function fakeHost(speed = 2): TourHost & { speedValue: number } {
  const host = {
    speedValue: speed,
    speed: () => host.speedValue,
    setSpeed: (value: number) => {
      host.speedValue = value;
    },
    state: () => ({ time: 0, modules: {} }) as unknown as GameState,
    onEvent: () => () => undefined,
    onChange: () => () => undefined,
    render: () => undefined,
  };
  return host;
}

/** Was UiRuntime von der Sitzung braucht (wie in runtime.test.ts). */
function makeRuntime(speed = 2) {
  const changeListeners = new Set<(change: string) => void>();
  const session = {
    state: { time: 1000 } as unknown as GameState,
    sim: { isOver: false },
    loop: { speed },
    setSpeed(value: number) {
      session.loop.speed = value;
    },
    dispatch: () => ({ ok: true }),
    subscribe(listener: (change: string) => void) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onEvent(_listener: (event: GameEvent) => void) {
      return () => undefined;
    },
  };
  const runtime = new UiRuntime(session as unknown as GameSession, null);
  const change = (kind: string) => {
    for (const l of changeListeners) l(kind);
  };
  return { session, runtime, change };
}

describe('Bugreview tutorial (src/ui)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('navigator', {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Ergebnis der Tour', () => {
    it('ein Reset (neues oder geladenes Spiel) endet mit reset, nicht mit skipped', async () => {
      const runner = new TourRunner(fakeHost());
      const running = runner.start(simple('eins', 2, { skippable: true }));
      const waiting = runner.start(simple('zwei'));
      await flush();
      runner.reset();
      expect(await running).toBe('reset');
      expect(await waiting).toBe('reset');
    });

    it('Überspringen mit eingereihter Tour bleibt skipped, die nächste läuft schon', async () => {
      const runner = new TourRunner(fakeHost());
      const first = runner.start(simple('eins', 2, { skippable: true }));
      void runner.start(simple('zwei'));
      await flush();
      runner.skip();
      expect(runner.active()).toBe('zwei');
      expect(await first).toBe('skipped');
    });
  });

  describe('Tempo nach dem Reset einer pausierenden Tour', () => {
    it('der TourRunner gibt das Tempo von vor der Tour zurück, eine Tour ohne pause lässt es', async () => {
      const host = fakeHost(2);
      const runner = new TourRunner(host);
      void runner.start(simple('t'));
      await flush();
      expect(host.speedValue).toBe(0);
      runner.reset();
      expect(host.speedValue).toBe(2);

      const free = fakeHost(2);
      const other = new TourRunner(free);
      void other.start(simple('t', 2, { pause: false }));
      await flush();
      free.speedValue = 3;
      other.reset();
      expect(free.speedValue).toBe(3);
    });

    it('Laden während einer pausierenden Tour: Das geladene Spiel läuft im alten Tempo weiter', async () => {
      const { session, runtime, change } = makeRuntime(2);
      void runtime.api.tour.start(simple('t'));
      await flush();
      expect(session.loop.speed).toBe(0);
      change('sim');
      expect(runtime.tours.active()).toBeNull();
      expect(session.loop.speed).toBe(2);
    });

    it('Laden aus einem pausierenden Dialog über der Tour: nach dem Schließen das alte Tempo', async () => {
      registerDialog({ id: 'test.regressionSaves' as never, component: () => null, pausesGame: true });
      const { session, runtime, change } = makeRuntime(2);
      void runtime.api.tour.start(simple('t'));
      await flush();
      runtime.api.openDialog('test.regressionSaves' as never, {} as never);
      change('sim');
      runtime.api.closeDialog();
      expect(session.loop.speed).toBe(2);
    });
  });

  describe('Enter und Leertaste bei einem Dialog über der Tour', () => {
    let handler: ((e: KeyboardEvent) => void) | null = null;
    beforeEach(() => {
      handler = null;
      vi.stubGlobal('document', {
        addEventListener: (_type: string, fn: (e: KeyboardEvent) => void) => {
          handler = fn;
        },
        removeEventListener: () => undefined,
      });
    });

    const press = (code: string) =>
      handler?.({
        code,
        key: code,
        target: null,
        repeat: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent);

    it('ein offener Dialog oder die Suche bekommt die Taste, die verdeckte Tour bleibt stehen', async () => {
      const { runtime } = makeRuntime(1);
      const unbind = bindKeys(runtime);
      void runtime.api.tour.start(simple('t', 3));
      await flush();
      expect(runtime.tours.current()?.index).toBe(0);
      runtime.api.openDialog('test.regressionInfo' as never, {} as never);
      press('Enter');
      press('Space');
      expect(runtime.tours.current()?.index).toBe(0);
      runtime.api.closeDialog();
      runtime.api.togglePalette(true);
      press('Enter');
      expect(runtime.tours.current()?.index).toBe(0);
      runtime.api.togglePalette(false);
      // Ohne Dialog geht es mit Enter weiter wie bisher.
      press('Enter');
      expect(runtime.tours.current()?.index).toBe(1);
      unbind();
    });
  });
});
