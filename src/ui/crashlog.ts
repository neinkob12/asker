// Fehlerfänger (Auftrag 47, Punkt 7): Abstürze sollen sichtbar werden. Fehler im Browser (window 'error',
// 'unhandledrejection') landen in der Konsole und in einer kurzen Liste im localStorage (nicht im Verlauf: Dort zählt
// jeder Eintrag am Badge, und ein fehlgeschlagener Abruf im Hintergrund ist keine Nachricht für den Spieler). Dazu ein
// Lebenszeichen je Tab: Solange die Seite läuft, steht alle paar Sekunden im localStorage, was gerade los ist (Spieltag,
// Uhrzeit, offene App, Sprachmodell lädt). Wird die Seite ordentlich verlassen (pagehide), fällt es weg. Ein
// Lebenszeichen, das länger als STALE_MS nicht erneuert wurde, gehört zu einer Sitzung, die abgebrochen ist (Absturz,
// Speicher voll oder vom Browser beendet); der Verlauf sagt dann, wobei. Ein zweiter offener Tab erneuert seines
// laufend und zählt nicht. Geprüft wird beim Start und noch einmal nach STALE_MS (der Browser lädt nach einem Absturz
// oft sofort neu, dann ist das alte Lebenszeichen noch frisch).

import { audio } from '../audio';
import { clock, type KeyValueStorage as Storage } from '../core';
import type { UiRuntime } from './runtime';

const ALIVE_PREFIX = 'koeln-tycoon:alive:';
const ERRORS_KEY = 'koeln-tycoon:errors';
/** So oft wird das Lebenszeichen erneuert. */
const HEARTBEAT_MS = 5000;
/** Älter als das: Der Tab dazu läuft nicht mehr. */
export const STALE_MS = 3 * HEARTBEAT_MS;
/** So viele Fehler bleiben in der Liste (neueste zuerst). */
const ERROR_LIMIT = 20;
/** Derselbe Fehler kommt höchstens so oft in den Verlauf (sonst füllt ein Fehler pro Bild alles). */
const SAME_ERROR_LIMIT = 3;

export interface CrashContext {
  /** Echte Zeit (ms). */
  at: number;
  /** Spielzeit als Text, z.B. "Tag 12, 14:05". */
  game: string | null;
  /** Offene App bzw. Seite im Handy. */
  phone: string | null;
  /** Lädt gerade ein Sprachmodell? */
  voiceLoading: boolean;
  /** Letzter Fehler dieser Sitzung, falls einer kam. */
  lastError?: string;
}

export interface LoggedError {
  at: number;
  message: string;
  game: string | null;
}

function read<T>(storage: Storage, key: string): T | null {
  try {
    const text = storage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll oder gesperrt: Das Lebenszeichen ist nur eine Hilfe.
  }
}

function context(runtime: UiRuntime, lastError?: string): CrashContext {
  const state = runtime.state;
  let voiceLoading = false;
  try {
    voiceLoading = audio.voiceModels.some((m) => m.state.kind === 'loading');
  } catch {
    // Ohne Audio (Tests) lädt auch nichts.
  }
  return {
    at: Date.now(),
    game: state ? clock.format(state.time) : null,
    phone: runtime.ui.phone.open ? runtime.ui.phone.app : null,
    voiceLoading,
    ...(lastError ? { lastError } : {}),
  };
}

/** Text für den Verlauf, wenn die letzte Sitzung abgebrochen ist. */
export function crashText(last: CrashContext): string {
  const parts = [
    last.game,
    last.phone ? `Handy: ${last.phone}` : null,
    last.voiceLoading ? 'Sprachmodell lud' : null,
    last.lastError ? `letzter Fehler: ${last.lastError}` : null,
  ];
  const where = parts.filter(Boolean).join(', ');
  return `Die letzte Sitzung ist unerwartet beendet worden (Absturz oder vom Browser geschlossen)${where ? `: ${where}` : ''}.`;
}

function describe(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

/** Fehlerfänger und Lebenszeichen anmelden. Gibt eine Funktion zum Abmelden zurück. */
export function bindCrashLog(runtime: UiRuntime, storage: Storage): () => void {
  const tab = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const ownKey = ALIVE_PREFIX + tab;
  /** Abgebrochene Sitzungen anderer Tabs melden und ihr Lebenszeichen entfernen. */
  const checkStale = () => {
    let keys: string[] = [];
    try {
      keys = storage.keys().filter((k) => k.startsWith(ALIVE_PREFIX) && k !== ownKey);
    } catch {
      return;
    }
    for (const key of keys) {
      const last = read<CrashContext>(storage, key);
      if (last && Date.now() - last.at < STALE_MS) continue;
      write(storage, key, null);
      if (!last) continue;
      const text = crashText(last);
      console.warn(text);
      runtime.api.toast(text, 'info', { log: true });
    }
  };
  checkStale();
  const recheck = setTimeout(checkStale, STALE_MS + HEARTBEAT_MS);

  const counts = new Map<string, number>();
  let lastError: string | undefined;
  const report = (reason: unknown) => {
    const message = describe(reason);
    const seen = (counts.get(message) ?? 0) + 1;
    counts.set(message, seen);
    lastError = message.slice(0, 200);
    if (seen > SAME_ERROR_LIMIT) return;
    const entry: LoggedError = { at: Date.now(), message, game: context(runtime).game };
    const list = read<LoggedError[]>(storage, ERRORS_KEY) ?? [];
    write(storage, ERRORS_KEY, [entry, ...list].slice(0, ERROR_LIMIT));
    beat();
  };
  const onError = (event: ErrorEvent) => report(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason);

  function beat() {
    write(storage, ownKey, context(runtime, lastError));
  }
  const leave = () => write(storage, ownKey, null);
  const onVisible = () => {
    if (document.visibilityState === 'visible') beat();
  };
  beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', beat);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    clearTimeout(recheck);
    leave();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', leave);
    window.removeEventListener('pageshow', beat);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
