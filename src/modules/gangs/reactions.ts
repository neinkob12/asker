// Reaktionen der Gangs auf Ereignisse anderer Module: deine Verkäufe in ihrem Revier (sie fallen auf, und der
// Umsatz der Gang sinkt; den Einfluss nimmt ihr territory ab), Ausgang von Konfrontationen, Tipps an die Polizei
// und Razzien, Kontrollwechsel in den Veedeln.

import type { Ctx, GameEvents } from '../../core';
import { journal } from '../../core';
import { PLAYER_FACTION } from '../territory';
import { veedelName } from '../veedel';
import { addHostility, addRelation, breakAgreements, say, statusOf } from './common';
import {
  HOSTILITY_AFTER_LESSON,
  HOSTILITY_ON_SNITCH,
  HOSTILITY_ON_TAKEOVER,
  RAID_ARRESTS,
  RAID_GOODS_SHARE,
  RAID_MONEY_SHARE,
  RELATION_ON_SNITCH,
  TIPOFF_DISCOVERY_BASE,
} from './config';
import { getGang, veedelGang } from './state';

/** Wirtschaftlich gegen die Gangs: Wer in ihrem Revier verkauft, fällt auf und drückt ihren Umsatz (siehe ai.ts). */
export function onSale(ctx: Ctx, sale: GameEvents['sale.completed']): void {
  const owner = veedelGang(ctx.state, sale.veedelId);
  const gang = owner ? getGang(ctx.state, owner) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  s.turfSales = Math.round((s.turfSales + sale.amount) * 100) / 100;
  if (sale.spotId) s.lastSaleSpotId = sale.spotId;
}

/** Konfrontationen mit einer Gang als Gegenseite: Verluste und Beute auf ihrer Seite verbuchen, dann reagieren. */
export function onEncounterResolved(ctx: Ctx, payload: GameEvents['encounter.resolved']): void {
  const gangId = payload.request.opponent?.factionId;
  const gang = gangId ? getGang(ctx.state, gangId) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  const r = payload.result;
  if (r) {
    // Was du gewinnst, verliert die Gang, und umgekehrt.
    s.people = Math.max(0, s.people - r.opponentLosses);
    s.goods = Math.max(0, s.goods - r.goods);
    s.money = Math.max(0, s.money - r.money);
  }

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

/**
 * Polizei: Du hast eine Gang verpfiffen ('police.snitch' → 'police.tipOff'). Die Razzien selbst macht police
 * später (siehe onPoliceRaid). Hier nur: Findet die Gang heraus, wer gesungen hat? Gut vernetzte eher.
 */
export function onTipOff(ctx: Ctx, payload: GameEvents['police.tipOff']): void {
  const gang = getGang(ctx.state, payload.gangId);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  if (!ctx.chance(TIPOFF_DISCOVERY_BASE + gang.traits.network * 0.5)) return;
  addHostility(s, HOSTILITY_ON_SNITCH);
  addRelation(s, RELATION_ON_SNITCH);
  breakAgreements(ctx, gang, s, 'Verrat');
  journal.add(ctx, `${gang.name} weiß, dass du gesungen hast.`, 'bad');
  say(ctx, gang, 'snitch');
}

/**
 * Polizei: Razzia bei einer Gang. Den Einfluss nimmt ihr police und schreibt das Journal; hier verliert die Gang
 * Ware, Geld und Leute. Gut vernetzte Gangs kommen glimpflicher davon.
 */
export function onPoliceRaid(ctx: Ctx, payload: GameEvents['police.raid']): void {
  const gang = getGang(ctx.state, payload.target);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  const factor = 1 - gang.traits.network * 0.6;
  const goods = Math.round(s.goods * RAID_GOODS_SHARE * factor);
  const money = Math.round(Math.max(0, s.money) * RAID_MONEY_SHARE * factor);
  const arrests = Math.min(s.people, Math.round(ctx.randomInt(RAID_ARRESTS[0], RAID_ARRESTS[1]) * factor));
  s.goods -= goods;
  s.money -= money;
  s.people -= arrests;
  ctx.emit('gang.busted', { gangId: gang.id, veedelId: payload.veedelId, arrests, goods, money });
}

/** Nimmst du einer Gang ein Veedel ab, wird sie richtig sauer. */
export function onControlChanged(ctx: Ctx, payload: GameEvents['territory.controlChanged']): void {
  if (payload.to !== PLAYER_FACTION || !payload.from) return;
  const gang = getGang(ctx.state, payload.from);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  addHostility(s, HOSTILITY_ON_TAKEOVER);
  journal.add(ctx, `${gang.name} wird dir ${veedelName(payload.veedelId)} nicht vergessen.`, 'bad', {
    veedelId: payload.veedelId,
  });
}
