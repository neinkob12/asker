// Reaktionen der Gangs auf Ereignisse anderer Module: deine Verkäufe in ihrem Revier (wirtschaftlicher Druck),
// Ausgang von Konfrontationen, Tipps an die Polizei und Razzien, Kontrollwechsel in den Veedeln.

import { type Ctx, formatAmount, type GameEvents, journal } from '../../core';
import { addInfluence, PLAYER_FACTION } from '../territory';
import { veedelName } from '../veedel';
import { addHostility, addRelation, breakAgreements, say, statusOf } from './common';
import {
  HOSTILITY_AFTER_LESSON,
  HOSTILITY_ON_SNITCH,
  HOSTILITY_ON_TAKEOVER,
  INFLUENCE_LOSS_PER_UNIT,
  RELATION_ON_SNITCH,
  TIPOFF_ARRESTS,
  TIPOFF_COOLDOWN,
  TIPOFF_DISCOVERY_BASE,
  TIPOFF_GOODS_SHARE,
  TIPOFF_INFLUENCE_LOSS,
  TIPOFF_MONEY_SHARE,
  TIPOFF_REPEAT_FACTOR,
} from './config';
import type { Gang } from './data';
import { type GangStatus, gangVeedel, getGang, veedelGang } from './state';

/** Wirtschaftlich gegen die Gangs: Wer in ihrem Revier verkauft, kostet sie Einfluss und fällt auf. */
export function onSale(ctx: Ctx, sale: GameEvents['sale.completed']): void {
  const owner = veedelGang(ctx.state, sale.veedelId);
  const gang = owner ? getGang(ctx.state, owner) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  s.turfSales = Math.round((s.turfSales + sale.amount) * 100) / 100;
  if (sale.spotId) s.lastSaleSpotId = sale.spotId;
  addInfluence(ctx, sale.veedelId, gang.id, -sale.amount * INFLUENCE_LOSS_PER_UNIT);
}

/** Konfrontationen mit einer Gang als Gegenseite: Verluste und Beute auf ihrer Seite verbuchen, dann reagieren. */
export function onEncounterResolved(ctx: Ctx, payload: GameEvents['encounter.resolved']): void {
  const gangId = payload.request.opponent?.factionId;
  const gang = gangId ? getGang(ctx.state, gangId) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  const r = payload.result;
  // Was du gewinnst, verliert die Gang, und umgekehrt.
  s.people = Math.max(0, s.people - r.opponentLosses);
  s.goods = Math.max(0, s.goods - r.goods);
  s.money = Math.max(0, s.money - r.money);

  const origin = payload.request.origin;
  const [kind] = origin?.module === 'gangs' ? (origin.ref ?? '').split(':') : [''];
  const alive = !payload.playerKilled;
  if (kind === 'raid') {
    if (payload.outcome === 'success') {
      addHostility(s, 10);
      addRelation(s, -5);
      if (alive) say(ctx, gang, 'raidWon');
    } else if (payload.outcome === 'failure') {
      addHostility(s, -HOSTILITY_AFTER_LESSON);
      if (alive) say(ctx, gang, 'raidLost');
    }
  } else if (kind === 'attack') {
    if (payload.outcome === 'success' && alive) say(ctx, gang, 'attacked');
  } else if (kind === 'collect') {
    if (s.protection && payload.outcome !== 'success') {
      s.protection = null;
      addHostility(s, 10);
      journal.add(ctx, `${gang.name} zahlt dir kein Schutzgeld mehr.`, 'bad');
      ctx.emit('gang.diplomacyChanged', { gangId: gang.id, kind: 'protection', active: false });
    }
  } else if (kind === 'deal') {
    if (payload.outcome === 'success') {
      addHostility(s, 10);
      addRelation(s, -10);
    }
  }
}

/** Razzia-Folgen bei einer Gang. Gut vernetzte Gangs kommen glimpflicher davon. */
function policeHit(ctx: Ctx, gang: Gang, s: GangStatus, factor: number, veedelIds: string[]) {
  const goods = Math.round(s.goods * TIPOFF_GOODS_SHARE * factor);
  const money = Math.round(s.money * TIPOFF_MONEY_SHARE * factor);
  const arrests = Math.min(s.people, Math.round(ctx.randomInt(TIPOFF_ARRESTS[0], TIPOFF_ARRESTS[1]) * factor));
  s.goods -= goods;
  s.money -= money;
  s.people -= arrests;
  const loss = Math.round(TIPOFF_INFLUENCE_LOSS * factor);
  if (loss > 0) for (const v of veedelIds) addInfluence(ctx, v, gang.id, -loss);
  ctx.emit('gang.busted', { gangId: gang.id, arrests, goods, money });
  return { goods, money, arrests };
}

/** Polizei: Du hast eine Gang verpfiffen ('police.snitch' → 'police.tipOff'). */
export function onTipOff(ctx: Ctx, payload: GameEvents['police.tipOff']): void {
  const gang = getGang(ctx.state, payload.gangId);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  const repeat = s.lastTipOffAt !== null && ctx.now - s.lastTipOffAt < TIPOFF_COOLDOWN;
  const factor = (1 - gang.traits.network * 0.6) * (repeat ? TIPOFF_REPEAT_FACTOR : 1);
  const veedelIds = payload.veedelIds.length > 0 ? payload.veedelIds : gangVeedel(ctx.state, gang.id);
  const hit = policeHit(ctx, gang, s, factor, veedelIds);
  s.lastTipOffAt = ctx.now;
  journal.add(
    ctx,
    repeat
      ? `Die Bullen gehen deinem Tipp nur halbherzig nach. ${gang.name}: ${hit.arrests} festgenommen.`
      : `Razzia bei ${gang.name}: ${hit.arrests} festgenommen, ${formatAmount(hit.goods)} Ware beschlagnahmt.`,
    'good',
  );
  if (ctx.chance(TIPOFF_DISCOVERY_BASE + gang.traits.network * 0.5)) {
    addHostility(s, HOSTILITY_ON_SNITCH);
    addRelation(s, RELATION_ON_SNITCH);
    breakAgreements(ctx, gang, s, 'Verrat');
    journal.add(ctx, `${gang.name} weiß, dass du gesungen hast.`, 'bad');
    say(ctx, gang, 'snitch');
  }
}

/** Polizei: Razzia bei einer Gang (z.B. wegen Heat). Trifft nur das eine Veedel. */
export function onPoliceRaid(ctx: Ctx, payload: GameEvents['police.raid']): void {
  const gang = getGang(ctx.state, payload.target);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  const hit = policeHit(ctx, gang, s, (1 - gang.traits.network * 0.6) * 0.5, [payload.veedelId]);
  journal.add(ctx, `Razzia bei ${gang.name} in ${veedelName(payload.veedelId)}: ${hit.arrests} festgenommen.`, 'info', {
    veedelId: payload.veedelId,
  });
}

/** Nimmst du einer Gang ein Veedel ab, wird sie richtig sauer. */
export function onControlChanged(ctx: Ctx, payload: GameEvents['territory.controlChanged']): void {
  if (payload.to !== PLAYER_FACTION || !payload.from) return;
  const gang = getGang(ctx.state, payload.from);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  addHostility(s, HOSTILITY_ON_TAKEOVER);
  journal.add(ctx, `Du hast ${gang.name} ${veedelName(payload.veedelId)} abgenommen. Das vergessen die nicht.`, 'bad', {
    veedelId: payload.veedelId,
  });
}
