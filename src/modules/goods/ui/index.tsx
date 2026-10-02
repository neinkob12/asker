// Oberfläche der Ware: Lagerbestand im HUD, Lager-Seite (Posten mit Qualität und Strecken, alle Lager, darunter die
// Beiträge anderer Module über den Slot 'goods.warehouse': Hafen und Umlagern aus der Logistik, Markt) und
// Lager-Marker auf der Karte. Seit Auftrag 26 ist die Lager-Seite der eine Ort für alles rund ums Lager.

import { formatEuro, formatPercent } from '../../../core';
import { addHtmlMarker, el, registerMapLayer } from '../../../map';
import {
  Button,
  Empty,
  Group,
  HudPill,
  ItemContent,
  iconElement,
  List,
  ListItem,
  registerHudItem,
  registerPanel,
  Slot,
  useGame,
  useUi,
} from '../../../ui';
import {
  CUT_STEPS,
  cutPreview,
  DEFAULT_PRODUCT,
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
  interface SlotRegistry {
    /** Abschnitte unten auf der Lager-Seite (Hafen, Umlagern, Lager kaufen, Markt). */
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
      color="goods"
      label="Lager"
      value={`${formatProductAmount('weed', grams)}${other > 0 ? ` +${other}` : ''}`}
      title={title || 'Lager leer'}
      tone={grams + other <= 0 ? 'bad' : undefined}
      onClick={() => ui.openPanel('goods.warehouse', { warehouseId: DEFAULT_WAREHOUSE })}
    />
  );
}

/** Alle eigenen Lager als Zeilen; das offene ist markiert, ein Tipp wechselt dorthin (ersetzt die Seite). */
function WarehouseList(props: { warehouseId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const warehouses = getWarehouses(state);
  return (
    <Group title="Deine Lager" icon="warehouse" color="goods" count={warehouses.length}>
      <List>
        {warehouses.map((w) => {
          const rows = stockSummary(state, w.id);
          const meta =
            rows.length === 0
              ? 'leer'
              : rows
                  .slice(0, 2)
                  .map((r) => `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`)
                  .join(', ');
          return (
            <ListItem
              key={w.id}
              active={w.id === props.warehouseId}
              onClick={() => ui.openPanel('goods.warehouse', { warehouseId: w.id })}
              value={w.id === props.warehouseId ? 'offen' : undefined}
            >
              <ItemContent icon="warehouse" color="goods" title={w.name} meta={meta} />
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}

function WarehousePanel(props: { warehouseId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const lots = getLots(state, { warehouseId: props.warehouseId });
  return (
    <div class="goods-panel">
      <Group
        title="Bestand"
        icon="boxes"
        color="goods"
        count={lots.length}
        note={
          lots.length > 0
            ? `Strecken macht aus wenig mehr, senkt aber die Qualität. Kenner merken das, und das kostet Ruf. Höchstens ${formatPercent(MAX_CUT)} Streckmittel pro Posten.`
            : undefined
        }
      >
        {lots.length === 0 ? (
          <Empty icon="boxes" action={<Button onClick={() => ui.openPhone('suppliers.app')}>Bestellen</Button>}>
            Dieses Lager ist leer. Nachschub bestellst du bei den Lieferanten.
          </Empty>
        ) : (
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
        )}
      </Group>
      <WarehouseList warehouseId={props.warehouseId} />
      <Slot name="goods.warehouse" props={{ warehouseId: props.warehouseId }} />
    </div>
  );
}

registerHudItem({ id: 'goods.stock', order: 20, placement: 'more', icon: 'warehouse', component: StockHud });
registerPanel({
  id: 'goods.warehouse',
  title: (props, state) => getWarehouse(state, props.warehouseId)?.name ?? 'Lager',
  component: WarehousePanel,
});

registerMapLayer({
  id: 'goods.warehouses',
  order: 30,
  mount(ctx) {
    // Eigene Lager: runde Kachel (Ort, blau) und Glas-Pille mit Name und Bestand, z.B. "Lager Ehrenfeld · 640 g".
    const shown = new Map<string, { name: HTMLElement; text: string }>();
    const draw = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const w of getWarehouses(state)) {
        let entry = shown.get(w.id);
        if (!entry) {
          const tile = el('span', 'map-place-icon');
          tile.appendChild(iconElement('warehouse', { strokeWidth: 2.2 }));
          const name = el('span', 'map-place-name', w.name);
          addHtmlMarker(ctx.map, {
            position: w,
            className: 'map-place map-place--warehouse',
            anchor: 'bottom',
            tag: 'button',
            title: `${w.name} öffnen`,
            children: [tile, name],
            onClick: () => {
              if (!ctx.isPicking()) ctx.ui.openPanel('goods.warehouse', { warehouseId: w.id });
            },
          });
          entry = { name, text: '' };
          shown.set(w.id, entry);
        }
        const rows = stockSummary(state, w.id);
        const grams = rows.filter((r) => getProduct(r.productId)?.unit === 'g').reduce((sum, r) => sum + r.amount, 0);
        const other = rows.reduce((sum, r) => sum + r.amount, 0) - grams;
        const text = `${w.name} · ${formatProductAmount(DEFAULT_PRODUCT, grams)}${other > 0 ? ` +${other}` : ''}`;
        if (text !== entry.text) {
          entry.text = text;
          entry.name.textContent = text;
        }
      }
    };
    draw();
    return { update: draw };
  },
});
