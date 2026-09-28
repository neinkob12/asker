// Oberfläche der Kunden: Kundenliste im Spot-Panel und Verkaufsstatistik im Tab "Geschäft".

import { formatAmount, formatEuro, formatNumber } from '../../../core';
import { Button, Card, Empty, KeyValue, List, ListItem, ProgressBar, registerSlot, useGame } from '../../../ui';
import { CUSTOMER_PATIENCE, canServe, customerRevenue, getSalesStats, waitingAt } from '../index';
import './customers.css';

function SpotCustomers(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const waiting = waitingAt(state, props.spotId);
  if (waiting.length === 0) return <Empty>Gerade niemand da.</Empty>;
  return (
    <>
      <List>
        {waiting.map((c) => {
          const left = Math.max(0, (c.expiresAt - state.time) / CUSTOMER_PATIENCE);
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
                <strong>{formatAmount(c.amount)}</strong>
                <span class="ui-hint">
                  {formatEuro(customerRevenue(c))} ({formatNumber(c.pricePerUnit, 1)} €/g)
                </span>
              </div>
              <ProgressBar value={left} tone={left < 1 / 3 ? 'bad' : 'warn'} label="Geduld" />
            </ListItem>
          );
        })}
      </List>
      <Button
        variant="primary"
        wide
        onClick={() => dispatch({ type: 'customers.serveAll', payload: { spotId: props.spotId } })}
      >
        Alle bedienen
      </Button>
    </>
  );
}

function SalesStatsSection() {
  const { state } = useGame();
  const stats = getSalesStats(state);
  return (
    <Card title="Statistik">
      <KeyValue label="Verkauft" value={formatAmount(stats.unitsSold)} />
      <KeyValue label="Umsatz" value={formatEuro(stats.revenue)} />
      <KeyValue label="Verlorene Kunden" value={stats.customersLost} />
      <KeyValue label="Wartende Kunden" value={state.modules.customers.waiting.length} />
    </Card>
  );
}

registerSlot('spots.spotPanel', { id: 'customers.list', order: 10, component: SpotCustomers });
registerSlot('tab:business', { id: 'customers.stats', order: 30, component: SalesStatsSection });
