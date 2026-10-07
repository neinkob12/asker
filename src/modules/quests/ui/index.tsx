// Oberfläche der Quests: Glas-Karte direkt unter Geld und Heat (HUD, placement 'below'), Übersicht aller Quests als
// Seite im Handy, Banner und Ton, wenn eine Quest beginnt oder erledigt ist. Ein Tipp auf die Karte führt zur
// passenden Stelle.
//
// Einstieg (Feedback 07.10.2026): Jede neue Quest kommt als Banner, die Karte klappt auf und leuchtet kurz. In den
// ersten Kapiteln ist sie golden umrandet und hat einen Knopf „Zeig mir wie“. Handy Schritt für Schritt: Kommt mit
// einer Quest eine App dazu, sagt es das Banner; der Startbildschirm zeigt, solange Apps fehlen, Peters Quest.

import { useState } from 'preact/hooks';
import type { GameState } from '../../../core';
import {
  audio,
  Button,
  Chip,
  Disclosure,
  Group,
  Icon,
  IconChip,
  ItemContent,
  List,
  ListItem,
  MapDialog,
  onGameEvent,
  registerDialog,
  registerHudItem,
  registerPanel,
  registerSearch,
  registerSlot,
  soundOnEvent,
  type UiApi,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityOfSpot, isBusinessSold } from '../../city';
import { getWarehouses } from '../../goods';
import { getSpots, lockedSpots } from '../../spots';
import {
  CHAPTERS,
  chapterName,
  currentQuest,
  PHONE_APP_STEPS,
  phoneAppLocked,
  phoneAppsOpenedBy,
  phoneStepsActive,
  QUESTS,
  type QuestDef,
  type QuestGoTo,
  questContact,
  questProgress,
  questsSuppressed,
  rewardText,
} from '../index';
import { ContractsGroup } from './contracts';
import './quests.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'quests.list': Record<string, never>;
  }
  interface DialogRegistry {
    'quests.skip': Record<string, never>;
  }
}

/**
 * Eingeklappt merkt sich die Karte pro Quest (ID der Quest, die eingeklappt wurde): Eine neue Quest klappt sie wieder
 * auf, damit niemand sie übersieht (Feedback 07.10.2026).
 */
const COLLAPSED_KEY = 'koeln-tycoon:quests-collapsed';

function readCollapsed(questId: string): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === questId;
  } catch {
    return false;
  }
}

function writeCollapsed(questId: string | null): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, questId ?? '');
  } catch {
    // Kein Speicher: gilt dann nur bis zum Neuladen.
  }
}

/** Bis zu diesem Kapitel (0 = Ankommen, 1 = Dein Team) ist die Karte golden umrandet und hat „Zeig mir wie“. */
const GUIDE_UNTIL_CHAPTER = 1;

/** So lange steht das Banner einer neuen Quest (Millisekunden), länger als eine Routine-Meldung. */
const QUEST_BANNER_MS = 4500;

function isGuide(quest: QuestDef): boolean {
  return quest.chapter <= GUIDE_UNTIL_CHAPTER && quest.cityId === undefined && quest.voice === undefined;
}

/** Führt zur Stelle, an der die Quest erledigt wird. */
export function goTo(ui: UiApi, state: GameState, target: QuestGoTo | undefined): void {
  switch (target) {
    case 'spot': {
      // In einer neuen Stadt gibt es noch keinen offenen Spot (Auftrag 43): dann der erste, den du freischalten kannst.
      const city = activeCity(state);
      const spot = getSpots(state, city)[0] ?? lockedSpots(state).find((s) => cityOfSpot(state, s.id) === city);
      if (!spot) return;
      ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
      ui.openPanel('spots.spot', { spotId: spot.id });
      return;
    }
    case 'suppliers':
      ui.openPhone('suppliers.app');
      return;
    case 'port':
      ui.openPanel('logistics.port', {});
      return;
    case 'warehouse': {
      // Ohne eigenes Lager in der Stadt die Lager-App mit den Standorten (Auftrag 43: vorher „Lager Ehrenfeld“).
      const own = getWarehouses(state, activeCity(state))[0];
      if (own) ui.openPanel('goods.warehouse', { warehouseId: own.id });
      else ui.openPhone('goods.app');
      return;
    }
    case 'staff':
      ui.selectTab('staff');
      return;
    case 'rightHand':
      ui.openPanel('hierarchy.rightHand', {});
      return;
    case 'territory':
      ui.selectTab('territory');
      return;
    case 'gangs':
      ui.selectTab('gangs');
      return;
    case 'laundering':
      ui.openPhone('laundering.app');
      return;
    case 'finance':
      ui.openPhone('finance.app');
      return;
    case 'trade':
      ui.openPhone('trade.app', { view: 'orders' });
      return;
    case 'tradeHarbor':
      ui.openPhone('trade.app', { view: 'harbor' });
      return;
    case 'grow':
      ui.openPhone('trade.app', { view: 'grow' });
      return;
    default:
      ui.openPanel('quests.list', {});
      return;
  }
}

function formatProgress(now: number, target: number, euro: boolean | undefined): string {
  if (euro) return `${Math.floor(now).toLocaleString('de-DE')} / ${target.toLocaleString('de-DE')} €`;
  return `${Math.floor(now)}/${target}`;
}

function QuestHud() {
  const { state } = useGame();
  // Auftrag 46b: Läuft das Tutorial, steht hier seine Missions-Karte.
  const quest = questsSuppressed(state) ? null : currentQuest(state);
  if (!quest) return null;
  // Pro Quest neu: Die Karte geht für jede neue Quest auf und leuchtet kurz (Animation beim Einhängen).
  return <QuestCard key={quest.id} quest={quest} />;
}

function QuestCard(props: { quest: QuestDef }) {
  const { state } = useGame();
  const ui = useUi();
  const { quest } = props;
  const [collapsed, setCollapsed] = useState(() => readCollapsed(quest.id));
  const [now, target] = questProgress(state);
  const share = target > 0 ? now / target : 0;
  const number = QUESTS.indexOf(quest) + 1;
  const guide = isGuide(quest);
  const toggle = () => {
    setCollapsed(!collapsed);
    writeCollapsed(collapsed ? null : quest.id);
  };
  const go = () => goTo(ui, state, quest.goTo);
  if (collapsed) {
    return (
      <button
        type="button"
        class="quest-hud quest-hud--mini"
        data-tour="hud.mission"
        onClick={toggle}
        aria-label="Quest aufklappen"
      >
        <Icon name="target" />
        <span class="quest-hud__mini-title">{quest.title}</span>
        <span class="quest-hud__count">{formatProgress(now, target, quest.euro)}</span>
        <Icon name="chevronDown" />
      </button>
    );
  }
  return (
    <section class={`quest-hud is-new ${guide ? 'is-guide' : ''}`} data-tour="hud.mission" aria-label="Aktuelle Quest">
      <header class="quest-hud__head">
        <span class="hud-label is-quest">
          Quest {number}/{QUESTS.length} · {chapterName(quest.chapter)}
        </span>
        <button type="button" class="quest-hud__icon-btn" onClick={toggle} aria-label="Quest einklappen">
          <Icon name="chevronUp" />
        </button>
      </header>
      <button type="button" class="quest-hud__main" onClick={go}>
        <IconChip icon={quest.icon} color="brand" size="md" />
        <span class="quest-hud__text">
          <strong class="quest-hud__title">{quest.title}</strong>
          <span class="quest-hud__hint">{quest.hint}</span>
        </span>
        <Icon name="chevronRight" class="quest-hud__go" />
      </button>
      <div class="quest-hud__progress">
        <span
          class="quest-hud__bar"
          role="progressbar"
          aria-valuenow={Math.round(share * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span class="quest-hud__fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
        </span>
        <span class="quest-hud__count">{formatProgress(now, target, quest.euro)}</span>
      </div>
      {quest.reward.length > 0 && (
        <div class="quest-hud__reward">
          <Icon name="gift" />
          <span>{quest.reward.map(rewardText).join(' + ')}</span>
        </div>
      )}
      {guide && (
        <button type="button" class="quest-hud__cta" onClick={go}>
          Zeig mir wie
          <Icon name="chevronRight" />
        </button>
      )}
      <footer class="quest-hud__foot">
        <button type="button" class="quest-hud__link" onClick={() => ui.openPanel('quests.list', {})}>
          Alle Quests
        </button>
        <button type="button" class="quest-hud__link is-faint" onClick={() => ui.openDialog('quests.skip', {})}>
          Überspringen
        </button>
      </footer>
    </section>
  );
}

/**
 * Rückfrage „Quest überspringen?“ über der Kartenfläche (Auftrag 43, N4): Als Aktionsblatt in der Quest-Karte lag sie
 * am Desktop unter dem HUD und ohne Schleier. Am Handy-Bildschirm ist sie ein Blatt.
 */
function SkipDialog() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const quest = currentQuest(state);
  const close = () => ui.closeDialog();
  if (!quest) return null;
  return (
    <MapDialog label="Quest überspringen?" onClose={close} class="quest-skip" detent="medium">
      <p class="quest-skip__kicker">{quest.title}</p>
      <h2 class="quest-skip__title">Quest überspringen?</h2>
      <p class="quest-skip__text">
        Dann gibt es keine Belohnung ({quest.reward.map(rewardText).join(' + ')}), und die Quest kommt nicht wieder.
      </p>
      <div class="quest-skip__actions">
        <Button variant="subtle" onClick={close}>
          Abbrechen
        </Button>
        <Button
          variant="danger"
          icon="skip"
          onClick={() => {
            dispatch({ type: 'quests.skip', payload: {} });
            close();
          }}
        >
          Überspringen
        </Button>
      </div>
    </MapDialog>
  );
}

registerDialog({ id: 'quests.skip', component: SkipDialog, area: 'map', pausesGame: true, lockPhone: false });

/** Seite im Handy: alle Kapitel und Quests mit Stand und Belohnung. */
function QuestList() {
  const { state } = useGame();
  const ui = useUi();
  const q = state.modules.quests;
  const active = currentQuest(state);
  // Nach dem Verkauf (Auftrag 43, H9) oben nur die Kapitel des Hafens (Quests mit Stimme), Deutschland eingeklappt
  // darunter; Wochenverträge gibt es dann nicht mehr.
  const sold = isBusinessSold(state);
  const harbor = (chapter: number) => QUESTS.some((x) => x.chapter === chapter && x.voice !== undefined);
  const chapters = CHAPTERS.map((name, chapter) => ({ name, chapter }));
  const shown = sold ? chapters.filter((c) => harbor(c.chapter)) : chapters;
  const earlier = sold ? chapters.filter((c) => !harbor(c.chapter)) : [];
  const chapterGroup = ({ name, chapter }: { name: string; chapter: number }) => {
    const quests = QUESTS.filter((x) => x.chapter === chapter);
    const doneCount = quests.filter((x) => q.done.includes(x.id)).length;
    return (
      <Group
        key={name}
        title={`Kapitel ${chapter + 1}: ${name}`}
        icon="flag"
        color="brand"
        value={`${doneCount}/${quests.length}`}
        collapsible
        open={active ? active.chapter === chapter : chapter === CHAPTERS.length - 1}
      >
        <List>
          {quests.map((quest) => {
            const done = q.done.includes(quest.id);
            const skipped = q.skipped.includes(quest.id);
            const isActive = active?.id === quest.id;
            const [now, target] = isActive ? questProgress(state) : [0, quest.target];
            return (
              <ListItem
                key={quest.id}
                onClick={isActive ? () => goTo(ui, state, quest.goTo) : undefined}
                value={
                  done ? 'erledigt' : skipped ? 'übersprungen' : isActive ? formatProgress(now, target, quest.euro) : ''
                }
              >
                <ItemContent
                  icon={done ? 'checkCircle' : skipped ? 'skip' : isActive ? quest.icon : 'lock'}
                  color={done ? 'money' : isActive ? 'brand' : 'system'}
                  title={quest.title}
                  tags={quest.reward.map((r) => ({ label: rewardText(r), color: 'brand' as const, icon: 'gift' }))}
                />
              </ListItem>
            );
          })}
        </List>
      </Group>
    );
  };
  return (
    <div class="quest-list">
      {!sold && <ContractsGroup />}
      {shown.map(chapterGroup)}
      {earlier.length > 0 && (
        <Disclosure icon="flag" label={`Frühere Kapitel (${earlier.length})`}>
          {earlier.map(chapterGroup)}
        </Disclosure>
      )}
      {q.title && (
        <p class="quest-list__title">
          <Chip color="brand" icon="crown" label={q.title} />
        </p>
      )}
    </div>
  );
}

registerHudItem({ id: 'quests.current', order: 40, placement: 'below', icon: 'target', component: QuestHud });
registerPanel({ id: 'quests.list', title: () => 'Quests und Verträge', component: QuestList });
registerSearch({
  id: 'quests.search',
  label: 'Quests',
  order: 5,
  items: (state) => {
    const quest = currentQuest(state);
    return [
      {
        id: 'quests.list',
        title: 'Quests von Peter',
        subtitle: quest ? `Jetzt: ${quest.title}` : 'Alle erledigt',
        icon: 'target',
        keywords: 'Quest Aufgabe Peter Belohnung Tutorial',
        run: (ui) => ui.openPanel('quests.list', {}),
      },
    ];
  },
});

onGameEvent('quest.completed', 'quests.toast', (payload, ui) => {
  if (payload.skipped) return;
  const quest = QUESTS.find((x) => x.id === payload.questId);
  if (!quest) return;
  // Das Journal hat den Eintrag schon (die Quest schreibt ihn selbst): Der Verlauf soll ihn nicht doppelt zeigen.
  ui.toast(`Quest erledigt: ${quest.title}. ${quest.reward.map(rewardText).join(' + ')}`, 'good', {
    urgent: true,
    icon: 'gift',
    log: false,
  });
});
soundOnEvent('quest.completed', 'success', { when: (p) => !p.skipped });

/**
 * Neue Quest (Feedback 07.10.2026: zu unauffällig): Banner „Neue Quest: …“ von Peter in Gold mit Ton, ein Tipp öffnet
 * seinen Chat. Kommt mit der Quest eine App aufs Handy, sagt es das Banner („Neu im Handy: Lieferanten“), ein Tipp
 * öffnet die App. Erledigt eine Aktion mehrere Quests auf einmal, gibt es nur das Banner der Quest, die jetzt dran ist
 * (Apps ausgenommen). Nicht im Verlauf: Peters Chat hält die Quest fest (sonst stünde gleich zu Beginn eine Zahl an den
 * Einstellungen).
 */
onGameEvent('quest.started', 'quests.startedToast', (payload, ui, state) => {
  const quest = QUESTS.find((x) => x.id === payload.questId);
  if (!quest) return;
  const current = currentQuest(state)?.id === quest.id;
  const apps = phoneAppsOpenedBy(state, quest.id);
  if (apps.length > 0) {
    ui.toast(current ? `Neue Quest: ${quest.title}` : apps.map((a) => a.line).join(' '), 'good', {
      urgent: true,
      title: `Neu im Handy: ${apps.map((a) => a.name).join(', ')}`,
      icon: 'phone',
      color: 'brand',
      appId: apps[0].appId,
      duration: QUEST_BANNER_MS,
      log: false,
    });
  } else if (current) {
    // Wie eine Nachricht von Peter (bzw. Jansen): Absender oben, darunter die Quest.
    const contact = questContact(state, quest);
    ui.toast(`Neue Quest: ${quest.title}`, 'good', {
      urgent: true,
      title: contact.name,
      icon: quest.icon,
      color: 'brand',
      appId: 'core.messages',
      params: { contactId: contact.id },
      duration: QUEST_BANNER_MS,
      log: false,
    });
  } else {
    return;
  }
  // Nach dem Ton der erledigten Quest, nicht darüber.
  audio.play('notification', { delay: 0.5 });
});

// Einstellungen › Einstieg gehört seit Auftrag 46b dem Tutorial („Tutorial beenden“); Handy Schritt für Schritt
// über die Quests ist aus (der Rückbau kommt mit 46d).

/**
 * Startbildschirm, solange Apps fehlen (Handy Schritt für Schritt): Peters Quest als Zeile, damit der leere
 * Bildschirm erklärt, warum, und wohin es weitergeht.
 */
function QuestHomeWidget() {
  const { state } = useGame();
  const ui = useUi();
  const quest = currentQuest(state);
  if (!quest || !phoneStepsActive(state)) return null;
  const missing = PHONE_APP_STEPS.filter((step) => phoneAppLocked(state, step.appId)).length;
  if (missing === 0) return null;
  return (
    <Group
      title="Peters Quest"
      icon="target"
      color="brand"
      class="quest-home"
      note={`Noch ${missing} ${missing === 1 ? 'App kommt' : 'Apps kommen'} mit den nächsten Quests dazu.`}
    >
      <List>
        <ListItem action onClick={() => goTo(ui, state, quest.goTo)}>
          <ItemContent icon={quest.icon} color="brand" title={quest.title} meta={quest.hint} />
        </ListItem>
      </List>
    </Group>
  );
}

registerSlot('phone.home', { id: 'quests.home', order: 10, component: QuestHomeWidget });
