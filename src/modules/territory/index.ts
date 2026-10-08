// Reviere: Einfluss pro Veedel und Fraktion. Fraktionen sind der Spieler ('player') und die Gangs (Gang-ID).
//
// - Eigene Verkäufe (sale.completed) bringen Einfluss und drängen die stärkste Gang im Veedel zurück.
// - Präsenz: Aktive Mitarbeiter im Veedel bringen jede Stunde etwas Einfluss. Ein Leutnant (hierarchy) bringt
//   zusätzlich Einfluss, je nach Level und Charisma, und hält das Veedel auch ohne Läufer. Wer im Veedel weder Leute noch einen
//   Verkauf in den letzten 24 Stunden hat, verliert langsam an Einfluss.
// - Gangs halten ihre Veedel (bauen Einfluss bis zum Startwert wieder auf) und holen sich vernachlässigte Veedel
//   langsam zurück. Die Gang-KI (Auftrag 11) arbeitet zusätzlich über addInfluence().
// - Kontrolle ab CONTROL_THRESHOLD, verloren unter LOSE_CONTROL_THRESHOLD (Hysterese). Wechsel lösen
//   'territory.controlChanged' aus. Kontrolliert der Spieler die Mehrheit der Veedel, ist die Kampagne gewonnen.
//
// Öffentliche API:
//   PLAYER_FACTION, CONTROL_THRESHOLD, getInfluence(state, veedelId, faction), influenceIn(state, veedelId),
//   addInfluence(ctx, veedelId, faction, delta), controllerOf(state, veedelId), controlledBy(state, faction),
//   factions(state), factionName(state, faction), factionColor(state, faction), playerPresence(state, veedelId),
//   saleInfluenceFactor(cityId) (Auftrag 30: in Hamburg bringt ein Verkauf weniger Einfluss),
//   hasPlayerPresence(state, veedelId), lieutenantInfluence(state, veedelId), campaignProgress(state, cityId?),
//   cityMilestones(state, cityId?)
// Kampagne (Auftrag 30): Die Mehrheit der Veedel einer Stadt ist ein Meilenstein ('campaign.milestone', "Boss von
// Köln"), erst alle Veedel sind der Sieg ("Köln komplett", outcome.win mit Stadt). Jeder Meilenstein nur einmal.
// Städte (Auftrag 30, Etappe 4): Jede Stadt hat ihre Gangs und ihre Startverteilung; stündlich ändert sich der Einfluss
// nur in der Stadt, die live ist (city.liveVeedel), die schlafende ist eingefroren.
// Ereignisse: 'territory.controlChanged'

import { type Ctx, defineModule, type GameState, journal, outcome } from '../../core';
import { activeCity, cityName, liveVeedel, majorityMakesBoss } from '../city';
import { getGang, getGangs } from '../gangs';
import { lieutenantSpots, lieutenantSpotsIn, lieutenantsInVeedel } from '../hierarchy';
import { getStaff, getStaffMember } from '../staff';
import { allVeedel, getVeedel, neighborsOf, veedelCity, veedelName } from '../veedel';
import {
  CONTROL_THRESHOLD,
  DECAY_PER_HOUR,
  GANG_PRESSURE_PER_HOUR,
  GANG_REGEN_PER_HOUR,
  LIEUTENANT_CLUSTER_BONUS,
  LIEUTENANT_INFLUENCE_PER_HOUR,
  LIEUTENANT_INFLUENCE_PER_LEVEL,
  LOSE_CONTROL_THRESHOLD,
  MAX_INFLUENCE,
  NEUTRAL_COLOR,
  PLAYER_COLOR,
  SALE_DISPLACEMENT,
  SALE_INFLUENCE_BASE,
  SALE_INFLUENCE_BY_CITIES_DONE,
  SALE_INFLUENCE_FACTOR_BY_CITY,
  SALE_INFLUENCE_MAX,
  SALE_INFLUENCE_PER_UNIT,
  SALE_PRESENCE_MINUTES,
  STAFF_PRESENCE_MAX,
  STAFF_PRESENCE_PER_HOUR,
  TAKEOVER_MARGIN,
} from './config';

export { CONTROL_THRESHOLD, LOSE_CONTROL_THRESHOLD } from './config';

/** Fraktion: 'player' oder eine Gang-ID. */
export type FactionId = string;
export const PLAYER_FACTION: FactionId = 'player';

export interface TerritoryState {
  /** Einfluss pro Veedel und Fraktion (0–100). Fehlende Einträge zählen als 0. */
  influence: Record<string, Record<FactionId, number>>;
  /** Wer kontrolliert welches Veedel (null = niemand). */
  controller: Record<string, FactionId | null>;
  /** Letzter eigener Verkauf pro Veedel (Spielminute). Zählt eine Weile als Präsenz. */
  lastSaleAt: Record<string, number>;
  /**
   * Meilensteine der Kampagne pro Stadt (Auftrag 30): Mehrheit der Veedel ("Boss von Köln") und alle Veedel ("Köln
   * komplett"), jeweils die Spielminute, in der es zum ersten Mal so weit war.
   */
  milestones: Record<string, CityMilestones>;
}

export interface CityMilestones {
  majority: number | null;
  complete: number | null;
}

/** Zustand in Version 2 (ohne Meilensteine). */
type TerritoryStateV2 = Omit<TerritoryState, 'milestones'>;

/** Zustand in Version 1 (Fundament). */
interface TerritoryStateV1 {
  influence: Record<string, Record<FactionId, number>>;
  controller: Record<string, FactionId | null>;
}

export interface PlayerPresence {
  /** Aktive eigene Mitarbeiter an Spots im Veedel. */
  staff: number;
  /** Eigener Verkauf in den letzten 24 Spielstunden. */
  recentSale: boolean;
}

export interface CampaignProgress {
  /** Veedel, die der Spieler in dieser Stadt kontrolliert. */
  controlled: number;
  /** So viele braucht er für "Stadt komplett": alle Veedel der Stadt (bis Auftrag 30 war es die Mehrheit). */
  needed: number;
  /** Mehrheit der Veedel: Meilenstein "Boss von Köln" (kein Sieg mehr). */
  majority: number;
  total: number;
  /** Stadt komplett übernommen (oder alter Spielstand, in dem die Mehrheit noch als Sieg galt). */
  won: boolean;
  /** Meilenstein Mehrheit schon erreicht (einmal erreicht, bleibt er). */
  majorityReached: boolean;
  /** Stadt komplett (alle Veedel), einmal erreicht, bleibt es. */
  complete: boolean;
}

/** Standard-Stadt der Kampagne für alte Aufrufer ohne Stadt (Köln, der Einstieg). */
export const DEFAULT_CITY = 'koeln';

/** Was nach "Köln komplett" passiert (Hinweis im Sieg-Bildschirm und im Journal). */
const AFTER_COMPLETE: Record<string, string> = {
  koeln: 'Gleich klingelt dein Telefon.',
  hamburg: 'Hamburg gehört dir, der Hafen auch. Die nächste Stadt meldet sich, sobald eine frei ist.',
  berlin: 'Berlin gehört dir, die Nacht auch. Die nächste Stadt meldet sich, sobald eine frei ist.',
  muenchen: 'München gehört dir, die Wiesn auch. Die nächste Stadt meldet sich, sobald eine frei ist.',
  frankfurt: 'Frankfurt gehört dir, Banken und Flughafen auch. Die nächste Stadt meldet sich, sobald eine frei ist.',
};

/** Nach der letzten Stadt (Auftrag 40). */
const GERMANY_COMPLETE = 'Ganz Deutschland hört auf dich. Gleich ruft jemand aus Rotterdam an.';

declare module '../../core' {
  interface ModuleStates {
    territory: TerritoryState;
  }
  interface GameEvents {
    'territory.controlChanged': { veedelId: string; from: FactionId | null; to: FactionId | null };
    /** Meilenstein der Kampagne: Mehrheit der Veedel einer Stadt ("Boss von Köln"). Kein Sieg. */
    'campaign.milestone': { kind: 'majority'; cityId: string; controlled: number; total: number };
  }
}

export function getInfluence(state: GameState, veedelId: string, faction: FactionId): number {
  return state.modules.territory.influence[veedelId]?.[faction] ?? 0;
}

/** Einfluss aller Fraktionen in einem Veedel. */
export function influenceIn(state: GameState, veedelId: string): Record<FactionId, number> {
  return { ...(state.modules.territory.influence[veedelId] ?? {}) };
}

/** Einfluss ändern (auf 0–100 begrenzt). Gibt den neuen Wert zurück. Meldet Kontrollwechsel. */
export function addInfluence(ctx: Ctx, veedelId: string, faction: FactionId, delta: number): number {
  const value = changeInfluence(ctx.state, veedelId, faction, delta);
  updateController(ctx, veedelId);
  return value;
}

/** Wer das Veedel kontrolliert (null = niemand). */
export function controllerOf(state: GameState, veedelId: string): FactionId | null {
  return state.modules.territory.controller[veedelId] ?? null;
}

/** IDs der Veedel, die eine Fraktion kontrolliert. */
export function controlledBy(state: GameState, faction: FactionId): string[] {
  return Object.entries(state.modules.territory.controller)
    .filter(([, owner]) => owner === faction)
    .map(([veedelId]) => veedelId);
}

export function factions(state: GameState): FactionId[] {
  return [PLAYER_FACTION, ...getGangs(state).map((g) => g.id)];
}

export function factionName(state: GameState, faction: FactionId): string {
  return faction === PLAYER_FACTION ? 'Du' : (getGang(state, faction)?.name ?? faction);
}

export function factionColor(state: GameState, faction: FactionId | null): string {
  if (faction === null) return NEUTRAL_COLOR;
  return faction === PLAYER_FACTION ? PLAYER_COLOR : (getGang(state, faction)?.color ?? NEUTRAL_COLOR);
}

/** Wie präsent ist der Spieler in einem Veedel? */
export function playerPresence(state: GameState, veedelId: string): PlayerPresence {
  const lastSale = state.modules.territory.lastSaleAt[veedelId];
  return {
    staff: getStaff(state, { veedelId, status: 'active' }).length,
    recentSale: lastSale !== undefined && state.time - lastSale <= SALE_PRESENCE_MINUTES,
  };
}

/**
 * Zusätzlicher Einfluss pro Stunde durch aktive Leutnants mit Spots im Veedel (0 ohne Leutnant). Jeder Leutnant
 * bringt seinen Einfluss anteilig nach der Zahl seiner Spots dort, gebündelte Spots wirken stärker.
 */
export function lieutenantInfluence(state: GameState, veedelId: string): number {
  let total = 0;
  for (const staffId of lieutenantsInVeedel(state, veedelId)) {
    const lt = getStaffMember(state, staffId);
    if (lt?.status !== 'active' || lt.leftAt !== null) continue;
    const all = lieutenantSpots(state, staffId).length;
    const here = lieutenantSpotsIn(state, staffId, veedelId);
    if (all === 0 || here === 0) continue;
    const charisma = 0.75 + lt.stats.charisma / 200;
    const value = (LIEUTENANT_INFLUENCE_PER_HOUR + LIEUTENANT_INFLUENCE_PER_LEVEL * (lt.level - 1)) * charisma;
    total += value * (here / all) * (1 + LIEUTENANT_CLUSTER_BONUS * (here - 1));
  }
  return Math.round(total * 1000) / 1000;
}

/** Hat der Spieler Leute im Veedel oder dort kürzlich verkauft? */
export function hasPlayerPresence(state: GameState, veedelId: string): boolean {
  const presence = playerPresence(state, veedelId);
  return presence.staff > 0 || presence.recentSale;
}

/** Veedel einer Stadt. */
function cityVeedel(cityId: string): readonly { id: string }[] {
  return allVeedel(cityId);
}

/** Titel für die Bestenliste, sobald die Mehrheit der Kölner Veedel dir gehört (Meilenstein, Auftrag 30). */
export const MILESTONE_TITLE = 'Boss von Köln';

/**
 * Titel aus den Meilensteinen (Auftrag 46d, früher aus den Quests): „Boss von Köln“, sobald die Mehrheit in Köln
 * erreicht ist, sonst null. Die Bestenliste nimmt ihn, wenn es keinen Rang gibt.
 */
export function milestoneTitle(state: GameState): string | null {
  return cityMilestones(state, DEFAULT_CITY).majority !== null ? MILESTONE_TITLE : null;
}

/** Meilensteine einer Stadt (leer, solange nichts erreicht ist). */
export function cityMilestones(state: GameState, cityId: string = DEFAULT_CITY): CityMilestones {
  return state.modules.territory.milestones?.[cityId] ?? { majority: null, complete: null };
}

/** Fortschritt beim Kampagnenziel einer Stadt (Standard Köln): erst die Mehrheit, dann alle Veedel. */
export function campaignProgress(state: GameState, cityId: string = DEFAULT_CITY): CampaignProgress {
  const veedel = cityVeedel(cityId);
  const total = veedel.length;
  const mine = new Set(controlledBy(state, PLAYER_FACTION));
  const milestones = cityMilestones(state, cityId);
  const complete = milestones.complete !== null || outcome.hasWonCity(state, cityId);
  return {
    controlled: veedel.filter((v) => mine.has(v.id)).length,
    needed: total,
    majority: Math.floor(total / 2) + 1,
    total,
    // Alte Spielstände: Dort war die Mehrheit von Köln der Sieg (won ohne Städte-Liste).
    won: complete || (cityId === DEFAULT_CITY && !!state.outcome.won && !state.outcome.won.cities),
    majorityReached: milestones.majority !== null,
    complete,
  };
}

function changeInfluence(state: GameState, veedelId: string, faction: FactionId, delta: number): number {
  const territory = state.modules.territory;
  const row = territory.influence[veedelId] ?? {};
  territory.influence[veedelId] = row;
  const value = Math.min(MAX_INFLUENCE, Math.max(0, (row[faction] ?? 0) + delta));
  // Auf drei Nachkommastellen runden, damit der Spielstand lesbar bleibt.
  row[faction] = Math.round(value * 1000) / 1000;
  return row[faction];
}

/**
 * Kontrolle: Wer kontrolliert, behält das Veedel, solange er mindestens LOSE_CONTROL_THRESHOLD hat. Übernehmen kann,
 * wer mindestens CONTROL_THRESHOLD und TAKEOVER_MARGIN mehr Einfluss als der bisherige Herr hat (bei mehreren: der
 * stärkste). Der Abstand verhindert, dass ein umkämpftes Veedel ständig hin- und herspringt.
 */
function computeController(row: Record<FactionId, number>, current: FactionId | null): FactionId | null {
  const holder = current !== null && (row[current] ?? 0) >= LOSE_CONTROL_THRESHOLD ? current : null;
  let best = holder;
  let bestValue = holder !== null ? row[holder] + TAKEOVER_MARGIN : CONTROL_THRESHOLD - Number.EPSILON;
  for (const [faction, value] of Object.entries(row)) {
    if (faction !== holder && value >= CONTROL_THRESHOLD && value > bestValue) {
      best = faction;
      bestValue = value;
    }
  }
  return best;
}

function updateController(ctx: Ctx, veedelId: string): void {
  const territory = ctx.state.modules.territory;
  const from = territory.controller[veedelId] ?? null;
  const to = computeController(territory.influence[veedelId] ?? {}, from);
  if (from === to) return;
  territory.controller[veedelId] = to;
  ctx.emit('territory.controlChanged', { veedelId, from, to });
}

/** Eigener Verkauf: Einfluss für den Spieler, die stärkste Gang im Veedel wird zurückgedrängt. */
/** Einfluss pro Verkauf in einer Stadt (1 = wie in Köln; Hamburg weniger, die Gangs sitzen fester). */
export function saleInfluenceFactor(cityId: string, state?: GameState): number {
  const base = SALE_INFLUENCE_FACTOR_BY_CITY[cityId] ?? 1;
  if (!state) return base;
  const done = citiesDoneBefore(state, cityId);
  const table = SALE_INFLUENCE_BY_CITIES_DONE;
  return base * (table[Math.min(done, table.length - 1)] ?? 1);
}

/** Wie viele andere Städte du schon komplett hast (Meilenstein „komplett“, Auftrag 40). */
export function citiesDoneBefore(state: GameState, cityId: string): number {
  let n = 0;
  for (const [id, m] of Object.entries(state.modules.territory.milestones ?? {})) {
    if (id !== cityId && m.complete !== null) n++;
  }
  return n;
}

function onSale(ctx: Ctx, veedelId: string, amount: number): void {
  if (!getVeedel(veedelId)) return;
  ctx.state.modules.territory.lastSaleAt[veedelId] = ctx.now;
  const cityFactor = saleInfluenceFactor(veedelCity(veedelId), ctx.state);
  const gain =
    Math.min(SALE_INFLUENCE_MAX, SALE_INFLUENCE_BASE + SALE_INFLUENCE_PER_UNIT * Math.max(0, amount)) * cityFactor;
  changeInfluence(ctx.state, veedelId, PLAYER_FACTION, gain);
  const rival = strongestGang(ctx.state, veedelId);
  if (rival) changeInfluence(ctx.state, veedelId, rival, -gain * SALE_DISPLACEMENT);
  updateController(ctx, veedelId);
}

function strongestGang(state: GameState, veedelId: string): FactionId | null {
  let best: FactionId | null = null;
  let bestValue = 0;
  for (const [faction, value] of Object.entries(state.modules.territory.influence[veedelId] ?? {})) {
    if (faction !== PLAYER_FACTION && value > bestValue) {
      best = faction;
      bestValue = value;
    }
  }
  return best;
}

/** Stündlich: Präsenz bringt Einfluss, ohne Präsenz sinkt er. */
function tick(ctx: Ctx): void {
  const state = ctx.state;
  const controllers = { ...state.modules.territory.controller };
  const homes = new Map(getGangs(state).map((g) => [g.id, g.homeVeedelId]));
  for (const v of liveVeedel(state)) {
    const row = state.modules.territory.influence[v.id] ?? {};
    const owner = controllers[v.id] ?? null;
    for (const [faction, value] of Object.entries(row)) {
      if (faction === PLAYER_FACTION) {
        const presence = playerPresence(state, v.id);
        const lieutenant = lieutenantInfluence(state, v.id);
        if (presence.staff > 0 || lieutenant > 0) {
          const staffGain = STAFF_PRESENCE_PER_HOUR * Math.min(presence.staff, STAFF_PRESENCE_MAX);
          changeInfluence(state, v.id, faction, staffGain + lieutenant);
        } else if (!presence.recentSale && value > 0) {
          changeInfluence(state, v.id, faction, -DECAY_PER_HOUR);
        }
        continue;
      }
      if (value <= 0) continue;
      const cap = v.startInfluence;
      const backing = homes.get(faction) === v.id || neighborsOf(v.id).some((n) => controllers[n] === faction);
      const ruledByOtherGang = owner !== null && owner !== faction && owner !== PLAYER_FACTION;
      if (owner === faction) {
        if (value < cap) changeInfluence(state, v.id, faction, Math.min(GANG_REGEN_PER_HOUR, cap - value));
      } else if (backing && !ruledByOtherGang) {
        if (value < cap) changeInfluence(state, v.id, faction, Math.min(GANG_PRESSURE_PER_HOUR, cap - value));
      } else {
        changeInfluence(state, v.id, faction, -DECAY_PER_HOUR);
      }
    }
    updateController(ctx, v.id);
  }
  // Meilensteine auch ohne Kontrollwechsel (alte Spielstände, die schon alles halten).
  checkMilestones(ctx, activeCity(state));
}

/** Journal und Siegbedingung nach einem Kontrollwechsel. */
function onControlChanged(ctx: Ctx, veedelId: string, from: FactionId | null, to: FactionId | null): void {
  const state = ctx.state;
  const name = veedelName(veedelId);
  const ref = { veedelId };
  if (to === PLAYER_FACTION) {
    journal.add(ctx, `${name} gehört jetzt dir. Die Straße weiß, wer hier das Sagen hat.`, 'good', ref);
  } else if (from === PLAYER_FACTION) {
    const by = to === null ? 'Dein Griff ist zu locker geworden.' : `${factionName(state, to)} hat übernommen.`;
    journal.add(ctx, `Du hast ${name} verloren. ${by}`, 'bad', ref);
  } else if (to !== null) {
    journal.add(ctx, `${factionName(state, to)} kontrolliert jetzt ${name}.`, 'info', ref);
  } else if (from !== null) {
    journal.add(ctx, `${factionName(state, from)} hat ${name} nicht mehr im Griff. Das Veedel ist offen.`, 'info', ref);
  }
  if (to === PLAYER_FACTION) checkMilestones(ctx, veedelCity(veedelId));
}

/**
 * Meilensteine einer Stadt prüfen: Mehrheit ("Boss von Köln", Ereignis campaign.milestone, kein Sieg) und alle Veedel
 * (outcome.win, Sieg-Bildschirm "Köln komplett"). Jeder nur einmal.
 */
function checkMilestones(ctx: Ctx, cityId: string): void {
  const progress = campaignProgress(ctx.state, cityId);
  // Ein Ort ohne Veedel (Rotterdam in der Hafen-Phase, Auftrag 40) hat keine Kampagne.
  if (progress.total === 0) return;
  const t = ctx.state.modules.territory;
  t.milestones ??= {};
  t.milestones[cityId] ??= { majority: null, complete: null };
  const m = t.milestones[cityId];
  const name = cityName(cityId);
  if (m.majority === null && progress.controlled >= progress.majority) {
    m.majority = ctx.now;
    journal.add(
      ctx,
      `${majorityMakesBoss(cityId) ? `Boss von ${name}` : `Mehrheit in ${name}`}: ${progress.controlled} von ${progress.total} Veedeln hören auf dich. Jetzt den Rest.`,
      'good',
    );
    ctx.emit('campaign.milestone', {
      kind: 'majority',
      cityId,
      controlled: progress.controlled,
      total: progress.total,
    });
  }
  if (m.complete === null && progress.controlled >= progress.total) {
    m.complete = ctx.now;
    // Die letzte Stadt (Auftrag 40): Boss von Deutschland, gleich ruft Jansen aus Rotterdam an.
    const cities = new Set(allVeedel().map((v) => v.cityId));
    const all = [...cities].every((c) => c === cityId || (t.milestones[c]?.complete ?? null) !== null);
    const next = all && cities.size > 1 ? GERMANY_COMPLETE : AFTER_COMPLETE[cityId];
    outcome.win(ctx, next ? { cityId, cityName: name, next } : { cityId, cityName: name });
  }
}

/**
 * Startverteilung: Jedes Veedel gehört der Gang seiner Stadt, deren Heimat-Veedel am nächsten liegt (erst
 * Nachbarschaftsschritte, dann Luftlinie). Die Gang bekommt den Startwert aus den Veedel-Daten, der Spieler startet
 * überall bei 0.
 */
function initialState(state: GameState): TerritoryState {
  const influence: TerritoryState['influence'] = {};
  const controller: TerritoryState['controller'] = {};
  const hops = new Map(getGangs(state).map((g) => [g.id, graphDistances(g.homeVeedelId)]));
  for (const v of allVeedel()) {
    const gangs = getGangs(state, v.cityId);
    let owner: string | null = null;
    let best: [number, number] = [Infinity, Infinity];
    for (const g of gangs) {
      const home = getVeedel(g.homeVeedelId);
      if (!home) continue;
      const distance: [number, number] = [
        hops.get(g.id)?.get(v.id) ?? Infinity,
        (home.center.lng - v.center.lng) ** 2 + (home.center.lat - v.center.lat) ** 2,
      ];
      if (distance[0] < best[0] || (distance[0] === best[0] && distance[1] < best[1])) {
        best = distance;
        owner = g.id;
      }
    }
    influence[v.id] = { [PLAYER_FACTION]: 0 };
    if (owner) influence[v.id][owner] = v.startInfluence;
    controller[v.id] = computeController(influence[v.id], null);
  }
  return { influence, controller, lastSaleAt: {}, milestones: {} };
}

/**
 * Veedel, die im Spielstand fehlen (eine neue Stadt), bekommen Einfluss und Herren wie bei einem neuen Spiel; alles
 * Bestehende bleibt.
 */
function addMissingVeedel(old: TerritoryState, state: GameState): TerritoryState {
  const fresh = initialState(state);
  const influence = { ...old.influence };
  const controller = { ...old.controller };
  for (const v of allVeedel()) {
    if (influence[v.id]) continue;
    influence[v.id] = fresh.influence[v.id];
    controller[v.id] = fresh.controller[v.id];
  }
  return { ...old, influence, controller };
}

/** Schritte über die Nachbarschaft von einem Veedel zu allen anderen. */
function graphDistances(start: string): Map<string, number> {
  const distances = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of neighborsOf(current)) {
      if (distances.has(next)) continue;
      distances.set(next, (distances.get(current) ?? 0) + 1);
      queue.push(next);
    }
  }
  return distances;
}

export default defineModule({
  id: 'territory',
  version: 7,
  dependsOn: ['veedel', 'gangs'],
  init: (ctx) => initialState(ctx.state),
  tickEvery: 60,
  tick,
  on: {
    'sale.completed': (ctx, { veedelId, amount }) => onSale(ctx, veedelId, amount),
    'territory.controlChanged': (ctx, { veedelId, from, to }) => onControlChanged(ctx, veedelId, from, to),
  },
  migrations: {
    2: (old: TerritoryStateV1): TerritoryStateV2 => ({ ...old, lastSaleAt: {} }),
    // Version 3 (Auftrag 30): Meilensteine pro Stadt. Wer im alten Stand schon gewonnen hatte (damals reichte die
    // Mehrheit), behält den Sieg und hat den Meilenstein "Boss von Köln" zur Zeit des Siegs. Köln komplett kommt noch.
    3: (old: TerritoryStateV2, state: GameState): TerritoryState => {
      const controlled = Object.values(old.controller).filter((f) => f === PLAYER_FACTION).length;
      const total = allVeedel(DEFAULT_CITY).length;
      const majority = state.outcome.won?.time ?? (controlled >= Math.floor(total / 2) + 1 ? state.time : null);
      // Wer schon alle Veedel hat, bekommt "Köln komplett" beim nächsten stündlichen Tick (mit Sieg-Bildschirm).
      return { ...old, milestones: { [DEFAULT_CITY]: { majority, complete: null } } };
    },
    // Version 4 (Auftrag 30, Etappe 4): Hamburg kommt dazu. Seine Veedel bekommen Einfluss und Herren wie bei einem
    // neuen Spiel; alles Bestehende bleibt (es war Köln).
    4: (old: TerritoryState, state: GameState): TerritoryState => addMissingVeedel(old, state),
    // Version 5 (Auftrag 37): Berlin kommt dazu, genauso.
    5: (old: TerritoryState, state: GameState): TerritoryState => addMissingVeedel(old, state),
    // Version 6 (Auftrag 38): München kommt dazu, genauso.
    6: (old: TerritoryState, state: GameState): TerritoryState => addMissingVeedel(old, state),
    // Version 7 (Auftrag 39): Frankfurt kommt dazu, genauso.
    7: (old: TerritoryState, state: GameState): TerritoryState => addMissingVeedel(old, state),
  },
});
