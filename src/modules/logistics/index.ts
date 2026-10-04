// Logistik: Hafen, Abholung und Fahrten zwischen den Lagern. Seit Auftrag 30 hat jede Stadt ihren Hafen (PORTS in
// config.ts: Köln der Niehler Hafen, Hamburg der Hamburger Hafen mit teurerem Liegeplatz und wacherem Zoll); Liegeplatz,
// Ware am Kai und Zoll gelten pro Stadt. Lesefunktionen ohne Stadt meinen die aktive Stadt. Ware am Kai einer
// schlafenden Stadt wartet (kein Zoll), Fahrten dort fahren zu Ende (ohne Kontrollen).
// - Liegeplatz im Niehler Hafen ('logistics.buyBerth', sauberes Geld). Ohne ihn liefert kein Schiff (suppliers).
// - Schiffsware kommt nicht mehr von selbst ins Lager: Sie steht am Kai (cargo), bis ein Fahrer oder du selbst sie
//   abholst ('logistics.pickup'). Steht sie zu lange, findet sie der Zoll.
// - Umlagern zwischen eigenen Lagern ('logistics.transfer').
// - Routen mit Fahrplan (Auftrag 30, Etappe 6, routes.ts): Ein Fahrer fährt zu festen Zeiten Ware von Lager zu Lager,
//   auch zwischen den Städten über die A1 (roads.interCityRoute). Dort kann der Zoll kontrollieren.
// - Jede Fahrt fährt über echte Straßen (roads): Fahrzeit aus der Routenlänge. Mit Ware an Bord kann es eine
//   Verkehrskontrolle geben (Konfrontation 'vehicleCheck'). Fliegt die Ladung auf, ist sie weg, der Fahrer kommt
//   eventuell in Haft (police). Du selbst kommst nie in Haft.
//
// Öffentliche API:
//   hasBerth(state, cityId?), getCargo(state, cityId?), cargoAmount(state, productId?, cityId?), getTrips(state),
//   getTrip(state, id), portPlace(cityId?), portName(cityId?), berthCost(cityId?), portContact(cityId),
//   tripProgress(state, trip) (Abschnitt und Fortschritt), tripRoute(state, trip) (Punkte für die Karte),
//   inTransitAmount(state, productId?), isPlayerOnTheRoad(state), freeDrivers(state), cargoRisk(state, cargo),
//   getLogisticsLog(state), receiveCargo(ctx, {...}) (für suppliers), BERTH_COST, PORTS, tripCity(state, trip),
//   isInterCityTrip(state, trip), getRoutes(state), getRoute(state, id), nextDeparture(state, route),
//   routeLoadPreview(state, route), driverWhereabouts(state, staffId), INTERCITY_CAPACITY
// Befehle: 'logistics.buyBerth', 'logistics.pickup', 'logistics.transfer', 'logistics.addRoute',
//   'logistics.updateRoute', 'logistics.removeRoute', 'logistics.runRouteNow'
// Ereignisse: 'logistics.berthBought', 'cargo.docked', 'cargo.seized', 'transport.started', 'transport.stopped',
//   'transport.arrived', 'transport.seized', 'transport.lost', 'route.departed', 'route.skipped'

import {
  type CommandResult,
  type Contact,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  type LngLat,
  type Message,
  MINUTES_PER_DAY,
  messages,
  wallet,
} from '../../core';
import {
  activeCity,
  cityAt,
  cityName,
  HARBOR_CALLER,
  isCityLive,
  isCityUnlocked,
  isPlayerIn,
  isPlayerTraveling,
} from '../city';
import { isPlayerDelivering } from '../customers';
import { startEncounter } from '../encounters';
import {
  formatProductAmount,
  getLots,
  getWarehouse,
  getWarehouses,
  nearestWarehouse,
  productName,
  store,
  type TakeResult,
  take,
  warehouseCity,
} from '../goods';
import { addHeat, arrestStaff, getHeat, recordConfiscation } from '../police';
import { type RoadRoute, roadRoute, travelMinutes } from '../roads';
import { addXp, assign, getStaff, getStaffMember, riskFactor, roleName, type StaffMember } from '../staff';
import { UNLOADING_PORT } from '../suppliers';
import { allVeedel, veedelAt, veedelName } from '../veedel';
import {
  A1_PLACES,
  AUTOBAHN_ARREST_FACTOR,
  AUTOBAHN_CHECK_CHANCE,
  AUTOBAHN_CHECK_DELAY,
  CHECK_CHANCE,
  CHECK_DELAY,
  CHECK_HEAT_DIVISOR,
  CUSTOMS_OPPONENT,
  DRIVER_BASE_SPEED,
  DRIVER_SPEED_PER_POINT,
  ESCAPE_HEAT,
  HARBOR_CONTACT,
  LOAD_MINUTES,
  LOG_LIMIT,
  PLAYER_DRIVE_SPEED,
  PORTS,
  type PortConfig,
  SEIZE_ARREST_CHANCE,
  SEIZE_HEAT,
  TRANSFER_LOAD_MINUTES,
  XP_PER_TRIP,
} from './config';

import {
  departRoute,
  type RestockDue,
  type Route,
  type RouteInput,
  removeRoute,
  routeArrived,
  routeLost,
  routesTick,
  saveRoute,
  settleRestock,
} from './routes';

export { BERTH_COST, CARGO_SAFE_MINUTES, INTERCITY_CAPACITY, PORTS } from './config';
export {
  driverWhereabouts,
  getRoute,
  getRoutes,
  nextDeparture,
  type Route,
  type RouteFill,
  type RouteInput,
  type RouteItem,
  type RouteRun,
  routeLoadPreview,
  routeName,
  routeWeight,
} from './routes';

/** ID des Kölner Hafens als Abholort einer Fahrt (andere Städte: PORTS[cityId].placeId, z.B. 'port:hamburg'). */
export const PORT_ID = 'port';

/** Ware, die am Kai auf die Abholung wartet. */
export interface PortCargo {
  id: number;
  supplierId: string;
  productId: string;
  amount: number;
  quality: number;
  /** Einkaufspreis pro Einheit. */
  unitCost: number;
  arrivedAt: number;
  /** Lager, für das bestellt wurde: Die Abholung fährt dorthin, wenn nichts anderes gewählt wird. */
  warehouseId?: string;
  /** Stadt des Hafens (Auftrag 30; alte Stände: Köln). */
  cityId: string;
}

export type TripKind = 'pickup' | 'transfer' | 'route';

export interface TripItem {
  productId: string;
  amount: number;
  quality: number;
  cut: number;
  unitCost: number;
}

/**
 * Eine Fahrt: Abholung am Hafen (Fahrer fährt vom Ziellager hin und zurück), Umlagern (von Lager zu Lager) oder eine
 * Fahrt auf einer Route (Auftrag 30, auch zwischen den Städten).
 */
export interface Trip {
  id: number;
  kind: TripKind;
  /** Fahrer (staff-ID), null = du selbst. */
  driverId: string | null;
  /** Abholort: PORT_ID oder Lager-ID. */
  fromId: string;
  /** Ziel-Lager. */
  toId: string;
  items: TripItem[];
  startedAt: number;
  /** Ware ist geladen, ab jetzt geht es zum Ziel (beim Umlagern kurz nach dem Start). */
  loadedAt: number;
  arrivesAt: number;
  /** Wann es unterwegs eine Kontrolle gibt (ausgewürfelt beim Start), sonst null. */
  checkAt: number | null;
  /** 'stopped': Kontrolle läuft (Konfrontation), die Fahrt steht. */
  status: 'enRoute' | 'stopped';
  stoppedAt: number | null;
  encounterId: number | null;
  /** Fahrt einer Route: welche, und ob Hin- oder Rückfahrt. */
  routeId?: number;
  leg?: 'out' | 'back';
}

export interface TripLogEntry {
  id: number;
  kind: TripKind;
  driverId: string | null;
  toId: string;
  amount: number;
  result: 'done' | 'seized' | 'lost';
  at: number;
  /** Fahrt einer Route. */
  routeId?: number;
}

export interface LogisticsStats {
  trips: number;
  checks: number;
  /** Einheiten, die bei Kontrollen oder vom Zoll beschlagnahmt wurden. */
  seized: number;
}

export interface LogisticsState {
  /** Eigene Liegeplätze pro Stadt (seit wann). */
  berths: Record<string, { since: number }>;
  cargo: PortCargo[];
  trips: Trip[];
  /** Die letzten abgeschlossenen Fahrten, neueste zuerst. */
  log: TripLogEntry[];
  stats: LogisticsStats;
  /** Routen mit Fahrplan (Auftrag 30). */
  routes: Route[];
  /** Was Routen aus Lagern schlafender Städte genommen haben: Die Rechte Hand kauft es um Mitternacht nach. */
  restock: RestockDue[];
}

/** Zustand in Version 2: ohne Routen. */
type LogisticsStateV2 = Omit<LogisticsState, 'routes' | 'restock'>;

/** Zustand in Version 1: ein Liegeplatz (Köln), Ware am Kai ohne Stadt. */
type LogisticsStateV1 = Omit<LogisticsStateV2, 'berths' | 'cargo'> & {
  berth: { since: number } | null;
  cargo: Omit<PortCargo, 'cityId'>[];
};

declare module '../../core' {
  interface ModuleStates {
    logistics: LogisticsState;
  }
  interface GameCommands {
    /** Liegeplatz im Hafen einer Stadt mieten (sauberes Geld). Ohne Stadt: die aktive. */
    'logistics.buyBerth': { cityId?: string };
    /**
     * Ware am Kai abholen: durch einen Fahrer (driverId oder der erste freie) oder selbst. Ohne warehouseId ins
     * Lager, das dem Hafen am nächsten liegt. Ohne cargoIds alles, was wartet.
     */
    'logistics.pickup': { by: 'player' | 'driver'; driverId?: string; warehouseId?: string; cargoIds?: number[] };
    /** Ware von einem Lager ins andere bringen. Ohne productId alles, ohne amount die ganze Menge des Produkts. */
    'logistics.transfer': {
      fromId: string;
      toId: string;
      productId?: string;
      amount?: number;
      by: 'player' | 'driver';
      driverId?: string;
    };
    /** Route mit Fahrplan anlegen (Auftrag 30). Ergebnis data.routeId. */
    'logistics.addRoute': RouteInput;
    /** Route ändern: nur die angegebenen Felder. */
    'logistics.updateRoute': { routeId: number } & Partial<RouteInput>;
    'logistics.removeRoute': { routeId: number };
    /** Route sofort fahren, außerhalb des Fahrplans. */
    'logistics.runRouteNow': { routeId: number };
  }
  interface GameEvents {
    'logistics.berthBought': { cost: number; cityId?: string };
    /** Schiffsware liegt am Kai. */
    'cargo.docked': { cargoId: number; supplierId: string; productId: string; amount: number };
    /** Der Zoll hat Ware am Kai gefunden. */
    'cargo.seized': { cargoId: number; productId: string; amount: number };
    'transport.started': { tripId: number; kind: TripKind; driverId: string | null; arrivesAt: number };
    /** Verkehrskontrolle: Die Fahrt steht, bis die Konfrontation vorbei ist. */
    'transport.stopped': { tripId: number; encounterId: number };
    /** interCity: über die Autobahn aus einer anderen Stadt (Auftrag 30). */
    'transport.arrived': { tripId: number; kind: TripKind; toId: string; amount: number; interCity?: boolean };
    /** Ladung bei einer Kontrolle aufgeflogen. */
    'transport.seized': { tripId: number; amount: number; arrested: boolean };
    /** Fahrer ausgefallen (gekündigt, verletzt …), die Ladung ist weg. */
    'transport.lost': { tripId: number; amount: number };
    /** Eine Route ist losgefahren (Hinfahrt). */
    'route.departed': { routeId: number; tripId: number; amount: number; interCity: boolean };
    /** Eine Route ist ausgefallen (kein Fahrer, keine Ware …). */
    'route.skipped': { routeId: number; reason: string };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

function portOf(cityId: string): PortConfig {
  return PORTS[cityId] ?? PORTS.koeln;
}

/** Ort des Hafens einer Stadt (Köln: Niehler Hafen, wie bei den Lieferanten). */
export function portPlace(cityId = 'koeln'): { name: string; lng: number; lat: number } {
  const port = portOf(cityId);
  if (port.lng === undefined || port.lat === undefined) return UNLOADING_PORT;
  return { name: port.name, lng: port.lng, lat: port.lat };
}

export function portName(cityId = 'koeln'): string {
  return portOf(cityId).name;
}

/** Liegeplatz in sauberem Geld. */
export function berthCost(cityId = 'koeln'): number {
  return portOf(cityId).berthCost;
}

/** Wer im Hafen dieser Stadt schreibt (Köln: der Hafenmeister, Hamburg: Fiete). */
export function portContact(cityId: string): Contact {
  return cityId === 'hamburg' ? HARBOR_CALLER : HARBOR_CONTACT;
}

/** Ort einer Fahrt am Hafen ('port', 'port:hamburg' …), null für Lager. */
function portCityOf(id: string): string | null {
  if (id === PORT_ID) return 'koeln';
  for (const [cityId, port] of Object.entries(PORTS)) if (port.placeId === id) return cityId;
  return null;
}

/** Abholort am Hafen einer Stadt. */
export function portPlaceId(cityId: string): string {
  return portOf(cityId).placeId;
}

export function hasBerth(state: GameState, cityId: string = activeCity(state)): boolean {
  return state.modules.logistics?.berths?.[cityId] != null;
}

/** Ware am Kai einer Stadt (Standard: die aktive), älteste zuerst. */
export function getCargo(state: GameState, cityId: string = activeCity(state)): readonly PortCargo[] {
  const cargo = state.modules.logistics?.cargo ?? [];
  return cargo.every((c) => c.cityId === cityId) ? cargo : cargo.filter((c) => c.cityId === cityId);
}

export function cargoAmount(state: GameState, productId?: string, cityId?: string): number {
  return getCargo(state, cityId)
    .filter((c) => !productId || c.productId === productId)
    .reduce((sum, c) => sum + c.amount, 0);
}

export function getTrips(state: GameState): readonly Trip[] {
  return state.modules.logistics?.trips ?? [];
}

export function getTrip(state: GameState, id: number): Trip | undefined {
  return getTrips(state).find((t) => t.id === id);
}

/** Ware auf der Straße (in Fahrzeugen). */
export function inTransitAmount(state: GameState, productId?: string): number {
  return getTrips(state)
    .flatMap((t) => t.items)
    .filter((i) => !productId || i.productId === productId)
    .reduce((sum, i) => sum + i.amount, 0);
}

export function tripAmount(trip: Pick<Trip, 'items'>): number {
  return trip.items.reduce((sum, i) => sum + i.amount, 0);
}

/** Bist du selbst gerade unterwegs (Fahrt mit dem Transporter oder zwischen den Städten, Auftrag 30)? */
export function isPlayerOnTheRoad(state: GameState): boolean {
  return isPlayerTraveling(state) || getTrips(state).some((t) => t.driverId === null);
}

/** Fahrer ohne Einsatz in einer Stadt (Standard: die aktive), die sofort losfahren können. */
export function freeDrivers(state: GameState, cityId: string = activeCity(state)): StaffMember[] {
  return getStaff(state, { role: 'driver', status: 'active', cityId }).filter((m) => !m.assignment);
}

export function getLogisticsLog(state: GameState): readonly TripLogEntry[] {
  return state.modules.logistics?.log ?? [];
}

/** Ab wann der Zoll bei dieser Ware neugierig wird (nach dem Hafen ihrer Stadt). */
export function cargoRiskFrom(cargo: Pick<PortCargo, 'arrivedAt'> & { cityId?: string }): number {
  return cargo.arrivedAt + portOf(cargo.cityId ?? 'koeln').safeMinutes;
}

/** Gefahr für Ware am Kai: 'safe' (noch sicher), 'risky' (Zoll kann sie jede Stunde finden). */
export function cargoRisk(
  state: GameState,
  cargo: Pick<PortCargo, 'arrivedAt'> & { cityId?: string },
): 'safe' | 'risky' {
  return state.time >= cargoRiskFrom(cargo) ? 'risky' : 'safe';
}

/** Ort eines Abhol- oder Zielpunkts (Hafen oder Lager). */
export function placeOf(state: GameState, id: string): (LngLat & { name: string }) | undefined {
  const portCity = portCityOf(id);
  if (portCity) return portPlace(portCity);
  return getWarehouse(state, id);
}

/** Stadt einer Fahrt (nach ihrem Ziel). */
export function tripCity(state: GameState, trip: Pick<Trip, 'toId' | 'fromId'>): string {
  const place = placeOf(state, trip.toId) ?? placeOf(state, trip.fromId);
  return place ? cityAt(place.lng, place.lat) : 'koeln';
}

/** Fährt diese Fahrt von einer Stadt in die andere (über die Autobahn)? */
export function isInterCityTrip(state: GameState, trip: Pick<Trip, 'toId' | 'fromId'>): boolean {
  const from = placeOf(state, trip.fromId);
  const to = placeOf(state, trip.toId);
  return !!from && !!to && cityAt(from.lng, from.lat) !== cityAt(to.lng, to.lat);
}

export type TripLeg = 'toPickup' | 'loading' | 'delivering' | 'stopped';

/**
 * Wo die Fahrt gerade ist: Anfahrt zum Abholort (nur bei der Abholung am Hafen), Laden, mit Ware zum Ziel,
 * oder angehalten (Kontrolle). t ist der Fortschritt im Abschnitt (0–1), total der Fortschritt der ganzen Fahrt.
 */
export function tripProgress(state: GameState, trip: Trip): { leg: TripLeg; t: number; total: number } {
  const now = trip.status === 'stopped' && trip.stoppedAt !== null ? trip.stoppedAt : state.time;
  const total = clamp01((now - trip.startedAt) / Math.max(1, trip.arrivesAt - trip.startedAt));
  const atPickup = arriveAtPickup(trip);
  let result: { leg: TripLeg; t: number };
  if (now < atPickup) {
    result = { leg: 'toPickup', t: clamp01((now - trip.startedAt) / Math.max(1, atPickup - trip.startedAt)) };
  } else if (now < trip.loadedAt) {
    result = { leg: 'loading', t: clamp01((now - atPickup) / Math.max(1, trip.loadedAt - atPickup)) };
  } else {
    result = { leg: 'delivering', t: clamp01((now - trip.loadedAt) / Math.max(1, trip.arrivesAt - trip.loadedAt)) };
  }
  if (trip.status === 'stopped') return { leg: 'stopped', t: result.leg === 'delivering' ? result.t : 0, total };
  return { ...result, total };
}

/**
 * Wege einer Fahrt über die Straßen: Anfahrt (leer, nur bei Abholung) und Lieferung (mit Ware). routes hat die ganzen
 * Routen mit dem Teil auf der Straße (drive) und den Fußwegen an den Enden (für die Karte).
 */
export function tripRoute(
  state: GameState,
  trip: Trip,
): { approach: LngLat[] | null; delivery: LngLat[]; routes: { approach: RoadRoute | null; delivery: RoadRoute } } {
  const from = placeOf(state, trip.fromId) ?? portPlace(tripCity(state, trip));
  const to = placeOf(state, trip.toId) ?? from;
  const approach = trip.kind === 'pickup' ? roadRoute(to, from) : null;
  const delivery = roadRoute(from, to);
  return { approach: approach?.path ?? null, delivery: delivery.path, routes: { approach, delivery } };
}

/** Ankunft am Abholort: bei der Abholung am Hafen vor dem Laden, beim Umlagern sofort (Laden im Startlager). */
function arriveAtPickup(trip: Trip): number {
  if (trip.kind !== 'pickup') return trip.startedAt;
  return Math.max(trip.startedAt, trip.loadedAt - LOAD_MINUTES);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------------------------------------
// Schreiben

/** Schiffsware kommt am Kai an (ruft suppliers auf, wenn ein Schiff anlegt). Gibt die ID zurück. */
export function receiveCargo(
  ctx: Ctx,
  item: {
    supplierId: string;
    productId: string;
    amount: number;
    quality: number;
    unitCost: number;
    warehouseId?: string;
    /** Hafen dieser Stadt (Standard: Köln). */
    cityId?: string;
  },
): number {
  const cityId = item.cityId ?? 'koeln';
  const cargo: PortCargo = { id: ctx.nextId(), ...item, cityId, arrivedAt: ctx.now };
  ctx.state.modules.logistics.cargo.push(cargo);
  const port = portOf(cityId);
  const goods = `${formatProductAmount(item.productId, item.amount)} ${productName(item.productId)}`;
  journal.add(
    ctx,
    cityId === 'koeln'
      ? `Schiff im Niehler Hafen: ${goods} stehen am Kai und warten auf die Abholung.`
      : `Container im ${port.name}: ${goods} stehen am Kai und warten auf die Abholung.`,
    'good',
  );
  messages.send(ctx, {
    contact: portContact(cityId),
    text:
      `Dein Container ist da: ${goods}. Hol ihn in den nächsten ${clock.formatDuration(port.safeMinutes)} ab, ` +
      'danach schaut der Zoll genauer hin.',
    options: [
      {
        id: 'driver',
        label: 'Fahrer schicken',
        reply: 'Mein Fahrer kommt.',
        command: { type: 'logistics.pickup', payload: { by: 'driver', cargoIds: [cargo.id] } },
      },
      {
        id: 'self',
        label: 'Ich hol ihn selbst',
        reply: 'Bin gleich da.',
        command: { type: 'logistics.pickup', payload: { by: 'player', cargoIds: [cargo.id] } },
      },
      { id: 'later', label: 'Später', reply: 'Ich meld mich.' },
    ],
    // Routine: Die Rechte Hand darf den Fahrer schicken (Aufgabe "Hafen abholen").
    routine: true,
  });
  ctx.emit('cargo.docked', {
    cargoId: cargo.id,
    supplierId: item.supplierId,
    productId: item.productId,
    amount: item.amount,
  });
  return cargo.id;
}

function buyBerth(ctx: Ctx, cityId: string): CommandResult {
  const s = ctx.state.modules.logistics;
  if (!PORTS[cityId]) return { ok: false, reason: 'Diese Stadt hat keinen Hafen im Spiel.' };
  if (!isCityUnlocked(ctx.state, cityId)) return { ok: false, reason: 'In dieser Stadt bist du noch nicht.' };
  if (s.berths[cityId]) return { ok: false, reason: 'Du hast dort schon einen Liegeplatz.' };
  const port = portOf(cityId);
  if (!wallet.pay(ctx, port.berthCost, 'clean', `Liegeplatz ${port.name}`, { category: 'expansion', cityId })) {
    return {
      ok: false,
      reason: `Der Hafen will ${formatEuro(port.berthCost)} sauberes Geld. Wasch vorher Schwarzgeld.`,
    };
  }
  s.berths[cityId] = { since: ctx.now };
  journal.add(
    ctx,
    `Liegeplatz im ${port.name} gemietet (${formatEuro(port.berthCost)}). Jetzt können Schiffe für dich anlegen.`,
    'good',
  );
  messages.send(ctx, {
    contact: portContact(cityId),
    text:
      cityId === 'koeln'
        ? 'Willkommen im Hafen. Dein Platz ist Kai 7. Was da ankommt, holst du ab. Ich seh nix, ich hör nix.'
        : `Moin. Dein Platz ist ${port.quay}. Was da ankommt, holst du ab, und zwar zügig. Der Zoll hier schläft nicht.`,
  });
  ctx.emit('logistics.berthBought', { cost: port.berthCost, cityId });
  return { ok: true };
}

/** Fahrer für eine Fahrt aussuchen: der gewünschte oder der erste freie. */
function pickDriver(ctx: Ctx, driverId: string | undefined, cityId: string): StaffMember | string {
  if (driverId) {
    const m = getStaffMember(ctx.state, driverId);
    if (!m || m.leftAt !== null) return 'Diesen Fahrer gibt es nicht.';
    if (m.role !== 'driver') return `${m.name} ist ${roleName(m.role)}, kein Fahrer.`;
    if (m.status !== 'active') return `${m.name} kann gerade nicht fahren.`;
    if (m.assignment) return `${m.name} ist schon unterwegs.`;
    if (m.cityId !== cityId) return `${m.name} ist in ${cityName(m.cityId)}.`;
    return m;
  }
  return (
    freeDrivers(ctx.state, cityId)[0] ??
    `Kein freier Fahrer in ${cityName(cityId)}. Heuer einen an (Logistik-App oder Leute).`
  );
}

function playerBusy(state: GameState, cityId?: string): string | null {
  if (isPlayerTraveling(state)) return 'Du bist gerade zwischen den Städten unterwegs.';
  if (isPlayerOnTheRoad(state)) return 'Du bist schon mit einer Fahrt unterwegs.';
  if (cityId && !isPlayerIn(state, cityId)) return `Du bist nicht in ${cityName(cityId)}. Schick einen Fahrer.`;
  if (isPlayerDelivering(state)) return 'Du bist gerade mit einer Lieferung unterwegs.';
  return null;
}

export function speedOf(state: GameState, driverId: string | null): number {
  if (!driverId) return PLAYER_DRIVE_SPEED;
  const m = getStaffMember(state, driverId);
  return DRIVER_BASE_SPEED + (m?.stats.speed ?? 50) * DRIVER_SPEED_PER_POINT;
}

/** Veedel des Ziels (für Heat und Kontrollen). */
function destinationVeedel(state: GameState, toId: string): string | null {
  const place = placeOf(state, toId);
  return place ? (veedelAt(place.lng, place.lat)?.id ?? null) : null;
}

/** Durchschnittliche Heat einer Stadt (für den Zoll auf der Autobahn). */
function cityHeat(state: GameState, cityId: string): number {
  const veedel = allVeedel(cityId);
  if (veedel.length === 0) return 0;
  return veedel.reduce((sum, v) => sum + getHeat(state, v.id), 0) / veedel.length;
}

/**
 * Kontrolle unterwegs auswürfeln: irgendwann auf dem Weg mit Ware. In der Stadt nach der Heat im Ziel-Veedel, zwischen
 * den Städten der Zoll auf der Autobahn nach der Heat der Zielstadt (Auftrag 30).
 */
function rollCheck(ctx: Ctx, trip: Trip): void {
  if (trip.items.length === 0) return;
  const caution = trip.driverId ? riskFactor(ctx.state, trip.driverId) : 1;
  let chance: number;
  if (isInterCityTrip(ctx.state, trip)) {
    const heat = cityHeat(ctx.state, tripCity(ctx.state, trip));
    chance = AUTOBAHN_CHECK_CHANCE * (1 + heat / CHECK_HEAT_DIVISOR) * caution;
  } else {
    const veedelId = destinationVeedel(ctx.state, trip.toId);
    const heat = veedelId ? getHeat(ctx.state, veedelId) : 0;
    chance = CHECK_CHANCE * (1 + heat / CHECK_HEAT_DIVISOR) * caution;
  }
  if (!ctx.chance(Math.min(0.9, chance))) return;
  const span = trip.arrivesAt - trip.loadedAt;
  trip.checkAt = trip.loadedAt + Math.max(1, Math.round(span * (0.2 + ctx.random() * 0.6)));
}

/** Ort an der A1 für den Text, nach dem Fortschritt der Fahrt ("bei Münster"). */
function autobahnPlace(state: GameState, trip: Trip): string {
  const path = tripRoute(state, trip).delivery;
  const t = tripProgress(state, trip).t;
  const at = path[Math.min(path.length - 1, Math.max(0, Math.round(t * (path.length - 1))))];
  let best = A1_PLACES[0];
  let bestDist = Infinity;
  for (const place of A1_PLACES) {
    const d = Math.hypot((place.lng - at.lng) * 0.62, place.lat - at.lat);
    if (d < bestDist) {
      bestDist = d;
      best = place;
    }
  }
  return `auf der A1 bei ${best.name}`;
}

/** Fahrt starten (Fahrer wird eingesetzt, Kontrolle ausgewürfelt). Intern, auch für routes.ts. */
export function startTrip(ctx: Ctx, trip: Omit<Trip, 'id' | 'checkAt' | 'status' | 'stoppedAt' | 'encounterId'>): Trip {
  const full: Trip = {
    ...trip,
    id: ctx.nextId(),
    checkAt: null,
    status: 'enRoute',
    stoppedAt: null,
    encounterId: null,
  };
  rollCheck(ctx, full);
  ctx.state.modules.logistics.trips.push(full);
  if (full.driverId) assign(ctx, full.driverId, { kind: 'transport', targetId: String(full.id) });
  ctx.emit('transport.started', {
    tripId: full.id,
    kind: full.kind,
    driverId: full.driverId,
    arrivesAt: full.arrivesAt,
  });
  return full;
}

export function driverLabel(state: GameState, driverId: string | null): string {
  return driverId ? (getStaffMember(state, driverId)?.name ?? 'Der Fahrer') : 'Du';
}

export function itemsText(items: readonly Pick<TripItem, 'productId' | 'amount'>[]): string {
  if (items.length === 0) return 'nichts';
  const parts = items.map((i) => `${formatProductAmount(i.productId, i.amount)} ${productName(i.productId)}`);
  return parts.length <= 2 ? parts.join(' und ') : `${parts.slice(0, 2).join(', ')} und mehr`;
}

/** Wofür die Ware bestellt wurde: das gemeinsame Ziel-Lager, wenn alle dasselbe wollen und es dir noch gehört. */
function wishedWarehouse(state: GameState, cargo: readonly PortCargo[]) {
  const wanted = new Set(cargo.map((c) => c.warehouseId));
  const [id] = [...wanted];
  return wanted.size === 1 && id ? getWarehouse(state, id) : undefined;
}

function pickup(
  ctx: Ctx,
  payload: { by: 'player' | 'driver'; driverId?: string; warehouseId?: string; cargoIds?: number[] },
): CommandResult {
  const state = ctx.state;
  const s = state.modules.logistics;
  // Ohne Angabe alles am Kai der aktiven Stadt; mit Angabe die Container, aber nur aus einem Hafen.
  const chosen = payload.cargoIds
    ? s.cargo.filter((c) => payload.cargoIds?.includes(c.id))
    : s.cargo.filter((c) => c.cityId === activeCity(state));
  const cityId = chosen[0]?.cityId ?? activeCity(state);
  const cargo = chosen.filter((c) => c.cityId === cityId);
  if (cargo.length === 0) return { ok: false, reason: 'Am Kai wartet nichts auf dich.' };
  const port = portPlace(cityId);
  const warehouse = payload.warehouseId
    ? getWarehouse(state, payload.warehouseId)
    : (wishedWarehouse(state, cargo) ?? nearestWarehouse(state, port));
  if (!warehouse) {
    return {
      ok: false,
      reason: payload.warehouseId
        ? 'Dieses Lager gehört dir nicht.'
        : `In ${cityName(cityId)} hast du noch kein Lager.`,
    };
  }
  if (warehouseCity(warehouse.id) !== cityId) return { ok: false, reason: 'Das Lager liegt in einer anderen Stadt.' };
  let driverId: string | null = null;
  if (payload.by === 'player') {
    const busy = playerBusy(state, cityId);
    if (busy) return { ok: false, reason: busy };
  } else {
    const driver = pickDriver(ctx, payload.driverId, cityId);
    if (typeof driver === 'string') return { ok: false, reason: driver };
    driverId = driver.id;
  }
  const speed = speedOf(state, driverId);
  const approach = travelMinutes(warehouse, port, speed);
  const delivery = travelMinutes(port, warehouse, speed);
  const ids = new Set(cargo.map((c) => c.id));
  s.cargo = s.cargo.filter((c) => !ids.has(c.id));
  const trip = startTrip(ctx, {
    kind: 'pickup',
    driverId,
    fromId: portPlaceId(cityId),
    toId: warehouse.id,
    items: cargo.map((c) => ({
      productId: c.productId,
      amount: c.amount,
      quality: c.quality,
      cut: 0,
      unitCost: c.unitCost,
    })),
    startedAt: ctx.now,
    loadedAt: ctx.now + approach + LOAD_MINUTES,
    arrivesAt: ctx.now + approach + LOAD_MINUTES + delivery,
  });
  const who = driverLabel(state, driverId);
  journal.add(
    ctx,
    `${who} ${driverId ? 'holt' : 'holst'} ${itemsText(trip.items)} am ${portName(cityId)} ab, ` +
      `im ${warehouse.name} in ca. ${clock.formatDuration(trip.arrivesAt - ctx.now)}.`,
  );
  return { ok: true, data: { tripId: trip.id, arrivesAt: trip.arrivesAt } };
}

function transfer(
  ctx: Ctx,
  payload: {
    fromId: string;
    toId: string;
    productId?: string;
    amount?: number;
    by: 'player' | 'driver';
    driverId?: string;
  },
): CommandResult {
  const state = ctx.state;
  const from = getWarehouse(state, payload.fromId);
  const to = getWarehouse(state, payload.toId);
  if (!from || !to) return { ok: false, reason: 'Beide Lager müssen dir gehören.' };
  if (from.id === to.id) return { ok: false, reason: 'Start und Ziel sind dasselbe Lager.' };
  // Zwischen den Städten fahren Routen über die Autobahn (Auftrag 30, Etappe 6), nicht das Umlagern.
  if (from.cityId !== to.cityId) return { ok: false, reason: 'Die Lager liegen in verschiedenen Städten.' };
  const lots = getLots(state, { warehouseId: from.id, productId: payload.productId });
  const available = lots.reduce((sum, l) => sum + l.amount, 0);
  if (available <= 0) return { ok: false, reason: `Im ${from.name} liegt davon nichts.` };
  if (payload.amount !== undefined && !(payload.amount > 0)) return { ok: false, reason: 'Ungültige Menge.' };
  if (payload.amount !== undefined && !payload.productId) return { ok: false, reason: 'Welche Ware?' };
  let driverId: string | null = null;
  if (payload.by === 'player') {
    const busy = playerBusy(state, from.cityId);
    if (busy) return { ok: false, reason: busy };
  } else {
    const driver = pickDriver(ctx, payload.driverId, from.cityId);
    if (typeof driver === 'string') return { ok: false, reason: driver };
    driverId = driver.id;
  }
  // Ware raus aus dem Startlager, pro Produkt als ein Posten.
  const products = [...new Set(lots.map((l) => l.productId))];
  const items: TripItem[] = [];
  for (const productId of products) {
    const have = lots.filter((l) => l.productId === productId).reduce((sum, l) => sum + l.amount, 0);
    const want = payload.productId && payload.amount !== undefined ? Math.min(have, Math.round(payload.amount)) : have;
    if (want <= 0) continue;
    const got: TakeResult = take(ctx, { productId, amount: want, warehouseId: from.id, partial: true });
    if (got.taken > 0)
      items.push({ productId, amount: got.taken, quality: got.quality, cut: got.cut, unitCost: got.unitCost });
  }
  if (items.length === 0) return { ok: false, reason: `Im ${from.name} liegt davon nichts.` };
  const speed = speedOf(state, driverId);
  const trip = startTrip(ctx, {
    kind: 'transfer',
    driverId,
    fromId: from.id,
    toId: to.id,
    items,
    startedAt: ctx.now,
    loadedAt: ctx.now + TRANSFER_LOAD_MINUTES,
    arrivesAt: ctx.now + TRANSFER_LOAD_MINUTES + travelMinutes(from, to, speed),
  });
  const who = driverLabel(state, driverId);
  journal.add(
    ctx,
    `${who} ${driverId ? 'bringt' : 'bringst'} ${itemsText(items)} vom ${from.name} ins ${to.name}, ` +
      `Ankunft in ca. ${clock.formatDuration(trip.arrivesAt - ctx.now)}.`,
  );
  return { ok: true, data: { tripId: trip.id, arrivesAt: trip.arrivesAt } };
}

function logTrip(ctx: Ctx, trip: Trip, result: TripLogEntry['result']): void {
  const s = ctx.state.modules.logistics;
  s.log.unshift({
    id: trip.id,
    kind: trip.kind,
    driverId: trip.driverId,
    toId: trip.toId,
    amount: tripAmount(trip),
    result,
    at: ctx.now,
    ...(trip.routeId !== undefined ? { routeId: trip.routeId } : {}),
  });
  s.log = s.log.slice(0, LOG_LIMIT);
}

function removeTrip(ctx: Ctx, trip: Trip): void {
  const s = ctx.state.modules.logistics;
  s.trips = s.trips.filter((t) => t.id !== trip.id);
  if (trip.driverId) {
    const m = getStaffMember(ctx.state, trip.driverId);
    const onThisTrip = (a: StaffMember['assignment']) => a?.kind === 'transport' && a.targetId === String(trip.id);
    // Auch wer unterwegs verletzt wurde (returnTo), ist danach frei.
    if (m && m.leftAt === null && (onThisTrip(m.assignment) || onThisTrip(m.returnTo)))
      assign(ctx, trip.driverId, null);
  }
}

function arrive(ctx: Ctx, trip: Trip): void {
  const warehouse = getWarehouse(ctx.state, trip.toId);
  // Wurde das Ziel-Lager inzwischen aufgegeben, landet die Ware im nächsten eigenen Lager.
  const target =
    warehouse ?? nearestWarehouse(ctx.state, placeOf(ctx.state, trip.fromId) ?? portPlace(tripCity(ctx.state, trip)));
  for (const item of trip.items) {
    store(ctx, {
      productId: item.productId,
      amount: item.amount,
      warehouseId: target?.id,
      quality: item.quality,
      cut: item.cut,
      unitCost: item.unitCost,
    });
  }
  removeTrip(ctx, trip);
  const s = ctx.state.modules.logistics;
  s.stats.trips += 1;
  logTrip(ctx, trip, 'done');
  if (trip.driverId) addXp(ctx, trip.driverId, XP_PER_TRIP);
  if (trip.items.length > 0)
    journal.add(ctx, `${itemsText(trip.items)} im ${target?.name ?? 'Lager'} angekommen.`, 'good');
  ctx.emit('transport.arrived', {
    tripId: trip.id,
    kind: trip.kind,
    toId: target?.id ?? trip.toId,
    amount: tripAmount(trip),
    ...(isInterCityTrip(ctx.state, trip) ? { interCity: true } : {}),
  });
  if (trip.kind === 'route') routeArrived(ctx, trip, target?.id ?? trip.toId);
}

/** Verkehrskontrolle unterwegs: Die Fahrt hält an, die Konfrontation entscheidet. */
function stopForCheck(ctx: Ctx, trip: Trip): void {
  const s = ctx.state.modules.logistics;
  s.stats.checks += 1;
  trip.checkAt = null;
  trip.status = 'stopped';
  trip.stoppedAt = ctx.now;
  const who = driverLabel(ctx.state, trip.driverId);
  // Zwischen den Städten: Zoll auf der Autobahn (Auftrag 30), sonst die Streife im Ziel-Veedel.
  const autobahn = isInterCityTrip(ctx.state, trip);
  const veedelId = autobahn ? null : destinationVeedel(ctx.state, trip.toId);
  const place = autobahn ? autobahnPlace(ctx.state, trip) : veedelId ? `in ${veedelName(veedelId)}` : 'auf dem Weg';
  journal.add(
    ctx,
    `${autobahn ? 'Zollkontrolle' : 'Verkehrskontrolle'} ${place}: ${who} ${trip.driverId ? 'wird' : 'wirst'} rausgewunken.`,
    'bad',
  );
  // Auf der Autobahn der Zoll als eigener Anlass (Auftrag 35: Papiere, bestechen, ablenken, Ladung aufgeben).
  const { encounterId } = startEncounter(ctx, {
    kind: autobahn ? 'customsCheck' : 'vehicleCheck',
    ...(veedelId ? { veedelId } : {}),
    staffIds: trip.driverId ? [trip.driverId] : [],
    playerPresent: trip.driverId === null,
    place,
    stakes: { goods: tripAmount(trip) },
    skipEffects: true,
    origin: { module: 'logistics', ref: `trip:${trip.id}` },
    ...(autobahn
      ? { opponent: { ...CUSTOMS_OPPONENT }, setting: 'autobahn' as const, lossCategory: 'loss.customs' as const }
      : {}),
  });
  trip.encounterId = encounterId;
  ctx.emit('transport.stopped', { tripId: trip.id, encounterId });
}

/** Ausgang einer Kontrolle. */
function onCheckResolved(ctx: Ctx, ref: string | undefined, outcome: string, ending?: string): void {
  const id = Number(ref?.replace('trip:', ''));
  const trip = ctx.state.modules.logistics.trips.find((t) => t.id === id);
  if (trip?.status !== 'stopped') return;
  // Heat landet im Ziel-Veedel (bei der Autobahn: in der Zielstadt).
  const veedelId = destinationVeedel(ctx.state, trip.toId);
  const autobahn = isInterCityTrip(ctx.state, trip);
  const who = driverLabel(ctx.state, trip.driverId);
  if (outcome === 'success' || outcome === 'retreat') {
    const waited = ctx.now - (trip.stoppedAt ?? ctx.now) + (autobahn ? AUTOBAHN_CHECK_DELAY : CHECK_DELAY);
    trip.arrivesAt += waited;
    if (trip.loadedAt > (trip.stoppedAt ?? ctx.now)) trip.loadedAt += waited;
    trip.status = 'enRoute';
    trip.stoppedAt = null;
    trip.encounterId = null;
    if (outcome === 'retreat' && veedelId) addHeat(ctx, veedelId, ESCAPE_HEAT);
    journal.add(
      ctx,
      outcome === 'success'
        ? `${who} ${trip.driverId ? 'darf' : 'darfst'} weiterfahren. Die Ladung ist sicher.`
        : `${who} ${trip.driverId ? 'ist' : 'bist'} den Bullen davongefahren. Die Ladung ist sicher, aber es wird gesucht.`,
      'good',
    );
    return;
  }
  // Aufgeflogen: Ladung weg, der Fahrer wird vielleicht festgenommen.
  const amount = tripAmount(trip);
  removeTrip(ctx, trip);
  const s = ctx.state.modules.logistics;
  s.stats.seized += amount;
  recordConfiscation(ctx, amount);
  logTrip(ctx, trip, 'seized');
  if (veedelId) addHeat(ctx, veedelId, SEIZE_HEAT);
  let arrested = false;
  // Ladung aufgegeben (Zollkontrolle): Die Ware ist weg, dafür kommt niemand mit.
  if (trip.driverId && ending !== 'surrendered') {
    const m = getStaffMember(ctx.state, trip.driverId);
    const factor = autobahn ? AUTOBAHN_ARREST_FACTOR : 1;
    if (
      m &&
      m.status === 'active' &&
      ctx.chance(Math.min(1, SEIZE_ARREST_CHANCE * factor * riskFactor(ctx.state, m.id)))
    ) {
      arrestStaff(ctx, m.id, veedelId ?? '');
      arrested = true;
    }
  }
  if (trip.routeId !== undefined) routeLost(ctx, trip, 'seized');
  journal.add(
    ctx,
    `${autobahn ? 'Der Zoll hat die Ladung gefunden' : 'Ladung aufgeflogen'}: ${itemsText(trip.items)} beschlagnahmt.` +
      (trip.driverId
        ? arrested
          ? ` ${who} wird festgenommen.`
          : ` ${who} kommt mit einer Anzeige davon.`
        : ' Dich selbst lassen sie laufen.'),
    'bad',
  );
  ctx.emit('transport.seized', { tripId: trip.id, amount, arrested });
}

/** Ein Fahrer fällt unterwegs aus (gekündigt, verletzt …): Die Ladung ist verloren. */
function driverGone(ctx: Ctx, staffId: string): void {
  for (const trip of [...ctx.state.modules.logistics.trips]) {
    if (trip.driverId !== staffId || trip.status === 'stopped') continue;
    const amount = tripAmount(trip);
    removeTrip(ctx, trip);
    logTrip(ctx, trip, 'lost');
    if (trip.routeId !== undefined) routeLost(ctx, trip, 'lost');
    journal.add(ctx, `Fahrt geplatzt: Der Fahrer ist ausgefallen, ${itemsText(trip.items)} sind weg.`, 'bad');
    ctx.emit('transport.lost', { tripId: trip.id, amount });
  }
}

/** Schreibt dieser Kontakt für einen Hafen? */
function isPortContact(contactId: string): boolean {
  return contactId === HARBOR_CONTACT.id || contactId === HARBOR_CALLER.id;
}

/** Container, auf die sich eine Hafen-Frage bezieht (steht in den Abhol-Optionen). */
function questionCargoIds(message: Message): number[] {
  return (message.options ?? []).flatMap((o) =>
    o.command?.type === 'logistics.pickup' ? (o.command.payload.cargoIds ?? []) : [],
  );
}

/** Offene Fragen des Hafenmeisters zu diesen Containern (z.B. damit die Rechte Hand sie beantworten kann). */
export function harborQuestions(state: GameState, cargoIds: readonly number[]): Message[] {
  return state.messages.list.filter(
    (m) =>
      isPortContact(m.contactId) &&
      messages.canAnswer(state, m) &&
      questionCargoIds(m).some((id) => cargoIds.includes(id)),
  );
}

// Die Suche nach erledigten Fragen lohnt nur, wenn sich am Kai oder bei den Nachrichten etwas getan hat. Gemerkt pro
// Zustand (ein geladener Spielstand fängt neu an); nur eine Abkürzung, das Ergebnis bleibt dasselbe.
const staleCheckKey = new WeakMap<LogisticsState, string>();

/** Fragen zu Containern, die nicht mehr am Kai stehen (abgeholt, vom Zoll geholt), haben sich erledigt. */
function retractStaleQuestions(ctx: Ctx): void {
  const s = ctx.state.modules.logistics;
  const list = ctx.state.messages.list;
  const key = `${s.cargo.map((c) => c.id).join(',')}|${list.length}|${list[list.length - 1]?.id ?? 0}`;
  if (staleCheckKey.get(s) === key) return;
  staleCheckKey.set(s, key);
  const onQuay = new Set(s.cargo.map((c) => c.id));
  for (const m of ctx.state.messages.list) {
    if (!isPortContact(m.contactId) || !messages.canAnswer(ctx.state, m)) continue;
    const ids = questionCargoIds(m);
    if (ids.length > 0 && !ids.some((id) => onQuay.has(id))) messages.retract(ctx, m.id);
  }
}

/** Zoll am Kai: Ware, die zu lange steht, kann jede Stunde gefunden werden (nur in der Stadt, die live ist). */
function customs(ctx: Ctx): void {
  const s = ctx.state.modules.logistics;
  for (const cargo of [...s.cargo]) {
    if (!isCityLive(ctx.state, cargo.cityId)) continue;
    const port = portOf(cargo.cityId);
    if (ctx.now < cargoRiskFrom(cargo) || !ctx.chance(port.customsChancePerHour)) continue;
    s.cargo = s.cargo.filter((c) => c.id !== cargo.id);
    s.stats.seized += cargo.amount;
    recordConfiscation(ctx, cargo.amount);
    const goods = `${formatProductAmount(cargo.productId, cargo.amount)} ${productName(cargo.productId)}`;
    journal.add(ctx, `Der Zoll hat deinen Container im ${port.name} geöffnet: ${goods} beschlagnahmt.`, 'bad');
    messages.send(ctx, {
      contact: portContact(cargo.cityId),
      text: `Zu spät. Der Zoll war an deinem Container, ${goods} sind weg. Ich hab dir gesagt, hol das Zeug ab.`,
    });
    ctx.emit('cargo.seized', { cargoId: cargo.id, productId: cargo.productId, amount: cargo.amount });
  }
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.logistics;
  for (const trip of [...s.trips]) {
    if (trip.status !== 'enRoute') continue;
    // In einer schlafenden Stadt fährt die Fahrt ohne Kontrolle zu Ende (die Autobahn gehört keiner Stadt).
    if (
      trip.checkAt !== null &&
      trip.checkAt <= ctx.now &&
      !isCityLive(ctx.state, tripCity(ctx.state, trip)) &&
      !isInterCityTrip(ctx.state, trip)
    ) {
      trip.checkAt = null;
    }
    if (trip.checkAt !== null && trip.checkAt <= ctx.now) stopForCheck(ctx, trip);
    else if (trip.arrivesAt <= ctx.now) arrive(ctx, trip);
  }
  if (ctx.now % 60 === 0) customs(ctx);
  routesTick(ctx);
  if (ctx.now % MINUTES_PER_DAY === 0) settleRestock(ctx);
  retractStaleQuestions(ctx);
}

export default defineModule({
  id: 'logistics',
  version: 3,
  dependsOn: ['goods', 'suppliers', 'staff'],
  init: (ctx) => ({
    // Alte Spielstände: Wer schon am Hafen bestellt hat, behält seinen Zugang (Bestandsschutz).
    berths: ((ctx.state.modules.suppliers?.relations?.rotterdam?.orders ?? 0) > 0
      ? { koeln: { since: ctx.now } }
      : {}) as LogisticsState['berths'],
    cargo: [],
    trips: [],
    log: [],
    stats: { trips: 0, checks: 0, seized: 0 },
    routes: [],
    restock: [],
  }),
  tick,
  commands: {
    'logistics.buyBerth': (ctx, payload) => buyBerth(ctx, payload?.cityId ?? activeCity(ctx.state)),
    'logistics.pickup': (ctx, payload) => pickup(ctx, payload),
    'logistics.transfer': (ctx, payload) => transfer(ctx, payload),
    'logistics.addRoute': (ctx, payload) => saveRoute(ctx, null, payload),
    'logistics.updateRoute': (ctx, { routeId, ...patch }) => saveRoute(ctx, routeId, patch),
    'logistics.removeRoute': (ctx, { routeId }) => removeRoute(ctx, routeId),
    'logistics.runRouteNow': (ctx, { routeId }) => departRoute(ctx, routeId, 'now'),
  },
  on: {
    'encounter.resolved': (ctx, { request, outcome, result }) => {
      if (request.origin?.module === 'logistics') onCheckResolved(ctx, request.origin.ref, outcome, result?.ending);
    },
    'staff.left': (ctx, { staffId }) => driverGone(ctx, staffId),
    'staff.statusChanged': (ctx, { staffId, to }) => {
      if (to !== 'active') driverGone(ctx, staffId);
    },
  },
  // Pleite-Regel: Ware am Kai (in jeder Stadt) oder unterwegs zählt wie Ware im Lager.
  solvency: (state) => state.modules.logistics.cargo.length > 0 || getTrips(state).length > 0,
  migrations: {
    // Version 2 (Auftrag 30): Liegeplätze und Ware am Kai pro Stadt. Bis dahin war alles Köln.
    2: (old: LogisticsStateV1): LogisticsStateV2 => {
      const { berth, ...rest } = old;
      return {
        ...rest,
        berths: berth ? { koeln: berth } : {},
        cargo: old.cargo.map((c) => ({ ...c, cityId: 'koeln' })),
      };
    },
    // Version 3 (Auftrag 30, Etappe 6): Routen mit Fahrplan und Nachkauf für schlafende Städte.
    3: (old: LogisticsStateV2): LogisticsState => ({ ...old, routes: [], restock: [] }),
  },
});

/** Für Tests und die Oberfläche: Warenwert am Kai zum Einkaufspreis (alle Städte). */
export function cargoValue(state: GameState): number {
  return Math.round(state.modules.logistics.cargo.reduce((sum, c) => sum + c.amount * c.unitCost, 0));
}

/** Lager, in das eine Abholung ohne Angabe geht (am nächsten zum Hafen der Stadt, Standard: die aktive). */
export function defaultPickupWarehouse(state: GameState, cityId: string = activeCity(state)): string | undefined {
  return nearestWarehouse(state, portPlace(cityId))?.id ?? getWarehouses(state, cityId)[0]?.id;
}
