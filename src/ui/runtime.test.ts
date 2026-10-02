// UiRuntime ohne Browser: mit einer kleinen Attrappe der Sitzung. Prüft, was bei neuem Spiel, fehlerhaften Reaktionen,
// Bannern und Dialog-Pausen zählt (Fehler aus der Handy-Prüfung).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameSession, GameState } from '../core';
import { onGameEvent, registerDialog } from './registry';
import { UiRuntime } from './runtime';

/** Was UiRuntime von der Sitzung braucht. */
function fakeSession() {
  const changeListeners = new Set<(change: string) => void>();
  const eventListeners = new Set<(event: GameEvent) => void>();
  const session = {
    state: { time: 1000 } as unknown as GameState,
    sim: { isOver: false },
    loop: { speed: 1 },
    setSpeed(speed: number) {
      session.loop.speed = speed;
    },
    dispatch: () => ({ ok: true }),
    subscribe(listener: (change: string) => void) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onEvent(listener: (event: GameEvent) => void) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };
  return {
    session,
    change: (kind: string) => {
      for (const l of changeListeners) l(kind);
    },
    emit: (event: GameEvent) => {
      for (const l of eventListeners) l(event);
    },
  };
}

function make() {
  const fake = fakeSession();
  const runtime = new UiRuntime(fake.session as unknown as GameSession, null);
  return { ...fake, runtime, api: runtime.api, ui: runtime.ui };
}

describe('UiRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('navigator', {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ein neues, geladenes oder importiertes Spiel räumt Meldungen, Mitteilungen, Banner und Seiten des alten weg', () => {
    const { api, ui, change } = make();
    api.toast('Razzia in Ehrenfeld', 'bad');
    api.notify({ appId: 'core.messages', title: 'Nord', text: 'Du schuldest uns was', time: 5, urgent: true });
    api.openPhone('core.messages', { contactId: 'gang:a' });
    api.toggleIsland(true);
    expect(ui.alerts).toHaveLength(1);
    expect(ui.notifications).toHaveLength(1);
    expect(ui.toasts).toHaveLength(1);
    expect(ui.phone.stack.length).toBeGreaterThan(1);
    change('sim');
    expect(ui.alerts).toEqual([]);
    expect(ui.notifications).toEqual([]);
    expect(ui.notification).toBeNull();
    expect(ui.toasts).toEqual([]);
    expect(ui.phone.stack).toHaveLength(1);
    expect(ui.island.expanded).toBe(false);
    expect(ui.notificationCenter).toBe(false);
  });

  it('eine Reaktion, die wirft, reißt die anderen nicht mit', () => {
    const { emit, api } = make();
    const seen: string[] = [];
    onGameEvent('clock.hourStarted', 'test.wirft', () => {
      throw new Error('kaputt');
    });
    onGameEvent('clock.hourStarted', 'test.laeuft', (_payload, ui) => {
      seen.push('weiter');
      ui.toast('läuft', 'info');
    });
    emit({ type: 'clock.hourStarted', payload: { day: 1, hour: 1, time: 60 } } as unknown as GameEvent);
    expect(seen).toEqual(['weiter']);
    expect(api).toBeDefined();
  });

  it('ein dringender Toast verliert seine Zeit nicht hinter einem Nachrichten-Banner', () => {
    const { api, ui, runtime } = make();
    api.notify({ appId: 'core.messages', title: 'Nord', text: 'Antworte', time: 1, urgent: true });
    expect(ui.notification).not.toBeNull();
    api.toast('Razzia!', 'bad');
    expect(ui.toasts).toHaveLength(1);
    // Das Banner steht 5 Sekunden, der Toast (3,4 s) darf in der Zeit nicht ablaufen.
    vi.advanceTimersByTime(4000);
    expect(ui.toasts).toHaveLength(1);
    // Das Banner ist weg: Jetzt läuft die Zeit des Toasts.
    api.dismissNotification();
    runtime.requestRender();
    return Promise.resolve().then(() => {
      expect(ui.toasts).toHaveLength(1);
      vi.advanceTimersByTime(3000);
      expect(ui.toasts).toHaveLength(1);
      vi.advanceTimersByTime(1500);
      expect(ui.toasts).toHaveLength(0);
    });
  });

  it('Karte anklicken (Spot gründen) legt das Handy am Handy-Bildschirm weg und holt es danach zurück', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { api, ui, runtime } = make();
    let answer!: (pos: { lng: number; lat: number } | null) => void;
    runtime.map = {
      pickLocation: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    } as never;
    api.openPhone('tab:territory');
    expect(ui.phone.open).toBe(true);
    const pending = api.pickLocation('Klick auf die Karte');
    // Sonst deckt das Handy die Karte zu, auf die man klicken soll.
    expect(ui.picking).not.toBeNull();
    expect(ui.phone.open).toBe(false);
    answer({ lng: 7, lat: 50.9 });
    expect(await pending).toEqual({ lng: 7, lat: 50.9 });
    expect(ui.picking).toBeNull();
    expect(ui.phone.open).toBe(true);
  });

  it('Karte anklicken am Desktop lässt das Handy, wo es ist (es steht neben der Karte)', async () => {
    const { api, ui, runtime } = make();
    runtime.map = { pickLocation: () => Promise.resolve(null) } as never;
    expect(ui.phone.open).toBe(true);
    const pending = api.pickLocation('Klick');
    expect(ui.phone.open).toBe(true);
    expect(await pending).toBeNull();
    expect(ui.phone.open).toBe(true);
  });

  it('ein Dialog, der das Spiel anhält, behält seine Pause, das gewünschte Tempo gilt danach', () => {
    const { api, session } = make();
    registerDialog({ id: 'test.haltend' as never, component: () => null, pausesGame: true });
    api.openDialog('test.haltend' as never, {} as never);
    expect(session.loop.speed).toBe(0);
    // "Weiterspielen" in der Suche darf die Pause des Dialogs nicht aufheben.
    api.setSpeed(2);
    expect(session.loop.speed).toBe(0);
    api.closeDialog();
    expect(session.loop.speed).toBe(2);
  });
});
