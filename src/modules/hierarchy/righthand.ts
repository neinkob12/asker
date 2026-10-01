// Rechte Hand (Etappe 4): wird gleich ausgebaut.

import type { CommandResult, Ctx, GameState } from '../../core';
import type { RightHandPost, RightHandSettings } from './types';

export function getRightHand(state: GameState): RightHandPost | null {
  return state.modules.hierarchy.rightHand;
}
export function isRightHand(state: GameState, staffId: string): boolean {
  return getRightHand(state)?.staffId === staffId;
}
export function canBeRightHand(_state: GameState, _staffId: string): CommandResult {
  return { ok: false, reason: 'Noch nicht möglich.' };
}
export function rightHandOffered(_state: GameState): boolean {
  return false;
}
export function rightHandSatisfaction(_state: GameState): number | null {
  return null;
}
export function payrollReserve(_state: GameState): number {
  return 0;
}
export function rightHandBudgetLeft(_state: GameState): number | null {
  return null;
}
export function leadSpendingLimit(_state: GameState): number {
  return Number.POSITIVE_INFINITY;
}
export function recordLeadSpending(_ctx: Ctx, _amount: number): void {}
export function appointRightHand(_ctx: Ctx, _staffId: string): CommandResult {
  return { ok: false, reason: 'Noch nicht möglich.' };
}
export function dismissRightHand(_ctx: Ctx): CommandResult {
  return { ok: false, reason: 'Du hast keine Rechte Hand.' };
}
export function configureRightHand(_ctx: Ctx, _settings: Partial<RightHandSettings>): CommandResult {
  return { ok: false, reason: 'Du hast keine Rechte Hand.' };
}
export function onRightHandLeft(_ctx: Ctx, _staffId: string): void {}
export function rightHandDaily(_ctx: Ctx): void {}
export function rightHandTick(_ctx: Ctx): void {}
