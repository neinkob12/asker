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
  /** Index der aktiven Quest in QUESTS (= QUESTS.length, wenn alle durch sind). */
  index: number;
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
  return QUESTS[state.modules.quests.index] ?? null;
}

/** Fortschritt der aktiven Quest: [jetzt, Ziel]. */
export function questProgress(state: GameState): [number, number] {
  const quest = currentQuest(state);
  if (!quest) return [0, 0];
  const now = quest.measure ? quest.measure(state) : state.modules.quests.progress;
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

/** Peter schickt die aktive Quest. */
function announce(ctx: Ctx): void {
  const quest = currentQuest(ctx.state);
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
  q.index += 1;
  q.progress = 0;
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
  announce(ctx);
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
    ctx.state.modules.quests.progress += delta;
    check(ctx);
  };
}

export function skipQuest(ctx: Ctx): CommandResult {
  if (!currentQuest(ctx.state)) return { ok: false, reason: 'Keine Quest offen.' };
  finish(ctx, true);
  return { ok: true };
}

/** Alle Ereignisse, auf die irgendeine Quest hört. */
const COUNTED: (keyof GameEvents)[] = [
  ...new Set(QUESTS.flatMap((q) => Object.keys(q.count ?? {}) as (keyof GameEvents)[])),
];

export default defineModule({
  id: 'quests',
  version: 1,
  dependsOn: ['goods', 'staff', 'territory', 'police', 'reputation', 'leaderboard'],
  init: () => ({ index: 0, progress: 0, done: [], skipped: [], title: null }),
  tickEvery: QUEST_CHECK_EVERY,
  tick: (ctx) => {
    // Beim ersten Schritt schickt Peter die erste Quest.
    const q = ctx.state.modules.quests;
    if (q.index === 0 && q.done.length === 0 && q.skipped.length === 0 && !ctx.state.messages.contacts[PETER.id]) {
      messages.send(ctx, {
        contact: PETER,
        text: "Ey, ich bin's, Peter. Hab gehört, du willst in Köln groß rauskommen. Ich zeig dir, wie das läuft. Mach, was ich sag, dann gibt's auch was für dich.",
      });
      announce(ctx);
    }
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
      const q = ctx.state.modules.quests;
      q.progress = quest.streak(ctx.state) ? q.progress + 1 : 0;
      check(ctx);
    },
  },
  migrations: {},
});
