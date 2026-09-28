// Oberfläche des Markts: eigene Preise im Spot-Panel, Markt-Übersicht (Richtpreise pro Veedel) als Panel und
// ein kurzer Markt-Abschnitt im Tab "Geschäft".

import { useState } from 'preact/hooks';
import { formatEuro, formatNumber, type GameState } from '../../../core';
import { Button, Card, Empty, Hint, registerPanel, registerSlot, useGame, useUi } from '../../../ui';
import { allProducts, getProduct, productName, stockSummary } from '../../goods';
import { allVeedel, veedelName } from '../../veedel';
import {
  getCompetitionFactor,
  getSpotPrice,
  hasOwnPrice,
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

function trend(state: GameState, productId: string, veedelId: string): { arrow: string; cls: string } {
  const f = supplyDemandFactor(state, productId, veedelId);
  if (f > 1.03) return { arrow: '▲', cls: 'is-up' };
  if (f < 0.97) return { arrow: '▼', cls: 'is-down' };
  return { arrow: '·', cls: '' };
}

function SpotPrices(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const stock = stockSummary(state);
  const products = allProducts().filter(
    (p) => stock.some((r) => r.productId === p.id) || hasOwnPrice(state, props.spotId, p.id),
  );
  const set = (productId: string, price: number | null) =>
    dispatch({ type: 'market.setPrice', payload: { spotId: props.spotId, productId, price } });
  return (
    <Card title="Preise">
      {products.length === 0 ? (
        <Empty>Keine Ware auf Lager.</Empty>
      ) : (
        <ul class="mkt-prices">
          {products.map((p) => {
            const price = getSpotPrice(state, props.spotId, p.id);
            const ratio = priceRatio(state, props.spotId, p.id);
            const cost = stock.find((r) => r.productId === p.id)?.unitCost ?? 0;
            const own = hasOwnPrice(state, props.spotId, p.id);
            return (
              <li key={p.id} class="mkt-price">
                <div class="mkt-price__name">
                  <strong>{p.name}</strong>
                  <span class="ui-hint">
                    Richtpreis {formatNumber(spotReferencePrice(state, props.spotId, p.id), 1)} €
                    {cost > 0 && ` · Einkauf ${formatNumber(cost, 1)} €`}
                  </span>
                </div>
                <div class="mkt-price__edit">
                  <Button small aria-label="Billiger" onClick={() => set(p.id, Math.max(STEP, price - STEP))}>
                    −
                  </Button>
                  <span class={`mkt-price__value ${price < cost ? 'is-loss' : ''}`}>
                    {formatNumber(price, 1)} €/{p.unit}
                    <small class={ratio > 1.05 ? 'is-high' : ratio < 0.95 ? 'is-low' : ''}>{deviation(ratio)}</small>
                  </span>
                  <Button small aria-label="Teurer" onClick={() => set(p.id, price + STEP)}>
                    +
                  </Button>
                  <Button
                    small
                    variant="subtle"
                    disabled={!own}
                    title="Zurück zum Richtpreis"
                    onClick={() => set(p.id, null)}
                  >
                    ↺
                  </Button>
                </div>
                {price < cost && <span class="mkt-price__warn">Unter Einkaufspreis: Jeder Verkauf ist Verlust.</span>}
              </li>
            );
          })}
        </ul>
      )}
      <Hint>Zu teuer vertreibt Kunden (Studenten zuerst, Banker zuletzt), billig lockt mehr an.</Hint>
    </Card>
  );
}

function MarketOverview(props: { productId?: string }) {
  const { state } = useGame();
  const [productId, setProductId] = useState(props.productId ?? allProducts()[0].id);
  const product = getProduct(productId);
  const rows = allVeedel()
    .map((v) => ({ veedel: v, price: referencePrice(state, productId, v.id) }))
    .sort((a, b) => b.price - a.price);
  return (
    <div class="mkt-overview">
      <div class="mkt-products">
        {allProducts().map((p) => (
          <Button key={p.id} small active={p.id === productId} onClick={() => setProductId(p.id)}>
            {p.name}
          </Button>
        ))}
      </div>
      <Hint>
        Richtpreis pro {product?.unit ?? 'Einheit'} ({product?.name}), Grundpreis {formatEuro(product?.basePrice ?? 0)}.
        ▲ mehr Nachfrage als Ware, ▼ Markt gesättigt.
      </Hint>
      <table class="mkt-table">
        <thead>
          <tr>
            <th>Veedel</th>
            <th>Richtpreis</th>
            <th>Markt</th>
            <th>Konkurrenz</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ veedel, price }) => {
            const t = trend(state, productId, veedel.id);
            const competition = getCompetitionFactor(state, veedel.id);
            return (
              <tr key={veedel.id}>
                <td>{veedel.name}</td>
                <td>{formatNumber(price, 2)} €</td>
                <td class={t.cls}>{t.arrow}</td>
                <td class={competition < 1 ? 'is-down' : competition > 1 ? 'is-up' : ''}>
                  {competition === 1 ? '–' : deviation(competition)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

function MarketSection() {
  const { state } = useGame();
  const ui = useUi();
  const hot = hotSpots(state);
  return (
    <Card
      title="Markt"
      actions={
        <Button small onClick={() => ui.openPanel('market.overview', {})}>
          Übersicht
        </Button>
      }
    >
      {hot.length === 0 ? (
        <Hint>Gerade keine auffällige Nachfrage. Preise stellst du im Spot-Panel ein.</Hint>
      ) : (
        <ul class="mkt-hot">
          {hot.map((h) => (
            <li key={`${h.veedelId}:${h.productId}`}>
              <button
                type="button"
                class="mkt-hot__item"
                onClick={() => ui.openPanel('market.overview', { productId: h.productId })}
              >
                {productName(h.productId)} gefragt in {veedelName(h.veedelId)}
                <span class="is-up">{deviation(h.factor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

registerSlot('spots.spotPanel', { id: 'market.prices', order: 20, component: SpotPrices });
registerSlot('tab:business', { id: 'market.summary', order: 40, component: MarketSection });
registerPanel({ id: 'market.overview', title: () => 'Markt-Übersicht', component: MarketOverview });
