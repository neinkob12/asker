// Start der Oberfläche: Sitzung anlegen, Oberflächen der Module laden, Autosave fortsetzen oder neues Spiel.

import { render } from 'preact';
import { animationFrameScheduler, browserStorage, type GameMode, GameSession, type ModuleDefinition } from '../core';
import { registerBuiltins } from './builtin';
import { dialogs } from './registry';
import { UiRuntime } from './runtime';
import { App } from './shell/App';
import './styles/tokens.css';
import './styles/base.css';
import './shell/shell.css';

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
  const session = new GameSession({ modules, storage: browserStorage(), scheduler: animationFrameScheduler() });
  const runtime = new UiRuntime(session);

  // ?neu=normal|hardcore&seed=123 startet sofort ein frisches Spiel (praktisch für Screenshots und Tests).
  const params = new URLSearchParams(window.location.search);
  const fresh = params.get('neu');
  if (fresh !== null) {
    const seed = params.get('seed');
    session.newGame(fresh === 'hardcore' ? 'hardcore' : ('normal' as GameMode), seed ? Number(seed) : undefined);
  } else if (!session.continueAutosave()) {
    runtime.api.openDialog('core.newGame', { firstStart: true });
  }
  const speed = params.get('tempo');
  if (speed !== null) runtime.api.setSpeed(Number(speed));

  bindKeys(runtime);
  window.addEventListener('beforeunload', () => session.autosave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') session.autosave();
  });

  render(<App runtime={runtime} />, root);
  session.loop.start();
  window.koeln = { session, runtime };
  return runtime;
}

function bindKeys(runtime: UiRuntime): void {
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const { ui, api } = runtime;
    if (e.code === 'Space' && runtime.state && !ui.dialog) {
      e.preventDefault();
      api.togglePause();
    }
    if (e.code === 'Escape') {
      if (ui.picking) api.cancelPick();
      else if (ui.dialog) {
        if (dialogs.get(ui.dialog.id)?.dismissable !== false) api.closeDialog();
      } else if (ui.panel) api.closePanel();
      else if (ui.phone.open) api.closePhone();
    }
  });
}
