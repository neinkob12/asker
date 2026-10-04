import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../../../core';
import { raidShown, recordSaleGlow, recordSpotRaid, resetSpotGlow, saleGlow, syncSpotGlow } from './glow';

/** Nur, was syncSpotGlow liest. */
const at = (runId: string, time: number) => ({ meta: { runId }, time }) as unknown as GameState;

describe('Spot-Optik: Merker pro Durchgang', () => {
  beforeEach(() => resetSpotGlow());

  it('zeigt eine Razzia und ein Glimmen eine Weile, danach nicht mehr', () => {
    syncSpotGlow(at('a', 1000));
    recordSpotRaid('s1', 1000);
    recordSaleGlow('s1', 1000);
    expect(raidShown('s1', 1010)).toBe(true);
    expect(saleGlow('s1', 1010)).toBeGreaterThan(0);
    expect(raidShown('s1', 1000 + 500)).toBe(false);
    expect(saleGlow('s1', 1000 + 500)).toBe(0);
  });

  it('vergisst alles bei einem neuen Durchgang', () => {
    syncSpotGlow(at('a', 1000));
    recordSpotRaid('s1', 1000);
    recordSaleGlow('s1', 1000);
    syncSpotGlow(at('b', 1005));
    expect(raidShown('s1', 1005)).toBe(false);
    expect(saleGlow('s1', 1005)).toBe(0);
  });

  it('wirft beim Laden eines früheren Stands desselben Durchgangs Einträge aus der Zukunft weg', () => {
    syncSpotGlow(at('a', 1000));
    recordSaleGlow('s1', 400);
    recordSaleGlow('s1', 990);
    recordSpotRaid('s2', 990);
    syncSpotGlow(at('a', 420));
    expect(raidShown('s2', 420)).toBe(false);
    // Der Verkauf von Minute 400 bleibt (noch nicht in der Zukunft), der von 990 ist weg.
    expect(saleGlow('s1', 420)).toBeCloseTo(1 - 20 / 90);
  });
});
