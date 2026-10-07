// Stammabnehmer (Auftrag 34): Die Dealer (DEALERS) bekommen Vertrauen wie die Lieferanten. Erfüllte Deals bringen es
// rauf, geplatzte und verpasste stark runter. Stufen (DEALER_STAGES): regelmäßige Anfragen, Vorkasse, Exklusivität
// (nur bei dir, dafür Rabatt), Zwischenhändler für sein Veedel (wöchentliche Lieferung, Einfluss ohne Spot, weniger
// Marge). Wer zweimal hängengelassen wird, geht zu einer Gang und kommt erst nach DEALER_RETURN_DAYS wieder.
// Das Modell ist die Vorlage für die Kunden der Hafen-Phase (Auftrag 40).

import {
  type CommandResult,
  type Contact,
  type Ctx,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { activeCity, isCityLive } from '../city';
import { getGang, getGangs, veedelGang } from '../gangs';
import { allProducts, formatProductAmount, getStock, productName, take } from '../goods';
import { averageReferencePrice } from '../market';
import { specialistFactor } from '../staff';
import { addInfluence, PLAYER_FACTION } from '../territory';
import { veedelName } from '../veedel';
import {
  DEALER_EXCLUSIVE_DISCOUNT,
  DEALER_EXCLUSIVE_INTERVAL,
  DEALER_LETDOWN_DAYS,
  DEALER_LETDOWNS_TO_LEAVE,
  DEALER_OFFER_GAP,
  DEALER_REGULAR_INTERVAL,
  DEALER_RETURN_DAYS,
  DEALER_STAGES,
  DEALER_START_TRUST,
  DEALER_TRUST,
  DEALERS,
  type DealerInfo,
  type DealerStageId,
  MIDDLEMAN_AMOUNT,
  MIDDLEMAN_DISCOUNT,
  MIDDLEMAN_INFLUENCE,
  MIDDLEMAN_INTERVAL,
} from './config';

export interface DealerMiddleman {
  productId: string;
  amount: number;
  nextAt: number;
}

/** Wie ein Dealer zu dir steht. */
export interface DealerRelation {
  trust: number;
  deals: number;
  /** Wann er hängengelassen wurde (Frist verpasst, Deal geplatzt), älteste zuerst. */
  letdowns: number[];
  status: 'active' | 'gone';
  /** Zu welcher Gang er gegangen ist. */
  goneTo: string | null;
  /** Bis wann er weg ist. */
  goneUntil: number | null;
  exclusive: boolean;
  middleman: DealerMiddleman | null;
  lastRequestAt: number;
  /** Letztes Angebot (Exklusivität oder Zwischenhandel); am Anfang so weit zurück, dass gleich eins kommen darf. */
  lastOfferAt: number;
}

function fresh(): DealerRelation {
  return {
    trust: DEALER_START_TRUST,
    deals: 0,
    letdowns: [],
    status: 'active',
    goneTo: null,
    goneUntil: null,
    exclusive: false,
    middleman: null,
    lastRequestAt: 0,
    lastOfferAt: -DEALER_OFFER_GAP,
  };
}

const EMPTY: DealerRelation = fresh();

export function getDealer(id: string): DealerInfo | undefined {
  return DEALERS.find((d) => d.id === id);
}

/** Dealer einer Stadt (ohne Angabe: der aktiven). */
export function getDealers(state: GameState, cityId: string = activeCity(state)): readonly DealerInfo[] {
  return DEALERS.filter((d) => d.cityId === cityId);
}

/** Verhältnis zu einem Dealer (Standardwerte, wenn ihr noch nie gehandelt habt). */
export function dealerRelation(state: GameState, id: string): DealerRelation {
  return state.modules.customers.dealers?.[id] ?? EMPTY;
}

function relationOf(ctx: Ctx, id: string): DealerRelation {
  const s = ctx.state.modules.customers;
  s.dealers ??= {};
  s.dealers[id] ??= fresh();
  return s.dealers[id];
}

/** Stufe nach Vertrauen. Exklusiv und Zwischenhändler gibt es erst, wenn der Spieler zugesagt hat. */
export function dealerStage(state: GameState, id: string): DealerStageId {
  const r = dealerRelation(state, id);
  if (r.middleman) return 'middleman';
  if (r.exclusive) return 'exclusive';
  const reached = DEALER_STAGES.filter((s) => r.trust >= s.at && s.id !== 'exclusive' && s.id !== 'middleman');
  return reached[reached.length - 1]?.id ?? 'casual';
}

export function dealerStageName(stage: DealerStageId): string {
  return DEALER_STAGES.find((s) => s.id === stage)?.name ?? stage;
}

const stageIndex = (stage: DealerStageId) => DEALER_STAGES.findIndex((s) => s.id === stage);

/** Zahlt der Dealer vorab (und kippt der Deal nicht mehr)? */
export function dealerPrepays(state: GameState, id: string): boolean {
  return stageIndex(dealerStage(state, id)) >= stageIndex('prepay');
}

/** Dealer aus einer Kontakt-ID ('dealer:<id>'). */
export function dealerOfContact(contactId: string): string | null {
  return contactId.startsWith('dealer:') ? contactId.slice(7) : null;
}

export function dealerContact(d: DealerInfo): Contact {
  return { id: `dealer:${d.id}`, name: d.name, kind: 'other', role: 'Großhandel', about: d.about, look: {} };
}

/**
 * Wer fragt an? Gewicht nach Vertrauen (Exklusive doppelt), weggegangene nicht. Gibt null zurück, wenn keiner in der
 * Stadt kann.
 */
export function pickDealer(ctx: Ctx, cityId: string): DealerInfo | null {
  const list = getDealers(ctx.state, cityId).filter((d) => dealerRelation(ctx.state, d.id).status === 'active');
  if (list.length === 0) return null;
  const weight = (d: DealerInfo) => {
    const r = dealerRelation(ctx.state, d.id);
    return (1 + r.trust / 20) * (r.exclusive ? 2 : 1);
  };
  let roll = ctx.random() * list.reduce((sum, d) => sum + weight(d), 0);
  for (const d of list) {
    roll -= weight(d);
    if (roll < 0) return d;
  }
  return list[list.length - 1];
}

/** Zusätzlicher Rabatt, den ein Dealer bekommt (exklusiv). */
export function dealerExtraDiscount(state: GameState, id: string): number {
  return dealerRelation(state, id).exclusive ? DEALER_EXCLUSIVE_DISCOUNT : 0;
}

/** Ab „regelmäßig“ will ein Dealer größere Mengen (obere Hälfte der Mengen). */
export function dealerWantsMore(state: GameState, id: string): boolean {
  return stageIndex(dealerStage(state, id)) >= stageIndex('regular');
}

/** Eine Anfrage dieses Dealers ist da (für den Abstand der regelmäßigen Anfragen). */
export function noteDealerRequest(ctx: Ctx, id: string): void {
  relationOf(ctx, id).lastRequestAt = ctx.now;
}

/** Stündlich: Dealer ab „regelmäßig“ melden sich spätestens nach ihrem Abstand. Gibt den fälligen zurück. */
export function dueDealer(state: GameState, cityId: string): DealerInfo | null {
  for (const d of getDealers(state, cityId)) {
    const r = dealerRelation(state, d.id);
    if (r.status !== 'active' || !dealerWantsMore(state, d.id)) continue;
    const interval = r.exclusive ? DEALER_EXCLUSIVE_INTERVAL : DEALER_REGULAR_INTERVAL;
    if (state.time - r.lastRequestAt >= interval) return d;
  }
  return null;
}

function changeTrust(ctx: Ctx, d: DealerInfo, delta: number): void {
  const r = relationOf(ctx, d.id);
  const before = dealerStage(ctx.state, d.id);
  r.trust = Math.max(0, Math.min(100, Math.round(r.trust + delta)));
  const after = dealerStage(ctx.state, d.id);
  if (after !== before) ctx.emit('dealer.stageChanged', { dealerId: d.id, stage: after });
  maybeOffer(ctx, d);
}

/** Ein Großhandels-Auftrag ist zu Ende: Vertrauen anpassen, bei zweimal Hängenlassen geht der Dealer. */
export function onDealerOrderFinished(
  ctx: Ctx,
  contactId: string,
  status: 'done' | 'declined' | 'expired' | 'failed',
): void {
  const id = dealerOfContact(contactId);
  const d = id ? getDealer(id) : undefined;
  if (!d) return;
  const r = relationOf(ctx, d.id);
  if (status === 'done') r.deals += 1;
  if (status === 'expired' || status === 'failed') {
    r.letdowns = [...r.letdowns.filter((t) => ctx.now - t < DEALER_LETDOWN_DAYS * 1440), ctx.now];
  }
  changeTrust(ctx, d, DEALER_TRUST[status]);
  if (r.letdowns.length >= DEALER_LETDOWNS_TO_LEAVE) leave(ctx, d);
}

/** Der Dealer geht zu einer Gang (der seines Veedels, sonst der stärksten der Stadt). */
function leave(ctx: Ctx, d: DealerInfo): void {
  const r = relationOf(ctx, d.id);
  const gangId = veedelGang(ctx.state, d.veedelId) ?? getGangs(ctx.state, d.cityId)[0]?.id ?? null;
  const gang = gangId ? getGang(ctx.state, gangId) : undefined;
  r.status = 'gone';
  r.goneTo = gangId;
  r.goneUntil = ctx.now + DEALER_RETURN_DAYS * 1440;
  r.exclusive = false;
  r.middleman = null;
  r.letdowns = [];
  messages.send(ctx, {
    contact: dealerContact(d),
    text: gang
      ? `Zweimal hast du mich hängen lassen. Ich kauf jetzt bei ${gang.name}. Ruf nicht an.`
      : 'Zweimal hast du mich hängen lassen. Ich such mir wen anders.',
  });
  journal.add(ctx, `${d.name} kauft nicht mehr bei dir${gang ? `, sondern bei ${gang.name}` : ''}.`, 'bad');
  ctx.emit('dealer.left', { dealerId: d.id, gangId });
}

/** Ab genug Vertrauen bietet der Dealer Exklusivität an, als Exklusiver dann den Zwischenhandel. */
function maybeOffer(ctx: Ctx, d: DealerInfo): void {
  const r = relationOf(ctx, d.id);
  if (r.status !== 'active' || ctx.now - r.lastOfferAt < DEALER_OFFER_GAP) return;
  const exclusiveAt = DEALER_STAGES.find((s) => s.id === 'exclusive')?.at ?? 70;
  const middlemanAt = DEALER_STAGES.find((s) => s.id === 'middleman')?.at ?? 85;
  if (!r.exclusive && r.trust >= exclusiveAt) {
    r.lastOfferAt = ctx.now;
    messages.send(ctx, {
      contact: dealerContact(d),
      text: `Pass auf: Ich kauf ab jetzt nur noch bei dir. Dafür will ich ${Math.round(DEALER_EXCLUSIVE_DISCOUNT * 100)} % Nachlass und bin öfter dran. Deal?`,
      options: [
        {
          id: 'accept',
          label: 'Exklusiv, abgemacht',
          reply: 'Abgemacht. Nur noch bei mir.',
          command: { type: 'customers.dealerExclusive', payload: { dealerId: d.id, accept: true } },
        },
        { id: 'decline', label: 'Lieber nicht', reply: 'Lass mal, wir bleiben locker.' },
      ],
      expiresIn: 24 * 60,
    });
  } else if (r.exclusive && !r.middleman && r.trust >= middlemanAt) {
    r.lastOfferAt = ctx.now;
    messages.send(ctx, {
      contact: dealerContact(d),
      text: `Ich kann ${veedelName(d.veedelId)} für dich übernehmen: jede Woche ${formatProductAmount(middlemanProduct(ctx.state, d.cityId), MIDDLEMAN_AMOUNT)}, ich verteile. Weniger Marge für dich, aber du bist da, ohne Spot.`,
      options: [
        {
          id: 'accept',
          label: 'Zwischenhändler',
          reply: `Mach. ${veedelName(d.veedelId)} gehört dir.`,
          command: { type: 'customers.dealerMiddleman', payload: { dealerId: d.id, accept: true } },
        },
        { id: 'decline', label: 'Noch nicht', reply: 'Noch nicht.' },
      ],
      expiresIn: 24 * 60,
    });
  }
}

/** Ware für den Zwischenhandel: die, von der in der Stadt am meisten liegt (sonst Gras). */
function middlemanProduct(state: GameState, cityId: string): string {
  let best = 'weed';
  let most = -1;
  for (const p of allProducts()) {
    const amount = getStock(state, { productId: p.id, cityId });
    if (amount > most) {
      most = amount;
      best = p.id;
    }
  }
  return best;
}

/** Befehl 'customers.dealerExclusive'. */
export function setExclusive(ctx: Ctx, dealerId: string, accept: boolean): CommandResult {
  const d = getDealer(dealerId);
  if (!d) return { ok: false, reason: 'Diesen Dealer gibt es nicht.' };
  const r = relationOf(ctx, d.id);
  if (r.status !== 'active') return { ok: false, reason: `${d.name} kauft nicht mehr bei dir.` };
  if (!accept) {
    if (r.middleman) return { ok: false, reason: 'Erst den Zwischenhandel beenden.' };
    r.exclusive = false;
    return { ok: true };
  }
  const exclusiveAt = DEALER_STAGES.find((s) => s.id === 'exclusive')?.at ?? 70;
  if (r.trust < exclusiveAt) return { ok: false, reason: `${d.name} vertraut dir noch nicht genug.` };
  r.exclusive = true;
  journal.add(ctx, `${d.name} kauft ab jetzt nur noch bei dir.`, 'good');
  ctx.emit('dealer.stageChanged', { dealerId: d.id, stage: dealerStage(ctx.state, d.id) });
  return { ok: true };
}

/** Befehl 'customers.dealerMiddleman': Zwischenhändler für sein Veedel werden lassen (oder beenden). */
export function setMiddleman(ctx: Ctx, dealerId: string, accept: boolean): CommandResult {
  const d = getDealer(dealerId);
  if (!d) return { ok: false, reason: 'Diesen Dealer gibt es nicht.' };
  const r = relationOf(ctx, d.id);
  if (!accept) {
    if (!r.middleman) return { ok: true };
    r.middleman = null;
    journal.add(ctx, `${d.name} ist nicht mehr dein Zwischenhändler.`, 'info');
    ctx.emit('dealer.stageChanged', { dealerId: d.id, stage: dealerStage(ctx.state, d.id) });
    return { ok: true };
  }
  const middlemanAt = DEALER_STAGES.find((s) => s.id === 'middleman')?.at ?? 85;
  if (r.status !== 'active' || !r.exclusive || r.trust < middlemanAt) {
    return { ok: false, reason: `${d.name} ist noch nicht so weit.` };
  }
  r.middleman = { productId: middlemanProduct(ctx.state, d.cityId), amount: MIDDLEMAN_AMOUNT, nextAt: ctx.now + 1440 };
  journal.add(ctx, `${d.name} versorgt jetzt ${veedelName(d.veedelId)} für dich, jede Woche.`, 'good');
  ctx.emit('dealer.stageChanged', { dealerId: d.id, stage: 'middleman' });
  return { ok: true };
}

/** Preis einer Zwischenhändler-Lieferung. */
export function middlemanPrice(state: GameState, m: DealerMiddleman): number {
  return Math.max(
    10,
    Math.round((m.amount * averageReferencePrice(state, m.productId) * (1 - MIDDLEMAN_DISCOUNT)) / 10) * 10,
  );
}

/**
 * Stündlich: weggegangene Dealer kommen wieder, Zwischenhändler holen ihre Wochenlieferung (nur in der Stadt, die live
 * ist). Fehlt die Ware, ist das ein Hängenlassen.
 */
export function dealersTick(ctx: Ctx): void {
  const all = ctx.state.modules.customers.dealers;
  if (!all) return;
  for (const id of Object.keys(all).sort()) {
    const d = getDealer(id);
    const r = all[id];
    if (!d) continue;
    if (r.status === 'gone' && r.goneUntil !== null && r.goneUntil <= ctx.now) {
      r.status = 'active';
      r.goneTo = null;
      r.goneUntil = null;
      r.trust = Math.min(r.trust, DEALER_START_TRUST);
      messages.send(ctx, {
        contact: dealerContact(d),
        text: 'Bei den anderen läuft es auch nicht besser. Wenn du was hast, meld dich.',
        silent: true,
      });
    }
    const m = r.middleman;
    if (!m || m.nextAt > ctx.now || !isCityLive(ctx.state, d.cityId)) continue;
    m.nextAt = ctx.now + MIDDLEMAN_INTERVAL;
    const available = getStock(ctx.state, { productId: m.productId, cityId: d.cityId });
    if (available < m.amount) {
      journal.add(
        ctx,
        `${d.name} wartet auf seine Wochenlieferung: zu wenig ${productName(m.productId)} im Lager.`,
        'bad',
      );
      messages.send(ctx, { contact: dealerContact(d), text: 'Kein Stoff diese Woche? Meine Leute fragen schon.' });
      onDealerOrderFinished(ctx, `dealer:${d.id}`, 'expired');
      continue;
    }
    const taken = take(ctx, { productId: m.productId, amount: m.amount }).taken;
    // Auftrag 46e: Buchhalter, ein paar Prozent mehr Erlös.
    const price = Math.round(
      ((middlemanPrice(ctx.state, m) * taken) / m.amount) * specialistFactor(ctx.state, 'revenue'),
    );
    wallet.earn(ctx, price, 'dirty', `Zwischenhandel ${d.name}`, 'sales.wholesale');
    addInfluence(ctx, d.veedelId, PLAYER_FACTION, MIDDLEMAN_INFLUENCE);
    r.deals += 1;
    changeTrust(ctx, d, 2);
    journal.add(
      ctx,
      `${d.name} hat ${formatProductAmount(m.productId, taken)} ${productName(m.productId)} für ${veedelName(d.veedelId)} abgeholt: ${formatEuro(price)}.`,
      'good',
    );
    ctx.emit('dealer.middlemanDelivered', { dealerId: d.id, amount: taken, price });
  }
}
