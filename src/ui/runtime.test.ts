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
    dispatch: (command: { type: string }) =>
      command.type === 'test.fail' ? { ok: false, reason: 'geht nicht' } : { ok: true },
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

  it('ein neues, geladenes oder importiertes Spiel räumt Meldungen, Rückmeldung und Seiten des alten weg', () => {
    const { api, ui, change } = make();
    api.toast('Razzia in Ehrenfeld', 'bad');
    api.dispatch({ type: 'test.fail', payload: {} } as never);
    api.openPhone('core.messages', { contactId: 'gang:a' });
    expect(ui.alerts).toHaveLength(1);
    expect(ui.error?.text).toBe('geht nicht');
    expect(ui.phone.stack.length).toBeGreaterThan(1);
    change('sim');
    expect(ui.alerts).toEqual([]);
    expect(ui.error).toBeNull();
    expect(ui.phone.stack).toHaveLength(1);
  });

  it('Meldungen landen nur im Verlauf (Auftrag 46d): Wichtiges ungelesen, Routine gelesen, log false verpufft', () => {
    const { api, ui } = make();
    api.toast('Razzia in Ehrenfeld', 'bad');
    api.toast('Lieferung bestellt', 'good');
    api.toast('Lieferung da', 'good', { urgent: true });
    api.toast('Nur kurz', 'info', { log: false });
    expect(ui.alerts.map((a) => [a.text, a.urgent, a.read])).toEqual([
      ['Lieferung da', true, false],
      ['Lieferung bestellt', false, true],
      ['Razzia in Ehrenfeld', true, false],
    ]);
  });

  it('die Rückmeldung zu einem fehlgeschlagenen Befehl steht kurz und verschwindet dann', () => {
    const { api, ui } = make();
    api.dispatch({ type: 'test.fail', payload: {} } as never);
    expect(ui.error?.text).toBe('geht nicht');
    vi.advanceTimersByTime(2000);
    expect(ui.error).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(ui.error).toBeNull();
    api.dispatch({ type: 'test.fail', payload: {} } as never);
    api.dismissError();
    expect(ui.error).toBeNull();
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
