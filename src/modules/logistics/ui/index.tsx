// Oberfläche der Logistik: Handy-App "Logistik" (Hafen, Fahrten, Lager, Fahrer), Abschnitt im Tab "Geschäft",
// Fahrzeuge auf der Karte, Live-Aktivitäten, Empfehlungen und Hinweise.

import { useState } from 'preact/hooks';
import { clock, formatEuro, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Button,
  Card,
  Empty,
  Hint,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerPhoneApp,
  registerSlot,
  Select,
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
  tripAmount,
  tripProgress,
} from '../index';
import './island';
import { logisticsLayer } from './map';
import './logistics.css';

const LEG_TEXT = {
  toPickup: 'fährt zum Hafen',
  loading: 'lädt am Kai',
  delivering: 'bringt die Ware',
  stopped: 'Verkehrskontrolle!',
} as const;

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
    <li class="logi-trip">
      <div class="logi-trip__head">
        <strong>{trip.kind === 'pickup' ? `Hafen → ${to}` : `${from} → ${to}`}</strong>
        <span class={stopped ? 'logi-eta is-bad' : 'logi-eta'}>
          {stopped ? 'steht' : `an ${clock.formatTime(trip.arrivesAt)}`}
        </span>
      </div>
      <div class="ui-hint">
        {who(state, trip.driverId)} · {LEG_TEXT[progress.leg]} · {tripAmount(trip)} Einheiten
      </div>
      <ProgressBar value={progress.total} tone={stopped ? 'bad' : 'accent'} label="Fahrt" />
    </li>
  );
}

/** Hafen: Liegeplatz mieten, Ware am Kai abholen lassen. */
function PortSection() {
  const { state, dispatch } = useGame();
  const cargo = getCargo(state);
  const warehouses = getWarehouses(state);
  const drivers = freeDrivers(state);
  const [target, setTarget] = useState('');
  const [driverId, setDriverId] = useState('');
  if (!hasBerth(state)) {
    return (
      <section class="logi-section">
        <h4 class="logi-section__title">Niehler Hafen</h4>
        <p class="ui-hint">
          Ein eigener Liegeplatz ist die Voraussetzung für Schiffsware aus Rotterdam: große Mengen, viel billiger als
          die Großstädte. Der Hafen ist legal, gezahlt wird mit sauberem Geld.
        </p>
        <KeyValue
          label="Sauberes Geld"
          value={formatEuro(state.wallet.clean)}
          tone={state.wallet.clean < BERTH_COST ? 'warn' : undefined}
        />
        <Button
          variant="primary"
          wide
          disabled={state.wallet.clean < BERTH_COST}
          onClick={() => dispatch({ type: 'logistics.buyBerth', payload: {} })}
        >
          Liegeplatz mieten ({formatEuro(BERTH_COST)})
        </Button>
        {state.wallet.clean < BERTH_COST && <Hint>Wasch Schwarzgeld im Tab „Geschäft“ unter Geldwäsche.</Hint>}
      </section>
    );
  }
  const warehouseId = warehouses.some((w) => w.id === target) ? target : (defaultPickupWarehouse(state) ?? '');
  const chosenDriver = drivers.find((d) => d.id === driverId) ?? drivers[0];
  const busy = playerBusyReason(state);
  return (
    <section class="logi-section">
      <h4 class="logi-section__title">Niehler Hafen · Kai 7</h4>
      {cargo.length === 0 ? (
        <Empty>Am Kai wartet nichts. Schiffsware bestellst du in der Lieferanten-App bei Jansen (Rotterdam).</Empty>
      ) : (
        <>
          <List>
            {cargo.map((c) => {
              const risky = cargoRisk(state, c) === 'risky';
              return (
                <ListItem
                  key={c.id}
                  aside={
                    <Tag tone={risky ? 'bad' : 'muted'}>
                      {risky ? 'Zoll!' : `sicher bis ${clock.formatTime(cargoRiskFrom(c))}`}
                    </Tag>
                  }
                >
                  <strong>
                    {formatProductAmount(c.productId, c.amount)} {productName(c.productId)}
                  </strong>
                  <div class="ui-hint">
                    {qualityTier(c.quality).name} · am Kai seit {clock.formatTime(c.arrivedAt)}
                  </div>
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
            <div class="logi-form__buttons">
              <Button
                variant="primary"
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
                disabled={!!busy}
                title={busy ?? 'Du fährst selbst'}
                onClick={() => dispatch({ type: 'logistics.pickup', payload: { by: 'player', warehouseId } })}
              >
                Selbst abholen
              </Button>
            </div>
          </div>
          <Hint>
            Ware am Kai ist ein paar Stunden sicher, dann wird der Zoll neugierig. Mit Ware an Bord kann es unterwegs
            eine Verkehrskontrolle geben, vor allem wenn im Ziel-Veedel viel Heat ist.
          </Hint>
        </>
      )}
    </section>
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
    <section class="logi-section">
      <h4 class="logi-section__title">Lager</h4>
      <List>
        {owned.map((w) => {
          const stock = stockSummary(state, w.id);
          return (
            <ListItem key={w.id} onClick={() => ui.openPanel('goods.warehouse', { warehouseId: w.id })}>
              <strong>{w.name}</strong>
              <div class="ui-hint">
                {stock.length === 0
                  ? 'leer'
                  : stock
                      .slice(0, 3)
                      .map((r) => `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`)
                      .join(', ')}
              </div>
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
          <div class="logi-form__buttons">
            <Button
              variant="primary"
              disabled={rows.length === 0 || drivers.length === 0}
              onClick={() => transfer('driver')}
            >
              {drivers.length > 0 ? 'Fahrer schicken' : 'Kein Fahrer frei'}
            </Button>
            <Button disabled={rows.length === 0 || !!busy} title={busy ?? undefined} onClick={() => transfer('player')}>
              Selbst fahren
            </Button>
          </div>
        </div>
      )}
      {forSale.length > 0 && (
        <>
          <h4 class="logi-section__title">Zu kaufen (sauberes Geld)</h4>
          <List>
            {forSale.map((w) => (
              <ListItem
                key={w.id}
                aside={
                  <div class="logi-buy">
                    <Button
                      small
                      variant="subtle"
                      icon="pin"
                      aria-label="Auf der Karte"
                      onClick={() => ui.flyTo(w, 15)}
                    />
                    <Button
                      small
                      disabled={state.wallet.clean < w.cost}
                      onClick={() => dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: w.id } })}
                    >
                      {formatEuro(w.cost)}
                    </Button>
                  </div>
                }
              >
                <strong>{w.name}</strong>
                <div class="ui-hint">{w.description}</div>
              </ListItem>
            ))}
          </List>
          <Hint>Mehrere Lager: kürzere Wege für Lieferungen, und eine Razzia trifft nicht alles auf einmal.</Hint>
        </>
      )}
    </section>
  );
}

function DriverSection() {
  const { state, dispatch } = useGame();
  const drivers = getStaff(state, { role: 'driver' });
  const ui = useUi();
  return (
    <section class="logi-section">
      <h4 class="logi-section__title">Fahrer</h4>
      {drivers.length === 0 ? (
        <Empty>Noch keine Fahrer. Ohne Fahrer musst du jede Abholung selbst machen.</Empty>
      ) : (
        <List>
          {drivers.map((d) => (
            <ListItem
              key={d.id}
              onClick={() => ui.openPanel('staff.profile', { staffId: d.id })}
              aside={
                <Tag tone={d.status !== 'active' ? 'bad' : d.assignment ? 'info' : 'accent'}>
                  {d.status !== 'active' ? STATUS_NAMES[d.status] : d.assignment ? 'unterwegs' : 'frei'}
                </Tag>
              }
            >
              <strong>{d.name}</strong>
              <div class="ui-hint">
                Level {d.level} · {formatEuro(d.wage)} am Tag
              </div>
            </ListItem>
          ))}
        </List>
      )}
      <Button
        wide
        disabled={state.wallet.dirty < DRIVER_HIRE_COST}
        onClick={() => dispatch({ type: 'staff.hireDriver', payload: {} })}
      >
        Fahrer anheuern ({formatEuro(DRIVER_HIRE_COST)})
      </Button>
    </section>
  );
}

function LogisticsApp() {
  const { state } = useGame();
  const trips = getTrips(state);
  const log = getLogisticsLog(state).slice(0, 4);
  return (
    <div class="logi-app">
      <PortSection />
      {trips.length > 0 && (
        <section class="logi-section">
          <h4 class="logi-section__title">Unterwegs</h4>
          <ul class="logi-trips">
            {trips.map((t) => (
              <TripRow key={t.id} trip={t} />
            ))}
          </ul>
        </section>
      )}
      <WarehouseSection />
      <DriverSection />
      {log.length > 0 && (
        <section class="logi-section">
          <h4 class="logi-section__title">Zuletzt</h4>
          <ul class="logi-log">
            {log.map((entry) => (
              <li key={entry.id} class={`logi-log__item is-${entry.result}`}>
                <span>
                  {who(state, entry.driverId)} → {getWarehouse(state, entry.toId)?.name ?? 'Lager'}
                </span>
                <span>
                  {entry.result === 'done'
                    ? `${entry.amount} Einheiten`
                    : entry.result === 'seized'
                      ? 'aufgeflogen'
                      : 'verloren'}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
      color="blue"
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
  color: '#2c7a7b',
  component: LogisticsApp,
  badge: (state) => getCargo(state).length + getTrips(state).filter((t) => t.status === 'stopped').length,
});
registerSlot('tab:business', { id: 'logistics.overview', order: 12, component: LogisticsCard });
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
