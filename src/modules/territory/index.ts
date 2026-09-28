// Reviere: Einfluss pro Veedel und Fraktion. Fraktionen sind der Spieler ('player') und die Gangs (Gang-ID).
//
// - Eigene Verkäufe (sale.completed) bringen Einfluss und drängen die stärkste Gang im Veedel zurück.
// - Präsenz: Aktive Mitarbeiter im Veedel bringen jede Stunde etwas Einfluss. Wer im Veedel weder Leute noch einen
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
//   hasPlayerPresence(state, veedelId), campaignProgress(state)
// Ereignisse: 'territory.controlChanged'

import { type Ctx, defineModule, type GameState, journal, outcome } from '../../core';
import { getGang, getGangs } from '../gangs';
import { getStaff } from '../staff';
import { allVeedel, getVeedel, neighborsOf, veedelName } from '../veedel';
import {
  CONTROL_THRESHOLD,
  DECAY_PER_HOUR,
  GANG_PRESSURE_PER_HOUR,
  GANG_REGEN_PER_HOUR,
  LOSE_CONTROL_THRESHOLD,
  MAX_INFLUENCE,
  NEUTRAL_COLOR,
  PLAYER_COLOR,
  SALE_DISPLACEMENT,
  SALE_INFLUENCE_BASE,
  SALE_INFLUENCE_MAX,
  SALE_INFLUENCE_PER_UNIT,
  SALE_PRESENCE_MINUTES,
  STAFF_PRESENCE_MAX,
  STAFF_PRESENCE_PER_HOUR,
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
}

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
  /** Veedel, die der Spieler kontrolliert. */
  controlled: number;
  /** So viele braucht er für "Köln übernehmen" (Mehrheit). */
  needed: number;
  total: number;
  won: boolean;
}

declare module '../../core' {
  interface ModuleStates {
    territory: TerritoryState;
  }
  interface GameEvents {
    'territory.controlChanged': { veedelId: string; from: FactionId | null; to: FactionId | null };
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

/** Hat der Spieler Leute im Veedel oder dort kürzlich verkauft? */
export function hasPlayerPresence(state: GameState, veedelId: string): boolean {
  const presence = playerPresence(state, veedelId);
  return presence.staff > 0 || presence.recentSale;
}

/** Fortschritt beim Kampagnenziel "Köln übernehmen". */
export function campaignProgress(state: GameState): CampaignProgress {
  const total = allVeedel().length;
  return {
    controlled: controlledBy(state, PLAYER_FACTION).length,
    needed: Math.floor(total / 2) + 1,
    total,
    won: outcome.hasWon(state),
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
 * wer mindestens CONTROL_THRESHOLD und mehr Einfluss als der bisherige Herr hat (bei mehreren: der stärkste).
 */
function computeController(row: Record<FactionId, number>, current: FactionId | null): FactionId | null {
  const holder = current !== null && (row[current] ?? 0) >= LOSE_CONTROL_THRESHOLD ? current : null;
  let best = holder;
  let bestValue = holder !== null ? row[holder] : CONTROL_THRESHOLD - Number.EPSILON;
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
function onSale(ctx: Ctx, veedelId: string, amount: number): void {
  if (!getVeedel(veedelId)) return;
  ctx.state.modules.territory.lastSaleAt[veedelId] = ctx.now;
  const gain = Math.min(SALE_INFLUENCE_MAX, SALE_INFLUENCE_BASE + SALE_INFLUENCE_PER_UNIT * Math.max(0, amount));
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
  for (const v of allVeedel()) {
    const row = state.modules.territory.influence[v.id] ?? {};
    const owner = controllers[v.id] ?? null;
    for (const [faction, value] of Object.entries(row)) {
      if (faction === PLAYER_FACTION) {
        const presence = playerPresence(state, v.id);
        if (presence.staff > 0) {
          changeInfluence(state, v.id, faction, STAFF_PRESENCE_PER_HOUR * Math.min(presence.staff, STAFF_PRESENCE_MAX));
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
  const progress = campaignProgress(state);
  if (to === PLAYER_FACTION && progress.controlled >= progress.needed) outcome.win(ctx);
}

/**
 * Startverteilung: Jedes Veedel gehört der Gang, deren Heimat-Veedel am nächsten liegt (erst Nachbarschaftsschritte,
 * dann Luftlinie). Die Gang bekommt den Startwert aus den Veedel-Daten, der Spieler startet überall bei 0.
 */
function initialState(state: GameState): TerritoryState {
  const gangs = getGangs(state);
  const influence: TerritoryState['influence'] = {};
  const controller: TerritoryState['controller'] = {};
  const hops = new Map(gangs.map((g) => [g.id, graphDistances(g.homeVeedelId)]));
  for (const v of allVeedel()) {
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
  return { influence, controller, lastSaleAt: {} };
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
  version: 2,
  dependsOn: ['veedel', 'gangs'],
  init: (ctx) => initialState(ctx.state),
  tickEvery: 60,
  tick,
  on: {
    'sale.completed': (ctx, { veedelId, amount }) => onSale(ctx, veedelId, amount),
    'territory.controlChanged': (ctx, { veedelId, from, to }) => onControlChanged(ctx, veedelId, from, to),
  },
  migrations: {
    2: (old: TerritoryStateV1): TerritoryState => ({ ...old, lastSaleAt: {} }),
  },
});
