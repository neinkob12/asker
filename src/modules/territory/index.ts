// Reviere: Einfluss pro Veedel und Fraktion. Fraktionen sind der Spieler ('player') und die Gangs (Gang-ID).
// Stand Fundament: Startverteilung und Lesen/Ändern. Einfluss durch Verkäufe, Verfall und die
// Siegbedingung baut Auftrag 10.
//
// Öffentliche API:
//   PLAYER_FACTION, getInfluence(state, veedelId, faction), influenceIn(state, veedelId),
//   addInfluence(ctx, veedelId, faction, delta), controllerOf(state, veedelId), controlledBy(state, faction),
//   factions(state), factionName(state, faction), factionColor(state, faction)
// Ereignisse: 'territory.controlChanged'

import { type Ctx, defineModule, type GameState } from '../../core';
import { getGang, getGangs } from '../gangs';
import { allVeedel } from '../veedel';
import { CONTROL_THRESHOLD, MAX_INFLUENCE, PLAYER_COLOR, START_OWNER_INFLUENCE } from './config';

/** Fraktion: 'player' oder eine Gang-ID. */
export type FactionId = string;
export const PLAYER_FACTION: FactionId = 'player';

export interface TerritoryState {
  /** Einfluss pro Veedel und Fraktion (0–100). Fehlende Einträge zählen als 0. */
  influence: Record<string, Record<FactionId, number>>;
  /** Wer kontrolliert welches Veedel (null = niemand). */
  controller: Record<string, FactionId | null>;
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
  const territory = ctx.state.modules.territory;
  const row = territory.influence[veedelId] ?? {};
  territory.influence[veedelId] = row;
  row[faction] = Math.min(MAX_INFLUENCE, Math.max(0, (row[faction] ?? 0) + delta));
  updateController(ctx, veedelId);
  return row[faction];
}

/** Fraktion mit dem meisten Einfluss, wenn er die Schwelle erreicht. */
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
  if (faction === null) return '#7f8c8d';
  return faction === PLAYER_FACTION ? PLAYER_COLOR : (getGang(state, faction)?.color ?? '#7f8c8d');
}

function computeController(row: Record<FactionId, number>): FactionId | null {
  let best: FactionId | null = null;
  let bestValue = -1;
  for (const [faction, value] of Object.entries(row)) {
    if (value > bestValue) {
      best = faction;
      bestValue = value;
    }
  }
  return bestValue >= CONTROL_THRESHOLD ? best : null;
}

function updateController(ctx: Ctx, veedelId: string): void {
  const territory = ctx.state.modules.territory;
  const from = territory.controller[veedelId] ?? null;
  const to = computeController(territory.influence[veedelId] ?? {});
  if (from === to) return;
  territory.controller[veedelId] = to;
  ctx.emit('territory.controlChanged', { veedelId, from, to });
}

/** Startverteilung: Jedes Veedel gehört der Gang mit dem nächstgelegenen Heimat-Veedel. */
function initialState(state: GameState): TerritoryState {
  const gangs = getGangs(state);
  const veedel = allVeedel();
  const influence: TerritoryState['influence'] = {};
  const controller: TerritoryState['controller'] = {};
  for (const v of veedel) {
    let owner: string | null = null;
    let best = Infinity;
    for (const g of gangs) {
      const home = veedel.find((x) => x.id === g.homeVeedelId);
      if (!home) continue;
      const d = (home.center.lng - v.center.lng) ** 2 + (home.center.lat - v.center.lat) ** 2;
      if (d < best) {
        best = d;
        owner = g.id;
      }
    }
    influence[v.id] = { [PLAYER_FACTION]: 0 };
    if (owner) influence[v.id][owner] = START_OWNER_INFLUENCE;
    controller[v.id] = computeController(influence[v.id]);
  }
  return { influence, controller };
}

export default defineModule({
  id: 'territory',
  version: 1,
  dependsOn: ['veedel', 'gangs'],
  init: (ctx) => initialState(ctx.state),
});
