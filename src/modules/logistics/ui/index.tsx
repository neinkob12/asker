// Oberfläche der Logistik (seit Auftrag 26 ohne eigene App): die Hafen-Seite (Liegeplatz, Ware am Kai abholen,
// Fahrten, Zuletzt) als Panel, auf der Lager-Seite der Weg zum Hafen, Umlagern und Lager kaufen (Slot
// 'goods.warehouse'), Fahrzeuge auf der Karte, Live-Aktivitäten, Empfehlungen und Hinweise. Fahrer stehen im Personal.

import { useState } from 'preact/hooks';
import { clock, formatEuro, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  ActionSheet,
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
import { activeCity, cityName, isBusinessSold } from '../../city';
import { vehicleName } from '../../fleet';
import {
  formatProductAmount,
  getWarehouse,
  getWarehouses,
  productName,
  qualityTier,
  stockSummary,
  type Warehouse,
  warehousePlace,
  warehouseSites,
} from '../../goods';
import { getStaff, getStaffMember } from '../../staff';
import { getSuppliers } from '../../suppliers';
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
  itemsText,
  PORTS,
  placeCity,
  placeOf,
  playerBusy,
  portName,
  ROUTE_CHOICES,
  type RouteChoice,
  reservedCargo,
  roomFor,
  type Trip,
  type TripLeg,
  tripAmount,
  tripProgress,
  tripTouchesCity,
} from '../index';
import { BerthGroup } from './port';
import { LogisticsLinks } from './routes';
import { AUTO, ChoiceControl, VehicleSelect, vehicleChoice } from './vehicles';
import './tracking';
import { logisticsLayer } from './map';
import './logistics.css';

/** Was die Fahrt gerade tut (beim Umlagern wird im Lager geladen, nicht am Kai). */
function legText(trip: Trip, leg: TripLeg, interCity = false): string {
  if (leg === 'planned') return `fährt um ${clock.formatTime(trip.startedAt)} los`;
  if (trip.status === 'waiting') return 'wartet am vollen Lager';
  if (leg === 'stopped') return interCity ? 'Zollkontrolle' : 'Verkehrskontrolle';
  if (trip.kind === 'route' && leg === 'delivering') return interCity ? 'auf der A1' : 'Route';
  if (leg === 'toPickup') return 'fährt zum Hafen';
  if (leg === 'loading') return trip.kind === 'pickup' ? 'lädt am Kai' : 'lädt ein';
  return 'bringt die Ware';
}

function who(state: GameState, driverId: string | null): string {
  return driverId ? (getStaffMember(state, driverId)?.name ?? 'Fahrer') : 'Du';
}

/** Warum du nicht selbst fahren kannst, auch wenn du gerade nicht in dieser Stadt bist (Auftrag 43, M8). */
function playerBusyReason(state: GameState): string | null {
  return playerBusy(state, activeCity(state));
}

function TripRow(props: { trip: Trip }) {
  const { state, dispatch } = useGame();
  const { trip } = props;
  const progress = tripProgress(state, trip);
  const from = placeOf(state, trip.fromId)?.name ?? 'Hafen';
  const to = placeOf(state, trip.toId)?.name ?? 'Lager';
  const stopped = trip.status === 'stopped';
  // Am vollen Lager: Umleiten ins nächste Lager der Stadt mit Platz (Auftrag 33).
  const here = getWarehouse(state, trip.toId);
  const elsewhere =
    trip.status === 'waiting' && here
      ? getWarehouses(state, here.cityId).find((w) => w.id !== here.id && roomFor(state, w.id) > 0)
      : undefined;
  return (
    <ListItem
      aside={
        trip.status === 'waiting' ? (
          elsewhere ? (
            <Button
              small
              title={`Ins ${elsewhere.name}`}
              onClick={() => dispatch({ type: 'logistics.redirect', payload: { tripId: trip.id, toId: elsewhere.id } })}
            >
              Umleiten
            </Button>
          ) : (
            <Tag category="warn" icon="boxes">
              Lager voll
            </Tag>
          )
        ) : trip.status === 'planned' ? (
          <span class="logi-eta">ab {clock.formatTime(trip.startedAt)}</span>
        ) : stopped ? (
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
          trip.vehicleId !== undefined && { label: vehicleName(state, trip.vehicleId), icon: 'truck', color: 'goods' },
          trip.choice &&
            trip.choice !== 'autobahn' && { label: ROUTE_CHOICES[trip.choice].name, icon: 'route', color: 'place' },
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
  const trips = getTrips(state).filter((t) => tripTouchesCity(state, t, activeCity(state)));
  const stopped = trips.some((t) => t.status === 'stopped');
  const drivers = getStaff(state, { role: 'driver', cityId: activeCity(state) }).length;
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
  const [vehicle, setVehicle] = useState(AUTO);
  const [choice, setChoice] = useState<RouteChoice>('autobahn');
  const cityId = activeCity(state);
  const port = portName(cityId);
  const cost = berthCost(cityId);
  const quay = PORTS[cityId]?.quay ?? 'Kai 7';
  const hamburg = cityId === 'hamburg';
  // Wer hier per Schiff an den Kai liefert (Köln: Jansen aus Rotterdam, Hamburg: Daan aus Amsterdam; Auftrag 43, M3).
  const shipper = getSuppliers(state, cityId).find((s) => s.kind === 'port');
  const shipperName = shipper ? `${shipper.contactName} (${shipper.name})` : 'dein Lieferant';
  if (!hasBerth(state)) {
    const short = state.wallet.clean < cost;
    return (
      <Group
        data-tour="port.berth"
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
            ? `Mit eigenem Liegeplatz liefert dir ${shipperName} Container direkt an den Kai: kiloweise, in sechs Stunden. Der Zoll hier ist wacher als in Köln.`
            : `Mit eigenem Liegeplatz liefert ${shipperName} große Mengen per Schiff, viel billiger als die Großstädte.`}{' '}
          Der Hafen ist legal, gezahlt wird mit sauberem Geld.
        </Empty>
      </Group>
    );
  }
  if (cargo.length === 0) {
    return (
      <Group icon="ship" color="goods" title={port} note={`Dein Platz: ${quay}.`}>
        <Empty
          icon="ship"
          action={
            shipper && (
              <Button onClick={() => ui.openPhone('suppliers.app', { supplierId: shipper.id })}>
                Zu {shipper.contactName}
              </Button>
            )
          }
        >
          {hamburg
            ? `Am Kai wartet nichts. Container bestellst du bei ${shipperName}.`
            : `Am Kai wartet nichts. Schiffsware bestellst du bei ${shipperName}.`}
        </Empty>
      </Group>
    );
  }
  const warehouseId = warehouses.some((w) => w.id === target) ? target : (defaultPickupWarehouse(state) ?? '');
  const reserved = reservedCargo(state);
  const chosenDriver = drivers.find((d) => d.id === driverId) ?? drivers[0];
  const busy = playerBusyReason(state);
  return (
    <Group
      icon="ship"
      color="goods"
      title={port}
      count={cargo.length}
      note={`${quay}: Ware am Kai ist ein paar Stunden sicher, dann wird der Zoll neugierig.`}
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
                    bis {clock.formatTime(cargoRiskFrom(c, state))}
                  </Tag>
                )
              }
            >
              <ItemContent
                icon="package"
                color="goods"
                title={`${formatProductAmount(c.productId, c.amount)} ${productName(c.productId)}`}
                tags={[
                  reserved.has(c.id) && { label: 'heute Nacht', icon: 'moon', color: 'place' },
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
        <VehicleSelect state={state} cityId={cityId} value={vehicle} onChange={setVehicle} />
        <ChoiceControl value={choice} onChange={setChoice} />
        <div class="logi-actions">
          <Button
            variant="primary"
            icon="truck"
            disabled={!chosenDriver}
            title={chosenDriver ? chosenDriver.name : 'Kein freier Fahrer'}
            onClick={() =>
              dispatch({
                type: 'logistics.pickup',
                payload: {
                  by: 'driver',
                  driverId: chosenDriver?.id,
                  warehouseId,
                  vehicleId: vehicleChoice(vehicle),
                  choice,
                },
              })
            }
          >
            {chosenDriver ? `${chosenDriver.name.split(' ')[0]} schicken` : 'Kein Fahrer frei'}
          </Button>
          <Button
            icon="car"
            disabled={!!busy}
            title={busy ?? 'Du fährst selbst'}
            onClick={() =>
              dispatch({
                type: 'logistics.pickup',
                payload: { by: 'player', warehouseId, vehicleId: vehicleChoice(vehicle), choice },
              })
            }
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
  const [vehicle, setVehicle] = useState(AUTO);
  const [choice, setChoice] = useState<RouteChoice>('autobahn');
  // Kauf mit Rückfrage (J11): ein Tipp kaufte vorher sofort.
  const [buying, setBuying] = useState<Warehouse | null>(null);
  const from = owned.find((w) => w.id === props.warehouseId) ?? owned[0];
  const targets = owned.filter((w) => w.id !== from?.id);
  const to = targets.find((w) => w.id === toId) ?? targets[0];
  const rows = from ? stockSummary(state, from.id) : [];
  const product = rows.some((r) => r.productId === productId) ? productId : '';
  const drivers = freeDrivers(state);
  const busy = playerBusyReason(state);
  const cargo = getCargo(state);
  // Nur Fahrten dieser Stadt (Auftrag 43, L2: in Berlin stand eine Hamburger Fahrt unter „Unterwegs“).
  const trips = getTrips(state).filter((t) => tripTouchesCity(state, t, activeCity(state)));
  const risky = cargo.some((c) => cargoRisk(state, c) === 'risky');
  const port = !!PORTS[activeCity(state)];
  const transfer = (by: 'player' | 'driver') =>
    from &&
    to &&
    dispatch({
      type: 'logistics.transfer',
      payload: {
        fromId: from.id,
        toId: to.id,
        by,
        vehicleId: vehicleChoice(vehicle),
        choice,
        ...(product ? { productId: product } : {}),
      },
    });
  const forSale = warehouseSites(activeCity(state)).filter((w) => !owned.some((o) => o.id === w.id));
  const buyList = (
    <>
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
                  <Button small disabled={state.wallet.clean < w.cost} onClick={() => setBuying(w)}>
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
          <ActionSheet
            open={buying !== null}
            onClose={() => setBuying(null)}
            title={buying ? `${buying.name} kaufen?` : ''}
            message={buying ? `Kostet ${formatEuro(buying.cost)} sauberes Geld. Gekauft ist gekauft.` : undefined}
            actions={[
              {
                label: buying ? `Kaufen (${formatEuro(buying.cost)})` : 'Kaufen',
                icon: 'building',
                disabled: !buying || state.wallet.clean < buying.cost,
                onSelect: () => {
                  if (buying) dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: buying.id } });
                  setBuying(null);
                },
              },
            ]}
          />
        </Group>
      )}
    </>
  );
  return (
    <>
      {owned.length === 0 && buyList}
      {/* Städte ohne Hafen (L2): nur Routen und Fahrer, kein „Niehler Hafen“. */}
      {!port && (
        <Group icon="route" color="goods" title="Logistik">
          <List>
            <LogisticsLinks />
          </List>
        </Group>
      )}
      {port && (
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
      )}
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
            <VehicleSelect state={state} cityId={from.cityId} value={vehicle} onChange={setVehicle} />
            <ChoiceControl value={choice} onChange={setChoice} />
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
      {owned.length > 0 && buyList}
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
  const ui = useUi();
  // Nach dem Verkauf (Auftrag 43): Der Hafen ist Jansens Halle in Rotterdam, die App Handel zeigt ihn.
  if (isBusinessSold(state)) {
    return (
      <div class="logi-app">
        <Group
          title="Dein Hafen ist jetzt Rotterdam"
          icon="anchor"
          color="goods"
          note="Lager, Zoll, Einkauf im Ausland und Lkw findest du in der App Handel unter „Hafen“."
        >
          <div class="logi-redirect">
            <Button variant="primary" icon="ship" onClick={() => ui.openPhone('trade.app', { view: 'harbor' })}>
              Zum Hafen in der App Handel
            </Button>
          </div>
        </Group>
      </div>
    );
  }
  const trips = getTrips(state).filter((t) => tripTouchesCity(state, t, activeCity(state)));
  // Nur Fahrten in diese Stadt (Auftrag 43, G7: in Hamburg standen die Kölner Fahrten).
  const log = getLogisticsLog(state)
    .filter((entry) => placeCity(state, entry.toId) === activeCity(state))
    .slice(0, 4);
  const drivers = getStaff(state, { role: 'driver', cityId: activeCity(state) }).length;
  return (
    <div class="logi-app">
      <Summary />
      {PORTS[activeCity(state)] ? (
        <>
          <PortSection />
          <BerthGroup />
        </>
      ) : (
        <Group
          icon="anchor"
          color="system"
          title={`Kein Hafen in ${cityName(activeCity(state))}`}
          note={`Schiffe legen nur in ${Object.keys(PORTS).map(cityName).join(' und ')} an. Hier kommt die Ware über die Straße.`}
        />
      )}
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
                  title={placeOf(state, entry.toId)?.name ?? 'Lager'}
                  meta={`${who(state, entry.driverId)}, ${clock.formatTime(entry.at)}`}
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
    // Was eine Nachtfahrt schon holt, braucht keinen Rat mehr.
    const reserved = reservedCargo(state);
    const cargo = getCargo(state).filter((c) => !reserved.has(c.id));
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
    // Erst mit einem Lager in der Stadt (Auftrag 43): Container vom Kai brauchen einen Platz.
    const stored = getWarehouses(state, cityId).length > 0;
    if (stored && !hasBerth(state) && PORTS[cityId] && state.wallet.clean >= berthCost(cityId)) {
      return {
        id: 'logistics.berth',
        priority: 45,
        icon: 'ship',
        title: `Liegeplatz im ${portName(cityId)} mieten`,
        text: (() => {
          const shipper = getSuppliers(state, cityId).find((s) => s.kind === 'port');
          const who = shipper ? `${shipper.contactName} (${shipper.name})` : 'dein Lieferant';
          return cityId === 'hamburg'
            ? `Dann liefert ${who} Container direkt an den Kai, kiloweise.`
            : `Dann liefert ${who} große Mengen per Schiff, viel billiger als die Großstädte.`;
        })(),
        actionLabel: 'Ansehen',
        action: (ui) => ui.openPanel('logistics.port', {}),
      };
    }
    return null;
  },
});

/** Gehört die Ware am Kai zu einer anderen Stadt als der, in der du spielst (dann meldet sie ihr Statthalter)? */
function otherCityCargo(state: GameState, cargoId: number): boolean {
  const cargo = state.modules.logistics.cargo.find((c) => c.id === cargoId);
  return cargo !== undefined && cargo.cityId !== activeCity(state);
}

onGameEvent('cargo.docked', 'logistics.dockedToast', (payload, ui, state) => {
  if (otherCityCargo(state, payload.cargoId)) return;
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
  // Fahrten in einer anderen Stadt (Statthalter) sind nicht deine Sache.
  const city = placeCity(state, payload.toId);
  if (city !== null && city !== activeCity(state)) return;
  const place = getWarehouse(state, payload.toId)?.name ?? 'Lager';
  // Routen in derselben Stadt sind Routine (still im Verlauf); eine Ankunft über die A1 ist ein Banner wert.
  const routine = payload.kind === 'route' && !payload.interCity;
  const items = payload.items ?? [];
  const what =
    items.length > 0 && items.reduce((sum, i) => sum + i.amount, 0) === payload.amount
      ? itemsText(items)
      : `${payload.amount} Einheiten`;
  ui.toast(`Fahrt angekommen: ${what} ${warehousePlace(place, 'in')}.`, 'good', {
    urgent: !routine,
  });
});
onGameEvent('transport.stopped', 'logistics.customsStopToast', (payload, ui, state) => {
  const trip = getTrips(state).find((t) => t.id === payload.tripId);
  if (trip && isInterCityTrip(state, trip))
    ui.toast(`Zoll auf der A1: ${who(state, trip.driverId)} wird kontrolliert!`, 'bad');
});
onGameEvent('transport.seized', 'logistics.seizedToast', (payload, ui) => {
  ui.toast(`Ladung aufgeflogen${payload.arrested ? ', Fahrer festgenommen' : ''}!`, 'bad');
});
// Auftrag 33: Rest am Kai und eigene Fahrt am vollen Lager melden (ein Fahrer schreibt selbst per Handy).
onGameEvent('cargo.leftBehind', 'logistics.leftBehindToast', (payload, ui) => {
  // Nur wenn der Hafen dir auch geschrieben hat (deine Stadt, nicht schon gemeldet; Auftrag 43, M5).
  if (!payload.notify) return;
  ui.toast(
    `${itemsText(payload.items)} ${payload.items.length === 1 ? 'bleibt' : 'bleiben'} am Kai: ${payload.reason === 'vehicle' ? 'Der Wagen ist voll.' : 'Das Lager ist voll, bau es aus oder lager um.'}`,
    'warn',
  );
});
onGameEvent('transport.waiting', 'logistics.waitingToast', (payload, ui, state) => {
  if (payload.driverId !== null) return;
  const place = getWarehouse(state, payload.toId)?.name ?? 'Lager';
  const product = getTrips(state).find((t) => t.id === payload.tripId)?.items[0]?.productId;
  const rest = product ? formatProductAmount(product, payload.rest) : `${payload.rest} Einheiten`;
  ui.toast(`${place} ist voll: ${rest} bleiben in deinem Wagen im Hof.`, 'warn');
});
onGameEvent('transport.lost', 'logistics.lostToast', (_payload, ui) => {
  ui.toast('Fahrt geplatzt, die Ladung ist weg.', 'bad');
});
soundOnEvent('transport.arrived', 'delivery');
soundOnEvent('cargo.docked', 'delivery');
soundOnEvent('transport.stopped', 'siren', { volume: 0.5 });
