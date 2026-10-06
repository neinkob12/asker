// Razzia-Countdown (Auftrag 44, Minispiel 'stash'): Wird eine Razzia gegen dich geplant, du bist selbst in der Stadt
// und dort liegt Ware, steckt dir jemand den Termin (dein Kontakt bei der Polizei, sonst der Kiosk der Stadt). Im
// Minispiel versteckst du Ware und Schwarzgeld, bevor die Bullen reinstürmen. Der Score (geretteter Anteil nach Wert)
// wird zum Anteil stash (höchstens STASH_MAX) an der geplanten Razzia; um diesen Anteil mindert die Razzia später
// Beschlagnahme von Ware und Geld. Rechte Hand: wie Score. Frist ohne Oberfläche (timeout): nichts, wie bisher.

import { type Ctx, clock, formatPercent, type GameEvents, type GameState, journal } from '../../core';
import { isPlayerIn } from '../city';
import { EVENT_CONTACTS } from '../events';
import { getLots, getProduct, getWarehouses, nearestWarehouse, stockWeight, warehouseModifiers } from '../goods';
import { startMinigame } from '../minigames';
import { atSpot, getSpot } from '../spots';
import { bonusProvider } from '../staff';
import { getVeedel, veedelAt, veedelCity, veedelName } from '../veedel';
import { RAID_SCOPES, STASH_LOTS_MAX, STASH_MAX } from './config';

/** Eine Partie Ware für das Minispiel (je Ware zusammengefasst). */
export interface StashLot {
  productId: string;
  name: string;
  amount: number;
  unit: string;
  /** Gewicht in Gramm (für die Größe des Pakets). */
  grams: number;
  /** Qualität 0 bis 1 (Durchschnitt nach Menge). */
  quality: number;
  /** Wert auf der Straße in Euro (Grundpreis mal Menge). */
  value: number;
}

/** params des Minispiels 'stash' (nur JSON, für die Oberfläche). */
export interface StashParams {
  /** Art der Razzia: am Spot, im Veedel, Großrazzia. */
  scope: 'spot' | 'veedel' | 'major';
  /** Bühne: eigenes Lager (Regale, Tresor) oder die Straße am Spot (Blumenkübel, Briefkasten, Mülltonne, Gully). */
  setting: 'warehouse' | 'street';
  /** Wo, für die Anzeige: „in Ehrenfeld“, „am Neumarkt“, „in Ehrenfeld, Kalk“. */
  place: string;
  /** Das Lager auf der Bühne mit seinem Ausbau (Stufen 0 = keiner). */
  warehouse?: { id: string; name: string; vault: number; cover: number };
  lots: StashLot[];
  /** Schwarzgeld, das die Razzia mitnehmen würde (als Bündel zum Verstecken). */
  money: number;
  /** Spielminuten bis zur Razzia. */
  minutes: number;
  /** Wer den Tipp gibt. */
  tip: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Posten zu Partien je Ware zusammenfassen, die wertvollsten zuerst. */
function toLots(items: readonly { productId: string; amount: number; quality: number }[]): StashLot[] {
  const byProduct = new Map<string, { amount: number; q: number }>();
  for (const i of items) {
    if (i.amount <= 0) continue;
    const entry = byProduct.get(i.productId) ?? { amount: 0, q: 0 };
    entry.amount += i.amount;
    entry.q += i.quality * i.amount;
    byProduct.set(i.productId, entry);
  }
  const lots: StashLot[] = [];
  for (const [productId, { amount, q }] of byProduct) {
    const product = getProduct(productId);
    if (!product) continue;
    lots.push({
      productId,
      name: product.name,
      amount: Math.round(amount),
      unit: product.unit,
      grams: Math.round(stockWeight([{ productId, amount }])),
      quality: round2(q / amount),
      value: Math.round(amount * product.basePrice),
    });
  }
  return lots.sort((a, b) => b.value - a.value || a.productId.localeCompare(b.productId)).slice(0, STASH_LOTS_MAX);
}

/** Ware in deinen Lagern in diesen Veedeln, dazu das wertvollste Lager (für die Bühne). */
function warehouseStock(state: GameState, veedelIds: readonly string[]) {
  const items: { productId: string; amount: number; quality: number }[] = [];
  let best: { id: string; name: string; value: number } | null = null;
  for (const w of getWarehouses(state)) {
    const vid = veedelAt(w.lng, w.lat)?.id;
    if (!vid || !veedelIds.includes(vid)) continue;
    const lots = getLots(state, { warehouseId: w.id });
    let value = 0;
    for (const lot of lots) {
      items.push(lot);
      value += lot.amount * (getProduct(lot.productId)?.basePrice ?? 0);
    }
    if (value > 0 && (!best || value > best.value)) best = { id: w.id, name: w.name, value };
  }
  return { items, best };
}

/** Ware am Spot: was die Razzia dort vom nächsten Lager mitnehmen würde (wie confiscateNear). */
function streetStock(state: GameState, point: { lng: number; lat: number }, share: number, max: number) {
  const warehouse = nearestWarehouse(state, point);
  if (!warehouse) return [];
  let left = max;
  const items: { productId: string; amount: number; quality: number }[] = [];
  for (const lot of getLots(state, { warehouseId: warehouse.id })) {
    if (left <= 0) break;
    const amount = Math.min(left, Math.ceil(lot.amount * share), lot.amount);
    items.push({ productId: lot.productId, amount, quality: lot.quality });
    left -= amount;
  }
  return items;
}

/** Wer den Tipp gibt: dein Kontakt bei der Polizei in der Stadt, sonst der Kiosk der Stadt (events). */
function tipper(state: GameState, cityId: string): string {
  const contact = bonusProvider(state, 'raidWarning', cityId);
  if (contact) return `${contact.name}, dein Kontakt bei der Polizei`;
  return (EVENT_CONTACTS[cityId] ?? EVENT_CONTACTS.koeln)?.name ?? 'Ein Kumpel';
}

/** Was das Minispiel zeigen würde (null: keine Ware da, dann kein Minispiel). */
export function stashParams(
  state: GameState,
  raid: { scope: 'spot' | 'veedel' | 'major'; veedelIds: readonly string[]; spotId: string | null; at: number },
): StashParams | null {
  const cityId = veedelCity(raid.veedelIds[0]);
  const rules = RAID_SCOPES[raid.scope];
  const spot = raid.spotId ? getSpot(state, raid.spotId) : undefined;
  const stock = rules.warehouseShare > 0 ? warehouseStock(state, raid.veedelIds) : { items: [], best: null };
  let setting: StashParams['setting'] = 'warehouse';
  let lots = toLots(stock.items);
  if (lots.length === 0 || !stock.best) {
    // Kein eigenes Lager betroffen: die Ware am Spot (Kleindealer) bzw. auf der Straße im Veedel.
    setting = 'street';
    const point = spot ?? getVeedel(raid.veedelIds[0])?.center;
    lots = point ? toLots(streetStock(state, point, rules.goodsShare, rules.goodsMax)) : [];
  }
  if (lots.length === 0) return null;
  const money = Math.round(Math.min(rules.moneyMax, Math.max(0, state.wallet.dirty) * rules.moneyShare));
  const place =
    raid.scope === 'spot' && spot
      ? atSpot(spot)
      : `in ${raid.veedelIds.slice(0, 3).map(veedelName).join(', ')}${raid.veedelIds.length > 3 ? ' und mehr' : ''}`;
  const levels = setting === 'warehouse' && stock.best ? warehouseModifiers(state, stock.best.id).levels : null;
  return {
    scope: raid.scope,
    setting,
    place,
    ...(stock.best && levels && setting === 'warehouse'
      ? { warehouse: { id: stock.best.id, name: stock.best.name, vault: levels.vault, cover: levels.cover } }
      : {}),
    lots,
    money: money >= 50 ? money : 0,
    minutes: Math.max(0, Math.round(raid.at - state.time)),
    tip: tipper(state, cityId),
  };
}

/** Origin-Ref einer Razzia: raid:<veedelId> bzw. raid:major. */
export function stashRef(veedelId: string | 'major'): string {
  return `raid:${veedelId}`;
}

/**
 * Nach dem Planen einer Razzia gegen dich (planRaid, planMajorRaid): das Minispiel, wenn du in der Stadt bist und dort
 * Ware liegt. Ohne Oberfläche läuft es nach der Frist als timeout ab, dann bleibt alles wie bisher.
 */
export function maybeStartStash(
  ctx: Ctx,
  raid: { scope: 'spot' | 'veedel' | 'major'; veedelIds: readonly string[]; spotId: string | null; at: number },
): number | null {
  if (raid.veedelIds.length === 0) return null;
  const cityId = veedelCity(raid.veedelIds[0]);
  if (!isPlayerIn(ctx.state, cityId)) return null;
  const params = stashParams(ctx.state, raid);
  if (!params) return null;
  const time = clock.formatTime(raid.at);
  const where =
    params.setting === 'warehouse' && params.warehouse
      ? params.warehouse.name.startsWith('Lager')
        ? `Im ${params.warehouse.name}`
        : `Im Lager ${params.warehouse.name}`
      : 'Am Spot';
  const situation =
    raid.scope === 'major'
      ? `Tipp von ${params.tip}: Großrazzia ${params.place}, ${clock.weekdayName(raid.at)} um ${time}. ${where} liegt noch Ware.`
      : `Tipp von ${params.tip}: Um ${time} kommt die Razzia ${params.place}. ${where} liegt noch Ware.`;
  return startMinigame(ctx, {
    kind: 'stash',
    origin: { module: 'police', ref: stashRef(raid.scope === 'major' ? 'major' : raid.veedelIds[0]) },
    cityId,
    veedelId: raid.veedelIds[0],
    title: raid.scope === 'major' ? 'Großrazzia im Anmarsch' : 'Die Bullen kommen',
    situation,
    params: params as unknown as Record<string, unknown>,
  });
}

/** Anteil, der aus dem Score versteckt ist (0 bis STASH_MAX). */
export function stashShare(score: number): number {
  return round2(Math.min(STASH_MAX, Math.max(0, Number.isFinite(score) ? score : 0)));
}

/** 'minigame.finished' mit origin police/raid:…: Anteil an der geplanten Razzia merken. timeout: nichts. */
export function onStashFinished(ctx: Ctx, payload: GameEvents['minigame.finished']): void {
  if (payload.origin.module !== 'police' || !payload.origin.ref.startsWith('raid:')) return;
  if (payload.by === 'timeout' || payload.score === null) return;
  const key = payload.origin.ref.slice('raid:'.length);
  const police = ctx.state.modules.police;
  const stash = stashShare(payload.score);
  let veedelId: string;
  if (key === 'major') {
    if (!police.majorRaid) return;
    police.majorRaid.stash = stash;
    veedelId = police.majorRaid.veedelIds[0];
  } else {
    const plan = police.plannedRaids[key];
    if (!plan) return;
    plan.stash = stash;
    veedelId = key;
  }
  const who = payload.by === 'rightHand' ? 'Deine Rechte Hand hat' : 'Du hast';
  journal.add(
    ctx,
    stash > 0
      ? `${who} vor der Razzia aufgeräumt: ${formatPercent(stash)} der Ware und des Schwarzgelds sind versteckt.`
      : 'Vor der Razzia nichts versteckt bekommen. Was die Bullen finden, ist weg.',
    stash > 0 ? 'good' : 'bad',
    { veedelId },
  );
}
