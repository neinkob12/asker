// Gang-KI, tickt stündlich. Pro Gang in fester Reihenfolge: Abkommen pflegen, wirtschaften, auf deine Verkäufe
// reagieren, Veedel verteidigen, expandieren, drohen und überfallen, Ware anbieten. Danach die Preise setzen.
// Alles deterministisch über ctx.random().

import { type Ctx, clock, formatAmount, formatEuro, journal, wallet } from '../../core';
import { activeCity, liveVeedel } from '../city';
import { activeEncounters, startEncounter } from '../encounters';
import { DEFAULT_PRODUCT, getStock, getWarehouses } from '../goods';
import { referencePrice, setCompetitionFactor } from '../market';
import { getSpot, getSpots } from '../spots';
import { defenseStrength, getStaff, getStaffMember } from '../staff';
import {
  addInfluence,
  controlledBy,
  controllerOf,
  getInfluence,
  hasPlayerPresence,
  influenceIn,
  PLAYER_FACTION,
} from '../territory';
import { allVeedel, getVeedel, neighborsOf, veedelAt, veedelName } from '../veedel';
import { addHostility, commandOption, crewFor, demandOptions, focusVeedel, say, statusOf } from './common';
import {
  ALLIANCE_COST,
  ALLIANCE_MAX_HOSTILITY,
  ALLIANCE_PUSH_FACTOR,
  ANNOUNCE_INTERVAL,
  ATTACK_AT,
  ATTACK_CHANCE,
  ATTACK_COOLDOWN,
  BASE_PEOPLE,
  DEFEND_COST,
  DEFEND_RATE,
  DEFEND_TARGET,
  DEFEND_THREAT,
  DEFENDER_BASE,
  DEFENDER_COMMIT,
  EXPAND_CHANCE,
  HOME_CLAIM_BONUS,
  HOME_DEFENSE_BONUS,
  HOME_PUSH_CHANCE_FACTOR,
  HOME_PUSH_MIN_PEOPLE,
  HOME_PUSH_STRENGTH,
  HOME_TARGET_PENALTY,
  HOSTILITY_DECAY,
  HOSTILITY_PER_UNIT,
  LAST_STAND_BONUS,
  MIN_SALES_SHARE,
  OFFER_AMOUNTS,
  OFFER_CHANCE,
  OFFER_DURATION,
  OFFER_MARKUP,
  PEOPLE_PER_VEEDEL,
  PLAYER_DEFENSE_BASE,
  PLAYER_DEFENSE_FACTOR,
  PLAYER_THREAT_EXPANSION,
  PLAYER_THREAT_TARGET_BONUS,
  PRICE_WAR_EXTRA,
  PRICE_WAR_HOSTILITY,
  PROTECTION_INTERVAL,
  PROTECTION_KEEP_RATIO,
  PUSH_CASUALTY_CHANCE,
  PUSH_COST,
  PUSH_DEFENDER_GAIN,
  PUSH_DEFENDER_LOSS,
  PUSH_DURATION,
  PUSH_GAIN,
  PUSH_MIN_PEOPLE,
  RECRUIT_COST,
  RECRUITS_PER_DAY,
  RESTOCK_BELOW_HOURS,
  RESTOCK_HOURS,
  SALES_PER_VEEDEL_HOUR,
  SALES_SATURATION,
  SATURATION_VEEDEL,
  SMALL_FISH_UNITS,
  STAGE_HYSTERESIS,
  STRONGER_TARGET_PENALTY,
  THREAT_AT,
  TURF_SALES_DECAY,
  WAGE_PER_PERSON_DAY,
  WAREHOUSE_RAID_CHANCE,
  WARN_AT,
} from './config';
import { GANGS, type Gang } from './data';
import {
  type GangStage,
  type GangStatus,
  gangPower,
  gangVeedel,
  getGang,
  isAllied,
  isAtPeace,
  isGangBroken,
  paysTribute,
  peaceFactor,
  playerPower,
  stageFor,
  tributeAmount,
  veedelGang,
} from './state';

const STAGE_THRESHOLD: Record<GangStage, number> = { 0: 0, 1: WARN_AT, 2: THREAT_AT, 3: ATTACK_AT };

/** Chance pro Stunde und Gang, dass ein Verbündeter dem gemeinsamen Feind schadet. */
const ALLY_STRIKE_CHANCE = 0.04;
/** Chance pro Tag, dass eine Gang dir ein Bündnis anbietet (wenn die Beziehung stimmt). */
const ALLIANCE_OFFER_CHANCE = 0.15;
const ALLIANCE_OFFER_MIN_RELATION = 10;

export function gangsTick(ctx: Ctx): void {
  const newDay = clock.hour(ctx.now) === 0;
  // Nur die Gangs der Stadt, die live ist (Auftrag 30): Die schlafende Stadt ist eingefroren.
  const city = activeCity(ctx.state);
  for (const gang of GANGS) {
    if (gang.cityId !== city) continue;
    const s = statusOf(ctx, gang.id);
    if (!s) continue;
    upkeepAgreements(ctx, gang, s);
    economy(ctx, gang, s, newDay);
    updateHostility(ctx, gang, s);
    defend(ctx, gang, s);
    expand(ctx, gang, s);
    allyStrike(ctx, gang, s);
    reactToPlayer(ctx, gang, s);
    maybeOffer(ctx, gang, s, newDay);
  }
  applyPrices(ctx);
}

// ---------------------------------------------------------------------------------------------
// Abkommen

function upkeepAgreements(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const now = ctx.now;
  if (s.ceasefireUntil !== null && s.ceasefireUntil <= now) {
    s.ceasefireUntil = null;
    journal.add(ctx, `Der Waffenstillstand mit ${gang.name} ist abgelaufen.`, 'info');
    ctx.emit('gang.diplomacyChanged', { gangId: gang.id, kind: 'ceasefire', active: false });
  }
  if (s.tribute && s.tribute.until <= now) {
    s.tribute = null;
    ctx.emit('gang.diplomacyChanged', { gangId: gang.id, kind: 'tribute', active: false });
    // Erst die Optionen: Sie legen den Preis fest, den der Text nennt.
    const options = demandOptions(ctx, gang, s);
    say(ctx, gang, 'tributeDue', { tribute: formatEuro(tributeAmount(ctx.state, gang.id)) }, options);
  }
  if (s.alliance && s.alliance.until <= now) {
    const enemy = getGang(ctx.state, s.alliance.againstGangId);
    s.alliance = null;
    journal.add(ctx, `Das Bündnis mit ${gang.name}${enemy ? ` gegen ${enemy.name}` : ''} ist ausgelaufen.`, 'info');
    ctx.emit('gang.diplomacyChanged', { gangId: gang.id, kind: 'alliance', active: false });
  }
  if (s.protection && s.protection.nextDueAt <= now) collectProtection(ctx, gang, s);
  if (s.offer && s.offer.expiresAt <= now) s.offer = null;
  if (s.quote && s.quote.until <= now) s.quote = null;
}

/** Wöchentliches Schutzgeld, das die Gang dir zahlt. Bist du zu schwach geworden, verweigert sie. */
function collectProtection(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const protection = s.protection;
  if (!protection) return;
  // Eine zerschlagene Gang zahlt nicht mehr und fragt nicht endlos nach: Die Abmachung endet.
  if (isGangBroken(ctx.state, gang.id)) {
    s.protection = null;
    journal.add(ctx, `${gang.name} ist zerschlagen: Das Schutzgeld von dort ist Geschichte.`, 'info');
    ctx.emit('gang.diplomacyChanged', { gangId: gang.id, kind: 'protection', active: false });
    return;
  }
  protection.nextDueAt += PROTECTION_INTERVAL;
  const amount = protection.amount;
  const stillStrong = playerPower(ctx.state) >= gangPower(ctx.state, gang.id) * PROTECTION_KEEP_RATIO;
  if (stillStrong && s.money >= amount) {
    s.money -= amount;
    wallet.earn(ctx, amount, 'dirty', `Schutzgeld von ${gang.name}`, 'income.other');
    protection.overdue = false;
    journal.add(ctx, `${gang.name} zahlt dir ${formatEuro(amount)} Schutzgeld.`, 'good');
    return;
  }
  protection.overdue = true;
  say(ctx, gang, 'protectionRefused', {}, [
    commandOption(
      'collect',
      `Eintreiben (${formatEuro(amount)})`,
      { type: 'gangs.collect', payload: { gangId: gang.id } },
      'Ich komme vorbei.',
    ),
    commandOption(
      'release',
      'Laufen lassen',
      { type: 'gangs.releaseProtection', payload: { gangId: gang.id } },
      'Behaltet euer Geld.',
    ),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Wirtschaft: verkaufen, Löhne, nachkaufen, anwerben

function economy(ctx: Ctx, gang: Gang, s: GangStatus, newDay: boolean): void {
  const turf = gangVeedel(ctx.state, gang.id);
  const demand = turf.length * SALES_PER_VEEDEL_HOUR;
  if (demand > 0) {
    const share = Math.max(MIN_SALES_SHARE, 1 - s.turfSales / SALES_SATURATION);
    const sold = Math.min(s.goods, Math.round(demand * share));
    const price = turf.reduce((sum, v) => sum + referencePrice(ctx.state, DEFAULT_PRODUCT, v), 0) / turf.length;
    s.goods -= sold;
    s.money += Math.round(sold * price);
  }
  s.money -= Math.round((s.people * WAGE_PER_PERSON_DAY) / 24);
  // Schutzgeld an dich legt sie zurück, bevor sie Ware nachkauft.
  const spendable = s.money - (s.protection?.amount ?? 0);
  if (demand > 0 && s.goods < demand * RESTOCK_BELOW_HOURS && spendable > 0) {
    const buy = Math.min(demand * RESTOCK_HOURS, Math.floor(spendable / gang.traits.goodsCost));
    s.goods += buy;
    s.money -= Math.round(buy * gang.traits.goodsCost);
  }
  if (!newDay) return;
  if (s.money < 0) {
    // Kein Geld für Löhne: Einer geht.
    s.people = Math.max(0, s.people - 1);
    s.money = 0;
    return;
  }
  const maxPeople = BASE_PEOPLE + PEOPLE_PER_VEEDEL * Math.max(1, turf.length);
  for (let i = 0; i < RECRUITS_PER_DAY; i++) {
    if (s.people >= maxPeople || s.money < RECRUIT_COST * 2) break;
    s.people += 1;
    s.money -= RECRUIT_COST;
  }
}

// ---------------------------------------------------------------------------------------------
// Feindseligkeit: kleiner Fisch wird ignoriert, wer viel in ihrem Revier verkauft, nicht

function updateHostility(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const notice = Math.max(0, s.turfSales - SMALL_FISH_UNITS);
  if (notice > 0) {
    addHostility(s, notice * HOSTILITY_PER_UNIT * gang.traits.aggression * peaceFactor(ctx.state, gang.id));
  } else {
    addHostility(s, -HOSTILITY_DECAY);
  }
  s.turfSales = Math.round(s.turfSales * TURF_SALES_DECAY * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// Reviere

/** Veedel verteidigen, in denen ein Rivale (du oder eine andere Gang) Fuß fasst. Die Grundregeneration macht territory. */
function defend(ctx: Ctx, gang: Gang, s: GangStatus): void {
  for (const veedelId of gangVeedel(ctx.state, gang.id)) {
    if (s.money < DEFEND_COST) return;
    if (getInfluence(ctx.state, veedelId, gang.id) >= DEFEND_TARGET) continue;
    const rivals = Object.entries(influenceIn(ctx.state, veedelId)).filter(([faction]) => faction !== gang.id);
    if (!rivals.some(([, value]) => value >= DEFEND_THREAT)) continue;
    addInfluence(ctx, veedelId, gang.id, DEFEND_RATE);
    s.money -= DEFEND_COST;
  }
}

function expand(ctx: Ctx, gang: Gang, s: GangStatus): void {
  if (s.push) {
    continuePush(ctx, gang, s);
    return;
  }
  const turfSize = gangVeedel(ctx.state, gang.id).length;
  const homeless = turfSize === 0;
  if (s.people < (homeless ? HOME_PUSH_MIN_PEOPLE : PUSH_MIN_PEOPLE) || s.money < PUSH_COST * 2) return;
  let factor = isAllied(ctx.state, gang.id) ? ALLIANCE_PUSH_FACTOR : 1;
  factor *= homeless ? HOME_PUSH_CHANCE_FACTOR : Math.min(1, SATURATION_VEEDEL / turfSize);
  // Ein starker Spieler wird zum gemeinsamen Feind.
  if (!isAtPeace(ctx.state, gang.id))
    factor *= 1 + PLAYER_THREAT_EXPANSION * controlledBy(ctx.state, PLAYER_FACTION).length;
  if (!ctx.chance(EXPAND_CHANCE * gang.traits.expansion * factor)) return;
  const target = pickTarget(ctx, gang, s);
  if (!target) return;
  s.push = { veedelId: target, startedAt: ctx.now, until: ctx.now + PUSH_DURATION };
  s.money -= PUSH_COST;
  const against = controllerOf(ctx.state, target);
  const againstGang = against ? getGang(ctx.state, against) : undefined;
  const text =
    against === PLAYER_FACTION
      ? `${gang.name} drängt nach ${veedelName(target)}, in dein Revier.`
      : againstGang
        ? `${gang.name} drängt nach ${veedelName(target)}, ins Revier von ${againstGang.name}.`
        : `${gang.name} drängt nach ${veedelName(target)}.`;
  journal.add(ctx, text, against === PLAYER_FACTION ? 'bad' : 'info', { veedelId: target });
  ctx.emit('gang.pushStarted', { gangId: gang.id, veedelId: target, against });
}

/** Ziel für einen Vorstoß: angrenzende oder herrenlose Veedel, bevorzugt schwach gehaltene. */
function pickTarget(ctx: Ctx, gang: Gang, s: GangStatus): string | null {
  const state = ctx.state;
  const own = new Set(gangVeedel(state, gang.id));
  const candidates = new Set<string>();
  if (own.size === 0) return gang.homeVeedelId;
  for (const v of own) for (const n of neighborsOf(v)) if (!own.has(n)) candidates.add(n);
  for (const v of allVeedel(gang.cityId))
    if (!own.has(v.id) && controllerOf(state, v.id) === null) candidates.add(v.id);
  const myPower = gangPower(state, gang.id);
  const enemy = isAllied(state, gang.id) ? s.alliance?.againstGangId : undefined;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const v of candidates) {
    const controller = controllerOf(state, v);
    if (controller === PLAYER_FACTION && isAtPeace(state, gang.id)) continue;
    const holder = controller ?? veedelGang(state, v);
    let score = 100 - (holder ? getInfluence(state, v, holder) : 0) + ctx.random() * 10;
    if (controller === null) score += 20;
    if (v === gang.homeVeedelId || neighborsOf(gang.homeVeedelId).includes(v)) score += HOME_CLAIM_BONUS;
    if (holder && holder !== PLAYER_FACTION && getGang(state, holder)?.homeVeedelId === v) score -= HOME_TARGET_PENALTY;
    if (enemy && controller === enemy) score += 40;
    if (controller === PLAYER_FACTION && s.hostility >= THREAT_AT) score += 25;
    if (controller === PLAYER_FACTION) score += PLAYER_THREAT_TARGET_BONUS * controlledBy(state, PLAYER_FACTION).length;
    if (holder && holder !== PLAYER_FACTION && gangPower(state, holder) > myPower) score -= STRONGER_TARGET_PENALTY;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

/** Stärke, mit der der Spieler ein eigenes Veedel verteidigt: ein Grundstock plus die Kampfkraft seiner Leute dort. */
function playerDefense(ctx: Ctx, veedelId: string): number {
  return (PLAYER_DEFENSE_BASE + defenseStrength(ctx.state, { veedelId })) * PLAYER_DEFENSE_FACTOR;
}

function continuePush(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const push = s.push;
  if (!push) return;
  const veedelId = push.veedelId;
  const controller = controllerOf(ctx.state, veedelId);
  const end = (success: boolean) => {
    s.push = null;
    journal.add(
      ctx,
      success
        ? `${gang.name} hat ${veedelName(veedelId)} übernommen.`
        : `${gang.name} zieht sich aus ${veedelName(veedelId)} zurück.`,
      success && controller === PLAYER_FACTION ? 'bad' : 'info',
      { veedelId },
    );
    ctx.emit('gang.pushEnded', { gangId: gang.id, veedelId, success });
  };
  if (controller === gang.id) {
    end(true);
    return;
  }
  const giveUp =
    ctx.now >= push.until ||
    s.people < HOME_PUSH_MIN_PEOPLE ||
    (controller === PLAYER_FACTION && isAtPeace(ctx.state, gang.id));
  if (giveUp) {
    end(false);
    return;
  }

  const squad = Math.min(s.people, 4 + Math.floor(s.people / 4));
  const homeFight = veedelId === gang.homeVeedelId && gangVeedel(ctx.state, gang.id).length === 0;
  const attack = squad * gang.traits.fighting * (homeFight ? HOME_PUSH_STRENGTH : 1) * (0.5 + ctx.random());
  let defense = 0;
  const defenderGang = controller && controller !== PLAYER_FACTION ? getGang(ctx.state, controller) : undefined;
  const defender = defenderGang ? statusOf(ctx, defenderGang.id) : undefined;
  if (controller === PLAYER_FACTION) {
    defense = playerDefense(ctx, veedelId) * (0.5 + ctx.random());
  } else if (defenderGang && defender) {
    const lastStand = gangVeedel(ctx.state, defenderGang.id).length <= 1 ? LAST_STAND_BONUS : 1;
    const home = veedelId === defenderGang.homeVeedelId ? HOME_DEFENSE_BONUS : 1;
    const local = defender.people * DEFENDER_COMMIT * Math.max(lastStand, home) + DEFENDER_BASE;
    defense = local * defenderGang.traits.fighting * (0.5 + ctx.random());
  }
  if (attack > defense) {
    addInfluence(ctx, veedelId, gang.id, PUSH_GAIN);
    if (controller) addInfluence(ctx, veedelId, controller, -PUSH_DEFENDER_LOSS);
    if (defender && ctx.chance(PUSH_CASUALTY_CHANCE)) defender.people = Math.max(0, defender.people - 1);
  } else {
    // Der Verteidiger festigt seinen Griff, höchstens bis zum Startwert des Veedels (wie die Regeneration in territory).
    const cap = getVeedel(veedelId)?.startInfluence ?? DEFEND_TARGET;
    if (controller && getInfluence(ctx.state, veedelId, controller) < cap) {
      addInfluence(
        ctx,
        veedelId,
        controller,
        Math.min(PUSH_DEFENDER_GAIN, cap - getInfluence(ctx.state, veedelId, controller)),
      );
    }
    if (ctx.chance(PUSH_CASUALTY_CHANCE)) s.people = Math.max(0, s.people - 1);
  }
  if (controllerOf(ctx.state, veedelId) === gang.id) end(true);
}

/** Ein Verbündeter schadet dem gemeinsamen Feind (Laden zerlegt, Leute verprügelt). */
function allyStrike(ctx: Ctx, gang: Gang, s: GangStatus): void {
  if (!isAllied(ctx.state, gang.id) || !s.alliance) return;
  const enemy = getGang(ctx.state, s.alliance.againstGangId);
  const target = enemy ? statusOf(ctx, enemy.id) : undefined;
  if (!enemy || !target || target.people <= 0 || !ctx.chance(ALLY_STRIKE_CHANCE)) return;
  target.people -= 1;
  target.goods = Math.round(target.goods * 0.95);
  journal.add(ctx, `${gang.name} hat einen Laden von ${enemy.name} zerlegt. Dein Bündnis wirkt.`, 'good');
}

// ---------------------------------------------------------------------------------------------
// Reaktion auf den Spieler: warnen, drohen, überfallen

function reactToPlayer(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const target = stageFor(s.hostility);
  if (target > s.stage) {
    s.stage = target;
    escalate(ctx, gang, s);
  } else if (s.stage > 0 && s.hostility < STAGE_THRESHOLD[s.stage] - STAGE_HYSTERESIS) {
    s.stage = (s.stage - 1) as GangStage;
  }
  if (s.stage < 3 || isAtPeace(ctx.state, gang.id) || s.people < 2) return;
  if (activeEncounters(ctx.state).length > 0) return;
  if (s.lastAttackAt !== null && ctx.now - s.lastAttackAt < ATTACK_COOLDOWN) return;
  const chance = ATTACK_CHANCE * gang.traits.aggression * Math.min(1, (s.hostility - 60) / 40);
  if (ctx.chance(chance)) launchRaid(ctx, gang, s);
}

function escalate(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const veedel = focusVeedel(ctx.state, gang, s);
  ctx.emit('gang.escalated', { gangId: gang.id, stage: s.stage });
  // Dieselbe Stufe nur einmal am Tag ankündigen (z.B. wenn sie nach einem Überfall kurz sinkt und wieder steigt).
  if (s.announced && s.announced.stage >= s.stage && ctx.now - s.announced.at < ANNOUNCE_INTERVAL) return;
  s.announced = { stage: s.stage, at: ctx.now };
  if (s.stage === 1) {
    journal.add(ctx, `${gang.name} ist auf dich aufmerksam geworden.`, 'info');
    say(ctx, gang, 'warning', { veedel });
  } else if (s.stage === 2) {
    journal.add(ctx, `${gang.name} droht dir.`, 'bad');
    const options = demandOptions(ctx, gang, s);
    say(ctx, gang, 'threat', { veedel, tribute: formatEuro(tributeAmount(ctx.state, gang.id)) }, options);
  } else if (s.stage === 3) {
    journal.add(ctx, `${gang.name} hat genug von dir. Rechne mit Überfällen.`, 'bad');
    say(ctx, gang, 'war', { veedel }, demandOptions(ctx, gang, s));
  }
}

type RaidTarget =
  | { kind: 'spot'; spotId: string; veedelId: string; staffIds: string[] }
  /** Jemand auf Auftragsfahrt (seit Auftrag 28 nur die Rechte Hand). */
  | { kind: 'courier'; staffId: string; veedelId: string }
  | { kind: 'warehouse'; warehouseId: string; name: string; veedelId: string; staffIds: string[] };

function pickRaidTarget(ctx: Ctx, gang: Gang, s: GangStatus): RaidTarget | null {
  const state = ctx.state;
  const turf = new Set(gangVeedel(state, gang.id));
  const staffed = getSpots(state, gang.cityId).filter(
    (spot) => turf.has(spot.veedelId) && getStaff(state, { spotId: spot.id, status: 'active' }).length > 0,
  );
  const couriers = getStaff(state, { status: 'active', cityId: gang.cityId }).filter(
    (m) => m.assignment?.kind === 'delivery',
  );
  const warehouses = getWarehouses(state, gang.cityId).filter(() => getStock(state, { cityId: gang.cityId }) > 0);
  const turfList = [...turf];
  const raidWarehouse = warehouses.length > 0 && ctx.chance(WAREHOUSE_RAID_CHANCE);
  if (staffed.length > 0 && !raidWarehouse) {
    const spot = ctx.pick(staffed);
    return { kind: 'spot', spotId: spot.id, veedelId: spot.veedelId, staffIds: crewFor(state, { spotId: spot.id }) };
  }
  if (couriers.length > 0 && turfList.length > 0 && !raidWarehouse) {
    return { kind: 'courier', staffId: ctx.pick(couriers).id, veedelId: ctx.pick(turfList) };
  }
  if (warehouses.length > 0) {
    const w = ctx.pick(warehouses);
    return {
      kind: 'warehouse',
      warehouseId: w.id,
      name: w.name,
      veedelId: veedelAt(w.lng, w.lat)?.id ?? gang.homeVeedelId,
      staffIds: crewFor(state, { warehouseId: w.id }),
    };
  }
  const lastSpot = s.lastSaleSpotId ? getSpot(state, s.lastSaleSpotId) : undefined;
  if (lastSpot) {
    return {
      kind: 'spot',
      spotId: lastSpot.id,
      veedelId: lastSpot.veedelId,
      staffIds: crewFor(state, { spotId: lastSpot.id }),
    };
  }
  return null;
}

function launchRaid(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const target = pickRaidTarget(ctx, gang, s);
  if (!target) return;
  s.lastAttackAt = ctx.now;
  const count = Math.max(1, Math.min(s.people, ctx.randomInt(2, 3) + (s.hostility >= 90 ? 1 : 0)));
  const opponent = { factionId: gang.id, label: gang.crew, strength: gang.traits.fighting, count };
  const origin = { module: 'gangs', ref: `raid:${gang.id}` };
  let encounterId: number;
  if (target.kind === 'spot') {
    journal.add(
      ctx,
      `${gang.name} überfällt deinen Spot am ${getSpot(ctx.state, target.spotId)?.name ?? target.spotId}!`,
      'bad',
      {
        spotId: target.spotId,
      },
    );
    encounterId = startEncounter(ctx, {
      kind: 'raidDefense',
      spotId: target.spotId,
      veedelId: target.veedelId,
      staffIds: target.staffIds,
      askPlayer: true,
      opponent,
      origin,
    }).encounterId;
  } else if (target.kind === 'courier') {
    const driver = getStaffMember(ctx.state, target.staffId)?.name ?? 'deiner Rechten Hand';
    journal.add(
      ctx,
      `${gang.name} lauert ${driver} auf der Auftragsfahrt in ${veedelName(target.veedelId)} auf!`,
      'bad',
      { staffId: target.staffId },
    );
    encounterId = startEncounter(ctx, {
      kind: 'raidDefense',
      veedelId: target.veedelId,
      staffIds: [target.staffId],
      playerPresent: false,
      place: `in ${veedelName(target.veedelId)}`,
      situation: `{opponent} stoppen ${driver} auf der Auftragsfahrt {place}. Zwei Autos, kein Fluchtweg. Sie wollen die Ware.`,
      opponent,
      origin,
      effects: {
        failure: {
          goods: [-20, -8],
          influence: -2,
          opponentInfluence: 2,
          reputation: -2,
          text: 'Auftragsfahrt {place} ausgeraubt.',
        },
        retreat: { goods: [-8, -3], text: `${driver} ist {place} entkommen, ein Teil der Ware nicht.` },
      },
    }).encounterId;
  } else {
    journal.add(ctx, `${gang.name} greift dein ${target.name} an!`, 'bad', { veedelId: target.veedelId });
    encounterId = startEncounter(ctx, {
      kind: 'raidDefense',
      veedelId: target.veedelId,
      staffIds: target.staffIds,
      askPlayer: true,
      place: `am ${target.name}`,
      situation: '{opponent} brechen {place} das Rolltor auf. Drinnen liegt dein Vorrat.',
      opponent,
      origin,
      effects: {
        failure: {
          goodsShare: -0.35,
          moneyShare: -0.1,
          moneyShareMax: 1500,
          influence: -2,
          opponentInfluence: 2,
          reputation: -3,
          text: '{opponent} haben dein Lager ausgeräumt.',
        },
        retreat: { goodsShare: -0.15, text: 'Rückzug aus dem Lager. Sie haben mitgenommen, was sie tragen konnten.' },
      },
    }).encounterId;
  }
  ctx.emit('gang.raidStarted', { gangId: gang.id, encounterId, target: target.kind });
}

// ---------------------------------------------------------------------------------------------
// Angebote: Ware und Bündnisse

function maybeOffer(ctx: Ctx, gang: Gang, s: GangStatus, newDay: boolean): void {
  if (newDay) maybeOfferAlliance(ctx, gang, s);
  if (s.offer || gang.traits.dealing <= 0) return;
  if (s.hostility >= 40 || s.relation < -20 || s.goods < 300) return;
  if (!ctx.chance(OFFER_CHANCE * gang.traits.dealing)) return;
  const amount = ctx.pick(OFFER_AMOUNTS);
  const price = Math.round((amount * gang.traits.goodsCost * OFFER_MARKUP * (1 - s.relation / 500)) / 10) * 10;
  const offerId = ctx.nextId();
  s.offer = { id: offerId, amount, price, expiresAt: ctx.now + OFFER_DURATION };
  say(
    ctx,
    gang,
    'offer',
    { amount: formatAmount(amount), price: formatEuro(price), veedel: veedelName(gang.homeVeedelId) },
    [
      commandOption(
        'accept',
        `Deal (${formatEuro(price)})`,
        { type: 'gangs.acceptOffer', payload: { gangId: gang.id, offerId } },
        'Abgemacht. Bin unterwegs.',
      ),
      { id: 'decline', label: 'Kein Interesse' },
    ],
    OFFER_DURATION,
  );
}

function maybeOfferAlliance(ctx: Ctx, gang: Gang, s: GangStatus): void {
  if (s.alliance || s.relation < ALLIANCE_OFFER_MIN_RELATION || s.hostility >= ALLIANCE_MAX_HOSTILITY) return;
  if (!ctx.chance(ALLIANCE_OFFER_CHANCE)) return;
  // Feind: die stärkste Gang, mit der sie sich eine Grenze teilt.
  const own = new Set(gangVeedel(ctx.state, gang.id));
  let enemy: Gang | undefined;
  for (const v of own) {
    for (const n of neighborsOf(v)) {
      const c = veedelGang(ctx.state, n);
      const g = c && c !== gang.id ? getGang(ctx.state, c) : undefined;
      if (g && (!enemy || gangPower(ctx.state, g.id) > gangPower(ctx.state, enemy.id))) enemy = g;
    }
  }
  if (!enemy) return;
  say(ctx, gang, 'allianceOffer', { enemy: enemy.name, price: formatEuro(ALLIANCE_COST) }, [
    commandOption(
      'ally',
      `Bündnis (${formatEuro(ALLIANCE_COST)})`,
      { type: 'gangs.ally', payload: { gangId: gang.id, againstGangId: enemy.id } },
      'Ich bin dabei.',
    ),
    { id: 'decline', label: 'Kein Interesse' },
  ]);
}

// ---------------------------------------------------------------------------------------------
// Preise: Wo du ihnen Konkurrenz machst (Leute oder Verkäufe im Veedel), drücken die Gangs die Preise in ihrem
// Revier, feindliche noch mehr (Preiskrieg). Ohne Konkurrenz lassen sie den Markt in Ruhe.

function applyPrices(ctx: Ctx): void {
  const factors = ctx.state.modules.gangs.priceFactors;
  for (const v of liveVeedel(ctx.state)) {
    const owner = veedelGang(ctx.state, v.id);
    const gang = owner ? getGang(ctx.state, owner) : undefined;
    const s = gang ? statusOf(ctx, gang.id) : undefined;
    let desired = 1;
    if (gang && s && hasPlayerPresence(ctx.state, v.id)) {
      desired =
        gang.traits.priceFactor -
        (s.hostility >= PRICE_WAR_HOSTILITY && !paysTribute(ctx.state, gang.id) ? PRICE_WAR_EXTRA : 0);
      desired = Math.round(desired * 100) / 100;
    }
    if (Math.abs(desired - (factors[v.id] ?? 1)) < 0.001) continue;
    setCompetitionFactor(ctx, v.id, desired);
    factors[v.id] = desired;
  }
}
