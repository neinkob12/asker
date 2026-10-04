// Spots: Orte, an denen auf der Straße verkauft wird. Jeder Spot liegt in einem Veedel.
// Vorgegebene Spots sind teils von Anfang an offen, die anderen schaltet man frei. Eigene Spots gründet man
// per Klick auf die Karte (Kosten, Veedel über veedelAt). Jedes Veedel hat mindestens zwei vorgegebene Spots,
// mindestens einer davon zum Freischalten, damit jedes Veedel übernehmbar ist (Auftrag 28).
//
// Seit Auftrag 30 gibt es Spots in Köln und Hamburg; die Stadt ergibt sich aus dem Veedel (spotCity). Hamburg hat
// keine offenen Spots (dort fängst du ohne an), freischalten kostet dort das 1,5-Fache (in der Tabelle eingerechnet).
//
// Öffentliche API:
//   getSpots(state, cityId?)  Spots, an denen gerade verkauft werden kann (offen + eigene), mit Stadt nur die dort
//   spotCity(spot)            Stadt eines Spots
//   getAllSpots(state)    auch die noch gesperrten
//   getSpot(state, id)    sucht in allen Spots (auch gesperrten), isSpotActive(state, id)
//   spotsInVeedel(state, veedelId), lockedSpots(state), customSpots(state), canFoundSpotAt(state, lng, lat)
//   FOUND_SPOT_COST, MAX_CUSTOM_SPOTS
// Befehle: 'spots.unlock', 'spots.found'
// Ereignisse: 'spots.unlocked', 'spots.founded'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  distanceMeters,
  formatEuro,
  type GameState,
  journal,
  MINUTES_PER_DAY,
  wallet,
} from '../../core';
import { isCityUnlocked } from '../city';
import { getVeedel, veedelAt, veedelCity, veedelName } from '../veedel';
import {
  CUSTOM_SPOT_DEMAND,
  FOUND_SPOT_COST,
  KNEIPE,
  MAX_CUSTOM_SPOTS,
  MIN_SPOT_DISTANCE,
  ORIGINAL_SPOT_IDS,
  PRESET_SPOTS,
  SPOT_LABELS,
} from './config';

export { FOUND_SPOT_COST, KNEIPE, MAX_CUSTOM_SPOTS } from './config';

export interface Spot {
  id: string;
  name: string;
  lng: number;
  lat: number;
  veedelId: string;
  /** Wie oft hier Kunden auftauchen (1 = normal). */
  demand: number;
  /** Aufschlag auf den Richtpreis (1 = normal). */
  priceMultiplier: number;
  /** Vorgegebene Spots: Preis fürs Freischalten (0 = von Anfang an offen). */
  unlockCost?: number;
  /** Anteil der Kundentypen hier (Typ-ID → Faktor, 1 = normal). */
  audience?: Readonly<Record<string, number>>;
  /** true bei selbst gegründeten Spots. */
  custom?: boolean;
  /** Gründungszeitpunkt (eigene Spots). */
  foundedAt?: number;
  /**
   * Art (Auftrag 30, Etappe 7): 'kneipe' = Veedel-Kneipe, offen KNEIPE.from bis KNEIPE.to Uhr, weniger Laufkundschaft,
   * doppelt so viele Stammkunden, der Ruf zählt doppelt, die Gäste schauen weniger auf den Preis. Ohne: Straße.
   */
  kind?: 'kneipe';
}

export interface SpotsState {
  /** Freigeschaltete vorgegebene Spots. */
  unlocked: string[];
  /** Selbst gegründete Spots. */
  custom: Spot[];
}

declare module '../../core' {
  interface ModuleStates {
    spots: SpotsState;
  }
  interface GameCommands {
    'spots.unlock': { spotId: string };
    /** Eigenen Spot an dieser Stelle gründen. name optional, sonst nach dem Veedel benannt. */
    'spots.found': { lng: number; lat: number; name?: string };
  }
  interface GameEvents {
    'spots.unlocked': { spotId: string; veedelId: string };
    'spots.founded': { spotId: string; veedelId: string };
  }
}

let presets: readonly Spot[] | null = null;
let presetIndex: Map<string, Spot> | null = null;

/**
 * Vorgegebene Spots mit ihrem Veedel. Das Veedel kommt aus der echten Grenze (veedelAt), nicht aus einer Tabelle.
 * Erst beim ersten Aufruf berechnet (keine Top-Level-Nutzung anderer Module).
 */
function presetSpots(): readonly Spot[] {
  if (!presets) {
    presets = PRESET_SPOTS.map((s) => {
      const veedel = veedelAt(s.lng, s.lat);
      if (!veedel) throw new Error(`Spot ${s.id} liegt in keinem Veedel.`);
      return { ...s, veedelId: veedel.id };
    });
    presetIndex = new Map(presets.map((s) => [s.id, s]));
  }
  return presets;
}

function presetById(id: string): Spot | undefined {
  presetSpots();
  return presetIndex?.get(id);
}

// Die aktiven Spots werden viele Male pro Spielminute gefragt (Leutnants, Kunden, Läufer, Karte). Gemerkt pro
// Zustand, solange sich die Listen nicht ändern (freigeschaltet und gegründet wird nur angehängt).
interface ActiveCache {
  unlocked: readonly string[];
  unlockedCount: number;
  custom: readonly Spot[];
  customCount: number;
  spots: readonly Spot[];
  /** Dieselbe Liste pro Stadt. */
  byCity: Map<string, readonly Spot[]>;
}
const activeCache = new WeakMap<SpotsState, ActiveCache>();

/** Stadt eines Spots (über sein Veedel). */
export function spotCity(spot: Pick<Spot, 'veedelId'>): string {
  return veedelCity(spot.veedelId);
}

/**
 * Alle Spots, an denen gerade verkauft werden kann (freigeschaltet oder selbst gegründet); mit Stadt nur die in dieser
 * Stadt.
 */
export function getSpots(state: GameState, cityId?: string): readonly Spot[] {
  const all = activeSpots(state);
  if (cityId === undefined) return all;
  const cached = activeCache.get(state.modules.spots);
  if (!cached) return all.filter((s) => spotCity(s) === cityId);
  let list = cached.byCity.get(cityId);
  if (!list) {
    list = Object.freeze(all.filter((s) => spotCity(s) === cityId));
    cached.byCity.set(cityId, list);
  }
  return list;
}

function activeSpots(state: GameState): readonly Spot[] {
  const s = state.modules.spots;
  const cached = activeCache.get(s);
  if (
    cached &&
    cached.unlocked === s.unlocked &&
    cached.unlockedCount === s.unlocked.length &&
    cached.custom === s.custom &&
    cached.customCount === s.custom.length
  ) {
    return cached.spots;
  }
  const unlocked = s.unlocked;
  const spots = Object.freeze([...presetSpots().filter((p) => unlocked.includes(p.id)), ...s.custom]);
  activeCache.set(s, {
    unlocked,
    unlockedCount: unlocked.length,
    custom: s.custom,
    customCount: s.custom.length,
    spots,
    byCity: new Map(),
  });
  return spots;
}

/** Alle bekannten Spots, auch die noch gesperrten. */
export function getAllSpots(state: GameState): readonly Spot[] {
  return [...presetSpots(), ...state.modules.spots.custom];
}

/** Spot nach ID, auch gesperrte (für Namen und Veedel). Ob dort verkauft wird: isSpotActive. */

/** Ist der Spot eine Kneipe (Etappe 7)? */
export function isKneipe(spot: Pick<Spot, 'kind'> | undefined): boolean {
  return spot?.kind === 'kneipe';
}

/** Hat der Spot gerade offen? Straßen-Spots immer, Kneipen von KNEIPE.from bis KNEIPE.to Uhr. */
export function isSpotOpen(spot: Pick<Spot, 'kind'>, time: number): boolean {
  if (spot.kind !== 'kneipe') return true;
  const hour = clock.hour(time);
  return KNEIPE.from > KNEIPE.to ? hour >= KNEIPE.from || hour < KNEIPE.to : hour >= KNEIPE.from && hour < KNEIPE.to;
}

/** Nächste Öffnung ab time (time selbst, wenn offen). */
export function nextSpotOpening(spot: Pick<Spot, 'kind'>, time: number): number {
  if (isSpotOpen(spot, time)) return time;
  const dayStart = time - clock.minuteOfDay(time);
  const today = dayStart + KNEIPE.from * 60;
  return today > time ? today : today + MINUTES_PER_DAY;
}

/** Wo die Plakette eines Spots auf der Karte steht (Seite, Versatz in px). Nur Darstellung. */
export function spotLabelPlacement(spotId: string): { labelSide: 'left' | 'right'; labelOffsetY: number } {
  return SPOT_LABELS[spotId] ?? { labelSide: 'right', labelOffsetY: 0 };
}

export function getSpot(state: GameState, id: string): Spot | undefined {
  return presetById(id) ?? state.modules.spots.custom.find((s) => s.id === id);
}

export function isSpotActive(state: GameState, id: string): boolean {
  if (presetById(id)) return state.modules.spots.unlocked.includes(id);
  return state.modules.spots.custom.some((s) => s.id === id);
}

export function lockedSpots(state: GameState): Spot[] {
  return presetSpots().filter((s) => !state.modules.spots.unlocked.includes(s.id));
}

export function customSpots(state: GameState): readonly Spot[] {
  return state.modules.spots.custom;
}

/** Aktive Spots in einem Veedel. */
export function spotsInVeedel(state: GameState, veedelId: string): Spot[] {
  return getSpots(state).filter((s) => s.veedelId === veedelId);
}

/** Kann hier ein eigener Spot entstehen? Gibt den Grund zurück, wenn nicht. */
export function canFoundSpotAt(
  state: GameState,
  lng: number,
  lat: number,
): { ok: true; veedelId: string } | { ok: false; reason: string } {
  if (state.modules.spots.custom.length >= MAX_CUSTOM_SPOTS) {
    return { ok: false, reason: `Mehr als ${MAX_CUSTOM_SPOTS} eigene Spots kannst du nicht halten.` };
  }
  const veedel = veedelAt(lng, lat);
  if (!veedel) return { ok: false, reason: 'Da ist kein Veedel. Such dir eine Stelle in einem Veedel im Spiel.' };
  if (!isCityUnlocked(state, veedel.cityId)) return { ok: false, reason: 'In dieser Stadt bist du noch nicht.' };
  const tooClose = getAllSpots(state).find((s) => distanceMeters(s, { lng, lat }) < MIN_SPOT_DISTANCE);
  if (tooClose) return { ok: false, reason: `Zu nah am ${tooClose.name}.` };
  return { ok: true, veedelId: veedel.id };
}

function unlock(ctx: Ctx, spotId: string): CommandResult {
  const spot = presetSpots().find((s) => s.id === spotId);
  if (!spot) return { ok: false, reason: 'Unbekannter Spot.' };
  if (!isCityUnlocked(ctx.state, spotCity(spot))) return { ok: false, reason: 'In dieser Stadt bist du noch nicht.' };
  const state = ctx.state.modules.spots;
  if (state.unlocked.includes(spotId)) return { ok: false, reason: 'Der Spot ist schon offen.' };
  const cost = spot.unlockCost ?? 0;
  if (!wallet.pay(ctx, cost, 'dirty', `Spot ${spot.name}`, { category: 'expansion', spotId: spot.id }))
    return { ok: false, reason: 'Nicht genug Geld.' };
  state.unlocked.push(spotId);
  journal.add(ctx, `${spot.name} freigeschaltet (${formatEuro(cost)}). Hier kannst du jetzt verkaufen.`, 'good', {
    spotId,
    veedelId: spot.veedelId,
  });
  ctx.emit('spots.unlocked', { spotId, veedelId: spot.veedelId });
  return { ok: true };
}

function found(ctx: Ctx, payload: { lng: number; lat: number; name?: string }): CommandResult {
  const { lng, lat } = payload;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, reason: 'Ungültiger Ort.' };
  const check = canFoundSpotAt(ctx.state, lng, lat);
  if (!check.ok) return check;
  // Die Kosten gehören zur Stadt des Veedels, nicht zur gerade aktiven.
  const cityId = veedelCity(check.veedelId);
  if (!wallet.pay(ctx, FOUND_SPOT_COST, 'dirty', 'Eigener Spot', { category: 'expansion', cityId }))
    return { ok: false, reason: 'Nicht genug Geld.' };
  const state = ctx.state.modules.spots;
  const veedel = getVeedel(check.veedelId);
  const count = state.custom.filter((s) => s.veedelId === check.veedelId).length + 1;
  const name = payload.name?.trim().slice(0, 40) || `Ecke ${veedelName(check.veedelId)}${count > 1 ? ` ${count}` : ''}`;
  const spot: Spot = {
    id: `custom-${ctx.nextId()}`,
    name,
    lng: Math.round(lng * 1e5) / 1e5,
    lat: Math.round(lat * 1e5) / 1e5,
    veedelId: check.veedelId,
    demand: Math.round(CUSTOM_SPOT_DEMAND * (veedel?.density ?? 1) * 100) / 100,
    priceMultiplier: 1,
    custom: true,
    foundedAt: ctx.now,
  };
  state.custom.push(spot);
  journal.add(ctx, `Eigenen Spot "${spot.name}" in ${veedelName(spot.veedelId)} gegründet.`, 'good', {
    spotId: spot.id,
    veedelId: spot.veedelId,
  });
  ctx.emit('spots.founded', { spotId: spot.id, veedelId: spot.veedelId });
  return { ok: true, data: { spotId: spot.id } };
}

export default defineModule({
  id: 'spots',
  version: 3,
  dependsOn: ['veedel'],
  init: () => ({ unlocked: PRESET_SPOTS.filter((s) => !s.unlockCost).map((s) => s.id), custom: [] }),
  commands: {
    'spots.unlock': (ctx, { spotId }) => unlock(ctx, spotId),
    'spots.found': (ctx, payload) => found(ctx, payload),
  },
  migrations: {
    // Version 1 hatte keinen Zustand, alle damaligen Spots waren offen. So bleibt es für alte Spielstände.
    2: (): SpotsState => ({ unlocked: [...ORIGINAL_SPOT_IDS], custom: [] }),
    // Version 3 (Auftrag 28): Jedes Veedel hat Spots. Alte Spielstände bekommen die neuen dazu, gesperrt (ein Spot
    // ist offen, wenn er in unlocked steht); unbekannte IDs fliegen raus.
    3: (old: SpotsState): SpotsState => ({
      ...old,
      unlocked: old.unlocked.filter((id) => PRESET_SPOTS.some((s) => s.id === id)),
    }),
  },
});
