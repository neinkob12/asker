// Quests (Auftrag 29): Peter führt dich mit einer Reihe von Aufgaben durchs Spiel. Immer eine Quest ist aktiv; ist
// sie erledigt, gibt es die Belohnung (Ware, Geld, Ruf, weniger Heat, Erfahrung …) und Peter schickt die nächste.
// Nichts ist Pflicht: Eine Quest lässt sich überspringen (ohne Belohnung).
//
// Fortschritt kommt auf drei Wegen (QuestDef in config.ts): Zähler über Ereignisse (ab Beginn der Quest), ein Maß
// am Zustand (z.B. "Rechte Hand vorhanden") oder eine Serie voller Spielstunden.
//
// Öffentliche API: currentQuest(state), questProgress(state), completedQuests(state), questTitle(state),
//   rewardText(reward), QUESTS, CHAPTERS
// Befehle: 'quests.skip'
// Ereignisse: 'quest.started', 'quest.completed'

import {
  type CommandResult,
  type Ctx,
  defineModule,
  type GameEvents,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { DEFAULT_WAREHOUSE, getWarehouses, productName, store } from '../goods';
import { addHeat } from '../police';
import { changeReputation } from '../reputation';
import { addLoyalty, addXp, getStaff } from '../staff';
import { addInfluence, hasPlayerPresence, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { CHAPTERS, PETER, QUEST_CHECK_EVERY, QUESTS, type QuestDef, type QuestReward } from './config';

export { CHAPTERS, PETER, QUESTS, type QuestDef, type QuestGoTo, type QuestReward } from './config';

export interface QuestsState {
  /**
   * Quest, zu der progress gehört und die Peter zuletzt geschickt hat. Aktiv ist immer die erste Quest in QUESTS, die
   * weder erledigt noch übersprungen ist; weicht sie ab (neue Reihenfolge nach einem Update), schickt Peter sie neu.
   */
  activeId: string | null;
  /** Zähler bzw. Serie der aktiven Quest. */
  progress: number;
  /** Erledigte Quests (IDs), übersprungene stehen in skipped. */
  done: string[];
  skipped: string[];
  /** Titel für die Bestenliste (letzte Quest). */
  title: string | null;
}

declare module '../../core' {
  interface ModuleStates {
    quests: QuestsState;
  }
  interface GameCommands {
    'quests.skip': Record<string, never>;
  }
  interface GameEvents {
    'quest.started': { questId: string };
    'quest.completed': { questId: string; skipped: boolean };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function currentQuest(state: GameState): QuestDef | null {
  const q = state.modules.quests;
  return QUESTS.find((x) => !q.done.includes(x.id) && !q.skipped.includes(x.id)) ?? null;
}

/** Fortschritt der aktiven Quest: [jetzt, Ziel]. */
export function questProgress(state: GameState): [number, number] {
  const quest = currentQuest(state);
  if (!quest) return [0, 0];
  const q = state.modules.quests;
  const counted = q.activeId === quest.id ? q.progress : 0;
  const now = quest.measure ? quest.measure(state) : counted;
  return [Math.min(quest.target, Math.max(0, now)), quest.target];
}

export function completedQuests(state: GameState): readonly string[] {
  return state.modules.quests.done;
}

export function questTitle(state: GameState): string | null {
  return state.modules.quests.title;
}

export function chapterName(chapter: number): string {
  return CHAPTERS[chapter] ?? '';
}

/** Kurzer Text einer Belohnung, z.B. "10 g Gras" oder "+5 Ruf". */
export function rewardText(reward: QuestReward): string {
  const euro = (n: number) => `${n.toLocaleString('de-DE')} €`;
  switch (reward.kind) {
    case 'goods':
      return `${reward.amount} g ${productName(reward.productId)}${(reward.quality ?? 0) >= 0.85 ? ' (Premium)' : ''}`;
    case 'money':
      return `${euro(reward.amount)} ${reward.money === 'clean' ? 'sauber' : 'schwarz'}`;
    case 'reputation':
      return `+${reward.amount} Ruf`;
    case 'heat':
      return `−${reward.amount} Heat überall`;
    case 'teamXp':
      return `+${reward.amount} Erfahrung fürs Team`;
    case 'loyalty':
      return `+${reward.amount} Loyalität fürs Team`;
    case 'influence':
      return `+${reward.amount} Einfluss in deinen Veedeln`;
    case 'title':
      return `Titel „${reward.title}“`;
  }
}

// ---------------------------------------------------------------------------------------------
// Schreiben

function grant(ctx: Ctx, reward: QuestReward): void {
  switch (reward.kind) {
    case 'goods': {
      const owned = getWarehouses(ctx.state);
      const warehouseId = owned.some((w) => w.id === DEFAULT_WAREHOUSE) ? DEFAULT_WAREHOUSE : owned[0]?.id;
      if (warehouseId)
        store(ctx, { warehouseId, productId: reward.productId, amount: reward.amount, quality: reward.quality });
      return;
    }
    case 'money':
      wallet.earn(ctx, reward.amount, reward.money, 'Belohnung von Peter', 'income.other');
      return;
    case 'reputation':
      changeReputation(ctx, reward.amount, 'Quest');
      return;
    case 'heat':
      for (const v of allVeedel()) addHeat(ctx, v.id, -reward.amount);
      return;
    case 'teamXp':
      for (const m of getStaff(ctx.state, { status: 'active' })) addXp(ctx, m.id, reward.amount);
      return;
    case 'loyalty':
      for (const m of getStaff(ctx.state, { status: 'active' })) addLoyalty(ctx, m.id, reward.amount);
      return;
    case 'influence':
      for (const v of allVeedel()) {
        if (hasPlayerPresence(ctx.state, v.id)) addInfluence(ctx, v.id, PLAYER_FACTION, reward.amount);
      }
      return;
    case 'title':
      ctx.state.modules.quests.title = reward.title;
      return;
  }
}

/** Peter schickt die aktive Quest, wenn sie neu ist (Zähler beginnt bei 0). */
function sync(ctx: Ctx): void {
  const q = ctx.state.modules.quests;
  const quest = currentQuest(ctx.state);
  if ((quest?.id ?? null) === q.activeId) return;
  q.activeId = quest?.id ?? null;
  q.progress = 0;
  if (!quest) return;
  const rewards = quest.reward.map(rewardText).join(', ');
  messages.send(ctx, { contact: PETER, text: `${quest.task}\n\nDafür gibt's von mir: ${rewards}.` });
  ctx.emit('quest.started', { questId: quest.id });
}

function finish(ctx: Ctx, skipped: boolean): void {
  const q = ctx.state.modules.quests;
  const quest = currentQuest(ctx.state);
  if (!quest) return;
  if (skipped) {
    q.skipped.push(quest.id);
  } else {
    q.done.push(quest.id);
    for (const reward of quest.reward) grant(ctx, reward);
    journal.add(ctx, `Quest erledigt: ${quest.title}. Belohnung: ${quest.reward.map(rewardText).join(', ')}.`, 'good');
  }
  ctx.emit('quest.completed', { questId: quest.id, skipped });
  const next = currentQuest(ctx.state);
  if (!skipped && (!next || next.chapter !== quest.chapter)) {
    messages.send(ctx, {
      contact: PETER,
      text: next
        ? `Stark. Kapitel „${chapterName(quest.chapter)}“ ist durch. Jetzt kommt „${chapterName(next.chapter)}“.`
        : 'Das war alles, was ich dir beibringen kann. Köln gehört jetzt dir, Boss.',
    });
  }
  sync(ctx);
  // Die nächste Quest kann schon erfüllt sein (z.B. Rechte Hand gab es schon).
  check(ctx);
}

/** Ist die aktive Quest erfüllt? Dann abschließen (auch mehrere hintereinander). */
function check(ctx: Ctx): void {
  const [now, target] = questProgress(ctx.state);
  if (target > 0 && now >= target) finish(ctx, false);
}

/** Zähler der aktiven Quest für ein Ereignis. */
function onEvent<K extends keyof GameEvents>(type: K) {
  return (ctx: Ctx, payload: GameEvents[K]) => {
    const quest = currentQuest(ctx.state);
    const counter = quest?.count?.[type] as ((p: GameEvents[K], s: GameState) => number) | undefined;
    if (!quest || !counter) return;
    const delta = counter(payload, ctx.state);
    if (!(delta > 0)) return;
    sync(ctx);
    ctx.state.modules.quests.progress += delta;
    check(ctx);
  };
}

export function skipQuest(ctx: Ctx): CommandResult {
  if (!currentQuest(ctx.state)) return { ok: false, reason: 'Keine Quest offen.' };
  finish(ctx, true);
  return { ok: true };
}

interface QuestsStateV1 {
  index: number;
  progress: number;
  done: string[];
  skipped: string[];
  title: string | null;
}

/** Reihenfolge der Quests in Version 1 (für die Migration). */
const QUESTS_V1 = [
  'firstSales',
  'setPrice',
  'order',
  'pickup',
  'revenue1k',
  'runner',
  'recruit',
  'regular',
  'driver',
  'rightHand',
  'rightHandDelivery',
  'newSpot',
  'warehouse',
  'lieutenant',
  'launder',
  'cut',
  'revenue10k',
  'encounter',
  'lowHeat',
  'supplier',
  'gangDeal',
  'rightHandRank',
  'firstVeedel',
  'team10',
  'threeVeedel',
  'worth50k',
];

/** Alle Ereignisse, auf die irgendeine Quest hört. */
const COUNTED: (keyof GameEvents)[] = [
  ...new Set(QUESTS.flatMap((q) => Object.keys(q.count ?? {}) as (keyof GameEvents)[])),
];

export default defineModule({
  id: 'quests',
  version: 2,
  dependsOn: ['goods', 'staff', 'territory', 'police', 'reputation', 'leaderboard'],
  init: () => ({ activeId: null, progress: 0, done: [], skipped: [], title: null }),
  tickEvery: QUEST_CHECK_EVERY,
  tick: (ctx) => {
    // Beim ersten Schritt stellt Peter sich vor.
    if (!ctx.state.messages.contacts[PETER.id]) {
      messages.send(ctx, {
        contact: PETER,
        text: "Ey, ich bin's, Peter. Hab gehört, du willst in Köln groß rauskommen. Ich zeig dir, wie das läuft. Mach, was ich sag, dann gibt's auch was für dich.",
      });
    }
    sync(ctx);
    if (currentQuest(ctx.state)?.measure) check(ctx);
  },
  commands: {
    'quests.skip': (ctx) => skipQuest(ctx),
  },
  on: {
    ...Object.fromEntries(COUNTED.map((type) => [type, onEvent(type)])),
    'clock.hourStarted': (ctx) => {
      const quest = currentQuest(ctx.state);
      if (!quest?.streak) return;
      sync(ctx);
      const q = ctx.state.modules.quests;
      q.progress = quest.streak(ctx.state) ? q.progress + 1 : 0;
      check(ctx);
    },
  },
  migrations: {
    // Version 1 merkte sich die Position in der alten Reihenfolge. Jetzt zählt die ID; der Zähler der damals aktiven
    // Quest bleibt, wenn sie es weiter ist.
    2: (old: QuestsStateV1): QuestsState => ({
      activeId: QUESTS_V1[old.index] ?? null,
      progress: old.progress,
      done: old.done,
      skipped: old.skipped,
      title: old.title,
    }),
  },
});
