// Geskripteter Gang-Angriff (Auftrag 46c): Der erste Angriff im Tutorial läuft fest ab, ohne Konfrontation und ohne
// Würfel. Die Gang, die das Veedel des Spots für sich beansprucht (sonst die mit dem meisten Einfluss dort, sonst die
// erste der Stadt), überfällt den Spot: Ein fester Anteil jeder Ware in allen Lagern der Stadt ist weg, dazu ein
// Anteil des Schwarzgelds. Die Gang schreibt in ihrer Stimme, das Journal hält es fest, ein Ereignis sagt es den
// anderen Modulen (das Tutorial startet darauf seine Tour).

import { type Ctx, journal, wallet } from '../../core';
import { formatProductAmount, getWarehouses, productName, stockSummary, take } from '../goods';
import { getSpot, spotCity } from '../spots';
import { getInfluence } from '../territory';
import { veedelName } from '../veedel';
import { say } from './common';
import { type Gang, gangNameIn } from './data';
import { getGangStatus, getGangs, veedelGang } from './state';

export interface ScriptedRaidRequest {
  spotId: string;
  /** Anteil jeder Ware in allen Lagern der Stadt, der weg ist (0,3 = 30 %). */
  goodsShare: number;
  /** Anteil des Schwarzgelds, der weg ist (0,4 = 40 %). */
  cashShare: number;
}

export interface ScriptedRaidResult {
  gangId: string;
  spotId: string;
  /** Gramm bzw. Stück, die weg sind (über alle Waren). */
  goodsLost: number;
  cashLost: number;
}

declare module '../../core' {
  interface GameEvents {
    /** Auftrag 46c: ein geskripteter Überfall ist durch (ohne Konfrontation). */
    'gang.raided': ScriptedRaidResult;
  }
}

/** Die Gang mit Anspruch auf das Veedel, sonst die mit dem meisten Einfluss dort, sonst die erste der Stadt. */
function raiderFor(ctx: Ctx, veedelId: string, cityId: string): Gang | undefined {
  const gangs = getGangs(ctx.state, cityId);
  const claimed = veedelGang(ctx.state, veedelId);
  const byClaim = claimed ? gangs.find((g) => g.id === claimed) : undefined;
  if (byClaim) return byClaim;
  let best: Gang | undefined;
  let bestInfluence = -1;
  for (const gang of gangs) {
    const influence = getInfluence(ctx.state, veedelId, gang.id);
    if (influence > bestInfluence) {
      best = gang;
      bestInfluence = influence;
    }
  }
  return best ?? gangs[0];
}

/**
 * Fester Überfall ohne Konfrontation (Auftrag 46c, erster Gang-Angriff im Tutorial). Gibt null zurück, wenn es den
 * Spot oder keine Gang in seiner Stadt gibt.
 */
export function scriptedRaid(ctx: Ctx, request: ScriptedRaidRequest): ScriptedRaidResult | null {
  const spot = getSpot(ctx.state, request.spotId);
  if (!spot) return null;
  const cityId = spotCity(spot);
  const gang = raiderFor(ctx, spot.veedelId, cityId);
  if (!gang) return null;

  // Ware: ein fester Anteil jeder Ware in jedem Lager der Stadt, aufgerundet, damit auch kleine Posten etwas abgeben.
  let goodsLost = 0;
  // Pro Ware für das Journal (Gramm, Stück und ml nicht zusammenzählen).
  const lostByProduct: Record<string, number> = {};
  for (const warehouse of getWarehouses(ctx.state, cityId)) {
    for (const row of stockSummary(ctx.state, warehouse.id)) {
      const amount = Math.min(row.amount, Math.ceil(row.amount * request.goodsShare));
      if (amount <= 0) continue;
      const taken = take(ctx, { productId: row.productId, amount, warehouseId: warehouse.id, partial: true }).taken;
      goodsLost += taken;
      if (taken > 0) lostByProduct[row.productId] = (lostByProduct[row.productId] ?? 0) + taken;
    }
  }
  const goodsText = Object.entries(lostByProduct)
    .map(([productId, amount]) => `${formatProductAmount(productId, amount)} ${productName(productId)}`)
    .join(', ');
  // Bargeld: ein Anteil des Schwarzgelds, auf ganze Euro.
  const cashLost = wallet.lose(
    ctx,
    Math.floor(wallet.balance(ctx.state, 'dirty') * request.cashShare),
    'dirty',
    `Überfall von ${gangNameIn(gang, 'dative')}`,
    { category: 'loss.gang', spotId: spot.id },
  );

  const s = getGangStatus(ctx.state, gang.id);
  if (s) s.lastAttackAt = ctx.now;
  journal.add(
    ctx,
    `${gang.name} hat den ${spot.name} überfallen: ${goodsText ? `${goodsText} aus deinen Lagern und ` : ''}${Math.round(cashLost)} € Bargeld sind weg.`,
    'bad',
    { spotId: spot.id },
  );
  // Die Gang hat gewonnen: In ihrer Stimme heißt das „raidLost“ (du hast den Überfall verloren).
  say(ctx, gang, 'raidLost', { veedel: veedelName(spot.veedelId) });
  const result: ScriptedRaidResult = { gangId: gang.id, spotId: spot.id, goodsLost, cashLost };
  ctx.emit('gang.raided', result);
  return result;
}
