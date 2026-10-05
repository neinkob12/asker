// Oberfläche der Hafen-Phase (Auftrag 40): die App „Kunden“ steht dann im Dock statt der Lieferanten. Drei Bereiche:
// Bestellungen (annehmen, ablehnen, Gegenangebot; ausliefern), Kunden (Anteil, Vertrauen, Konkurrenz, dein Preis) und
// Hafen (Ware pro Hafen mit Zoll-Heat, Einkauf bei Produzenten, Container auf See, weitere Häfen). Dazu ein Rat, wenn
// Bestellungen warten, Lieferungen in der Dynamic Island, die Europa-Ansicht auf der Karte (map.ts).

import { useEffect, useState } from 'preact/hooks';
import { clock, formatEuro, formatNumber, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  ActionSheet,
  type Advice,
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
  Slot,
  Stepper,
  SummaryTiles,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { HARBOR_CITY } from '../../city';
import {
  freeVehicles,
  getVehicles,
  isShip,
  VEHICLE_MODELS,
  vehicleName,
  vehiclePrice,
  vehicleStatus,
} from '../../fleet';
import { productName } from '../../goods';
import { isGrowStarted } from '../../grow';
import { customsHeat, customsLevel } from '../../police';
import {
  CUSTOMER_KINDS,
  type CustomerKind,
  customerContact,
  deliveryCheckChance,
  deliveryEstimate,
  EUROPE_CITIES,
  europeCityOf,
  europeStatus,
  freightCost,
  getCustomer,
  getCustomers,
  getDeliveries,
  getOrders,
  getShipments,
  harborPorts,
  isTradeActive,
  MAX_HALLS,
  maxFactor,
  openItems,
  openOrders,
  orderCoverage,
  orderItemsText,
  orderValue,
  ownedPorts,
  PRICE_LEVEL_RANGE,
  PRICE_LEVEL_STEP,
  PRODUCERS,
  pendingDeliveries,
  portCapacity,
  portFor,
  portHalls,
  portLoad,
  portStock,
  shippableItems,
  shippingMinutes,
  supplierReputation,
  type TradeOrder,
  tradeStats,
  weekOf,
} from '../index';
import { europeLayer } from './map';
import { ShipsGroup } from './order';
import './trade.css';

declare module '../../../ui' {
  interface SlotRegistry {
    /** Auftrag 42: Abschnitt „Anbau“ der Kunden-App (grow: Regionen, Fincas, Ausfuhr, Ziele). */
    'trade.grow': Record<string, never>;
  }
}

const APP_ID = 'trade.app';
type View = 'orders' | 'customers' | 'harbor' | 'grow';

const kg = (grams: number) => `${formatNumber(Math.round(grams / 100) / 10, 1)} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

function harborName(id: string): string {
  return harborPorts().find((p) => p.id === id)?.name ?? id;
}

/** Kundenname mit Art als Kachel. */
function kindIcon(kind: CustomerKind): string {
  return CUSTOMER_KINDS[kind].icon;
}

const KIND_COLOR: Record<CustomerKind, CategoryColor> = {
  org: 'brand',
  gang: 'danger',
  city: 'place',
  europe: 'people',
};

// ---------------------------------------------------------------------------------------------
// Bestellungen

/** Was im besten Hafen für eine Bestellung noch fehlt (Gramm), 0 = alles da. */
function missingFor(state: GameState, order: TradeOrder): number {
  const ports = ownedPorts(state);
  if (ports.length === 0) return order.amount;
  return Math.min(
    ...ports.map((id) =>
      openItems(order).reduce(
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

/** Ware, die für eine Bestellung im Hafen fehlt (Gramm pro Sorte). */
function missingItems(state: GameState, order: TradeOrder): { productId: string; amount: number }[] {
  const port = ownedPorts(state)[0] ?? HARBOR_CITY;
  return openItems(order)
    .map((item) => ({
      productId: item.productId,
      amount: Math.max(0, item.amount - (portStock(state, port)[item.productId]?.amount ?? 0)),
    }))
    .filter((item) => item.amount > 0);
}

/** Produzenten für eine Ware, der schnellste zuerst. */
function producersFor(productId: string, portId: string) {
  return PRODUCERS.filter((p) => p.products[productId] !== undefined).sort(
    (a, b) => shippingMinutes(a.id, portId) - shippingMinutes(b.id, portId),
  );
}

/** Die Woche als Lieferant in vier Schritten (Auftrag 43): in den ersten zwei Wochen offen, danach eingeklappt. */
const HARBOR_STEPS: { icon: string; color: CategoryColor; title: string; text: string }[] = [
  {
    icon: 'inbox',
    color: 'warn',
    title: 'Montag: Bestellungen',
    text: 'Jeder Kunde bestellt einmal pro Woche. Annehmen, ablehnen oder mehr verlangen.',
  },
  {
    icon: 'ship',
    color: 'goods',
    title: 'Einkauf im Ausland',
    text: 'Container bei Produzenten, ein paar Tage auf See. Rechtzeitig bestellen.',
  },
  {
    icon: 'anchor',
    color: 'law',
    title: 'Hafen und Zoll',
    text: 'Jeder Container kann kontrolliert werden. Viel Ware macht den Zoll wach.',
  },
  {
    icon: 'truck',
    color: 'place',
    title: 'Ausliefern',
    text: 'Spedition oder eigener Lkw bis zur Frist. Pünktlich bringt mehr Bestellungen.',
  },
];

function HarborGuide() {
  const { state } = useGame();
  const started = state.modules.trade.startedAt ?? state.time;
  const fresh = weekOf(state.time) - weekOf(started) < 2;
  return (
    <Group title="So läuft der Hafen" icon="help" color="system" collapsible open={fresh}>
      <List>
        {HARBOR_STEPS.map((step, i) => (
          <ListItem key={step.title}>
            <ItemContent icon={step.icon} color={step.color} title={`${i + 1}. ${step.title}`} meta={step.text} />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

function OrdersView(props: { onView: (view: View) => void }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [ask, setAsk] = useState<{ order: TradeOrder; mode: 'answer' | 'deliver' | 'buy' } | null>(null);
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
    const grams = shippableItems(state, port, o).reduce((sum, i) => sum + i.amount, 0);
    const freight = freightCost(grams, trip.km);
    // Die Wahl: Spedition kostet, fällt aber seltener auf; der eigene Lkw ist umsonst, wird öfter kontrolliert und
    // kann bei einer Kontrolle mit der Ladung weg sein.
    actions.push({
      label: `Spedition: ${formatEuro(freight)}, Zoll ${pct(deliveryCheckChance(state, customer, port))}`,
      icon: 'truck',
      disabled: state.wallet.dirty < freight,
      onSelect: () => {
        dispatch({ type: 'trade.deliver', payload: { orderId: o.id, portId: port } });
        setAsk(null);
      },
    });
    const trucks = freeVehicles(state, HARBOR_CITY);
    for (const v of trucks) {
      actions.push({
        label: `${vehicleName(state, v.id)}: ohne Kosten, Zoll ${pct(deliveryCheckChance(state, customer, port, v.id))}`,
        icon: 'truck',
        onSelect: () => {
          dispatch({ type: 'trade.deliver', payload: { orderId: o.id, portId: port, vehicleId: v.id } });
          setAsk(null);
        },
      });
    }
    // Ohne freien Lkw (Auftrag 43): Wo es einen gibt.
    if (trucks.length === 0) {
      actions.push({
        label: 'Eigener Lkw: unter „Hafen“ kaufen',
        icon: 'plusCircle',
        onSelect: () => {
          setAsk(null);
          props.onView('harbor');
        },
      });
    }
  }
  // Fehlt Ware (Auftrag 43): direkt zum Einkauf, die Ware ist vorausgewählt.
  if (ask && customer && ask.mode === 'buy') {
    const portId = ownedPorts(state)[0] ?? HARBOR_CITY;
    for (const item of missingItems(state, ask.order)) {
      for (const p of producersFor(item.productId, portId).slice(0, 2)) {
        actions.push({
          label: `${productName(item.productId)} bei ${p.name} (${Math.round(shippingMinutes(p.id, portId) / 1440)} Tage)`,
          icon: p.byRoad ? 'truck' : 'ship',
          onSelect: () => {
            setAsk(null);
            ui.openPanel('trade.order', { producerId: p.id, productId: item.productId });
          },
        });
      }
    }
  }
  const guaranteed = open.filter((o) => o.guaranteed);
  const coverage = orderCoverage(state);
  const covered = open.filter((o) => coverage.get(o.id) === 0);
  return (
    <>
      <HarborGuide />
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
        more="Die Menge ist dein Anteil am Wochenbedarf des Kunden: Er vergleicht dich mit Toni, Hein, Mirko und Daan nach Preis, Qualität und Zuverlässigkeit. Ein Gegenangebot geht bis zu seiner Preisgrenze; liegt die Konkurrenz dann vorn, ist der Auftrag weg. Der Abnahmevertrag der alten Organisationen hat einen festen Preis. „Ware da“ zählt den Bestand in deinen Häfen und Container, die vor der Frist ankommen, abzüglich dessen, was angenommene Bestellungen brauchen."
      >
        <List>
          {covered.length > 0 && (covered.length < open.length || open.length > 1) && (
            <ListItem
              action
              icon="checkCircle"
              onClick={() => dispatch({ type: 'trade.acceptAll', payload: { coveredOnly: true } })}
              value={formatEuro(covered.reduce((sum, o) => sum + orderValue(o, 1), 0))}
            >
              {covered.length === open.length ? 'Alle annehmen' : `Gedeckte annehmen (${covered.length})`}
            </ListItem>
          )}
          {open.length > 1 && covered.length < open.length && (
            <ListItem
              action
              icon="alert"
              onClick={() => dispatch({ type: 'trade.acceptAll', payload: {} })}
              value={formatEuro(open.reduce((sum, o) => sum + orderValue(o, 1), 0))}
            >
              {`Alle annehmen (${open.length - covered.length} ohne Ware)`}
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
                    (coverage.get(o.id) ?? 0) === 0
                      ? { label: 'Ware da', color: 'money', icon: 'check' }
                      : { label: `fehlt ${kg(coverage.get(o.id) ?? 0)}`, color: 'danger', icon: 'alert' },
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
            const some = portFor(state, o) !== null;
            const late = state.time > o.dueAt;
            const rest = openItems(o);
            return (
              <ListItem
                key={o.id}
                value={formatEuro(orderValue(o))}
                onClick={() => setAsk({ order: o, mode: some ? 'deliver' : 'buy' })}
              >
                <ItemContent
                  icon={kindIcon(c.kind)}
                  color={KIND_COLOR[c.kind]}
                  title={c.name}
                  tags={[
                    missing === 0
                      ? { label: 'Ware da', color: 'money', icon: 'check' }
                      : some
                        ? { label: 'teilweise da', color: 'warn', icon: 'package' }
                        : { label: `fehlt ${kg(missing)}`, color: 'danger', icon: 'alert' },
                    rest.length < o.items.length && { label: 'Rest offen', color: 'place', icon: 'truck' },
                    ...itemChips(rest),
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
              : ask.mode === 'buy'
                ? `Im Hafen fehlt ${orderItemsText(missingItems(state, ask.order))}. Kauf es bei einem Produzenten, vor der Frist ${clock.weekdayName(ask.order.dueAt, true)} ${clock.formatTime(ask.order.dueAt)}.`
                : `${orderItemsText(port ? shippableItems(state, port, ask.order) : [])} aus ${harborName(port ?? 'rotterdam')}, Zahlung bei Ankunft.${europeCityOf(customer) ? ` Zoll steht ${europeCityOf(customer)?.border.name}.` : ''}`
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
  { kind: 'europe', title: 'Europa', note: 'Zahlen mehr, aber an der Grenze steht der Zoll.' },
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
        note="Gilt ab den nächsten Bestellungen am Montag."
        more="Faktor auf den fairen Großhandelspreis (Marktindex). Billiger bringt mehr Anteil am Bedarf, aber weniger pro Gramm; teurer bringt mehr pro Gramm, aber die Kunden kaufen mehr bei der Konkurrenz. Der Abnahmevertrag der alten Organisationen hat einen festen Preis. Pünktliche Lieferungen und gute Qualität heben deinen Ruf, Vertrauen kommt mit jedem Geschäft."
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
        const coming = g.kind === 'europe' ? EUROPE_CITIES.filter((c) => !europeStatus(state, c).joined) : [];
        if (list.length === 0 && coming.length === 0) return null;
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
              {coming.map((city) => {
                const status = europeStatus(state, city);
                const wait = status.week - weekOf(state.time);
                return (
                  <ListItem key={city.id} value={city.country}>
                    <ItemContent
                      icon="globe"
                      color="system"
                      title={city.name}
                      tags={[
                        wait > 0
                          ? {
                              label: wait === 1 ? 'ab nächster Woche' : `in ${wait} Wochen`,
                              color: 'system',
                              icon: 'clock',
                            }
                          : status.reliable && { label: 'meldet sich Montag', color: 'people', icon: 'clock' },
                        !status.reliable && { label: 'will pünktlichen Ruf', color: 'warn', icon: 'alert' },
                        { label: `Zoll ${pct(city.border.check)}`, color: 'law', icon: 'shield' },
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

/** Rückfrage vor einer Ausgabe mit sauberem Geld (Halle, Liegeplatz). */
type Confirm = { title: string; message: string; label: string; cost: number; run: () => void } | null;

const TRUCK_STATUS = {
  free: { label: 'frei', color: 'money' },
  busy: { label: 'unterwegs', color: 'goods' },
  seized: { label: 'beschlagnahmt', color: 'danger' },
} as const;

/**
 * Lkw der Hafen-Phase (Auftrag 43): Hier kauft man sie, wo man sie braucht (vorher nur in der Lager-App). Ohne Lkw
 * fährt die Spedition gegen Fracht.
 */
function TrucksGroup(props: { onBuy: (price: number, run: () => void) => void }) {
  const { state, dispatch } = useGame();
  const trucks = getVehicles(state, HARBOR_CITY).filter((v) => !isShip(v));
  const model = VEHICLE_MODELS.find((m) => m.harborOnly && !m.ship && m.available);
  const price = model ? vehiclePrice(model, HARBOR_CITY) : 0;
  return (
    <Group
      title="Lkw"
      icon="truck"
      color="goods"
      count={trucks.length}
      note={
        trucks.length === 0
          ? 'Ohne eigenen Lkw liefert die Spedition, gegen Fracht.'
          : 'Eigene Lkw fahren ohne Fracht, der Zoll winkt sie öfter raus.'
      }
    >
      <List>
        {trucks.map((v) => {
          const status = TRUCK_STATUS[vehicleStatus(v)];
          return (
            <ListItem key={v.id}>
              <ItemContent
                icon="truck"
                color="goods"
                title={vehicleName(state, v.id)}
                tags={[{ label: status.label, color: status.color }]}
              />
            </ListItem>
          );
        })}
        {model && (
          <ListItem
            action
            icon="plusCircle"
            value={formatEuro(price)}
            disabled={state.wallet.clean < price}
            onClick={() =>
              props.onBuy(price, () =>
                dispatch({ type: 'fleet.buy', payload: { model: model.id, cityId: HARBOR_CITY } }),
              )
            }
          >
            Lkw kaufen
          </ListItem>
        )}
      </List>
    </Group>
  );
}

function HarborView() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const ports = ownedPorts(state);
  const shipments = getShipments(state);
  const stats = tradeStats(state);
  const target = ports[0] ?? 'rotterdam';
  return (
    <>
      <SummaryTiles
        items={[
          { icon: 'ship', color: 'place', value: shipments.filter((x) => x.status === 'sea').length, label: 'Auf See' },
          { icon: 'boxes', color: 'goods', value: stats.containers, label: 'Container' },
          { icon: 'anchor', color: 'danger', value: stats.seized, label: 'Aufgeflogen' },
        ]}
      />
      {ports.map((id) => {
        const lots = Object.entries(portStock(state, id));
        const heat = customsHeat(state, id);
        const level = customsLevel(heat);
        const load = portLoad(state, id);
        const capacity = portCapacity(state, id);
        const halls = portHalls(state, id);
        const info = harborPorts().find((p) => p.id === id);
        const waiting = shipments.filter((x) => x.status === 'quay' && x.portId === id);
        return (
          <Group
            key={id}
            title={`Lager ${harborName(id)}`}
            icon="warehouse"
            color="goods"
            value={`${kg(load)} von ${kg(capacity)}`}
            note={
              waiting.length > 0
                ? `Voll: ${kg(waiting.reduce((sum, x) => sum + x.amount, 0))} warten am Kai.`
                : lots.length === 0
                  ? 'Leer. Bestell Container unten.'
                  : undefined
            }
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
                    { label: level.label, color: level.index >= 2 ? 'danger' : 'law', icon: 'shield' },
                    { label: `${Math.round(heat)} von 100`, color: level.index >= 2 ? 'danger' : 'law', icon: 'flame' },
                  ]}
                />
              </ListItem>
              {info && halls < MAX_HALLS && (
                <ListItem
                  action
                  icon="warehouse"
                  value={formatEuro(info.hallCost)}
                  disabled={state.wallet.clean < info.hallCost}
                  onClick={() =>
                    setConfirm({
                      title: `Halle in ${harborName(id)} bauen?`,
                      message: `${kg(info.hallCapacity)} mehr Platz im Lager. Kostet ${formatEuro(info.hallCost)} sauberes Geld.`,
                      label: `Bauen (${formatEuro(info.hallCost)})`,
                      cost: info.hallCost,
                      run: () => dispatch({ type: 'trade.buildHall', payload: { portId: id } }),
                    })
                  }
                >
                  {`Halle bauen (+${kg(info.hallCapacity)})`}
                </ListItem>
              )}
            </List>
          </Group>
        );
      })}
      <TrucksGroup
        onBuy={(price, run) =>
          setConfirm({
            title: 'Lkw kaufen?',
            message: `80 kg Ladung, fährt deine Lieferungen ohne Frachtkosten. Wird öfter kontrolliert als die Spedition. Kostet ${formatEuro(price)} sauberes Geld.`,
            label: `Kaufen (${formatEuro(price)})`,
            cost: price,
            run,
          })
        }
      />
      <Group
        title="Einkauf im Ausland"
        icon="ship"
        color="goods"
        note="Tippen: Ware, Container, Deckladung und Schiff wählen."
        more="Kleine Kisten fallen dem Zoll seltener auf, große Container sind billiger pro Gramm. Jedes Kilo im Hafen macht den Zoll wacher, mit der Zeit kühlt er ab. Verteilen auf mehrere Häfen senkt das Risiko."
      >
        <List>
          {PRODUCERS.map((p) => (
            <ListItem
              key={p.id}
              onClick={() => ui.openPanel('trade.order', { producerId: p.id })}
              value={`${Math.round(shippingMinutes(p.id, target) / 1440)} T.`}
            >
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
      <ShipsGroup />
      <Group title="Weitere Häfen" icon="anchor" color="place" collapsible open={false}>
        <List>
          {harborPorts()
            .filter((p) => !ports.includes(p.id))
            .map((p) => (
              <ListItem
                key={p.id}
                value={formatEuro(p.berthCost)}
                onClick={() =>
                  setConfirm({
                    title: `Liegeplatz in ${p.name} mieten?`,
                    message: `${p.description} Kostet ${formatEuro(p.berthCost)} sauberes Geld.`,
                    label: `Mieten (${formatEuro(p.berthCost)})`,
                    cost: p.berthCost,
                    run: () => dispatch({ type: 'trade.rentBerth', payload: { portId: p.id } }),
                  })
                }
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
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        actions={
          confirm
            ? [
                {
                  label: confirm.label,
                  icon: 'check',
                  disabled: state.wallet.clean < confirm.cost,
                  onSelect: () => {
                    confirm.run();
                    setConfirm(null);
                  },
                },
              ]
            : []
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// App

function TradeApp() {
  const { state } = useGame();
  const ui = useUi();
  // Bereich aus ui.openPhone('trade.app', { view }) (z.B. „Hinführen“ einer Quest, Auftrag 43).
  const asked = ui.state.phone.app === APP_ID ? (ui.state.phone.params?.view as View | undefined) : undefined;
  const [view, setView] = useState<View>(asked ?? 'orders');
  useEffect(() => {
    if (asked) setView(asked);
  }, [asked]);
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
            // Mit dem vierten Bereich (Anbau) wird es eng: dann das kürzere Wort.
            { value: 'orders', label: isGrowStarted(state) ? 'Aufträge' : 'Bestellungen', badge: waiting + toDeliver },
            { value: 'customers', label: 'Kunden' },
            { value: 'harbor', label: 'Hafen' },
            // Auftrag 42: eigene Produktion (Fincas, Kartell, Ausfuhr), sobald die Produzenten angerufen haben.
            ...(isGrowStarted(state) ? [{ value: 'grow', label: 'Anbau' }] : []),
          ]}
          onChange={(v) => setView(v as View)}
        />
        {view === 'orders' && <OrdersView onView={setView} />}
        {view === 'customers' && <CustomersView />}
        {view === 'harbor' && <HarborView />}
        {view === 'grow' && <Slot name="trade.grow" props={{}} />}
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
        action: (ui) => ui.openPhone(APP_ID, { view: 'orders' }),
      };
    }
    const ready = pendingDeliveries(state).length;
    if (ready > 0) {
      return {
        id: 'trade.deliver',
        priority: 60,
        icon: 'package',
        title: `${ready} ${ready === 1 ? 'Lieferung' : 'Lieferungen'} offen`,
        action: (ui) => ui.openPhone(APP_ID, { view: 'orders' }),
      };
    }
    return null;
  },
});

/**
 * „Nächster Schritt“ in der Hafen-Phase (Auftrag 43): was fehlt, was abläuft, was den Hafen verstopft, wann der Zoll wach
 * ist und wann sich ein Lkw lohnt. Jeder Rat führt direkt an die Stelle, wo man es löst.
 */
registerAdvisor({
  id: 'trade.harbor',
  advise(state) {
    if (!isTradeActive(state)) return null;
    const list: Advice[] = [];
    const now = state.time;
    const port = ownedPorts(state)[0] ?? HARBOR_CITY;
    // Bestellung kurz vor der Frist, noch nicht unterwegs.
    const due = pendingDeliveries(state)
      .filter((o) => o.dueAt - now < 24 * 60)
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    if (due) {
      list.push({
        id: 'trade.due',
        priority: 86,
        icon: 'clock',
        title: `Lieferung für ${getCustomer(state, due.customerId)?.name ?? 'einen Kunden'} läuft ab`,
        text: now > due.dueAt ? 'Schon zu spät: Es gibt nur noch einen Teil vom Preis.' : 'Schick sie heute noch los.',
        actionLabel: 'Ausliefern',
        action: (ui) => ui.openPhone(APP_ID, { view: 'orders' }),
      });
    }
    // Ware, die für angenommene Bestellungen fehlt und auch nicht unterwegs ist.
    const need = new Map<string, number>();
    for (const o of pendingDeliveries(state)) {
      for (const item of openItems(o)) need.set(item.productId, (need.get(item.productId) ?? 0) + item.amount);
    }
    for (const id of ownedPorts(state)) {
      for (const [productId, lot] of Object.entries(portStock(state, id))) {
        need.set(productId, (need.get(productId) ?? 0) - lot.amount);
      }
    }
    for (const x of getShipments(state)) need.set(x.productId, (need.get(x.productId) ?? 0) - x.amount);
    const [productId, missing] = [...need.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0] ?? [];
    const producer = productId ? producersFor(productId, port)[0] : undefined;
    if (productId && missing && producer) {
      list.push({
        id: 'trade.missing',
        priority: 78,
        icon: 'ship',
        title: `${kg(missing)} ${productName(productId)} fehlen`,
        text: `Für angenommene Bestellungen. ${producer.name} liefert in ${Math.round(shippingMinutes(producer.id, port) / 1440)} Tagen.`,
        actionLabel: 'Einkaufen',
        action: (ui) => ui.openPanel('trade.order', { producerId: producer.id, productId }),
      });
    }
    // Container am Kai: Das Lager ist voll, das kostet Liegegeld.
    if (getShipments(state).some((x) => x.status === 'quay')) {
      list.push({
        id: 'trade.quay',
        priority: 74,
        icon: 'warehouse',
        title: 'Container warten am Kai',
        text: 'Das Lager ist voll, das kostet Liegegeld. Liefer aus oder bau eine Halle.',
        actionLabel: 'Zum Hafen',
        action: (ui) => ui.openPhone(APP_ID, { view: 'harbor' }),
      });
    }
    // Der Zoll ist wach.
    const hot = ownedPorts(state).find((id) => customsLevel(customsHeat(state, id)).index >= 2);
    if (hot) {
      list.push({
        id: 'trade.customs',
        priority: 56,
        icon: 'shield',
        title: `Der Zoll in ${harborName(hot)} ist wach`,
        text: 'Kleinere Container, Deckladung oder ein zweiter Hafen senken das Risiko.',
        actionLabel: 'Zum Hafen',
        action: (ui) => ui.openPhone(APP_ID, { view: 'harbor' }),
      });
    }
    // Ohne Lkw zahlt jede Lieferung Fracht.
    if (tradeStats(state).delivered >= 3 && !getVehicles(state, HARBOR_CITY).some((v) => !isShip(v))) {
      list.push({
        id: 'trade.truck',
        priority: 40,
        icon: 'truck',
        title: 'Ein eigener Lkw spart die Fracht',
        text: 'Die Spedition kostet bei jeder Lieferung. Ein Lkw fährt umsonst.',
        actionLabel: 'Zum Hafen',
        action: (ui) => ui.openPhone(APP_ID, { view: 'harbor' }),
      });
    }
    return list;
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
registerMapLayer(europeLayer);
