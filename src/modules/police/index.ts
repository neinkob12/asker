// Polizei (leicht, "Würze, nicht Kern"): Heat pro Veedel, Kontrollen, Razzien, Festnahmen und Verpfeifen.
//
// - Heat steigt durch Verkäufe (sale.completed) und Gewalt (Konfrontationen im Veedel, reportViolence; Begegnungen mit
//   der Polizei selbst, Verkehrskontrolle und Polizeiflucht, zählen nicht dazu) und sinkt jede Stunde. Mehr
//   Polizeipräsenz im Veedel: Heat steigt schneller, Kontrollen und Razzien kommen öfter.
// - Stündlich würfelt jedes Veedel: ab CHECK_THRESHOLD Kontrollen, ab RAID_THRESHOLD Razzien (nur wo der Spieler
//   präsent ist; Razzien ohne Spieler treffen die Gang, die das Veedel kontrolliert).
// - Razzien gegen den Spieler werden geplant ('police.raidPlanned') und schlagen RAID_LEAD_TIME später zu. So kann
//   der Polizei-Kontakt (staff) warnen und die Leute können abtauchen. Wer dann nicht mehr da ist, verliert nichts.
// - Folgen: Ware und Schwarzgeld werden beschlagnahmt (eigene Lager im Veedel werden mit durchsucht, dort ist ein
//   Anteil des Bestands weg), Mitarbeiter festgenommen ('police.arrest', den Haft-Status setzt staff). Eine Kontrolle kann in eine Polizeiflucht kippen (Konfrontation 'policeChase' über encounters).
// - Verpfeifen ('police.snitch'): Heat und ein Hinweis in allen Veedeln der Gang. Solange der Hinweis gilt, kann es
//   dort eine Razzia gegen die Gang geben, die sie Einfluss kostet.
//
// Öffentliche API:
//   getHeat(state, veedelId), addHeat(ctx, veedelId, amount), reportViolence(ctx, veedelId, severity?),
//   heatLevel(heat), playerHeat(state), hottestVeedel(state), snitchOnGang(ctx, gangId), canSnitch(state, gangId),
//   activeTipOff(state, veedelId), plannedRaid(state, veedelId), plannedRaidInfo, plannedMajorRaid(state),
//   getPoliceStats(state), arrestStaff(ctx, staffId, veedelId), recordConfiscation(ctx, goods),
//   operationTier(state, cityId?) (Kleindealer, Händler, Großhändler), operationFacts(state, cityId?),
//   nextTierHints(state, tier, cityId?), restHeat(ctx, cityId),
//   MAX_HEAT, CHECK_THRESHOLD, RAID_THRESHOLD, HEAT_LEVELS, OPERATION_TIERS
// Befehle: 'police.snitch'
// Ereignisse: 'police.check', 'police.raidPlanned', 'police.raid' (scope: spot, veedel, major), 'police.arrest',
//   'police.tipOff', 'police.heatLevelChanged', 'police.tierChanged'
//
// Städte (Auftrag 30): Heat und Razzien laufen nur in der Stadt, die live ist; die Stufe gilt pro Stadt (tiers, Hamburg
// mindestens Händler, Kontrollen dort × 1,3, nachts mal Nachtleben). Eine schlafende Stadt kühlt einmal am Tag ab
// (restHeat, aufgerufen von city).
//
// Härte nach Größe (Auftrag 24, tier.ts): Ein Kleindealer erlebt Kontrollen und höchstens eine Razzia an einem Spot
// (keine Lager-Durchsuchung, Festnahmen nur dort), ein Händler Razzien im ganzen Veedel, erst ein Großhändler die
// Großrazzia: einen Tag vorher geplant, mehrere Veedel und Lager zugleich. Beute immer anteilig an dem, was da ist.

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatAmount,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { activeCity, isBusinessSold, isVeedelLive, liveVeedel } from '../city';
import { startEncounter } from '../encounters';
import { eventFactor, raidsAllowed } from '../events';
import { getGang } from '../gangs';
import { allProducts, getLots, getWarehouses, nearestWarehouse, take, warehouseModifiers } from '../goods';
import { atSpot, getSpot, spotModifiers, spotsInVeedel } from '../spots';
import {
  activeRunnerAt,
  bonusProvider,
  getStaff,
  getStaffMember,
  isLyingLow,
  riskFactor,
  type StaffMember,
  staffContact,
} from '../staff';
import {
  addInfluence,
  controlledBy,
  controllerOf,
  type FactionId,
  getInfluence,
  hasPlayerPresence,
  PLAYER_FACTION,
} from '../territory';
import { allVeedel, getVeedel, veedelAt, veedelCity, veedelName } from '../veedel';
import {
  CHASE_CHANCE,
  CHASE_ESCAPED_HEAT,
  CHECK_ARREST_CHANCE,
  CHECK_CHANCE_PER_HOUR,
  CHECK_COOLDOWN,
  CHECK_FACTOR_BY_CITY,
  CHECK_GOODS,
  CHECK_HEAT_RELIEF,
  CHECK_MONEY,
  CHECK_THRESHOLD,
  CUSTOMS_DECAY_PER_HOUR,
  CUSTOMS_DECAY_SHARE_PER_HOUR,
  CUSTOMS_HEAT_PER_KG,
  CUSTOMS_HEAT_SEIZED,
  CUSTOMS_LEVELS,
  FAILED_CHASE_FACTOR,
  GANG_RAID_INFLUENCE_LOSS,
  HEAT_DECAY_PER_HOUR,
  HEAT_DECAY_SHARE_PER_HOUR,
  HEAT_LEVELS,
  MAJOR_RAID_CHANCE_PER_HOUR,
  MAJOR_RAID_COOLDOWN,
  MAJOR_RAID_LEAD_TIME,
  MAJOR_RAID_MIN_HEAT,
  MAJOR_RAID_VEEDEL,
  MAX_HEAT,
  MIN_TIER_BY_CITY,
  NIGHT_HOURS,
  RAID_CHANCE_BY_TIER,
  RAID_CHANCE_PER_HOUR,
  RAID_COOLDOWN,
  RAID_HEAT_RELIEF,
  RAID_LEAD_TIME,
  RAID_SCOPES,
  RAID_THRESHOLD,
  SALE_HEAT_BASE,
  SALE_HEAT_BY_TIER,
  SALE_HEAT_PER_UNIT,
  SNITCH_COOLDOWN,
  SNITCH_HEAT,
  TICKERS,
  TIP_OFF_DURATION,
  TIP_OFF_RAID_CHANCE_PER_HOUR,
  VIOLENCE_HEAT,
} from './config';

import { nextTier, type OperationTier, operationFacts, tierInfo } from './tier';

export { CHECK_THRESHOLD, HEAT_LEVELS, MAX_HEAT, OPERATION_TIERS, RAID_SCOPES, RAID_THRESHOLD } from './config';
export {
  nextTierHints,
  type OperationFacts,
  type OperationTier,
  operationFacts,
  type TierHint,
  type TierHintPart,
} from './tier';

/** Art einer Razzia gegen dich: an einem Spot, im ganzen Veedel oder Großrazzia (mehrere Veedel und Lager). */
export type RaidScope = keyof typeof RAID_SCOPES;

/** Geplante Razzia gegen dich in einem Veedel. */
export interface PlannedRaid {
  at: number;
  scope: 'spot' | 'veedel';
  /** Bei einer Razzia am Spot: welcher. */
  spotId: string | null;
}

/** Geplante Großrazzia (nur Großhändler). */
export interface MajorRaid {
  at: number;
  veedelIds: string[];
}

export type HeatLevelId = (typeof HEAT_LEVELS)[number]['id'];

export interface HeatLevel {
  id: HeatLevelId;
  label: string;
  /** Stufe 0 (ruhig) bis 3 (Großeinsatz). */
  index: number;
}

export interface TipOff {
  gangId: string;
  /** Gilt bis (Spielminute). */
  until: number;
}

export interface PoliceStats {
  checks: number;
  raids: number;
  gangRaids: number;
  arrests: number;
  confiscatedGoods: number;
  confiscatedMoney: number;
}

export interface PoliceState {
  /** Heat pro Veedel (0–100). */
  heat: Record<string, number>;
  /** Gemeldete Heat-Stufe pro Veedel (mit Hysterese beim Sinken, damit das Journal nicht flackert). */
  level: Record<string, number>;
  /** Frühester Zeitpunkt für die nächste Kontrolle bzw. Razzia pro Veedel. */
  checkReadyAt: Record<string, number>;
  raidReadyAt: Record<string, number>;
  /** Offene Hinweise gegen Gangs pro Veedel. */
  tipOffs: Record<string, TipOff>;
  /** Ab wann die Polizei wieder einen Hinweis annimmt. */
  snitchReadyAt: number;
  /** Geplante Razzien gegen den Spieler pro Veedel. */
  plannedRaids: Record<string, PlannedRaid>;
  /** Geplante Großrazzia, sonst null. Danach ist bis majorReadyAt Ruhe. */
  majorRaid: MajorRaid | null;
  majorReadyAt: number;
  /** So sieht dich die Polizei pro Stadt: 0 Kleindealer, 1 Händler, 2 Großhändler (fehlt = noch nicht bestimmt). */
  tiers: Record<string, number>;
  /** Zoll-Heat pro Hafen der Hafen-Phase (Auftrag 40, 0–100). */
  customs: Record<string, number>;
  stats: PoliceStats;
}

/** Zustand in Version 5 (Auftrag 30, ohne Zoll-Heat). */
type PoliceStateV5 = Omit<PoliceState, 'customs'>;

/** Zustand in Version 4 (eine Stufe für alles, das war Köln). */
type PoliceStateV4 = Omit<PoliceStateV5, 'tiers'> & { tier: number | null };

/** Zustand in Version 3 (geplante Razzien nur als Zeitpunkt, keine Stufen). */
type PoliceStateV3 = Omit<PoliceStateV4, 'plannedRaids' | 'majorRaid' | 'majorReadyAt' | 'tier'> & {
  plannedRaids: Record<string, number>;
};

/** Zustand in Version 1 (Fundament). */
interface PoliceStateV1 {
  heat: Record<string, number>;
}

/** Zustand in Version 2 (Auftrag 10), ohne geplante Razzien. */
type PoliceStateV2 = Omit<PoliceStateV3, 'plannedRaids'>;

declare module '../../core' {
  interface ModuleStates {
    police: PoliceState;
  }
  interface GameCommands {
    /** Eine Gang bei der Polizei verpfeifen. */
    'police.snitch': { gangId: string };
  }
  interface GameEvents {
    /** Kontrolle bei eigenen Leuten. staffId null = der Spieler selbst. chase: Es kam zur Polizeiflucht. */
    'police.check': {
      veedelId: string;
      spotId: string | null;
      staffId: string | null;
      chase: boolean;
      goods: number;
      money: number;
    };
    /**
     * Razzia in einem Veedel. target = betroffene Fraktion ('player' oder Gang-ID). Beim Spieler: beschlagnahmte
     * Ware und Geld sowie Festgenommene (empty: niemand mehr da, die Razzia ging ins Leere), bei einer Gang:
     * verlorener Einfluss.
     */
    'police.raid': {
      veedelId: string;
      target: FactionId;
      /** Art der Razzia gegen dich (fehlt bei Gangs): am Spot, im Veedel, Großrazzia. */
      scope?: RaidScope;
      /** Großrazzia: alle betroffenen Veedel. */
      veedelIds?: string[];
      spotId?: string;
      goods?: number;
      money?: number;
      arrested?: string[];
      empty?: boolean;
      influenceLost?: number;
    };
    /**
     * Eine Razzia gegen den Spieler ist geplant und kommt zur Zeit at (der Polizei-Kontakt kann warnen). Bei einer
     * Großrazzia kommt das Ereignis für jedes betroffene Veedel (scope 'major').
     */
    'police.raidPlanned': { veedelId: string; at: number; scope?: RaidScope };
    /** Die Polizei sieht dich anders: 0 Kleindealer, 1 Händler, 2 Großhändler (cityId fehlt nur bei alten Zuhörern). */
    'police.tierChanged': { from: number; to: number; cityId?: string };
    /** Ein Mitarbeiter wurde festgenommen. Den Haft-Status setzt das staff-Modul. */
    'police.arrest': { staffId: string; veedelId: string };
    /** Eine Gang wurde verpfiffen. */
    'police.tipOff': { gangId: string; veedelIds: string[] };
    /** Heat-Stufe eines Veedels hat sich geändert (steigend sofort, fallend mit etwas Abstand). */
    'police.heatLevelChanged': { veedelId: string; from: HeatLevelId; to: HeatLevelId; heat: number };
  }
}

/** Beim Sinken wechselt die Stufe erst so weit unter ihrer Schwelle (gegen Flackern). */
const LEVEL_HYSTERESIS = 10;

export function getHeat(state: GameState, veedelId: string): number {
  return state.modules.police.heat[veedelId] ?? 0;
}

/** Stufe zu einem Heat-Wert. */
export function heatLevel(heat: number): HeatLevel {
  let index = 0;
  for (let i = 0; i < HEAT_LEVELS.length; i++) if (heat >= HEAT_LEVELS[i].min) index = i;
  return { id: HEAT_LEVELS[index].id, label: HEAT_LEVELS[index].label, index };
}

/** Heißestes Veedel, in dem der Spieler präsent ist (Leute vor Ort oder kürzlich verkauft). null = nirgends. */
export function playerHeat(state: GameState): { veedelId: string; heat: number } | null {
  let best: { veedelId: string; heat: number } | null = null;
  for (const v of liveVeedel(state)) {
    if (!hasPlayerPresence(state, v.id)) continue;
    const heat = getHeat(state, v.id);
    if (!best || heat > best.heat) best = { veedelId: v.id, heat };
  }
  return best;
}

/** Heißestes Veedel der Stadt, die live ist. */
export function hottestVeedel(state: GameState): { veedelId: string; heat: number } {
  const veedel = liveVeedel(state);
  // Ein Ort ohne Veedel (Rotterdam in der Hafen-Phase, Auftrag 40): ruhig.
  if (veedel.length === 0) return { veedelId: '', heat: 0 };
  let best = { veedelId: veedel[0].id, heat: -1 };
  for (const v of veedel) {
    const heat = getHeat(state, v.id);
    if (heat > best.heat) best = { veedelId: v.id, heat };
  }
  return best;
}

/** Offener Hinweis gegen eine Gang in diesem Veedel. */
export function activeTipOff(state: GameState, veedelId: string): TipOff | null {
  const tip = state.modules.police.tipOffs[veedelId];
  return tip && tip.until > state.time ? tip : null;
}

/** Zeitpunkt einer geplanten Razzia gegen den Spieler in diesem Veedel (auch Großrazzia), sonst null. */
export function plannedRaid(state: GameState, veedelId: string): number | null {
  const police = state.modules.police;
  const raid = police.plannedRaids[veedelId]?.at ?? null;
  const major = police.majorRaid?.veedelIds.includes(veedelId) ? police.majorRaid.at : null;
  if (raid === null) return major;
  return major === null ? raid : Math.min(raid, major);
}

/** Geplante Razzia (Art, Spot) in diesem Veedel, sonst null. */
export function plannedRaidInfo(state: GameState, veedelId: string): PlannedRaid | null {
  return state.modules.police.plannedRaids[veedelId] ?? null;
}

/** Geplante Großrazzia, sonst null. */
export function plannedMajorRaid(state: GameState): MajorRaid | null {
  return state.modules.police.majorRaid;
}

/** Gespeicherte Stufe einer Stadt (0 ohne, aber mindestens MIN_TIER_BY_CITY). */
function tierOf(state: GameState, cityId: string): number {
  return Math.max(state.modules.police.tiers[cityId] ?? 0, MIN_TIER_BY_CITY[cityId] ?? 0);
}

/** So sieht dich die Polizei gerade in einer Stadt (Standard: die aktive; Stufe mit Hysterese, siehe tier.ts). */
export function operationTier(state: GameState, cityId: string = activeCity(state)): OperationTier {
  const stored = state.modules.police.tiers[cityId];
  const min = MIN_TIER_BY_CITY[cityId] ?? 0;
  return tierInfo(Math.max(min, stored ?? nextTier(operationFacts(state, cityId), min)));
}

/**
 * Schlafmodus (city): Die Heat einer schlafenden Stadt kühlt einmal am Tag so weit ab wie in 24 Stunden ohne Geschäft.
 * Keine Kontrollen, keine Razzien, keine Meldungen.
 */
export function restHeat(ctx: Ctx, cityId: string): void {
  const police = ctx.state.modules.police;
  for (const v of allVeedel(cityId)) {
    let heat = police.heat[v.id] ?? 0;
    for (let hour = 0; hour < 24 && heat > 0; hour++) {
      heat = Math.max(0, heat - (HEAT_DECAY_PER_HOUR + HEAT_DECAY_SHARE_PER_HOUR * heat));
    }
    police.heat[v.id] = Math.round(heat * 1000) / 1000;
    police.level[v.id] = Math.min(police.level[v.id] ?? 0, heatLevel(heat).index);
  }
}

// ---------------------------------------------------------------------------------------------
// Zoll-Heat pro Hafen (Auftrag 40)

/** Zoll-Heat eines Hafens (0–100). */
export function customsHeat(state: GameState, portId: string): number {
  return state.modules.police.customs?.[portId] ?? 0;
}

/** Wie viel Zoll-Heat eine Ankunft mit so vielen Kilo bringt (Auftrag 43, I11: im Einkauf vorher zeigen). */
export function customsHeatForArrival(kilos: number): number {
  return Math.max(0, kilos) * CUSTOMS_HEAT_PER_KG;
}

/** Stufe des Zolls in einem Hafen für die Anzeige (0 ruhig … 3 Großkontrolle). */
export function customsLevel(heat: number): { index: number; label: string } {
  let index = 0;
  CUSTOMS_LEVELS.forEach((l, i) => {
    if (heat >= l.min) index = i;
  });
  return { index, label: CUSTOMS_LEVELS[index].label };
}

/** Zoll-Heat erhöhen (negativ: senken), begrenzt auf 0–100. Gibt den neuen Wert zurück. */
export function addCustomsHeat(ctx: Ctx, portId: string, amount: number): number {
  const police = ctx.state.modules.police;
  police.customs ??= {};
  const value = Math.min(MAX_HEAT, Math.max(0, (police.customs[portId] ?? 0) + amount));
  police.customs[portId] = Math.round(value * 1000) / 1000;
  return value;
}

/** Ankunft im Hafen: so viele Kilo treiben den Zoll hoch (CUSTOMS_HEAT_PER_KG). */
export function customsArrival(ctx: Ctx, portId: string, kilos: number): number {
  return addCustomsHeat(ctx, portId, kilos * CUSTOMS_HEAT_PER_KG);
}

/** Ein Container ist aufgeflogen: der Zoll wird schärfer. */
export function customsSeized(ctx: Ctx, portId: string): number {
  return addCustomsHeat(ctx, portId, CUSTOMS_HEAT_SEIZED);
}

/** Stündlich: Die Zeit kühlt den Zoll in jedem Hafen ab. */
function coolCustoms(ctx: Ctx): void {
  const customs = ctx.state.modules.police.customs;
  if (!customs) return;
  for (const [portId, heat] of Object.entries(customs)) {
    const next = Math.max(0, heat - (CUSTOMS_DECAY_PER_HOUR + CUSTOMS_DECAY_SHARE_PER_HOUR * heat));
    customs[portId] = Math.round(next * 1000) / 1000;
  }
}

export function getPoliceStats(state: GameState): PoliceStats {
  return state.modules.police.stats;
}

/** Heat erhöhen (negativ: senken), begrenzt auf 0–100. Gibt den neuen Wert zurück. */
export function addHeat(ctx: Ctx, veedelId: string, amount: number): number {
  const police = ctx.state.modules.police;
  const value = Math.min(MAX_HEAT, Math.max(0, (police.heat[veedelId] ?? 0) + amount));
  police.heat[veedelId] = Math.round(value * 1000) / 1000;
  updateLevel(ctx, veedelId);
  return police.heat[veedelId];
}

/**
 * Festnahme eines Mitarbeiters durch andere Module (z.B. eine Verkehrskontrolle der Logistik). Zählt in der
 * Statistik und löst 'police.arrest' aus, den Haft-Status setzt staff.
 */
export function arrestStaff(ctx: Ctx, staffId: string, veedelId: string): void {
  arrest(ctx, staffId, veedelId);
}

/** Beschlagnahmte Ware, die andere Module selbst abgezogen haben (z.B. eine Ladung), in der Statistik zählen. */
export function recordConfiscation(ctx: Ctx, goods: number): void {
  ctx.state.modules.police.stats.confiscatedGoods += Math.max(0, Math.round(goods));
}

/** Gewalt im Veedel melden (Überfall, Schießerei …). severity 1 = normal. */
export function reportViolence(ctx: Ctx, veedelId: string, severity = 1): number {
  const presence = getVeedel(veedelId)?.policePresence ?? 1;
  return addHeat(ctx, veedelId, VIOLENCE_HEAT * severity * presence);
}

/**
 * Eine Gang steckt der Polizei etwas über dich (Auftrag 23): Heat im Veedel, mit raid eine geplante Razzia, wenn dort
 * gerade keine ansteht, du dort bist und Razzien erlaubt sind. Gibt zurück, ob eine Razzia geplant wurde.
 */
export function tipOffAgainstPlayer(ctx: Ctx, veedelId: string, heat: number, raid = false): boolean {
  addHeat(ctx, veedelId, heat);
  if (!raid) return false;
  const police = ctx.state.modules.police;
  const ready =
    ctx.now >= (police.raidReadyAt[veedelId] ?? 0) &&
    police.plannedRaids[veedelId] === undefined &&
    !police.majorRaid?.veedelIds.includes(veedelId);
  if (!ready || !hasPlayerPresence(ctx.state, veedelId) || !raidsAllowed(ctx.state, veedelCity(veedelId))) return false;
  planRaid(ctx, veedelId);
  return true;
}

/** Kann die Gang gerade verpfiffen werden? */
export function canSnitch(state: GameState, gangId: string): CommandResult {
  const gang = getGang(state, gangId);
  if (!gang) return { ok: false, reason: 'Diese Gang gibt es nicht.' };
  const readyAt = state.modules.police.snitchReadyAt;
  if (state.time < readyAt) {
    return { ok: false, reason: `Die Bullen haben gerade erst von dir gehört. Wieder ab ${clock.format(readyAt)}.` };
  }
  if (controlledBy(state, gangId).length === 0) {
    return { ok: false, reason: `${gang.name} hat kein Revier, da gibt es nichts zu verpfeifen.` };
  }
  return { ok: true };
}

/** Gang verpfeifen: Heat und ein Hinweis in ihren Veedeln, dort drohen ihr Razzien. */
export function snitchOnGang(ctx: Ctx, gangId: string): CommandResult {
  const allowed = canSnitch(ctx.state, gangId);
  if (!allowed.ok) return allowed;
  const gang = getGang(ctx.state, gangId);
  const police = ctx.state.modules.police;
  const veedelIds = controlledBy(ctx.state, gangId);
  for (const veedelId of veedelIds) {
    addHeat(ctx, veedelId, SNITCH_HEAT);
    police.tipOffs[veedelId] = { gangId, until: ctx.now + TIP_OFF_DURATION };
  }
  police.snitchReadyAt = ctx.now + SNITCH_COOLDOWN;
  journal.add(
    ctx,
    `Du hast ${gang?.name ?? gangId} bei den Bullen verpfiffen. In ${veedelIds.map(veedelName).join(', ')} ` +
      'schauen sie jetzt genauer hin.',
    'info',
  );
  ctx.emit('police.tipOff', { gangId, veedelIds });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Innere Abläufe.

function updateLevel(ctx: Ctx, veedelId: string): void {
  const police = ctx.state.modules.police;
  const heat = police.heat[veedelId] ?? 0;
  const shown = police.level[veedelId] ?? 0;
  const actual = heatLevel(heat).index;
  let next = shown;
  if (actual > shown) next = actual;
  else if (actual < shown && heat < HEAT_LEVELS[shown].min - LEVEL_HYSTERESIS)
    next = heatLevel(heat + LEVEL_HYSTERESIS).index;
  if (next === shown) return;
  police.level[veedelId] = next;
  ctx.emit('police.heatLevelChanged', {
    veedelId,
    from: HEAT_LEVELS[shown].id,
    to: HEAT_LEVELS[next].id,
    heat,
  });
  if (next > shown && hasPlayerPresence(ctx.state, veedelId)) {
    const name = veedelName(veedelId);
    const text = [
      '',
      `In ${name} sind mehr Streifen unterwegs. Mit Kontrollen ist zu rechnen.`,
      `In ${name} wird es heiß. Zivis an jeder Ecke, Razzien sind jetzt möglich.`,
      `${name} ist ein Brennpunkt. Überall Zivis, besser eine Weile die Füße stillhalten.`,
    ][next];
    journal.add(ctx, text, 'bad', { veedelId });
  }
}

/** Ab der Schwelle steigt die Chance von einem Viertel auf den vollen Wert bei Heat 100. */
function rampedChance(heat: number, threshold: number, chance: number): number {
  if (heat < threshold) return 0;
  return chance * (0.25 + (0.75 * (heat - threshold)) / (MAX_HEAT - threshold));
}

/** Vorsicht und Erfahrung senken das Risiko (riskFactor aus staff, 1 = Durchschnitt). Der Spieler selbst: 1. */
function cautionFactor(state: GameState, staffId: string | null): number {
  if (!staffId || !getStaffMember(state, staffId)) return 1;
  return riskFactor(state, staffId);
}

function staffName(state: GameState, staffId: string): string {
  return getStaffMember(state, staffId)?.name ?? 'Jemand';
}

function lossText(goods: number, money: number): string {
  const parts = [];
  if (goods > 0) parts.push(`${formatAmount(goods)} Ware`);
  if (money > 0) parts.push(formatEuro(money));
  return parts.length > 0 ? parts.join(' und ') : 'nichts';
}

/** Am Satzanfang groß. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Ware beschlagnahmen, aus den Lagern der Stadt des Veedels und allen Produkten, bis die Menge erreicht ist. */
function confiscateGoods(ctx: Ctx, amount: number, veedelId: string): number {
  let left = Math.max(0, Math.round(amount));
  for (const warehouse of getWarehouses(ctx.state, veedelCity(veedelId))) {
    for (const product of allProducts()) {
      if (left <= 0) break;
      left -= take(ctx, { productId: product.id, amount: left, warehouseId: warehouse.id, partial: true }).taken;
    }
  }
  const taken = Math.round(amount) - left;
  ctx.state.modules.police.stats.confiscatedGoods += taken;
  return taken;
}

/**
 * Eigene Lager im Veedel werden bei einer Razzia mit durchsucht: share jedes Postens ist weg, mit Tarnung weniger
 * (goods.warehouseModifiers, Auftrag 33).
 */
function searchWarehouses(ctx: Ctx, veedelId: string, share: number): number {
  if (share <= 0) return 0;
  let taken = 0;
  for (const warehouse of getWarehouses(ctx.state)) {
    if (veedelAt(warehouse.lng, warehouse.lat)?.id !== veedelId) continue;
    const found = share * warehouseModifiers(ctx.state, warehouse.id).raidFactor;
    for (const lot of getLots(ctx.state, { warehouseId: warehouse.id })) {
      const amount = Math.ceil(lot.amount * found);
      taken += take(ctx, {
        productId: lot.productId,
        amount,
        warehouseId: warehouse.id,
        lotId: lot.id,
        partial: true,
      }).taken;
    }
  }
  ctx.state.modules.police.stats.confiscatedGoods += taken;
  return taken;
}

function confiscateMoney(ctx: Ctx, amount: number): number {
  const lost = wallet.lose(ctx, Math.round(amount), 'dirty', 'Beschlagnahme', 'loss.police');
  ctx.state.modules.police.stats.confiscatedMoney += lost;
  return lost;
}

/**
 * Ware am Ort: ein Anteil vom Lager, das dem Ort am nächsten liegt (was die Leute dabeihaben), höchstens max Einheiten.
 * Das ist keine Lager-Durchsuchung, nur was auf der Straße ist.
 */
function confiscateNear(ctx: Ctx, point: { lng: number; lat: number }, share: number, max: number): number {
  const warehouse = nearestWarehouse(ctx.state, point);
  if (!warehouse || share <= 0) return 0;
  let left = max;
  let taken = 0;
  for (const lot of getLots(ctx.state, { warehouseId: warehouse.id })) {
    if (left <= 0) break;
    const amount = Math.min(left, Math.ceil(lot.amount * share));
    const got = take(ctx, {
      productId: lot.productId,
      amount,
      warehouseId: warehouse.id,
      lotId: lot.id,
      partial: true,
    }).taken;
    taken += got;
    left -= got;
  }
  ctx.state.modules.police.stats.confiscatedGoods += taken;
  return taken;
}

/** Anteil vom Schwarzgeld, höchstens max. */
function confiscateMoneyShare(ctx: Ctx, share: number, max: number): number {
  return confiscateMoney(ctx, Math.min(max, Math.max(0, ctx.state.wallet.dirty) * share));
}

function arrest(ctx: Ctx, staffId: string, veedelId: string): void {
  ctx.state.modules.police.stats.arrests += 1;
  ctx.emit('police.arrest', { staffId, veedelId });
}

function activeStaffIn(state: GameState, veedelId: string): StaffMember[] {
  return getStaff(state, { veedelId, status: 'active' });
}

function spotOf(member: StaffMember | null): string | null {
  return member?.assignment?.kind === 'spot' ? member.assignment.targetId : null;
}

function placeText(state: GameState, veedelId: string, spotId: string | null): string {
  const spot = spotId ? getSpot(state, spotId) : undefined;
  return spot ? atSpot(spot) : `in ${veedelName(veedelId)}`;
}

/** Kontrolle bei eigenen Leuten im Veedel (oder beim Spieler, wenn er dort selbst verkauft hat). */
function runCheck(ctx: Ctx, veedelId: string): void {
  const state = ctx.state;
  const police = state.modules.police;
  const people = activeStaffIn(state, veedelId);
  const target = people.length > 0 ? ctx.pick(people) : null;
  const spotId = spotOf(target) ?? spotsInVeedel(state, veedelId)[0]?.id ?? null;
  const place = placeText(state, veedelId, spotId);
  const mods = spotModifiers(state, spotId);
  // Auftrag 23: Ein Späher am Spot sieht die Streife kommen, die Kontrolle geht ins Leere.
  if (mods.checkAvoid > 0 && ctx.chance(mods.checkAvoid)) {
    police.checkReadyAt[veedelId] = ctx.now + CHECK_COOLDOWN;
    journal.add(ctx, `Kontrolle ${place}: Der Späher hat die Streife früh gesehen, alle waren weg.`, 'good', {
      veedelId,
      ...(spotId ? { spotId } : {}),
    });
    return;
  }
  police.checkReadyAt[veedelId] = ctx.now + CHECK_COOLDOWN;
  police.stats.checks += 1;
  addHeat(ctx, veedelId, -CHECK_HEAT_RELIEF);
  const ref = { veedelId, ...(spotId ? { spotId } : {}), ...(target ? { staffId: target.id } : {}) };

  if (ctx.chance(CHASE_CHANCE)) {
    const who = target ? `${target.name} rennt los` : 'Du rennst los';
    journal.add(ctx, `Kontrolle ${place}: ${who}, die Bullen hinterher.`, 'bad', ref);
    ctx.emit('police.check', { veedelId, spotId, staffId: target?.id ?? null, chase: true, goods: 0, money: 0 });
    startEncounter(ctx, {
      kind: 'policeChase',
      veedelId,
      ...(spotId ? { spotId } : {}),
      staffIds: target ? [target.id] : [],
      playerPresent: !target,
      opponent: { label: 'Polizei', strength: getVeedel(veedelId)?.policePresence ?? 1 },
      origin: { module: 'police', ref: 'check' },
    });
    return;
  }

  // Auftrag 23: Mit Versteck am Spot ist weniger am Mann.
  const goods = confiscateGoods(
    ctx,
    Math.round(ctx.randomInt(CHECK_GOODS.min, CHECK_GOODS.max) * mods.lossFactor),
    veedelId,
  );
  const money = confiscateMoney(ctx, Math.round(ctx.randomInt(CHECK_MONEY.min, CHECK_MONEY.max) * mods.lossFactor));
  const loss = lossText(goods, money);
  if (!target) {
    journal.add(
      ctx,
      `Kontrolle ${place}: Die Bullen filzen dich. ${capitalize(loss)} weg, gegen dich selbst haben sie nichts in der Hand.`,
      'bad',
      ref,
    );
  } else if (ctx.chance(Math.min(1, CHECK_ARREST_CHANCE * cautionFactor(state, target.id)))) {
    arrest(ctx, target.id, veedelId);
    journal.add(
      ctx,
      `Kontrolle ${place}: ${target.name} wird festgenommen. ${capitalize(loss)} beschlagnahmt.`,
      'bad',
      ref,
    );
  } else {
    journal.add(ctx, `Kontrolle ${place}: ${target.name} wird gefilzt, ${loss} weg, mehr nicht.`, 'bad', ref);
  }
  ctx.emit('police.check', { veedelId, spotId, staffId: target?.id ?? null, chase: false, goods, money });
}

/** Ergebnis einer Polizeiflucht, die bei einer Kontrolle begonnen hat. */
function onChaseResolved(ctx: Ctx, outcome: string, veedelId: string, spotId: string | null, staffIds: string[]) {
  const state = ctx.state;
  const place = placeText(state, veedelId, spotId);
  const names = staffIds.map((id) => staffName(state, id)).join(', ');
  const ref = { veedelId, ...(spotId ? { spotId } : {}) };
  if (outcome === 'success') {
    addHeat(ctx, veedelId, CHASE_ESCAPED_HEAT);
    const who = staffIds.length > 0 ? `${names} ist den Bullen ${place} entkommen.` : 'Du hast die Bullen abgehängt.';
    journal.add(ctx, `${who} In ${veedelName(veedelId)} wird jetzt gesucht.`, 'good', ref);
    return;
  }
  const goods = confiscateGoods(ctx, ctx.randomInt(CHECK_GOODS.min, CHECK_GOODS.max) * FAILED_CHASE_FACTOR, veedelId);
  const money = confiscateMoney(ctx, ctx.randomInt(CHECK_MONEY.min, CHECK_MONEY.max) * FAILED_CHASE_FACTOR);
  const loss = lossText(goods, money);
  if (staffIds.length === 0) {
    journal.add(
      ctx,
      `Die Bullen haben dich ${place} eingeholt und nehmen dir ${loss} ab. Festnehmen können sie dich nicht.`,
      'bad',
      ref,
    );
    return;
  }
  for (const id of staffIds) arrest(ctx, id, veedelId);
  journal.add(ctx, `Flucht gescheitert: ${names} festgenommen, ${loss} beschlagnahmt.`, 'bad', ref);
}

/** Spot einer Razzia beim Kleindealer: wo deine Leute stehen (der mit dem meisten Andrang), sonst der erste. */
function raidSpot(state: GameState, veedelId: string): string | null {
  const spots = [...spotsInVeedel(state, veedelId)].sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));
  return (spots.find((s) => activeRunnerAt(state, s.id)) ?? spots[0])?.id ?? null;
}

/**
 * Razzia gegen den Spieler planen. Sie kommt RAID_LEAD_TIME später (der Polizei-Kontakt kann warnen). Beim Kleindealer
 * trifft sie nur einen Spot, sonst das ganze Veedel.
 */
function planRaid(ctx: Ctx, veedelId: string): void {
  const police = ctx.state.modules.police;
  const at = ctx.now + RAID_LEAD_TIME;
  const small = tierOf(ctx.state, veedelCity(veedelId)) === 0;
  const scope = small ? 'spot' : 'veedel';
  police.plannedRaids[veedelId] = { at, scope, spotId: small ? raidSpot(ctx.state, veedelId) : null };
  police.raidReadyAt[veedelId] = at;
  ctx.emit('police.raidPlanned', { veedelId, at, scope });
}

/** Ergebnis einer Razzia in einem Veedel (ohne Ereignis und Journal). */
interface RaidHaul {
  goods: number;
  money: number;
  arrested: string[];
  empty: boolean;
}

/**
 * Durchsucht ein Veedel bzw. einen Spot: Festnahmen, Ware am Ort, Lager im Veedel (nicht beim Kleindealer). Geld
 * zieht der Aufrufer ab (einmal pro Razzia). Ist niemand mehr da (abgetaucht), geht sie ins Leere.
 */
function searchPlace(ctx: Ctx, veedelId: string, scope: RaidScope, spotId: string | null): RaidHaul {
  const state = ctx.state;
  const rules = RAID_SCOPES[scope];
  const underground = isLyingLow(state, veedelId);
  // Ist das Veedel abgetaucht, hält sich auch der Leutnant bedeckt.
  let people = activeStaffIn(state, veedelId).filter((m) => !underground || m.assignment?.kind !== 'veedel');
  if (scope === 'spot') people = people.filter((m) => spotOf(m) === spotId);
  const nobody = people.length === 0 && (underground || !hasPlayerPresence(state, veedelId));
  if (nobody && scope !== 'major') return { goods: 0, money: 0, arrested: [], empty: true };
  const spot = spotId ? getSpot(state, spotId) : undefined;
  const point = spot ?? getVeedel(veedelId)?.center;
  let goods = searchWarehouses(ctx, veedelId, rules.warehouseShare);
  if (!nobody && point) goods += confiscateNear(ctx, point, rules.goodsShare, rules.goodsMax);
  const arrested: string[] = [];
  for (const member of people) {
    if (ctx.chance(Math.min(1, rules.arrest * cautionFactor(state, member.id)))) {
      arrested.push(member.id);
      arrest(ctx, member.id, veedelId);
    }
  }
  return { goods, money: 0, arrested, empty: nobody && goods === 0 };
}

/** Name der Razzia für Journal und Meldungen: "Razzia am Neumarkt", "Razzia auf der Uni-Wiese", "Razzia in Ehrenfeld", "Großrazzia in …". */
function raidTitle(state: GameState, scope: RaidScope, veedelIds: string[], spotId: string | null): string {
  if (scope === 'major') return `Großrazzia in ${veedelIds.map(veedelName).join(', ')}`;
  const spot = scope === 'spot' && spotId ? getSpot(state, spotId) : undefined;
  return spot ? `Razzia ${atSpot(spot)}` : `Razzia in ${veedelName(veedelIds[0])}`;
}

/** Geplante Razzia gegen deine Leute (am Spot oder im Veedel). */
function raidPlayer(ctx: Ctx, veedelId: string, plan: PlannedRaid): void {
  const state = ctx.state;
  const scope: RaidScope = plan.scope;
  const spotId = scope === 'spot' ? plan.spotId : null;
  const haul = searchPlace(ctx, veedelId, scope, spotId);
  if (haul.empty) {
    finishRaid(ctx, veedelId);
    journal.add(
      ctx,
      `${raidTitle(state, scope, [veedelId], spotId)}, aber da war niemand mehr. Die Bullen ziehen mit leeren Händen ab.`,
      'good',
      { veedelId, ...(spotId ? { spotId } : {}) },
    );
    ctx.emit('police.raid', { veedelId, target: PLAYER_FACTION, scope, goods: 0, money: 0, arrested: [], empty: true });
    return;
  }
  const rules = RAID_SCOPES[scope];
  const money = confiscateMoneyShare(ctx, rules.moneyShare, rules.moneyMax);
  const where =
    spotId ?? spotOf(activeStaffIn(state, veedelId)[0] ?? null) ?? spotsInVeedel(state, veedelId)[0]?.id ?? null;
  finishRaid(ctx, veedelId);
  const names = haul.arrested.map((id) => staffName(state, id)).join(', ');
  journal.add(
    ctx,
    `${raidTitle(state, scope, [veedelId], spotId)}! ${capitalize(lossText(haul.goods, money))} beschlagnahmt.` +
      (haul.arrested.length > 0 ? ` ${names} ${haul.arrested.length === 1 ? 'wurde' : 'wurden'} festgenommen.` : ''),
    'bad',
    { veedelId, ...(where ? { spotId: where } : {}) },
  );
  ctx.emit('police.raid', {
    veedelId,
    target: PLAYER_FACTION,
    scope,
    ...(where ? { spotId: where } : {}),
    goods: haul.goods,
    money,
    arrested: haul.arrested,
  });
}

/** Großrazzia planen: die heißesten Veedel mit deinen Leuten, dazu Veedel mit deinen Lagern. */
function planMajorRaid(ctx: Ctx): void {
  const state = ctx.state;
  const police = state.modules.police;
  const city = activeCity(state);
  const present = liveVeedel(state)
    .filter((v) => hasPlayerPresence(state, v.id))
    .sort((a, b) => getHeat(state, b.id) - getHeat(state, a.id) || a.id.localeCompare(b.id))
    .map((v) => v.id);
  const stores = getWarehouses(state, city)
    .map((w) => veedelAt(w.lng, w.lat)?.id)
    .filter((id): id is string => !!id);
  const veedelIds = [...new Set([...present.slice(0, MAJOR_RAID_VEEDEL - 1), ...stores, ...present])].slice(
    0,
    MAJOR_RAID_VEEDEL,
  );
  if (veedelIds.length === 0) return;
  const at = ctx.now + MAJOR_RAID_LEAD_TIME;
  police.majorRaid = { at, veedelIds };
  police.majorReadyAt = at + MAJOR_RAID_COOLDOWN;
  for (const veedelId of veedelIds) ctx.emit('police.raidPlanned', { veedelId, at, scope: 'major' });
}

/** Großrazzia: mehrere Veedel und Lager zugleich, mehr Festnahmen, große Beschlagnahme. */
function majorRaid(ctx: Ctx, raid: MajorRaid): void {
  const state = ctx.state;
  let goods = 0;
  const arrested: string[] = [];
  for (const veedelId of raid.veedelIds) {
    const haul = searchPlace(ctx, veedelId, 'major', null);
    goods += haul.goods;
    arrested.push(...haul.arrested);
    finishRaid(ctx, veedelId);
  }
  const rules = RAID_SCOPES.major;
  const money = confiscateMoneyShare(ctx, rules.moneyShare, rules.moneyMax);
  const names = arrested.map((id) => staffName(state, id)).join(', ');
  journal.add(
    ctx,
    `${raidTitle(state, 'major', raid.veedelIds, null)}! ${capitalize(lossText(goods, money))} beschlagnahmt.` +
      (arrested.length > 0 ? ` ${names} ${arrested.length === 1 ? 'wurde' : 'wurden'} festgenommen.` : ''),
    'bad',
    { veedelId: raid.veedelIds[0] },
  );
  ctx.emit('police.raid', {
    veedelId: raid.veedelIds[0],
    veedelIds: [...raid.veedelIds],
    target: PLAYER_FACTION,
    scope: 'major',
    goods,
    money,
    arrested,
    ...(goods === 0 && money === 0 && arrested.length === 0 ? { empty: true } : {}),
  });
}

/**
 * Stufe der Stadt, die live ist, neu bestimmen; steigt sie, erfährst du es (Polizei-Kontakt oder Lokal-Ticker) und es
 * steht im Journal.
 */
function updateTier(ctx: Ctx): void {
  // Nach dem Verkauf gibt es keinen Straßenhandel mehr, den die Polizei einstufen könnte (Auftrag 43, H9); im Hafen zählt
  // der Zoll (customsHeat).
  if (isBusinessSold(ctx.state)) return;
  const police = ctx.state.modules.police;
  const cityId = activeCity(ctx.state);
  const min = MIN_TIER_BY_CITY[cityId] ?? 0;
  const current = police.tiers[cityId];
  const next = Math.max(min, nextTier(operationFacts(ctx.state, cityId), current ?? min));
  if (current === undefined) {
    police.tiers[cityId] = next;
    return;
  }
  if (next === current) return;
  police.tiers[cityId] = next;
  const info = tierInfo(next);
  ctx.emit('police.tierChanged', { from: current, to: next, cityId });
  if (next < current) {
    journal.add(ctx, `Die Polizei hat dich nicht mehr so im Blick: Für sie bist du jetzt ${info.name}.`, 'good');
    return;
  }
  const text =
    next === 2
      ? 'Die Kripo hat eine Ermittlungsgruppe gegen dich gebildet. Ab jetzt drohen Großrazzien, mehrere Veedel auf einmal.'
      : 'Die Polizei hat dich auf dem Schirm: Für die bist du jetzt ein Händler. Razzien treffen ganze Veedel und deine Lager dort.';
  journal.add(ctx, `${text} (Stufe: ${info.name})`, 'bad');
  const contact = bonusProvider(ctx.state, 'raidWarning', cityId);
  const ticker = TICKERS[cityId] ?? TICKERS.koeln;
  // Aufs Handy nur aus der Stadt, in der du bist, und nicht mehr nach dem Verkauf (Auftrag 43).
  if (cityId !== activeCity(ctx.state) || isBusinessSold(ctx.state)) return;
  messages.send(ctx, {
    contact: contact ? staffContact(contact) : { ...ticker, kind: 'other' as const },
    text: contact ? `Hör zu: ${text}` : text,
  });
}

/** Razzia gegen eine Gang: Sie verliert Einfluss im Veedel. */
function raidGang(ctx: Ctx, veedelId: string, gangId: string, tippedOff: boolean): void {
  const state = ctx.state;
  const before = getInfluence(state, veedelId, gangId);
  const after = addInfluence(ctx, veedelId, gangId, -GANG_RAID_INFLUENCE_LOSS);
  finishRaid(ctx, veedelId);
  state.modules.police.stats.gangRaids += 1;
  const gang = getGang(state, gangId)?.name ?? gangId;
  journal.add(
    ctx,
    `Razzia bei ${gang} in ${veedelName(veedelId)}. Ihr Einfluss dort bröckelt.` +
      (tippedOff ? ' Dein Hinweis hat gesessen.' : ''),
    tippedOff ? 'good' : 'info',
    { veedelId },
  );
  ctx.emit('police.raid', { veedelId, target: gangId, influenceLost: Math.round((before - after) * 10) / 10 });
}

function finishRaid(ctx: Ctx, veedelId: string): void {
  const police = ctx.state.modules.police;
  police.raidReadyAt[veedelId] = ctx.now + RAID_COOLDOWN;
  police.checkReadyAt[veedelId] = Math.max(police.checkReadyAt[veedelId] ?? 0, ctx.now + CHECK_COOLDOWN);
  police.stats.raids += 1;
  delete police.tipOffs[veedelId];
  addHeat(ctx, veedelId, -RAID_HEAT_RELIEF);
}

/** Stündlich: Heat sinkt, Hinweise laufen ab, Kontrollen und Razzien werden ausgewürfelt. */
function tick(ctx: Ctx): void {
  const state = ctx.state;
  const police = state.modules.police;
  coolCustoms(ctx);
  for (const [veedelId, tip] of Object.entries(police.tipOffs)) {
    if (tip.until <= ctx.now) delete police.tipOffs[veedelId];
  }
  updateTier(ctx);
  for (const [veedelId, plan] of Object.entries(police.plannedRaids).sort()) {
    // In einer schlafenden Stadt wartet die Razzia, bis du wieder hinschaust; im Karneval auch (Etappe 7).
    if (plan.at > ctx.now || !isVeedelLive(state, veedelId) || !raidsAllowed(state, veedelCity(veedelId))) continue;
    delete police.plannedRaids[veedelId];
    raidPlayer(ctx, veedelId, plan);
  }
  if (
    police.majorRaid &&
    police.majorRaid.at <= ctx.now &&
    isVeedelLive(state, police.majorRaid.veedelIds[0]) &&
    raidsAllowed(state, veedelCity(police.majorRaid.veedelIds[0]))
  ) {
    const raid = police.majorRaid;
    police.majorRaid = null;
    majorRaid(ctx, raid);
  }
  const city = activeCity(state);
  const tier = tierOf(state, city);
  // Stadt-Events (Etappe 7): Im Karneval plant die Polizei keine Razzien gegen dich.
  const raidsOn = raidsAllowed(state, city);
  // Großrazzia nur gegen Großhändler: je heißer deine Veedel im Schnitt, desto eher.
  // Eine Großrazzia, die in einer schlafenden Stadt wartet, hält die Stadt, in der du bist, nicht frei (Auftrag 43):
  // Es gibt nur einen Platz, eine neue Planung ersetzt sie.
  const blocked = police.majorRaid !== null && isVeedelLive(state, police.majorRaid.veedelIds[0]);
  if (raidsOn && tier >= 2 && !blocked && ctx.now >= police.majorReadyAt) {
    const mine = liveVeedel(state).filter((v) => hasPlayerPresence(state, v.id));
    const heat = mine.length > 0 ? mine.reduce((sum, v) => sum + getHeat(state, v.id), 0) / mine.length : 0;
    const chance =
      MAJOR_RAID_CHANCE_PER_HOUR * Math.max(0, (heat - MAJOR_RAID_MIN_HEAT) / (MAX_HEAT - MAJOR_RAID_MIN_HEAT));
    if (ctx.chance(chance)) planMajorRaid(ctx);
  }
  // Kontrollen: in manchen Städten öfter, nachts mal Nachtleben des Veedels.
  const hour = clock.hour(ctx.now);
  const night = hour >= NIGHT_HOURS.from || hour < NIGHT_HOURS.to;
  const cityChecks = CHECK_FACTOR_BY_CITY[city] ?? 1;
  for (const v of liveVeedel(state)) {
    const heat = addHeat(ctx, v.id, -(HEAT_DECAY_PER_HOUR + HEAT_DECAY_SHARE_PER_HOUR * getHeat(ctx.state, v.id)));
    const presence = v.policePresence;
    const raidReady =
      ctx.now >= (police.raidReadyAt[v.id] ?? 0) &&
      police.plannedRaids[v.id] === undefined &&
      !police.majorRaid?.veedelIds.includes(v.id);
    const tip = police.tipOffs[v.id];

    if (tip && raidReady) {
      const chance = TIP_OFF_RAID_CHANCE_PER_HOUR * presence * (1 + heat / 50);
      if (ctx.chance(chance)) {
        raidGang(ctx, v.id, tip.gangId, true);
        continue;
      }
    }

    const playerThere = hasPlayerPresence(state, v.id);
    const owner = controllerOf(state, v.id);
    const raidTarget = playerThere ? (raidsOn ? PLAYER_FACTION : null) : owner !== PLAYER_FACTION ? owner : null;
    if (raidReady && raidTarget !== null) {
      // Gegen dich je nach Größe seltener (Kleindealer) oder wie gehabt.
      const factor = raidTarget === PLAYER_FACTION ? RAID_CHANCE_BY_TIER[tier] : 1;
      const chance = rampedChance(heat, RAID_THRESHOLD, RAID_CHANCE_PER_HOUR) * presence * factor;
      if (ctx.chance(chance)) {
        if (raidTarget === PLAYER_FACTION) planRaid(ctx, v.id);
        else raidGang(ctx, v.id, raidTarget, false);
        continue;
      }
    }

    if (playerThere && ctx.now >= (police.checkReadyAt[v.id] ?? 0)) {
      const factor = cityChecks * (night ? (v.nightlife ?? 1) : 1) * eventFactor(state, 'checks', { veedelId: v.id });
      if (ctx.chance(rampedChance(heat, CHECK_THRESHOLD, CHECK_CHANCE_PER_HOUR) * presence * factor)) {
        runCheck(ctx, v.id);
      }
    }
  }
}

/** Anlässe, bei denen die Polizei selbst die Gegenseite ist. */
const POLICE_ENCOUNTERS: readonly string[] = ['policeChase', 'vehicleCheck', 'customsCheck'];

function initialState(): PoliceState {
  return {
    heat: Object.fromEntries(allVeedel().map((v) => [v.id, 0])),
    level: {},
    checkReadyAt: {},
    raidReadyAt: {},
    tipOffs: {},
    snitchReadyAt: 0,
    plannedRaids: {},
    majorRaid: null,
    majorReadyAt: 0,
    tiers: {},
    customs: {},
    stats: { checks: 0, raids: 0, gangRaids: 0, arrests: 0, confiscatedGoods: 0, confiscatedMoney: 0 },
  };
}

export default defineModule({
  id: 'police',
  version: 6,
  dependsOn: ['veedel', 'territory'],
  init: () => initialState(),
  tickEvery: 60,
  tick,
  commands: {
    'police.snitch': (ctx, { gangId }) => snitchOnGang(ctx, gangId),
  },
  on: {
    // Nach dem Verkauf (Auftrag 43) gehören die Städte den Statthaltern: geplante Razzien gegen dich fallen weg.
    'business.sold': (ctx) => {
      const police = ctx.state.modules.police;
      police.majorRaid = null;
      police.plannedRaids = {};
    },
    'sale.completed': (ctx, { veedelId, amount, sellerId, spotId }) => {
      const presence = getVeedel(veedelId)?.policePresence;
      if (presence === undefined) return;
      const tier = SALE_HEAT_BY_TIER[tierOf(ctx.state, veedelCity(veedelId))];
      const heat = (SALE_HEAT_BASE + SALE_HEAT_PER_UNIT * Math.max(0, amount)) * presence * tier;
      const event = eventFactor(ctx.state, 'heatPerSale', { veedelId });
      // Auftrag 23: Die Art eines eigenen Spots (Club, Bahnhof mehr, Späti weniger).
      const kind = spotModifiers(ctx.state, spotId).heatFactor;
      addHeat(ctx, veedelId, heat * event * kind * cautionFactor(ctx.state, sellerId));
    },
    // Stadt-Events (Etappe 7): Fängt ein Fest ohne Razzien an, wartet eine geplante Razzia bis danach.
    'events.started': (ctx, { cityId, endsAt }) => {
      if (raidsAllowed(ctx.state, cityId)) return;
      const police = ctx.state.modules.police;
      for (const [veedelId, plan] of Object.entries(police.plannedRaids)) {
        if (veedelCity(veedelId) === cityId && plan.at < endsAt) plan.at = endsAt + RAID_LEAD_TIME;
      }
      if (police.majorRaid && veedelCity(police.majorRaid.veedelIds[0]) === cityId && police.majorRaid.at < endsAt) {
        police.majorRaid.at = endsAt + RAID_LEAD_TIME;
      }
    },
    'encounter.resolved': (ctx, { kind, outcome, request }) => {
      if (request.origin?.module === 'police') {
        if (request.origin.ref === 'check' && request.veedelId) {
          onChaseResolved(ctx, outcome, request.veedelId, request.spotId ?? null, request.staffIds ?? []);
        }
        return;
      }
      // Jede andere Konfrontation im Veedel ist Gewalt, die die Polizei mitbekommt. Begegnungen mit der Polizei selbst
      // nicht: Eine friedliche Kontrolle ist keine Gewalt (Heat aus "Gewalt gegen Polizei" kommt aus der Handlung).
      if (!POLICE_ENCOUNTERS.includes(kind) && request.veedelId) reportViolence(ctx, request.veedelId);
    },
  },
  migrations: {
    2: (old: PoliceStateV1): PoliceStateV2 => {
      const { plannedRaids: _, majorRaid: _m, majorReadyAt: _r, tiers: _t, ...fresh } = initialState();
      return {
        ...fresh,
        heat: { ...old.heat },
        level: Object.fromEntries(Object.entries(old.heat).map(([id, heat]) => [id, heatLevel(heat).index])),
      };
    },
    3: (old: PoliceStateV2): PoliceStateV3 => ({ ...old, plannedRaids: {} }),
    // Version 4: geplante Razzien mit Art (alte zählen als Razzia im Veedel), Großrazzia, Stufe (wird neu bestimmt).
    4: (old: PoliceStateV3): PoliceStateV4 => ({
      ...old,
      plannedRaids: Object.fromEntries(
        Object.entries(old.plannedRaids).map(([id, at]) => [id, { at, scope: 'veedel' as const, spotId: null }]),
      ),
      majorRaid: null,
      majorReadyAt: 0,
      tier: null,
    }),
    // Version 5 (Auftrag 30): Stufe pro Stadt; die bisherige war Köln. Hamburgs Heat fehlt und zählt als 0.
    5: (old: PoliceStateV4): PoliceStateV5 => {
      const { tier, ...rest } = old;
      return { ...rest, tiers: tier === null ? {} : { koeln: tier } };
    },
    // Version 6 (Auftrag 40): Zoll-Heat pro Hafen, bisher überall ruhig.
    6: (old: PoliceStateV5): PoliceState => ({ ...old, customs: {} }),
  },
});
