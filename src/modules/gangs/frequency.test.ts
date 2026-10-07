// Auftrag 46e: Angriffe, Forderungen und Übernahmen der Gangs kommen etwa halb so oft wie vorher (Erwartungswert über
// viele Würfe), dafür mit mehr Beute. Die alten Werte stehen hier als Zahlen.

import { describe, expect, it } from 'vitest';
import { keyedRandom } from '../../core';
import {
  ATTACK_CHANCE,
  BLACKMAIL_BASE,
  BURGLARY_SHARE,
  EXPAND_CHANCE,
  METHOD_INTERVAL_BY_CITY,
  RAID_EFFECTS,
} from './config';

function hitRate(chance: number, rolls = 40_000): number {
  const random = keyedRandom('gangs:frequency');
  let hits = 0;
  for (let i = 0; i < rolls; i++) if (random() < chance) hits++;
  return hits / rolls;
}

const BEFORE = {
  attack: 0.02,
  expand: 0.01,
  methodKoeln: [4, 8] as const,
  spotGoods: [-25, -10] as const,
  spotMoneyShare: -0.1,
  warehouseGoodsShare: -0.35,
  burglaryShare: 0.15,
  blackmailBase: 300,
};

describe('Gangs seltener, größer (Auftrag 46e)', () => {
  it('Überfälle und Vorstöße pro Stunde sind halb so wahrscheinlich, Methoden kommen in doppeltem Abstand', () => {
    expect(ATTACK_CHANCE).toBeCloseTo(BEFORE.attack / 2, 5);
    expect(EXPAND_CHANCE).toBeCloseTo(BEFORE.expand / 2, 5);
    expect(METHOD_INTERVAL_BY_CITY.koeln).toEqual([BEFORE.methodKoeln[0] * 2, BEFORE.methodKoeln[1] * 2]);
    for (const [from, to] of Object.values(METHOD_INTERVAL_BY_CITY)) expect(to).toBeGreaterThan(from);
  });

  it('Erwartungswert über viele Würfe: bei voller Feindseligkeit etwa 0,24 Überfälle pro Tag (vorher 0,48)', () => {
    const perDay = 24 * hitRate(ATTACK_CHANCE);
    expect(perDay).toBeGreaterThan(24 * BEFORE.attack * 0.4);
    expect(perDay).toBeLessThan(24 * BEFORE.attack * 0.6);
  });

  it('dafür nimmt ein Überfall mehr mit, Einbruch und Erpressung ebenso', () => {
    expect(RAID_EFFECTS.spot.failure.goods[0]).toBeLessThan(BEFORE.spotGoods[0]);
    expect(RAID_EFFECTS.spot.failure.goods[1]).toBeLessThan(BEFORE.spotGoods[1]);
    expect(RAID_EFFECTS.spot.failure.moneyShare).toBeLessThan(BEFORE.spotMoneyShare);
    expect(RAID_EFFECTS.warehouse.failure.goodsShare).toBeLessThan(BEFORE.warehouseGoodsShare);
    expect(BURGLARY_SHARE).toBeGreaterThan(BEFORE.burglaryShare);
    expect(BLACKMAIL_BASE).toBeGreaterThan(BEFORE.blackmailBase);
  });
});
