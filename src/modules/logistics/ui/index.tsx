// Oberfläche der Logistik (seit Auftrag 26 ohne eigene App): die Hafen-Seite (Liegeplatz, Ware am Kai abholen,
// Fahrten, Zuletzt) als Panel, auf der Lager-Seite der Weg zum Hafen, Umlagern und Lager kaufen (Slot
// 'goods.warehouse'), Fahrzeuge auf der Karte, Live-Aktivitäten, Empfehlungen und Hinweise. Fahrer stehen im Personal.

import { useState } from 'preact/hooks';
import { clock, formatEuro, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Button,
  Empty,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerPanel,
  registerSlot,
  Select,
  SummaryTiles,
  soundOnEvent,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { isPlayerDelivering } from '../../customers';
import {
  formatProductAmount,
  getWarehouse,
  getWarehouses,
  productName,
  qualityTier,
  stockSummary,
  warehouseSites,
} from '../../goods';
import { getStaff, getStaffMember } from '../../staff';
import {
  berthCost,
  cargoRisk,
  cargoRiskFrom,
  defaultPickupWarehouse,
  freeDrivers,
  getCargo,
  getLogisticsLog,
  getTrips,
  hasBerth,
  isInterCityTrip,
  isPlayerOnTheRoad,
  PORTS,
  placeOf,
  portName,
  type Trip,
  type TripLeg,
  tripAmount,
  tripProgress,
} from '../index';
import './island';
import { LogisticsLinks } from './routes';
import './tracking';
import { logisticsLayer } from './map';
import './logistics.css';

/** Was die Fahrt gerade tut (beim Umlagern wird im Lager geladen, nicht am Kai). */
function legText(trip: Trip, leg: TripLeg, interCity = false): string {
  if (leg === 'stopped') return interCity ? 'Zollkontrolle' : 'Verkehrskontrolle';
  if (trip.kind === 'route' && leg === 'delivering') return interCity ? 'auf der A1' : 'Route';
  if (leg === 'toPickup') return 'fährt zum Hafen';
  if (leg === 'loading') return trip.kind === 'pickup' ? 'lädt am Kai' : 'lädt ein';
  return 'bringt die Ware';
}

function who(state: GameState, driverId: string | null): string {
  return driverId ? (getStaffMember(state, driverId)?.name ?? 'Fahrer') : 'Du';
}

function playerBusyReason(state: GameState): string | null {
  if (isPlayerOnTheRoad(state)) return 'Du bist schon unterwegs.';
  if (isPlayerDelivering(state)) return 'Du lieferst gerade aus.';
  return null;
}

function TripRow(props: { trip: Trip }) {
  const { state } = useGame();
  const { trip } = props;
  const progress = tripProgress(state, trip);
  const from = placeOf(state, trip.fromId)?.name ?? 'Hafen';
  const to = placeOf(state, trip.toId)?.name ?? 'Lager';
  const stopped = trip.status === 'stopped';
  return (
    <ListItem
      aside={
        stopped ? (
          <Tag category="danger" icon="siren">
            Kontrolle
          </Tag>
        ) : (
          <span class="logi-eta">an {clock.formatTime(trip.arrivesAt)}</span>
        )
      }
    >
      <ItemContent
        icon={stopped ? 'siren' : trip.driverId ? 'truck' : 'car'}
        color={stopped ? 'danger' : 'goods'}
        title={trip.kind === 'pickup' ? `Hafen → ${to}` : `${from} → ${to}`}
        meta={legText(trip, progress.leg, isInterCityTrip(state, trip))}
        tags={[
          { label: who(state, trip.driverId), icon: 'user', color: 'people' },
          { label: `${tripAmount(trip)} Einheiten`, icon: 'package', color: 'goods' },
        ]}
      >
        <ProgressBar value={progress.total} tone={stopped ? 'bad' : 'accent'} label="Fahrt" />
      </ItemContent>
    </ListItem>
  );
}

/** Kennzahlen oben: Ware am Kai, Fahrten, Fahrer (frei von allen). */
function Summary() {
  const { state } = useGame();
  const cargo = getCargo(state);
  const risky = cargo.some((c) => cargoRisk(state, c) === 'risky');
  const trips = getTrips(state);
  const stopped = trips.some((t) => t.status === 'stopped');
  const drivers = getStaff(state, { role: 'driver' }).length;
  return (
    <SummaryTiles
      items={[
        { icon: 'ship', color: risky ? 'danger' : 'goods', value: cargo.length, label: 'Am Kai' },
        {
          icon: stopped ? 'siren' : 'truck',
          color: stopped ? 'danger' : 'goods',
          value: trips.length,
          label: 'Fahrten',
        },
        { icon: 'users', color: 'people', value: `${freeDrivers(state).length}/${drivers}`, label: 'Fahrer' },
      ]}
    />
  );
}

/** Hafen: Liegeplatz mieten, Ware am Kai abholen lassen. */
function PortSection() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const cargo = getCargo(state);
  const warehouses = getWarehouses(state, activeCity(state));
  const drivers = freeDrivers(state);
  const [target, setTarget] = useState('');
  const [driverId, setDriverId] = useState('');
  const cityId = activeCity(state);
  const port = portName(cityId);
  const cost = berthCost(cityId);
  const quay = PORTS[cityId]?.quay ?? 'Kai 7';
  const hamburg = cityId === 'hamburg';
  if (!hasBerth(state)) {
    const short = state.wallet.clean < cost;
    return (
      <Group
        icon="ship"
        color="goods"
        title={port}
        note={
          short
            ? `Du hast ${formatEuro(state.wallet.clean)} sauberes Geld. Waschen kannst du in der App Geldwäsche.`
            : undefined
        }
      >
        <Empty
          icon="ship"
          action={
            <div class="logi-actions">
              <Button
                variant="primary"
                disabled={short}
                onClick={() => dispatch({ type: 'logistics.buyBerth', payload: {} })}
              >
                Liegeplatz mieten ({formatEuro(cost)})
              </Button>
              {short && <Button onClick={() => ui.openPhone('laundering.app')}>Geldwäsche</Button>}
            </div>
          }
        >
          {hamburg
            ? 'Mit eigenem Liegeplatz liefert dir Hein Container direkt an den Kai: kiloweise, in sechs Stunden. Der Zoll hier ist wacher als in Köln.'
            : 'Mit eigenem Liegeplatz liefert Rotterdam große Mengen per Schiff, viel billiger als die Großstädte.'}{' '}
          Der Hafen ist legal, gezahlt wird mit sauberem Geld.
        </Empty>
      </Group>
    );
  }
  if (cargo.length === 0) {
    return (
      <Group icon="ship" color="goods" title={`${port}, ${quay}`}>
        <Empty
          icon="ship"
          action={
            <Button onClick={() => ui.openPhone('suppliers.app', { supplierId: hamburg ? 'hamburg' : 'rotterdam' })}>
              {hamburg ? 'Zu Hein' : 'Zu Jansen'}
            </Button>
          }
        >
          {hamburg
            ? 'Am Kai wartet nichts. Container bestellst du bei Hein.'
            : 'Am Kai wartet nichts. Schiffsware bestellst du bei Jansen (Rotterdam).'}
        </Empty>
      </Group>
    );
  }
  const warehouseId = warehouses.some((w) => w.id === target) ? target : (defaultPickupWarehouse(state) ?? '');
  const chosenDriver = drivers.find((d) => d.id === driverId) ?? drivers[0];
  const busy = playerBusyReason(state);
  return (
    <Group
      icon="ship"
      color="goods"
      title={`${port}, ${quay}`}
      count={cargo.length}
      note="Ware am Kai ist ein paar Stunden sicher, dann wird der Zoll neugierig."
      more="Mit Ware an Bord kann es unterwegs eine Verkehrskontrolle geben, vor allem bei viel Heat im Ziel-Veedel. Ein Fahrer holt ab, oder du fährst selbst."
    >
      <List>
        {cargo.map((c) => {
          const risky = cargoRisk(state, c) === 'risky';
          return (
            <ListItem
              key={c.id}
              aside={
                risky ? (
                  <Tag category="danger" icon="alert">
                    Zoll
                  </Tag>
                ) : (
                  <Tag category="warn" icon="timer">
                    bis {clock.formatTime(cargoRiskFrom(c))}
                  </Tag>
                )
              }
            >
              <ItemContent
                icon="package"
                color="goods"
                title={`${formatProductAmount(c.productId, c.amount)} ${productName(c.productId)}`}
                tags={[
                  { label: qualityTier(c.quality).name, icon: 'star', color: 'goods' },
                  { label: `am Kai seit ${clock.formatTime(c.arrivedAt)}`, icon: 'clock' },
                ]}
              />
            </ListItem>
          );
        })}
      </List>
      <div class="logi-form">
        <Select
          label="Ziel-Lager"
          wide
          value={warehouseId}
          options={warehouses.map((w) => ({ value: w.id, label: `nach ${w.name}` }))}
          onChange={setTarget}
        />
        {drivers.length > 1 && (
          <Select
            label="Fahrer"
            wide
            value={chosenDriver?.id ?? ''}
            options={drivers.map((d) => ({ value: d.id, label: d.name }))}
            onChange={setDriverId}
          />
        )}
        <div class="logi-actions">
          <Button
            variant="primary"
            icon="truck"
            disabled={!chosenDriver}
            title={chosenDriver ? chosenDriver.name : 'Kein freier Fahrer'}
            onClick={() =>
              dispatch({
                type: 'logistics.pickup',
                payload: { by: 'driver', driverId: chosenDriver?.id, warehouseId },
              })
            }
          >
            {chosenDriver ? `${chosenDriver.name.split(' ')[0]} schicken` : 'Kein Fahrer frei'}
          </Button>
          <Button
            icon="car"
            disabled={!!busy}
            title={busy ?? 'Du fährst selbst'}
            onClick={() => dispatch({ type: 'logistics.pickup', payload: { by: 'player', warehouseId } })}
          >
            Selbst abholen
          </Button>
        </div>
      </div>
    </Group>
  );
}

/** Auf der Lager-Seite: der Weg zum Hafen mit Stand, Fahrten unterwegs, Umlagern aus diesem Lager, Lager kaufen. */
function WarehouseLogistics(props: { warehouseId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const owned = getWarehouses(state, activeCity(state));
  const [toId, setToId] = useState('');
  const [productId, setProductId] = useState('');
  const from = owned.find((w) => w.id === props.warehouseId) ?? owned[0];
  const targets = owned.filter((w) => w.id !== from?.id);
  const to = targets.find((w) => w.id === toId) ?? targets[0];
  const rows = from ? stockSummary(state, from.id) : [];
  const product = rows.some((r) => r.productId === productId) ? productId : '';
  const drivers = freeDrivers(state);
  const busy = playerBusyReason(state);
  const cargo = getCargo(state);
  const trips = getTrips(state);
  const risky = cargo.some((c) => cargoRisk(state, c) === 'risky');
  const transfer = (by: 'player' | 'driver') =>
    from &&
    to &&
    dispatch({
      type: 'logistics.transfer',
      payload: { fromId: from.id, toId: to.id, by, ...(product ? { productId: product } : {}) },
    });
  const forSale = warehouseSites(activeCity(state)).filter((w) => !owned.some((o) => o.id === w.id));
  return (
    <>
      <Group icon="ship" color="goods" title="Hafen">
        <List>
          <ListItem
            onClick={() => ui.openPanel('logistics.port', {})}
            aside={
              risky ? (
                <Tag category="danger" icon="alert">
                  Zoll
                </Tag>
              ) : cargo.length > 0 ? (
                <Tag category="warn" icon="ship">
                  {cargo.length} am Kai
                </Tag>
              ) : undefined
            }
          >
            <ItemContent
              icon="anchor"
              color={risky ? 'danger' : 'goods'}
              title={portName(activeCity(state))}
              meta={
                hasBerth(state)
                  ? cargo.length > 0
                    ? 'Ware am Kai wartet auf die Abholung'
                    : 'Liegeplatz, nichts am Kai'
                  : 'Noch kein Liegeplatz. Mit einem liefern Schiffe große Mengen.'
              }
            />
          </ListItem>
          <LogisticsLinks />
        </List>
      </Group>
      {trips.length > 0 && <TripsGroup trips={trips} />}
      {from && to && (
        <Group
          icon="route"
          color="goods"
          title={`Umlagern aus ${from.name}`}
          note="Mehrere Lager: kürzere Wege für Lieferungen, und eine Razzia trifft nicht alles auf einmal."
        >
          <div class="logi-form">
            <Select
              label="Nach"
              wide
              value={to.id}
              options={targets.map((w) => ({ value: w.id, label: `nach ${w.name}` }))}
              onChange={setToId}
            />
            <Select
              label="Ware"
              wide
              value={product}
              options={[
                { value: '', label: 'alle Ware' },
                ...rows.map((r) => ({
                  value: r.productId,
                  label: `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`,
                })),
              ]}
              onChange={setProductId}
            />
            <div class="logi-actions">
              <Button
                variant="primary"
                icon="truck"
                disabled={rows.length === 0 || drivers.length === 0}
                onClick={() => transfer('driver')}
              >
                {drivers.length > 0 ? 'Umlagern' : 'Kein Fahrer frei'}
              </Button>
              <Button
                icon="car"
                disabled={rows.length === 0 || !!busy}
                title={busy ?? undefined}
                onClick={() => transfer('player')}
              >
                Selbst fahren
              </Button>
            </div>
          </div>
        </Group>
      )}
      {forSale.length > 0 && (
        <Group
          icon="building"
          color="money"
          title="Zu kaufen (sauberes Geld)"
          note={
            owned.length > 1
              ? undefined
              : 'Mehrere Lager: kürzere Wege für Lieferungen, und eine Razzia trifft nicht alles auf einmal.'
          }
        >
          <List>
            {forSale.map((w) => (
              <ListItem
                key={w.id}
                aside={
                  <Button
                    small
                    disabled={state.wallet.clean < w.cost}
                    onClick={() => dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: w.id } })}
                  >
                    {formatEuro(w.cost)}
                  </Button>
                }
              >
                <button
                  type="button"
                  class="logi-item-button"
                  onClick={() => ui.flyTo(w, 15)}
                  title="Auf der Karte zeigen"
                >
                  <ItemContent icon="building" color="money" title={w.name} meta={w.description} />
                </button>
              </ListItem>
            ))}
          </List>
        </Group>
      )}
    </>
  );
}

/** Fahrten unterwegs (Abholungen und Umlagern) mit Fortschritt. */
function TripsGroup(props: { trips: readonly Trip[] }) {
  return (
    <Group icon="truck" color="goods" title="Unterwegs" count={props.trips.length}>
      <List>
        {props.trips.map((t) => (
          <TripRow key={t.id} trip={t} />
        ))}
      </List>
    </Group>
  );
}

/** Hafen-Seite (Panel): Kennzahlen, Kai, Fahrten unterwegs, was zuletzt lief. */
function PortPanel() {
  const { state } = useGame();
  const trips = getTrips(state);
  const log = getLogisticsLog(state).slice(0, 4);
  const drivers = getStaff(state, { role: 'driver' }).length;
  return (
    <div class="logi-app">
      <Summary />
      <PortSection />
      {trips.length > 0 && <TripsGroup trips={trips} />}
      <Group
        icon="route"
        color="goods"
        title="Fahrer und Routen"
        note={drivers === 0 ? 'Ohne Fahrer musst du jede Abholung selbst machen.' : undefined}
      >
        <List>
          <LogisticsLinks />
        </List>
      </Group>
      {log.length > 0 && (
        <Group icon="clock" color="system" title="Zuletzt">
          <List>
            {log.map((entry) => (
              <ListItem
                key={entry.id}
                aside={
                  entry.result === 'done' ? (
                    <span class="logi-eta">{entry.amount} Einheiten</span>
                  ) : (
                    <Tag category="danger" icon="alert">
                      {entry.result === 'seized' ? 'aufgeflogen' : 'verloren'}
                    </Tag>
                  )
                }
              >
                <ItemContent
                  icon={entry.result === 'done' ? 'checkCircle' : 'xCircle'}
                  color={entry.result === 'done' ? 'money' : 'danger'}
                  title={`${who(state, entry.driverId)} → ${placeOf(state, entry.toId)?.name ?? 'Lager'}`}
                  meta={clock.formatTime(entry.at)}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
    </div>
  );
}

declare module '../../../ui' {
  interface PanelRegistry {
    /** Hafen-Seite: Liegeplatz, Ware am Kai, Fahrten. */
    'logistics.port': Record<string, never>;
  }
}

registerPanel({ id: 'logistics.port', title: () => 'Hafen', component: PortPanel });

/** In der Lieferanten-App (Dock): Hafen, Routen und Fahrer, damit die Logistik schnell erreichbar ist. */
function SupplierLogistics() {
  const { state } = useGame();
  const ui = useUi();
  const cityId = activeCity(state);
  const cargo = getCargo(state).length;
  return (
    <Group icon="truck" color="goods" title="Logistik">
      <List>
        {PORTS[cityId] && (
          <ListItem onClick={() => ui.openPanel('logistics.port', {})}>
            <ItemContent
              icon="anchor"
              color="goods"
              title={portName(cityId)}
              meta={hasBerth(state) ? (cargo > 0 ? `${cargo} am Kai` : 'Liegeplatz') : 'Noch kein Liegeplatz'}
            />
          </ListItem>
        )}
        <LogisticsLinks />
      </List>
    </Group>
  );
}
registerSlot('suppliers.list', { id: 'logistics.links', order: 10, component: SupplierLogistics });
registerSlot('goods.warehouse', { id: 'logistics.warehouse', order: 20, component: WarehouseLogistics });
registerMapLayer(logisticsLayer);

// Empfehlungen: Ware am Kai abholen, Liegeplatz mieten, wenn das saubere Geld reicht.
registerAdvisor({
  id: 'logistics',
  advise: (state) => {
    const cargo = getCargo(state);
    if (cargo.length > 0) {
      const driver = freeDrivers(state)[0];
      const risky = cargo.some((c) => cargoRisk(state, c) === 'risky');
      const busy = playerBusyReason(state);
      return {
        id: 'logistics.pickup',
        priority: risky ? 89 : 83,
        icon: 'ship',
        title: risky ? 'Der Zoll wird neugierig: Ware abholen!' : 'Ware am Hafen abholen',
        text: driver
          ? `${driver.name} kann sofort los.`
          : busy
            ? 'Kein Fahrer frei, und du bist unterwegs.'
            : 'Kein Fahrer frei. Fahr selbst oder heuer einen an.',
        actionLabel: driver ? 'Fahrer schicken' : busy ? 'Hafen' : 'Selbst abholen',
        action: (ui) => {
          if (driver) ui.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', driverId: driver.id } });
          else if (!busy) ui.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } });
          else ui.openPanel('logistics.port', {});
        },
      };
    }
    const cityId = activeCity(state);
    if (!hasBerth(state) && PORTS[cityId] && state.wallet.clean >= berthCost(cityId)) {
      return {
        id: 'logistics.berth',
        priority: 45,
        icon: 'ship',
        title: `Liegeplatz im ${portName(cityId)} mieten`,
        text:
          cityId === 'hamburg'
            ? 'Dann liefert Hein Container direkt an den Kai, kiloweise.'
            : 'Dann liefert Rotterdam große Mengen per Schiff, viel billiger als die Großstädte.',
        actionLabel: 'Ansehen',
        action: (ui) => ui.openPanel('logistics.port', {}),
      };
    }
    return null;
  },
});

onGameEvent('cargo.docked', 'logistics.dockedToast', (payload, ui) => {
  ui.toast(
    `Schiff im Hafen: ${formatProductAmount(payload.productId, payload.amount)} ${productName(payload.productId)} am Kai.`,
    'good',
    { urgent: true },
  );
});
onGameEvent('cargo.seized', 'logistics.customsToast', (payload, ui) => {
  ui.toast(`Zoll im Hafen: ${formatProductAmount(payload.productId, payload.amount)} beschlagnahmt!`, 'bad');
});
onGameEvent('transport.arrived', 'logistics.arrivedToast', (payload, ui, state) => {
  if (payload.amount === 0) return;
  const place = getWarehouse(state, payload.toId)?.name ?? 'Lager';
  // Routen in derselben Stadt sind Routine (still im Verlauf); eine Ankunft über die A1 ist ein Banner wert.
  const routine = payload.kind === 'route' && !payload.interCity;
  ui.toast(`Fahrt angekommen: ${payload.amount} Einheiten im ${place}.`, 'good', { urgent: !routine });
});
onGameEvent('transport.stopped', 'logistics.customsStopToast', (payload, ui, state) => {
  const trip = getTrips(state).find((t) => t.id === payload.tripId);
  if (trip && isInterCityTrip(state, trip))
    ui.toast(`Zoll auf der A1: ${who(state, trip.driverId)} wird kontrolliert!`, 'bad');
});
onGameEvent('transport.seized', 'logistics.seizedToast', (payload, ui) => {
  ui.toast(`Ladung aufgeflogen${payload.arrested ? ', Fahrer festgenommen' : ''}!`, 'bad');
});
onGameEvent('transport.lost', 'logistics.lostToast', (_payload, ui) => {
  ui.toast('Fahrt geplatzt, die Ladung ist weg.', 'bad');
});
soundOnEvent('transport.arrived', 'delivery');
soundOnEvent('cargo.docked', 'delivery');
soundOnEvent('transport.stopped', 'siren', { volume: 0.5 });
