// Zivi oder Kunde (Auftrag 44, Minispiel 'undercover'): Stehst du selbst an einem Spot in einem Veedel mit Heat ab
// UNDERCOVER_HEAT, schickt die Polizei ab und zu eine Schicht Zivilfahnder (stündlich eine Chance nach Heat und
// Präsenz, Abklingzeit UNDERCOVER_COOLDOWN). Im Minispiel kommen Kunden nacheinander, darunter ein bis drei Zivis; du
// verkaufst oder wimmelst ab. Folgen: Ein Verkauf an einen Zivi ist eine Kontrolle gegen dich (wie runCheck, mit der
// Chance auf die Polizeiflucht), alle Zivis erkannt kühlt das Veedel ab, abgewimmelte echte Kunden kosten etwas Ruf.
// Rechte Hand: Score als Anteil richtig. Frist ohne Oberfläche (timeout): nichts, wie bisher.
//
// Der Wurf für die Schicht kommt fest aus Seed, Spot und Stunde (keyedRandom): Er verschiebt die Würfelfolge der Polizei
// nicht, Bot, Balancing und Szenario-Tests bleiben, wie sie waren.

import { type Ctx, clock, type GameEvents, type GameState, journal, keyedDice } from '../../core';
import { isPlayerIn, isVeedelLive } from '../city';
import { isPlayerAway, playerSpot } from '../customers';
import { getLots, getProduct, nearestWarehouse } from '../goods';
import { activeChallenge, startMinigame, winAt } from '../minigames';
import { changeReputation } from '../reputation';
import { atSpot, getSpot, spotCity, spotKind } from '../spots';
import { getVeedel, veedelName } from '../veedel';
import {
  MAX_HEAT,
  UNDERCOVER_CHANCE_PER_HOUR,
  UNDERCOVER_COOLDOWN,
  UNDERCOVER_CUSTOMERS,
  UNDERCOVER_GOODS_MAX,
  UNDERCOVER_HEAT,
  UNDERCOVER_RELIEF,
  UNDERCOVER_REP_TURNED_AWAY,
  UNDERCOVER_SOLD_PENALTY,
  UNDERCOVER_ZIVI_HEAT_STEPS,
} from './config';

/** Eine Ware, die am Spot zu haben ist (für die Sätze der Kunden). */
export interface UndercoverGood {
  productId: string;
  name: string;
  unit: string;
}

/** params des Minispiels 'undercover' (nur JSON, für die Oberfläche). */
export interface UndercoverParams {
  spotId: string;
  /** Name des Spots, z.B. „Zülpicher Platz“. */
  spot: string;
  /** Wo, für die Anzeige: „am Zülpicher Platz“. */
  place: string;
  veedel: string;
  /** Art des Spots (Straßenecke, Club, Kneipe …) für die Bühne. */
  kind: string;
  /** Stunde, für Tag und Nacht auf der Bühne. */
  hour: number;
  goods: UndercoverGood[];
  /** So viele Leute kommen (Zivis mitgezählt), 6 bis 10. */
  customers: number;
  /** Davon Zivis, 1 bis 3 nach Heat. */
  zivis: number;
  heat: number;
}

/** Was in der Schicht passiert ist (aus den picks bzw. dem Score der Rechten Hand). */
export interface UndercoverOutcome {
  /** An so viele Zivis verkauft. */
  soldZivi: number;
  /** So viele Zivis erkannt und abgewimmelt. */
  spotted: number;
  /** So viele echte Kunden abgewimmelt (oder zu lange warten lassen). */
  turnedAway: number;
  /** An so viele echte Kunden verkauft. */
  sold: number;
}

/** Laufende Schicht mit Zivis (im Zustand von police, damit die Folgen die Zahlen kennen). */
export interface UndercoverShift {
  challengeId: number;
  spotId: string;
  customers: number;
  zivis: number;
}

/** Zustand der Zivis in police: Abklingzeit und laufende Schicht. */
export interface UndercoverState {
  readyAt: number;
  shift: UndercoverShift | null;
}

/** Origin-Ref einer Schicht: undercover:<spotId>. */
export function undercoverRef(spotId: string): string {
  return `undercover:${spotId}`;
}

/** Zahl der Zivis nach Heat: einer ab UNDERCOVER_HEAT, je Stufe einer mehr (höchstens drei). */
export function ziviCount(heat: number): number {
  return Math.max(1, UNDERCOVER_ZIVI_HEAT_STEPS.filter((h) => heat >= h).length);
}

/** Chance pro Stunde auf eine Schicht mit Zivis: ab UNDERCOVER_HEAT ansteigend, mal Präsenz. */
export function undercoverChance(heat: number, presence: number): number {
  if (heat < UNDERCOVER_HEAT) return 0;
  const ramp = (heat - UNDERCOVER_HEAT) / (MAX_HEAT - UNDERCOVER_HEAT);
  return Math.min(1, UNDERCOVER_CHANCE_PER_HOUR * (0.25 + 0.75 * ramp) * Math.max(0, presence));
}

/** Ware am Spot: was im nächsten Lager liegt (sonst in der Stadt), die wertvollsten zuerst. */
function spotGoods(state: GameState, spot: { lng: number; lat: number }, cityId: string): UndercoverGood[] {
  const warehouse = nearestWarehouse(state, spot);
  let lots = warehouse ? getLots(state, { warehouseId: warehouse.id }) : [];
  if (!lots.some((l) => l.amount > 0)) lots = getLots(state, { cityId });
  const value = new Map<string, number>();
  for (const lot of lots) {
    const product = getProduct(lot.productId);
    if (!product || lot.amount <= 0) continue;
    value.set(lot.productId, (value.get(lot.productId) ?? 0) + lot.amount * product.basePrice);
  }
  return [...value.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, UNDERCOVER_GOODS_MAX)
    .map(([productId]) => {
      const product = getProduct(productId);
      return { productId, name: product?.name ?? productId, unit: product?.unit ?? 'g' };
    });
}

/** Was das Minispiel an diesem Spot zeigen würde (null: Spot unbekannt oder keine Ware, dann keine Zivis). */
export function undercoverParams(state: GameState, spotId: string, heat: number, key: string): UndercoverParams | null {
  const spot = getSpot(state, spotId);
  if (!spot) return null;
  const goods = spotGoods(state, spot, spotCity(spot));
  if (goods.length === 0) return null;
  const dice = keyedDice(`${key}:count`);
  const zivis = ziviCount(heat);
  return {
    spotId,
    spot: spot.name,
    place: atSpot(spot),
    veedel: veedelName(spot.veedelId),
    kind: spotKind(spot),
    hour: clock.hour(state.time),
    goods,
    customers: Math.max(zivis + 4, dice.randomInt(UNDERCOVER_CUSTOMERS.min, UNDERCOVER_CUSTOMERS.max)),
    zivis,
    heat: Math.round(heat),
  };
}

/**
 * Stündlich (police tick): Stehst du selbst an einem Spot in einem heißen Veedel, kommt mit einer Chance eine Schicht
 * Zivis. Gewürfelt fest aus Seed, Spot und Stunde; die Würfelfolge der Polizei bleibt unberührt.
 */
export function maybeStartUndercover(ctx: Ctx, heatOf: (veedelId: string) => number): number | null {
  const state = ctx.state;
  const police = state.modules.police;
  const spotId = playerSpot(state);
  if (!spotId || ctx.now < police.undercover.readyAt) return null;
  const spot = getSpot(state, spotId);
  if (!spot) return null;
  const cityId = spotCity(spot);
  if (!isVeedelLive(state, spot.veedelId) || !isPlayerIn(state, cityId) || isPlayerAway(state)) return null;
  // Läuft schon ein Minispiel, warten die Zivis (nie zwei auf einmal).
  if (activeChallenge(state)) return null;
  const heat = heatOf(spot.veedelId);
  const chance = undercoverChance(heat, getVeedel(spot.veedelId)?.policePresence ?? 1);
  if (chance <= 0) return null;
  const key = `undercover:${state.meta.seed}:${spotId}:${Math.floor(ctx.now / 60)}`;
  if (!keyedDice(key).chance(chance)) return null;
  const params = undercoverParams(state, spotId, heat, key);
  if (!params) return null;
  const zivis = params.zivis === 1 ? 'ist ein Zivi' : `sind ${params.zivis} Zivis`;
  const id = startMinigame(ctx, {
    kind: 'undercover',
    origin: { module: 'police', ref: undercoverRef(spotId) },
    cityId,
    veedelId: spot.veedelId,
    title: 'Zivi oder Kunde?',
    situation: `${params.veedel} ist heiß: Unter den nächsten ${params.customers} Leuten ${params.place} ${zivis}. Verkauf nur an echte Kunden.`,
    params: params as unknown as Record<string, unknown>,
  });
  if (id === null) return null;
  police.undercover = {
    readyAt: ctx.now + UNDERCOVER_COOLDOWN,
    shift: { challengeId: id, spotId, customers: params.customers, zivis: params.zivis },
  };
  return id;
}

function count(picks: readonly string[], id: string): number {
  let n = 0;
  for (const pick of picks) {
    const [name, value] = pick.split(':');
    if (name === id) n += Math.max(0, Math.floor(Number(value) || 0));
  }
  return n;
}

/** Zahlen aus den params bzw. der Schicht lesen (alte Stände, fremde Werte). */
function sizes(params: { customers?: unknown; zivis?: unknown }): { customers: number; zivis: number } {
  const zivis = Math.max(1, Math.min(3, Math.floor(Number(params.zivis) || 1)));
  const customers = Math.max(zivis + 1, Math.min(12, Math.floor(Number(params.customers) || 8)));
  return { customers, zivis };
}

/**
 * Was passiert ist. Spieler: aus den picks (soldZivi:<n>, spotted:<n>, turnedAway:<n>, sold:<n>), begrenzt auf die
 * Zahlen der Schicht. Rechte Hand: aus dem Score (Anteil richtig). Geschafft heißt, sie hat keinen Zivi bedient;
 * die Fehler fallen auf echte Kunden, die sie zur Sicherheit wegschickt. Nicht geschafft: einer hat gekauft.
 */
export function undercoverOutcome(
  params: { customers?: unknown; zivis?: unknown },
  score: number,
  picks: readonly string[],
  by: 'player' | 'rightHand',
): UndercoverOutcome {
  const { customers, zivis } = sizes(params);
  const real = customers - zivis;
  if (by === 'player') {
    const soldZivi = Math.min(zivis, count(picks, 'soldZivi'));
    const spotted = Math.min(zivis - soldZivi, count(picks, 'spotted'));
    const turnedAway = Math.min(real, count(picks, 'turnedAway'));
    const sold = Math.min(real - turnedAway, count(picks, 'sold'));
    return { soldZivi, spotted, turnedAway, sold };
  }
  const wrong = Math.round((1 - Math.min(1, Math.max(0, score))) * customers);
  if (score >= winAt('undercover')) {
    const turnedAway = Math.min(real, wrong);
    return { soldZivi: 0, spotted: zivis, turnedAway, sold: real - turnedAway };
  }
  const turnedAway = Math.min(real, Math.max(0, wrong - 1));
  return { soldZivi: 1, spotted: zivis - 1, turnedAway, sold: real - turnedAway };
}

/** Score aus dem, was passiert ist: Anteil richtig, halbiert, wenn ein Zivi gekauft hat (so gilt es nie als geschafft). */
export function undercoverScore(outcome: UndercoverOutcome, customers: number): number {
  if (customers <= 0) return 0;
  const share = Math.min(1, (outcome.sold + outcome.spotted) / customers);
  return Math.round(share * (outcome.soldZivi > 0 ? UNDERCOVER_SOLD_PENALTY : 1) * 1000) / 1000;
}

/** Was police nach dem Minispiel tun muss (die Kontrolle läuft über runCheck in index.ts). */
export interface UndercoverHooks {
  addHeat(ctx: Ctx, veedelId: string, amount: number): number;
  /** Kontrolle gegen dich am Spot wie runCheck (mit der Chance auf die Polizeiflucht). */
  checkPlayer(ctx: Ctx, veedelId: string, spotId: string): void;
}

/** 'minigame.finished' mit origin police/undercover:…: Folgen der Schicht. timeout: nichts. */
export function onUndercoverFinished(ctx: Ctx, payload: GameEvents['minigame.finished'], hooks: UndercoverHooks): void {
  if (payload.origin.module !== 'police' || !payload.origin.ref.startsWith('undercover:')) return;
  const police = ctx.state.modules.police;
  const shift = police.undercover.shift?.challengeId === payload.id ? police.undercover.shift : null;
  if (shift) police.undercover.shift = null;
  if (payload.by === 'timeout' || payload.score === null) return;
  const spotId = payload.origin.ref.slice('undercover:'.length);
  const spot = getSpot(ctx.state, spotId);
  if (!spot) return;
  const params = shift ?? {};
  const outcome = undercoverOutcome(params, payload.score, payload.picks, payload.by);
  const { zivis } = sizes(params);
  const who = payload.by === 'rightHand' ? 'Deine Rechte Hand' : 'Du';
  const ref = { veedelId: spot.veedelId, spotId };
  if (outcome.turnedAway > 0) {
    changeReputation(ctx, UNDERCOVER_REP_TURNED_AWAY * outcome.turnedAway, 'Kunden am Spot abgewimmelt');
  }
  if (outcome.soldZivi > 0) {
    journal.add(
      ctx,
      `${who} ${payload.by === 'rightHand' ? 'hat' : 'hast'} ${atSpot(spot)} an ${outcome.soldZivi === 1 ? 'einen Zivi' : `${outcome.soldZivi} Zivis`} verkauft. Die Kollegen warten schon.`,
      'bad',
      ref,
    );
    hooks.checkPlayer(ctx, spot.veedelId, spotId);
    return;
  }
  if (outcome.spotted >= zivis) {
    hooks.addHeat(ctx, spot.veedelId, -UNDERCOVER_RELIEF);
    const n = outcome.turnedAway;
    const away = n > 0 ? ` ${n === 1 ? 'Ein echter Kunde ist' : `${n} echte Kunden sind`} dabei leer ausgegangen.` : '';
    journal.add(
      ctx,
      `${who} ${payload.by === 'rightHand' ? 'hat' : 'hast'} alle Zivis ${atSpot(spot)} erkannt. Sie ziehen ab, ${veedelName(spot.veedelId)} kühlt ab.${away}`,
      'good',
      ref,
    );
    return;
  }
  journal.add(
    ctx,
    `Schicht mit Zivis ${atSpot(spot)} überstanden, aber nicht jeden erkannt. Die bleiben dran.`,
    'info',
    ref,
  );
}
