// Warenfluss (Auftrag 33): Seite in der Lager-App. Pro Ware der aktiven Stadt: Verbrauch pro Tag (Schnitt der letzten
// Tage), Bestand, unterwegs (Fahrten, Kai, Lieferungen) und wie lange es noch reicht; aufklappbar pro Lager und Spot.
// Ein Engpass steht rot mit dem Weg zur Lieferanten-App. Dazu die Karten-Ebene "Lieferwege" (welcher Spot aus welchem
// Lager bedient wird, map.ts).

import { formatNumber, type GameState } from '../../../core';
import {
  Button,
  type ChipSpec,
  Disclosure,
  Empty,
  Group,
  ItemContent,
  List,
  ListItem,
  memoState,
  registerPanel,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { cargoAmount, getTrips, isInterCityTrip, tripCity } from '../../logistics';
import { getSpots } from '../../spots';
import { shipmentItems, shipmentsInTransit } from '../../suppliers';
import {
  formatProductAmount,
  getStock,
  getWarehouses,
  type Product,
  SHORTAGE_DAYS,
  servingWarehouse,
  usagePerDay,
  usedProducts,
} from '../index';

declare module '../../../ui' {
  interface PanelRegistry {
    'goods.flow': Record<string, never>;
  }
}

export interface FlowRow {
  product: Product;
  perDay: number;
  stock: number;
  inbound: number;
  /** Tage, die Bestand und unterwegs reichen (Infinity ohne Verbrauch). */
  days: number;
  shortage: boolean;
  warehouses: { id: string; name: string; stock: number; perDay: number; days: number }[];
  spots: { id: string; name: string; perDay: number; warehouse: string }[];
}

/**
 * Ware, die in eine Stadt unterwegs ist: Ware am Kai, Abholungen vom Hafen, Routen aus der anderen Stadt und
 * Lieferungen. Umlagern innerhalb der Stadt zählt nicht (die Ware ist ja schon da).
 */
function inboundTo(state: GameState, cityId: string, productId: string): number {
  let n = cargoAmount(state, productId, cityId);
  for (const trip of getTrips(state)) {
    if (tripCity(state, trip) !== cityId) continue;
    if (trip.kind !== 'pickup' && !isInterCityTrip(state, trip)) continue;
    for (const item of trip.items) if (item.productId === productId) n += item.amount;
  }
  for (const s of shipmentsInTransit(state)) {
    if ((s.cityId ?? 'koeln') !== cityId) continue;
    for (const item of shipmentItems(s)) if (item.productId === productId) n += item.amount;
  }
  return n;
}

const daysOf = (amount: number, perDay: number) => (perDay > 0 ? amount / perDay : Number.POSITIVE_INFINITY);

/** Warenfluss der aktiven Stadt, einmal pro Spielstand gerechnet (Seite und Lager-App lesen dasselbe). */
export const flowRows = memoState((state): FlowRow[] => {
  const cityId = activeCity(state);
  const warehouses = getWarehouses(state, cityId);
  const spots = getSpots(state, cityId);
  return usedProducts(state, cityId).map((product) => {
    const perDay = usagePerDay(state, { cityId, productId: product.id });
    const stock = getStock(state, { cityId, productId: product.id });
    const inbound = inboundTo(state, cityId, product.id);
    const days = daysOf(stock + inbound, perDay);
    const spotRows = spots
      .map((spot) => ({
        id: spot.id,
        name: spot.name,
        perDay: usagePerDay(state, { spotId: spot.id, productId: product.id }),
        warehouse: servingWarehouse(state, spot, product.id)?.id ?? '',
      }))
      .filter((r) => r.perDay > 0)
      .sort((a, b) => b.perDay - a.perDay);
    const warehouseRows = warehouses.map((w) => {
      const here = getStock(state, { warehouseId: w.id, productId: product.id });
      const served = spotRows.filter((r) => r.warehouse === w.id).reduce((sum, r) => sum + r.perDay, 0);
      return { id: w.id, name: w.name, stock: here, perDay: served, days: daysOf(here, served) };
    });
    return {
      product,
      perDay,
      stock,
      inbound,
      days,
      shortage: perDay > 0 && days < SHORTAGE_DAYS,
      warehouses: warehouseRows,
      spots: spotRows.map((r) => ({ ...r, warehouse: warehouses.find((w) => w.id === r.warehouse)?.name ?? '–' })),
    };
  });
});

/** "reicht 3,5 Tage", "reicht lange", "leer". */
export function daysText(days: number): string {
  if (!Number.isFinite(days)) return 'kein Verbrauch';
  if (days < 0.05) return 'leer';
  if (days > 30) return 'reicht lange';
  return `reicht ${formatNumber(days, days < 10 ? 1 : 0)} Tage`;
}

function ProductGroup(props: { row: FlowRow }) {
  const ui = useUi();
  const { row } = props;
  const p = row.product.id;
  const tags: ChipSpec[] = [
    { label: `${formatProductAmount(p, Math.round(row.perDay))}/Tag`, icon: 'trendDown', color: 'goods' },
    { label: `${formatProductAmount(p, row.stock)} da`, icon: 'warehouse', color: 'goods' },
    row.inbound > 0 && { label: `${formatProductAmount(p, row.inbound)} unterwegs`, icon: 'truck', color: 'place' },
  ].filter(Boolean) as ChipSpec[];
  return (
    <Group
      title={row.product.name}
      icon={row.shortage ? 'alert' : 'package'}
      color={row.shortage ? 'danger' : 'goods'}
      value={daysText(row.days)}
    >
      <List>
        <ListItem
          aside={
            row.shortage ? (
              <Button small variant="primary" onClick={() => ui.openPhone('suppliers.app')}>
                Bestellen
              </Button>
            ) : undefined
          }
        >
          <ItemContent
            icon={row.shortage ? 'alert' : 'chart'}
            color={row.shortage ? 'danger' : 'goods'}
            title={row.shortage ? 'Engpass' : 'Im Fluss'}
            tags={tags}
          />
        </ListItem>
      </List>
      {(row.warehouses.length > 1 || row.spots.length > 0) && (
        <Disclosure label="Lager und Spots" icon="list">
          <List>
            {row.warehouses.map((w) => (
              <ListItem key={w.id} onClick={() => ui.openPanel('goods.warehouse', { warehouseId: w.id })}>
                <ItemContent
                  icon="warehouse"
                  color={w.perDay > 0 && w.days < SHORTAGE_DAYS ? 'danger' : 'goods'}
                  title={w.name}
                  tags={[
                    { label: `${formatProductAmount(p, w.stock)} da`, icon: 'boxes', color: 'goods' },
                    w.perDay > 0 && {
                      label: daysText(w.days),
                      icon: 'clock',
                      color: w.days < SHORTAGE_DAYS ? 'danger' : 'system',
                    },
                  ]}
                />
              </ListItem>
            ))}
            {row.spots.map((s) => (
              <ListItem key={s.id} onClick={() => ui.openPanel('spots.spot', { spotId: s.id })}>
                <ItemContent
                  icon="pin"
                  color="place"
                  title={s.name}
                  tags={[
                    { label: `${formatProductAmount(p, Math.round(s.perDay))}/Tag`, icon: 'trendDown', color: 'goods' },
                    { label: `aus ${s.warehouse}`, icon: 'warehouse', color: 'system' },
                  ]}
                />
              </ListItem>
            ))}
          </List>
        </Disclosure>
      )}
    </Group>
  );
}

function FlowPanel() {
  const { state } = useGame();
  const rows = flowRows(state);
  if (rows.length === 0) {
    return (
      <div class="goods-panel">
        <Empty icon="chart">Noch kein Verkauf und keine Ware in dieser Stadt.</Empty>
      </div>
    );
  }
  return (
    <div class="goods-panel">
      {rows.map((row) => (
        <ProductGroup key={row.product.id} row={row} />
      ))}
    </div>
  );
}

registerPanel({ id: 'goods.flow', title: () => 'Warenfluss', component: FlowPanel });
