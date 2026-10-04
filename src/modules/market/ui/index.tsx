// Oberfläche des Markts: eigene Preise im Spot-Panel, Markt-Übersicht (Richtpreise pro Veedel) als Panel und
// ein kurzer Markt-Abschnitt auf der Lager-Seite.

import { useState } from 'preact/hooks';
import { formatEuro, formatNumber, type GameState, MINUTES_PER_DAY } from '../../../core';
import {
  Button,
  Chips,
  Disclosure,
  Group,
  ItemContent,
  List,
  ListItem,
  registerPanel,
  registerSlot,
  Select,
  Stepper,
  SummaryTiles,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityOfSpot } from '../../city';
import { getMarketEventDef, marketEvents, marketEventText } from '../../events';
import { allProducts, getProduct, productName, stockSummary } from '../../goods';
import { allVeedel, veedelName } from '../../veedel';
import {
  getCompetitionFactor,
  getSpotPrice,
  hasOwnPrice,
  indexTrend,
  priceIndex,
  priceRatio,
  referencePrice,
  spotReferencePrice,
  supplyDemandFactor,
} from '../index';
import './market.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'market.overview': { productId?: string };
  }
}

const STEP = 0.5;

/** Abweichung vom Richtpreis als Text, z.B. "+12 %". */
function deviation(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100);
  return pct === 0 ? '±0 %' : `${pct > 0 ? '+' : ''}${pct} %`;
}

function trend(state: GameState, productId: string, veedelId: string): 'up' | 'down' | 'flat' {
  const f = supplyDemandFactor(state, productId, veedelId);
  if (f > 1.03) return 'up';
  if (f < 0.97) return 'down';
  return 'flat';
}

const TREND_ICON = { up: 'trendUp', down: 'trendDown', flat: 'minus' } as const;
const TREND_COLOR = { up: 'money', down: 'danger', flat: 'system' } as const;
const TREND_TEXT = { up: 'gefragt', down: 'gesättigt', flat: 'ausgeglichen' } as const;

/**
 * Preise am Spot: je Produkt eine Zeile mit Richt- und Einkaufspreis, rechts der eigene Preis mit Stepper (− | +).
 * Weicht der Preis vom Richtpreis ab, steht darunter, um wie viel, und ein Knopf zurück zum Richtpreis.
 */
function SpotPrices(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const stock = stockSummary(state);
  const products = allProducts().filter(
    (p) => stock.some((r) => r.productId === p.id) || hasOwnPrice(state, props.spotId, p.id),
  );
  const set = (productId: string, price: number | null) =>
    dispatch({ type: 'market.setPrice', payload: { spotId: props.spotId, productId, price } });
  return (
    <Group
      title="Preise"
      icon="tag"
      color="money"
      note="Zu teuer vertreibt Kunden (Studenten zuerst, Banker zuletzt), billig lockt mehr an."
    >
      <List>
        {products.length === 0 && (
          <ListItem onClick={() => ui.openPhone('suppliers.app')}>
            <ItemContent
              icon="warehouse"
              color="goods"
              title="Keine Ware auf Lager"
              meta="Nachschub bei den Lieferanten"
            />
          </ListItem>
        )}
        {products.map((p) => {
          const price = getSpotPrice(state, props.spotId, p.id);
          const ratio = priceRatio(state, props.spotId, p.id);
          const cost = stock.find((r) => r.productId === p.id)?.unitCost ?? 0;
          const own = hasOwnPrice(state, props.spotId, p.id);
          const reference = spotReferencePrice(state, props.spotId, p.id);
          const loss = price < cost;
          const trend = indexTrend(state, p.id, cityOfSpot(state, props.spotId));
          return (
            <ListItem
              key={p.id}
              value={
                <span class={loss ? 'mkt-price--loss' : 'mkt-price'}>
                  {formatNumber(price, 1)} €/{p.unit}
                </span>
              }
            >
              <ItemContent
                icon="leaf"
                color="goods"
                title={p.name}
                tags={[
                  { label: `Richtpreis ${formatNumber(reference, 1)} €`, icon: 'chart', color: 'money' },
                  cost > 0 && { label: `Einkauf ${formatNumber(cost, 1)} €`, icon: 'cart', color: 'goods' },
                  trend && {
                    label: trend.label,
                    icon: trend.up ? 'trendUp' : 'trendDown',
                    color: trend.up ? 'money' : 'danger',
                    title: 'Bewegung des Markts in der Stadt (Preisindex)',
                  },
                ]}
              >
                <Stepper
                  class="mkt-price__stepper"
                  label={`Preis ${p.name}`}
                  value={price}
                  min={STEP}
                  step={STEP}
                  onChange={(next) => set(p.id, next)}
                />
                {(own || loss) && (
                  <span class="mkt-price__state">
                    {loss ? (
                      <Tag category="danger" icon="alert">
                        unter Einkauf
                      </Tag>
                    ) : (
                      <Tag category={ratio > 1.05 ? 'warn' : ratio < 0.95 ? 'money' : 'system'} icon="tag">
                        {deviation(ratio)}
                      </Tag>
                    )}
                    {own && (
                      <Button variant="link" small onClick={() => set(p.id, null)}>
                        Richtpreis
                      </Button>
                    )}
                  </span>
                )}
              </ItemContent>
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}

/** Markt-Übersicht: Richtpreis eines Produkts in allen Veedeln, teuerste zuerst, mit Trend und Konkurrenz. */
function MarketOverview(props: { productId?: string }) {
  const { state } = useGame();
  const [productId, setProductId] = useState(props.productId ?? allProducts()[0].id);
  const product = getProduct(productId);
  const rows = allVeedel(activeCity(state))
    .map((v) => ({ veedel: v, price: referencePrice(state, productId, v.id) }))
    .sort((a, b) => b.price - a.price);
  const prices = rows.map((r) => r.price);
  return (
    <div class="mkt-overview">
      <IndexGroup />
      <Group title="Produkt" icon="leaf" color="goods">
        <Select
          label="Produkt"
          wide
          value={productId}
          options={allProducts().map((p) => ({ value: p.id, label: p.name }))}
          onChange={setProductId}
        />
      </Group>
      <SummaryTiles
        items={[
          { icon: 'tag', color: 'system', value: formatEuro(product?.basePrice ?? 0), label: 'Basis' },
          { icon: 'trendUp', color: 'money', value: `${formatNumber(Math.max(...prices), 2)} €`, label: 'Höchster' },
          {
            icon: 'trendDown',
            color: 'danger',
            value: `${formatNumber(Math.min(...prices), 2)} €`,
            label: 'Tiefster',
          },
        ]}
      />
      <Group
        title={`Richtpreis pro ${product?.unit ?? 'Einheit'}`}
        icon="chart"
        color="money"
        more="Gefragt heißt: mehr Nachfrage als Ware, der Preis steigt. Gesättigt: zu viel Ware im Veedel, der Preis fällt. Konkurrenz durch Gangs drückt den Preis zusätzlich."
      >
        <List>
          {rows.map(({ veedel, price }) => {
            const t = trend(state, productId, veedel.id);
            const competition = getCompetitionFactor(state, veedel.id);
            return (
              <ListItem key={veedel.id} value={`${formatNumber(price, 2)} €`}>
                <ItemContent
                  icon={TREND_ICON[t]}
                  color={TREND_COLOR[t]}
                  title={veedel.name}
                  tags={[
                    t !== 'flat' && { label: TREND_TEXT[t], icon: TREND_ICON[t], color: TREND_COLOR[t] },
                    competition !== 1 && {
                      label: `Konkurrenz ${deviation(competition)}`,
                      icon: 'skull',
                      color: 'danger',
                    },
                  ]}
                />
              </ListItem>
            );
          })}
        </List>
      </Group>
    </div>
  );
}

/** Die auffälligsten Chancen: Produkte mit der stärksten Nachfrage ohne Angebot. */
function hotSpots(state: GameState): { productId: string; veedelId: string; factor: number }[] {
  const result: { productId: string; veedelId: string; factor: number }[] = [];
  for (const [veedelId, products] of Object.entries(state.modules.market.pressure)) {
    for (const productId of Object.keys(products)) {
      const factor = supplyDemandFactor(state, productId, veedelId);
      if (factor > 1.03) result.push({ productId, veedelId, factor });
    }
  }
  return result.sort((a, b) => b.factor - a.factor).slice(0, 3);
}

/** Laufende Marktereignisse der aktiven Stadt als Zeilen (Name, Ware, Ende). */
function MarketEventRows() {
  const { state } = useGame();
  const runs = marketEvents(state, activeCity(state));
  return (
    <>
      {runs.map((run) => {
        const def = getMarketEventDef(run.eventId);
        const days = Math.max(1, Math.ceil((run.endsAt - state.time) / MINUTES_PER_DAY));
        return (
          <ListItem key={run.id} value={days === 1 ? 'noch 1 Tag' : `noch ${days} Tage`}>
            <ItemContent
              icon={def?.icon ?? 'chart'}
              color={run.factor > 1 ? 'money' : 'danger'}
              title={def?.name ?? 'Marktereignis'}
              tags={[
                {
                  label: `${productName(run.productId)} ${run.factor > 1 ? '↑' : '↓'} ${Math.round(Math.abs(run.factor - 1) * 100)} %`,
                  icon: run.factor > 1 ? 'trendUp' : 'trendDown',
                  color: run.factor > 1 ? 'money' : 'danger',
                },
              ]}
            >
              <Disclosure>{marketEventText(run)}</Disclosure>
            </ItemContent>
          </ListItem>
        );
      })}
    </>
  );
}

/** Preisindex der aktiven Stadt: alle Waren, stärkste Bewegung zuerst. */
function IndexGroup() {
  const { state } = useGame();
  const cityId = activeCity(state);
  const rows = allProducts()
    .map((p) => ({ product: p, index: priceIndex(state, p.id, cityId) }))
    .sort((a, b) => Math.abs(b.index - 1) - Math.abs(a.index - 1));
  return (
    <Group
      title="Preisindex"
      icon="chart"
      color="money"
      note="Wie teuer die Ware gerade in der ganzen Stadt ist (1,00 = normal)."
      more="Der Index wandert jeden Tag ein Stück und zieht von selbst zurück zur Mitte, zwischen 0,85 und 1,20. Marktereignisse schieben ihn ein paar Tage an. Richtpreise auf der Straße folgen ihm ganz, der Einkauf bei den Lieferanten zur Hälfte."
    >
      <List>
        <MarketEventRows />
        {rows.map(({ product, index }) => (
          <ListItem key={product.id} value={formatNumber(index, 2)}>
            <ItemContent
              icon={index > 1.02 ? 'trendUp' : index < 0.98 ? 'trendDown' : 'minus'}
              color={index > 1.02 ? 'money' : index < 0.98 ? 'danger' : 'system'}
              title={product.name}
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

/** Auf der Lager-Seite: Marktlage, wo etwas besonders gefragt ist, und der Weg zur Markt-Übersicht. */
function MarketSection() {
  const { state } = useGame();
  const ui = useUi();
  const hot = hotSpots(state);
  const movers = allProducts()
    .map((p) => indexTrend(state, p.id))
    .filter((t) => t !== null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3);
  return (
    <Group title="Markt" icon="chart" color="money" note="Preise stellst du am Spot ein.">
      {movers.length > 0 && (
        <Chips
          items={movers.map((t) => ({
            label: t.label,
            icon: t.up ? 'trendUp' : 'trendDown',
            color: t.up ? ('money' as const) : ('danger' as const),
          }))}
        />
      )}
      <List>
        <MarketEventRows />
        {hot.map((h) => (
          <ListItem
            key={`${h.veedelId}:${h.productId}`}
            value={deviation(h.factor)}
            onClick={() => ui.openPanel('market.overview', { productId: h.productId })}
          >
            <ItemContent
              icon="trendUp"
              color="money"
              title={`${productName(h.productId)} gefragt`}
              meta={veedelName(h.veedelId)}
            />
          </ListItem>
        ))}
        <ListItem onClick={() => ui.openPanel('market.overview', {})}>
          <ItemContent
            icon="chart"
            color="money"
            title="Markt-Übersicht"
            meta={hot.length === 0 ? 'Gerade keine auffällige Nachfrage' : 'Richtpreise pro Veedel'}
          />
        </ListItem>
      </List>
    </Group>
  );
}

registerSlot('spots.spotPanel', { id: 'market.prices', order: 20, component: SpotPrices });
registerSlot('goods.warehouse', { id: 'market.summary', title: 'Markt', order: 50, component: MarketSection });
registerPanel({ id: 'market.overview', title: () => 'Markt-Übersicht', component: MarketOverview });
