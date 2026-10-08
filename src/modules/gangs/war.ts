// Gang-Kriege (Auftrag 34): Die Gangs einer Stadt stehen zueinander (GANG_RIVALRY in data.ts, laufend in
// GangsState.rivalry). Jeder Vorstoß ins Revier einer anderen Gang verschlechtert das Verhältnis; ist es unter WAR_AT,
// wird aus dem Vorstoß ein Krieg. Dann bittet eine der beiden dich um Hilfe (höchstens alle WAR_MESSAGE_GAP pro
// Stadt): Ware liefern (der Vorstoß wird stärker) oder einen Spot der anderen überfallen. Wer hilft, bekommt eine gute
// Erinnerung bei der einen und eine schlechte bei der anderen Gang.

import { type CommandResult, type Ctx, formatAmount, formatEuro, type GameState, journal, wallet } from '../../core';
import { activeCity } from '../city';
import { activeEncounters } from '../encounters';
import { DEFAULT_PRODUCT, getStock, take } from '../goods';
import { veedelName } from '../veedel';
import { addRelation, commandOption, say, statusOf } from './common';
import {
  RIVALRY_PER_PUSH,
  RIVALRY_RECOVERY,
  WAR_AT,
  WAR_GOODS,
  WAR_MESSAGE_GAP,
  WAR_RAID_CREW,
  WAR_SPOILS_MONEY,
  WAR_SPOILS_PEOPLE,
  WAR_SUPPORT_FACTOR,
} from './config';
import { GANG_RIVALRY, GANGS, type Gang, rivalryKey } from './data';
import { attack, raidCrew } from './diplomacy';
import { memoryScore, remember } from './memory';
import { getGang, isGangBroken, raidTargets } from './state';

export type WarSupport = 'goods' | 'raid';

export interface GangWar {
  id: number;
  cityId: string;
  attacker: string;
  defender: string;
  veedelId: string;
  startedAt: number;
  /** Die Gang, die dich um Hilfe gebeten hat (oder null). */
  asker: string | null;
  /** Deine Hilfe: für wen und wie. */
  support: { side: string; kind: WarSupport } | null;
}

/** Ein beendeter Krieg für die Anzeige. */
export interface GangWarResult {
  attacker: string;
  defender: string;
  veedelId: string;
  winner: string;
  endedAt: number;
  supported: string | null;
}

/** Verhältnis zweier Gangs, -100 bis 100. */
export function rivalry(state: GameState, a: string, b: string): number {
  const key = rivalryKey(a, b);
  return state.modules.gangs?.rivalry?.[key] ?? GANG_RIVALRY[key] ?? 0;
}

/** Laufende Gang-Kriege (in einer Stadt oder alle). */
export function activeWars(state: GameState, cityId?: string): readonly GangWar[] {
  return (state.modules.gangs?.wars ?? []).filter((w) => !cityId || w.cityId === cityId);
}

/** Beendete Kriege, neueste zuerst. */
export function pastWars(state: GameState): readonly GangWarResult[] {
  return state.modules.gangs?.warLog ?? [];
}

function setRivalry(ctx: Ctx, a: string, b: string, value: number): void {
  const g = ctx.state.modules.gangs;
  g.rivalry ??= {};
  g.rivalry[rivalryKey(a, b)] = Math.max(-100, Math.min(100, Math.round(value)));
}

/** Krieg, den eine Gang gerade in einem Veedel führt (als Angreifer). */
export function warOf(state: GameState, attacker: string, veedelId: string): GangWar | undefined {
  return activeWars(state).find((w) => w.attacker === attacker && w.veedelId === veedelId);
}

/** Faktor auf Angriff (attacker) bzw. Verteidigung eines Vorstoßes durch deine Hilfe (1 = keine). */
export function warSupportFactor(
  state: GameState,
  attacker: string,
  veedelId: string,
  side: 'attack' | 'defend',
): number {
  const war = warOf(state, attacker, veedelId);
  if (war?.support?.kind !== 'goods') return 1;
  const helped = war.support.side === war.attacker ? 'attack' : 'defend';
  return helped === side ? WAR_SUPPORT_FACTOR : 1;
}

/** Ein Vorstoß ins Revier einer anderen Gang hat begonnen: Verhältnis schlechter, vielleicht Krieg. */
export function onPushIntoGang(ctx: Ctx, gang: Gang, defenderId: string, veedelId: string): void {
  const defender = getGang(ctx.state, defenderId);
  if (!defender || defender.id === gang.id) return;
  const next = rivalry(ctx.state, gang.id, defender.id) + RIVALRY_PER_PUSH;
  setRivalry(ctx, gang.id, defender.id, next);
  if (next > WAR_AT || warOf(ctx.state, gang.id, veedelId)) return;
  const g = ctx.state.modules.gangs;
  const war: GangWar = {
    id: ctx.nextId(),
    cityId: gang.cityId,
    attacker: gang.id,
    defender: defender.id,
    veedelId,
    startedAt: ctx.now,
    asker: null,
    support: null,
  };
  g.wars ??= [];
  g.wars.push(war);
  g.warCount = (g.warCount ?? 0) + 1;
  journal.add(ctx, `Gang-Krieg: ${gang.name} gegen ${defender.name} in ${veedelName(veedelId)}.`, 'info', { veedelId });
  ctx.emit('gang.warStarted', { warId: war.id, attacker: gang.id, defender: defender.id, veedelId });
  askForHelp(ctx, war);
}

/** Wer von beiden fragt dich: die mit der besseren Meinung von dir, wenn sie nicht gerade gegen dich Krieg führt. */
function askForHelp(ctx: Ctx, war: GangWar): void {
  const g = ctx.state.modules.gangs;
  g.lastWarAskAt ??= {};
  if (ctx.now - (g.lastWarAskAt[war.cityId] ?? -Infinity) < WAR_MESSAGE_GAP) return;
  const score = (id: string) => {
    const s = statusOf(ctx, id);
    return s ? s.relation + memoryScore(ctx.state, id) - s.hostility : -Infinity;
  };
  const sides = [war.attacker, war.defender]
    .filter((id) => {
      const s = statusOf(ctx, id);
      return !!s && s.stage < 3 && !isGangBroken(ctx.state, id);
    })
    .sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  const askerId = sides[0];
  const asker = askerId ? getGang(ctx.state, askerId) : undefined;
  const enemyId = askerId === war.attacker ? war.defender : war.attacker;
  const enemy = getGang(ctx.state, enemyId);
  if (!asker || !enemy) return;
  const options = warOptions(ctx.state, war, asker, enemy);
  if (options.length <= 1) return;
  war.asker = asker.id;
  g.lastWarAskAt[war.cityId] = ctx.now;
  say(ctx, asker, 'warAsk', { enemy: enemy.name, veedel: veedelName(war.veedelId) }, options, 12 * 60);
}

function warOptions(state: GameState, war: GangWar, asker: Gang, enemy: Gang) {
  const options = [];
  const price = Math.round(WAR_GOODS * asker.traits.goodsCost);
  if (getStock(state, { productId: DEFAULT_PRODUCT, cityId: war.cityId }) >= WAR_GOODS) {
    options.push(
      commandOption(
        'goods',
        `Ware liefern (${formatAmount(WAR_GOODS)} für ${formatEuro(price)})`,
        { type: 'gangs.supportWar', payload: { warId: war.id, kind: 'goods' } },
        `Ich schick euch was. Gegen ${enemy.name} gern.`,
      ),
    );
  }
  if (raidCrew(state, war.cityId).length > 0 && raidTargets(state, enemy.id).length > 0) {
    options.push(
      commandOption(
        'raid',
        `Spot von ${enemy.name} überfallen`,
        { type: 'gangs.supportWar', payload: { warId: war.id, kind: 'raid' } },
        `Meine Leute kümmern sich um ${enemy.name}.`,
      ),
    );
  }
  options.push({ id: 'stay', label: 'Raushalten', reply: 'Macht das unter euch aus.' });
  return options;
}

/** Befehl 'gangs.supportWar': Partei ergreifen (Ware liefern oder einen Spot der anderen überfallen). */
export function supportWar(ctx: Ctx, warId: number, kind: WarSupport): CommandResult {
  const war = activeWars(ctx.state).find((w) => w.id === warId);
  if (!war) return { ok: false, reason: 'Der Krieg ist schon vorbei.' };
  if (war.support) return { ok: false, reason: 'Du hast schon geholfen.' };
  const sideId = war.asker ?? war.attacker;
  const side = getGang(ctx.state, sideId);
  const enemyId = sideId === war.attacker ? war.defender : war.attacker;
  const enemy = getGang(ctx.state, enemyId);
  const s = statusOf(ctx, sideId);
  if (!side || !enemy || !s) return { ok: false, reason: 'Diese Gang gibt es nicht.' };
  if (war.cityId !== activeCity(ctx.state)) return { ok: false, reason: 'Du bist nicht in der Stadt.' };
  if (kind === 'goods') {
    const taken = take(ctx, { productId: DEFAULT_PRODUCT, amount: WAR_GOODS }).taken;
    if (taken < WAR_GOODS) return { ok: false, reason: `Nicht genug Ware (${formatAmount(WAR_GOODS)}).` };
    // Bezahlt wird zum Einkaufspreis der Gang: kein großes Geschäft, aber ein Freund. Mehr, als in ihrer Kasse ist,
    // kann sie nicht zahlen.
    const price = Math.min(Math.round(taken * side.traits.goodsCost), Math.max(0, s.money));
    s.goods += taken;
    s.money -= price;
    if (price > 0) wallet.earn(ctx, price, 'dirty', `Ware an ${side.name}`, 'sales.wholesale');
    journal.add(
      ctx,
      `Ware an ${side.name} gegen ${enemy.name}: ${formatAmount(taken)} für ${formatEuro(price)}.`,
      'info',
    );
  } else {
    if (activeEncounters(ctx.state).length > 0) return { ok: false, reason: 'Erst die laufende Konfrontation klären.' };
    const targets = raidTargets(ctx.state, enemy.id);
    const veedelId = targets.includes(war.veedelId) ? war.veedelId : targets[0];
    if (!veedelId) return { ok: false, reason: `${enemy.name} hat keinen Spot, den du überfallen kannst.` };
    const crew = [...raidCrew(ctx.state, war.cityId)]
      .sort((a, b) => b.stats.strength - a.stats.strength || a.id.localeCompare(b.id))
      .slice(0, WAR_RAID_CREW)
      .map((m) => m.id);
    const result = attack(ctx, enemy.id, veedelId, crew, false);
    if (!result.ok) return result;
  }
  war.support = { side: sideId, kind };
  addRelation(s, 10);
  remember(ctx, sideId, 'warHelp');
  remember(ctx, enemyId, 'warAgainst');
  ctx.emit('gang.warSupported', { warId, gangId: sideId, kind });
  return { ok: true };
}

/** Der Vorstoß ist vorbei: Ist es ein Krieg, ist er entschieden. */
export function endWar(ctx: Ctx, attacker: string, veedelId: string, success: boolean): void {
  const g = ctx.state.modules.gangs;
  const war = warOf(ctx.state, attacker, veedelId);
  if (!war) return;
  g.wars = (g.wars ?? []).filter((w) => w.id !== war.id);
  const winner = success ? war.attacker : war.defender;
  const loser = success ? war.defender : war.attacker;
  // Die Siegerin schluckt Leute und Geld der Verliererin.
  const ws = statusOf(ctx, winner);
  const ls = statusOf(ctx, loser);
  if (ws && ls) {
    const people = Math.min(WAR_SPOILS_PEOPLE, Math.max(0, ls.people));
    const money = Math.round(Math.max(0, ls.money) * WAR_SPOILS_MONEY);
    ls.people -= people;
    ws.people += people;
    ls.money -= money;
    ws.money += money;
  }
  const a = getGang(ctx.state, war.attacker);
  const d = getGang(ctx.state, war.defender);
  g.warLog ??= [];
  g.warLog.unshift({
    attacker: war.attacker,
    defender: war.defender,
    veedelId,
    winner,
    endedAt: ctx.now,
    supported: war.support?.side ?? null,
  });
  if (g.warLog.length > 6) g.warLog.length = 6;
  if (a && d) {
    const text = success
      ? `Gang-Krieg vorbei: ${a.name} hat ${d.name} aus ${veedelName(veedelId)} vertrieben.`
      : `Gang-Krieg vorbei: ${d.name} hat ${veedelName(veedelId)} gegen ${a.name} gehalten.`;
    const helped = war.support?.side;
    journal.add(ctx, text, helped ? (helped === winner ? 'good' : 'bad') : 'info', { veedelId });
  }
  ctx.emit('gang.warEnded', { warId: war.id, attacker: war.attacker, defender: war.defender, veedelId, winner });
}

/** Um Mitternacht: Verhältnisse erholen sich langsam Richtung Startwert. */
export function recoverRivalries(ctx: Ctx): void {
  const g = ctx.state.modules.gangs;
  if (!g.rivalry) return;
  for (const key of Object.keys(g.rivalry).sort()) {
    const base = GANG_RIVALRY[key] ?? 0;
    const value = g.rivalry[key];
    const next = value < base ? Math.min(base, value + RIVALRY_RECOVERY) : Math.max(base, value - RIVALRY_RECOVERY);
    if (next === base) delete g.rivalry[key];
    else g.rivalry[key] = next;
  }
}

/** Alle Paare von Gangs einer Stadt mit ihrem Verhältnis (für die Anzeige). */
export function rivalries(state: GameState, cityId: string): { a: Gang; b: Gang; value: number }[] {
  const gangs = GANGS.filter((x) => x.cityId === cityId);
  const list: { a: Gang; b: Gang; value: number }[] = [];
  for (let i = 0; i < gangs.length; i++) {
    for (let j = i + 1; j < gangs.length; j++)
      list.push({ a: gangs[i], b: gangs[j], value: rivalry(state, gangs[i].id, gangs[j].id) });
  }
  return list.sort((x, y) => x.value - y.value);
}
