import { describe, expect, it } from 'vitest';
import type { GameState } from '../core';
import { bumpStateRevision, enableStateMemo, memoState, memoStateKeyed } from './stateMemo';

const fakeState = (time = 10) => ({ time, nextId: 1 }) as unknown as GameState;

describe('memoState', () => {
  enableStateMemo();

  it('rechnet pro Stand einmal und neu nach einer Änderung', () => {
    const state = fakeState();
    let calls = 0;
    const read = memoState(() => ++calls);
    expect(read(state)).toBe(1);
    expect(read(state)).toBe(1);
    bumpStateRevision();
    expect(read(state)).toBe(2);
    state.time = 11;
    expect(read(state)).toBe(3);
    expect(read(fakeState(11))).toBe(4);
  });

  it('memoStateKeyed merkt je Schlüssel und vergisst alles bei neuem Stand', () => {
    const state = fakeState();
    const calls: string[] = [];
    const read = memoStateKeyed(
      (_state: GameState, period: string, filter: string) => {
        calls.push(`${period}|${filter}`);
        return calls.length;
      },
      (period, filter) => `${period}|${filter}`,
    );
    expect(read(state, 'week', 'all')).toBe(1);
    expect(read(state, 'week', 'all')).toBe(1);
    expect(read(state, 'month', 'all')).toBe(2);
    expect(read(state, 'week', 'all')).toBe(1);
    bumpStateRevision();
    expect(read(state, 'week', 'all')).toBe(3);
    expect(calls).toEqual(['week|all', 'month|all', 'week|all']);
  });
});
