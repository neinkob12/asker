// Oberfläche der Kunden: Kundenliste im Spot-Panel (selbst verkaufen), Kunden-Abschnitt unten in der Kasse,
// Lieferungen auf der Karte. Die App "Aufträge" steht seit Auftrag 26 nicht mehr auf dem Startbildschirm: Offene
// Anfragen kommen als Chat, die Historie steht im Verlauf (Einstellungen).

import { formatEuro, formatNumber } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Badge,
  Button,
  Card,
  Disclosure,
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
  registerSlot,
  Tag,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { formatProductAmount, getProduct, productName } from '../../goods';
import { activeRunnerAt } from '../../staff';
import {
  canServe,
  customerRevenue,
  customerTypeName,
  getOrders,
  getRegular,
  getRegulars,
  getSalesStats,
  isPlayerAway,
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
                  title={`${formatProductAmount(c.productId, c.amount)} ${productName(c.productId)}`}
                  meta={regular ? regular.name : customerTypeName(c.typeId)}
                  tags={[
                    { label: formatEuro(customerRevenue(c)), icon: 'cash', color: 'money' },
                    {
                      label: `${formatNumber(c.pricePerUnit, 1)} €/${getProduct(c.productId)?.unit ?? 'g'}`,
                      icon: 'tag',
                    },
                  ]}
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
        offered > 0 && (
          <Button small onClick={() => ui.openPhone('core.messages')}>
            Anfragen
            <Badge count={offered} />
          </Button>
        )
      }
    >
      <KeyValue label="Wartet gerade an deinen Spots" value={waitingNow} tone={waitingNow > 0 ? 'warn' : undefined} />
      <KeyValue label="Kunden bedient" value={stats.customersServed} />
      <KeyValue
        label="Ohne Ware gegangen"
        value={stats.customersLost}
        tone={stats.customersLost > 0 ? 'bad' : undefined}
      />
      <Disclosure label="Warum gehen Kunden?">
        Kunden warten nur eine Weile am Spot. Verkaufst du nicht rechtzeitig (selbst an den Spot stellen, verkaufen oder
        einen Läufer hinstellen) oder ist das Lager leer, gehen sie wieder. Das kostet etwas Ruf.
      </Disclosure>
      <KeyValue label="Umsatz seit Spielbeginn" value={formatEuro(stats.revenue)} />
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

/** Einstellungen › Anfragen: ob Kunden dir direkt schreiben dürfen (Spielzustand, nicht pro Gerät). */
function OrderSettings() {
  const { state, dispatch } = useGame();
  return (
    <Toggle
      label="Kunden dürfen mir schreiben"
      hint="Aus: Nur größere Großhandelsaufträge kommen aufs Handy."
      checked={state.modules.customers.directOrders}
      onChange={(enabled) => dispatch({ type: 'customers.setDirectOrders', payload: { enabled } })}
    />
  );
}

registerSlot('spots.spotPanel', { id: 'customers.list', order: 10, component: SpotCustomers });
registerSlot('finance.app', { id: 'customers.stats', title: 'Kundschaft', order: 10, component: CustomersSection });
registerSlot('core.settings', {
  id: 'customers.orders',
  title: 'Anfragen',
  icon: 'package',
  color: 'money',
  order: 30,
  component: OrderSettings,
});
registerMapLayer(deliveriesLayer);

onGameEvent('order.finished', 'customers.orderToast', (payload, ui, state) => {
  const order = state.modules.customers.orders.find((o) => o.id === payload.orderId);
  if (!order) return;
  if (payload.status === 'done') ui.toast(`${order.contactName}: ${formatEuro(order.price)} kassiert.`, 'good');
  if (payload.status === 'failed') ui.toast(`Lieferung an ${order.contactName} geplatzt.`, 'bad', { urgent: true });
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
