// Oberfläche der Quests: Glas-Karte direkt unter Geld und Heat (HUD, placement 'below'), Übersicht aller Quests als
// Seite im Handy, Banner und Ton, wenn eine Quest erledigt ist. Ein Tipp auf die Karte führt zur passenden Stelle.

import { useState } from 'preact/hooks';
import type { GameState } from '../../../core';
import {
  Chip,
  Group,
  Icon,
  IconChip,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerHudItem,
  registerPanel,
  registerSearch,
  soundOnEvent,
  type UiApi,
  useGame,
  useUi,
} from '../../../ui';
import { DEFAULT_WAREHOUSE, getWarehouses } from '../../goods';
import { getSpots } from '../../spots';
import { CHAPTERS, chapterName, currentQuest, QUESTS, type QuestGoTo, questProgress, rewardText } from '../index';
import './quests.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'quests.list': Record<string, never>;
  }
}

const COLLAPSED_KEY = 'koeln-tycoon:quests-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // Kein Speicher: gilt dann nur bis zum Neuladen.
  }
}

/** Führt zur Stelle, an der die Quest erledigt wird. */
export function goTo(ui: UiApi, state: GameState, target: QuestGoTo | undefined): void {
  switch (target) {
    case 'spot': {
      const spot = getSpots(state)[0];
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
    case 'warehouse':
      ui.openPanel('goods.warehouse', { warehouseId: getWarehouses(state)[0]?.id ?? DEFAULT_WAREHOUSE });
      return;
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
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const quest = currentQuest(state);
  if (!quest) return null;
  const [now, target] = questProgress(state);
  const share = target > 0 ? now / target : 0;
  const number = QUESTS.indexOf(quest) + 1;
  const toggle = () => {
    setCollapsed(!collapsed);
    writeCollapsed(!collapsed);
  };
  if (collapsed) {
    return (
      <button type="button" class="quest-hud quest-hud--mini" onClick={toggle} aria-label="Quest aufklappen">
        <Icon name="target" />
        <span class="quest-hud__mini-title">{quest.title}</span>
        <span class="quest-hud__count">{formatProgress(now, target, quest.euro)}</span>
        <Icon name="chevronDown" />
      </button>
    );
  }
  return (
    <section class="quest-hud" aria-label="Aktuelle Quest">
      <header class="quest-hud__head">
        <span class="hud-label is-quest">
          Quest {number}/{QUESTS.length} · {chapterName(quest.chapter)}
        </span>
        <button type="button" class="quest-hud__icon-btn" onClick={toggle} aria-label="Quest einklappen">
          <Icon name="chevronUp" />
        </button>
      </header>
      <button type="button" class="quest-hud__main" onClick={() => goTo(ui, state, quest.goTo)}>
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
      <div class="quest-hud__reward">
        <Icon name="gift" />
        <span>{quest.reward.map(rewardText).join(' + ')}</span>
      </div>
      <footer class="quest-hud__foot">
        <button type="button" class="quest-hud__link" onClick={() => ui.openPanel('quests.list', {})}>
          Alle Quests
        </button>
        <button
          type="button"
          class="quest-hud__link is-faint"
          onClick={() => dispatch({ type: 'quests.skip', payload: {} })}
        >
          Überspringen
        </button>
      </footer>
    </section>
  );
}

/** Seite im Handy: alle Kapitel und Quests mit Stand und Belohnung. */
function QuestList() {
  const { state } = useGame();
  const ui = useUi();
  const q = state.modules.quests;
  const active = currentQuest(state);
  return (
    <div class="quest-list">
      {CHAPTERS.map((name, chapter) => {
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
                      done
                        ? 'erledigt'
                        : skipped
                          ? 'übersprungen'
                          : isActive
                            ? formatProgress(now, target, quest.euro)
                            : ''
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
      })}
      {q.title && (
        <p class="quest-list__title">
          <Chip color="brand" icon="crown" label={q.title} />
        </p>
      )}
    </div>
  );
}

registerHudItem({ id: 'quests.current', order: 40, placement: 'below', icon: 'target', component: QuestHud });
registerPanel({ id: 'quests.list', title: () => 'Quests von Peter', component: QuestList });
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
  ui.toast(`Quest erledigt: ${quest.title}. ${quest.reward.map(rewardText).join(' + ')}`, 'good', {
    urgent: true,
    icon: 'gift',
  });
});
soundOnEvent('quest.completed', 'success', { when: (p) => !p.skipped });
