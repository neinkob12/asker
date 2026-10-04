// Oberfläche der Ware: Lagerbestand im HUD, Lager-Seite (Posten mit Qualität und Strecken, alle Lager, darunter die
// Beiträge anderer Module über den Slot 'goods.warehouse': Hafen und Umlagern aus der Logistik, Markt) und
// Lager-Marker auf der Karte. Seit Auftrag 26 ist die Lager-Seite der eine Ort für alles rund ums Lager.

import { memo } from 'preact/compat';
import { formatEuro, formatPercent } from '../../../core';
import { addHtmlMarker, el, registerMapLayer } from '../../../map';
import {
  Button,
  type CategoryColor,
  Chip,
  Chips,
  Empty,
  Group,
  HudPill,
  ItemContent,
  iconElement,
  List,
  ListItem,
  memoState,
  registerHudItem,
  registerPanel,
  registerPhoneApp,
  Slot,
  shallowEqual,
  useGame,
  useGameSelector,
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
  warehouseSites,
} from '../index';
import './goods.css';
import { activeCity } from '../../city';

declare module '../../../ui' {
  interface PanelRegistry {
    'goods.warehouse': { warehouseId: string };
  }
  interface SlotRegistry {
    /** Abschnitte unten auf der Lager-Seite (Hafen, Umlagern, Lager kaufen, Markt). */
    'goods.warehouse': { warehouseId: string };
  }
}

/** Farbe der Qualitätsstufe (gut grün, schwach orange, Dreck rot). */
const TIER_COLOR: Record<string, CategoryColor> = {
  premium: 'money',
  good: 'money',
  solid: 'system',
  weak: 'warn',
  trash: 'danger',
};

/** Qualität als Chip: "Gut 62 %". */
function QualityLabel(props: { quality: number }) {
  const tier = qualityTier(props.quality);
  return (
    <Chip color={TIER_COLOR[tier.id] ?? 'system'} icon="star" title={`Qualität ${formatPercent(props.quality)}`}>
      {tier.name} {formatPercent(props.quality)}
    </Chip>
  );
}

const stockText = (r: { productId: string; amount: number }) =>
  `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`;

/**
 * Lager der aktiven Stadt (Auftrag 30: In Hamburg zählt nur, was dort liegt), größte Posten zuerst. Einmal pro
 * Spielstand gerechnet: Pille und Aufstellung lesen dieselbe Liste, ohne Lager zweimal zu durchlaufen.
 */
const stockView = memoState((state) => {
  const cityId = activeCity(state);
  const rows = [...stockSummary(state, undefined, cityId)].sort((a, b) => b.amount - a.amount);
  return { cityId, rows, warehouses: getWarehouses(state, cityId) };
});

/** Kurzanzeige im HUD: "2,1 kg Gras + 489 Stück Pillen" (die zwei größten Posten), dazu die Aufstellung zum Aufklappen. */
const StockHud = memo(function StockHud() {
  const ui = useUi();
  // Nur die angezeigten Texte lesen: Die Kachel zeichnet neu, wenn sich Wert, Titel oder Ziel ändern.
  const view = useGameSelector((state) => {
    const { cityId, rows, warehouses } = stockView(state);
    const short =
      rows.length === 0
        ? 'leer'
        : rows.length <= 2
          ? rows.map(stockText).join(' + ')
          : `${stockText(rows[0])} + ${rows.length - 1} weitere`;
    return {
      value: warehouses.length === 0 ? 'kein Lager' : short,
      title: rows.map(stockText).join(', ') || 'Lager leer',
      empty: rows.length === 0,
      warehouseId: warehouses[0]?.id ?? warehouseSites(cityId)[0]?.id ?? DEFAULT_WAREHOUSE,
    };
  }, shallowEqual);
  return (
    <HudPill
      icon="warehouse"
      color="goods"
      label="Lager"
      value={view.value}
      title={view.title}
      tone={view.empty ? 'bad' : undefined}
      onClick={() => ui.openPanel('goods.warehouse', { warehouseId: view.warehouseId })}
      detailsAction="Lager öffnen"
      // Eine Komponente statt fertigem Inhalt: Die Aufstellung rechnet erst, wenn die Karte aufgeklappt ist.
      details={<StockFlyout />}
    />
  );
});

/** Aufstellung des Lagers in der aufgeklappten Karte der HUD-Kachel (zeichnet sich selbst neu, solange sie offen ist). */
function StockFlyout() {
  const ui = useUi();
  const lines = useGameSelector(
    (state) => {
      const { rows, warehouses } = stockView(state);
      return rows.map((r) => {
        const inWarehouses = warehouses.filter(
          (w) => getStock(state, { warehouseId: w.id, productId: r.productId }) > 0,
        );
        const where =
          warehouses.length > 1 && inWarehouses.length > 0
            ? ` (${inWarehouses.map((w) => w.name.replace(/^(Lager|Garage|Halle|Keller) /, '')).join(', ')})`
            : '';
        return {
          productId: r.productId,
          text: stockText(r),
          meta: `${qualityTier(r.quality).name} ${formatPercent(r.quality)}${where}`,
        };
      });
    },
    (a, b) => a.length === b.length && a.every((line, i) => shallowEqual(line, b[i])),
  );
  return (
    <div class="goods-flyout">
      {lines.length === 0 ? (
        <p class="goods-flyout__empty">Nichts auf Lager. Zeit für Nachschub.</p>
      ) : (
        <ul class="goods-flyout__rows">
          {lines.map((line) => (
            <li key={line.productId}>
              <strong>{line.text}</strong>
              <span>{line.meta}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="hud-flyout__action is-secondary" onClick={() => ui.openPhone('suppliers.app')}>
        Bestellen
      </button>
    </div>
  );
}

/** Alle eigenen Lager als Zeilen; das offene ist markiert, ein Tipp wechselt dorthin (ersetzt die Seite). */
function WarehouseList(props: { warehouseId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const warehouses = getWarehouses(state, activeCity(state));
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
  // Noch kein Lager in dieser Stadt (z.B. frisch in Hamburg): kein leerer Bestand, der Kauf steht oben (Slot).
  const hasWarehouse = getWarehouses(state, activeCity(state)).length > 0;
  if (!hasWarehouse) {
    return (
      <div class="goods-panel">
        <Slot name="goods.warehouse" props={{ warehouseId: props.warehouseId }} />
      </div>
    );
  }
  return (
    <div class="goods-panel">
      <Group
        title="Bestand"
        icon="boxes"
        color="goods"
        count={lots.length}
        more={
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
                  <Chips
                    class="goods-lot__meta"
                    items={[
                      { label: `Einkauf ${formatEuro(lot.unitCost)}/${product?.unit ?? 'g'}`, icon: 'cart' },
                      lot.cut > 0 && { label: `${formatPercent(lot.cut)} gestreckt`, icon: 'flask', color: 'warn' },
                    ]}
                  />
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

/** Handy-App "Lager": deine Lager in der aktiven Stadt (Tipp öffnet die Lager-Seite) und die Standorte zum Kaufen. */
function WarehouseApp() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const cityId = activeCity(state);
  const owned = getWarehouses(state, cityId);
  const forSale = warehouseSites(cityId).filter((w) => !owned.some((o) => o.id === w.id));
  return (
    <div class="goods-panel">
      {owned.length > 0 && (
        <Group title="Deine Lager" icon="warehouse" color="goods" count={owned.length}>
          <List>
            {owned.map((w) => {
              const rows = stockSummary(state, w.id);
              const meta =
                rows.length === 0
                  ? 'leer'
                  : rows
                      .slice(0, 2)
                      .map((r) => `${formatProductAmount(r.productId, r.amount)} ${productName(r.productId)}`)
                      .join(', ');
              return (
                <ListItem key={w.id} onClick={() => ui.openPanel('goods.warehouse', { warehouseId: w.id })}>
                  <ItemContent icon="warehouse" color="goods" title={w.name} meta={meta} />
                </ListItem>
              );
            })}
          </List>
        </Group>
      )}
      <Group title="Zu kaufen (sauberes Geld)" icon="building" color="money" count={forSale.length}>
        {forSale.length === 0 ? (
          <Empty icon="building">Hier gibt es keinen Standort mehr zu kaufen.</Empty>
        ) : (
          <List>
            {forSale.map((w) => (
              <ListItem
                key={w.id}
                aside={
                  <Button
                    small
                    disabled={state.wallet.clean < w.cost}
                    onClick={() => dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: w.id } })}
                  >
                    {formatEuro(w.cost)}
                  </Button>
                }
              >
                <ItemContent icon="building" color="money" title={w.name} meta={w.description} />
              </ListItem>
            ))}
          </List>
        )}
      </Group>
    </div>
  );
}

registerPhoneApp({
  id: 'goods.app',
  name: 'Lager',
  icon: 'warehouse',
  order: 25,
  color: 'goods',
  component: WarehouseApp,
});
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
            near: true,
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
