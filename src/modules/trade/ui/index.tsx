// Oberfläche der Hafen-Phase (Auftrag 40): die App „Kunden“ steht dann im Dock statt der Lieferanten. Drei Bereiche:
// Bestellungen (annehmen, ablehnen, Gegenangebot; ausliefern), Kunden (Anteil, Vertrauen, Konkurrenz, dein Preis) und
// Hafen (Ware pro Hafen mit Zoll-Heat, Einkauf bei Produzenten, Container auf See, weitere Häfen). Dazu ein Rat, wenn
// Bestellungen warten, Lieferungen in der Dynamic Island.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatNumber, type GameState } from '../../../core';
import {
  ActionSheet,
  type CategoryColor,
  type ChipSpec,
  Disclosure,
  Group,
  HudPill,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  PhoneScreen,
  registerAdvisor,
  registerHudItem,
  registerLiveActivity,
  registerPhoneApp,
  SegmentedControl,
  type SheetAction,
  Stepper,
  SummaryTiles,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { getVehicles, vehicleName, vehicleStatus } from '../../fleet';
import { productName } from '../../goods';
import { customsHeat, customsLevel } from '../../police';
import {
  CONTAINER_SIZES,
  type ContainerSize,
  CUSTOMER_KINDS,
  type CustomerKind,
  containerCost,
  containerRisk,
  customerContact,
  deliveryEstimate,
  freightCost,
  getCustomer,
  getCustomers,
  getDeliveries,
  getOrders,
  getShipments,
  harborPorts,
  isTradeActive,
  maxFactor,
  openOrders,
  orderItemsText,
  orderValue,
  ownedPorts,
  PRICE_LEVEL_RANGE,
  PRICE_LEVEL_STEP,
  PRODUCERS,
  type Producer,
  pendingDeliveries,
  portFor,
  portStock,
  supplierReputation,
  type TradeOrder,
  tradeStats,
} from '../index';
import './trade.css';

const APP_ID = 'trade.app';
type View = 'orders' | 'customers' | 'harbor';

const kg = (grams: number) => `${formatNumber(Math.round(grams / 100) / 10, 1)} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

function harborName(id: string): string {
  return harborPorts().find((p) => p.id === id)?.name ?? id;
}

/** Kundenname mit Art als Kachel. */
function kindIcon(kind: CustomerKind): string {
  return CUSTOMER_KINDS[kind].icon;
}

const KIND_COLOR: Record<CustomerKind, CategoryColor> = { org: 'brand', gang: 'danger', city: 'place' };

// ---------------------------------------------------------------------------------------------
// Bestellungen

/** Was im besten Hafen für eine Bestellung noch fehlt (Gramm), 0 = alles da. */
function missingFor(state: GameState, order: TradeOrder): number {
  const ports = ownedPorts(state);
  if (ports.length === 0) return order.amount;
  return Math.min(
    ...ports.map((id) =>
      order.items.reduce(
        (sum, item) => sum + Math.max(0, item.amount - (portStock(state, id)[item.productId]?.amount ?? 0)),
        0,
      ),
    ),
  );
}

/** Waren einer Bestellung als Chips. */
function itemChips(items: readonly { productId: string; amount: number }[]): ChipSpec[] {
  return items.map((i) => ({ label: `${kg(i.amount)} ${productName(i.productId)}`, color: 'goods', icon: 'package' }));
}

function OrdersView() {
  const { state, dispatch } = useGame();
  const [ask, setAsk] = useState<{ order: TradeOrder; mode: 'answer' | 'deliver' } | null>(null);
  const open = openOrders(state);
  const pending = pendingDeliveries(state);
  const deliveries = getDeliveries(state);
  const done = getOrders(state)
    .filter((o) => o.status === 'delivered' || o.status === 'failed' || o.status === 'lost')
    .slice(-6)
    .reverse();
  const customer = ask ? getCustomer(state, ask.order.customerId) : undefined;
  const actions: SheetAction[] = [];
  if (ask && customer && ask.mode === 'answer') {
    const o = ask.order;
    actions.push({
      label: `Annehmen (${formatEuro(orderValue(o, 1))})`,
      icon: 'check',
      onSelect: () => {
        dispatch({ type: 'trade.answer', payload: { orderId: o.id, choice: 'accept' } });
        setAsk(null);
      },
    });
    if (!o.guaranteed) {
      for (const up of [0.05, 0.1, 0.15]) {
        const factor = Math.min(maxFactor(o), 1 + up);
        actions.push({
          label: `Gegenangebot ${formatEuro(orderValue(o, factor))} (+${Math.round(up * 100)} %)`,
          icon: 'tag',
          onSelect: () => {
            dispatch({ type: 'trade.answer', payload: { orderId: o.id, choice: 'counter', factor } });
            setAsk(null);
          },
        });
      }
    }
    actions.push({
      label: 'Ablehnen',
      icon: 'xCircle',
      destructive: true,
      onSelect: () => {
        dispatch({ type: 'trade.answer', payload: { orderId: o.id, choice: 'decline' } });
        setAsk(null);
      },
    });
  }
  const port = ask && ask.mode === 'deliver' ? portFor(state, ask.order) : null;
  if (ask && customer && port) {
    const o = ask.order;
    const trip = deliveryEstimate(customer, port);
    const freight = freightCost(o.amount, trip.km);
    actions.push({
      label: `Spedition (${formatEuro(freight)})`,
      icon: 'truck',
      disabled: state.wallet.dirty < freight,
      onSelect: () => {
        dispatch({ type: 'trade.deliver', payload: { orderId: o.id, portId: port } });
        setAsk(null);
      },
    });
    for (const v of getVehicles(state, 'rotterdam').filter((x) => vehicleStatus(x) === 'free')) {
      actions.push({
        label: `${vehicleName(state, v.id)} (ohne Kosten)`,
        icon: 'truck',
        onSelect: () => {
          dispatch({ type: 'trade.deliver', payload: { orderId: o.id, portId: port, vehicleId: v.id } });
          setAsk(null);
        },
      });
    }
  }
  const guaranteed = open.filter((o) => o.guaranteed);
  return (
    <>
      <SummaryTiles
        items={[
          { icon: 'inbox', color: 'warn', value: open.length, label: 'Neu' },
          { icon: 'package', color: 'goods', value: pending.length, label: 'Zu liefern' },
          { icon: 'truck', color: 'place', value: deliveries.length, label: 'Unterwegs' },
        ]}
      />
      <Group
        title="Neue Bestellungen"
        icon="inbox"
        color="warn"
        count={open.length}
        note={open.length === 0 ? 'Montag früh kommen neue.' : 'Antworten bis zum nächsten Morgen.'}
        more="Die Menge ist dein Anteil am Wochenbedarf des Kunden: Er vergleicht dich mit Toni, Hein, Mirko und Daan nach Preis, Qualität und Zuverlässigkeit. Ein Gegenangebot geht bis zu seiner Preisgrenze; liegt die Konkurrenz dann vorn, ist der Auftrag weg. Der Abnahmevertrag der alten Organisationen hat einen festen Preis."
      >
        <List>
          {open.length > 1 && (
            <ListItem
              action
              icon="checkCircle"
              onClick={() => dispatch({ type: 'trade.acceptAll', payload: {} })}
              value={formatEuro(open.reduce((sum, o) => sum + orderValue(o, 1), 0))}
            >
              Alle annehmen
            </ListItem>
          )}
          {guaranteed.length > 0 && guaranteed.length < open.length && (
            <ListItem
              action
              icon="handshake"
              onClick={() => dispatch({ type: 'trade.acceptAll', payload: { guaranteedOnly: true } })}
            >
              Nur Verträge annehmen
            </ListItem>
          )}
          {open.map((o) => {
            const c = getCustomer(state, o.customerId);
            if (!c) return null;
            return (
              <ListItem
                key={o.id}
                value={formatEuro(orderValue(o, 1))}
                onClick={() => setAsk({ order: o, mode: 'answer' })}
              >
                <ItemContent
                  icon={kindIcon(c.kind)}
                  color={KIND_COLOR[c.kind]}
                  title={c.name}
                  tags={[
                    o.guaranteed && { label: 'Vertrag', color: 'brand', icon: 'handshake' },
                    ...itemChips(o.items),
                    {
                      label: `bis ${clock.weekdayName(o.answerBy, true)} ${clock.formatTime(o.answerBy)}`,
                      color: 'warn',
                      icon: 'clock',
                    },
                  ]}
                />
              </ListItem>
            );
          })}
        </List>
      </Group>
      <Group
        title="Zu liefern"
        icon="package"
        color="goods"
        count={pending.length}
        note="Pünktlich bringt Vertrauen, zu spät kostet ein Fünftel."
      >
        <List>
          {pending.map((o) => {
            const c = getCustomer(state, o.customerId);
            if (!c) return null;
            const missing = missingFor(state, o);
            const late = state.time > o.dueAt;
            return (
              <ListItem
                key={o.id}
                value={formatEuro(orderValue(o))}
                onClick={missing === 0 ? () => setAsk({ order: o, mode: 'deliver' }) : undefined}
              >
                <ItemContent
                  icon={kindIcon(c.kind)}
                  color={KIND_COLOR[c.kind]}
                  title={c.name}
                  tags={[
                    missing === 0
                      ? { label: 'Ware da', color: 'money', icon: 'check' }
                      : { label: `fehlt ${kg(missing)}`, color: 'danger', icon: 'alert' },
                    ...itemChips(o.items),
                    {
                      label: late ? 'zu spät' : `bis ${clock.weekdayName(o.dueAt, true)}`,
                      color: late ? 'danger' : 'warn',
                      icon: 'clock',
                    },
                  ]}
                />
              </ListItem>
            );
          })}
        </List>
      </Group>
      {deliveries.length > 0 && (
        <Group title="Unterwegs" icon="truck" color="place" count={deliveries.length}>
          <List>
            {deliveries.map((d) => (
              <ListItem key={d.id} value={clock.formatDuration(Math.max(0, d.arrivesAt - state.time))}>
                <ItemContent
                  icon="truck"
                  color="place"
                  title={getCustomer(state, d.customerId)?.name ?? d.customerId}
                  tags={[
                    ...itemChips(d.items),
                    { label: `ab ${harborName(d.portId)}`, color: 'place', icon: 'anchor' },
                  ]}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {done.length > 0 && (
        <Group title="Zuletzt" icon="list" color="system" collapsible open={false}>
          <List>
            {done.map((o) => (
              <ListItem key={o.id} value={o.revenue ? formatEuro(o.revenue) : undefined}>
                <ItemContent
                  icon={o.status === 'delivered' ? 'checkCircle' : 'xCircle'}
                  color={o.status === 'delivered' ? 'money' : 'danger'}
                  title={getCustomer(state, o.customerId)?.name ?? o.customerId}
                  tags={[
                    { label: kg(o.amount), color: 'goods', icon: 'package' },
                    o.status === 'lost' && { label: `an ${o.lostTo ?? 'Konkurrenz'}`, color: 'danger' },
                    o.status === 'failed' && { label: 'geplatzt', color: 'danger' },
                  ]}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      <ActionSheet
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={ask && customer ? customer.name : ''}
        message={
          ask && customer
            ? ask.mode === 'answer'
              ? `${orderItemsText(ask.order.items)}. Höchstens ${formatEuro(orderValue(ask.order, maxFactor(ask.order)))}.`
              : `${orderItemsText(ask.order.items)} aus ${harborName(port ?? 'rotterdam')}, Zahlung bei Ankunft.`
            : undefined
        }
        actions={actions}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Kunden

const KIND_GROUPS: { kind: CustomerKind; title: string; note: string }[] = [
  { kind: 'org', title: 'Alte Organisationen', note: 'Zuverlässig, fairer Preis, große Mengen.' },
  { kind: 'gang', title: 'Gangs', note: 'Zahlen ein Fünftel mehr, aber ein Deal kann kippen.' },
  { kind: 'city', title: 'Fremde Städte', note: 'Neue Kunden: Vertrauen muss erst wachsen.' },
];

function CustomersView() {
  const { state, dispatch } = useGame();
  const rep = supplierReputation(state);
  const stats = tradeStats(state);
  const level = state.modules.trade.priceLevel;
  const share = stats.demand > 0 ? stats.ordered / stats.demand : 0;
  return (
    <>
      <SummaryTiles
        items={[
          { icon: 'chart', color: 'money', value: pct(share), label: 'Marktanteil' },
          { icon: 'clock', color: 'place', value: pct(rep.reliability), label: 'Pünktlich' },
          { icon: 'gem', color: 'goods', value: pct(rep.quality), label: 'Qualität' },
        ]}
      />
      <Group
        title="Dein Preis"
        icon="tag"
        color="money"
        value={pct(level)}
        note="Faktor auf den fairen Großhandelspreis (Marktindex)."
        more="Billiger bringt mehr Anteil, teurer mehr pro Gramm. Pünktliche Lieferungen und gute Qualität heben deinen Ruf, Vertrauen kommt mit jedem Geschäft."
      >
        <Stepper
          label="Dein Preis"
          value={level}
          min={PRICE_LEVEL_RANGE[0]}
          max={PRICE_LEVEL_RANGE[1]}
          step={PRICE_LEVEL_STEP}
          format={(v) => pct(v)}
          onChange={(v) => dispatch({ type: 'trade.setPriceLevel', payload: { level: v } })}
        />
      </Group>
      {KIND_GROUPS.map((g) => {
        const list = getCustomers(state).filter((c) => c.kind === g.kind);
        if (list.length === 0) return null;
        return (
          <Group
            key={g.kind}
            title={g.title}
            icon={kindIcon(g.kind)}
            color={KIND_COLOR[g.kind]}
            count={list.length}
            note={g.note}
          >
            <List>
              {list.map((c) => {
                const weekly = Object.values(c.weekly).reduce((a, b) => a + b, 0);
                const contact = customerContact(state, c);
                return (
                  <ListItem key={c.id} value={`${kg(weekly)}/Wo.`}>
                    <ItemContent
                      icon={kindIcon(c.kind)}
                      color={KIND_COLOR[c.kind]}
                      title={c.name}
                      meta={contact.name !== c.name ? contact.name : undefined}
                      tags={[
                        { label: `Anteil ${pct(c.share)}`, color: c.share >= 0.4 ? 'money' : 'warn', icon: 'chart' },
                        {
                          label: `Vertrauen ${c.trust}`,
                          color: c.trust >= 50 ? 'people' : 'danger',
                          icon: 'handshake',
                        },
                        c.topRival !== null &&
                          c.share < 0.5 && { label: `vorn: ${c.topRival}`, color: 'danger', icon: 'trendDown' },
                      ]}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Hafen

function HarborView() {
  const { state, dispatch } = useGame();
  const ports = ownedPorts(state);
  const [port, setPort] = useState(ports[0] ?? 'rotterdam');
  const [producer, setProducer] = useState<Producer | null>(null);
  const shipments = getShipments(state);
  const stats = tradeStats(state);
  const target = ports.includes(port) ? port : (ports[0] ?? 'rotterdam');
  const buyActions: SheetAction[] = producer
    ? Object.keys(producer.products).flatMap((productId) =>
        CONTAINER_SIZES.map((size: ContainerSize) => {
          const cost = containerCost(producer.id, productId, size.id);
          const total = cost.goods + cost.freight;
          const risk = containerRisk(state, producer.id, size.id, target);
          return {
            label: `${size.label} ${productName(productId)}: ${formatEuro(total)}, Zoll ${pct(risk)}`,
            icon: 'boxes',
            disabled: state.wallet.dirty < total,
            onSelect: () => {
              dispatch({
                type: 'trade.buy',
                payload: { producerId: producer.id, productId, size: size.id, portId: target },
              });
              setProducer(null);
            },
          };
        }),
      )
    : [];
  return (
    <>
      <SummaryTiles
        items={[
          { icon: 'ship', color: 'place', value: shipments.length, label: 'Auf See' },
          { icon: 'boxes', color: 'goods', value: stats.containers, label: 'Container' },
          { icon: 'anchor', color: 'danger', value: stats.seized, label: 'Aufgeflogen' },
        ]}
      />
      {ports.map((id) => {
        const lots = Object.entries(portStock(state, id));
        const heat = customsHeat(state, id);
        const level = customsLevel(heat);
        return (
          <Group
            key={id}
            title={`Lager ${harborName(id)}`}
            icon="warehouse"
            color="goods"
            value={`Zoll ${level.label}`}
            note={lots.length === 0 ? 'Leer. Bestell Container unten.' : undefined}
          >
            <List>
              {lots.map(([productId, lot]) => (
                <ListItem key={productId} value={kg(lot.amount)}>
                  <ItemContent
                    icon="package"
                    color="goods"
                    title={productName(productId)}
                    tags={[{ label: `Qualität ${pct(lot.quality)}`, color: 'goods', icon: 'gem' }]}
                  />
                </ListItem>
              ))}
              <ListItem>
                <ItemContent
                  icon="anchor"
                  color="law"
                  title="Zoll-Heat"
                  tags={[
                    { label: `${Math.round(heat)} von 100`, color: level.index >= 2 ? 'danger' : 'law', icon: 'flame' },
                  ]}
                />
              </ListItem>
            </List>
          </Group>
        );
      })}
      <Group
        title="Einkauf im Ausland"
        icon="ship"
        color="goods"
        note={`Ankunft in ${harborName(target)}.`}
        more="Kleine Kisten fallen dem Zoll seltener auf, große Container sind billiger pro Gramm. Jedes Kilo im Hafen macht den Zoll wacher, mit der Zeit kühlt er ab. Verteilen auf mehrere Häfen senkt das Risiko."
      >
        {ports.length > 1 && (
          <SegmentedControl
            wide
            aria-label="Hafen"
            value={target}
            options={ports.map((id) => ({ value: id, label: harborName(id) }))}
            onChange={setPort}
          />
        )}
        <List>
          {PRODUCERS.map((p) => (
            <ListItem key={p.id} onClick={() => setProducer(p)} value={`${p.days} T.`}>
              <ItemContent
                icon={p.byRoad ? 'truck' : 'ship'}
                color="goods"
                title={p.name}
                meta={p.country}
                tags={[
                  ...Object.keys(p.products)
                    .slice(0, 3)
                    .map((id) => ({ label: productName(id), color: 'goods' as const })),
                  { label: `Qualität ${pct(p.quality)}`, color: 'goods', icon: 'gem' },
                ]}
              />
            </ListItem>
          ))}
        </List>
      </Group>
      {shipments.length > 0 && (
        <Group title="Auf See" icon="ship" color="place" count={shipments.length}>
          <List>
            {shipments.map((x) => (
              <ListItem
                key={x.id}
                value={x.status === 'customs' ? 'Zoll' : clock.formatDuration(Math.max(0, x.arrivesAt - state.time))}
              >
                <ItemContent
                  icon={x.status === 'customs' ? 'siren' : 'ship'}
                  color={x.status === 'customs' ? 'danger' : 'place'}
                  title={`${kg(x.amount)} ${productName(x.productId)}`}
                  tags={[
                    { label: PRODUCERS.find((p) => p.id === x.producerId)?.country ?? x.producerId, color: 'goods' },
                    { label: `nach ${harborName(x.portId)}`, color: 'place', icon: 'anchor' },
                  ]}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      <Group title="Weitere Häfen" icon="anchor" color="place" collapsible open={false}>
        <List>
          {harborPorts()
            .filter((p) => !ports.includes(p.id))
            .map((p) => (
              <ListItem
                key={p.id}
                value={formatEuro(p.berthCost)}
                onClick={() => dispatch({ type: 'trade.rentBerth', payload: { portId: p.id } })}
                disabled={state.wallet.clean < p.berthCost}
              >
                <ItemContent
                  icon="anchor"
                  color="place"
                  title={p.name}
                  meta={p.description}
                  tags={[{ label: `Zoll ${pct(p.customsFactor)}`, color: 'law', icon: 'shield' }]}
                />
              </ListItem>
            ))}
        </List>
      </Group>
      <Disclosure label="Was ist der Zoll-Heat?">
        Wie die Heat eines Veedels: Menge treibt ihn, Zeit kühlt ihn ab. Je höher, desto öfter wird ein ankommender
        Container kontrolliert.
      </Disclosure>
      <ActionSheet
        open={producer !== null}
        onClose={() => setProducer(null)}
        title={producer ? `${producer.name} (${producer.country})` : ''}
        message={producer?.description}
        actions={buyActions}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// App

function TradeApp() {
  const { state } = useGame();
  const [view, setView] = useState<View>('orders');
  if (!isTradeActive(state)) {
    return (
      <PhoneScreen title="Kunden">
        <Group
          title="Noch nicht"
          icon="handshake"
          color="system"
          note="Erst nach dem Verkauf des Geschäfts lieferst du an alle."
        />
      </PhoneScreen>
    );
  }
  const waiting = openOrders(state).length;
  const toDeliver = pendingDeliveries(state).length;
  return (
    <PhoneScreen title="Kunden">
      <div class="trade-app">
        <SegmentedControl
          wide
          aria-label="Bereich"
          value={view}
          options={[
            { value: 'orders', label: 'Bestellungen', badge: waiting + toDeliver },
            { value: 'customers', label: 'Kunden' },
            { value: 'harbor', label: 'Hafen' },
          ]}
          onChange={(v) => setView(v as View)}
        />
        {view === 'orders' && <OrdersView />}
        {view === 'customers' && <CustomersView />}
        {view === 'harbor' && <HarborView />}
      </div>
    </PhoneScreen>
  );
}

registerPhoneApp({
  id: APP_ID,
  name: 'Kunden',
  icon: 'handshake',
  order: 19,
  color: 'money',
  chrome: 'none',
  component: TradeApp,
  badge: (state) => openOrders(state).length,
  dock: { replaces: 'suppliers.app', when: isTradeActive },
});

/** HUD in der Hafen-Phase: Ware in allen Häfen (statt des Lagers der Stadt). */
function HarborHud() {
  const { state } = useGame();
  const ui = useUi();
  if (!isTradeActive(state)) return null;
  const total = ownedPorts(state).reduce(
    (sum, id) => sum + Object.values(portStock(state, id)).reduce((s, lot) => s + lot.amount, 0),
    0,
  );
  const atSea = getShipments(state).length;
  return (
    <HudPill
      icon="anchor"
      color="goods"
      label="Häfen"
      value={total > 0 ? kg(total) : 'leer'}
      title={`${kg(total)} in den Häfen, ${atSea} Container auf See`}
      tone={total === 0 ? 'bad' : undefined}
      onClick={() => ui.openPhone(APP_ID)}
    />
  );
}

registerHudItem({ id: 'trade.harbor', order: 20, placement: 'more', icon: 'anchor', component: HarborHud });

registerAdvisor({
  id: 'trade.orders',
  advise(state) {
    if (!isTradeActive(state)) return null;
    const open = openOrders(state).length;
    if (open > 0) {
      return {
        id: 'trade.orders',
        priority: 82,
        icon: 'inbox',
        title: `${open} ${open === 1 ? 'Bestellung wartet' : 'Bestellungen warten'}`,
        action: (ui) => ui.openPhone(APP_ID),
      };
    }
    const ready = pendingDeliveries(state).length;
    if (ready > 0) {
      return {
        id: 'trade.deliver',
        priority: 60,
        icon: 'package',
        title: `${ready} ${ready === 1 ? 'Lieferung' : 'Lieferungen'} offen`,
        action: (ui) => ui.openPhone(APP_ID),
      };
    }
    return null;
  },
});

registerLiveActivity({
  id: 'trade.deliveries',
  activities(state) {
    const list = getDeliveries(state);
    if (list.length === 0) return null;
    const next = [...list].sort((a, b) => a.arrivesAt - b.arrivesAt)[0];
    const total = Math.max(1, next.arrivesAt - next.departedAt);
    return {
      id: 'trade.delivery',
      priority: 50,
      icon: 'truck',
      tone: 'info',
      leading: 'Lkw',
      trailing: clock.formatDuration(Math.max(0, next.arrivesAt - state.time)),
      title: `Lieferung an ${getCustomer(state, next.customerId)?.name ?? ''}`,
      detail: `${orderItemsText(next.items)}${list.length > 1 ? `, ${list.length - 1} weitere` : ''}`,
      progress: Math.min(1, (state.time - next.departedAt) / total),
      open: (ui) => ui.openPhone(APP_ID),
    };
  },
});

onGameEvent('trade.containerSeized', 'trade.seizedToast', (payload, ui) => {
  ui.toast(`Container aufgeflogen in ${harborName(payload.portId)}: ${kg(payload.amount)} weg.`, 'bad');
});
onGameEvent('trade.delivered', 'trade.deliveredToast', (payload, ui, state) => {
  ui.toast(`${getCustomer(state, payload.customerId)?.name ?? 'Kunde'} zahlt ${formatEuro(payload.revenue)}.`, 'good');
});
onGameEvent('trade.dealTipped', 'trade.tippedToast', (payload, ui, state) => {
  ui.toast(`${getCustomer(state, payload.customerId)?.name ?? 'Die Gang'} hat nicht gezahlt.`, 'bad');
});
soundOnEvent('trade.delivered', 'cash');
