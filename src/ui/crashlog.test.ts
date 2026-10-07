import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../core';
import { bindCrashLog, crashText, STALE_MS } from './crashlog';
import type { UiRuntime } from './runtime';

function fakeRuntime() {
  const toasts: string[] = [];
  const runtime = {
    state: { time: 3 * 1440 + 14 * 60 + 5 },
    ui: { phone: { open: true, app: 'core.messages', stack: [] } },
    api: { toast: (text: string) => toasts.push(text) },
  } as unknown as UiRuntime;
  return { runtime, toasts };
}

describe('Fehlerfänger (Auftrag 47)', () => {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  beforeEach(() => {
    vi.useFakeTimers();
    g.window = new EventTarget();
    g.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete g.window;
    delete g.document;
  });

  it('meldet beim nächsten Start, wobei die letzte Sitzung abgebrochen ist', () => {
    const storage = memoryStorage();
    const first = fakeRuntime();
    bindCrashLog(first.runtime, storage);
    expect(first.toasts).toEqual([]);
    // Kein pagehide, keine Lebenszeichen mehr: Die Seite ist abgestürzt.
    vi.clearAllTimers();
    // Ein Neustart gleich danach sieht ein frisches Lebenszeichen und wartet.
    const second = fakeRuntime();
    const off = bindCrashLog(second.runtime, storage);
    expect(second.toasts).toEqual([]);
    vi.advanceTimersByTime(STALE_MS + 5000);
    expect(second.toasts).toHaveLength(1);
    expect(second.toasts[0]).toContain('unerwartet beendet');
    expect(second.toasts[0]).toContain('Handy: core.messages');
    // Ordentlich verlassen: Beim nächsten Start kommt nichts.
    off();
    const third = fakeRuntime();
    bindCrashLog(third.runtime, storage);
    vi.advanceTimersByTime(STALE_MS + 5000);
    expect(third.toasts).toEqual([]);
  });

  it('ein zweiter offener Tab zählt nicht als Absturz', () => {
    const storage = memoryStorage();
    const first = fakeRuntime();
    bindCrashLog(first.runtime, storage);
    const second = fakeRuntime();
    bindCrashLog(second.runtime, storage);
    // Beide erneuern ihr Lebenszeichen alle fünf Sekunden.
    vi.advanceTimersByTime(60_000);
    expect(first.toasts).toEqual([]);
    expect(second.toasts).toEqual([]);
  });

  it('schreibt Fehler in den Verlauf, denselben höchstens dreimal', () => {
    const storage = memoryStorage();
    const { runtime, toasts } = fakeRuntime();
    bindCrashLog(runtime, storage);
    const win = g.window as EventTarget;
    for (let i = 0; i < 5; i++) {
      const event = Object.assign(new Event('error'), { error: new Error('kaputt'), message: 'kaputt' });
      win.dispatchEvent(event);
    }
    expect(toasts).toEqual(['Fehler im Spiel: kaputt', 'Fehler im Spiel: kaputt', 'Fehler im Spiel: kaputt']);
    const saved = JSON.parse(storage.getItem('koeln-tycoon:errors') ?? '[]');
    expect(saved).toHaveLength(3);
    expect(saved[0].message).toBe('kaputt');
  });

  it('beschreibt den Moment ohne leere Teile', () => {
    expect(crashText({ at: 0, game: null, phone: null, voiceLoading: false })).toBe(
      'Die letzte Sitzung ist unerwartet beendet worden (Absturz oder vom Browser geschlossen).',
    );
    expect(crashText({ at: 0, game: 'Tag 2, 08:00', phone: null, voiceLoading: true })).toContain(
      ': Tag 2, 08:00, Sprachmodell lud.',
    );
  });
});
