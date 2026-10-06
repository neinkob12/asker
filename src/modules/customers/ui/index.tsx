// Oberfläche der Kunden: Kundenliste im Spot-Panel (selbst verkaufen), Kunden-Abschnitt unten in der Kasse,
// Lieferungen auf der Karte. Die App "Aufträge" steht seit Auftrag 26 nicht mehr auf dem Startbildschirm: Offene
// Anfragen kommen als Chat, die Historie steht im Verlauf (Einstellungen).

import { formatEuro, formatNumber } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Badge,
  Button,
  Card,
  Chips,
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
import { activeCity, citiesUnlocked, cityOfSpot, isBusinessSold } from '../../city';
import { getGang } from '../../gangs';
import { formatProductAmount, getProduct, productName } from '../../goods';
import { activeRunnerAt } from '../../staff';
import { veedelName } from '../../veedel';
import {
  canServe,
  customerRevenue,
  customerTypeName,
  DEALER_STAGES,
  dealerRelation,
  dealerStage,
  dealerStageName,
  getDealers,
  getOrders,
  getRegular,
  getRegulars,
  getSalesStats,
  isPlayerAway,
  MIDDLEMAN_AMOUNT,
  playerSpot,
  spotReputation,
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

/** Ruf der Ware am Spot (Auftrag 32): Chips für gefragte und verschriene Ware, ein Satz Erklärung zum Aufklappen. */
function SpotQuality(props: { spotId: string }) {
  const { state } = useGame();
  const rows = spotReputation(state, props.spotId);
  if (rows.length === 0) return null;
  return (
    <div class="cust-quality">
      <Chips
        items={rows.map((r) => ({
          label: r.label,
          icon: r.good ? 'trendUp' : 'trendDown',
          color: r.good ? ('money' as const) : ('danger' as const),
          title: `Nachfrage ${r.good ? '+' : '−'}${Math.round(Math.abs(r.factor - 1) * 100)} %`,
        }))}
      />
      <Disclosure>
        Die Kundschaft merkt sich, wie gut die Ware hier zuletzt war: Premium spricht sich herum (bis ein Viertel mehr
        Nachfrage), Dreck auch (bis ein Drittel weniger).
      </Disclosure>
    </div>
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
        <SpotQuality spotId={props.spotId} />
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
  // Nach dem Verkauf gibt es keine Laufkundschaft mehr (Auftrag 43, H8): Die Kasse zeigt den Großhandel.
  if (isBusinessSold(state)) return null;
  const stats = getSalesStats(state);
  // Stammkunden der Stadt, in der du bist (Auftrag 43); die Zahlen darüber zählen über alle Städte.
  const city = activeCity(state);
  const regulars = getRegulars(state, { status: 'active' }).filter((r) => cityOfSpot(state, r.spotId) === city);
  const allCities = citiesUnlocked(state).length > 1;
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
      <KeyValue label={allCities ? 'Kunden bedient, alle Städte' : 'Kunden bedient'} value={stats.customersServed} />
      <KeyValue
        label="Ohne Ware gegangen"
        value={stats.customersLost}
        tone={stats.customersLost > 0 ? 'bad' : undefined}
      />
      <Disclosure label="Warum gehen Kunden?">
        Kunden warten nur eine Weile am Spot. Verkaufst du nicht rechtzeitig (selbst an den Spot stellen, verkaufen oder
        einen Läufer hinstellen) oder ist das Lager leer, gehen sie wieder. Das kostet etwas Ruf.
      </Disclosure>
      <KeyValue
        label={allCities ? 'Umsatz seit Spielbeginn, alle Städte' : 'Umsatz seit Spielbeginn'}
        value={formatEuro(stats.revenue)}
      />
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

/**
 * Auftrag 34: Stammabnehmer in der Kasse. Pro Dealer der Stadt Vertrauen als Balken, Stufe als Chip; wer gegangen ist,
 * steht bei seiner Gang. Exklusivität und Zwischenhandel bietet der Dealer per Handy an, beenden geht hier.
 */
function DealersSection() {
  const { state, dispatch } = useGame();
  const dealers = getDealers(state);
  if (dealers.length === 0 || isBusinessSold(state)) return null;
  return (
    <Group
      title="Stammabnehmer"
      icon="handshake"
      color="money"
      note="Erfüllte Deals bringen Vertrauen, wer hängengelassen wird, geht zur Konkurrenz."
      more={`Stufen: ${DEALER_STAGES.map((st) => `${st.name} ab ${st.at}`).join(', ')}. Ab Vorkasse zahlt der Dealer die Hälfte vorab und der Deal kippt nicht mehr. Exklusiv kauft er nur bei dir, mit Rabatt. Als Zwischenhändler holt er jede Woche ${MIDDLEMAN_AMOUNT} Einheiten der Ware, von der am meisten da ist, für sein Veedel ab: weniger Marge, aber Einfluss ohne Spot.`}
    >
      <List>
        {dealers.map((d) => {
          const r = dealerRelation(state, d.id);
          const stage = dealerStage(state, d.id);
          const gone = r.status === 'gone';
          const gang = r.goneTo ? getGang(state, r.goneTo) : undefined;
          return (
            <ListItem
              key={d.id}
              value={`${r.deals} Deals`}
              aside={
                r.middleman ? (
                  <Button
                    small
                    variant="subtle"
                    onClick={() =>
                      dispatch({ type: 'customers.dealerMiddleman', payload: { dealerId: d.id, accept: false } })
                    }
                  >
                    Beenden
                  </Button>
                ) : undefined
              }
            >
              <ItemContent
                icon="handshake"
                color={gone ? 'danger' : 'money'}
                title={d.name}
                tags={[
                  gone
                    ? { label: gang ? `kauft bei ${gang.name}` : 'weg', icon: 'logout', color: 'danger' }
                    : { label: dealerStageName(stage), color: stage === 'casual' ? 'system' : 'money' },
                  r.middleman && { label: veedelName(d.veedelId), icon: 'pin', color: 'place' },
                ]}
              >
                <ProgressBar value={r.trust / 100} tone={r.trust < 20 ? 'bad' : 'accent'} label="Vertrauen" />
              </ItemContent>
            </ListItem>
          );
        })}
      </List>
    </Group>
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
registerSlot('finance.app', { id: 'customers.dealers', title: 'Stammabnehmer', order: 11, component: DealersSection });
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
