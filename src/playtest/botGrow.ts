// Der Bot in der Produktion (Auftrag 42): Sobald Kolumbien und Marokko anrufen, nimmt er an, pachtet (oder kauft, wenn
// das saubere Geld reicht) je eine Finca, heuert Arbeiter und einen Gärtner an, pflanzt, was am meisten gefragt ist
// (Gras in Kolumbien, Hasch in Marokko), zahlt dem Kartell seinen Anteil und schmiert, wenn die Behörden wach werden.
// Mit dem Geld kommen Gewächshäuser und bessere Genetik. Die fertige Ware verschifft er auf der Linie aus Cartagena
// und Tanger in den Hafen; den Rest kauft er wie bisher (botTrade.ts zählt Container unterwegs schon mit).
// Er schickt nur Befehle, genau wie die Oberfläche.

import type { GameState } from '../core';
import { REGIONS } from '../modules/city';
import {
  fincaSites,
  fincaWorkers,
  GENETICS,
  getFincas,
  greenhouseCost,
  growGoals,
  isGrowStarted,
  landPrice,
  leasePerWeek,
  nextGenetics,
  REGION_ECONOMY,
  regionAttention,
  regionStatus,
  siteTaken,
  workersNeeded,
} from '../modules/grow';
import { amountInProgress } from '../modules/laundering';
import { CONTAINER_SIZES, originStock, regionOrigin } from '../modules/trade';
import type { BotRun } from './botTrade';

/**
 * Welche Fincas der Bot nimmt und was dort wächst. Zuerst je die größte (für „Produzent“ braucht er die Hälfte seiner
 * Lieferungen: Gras und Hasch), nach „Produzent“ zwei kleinere in Kolumbien für Kush und Haze (für „Europa“ wollen
 * München, Stuttgart und Zürich auch die teuren Sorten aus eigener Ernte).
 */
const PLAN: readonly { site: string; crop: string; afterProducer?: boolean }[] = [
  { site: 'san-isidro', crop: 'weed' },
  { site: 'issaguen', crop: 'hash' },
  { site: 'la-esperanza', crop: 'kush', afterProducer: true },
  { site: 'el-tigre', crop: 'haze', afterProducer: true },
];
const CROP_BY_SITE = new Map(PLAN.map((p) => [p.site, p.crop]));
/** So viel Geld bleibt für den Handel (Container, Löhne, Spedition). */
const KEEP_DIRTY = 400_000;
const KEEP_CLEAN = 150_000;
/** Kaufen statt pachten, wenn nach dem Kauf noch so viel sauberes Geld da ist. */
const BUY_MARGIN = 200_000;
/** Ab dieser Aufmerksamkeit schmiert er. */
const BRIBE_AT = 38;
/** Verschifft wird ab so viel Ware im Ausfuhrlager. */
const SHIP_FROM_GRAMS = 20_000;

/** Ein Blick auf die Produktion. */
export function growTurn(state: GameState, run: BotRun): void {
  if (!isGrowStarted(state)) return;
  for (const region of REGIONS) {
    const status = regionStatus(state, region.id);
    if (status === 'called') run({ type: 'grow.openRegion', payload: { regionId: region.id } });
    if (regionStatus(state, region.id) !== 'open') continue;
    acquire(state, run, region.id);
    if (regionAttention(state, region.id) >= BRIBE_AT && state.wallet.dirty > KEEP_DIRTY * 2) {
      run({ type: 'grow.bribe', payload: { regionId: region.id } });
    }
    ship(state, run, region.id);
  }
  for (const finca of getFincas(state)) {
    const missing = workersNeeded(finca) - fincaWorkers(state, finca);
    if (missing > 0) run({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: missing } });
    if (!finca.gardenerId) run({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'gardener' } });
    const crop = CROP_BY_SITE.get(finca.siteId) ?? REGION_ECONOMY[finca.regionId]?.crops[0];
    if (crop && (!finca.crop || finca.plan !== crop)) {
      run({ type: 'grow.plant', payload: { fincaId: finca.id, productId: crop } });
    }
    // Ausbau: erst das Gewächshaus (doppelt so viele Ernten), dann die Genetik, jeweils mit Reserve.
    if (!finca.greenhouse && state.wallet.clean >= greenhouseCost(finca) + KEEP_CLEAN) {
      run({ type: 'grow.buildGreenhouse', payload: { fincaId: finca.id } });
    }
    const next = nextGenetics(finca);
    if (
      next &&
      finca.greenhouse &&
      finca.harvests > 0 &&
      state.wallet.dirty >= next.cost + KEEP_DIRTY * 2 &&
      next.level < GENETICS.length
    ) {
      run({ type: 'grow.upgradeGenetics', payload: { fincaId: finca.id } });
    }
  }
  launder(state, run);
}

/** Die Fincas aus PLAN in dieser Region: kaufen, wenn das saubere Geld reicht, sonst pachten (eine pro Blick). */
function acquire(state: GameState, run: BotRun, regionId: string): void {
  const producer = growGoals(state).producer;
  for (const step of PLAN) {
    if (step.afterProducer && !producer) continue;
    const site = fincaSites(regionId).find((s) => s.id === step.site);
    if (!site || siteTaken(state, site.id)) continue;
    if (state.wallet.clean >= landPrice(site) + BUY_MARGIN) {
      run({ type: 'grow.buyFinca', payload: { siteId: site.id } });
    } else if (state.wallet.clean >= leasePerWeek(site)) {
      run({ type: 'grow.leaseFinca', payload: { siteId: site.id } });
    }
    return;
  }
}

/** Ware im Ausfuhrlager auf die Linie: große Container, der Rest halb oder klein; Deckladung Fliesen. */
function ship(state: GameState, run: BotRun, regionId: string): void {
  const origin = regionOrigin(regionId);
  if (!origin) return;
  for (const [productId, lot] of Object.entries(originStock(state, origin.id))) {
    if (lot.amount < SHIP_FROM_GRAMS) continue;
    let left = lot.amount;
    for (let i = 0; i < 6 && left >= SHIP_FROM_GRAMS; i++) {
      const size = [...CONTAINER_SIZES].reverse().find((c) => c.grams <= left) ?? CONTAINER_SIZES[0];
      const ok = run({
        type: 'trade.buy',
        payload: { producerId: origin.id, productId, size: size.id, portId: 'rotterdam', cover: 'tiles' },
      });
      if (!ok) break;
      left -= Math.min(left, size.grams);
    }
  }
}

/** Fincas zahlen mit sauberem Geld: rechtzeitig einen Teil des Schwarzgelds waschen. */
function launder(state: GameState, run: BotRun): void {
  if (getFincas(state).length === 0) return;
  if (state.wallet.clean < 1_200_000 && state.wallet.dirty > KEEP_DIRTY * 3 && amountInProgress(state) < 10_000) {
    run({ type: 'laundering.launder', payload: { amount: Math.round(state.wallet.dirty * 0.15) } });
  }
}
