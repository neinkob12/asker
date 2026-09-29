// Oberfläche der Ware: Lagerbestand im HUD, Lager-Panel (Posten, Qualität, strecken), Lager-Übersicht im Tab
// "Geschäft" und Lager-Marker auf der Karte.

import { formatEuro, formatPercent } from '../../../core';
import { addHtmlMarker, el, registerMapLayer } from '../../../map';
import {
  Button,
  Card,
  Empty,
  Hint,
  HudPill,
  List,
  ListItem,
  registerHudItem,
  registerPanel,
  registerSlot,
  useGame,
  useUi,
} from '../../../ui';
import {
  CUT_STEPS,
  cutPreview,
  DEFAULT_WAREHOUSE,
  formatProductAmount,
  getLots,
  getProduct,
  getStock,
  getWarehouse,
  getWarehouses,
  MAX_CUT,
  productName,
  qualityTier,
  stockSummary,
} from '../index';
import './goods.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'goods.warehouse': { warehouseId: string };
  }
}

/** "62 % · Gut" */
function QualityLabel(props: { quality: number }) {
  const tier = qualityTier(props.quality);
  return (
    <span class={`goods-quality goods-quality--${tier.id}`} title={`Qualität ${formatPercent(props.quality)}`}>
      {tier.name} · {formatPercent(props.quality)}
    </span>
  );
}

function StockHud() {
  const { state } = useGame();
  const ui = useUi();
  const grams = stockSummary(state)
    .filter((r) => getProduct(r.productId)?.unit === 'g')
    .reduce((sum, r) => sum + r.amount, 0);
  const other = getStock(state) - grams;
  const title = stockSummary(state)
    .map((r) => `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`)
    .join(', ');
  return (
    <HudPill
      icon="warehouse"
      color="green"
      label="Lager"
      value={`${formatProductAmount('weed', grams)}${other > 0 ? ` +${other}` : ''}`}
      title={title || 'Lager leer'}
      tone={grams + other <= 0 ? 'bad' : undefined}
      onClick={() => ui.openPanel('goods.warehouse', { warehouseId: DEFAULT_WAREHOUSE })}
    />
  );
}

function WarehousePanel(props: { warehouseId: string }) {
  const { state, dispatch } = useGame();
  const lots = getLots(state, { warehouseId: props.warehouseId });
  if (lots.length === 0) {
    return <Empty>Das Lager ist leer. Bestell Nachschub über die Lieferanten-App im Handy.</Empty>;
  }
  return (
    <div class="goods-panel">
      <Hint>
        Strecken macht aus wenig mehr, senkt aber die Qualität. Kenner merken das, und das kostet Ruf. Höchstens{' '}
        {formatPercent(MAX_CUT)} Streckmittel pro Posten.
      </Hint>
      <List>
        {lots.map((lot) => {
          const product = getProduct(lot.productId);
          return (
            <ListItem key={lot.id}>
              <div class="goods-lot__head">
                <strong>
                  {formatProductAmount(lot.productId, lot.amount)} {productName(lot.productId)}
                </strong>
                <QualityLabel quality={lot.quality} />
              </div>
              <div class="goods-lot__meta ui-hint">
                Einkauf {formatEuro(lot.unitCost)}/{product?.unit ?? 'g'}
                {lot.cut > 0 && <span class="goods-lot__cut"> · {formatPercent(lot.cut)} gestreckt</span>}
              </div>
              {product?.cuttable ? (
                <div class="goods-lot__actions">
                  <span class="ui-hint">Strecken:</span>
                  {CUT_STEPS.map((ratio) => {
                    const preview = cutPreview(lot, ratio);
                    const tooMuch = preview.cut > MAX_CUT + 1e-9 || preview.added < 1;
                    return (
                      <Button
                        key={ratio}
                        small
                        disabled={tooMuch || state.wallet.dirty < preview.cost}
                        title={
                          tooMuch
                            ? 'Mehr Streckmittel verträgt die Ware nicht.'
                            : `+${formatProductAmount(lot.productId, preview.added)}, Qualität danach ${formatPercent(preview.quality)}, kostet ${formatEuro(preview.cost)}`
                        }
                        onClick={() =>
                          dispatch({
                            type: 'goods.cut',
                            payload: { lotId: lot.id, ratio, warehouseId: props.warehouseId },
                          })
                        }
                      >
                        +{formatPercent(ratio)}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div class="ui-hint">Abgepackt, lässt sich nicht strecken.</div>
              )}
            </ListItem>
          );
        })}
      </List>
    </div>
  );
}

function StockSection() {
  const { state } = useGame();
  const ui = useUi();
  const rows = stockSummary(state);
  return (
    <Card
      title="Lager"
      icon="warehouse"
      color="green"
      status={rows.length === 0 ? 'bad' : 'good'}
      summary={
        rows.length === 0
          ? 'leer'
          : rows
              .slice(0, 2)
              .map((r) => formatProductAmount(r.productId, r.amount))
              .join(' · ')
      }
      actions={
        <Button small onClick={() => ui.openPanel('goods.warehouse', { warehouseId: DEFAULT_WAREHOUSE })}>
          Öffnen
        </Button>
      }
    >
      {rows.length === 0 ? (
        <Empty>Keine Ware mehr. Zeit für Nachschub.</Empty>
      ) : (
        <ul class="goods-summary">
          {rows.map((r) => (
            <li key={r.productId}>
              <span>
                {formatProductAmount(r.productId, r.amount)} {productName(r.productId)}
              </span>
              <QualityLabel quality={r.quality} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

registerHudItem({ id: 'goods.stock', order: 20, placement: 'more', icon: 'warehouse', component: StockHud });
registerSlot('tab:business', { id: 'goods.stock', order: 5, component: StockSection });
registerPanel({
  id: 'goods.warehouse',
  title: (props, state) => getWarehouse(state, props.warehouseId)?.name ?? 'Lager',
  component: WarehousePanel,
});

registerMapLayer({
  id: 'goods.warehouses',
  order: 30,
  mount(ctx) {
    const shown = new Set<string>();
    const draw = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const w of getWarehouses(state)) {
        if (shown.has(w.id)) continue;
        shown.add(w.id);
        addHtmlMarker(ctx.map, {
          position: w,
          className: 'map-place map-place--warehouse',
          anchor: 'bottom',
          tag: 'button',
          title: `${w.name} öffnen`,
          children: [el('span', 'map-place-icon'), el('span', 'map-place-name', w.name)],
          onClick: () => {
            if (!ctx.isPicking()) ctx.ui.openPanel('goods.warehouse', { warehouseId: w.id });
          },
        });
      }
    };
    draw();
    return { update: draw };
  },
});
