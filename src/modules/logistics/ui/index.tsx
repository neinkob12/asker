// Oberfläche der Logistik: Handy-App "Logistik" (Hafen, Fahrten, Lager, Fahrer), Abschnitt im Tab "Geschäft",
// Fahrzeuge auf der Karte, Live-Aktivitäten, Empfehlungen und Hinweise.

import { useState } from 'preact/hooks';
import { clock, formatEuro, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Button,
  Card,
  Empty,
  Group,
  ItemContent,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerPhoneApp,
  registerSlot,
  Select,
  SummaryTiles,
  soundOnEvent,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
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
import { DRIVER_HIRE_COST, getStaff, getStaffMember, STATUS_NAMES } from '../../staff';
import {
  BERTH_COST,
  cargoRisk,
  cargoRiskFrom,
  defaultPickupWarehouse,
  freeDrivers,
  getCargo,
  getLogisticsLog,
  getTrips,
  hasBerth,
  isPlayerOnTheRoad,
  placeOf,
  type Trip,
  type TripLeg,
  tripAmount,
  tripProgress,
} from '../index';
import './island';
import './tracking';
import { logisticsLayer } from './map';
import './logistics.css';

/** Was die Fahrt gerade tut (beim Umlagern wird im Lager geladen, nicht am Kai). */
function legText(trip: Trip, leg: TripLeg): string {
  if (leg === 'stopped') return 'Verkehrskontrolle';
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
        meta={`${who(state, trip.driverId)} · ${legText(trip, progress.leg)} · ${tripAmount(trip)} Einheiten`}
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
  const warehouses = getWarehouses(state);
  const drivers = freeDrivers(state);
  const [target, setTarget] = useState('');
  const [driverId, setDriverId] = useState('');
  if (!hasBerth(state)) {
    const short = state.wallet.clean < BERTH_COST;
    return (
      <Group
        icon="ship"
        color="goods"
        title="Niehler Hafen"
        note={
          short
            ? `Du hast ${formatEuro(state.wallet.clean)} sauberes Geld. Waschen kannst du im Geschäft unter Geldwäsche.`
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
                Liegeplatz mieten · {formatEuro(BERTH_COST)}
              </Button>
              {short && (
                <Button
                  onClick={() => {
                    ui.selectTab('business');
                    ui.openSection('laundering.section');
                  }}
                >
                  Geldwäsche
                </Button>
              )}
            </div>
          }
        >
          Mit eigenem Liegeplatz liefert Rotterdam große Mengen per Schiff, viel billiger als die Großstädte. Der Hafen
          ist legal, gezahlt wird mit sauberem Geld.
        </Empty>
      </Group>
    );
  }
  if (cargo.length === 0) {
    return (
      <Group icon="ship" color="goods" title="Niehler Hafen · Kai 7">
        <Empty
          icon="ship"
          action={<Button onClick={() => ui.openPhone('suppliers.app', { supplierId: 'rotterdam' })}>Zu Jansen</Button>}
        >
          Am Kai wartet nichts. Schiffsware bestellst du bei Jansen (Rotterdam).
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
      title="Niehler Hafen · Kai 7"
      count={cargo.length}
      note="Ware am Kai ist ein paar Stunden sicher, dann wird der Zoll neugierig. Mit Ware an Bord kann es eine Verkehrskontrolle geben, vor allem bei viel Heat im Ziel-Veedel."
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
                meta={`${qualityTier(c.quality).name} · am Kai seit ${clock.formatTime(c.arrivedAt)}`}
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

/** Lager: Bestand pro Lager, Umlagern, neue Standorte kaufen. */
function WarehouseSection() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const owned = getWarehouses(state);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [productId, setProductId] = useState('');
  const from = owned.find((w) => w.id === fromId) ?? owned[0];
  const targets = owned.filter((w) => w.id !== from?.id);
  const to = targets.find((w) => w.id === toId) ?? targets[0];
  const rows = from ? stockSummary(state, from.id) : [];
  const product = rows.some((r) => r.productId === productId) ? productId : '';
  const drivers = freeDrivers(state);
  const busy = playerBusyReason(state);
  const transfer = (by: 'player' | 'driver') =>
    from &&
    to &&
    dispatch({
      type: 'logistics.transfer',
      payload: { fromId: from.id, toId: to.id, by, ...(product ? { productId: product } : {}) },
    });
  const forSale = warehouseSites().filter((w) => !owned.some((o) => o.id === w.id));
  return (
    <>
      <Group icon="warehouse" color="goods" title="Lager" count={owned.length}>
        <List>
          {owned.map((w) => {
            const stock = stockSummary(state, w.id);
            return (
              <ListItem key={w.id} onClick={() => ui.openPanel('goods.warehouse', { warehouseId: w.id })}>
                <ItemContent
                  icon="warehouse"
                  color="goods"
                  title={w.name}
                  meta={
                    stock.length === 0
                      ? 'leer'
                      : stock
                          .slice(0, 2)
                          .map((r) => `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`)
                          .join(', ')
                  }
                />
              </ListItem>
            );
          })}
        </List>
        {owned.length > 1 && from && to && (
          <div class="logi-form">
            <div class="logi-form__row">
              <Select
                label="Von"
                wide
                value={from.id}
                options={owned.map((w) => ({ value: w.id, label: `von ${w.name}` }))}
                onChange={setFromId}
              />
              <Select
                label="Nach"
                wide
                value={to.id}
                options={targets.map((w) => ({ value: w.id, label: `nach ${w.name}` }))}
                onChange={setToId}
              />
            </div>
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
        )}
      </Group>
      {forSale.length > 0 && (
        <Group
          icon="building"
          color="money"
          title="Zu kaufen · sauberes Geld"
          note="Mehrere Lager: kürzere Wege für Lieferungen, und eine Razzia trifft nicht alles auf einmal."
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

function DriverSection() {
  const { state, dispatch } = useGame();
  const drivers = getStaff(state, { role: 'driver' });
  const ui = useUi();
  const hire = (
    <Button
      variant={drivers.length === 0 ? 'primary' : 'default'}
      icon="userPlus"
      disabled={state.wallet.dirty < DRIVER_HIRE_COST}
      onClick={() => dispatch({ type: 'staff.hireDriver', payload: {} })}
    >
      Fahrer anheuern · {formatEuro(DRIVER_HIRE_COST)}
    </Button>
  );
  return (
    <Group icon="truck" color="people" title="Fahrer" count={drivers.length}>
      {drivers.length === 0 ? (
        <Empty icon="truck" action={hire}>
          Noch keine Fahrer. Ohne Fahrer musst du jede Abholung selbst machen.
        </Empty>
      ) : (
        <>
          <List>
            {drivers.map((d) => {
              const status =
                d.status !== 'active'
                  ? { category: 'danger' as const, icon: 'alert', text: STATUS_NAMES[d.status] }
                  : d.assignment
                    ? { category: 'goods' as const, icon: 'truck', text: 'unterwegs' }
                    : { category: 'money' as const, icon: 'check', text: 'frei' };
              return (
                <ListItem
                  key={d.id}
                  onClick={() => ui.openPanel('staff.profile', { staffId: d.id })}
                  aside={
                    <Tag category={status.category} icon={status.icon}>
                      {status.text}
                    </Tag>
                  }
                >
                  <ItemContent
                    icon="truck"
                    color="people"
                    title={d.name}
                    meta={`Level ${d.level} · ${formatEuro(d.wage)} am Tag`}
                  />
                </ListItem>
              );
            })}
          </List>
          <div class="logi-actions">{hire}</div>
        </>
      )}
    </Group>
  );
}

function LogisticsApp() {
  const { state } = useGame();
  const trips = getTrips(state);
  const log = getLogisticsLog(state).slice(0, 4);
  return (
    <div class="logi-app">
      <Summary />
      <PortSection />
      {trips.length > 0 && (
        <Group icon="truck" color="goods" title="Unterwegs" count={trips.length}>
          <List>
            {trips.map((t) => (
              <TripRow key={t.id} trip={t} />
            ))}
          </List>
        </Group>
      )}
      <WarehouseSection />
      <DriverSection />
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
                  title={`${who(state, entry.driverId)} → ${getWarehouse(state, entry.toId)?.name ?? 'Lager'}`}
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

function LogisticsCard() {
  const { state } = useGame();
  const ui = useUi();
  const cargo = getCargo(state);
  const trips = getTrips(state);
  const risky = cargo.some((c) => cargoRisk(state, c) === 'risky');
  const summary =
    cargo.length > 0
      ? `${cargo.length} am Kai`
      : trips.length > 0
        ? `${trips.length} unterwegs`
        : hasBerth(state)
          ? 'Hafen frei'
          : 'kein Hafen';
  return (
    <Card
      title="Logistik"
      icon="route"
      color="goods"
      status={risky || trips.some((t) => t.status === 'stopped') ? 'bad' : cargo.length > 0 ? 'warn' : 'good'}
      summary={summary}
      actions={
        <Button small onClick={() => ui.openPhone('logistics.app')}>
          Öffnen
        </Button>
      }
    >
      <KeyValue label="Liegeplatz im Hafen" value={hasBerth(state) ? 'ja, Kai 7' : 'keiner'} />
      <KeyValue label="Ware am Kai" value={cargo.length} tone={cargo.length > 0 ? 'warn' : undefined} />
      <KeyValue label="Fahrten unterwegs" value={trips.length} />
      <KeyValue label="Lager" value={getWarehouses(state).length} />
      <KeyValue label="Freie Fahrer" value={freeDrivers(state).length} />
    </Card>
  );
}

registerPhoneApp({
  id: 'logistics.app',
  name: 'Logistik',
  icon: 'route',
  order: 22,
  color: 'goods',
  component: LogisticsApp,
  badge: (state) => getCargo(state).length + getTrips(state).filter((t) => t.status === 'stopped').length,
});
registerSlot('tab:business', { id: 'logistics.overview', title: 'Logistik', order: 12, component: LogisticsCard });
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
        actionLabel: driver ? 'Fahrer schicken' : busy ? 'Logistik' : 'Selbst abholen',
        action: (ui) => {
          if (driver) ui.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', driverId: driver.id } });
          else if (!busy) ui.dispatch({ type: 'logistics.pickup', payload: { by: 'player' } });
          else ui.openPhone('logistics.app');
        },
      };
    }
    if (!hasBerth(state) && state.wallet.clean >= BERTH_COST) {
      return {
        id: 'logistics.berth',
        priority: 45,
        icon: 'ship',
        title: 'Liegeplatz im Hafen mieten',
        text: 'Dann liefert Rotterdam große Mengen per Schiff, viel billiger als die Großstädte.',
        actionLabel: 'Ansehen',
        action: (ui) => ui.openPhone('logistics.app'),
      };
    }
    return null;
  },
});

onGameEvent('cargo.docked', 'logistics.dockedToast', (payload, ui) => {
  ui.toast(
    `Schiff im Hafen: ${formatProductAmount(payload.productId, payload.amount)} ${productName(payload.productId)} am Kai.`,
    'good',
  );
});
onGameEvent('cargo.seized', 'logistics.customsToast', (payload, ui) => {
  ui.toast(`Zoll im Hafen: ${formatProductAmount(payload.productId, payload.amount)} beschlagnahmt!`, 'bad');
});
onGameEvent('transport.arrived', 'logistics.arrivedToast', (payload, ui, state) => {
  ui.toast(
    `Fahrt angekommen: ${payload.amount} Einheiten im ${getWarehouse(state, payload.toId)?.name ?? 'Lager'}.`,
    'good',
  );
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
