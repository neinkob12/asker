// Wochenverträge (Auftrag 32): Montag 8 Uhr drei Angebote von Figuren mit Gesicht, eins wird per Handy angenommen,
// Frist Sonntag 23:59, Fortschritt über Ereignisse (count), ein Maß am Zustand (measure) oder eine Serie voller
// Stunden (streak), Belohnung plus Vertrauen bei einem Lieferanten. Vorlagen und Figuren: contracts.ts.
//
// Auftrag 46d: Peters Quests sind weg (das Tutorial führt in Köln, Auftrag 46b). Das Modul heißt weiter quests, damit
// alte Spielstände ihre Verträge behalten (Migration 10 nimmt nur noch den Teil contracts). Angebote kommen erst nach
// Köln: wenn Köln komplett ist oder die aktive Stadt nicht Köln ist (contractsOpen). Peters Kontakt (quest:peter) gehört
// jetzt dem Tutorial (tutorial/config.ts); alte Quest-Chats bleiben im Spielstand lesbar.
//
// Öffentliche API: contractsOpen(state), contractOffers(state, cityId?), activeContract(state), contractProgress(state),
//   contractHistory(state), contractStats(state), canAcceptContract(state, offer), contractValue(offer),
//   rewardText(reward), CONTRACT_TEMPLATES, CONTRACT_CONTACTS, getContractTemplate, getContractContact
// Befehle: 'quests.acceptContract'
// Ereignisse: 'contract.offered', 'contract.accepted', 'contract.finished'

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
import { activeCity, cityName, isBusinessSold, liveVeedel } from '../city';
import { DEFAULT_WAREHOUSE, getWarehouses, productName, store, type Warehouse } from '../goods';
import { addHeat, operationTier } from '../police';
import { changeReputation } from '../reputation';
import { addLoyalty, addXp, getStaff } from '../staff';
import { addSupplierTrust, getRelation, getSuppliers, isUnlocked, supplierById } from '../suppliers';
import { addInfluence, campaignProgress, hasPlayerPresence, PLAYER_FACTION } from '../territory';
import {
  type ActiveContract,
  CONTRACT_HISTORY,
  CONTRACT_HOUR,
  CONTRACT_OFFERS,
  CONTRACT_TEMPLATES,
  CONTRACT_WEEKDAY,
  type ContractOffer,
  type ContractReward,
  type ContractTemplate,
  contractRewards,
  contractTarget,
  fillContractText,
  getContractContact,
  getContractTemplate,
  rewardValue,
} from './contracts';

export {
  type ActiveContract,
  CONTRACT_CONTACTS,
  CONTRACT_TEMPLATES,
  type ContractOffer,
  type ContractReward,
  type ContractTemplate,
  getContractContact,
  getContractTemplate,
  rewardValue,
} from './contracts';

/** Ein abgeschlossener Vertrag (für die Liste). */
export interface ContractRecord {
  templateId: string;
  title: string;
  cityId: string;
  result: 'done' | 'failed';
  at: number;
}

/** Zustand des Moduls: nur noch die Wochenverträge (Auftrag 46d). */
export interface QuestsState {
  /** Angebote dieser Woche (bis eins angenommen ist oder die Woche endet). */
  offers: ContractOffer[];
  active: ActiveContract | null;
  /** Neueste zuerst, höchstens CONTRACT_HISTORY. */
  history: ContractRecord[];
  stats: { offered: number; accepted: number; done: number; failed: number };
}

/** Zustand bis Version 9: Peters Quests mit den Verträgen als Teil. Nur noch für die Migration. */
interface QuestsStateV9 {
  index?: number;
  done?: string[];
  skipped?: string[];
  title?: string | null;
  contracts?: QuestsState;
  phoneSteps?: boolean;
}

function newState(): QuestsState {
  return { offers: [], active: null, history: [], stats: { offered: 0, accepted: 0, done: 0, failed: 0 } };
}

declare module '../../core' {
  interface ModuleStates {
    quests: QuestsState;
  }
  interface GameCommands {
    /** Einen Wochenvertrag annehmen (eins der Angebote dieser Woche). */
    'quests.acceptContract': { offerId: number };
  }
  interface GameEvents {
    'contract.offered': { offerIds: number[]; cityId: string };
    'contract.accepted': { offerId: number; templateId: string };
    'contract.finished': { offerId: number; templateId: string; result: 'done' | 'failed' };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

/** Angebote dieser Woche für eine Stadt (ohne Angabe die aktive, die einer anderen Stadt gelten hier nicht). */
export function contractOffers(state: GameState, cityId = activeCity(state)): readonly ContractOffer[] {
  return (state.modules.quests?.offers ?? []).filter((o) => o.cityId === cityId);
}

export function activeContract(state: GameState): ActiveContract | null {
  return state.modules.quests?.active ?? null;
}

export function contractHistory(state: GameState): readonly ContractRecord[] {
  return state.modules.quests?.history ?? [];
}

export function contractStats(state: GameState): QuestsState['stats'] {
  return state.modules.quests?.stats ?? newState().stats;
}

/**
 * Gibt es schon Wochenverträge? Erst nach Köln (Auftrag 46d): wenn Köln komplett ist oder die aktive Stadt nicht Köln
 * ist. In der Hafen-Phase sind die Verträge in den Bestellungen der Kunden aufgegangen (trade).
 */
export function contractsOpen(state: GameState): boolean {
  if (isBusinessSold(state)) return false;
  return activeCity(state) !== 'koeln' || campaignProgress(state, 'koeln').complete;
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

/** Kurzer Text einer Belohnung, z.B. "10 g Gras" oder "+5 Ruf". */
export function rewardText(reward: ContractReward): string {
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

/**
 * Zahlt eine Belohnung aus und gibt den Text zurück, der dem Spieler sagt, was wirklich angekommen ist. Geld bucht die
 * Kasse in die Stadt des Vertrags (cityId), nicht in die gerade aktive.
 */
function grant(ctx: Ctx, reward: ContractReward, reason: string, cityId: string): string {
  const text = rewardText(reward);
  switch (reward.kind) {
    case 'goods': {
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
      wallet.earn(ctx, reward.amount, reward.money, reason, { category: 'income.other', cityId });
      return text;
    case 'reputation':
      changeReputation(ctx, reward.amount, 'Wochenvertrag');
      return text;
    case 'heat':
      for (const v of liveVeedel(ctx.state)) addHeat(ctx, v.id, -reward.amount);
      return text;
    // Das Team der Stadt, in der du bist (Auftrag 43), nicht die Leute der Statthalter.
    case 'teamXp':
      for (const m of getStaff(ctx.state, { status: 'active', cityId: activeCity(ctx.state) })) {
        addXp(ctx, m.id, reward.amount);
      }
      return text;
    case 'loyalty':
      for (const m of getStaff(ctx.state, { status: 'active', cityId: activeCity(ctx.state) })) {
        addLoyalty(ctx, m.id, reward.amount);
      }
      return text;
    case 'influence':
      for (const v of liveVeedel(ctx.state)) {
        if (hasPlayerPresence(ctx.state, v.id)) addInfluence(ctx, v.id, PLAYER_FACTION, reward.amount);
      }
      return text;
    case 'trust':
      addSupplierTrust(ctx, reward.supplierId, reward.amount);
      return text;
  }
}

/** Beginn des nächsten Montags nach time (die Frist: Sonntag 23:59 ist das letzte erlaubte). */
function nextMonday(time: number): number {
  const dayStart = time - (time % 1440);
  const daysAhead = (7 - clock.weekday(time) + CONTRACT_WEEKDAY) % 7 || 7;
  return dayStart + daysAhead * 1440;
}

/** Lieferanten, bei denen es Vertrauen geben kann: die freigeschalteten in der Stadt, die noch nicht 100 haben. */
function trustOptions(state: GameState, cityId: string) {
  return getSuppliers(state, cityId).filter((s) => isUnlocked(state, s.id) && getRelation(state, s.id).trust < 100);
}

/** Lieferant, bei dem es Vertrauen gibt: zufällig einer aus trustOptions. */
function trustSupplier(ctx: Ctx, cityId: string): string | null {
  const options = trustOptions(ctx.state, cityId);
  if (options.length === 0) return null;
  return ctx.pick(options).id;
}

/** Montag 8 Uhr: drei Angebote von verschiedenen Figuren für die aktive Stadt. */
function offerContracts(ctx: Ctx): void {
  const c = ctx.state.modules.quests;
  const cityId = activeCity(ctx.state);
  const tier = operationTier(ctx.state, cityId).index;
  const deadline = nextMonday(ctx.now);
  // Alte, nicht angenommene Angebote sind vorbei.
  retractOffers(ctx);
  c.offers = [];
  // Gibt es bei keinem Lieferanten mehr Vertrauen, fallen Vorlagen weg, die sonst gar nichts zahlen würden (Umsatz
  // beim Kleindealer: Geld gibt es dort keins). Ohne Würfel, die Würfelfolge bleibt sonst gleich.
  const trustOpen = trustOptions(ctx.state, cityId).length > 0;
  const pool = CONTRACT_TEMPLATES.filter(
    (t) =>
      (!t.available || t.available(ctx.state, cityId, tier)) &&
      (trustOpen || contractRewards(t, tier, null).length > 0),
  );
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

/**
 * Lässt sich das Angebot jetzt noch annehmen und schaffen? Serien brauchen genug Stunden bis zur Frist, „Veedel halten“
 * so viele Veedel wie beim Angebot, Vorlagen mit Bedingung (z.B. „ein Veedel dazugewinnen“) müssen sie noch erfüllen.
 */
export function canAcceptContract(state: GameState, offer: ContractOffer): CommandResult {
  if (activeContract(state)) return { ok: false, reason: 'Du hast diese Woche schon einen Vertrag.' };
  if (state.time >= offer.deadline) return { ok: false, reason: 'Die Woche ist vorbei.' };
  // Ein Angebot gilt nur in seiner Stadt (nach der Fahrt in eine andere wäre es dort nicht zu schaffen).
  if (offer.cityId !== activeCity(state))
    return { ok: false, reason: `Das Angebot gilt für ${cityName(offer.cityId)}.` };
  const template = getContractTemplate(offer.templateId);
  if (!template) return { ok: false, reason: 'Diesen Vertrag gibt es nicht mehr.' };
  if (template.streak) {
    const hours = Math.floor((offer.deadline - state.time) / 60);
    if (offer.target > hours) return { ok: false, reason: `Bis Sonntag bleiben nur noch ${hours} Stunden.` };
  }
  if (template.available && !template.available(state, offer.cityId, offer.tier)) {
    return { ok: false, reason: 'Das ist gerade nicht mehr zu schaffen.' };
  }
  if (template.streak && template.param && offer.param !== undefined) {
    const now = template.param(state, offer.cityId);
    if (now < offer.param) return { ok: false, reason: `Du hältst nur noch ${now} Veedel.` };
  }
  return { ok: true };
}

export function acceptContract(ctx: Ctx, offerId: number): CommandResult {
  const c = ctx.state.modules.quests;
  if (c.active) return { ok: false, reason: 'Du hast diese Woche schon einen Vertrag.' };
  const offer = c.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: 'Das Angebot gibt es nicht mehr.' };
  const allowed = canAcceptContract(ctx.state, offer);
  if (!allowed.ok) return allowed;
  c.active = { ...offer, progress: 0, acceptedAt: ctx.now, fresh: true };
  // Der Ausgangswert gilt ab dem Annehmen (z.B. Veedel jetzt), nicht ab dem Angebot am Montag.
  const template = getContractTemplate(offer.templateId);
  if (template?.param) {
    const param = template.param(ctx.state, offer.cityId);
    c.active.param = param;
    c.active.title = fillContractText(template.title, template, {
      target: offer.target,
      productId: offer.productId,
      param,
    });
  }
  c.offers = [];
  c.stats.accepted += 1;
  retractOffers(ctx);
  journal.add(ctx, `Vertrag angenommen: ${c.active.title}.`, 'info');
  ctx.emit('contract.accepted', { offerId: offer.id, templateId: offer.templateId });
  checkContract(ctx);
  return { ok: true };
}

function finishContract(ctx: Ctx, result: 'done' | 'failed'): void {
  const c = ctx.state.modules.quests;
  const active = c.active;
  if (!active) return;
  const template = getContractTemplate(active.templateId);
  const contact = getContractContact(active.contactId);
  c.active = null;
  if (result === 'done') {
    c.stats.done += 1;
    const reason = `Wochenvertrag: ${getContractContact(active.contactId)?.name.split(' (')[0] ?? active.title}`;
    const rewards = active.rewards.map((r) => grant(ctx, r, reason, active.cityId)).join(', ');
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
  const active = ctx.state.modules.quests.active;
  if (!active) return;
  const [now, target] = contractProgress(ctx.state);
  if (target > 0 && now >= target) finishContract(ctx, 'done');
  else if (ctx.now >= active.deadline) finishContract(ctx, 'failed');
}

/** Zähler des laufenden Vertrags für ein Ereignis. */
function onContractEvent<K extends keyof GameEvents>(type: K) {
  return (ctx: Ctx, payload: GameEvents[K]) => {
    const active = ctx.state.modules.quests.active;
    const template = active ? getContractTemplate(active.templateId) : undefined;
    const counter = template?.count?.[type] as
      | ((p: GameEvents[K], s: GameState, o: ContractOffer) => number)
      | undefined;
    // Eben angenommen, 'contract.accepted' noch nicht zugestellt: Was davor gemeldet war, zählt nicht.
    if (!active || !counter || (active.fresh && active.acceptedAt === ctx.now)) return;
    const delta = counter(payload, ctx.state, active);
    if (!(delta > 0)) return;
    active.progress += delta;
    checkContract(ctx);
  };
}

function contractHour(ctx: Ctx): void {
  const c = ctx.state.modules.quests;
  const active = c.active;
  const template = active ? getContractTemplate(active.templateId) : undefined;
  if (active && template?.streak) active.progress = template.streak(ctx.state, active) ? active.progress + 1 : 0;
  checkContract(ctx);
  // Angebote, die bis zum Ende der Woche liegen geblieben sind, verfallen.
  if (c.offers.length > 0 && c.offers.every((o) => ctx.now >= o.deadline)) {
    retractOffers(ctx);
    c.offers = [];
  }
  const monday = clock.weekday(ctx.now) === CONTRACT_WEEKDAY && clock.hour(ctx.now) === CONTRACT_HOUR;
  if (monday && !c.active && contractsOpen(ctx.state)) offerContracts(ctx);
}

/** Das Geschäft ist verkauft (Auftrag 43): Ein laufender Wochenvertrag und offene Angebote fallen weg. */
function leaveContracts(ctx: Ctx): void {
  const c = ctx.state.modules.quests;
  if (c.active) {
    journal.add(ctx, `Vertrag beendet: ${c.active.title}. Das Geschäft ist verkauft.`, 'info');
    c.active = null;
  }
  retractOffers(ctx);
  c.offers = [];
}

/** Alle Ereignisse, auf die irgendein Vertrag hört. */
const CONTRACT_COUNTED: (keyof GameEvents)[] = [
  ...new Set(CONTRACT_TEMPLATES.flatMap((t) => Object.keys(t.count ?? {}) as (keyof GameEvents)[])),
];

export default defineModule({
  id: 'quests',
  version: 10,
  dependsOn: ['goods', 'staff', 'territory', 'police', 'reputation', 'leaderboard'],
  init: newState,
  tick: (ctx) => {
    const contract = ctx.state.modules.quests.active;
    if (contract && getContractTemplate(contract.templateId)?.measure) checkContract(ctx);
  },
  commands: {
    'quests.acceptContract': (ctx, { offerId }) => acceptContract(ctx, offerId),
  },
  on: {
    ...Object.fromEntries(CONTRACT_COUNTED.map((type) => [type, onContractEvent(type)])),
    // Ab hier zählt, was geschieht, für den eben angenommenen Vertrag (alles davor Gemeldete ist zugestellt).
    'contract.accepted': (ctx, { offerId }) => {
      const active = ctx.state.modules.quests.active;
      if (active?.id === offerId) active.fresh = false;
    },
    // Verkauft (Auftrag 43): Der Wochenvertrag ist vorbei.
    'business.sold': (ctx) => leaveContracts(ctx),
    // Angekommen in einer Stadt: Angebote anderer Städte sind vorbei (ihre Chat-Nachrichten hat city schon
    // zurückgezogen). Ein laufender Vertrag bleibt und zählt weiter nur in seiner Stadt.
    'city.arrived': (ctx, { cityId }) => {
      const c = ctx.state.modules.quests;
      c.offers = c.offers.filter((o) => o.cityId === cityId);
    },
    // "Nein danke" auf ein Vertragsangebot: Das Angebot ist weg.
    'message.answered': (ctx, { messageId, optionId }) => {
      const c = ctx.state.modules.quests;
      if (optionId === 'no') c.offers = c.offers.filter((o) => o.messageId !== messageId);
    },
    'clock.hourStarted': (ctx) => contractHour(ctx),
  },
  migrations: {
    // Versionen 2 bis 9 sortierten Peters Quests um (Index, Verträge, Handy-Schritte). Die Quests sind weg (Auftrag
    // 46d), Version 10 nimmt nur noch die Verträge: Hier muss nichts mehr gerechnet werden.
    2: keep,
    3: keep,
    4: keep,
    5: keep,
    6: keep,
    7: keep,
    8: keep,
    9: keep,
    // Version 10 (Auftrag 46d): Nur noch die Wochenverträge. Peters Quests, Titel und Handy-Schritte fallen weg (den
    // Titel „Boss von Köln“ kennt territory über seine Meilensteine).
    10: (old: QuestsStateV9 | undefined): QuestsState => old?.contracts ?? newState(),
  },
});

function keep(old: QuestsStateV9): QuestsStateV9 {
  return old;
}
