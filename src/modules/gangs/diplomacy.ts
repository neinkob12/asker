// Befehle gegen und mit den Gangs: Diplomatie (Waffenstillstand, Schutzgeld zahlen oder kassieren, Bündnis),
// Gewalt (Überfall auf einen Gang-Spot) und Ware kaufen. Verpfeifen läuft über 'police.snitch' (siehe reactions.ts).
// Jeder Befehl prüft seine Bedingungen und sagt auf Deutsch, warum etwas nicht geht.

import {
  type CommandResult,
  type Ctx,
  clock,
  formatAmount,
  formatEuro,
  type GameState,
  journal,
  wallet,
} from '../../core';
import { activeCity, cityName, isPlayerIn, relationFactor } from '../city';
import { activeEncounters, ENCOUNTER_KINDS, startEncounter } from '../encounters';
import { DEFAULT_PRODUCT, fitsInto, getWarehouses, storeFitting } from '../goods';
import { getStaff, getStaffMember, type StaffMember } from '../staff';
import { veedelCity, veedelName } from '../veedel';
import { addHostility, addRelation, breakAgreements, ceasefireBlock, crewFor, statusOf } from './common';
import {
  ALLIANCE_DURATION,
  ALLIANCE_MAX_HOSTILITY,
  ALLIANCE_MIN_RELATION,
  CEASEFIRE_DURATION,
  CEASEFIRE_HOSTILITY_DROP,
  CEASEFIRE_RELATION,
  DEAL_BETRAYAL_BASE,
  HOSTILITY_ON_PLAYER_ATTACK,
  PROTECTION_INTERVAL,
  PROTECTION_POWER_RATIO,
  RAID_LOOT_GOODS_MAX,
  RAID_LOOT_GOODS_SHARE,
  RAID_LOOT_MONEY_MAX,
  RAID_LOOT_MONEY_SHARE,
  RELATION_ON_DEAL,
  RELATION_ON_PLAYER_ATTACK,
  TRIBUTE_DURATION,
  TRIBUTE_HOSTILITY_DROP,
} from './config';
import { type Gang, gangNameIn } from './data';
import { remember } from './memory';
import {
  allianceCost,
  ceasefireCost,
  type GangStatus,
  gangPower,
  getGang,
  isAllied,
  isGangBroken,
  paysTribute,
  playerPower,
  protectionAmount,
  raidTargets,
  tributeAmount,
} from './state';

type Found = { gang: Gang; s: GangStatus };

function find(ctx: Ctx, gangId: string): Found | CommandResult {
  const gang = getGang(ctx.state, gangId);
  const s = gang && statusOf(ctx, gangId);
  if (!gang || !s) return { ok: false, reason: 'Diese Gang gibt es nicht.' };
  return { gang, s };
}

function isFound(value: Found | CommandResult): value is Found {
  return 'gang' in value;
}

const notEnoughMoney = (amount: number): CommandResult => ({
  ok: false,
  reason: `Nicht genug Schwarzgeld (${formatEuro(amount)}).`,
});

// ---------------------------------------------------------------------------------------------
// Waffenstillstand

export function ceasefire(ctx: Ctx, gangId: string): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  const blocked = ceasefireBlock(ctx.state, ctx.now, gang, s);
  if (blocked) return { ok: false, reason: blocked };
  const cost = ceasefireCost(ctx.state, gangId);
  if (!wallet.pay(ctx, cost, 'dirty', `Waffenstillstand mit ${gangNameIn(gang, 'dative')}`, 'tribute'))
    return notEnoughMoney(cost);
  s.money += cost;
  s.ceasefireUntil = ctx.now + CEASEFIRE_DURATION;
  s.quote = null;
  addHostility(s, -CEASEFIRE_HOSTILITY_DROP);
  // Kölscher Klüngel (Etappe 7): Die Beziehung wächst je nach Stadt schneller oder langsamer.
  addRelation(s, CEASEFIRE_RELATION * relationFactor(gang.cityId));
  remember(ctx, gangId, 'ceasefire');
  journal.add(
    ctx,
    `Waffenstillstand mit ${gangNameIn(gang, 'dative')} für ${formatEuro(cost)}, bis ${clock.format(s.ceasefireUntil)}.`,
    'good',
  );
  ctx.emit('gang.diplomacyChanged', { gangId, kind: 'ceasefire', active: true });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Schutzgeld zahlen (du an die Gang)

export function payTribute(ctx: Ctx, gangId: string): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  if (paysTribute(ctx.state, gangId)) return { ok: false, reason: `Du zahlst ${gang.name} schon.` };
  const amount = tributeAmount(ctx.state, gangId);
  if (!wallet.pay(ctx, amount, 'dirty', `Schutzgeld an ${gangNameIn(gang, 'accusative')}`, 'tribute'))
    return notEnoughMoney(amount);
  s.money += amount;
  s.tribute = { amount, until: ctx.now + TRIBUTE_DURATION };
  s.quote = null;
  addHostility(s, -TRIBUTE_HOSTILITY_DROP);
  addRelation(s, 10);
  remember(ctx, gangId, 'tributePaid');
  journal.add(
    ctx,
    `Du zahlst ${gangNameIn(gang, 'dative')} ${formatEuro(amount)} Schutzgeld. Eine Woche Ruhe.`,
    'info',
  );
  ctx.emit('gang.diplomacyChanged', { gangId, kind: 'tribute', active: true });
  return { ok: true };
}

/** Forderung ablehnen. Klappt immer, macht sie aber wütender. */
export function refuse(ctx: Ctx, gangId: string): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  s.quote = null;
  addHostility(s, 10);
  addRelation(s, -5);
  journal.add(ctx, `Du hast ${gangNameIn(gang, 'accusative')} abblitzen lassen.`, 'info');
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Schutzgeld kassieren (die Gang an dich)

export function demandProtection(ctx: Ctx, gangId: string): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  if (s.protection) return { ok: false, reason: `${gang.name} zahlt dir schon.` };
  if (paysTribute(ctx.state, gangId)) return { ok: false, reason: `Du zahlst ${gang.name} selbst Schutzgeld.` };
  if (isGangBroken(ctx.state, gangId))
    return { ok: false, reason: `${gang.name} ist zerschlagen, da ist nichts zu holen.` };
  const mine = Math.round(playerPower(ctx.state));
  const theirs = Math.round(gangPower(ctx.state, gangId));
  if (mine < theirs * PROTECTION_POWER_RATIO) {
    return {
      ok: false,
      reason: `${gang.name} lacht dich aus. Dafür bist du zu klein (Stärke ${mine} gegen ${theirs}).`,
    };
  }
  const amount = protectionAmount(ctx.state, gangId);
  const paid = Math.min(amount, Math.max(0, s.money));
  s.money -= paid;
  if (paid > 0) wallet.earn(ctx, paid, 'dirty', `Schutzgeld von ${gangNameIn(gang, 'dative')}`, 'income.other');
  s.protection = { amount, nextDueAt: ctx.now + PROTECTION_INTERVAL, overdue: false };
  addHostility(s, 15);
  addRelation(s, -20);
  journal.add(
    ctx,
    `${gang.name} beugt sich und zahlt dir ${formatEuro(paid)} Schutzgeld, ab jetzt jede Woche.`,
    'good',
  );
  ctx.emit('gang.diplomacyChanged', { gangId, kind: 'protection', active: true });
  return { ok: true };
}

/** Verweigertes Schutzgeld mit Gewalt eintreiben: Konfrontation "Schulden eintreiben" gegen die Gang. */
export function collect(ctx: Ctx, gangId: string, staffIds?: string[], playerPresent?: boolean): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  if (!s.protection?.overdue) return { ok: false, reason: `${gang.name} schuldet dir gerade nichts.` };
  // Nur in der Stadt, die live ist (Auftrag 30): Die Gangs der schlafenden Stadt sind eingefroren.
  if (gang.cityId !== activeCity(ctx.state)) return { ok: false, reason: 'Du bist nicht in der Stadt.' };
  if (activeEncounters(ctx.state).length > 0) return { ok: false, reason: 'Erst die laufende Konfrontation klären.' };
  const crew = staffIds ?? crewFor(ctx.state, { cityId: gang.cityId });
  const request = {
    kind: 'debtCollection',
    veedelId: gang.homeVeedelId,
    staffIds: crew,
    opponent: { factionId: gang.id, label: gang.crew, strength: gang.traits.fighting, count: 2 },
    stakes: { money: s.protection.amount },
    situation: `${gang.name} schuldet dir {stakeMoney} Schutzgeld und will nicht zahlen. Treffpunkt {place}. {opponent} warten schon.`,
    origin: { module: 'gangs', ref: `collect:${gang.id}` },
    ...(playerPresent === undefined ? { askPlayer: true } : { playerPresent }),
  };
  s.protection.overdue = false;
  const { encounterId } = startEncounter(ctx, request);
  return { ok: true, data: { encounterId } };
}

export function releaseProtection(ctx: Ctx, gangId: string): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  if (!s.protection) return { ok: false, reason: `${gang.name} zahlt dir nichts.` };
  s.protection = null;
  addHostility(s, -10);
  journal.add(ctx, `Du verzichtest auf das Schutzgeld von ${gangNameIn(gang, 'dative')}.`, 'info');
  ctx.emit('gang.diplomacyChanged', { gangId, kind: 'protection', active: false });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Bündnis gegen eine andere Gang

export function ally(ctx: Ctx, gangId: string, againstGangId: string): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  const enemy = getGang(ctx.state, againstGangId);
  const enemyStatus = enemy && statusOf(ctx, againstGangId);
  if (!enemy || !enemyStatus || enemy.id === gang.id) return { ok: false, reason: 'Gegen wen denn?' };
  if (enemy.cityId !== gang.cityId) return { ok: false, reason: `${enemy.name} ist nicht in ${gang.name}s Stadt.` };
  if (isGangBroken(ctx.state, againstGangId)) {
    return { ok: false, reason: `${enemy.name} ist schon zerschlagen. Dafür braucht es kein Bündnis.` };
  }
  if (isAllied(ctx.state, gangId)) return { ok: false, reason: `Du bist schon mit ${gang.name} verbündet.` };
  if (s.relation < ALLIANCE_MIN_RELATION) {
    return { ok: false, reason: `${gang.name} traut dir nicht (Beziehung ${s.relation}).` };
  }
  if (s.hostility > ALLIANCE_MAX_HOSTILITY) return { ok: false, reason: `${gang.name} ist zu sauer auf dich.` };
  // Auftrag 34: Der Preis hängt am Gedächtnis der Gang.
  const cost = allianceCost(ctx.state, gangId);
  if (!wallet.pay(ctx, cost, 'dirty', `Bündnis mit ${gangNameIn(gang, 'dative')}`, 'tribute'))
    return notEnoughMoney(cost);
  s.money += cost;
  s.alliance = { againstGangId, until: ctx.now + ALLIANCE_DURATION };
  addRelation(s, 10);
  addHostility(s, -10);
  // Der Feind bekommt das mit.
  addHostility(enemyStatus, 15);
  addRelation(enemyStatus, -10);
  if (isAllied(ctx.state, againstGangId)) breakAgreements(ctx, enemy, enemyStatus, 'Bündnis mit ihren Feinden');
  journal.add(
    ctx,
    `Bündnis mit ${gangNameIn(gang, 'dative')} gegen ${gangNameIn(enemy, 'accusative')}, bis ${clock.format(s.alliance.until)}.`,
    'good',
  );
  ctx.emit('gang.diplomacyChanged', { gangId, kind: 'alliance', active: true });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Gewalt: Überfall auf einen Gang-Spot

/**
 * Wer bei einem Überfall mitgehen darf: aktive Läufer und Sicherheit, die an einem Spot oder Lager stehen oder frei
 * sind. Nicht die Rechte Hand (Büro, Lieferung), Leutnants, Fahrer auf Fahrt oder Spezialisten.
 */
export function canJoinRaid(m: StaffMember, cityId?: string): boolean {
  if (m.status !== 'active' || (m.role !== 'runner' && m.role !== 'security')) return false;
  // Nur wer in der Stadt des Überfalls ist (nicht aus der schlafenden Stadt).
  if (cityId !== undefined && (m.cityId ?? 'koeln') !== cityId) return false;
  const kind = m.assignment?.kind;
  return kind === undefined || kind === 'spot' || kind === 'warehouse';
}

/** Alle, die jetzt bei einem Überfall mitgehen dürften (Liste der Oberfläche, "Alle mitnehmen"), in der Stadt (Standard: die aktive). */
export function raidCrew(state: GameState, cityId: string = activeCity(state)): StaffMember[] {
  return getStaff(state, { status: 'active', cityId }).filter((m) => canJoinRaid(m, cityId));
}

export function attack(
  ctx: Ctx,
  gangId: string,
  veedelId: string,
  staffIds: string[],
  playerPresent: boolean,
): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  if (!raidTargets(ctx.state, gangId).includes(veedelId)) {
    return { ok: false, reason: `${gang.name} hat in ${veedelName(veedelId)} keinen Spot.` };
  }
  // Nur in der Stadt, die live ist (Auftrag 30): Die Gangs der schlafenden Stadt sind eingefroren.
  if (gang.cityId !== activeCity(ctx.state)) return { ok: false, reason: 'Du bist nicht in der Stadt.' };
  if (activeEncounters(ctx.state).length > 0) return { ok: false, reason: 'Erst die laufende Konfrontation klären.' };
  // Nur wer mitgehen darf (Läufer und Sicherheit am Spot, im Lager oder ohne Einsatz): nicht die Rechte Hand, Leutnants
  // oder Fahrer auf einer Fahrt (stirbt oder verletzt sich jemand, wäre dort Lieferung oder Fahrt weg).
  const crew = staffIds.filter((id) => {
    const m = getStaffMember(ctx.state, id);
    return !!m && canJoinRaid(m, veedelCity(veedelId));
  });
  // Selbst mitgehen kannst du nur, wenn du in der Stadt bist (nicht unterwegs zwischen den Städten).
  const present = playerPresent && isPlayerIn(ctx.state, gang.cityId);
  if (crew.length === 0 && !present) {
    return {
      ok: false,
      reason: playerPresent ? 'Du bist gerade nicht in der Stadt.' : 'Du brauchst Leute oder musst selbst mit.',
    };
  }

  // Eine Gang mit leerer (oder, bis Mitternacht, negativer) Kasse hat nichts zu holen: Die Beute ist nie negativ.
  const money = Math.min(RAID_LOOT_MONEY_MAX, Math.max(0, Math.round(s.money * RAID_LOOT_MONEY_SHARE)));
  const goods = Math.min(RAID_LOOT_GOODS_MAX, Math.max(0, Math.round(s.goods * RAID_LOOT_GOODS_SHARE)));
  breakAgreements(ctx, gang, s, 'Überfall');
  addHostility(s, HOSTILITY_ON_PLAYER_ATTACK);
  addRelation(s, RELATION_ON_PLAYER_ATTACK);
  s.lastPlayerAttackAt = ctx.now;
  remember(ctx, gangId, 'spotRaided');
  const count = Math.max(1, Math.min(Math.max(1, s.people), 2 + Math.floor(s.people / 8) + ctx.randomInt(0, 1)));
  const { encounterId } = startEncounter(ctx, {
    kind: 'gangSpotRaid',
    veedelId,
    staffIds: crew,
    playerPresent,
    place: `in ${veedelName(veedelId)}`,
    opponent: { factionId: gang.id, label: gang.crew, strength: gang.traits.fighting, count },
    stakes: { money, goods },
    origin: { module: 'gangs', ref: `attack:${gang.id}` },
  });
  journal.add(ctx, `Du schlägst gegen ${gangNameIn(gang, 'accusative')} in ${veedelName(veedelId)} los.`, 'info', {
    veedelId,
  });
  return { ok: true, data: { encounterId } };
}

// ---------------------------------------------------------------------------------------------
// Ware von einer Gang kaufen (Angebot per Nachricht). Manchmal kippt der Deal.

export function acceptOffer(ctx: Ctx, gangId: string, offerId: number): CommandResult {
  const found = find(ctx, gangId);
  if (!isFound(found)) return found;
  const { gang, s } = found;
  const offer = s.offer;
  if (!offer || offer.id !== offerId || offer.expiresAt <= ctx.now) {
    return { ok: false, reason: 'Das Angebot gilt nicht mehr.' };
  }
  if (!wallet.canAfford(ctx.state, offer.price)) return notEnoughMoney(offer.price);
  if (activeEncounters(ctx.state).length > 0) return { ok: false, reason: 'Erst die laufende Konfrontation klären.' };
  // Die Ware kommt in deine Lager in der Stadt der Gang, und nur, wenn sie ganz hineinpasst (Auftrag 33): Sonst
  // gilt das Angebot weiter, bis du Platz gemacht hast.
  const warehouses = getWarehouses(ctx.state, gang.cityId);
  if (warehouses.length === 0) return { ok: false, reason: `Du hast in ${cityName(gang.cityId)} kein Lager.` };
  const room = warehouses.reduce((sum, w) => sum + fitsInto(ctx.state, w.id, DEFAULT_PRODUCT, offer.amount), 0);
  if (room < offer.amount) {
    return { ok: false, reason: `Kein Platz: In deine Lager passen nur noch ${formatAmount(room)}.` };
  }
  s.offer = null;
  const betrayal = Math.max(0, DEAL_BETRAYAL_BASE + s.hostility / 200 - s.relation / 400);
  if (ctx.chance(betrayal)) {
    startEncounter(ctx, {
      kind: 'dealGoneWrong',
      veedelId: gang.homeVeedelId,
      staffIds: crewFor(ctx.state, { cityId: gang.cityId }),
      askPlayer: true,
      opponent: { factionId: gang.id, label: gang.crew, strength: gang.traits.fighting, count: ctx.randomInt(2, 3) },
      stakes: { money: offer.price, goods: offer.amount },
      effects: {
        success: { ...ENCOUNTER_KINDS.dealGoneWrong.outcomes.success, goodsQuality: gang.traits.goodsQuality },
      },
      situation:
        'Übergabe {place}: {stakeGoods} gegen {stakeMoney}. Irgendwas stimmt nicht, zu viele Leute am Treffpunkt. {opponent} wollen beides.',
      origin: { module: 'gangs', ref: `deal:${gang.id}` },
    });
    return { ok: true };
  }
  wallet.pay(ctx, offer.price, 'dirty', `Ware von ${gangNameIn(gang, 'dative')}`, 'goods.purchase');
  let rest = offer.amount;
  for (const w of warehouses) {
    const amount = fitsInto(ctx.state, w.id, DEFAULT_PRODUCT, rest);
    if (amount <= 0) continue;
    storeFitting(ctx, {
      productId: DEFAULT_PRODUCT,
      amount,
      warehouseId: w.id,
      quality: gang.traits.goodsQuality,
      unitCost: offer.price / offer.amount,
    });
    rest -= amount;
    if (rest <= 0) break;
  }
  s.money += offer.price;
  s.goods = Math.max(0, s.goods - offer.amount);
  addRelation(s, RELATION_ON_DEAL * relationFactor(gang.cityId));
  remember(ctx, gangId, 'deal');
  journal.add(
    ctx,
    `Deal mit ${gangNameIn(gang, 'dative')}: ${formatAmount(offer.amount)} für ${formatEuro(offer.price)}.`,
    'good',
  );
  return { ok: true };
}
