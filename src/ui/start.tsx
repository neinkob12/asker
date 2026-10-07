// Start der Oberfläche: Sitzung anlegen, Oberflächen der Module laden, Autosave fortsetzen oder neues Spiel.

import { render } from 'preact';
import { audio } from '../audio';
import {
  animationFrameScheduler,
  browserStorage,
  clock,
  type GameMode,
  GameSession,
  type ModuleDefinition,
  openBrowserSaveStorage,
} from '../core';
import { dayPhase } from '../map/daylight';
import { registerBuiltins } from './builtin';
import { loadTestSave } from './builtin/testSaves';
import { SPRINGS, springEasing } from './phone/spring';
import { introSeen } from './player';
import { UiRuntime } from './runtime';
import { App } from './shell/App';
import { bindKeys } from './shell/keys';
import './styles/tokens.css';
import './styles/base.css';
import './shell/shell.css';
import './shell/phone.css';
import './shell/phone-apps.css';

// Oberflächen der Module: jede src/modules/<id>/ui/index.ts(x) meldet sich beim Import selbst an.
import.meta.glob(['../modules/*/ui/index.ts', '../modules/*/ui/index.tsx', '!../modules/_*/**'], { eager: true });

declare global {
  interface Window {
    /**
     * Zum Ausprobieren in der Konsole und für Playwright: window.koeln.session, window.koeln.runtime, window.koeln.audio. Im Dev-Build
     * hängen Module unter dev Abkürzungen an (z.B. window.koeln.dev.koelnKomplett(), siehe src/modules/city/ui).
     */
    koeln?: {
      session: GameSession;
      runtime: UiRuntime;
      audio?: typeof audio;
      dev?: Record<string, (...args: never[]) => unknown>;
    };
  }
}

export async function startApp(root: HTMLElement, modules: readonly ModuleDefinition[]): Promise<UiRuntime> {
  registerBuiltins();
  // Einstellungen bleiben im localStorage, die Spielstände liegen in IndexedDB (Auftrag 47): Schreiben läuft im
  // Hintergrund, und die 5-MB-Grenze gilt nicht mehr. Ein Fehler dort kommt als Banner, wie ein voller Speicher.
  const storage = browserStorage();
  let reported: string | null = null;
  const saveStorage = await openBrowserSaveStorage((error) => {
    const text = `Speichern hat nicht geklappt: ${error instanceof Error ? error.message : String(error)}. Exportiere den Spielstand als Datei (Einstellungen › Verlauf).`;
    if (reported === text) return;
    reported = text;
    window.koeln?.runtime.api.toast(text, 'bad', { urgent: true });
  });
  const session = new GameSession({ modules, storage: saveStorage, scheduler: animationFrameScheduler() });
  const runtime = new UiRuntime(session, storage);

  // Ton: Einstellungen laden, Start nach der ersten Interaktion, Musik-Stimmung folgt der Spieluhr.
  audio.init(storage);
  audio.attach(document);
  const offMood = runtime.subscribe(() => {
    const state = runtime.state;
    if (state) audio.setMood(dayPhase(clock.minuteOfDay(state.time)));
  });
  // Alles, was global hängt (document, window), meldet sich hier ab, wenn das Modul im Entwicklungsserver ersetzt wird.
  const disposers: Array<() => void> = [bindClickSound()];
  disposers.push(bindPauseMarker(runtime), offMood);

  // ?neu=normal|hardcore&seed=123 startet sofort ein frisches Spiel (praktisch für Screenshots und Tests),
  // ?spielstand=koeln-komplett lädt einen Test-Spielstand (builtin/testSaves.ts).
  const params = new URLSearchParams(window.location.search);
  const fresh = params.get('neu');
  const testSave = params.get('spielstand');
  if (testSave !== null) {
    // Bis die Datei da ist, läuft der Autosave weiter (oder das Intro beim ersten Start).
    if (!session.continueAutosave() && !introSeen()) runtime.api.openDialog('core.intro', {});
    loadTestSave(session, testSave)
      .then((info) => {
        runtime.api.closeDialog();
        // ?tempo= gilt auch nach dem Laden (Auftrag 43, K11: das Schließen des Intros stellte Tempo 1 wieder her).
        const tempo = params.get('tempo');
        if (tempo !== null) runtime.api.setSpeed(Number(tempo));
        runtime.api.toast(`Test-Spielstand "${info.title}" geladen.`, 'good');
        // Neu laden spielt dann weiter, statt den Test-Spielstand noch einmal über den Autosave zu legen.
        const url = new URL(window.location.href);
        url.searchParams.delete('spielstand');
        window.history.replaceState(null, '', url);
      })
      .catch((error) =>
        runtime.api.toast(error instanceof Error ? error.message : 'Laden fehlgeschlagen.', 'bad', { urgent: true }),
      );
  } else if (fresh !== null) {
    const seed = params.get('seed');
    session.newGame(fresh === 'hardcore' ? 'hardcore' : ('normal' as GameMode), seed ? Number(seed) : undefined);
  } else if (!session.continueAutosave()) {
    // Ließ sich der letzte Spielstand nicht laden, sagen wir es (und dass eine Kopie bleibt), statt still neu anzufangen.
    if (session.loadError) {
      runtime.api.toast(
        `Dein letzter Spielstand ließ sich nicht laden (${session.loadError}) Eine Kopie bleibt im Browser-Speicher.`,
        'bad',
        { urgent: true },
      );
    }
    // Beim allerersten Start erst das Intro (mit Name), danach die Wahl des Modus.
    if (introSeen()) runtime.api.openDialog('core.newGame', { firstStart: true });
    else runtime.api.openDialog('core.intro', {});
  }
  const speed = params.get('tempo');
  if (speed !== null) runtime.api.setSpeed(Number(speed));

  disposers.push(bindKeys(runtime));
  applyDockSpring();
  // Beim Verlassen: Autosave, und was die Datenbank noch nicht bestätigt hat, in den Notfallspeicher (saves.ts).
  const persistPending = () => {
    if ('persistPending' in saveStorage) (saveStorage as { persistPending(): void }).persistPending();
  };
  const saveOnUnload = () => {
    session.autosave();
    persistPending();
  };
  const saveOnHide = () => {
    if (document.visibilityState === 'hidden') saveOnUnload();
  };
  window.addEventListener('beforeunload', saveOnUnload);
  window.addEventListener('pagehide', saveOnUnload);
  document.addEventListener('visibilitychange', saveOnHide);
  disposers.push(
    () => window.removeEventListener('beforeunload', saveOnUnload),
    () => window.removeEventListener('pagehide', saveOnUnload),
    () => document.removeEventListener('visibilitychange', saveOnHide),
  );

  render(<App runtime={runtime} />, root);
  session.loop.start();
  window.koeln = { ...window.koeln, session, runtime, audio };

  // Wird dieses Modul im Entwicklungsserver ersetzt, laufen sonst die alten Listener neben den neuen weiter.
  import.meta.hot?.dispose(() => {
    for (const dispose of disposers.splice(0)) dispose();
    session.loop.stop();
    render(null, root);
  });
  return runtime;
}

/**
 * Setzt `data-paused` am Wurzelelement, solange das Spiel steht (Tempo 0, z.B. Pause oder ein Dialog, der es anhält):
 * Endlos-Animationen der Karte und des Handys halten dann an (styles/base.css), statt weiter Strom zu verbrauchen.
 */
function bindPauseMarker(runtime: UiRuntime): () => void {
  const root = document.documentElement;
  const update = () => {
    const paused = runtime.session.loop.speed === 0 || runtime.ui.dialog !== null;
    if (paused !== root.hasAttribute('data-paused')) root.toggleAttribute('data-paused', paused);
  };
  update();
  const off = runtime.subscribe(update);
  return () => {
    off();
    root.removeAttribute('data-paused');
  };
}

/**
 * HUD, Kartensteuerung und Overlays über der Karte folgen dem Ein- und Ausklappen des Handys mit derselben Feder wie
 * das Handy (SPRINGS.app), als CSS-Kurve. Die Tokens --dock-ease/--dock-duration greifen darauf zurück; bei
 * "Bewegung reduzieren" gilt weiter die kurze Dauer aus tokens.css.
 */
function applyDockSpring(): void {
  const { easing, durationMs } = springEasing(SPRINGS.app);
  const root = document.documentElement.style;
  root.setProperty('--spring-dock-ease', easing);
  root.setProperty('--spring-dock-duration', `${durationMs}ms`);
}

/** Leises Klicken bei Knöpfen der Oberfläche. Gibt die Abmeldung zurück. */
function bindClickSound(): () => void {
  const onClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest?.('button');
    if (!target || target.disabled) return;
    audio.play(target.closest('.phone') ? 'tap' : 'click', { volume: 0.35 });
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
