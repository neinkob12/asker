// Zustand der Gangs und lesende Hilfen. Die Identität der Gangs (Name, Boss, Stil …) steht in data.ts,
// hier liegt, was sich im Spiel ändert: Stärke, Verhältnis zum Spieler, Abkommen, laufende Vorstöße.

import { type Contact, type GameState, wallet } from '../../core';
import { getStock } from '../goods';
import { getStaff } from '../staff';
import { controlledBy, controllerOf, getInfluence, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import {
  ALLIANCE_HOSTILITY_FACTOR,
  ATTACK_AT,
  CEASEFIRE_BASE_COST,
  CEASEFIRE_COST_PER_HOSTILITY,
  CEASEFIRE_HOSTILITY_FACTOR,
  GANG_SPOT_MIN_INFLUENCE,
  GOODS_PER_POWER,
  MONEY_PER_POWER,
  PEOPLE_POWER,
  PROTECTION_MIN,
  PROTECTION_SHARE,
  THREAT_AT,
  TRIBUTE_BASE,
  TRIBUTE_HOSTILITY_FACTOR,
  TRIBUTE_PER_HOSTILITY,
  VEEDEL_POWER,
  WARN_AT,
} from './config';
import { GANGS, type Gang } from './data';

/** Eskalation gegenüber dem Spieler: 0 ignoriert, 1 gewarnt, 2 bedroht, 3 greift an. */
export type GangStage = 0 | 1 | 2 | 3;

export interface GangPush {
  veedelId: string;
  startedAt: number;
  until: number;
}

/** Der Spieler zahlt der Gang Schutzgeld. */
export interface GangTribute {
  amount: number;
  until: number;
}

/** Die Gang zahlt dem Spieler Schutzgeld. */
export interface GangProtection {
  amount: number;
  nextDueAt: number;
  /** Die letzte Zahlung wurde verweigert. */
  overdue: boolean;
}

export interface GangAlliance {
  againstGangId: string;
  until: number;
}

/** Ware, die die Gang dem Spieler per Nachricht angeboten hat. */
export interface GangOffer {
  id: number;
  amount: number;
  price: number;
  expiresAt: number;
}

/** In Nachrichten genannte Preise, damit sie beim Antworten gelten. */
export interface GangQuote {
  tribute: number;
  ceasefire: number;
  until: number;
}

export interface GangStatus {
  /** Kasse in Euro. */
  money: number;
  /** Leute. */
  people: number;
  /** Ware in Einheiten. */
  goods: number;
  /** Feindseligkeit gegenüber dem Spieler, 0–100. */
  hostility: number;
  /** Beziehung zum Spieler, -100 (Todfeind) bis 100 (Partner). */
  relation: number;
  /** Gleitende Summe deiner Verkäufe in ihrem Revier. */
  turfSales: number;
  stage: GangStage;
  push: GangPush | null;
  lastAttackAt: number | null;
  lastPlayerAttackAt: number | null;
  lastTipOffAt: number | null;
  ceasefireUntil: number | null;
  tribute: GangTribute | null;
  protection: GangProtection | null;
  alliance: GangAlliance | null;
  offer: GangOffer | null;
  quote: GangQuote | null;
  /** Letzter Spot, an dem du in ihrem Revier verkauft hast. */
  lastSaleSpotId: string | null;
}

export interface GangsState {
  gangs: Record<string, GangStatus>;
  /** Zuletzt von den Gangs gesetzter Konkurrenzfaktor pro Veedel (market). */
  priceFactors: Record<string, number>;
}

export function initialGangsState(): GangsState {
  const gangs: Record<string, GangStatus> = {};
  for (const gang of GANGS) {
    gangs[gang.id] = {
      ...gang.traits.start,
      hostility: 0,
      relation: 0,
      turfSales: 0,
      stage: 0,
      push: null,
      lastAttackAt: null,
      lastPlayerAttackAt: null,
      lastTipOffAt: null,
      ceasefireUntil: null,
      tribute: null,
      protection: null,
      alliance: null,
      offer: null,
      quote: null,
      lastSaleSpotId: null,
    };
  }
  return { gangs, priceFactors: {} };
}

/** Alle Gangs. Nimmt den Zustand, weil Gangs später entstehen und verschwinden können. */
export function getGangs(_state: GameState): readonly Gang[] {
  return GANGS;
}

export function getGang(state: GameState, id: string): Gang | undefined {
  return getGangs(state).find((g) => g.id === id);
}

/** Veränderlicher Zustand einer Gang (Stärke, Verhältnis zum Spieler, Abkommen). */
export function getGangStatus(state: GameState, id: string): GangStatus | undefined {
  return state.modules.gangs?.gangs[id];
}

/** Kontakt im Handy. */
export function gangContact(gang: Gang): Contact {
  return { id: `gang:${gang.id}`, name: gang.name, kind: 'gang', avatar: gang.emblem };
}

/**
 * Welche Gang ein Veedel als ihr Revier ansieht: die, die es kontrolliert, sonst die Gang mit dem meisten
 * Einfluss dort (ab GANG_SPOT_MIN_INFLUENCE). null, wenn es der Spieler kontrolliert oder keine Gang dort ist.
 */
export function veedelGang(state: GameState, veedelId: string): string | null {
  const controller = controllerOf(state, veedelId);
  if (controller !== null) return controller === PLAYER_FACTION ? null : controller;
  let best: string | null = null;
  let bestInfluence = GANG_SPOT_MIN_INFLUENCE - 0.001;
  for (const gang of getGangs(state)) {
    const influence = getInfluence(state, veedelId, gang.id);
    if (influence > bestInfluence) {
      best = gang.id;
      bestInfluence = influence;
    }
  }
  return best;
}

/** Revier der Gang: Veedel, die sie kontrolliert oder in denen sie die stärkste Gang ist. */
export function gangVeedel(state: GameState, id: string): string[] {
  return allVeedel()
    .map((v) => v.id)
    .filter((v) => veedelGang(state, v) === id);
}

/** Stärke als eine Zahl: Leute, Geld und Ware. */
export function gangPower(state: GameState, id: string): number {
  const s = getGangStatus(state, id);
  if (!s) return 0;
  return s.people * PEOPLE_POWER + s.money / MONEY_PER_POWER + s.goods / GOODS_PER_POWER;
}

/** Stärke des Spielers auf derselben Skala: Leute (ohne Spezialisten), Veedel, Schwarzgeld, Ware. */
export function playerPower(state: GameState): number {
  const people = getStaff(state, { status: 'active' }).filter(
    (m) => m.role === 'runner' || m.role === 'courier' || m.role === 'security',
  ).length;
  return (
    people * PEOPLE_POWER +
    controlledBy(state, PLAYER_FACTION).length * VEEDEL_POWER +
    wallet.balance(state, 'dirty') / MONEY_PER_POWER +
    getStock(state) / GOODS_PER_POWER
  );
}

/** Keine Leute und kein Revier mehr. */
export function isGangBroken(state: GameState, id: string): boolean {
  const s = getGangStatus(state, id);
  return !!s && s.people <= 0 && gangVeedel(state, id).length === 0;
}

export function hasCeasefire(state: GameState, id: string): boolean {
  const until = getGangStatus(state, id)?.ceasefireUntil;
  return until !== null && until !== undefined && until > state.time;
}

export function paysTribute(state: GameState, id: string): boolean {
  const tribute = getGangStatus(state, id)?.tribute;
  return !!tribute && tribute.until > state.time;
}

export function isAllied(state: GameState, id: string): boolean {
  const alliance = getGangStatus(state, id)?.alliance;
  return !!alliance && alliance.until > state.time;
}

/** Hält die Gang gerade still (Waffenstillstand, Schutzgeld oder Bündnis)? */
export function isAtPeace(state: GameState, id: string): boolean {
  return hasCeasefire(state, id) || paysTribute(state, id) || isAllied(state, id);
}

/** Faktor auf neue Feindseligkeit durch Abkommen (1 = keins). */
export function peaceFactor(state: GameState, id: string): number {
  let factor = 1;
  if (paysTribute(state, id)) factor = Math.min(factor, TRIBUTE_HOSTILITY_FACTOR);
  if (isAllied(state, id)) factor = Math.min(factor, ALLIANCE_HOSTILITY_FACTOR);
  if (hasCeasefire(state, id)) factor = Math.min(factor, CEASEFIRE_HOSTILITY_FACTOR);
  return factor;
}

export function stageFor(hostility: number): GangStage {
  if (hostility >= ATTACK_AT) return 3;
  if (hostility >= THREAT_AT) return 2;
  if (hostility >= WARN_AT) return 1;
  return 0;
}

export const STAGE_NAMES: Record<GangStage, string> = {
  0: 'ignoriert dich',
  1: 'hat dich gewarnt',
  2: 'droht dir',
  3: 'greift an',
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Was ein Waffenstillstand gerade kostet (oder der in einer Nachricht genannte Preis). */
export function ceasefireCost(state: GameState, id: string): number {
  const s = getGangStatus(state, id);
  if (!s) return 0;
  if (s.quote && s.quote.until > state.time) return s.quote.ceasefire;
  return roundTo(CEASEFIRE_BASE_COST + s.hostility * CEASEFIRE_COST_PER_HOSTILITY, 50);
}

/** Schutzgeld pro Woche, das die Gang von dir will (oder der in einer Nachricht genannte Betrag). */
export function tributeAmount(state: GameState, id: string): number {
  const s = getGangStatus(state, id);
  if (!s) return 0;
  if (s.quote && s.quote.until > state.time) return s.quote.tribute;
  return roundTo(TRIBUTE_BASE + s.hostility * TRIBUTE_PER_HOSTILITY, 50);
}

/** Schutzgeld pro Woche, das die Gang dir zahlen müsste. */
export function protectionAmount(state: GameState, id: string): number {
  const s = getGangStatus(state, id);
  if (!s) return 0;
  return Math.max(PROTECTION_MIN, roundTo(s.money * PROTECTION_SHARE, 50));
}
