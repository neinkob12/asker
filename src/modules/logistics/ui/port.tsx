// Hafen (Auftrag 33): Ausbau des Liegeplatzes auf der Hafen-Seite (Kai → Halle am Kai → Kran, mit Rückfrage) und der
// Schiffs-Tracker in der Lieferanten-App: wo das Schiff auf dem Wasserweg ist (roads.shipRoute) und wann es anlegt.

import { useState } from 'preact/hooks';
import { clock, formatEuro, type GameState } from '../../../core';
import { pointAlong } from '../../../map';
import {
  ActionSheet,
  Button,
  Chip,
  Group,
  ItemContent,
  List,
  ListItem,
  ProgressBar,
  registerSlot,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { formatProductAmount, productName } from '../../goods';
import { shipRoute } from '../../roads';
import {
  expectedArrival,
  type Shipment,
  shipmentProgress,
  shipmentSupplier,
  shipmentsInTransit,
} from '../../suppliers';
import { BERTH_LEVELS, berthLevel, berthUpgradeCost, hasBerth, PORTS, portName } from '../index';

/** Liegeplatz ausbauen: Stufe, Wirkung und Preis der nächsten, Kauf mit Rückfrage. */
export function BerthGroup() {
  const { state, dispatch } = useGame();
  const [ask, setAsk] = useState(false);
  const cityId = activeCity(state);
  if (!hasBerth(state, cityId)) return null;
  const level = berthLevel(state, cityId);
  const cost = berthUpgradeCost(state, cityId);
  const next = BERTH_LEVELS[level + 1];
  return (
    <Group
      data-tour="port.berth"
      title="Liegeplatz"
      icon="anchor"
      color="money"
      value={BERTH_LEVELS[level].name}
      more="Mit Halle und Kran steht Ware länger sicher am Kai, der Zoll schaut seltener hin und das Laden geht schneller. Der Ausbau ist legal und kostet sauberes Geld."
    >
      <List>
        {BERTH_LEVELS.map((step, i) => (
          <ListItem
            key={step.name}
            aside={
              i <= level ? (
                <Chip color="money" icon="checkCircle">
                  {i === level ? 'jetzt' : 'gebaut'}
                </Chip>
              ) : i === level + 1 && cost !== null ? (
                <Button small disabled={state.wallet.clean < cost} onClick={() => setAsk(true)}>
                  {formatEuro(cost)}
                </Button>
              ) : undefined
            }
          >
            <ItemContent
              icon={i === 0 ? 'anchor' : i === 1 ? 'warehouse' : 'trendUp'}
              color={i <= level ? 'money' : 'system'}
              title={step.name}
              meta={step.effect}
            />
          </ListItem>
        ))}
      </List>
      <ActionSheet
        open={ask}
        onClose={() => setAsk(false)}
        title={next ? `${next.name} bauen?` : ''}
        message={next && cost !== null ? `${next.effect} Kostet ${formatEuro(cost)} sauberes Geld.` : undefined}
        actions={[
          {
            label: cost !== null ? `Bauen (${formatEuro(cost)})` : 'Bauen',
            icon: 'anchor',
            disabled: cost === null || state.wallet.clean < cost,
            onSelect: () => {
              dispatch({ type: 'logistics.upgradeBerth', payload: { cityId } });
              setAsk(false);
            },
          },
        ]}
      />
    </Group>
  );
}

/** Wo ein Schiff gerade ist: Punkt auf dem Wasserweg und der nächste Ort am Fluss. */
export function shipPosition(
  state: GameState,
  shipment: Shipment,
): { point: { lng: number; lat: number }; place: string; progress: number } | null {
  const cityId = shipment.cityId ?? 'koeln';
  const route = shipRoute(cityId);
  if (route.length < 2) return null;
  const progress = shipmentProgress(state, shipment);
  const point = pointAlong(route, progress).position;
  let place = portName(cityId);
  let best = Number.POSITIVE_INFINITY;
  for (const p of PORTS[cityId]?.shipPlaces ?? []) {
    const d = Math.hypot((p.lng - point.lng) * 0.62, p.lat - point.lat);
    if (d < best) {
      best = d;
      place = p.name;
    }
  }
  return { point, place, progress };
}

/** Schiffe unterwegs zum eigenen Liegeplatz der Stadt, in der du spielst: Ort, Fortschritt und Ankunft. */
function ShipTracker() {
  const { state } = useGame();
  const ui = useUi();
  const ships = shipmentsInTransit(state, activeCity(state)).filter((s) => s.toPort);
  if (ships.length === 0) return null;
  return (
    <Group title="Schiffe" icon="ship" color="goods" count={ships.length}>
      <List>
        {ships.map((s) => {
          const at = shipPosition(state, s);
          const supplier = shipmentSupplier(state, s);
          return (
            <ListItem
              key={s.id}
              onClick={at ? () => ui.flyTo(at.point, 11) : undefined}
              aside={<span class="logi-eta">an {clock.formatTime(expectedArrival(s))}</span>}
            >
              <ItemContent
                icon="ship"
                color="goods"
                title={`${formatProductAmount(s.productId, s.amount)} ${productName(s.productId)}`}
                meta={at ? `bei ${at.place}` : undefined}
                tags={[
                  { label: supplier?.contactName ?? 'Lieferant', icon: 'user', color: 'people' },
                  { label: portName(s.cityId ?? 'koeln'), icon: 'anchor', color: 'place' },
                ]}
              >
                <ProgressBar value={at?.progress ?? 0} label="Fahrt" />
              </ItemContent>
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}

registerSlot('suppliers.top', { id: 'logistics.ships', order: 10, component: ShipTracker });
