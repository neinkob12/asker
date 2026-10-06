// Routen mit Fahrplan (Auftrag 30, Etappe 6): Seite "Routen" (jede Route als Gruppe mit Chips: Fahrer, Abfahrt,
// Ladung, Richtung, nächster Start, letzte Fahrt; Schalter aktiv; Ändern und Jetzt fahren), Blatt zum Anlegen und Ändern
// (Select, Stepper, Wochentag-Chips) und Seite "Fahrer" (wo jeder Fahrer ist, was er fährt, nächste Route).

import { useEffect, useState } from 'preact/hooks';
import { clock, type GameState, WEEKDAYS_SHORT } from '../../../core';
import {
  Button,
  type CategoryColor,
  type ChipSpec,
  Empty,
  Group,
  Hint,
  ItemContent,
  List,
  ListItem,
  registerPanel,
  SegmentedControl,
  Select,
  Sheet,
  Stepper,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityName } from '../../city';
import { getVehicles, VEHICLE_MODELS, vehicleName } from '../../fleet';
import {
  allProducts,
  formatProductAmount,
  getProduct,
  getWarehouse,
  getWarehouses,
  productName,
  unitWeight,
  warehouseCity,
  warehouseFree,
} from '../../goods';
import { getStaff, getStaffMember, STATUS_NAMES } from '../../staff';
import {
  driverWhereabouts,
  getRoute,
  getRoutes,
  INTERCITY_CAPACITY,
  nextDeparture,
  placeOf,
  ROUTE_CHOICES,
  type Route,
  type RouteChoice,
  type RouteInput,
  type RouteItem,
  type RouteRun,
  routeName,
} from '../index';
import { AUTO, ChoiceControl, VehicleSelect } from './vehicles';

const NONE = '';
/** Größte Ladung einer Fahrt (Privatauto oder größtes Fahrzeug zum Kaufen). */
const MAX_LOAD = Math.max(
  INTERCITY_CAPACITY,
  ...VEHICLE_MODELS.filter((m) => m.available && !m.harborOnly).map((m) => m.capacity),
);

/** Gewicht als Text: "2,5 kg" oder "800 g". */
function weightText(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg` : `${grams} g`;
}

/** Wochentage als Text: "täglich", "Mo bis Fr", "Mo, Mi, Fr". */
function daysText(days: readonly number[]): string {
  if (days.length === 0 || days.length === 7) return 'täglich';
  if (days.length === 5 && days.every((d, i) => d === i)) return 'Mo bis Fr';
  return days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
}

/** Zeitpunkt kurz: heute nur die Uhrzeit, sonst mit Wochentag. */
function whenText(now: number, at: number): string {
  return clock.day(at) === clock.day(now)
    ? clock.formatTime(at)
    : `${clock.weekdayName(at, true)} ${clock.formatTime(at)}`;
}

const RUN_TEXT: Record<RouteRun['result'], { label: string; color: CategoryColor }> = {
  started: { label: 'unterwegs', color: 'goods' },
  done: { label: 'angekommen', color: 'money' },
  skipped: { label: 'ausgefallen', color: 'warn' },
  seized: { label: 'Zoll', color: 'danger' },
  lost: { label: 'verloren', color: 'danger' },
};

/** Kurzer Name für Kopfzeilen und Chips: eigener Name, sonst "Köln → Hamburg" bzw. "Nach Lager Kalk". */
function shortName(state: GameState, route: Route): string {
  if (route.name) return route.name;
  const from = warehouseCity(route.fromId);
  const to = warehouseCity(route.toId);
  if (from !== to) return `${cityName(from)} → ${cityName(to)}`;
  const target = getWarehouse(state, route.toId)?.name;
  return target ? `Nach ${target}` : `Route in ${cityName(from)}`;
}

function loadText(route: Route): string {
  const parts = [
    ...route.items.map((i) => `${formatProductAmount(i.productId, i.amount)} ${productName(i.productId)}`),
    ...route.fillTo.map((f) => `${productName(f.productId)} bis ${formatProductAmount(f.productId, f.target)}`),
  ];
  return parts.length === 0 ? 'leer hin' : parts.length <= 2 ? parts.join(', ') : `${parts.length} Waren`;
}

/** Weniger frei als das: Das Ziellager gilt als voll. */
const TARGET_FULL_GRAMS = 50;

function RouteGroup(props: { route: Route; onEdit: () => void }) {
  const { state, dispatch } = useGame();
  const { route } = props;
  const driver = route.driverId ? getStaffMember(state, route.driverId) : undefined;
  const fromCity = warehouseCity(route.fromId);
  const toCity = warehouseCity(route.toId);
  const next = nextDeparture(state, route);
  const running = state.modules.logistics.trips.some((t) => t.routeId === route.id);
  const last = route.last && !(running && route.last.result === 'started') ? RUN_TEXT[route.last.result] : null;
  const chips: ChipSpec[] = [
    { label: driver?.name ?? 'kein Fahrer', icon: 'user', color: driver ? 'people' : 'warn' },
    { label: `${daysText(route.days)} ${clock.formatTime(route.departure)}`, icon: 'clock', color: 'system' },
    { label: loadText(route), icon: 'package', color: 'goods' },
  ];
  if (route.choice !== 'autobahn')
    chips.push({ label: ROUTE_CHOICES[route.choice].name, icon: 'moon', color: 'place' });
  if (route.vehicleId !== null)
    chips.push({ label: vehicleName(state, route.vehicleId), icon: 'truck', color: 'goods' });
  if (fromCity !== toCity) chips.push({ label: 'über die A1', icon: 'route', color: 'place' });
  if (route.roundTrip) chips.push({ label: 'mit Rückfahrt', icon: 'refresh', color: 'goods' });
  if (last) chips.push({ label: last.label, color: last.color, icon: 'clock' });
  // Ziellager voll: Die Route fährt leer hin (Auftrag 43, M6).
  if (warehouseFree(state, route.toId) < TARGET_FULL_GRAMS)
    chips.push({ label: 'Ziellager voll', icon: 'warehouse', color: 'warn' });
  return (
    <Group
      icon="route"
      color="goods"
      title={shortName(state, route)}
      value={running ? 'unterwegs' : next !== null ? `nächste ${whenText(state.time, next)}` : 'ruht'}
    >
      <List>
        <ListItem>
          <ItemContent
            icon="truck"
            color="goods"
            title={routeName(state, route)}
            meta={
              route.last ? `Zuletzt ${whenText(state.time, route.last.at)}: ${route.last.note}` : 'Noch nie gefahren'
            }
            tags={chips}
          />
        </ListItem>
      </List>
      <Toggle
        label="Fährt nach Plan"
        checked={route.active}
        onChange={(active) => dispatch({ type: 'logistics.updateRoute', payload: { routeId: route.id, active } })}
      />
      <div class="logi-route__actions">
        <Button small icon="edit" onClick={props.onEdit}>
          Ändern
        </Button>
        <Button
          small
          icon="play"
          disabled={running}
          onClick={() => dispatch({ type: 'logistics.runRouteNow', payload: { routeId: route.id } })}
        >
          Jetzt fahren
        </Button>
      </div>
    </Group>
  );
}

/** Eine Zeile Ladung im Blatt: Ware wählen, Menge per Stepper, entfernen. */
function ItemLine(props: {
  item: { productId: string; amount: number };
  label: string;
  onChange: (item: { productId: string; amount: number }) => void;
  onRemove: () => void;
}) {
  const product = getProduct(props.item.productId);
  const step = product?.unit === 'g' || product?.unit === 'ml' ? 100 : 10;
  return (
    <ListItem
      aside={
        <Stepper
          label={`${props.label} ${productName(props.item.productId)}`}
          value={props.item.amount}
          min={step}
          max={MAX_LOAD}
          step={step}
          format={(v) => formatProductAmount(props.item.productId, v)}
          onChange={(amount) => props.onChange({ ...props.item, amount })}
        />
      }
    >
      <div class="logi-route__line">
        <Select
          label={props.label}
          value={props.item.productId}
          options={allProducts().map((p) => ({ value: p.id, label: p.name }))}
          onChange={(productId) => props.onChange({ ...props.item, productId })}
        />
        <Button small variant="subtle" icon="close" aria-label="Ware entfernen" onClick={props.onRemove} />
      </div>
    </ListItem>
  );
}

function ItemLines(props: {
  title: string;
  items: { productId: string; amount: number }[];
  onChange: (items: { productId: string; amount: number }[]) => void;
  note?: string;
}) {
  const used = new Set(props.items.map((i) => i.productId));
  const free = allProducts().find((p) => !used.has(p.id));
  const weight = props.items.reduce((sum, i) => sum + i.amount * unitWeight(i.productId), 0);
  return (
    <Group
      title={props.title}
      icon="package"
      color={weight > INTERCITY_CAPACITY ? 'danger' : 'goods'}
      value={`${weightText(weight)} von ${weightText(INTERCITY_CAPACITY)}`}
      note={props.note}
    >
      <List>
        {props.items.map((item, i) => (
          <ItemLine
            key={`${item.productId}-${i}`}
            item={item}
            label={props.title}
            onChange={(next) => props.onChange(props.items.map((old, j) => (j === i ? next : old)))}
            onRemove={() => props.onChange(props.items.filter((_, j) => j !== i))}
          />
        ))}
      </List>
      {free && (
        <Button
          small
          icon="plus"
          onClick={() => props.onChange([...props.items, { productId: free.id, amount: free.unit === 'g' ? 500 : 50 }])}
        >
          Ware dazu
        </Button>
      )}
    </Group>
  );
}

interface Draft {
  driverId: string;
  fromId: string;
  toId: string;
  mode: 'fixed' | 'fill';
  items: RouteItem[];
  departure: number;
  days: number[];
  roundTrip: boolean;
  returnItems: RouteItem[];
  /** Festes Fahrzeug als Text (leer = passendes). */
  vehicle: string;
  choice: RouteChoice;
}

function draftOf(route: Route | null, warehouses: readonly { id: string }[], cityId: string): Draft {
  if (route) {
    const fill = route.fillTo.length > 0;
    return {
      driverId: route.driverId ?? NONE,
      fromId: route.fromId,
      toId: route.toId,
      mode: fill ? 'fill' : 'fixed',
      items: fill
        ? route.fillTo.map((f) => ({ productId: f.productId, amount: f.target }))
        : route.items.map((i) => ({ ...i })),
      departure: route.departure,
      days: [...route.days],
      roundTrip: route.roundTrip,
      returnItems: route.returnItems.map((i) => ({ ...i })),
      vehicle: route.vehicleId === null ? AUTO : String(route.vehicleId),
      choice: route.choice,
    };
  }
  const home = warehouses.filter((w) => warehouseCity(w.id) === cityId);
  const fromId = home[0]?.id ?? '';
  const toId = (home[1] ?? warehouses.find((w) => w.id !== fromId) ?? home[0])?.id ?? '';
  return {
    driverId: NONE,
    fromId,
    toId,
    mode: 'fixed',
    items: [{ productId: 'weed', amount: 1000 }],
    departure: 6 * 60,
    days: [],
    roundTrip: false,
    returnItems: [],
    vehicle: AUTO,
    choice: 'autobahn',
  };
}

/** Blatt: Route anlegen oder ändern. */
function RouteSheet(props: { open: boolean; routeId: number | null; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const warehouses = getWarehouses(state);
  const route = props.routeId !== null ? (getRoute(state, props.routeId) ?? null) : null;
  const [draft, setDraft] = useState<Draft>(() => draftOf(route, warehouses, activeCity(state)));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (props.open) {
      setDraft(draftOf(route, getWarehouses(state), activeCity(state)));
      setError(null);
    }
  }, [props.open, props.routeId]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: `${cityName(warehouseCity(w.id))}: ${w.name}`,
  }));
  // Los geht es nur in der Stadt, in der du bist; das Ziel darf in jeder Stadt liegen (Auftrag 43).
  const city = activeCity(state);
  const fromOptions = warehouseOptions.filter((o) => warehouseCity(o.value) === city || o.value === draft.fromId);
  // Fahrer aus der Stadt des Startlagers (Leute bleiben in ihrer Stadt, Auftrag 43).
  const drivers = getStaff(state, {
    role: 'driver',
    cityId: draft.fromId ? warehouseCity(draft.fromId) : activeCity(state),
  });
  const driverOptions = [
    { value: NONE, label: 'Kein Fahrer' },
    ...drivers.map((m) => ({
      value: m.id,
      label: `${m.name} (${cityName(m.cityId)}${m.status === 'active' ? '' : `, ${STATUS_NAMES[m.status]}`})`,
    })),
  ];
  const fromCity = warehouseCity(draft.fromId);
  const toCity = warehouseCity(draft.toId);
  const driver = draft.driverId ? getStaffMember(state, draft.driverId) : undefined;

  const save = () => {
    const input: RouteInput = {
      driverId: draft.driverId || null,
      fromId: draft.fromId,
      toId: draft.toId,
      items: draft.mode === 'fixed' ? draft.items : [],
      fillTo: draft.mode === 'fill' ? draft.items.map((i) => ({ productId: i.productId, target: i.amount })) : [],
      departure: draft.departure,
      days: draft.days,
      roundTrip: draft.roundTrip,
      returnItems: draft.roundTrip ? draft.returnItems : [],
      vehicleId: draft.vehicle === AUTO ? null : Number(draft.vehicle),
      choice: draft.choice,
    };
    const result = route
      ? dispatch({ type: 'logistics.updateRoute', payload: { routeId: route.id, ...input } })
      : dispatch({ type: 'logistics.addRoute', payload: input });
    if (result.ok) props.onClose();
    else setError(result.reason);
  };

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={route ? 'Route ändern' : 'Neue Route'}
      detents={['large']}
      action={
        <Button small variant="primary" onClick={save}>
          Sichern
        </Button>
      }
    >
      <div class="logi-route-sheet">
        {error && <Hint icon="alert">{error}</Hint>}
        <Group
          title="Strecke"
          icon="route"
          color="place"
          value={fromCity === toCity ? cityName(fromCity) : 'über die A1'}
        >
          <List>
            <ListItem>
              <ItemContent icon="warehouse" color="goods" title="Von">
                <Select
                  wide
                  label="Startlager"
                  value={draft.fromId}
                  options={fromOptions}
                  onChange={(fromId) => set({ fromId })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent
                icon="warehouse"
                color="goods"
                title="Nach"
                meta={
                  draft.toId && warehouseFree(state, draft.toId) < TARGET_FULL_GRAMS
                    ? 'voll, die Route fährt dann leer'
                    : undefined
                }
              >
                <Select
                  wide
                  label="Ziellager"
                  value={draft.toId}
                  options={warehouseOptions}
                  onChange={(toId) => set({ toId })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent
                icon="truck"
                color="people"
                title="Fahrer"
                meta={driver && driver.cityId !== fromCity ? `ist in ${cityName(driver.cityId)}` : undefined}
              >
                <Select
                  wide
                  label="Fahrer"
                  value={draft.driverId}
                  options={driverOptions}
                  onChange={(driverId) => set({ driverId })}
                />
              </ItemContent>
            </ListItem>
            {getVehicles(state).length > 0 && (
              <ListItem>
                <ItemContent icon="car" color="goods" title="Fahrzeug">
                  <VehicleSelect
                    state={state}
                    cityId={fromCity}
                    all
                    value={draft.vehicle}
                    onChange={(vehicle) => set({ vehicle })}
                  />
                </ItemContent>
              </ListItem>
            )}
          </List>
        </Group>

        <Group title="Weg" icon="moon" color="place" value={ROUTE_CHOICES[draft.choice].name}>
          <div class="logi-route-choice">
            <ChoiceControl value={draft.choice} onChange={(choice) => set({ choice })} />
          </div>
        </Group>

        <Group title="Fahrplan" icon="clock" color="system" value={daysText(draft.days)}>
          <List>
            <ListItem
              aside={
                <Stepper
                  label="Abfahrt"
                  value={draft.departure}
                  min={0}
                  max={1410}
                  step={30}
                  onChange={(departure) => set({ departure })}
                />
              }
            >
              <ItemContent icon="clock" color="system" title={`Abfahrt ${clock.formatTime(draft.departure)}`} />
            </ListItem>
          </List>
          <fieldset class="logi-days" aria-label="Wochentage">
            {WEEKDAYS_SHORT.map((label, day) => {
              const on = draft.days.length === 0 || draft.days.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  class={`logi-day ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    const current = draft.days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : draft.days;
                    const next = on ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
                    if (next.length > 0) set({ days: next.length === 7 ? [] : next });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </fieldset>
        </Group>

        <SegmentedControl
          wide
          aria-label="Ladung"
          value={draft.mode}
          options={[
            { value: 'fixed', label: 'Feste Menge' },
            { value: 'fill', label: 'Auffüllen bis' },
          ]}
          onChange={(mode) => set({ mode })}
        />
        <ItemLines
          title={draft.mode === 'fill' ? 'Zielbestand' : 'Ladung'}
          items={draft.items}
          onChange={(items) => set({ items })}
          note={
            draft.mode === 'fill'
              ? 'Geladen wird, was im Ziellager bis zu dieser Menge fehlt.'
              : 'Fehlt etwas, fährt die Route mit dem, was da ist.'
          }
        />

        <Toggle
          label="Mit Rückfahrt"
          hint={
            draft.roundTrip
              ? 'Der Fahrer lädt im Ziellager die Rückfracht und kommt zurück.'
              : fromCity === toCity
                ? 'Ohne Rückfahrt bleibt der Fahrer am Ziellager.'
                : `Ohne Rückfracht kommt der Fahrer leer aus ${cityName(toCity)} zurück.`
          }
          checked={draft.roundTrip}
          onChange={(roundTrip) => set({ roundTrip })}
        />
        {draft.roundTrip && (
          <ItemLines
            title="Rückfracht"
            items={draft.returnItems}
            onChange={(returnItems) => set({ returnItems })}
            note="Leer zurück, wenn im Ziellager nichts davon liegt."
          />
        )}

        {route && (
          <div class="logi-route__actions">
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                dispatch({ type: 'logistics.removeRoute', payload: { routeId: route.id } });
                props.onClose();
              }}
            >
              Route streichen
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Seite "Routen": alle Routen, neue anlegen. */
function RoutesPanel() {
  const { state } = useGame();
  const city = activeCity(state);
  // Nur die Routen, die hier losfahren; die der anderen Städte führen deren Statthalter (Auftrag 43).
  const routes = getRoutes(state, city);
  const elsewhere = getRoutes(state).length - routes.length;
  const [sheet, setSheet] = useState<{ open: boolean; routeId: number | null }>({ open: false, routeId: null });
  const here = getWarehouses(state, city).length;
  const canStart = here > 0 && getWarehouses(state).length >= 2;
  const drivers = getStaff(state, { role: 'driver', cityId: city }).length;
  return (
    <div class="logi-app">
      {routes.length === 0 ? (
        <Empty icon="route">
          Noch keine Routen. Ein Fahrer bringt nach Fahrplan Ware von Lager zu Lager, auch über die A1 in die andere
          Stadt.
        </Empty>
      ) : (
        routes.map((r) => <RouteGroup key={r.id} route={r} onEdit={() => setSheet({ open: true, routeId: r.id })} />)
      )}
      {elsewhere > 0 && (
        <Hint icon="building">
          {elsewhere === 1 ? 'Eine Route fährt' : `${elsewhere} Routen fahren`} in anderen Städten, die führst du dort.
        </Hint>
      )}
      {!canStart && (
        <Hint icon="warehouse">
          {here === 0
            ? `Für eine Route brauchst du ein Lager in ${cityName(city)}.`
            : 'Für eine Route brauchst du zwei Lager.'}
        </Hint>
      )}
      {drivers === 0 && <Hint icon="truck">Ohne Fahrer fährt keine Route. Fahrer heuerst du im Personal an.</Hint>}
      <Button
        variant="primary"
        icon="plus"
        disabled={!canStart}
        onClick={() => setSheet({ open: true, routeId: null })}
      >
        Neue Route
      </Button>
      <RouteSheet open={sheet.open} routeId={sheet.routeId} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </div>
  );
}

/** Seite "Fahrer": wo jeder Fahrer ist, was er gerade fährt, seine nächste Route. */
function DriversPanel() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const drivers = getStaff(state, { role: 'driver', cityId: activeCity(state) });
  return (
    <div class="logi-app">
      <Group icon="truck" color="people" title="Fahrer" count={drivers.length}>
        {drivers.length === 0 ? (
          <Empty icon="truck">Noch keine Fahrer.</Empty>
        ) : (
          <List>
            {drivers.map((m) => {
              const where = driverWhereabouts(state, m.id);
              const trip = where.trip;
              const chips: ChipSpec[] = [{ label: cityName(where.cityId), icon: 'pin', color: 'place' }];
              if (m.status !== 'active') chips.push({ label: STATUS_NAMES[m.status], color: 'danger' });
              else if (trip)
                chips.push({ label: `an ${clock.formatTime(trip.arrivesAt)}`, icon: 'truck', color: 'goods' });
              else chips.push({ label: m.assignment ? 'im Einsatz' : 'frei', color: m.assignment ? 'warn' : 'money' });
              if (where.next) {
                chips.push({
                  label: `${shortName(state, where.next.route)} ${whenText(state.time, where.next.at)}`,
                  icon: 'route',
                  color: 'system',
                });
              }
              const to = trip ? (placeOf(state, trip.toId)?.name ?? 'Lager') : null;
              return (
                <ListItem key={m.id} onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
                  <ItemContent
                    icon="user"
                    color="people"
                    title={m.name}
                    meta={trip ? `fährt nach ${to}` : where.next ? 'wartet auf die nächste Route' : 'keine Route'}
                    tags={chips}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </Group>
      <Button icon="plus" onClick={() => dispatch({ type: 'staff.hireDriver', payload: {} })}>
        Fahrer anheuern
      </Button>
      <Button icon="route" onClick={() => ui.openPanel('logistics.routes', {})}>
        Routen
      </Button>
    </div>
  );
}

/** Zeilen "Routen" und "Fahrer" für andere Seiten (Hafen, Lager, Lieferanten). In einer `List` verwenden. */
export function LogisticsLinks() {
  const { state } = useGame();
  const ui = useUi();
  const routes = getRoutes(state, activeCity(state));
  const ids = new Set(routes.map((r) => r.id));
  const running = state.modules.logistics.trips.filter((t) => t.routeId !== undefined && ids.has(t.routeId)).length;
  const next = routes
    .map((r) => nextDeparture(state, r))
    .filter((at): at is number => at !== null)
    .sort((a, b) => a - b)[0];
  const drivers = getStaff(state, { role: 'driver', cityId: activeCity(state) });
  const free = drivers.filter((m) => m.status === 'active' && !m.assignment).length;
  return (
    <>
      <ListItem onClick={() => ui.openPanel('logistics.routes', {})}>
        <ItemContent
          icon="route"
          color="goods"
          title="Routen"
          meta={
            routes.length === 0
              ? 'Ware nach Fahrplan, auch zwischen den Städten'
              : running > 0
                ? `${running} unterwegs`
                : next !== undefined
                  ? `nächste ${whenText(state.time, next)}`
                  : 'alle ruhen'
          }
          tags={routes.length > 0 ? [{ label: `${routes.length}`, icon: 'route', color: 'goods' }] : undefined}
        />
      </ListItem>
      <ListItem onClick={() => ui.openPanel('logistics.drivers', {})}>
        <ItemContent
          icon="truck"
          color="people"
          title="Fahrer"
          meta={drivers.length === 0 ? 'Noch keiner angeheuert' : `${free} von ${drivers.length} frei`}
        />
      </ListItem>
    </>
  );
}

declare module '../../../ui' {
  interface PanelRegistry {
    /** Routen mit Fahrplan (Auftrag 30). */
    'logistics.routes': Record<string, never>;
    /** Fahrer: wo sie sind, nächste Route. */
    'logistics.drivers': Record<string, never>;
  }
}

registerPanel({ id: 'logistics.routes', title: () => 'Routen', component: RoutesPanel });
registerPanel({ id: 'logistics.drivers', title: () => 'Fahrer', component: DriversPanel });
