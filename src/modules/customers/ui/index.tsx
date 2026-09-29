// Oberfläche der Kunden: Kundenliste im Spot-Panel (selbst verkaufen), Kunden-Abschnitt im Tab "Geschäft",
// Handy-App "Aufträge" (Lieferdienst, Großhandel) und Lieferungen auf der Karte.

import { clock, formatEuro, formatNumber, type GameState, messages } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Badge,
  Button,
  Card,
  Empty,
  Hint,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerGameStat,
  registerPhoneApp,
  registerSlot,
  useGame,
  useUi,
} from '../../../ui';
import { formatProductAmount, getProduct, productName } from '../../goods';
import { activeRunnerAt, findAvailable, getStaffMember } from '../../staff';
import { veedelName } from '../../veedel';
import {
  canServe,
  customerRevenue,
  customerTypeName,
  getOrders,
  getRegular,
  getRegulars,
  getSalesStats,
  isPlayerAway,
  isPlayerDelivering,
  type Order,
  orderProgress,
  playerSpot,
  waitingAt,
} from '../index';
import { deliveriesLayer } from './map';
import './island';
import './customers.css';

/**
 * Selbst verkaufen ohne Klick auf jeden Kunden: Du stellst dich an den Spot und bedienst dort automatisch, bis du
 * weggehst (oder mit einer Lieferung unterwegs bist).
 */
function StandHere(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const here = playerSpot(state) === props.spotId;
  const elsewhere = playerSpot(state);
  const runner = activeRunnerAt(state, props.spotId);
  const away = isPlayerAway(state);
  if (here) {
    return (
      <div class="customer-stand is-here">
        <span>
          <strong>Du stehst hier</strong>
          <span class="ui-hint">
            {away ? ' · gerade unterwegs, danach verkaufst du weiter' : ' · du bedienst die Kunden automatisch'}
          </span>
        </span>
        <Button
          small
          variant="subtle"
          onClick={() => dispatch({ type: 'customers.standAt', payload: { spotId: null } })}
        >
          Weggehen
        </Button>
      </div>
    );
  }
  return (
    <div class="customer-stand">
      <span class="ui-hint">
        {runner
          ? `${runner.name} verkauft hier. Du kannst trotzdem mithelfen.`
          : 'Kein Läufer hier? Stell dich selbst hin, dann verkaufst du automatisch.'}
      </span>
      <Button
        small
        variant={runner ? 'subtle' : 'primary'}
        onClick={() => dispatch({ type: 'customers.standAt', payload: { spotId: props.spotId } })}
      >
        {elsewhere ? 'Hierher wechseln' : 'Hier hinstellen'}
      </Button>
    </div>
  );
}

function SpotCustomers(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const waiting = waitingAt(state, props.spotId);
  const regulars = getRegulars(state, { spotId: props.spotId, status: 'active' }).length;
  return (
    <Card title="Kundschaft">
      <StandHere spotId={props.spotId} />
      {waiting.length === 0 ? (
        <Empty>Gerade niemand da.</Empty>
      ) : (
        <List>
          {waiting.map((c) => {
            const patience = Math.max(1, c.expiresAt - c.arrivedAt);
            const left = Math.max(0, (c.expiresAt - state.time) / patience);
            const regular = c.regularId ? getRegular(state, c.regularId) : undefined;
            return (
              <ListItem
                key={c.id}
                aside={
                  <Button
                    disabled={!canServe(state, c.id)}
                    onClick={() => dispatch({ type: 'customers.serve', payload: { customerId: c.id } })}
                  >
                    Verkaufen
                  </Button>
                }
              >
                <div class="customer-row">
                  <strong>
                    {formatProductAmount(c.productId, c.amount)} {productName(c.productId)}
                  </strong>
                  <span class="ui-hint">{formatEuro(customerRevenue(c))}</span>
                </div>
                <div class="customer-who ui-hint">
                  {regular ? <span class="customer-regular">★ {regular.name}</span> : customerTypeName(c.typeId)} ·{' '}
                  {formatNumber(c.pricePerUnit, 1)} €/{getProduct(c.productId)?.unit ?? 'g'}
                </div>
                <ProgressBar value={left} tone={left < 1 / 3 ? 'bad' : 'warn'} label="Geduld" />
              </ListItem>
            );
          })}
        </List>
      )}
      {waiting.length > 0 && (
        <Button
          variant="primary"
          wide
          onClick={() => dispatch({ type: 'customers.serveAll', payload: { spotId: props.spotId } })}
        >
          Alle bedienen
        </Button>
      )}
      {regulars > 0 && <Hint>{regulars === 1 ? 'Ein Stammkunde' : `${regulars} Stammkunden`} kaufen hier.</Hint>}
    </Card>
  );
}

function CustomersSection() {
  const { state } = useGame();
  const ui = useUi();
  const stats = getSalesStats(state);
  const regulars = getRegulars(state, { status: 'active' });
  const offered = getOrders(state, { status: 'offered' }).length;
  const waitingNow = state.modules.customers.waiting.length;
  const missed = Object.entries(stats.missedByProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  return (
    <Card
      title="Kundschaft"
      icon="smile"
      color="purple"
      status={waitingNow > 0 || offered > 0 ? 'warn' : 'good'}
      summary={waitingNow > 0 ? `${waitingNow} warten` : `${stats.customersServed} bedient`}
      actions={
        <Button small onClick={() => ui.openPhone('customers.orders')}>
          Aufträge
          <Badge count={offered} />
        </Button>
      }
    >
      <KeyValue label="Wartet gerade an deinen Spots" value={waitingNow} tone={waitingNow > 0 ? 'warn' : undefined} />
      <KeyValue label="Kunden bedient" value={stats.customersServed} />
      <KeyValue
        label="Ohne Ware gegangen"
        value={stats.customersLost}
        tone={stats.customersLost > 0 ? 'bad' : undefined}
      />
      <Hint>
        Kunden warten nur eine Weile am Spot. Verkaufst du nicht rechtzeitig (selbst an den Spot stellen, verkaufen oder
        einen Läufer hinstellen) oder ist das Lager leer, gehen sie wieder. Das kostet etwas Ruf.
      </Hint>
      <KeyValue label="Umsatz" value={formatEuro(stats.revenue)} />
      <KeyValue label="Lieferungen / Großhandel" value={`${stats.deliveries} / ${stats.wholesaleDeals}`} />
      <KeyValue label="Fanden es zu teuer" value={stats.tooExpensive} />
      <KeyValue label="Haben Streckmittel bemerkt" value={stats.cutNoticed} />
      {missed.length > 0 && (
        <Hint>Gefragt, aber nicht auf Lager: {missed.map(([id, n]) => `${productName(id)} (${n}×)`).join(', ')}</Hint>
      )}
      <h3 class="customers-sub">Stammkunden ({regulars.length})</h3>
      {regulars.length === 0 ? (
        <Empty>Noch keine. Gute Ware zu fairen Preisen spricht sich herum.</Empty>
      ) : (
        <ul class="customers-regulars">
          {regulars
            .slice()
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 6)
            .map((r) => (
              <li key={r.id}>
                <span>
                  ★ {r.name} <span class="ui-hint">· {productName(r.productId)}</span>
                </span>
                <span class={r.satisfaction < 0.4 ? 'customers-mood is-bad' : 'customers-mood'}>
                  {r.satisfaction >= 0.7 ? 'zufrieden' : r.satisfaction >= 0.4 ? 'geht so' : 'sauer'}
                </span>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}

const KIND_NAME: Record<Order['kind'], string> = { delivery: 'Lieferung', wholesale: 'Großhandel' };

function OfferedOrder(props: { order: Order; state: GameState }) {
  const { order, state } = props;
  const { dispatch } = useGame();
  const message = messages.get(state, order.messageId);
  const canAnswer = message ? messages.canAnswer(state, message) : false;
  const answer = (optionId: string) =>
    dispatch({ type: 'messages.answer', payload: { messageId: order.messageId, optionId } });
  const courier = findAvailable(state, { role: 'courier' });
  return (
    <li class="order">
      <div class="order__head">
        <strong>{order.contactName}</strong>
        <span class="ui-hint">
          {KIND_NAME[order.kind]} · noch {clock.formatDuration(order.expiresAt - state.time)}
        </span>
      </div>
      <div>
        {formatProductAmount(order.productId, order.amount)} {productName(order.productId)} nach{' '}
        {veedelName(order.veedelId)} für <strong>{formatEuro(order.price)}</strong>
      </div>
      {canAnswer && (
        <div class="order__actions">
          <Button small disabled={isPlayerDelivering(state)} onClick={() => answer('self')}>
            Selbst liefern
          </Button>
          <Button
            small
            disabled={!courier}
            title={courier ? courier.name : 'Kein freier Kurier'}
            onClick={() => answer('courier')}
          >
            Kurier
          </Button>
          <Button small variant="subtle" onClick={() => answer('decline')}>
            Ablehnen
          </Button>
        </div>
      )}
    </li>
  );
}

function OrdersApp() {
  const { state } = useGame();
  const offered = getOrders(state, { status: 'offered' });
  const enRoute = getOrders(state, { status: 'enRoute' });
  const done = getOrders(state)
    .filter((o) => o.status !== 'offered' && o.status !== 'enRoute')
    .slice(0, 6);
  const statusText: Record<Order['status'], string> = {
    offered: 'offen',
    enRoute: 'unterwegs',
    contested: 'Deal kippt',
    done: 'erledigt',
    declined: 'abgelehnt',
    expired: 'verpasst',
    failed: 'geplatzt',
  };
  return (
    <div class="orders-app">
      <h3 class="orders-app__title">Aufträge</h3>
      <h4 class="orders-app__section">Anfragen</h4>
      {offered.length === 0 ? (
        <Empty>Keine offenen Anfragen. Mit gutem Ruf melden sich mehr Leute.</Empty>
      ) : (
        <ul class="orders">
          {offered.map((o) => (
            <OfferedOrder key={o.id} order={o} state={state} />
          ))}
        </ul>
      )}
      {enRoute.length > 0 && (
        <>
          <h4 class="orders-app__section">Unterwegs</h4>
          <ul class="orders">
            {enRoute.map((o) => (
              <li key={o.id} class="order">
                <div class="order__head">
                  <strong>{o.contactName}</strong>
                  <span class="ui-hint">an {clock.formatTime(o.arrivesAt ?? state.time)}</span>
                </div>
                <div class="ui-hint">
                  {o.courierId ? (getStaffMember(state, o.courierId)?.name ?? 'Kurier') : 'Du'} ·{' '}
                  {formatProductAmount(o.productId, o.amount)} {productName(o.productId)}, {formatEuro(o.price)}
                </div>
                <ProgressBar value={orderProgress(state, o)} label="Lieferung" />
              </li>
            ))}
          </ul>
        </>
      )}
      {done.length > 0 && (
        <>
          <h4 class="orders-app__section">Zuletzt</h4>
          <ul class="orders orders--done">
            {done.map((o) => (
              <li key={o.id} class={`order order--${o.status}`}>
                <span>
                  {o.contactName}: {formatProductAmount(o.productId, o.amount)} {productName(o.productId)}
                </span>
                <span>{o.status === 'done' ? formatEuro(o.price) : statusText[o.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

registerSlot('spots.spotPanel', { id: 'customers.list', order: 10, component: SpotCustomers });
registerSlot('tab:business', { id: 'customers.stats', order: 30, component: CustomersSection });
registerPhoneApp({
  id: 'customers.orders',
  name: 'Aufträge',
  icon: 'package',
  order: 30,
  color: '#b7791f',
  component: OrdersApp,
  badge: (state) => getOrders(state, { status: 'offered' }).length,
});
registerMapLayer(deliveriesLayer);

onGameEvent('order.finished', 'customers.orderToast', (payload, ui, state) => {
  const order = state.modules.customers.orders.find((o) => o.id === payload.orderId);
  if (!order) return;
  if (payload.status === 'done') ui.toast(`${order.contactName}: ${formatEuro(order.price)} kassiert.`, 'good');
  if (payload.status === 'failed') ui.toast(`Lieferung an ${order.contactName} geplatzt.`, 'bad');
});
onGameEvent('customer.regularGained', 'customers.regularToast', (payload, ui, state) => {
  const regular = getRegular(state, payload.regularId);
  if (regular) ui.toast(`Neuer Stammkunde: ${regular.name}`, 'good');
});

registerGameStat({
  id: 'customers.served',
  order: 30,
  icon: 'smile',
  label: 'Kunden bedient',
  value: (state) => String(getSalesStats(state).customersServed),
});
