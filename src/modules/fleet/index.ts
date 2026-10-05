// Fuhrpark (Auftrag 33): Fahrzeuge mit fester Ladung, festem Tempo und Kontrollfaktor, gekauft mit sauberem Geld,
// jedes in einer Stadt. Fahrten der Logistik (Abholen am Hafen, Umlagern, Routen) nehmen ein freies Fahrzeug der Stadt
// (useVehicle) und geben es am Ziel wieder frei (releaseVehicle, dann steht es in der Stadt des Ziels). Ohne eigenes
// Fahrzeug fährt das Privatauto des Fahrers (PRIVATE_CAR): in der Stadt ohne Grenze wie bisher, zwischen den Städten
// (Routen) mit PRIVATE_CAR.capacity. Fliegt eine Ladung auf, ist das
// Fahrzeug mit Chance beschlagnahmt (seizeVehicle).
//
// Öffentliche API:
//   VEHICLE_MODELS, PRIVATE_CAR, vehicleModel(id), getVehicles(state, cityId?), getVehicle(state, id),
//   freeVehicles(state, cityId), vehicleSpec(state, vehicleId?) (Modell oder Privatauto), pickVehicle(state, cityId,
//   grams) (bestes freies Fahrzeug für eine Ladung, null = Privatauto), vehicleStatus(vehicle), vehicleName(state, id?)
//   useVehicle(ctx, id, tripId), releaseVehicle(ctx, id, cityId?), seizeVehicle(ctx, id), maybeSeize(ctx, id)
// Befehle: 'fleet.buy' (Modell, Stadt; sauberes Geld), 'fleet.sell'
// Ereignisse: 'fleet.bought', 'fleet.sold', 'fleet.seized'

import { type CommandResult, type Ctx, defineModule, formatEuro, type GameState, journal, wallet } from '../../core';
import { activeCity, cityName, getCity, isCityUnlocked } from '../city';
import {
  FLEET_LIMIT,
  PRIVATE_CAR,
  RESALE_SHARE,
  SEIZED_VISIBLE_MINUTES,
  VEHICLE_MODELS,
  VEHICLE_SEIZE_CHANCE,
} from './config';

export { FLEET_LIMIT, PRIVATE_CAR, VEHICLE_MODELS, VEHICLE_SEIZE_CHANCE } from './config';

/** Darstellung auf der Karte (createVehicle aus src/map). */
export type VehicleMapKind = 'courier' | 'car' | 'van' | 'truck';

export interface VehicleModel {
  id: string;
  name: string;
  /** Ladung in Gramm. */
  capacity: number;
  /** Faktor auf das Tempo des Fahrers. */
  speed: number;
  /** Faktor auf die Chance einer Kontrolle (Polizei und Zoll). */
  checkFactor: number;
  /** Preis in sauberem Geld. */
  price: number;
  mapKind: VehicleMapKind;
  /** Kann man kaufen (der Lkw kommt erst mit der Hafen-Phase). */
  available: boolean;
  /** Nur in der Hafen-Phase zu haben, an einem Ort im Ausland (Auftrag 40: der Lkw in Rotterdam). */
  harborOnly?: boolean;
  description: string;
}

export interface Vehicle {
  id: number;
  model: string;
  /** Stadt, in der das Fahrzeug steht (während einer Fahrt: wo es losgefahren ist). */
  cityId: string;
  /** Laufende Fahrt der Logistik, null = frei. */
  tripId: number | null;
  /** Beschlagnahmt seit (Spielminute), null = gehört dir. */
  seizedAt: number | null;
  /** Laufende Nummer pro Modell für den Namen ("Transporter 2"). */
  number: number;
}

export type VehicleStatus = 'free' | 'busy' | 'seized';

export interface FleetState {
  vehicles: Vehicle[];
}

declare module '../../core' {
  interface ModuleStates {
    fleet: FleetState;
  }
  interface GameCommands {
    /** Fahrzeug kaufen (sauberes Geld). Ohne Stadt: die aktive. */
    'fleet.buy': { model: string; cityId?: string };
    /** Fahrzeug verkaufen (die Hälfte vom Preis zurück); nur, wenn es frei ist. */
    'fleet.sell': { vehicleId: number };
  }
  interface GameEvents {
    'fleet.bought': { vehicleId: number; model: string; cityId: string; cost: number };
    'fleet.sold': { vehicleId: number; model: string; amount: number };
    /** Bei einer Kontrolle beschlagnahmt. */
    'fleet.seized': { vehicleId: number; model: string };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

const MODEL_BY_ID = new Map(VEHICLE_MODELS.map((m) => [m.id, m]));

export function vehicleModel(id: string): VehicleModel | undefined {
  return id === PRIVATE_CAR.id ? PRIVATE_CAR : MODEL_BY_ID.get(id);
}

/** Eigene Fahrzeuge (auch beschlagnahmte, solange sie noch in der Liste stehen); mit Stadt nur die dort. */
export function getVehicles(state: GameState, cityId?: string): readonly Vehicle[] {
  const all = state.modules.fleet?.vehicles ?? [];
  return cityId === undefined ? all : all.filter((v) => v.cityId === cityId);
}

export function getVehicle(state: GameState, id: number): Vehicle | undefined {
  return getVehicles(state).find((v) => v.id === id);
}

export function vehicleStatus(vehicle: Vehicle): VehicleStatus {
  if (vehicle.seizedAt !== null) return 'seized';
  return vehicle.tripId !== null ? 'busy' : 'free';
}

/** Freie Fahrzeuge einer Stadt, größte zuerst. */
export function freeVehicles(state: GameState, cityId: string): Vehicle[] {
  return getVehicles(state, cityId)
    .filter((v) => vehicleStatus(v) === 'free')
    .sort((a, b) => (vehicleModel(b.model)?.capacity ?? 0) - (vehicleModel(a.model)?.capacity ?? 0) || a.id - b.id);
}

/** Werte eines Fahrzeugs; ohne Fahrzeug (oder unbekannt) das Privatauto. */
export function vehicleSpec(state: GameState, vehicleId?: number | null): VehicleModel {
  if (vehicleId === undefined || vehicleId === null) return PRIVATE_CAR;
  const vehicle = getVehicle(state, vehicleId);
  return (vehicle && vehicleModel(vehicle.model)) ?? PRIVATE_CAR;
}

/** Name eines Fahrzeugs: "Transporter 2"; ohne Fahrzeug "Privatauto". */
export function vehicleName(state: GameState, vehicleId?: number | null): string {
  const vehicle = vehicleId !== undefined && vehicleId !== null ? getVehicle(state, vehicleId) : undefined;
  if (!vehicle) return PRIVATE_CAR.name;
  const model = vehicleModel(vehicle.model);
  const same = getVehicles(state).filter((v) => v.model === vehicle.model).length;
  return same > 1 || vehicle.number > 1
    ? `${model?.name ?? 'Fahrzeug'} ${vehicle.number}`
    : (model?.name ?? 'Fahrzeug');
}

/**
 * Bestes Fahrzeug für eine Ladung von grams Gramm: das kleinste freie, in das alles passt (kleinere fallen weniger
 * auf); passt sie in keins, das größte. Das Privatauto zählt mit privateCapacity mit (in der Stadt ohne Grenze, zwischen
 * den Städten PRIVATE_CAR.capacity); ist es die Wahl, kommt null zurück.
 */
export function pickVehicle(
  state: GameState,
  cityId: string,
  grams: number,
  privateCapacity: number = PRIVATE_CAR.capacity,
): number | null {
  const options = [
    ...freeVehicles(state, cityId).map((v) => ({
      id: v.id as number | null,
      capacity: vehicleSpec(state, v.id).capacity,
    })),
    { id: null, capacity: privateCapacity },
  ];
  const fitting = options.filter((o) => o.capacity >= grams).sort((a, b) => a.capacity - b.capacity);
  if (fitting.length > 0) return fitting[0].id;
  return options.sort((a, b) => b.capacity - a.capacity)[0].id;
}

/** Preis eines Modells in einer Stadt (mal Immobilien-Faktor wie Lager und Liegeplatz). */
export function vehiclePrice(model: VehicleModel, cityId: string): number {
  return Math.round((model.price * (getCity(cityId)?.propertyFactor ?? 1)) / 100) * 100;
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/** Fahrzeug für eine Fahrt nehmen. false, wenn es nicht frei ist. */
export function useVehicle(ctx: Ctx, id: number, tripId: number): boolean {
  const vehicle = ctx.state.modules.fleet.vehicles.find((v) => v.id === id);
  if (!vehicle || vehicleStatus(vehicle) !== 'free') return false;
  vehicle.tripId = tripId;
  return true;
}

/** Fahrt vorbei: Das Fahrzeug ist wieder frei, mit Stadt steht es jetzt dort (Route in die andere Stadt). */
export function releaseVehicle(ctx: Ctx, id: number, cityId?: string): void {
  const vehicle = ctx.state.modules.fleet.vehicles.find((v) => v.id === id);
  if (!vehicle) return;
  vehicle.tripId = null;
  if (cityId) vehicle.cityId = cityId;
}

/** Beschlagnahmt: Das Fahrzeug ist weg (steht noch ein paar Tage in der Liste). */
export function seizeVehicle(ctx: Ctx, id: number): void {
  const vehicle = ctx.state.modules.fleet.vehicles.find((v) => v.id === id);
  if (!vehicle || vehicle.seizedAt !== null) return;
  vehicle.seizedAt = ctx.now;
  vehicle.tripId = null;
  const name = vehicleName(ctx.state, id);
  journal.add(ctx, `Die Polizei hat deinen ${name} beschlagnahmt.`, 'bad');
  ctx.emit('fleet.seized', { vehicleId: id, model: vehicle.model });
}

/** Ladung aufgeflogen: Fahrzeug mit VEHICLE_SEIZE_CHANCE beschlagnahmen. true, wenn es weg ist. */
export function maybeSeize(ctx: Ctx, id: number): boolean {
  if (!ctx.chance(VEHICLE_SEIZE_CHANCE)) return false;
  seizeVehicle(ctx, id);
  return true;
}

function buy(ctx: Ctx, modelId: string, cityId: string): CommandResult {
  const model = MODEL_BY_ID.get(modelId);
  if (!model) return { ok: false, reason: 'Dieses Fahrzeug gibt es nicht.' };
  if (!model.available) return { ok: false, reason: `Einen ${model.name} gibt es erst später.` };
  if (model.harborOnly && !getCity(cityId)?.abroad) {
    return { ok: false, reason: `Einen ${model.name} gibt es erst mit dem eigenen Hafen.` };
  }
  if (!isCityUnlocked(ctx.state, cityId)) return { ok: false, reason: 'In dieser Stadt bist du noch nicht.' };
  const s = ctx.state.modules.fleet;
  if (s.vehicles.filter((v) => v.seizedAt === null).length >= FLEET_LIMIT) {
    return { ok: false, reason: `Mehr als ${FLEET_LIMIT} Fahrzeuge kann niemand fahren.` };
  }
  const cost = vehiclePrice(model, cityId);
  if (!wallet.pay(ctx, cost, 'clean', `${model.name} gekauft`, { category: 'expansion', cityId })) {
    return {
      ok: false,
      reason: `Ein ${model.name} kostet ${formatEuro(cost)} sauberes Geld. Wasch vorher Schwarzgeld.`,
    };
  }
  const number = Math.max(0, ...s.vehicles.filter((v) => v.model === model.id).map((v) => v.number)) + 1;
  const vehicle: Vehicle = { id: ctx.nextId(), model: model.id, cityId, tripId: null, seizedAt: null, number };
  s.vehicles.push(vehicle);
  journal.add(
    ctx,
    `${model.name} in ${cityName(cityId)} gekauft (${formatEuro(cost)} sauberes Geld). Fasst ${model.capacity / 1000} kg.`,
    'good',
  );
  ctx.emit('fleet.bought', { vehicleId: vehicle.id, model: model.id, cityId, cost });
  return { ok: true, data: { vehicleId: vehicle.id } };
}

function sell(ctx: Ctx, vehicleId: number): CommandResult {
  const s = ctx.state.modules.fleet;
  const vehicle = s.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return { ok: false, reason: 'Dieses Fahrzeug gibt es nicht.' };
  const status = vehicleStatus(vehicle);
  if (status === 'busy') return { ok: false, reason: 'Das Fahrzeug ist gerade unterwegs.' };
  const name = vehicleName(ctx.state, vehicleId);
  s.vehicles = s.vehicles.filter((v) => v.id !== vehicleId);
  if (status === 'seized') return { ok: true, data: { amount: 0 } };
  const model = vehicleModel(vehicle.model);
  const amount = Math.round((model ? vehiclePrice(model, vehicle.cityId) : 0) * RESALE_SHARE);
  if (amount > 0)
    wallet.earn(ctx, amount, 'clean', `${name} verkauft`, { category: 'expansion', cityId: vehicle.cityId });
  journal.add(ctx, `${name} verkauft (${formatEuro(amount)}).`);
  ctx.emit('fleet.sold', { vehicleId, model: vehicle.model, amount });
  return { ok: true, data: { amount } };
}

export default defineModule({
  id: 'fleet',
  version: 1,
  init: () => ({ vehicles: [] }),
  tickEvery: 60,
  tick: (ctx) => {
    // Beschlagnahmte Fahrzeuge verschwinden nach ein paar Tagen aus der Liste.
    const s = ctx.state.modules.fleet;
    if (s.vehicles.some((v) => v.seizedAt !== null && ctx.now - v.seizedAt >= SEIZED_VISIBLE_MINUTES)) {
      s.vehicles = s.vehicles.filter((v) => v.seizedAt === null || ctx.now - v.seizedAt < SEIZED_VISIBLE_MINUTES);
    }
  },
  commands: {
    'fleet.buy': (ctx, { model, cityId }) => buy(ctx, model, cityId ?? activeCity(ctx.state)),
    'fleet.sell': (ctx, { vehicleId }) => sell(ctx, vehicleId),
  },
});
