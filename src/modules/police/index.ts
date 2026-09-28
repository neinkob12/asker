// Polizei (leicht): Heat pro Veedel. Stand Fundament: Heat lesen und erhöhen, Gangs verpfeifen.
// Heat durch Verkäufe, Verfall, Kontrollen, Razzien und Festnahmen baut Auftrag 10.
//
// Öffentliche API:
//   getHeat(state, veedelId), addHeat(ctx, veedelId, amount), snitchOnGang(ctx, gangId)
// Befehle: 'police.snitch'
// Ereignisse: 'police.raid', 'police.arrest', 'police.tipOff'

import { type CommandResult, type Ctx, defineModule, type GameState, journal } from '../../core';
import { getGang } from '../gangs';
import { controlledBy, type FactionId } from '../territory';
import { allVeedel } from '../veedel';
import { MAX_HEAT, SNITCH_HEAT } from './config';

export interface PoliceState {
  /** Heat pro Veedel (0–100). */
  heat: Record<string, number>;
}

declare module '../../core' {
  interface ModuleStates {
    police: PoliceState;
  }
  interface GameCommands {
    /** Eine Gang bei der Polizei verpfeifen. */
    'police.snitch': { gangId: string };
  }
  interface GameEvents {
    /** Razzia in einem Veedel. target = betroffene Fraktion ('player' oder Gang-ID). */
    'police.raid': { veedelId: string; target: FactionId; spotId?: string };
    /** Ein Mitarbeiter wurde festgenommen. Den Haft-Status setzt das staff-Modul. */
    'police.arrest': { staffId: string; veedelId: string };
    /** Eine Gang wurde verpfiffen. */
    'police.tipOff': { gangId: string; veedelIds: string[] };
  }
}

export function getHeat(state: GameState, veedelId: string): number {
  return state.modules.police.heat[veedelId] ?? 0;
}

/** Heat erhöhen (negativ: senken), begrenzt auf 0–100. Gibt den neuen Wert zurück. */
export function addHeat(ctx: Ctx, veedelId: string, amount: number): number {
  const heat = ctx.state.modules.police.heat;
  heat[veedelId] = Math.min(MAX_HEAT, Math.max(0, (heat[veedelId] ?? 0) + amount));
  return heat[veedelId];
}

/** Gang verpfeifen: mehr Heat in ihren Veedeln. */
export function snitchOnGang(ctx: Ctx, gangId: string): CommandResult {
  const gang = getGang(ctx.state, gangId);
  if (!gang) return { ok: false, reason: 'Diese Gang gibt es nicht.' };
  const veedelIds = controlledBy(ctx.state, gangId);
  for (const veedelId of veedelIds) addHeat(ctx, veedelId, SNITCH_HEAT);
  journal.add(ctx, `Du hast ${gang.name} bei den Bullen verpfiffen.`, 'info');
  ctx.emit('police.tipOff', { gangId, veedelIds });
  return { ok: true };
}

export default defineModule({
  id: 'police',
  version: 1,
  dependsOn: ['veedel', 'territory'],
  init: () => ({ heat: Object.fromEntries(allVeedel().map((v) => [v.id, 0])) }),
  commands: {
    'police.snitch': (ctx, { gangId }) => snitchOnGang(ctx, gangId),
  },
});
