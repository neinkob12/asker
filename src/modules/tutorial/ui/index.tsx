// Oberfläche des Tutorials (Auftrag 46b): die Missions-Karte im HUD unter Geld und Heat (an der Stelle der
// Quest-Karte, die bei laufendem Tutorial versteckt ist), Einstellungen › Einstieg mit „Tutorial beenden“, der Dev-Haken
// window.koeln.dev.tutorialStage(n) und das Ausblenden des sauberen Geldes im Kern-HUD. Keine Banner, keine Dynamic
// Island: Erledigt leuchtet die Karte kurz golden und es gibt einen Ton, dann kommt die nächste Karte.
//
// Auftrag 46c: Die Touren (tours.ts) startet TourStarter, eine unsichtbare Komponente im HUD: Sie sieht am Zustand,
// welche Stufe ihre Tour noch nicht hatte (toursSeen), und startet sie; so kommt die Tour beim Erreichen der Stufe und
// nach dem Laden eines Spielstands, in dem sie fehlte. Die Touren der Momente (erste Lieferung, erster Fahrer,
// Handy-Bestellung, erster Gang-Angriff, Beschlagnahme) hängen an Ereignissen. Das Pop-up „Lager fast leer“ ist ein
// Dialog. Am Ende einer Erklär-Stufe schickt die Tour 'tutorial.advance', am Ende jeder Tour 'tutorial.tourSeen'.

import { useEffect, useState } from 'preact/hooks';
import { contactLook, type GameState, type Simulation } from '../../../core';
import {
  Avatar,
  Button,
  Dialog,
  Hint,
  Icon,
  onGameEvent,
  registerDialog,
  registerHudItem,
  registerHudPartHidden,
  registerSlot,
  soundOnEvent,
  type TourDef,
  type UiApi,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { getGang } from '../../gangs';
import { getSpots, lockedSpots, spotCity } from '../../spots';
import {
  currentMission,
  type ExtraTour,
  extraTourSeen,
  LAST_STAGE,
  MISSIONS,
  type MissionDef,
  type MissionGoTo,
  missionProgress,
  missionReward,
  PETER,
  rewardText,
  stageInfo,
  tourSeen,
  tutorialActive,
  tutorialAllows,
  tutorialEnabled,
  tutorialFinished,
} from '../index';
import {
  deliveryTour,
  driverTour,
  EXPLAIN_STAGES,
  firstAttackTour,
  MOMENT_STAGES,
  phoneOrderTour,
  stageTour,
  type TourContext,
} from './tours';
import './tutorial.css';

declare module '../../../ui' {
  interface DialogRegistry {
    /** Auftrag 46c: Pop-up „Lager fast leer“ mit Peter. */
    'tutorial.lowStock': Record<string, never>;
  }
}

// ---------------------------------------------------------------------------------------------
// Touren (Auftrag 46c)

/** Läuft gerade bzw. ist eingereiht (Schlüssel: Spiel und Stufe), damit kein Neuzeichnen sie doppelt startet. */
const pending = new Set<string>();

function gameKey(state: GameState): string {
  return `${state.meta.runId}:${state.meta.seed}`;
}

/** Tour starten und am Ende im Zustand vermerken; Erklär-Stufen schalten weiter, Stufe 0 setzt das Tempo auf 1. */
async function runTour(ui: UiApi, key: string, def: TourDef, done: () => void): Promise<void> {
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const outcome = await ui.tour.start(def);
    // Übersprungen zählt als gesehen, wenn die Tour das erlaubt (auch wenn danach gleich eine eingereihte startet).
    // 'reset' kommt von einem neuen oder geladenen Spiel: nichts vermerken, das Spiel ist ein anderes.
    if (outcome === 'done' || (outcome === 'skipped' && def.skippable)) done();
  } finally {
    pending.delete(key);
  }
}

/**
 * Die Stufe, deren Tour jetzt dran ist, sonst null. Stufe 9 startet mit der Beschlagnahme (Moment 'seizure'), nicht
 * mit der Stufe. Geht das Tutorial ohne sie weiter (keine zweite Lieferung von Jansen in Stufe 9), kommt die Tour der
 * Stufe 9 mit dem Wechsel der Stufe, vor der Tour der neuen Stufe.
 */
function dueTourStage(state: GameState): number | null {
  const t = state.modules.tutorial;
  if (!t?.enabled || t.skipped || t.stage > LAST_STAGE) return null;
  const missed = MOMENT_STAGES.find((stage) => t.stage > stage && t.stage < LAST_STAGE && !tourSeen(state, stage));
  if (missed !== undefined) return missed;
  if (tourSeen(state, t.stage)) return null;
  if (MOMENT_STAGES.includes(t.stage) && !t.scripted.seizure) return null;
  return t.stage;
}

/** Die Tour einer Stufe, falls sie noch fehlt (beim Erreichen der Stufe und nach dem Laden). Exportiert für Tests. */
export function startStageTour(ui: UiApi, state: GameState): void {
  const stage = dueTourStage(state);
  if (stage === null) return;
  const key = `${gameKey(state)}:stage:${stage}`;
  const ctx: TourContext = { ui, state };
  void runTour(ui, key, stageTour(stage, ctx), () => {
    // „Tutorial beenden“ während der Tour: skip hat alle Touren vermerkt, weiterschalten gibt es nicht mehr.
    if (state.modules.tutorial.skipped) return;
    ui.dispatch({ type: 'tutorial.tourSeen', payload: { stage } });
    if (EXPLAIN_STAGES.includes(stage)) ui.dispatch({ type: 'tutorial.advance', payload: {} });
    // Direkt nach dem Spielstart steht die Uhr (PR #92, Tempo): Nach der ersten Tour läuft das Spiel.
    if (stage === 0) ui.setSpeed(1);
  });
}

/** Eine der weiteren Touren (erste Lieferung, erster Fahrer), einmal. */
function startExtraTour(ui: UiApi, state: GameState, extra: ExtraTour, def: TourDef): void {
  if (!tutorialActive(state) || extraTourSeen(state, extra)) return;
  const key = `${gameKey(state)}:extra:${extra}`;
  void runTour(ui, key, def, () => ui.dispatch({ type: 'tutorial.tourSeen', payload: { extra } }));
}

/** Unsichtbar im HUD: startet die Tour der Stufe, sobald der Zustand sie verlangt. */
function TourStarter() {
  const { state } = useGame();
  const ui = useUi();
  const due = dueTourStage(state);
  const key = gameKey(state);
  useEffect(() => {
    if (due === null) return;
    startStageTour(ui, state);
  }, [ui, state, key, due]);
  return null;
}

onGameEvent('tutorial.scriptedMoment', 'tutorial.moments', (payload, ui, state) => {
  const ctx: TourContext = { ui, state };
  const key = `${gameKey(state)}:moment:${payload.key}`;
  switch (payload.key) {
    case 'phoneOrder':
      void runTour(ui, key, phoneOrderTour(ctx, payload.ref), () => undefined);
      return;
    case 'firstAttack': {
      const gang = payload.ref ? getGang(state, payload.ref) : undefined;
      void runTour(ui, key, firstAttackTour(ctx, gang?.name ?? 'die Gang'), () => undefined);
      return;
    }
    case 'seizure':
      // Die Tour der Stufe 9 (TourStarter sieht das Flag beim nächsten Neuzeichnen, hier geht es sofort los). Kommt
      // die Beschlagnahme erst nach Stufe 9, lief deren Tour schon mit dem Wechsel der Stufe (dueTourStage).
      startStageTour(ui, state);
      return;
    case 'lowStockPopup':
      ui.openDialog('tutorial.lowStock', {});
      return;
  }
});

// Erste Lieferung in Köln (nicht am Kai): das Lager im HUD und die Lieferungen in der App.
onGameEvent('shipment.arrived', 'tutorial.delivery', (payload, ui, state) => {
  if (payload.atPort || payload.cityId !== 'koeln') return;
  startExtraTour(ui, state, 'delivery', deliveryTour({ ui, state }));
});

// Erster Fahrer: Abholen am Kai und Routen.
onGameEvent('staff.hired', 'tutorial.driver', (payload, ui, state) => {
  if (payload.role !== 'driver') return;
  startExtraTour(ui, state, 'driver', driverTour({ ui, state }));
});

/** Pop-up „Lager fast leer“ (Auftrag 46c): Peter, Knopf zu den Lieferanten, Später. */
function LowStockDialog() {
  const ui = useUi();
  const later = () => ui.closeDialog();
  const go = () => {
    ui.closeDialog();
    ui.openPhone('suppliers.app');
  };
  return (
    <Dialog
      title="Dein Lager ist fast leer"
      kicker="Peter"
      class="tutorial-popup"
      onClose={later}
      actions={
        <>
          <Button onClick={later}>Später</Button>
          <Button variant="primary" icon="truck" onClick={go}>
            Zu den Lieferanten
          </Button>
        </>
      }
    >
      <div class="tutorial-popup__body">
        <Avatar name={PETER.name} look={contactLook(PETER)} size="lg" />
        <p class="tutorial-popup__text">
          Dein Lager reicht keinen Tag mehr. Ohne Ware verkauft keiner, bestell nach, bevor et leer ist.
        </p>
      </div>
    </Dialog>
  );
}

registerDialog({ id: 'tutorial.lowStock', component: LowStockDialog, pausesGame: true });

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
 * Stufe ohne Mission (0, 3, 4, 10): Titel und ein Satz. Weiter schaltet die Tour der Stufe am Ende (Auftrag 46c); der
 * Knopf „Weiter“ erscheint nur, wenn die Tour schon gelaufen ist und die Stufe trotzdem noch steht.
 */
function StageCard() {
  const { state, dispatch } = useGame();
  const stage = state.modules.tutorial.stage;
  const info = stageInfo(stage);
  const seen = tourSeen(state, stage);
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
      {seen && (
        <button
          type="button"
          class="tutorial-hud__cta"
          onClick={() => dispatch({ type: 'tutorial.advance', payload: {} })}
        >
          Weiter
          <Icon name="chevronRight" />
        </button>
      )}
    </section>
  );
}

function TutorialHudWithTours() {
  return (
    <>
      <TourStarter />
      <TutorialHud />
    </>
  );
}

registerHudItem({
  id: 'tutorial.mission',
  order: 39,
  placement: 'below',
  icon: 'target',
  component: TutorialHudWithTours,
});
soundOnEvent('tutorial.missionDone', 'success');

// Sauberes Geld im Kern-HUD erst mit der Geldwäsche.
registerHudPartHidden('cleanMoney', 'tutorial', (state) => !tutorialAllows(state, 'hud.cleanMoney'));

/** Einstellungen › Einstieg: Tutorial beenden (alles frei, keine Missionen mehr). */
function TutorialSettings() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const end = () => {
    // Auftrag 46c: Eine laufende Tour gehört zum Tutorial.
    ui.tour.skip();
    dispatch({ type: 'tutorial.skip', payload: {} });
  };
  if (!tutorialEnabled(state)) return <Hint>Das Tutorial gibt es in einem neuen Spiel im Modus normal.</Hint>;
  if (tutorialFinished(state)) return <Hint icon="checkCircle">Tutorial beendet, alles ist frei.</Hint>;
  return (
    <div class="tutorial-settings">
      <Hint>
        Peter führt dich Stufe für Stufe durch Köln. Beenden gibt alles sofort frei, die Missionen fallen weg.
      </Hint>
      <Button variant="danger" icon="skip" onClick={end}>
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
