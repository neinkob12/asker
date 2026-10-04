// Quests (Auftrag 29): Peter führt dich mit einer Reihe von Aufgaben durchs Spiel. Immer eine Quest ist aktiv; ist
// sie erledigt, gibt es die Belohnung (Ware, Geld, Ruf, weniger Heat, Erfahrung …) und Peter schickt die nächste.
// Nichts ist Pflicht: Eine Quest lässt sich überspringen (ohne Belohnung).
//
// Fortschritt kommt auf drei Wegen (QuestDef in config.ts): Zähler über Ereignisse (ab Beginn der Quest), ein Maß
// am Zustand (z.B. "Rechte Hand vorhanden") oder eine Serie voller Spielstunden.
//
// Wochenverträge (Auftrag 32, contracts.ts): Montag 8 Uhr drei Angebote von Figuren mit Gesicht, eins wird per Handy
// angenommen, Frist Sonntag 23:59, Fortschritt wie bei den Quests, Belohnung plus Vertrauen bei einem Lieferanten.
//
// Öffentliche API: currentQuest(state), questProgress(state), completedQuests(state), questTitle(state),
//   rewardText(reward), QUESTS, CHAPTERS,
//   Verträge: contractOffers(state), activeContract(state), contractProgress(state), contractHistory(state),
//   contractStats(state), contractValue(offer), getContractTemplate(id), getContractContact(id), CONTRACT_TEMPLATES
// Befehle: 'quests.skip', 'quests.acceptContract'
// Ereignisse: 'quest.started', 'quest.completed', 'contract.offered', 'contract.accepted', 'contract.finished'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  type GameEvents,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { activeCity, liveVeedel } from '../city';
import { DEFAULT_WAREHOUSE, getWarehouses, productName, store, type Warehouse } from '../goods';
import { addHeat, operationTier } from '../police';
import { changeReputation } from '../reputation';
import { addLoyalty, addXp, getStaff } from '../staff';
import { addSupplierTrust, getRelation, getSuppliers, isUnlocked, supplierById } from '../suppliers';
import { addInfluence, hasPlayerPresence, PLAYER_FACTION } from '../territory';
import { CHAPTERS, MILESTONE_TITLE, PETER, QUEST_CHECK_EVERY, QUESTS, type QuestDef, type QuestReward } from './config';
import {
  type ActiveContract,
  CONTRACT_HISTORY,
  CONTRACT_HOUR,
  CONTRACT_OFFERS,
  CONTRACT_TEMPLATES,
  CONTRACT_WEEKDAY,
  type ContractOffer,
  type ContractTemplate,
  contractRewards,
  contractTarget,
  fillContractText,
  getContractContact,
  getContractTemplate,
  rewardValue,
} from './contracts';

export { CHAPTERS, MILESTONE_TITLE, PETER, QUESTS, type QuestDef, type QuestGoTo, type QuestReward } from './config';
export {
  type ActiveContract,
  CONTRACT_CONTACTS,
  CONTRACT_TEMPLATES,
  type ContractOffer,
  type ContractTemplate,
  getContractContact,
  getContractTemplate,
  rewardValue,
} from './contracts';

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
  /** Wann die aktive Quest begann (Spielminute): Ereignisse aus demselben Schritt zählen nicht für sie. */
  startedAt: number;
  /** Wochenverträge (Auftrag 32). */
  contracts: ContractsState;
}

/** Ein abgeschlossener Vertrag (für die Liste). */
export interface ContractRecord {
  templateId: string;
  title: string;
  cityId: string;
  result: 'done' | 'failed';
  at: number;
}

export interface ContractsState {
  /** Angebote dieser Woche (bis eins angenommen ist oder die Woche endet). */
  offers: ContractOffer[];
  active: ActiveContract | null;
  /** Neueste zuerst, höchstens CONTRACT_HISTORY. */
  history: ContractRecord[];
  stats: { offered: number; accepted: number; done: number; failed: number };
}

/** Zustand in Version 1 (ohne startedAt). */
type QuestsStateV1 = Omit<QuestsState, 'startedAt' | 'contracts'>;
type QuestsStateV2 = Omit<QuestsState, 'contracts'>;

function newContracts(): ContractsState {
  return { offers: [], active: null, history: [], stats: { offered: 0, accepted: 0, done: 0, failed: 0 } };
}

declare module '../../core' {
  interface ModuleStates {
    quests: QuestsState;
  }
  interface GameCommands {
    'quests.skip': Record<string, never>;
    /** Einen Wochenvertrag annehmen (eins der Angebote dieser Woche). */
    'quests.acceptContract': { offerId: number };
  }
  interface GameEvents {
    'quest.started': { questId: string };
    'quest.completed': { questId: string; skipped: boolean };
    'contract.offered': { offerIds: number[]; cityId: string };
    'contract.accepted': { offerId: number; templateId: string };
    'contract.finished': { offerId: number; templateId: string; result: 'done' | 'failed' };
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
    case 'trust': {
      const supplier = supplierById(reward.supplierId);
      return `+${reward.amount} Vertrauen bei ${supplier?.contactName ?? reward.supplierId}`;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/**
 * Lager für Ware aus einer Belohnung: das Standardlager bzw. irgendein eigenes Lager in der aktiven Stadt, sonst
 * irgendein eigenes Lager (Standardlager zuerst). Ohne eigenes Lager null.
 */
function rewardWarehouse(state: GameState): Warehouse | null {
  const here = getWarehouses(state, activeCity(state));
  return here.find((w) => w.id === DEFAULT_WAREHOUSE) ?? here[0] ?? getWarehouses(state)[0] ?? null;
}

/** Zahlt eine Belohnung aus und gibt den Text zurück, der dem Spieler sagt, was wirklich angekommen ist. */
function grant(ctx: Ctx, reward: QuestReward): string {
  const text = rewardText(reward);
  switch (reward.kind) {
    case 'goods': {
      // Früher verpuffte die Ware still, wenn es in der aktiven Stadt kein eigenes Lager gab (Hamburg ohne Lager).
      const warehouse = rewardWarehouse(ctx.state);
      if (!warehouse) return `${text} (verfallen, du hast kein Lager)`;
      store(ctx, {
        warehouseId: warehouse.id,
        productId: reward.productId,
        amount: reward.amount,
        quality: reward.quality,
      });
      return warehouse.cityId === activeCity(ctx.state) ? text : `${text} (im Lager ${warehouse.name})`;
    }
    case 'money':
      wallet.earn(ctx, reward.amount, reward.money, 'Belohnung von Peter', 'income.other');
      return text;
    case 'reputation':
      changeReputation(ctx, reward.amount, 'Quest');
      return text;
    case 'heat':
      for (const v of liveVeedel(ctx.state)) addHeat(ctx, v.id, -reward.amount);
      return text;
    case 'teamXp':
      for (const m of getStaff(ctx.state, { status: 'active' })) addXp(ctx, m.id, reward.amount);
      return text;
    case 'loyalty':
      for (const m of getStaff(ctx.state, { status: 'active' })) addLoyalty(ctx, m.id, reward.amount);
      return text;
    case 'influence':
      for (const v of liveVeedel(ctx.state)) {
        if (hasPlayerPresence(ctx.state, v.id)) addInfluence(ctx, v.id, PLAYER_FACTION, reward.amount);
      }
      return text;
    case 'title':
      ctx.state.modules.quests.title = reward.title;
      return text;
    case 'trust':
      addSupplierTrust(ctx, reward.supplierId, reward.amount);
      return text;
  }
}

/** Peter schickt die aktive Quest. */
function announce(ctx: Ctx): void {
  const quest = currentQuest(ctx.state);
  if (!quest) return;
  const rewards = quest.reward.map(rewardText).join(', ');
  messages.send(ctx, {
    contact: PETER,
    text: rewards ? `${quest.task}\n\nDafür gibt's von mir: ${rewards}.` : quest.task,
  });
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
    const rewards = quest.reward.map((reward) => grant(ctx, reward)).join(', ');
    journal.add(ctx, `Quest erledigt: ${quest.title}.${rewards ? ` Belohnung: ${rewards}.` : ''}`, 'good');
    if (quest.doneText) messages.send(ctx, { contact: PETER, text: quest.doneText });
  }
  q.index += 1;
  q.progress = 0;
  q.startedAt = ctx.now;
  ctx.emit('quest.completed', { questId: quest.id, skipped });
  const next = currentQuest(ctx.state);
  if (!skipped && (!next || next.chapter !== quest.chapter)) {
    messages.send(ctx, {
      contact: PETER,
      text: next
        ? `Stark. Kapitel „${chapterName(quest.chapter)}“ ist durch. Jetzt kommt „${chapterName(next.chapter)}“.`
        : 'Das war alles, was ich dir beibringen kann. Ab jetzt bist du auf dich gestellt, Boss.',
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
    // Was im selben Schritt geschah, in dem die Quest begann, gehört noch zur vorigen (ein Läufer über "Leute finden"
    // meldet staff.hired und recruiting.hired: Das darf nicht zwei Quests auf einmal erledigen).
    if (ctx.state.modules.quests.startedAt === ctx.now) return;
    const delta = counter(payload, ctx.state);
    if (!(delta > 0)) return;
    ctx.state.modules.quests.progress += delta;
    check(ctx);
  };
}

// ---------------------------------------------------------------------------------------------
// Wochenverträge (Auftrag 32)

export function contractOffers(state: GameState): readonly ContractOffer[] {
  return state.modules.quests.contracts?.offers ?? [];
}

export function activeContract(state: GameState): ActiveContract | null {
  return state.modules.quests.contracts?.active ?? null;
}

export function contractHistory(state: GameState): readonly ContractRecord[] {
  return state.modules.quests.contracts?.history ?? [];
}

export function contractStats(state: GameState): ContractsState['stats'] {
  return state.modules.quests.contracts?.stats ?? newContracts().stats;
}

/** Fortschritt des laufenden Vertrags: [jetzt, Ziel], ohne Vertrag [0, 0]. */
export function contractProgress(state: GameState): [number, number] {
  const active = activeContract(state);
  const template = active ? getContractTemplate(active.templateId) : undefined;
  if (!active || !template) return [0, 0];
  const now = template.measure ? template.measure(state, active) : active.progress;
  return [Math.min(active.target, Math.max(0, now)), active.target];
}

/** Ungefährer Wert eines Angebots in Euro (Summe der Belohnungen). */
export function contractValue(offer: Pick<ContractOffer, 'rewards'>): number {
  return Math.round(offer.rewards.reduce((sum, r) => sum + rewardValue(r), 0));
}

/** Beginn des nächsten Montags nach time (die Frist: Sonntag 23:59 ist das letzte erlaubte). */
function nextMonday(time: number): number {
  const dayStart = time - (time % 1440);
  const daysAhead = (7 - clock.weekday(time) + CONTRACT_WEEKDAY) % 7 || 7;
  return dayStart + daysAhead * 1440;
}

/** Lieferant, bei dem es Vertrauen gibt: ein freigeschalteter in der Stadt, am liebsten einer mit wenig Vertrauen. */
function trustSupplier(ctx: Ctx, cityId: string): string | null {
  const options = getSuppliers(ctx.state, cityId).filter(
    (s) => isUnlocked(ctx.state, s.id) && getRelation(ctx.state, s.id).trust < 100,
  );
  if (options.length === 0) return null;
  return ctx.pick(options).id;
}

/** Montag 8 Uhr: drei Angebote von verschiedenen Figuren für die aktive Stadt. */
function offerContracts(ctx: Ctx): void {
  const c = ctx.state.modules.quests.contracts;
  const cityId = activeCity(ctx.state);
  const tier = operationTier(ctx.state, cityId).index;
  const deadline = nextMonday(ctx.now);
  // Alte, nicht angenommene Angebote sind vorbei.
  retractOffers(ctx);
  c.offers = [];
  const pool = CONTRACT_TEMPLATES.filter((t) => !t.available || t.available(ctx.state, cityId, tier));
  const chosen: ContractTemplate[] = [];
  const rest = [...pool];
  while (chosen.length < CONTRACT_OFFERS && rest.length > 0) {
    const t = ctx.pick(rest);
    rest.splice(rest.indexOf(t), 1);
    if (chosen.some((x) => x.contactId === t.contactId)) continue;
    chosen.push(t);
  }
  for (const template of chosen) {
    const contact = getContractContact(template.contactId);
    if (!contact) continue;
    const productId = template.products ? ctx.pick(template.products) : undefined;
    const param = template.param ? template.param(ctx.state, cityId) : undefined;
    const target = contractTarget(template, tier, param);
    const values = { target, productId, param };
    const rewards = contractRewards(template, tier, trustSupplier(ctx, cityId), productId);
    const id = ctx.nextId();
    const offer: ContractOffer = {
      id,
      templateId: template.id,
      cityId,
      tier,
      title: fillContractText(template.title, template, values),
      target,
      rewards,
      contactId: contact.id,
      deadline,
      messageId: 0,
    };
    if (productId) offer.productId = productId;
    if (param !== undefined) offer.param = param;
    offer.messageId = messages.send(ctx, {
      contact,
      text:
        `${fillContractText(template.pitch, template, values)} Bis Sonntag.\n\n` +
        `Dafür gibt's: ${rewards.map(rewardText).join(', ')}.`,
      options: [
        {
          id: 'accept',
          label: 'Annehmen',
          reply: 'Abgemacht.',
          command: { type: 'quests.acceptContract', payload: { offerId: id } },
        },
        { id: 'no', label: 'Nein danke', reply: 'Diese Woche nicht.' },
      ],
    });
    c.offers.push(offer);
  }
  c.stats.offered += c.offers.length;
  if (c.offers.length > 0) ctx.emit('contract.offered', { offerIds: c.offers.map((o) => o.id), cityId });
}

/** Offene Angebote im Chat zurückziehen (angenommen oder Woche vorbei). */
function retractOffers(ctx: Ctx): void {
  messages.retractWhere(ctx, (m) => !!m.options?.some((o) => o.command?.type === 'quests.acceptContract'));
}

export function acceptContract(ctx: Ctx, offerId: number): CommandResult {
  const c = ctx.state.modules.quests.contracts;
  if (c.active) return { ok: false, reason: 'Du hast diese Woche schon einen Vertrag.' };
  const offer = c.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: 'Das Angebot gibt es nicht mehr.' };
  if (ctx.now >= offer.deadline) return { ok: false, reason: 'Die Woche ist vorbei.' };
  c.active = { ...offer, progress: 0, acceptedAt: ctx.now };
  c.offers = [];
  c.stats.accepted += 1;
  retractOffers(ctx);
  journal.add(ctx, `Vertrag angenommen: ${offer.title}.`, 'info');
  ctx.emit('contract.accepted', { offerId: offer.id, templateId: offer.templateId });
  checkContract(ctx);
  return { ok: true };
}

function finishContract(ctx: Ctx, result: 'done' | 'failed'): void {
  const c = ctx.state.modules.quests.contracts;
  const active = c.active;
  if (!active) return;
  const template = getContractTemplate(active.templateId);
  const contact = getContractContact(active.contactId);
  c.active = null;
  if (result === 'done') {
    c.stats.done += 1;
    const rewards = active.rewards.map((r) => grant(ctx, r)).join(', ');
    journal.add(ctx, `Vertrag erfüllt: ${active.title}.${rewards ? ` Belohnung: ${rewards}.` : ''}`, 'good');
    if (contact && template) messages.send(ctx, { contact, text: template.doneText, silent: true });
  } else {
    c.stats.failed += 1;
    journal.add(ctx, `Vertrag geplatzt: ${active.title}.`, 'bad');
    if (contact) {
      messages.send(ctx, { contact, text: 'Die Woche ist rum, und du hast nicht geliefert. Schade.', silent: true });
    }
  }
  c.history.unshift({ templateId: active.templateId, title: active.title, cityId: active.cityId, result, at: ctx.now });
  c.history = c.history.slice(0, CONTRACT_HISTORY);
  ctx.emit('contract.finished', { offerId: active.id, templateId: active.templateId, result });
}

/** Erfüllt? Dann auszahlen. Frist vorbei? Dann geplatzt. */
function checkContract(ctx: Ctx): void {
  const active = ctx.state.modules.quests.contracts.active;
  if (!active) return;
  const [now, target] = contractProgress(ctx.state);
  if (target > 0 && now >= target) finishContract(ctx, 'done');
  else if (ctx.now >= active.deadline) finishContract(ctx, 'failed');
}

/** Zähler des laufenden Vertrags für ein Ereignis. */
function onContractEvent<K extends keyof GameEvents>(type: K) {
  return (ctx: Ctx, payload: GameEvents[K]) => {
    const active = ctx.state.modules.quests.contracts?.active;
    const template = active ? getContractTemplate(active.templateId) : undefined;
    const counter = template?.count?.[type] as
      | ((p: GameEvents[K], s: GameState, o: ContractOffer) => number)
      | undefined;
    if (!active || !counter || active.acceptedAt === ctx.now) return;
    const delta = counter(payload, ctx.state, active);
    if (!(delta > 0)) return;
    active.progress += delta;
    checkContract(ctx);
  };
}

function contractHour(ctx: Ctx): void {
  const c = ctx.state.modules.quests.contracts;
  const active = c.active;
  const template = active ? getContractTemplate(active.templateId) : undefined;
  if (active && template?.streak) active.progress = template.streak(ctx.state, active) ? active.progress + 1 : 0;
  checkContract(ctx);
  // Angebote, die bis zum Ende der Woche liegen geblieben sind, verfallen.
  if (c.offers.length > 0 && c.offers.every((o) => ctx.now >= o.deadline)) {
    retractOffers(ctx);
    c.offers = [];
  }
  if (clock.weekday(ctx.now) === CONTRACT_WEEKDAY && clock.hour(ctx.now) === CONTRACT_HOUR && !c.active) {
    offerContracts(ctx);
  }
}

export function skipQuest(ctx: Ctx): CommandResult {
  if (!currentQuest(ctx.state)) return { ok: false, reason: 'Keine Quest offen.' };
  finish(ctx, true);
  return { ok: true };
}

/** Alle Ereignisse, auf die irgendeine Quest bzw. irgendein Vertrag hört. */
const COUNTED: (keyof GameEvents)[] = [
  ...new Set(QUESTS.flatMap((q) => Object.keys(q.count ?? {}) as (keyof GameEvents)[])),
];
const CONTRACT_COUNTED: (keyof GameEvents)[] = [
  ...new Set(CONTRACT_TEMPLATES.flatMap((t) => Object.keys(t.count ?? {}) as (keyof GameEvents)[])),
];

/** Quest- und Vertrags-Zähler für ein Ereignis zusammen (ein Handler pro Ereignis). */
function onCounted<K extends keyof GameEvents>(type: K) {
  const quest = COUNTED.includes(type) ? onEvent(type) : null;
  const contract = CONTRACT_COUNTED.includes(type) ? onContractEvent(type) : null;
  return (ctx: Ctx, payload: GameEvents[K]) => {
    quest?.(ctx, payload);
    contract?.(ctx, payload);
  };
}

export default defineModule({
  id: 'quests',
  version: 3,
  dependsOn: ['goods', 'staff', 'territory', 'police', 'reputation', 'leaderboard'],
  init: () => ({
    index: 0,
    progress: 0,
    done: [],
    skipped: [],
    title: null,
    startedAt: -1,
    contracts: newContracts(),
  }),
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
    const contract = ctx.state.modules.quests.contracts.active;
    if (contract && getContractTemplate(contract.templateId)?.measure) checkContract(ctx);
  },
  commands: {
    'quests.skip': (ctx) => skipQuest(ctx),
    'quests.acceptContract': (ctx, { offerId }) => acceptContract(ctx, offerId),
  },
  on: {
    ...Object.fromEntries([...new Set([...COUNTED, ...CONTRACT_COUNTED])].map((type) => [type, onCounted(type)])),
    // Meilenstein Mehrheit (Auftrag 30): Titel "Boss von Köln" für die Bestenliste, Peter gratuliert.
    'campaign.milestone': (ctx, { kind, cityId }) => {
      if (kind !== 'majority' || cityId !== 'koeln') return;
      ctx.state.modules.quests.title = MILESTONE_TITLE;
      messages.send(ctx, {
        contact: PETER,
        text: 'Sieben Veedel. Du bist jetzt der Boss von Köln, das sagen sie überall. Aber die anderen fünf schlafen nicht.',
      });
    },
    'clock.hourStarted': (ctx) => {
      contractHour(ctx);
      const quest = currentQuest(ctx.state);
      if (!quest?.streak) return;
      const q = ctx.state.modules.quests;
      q.progress = quest.streak(ctx.state) ? q.progress + 1 : 0;
      check(ctx);
    },
  },
  migrations: {
    // Version 2: Die Quests haben eine neue Reihenfolge (der Hafen und die Rechte Hand kamen vor dem, was sie brauchen).
    // Der Index zählt die Liste, also neu bestimmen: die erste Quest in der neuen Reihenfolge, die noch nicht erledigt
    // oder übersprungen ist. Fortschritt bleibt nur, wenn es dieselbe Stelle ist.
    2: (old: QuestsStateV1): QuestsStateV2 => {
      const finished = new Set([...old.done, ...old.skipped]);
      const found = QUESTS.findIndex((q) => !finished.has(q.id));
      const index = found < 0 ? QUESTS.length : found;
      return { ...old, index, progress: index === old.index ? old.progress : 0, startedAt: -1 };
    },
    // Version 3 (Auftrag 32): Wochenverträge, alte Stände fangen am nächsten Montag an.
    3: (old: QuestsStateV2): QuestsState => ({ ...old, contracts: newContracts() }),
  },
});
