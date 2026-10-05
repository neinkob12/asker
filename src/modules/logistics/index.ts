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
  type GameCommands,
  type GameState,
  journal,
  type LngLat,
  type Message,
  MINUTES_PER_DAY,
  messages,
  texts,
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
  getVehicle,
  maybeSeize,
  pickVehicle,
  releaseVehicle,
  useVehicle,
  vehicleName,
  vehicleSpec,
  vehicleStatus,
} from '../fleet';
import {
  formatProductAmount,
  getLots,
  getWarehouse,
  getWarehouses,
  nearestWarehouse,
  productName,
  store,
  storeFitting,
  type TakeResult,
  take,
  unitWeight,
  type Warehouse,
  warehouseCity,
  warehouseFree,
} from '../goods';
import { addHeat, arrestStaff, getHeat, recordConfiscation } from '../police';
import { AVOID_MOTORWAY, type RoadOptions, type RoadRoute, roadRoute, travelMinutes } from '../roads';
import {
  addXp,
  assign,
  getStaff,
  getStaffMember,
  riskFactor,
  roleName,
  type StaffMember,
  staffContact,
} from '../staff';
import { UNLOADING_PORT } from '../suppliers';
import { allVeedel, veedelAt, veedelName } from '../veedel';
import {
  A1_PLACES,
  AUTOBAHN_ARREST_FACTOR,
  AUTOBAHN_CHECK_CHANCE,
  AUTOBAHN_CHECK_DELAY,
  BERTH_LEVELS,
  CHECK_CHANCE,
  CHECK_DELAY,
  CHECK_HEAT_DIVISOR,
  CUSTOMS_OPPONENT,
  DRIVER_BASE_SPEED,
  DRIVER_SPEED_PER_POINT,
  ESCAPE_HEAT,
  HARBOR_CONTACT,
  HARBOR_PORTS,
  type HarborPort,
  LOAD_MINUTES,
  LOG_LIMIT,
  NIGHT_END,
  NIGHT_START,
  PLAYER_DRIVE_SPEED,
  PORTS,
  type PortConfig,
  ROUTE_CHOICES,
  type RouteChoice,
  SEIZE_ARREST_CHANCE,
  SEIZE_HEAT,
  TRANSFER_LOAD_MINUTES,
  UNLOAD_RETRY_MINUTES,
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
import { PORT_TEXTS } from './texts';

export {
  BERTH_COST,
  BERTH_LEVELS,
  CARGO_SAFE_MINUTES,
  CUSTOMS_OPPONENT,
  HARBOR_PORTS,
  type HarborPort,
  INTERCITY_CAPACITY,
  NIGHT_START,
  PORTS,
  ROUTE_CHOICE_ORDER,
  ROUTE_CHOICES,
  type RouteChoice,
} from './config';
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

/** Hafen der Hafen-Phase (Auftrag 40), z.B. 'rotterdam', 'antwerpen', 'hamburg'. */
export function harborPort(id: string): HarborPort | undefined {
  return HARBOR_PORTS.find((p) => p.id === id);
}

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
  /**
   * 'stopped': Kontrolle läuft (Konfrontation), die Fahrt steht. 'waiting': angekommen, aber das Lager ist voll; der
   * Rest (items) wartet beim Fahrer, bis Platz ist oder die Fahrt umgeleitet wird (Auftrag 33). 'planned':
   * Nachtfahrt, die erst um startedAt losfährt (Fahrer und Fahrzeug sind schon eingeteilt).
   */
  status: 'enRoute' | 'stopped' | 'waiting' | 'planned';
  stoppedAt: number | null;
  encounterId: number | null;
  /** Fahrt einer Route: welche, und ob Hin- oder Rückfahrt. */
  routeId?: number;
  leg?: 'out' | 'back';
  /** Schon abgeladene Einheiten, solange die Fahrt am vollen Lager wartet (Auftrag 33). */
  unloaded?: number;
  /** Eigenes Fahrzeug (fleet), fehlt = Privatauto des Fahrers (Auftrag 33). */
  vehicleId?: number;
  /** Wahl der Strecke (Auftrag 33), fehlt = Autobahn. */
  choice?: RouteChoice;
  /** Geplante Abholung: Diese Container am Kai holt die Fahrt bei der Abfahrt (bis dahin stehen sie dort). */
  cargoIds?: number[];
}

/** Fahrzeugwahl einer Fahrt: eigenes Fahrzeug (ID), 'private' = Privatauto, ohne Angabe das passende freie. */
export type VehicleChoice = number | 'private';

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
  /** Eigene Liegeplätze pro Stadt (seit wann, Stufe 0 Kai, 1 Halle am Kai, 2 Kran; Auftrag 33). */
  berths: Record<string, { since: number; level: number }>;
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

/** Zustand in Version 5: Liegeplätze ohne Stufe. */
type LogisticsStateV5 = Omit<LogisticsState, 'berths'> & { berths: Record<string, { since: number }> };

/** Zustand in Version 4: Routen ohne Wahl der Strecke. */
type LogisticsStateV4 = Omit<LogisticsStateV5, 'routes'> & { routes: Omit<Route, 'choice'>[] };

/** Zustand in Version 3: Routen ohne Fahrzeug. */
type LogisticsStateV3 = Omit<LogisticsStateV5, 'routes'> & { routes: Omit<Route, 'vehicleId' | 'choice'>[] };

/** Zustand in Version 2: ohne Routen. */
type LogisticsStateV2 = Omit<LogisticsStateV5, 'routes' | 'restock'>;

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
    'logistics.pickup': {
      by: 'player' | 'driver';
      driverId?: string;
      warehouseId?: string;
      cargoIds?: number[];
      vehicleId?: VehicleChoice;
      choice?: RouteChoice;
    };
    /** Ware von einem Lager ins andere bringen. Ohne productId alles, ohne amount die ganze Menge des Produkts. */
    'logistics.transfer': {
      fromId: string;
      toId: string;
      productId?: string;
      amount?: number;
      by: 'player' | 'driver';
      driverId?: string;
      vehicleId?: VehicleChoice;
      choice?: RouteChoice;
    };
    /** Route mit Fahrplan anlegen (Auftrag 30). Ergebnis data.routeId. */
    'logistics.addRoute': RouteInput;
    /** Route ändern: nur die angegebenen Felder. */
    'logistics.updateRoute': { routeId: number } & Partial<RouteInput>;
    'logistics.removeRoute': { routeId: number };
    /** Route sofort fahren, außerhalb des Fahrplans. */
    'logistics.runRouteNow': { routeId: number };
    /** Fahrt, die am vollen Lager wartet, in ein anderes eigenes Lager der Stadt umleiten (Auftrag 33). */
    'logistics.redirect': { tripId: number; toId: string };
    /** Liegeplatz um eine Stufe ausbauen: Halle am Kai, dann Kran (sauberes Geld, Auftrag 33). Ohne Stadt: die aktive. */
    'logistics.upgradeBerth': { cityId?: string };
  }
  interface GameEvents {
    'logistics.berthBought': { cost: number; cityId?: string };
    'logistics.berthUpgraded': { cityId: string; level: number; cost: number };
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
    /** Angekommen, aber das Ziel-Lager ist voll: rest Einheiten warten beim Fahrer (Auftrag 33). */
    'transport.waiting': { tripId: number; toId: string; rest: number; driverId: string | null };
    /** Abholung: Ein Teil passte nicht ins Lager bzw. in den Wagen und bleibt am Kai (Auftrag 33). */
    'cargo.leftBehind': { cityId: string; amount: number; reason: 'warehouse' | 'vehicle' };
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

/** Texte des Hafens einer Stadt (Auftrag 23), ohne eigene Texte die Kölner. */
function portTexts(cityId: string) {
  return PORT_TEXTS[cityId] ?? PORT_TEXTS.koeln;
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

/**
 * Bist du selbst gerade unterwegs (Fahrt mit dem Transporter oder zwischen den Städten, Auftrag 30)? Wartet deine Fahrt
 * am vollen Lager, steht der Wagen dort im Hof und du bist frei.
 */
export function isPlayerOnTheRoad(state: GameState): boolean {
  return (
    isPlayerTraveling(state) ||
    getTrips(state).some((t) => t.driverId === null && t.status !== 'waiting' && t.status !== 'planned')
  );
}

/** Straßenwahl einer Fahrt für roads (Landstraße meidet die Autobahn). */
export function roadOptions(choice: RouteChoice | undefined): RoadOptions | undefined {
  return choice && ROUTE_CHOICES[choice].avoidMotorway ? { weights: AVOID_MOTORWAY } : undefined;
}

/** Abfahrt einer Fahrt mit dieser Wahl: sofort, nachts frühestens um NIGHT_START (zwischen 23 und 5 Uhr sofort). */
export function departureFor(now: number, choice: RouteChoice | undefined): number {
  if (!choice || !ROUTE_CHOICES[choice].night || isNight(now)) return now;
  return now - clock.minuteOfDay(now) + NIGHT_START;
}

/** Liegt dieser Zeitpunkt in der Nacht (NIGHT_START bis NIGHT_END)? */
export function isNight(time: number): boolean {
  const minute = clock.minuteOfDay(time);
  return minute >= NIGHT_START || minute < NIGHT_END;
}

/** Was eine Wahl bei dieser Abfahrt wirklich bringt: "nachts" fährt am Tag wie die Autobahn. */
export function effectiveChoice(choice: RouteChoice | undefined, departure: number): RouteChoice {
  if (!choice) return 'autobahn';
  return ROUTE_CHOICES[choice].night && !isNight(departure) ? 'autobahn' : choice;
}

/** Container am Kai, die eine geplante Nachtfahrt schon für sich eingeteilt hat. */
export function reservedCargo(state: GameState): Set<number> {
  return new Set(getTrips(state).flatMap((t) => (t.status === 'planned' ? (t.cargoIds ?? []) : [])));
}

/** Gramm, die gerade zu einem Lager unterwegs sind oder dort auf Platz warten (Fahrten aller Art). */
export function inboundWeight(state: GameState, warehouseId: string): number {
  let grams = 0;
  for (const trip of getTrips(state)) {
    if (trip.toId !== warehouseId) continue;
    for (const item of trip.items) grams += item.amount * unitWeight(item.productId);
  }
  return grams;
}

/** Platz in einem Lager in Gramm für eine neue Fahrt: frei minus das, was schon dorthin unterwegs ist. */
export function roomFor(state: GameState, warehouseId: string): number {
  return Math.max(0, warehouseFree(state, warehouseId) - inboundWeight(state, warehouseId));
}

/** Fahrer ohne Einsatz in einer Stadt (Standard: die aktive), die sofort losfahren können. */
export function freeDrivers(state: GameState, cityId: string = activeCity(state)): StaffMember[] {
  return getStaff(state, { role: 'driver', status: 'active', cityId }).filter((m) => !m.assignment);
}

export function getLogisticsLog(state: GameState): readonly TripLogEntry[] {
  return state.modules.logistics?.log ?? [];
}

/** Stufe des Liegeplatzes einer Stadt (0 Kai, 1 Halle am Kai, 2 Kran; ohne Liegeplatz 0). */
export function berthLevel(state: GameState, cityId: string = activeCity(state)): number {
  return state.modules.logistics?.berths?.[cityId]?.level ?? 0;
}

/** Wirkung der Stufe des Liegeplatzes (Auftrag 33). */
export function berthEffect(state: GameState, cityId: string = activeCity(state)): (typeof BERTH_LEVELS)[number] {
  return BERTH_LEVELS[Math.min(BERTH_LEVELS.length - 1, berthLevel(state, cityId))];
}

/** Preis der nächsten Stufe in sauberem Geld, null wenn voll ausgebaut. */
export function berthUpgradeCost(state: GameState, cityId: string = activeCity(state)): number | null {
  return portOf(cityId).upgradeCosts[berthLevel(state, cityId)] ?? null;
}

/** Laden am Kai in Minuten (mit Kran schneller). */
function loadMinutes(state: GameState, cityId: string): number {
  return Math.round(LOAD_MINUTES * berthEffect(state, cityId).loadFactor);
}

/**
 * Ab wann der Zoll bei dieser Ware neugierig wird (nach dem Hafen ihrer Stadt; mit state auch nach der Stufe des
 * Liegeplatzes, Auftrag 33).
 */
export function cargoRiskFrom(cargo: Pick<PortCargo, 'arrivedAt'> & { cityId?: string }, state?: GameState): number {
  const cityId = cargo.cityId ?? 'koeln';
  const factor = state ? berthEffect(state, cityId).safeFactor : 1;
  return cargo.arrivedAt + Math.round(portOf(cityId).safeMinutes * factor);
}

/** Gefahr für Ware am Kai: 'safe' (noch sicher), 'risky' (Zoll kann sie jede Stunde finden). */
export function cargoRisk(
  state: GameState,
  cargo: Pick<PortCargo, 'arrivedAt'> & { cityId?: string },
): 'safe' | 'risky' {
  return state.time >= cargoRiskFrom(cargo, state) ? 'risky' : 'safe';
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

/** Stadt, in der eine Fahrt losfährt (Hafen oder Startlager); ohne bekannten Ort die Stadt des Ziels. */
export function originCity(state: GameState, trip: Pick<Trip, 'toId' | 'fromId'>): string {
  const from = placeOf(state, trip.fromId);
  return from ? cityAt(from.lng, from.lat) : tripCity(state, trip);
}

/** Fährt diese Fahrt von einer Stadt in die andere (über die Autobahn)? */
export function isInterCityTrip(state: GameState, trip: Pick<Trip, 'toId' | 'fromId'>): boolean {
  const from = placeOf(state, trip.fromId);
  const to = placeOf(state, trip.toId);
  return !!from && !!to && cityAt(from.lng, from.lat) !== cityAt(to.lng, to.lat);
}

export type TripLeg = 'toPickup' | 'loading' | 'delivering' | 'stopped' | 'planned';

/**
 * Wo die Fahrt gerade ist: Anfahrt zum Abholort (nur bei der Abholung am Hafen), Laden, mit Ware zum Ziel,
 * oder angehalten (Kontrolle). t ist der Fortschritt im Abschnitt (0–1), total der Fortschritt der ganzen Fahrt.
 */
export function tripProgress(state: GameState, trip: Trip): { leg: TripLeg; t: number; total: number } {
  if (trip.status === 'planned') return { leg: 'planned', t: 0, total: 0 };
  const now = trip.status === 'stopped' && trip.stoppedAt !== null ? trip.stoppedAt : state.time;
  const total = clamp01((now - trip.startedAt) / Math.max(1, trip.arrivesAt - trip.startedAt));
  const atPickup = arriveAtPickup(state, trip);
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
  const delivery = roadRoute(from, to, roadOptions(trip.choice));
  return { approach: approach?.path ?? null, delivery: delivery.path, routes: { approach, delivery } };
}

/** Ankunft am Abholort: bei der Abholung am Hafen vor dem Laden, beim Umlagern sofort (Laden im Startlager). */
function arriveAtPickup(state: GameState, trip: Trip): number {
  if (trip.kind !== 'pickup') return trip.startedAt;
  return Math.max(trip.startedAt, trip.loadedAt - loadMinutes(state, tripCity(state, trip)));
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
    text: texts.pick(ctx, `port:${cityId}:docked`, portTexts(cityId).docked, {
      goods,
      duration: clock.formatDuration(cargoRiskFrom(cargo, ctx.state) - ctx.now),
      quay: port.quay,
    }),
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
  s.berths[cityId] = { since: ctx.now, level: 0 };
  journal.add(
    ctx,
    `Liegeplatz im ${port.name} gemietet (${formatEuro(port.berthCost)}). Jetzt können Schiffe für dich anlegen.`,
    'good',
  );
  messages.send(ctx, {
    contact: portContact(cityId),
    text: texts.pick(ctx, `port:${cityId}:welcome`, portTexts(cityId).welcome, { quay: port.quay }),
  });
  ctx.emit('logistics.berthBought', { cost: port.berthCost, cityId });
  return { ok: true };
}

/** Liegeplatz ausbauen (Auftrag 33): Halle am Kai, dann Kran. Legal, sauberes Geld. */
function upgradeBerth(ctx: Ctx, cityId: string): CommandResult {
  const berth = ctx.state.modules.logistics.berths[cityId];
  if (!berth) return { ok: false, reason: 'Erst brauchst du einen Liegeplatz.' };
  const cost = berthUpgradeCost(ctx.state, cityId);
  if (cost === null) return { ok: false, reason: 'Dein Liegeplatz ist voll ausgebaut.' };
  const next = BERTH_LEVELS[berth.level + 1];
  const port = portOf(cityId);
  if (!wallet.pay(ctx, cost, 'clean', `${next.name} ${port.name}`, { category: 'expansion', cityId })) {
    return { ok: false, reason: `Dafür brauchst du ${formatEuro(cost)} sauberes Geld. Wasch vorher Schwarzgeld.` };
  }
  berth.level += 1;
  journal.add(ctx, `${port.name}: ${next.name} gebaut (${formatEuro(cost)}). ${next.effect}`, 'good');
  ctx.emit('logistics.berthUpgraded', { cityId, level: berth.level, cost });
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
  if (getTrips(state).some((t) => t.driverId === null && t.status === 'planned')) return 'Du fährst heute Nacht schon.';
  if (isPlayerOnTheRoad(state)) return 'Du bist schon mit einer Fahrt unterwegs.';
  if (cityId && !isPlayerIn(state, cityId)) return `Du bist nicht in ${cityName(cityId)}. Schick einen Fahrer.`;
  if (isPlayerDelivering(state)) return 'Du bist gerade mit einer Lieferung unterwegs.';
  return null;
}

/** Tempo in Metern pro Spielminute: Fahrer (oder du) mal Tempo des Fahrzeugs (Auftrag 33). */
export function speedOf(state: GameState, driverId: string | null, vehicleId?: number | null): number {
  const factor = vehicleSpec(state, vehicleId).speed;
  if (!driverId) return PLAYER_DRIVE_SPEED * factor;
  const m = getStaffMember(state, driverId);
  return (DRIVER_BASE_SPEED + (m?.stats.speed ?? 50) * DRIVER_SPEED_PER_POINT) * factor;
}

/**
 * Ladung einer Fahrt in der Stadt (Abholen, Umlagern) in Gramm: eigenes Fahrzeug nach Modell, das Privatauto ohne
 * Grenze wie bisher. Routen rechnen selbst (routeCapacity, zwischen den Städten INTERCITY_CAPACITY).
 */
export function cityLoadCapacity(state: GameState, vehicleId: number | null | undefined): number {
  return vehicleId === null || vehicleId === undefined
    ? Number.POSITIVE_INFINITY
    : vehicleSpec(state, vehicleId).capacity;
}

/**
 * Fahrzeug für eine Fahrt in der Stadt (Auftrag 33): das gewünschte (muss frei sein und in der Stadt stehen), das
 * Privatauto, oder ohne Angabe das kleinste freie, in das grams Gramm passen, sonst das Privatauto (ohne Grenze). Eigene
 * Fahrzeuge begrenzen die Ladung also nur, wenn man sie wählt. Gibt die ID zurück (null = Privatauto) oder einen Grund.
 */
export function chooseVehicle(
  state: GameState,
  cityId: string,
  wanted: VehicleChoice | undefined,
  grams: number,
): number | null | string {
  if (wanted === 'private') return null;
  if (wanted === undefined) return pickVehicle(state, cityId, grams, Number.POSITIVE_INFINITY);
  const vehicle = getVehicle(state, wanted);
  if (!vehicle) return 'Dieses Fahrzeug gibt es nicht.';
  const name = vehicleName(state, wanted);
  if (vehicleStatus(vehicle) === 'seized') return `${name} ist beschlagnahmt.`;
  if (vehicleStatus(vehicle) === 'busy') return `${name} ist gerade unterwegs.`;
  if (vehicle.cityId !== cityId) return `${name} steht in ${cityName(vehicle.cityId)}.`;
  return vehicle.id;
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
  const caution =
    (trip.driverId ? riskFactor(ctx.state, trip.driverId) : 1) * vehicleSpec(ctx.state, trip.vehicleId).checkFactor;
  let chance: number;
  if (isInterCityTrip(ctx.state, trip)) {
    const heat = cityHeat(ctx.state, tripCity(ctx.state, trip));
    chance = AUTOBAHN_CHECK_CHANCE * (1 + heat / CHECK_HEAT_DIVISOR) * caution;
  } else {
    const veedelId = destinationVeedel(ctx.state, trip.toId);
    const heat = veedelId ? getHeat(ctx.state, veedelId) : 0;
    chance = CHECK_CHANCE * (1 + heat / CHECK_HEAT_DIVISOR) * caution;
  }
  chance *= ROUTE_CHOICES[effectiveChoice(trip.choice, trip.startedAt)].checkFactor;
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
  // Fahrzeug belegen; ist es doch nicht frei, fährt das Privatauto.
  if (full.vehicleId !== undefined && !useVehicle(ctx, full.vehicleId, full.id)) delete full.vehicleId;
  // Nachtfahrt (Auftrag 33): steht bis zur Abfahrt, die Kontrolle wird erst dann ausgewürfelt.
  if (full.startedAt > ctx.now) full.status = 'planned';
  else rollCheck(ctx, full);
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

/**
 * Ziel einer Abholung ohne Angabe: das bestellte Lager bzw. das nächste am Hafen; hat das keinen Platz mehr, das
 * nächste Lager der Stadt mit Platz (Auftrag 33).
 */
function pickupTarget(state: GameState, cargo: readonly PortCargo[], cityId: string): Warehouse | undefined {
  const port = portPlace(cityId);
  const first = wishedWarehouse(state, cargo) ?? nearestWarehouse(state, port);
  if (!first || roomFor(state, first.id) > 0) return first;
  const withRoom = getWarehouses(state, cityId).filter((w) => roomFor(state, w.id) > 0);
  return withRoom.sort((a, b) => travelMinutes(port, a, 300) - travelMinutes(port, b, 300))[0] ?? first;
}

/**
 * Ware vom Kai aufteilen: was in grams Gramm passt, kommt mit (älteste zuerst, ein Container auch zum Teil), der Rest
 * bleibt am Kai stehen (Auftrag 33).
 */
function loadFromQuay(s: LogisticsState, cargo: readonly PortCargo[], grams: number): TripItem[] {
  const items: TripItem[] = [];
  let room = grams;
  for (const c of cargo) {
    const per = unitWeight(c.productId);
    const n = Math.min(c.amount, Math.floor(room / per));
    if (n <= 0) continue;
    room -= n * per;
    items.push({ productId: c.productId, amount: n, quality: c.quality, cut: 0, unitCost: c.unitCost });
    if (n === c.amount) s.cargo = s.cargo.filter((x) => x.id !== c.id);
    else c.amount -= n;
  }
  return items;
}

function pickup(ctx: Ctx, payload: GameCommands['logistics.pickup']): CommandResult {
  const state = ctx.state;
  const s = state.modules.logistics;
  // Ohne Angabe alles am Kai der aktiven Stadt; mit Angabe die Container, aber nur aus einem Hafen. Was eine
  // Nachtfahrt schon eingeteilt hat, bleibt für sie.
  const reserved = reservedCargo(state);
  const chosen = (
    payload.cargoIds
      ? s.cargo.filter((c) => payload.cargoIds?.includes(c.id))
      : s.cargo.filter((c) => c.cityId === activeCity(state))
  ).filter((c) => !reserved.has(c.id));
  const cityId = chosen[0]?.cityId ?? activeCity(state);
  const cargo = chosen.filter((c) => c.cityId === cityId);
  if (cargo.length === 0) return { ok: false, reason: 'Am Kai wartet nichts auf dich.' };
  const port = portPlace(cityId);
  const warehouse = payload.warehouseId ? getWarehouse(state, payload.warehouseId) : pickupTarget(state, cargo, cityId);
  if (!warehouse) {
    return {
      ok: false,
      reason: payload.warehouseId
        ? 'Dieses Lager gehört dir nicht.'
        : `In ${cityName(cityId)} hast du noch kein Lager.`,
    };
  }
  if (warehouseCity(warehouse.id) !== cityId) return { ok: false, reason: 'Das Lager liegt in einer anderen Stadt.' };
  const space = roomFor(state, warehouse.id);
  if (space < Math.min(...cargo.map((c) => unitWeight(c.productId)))) {
    return {
      ok: false,
      reason: `Im ${warehouse.name} ist kein Platz. Bau Regale ein, lager um oder wähl ein anderes Lager.`,
    };
  }
  let driverId: string | null = null;
  if (payload.by === 'player') {
    const busy = playerBusy(state, cityId);
    if (busy) return { ok: false, reason: busy };
  } else {
    const driver = pickDriver(ctx, payload.driverId, cityId);
    if (typeof driver === 'string') return { ok: false, reason: driver };
    driverId = driver.id;
  }
  const grams = Math.min(
    space,
    cargo.reduce((sum, c) => sum + c.amount * unitWeight(c.productId), 0),
  );
  const vehicle = chooseVehicle(state, cityId, payload.vehicleId, grams);
  if (typeof vehicle === 'string') return { ok: false, reason: vehicle };
  const room = Math.min(space, cityLoadCapacity(state, vehicle));
  const choice = payload.choice ?? 'autobahn';
  const departAt = departureFor(ctx.now, choice);
  if (departAt > ctx.now) return planPickup(ctx, { cargo, cityId, warehouse, driverId, vehicle, choice, departAt });
  const speed = speedOf(state, driverId, vehicle);
  const approach = travelMinutes(warehouse, port, speed);
  const delivery = travelMinutes(port, warehouse, speed, 0, roadOptions(choice));
  const total = cargo.reduce((sum, c) => sum + c.amount, 0);
  const items = loadFromQuay(s, cargo, room);
  const left = total - items.reduce((sum, i) => sum + i.amount, 0);
  const trip = startTrip(ctx, {
    kind: 'pickup',
    driverId,
    fromId: portPlaceId(cityId),
    toId: warehouse.id,
    items,
    ...(vehicle !== null ? { vehicleId: vehicle } : {}),
    ...(choice !== 'autobahn' ? { choice } : {}),
    startedAt: ctx.now,
    loadedAt: ctx.now + approach + loadMinutes(state, cityId),
    arrivesAt: ctx.now + approach + loadMinutes(state, cityId) + delivery,
  });
  const who = driverLabel(state, driverId);
  journal.add(
    ctx,
    `${who} ${driverId ? 'holt' : 'holst'} ${itemsText(trip.items)} am ${portName(cityId)} ab, ` +
      `im ${warehouse.name} in ca. ${clock.formatDuration(trip.arrivesAt - ctx.now)}.` +
      (left > 0
        ? ` Der Rest passt nicht ${room < space ? `in den Wagen (${vehicleName(state, vehicle)})` : 'ins Lager'} und bleibt am Kai.`
        : ''),
  );
  if (left > 0) {
    // Rest am Kai (Auftrag 33): Der Hafen meldet sich, die Zoll-Uhr läuft weiter.
    const where = room < space ? `in den Wagen (${vehicleName(state, vehicle)})` : `ins ${warehouse.name}`;
    messages.send(ctx, {
      contact: portContact(cityId),
      text: `Nicht alles passte ${where}. ${left} Einheiten stehen noch am Kai, hol sie, bevor der Zoll guckt.`,
      silent: true,
    });
    ctx.emit('cargo.leftBehind', { cityId, amount: left, reason: room < space ? 'vehicle' : 'warehouse' });
  }
  return { ok: true, data: { tripId: trip.id, arrivesAt: trip.arrivesAt, left } };
}

/** Nachtfahrt zum Hafen planen: Fahrer und Fahrzeug sind eingeteilt, die Container warten am Kai bis zur Abfahrt. */
function planPickup(
  ctx: Ctx,
  plan: {
    cargo: readonly PortCargo[];
    cityId: string;
    warehouse: Warehouse;
    driverId: string | null;
    vehicle: number | null;
    choice: RouteChoice;
    departAt: number;
  },
): CommandResult {
  const trip = startTrip(ctx, {
    kind: 'pickup',
    driverId: plan.driverId,
    fromId: portPlaceId(plan.cityId),
    toId: plan.warehouse.id,
    items: [],
    cargoIds: plan.cargo.map((c) => c.id),
    ...(plan.vehicle !== null ? { vehicleId: plan.vehicle } : {}),
    choice: plan.choice,
    startedAt: plan.departAt,
    loadedAt: plan.departAt,
    arrivesAt: plan.departAt,
  });
  journal.add(
    ctx,
    `${driverLabel(ctx.state, plan.driverId)} ${plan.driverId ? 'holt' : 'holst'} die Ware am ${portName(plan.cityId)} ` +
      `heute Nacht ab (Abfahrt ${clock.formatTime(plan.departAt)}). Bis dahin steht sie am Kai.`,
  );
  return { ok: true, data: { tripId: trip.id, departsAt: plan.departAt, left: 0 } };
}

/** Geplante Fahrt fährt los: Abholung lädt, was noch am Kai steht; Umlagern hat schon geladen. */
function departPlanned(ctx: Ctx, trip: Trip): void {
  const state = ctx.state;
  const to = getWarehouse(state, trip.toId);
  const from = placeOf(state, trip.fromId);
  const speed = speedOf(state, trip.driverId, trip.vehicleId);
  if (trip.kind === 'pickup') {
    const s = state.modules.logistics;
    const cargo = s.cargo.filter((c) => trip.cargoIds?.includes(c.id));
    trip.cargoIds = undefined;
    const space = to ? Math.max(0, warehouseFree(state, to.id) - inboundWeight(state, to.id)) : 0;
    trip.items = to ? loadFromQuay(s, cargo, Math.min(space, cityLoadCapacity(state, trip.vehicleId))) : [];
    if (trip.items.length === 0 || !to || !from) {
      removeTrip(ctx, trip);
      journal.add(ctx, `Nachtfahrt zum Hafen fällt aus: Am Kai ist nichts mehr, oder das Lager ist voll.`, 'bad');
      return;
    }
    const approach = travelMinutes(to, from, speed);
    trip.loadedAt = ctx.now + approach + loadMinutes(state, tripCity(state, trip));
    trip.arrivesAt = trip.loadedAt + travelMinutes(from, to, speed, 0, roadOptions(trip.choice));
  } else {
    const wait = trip.loadedAt - trip.startedAt;
    const drive = trip.arrivesAt - trip.loadedAt;
    trip.loadedAt = ctx.now + wait;
    trip.arrivesAt = trip.loadedAt + drive;
  }
  trip.startedAt = ctx.now;
  trip.status = 'enRoute';
  rollCheck(ctx, trip);
  ctx.emit('transport.started', {
    tripId: trip.id,
    kind: trip.kind,
    driverId: trip.driverId,
    arrivesAt: trip.arrivesAt,
  });
}

function transfer(ctx: Ctx, payload: GameCommands['logistics.transfer']): CommandResult {
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
  // Fahrzeug: das gewünschte, sonst das passende für die Ware im Lager (höchstens so viel, wie ins Ziel passt).
  const movable = Math.min(
    roomFor(state, to.id),
    lots
      .filter((l) => !payload.productId || l.productId === payload.productId)
      .reduce((sum, l) => sum + l.amount * unitWeight(l.productId), 0),
  );
  const vehicle = chooseVehicle(state, from.cityId, payload.vehicleId, movable);
  if (typeof vehicle === 'string') return { ok: false, reason: vehicle };
  // Ware raus aus dem Startlager, pro Produkt als ein Posten, so viel ins Ziel-Lager und ins Fahrzeug passt.
  let room = Math.min(roomFor(state, to.id), cityLoadCapacity(state, vehicle));
  const products = [...new Set(lots.map((l) => l.productId))];
  const items: TripItem[] = [];
  for (const productId of products) {
    const have = lots.filter((l) => l.productId === productId).reduce((sum, l) => sum + l.amount, 0);
    const asked = payload.productId && payload.amount !== undefined ? Math.min(have, Math.round(payload.amount)) : have;
    const want = Math.min(asked, Math.floor(room / unitWeight(productId)));
    if (want <= 0) continue;
    room -= want * unitWeight(productId);
    const got: TakeResult = take(ctx, { productId, amount: want, warehouseId: from.id, partial: true });
    if (got.taken > 0)
      items.push({ productId, amount: got.taken, quality: got.quality, cut: got.cut, unitCost: got.unitCost });
  }
  if (items.length === 0) {
    return {
      ok: false,
      reason: roomFor(state, to.id) <= 0 ? `Im ${to.name} ist kein Platz mehr.` : `Im ${from.name} liegt davon nichts.`,
    };
  }
  const speed = speedOf(state, driverId, vehicle);
  const choice = payload.choice ?? 'autobahn';
  // Nachts (Auftrag 33): Die Ware ist geladen, der Wagen steht bis zur Abfahrt im Hof.
  const departAt = departureFor(ctx.now, choice);
  const trip = startTrip(ctx, {
    kind: 'transfer',
    driverId,
    fromId: from.id,
    toId: to.id,
    items,
    ...(vehicle !== null ? { vehicleId: vehicle } : {}),
    ...(choice !== 'autobahn' ? { choice } : {}),
    startedAt: departAt,
    loadedAt: departAt + TRANSFER_LOAD_MINUTES,
    arrivesAt: departAt + TRANSFER_LOAD_MINUTES + travelMinutes(from, to, speed, 0, roadOptions(choice)),
  });
  const who = driverLabel(state, driverId);
  journal.add(
    ctx,
    `${who} ${driverId ? 'bringt' : 'bringst'} ${itemsText(items)} vom ${from.name} ins ${to.name}, ` +
      (departAt > ctx.now
        ? `Abfahrt heute Nacht um ${clock.formatTime(departAt)}.`
        : `Ankunft in ca. ${clock.formatDuration(trip.arrivesAt - ctx.now)}.`),
  );
  return { ok: true, data: { tripId: trip.id, arrivesAt: trip.arrivesAt } };
}

function logTrip(ctx: Ctx, trip: Trip, result: TripLogEntry['result'], amount = tripAmount(trip)): void {
  const s = ctx.state.modules.logistics;
  s.log.unshift({
    id: trip.id,
    kind: trip.kind,
    driverId: trip.driverId,
    toId: trip.toId,
    amount,
    result,
    at: ctx.now,
    ...(trip.routeId !== undefined ? { routeId: trip.routeId } : {}),
  });
  s.log = s.log.slice(0, LOG_LIMIT);
}

/**
 * Fahrt beenden: Fahrer und Fahrzeug sind frei. Angekommen steht das Fahrzeug in der Stadt des Ziels, sonst
 * (aufgeflogen, Fahrer ausgefallen, abgesagt) in der Stadt, in der die Fahrt losging.
 */
function removeTrip(ctx: Ctx, trip: Trip, arrived = false): void {
  const s = ctx.state.modules.logistics;
  s.trips = s.trips.filter((t) => t.id !== trip.id);
  if (trip.vehicleId !== undefined) {
    releaseVehicle(ctx, trip.vehicleId, arrived ? tripCity(ctx.state, trip) : originCity(ctx.state, trip));
  }
  if (trip.driverId) {
    const m = getStaffMember(ctx.state, trip.driverId);
    const onThisTrip = (a: StaffMember['assignment']) => a?.kind === 'transport' && a.targetId === String(trip.id);
    // Auch wer unterwegs verletzt wurde (returnTo), ist danach frei.
    if (m && m.leftAt === null && (onThisTrip(m.assignment) || onThisTrip(m.returnTo)))
      assign(ctx, trip.driverId, null);
  }
}

/** Ware einer Fahrt ins Lager bringen, so weit Platz ist. Gibt zurück, was nicht hineinpasste. */
function unload(ctx: Ctx, items: readonly TripItem[], warehouseId: string | undefined, retry = false): TripItem[] {
  const rest: TripItem[] = [];
  for (const item of items) {
    const result = storeFitting(
      ctx,
      {
        productId: item.productId,
        amount: item.amount,
        warehouseId,
        quality: item.quality,
        cut: item.cut,
        unitCost: item.unitCost,
      },
      { retry },
    );
    if (result.rest > 0) rest.push({ ...item, amount: result.rest });
  }
  return rest;
}

function arrive(ctx: Ctx, trip: Trip): void {
  const warehouse = getWarehouse(ctx.state, trip.toId);
  // Wurde das Ziel-Lager inzwischen aufgegeben, landet die Ware im nächsten eigenen Lager.
  const target =
    warehouse ?? nearestWarehouse(ctx.state, placeOf(ctx.state, trip.fromId) ?? portPlace(tripCity(ctx.state, trip)));
  const before = tripAmount(trip);
  // Ein erneuter Versuch einer wartenden Fahrt zählt nicht noch einmal als abgelehnt.
  const rest = unload(ctx, trip.items, target?.id, trip.status === 'waiting');
  if (rest.length > 0 && target) {
    // Lager voll (Auftrag 33): Der Rest wartet beim Fahrer, bis Platz ist oder du die Fahrt umleitest.
    const waitedBefore = trip.status === 'waiting';
    trip.unloaded = (trip.unloaded ?? 0) + before - tripAmount({ items: rest });
    trip.items = rest;
    trip.toId = target.id;
    trip.status = 'waiting';
    trip.checkAt = null;
    if (!waitedBefore) startWaiting(ctx, trip, target);
    return;
  }
  const delivered = (trip.unloaded ?? 0) + before;
  removeTrip(ctx, trip, true);
  const s = ctx.state.modules.logistics;
  s.stats.trips += 1;
  logTrip(ctx, trip, 'done', delivered);
  if (trip.driverId) addXp(ctx, trip.driverId, XP_PER_TRIP);
  if (trip.items.length > 0)
    journal.add(ctx, `${itemsText(trip.items)} im ${target?.name ?? 'Lager'} angekommen.`, 'good');
  ctx.emit('transport.arrived', {
    tripId: trip.id,
    kind: trip.kind,
    toId: target?.id ?? trip.toId,
    amount: delivered,
    ...(isInterCityTrip(ctx.state, trip) ? { interCity: true } : {}),
  });
  if (trip.kind === 'route') routeArrived(ctx, trip, target?.id ?? trip.toId);
}

/** Andere Lager der Stadt mit Platz für diese Ladung, das nächste zuerst (höchstens zwei, für die Nachricht). */
function redirectTargets(state: GameState, trip: Trip, here: Warehouse): Warehouse[] {
  const grams = trip.items.reduce((sum, i) => sum + i.amount * unitWeight(i.productId), 0);
  return getWarehouses(state, here.cityId)
    .filter((w) => w.id !== here.id && roomFor(state, w.id) >= Math.min(grams, 1))
    .sort((a, b) => travelMinutes(here, a, 300) - travelMinutes(here, b, 300))
    .slice(0, 2);
}

/** Die Fahrt steht am vollen Lager: Journal und eine Nachricht vom Fahrer mit Umleiten als Antwort. */
function startWaiting(ctx: Ctx, trip: Trip, here: Warehouse): void {
  const rest = tripAmount(trip);
  const goods = itemsText(trip.items);
  const targets = redirectTargets(ctx.state, trip, here);
  journal.add(
    ctx,
    `${here.name} ist voll: ${goods} ${trip.driverId ? 'warten beim Fahrer' : 'stehen in deinem Wagen im Hof'}, ` +
      'bis Platz ist.',
    'bad',
  );
  const driver = trip.driverId ? getStaffMember(ctx.state, trip.driverId) : undefined;
  if (driver) {
    messages.send(ctx, {
      contact: staffContact(driver),
      text:
        `Bin am ${here.name}, aber da geht nix mehr rein. Ich hab noch ${goods} im Wagen. ` +
        (targets.length > 0 ? 'Soll ich woanders hin?' : 'Ich wart, bis Platz ist.'),
      options: [
        ...targets.map((w) => ({
          id: `to-${w.id}`,
          label: `Ins ${w.name}`,
          reply: `Fahr ins ${w.name}.`,
          command: { type: 'logistics.redirect' as const, payload: { tripId: trip.id, toId: w.id } },
        })),
        { id: 'wait', label: 'Warten', reply: 'Warte, ich mach Platz.' },
      ],
      routine: true,
    });
  }
  ctx.emit('transport.waiting', { tripId: trip.id, toId: here.id, rest, driverId: trip.driverId });
}

/** Wartende Fahrt umleiten: mit dem Rest ins andere Lager fahren (Kontrolle wie bei jeder Fahrt mit Ware). */
function redirect(ctx: Ctx, payload: { tripId: number; toId: string }): CommandResult {
  const trip = ctx.state.modules.logistics.trips.find((t) => t.id === payload.tripId);
  if (trip?.status !== 'waiting') return { ok: false, reason: 'Diese Fahrt wartet nicht mehr.' };
  const here = getWarehouse(ctx.state, trip.toId);
  const to = getWarehouse(ctx.state, payload.toId);
  if (!to) return { ok: false, reason: 'Dieses Lager gehört dir nicht.' };
  if (to.id === trip.toId) return { ok: false, reason: 'Da steht die Fahrt schon.' };
  if (here && here.cityId !== to.cityId) return { ok: false, reason: 'Das Lager liegt in einer anderen Stadt.' };
  if (roomFor(ctx.state, to.id) <= 0) return { ok: false, reason: `Im ${to.name} ist auch kein Platz.` };
  const from = here ?? to;
  trip.fromId = from.id;
  trip.toId = to.id;
  trip.status = 'enRoute';
  trip.startedAt = ctx.now;
  trip.loadedAt = ctx.now;
  trip.arrivesAt =
    ctx.now + travelMinutes(from, to, speedOf(ctx.state, trip.driverId, trip.vehicleId), 0, roadOptions(trip.choice));
  rollCheck(ctx, trip);
  journal.add(
    ctx,
    `${driverLabel(ctx.state, trip.driverId)} ${trip.driverId ? 'fährt' : 'fährst'} mit ${itemsText(trip.items)} ins ${to.name}.`,
  );
  return { ok: true, data: { tripId: trip.id, arrivesAt: trip.arrivesAt } };
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
  // Das eigene Fahrzeug ist mit Chance beschlagnahmt (Auftrag 33); das Privatauto des Fahrers zählt nicht.
  if (trip.vehicleId !== undefined) maybeSeize(ctx, trip.vehicleId);
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
    if (trip.status === 'planned') {
      // Die Nachtfahrt fällt aus: Geladene Ware kommt zurück ins Lager, Container bleiben am Kai.
      for (const item of trip.items) store(ctx, { ...item, warehouseId: trip.fromId });
      removeTrip(ctx, trip);
      journal.add(ctx, 'Nachtfahrt abgesagt: Der Fahrer ist ausgefallen.', 'bad');
      continue;
    }
    if (trip.status === 'waiting') {
      // Der Wagen steht schon im Hof: Die Ware wird abgeladen, auch wenn das Lager dann übervoll ist.
      for (const item of trip.items) store(ctx, { ...item, warehouseId: trip.toId });
      removeTrip(ctx, trip);
      logTrip(ctx, trip, 'done', (trip.unloaded ?? 0) + tripAmount(trip));
      continue;
    }
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
    const chance = port.customsChancePerHour * berthEffect(ctx.state, cargo.cityId).customsFactor;
    if (ctx.now < cargoRiskFrom(cargo, ctx.state) || !ctx.chance(chance)) continue;
    s.cargo = s.cargo.filter((c) => c.id !== cargo.id);
    s.stats.seized += cargo.amount;
    recordConfiscation(ctx, cargo.amount);
    const goods = `${formatProductAmount(cargo.productId, cargo.amount)} ${productName(cargo.productId)}`;
    journal.add(ctx, `Der Zoll hat deinen Container im ${port.name} geöffnet: ${goods} beschlagnahmt.`, 'bad');
    messages.send(ctx, {
      contact: portContact(cargo.cityId),
      text: texts.pick(ctx, `port:${cargo.cityId}:seized`, portTexts(cargo.cityId).seized, { goods, quay: port.quay }),
    });
    ctx.emit('cargo.seized', { cargoId: cargo.id, productId: cargo.productId, amount: cargo.amount });
  }
}

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.logistics;
  for (const trip of [...s.trips]) {
    if (trip.status === 'planned' && trip.startedAt <= ctx.now) departPlanned(ctx, trip);
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
  // Fahrten am vollen Lager versuchen es regelmäßig wieder (Auftrag 33).
  if (ctx.now % UNLOAD_RETRY_MINUTES === 0) {
    for (const trip of [...s.trips]) if (trip.status === 'waiting') arrive(ctx, trip);
  }
  if (ctx.now % 60 === 0) customs(ctx);
  routesTick(ctx);
  if (ctx.now % MINUTES_PER_DAY === 0) settleRestock(ctx);
  retractStaleQuestions(ctx);
}

export default defineModule({
  id: 'logistics',
  version: 6,
  dependsOn: ['goods', 'suppliers', 'staff', 'fleet'],
  init: (ctx) => ({
    // Alte Spielstände: Wer schon am Hafen bestellt hat, behält seinen Zugang (Bestandsschutz).
    berths: ((ctx.state.modules.suppliers?.relations?.rotterdam?.orders ?? 0) > 0
      ? { koeln: { since: ctx.now, level: 0 } }
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
    'logistics.redirect': (ctx, payload) => redirect(ctx, payload),
    'logistics.upgradeBerth': (ctx, payload) => upgradeBerth(ctx, payload?.cityId ?? activeCity(ctx.state)),
  },
  on: {
    'encounter.resolved': (ctx, { request, outcome, result }) => {
      if (request.origin?.module === 'logistics') onCheckResolved(ctx, request.origin.ref, outcome, result?.ending);
    },
    'staff.left': (ctx, { staffId }) => driverGone(ctx, staffId),
    // Auftrag 40: Das Geschäft ist verkauft. Fahrplan-Routen und Nachkauf gehören jetzt den Statthaltern.
    'business.sold': (ctx) => {
      const s = ctx.state.modules.logistics;
      if (s.routes.length > 0) journal.add(ctx, `${s.routes.length} Fahrplan-Routen gehen mit dem Geschäft weg.`);
      s.routes = [];
      s.restock = [];
    },
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
    3: (old: LogisticsStateV2): LogisticsStateV3 => ({ ...old, routes: [], restock: [] }),
    // Version 4 (Auftrag 33): Routen fahren mit einem festen Fahrzeug oder dem passenden freien (null).
    4: (old: LogisticsStateV3): LogisticsStateV4 => ({
      ...old,
      routes: old.routes.map((r) => ({ ...r, vehicleId: null })),
    }),
    // Version 5 (Auftrag 33): Routen haben eine Wahl der Strecke, bisher immer die Autobahn.
    5: (old: LogisticsStateV4): LogisticsStateV5 => ({
      ...old,
      routes: old.routes.map((r) => ({ ...r, choice: 'autobahn' as const })),
    }),
    // Version 6 (Auftrag 33): Liegeplätze haben Stufen (Kai, Halle am Kai, Kran); bisher alle Kai.
    6: (old: LogisticsStateV5): LogisticsState => ({
      ...old,
      berths: Object.fromEntries(Object.entries(old.berths).map(([id, b]) => [id, { ...b, level: 0 }])),
    }),
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
