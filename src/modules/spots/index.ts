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
//   Auftrag 23: spotKind(spot), spotType(spot), SPOT_TYPES, SPOT_UPGRADES, spotAwareness(state, id),
//   spotDemandFactor(state, spot, time) (Bekanntheit, Tageskurve, Wetter der Art), spotModifiers(state, id) (Heat,
//   Späher, Versteck, Stammplatz), spotUpgrades(state, id), foundCost(kind)
//   J4: atSpot(spot) („am Ebertplatz“, „an der Uni-Wiese“), atSpotStart(spot) (Satzanfang), spotVars(spot)
//   (Platzhalter {spot}, {atSpot}, {AtSpot} für texts.pick). Nie „am ${spot.name}“ schreiben.
// Befehle: 'spots.unlock', 'spots.found' (mit kind), Auftrag 23: 'spots.upgrade', 'spots.move', 'spots.rename',
//   'spots.close'
// Ereignisse: 'spots.unlocked', 'spots.founded', Auftrag 23: 'spots.upgraded', 'spots.moved', 'spots.closed'

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
  WEEKDAYS_SHORT,
  wallet,
} from '../../core';
import { isCityLive, isCityUnlocked } from '../city';
import { activeRunnerAt, assign, getStaff } from '../staff';
import { getVeedel, veedelAt, veedelCity, veedelName } from '../veedel';
import { getWeather, isPrecipitation } from '../weather';
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
import {
  AWARENESS_DECAY_PER_DAY,
  AWARENESS_FLOOR,
  AWARENESS_MIN,
  AWARENESS_PER_REGULAR,
  AWARENESS_PER_STAFFED_DAY,
  AWARENESS_PER_UNIT,
  AWARENESS_START,
  LOOKOUT_AVOID,
  MOVE_COST,
  MOVE_KEEP_AWARENESS,
  PRESET_KINDS,
  REGULAR_PLACE_FACTOR,
  SPOT_TYPES,
  SPOT_UPGRADES,
  type SpotKind,
  type SpotType,
  type SpotUpgradeId,
  STASH_LOSS_FACTOR,
} from './kinds';
import { atSpot } from './places';

export { CUSTOM_SPOT_DEMAND, FOUND_SPOT_COST, KNEIPE, MAX_CUSTOM_SPOTS } from './config';
export {
  MOVE_COST,
  SPOT_KINDS,
  SPOT_TYPES,
  SPOT_UPGRADE_IDS,
  SPOT_UPGRADES,
  type SpotKind,
  type SpotType,
  type SpotUpgrade,
  type SpotUpgradeId,
} from './kinds';
export { atSpot, atSpotStart, type SpotPlace, spotVars } from './places';

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
  /**
   * Wie man sagt, dass etwas hier passiert, wenn die Regeln in places.ts nicht passen (J4), z.B. „auf dem Tempelhofer
   * Feld“. Sonst atSpot(spot).
   */
  at?: string;
  /** Anteil der Kundentypen hier (Typ-ID → Faktor, 1 = normal). */
  audience?: Readonly<Record<string, number>>;
  /** true bei selbst gegründeten Spots. */
  custom?: boolean;
  /** Gründungszeitpunkt (eigene Spots). */
  foundedAt?: number;
  /**
   * Art (Auftrag 30, Etappe 7): 'kneipe' = Veedel-Kneipe, offen KNEIPE.from bis KNEIPE.to Uhr, weniger Laufkundschaft,
   * doppelt so viele Stammkunden, der Ruf zählt doppelt, die Gäste schauen weniger auf den Preis. Seit Auftrag 23
   * weitere Arten (kinds.ts: Straßenecke, Späti, Club, Park, Bahnhof, Campus). Ohne: Straßenecke.
   */
  kind?: SpotKind;
  /**
   * Öffnungszeiten über die Woche (Auftrag 37): [von, bis) in Stunden ab Montag 0 Uhr (0–167), z.B. [118, 8] = Freitag
   * 22 Uhr bis Montag 8 Uhr (Berliner Clubs). Geht vor den Öffnungszeiten der Art; fehlt: wie bisher.
   */
  weekHours?: readonly [number, number];
}

export interface SpotsState {
  /** Freigeschaltete vorgegebene Spots. */
  unlocked: string[];
  /** Selbst gegründete Spots. */
  custom: Spot[];
  /** Bekanntheit eigener Spots (0–1, Auftrag 23). Fehlt ein Spot: voll bekannt. */
  awareness: Record<string, number>;
  /** Ausbau pro Spot (Auftrag 23). */
  upgrades: Record<string, SpotUpgradeId[]>;
}

/** Zustand bis Version 3 (vor Auftrag 23). */
type SpotsStateV3 = Pick<SpotsState, 'unlocked' | 'custom'>;

declare module '../../core' {
  interface ModuleStates {
    spots: SpotsState;
  }
  interface GameCommands {
    'spots.unlock': { spotId: string };
    /** Eigenen Spot an dieser Stelle gründen. name optional, sonst nach dem Veedel benannt; kind Standard Straßenecke. */
    'spots.found': { lng: number; lat: number; name?: string; kind?: SpotKind };
    /** Spot ausbauen (Auftrag 23): Späher, Versteck, Stammplatz. */
    'spots.upgrade': { spotId: string; upgrade: SpotUpgradeId };
    /** Eigenen Spot verlegen (kostet, behält einen Teil der Bekanntheit). */
    'spots.move': { spotId: string; lng: number; lat: number };
    /** Eigenen Spot umbenennen (kostenlos). */
    'spots.rename': { spotId: string; name: string };
    /** Eigenen Spot aufgeben: Leute dort werden frei, Stammkunden wechseln (customers). */
    'spots.close': { spotId: string };
  }
  interface GameEvents {
    'spots.unlocked': { spotId: string; veedelId: string };
    'spots.founded': { spotId: string; veedelId: string; kind?: SpotKind };
    'spots.upgraded': { spotId: string; upgrade: SpotUpgradeId };
    'spots.moved': { spotId: string; fromVeedelId: string; veedelId: string };
    'spots.closed': { spotId: string; veedelId: string; lng: number; lat: number };
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
      const kind = s.kind ?? PRESET_KINDS[s.id];
      return { ...s, veedelId: veedel.id, ...(kind ? { kind } : {}) };
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

/**
 * Öffnungszeiten [von, bis) eines Spots oder null (immer offen): Kneipen von KNEIPE.from bis KNEIPE.to Uhr, eigene
 * Spots nach ihrer Art (Auftrag 23). Vorgegebene Spots einer anderen Art sind immer offen (ihre Werte stehen im Spot).
 */
function openingHours(spot: OpeningInfo): readonly [number, number] | null {
  if (spot.kind === 'kneipe') return [KNEIPE.from, KNEIPE.to];
  if (!spot.custom || !spot.kind) return null;
  return SPOT_TYPES[spot.kind]?.hours ?? null;
}

/** Was die Öffnungszeiten eines Spots bestimmt. */
type OpeningInfo = Pick<Spot, 'kind' | 'weekHours'> & { custom?: boolean };

const HOURS_PER_WEEK = 7 * 24;

/** Stunde der Woche (0 = Montag 0 Uhr … 167 = Sonntag 23 Uhr). */
function hourOfWeek(time: number): number {
  return clock.weekday(time) * 24 + clock.hour(time);
}

/** Liegt h im Fenster [from, to) (über Mitternacht bzw. das Wochenende hinweg, wenn from > to)? */
function inWindow(h: number, from: number, to: number): boolean {
  return from > to ? h >= from || h < to : h >= from && h < to;
}

/**
 * Hat der Spot gerade offen? Straßen-Spots immer, Kneipen von KNEIPE.from bis KNEIPE.to Uhr, eigene nach Art, Spots
 * mit weekHours nur in diesem Fenster der Woche.
 */
export function isSpotOpen(spot: OpeningInfo, time: number): boolean {
  if (spot.weekHours) return inWindow(hourOfWeek(time), spot.weekHours[0], spot.weekHours[1]);
  const hours = openingHours(spot);
  if (!hours) return true;
  return inWindow(clock.hour(time), hours[0], hours[1]);
}

/** Nächste Öffnung ab time (time selbst, wenn offen). */
export function nextSpotOpening(spot: OpeningInfo, time: number): number {
  if (isSpotOpen(spot, time)) return time;
  const hourStart = time - (time % 60);
  if (spot.weekHours) {
    const wait = (spot.weekHours[0] - hourOfWeek(time) + HOURS_PER_WEEK) % HOURS_PER_WEEK;
    return hourStart + wait * 60;
  }
  const from = openingHours(spot)?.[0] ?? 0;
  const dayStart = time - clock.minuteOfDay(time);
  const today = dayStart + from * 60;
  return today > time ? today : today + MINUTES_PER_DAY;
}

/** Öffnungszeiten als Text ("21–5 Uhr", "Fr 22 – Mo 8 Uhr") oder null, wenn immer offen. */
/**
 * Wann ein geschlossener Spot wieder öffnet (Spielminute zur vollen Stunde), null wenn er offen ist oder immer offen
 * (Auftrag 43, L1: Berliner Clubs standen nur „zu“ da, ohne zu sagen, ab wann).
 */
export function spotOpensAt(spot: OpeningInfo, time: number): number | null {
  if (isSpotOpen(spot, time)) return null;
  const start = time - (time % 60);
  for (let h = 1; h <= 7 * 24; h++) {
    const at = start + h * 60;
    if (isSpotOpen(spot, at)) return at;
  }
  return null;
}

export function spotHoursLabel(spot: OpeningInfo): string | null {
  if (spot.weekHours) {
    const at = (h: number) => `${WEEKDAYS_SHORT[Math.floor(h / 24) % 7]} ${h % 24}`;
    return `${at(spot.weekHours[0])} – ${at(spot.weekHours[1])} Uhr`;
  }
  const hours = openingHours(spot);
  return hours ? `${hours[0]}–${hours[1]} Uhr` : null;
}

// ---------------------------------------------------------------------------------------------
// Art, Bekanntheit, Ausbau (Auftrag 23)

/** Art eines Spots (ohne Angabe: Straßenecke). */
export function spotKind(spot: Pick<Spot, 'kind'> | undefined): SpotKind {
  return spot?.kind ?? 'corner';
}

export function spotType(spot: Pick<Spot, 'kind'> | undefined): SpotType {
  return SPOT_TYPES[spotKind(spot)] ?? SPOT_TYPES.corner;
}

/** Gründungskosten einer Art. */
export function foundCost(kind: SpotKind = 'corner'): number {
  return SPOT_TYPES[kind]?.foundCost ?? FOUND_SPOT_COST;
}

/** Bekanntheit 0–1. Vorgegebene und alte eigene Spots sind voll bekannt. */
export function spotAwareness(state: GameState, spotId: string): number {
  return state.modules.spots.awareness?.[spotId] ?? 1;
}

export function spotUpgrades(state: GameState, spotId: string): readonly SpotUpgradeId[] {
  return state.modules.spots.upgrades?.[spotId] ?? [];
}

export function hasSpotUpgrade(state: GameState, spotId: string, upgrade: SpotUpgradeId): boolean {
  return spotUpgrades(state, spotId).includes(upgrade);
}

/**
 * Faktor auf den Andrang eines Spots (customers fragt beim Erzeugen der Kunden): Bekanntheit, bei eigenen Spots dazu
 * Tageskurve, Wochenende und Wetter ihrer Art. Vorgegebene, voll bekannte Spots: 1.
 */
export function spotDemandFactor(state: GameState, spot: Spot, time: number): number {
  const awareness = spotAwareness(state, spot.id);
  let factor = awareness >= 1 ? 1 : AWARENESS_FLOOR + (1 - AWARENESS_FLOOR) * awareness;
  if (!spot.custom || !spot.kind || spot.kind === 'corner') return factor;
  const type = SPOT_TYPES[spot.kind];
  if (!type) return factor;
  const hour = clock.hour(time);
  factor *= hour >= 20 || hour < 4 ? type.night : type.day;
  const weekday = clock.weekday(time);
  // Freitagabend bis Sonntag (Tag 1 ist ein Freitag, weekday 4 = Freitag).
  if ((weekday === 4 && hour >= 18) || weekday === 5 || weekday === 6) factor *= type.weekend;
  if (type.rain !== 1 && isPrecipitation(getWeather(state).kind)) factor *= type.rain;
  return factor;
}

export interface SpotModifiers {
  /** Heat pro Verkauf (Art, nur eigene Spots). */
  heatFactor: number;
  /** Chance, dass eine Kontrolle am Spot ins Leere geht (Späher). */
  checkAvoid: number;
  /** Faktor auf Verluste bei Kontrolle oder Überfall (Versteck). */
  lossFactor: number;
  /** Faktor auf neue Stammkunden (Stammplatz). */
  regularFactor: number;
}

/** Wirkung von Art und Ausbau eines Spots; police, customers und gangs fragen das zur Laufzeit. */
export function spotModifiers(state: GameState, spotId: string | null | undefined): SpotModifiers {
  const none = { heatFactor: 1, checkAvoid: 0, lossFactor: 1, regularFactor: 1 };
  if (!spotId) return none;
  const spot = getSpot(state, spotId);
  const upgrades = spotUpgrades(state, spotId);
  return {
    heatFactor: spot?.custom ? spotType(spot).heatFactor : 1,
    checkAvoid: upgrades.includes('lookout') ? LOOKOUT_AVOID : 0,
    lossFactor: upgrades.includes('stash') ? STASH_LOSS_FACTOR : 1,
    regularFactor: upgrades.includes('regular') ? REGULAR_PLACE_FACTOR : 1,
  };
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
  if (tooClose) return { ok: false, reason: `Zu nah ${atSpot(tooClose)}.` };
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

function found(ctx: Ctx, payload: { lng: number; lat: number; name?: string; kind?: SpotKind }): CommandResult {
  const { lng, lat } = payload;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, reason: 'Ungültiger Ort.' };
  const kind = payload.kind ?? 'corner';
  const type = SPOT_TYPES[kind];
  if (!type?.foundable) return { ok: false, reason: 'So einen Spot kannst du nicht selbst gründen.' };
  const check = canFoundSpotAt(ctx.state, lng, lat);
  if (!check.ok) return check;
  // Die Kosten gehören zur Stadt des Veedels, nicht zur gerade aktiven.
  const cityId = veedelCity(check.veedelId);
  if (!wallet.pay(ctx, type.foundCost, 'dirty', `Eigener Spot (${type.name})`, { category: 'expansion', cityId }))
    return { ok: false, reason: 'Nicht genug Geld.' };
  const state = ctx.state.modules.spots;
  const veedel = getVeedel(check.veedelId);
  const count = state.custom.filter((s) => s.veedelId === check.veedelId).length + 1;
  const prefix = kind === 'corner' ? 'Ecke' : type.name;
  const name =
    payload.name?.trim().slice(0, 40) || `${prefix} ${veedelName(check.veedelId)}${count > 1 ? ` ${count}` : ''}`;
  const spot: Spot = {
    id: `custom-${ctx.nextId()}`,
    name,
    lng: Math.round(lng * 1e5) / 1e5,
    lat: Math.round(lat * 1e5) / 1e5,
    veedelId: check.veedelId,
    demand: Math.round(CUSTOM_SPOT_DEMAND * type.demand * (veedel?.density ?? 1) * 100) / 100,
    priceMultiplier: type.priceMultiplier,
    ...(Object.keys(type.audience).length > 0 ? { audience: { ...type.audience } } : {}),
    custom: true,
    foundedAt: ctx.now,
    kind,
  };
  state.custom.push(spot);
  // Neu: Die Kundschaft muss den Spot erst kennenlernen (Auftrag 23).
  state.awareness[spot.id] = AWARENESS_START;
  journal.add(ctx, `Eigenen Spot "${spot.name}" (${type.name}) in ${veedelName(spot.veedelId)} gegründet.`, 'good', {
    spotId: spot.id,
    veedelId: spot.veedelId,
  });
  ctx.emit('spots.founded', { spotId: spot.id, veedelId: spot.veedelId, kind });
  return { ok: true, data: { spotId: spot.id } };
}

function ownSpot(ctx: Ctx, spotId: string): Spot | string {
  const spot = ctx.state.modules.spots.custom.find((s) => s.id === spotId);
  if (!spot)
    return getSpot(ctx.state, spotId)
      ? 'Nur eigene Spots lassen sich verlegen, umbenennen oder aufgeben.'
      : 'Unbekannter Spot.';
  return spot;
}

function upgrade(ctx: Ctx, spotId: string, id: SpotUpgradeId): CommandResult {
  const spot = getSpot(ctx.state, spotId);
  const def = SPOT_UPGRADES[id];
  if (!spot || !isSpotActive(ctx.state, spotId)) return { ok: false, reason: 'Diesen Spot hast du nicht.' };
  if (!def) return { ok: false, reason: 'Unbekannter Ausbau.' };
  const state = ctx.state.modules.spots;
  const list = state.upgrades[spotId] ?? [];
  if (list.includes(id)) return { ok: false, reason: `${def.name} gibt es ${atSpot(spot)} schon.` };
  if (!wallet.pay(ctx, def.cost, 'dirty', `${def.name} ${atSpot(spot)}`, { category: 'expansion', spotId }))
    return { ok: false, reason: 'Nicht genug Geld.' };
  state.upgrades[spotId] = [...list, id];
  journal.add(ctx, `${spot.name}: ${def.name} eingerichtet (${formatEuro(def.cost)}).`, 'good', { spotId });
  ctx.emit('spots.upgraded', { spotId, upgrade: id });
  return { ok: true };
}

function move(ctx: Ctx, payload: { spotId: string; lng: number; lat: number }): CommandResult {
  const spot = ownSpot(ctx, payload.spotId);
  if (typeof spot === 'string') return { ok: false, reason: spot };
  const { lng, lat } = payload;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, reason: 'Ungültiger Ort.' };
  const veedel = veedelAt(lng, lat);
  if (!veedel) return { ok: false, reason: 'Da ist kein Veedel.' };
  if (veedel.cityId !== spotCity(spot)) return { ok: false, reason: 'Verlegen geht nur innerhalb der Stadt.' };
  const tooClose = getAllSpots(ctx.state).find(
    (s) => s.id !== spot.id && distanceMeters(s, { lng, lat }) < MIN_SPOT_DISTANCE,
  );
  if (tooClose) return { ok: false, reason: `Zu nah ${atSpot(tooClose)}.` };
  if (!wallet.pay(ctx, MOVE_COST, 'dirty', `${spot.name} verlegt`, { category: 'expansion', spotId: spot.id }))
    return { ok: false, reason: 'Nicht genug Geld.' };
  const from = spot.veedelId;
  const density = (getVeedel(veedel.id)?.density ?? 1) / (getVeedel(from)?.density ?? 1);
  spot.lng = Math.round(lng * 1e5) / 1e5;
  spot.lat = Math.round(lat * 1e5) / 1e5;
  spot.veedelId = veedel.id;
  spot.demand = Math.round(spot.demand * density * 100) / 100;
  const state = ctx.state.modules.spots;
  state.awareness[spot.id] = Math.max(AWARENESS_MIN, spotAwareness(ctx.state, spot.id) * MOVE_KEEP_AWARENESS);
  // Die Liste pro Stadt ist gemerkt: neu aufbauen lassen (das Veedel kann sich geändert haben).
  state.custom = [...state.custom];
  journal.add(ctx, `${spot.name} nach ${veedelName(veedel.id)} verlegt. Ein Teil der Kundschaft kommt mit.`, 'info', {
    spotId: spot.id,
  });
  ctx.emit('spots.moved', { spotId: spot.id, fromVeedelId: from, veedelId: veedel.id });
  return { ok: true };
}

function rename(ctx: Ctx, spotId: string, name: string): CommandResult {
  const spot = ownSpot(ctx, spotId);
  if (typeof spot === 'string') return { ok: false, reason: spot };
  const clean = (name ?? '').trim().slice(0, 40);
  if (clean.length < 2) return { ok: false, reason: 'Der Name ist zu kurz.' };
  const old = spot.name;
  spot.name = clean;
  journal.add(ctx, `${old} heißt jetzt ${clean}.`, 'info', { spotId });
  return { ok: true };
}

function close(ctx: Ctx, spotId: string): CommandResult {
  const spot = ownSpot(ctx, spotId);
  if (typeof spot === 'string') return { ok: false, reason: spot };
  // Leute dort werden frei.
  let freed = 0;
  for (const m of getStaff(ctx.state, { spotId })) if (assign(ctx, m.id, null)) freed++;
  const state = ctx.state.modules.spots;
  state.custom = state.custom.filter((s) => s.id !== spotId);
  delete state.awareness[spotId];
  delete state.upgrades[spotId];
  journal.add(
    ctx,
    `${spot.name} aufgegeben.${freed > 0 ? ` ${freed === 1 ? 'Eine Person ist' : `${freed} Leute sind`} wieder frei.` : ''}`,
    'info',
    { veedelId: spot.veedelId },
  );
  ctx.emit('spots.closed', { spotId, veedelId: spot.veedelId, lng: spot.lng, lat: spot.lat });
  return { ok: true };
}

/** Bekanntheit wächst mit Verkäufen (customers meldet sale.completed), Stammplatz beschleunigt. */
function grow(ctx: Ctx, spotId: string | null | undefined, amount: number): void {
  if (!spotId) return;
  const state = ctx.state.modules.spots;
  const current = state.awareness[spotId];
  if (current === undefined || current >= 1) return;
  const factor = hasSpotUpgrade(ctx.state, spotId, 'regular') ? REGULAR_PLACE_FACTOR : 1;
  state.awareness[spotId] = Math.round(Math.min(1, current + amount * factor) * 1000) / 1000;
}

/** Um Mitternacht: Tage mit Leuten am Spot machen ihn bekannter, leere Tage lassen ihn vergessen. */
function dailyAwareness(ctx: Ctx): void {
  const state = ctx.state.modules.spots;
  for (const spot of state.custom) {
    const current = state.awareness[spot.id];
    if (current === undefined || !isCityLive(ctx.state, spotCity(spot))) continue;
    const staffed = !!activeRunnerAt(ctx.state, spot.id);
    if (staffed) grow(ctx, spot.id, AWARENESS_PER_STAFFED_DAY);
    else
      state.awareness[spot.id] = Math.max(AWARENESS_MIN, Math.round((current - AWARENESS_DECAY_PER_DAY) * 1000) / 1000);
  }
}

export default defineModule({
  id: 'spots',
  version: 4,
  dependsOn: ['veedel'],
  init: () => ({
    unlocked: PRESET_SPOTS.filter((s) => !s.unlockCost).map((s) => s.id),
    custom: [],
    awareness: {},
    upgrades: {},
  }),
  tickEvery: 60,
  tick: (ctx) => {
    if (clock.hour(ctx.now) === 0) dailyAwareness(ctx);
  },
  commands: {
    'spots.unlock': (ctx, { spotId }) => unlock(ctx, spotId),
    'spots.found': (ctx, payload) => found(ctx, payload),
    'spots.upgrade': (ctx, { spotId, upgrade: id }) => upgrade(ctx, spotId, id),
    'spots.move': (ctx, payload) => move(ctx, payload),
    'spots.rename': (ctx, { spotId, name }) => rename(ctx, spotId, name),
    'spots.close': (ctx, { spotId }) => close(ctx, spotId),
  },
  on: {
    'sale.completed': (ctx, { spotId, amount }) => grow(ctx, spotId, Math.max(0, amount) * AWARENESS_PER_UNIT),
    'customer.regularGained': (ctx, { spotId }) => grow(ctx, spotId, AWARENESS_PER_REGULAR),
  },
  migrations: {
    // Version 1 hatte keinen Zustand, alle damaligen Spots waren offen. So bleibt es für alte Spielstände.
    2: (): SpotsStateV3 => ({ unlocked: [...ORIGINAL_SPOT_IDS], custom: [] }),
    // Version 3 (Auftrag 28): Jedes Veedel hat Spots. Alte Spielstände bekommen die neuen dazu, gesperrt (ein Spot
    // ist offen, wenn er in unlocked steht); unbekannte IDs fliegen raus.
    3: (old: SpotsStateV3): SpotsStateV3 => ({
      ...old,
      unlocked: old.unlocked.filter((id) => PRESET_SPOTS.some((s) => s.id === id)),
    }),
    // Version 4 (Auftrag 23): Art, Bekanntheit und Ausbau. Alte eigene Spots sind Straßenecken und voll bekannt.
    4: (old: SpotsStateV3): SpotsState => ({
      ...old,
      custom: old.custom.map((s) => ({ ...s, kind: s.kind ?? 'corner' })),
      awareness: {},
      upgrades: {},
    }),
  },
});
