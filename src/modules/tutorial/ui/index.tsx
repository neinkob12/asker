// Oberfläche des Tutorials (Auftrag 46b): die Missions-Karte im HUD unter Geld und Heat (an der Stelle der
// Quest-Karte, die bei laufendem Tutorial versteckt ist), Einstellungen › Einstieg mit „Tutorial beenden“, der Dev-Haken
// window.koeln.dev.tutorialStage(n) und das Ausblenden des sauberen Geldes im Kern-HUD. Keine Banner, keine Dynamic
// Island: Erledigt leuchtet die Karte kurz golden und es gibt einen Ton, dann kommt die nächste Karte. Die Touren
// (Peters Erklärungen) kommen mit Auftrag 46c; Anker für sie: data-tour="hud.mission".

import { useState } from 'preact/hooks';
import { contactLook, type GameState, type Simulation } from '../../../core';
import {
  Avatar,
  Button,
  Hint,
  Icon,
  registerHudItem,
  registerHudPartHidden,
  registerSlot,
  soundOnEvent,
  type UiApi,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { getSpots, lockedSpots, spotCity } from '../../spots';
import {
  currentMission,
  LAST_STAGE,
  MISSIONS,
  type MissionDef,
  type MissionGoTo,
  missionProgress,
  missionReward,
  PETER,
  rewardText,
  stageInfo,
  tutorialActive,
  tutorialAllows,
  tutorialEnabled,
  tutorialFinished,
} from '../index';
import './tutorial.css';

/** Führt zur Stelle, an der die Mission erledigt wird. */
function goTo(ui: UiApi, state: GameState, target: MissionGoTo): void {
  const city = activeCity(state);
  switch (target) {
    case 'spot': {
      const spot = getSpots(state, city)[0];
      if (!spot) return;
      ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
      ui.openPanel('spots.spot', { spotId: spot.id });
      return;
    }
    case 'spots': {
      // Der nächste Spot, der zu haben ist (grau auf der Karte).
      const spot = lockedSpots(state).find((s) => spotCity(s) === city) ?? getSpots(state, city)[0];
      if (!spot) return;
      ui.flyTo({ lng: spot.lng, lat: spot.lat }, 15);
      ui.openPanel('spots.spot', { spotId: spot.id });
      return;
    }
    case 'suppliers':
      ui.openPhone('suppliers.app');
      return;
    case 'staff':
      ui.selectTab('staff');
      return;
    case 'territory':
      ui.selectTab('territory');
      return;
    case 'laundering':
      ui.openPhone('laundering.app');
      return;
    case 'port':
      ui.openPanel('logistics.port', {});
      return;
    case 'rightHand':
      ui.openPanel('hierarchy.rightHand', {});
      return;
  }
}

function formatValue(value: number, target: number, euro: boolean): string {
  if (euro) return `${Math.floor(value).toLocaleString('de-DE')} / ${target.toLocaleString('de-DE')} €`;
  return `${Math.floor(value)}/${target}`;
}

/** Eingeklappt merkt sich die Karte pro Mission bzw. Stufe (eine neue klappt wieder auf). */
const COLLAPSED_KEY = 'koeln-tycoon:tutorial-collapsed';

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === key;
  } catch {
    return false;
  }
}

function writeCollapsed(key: string | null): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, key ?? '');
  } catch {
    // Kein Speicher: gilt dann nur bis zum Neuladen.
  }
}

function TutorialHud() {
  const { state } = useGame();
  if (!tutorialEnabled(state) || tutorialFinished(state)) return null;
  const mission = currentMission(state);
  // Pro Mission bzw. Stufe neu: Die Karte geht auf und leuchtet kurz (Animation beim Einhängen).
  if (mission) return <MissionCard key={mission.id} mission={mission} />;
  if (tutorialActive(state)) return <StageCard key={state.modules.tutorial.stage} />;
  return null;
}

function PeterHead() {
  return <Avatar name={PETER.name} look={contactLook(PETER)} size="sm" />;
}

function MissionCard(props: { mission: MissionDef }) {
  const { state } = useGame();
  const ui = useUi();
  const { mission } = props;
  const [collapsed, setCollapsed] = useState(() => readCollapsed(mission.id));
  const { parts } = missionProgress(state);
  const reward = missionReward(state);
  const number = MISSIONS.indexOf(mission) + 1;
  const single = parts.length === 1 ? parts[0] : null;
  const toggle = () => {
    setCollapsed(!collapsed);
    writeCollapsed(collapsed ? null : mission.id);
  };
  const go = () => goTo(ui, state, mission.goTo);
  if (collapsed) {
    return (
      <button type="button" class="tutorial-hud tutorial-hud--mini" onClick={toggle} aria-label="Mission aufklappen">
        <Icon name="target" />
        <span class="tutorial-hud__mini-title">{mission.title}</span>
        <span class="tutorial-hud__count">
          {single
            ? formatValue(single.value, single.target, single.euro)
            : `${parts.filter((p) => p.done).length}/${parts.length}`}
        </span>
        <Icon name="chevronDown" />
      </button>
    );
  }
  return (
    <section class="tutorial-hud is-new" aria-label="Aktuelle Mission" data-tour="hud.mission">
      <header class="tutorial-hud__head">
        <span class="hud-label is-tutorial">
          Mission {number}/{MISSIONS.length} · {stageInfo(mission.stage).title}
        </span>
        <button type="button" class="tutorial-hud__icon-btn" onClick={toggle} aria-label="Mission einklappen">
          <Icon name="chevronUp" />
        </button>
      </header>
      <button type="button" class="tutorial-hud__main" onClick={go}>
        <PeterHead />
        <span class="tutorial-hud__text">
          <strong class="tutorial-hud__title">{mission.title}</strong>
          <span class="tutorial-hud__hint">{mission.hint}</span>
        </span>
        <Icon name="chevronRight" class="tutorial-hud__go" />
      </button>
      {single ? (
        <div class="tutorial-hud__progress">
          <span
            class="tutorial-hud__bar"
            role="progressbar"
            aria-valuenow={Math.round((single.value / single.target) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              class="tutorial-hud__fill"
              style={{ width: `${Math.min(100, (single.value / single.target) * 100)}%` }}
            />
          </span>
          <span class="tutorial-hud__count">{formatValue(single.value, single.target, single.euro)}</span>
        </div>
      ) : (
        <ul class="tutorial-hud__parts">
          {parts.map((part) => (
            <li key={part.id} class={`tutorial-hud__part ${part.done ? 'is-done' : ''}`}>
              <Icon name={part.done ? 'checkCircle' : 'target'} class="tutorial-hud__check" />
              <span class="tutorial-hud__part-label">{part.label}</span>
              <span class="tutorial-hud__count">{formatValue(part.value, part.target, part.euro)}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="tutorial-hud__reward" title="Belohnung: 20 % vom Umsatz und von der Ware der letzten 24 Stunden">
        <Icon name="gift" />
        <span>{rewardText(reward)}</span>
      </div>
    </section>
  );
}

/**
 * Stufe ohne Mission (0, 3, 4, 10): Titel und ein Satz, dazu „Weiter“ (tutorial.advance). Mit Auftrag 46c übernimmt
 * die Tour der Stufe das Weiterschalten; der Knopf bleibt als Weg ohne Tour.
 */
function StageCard() {
  const { state, dispatch } = useGame();
  const stage = state.modules.tutorial.stage;
  const info = stageInfo(stage);
  return (
    <section class="tutorial-hud is-new" aria-label="Tutorial" data-tour="hud.mission">
      <header class="tutorial-hud__head">
        <span class="hud-label is-tutorial">
          Stufe {stage}/{LAST_STAGE} · Tutorial
        </span>
      </header>
      <div class="tutorial-hud__main">
        <PeterHead />
        <span class="tutorial-hud__text">
          <strong class="tutorial-hud__title">{info.title}</strong>
          <span class="tutorial-hud__hint">{info.text}</span>
        </span>
      </div>
      <button
        type="button"
        class="tutorial-hud__cta"
        onClick={() => dispatch({ type: 'tutorial.advance', payload: {} })}
      >
        Weiter
        <Icon name="chevronRight" />
      </button>
    </section>
  );
}

registerHudItem({ id: 'tutorial.mission', order: 39, placement: 'below', icon: 'target', component: TutorialHud });
soundOnEvent('tutorial.missionDone', 'success');

// Sauberes Geld im Kern-HUD erst mit der Geldwäsche.
registerHudPartHidden('cleanMoney', 'tutorial', (state) => !tutorialAllows(state, 'hud.cleanMoney'));

/** Einstellungen › Einstieg: Tutorial beenden (alles frei, keine Missionen mehr). */
function TutorialSettings() {
  const { state, dispatch } = useGame();
  if (!tutorialEnabled(state)) return <Hint>Das Tutorial gibt es in einem neuen Spiel im Modus normal.</Hint>;
  if (tutorialFinished(state)) return <Hint icon="checkCircle">Tutorial beendet, alles ist frei.</Hint>;
  return (
    <div class="tutorial-settings">
      <Hint>
        Peter führt dich Stufe für Stufe durch Köln. Beenden gibt alles sofort frei, die Missionen fallen weg.
      </Hint>
      <Button variant="danger" icon="skip" onClick={() => dispatch({ type: 'tutorial.skip', payload: {} })}>
        Tutorial beenden
      </Button>
    </div>
  );
}

registerSlot('core.settings', {
  id: 'tutorial.settings',
  title: 'Einstieg',
  icon: 'target',
  color: 'brand',
  order: 6,
  component: TutorialSettings,
});

// ---------------------------------------------------------------------------------------------
// Nur im Dev-Build: window.koeln.dev.tutorialStage(n) springt im Tutorial auf Stufe n (Missionen davor gelten als
// erledigt, ohne Belohnung; die Mission der Stufe startet mit dem nächsten Schritt).

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const sim = (): Simulation => {
    const current = window.koeln?.session.sim;
    if (!current) throw new Error('Kein Spiel geladen.');
    return current;
  };
  const dev = {
    tutorialStage: (stage: number) => {
      const s = sim();
      if (!s.state.modules.tutorial.enabled) s.dispatch({ type: 'tutorial.start', payload: {} });
      const target = Math.max(0, Math.min(LAST_STAGE, Math.floor(stage)));
      const t = s.state.modules.tutorial;
      t.stage = target;
      t.mission = null;
      t.skipped = false;
      t.done = MISSIONS.filter((m) => m.stage < target).map((m) => m.id);
      s.advance(5);
    },
  };
  const holder = window as unknown as { koeln?: { dev?: Record<string, (...args: never[]) => unknown> } };
  holder.koeln = { ...holder.koeln, dev: { ...holder.koeln?.dev, ...dev } };
}
