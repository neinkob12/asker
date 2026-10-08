// Regressionstests zu Befunden aus dem Bugreview (Oberfläche ohne Browser): Kartenauswahl, Filter „Offen“ und
// Kartendialog ohne Schleier.

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, GameState } from '../core';
import { pushOverlay } from './overlays';
import { isOpenChat } from './phone/messagesModel';
import { UiRuntime } from './runtime';

/** Was UiRuntime von der Sitzung braucht (wie in runtime.test.ts). */
function fakeSession() {
  const session = {
    state: { time: 1000 } as unknown as GameState,
    sim: { isOver: false },
    loop: { speed: 1 },
    setSpeed(speed: number) {
      session.loop.speed = speed;
    },
    dispatch: () => ({ ok: true }),
    subscribe: () => () => {},
    onEvent: () => () => {},
  };
  return session;
}

type Pos = { lng: number; lat: number };

/** Karte wie GameMap: Eine neue Auswahl bricht die laufende ab (löst sie mit null auf). */
function fakeMap() {
  let pending: ((pos: Pos | null) => void) | null = null;
  const map = {
    pickLocation(): Promise<Pos | null> {
      map.cancelPick();
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    cancelPick() {
      if (!pending) return;
      const resolve = pending;
      pending = null;
      resolve(null);
    },
    click(pos: Pos) {
      const resolve = pending;
      pending = null;
      resolve?.(pos);
    },
  };
  return map;
}

describe('zweite Kartenauswahl während einer laufenden', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Handy-Bildschirm: Die Auswahl legt das Handy weg.
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('behält den Hinweis der neuen Auswahl, und das Handy kommt erst nach ihr zurück', async () => {
    const runtime = new UiRuntime(fakeSession() as unknown as GameSession, null);
    const { api, ui } = runtime;
    const map = fakeMap();
    runtime.map = map as never;
    api.openPhone('tab:territory');
    expect(ui.phone.open).toBe(true);

    const first = api.pickLocation('Spot A verlegen');
    expect(ui.picking?.prompt).toBe('Spot A verlegen');
    expect(ui.phone.open).toBe(false);

    const second = api.pickLocation('Spot B verlegen');
    // Die erste ist abgebrochen; ihr Ende räumt den Hinweis der zweiten nicht weg und holt das Handy nicht hervor.
    expect(await first).toBeNull();
    expect(ui.picking?.prompt).toBe('Spot B verlegen');
    expect(ui.phone.open).toBe(false);

    map.click({ lng: 6.95, lat: 50.94 });
    expect(await second).toEqual({ lng: 6.95, lat: 50.94 });
    expect(ui.picking).toBeNull();
    expect(ui.phone.open).toBe(true);
  });
});

describe('Filter „Offen“ in den Nachrichten', () => {
  it('Zähler und Liste fragen dieselbe Bedingung: wartet auf Antwort oder hat Ungelesenes', () => {
    const chats = [
      { id: 'frage', awaitingAnswer: true, unread: 0 },
      { id: 'info', awaitingAnswer: false, unread: 2 },
      { id: 'gelesen', awaitingAnswer: false, unread: 0 },
    ];
    expect(chats.filter(isOpenChat).map((c) => c.id)).toEqual(['frage', 'info']);
  });
});

describe('Kartendialog ohne Schleier', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lässt Ziehen und Zoomen an die Karte durch: der Schleier nimmt keine Zeiger an', () => {
    const css = readFileSync(new URL('./shell/shell.css', import.meta.url), 'utf8');
    const rule = css.match(/\.ui-map-dialog__scrim\.is-none\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/pointer-events:\s*none/);
  });

  it('schließt, wenn ein Klick auf ein Gebiet dessen Seite im Handy öffnet', () => {
    const runtime = new UiRuntime(fakeSession() as unknown as GameSession, null);
    // So meldet sich MapDialog am Desktop an (useOverlay): Navigation ruft onClose.
    const onClose = vi.fn();
    const release = pushOverlay(onClose);
    try {
      // Wie der Klick auf die Veedel-Fläche der Karte.
      runtime.api.openPanel('veedel.veedel', { veedelId: 'ehrenfeld' });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  });
});
