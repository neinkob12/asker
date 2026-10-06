// Auftrag 41: Container bestellen (Seite „Einkauf“) und der Schiffs-Tracker. Auf der Bestell-Seite wählst du Ware,
// Größe, Deckladung, Schiff (Linie pro Container oder ein eigenes, freies Schiff), Anzahl und Hafen; unten stehen
// Kosten, Zollrisiko pro Container und Ankunft. Der Tracker zeigt alle eigenen Schiffe und die Container auf der Linie.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatNumber, type GameState } from '../../../core';
import {
  ActionSheet,
  Button,
  Group,
  Hint,
  ItemContent,
  List,
  ListItem,
  registerPanel,
  SegmentedControl,
  Select,
  Stepper,
  useGame,
  useUi,
} from '../../../ui';
import { HARBOR_CITY } from '../../city';
import {
  getVehicle,
  RESALE_SHARE,
  VEHICLE_MODELS,
  type VehicleModel,
  vehicleModel,
  vehiclePrice,
  vehicleSpec,
  vehicleStatus,
} from '../../fleet';
import { productName } from '../../goods';
import {
  CONTAINER_SIZES,
  COVERS,
  type ContainerSize,
  type Cover,
  containerRisk,
  getOrders,
  getProducer,
  getShipments,
  harborPorts,
  loadCost,
  originStock,
  ownedPorts,
  ownOrigin,
  ownShips,
  portRoom,
  type ShipVoyage,
  shippingMinutes,
  stockWithIncoming,
  voyagePlan,
} from '../index';
import { MissingClean } from './clean';

declare module '../../../ui' {
  interface PanelRegistry {
    /** productId (Auftrag 43): Ware vorausgewählt, z.B. aus „fehlt“ in den Bestellungen. */
    'trade.order': { producerId: string; productId?: string };
  }
}

const kg = (grams: number) => `${formatNumber(Math.round(grams / 100) / 10, 1)} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const days = (minutes: number) => `${formatNumber(Math.round((minutes / 1440) * 10) / 10, 1)} Tage`;
/** Restzeit: ab zwei Tagen in Tagen, sonst Stunden und Minuten. */
export function eta(minutes: number): string {
  const m = Math.max(0, minutes);
  return m >= 2 * 1440 ? days(m) : clock.formatDuration(m);
}
const CHARTER = 'charter';
const CHARTER_MAX = 10;

function portName(id: string): string {
  return harborPorts().find((p) => p.id === id)?.name ?? id;
}

/** Freie eigene Schiffe im Hafen. */
function freeShips(state: GameState): { id: number; name: string }[] {
  return ownShips(state).filter((s) => {
    const v = getVehicle(state, s.id);
    return v !== undefined && vehicleStatus(v) === 'free';
  });
}

function OrderPanel({ producerId, productId: wanted }: { producerId: string; productId?: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const producer = getProducer(producerId);
  // Auftrag 42: Aus dem eigenen Ausfuhrhafen fährt nur, was im Ausfuhrlager liegt.
  const origin = ownOrigin(producerId);
  const stock = origin ? originStock(state, origin.id) : {};
  const products = producer
    ? Object.keys(producer.products).filter((id) => !origin || (stock[id]?.amount ?? 0) > 0)
    : [];
  const ports = ownedPorts(state);
  const [productId, setProduct] = useState(wanted && products.includes(wanted) ? wanted : (products[0] ?? 'weed'));
  const [size, setSize] = useState<ContainerSize['id']>('medium');
  const [cover, setCover] = useState<Cover['id']>('none');
  const [vessel, setVessel] = useState<string>(CHARTER);
  // Aus dem eigenen Ausfuhrlager standardmäßig alles (Auftrag 43), sonst ein Container.
  const [count, setCount] = useState<number | null>(null);
  const [port, setPort] = useState(ports[0] ?? HARBOR_CITY);
  if (!producer) return null;
  if (origin && products.length === 0) {
    return (
      <div class="trade-app">
        <Group
          title={origin.from}
          icon="ship"
          color="goods"
          note="Das Ausfuhrlager ist leer. Nach der Ernte kommt die Ware hierher."
        />
      </div>
    );
  }
  const ships = producer.sea ? freeShips(state) : [];
  const vesselId = vessel !== CHARTER && ships.some((s) => String(s.id) === vessel) ? Number(vessel) : null;
  const target = ports.includes(port) ? port : (ports[0] ?? HARBOR_CITY);
  // Was angenommene Bestellungen von dieser Ware noch brauchen (Auftrag 43), gegen Bestand und Container unterwegs.
  const needed = getOrders(state)
    .filter((o) => o.status === 'accepted')
    .flatMap((o) => o.items)
    .filter((i) => i.productId === productId && i.state === undefined)
    .reduce((sum, i) => sum + i.amount, 0);
  const have = stockWithIncoming(state, target, productId);
  const container = CONTAINER_SIZES.find((c) => c.id === size) ?? CONTAINER_SIZES[0];
  const capacity = vesselId === null ? Infinity : vehicleSpec(state, vesselId).capacity;
  const onHand = origin ? (stock[productId]?.amount ?? 0) : Infinity;
  const max = Math.max(
    1,
    Math.min(CHARTER_MAX, Math.floor(capacity / container.grams), Math.ceil(onHand / container.grams)),
  );
  const n = Math.min(count ?? (origin ? max : 1), max);
  const load = [{ productId, size, cover, count: n }];
  const plan = vesselId === null ? null : voyagePlan(state, vesselId, producer.id, target);
  const total = loadCost(producer.id, load, vesselId !== null) + (plan?.cost ?? 0);
  const risk = containerRisk(state, producer.id, size, target, cover, vesselId, stock[productId]?.pack ?? 1);
  const minutes = plan ? plan.minutes : shippingMinutes(producer.id, target);
  const fits = vesselId === null || n * container.grams <= capacity;
  const arrives = state.time + minutes;
  const grams = n * container.grams;
  // Frist (Auftrag 43, H4): Bestellungen mit dieser Ware, die vor der Ankunft fällig sind.
  const tooLate = getOrders(state)
    .filter((o) => (o.status === 'open' || o.status === 'accepted') && o.dueAt < arrives)
    .filter((o) => o.items.some((i) => i.productId === productId && i.state === undefined));
  const firstDue = tooLate.length > 0 ? Math.min(...tooLate.map((o) => o.dueAt)) : null;
  // Platz (H7): was noch in die Halle passt, wenn alles ankommt, was schon unterwegs ist oder am Kai wartet.
  const incoming = getShipments(state)
    .filter((x) => x.portId === target)
    .reduce((sum, x) => sum + x.amount, 0);
  const room = Math.max(0, portRoom(state, target) - incoming);
  const missingDirty = Math.ceil(total - state.wallet.dirty);
  // Mindestmenge (H7): Wer nur ein paar Kilo braucht, kauft trotzdem eine ganze Kiste.
  const short = Math.max(0, needed - have);
  const leftover = short > 0 ? grams - short : 0;
  const order = () => {
    const result =
      vesselId === null
        ? dispatch({
            type: 'trade.buy',
            payload: { producerId: producer.id, productId, size, cover, count: n, portId: target },
          })
        : dispatch({ type: 'trade.sail', payload: { vesselId, producerId: producer.id, portId: target, load } });
    if (result.ok) ui.closePanel();
  };
  return (
    <div class="trade-app">
      <Group
        title={producer.name}
        icon={producer.byRoad ? 'truck' : 'ship'}
        color="goods"
        note={producer.description}
        value={origin ? `${kg(onHand)} bereit` : undefined}
      >
        {/* Ab vier Waren eine Auswahl statt Reitern (Auftrag 43: bei Jansen waren die Namen abgeschnitten). */}
        {products.length > 1 && products.length <= 3 && (
          <SegmentedControl
            wide
            aria-label="Ware"
            value={productId}
            options={products.map((id) => ({ value: id, label: productName(id) }))}
            onChange={setProduct}
          />
        )}
        {products.length > 3 && (
          <Select
            wide
            label="Ware"
            value={productId}
            options={products.map((id) => ({ value: id, label: productName(id) }))}
            onChange={setProduct}
          />
        )}
        {needed > 0 && (
          <Hint icon="inbox">
            {`Angenommen und noch offen: ${kg(needed)} ${productName(productId)}. Im Hafen oder unterwegs: ${kg(have)}.`}
          </Hint>
        )}
        {!origin && leftover > short && (
          <Hint icon="info">
            {`Es fehlen nur ${kg(short)}, die kleinste Kiste hat ${kg(CONTAINER_SIZES[0].grams)}. Der Rest bleibt in der Halle, bis ihn jemand bestellt.`}
          </Hint>
        )}
      </Group>
      <Group title="Container" icon="boxes" color="goods" note="Klein fällt weniger auf, groß ist billiger pro Gramm.">
        <SegmentedControl
          wide
          aria-label="Größe"
          value={size}
          options={CONTAINER_SIZES.map((c) => ({ value: c.id, label: kg(c.grams) }))}
          onChange={(v) => setSize(v as ContainerSize['id'])}
        />
        <Stepper
          label="Anzahl Container"
          value={n}
          min={1}
          max={max}
          format={(v) => `${v} × ${kg(container.grams)}`}
          onChange={setCount}
        />
      </Group>
      <Group
        title="Deckladung"
        icon="shield"
        color="law"
        note={COVERS.find((c) => c.id === cover)?.description}
        more="Was oben im Container liegt. Bessere Tarnung kostet einen Teil vom Warenwert und senkt die Chance, dass der Zoll den Container aufmacht. Ist der Zoll im Hafen wach, lohnt sich mehr Tarnung."
      >
        <SegmentedControl
          wide
          aria-label="Deckladung"
          value={cover}
          options={COVERS.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(v) => setCover(v as Cover['id'])}
        />
      </Group>
      {producer.sea && (
        <Group
          title="Schiff"
          icon="ship"
          color="place"
          note={
            vesselId === null
              ? 'Linienschiff: Fracht pro Container, fährt sofort.'
              : 'Eigenes Schiff: hin und zurück, keine Fracht, fällt weniger auf.'
          }
        >
          <Select
            wide
            label="Schiff"
            value={vesselId === null ? CHARTER : String(vesselId)}
            options={[
              { value: CHARTER, label: 'Linienschiff (Charter)' },
              ...ships.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
            onChange={setVessel}
          />
        </Group>
      )}
      {ports.length > 1 && (
        <Group title="Ankunft in" icon="anchor" color="place">
          <SegmentedControl
            wide
            aria-label="Hafen"
            value={target}
            options={ports.map((id) => ({ value: id, label: portName(id) }))}
            onChange={setPort}
          />
        </Group>
      )}
      <Group title="Zusammen" icon="cash" color="money" value={formatEuro(total)}>
        <List>
          <ListItem value={pct(risk)}>
            <ItemContent
              icon="anchor"
              color={risk >= 0.15 ? 'danger' : 'law'}
              title="Zoll schaut rein (je Container)"
            />
          </ListItem>
          <ListItem value={days(minutes)}>
            <ItemContent
              icon="clock"
              color={firstDue !== null ? 'danger' : 'place'}
              title={`Ankunft in ${portName(target)}`}
              meta={`${clock.weekdayName(arrives, true)} ${clock.formatTime(arrives)}`}
            />
          </ListItem>
          {firstDue !== null && (
            <ListItem>
              <ItemContent
                icon="alert"
                color="danger"
                title={`Kommt nach der Frist von ${tooLate.length === 1 ? 'einer Bestellung' : `${tooLate.length} Bestellungen`}`}
                meta={`Die erste muss bis ${clock.weekdayName(firstDue, true)} ${clock.formatTime(firstDue)} raus. Ein schnellerer Produzent schafft es vielleicht.`}
              />
            </ListItem>
          )}
          <ListItem value={kg(room)}>
            <ItemContent
              icon="warehouse"
              color={grams > room ? 'danger' : 'goods'}
              title={`Platz in der Halle`}
              meta={
                grams > room
                  ? `${kg(grams - room)} passen nicht und warten am Kai, das kostet Liegegeld.`
                  : 'Mit allem, was schon unterwegs ist.'
              }
            />
          </ListItem>
          {plan && (
            <ListItem value={formatEuro(plan.cost)}>
              <ItemContent icon="ship" color="place" title="Crew und Diesel" />
            </ListItem>
          )}
        </List>
        <Button
          variant="primary"
          wide
          big
          icon={vesselId === null ? 'cart' : 'ship'}
          disabled={!fits || state.wallet.dirty < total}
          onClick={order}
        >
          {vesselId !== null
            ? `Ablegen (${formatEuro(total)})`
            : origin
              ? `Verschiffen (${formatEuro(total)})`
              : `Bestellen (${formatEuro(total)})`}
        </Button>
        {/* Grund unter dem gesperrten Knopf (Auftrag 43, H7). */}
        {!fits && <p class="ui-hint">{`Passt nicht aufs Schiff: höchstens ${kg(capacity)} Ladung.`}</p>}
        {missingDirty > 0 && (
          <List>
            <ListItem onClick={() => ui.openPhone('finance.app')}>
              <ItemContent
                icon="cash"
                color="dirty"
                title={`Dir fehlen ${formatEuro(missingDirty)} Schwarzgeld`}
                meta="Ware kauft man bar. Weniger Container nehmen oder erst Bestellungen ausliefern."
              />
            </ListItem>
          </List>
        )}
      </Group>
    </div>
  );
}

registerPanel({
  id: 'trade.order',
  title: ({ producerId }) => getProducer(producerId)?.country ?? 'Einkauf',
  component: OrderPanel,
});

const PHASE: Record<ShipVoyage['phase'], string> = { out: 'auf dem Weg', loading: 'lädt', back: 'kommt zurück' };

/** Schiffs-Tracker: eigene Schiffe mit Fahrt, Container auf der Linie, Schiffe kaufen. */
export function ShipsGroup() {
  const { state, dispatch } = useGame();
  const [buy, setBuy] = useState<VehicleModel | null>(null);
  const [sell, setSell] = useState<{ id: number; name: string; amount: number } | null>(null);
  const ships = ownShips(state);
  const charter = getShipments(state).filter((x) => x.vesselId === null && x.status !== 'quay');
  const models = VEHICLE_MODELS.filter((m) => m.ship && m.available);
  const price = buy ? vehiclePrice(buy, HARBOR_CITY) : 0;
  return (
    <Group
      title="Schiffe"
      icon="ship"
      color="place"
      count={ships.length + charter.length}
      note={ships.length === 0 && charter.length === 0 ? 'Nichts auf See.' : undefined}
      more="Auf der Linie zahlst du Fracht pro Container und das Schiff fährt sofort. Ein eigenes Schiff fährt hin und zurück, ohne Fracht, mit eigener Crew, die der Zoll seltener kontrolliert. Kaufen mit sauberem Geld."
    >
      <List>
        {ships.map((s) => {
          const v = s.voyage;
          const from = v ? getProducer(v.producerId) : undefined;
          return (
            <ListItem
              key={`own${s.id}`}
              value={v ? eta(v.arrivesAt - state.time) : undefined}
              onClick={
                v
                  ? undefined
                  : () => {
                      const model = vehicleModel(getVehicle(state, s.id)?.model ?? '');
                      const amount = model ? Math.round(vehiclePrice(model, HARBOR_CITY) * RESALE_SHARE) : 0;
                      setSell({ id: s.id, name: s.name, amount });
                    }
              }
            >
              <ItemContent
                icon="ship"
                color={v ? 'place' : 'money'}
                title={s.name}
                tags={
                  v
                    ? [
                        { label: `${PHASE[v.phase]} ${from?.from ?? ''}`.trim(), color: 'place', icon: 'route' },
                        { label: kg(v.grams), color: 'goods', icon: 'package' },
                        { label: `nach ${portName(v.portId)}`, color: 'place', icon: 'anchor' },
                      ]
                    : [{ label: 'im Hafen', color: 'money', icon: 'anchor' }]
                }
              />
            </ListItem>
          );
        })}
        {charter.map((x) => (
          <ListItem key={x.id} value={x.status === 'customs' ? 'Zoll' : eta(x.arrivesAt - state.time)}>
            <ItemContent
              icon={x.status === 'customs' ? 'siren' : 'boxes'}
              color={x.status === 'customs' ? 'danger' : 'place'}
              title={`${kg(x.amount)} ${productName(x.productId)}`}
              tags={[
                { label: 'Linie', color: 'system', icon: 'ship' },
                { label: getProducer(x.producerId)?.country ?? x.producerId, color: 'goods' },
                x.cover !== 'none' && {
                  label: COVERS.find((c) => c.id === x.cover)?.label ?? '',
                  color: 'law',
                  icon: 'shield',
                },
                { label: `nach ${portName(x.portId)}`, color: 'place', icon: 'anchor' },
              ]}
            />
          </ListItem>
        ))}
        {models.map((m) => (
          <ListItem
            key={m.id}
            action
            icon="plus"
            value={formatEuro(vehiclePrice(m, HARBOR_CITY))}
            disabled={state.wallet.clean < vehiclePrice(m, HARBOR_CITY)}
            onClick={() => setBuy(m)}
          >
            {`${m.name} kaufen`}
          </ListItem>
        ))}
        {models.length > 0 && (
          <MissingClean cost={Math.min(...models.map((m) => vehiclePrice(m, HARBOR_CITY)))} what="ein Schiff" />
        )}
      </List>
      <ActionSheet
        open={sell !== null}
        onClose={() => setSell(null)}
        title={sell ? `${sell.name} verkaufen?` : ''}
        message={sell ? `Du bekommst ${formatEuro(sell.amount)} sauberes Geld zurück.` : undefined}
        actions={
          sell
            ? [
                {
                  label: `Verkaufen (${formatEuro(sell.amount)})`,
                  destructive: true,
                  onSelect: () => {
                    dispatch({ type: 'fleet.sell', payload: { vehicleId: sell.id } });
                    setSell(null);
                  },
                },
              ]
            : []
        }
      />
      <ActionSheet
        open={buy !== null}
        onClose={() => setBuy(null)}
        title={buy ? `${buy.name} kaufen?` : ''}
        message={
          buy
            ? `${buy.description} ${kg(buy.capacity)}, ${buy.ship?.kmPerDay ?? 0} km am Tag, ${formatEuro(buy.ship?.costPerDay ?? 0)} am Tag auf See.`
            : undefined
        }
        actions={
          buy
            ? [
                {
                  label: `Kaufen (${formatEuro(price)} sauber)`,
                  icon: 'cart',
                  disabled: state.wallet.clean < price,
                  onSelect: () => {
                    dispatch({ type: 'fleet.buy', payload: { model: buy.id, cityId: HARBOR_CITY } });
                    setBuy(null);
                  },
                },
              ]
            : []
        }
      />
    </Group>
  );
}
