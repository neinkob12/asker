// ErrorBoundary ohne Browser: Im stillen Modus kommt der Bereich von selbst wieder (mit wachsenden Pausen).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, SILENT_RETRY_MAX_MS, SILENT_RETRY_MS } from './ErrorBoundary';

function make(silent: boolean) {
  const boundary = new ErrorBoundary({ name: 'HUD-Teil', silent });
  const setState = vi.spyOn(boundary, 'setState').mockImplementation(() => {});
  return { boundary, setState };
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stiller Bereich: bleibt nach einem Fehler leer, versucht es nach einer Pause neu', () => {
    const { boundary, setState } = make(true);
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('kaputt'));
    boundary.componentDidCatch(new Error('kaputt'));
    expect(boundary.render()).toBeNull();
    vi.advanceTimersByTime(SILENT_RETRY_MS - 1);
    expect(setState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setState).toHaveBeenCalledWith({ error: null });
  });

  it('stürzt der Neuversuch wieder ab, verdoppelt sich die Pause (höchstens bis zum Limit)', () => {
    const { boundary, setState } = make(true);
    let delay = SILENT_RETRY_MS;
    for (let i = 0; i < 8; i++) {
      boundary.componentDidCatch(new Error('wieder'));
      const expected = Math.min(SILENT_RETRY_MAX_MS, delay);
      setState.mockClear();
      vi.advanceTimersByTime(expected - 1);
      expect(setState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(setState).toHaveBeenCalledTimes(1);
      delay *= 2;
    }
    expect(Math.min(SILENT_RETRY_MAX_MS, delay)).toBe(SILENT_RETRY_MAX_MS);
  });

  it('nach zwei fehlerfreien Zeichnungen startet die Pause wieder bei der kurzen Dauer', () => {
    const { boundary, setState } = make(true);
    boundary.componentDidCatch(new Error('a'));
    vi.advanceTimersByTime(SILENT_RETRY_MS);
    boundary.componentDidCatch(new Error('b'));
    vi.advanceTimersByTime(SILENT_RETRY_MS * 2);
    setState.mockClear();
    boundary.state = { error: null };
    boundary.componentDidUpdate({ name: 'x' }, { error: null });
    boundary.componentDidCatch(new Error('c'));
    vi.advanceTimersByTime(SILENT_RETRY_MS);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('mit Hinweis-Karte (nicht still) gibt es keinen Neuversuch von selbst, der Knopf bleibt der Weg', () => {
    const { boundary, setState } = make(false);
    boundary.componentDidCatch(new Error('kaputt'));
    vi.advanceTimersByTime(SILENT_RETRY_MAX_MS * 2);
    expect(setState).not.toHaveBeenCalled();
  });

  it('beim Abräumen läuft kein Neuversuch mehr', () => {
    const { boundary, setState } = make(true);
    boundary.componentDidCatch(new Error('kaputt'));
    boundary.componentWillUnmount();
    vi.advanceTimersByTime(SILENT_RETRY_MAX_MS);
    expect(setState).not.toHaveBeenCalled();
  });
});
