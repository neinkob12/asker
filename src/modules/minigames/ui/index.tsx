// Oberfläche der Minispiele (Auftrag 44): Rahmen als Dialog über der Karte (pausiert das Spiel, nicht schließbar),
// Hinweis im HUD für ein offenes Minispiel (z.B. nach dem Laden), Vorschau ?minispiel=<art>, Statistik am Spielende.
// Die Spiele selbst liegen in games/<art>/ und melden sich mit registerMinigameView an (automatisch geladen).
// Baukasten für alle Spiele: kit/ (Bildschleife, Tasten, Touch, Canvas, HUD, Klänge).

import { useEffect } from 'preact/hooks';
import { Button, onGameEvent, registerDialog, registerGameStat, registerHudItem, useGame, useUi } from '../../../ui';
import { activeRightHand } from '../../hierarchy';
import { getStaffMember } from '../../staff';
import {
  activeChallenge,
  type Challenge,
  getChallenge,
  MINIGAME_KIND_IDS,
  MINIGAME_KINDS,
  minigameStats,
} from '../index';
import { MinigameFrame } from './Frame';
import { defer, finishFromDev, liveUi, rememberDialog, setLiveUi, shouldDefer, takeDeferred } from './flow';
import { registerMinigameSounds } from './kit/sounds';
import { devClock } from './kit/useFrameLoop';
import { isMinigameKind, previewChallenge, previewFromUrl } from './preview';
import './kit/kit.css';
import './minigames.css';

export { HudBar, HudMeter, HudTimer, type MeterColor, ResultStamp } from './kit/hud';
export { MINIGAME_SOUNDS, type MinigameSoundId, playSound, registerMinigameSounds } from './kit/sounds';
export { capture, type TouchButton, TouchControls, type TouchDirection, useSwipe } from './kit/TouchControls';
export { MAX_DT, useFrameLoop } from './kit/useFrameLoop';
export { type GameKeyPress, type GameKeys, useGameKeys } from './kit/useGameKeys';
export { MAX_DPR, type Stage, useStageCanvas } from './kit/useStageCanvas';
export { type MinigameControls, type MinigameView, type MinigameViewProps, registerMinigameView } from './registry';

// Die Spiele: jede games/<art>/index.tsx meldet sich selbst an (so ändern parallele Teile keine gemeinsame Liste).
import.meta.glob('./games/*/index.tsx', { eager: true });

declare module '../../../ui' {
  interface DialogRegistry {
    /** challengeId aus dem Spielstand; preview für die Vorschau (?minispiel=<art>), dann ist challengeId egal. */
    'minigames.play': { challengeId: number; preview?: Challenge };
  }
}

registerMinigameSounds();

registerDialog({
  id: 'minigames.play',
  component: MinigameFrame,
  pausesGame: true,
  dismissable: false,
  area: 'map',
});

/** Hinweis im HUD, wenn ein Minispiel offen ist, der Rahmen aber nicht (z.B. nach dem Laden eines Spielstands). */
function PendingHud() {
  const { state } = useGame();
  const ui = useUi();
  // Live-Sicht für die Übergänge (flow.ts): Dieser Eintrag steht immer im HUD.
  setLiveUi(ui);
  const open = activeChallenge(state);
  const free = !ui.state.dialog;
  // Hat das Minispiel auf das Schließen der Akte gewartet (flow.ts), kommt es jetzt von selbst.
  useEffect(() => {
    if (open && free && takeDeferred(open.id)) ui.openDialog('minigames.play', { challengeId: open.id });
  }, [open?.id, free]);
  if (!open || ui.state.dialog?.id === 'minigames.play') return null;
  return (
    <Button
      variant="danger"
      icon="bolt"
      class="mg-hud-alert"
      onClick={() => {
        rememberDialog();
        ui.openDialog('minigames.play', { challengeId: open.id });
      }}
    >
      {MINIGAME_KINDS[open.kind].name}
    </Button>
  );
}

/** Vorschau aus der Adresse einmal öffnen, sobald das Spiel steht. */
let previewOpened = false;
function PreviewLauncher() {
  const ui = useUi();
  useEffect(() => {
    if (previewOpened) return;
    previewOpened = true;
    const preview = previewFromUrl(window.location.search);
    if (!preview) return;
    // Erst nach dem ersten Rendern der ganzen Oberfläche (sonst geht die Anfrage zum Neuzeichnen verloren).
    const timer = setTimeout(() => ui.openDialog('minigames.play', { challengeId: preview.id, preview }), 0);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

registerHudItem({ id: 'minigames.pending', order: 49, placement: 'alert', component: PendingHud });
registerHudItem({ id: 'minigames.preview', order: 48, placement: 'alert', component: PreviewLauncher });

onGameEvent('minigame.started', 'minigames.open', (payload, ui, state) => {
  if (state.outcome.gameOver || !getChallenge(state, payload.id)) return;
  // Nach einer Konfrontation: erst die Akte mit dem Ausgang, dann das Minispiel.
  if (shouldDefer(payload.origin)) {
    defer(payload.id);
    return;
  }
  rememberDialog();
  ui.openDialog('minigames.play', { challengeId: payload.id });
});

// Hat die Rechte Hand übernommen, sagt eine Meldung, wie es ausging (der Rahmen ist dann schon zu).
onGameEvent('minigame.finished', 'minigames.rightHand', (payload, ui, state) => {
  if (payload.by !== 'rightHand') return;
  const post = activeRightHand(state, payload.cityId);
  const name = (post && getStaffMember(state, post.staffId)?.name.split(' ')[0]) ?? 'Deine Rechte Hand';
  const what = MINIGAME_KINDS[payload.kind].name;
  ui.toast(`${what}: ${name} hat es ${payload.won ? 'geschafft' : 'nicht geschafft'}.`, payload.won ? 'good' : 'bad', {
    urgent: true,
  });
});

registerGameStat({
  id: 'minigames.won',
  order: 60,
  icon: 'trophy',
  label: 'Minispiele gewonnen',
  value: (state) => {
    const stats = minigameStats(state);
    const won = MINIGAME_KIND_IDS.reduce((sum, k) => sum + (stats[k]?.won ?? 0), 0);
    // played zählt selbst gespielte und übernommene (nicht die abgelaufenen).
    const played = MINIGAME_KIND_IDS.reduce((sum, k) => sum + (stats[k]?.played ?? 0), 0);
    return played > 0 ? `${won} von ${played}` : '0';
  },
});

// Entwicklung (Screenshots, Playwright, Konsole):
// - minigameWin() / minigameLose(): das laufende Spiel sofort beenden.
// - minigamePreview(art, { schwer, seed, uhr }): Vorschau öffnen, wenn das Spiel schon steht (z.B. nach einem
//   Test-Spielstand); `uhr` setzt vorher die Spieluhr (Tageszeit der Karte, params.phase und params.hour).
// - minigameRealtime(true): Spielzeit läuft auch bei wenigen Bildern pro Sekunde in Echtzeit (headless).
// - minigameAdvance(s): beim nächsten Bild s Sekunden vorspulen.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const minigamePreview = (kind: string, options: { schwer?: number; seed?: number; uhr?: number } = {}) => {
    const ui = liveUi();
    if (!ui || !isMinigameKind(kind)) return false;
    const sim = window.koeln?.session.sim;
    const hour = options.uhr;
    if (sim && hour !== undefined) {
      const day = Math.floor(sim.state.time / 1440);
      sim.state.time = day * 1440 + Math.floor(hour) * 60;
    }
    const preview = previewChallenge(kind, options.schwer ?? 0.5, options.seed ?? 1, hour);
    ui.openDialog('minigames.play', { challengeId: preview.id, preview });
    return true;
  };
  window.koeln = {
    ...window.koeln,
    dev: {
      ...window.koeln?.dev,
      minigameWin: () => finishFromDev(true),
      minigameLose: () => finishFromDev(false),
      minigamePreview,
      minigameRealtime: (on = true) => {
        devClock.realtime = on;
      },
      minigameAdvance: (seconds: number) => {
        devClock.pending += Math.max(0, seconds);
        devClock.at = -1;
      },
    },
  } as typeof window.koeln;
}
