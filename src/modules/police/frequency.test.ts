// Auftrag 46e: Kontrollen und Razzien kommen etwa halb so oft wie vorher (Erwartungswert über viele Würfe), dafür mit
// mehr Beute. Die alten Werte stehen hier als Zahlen, damit ein späteres Drehen an den Stellschrauben bewusst passiert.

import { describe, expect, it } from 'vitest';
import { keyedRandom } from '../../core';
import {
  CHECK_CHANCE_PER_HOUR,
  CHECK_GOODS,
  CHECK_MONEY,
  CHECK_THRESHOLD,
  MAJOR_RAID_CHANCE_PER_HOUR,
  MAX_HEAT,
  RAID_CHANCE_PER_HOUR,
  RAID_SCOPES,
  RAID_THRESHOLD,
} from './config';

/** Wie die Polizei würfelt: ab der Schwelle anteilig bis zur vollen Chance bei Heat 100. */
function ramped(heat: number, threshold: number, chance: number): number {
  if (heat < threshold) return 0;
  return chance * (0.25 + (0.75 * (heat - threshold)) / (MAX_HEAT - threshold));
}

/** Erwartungswert als Anteil der Treffer über viele feste Würfe. */
function hitRate(chance: number, rolls = 40_000): number {
  const random = keyedRandom('police:frequency');
  let hits = 0;
  for (let i = 0; i < rolls; i++) if (random() < chance) hits++;
  return hits / rolls;
}

const BEFORE = { check: 0.08, raid: 0.06, major: 0.06, checkGoodsMax: 8, checkMoneyMax: 150, raidSpotGoodsMax: 15 };

describe('Polizei seltener, größer (Auftrag 46e)', () => {
  it('Kontrollen und Razzien pro Stunde sind halb so wahrscheinlich wie vorher', () => {
    expect(CHECK_CHANCE_PER_HOUR).toBeCloseTo(BEFORE.check / 2, 5);
    expect(RAID_CHANCE_PER_HOUR).toBeCloseTo(BEFORE.raid / 2, 5);
    expect(MAJOR_RAID_CHANCE_PER_HOUR).toBeCloseTo(BEFORE.major / 2, 5);
  });

  it('Erwartungswert über viele Würfe: bei Heat 65 etwa 0,6 Kontrollen und 0,05 Razzien pro Tag (vorher das Doppelte)', () => {
    const checks = 24 * hitRate(ramped(65, CHECK_THRESHOLD, CHECK_CHANCE_PER_HOUR));
    const checksBefore = 24 * ramped(65, CHECK_THRESHOLD, BEFORE.check);
    expect(checks).toBeGreaterThan(checksBefore * 0.4);
    expect(checks).toBeLessThan(checksBefore * 0.6);
    const raids = 24 * hitRate(ramped(65, RAID_THRESHOLD, RAID_CHANCE_PER_HOUR));
    const raidsBefore = 24 * ramped(65, RAID_THRESHOLD, BEFORE.raid);
    expect(raids).toBeGreaterThan(raidsBefore * 0.3);
    expect(raids).toBeLessThan(raidsBefore * 0.7);
  });

  it('dafür nimmt eine Kontrolle doppelt und eine Razzia anderthalbfach so viel mit', () => {
    expect(CHECK_GOODS.max).toBe(BEFORE.checkGoodsMax * 2);
    expect(CHECK_MONEY.max).toBe(BEFORE.checkMoneyMax * 2);
    expect(RAID_SCOPES.spot.goodsMax).toBeGreaterThanOrEqual(BEFORE.raidSpotGoodsMax * 1.5);
    expect(RAID_SCOPES.veedel.goodsShare).toBeGreaterThan(0.08);
    expect(RAID_SCOPES.major.moneyShare).toBeGreaterThan(0.2);
  });
});
