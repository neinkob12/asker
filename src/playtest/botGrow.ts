// Der Bot in der Produktion (Auftrag 42): Sobald Kolumbien und Marokko anrufen, nimmt er an, pachtet (oder kauft, wenn
// das saubere Geld reicht) je eine Finca, heuert Arbeiter und einen Gärtner an, pflanzt, was am meisten gefragt ist
// (Gras in Kolumbien, Hasch in Marokko), zahlt dem Kartell seinen Anteil und schmiert, wenn die Behörden wach werden.
// Mit dem Geld kommen Gewächshäuser und bessere Genetik. Die fertige Ware verschifft er auf der Linie aus Cartagena
// und Tanger in den Hafen; den Rest kauft er wie bisher (botTrade.ts zählt Container unterwegs schon mit).
// Er schickt nur Befehle, genau wie die Oberfläche.

import type { GameState } from '../core';
import { REGIONS } from '../modules/city';
import {
  expectedHarvest,
  fincaSites,
  fincaWorkers,
  GENETICS,
  getFincas,
  greenhouseCost,
  growGoals,
  harvestLog,
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
import { channelFree, getChannels } from '../modules/laundering';
import { CONTAINER_SIZES, getShipments, OWN_ORIGINS, originStock, regionOrigin, totalStock } from '../modules/trade';
import type { BotRun } from './botTrade';

/**
 * Welche Fincas der Bot nimmt und was dort wächst. Zuerst je die größte (für „Produzent“ braucht er die Hälfte seiner
 * Lieferungen: Gras und Hasch), nach der ersten eigenen Ernte zwei kleinere in Kolumbien für Kush und Haze (für
 * „Europa“ wollen München, Stuttgart und Zürich auch die teuren Sorten aus eigener Ernte).
 */
const PLAN: readonly { site: string; crop: string; later?: boolean }[] = [
  { site: 'san-isidro', crop: 'weed' },
  { site: 'issaguen', crop: 'hash' },
  { site: 'la-esperanza', crop: 'kush', later: true },
  { site: 'el-tigre', crop: 'haze', later: true },
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
/** Mehr als so viele Wochen Bedarf schickt er nicht in den Hafen. */
const SHIP_WEEKS_MAX = 4;
/** Eine Finca wechselt die Sorte erst, wenn ihre so viele Wochen reicht und eine andere höchstens halb so lange. */
const CROP_SWITCH_WEEKS = 8;

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
    const crop = cropFor(state, finca.regionId, CROP_BY_SITE.get(finca.siteId));
    if (crop && (!finca.crop || finca.plan !== crop)) {
      run({ type: 'grow.plant', payload: { fincaId: finca.id, productId: crop } });
    }
    // Ausbau: erst das Gewächshaus (doppelt so viele Ernten), dann die Genetik, jeweils mit Reserve.
    if (!finca.greenhouse && state.wallet.clean >= greenhouseCost(finca) + cleanReserve(state)) {
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
  // Kush und Haze nach der ersten eigenen Ernte (dann ist klar, dass die Kette läuft).
  const started = growGoals(state).producer || harvestLog(state).length > 0;
  for (const step of PLAN) {
    if (step.later && !started) continue;
    const site = fincaSites(regionId).find((s) => s.id === step.site);
    if (!site || siteTaken(state, site.id)) continue;
    if (state.wallet.clean >= landPrice(site) + BUY_MARGIN) {
      run({ type: 'grow.buyFinca', payload: { siteId: site.id } });
    } else if (state.wallet.clean >= leasePerWeek(site) + 20_000) {
      run({ type: 'grow.leaseFinca', payload: { siteId: site.id } });
    }
    return;
  }
}

const DAY = 1440;

/** Bedarf einer Ware pro Woche (Bestellungen der letzten sieben Tage). */
function weeklyDemand(state: GameState, productId: string): number {
  return state.modules.trade.orders
    .filter((o) => state.time - o.placedAt < 7 * DAY && o.status !== 'lost' && o.status !== 'declined')
    .flatMap((o) => o.items)
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + i.amount, 0);
}

/** Für wie viele Wochen eine Ware reicht: im Hafen, auf See, (mit fields) im Ausfuhrlager und auf den Feldern. */
function supplyWeeks(state: GameState, productId: string, fields = true): number {
  let supply =
    totalStock(state, productId) +
    getShipments(state)
      .filter((x) => x.productId === productId)
      .reduce((sum, x) => sum + x.amount, 0);
  if (fields) {
    for (const o of OWN_ORIGINS) supply += originStock(state, o.id)[productId]?.amount ?? 0;
    for (const f of getFincas(state)) if (f.crop?.productId === productId) supply += expectedHarvest(state, f);
  }
  return supply / Math.max(1_000, weeklyDemand(state, productId));
}

/**
 * Was eine Finca als Nächstes anbaut: die Ware ihrer Region, die am kürzesten reicht (sonst läuft das Hafenlager mit
 * einer Sorte voll, und die Container mit der fehlenden warten am Kai). Bei Gleichstand der Plan.
 */
function cropFor(state: GameState, regionId: string, planned: string | undefined): string | undefined {
  const crops = REGION_ECONOMY[regionId]?.crops ?? [];
  if (crops.length === 0) return planned;
  const weeks = (id: string) => supplyWeeks(state, id);
  const best = [...crops].sort((a, b) => weeks(a) - weeks(b) || (a === planned ? -1 : b === planned ? 1 : 0))[0];
  // Beim Plan bleiben, solange er nicht klar zu viel ist (sonst springen alle Fincas gleichzeitig auf dieselbe Sorte).
  return planned && (weeks(planned) <= CROP_SWITCH_WEEKS || weeks(best) > CROP_SWITCH_WEEKS / 2) ? planned : best;
}

/** Ware im Ausfuhrlager auf die Linie: große Container, der Rest halb oder klein; Deckladung Fliesen. */
function ship(state: GameState, run: BotRun, regionId: string): void {
  const origin = regionOrigin(regionId);
  if (!origin) return;
  for (const [productId, lot] of Object.entries(originStock(state, origin.id))) {
    if (lot.amount < SHIP_FROM_GRAMS) continue;
    // Nur, was im Hafen und auf See für SHIP_WEEKS_MAX Wochen fehlt; der Rest bleibt im Ausfuhrlager (das Hafenlager ist
    // begrenzt, eine volle Halle lässt die Container mit anderer Ware am Kai warten).
    const demand = Math.max(1_000, weeklyDemand(state, productId));
    const room = SHIP_WEEKS_MAX * demand - supplyWeeks(state, productId, false) * demand;
    let left = Math.min(lot.amount, room);
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
/**
 * Sauberes Geld, das stehen bleibt: Pacht ist nur sauber zu zahlen (sonst ist das Land nach ein paar Tagen weg), also
 * drei Wochen Pacht aller gepachteten Fincas plus KEEP_CLEAN.
 */
function cleanReserve(state: GameState): number {
  return KEEP_CLEAN + getFincas(state).reduce((sum, f) => sum + (f.tenure === 'leased' ? 3 * leasePerWeek(f) : 0), 0);
}

function launder(state: GameState, run: BotRun): void {
  if (!REGIONS.some((r) => regionStatus(state, r.id) === 'open')) return;
  const want = Math.max(1_200_000, 2 * cleanReserve(state));
  if (state.wallet.clean >= want || state.wallet.dirty <= KEEP_DIRTY * 3) return;
  // Nicht mehr als die Wege gerade aufnehmen (sonst lehnt die Wäsche ab und es kommt gar nichts sauber zurück).
  const free = getChannels(state).reduce((sum, c) => sum + channelFree(state, c.id), 0);
  const amount = Math.min(Math.round(state.wallet.dirty * 0.15), Math.floor(free * 0.95));
  if (amount >= 20_000) run({ type: 'laundering.launder', payload: { amount } });
}
