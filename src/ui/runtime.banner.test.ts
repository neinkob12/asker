// Banner im UiRuntime: Ausblenden mit ID (Wisch-Animation gegen neues Banner) und Anhalten beim Drüberfahren.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, GameState } from '../core';
import { UiRuntime } from './runtime';

function make() {
  const session = {
    state: { time: 1000 } as unknown as GameState,
    sim: { isOver: false },
    loop: { speed: 1 },
    setSpeed: (speed: number) => {
      session.loop.speed = speed;
    },
    dispatch: () => ({ ok: true }),
    subscribe: () => () => {},
    onEvent: () => () => {},
  };
  const runtime = new UiRuntime(session as unknown as GameSession, null);
  return { runtime, api: runtime.api, ui: runtime.ui };
}

const note = (text: string) => ({ appId: 'core.messages', title: 'Nord', text, time: 1, urgent: true });

describe('Banner', () => {
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

  it('dismissNotification(id) löscht ein inzwischen eingetroffenes neues Banner nicht', () => {
    const { api, ui } = make();
    api.notify(note('erstes'));
    const first = ui.notification;
    expect(first).not.toBeNull();
    // Während der Wisch-Animation kommt ein neues Banner; danach ruft onRest das Ausblenden des alten.
    api.notify(note('zweites'));
    const second = ui.notification;
    expect(second?.id).not.toBe(first?.id);
    api.dismissNotification(first?.id);
    expect(ui.notification).toBe(second);
    // Mit der richtigen ID und ohne ID verschwindet es.
    api.dismissNotification(second?.id);
    expect(ui.notification).toBeNull();
    api.notify(note('drittes'));
    api.dismissNotification();
    expect(ui.notification).toBeNull();
  });

  it('dismissToast(id) trifft nur den gemeinten Toast', () => {
    const { api, ui } = make();
    api.toast('Razzia', 'bad');
    api.toast('Kontrolle', 'bad');
    const [a, b] = ui.toasts;
    // a ist schon von allein weg, das Wischen meldet es noch: b darf nicht mitgehen.
    ui.toasts = [b];
    api.dismissToast(a.id);
    expect(ui.toasts).toEqual([b]);
    api.dismissToast(b.id);
    expect(ui.toasts).toEqual([]);
  });

  it('ein angehaltenes Banner bleibt stehen und läuft nach dem Loslassen kurz weiter', () => {
    const { api, ui } = make();
    api.notify(note('lies mich'));
    vi.advanceTimersByTime(4000);
    api.holdBanner(true);
    vi.advanceTimersByTime(60000);
    expect(ui.notification).not.toBeNull();
    api.holdBanner(false);
    vi.advanceTimersByTime(2000);
    expect(ui.notification).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(ui.notification).toBeNull();
  });

  it('ein Banner, das während des Anhaltens eintrifft, startet erst nach dem Loslassen', () => {
    const { api, ui } = make();
    api.holdBanner(true);
    api.notify(note('neu'));
    vi.advanceTimersByTime(20000);
    expect(ui.notification).not.toBeNull();
    api.holdBanner(false);
    vi.advanceTimersByTime(3000);
    expect(ui.notification).toBeNull();
  });
});
