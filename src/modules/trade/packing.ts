// Container packen (Auftrag 44, Teil 7, Minispiel 'container'): Kaufst du selbst Container ('trade.buy') oder belädst
// dein Schiff ('trade.sail'), packst du den Container im Minispiel: Ware als Blöcke ins Raster, rundherum Deckladung,
// nicht an die Türen und nicht an die Wand zum Röntgen. Der Score wird zu TradeShipment.packing und gilt für alle
// Container der Bestellung; in containerRisk zählt dann der Faktor packingFactor (0 → 1,25, 0,5 → 0,9, 1 → 0,55).
// Fenna (plans.ts) und der Bot packen nicht selbst: Fenna ruft buyContainer direkt, der Bot löst offene Minispiele
// sofort als timeout auf. Rechte Hand: ihr Score. timeout: kein Faktor (packing bleibt leer), wie bisher.
//
// Nicht zu verwechseln mit TradeShipment.pack (Auftrag 42): der Faktor der Verpackung eigener Ware aus grow.

import { type Ctx, formatNumber, type GameEvents, journal } from '../../core';
import { HARBOR_CITY } from '../city';
import { productName } from '../goods';
import { harborPort } from '../logistics';
import { startMinigame } from '../minigames';
import { PACKING_FACTOR } from './config';
import { CONTAINER_SIZES, COVERS, type ContainerSize, type Cover } from './data';
import type { TradeShipment } from './index';

/** params des Minispiels 'container' (nur JSON, für die Oberfläche). */
export interface PackingParams {
  /** Waren im Container (ID und Name), die erste zuerst. */
  products: { id: string; name: string }[];
  /** Größe des größten Containers der Bestellung (bestimmt das Raster). */
  size: ContainerSize['id'];
  /** Deckladung (bestimmt die Formen der Deckladung im Spiel). */
  cover: Cover['id'];
  /** Wie viele Container die Bestellung hat (gepackt wird einer, die anderen genauso). */
  count: number;
  /** Gramm Ware im gepackten Container. */
  grams: number;
  /** Woher und wohin, für die Anzeige. */
  from: string;
  port: string;
  /** Eigenes Schiff (Name) oder null für das Linienschiff. */
  vessel: string | null;
}

/** Faktor auf die Chance einer Zollkontrolle aus dem Score des Packens; ohne Wert (nicht gepackt, timeout) 1. */
export function packingFactor(packing: number | undefined): number {
  if (packing === undefined || !Number.isFinite(packing)) return 1;
  const p = Math.min(1, Math.max(0, packing));
  return Math.round((PACKING_FACTOR.base - PACKING_FACTOR.perScore * p) * 1000) / 1000;
}

/** Origin-Ref für die Container einer Bestellung: pack:<id,id,…>. */
export function packingRef(shipmentIds: readonly number[]): string {
  return `pack:${shipmentIds.join(',')}`;
}

/** IDs aus einem Origin-Ref (leer, wenn es keiner fürs Packen ist). */
export function packingIds(ref: string): number[] {
  if (!ref.startsWith('pack:')) return [];
  return ref
    .slice(5)
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id));
}

/** Was das Minispiel zeigt (aus den neuen Containern einer Bestellung). */
export function packingParams(
  shipments: readonly TradeShipment[],
  from: string,
  vessel: string | null,
): PackingParams | null {
  if (shipments.length === 0) return null;
  const order = CONTAINER_SIZES.map((c) => c.id);
  const biggest = shipments.reduce((a, b) => (order.indexOf(b.size) > order.indexOf(a.size) ? b : a));
  const products: { id: string; name: string }[] = [];
  for (const x of shipments) {
    if (!products.some((p) => p.id === x.productId)) products.push({ id: x.productId, name: productName(x.productId) });
  }
  // Die Deckladung, die am häufigsten vorkommt (bei gleich vielen die bessere Tarnung).
  const covers = COVERS.map((c) => ({ id: c.id, n: shipments.filter((x) => x.cover === c.id).length }));
  const cover = covers.reduce((a, b) => (b.n >= a.n ? b : a)).id;
  return {
    products: products.slice(0, 4),
    size: biggest.size,
    cover,
    count: shipments.length,
    grams: biggest.amount,
    from,
    port: harborPort(biggest.portId)?.name ?? biggest.portId,
    vessel,
  };
}

/**
 * Nach einer eigenen Bestellung (trade.buy, trade.sail vom Spieler): das Minispiel für die neuen Container. Ohne
 * Oberfläche läuft es nach der Frist als timeout ab, dann bleibt das Zollrisiko wie bisher.
 */
export function maybeStartPacking(
  ctx: Ctx,
  shipments: readonly TradeShipment[],
  from: string,
  vessel: string | null,
): number | null {
  const params = packingParams(shipments, from, vessel);
  if (!params) return null;
  const goods = params.products.map((p) => p.name).join(' und ');
  const many =
    params.count > 1 ? ` Du packst den ersten, die Jungs packen die anderen ${params.count - 1} genauso.` : '';
  const situation = vessel
    ? `${vessel} lädt in ${from}: ${goods} für ${params.port}.${many}`
    : `Der Container mit ${goods} aus ${from} geht nach ${params.port}.${many}`;
  return startMinigame(ctx, {
    kind: 'container',
    origin: { module: 'trade', ref: packingRef(shipments.map((x) => x.id)) },
    cityId: HARBOR_CITY,
    title: 'Container packen',
    situation,
    params: params as unknown as Record<string, unknown>,
  });
}

/** Ergebnis des Packens: packing an alle Container der Bestellung, die noch auf See sind. timeout: nichts. */
export function onPackingFinished(ctx: Ctx, payload: GameEvents['minigame.finished']): void {
  if (payload.origin.module !== 'trade' || payload.kind !== 'container') return;
  if (payload.by === 'timeout' || payload.score === null) return;
  const ids = new Set(packingIds(payload.origin.ref));
  const score = Math.round(Math.min(1, Math.max(0, payload.score)) * 1000) / 1000;
  let packed = 0;
  for (const x of ctx.state.modules.trade.shipments) {
    if (!ids.has(x.id) || x.status !== 'sea') continue;
    x.packing = score;
    packed += 1;
  }
  if (packed === 0) return;
  const factor = packingFactor(score);
  const first = ctx.state.modules.trade.shipments.find((x) => ids.has(x.id));
  const what = `${packed === 1 ? 'Container' : `${packed} Container`}${first ? ` ${productName(first.productId)}` : ''}`;
  journal.add(
    ctx,
    `${factor <= 1 ? 'Gut gepackt' : 'Schlecht gepackt'}: ${what}, Zollrisiko × ${formatNumber(factor, 2)}.`,
    factor <= 1 ? 'good' : 'bad',
  );
}
