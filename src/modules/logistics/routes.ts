// Routen mit Fahrplan (Auftrag 30, Etappe 6): Ein Fahrer fährt zu festen Zeiten Ware von einem eigenen Lager ins
// andere, in derselben Stadt oder über die A1 in die andere Stadt. Geladen wird eine feste Menge (items) oder so viel,
// dass das Ziellager einen Zielbestand erreicht (fillTo), höchstens INTERCITY_CAPACITY Gramm je Fahrt (Gewicht pro
// Einheit aus goods). Fehlt Ware, fährt die Route mit dem, was da ist; fehlt der Fahrer oder ist gar nichts zu laden,
// fällt sie aus und steht im Protokoll (route.last). Nach der Fahrt ist der Fahrer in der Zielstadt; mit Rückfahrt
// (roundTrip) lädt er dort die Rückfracht (returnItems) und kommt zurück.
//
// Schlafende Städte (Etappe 4): Nimmt eine Route Ware aus einem Lager einer Stadt, die gerade schläft, kauft die
// Rechte Hand sie um Mitternacht gebündelt nach (restock, Kategorie 'goods.purchase', Preis wie bei ihren
// Bestellregeln: das günstigste Paket eines freien Lieferanten in der Stadt). So gibt es keine Ware umsonst.

import { type CommandResult, type Ctx, clock, type GameState, journal, wallet } from '../../core';
import { cityName, isCityLive } from '../city';
import { getVehicle, pickVehicle, vehicleSpec } from '../fleet';
import {
  getProduct,
  getStock,
  getWarehouse,
  productName,
  store,
  take,
  unitWeight,
  type Warehouse,
  warehouseCity,
} from '../goods';
import { travelMinutes } from '../roads';
import { getStaffMember, isEmployed, STATUS_NAMES } from '../staff';
import { availablePackages, getSuppliers, isBlocked, packagePrice } from '../suppliers';
import {
  INTERCITY_CAPACITY,
  NIGHT_END,
  NIGHT_START,
  ROUTE_CHOICES,
  ROUTE_LIMIT,
  ROUTE_LOAD_MINUTES,
  type RouteChoice,
} from './config';
import {
  chooseVehicle,
  getTrips,
  itemsText,
  roadOptions,
  roomFor,
  speedOf,
  startTrip,
  type Trip,
  type TripItem,
  tripAmount,
} from './index';

/** Feste Menge einer Ware pro Fahrt. */
export interface RouteItem {
  productId: string;
  amount: number;
}

/** Auffüllen: so viel laden, dass im Ziellager target Einheiten liegen (mit dem, was schon dorthin unterwegs ist). */
export interface RouteFill {
  productId: string;
  target: number;
}

/** Letzte Abfahrt, Ankunft oder Absage einer Route. */
export interface RouteRun {
  at: number;
  result: 'started' | 'done' | 'skipped' | 'seized' | 'lost';
  note: string;
}

export interface Route {
  id: number;
  name: string;
  /** Fester Fahrer (staff-ID), null = keiner eingeteilt. */
  driverId: string | null;
  /** Start- und Ziellager (eigene Lager, auch in verschiedenen Städten). */
  fromId: string;
  toId: string;
  items: RouteItem[];
  fillTo: RouteFill[];
  /** Abfahrt: Minute des Tages (0–1439). */
  departure: number;
  /** Wochentage (0 = Montag … 6 = Sonntag), leer = täglich. */
  days: number[];
  /** Mit Rückfahrt: Der Fahrer lädt im Ziellager die Rückfracht und kommt zurück. */
  roundTrip: boolean;
  returnItems: RouteItem[];
  active: boolean;
  last: RouteRun | null;
  /** Gefahrene Touren (Hinfahrten). */
  runs: number;
  /** Festes Fahrzeug (fleet), null = das passende freie oder das Privatauto (Auftrag 33). */
  vehicleId: number | null;
  /** Wahl der Strecke (Auftrag 33): Autobahn, Landstraße oder nachts (Abfahrt dann zwischen 23 und 5 Uhr). */
  choice: RouteChoice;
}

/** Was man beim Anlegen und Ändern angibt. */
export interface RouteInput {
  name?: string;
  driverId?: string | null;
  fromId: string;
  toId: string;
  items?: RouteItem[];
  fillTo?: RouteFill[];
  departure: number;
  days?: number[];
  roundTrip?: boolean;
  returnItems?: RouteItem[];
  active?: boolean;
  vehicleId?: number | null;
  choice?: RouteChoice;
}

/** Nachkauf für ein Lager einer schlafenden Stadt. */
export interface RestockDue {
  warehouseId: string;
  productId: string;
  amount: number;
  quality: number;
  /** Einkaufspreis der genommenen Ware (falls kein Lieferant sie hat). */
  unitCost: number;
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function getRoutes(state: GameState): readonly Route[] {
  return state.modules.logistics?.routes ?? [];
}

export function getRoute(state: GameState, id: number): Route | undefined {
  return getRoutes(state).find((r) => r.id === id);
}

/** Name einer Route; ohne eigenen Namen "Lager A → Lager B". */
export function routeName(state: GameState, route: Pick<Route, 'name' | 'fromId' | 'toId'>): string {
  if (route.name) return route.name;
  const from = getWarehouse(state, route.fromId)?.name ?? route.fromId;
  const to = getWarehouse(state, route.toId)?.name ?? route.toId;
  return `${from} → ${to}`;
}

/** Gewicht einer Ladung in Gramm. */
export function routeWeight(items: readonly RouteItem[]): number {
  return items.reduce((sum, i) => sum + i.amount * unitWeight(i.productId), 0);
}

/** Nächste planmäßige Abfahrt ab jetzt (Spielzeit), null wenn die Route ruht. */
export function nextDeparture(state: GameState, route: Route): number | null {
  if (!route.active) return null;
  const today = state.time - clock.minuteOfDay(state.time);
  for (let d = 0; d <= 7; d++) {
    const at = today + d * 1440 + route.departure;
    if (at <= state.time) continue;
    if (route.days.length === 0 || route.days.includes(clock.weekday(at))) return at;
  }
  return null;
}

/** Ware einer Route unterwegs ins Ziellager (Fahrten aller Art). */
function inTransitTo(state: GameState, warehouseId: string, productId: string): number {
  return getTrips(state)
    .filter((t) => t.toId === warehouseId)
    .flatMap((t) => t.items)
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + i.amount, 0);
}

/**
 * Was eine Fahrt jetzt laden würde: feste Mengen und Auffüllen, begrenzt durch den Bestand im Startlager, die Ladung
 * des Wagens und den Platz im Ziellager (Auftrag 33). wanted ist, was die Route eigentlich wollte (für "nur x von y").
 */
export function planLoad(
  state: GameState,
  fromId: string,
  toId: string,
  items: readonly RouteItem[],
  fillTo: readonly RouteFill[] = [],
  capacity = INTERCITY_CAPACITY,
): { load: RouteItem[]; wanted: number; missing: string[] } {
  const want = new Map<string, number>();
  for (const i of items) want.set(i.productId, (want.get(i.productId) ?? 0) + i.amount);
  for (const f of fillTo) {
    const deficit = f.target - getStock(state, { warehouseId: toId, productId: f.productId });
    const open = deficit - inTransitTo(state, toId, f.productId);
    if (open > 0) want.set(f.productId, (want.get(f.productId) ?? 0) + open);
  }
  const load: RouteItem[] = [];
  const missing: string[] = [];
  const limit = Math.min(capacity, roomFor(state, toId));
  let weight = 0;
  let wanted = 0;
  for (const [productId, amount] of want) {
    wanted += amount;
    const have = getStock(state, { warehouseId: fromId, productId });
    const per = unitWeight(productId);
    const room = Math.floor((limit - weight) / per);
    const take = Math.max(0, Math.min(amount, have, room));
    if (have < amount) missing.push(productName(productId));
    if (take <= 0) continue;
    load.push({ productId, amount: take });
    weight += take * per;
  }
  return { load, wanted, missing };
}

/** Vorschau für die Oberfläche: was die Route jetzt laden würde. */
export function routeLoadPreview(state: GameState, route: Route): RouteItem[] {
  return planLoad(state, route.fromId, route.toId, route.items, route.fillTo, routeCapacity(state, route)).load;
}

/** Ladung eines Fahrzeugs auf einer Route: Modell, das Privatauto mit INTERCITY_CAPACITY (wie bisher). */
function routeVehicleCapacity(state: GameState, vehicleId: number | null): number {
  return vehicleId === null ? INTERCITY_CAPACITY : vehicleSpec(state, vehicleId).capacity;
}

/** Ladung einer Route in Gramm: festes Fahrzeug, sonst so viel wie das Privatauto (oder ein größeres freies). */
export function routeCapacity(state: GameState, route: Pick<Route, 'vehicleId'>): number {
  return route.vehicleId !== null && getVehicle(state, route.vehicleId)
    ? vehicleSpec(state, route.vehicleId).capacity
    : INTERCITY_CAPACITY;
}

/**
 * Wo ein Fahrer gerade ist (für die Seite "Fahrer"): Stadt, ob er fährt, und seine nächste Route.
 */
export function driverWhereabouts(
  state: GameState,
  staffId: string,
): { cityId: string; trip: Trip | null; next: { route: Route; at: number } | null } {
  const m = getStaffMember(state, staffId);
  const trip = getTrips(state).find((t) => t.driverId === staffId) ?? null;
  let next: { route: Route; at: number } | null = null;
  for (const route of getRoutes(state)) {
    if (route.driverId !== staffId) continue;
    const at = nextDeparture(state, route);
    if (at !== null && (!next || at < next.at)) next = { route, at };
  }
  return { cityId: m?.cityId ?? 'koeln', trip, next };
}

// ---------------------------------------------------------------------------------------------
// Anlegen, ändern, löschen

function checkItems(items: readonly RouteItem[], label: string, capacity: number): string | null {
  const seen = new Set<string>();
  for (const i of items) {
    if (!getProduct(i.productId)) return 'Unbekannte Ware.';
    if (seen.has(i.productId)) return 'Jede Ware nur einmal.';
    seen.add(i.productId);
    if (!Number.isInteger(i.amount) || i.amount <= 0) return 'Ungültige Menge.';
  }
  if (routeWeight(items) > capacity) {
    return `${label}: zu viel für das Fahrzeug (höchstens ${capacity / 1000} kg).`;
  }
  return null;
}

/** Prüft eine Route und bringt sie in Form; Text = Grund, warum nicht. */
function normalize(state: GameState, id: number, input: RouteInput, base: Route | null): Route | string {
  const from = getWarehouse(state, input.fromId);
  const to = getWarehouse(state, input.toId);
  if (!from || !to) return 'Start und Ziel müssen deine Lager sein.';
  if (from.id === to.id) return 'Start und Ziel sind dasselbe Lager.';
  const driverId = input.driverId ?? null;
  if (driverId) {
    const m = getStaffMember(state, driverId);
    if (!m || !isEmployed(state, driverId)) return 'Diesen Fahrer gibt es nicht.';
    if (m.role !== 'driver') return `${m.name} ist kein Fahrer.`;
  }
  const items = (input.items ?? []).map((i) => ({ productId: i.productId, amount: i.amount }));
  const fillTo = (input.fillTo ?? []).map((f) => ({ productId: f.productId, target: f.target }));
  const returnItems = input.roundTrip
    ? (input.returnItems ?? []).map((i) => ({ productId: i.productId, amount: i.amount }))
    : [];
  const vehicleId = input.vehicleId ?? null;
  if (vehicleId !== null && !getVehicle(state, vehicleId)) return 'Dieses Fahrzeug gibt es nicht.';
  // Das feste Fahrzeug muss in der Startstadt stehen (unterwegs auf dieser Route darf es woanders sein).
  const fixed = vehicleId !== null ? getVehicle(state, vehicleId) : undefined;
  if (fixed && fixed.tripId === null && fixed.cityId !== from.cityId) {
    return `Das Fahrzeug steht nicht in ${cityName(from.cityId)}.`;
  }
  const capacity = vehicleId !== null ? vehicleSpec(state, vehicleId).capacity : INTERCITY_CAPACITY;
  const bad = checkItems(items, 'Ladung', capacity) ?? checkItems(returnItems, 'Rückfracht', capacity);
  if (bad) return bad;
  for (const f of fillTo) {
    if (!getProduct(f.productId)) return 'Unbekannte Ware.';
    if (!Number.isInteger(f.target) || f.target <= 0 || f.target > 100_000) return 'Ungültiger Zielbestand.';
    if (items.some((i) => i.productId === f.productId)) return 'Eine Ware entweder fest oder zum Auffüllen.';
  }
  if (new Set(fillTo.map((f) => f.productId)).size !== fillTo.length) return 'Jede Ware nur einmal.';
  if (items.length === 0 && fillTo.length === 0 && returnItems.length === 0) return 'Was soll die Route fahren?';
  if (!Number.isInteger(input.departure) || input.departure < 0 || input.departure >= 1440) {
    return 'Ungültige Abfahrtszeit.';
  }
  const choice: RouteChoice = input.choice && ROUTE_CHOICES[input.choice] ? input.choice : 'autobahn';
  // Nachts fährt die Route zwischen 23 und 5 Uhr; eine Abfahrt am Tag rückt auf 23 Uhr.
  const departure =
    ROUTE_CHOICES[choice].night && input.departure < NIGHT_START && input.departure >= NIGHT_END
      ? NIGHT_START
      : input.departure;
  const days = [...new Set(input.days ?? [])].sort((a, b) => a - b);
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Ungültiger Wochentag.';
  const name = (input.name ?? '').trim().slice(0, 40);
  return {
    id,
    name,
    driverId,
    fromId: from.id,
    toId: to.id,
    items,
    fillTo,
    departure,
    days: days.length === 7 ? [] : days,
    roundTrip: !!input.roundTrip,
    returnItems,
    active: input.active ?? true,
    last: base?.last ?? null,
    runs: base?.runs ?? 0,
    vehicleId,
    choice,
  };
}

/** Route anlegen (id null) oder ändern (nur die angegebenen Felder). */
export function saveRoute(ctx: Ctx, id: number | null, input: Partial<RouteInput>): CommandResult {
  const s = ctx.state.modules.logistics;
  const base = id === null ? null : (s.routes.find((r) => r.id === id) ?? null);
  if (id !== null && !base) return { ok: false, reason: 'Diese Route gibt es nicht.' };
  if (!base && s.routes.length >= ROUTE_LIMIT) return { ok: false, reason: `Höchstens ${ROUTE_LIMIT} Routen.` };
  const merged = { ...(base ?? {}), ...input } as RouteInput;
  if (merged.fromId === undefined || merged.toId === undefined || merged.departure === undefined) {
    return { ok: false, reason: 'Start, Ziel und Abfahrt fehlen.' };
  }
  const route = normalize(ctx.state, base?.id ?? ctx.nextId(), merged, base);
  if (typeof route === 'string') return { ok: false, reason: route };
  if (base) Object.assign(base, route);
  else {
    s.routes.push(route);
    journal.add(
      ctx,
      `Neue Route: ${routeName(ctx.state, route)}, ${route.days.length ? 'an festen Tagen' : 'täglich'} um ` +
        `${clock.formatTime(route.departure)}.`,
    );
  }
  return { ok: true, data: { routeId: route.id } };
}

export function removeRoute(ctx: Ctx, id: number): CommandResult {
  const s = ctx.state.modules.logistics;
  const route = s.routes.find((r) => r.id === id);
  if (!route) return { ok: false, reason: 'Diese Route gibt es nicht.' };
  // Eine laufende Fahrt fährt zu Ende, nur ohne Rückfahrt.
  s.routes = s.routes.filter((r) => r.id !== id);
  journal.add(ctx, `Route ${routeName(ctx.state, route)} gestrichen.`);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Fahren

function skip(ctx: Ctx, route: Route, reason: string, why: 'schedule' | 'now'): CommandResult {
  route.last = { at: ctx.now, result: 'skipped', note: reason };
  if (why === 'schedule') {
    journal.add(ctx, `Route ${routeName(ctx.state, route)} fällt aus: ${reason}`, 'bad');
    ctx.emit('route.skipped', { routeId: route.id, reason });
  }
  return { ok: false, reason };
}

/** Grund, warum der Fahrer der Route nicht fahren kann (null = kann). */
function driverProblem(state: GameState, route: Route, from: Warehouse): string | null {
  if (!route.driverId) return 'Kein Fahrer eingeteilt.';
  const m = getStaffMember(state, route.driverId);
  if (!m || !isEmployed(state, route.driverId)) return 'Der Fahrer arbeitet nicht mehr für dich.';
  if (m.status !== 'active') return `${m.name} ist ${STATUS_NAMES[m.status]}.`;
  if (m.assignment) return `${m.name} ist gerade woanders im Einsatz.`;
  const fromCity = warehouseCity(from.id);
  if (m.cityId !== fromCity) return `${m.name} ist in ${cityName(m.cityId)}, nicht in ${cityName(fromCity)}.`;
  return null;
}

/** Ware für eine Fahrt aus dem Lager nehmen; in einer schlafenden Stadt merkt sich die Rechte Hand den Nachkauf. */
function loadGoods(ctx: Ctx, warehouseId: string, load: readonly RouteItem[]): TripItem[] {
  const items: TripItem[] = [];
  const sleeping = !isCityLive(ctx.state, warehouseCity(warehouseId));
  for (const { productId, amount } of load) {
    const got = take(ctx, { productId, amount, warehouseId, partial: true });
    if (got.taken <= 0) continue;
    items.push({ productId, amount: got.taken, quality: got.quality, cut: got.cut, unitCost: got.unitCost });
    if (sleeping) owe(ctx, { warehouseId, productId, amount: got.taken, quality: got.quality, unitCost: got.unitCost });
  }
  return items;
}

function owe(ctx: Ctx, due: RestockDue): void {
  const list = ctx.state.modules.logistics.restock;
  const same = list.find((d) => d.warehouseId === due.warehouseId && d.productId === due.productId);
  if (!same) {
    list.push(due);
    return;
  }
  const total = same.amount + due.amount;
  same.quality = (same.quality * same.amount + due.quality * due.amount) / total;
  same.unitCost = (same.unitCost * same.amount + due.unitCost * due.amount) / total;
  same.amount = total;
}

/** Route jetzt fahren (Fahrplan oder 'logistics.runRouteNow'). */
export function departRoute(ctx: Ctx, routeId: number, why: 'schedule' | 'now'): CommandResult {
  const state = ctx.state;
  const route = state.modules.logistics.routes.find((r) => r.id === routeId);
  if (!route) return { ok: false, reason: 'Diese Route gibt es nicht.' };
  if (getTrips(state).some((t) => t.routeId === route.id)) return skip(ctx, route, 'Die letzte Tour läuft noch.', why);
  const from = getWarehouse(state, route.fromId);
  const to = getWarehouse(state, route.toId);
  if (!from || !to) return skip(ctx, route, 'Eins der Lager gehört dir nicht mehr.', why);
  const problem = driverProblem(state, route, from);
  if (problem) return skip(ctx, route, problem, why);
  // Fahrzeug (Auftrag 33): das feste, sonst das passende freie für das, was die Route laden würde.
  const fromCity = warehouseCity(from.id);
  let vehicle: number | null | string = null;
  if (route.vehicleId !== null) {
    vehicle = getVehicle(state, route.vehicleId) ? chooseVehicle(state, fromCity, route.vehicleId, 0) : null;
    if (typeof vehicle === 'string') return skip(ctx, route, vehicle, why);
  } else {
    // Ohne festes Fahrzeug: das größte freie (oder das Privatauto mit INTERCITY_CAPACITY) bestimmt, was geladen werden
    // könnte, dann das kleinste, in das das passt.
    const biggest = pickVehicle(state, fromCity, Number.POSITIVE_INFINITY, INTERCITY_CAPACITY);
    const most = planLoad(state, from.id, to.id, route.items, route.fillTo, routeVehicleCapacity(state, biggest));
    vehicle = pickVehicle(state, fromCity, routeWeight(most.load), INTERCITY_CAPACITY);
  }
  const plan = planLoad(state, from.id, to.id, route.items, route.fillTo, routeVehicleCapacity(state, vehicle));
  const needsTour = route.roundTrip && route.returnItems.length > 0;
  if (plan.load.length === 0 && !needsTour) {
    const reason =
      plan.wanted === 0
        ? `Im ${to.name} liegt genug.`
        : plan.missing.length === 0
          ? `Im ${to.name} ist kein Platz.`
          : `Im ${from.name} fehlt die Ware (${plan.missing.join(', ')}).`;
    return skip(ctx, route, reason, why);
  }
  const driverId = route.driverId as string;
  const items = loadGoods(ctx, from.id, plan.load);
  const loadedAt = ctx.now + ROUTE_LOAD_MINUTES;
  const trip = startTrip(ctx, {
    kind: 'route',
    driverId,
    fromId: from.id,
    toId: to.id,
    items,
    ...(vehicle !== null ? { vehicleId: vehicle } : {}),
    ...(route.choice !== 'autobahn' ? { choice: route.choice } : {}),
    startedAt: ctx.now,
    loadedAt,
    arrivesAt: loadedAt + travelMinutes(from, to, speedOf(state, driverId, vehicle), 0, roadOptions(route.choice)),
    routeId: route.id,
    leg: 'out',
  });
  const loaded = tripAmount(trip);
  const partial = plan.missing.length > 0 && loaded < plan.wanted;
  const note =
    items.length === 0 ? 'leer hin, Rückfracht holen' : itemsText(items) + (partial ? ' (nicht alles da)' : '');
  route.last = { at: ctx.now, result: 'started', note };
  route.runs += 1;
  const interCity = warehouseCity(from.id) !== warehouseCity(to.id);
  const driver = getStaffMember(state, driverId)?.name ?? 'Der Fahrer';
  journal.add(
    ctx,
    `Route ${routeName(state, route)}: ${driver} fährt mit ${items.length ? itemsText(items) : 'leerem Wagen'} los, ` +
      `Ankunft in ca. ${clock.formatDuration(trip.arrivesAt - ctx.now)}.` +
      (partial ? ` Im ${from.name} fehlte etwas.` : ''),
    partial ? 'bad' : 'info',
  );
  ctx.emit('route.departed', { routeId: route.id, tripId: trip.id, amount: loaded, interCity });
  return { ok: true, data: { tripId: trip.id, arrivesAt: trip.arrivesAt } };
}

/**
 * Fahrt einer Route ist angekommen (logistics.arrive): bei Bedarf die Rückfahrt. Leute bleiben in ihrer Stadt (Feedback
 * vom 05.10.2026): Wer eine Route in eine andere Stadt fährt, kommt immer zurück, ohne Rückfracht mit leerem Wagen.
 */
export function routeArrived(ctx: Ctx, trip: Trip, warehouseId: string): void {
  const state = ctx.state;
  const cityId = warehouseCity(warehouseId);
  const route = state.modules.logistics.routes.find((r) => r.id === trip.routeId);
  if (!route) return;
  const driver = trip.driverId ? getStaffMember(state, trip.driverId) : undefined;
  const away = driver !== undefined && driver.cityId !== cityId;
  if (trip.leg === 'back' || (!route.roundTrip && !away)) {
    route.last = {
      at: ctx.now,
      result: 'done',
      note: trip.leg === 'back' ? `zurück im ${getWarehouse(state, warehouseId)?.name ?? 'Lager'}` : 'angekommen',
    };
    return;
  }
  // Rückfahrt: Rückfracht im Ziellager laden, zurück ins Startlager (oder leer zurück, wenn nichts da ist).
  const home = getWarehouse(state, route.fromId);
  if (!home || !driver || driver.status !== 'active' || driver.assignment) {
    route.last = { at: ctx.now, result: 'done', note: 'angekommen, keine Rückfahrt' };
    return;
  }
  // Dasselbe Fahrzeug fährt zurück, wenn es noch da ist (es steht jetzt in der Zielstadt).
  const vehicle = trip.vehicleId !== undefined ? chooseVehicle(state, cityId, trip.vehicleId, 0) : null;
  const vehicleId = typeof vehicle === 'number' ? vehicle : null;
  const returnItems = route.roundTrip ? route.returnItems : [];
  const plan = planLoad(state, warehouseId, home.id, returnItems, [], routeVehicleCapacity(state, vehicleId));
  const items = loadGoods(ctx, warehouseId, plan.load);
  const loadedAt = ctx.now + (items.length > 0 ? ROUTE_LOAD_MINUTES : 0);
  const back = startTrip(ctx, {
    kind: 'route',
    driverId: driver.id,
    fromId: warehouseId,
    toId: home.id,
    items,
    ...(vehicleId !== null ? { vehicleId } : {}),
    ...(route.choice !== 'autobahn' ? { choice: route.choice } : {}),
    startedAt: ctx.now,
    loadedAt,
    arrivesAt:
      loadedAt +
      travelMinutes(
        getWarehouse(state, warehouseId) ?? home,
        home,
        speedOf(state, driver.id, vehicleId),
        0,
        roadOptions(route.choice),
      ),
    routeId: route.id,
    leg: 'back',
  });
  route.last = {
    at: ctx.now,
    result: 'started',
    note: items.length ? `Rückfahrt mit ${itemsText(items)}` : 'Rückfahrt ohne Ladung',
  };
  journal.add(
    ctx,
    `${driver.name} fährt zurück${items.length ? ` mit ${itemsText(items)}` : ''}, ` +
      `Ankunft in ca. ${clock.formatDuration(back.arrivesAt - ctx.now)}.`,
  );
}

/** Fahrt einer Route ist verloren (Zoll, Fahrer ausgefallen). */
export function routeLost(ctx: Ctx, trip: Trip, result: 'seized' | 'lost'): void {
  const route = ctx.state.modules.logistics.routes.find((r) => r.id === trip.routeId);
  if (!route) return;
  route.last = {
    at: ctx.now,
    result,
    note: result === 'seized' ? `${itemsText(trip.items)} beschlagnahmt` : 'Fahrer ausgefallen',
  };
}

/** Jede Spielminute: Routen, deren Abfahrt jetzt ist, fahren los. */
export function routesTick(ctx: Ctx): void {
  const routes = ctx.state.modules.logistics.routes;
  if (routes.length === 0) return;
  const minute = clock.minuteOfDay(ctx.now);
  let weekday = -1;
  for (const route of [...routes]) {
    if (!route.active || route.departure !== minute) continue;
    if (route.days.length > 0) {
      if (weekday < 0) weekday = clock.weekday(ctx.now);
      if (!route.days.includes(weekday)) continue;
    }
    departRoute(ctx, route.id, 'schedule');
  }
}

/** Preis pro Einheit beim Nachkauf: das günstigste Paket eines freien Lieferanten in der Stadt (wie die Rechte Hand). */
function restockUnitPrice(state: GameState, productId: string, cityId: string): number | null {
  let best: number | null = null;
  for (const supplier of getSuppliers(state, cityId)) {
    if (isBlocked(state, supplier.id)) continue;
    for (const pkg of availablePackages(state, supplier.id, cityId)) {
      if (pkg.productId !== productId || pkg.amount <= 0) continue;
      const unit = packagePrice(state, supplier.id, pkg.id, cityId) / pkg.amount;
      if (Number.isFinite(unit) && (best === null || unit < best)) best = unit;
    }
  }
  return best;
}

/**
 * Um Mitternacht: Die Rechte Hand kauft nach, was Routen aus Lagern schlafender Städte genommen haben (gebündelt pro
 * Lager und Ware). Reicht das Schwarzgeld nicht, bleibt der Rest für die nächste Nacht.
 */
export function settleRestock(ctx: Ctx): void {
  const s = ctx.state.modules.logistics;
  if (s.restock.length === 0) return;
  const open: RestockDue[] = [];
  for (const due of s.restock) {
    const warehouse = getWarehouse(ctx.state, due.warehouseId);
    if (!warehouse) continue;
    const cityId = warehouseCity(warehouse.id);
    const unit = restockUnitPrice(ctx.state, due.productId, cityId) ?? due.unitCost;
    const cost = Math.round(unit * due.amount);
    const reason = `Nachkauf ${productName(due.productId)} für ${warehouse.name} (Rechte Hand ${cityName(cityId)})`;
    if (cost > 0 && !wallet.pay(ctx, cost, 'dirty', reason, { category: 'goods.purchase', cityId })) {
      open.push(due);
      continue;
    }
    store(ctx, {
      productId: due.productId,
      amount: due.amount,
      warehouseId: warehouse.id,
      quality: due.quality,
      cut: 0,
      unitCost: unit,
    });
    journal.add(ctx, `${reason}: ${itemsText([due])}.`, 'info');
  }
  if (open.length > 0) {
    journal.add(ctx, `Für den Nachkauf in den Lagern fehlt Schwarzgeld (${itemsText(open)}).`, 'bad');
  }
  s.restock = open;
}
