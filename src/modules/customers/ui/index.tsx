// Oberfläche der Kunden: Kundenliste im Spot-Panel (selbst verkaufen), Kunden-Abschnitt im Tab "Geschäft",
// Handy-App "Aufträge" (Lieferdienst, Großhandel) und Lieferungen auf der Karte.

import { clock, formatEuro, formatNumber, type GameState, messages } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Badge,
  Button,
  Card,
  Empty,
  Group,
  Hint,
  ItemContent,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerGameStat,
  registerPhoneApp,
  registerSlot,
  SummaryTiles,
  SwipeRow,
  Tag,
  Toggle,
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
 * weggehst (oder mit einer Lieferung unterwegs bist). Eine Zeile mit Kachel, der Knopf rechts (schrumpft nie).
 */
function StandHere(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const here = playerSpot(state) === props.spotId;
  const elsewhere = playerSpot(state);
  const runner = activeRunnerAt(state, props.spotId);
  const away = isPlayerAway(state);
  const stand = (spotId: string | null) => dispatch({ type: 'customers.standAt', payload: { spotId } });
  return (
    <Group title="Selbst verkaufen" icon="runner" color="brand">
      <List>
        {here ? (
          <ListItem
            aside={
              <Button small onClick={() => stand(null)}>
                Weggehen
              </Button>
            }
          >
            <ItemContent
              icon="runner"
              color="brand"
              title="Du stehst hier"
              meta={away ? 'Gerade unterwegs, danach verkaufst du weiter.' : 'Du bedienst die Kunden automatisch.'}
            />
          </ListItem>
        ) : (
          <ListItem
            aside={
              <Button small variant={runner ? 'default' : 'primary'} onClick={() => stand(props.spotId)}>
                {elsewhere ? 'Hierher wechseln' : 'Hier hinstellen'}
              </Button>
            }
          >
            <ItemContent
              icon="runner"
              color={runner ? 'people' : 'brand'}
              title={runner ? 'Mithelfen' : 'Selbst verkaufen'}
              meta={
                runner
                  ? `${runner.name} verkauft hier, du kannst mithelfen.`
                  : 'Stell dich hin, dann läuft der Verkauf von allein.'
              }
            />
          </ListItem>
        )}
      </List>
    </Group>
  );
}

function SpotCustomers(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const waiting = waitingAt(state, props.spotId);
  const regulars = getRegulars(state, { spotId: props.spotId, status: 'active' }).length;
  const total = waiting.reduce((sum, c) => sum + customerRevenue(c), 0);
  return (
    <>
      <StandHere spotId={props.spotId} />
      <Group
        title="Kundschaft"
        icon="smile"
        color="money"
        count={waiting.length}
        note={
          regulars > 0 ? `${regulars === 1 ? 'Ein Stammkunde' : `${regulars} Stammkunden`} kaufen hier.` : undefined
        }
      >
        <List>
          {waiting.length === 0 && (
            <ListItem>
              <ItemContent icon="inbox" color="system" title="Gerade niemand da" meta="Kunden kommen nach und nach." />
            </ListItem>
          )}
          {waiting.map((c) => {
            const patience = Math.max(1, c.expiresAt - c.arrivedAt);
            const left = Math.max(0, (c.expiresAt - state.time) / patience);
            const regular = c.regularId ? getRegular(state, c.regularId) : undefined;
            return (
              <ListItem
                key={c.id}
                aside={
                  <Button
                    small
                    disabled={!canServe(state, c.id)}
                    onClick={() => dispatch({ type: 'customers.serve', payload: { customerId: c.id } })}
                  >
                    Verkaufen
                  </Button>
                }
              >
                <ItemContent
                  icon={regular ? 'star' : 'smile'}
                  color={regular ? 'brand' : 'money'}
                  title={`${formatProductAmount(c.productId, c.amount)} ${productName(c.productId)} · ${formatEuro(customerRevenue(c))}`}
                  meta={`${regular ? regular.name : customerTypeName(c.typeId)} · ${formatNumber(c.pricePerUnit, 1)} €/${getProduct(c.productId)?.unit ?? 'g'}`}
                >
                  <ProgressBar value={left} tone={left < 1 / 3 ? 'bad' : 'warn'} label="Geduld" />
                </ItemContent>
              </ListItem>
            );
          })}
          {waiting.length > 1 && (
            <ListItem
              action
              value={formatEuro(total)}
              onClick={() => dispatch({ type: 'customers.serveAll', payload: { spotId: props.spotId } })}
            >
              <ItemContent icon="cash" color="brand" title="Alle bedienen" meta={`${waiting.length} Kunden`} />
            </ListItem>
          )}
        </List>
      </Group>
    </>
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
      color="money"
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
      <Group title="Stammkunden" icon="star" color="brand" count={regulars.length}>
        {regulars.length === 0 ? (
          <Empty>Noch keine. Gute Ware zu fairen Preisen spricht sich herum.</Empty>
        ) : (
          <List>
            {regulars
              .slice()
              .sort((a, b) => b.visits - a.visits)
              .slice(0, 6)
              .map((r) => {
                const mood = r.satisfaction >= 0.7 ? 'zufrieden' : r.satisfaction >= 0.4 ? 'geht so' : 'sauer';
                return (
                  <ListItem
                    key={r.id}
                    aside={
                      <Tag
                        category={r.satisfaction < 0.4 ? 'danger' : r.satisfaction < 0.7 ? 'warn' : 'money'}
                        icon={r.satisfaction < 0.4 ? 'frown' : 'smile'}
                      >
                        {mood}
                      </Tag>
                    }
                  >
                    <ItemContent icon="star" color="brand" title={r.name} meta={productName(r.productId)} />
                  </ListItem>
                );
              })}
          </List>
        )}
      </Group>
    </Card>
  );
}

const KIND_NAME: Record<Order['kind'], string> = { delivery: 'Lieferung', wholesale: 'Großhandel' };
const KIND_ICON: Record<Order['kind'], string> = { delivery: 'bike', wholesale: 'boxes' };

const STATUS_TEXT: Record<Order['status'], string> = {
  offered: 'offen',
  enRoute: 'unterwegs',
  contested: 'Deal kippt',
  done: 'erledigt',
  declined: 'abgelehnt',
  expired: 'verpasst',
  failed: 'geplatzt',
};

/**
 * Offene Anfrage als Zeile: wer, was, wohin, für wie viel, bis wann; darunter die Antworten als Knöpfe. Wischen nach
 * links lehnt ab (ein Knopf dafür steht auch in der Zeile).
 */
function OfferedOrder(props: { order: Order; state: GameState }) {
  const { order, state } = props;
  const { dispatch } = useGame();
  const message = messages.get(state, order.messageId);
  const canAnswer = message ? messages.canAnswer(state, message) : false;
  const answer = (optionId: string) =>
    dispatch({ type: 'messages.answer', payload: { messageId: order.messageId, optionId } });
  const courier = findAvailable(state, { role: 'courier' });
  const left = order.expiresAt - state.time;
  return (
    <SwipeRow
      actions={
        canAnswer ? [{ label: 'Ablehnen', icon: 'close', color: 'system', onSelect: () => answer('decline') }] : []
      }
    >
      <ListItem value={formatEuro(order.price)}>
        <ItemContent
          icon={KIND_ICON[order.kind]}
          color="money"
          title={order.contactName}
          meta={`${KIND_NAME[order.kind]} · ${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)} nach ${veedelName(order.veedelId)}`}
        >
          <span class="order__tags">
            <Tag category={left < 60 ? 'danger' : 'warn'} icon="timer">
              noch {clock.formatDuration(left)}
            </Tag>
          </span>
          {canAnswer && (
            <span class="order__actions">
              <Button small variant="primary" disabled={isPlayerDelivering(state)} onClick={() => answer('self')}>
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
            </span>
          )}
        </ItemContent>
      </ListItem>
    </SwipeRow>
  );
}

/** Handy-App "Aufträge": Anfragen (Lieferdienst, Großhandel), was unterwegs ist und was zuletzt lief. */
function OrdersApp() {
  const { state, dispatch } = useGame();
  const offered = getOrders(state, { status: 'offered' });
  const enRoute = getOrders(state, { status: 'enRoute' });
  const done = getOrders(state)
    .filter((o) => o.status !== 'offered' && o.status !== 'enRoute')
    .slice(0, 6);
  const stats = getSalesStats(state);
  return (
    <div class="orders-app">
      <SummaryTiles
        items={[
          { icon: 'inbox', color: offered.length > 0 ? 'warn' : 'system', value: offered.length, label: 'Anfragen' },
          { icon: 'truck', color: 'goods', value: enRoute.length, label: 'Liefern' },
          { icon: 'handshake', color: 'money', value: stats.deliveries + stats.wholesaleDeals, label: 'Erledigt' },
        ]}
      />
      <Group
        title="Anfragen"
        icon="inbox"
        color="warn"
        count={offered.length}
        note="Wischen nach links lehnt eine Anfrage ab."
      >
        {offered.length === 0 ? (
          <Empty icon="inbox">
            Keine offenen Anfragen. Mit gutem Ruf melden sich mehr Leute (Kunden-Direktanfragen schaltest du unten ein).
          </Empty>
        ) : (
          <List>
            {offered.map((o) => (
              <OfferedOrder key={o.id} order={o} state={state} />
            ))}
          </List>
        )}
      </Group>
      {enRoute.length > 0 && (
        <Group title="Unterwegs" icon="truck" color="goods" count={enRoute.length}>
          <List>
            {enRoute.map((o) => (
              <ListItem key={o.id} value={`an ${clock.formatTime(o.arrivesAt ?? state.time)}`}>
                <ItemContent
                  icon={o.courierId ? 'bike' : 'runner'}
                  color={o.courierId ? 'goods' : 'brand'}
                  title={o.contactName}
                  meta={`${o.courierId ? (getStaffMember(state, o.courierId)?.name ?? 'Kurier') : 'Du'} · ${formatProductAmount(o.productId, o.amount)} ${productName(o.productId)}, ${formatEuro(o.price)}`}
                >
                  <ProgressBar value={orderProgress(state, o)} label="Lieferung" />
                </ItemContent>
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {done.length > 0 && (
        <Group title="Zuletzt" icon="clock" color="system">
          <List>
            {done.map((o) => (
              <ListItem
                key={o.id}
                value={
                  <span class={`order-result order-result--${o.status}`}>
                    {o.status === 'done' ? formatEuro(o.price) : STATUS_TEXT[o.status]}
                  </span>
                }
              >
                <ItemContent
                  icon={o.status === 'done' ? 'checkCircle' : 'xCircle'}
                  color={o.status === 'done' ? 'money' : o.status === 'declined' ? 'system' : 'danger'}
                  title={o.contactName}
                  meta={`${formatProductAmount(o.productId, o.amount)} ${productName(o.productId)}`}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      <Group title="Anfragen bekommen" icon="message" color="chat">
        <Toggle
          label="Kunden dürfen mir schreiben"
          hint="Aus: Nur größere Großhandelsaufträge kommen aufs Handy."
          checked={state.modules.customers.directOrders}
          onChange={(enabled) => dispatch({ type: 'customers.setDirectOrders', payload: { enabled } })}
        />
      </Group>
    </div>
  );
}

registerSlot('spots.spotPanel', { id: 'customers.list', order: 10, component: SpotCustomers });
registerSlot('tab:business', { id: 'customers.stats', title: 'Kundschaft', order: 30, component: CustomersSection });
registerPhoneApp({
  id: 'customers.orders',
  name: 'Aufträge',
  icon: 'package',
  order: 30,
  color: 'money',
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
