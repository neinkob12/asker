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
} from '../core';
import { dayPhase } from '../map/daylight';
import { registerBuiltins } from './builtin';
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
    /** Zum Ausprobieren in der Konsole und für Playwright: window.koeln.session, window.koeln.runtime. */
    koeln?: { session: GameSession; runtime: UiRuntime };
  }
}

export function startApp(root: HTMLElement, modules: readonly ModuleDefinition[]): UiRuntime {
  registerBuiltins();
  const storage = browserStorage();
  const session = new GameSession({ modules, storage, scheduler: animationFrameScheduler() });
  const runtime = new UiRuntime(session, storage);

  // Ton: Einstellungen laden, Start nach der ersten Interaktion, Musik-Stimmung folgt der Spieluhr.
  audio.init(storage);
  audio.attach(document);
  runtime.subscribe(() => {
    const state = runtime.state;
    if (state) audio.setMood(dayPhase(clock.minuteOfDay(state.time)));
  });
  bindClickSound();

  // ?neu=normal|hardcore&seed=123 startet sofort ein frisches Spiel (praktisch für Screenshots und Tests).
  const params = new URLSearchParams(window.location.search);
  const fresh = params.get('neu');
  if (fresh !== null) {
    const seed = params.get('seed');
    session.newGame(fresh === 'hardcore' ? 'hardcore' : ('normal' as GameMode), seed ? Number(seed) : undefined);
  } else if (!session.continueAutosave()) {
    // Beim allerersten Start erst das Intro (mit Name), danach die Wahl des Modus.
    if (introSeen()) runtime.api.openDialog('core.newGame', { firstStart: true });
    else runtime.api.openDialog('core.intro', {});
  }
  const speed = params.get('tempo');
  if (speed !== null) runtime.api.setSpeed(Number(speed));

  bindKeys(runtime);
  applyDockSpring();
  window.addEventListener('beforeunload', () => session.autosave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') session.autosave();
  });

  render(<App runtime={runtime} />, root);
  session.loop.start();
  window.koeln = { session, runtime };
  return runtime;
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

/** Leises Klicken bei Knöpfen der Oberfläche. */
function bindClickSound(): void {
  document.addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement | null)?.closest?.('button');
      if (!target || target.disabled) return;
      audio.play(target.closest('.phone') ? 'tap' : 'click', { volume: 0.35 });
    },
    true,
  );
}
