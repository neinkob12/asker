// Oberfläche der Ware: Lagerbestand im HUD, Lager-Seite (Posten mit Qualität und Strecken, alle Lager, darunter die
// Beiträge anderer Module über den Slot 'goods.warehouse': Hafen und Umlagern aus der Logistik, Markt) und
// Lager-Marker auf der Karte. Seit Auftrag 26 ist die Lager-Seite der eine Ort für alles rund ums Lager.

import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import { formatAmount, formatEuro, formatPercent, type GameState } from '../../../core';
import { addHtmlMarker, el, registerMapLayer } from '../../../map';
import {
  ActionSheet,
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
  ProgressBar,
  registerAdvisor,
  registerHudItem,
  registerPanel,
  registerPhoneApp,
  registerSearch,
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
  NEARLY_FULL,
  productName,
  qualityTier,
  stockSummary,
  UPGRADE_KINDS,
  upgradeCost,
  upgradeLevel,
  WAREHOUSE_UPGRADES,
  type Warehouse,
  type WarehouseUpgradeKind,
  warehouseCapacity,
  warehouseLoad,
  warehouseModifiers,
  warehouseSites,
} from '../index';
import { daysText, flowRows } from './flow';
import { supplyRoutesLayer } from './map';
import './goods.css';
import { activeCity, cityName, isBusinessSold } from '../../city';
import { phoneAppLocked } from '../../quests';

declare module '../../../ui' {
  interface PanelRegistry {
    'goods.warehouse': { warehouseId: string };
  }
  interface SlotRegistry {
    /** Abschnitte unten auf der Lager-Seite (Hafen, Umlagern, Lager kaufen, Markt). */
    'goods.warehouse': { warehouseId: string };
    /** Abschnitte in der Lager-App unter den eigenen Lagern (Fahrzeuge, Warenfluss; Auftrag 33). */
    'goods.app': Record<string, never>;
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

/**
 * Kurzanzeige im HUD: "2,1 kg Gras + 489 Stück Pillen" (die zwei größten Posten), bei mehr "2,1 kg Gras +4" (am Handy
 * ist die Kachel schmal), dazu die Aufstellung zum Aufklappen.
 */
const StockHud = memo(function StockHud() {
  const ui = useUi();
  // In der Hafen-Phase (Auftrag 40) zeigt trade die Ware in den Häfen.
  const sold = useGameSelector((state) => isBusinessSold(state));
  // Nur die angezeigten Texte lesen: Die Kachel zeichnet neu, wenn sich Wert, Titel oder Ziel ändern.
  const view = useGameSelector((state) => {
    const { cityId, rows, warehouses } = stockView(state);
    const short =
      rows.length === 0
        ? 'leer'
        : rows.length <= 2
          ? rows.map(stockText).join(' + ')
          : `${stockText(rows[0])} +${rows.length - 1}`;
    return {
      value: warehouses.length === 0 ? 'kein Lager' : short,
      title: rows.map(stockText).join(', ') || 'Lager leer',
      empty: rows.length === 0,
      warehouseId: warehouses[0]?.id ?? warehouseSites(cityId)[0]?.id ?? DEFAULT_WAREHOUSE,
    };
  }, shallowEqual);
  if (sold) return null;
  return (
    <HudPill
      data-tour="hud.stock"
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

/** Füllstand eines Lagers (0–1) und Text "12,4 kg von 20 kg". */
function fillOf(state: GameState, warehouseId: string): { share: number; text: string } {
  const load = warehouseLoad(state, warehouseId);
  const capacity = warehouseCapacity(state, warehouseId);
  return {
    share: capacity > 0 ? load / capacity : 1,
    text: `${formatAmount(Math.round(load))} von ${formatAmount(capacity)}`,
  };
}

/** Füllstand als Chip für Listen: "62 % voll", ab NEARLY_FULL orange, voll rot. */
function fillChip(share: number) {
  return {
    label: share >= 1 ? 'voll' : `${formatPercent(share)} voll`,
    icon: 'boxes',
    color: (share >= 1 ? 'danger' : share >= NEARLY_FULL ? 'warn' : 'goods') as CategoryColor,
  };
}

/** Wirkung einer Ausbau-Stufe in Worten: "×1,5 Platz", "35 % weniger Verlust". */
function upgradeEffect(kind: WarehouseUpgradeKind, value: number): string {
  if (kind === 'shelves') return `×${String(value).replace('.', ',')} Platz`;
  return `${formatPercent(1 - value)} weniger ${kind === 'vault' ? 'Verlust' : 'gefunden'}`;
}

/** Platz im Lager: Balken mit Füllstand. */
function CapacityGroup(props: { warehouseId: string }) {
  const { state } = useGame();
  const fill = fillOf(state, props.warehouseId);
  const tone = fill.share >= 1 ? 'bad' : fill.share >= NEARLY_FULL ? 'warn' : 'accent';
  return (
    <Group
      title="Platz"
      icon="boxes"
      color="goods"
      value={fill.text}
      note={
        fill.share >= 1
          ? 'Voll: Lieferungen und Fahrten warten, bis Platz ist.'
          : fill.share >= NEARLY_FULL
            ? 'Fast voll. Regale schaffen Platz.'
            : undefined
      }
    >
      <div class="goods-capacity">
        <ProgressBar value={fill.share} tone={tone} label="Füllstand" />
      </div>
    </Group>
  );
}

/** Ausbau: Regale, Tresor, Tarnung mit Stufe und Preis der nächsten Stufe; Kauf mit Rückfrage. */
function UpgradeGroup(props: { warehouseId: string }) {
  const { state, dispatch } = useGame();
  const [asked, setAsked] = useState<WarehouseUpgradeKind | null>(null);
  const mods = warehouseModifiers(state, props.warehouseId);
  const name = getWarehouse(state, props.warehouseId)?.name ?? 'Lager';
  const askedCost = asked ? upgradeCost(state, props.warehouseId, asked) : null;
  const askedDef = asked ? WAREHOUSE_UPGRADES[asked] : null;
  const askedNext = asked && askedDef ? askedDef.levels[upgradeLevel(state, props.warehouseId, asked)] : undefined;
  return (
    <Group
      title="Ausbau"
      icon="trendUp"
      color="money"
      more="Ausbau ist legal und kostet sauberes Geld. Der Tresor schützt bei Einbruch und Überfall, die Tarnung bei Razzien."
    >
      <List>
        {UPGRADE_KINDS.map((kind) => {
          const def = WAREHOUSE_UPGRADES[kind];
          const level = mods.levels[kind];
          const cost = upgradeCost(state, props.warehouseId, kind);
          const current = level > 0 ? def.levels[level - 1] : undefined;
          return (
            <ListItem
              key={kind}
              aside={
                cost === null ? (
                  <Chip color="money" icon="checkCircle">
                    fertig
                  </Chip>
                ) : (
                  <Button small disabled={state.wallet.clean < cost} onClick={() => setAsked(kind)}>
                    {formatEuro(cost)}
                  </Button>
                )
              }
            >
              <ItemContent
                icon={def.icon}
                color="money"
                title={def.name}
                meta={def.effect}
                tags={[
                  { label: `Stufe ${level}/${def.levels.length}`, icon: 'layers' },
                  current && { label: upgradeEffect(kind, current.value), icon: 'checkCircle', color: 'money' },
                ]}
              />
            </ListItem>
          );
        })}
      </List>
      <ActionSheet
        open={asked !== null}
        onClose={() => setAsked(null)}
        title={askedDef ? `${askedDef.name} für ${name}?` : ''}
        message={
          askedDef && askedNext && askedCost !== null
            ? `Stufe ${upgradeLevel(state, props.warehouseId, asked as WarehouseUpgradeKind) + 1}: ${upgradeEffect(asked as WarehouseUpgradeKind, askedNext.value)}. Kostet ${formatEuro(askedCost)} sauberes Geld.`
            : undefined
        }
        actions={[
          {
            label: askedCost !== null ? `Ausbauen (${formatEuro(askedCost)})` : 'Ausbauen',
            icon: 'trendUp',
            disabled: askedCost === null || state.wallet.clean < askedCost,
            onSelect: () => {
              if (asked) {
                dispatch({ type: 'goods.upgradeWarehouse', payload: { warehouseId: props.warehouseId, kind: asked } });
              }
              setAsked(null);
            },
          },
        ]}
      />
    </Group>
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
              <ItemContent
                icon="warehouse"
                color="goods"
                title={w.name}
                meta={meta}
                tags={[fillChip(fillOf(state, w.id).share)]}
              />
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
      <CapacityGroup warehouseId={props.warehouseId} />
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
      <UpgradeGroup warehouseId={props.warehouseId} />
      <WarehouseList warehouseId={props.warehouseId} />
      <Slot name="goods.warehouse" props={{ warehouseId: props.warehouseId }} />
    </div>
  );
}

/** Zeile zur Seite Warenfluss: knappste Ware als Chip, Engpass rot. */
function FlowLink() {
  const { state } = useGame();
  const ui = useUi();
  const rows = flowRows(state).filter((r) => r.perDay > 0);
  const tightest = [...rows].sort((a, b) => a.days - b.days)[0];
  const short = rows.filter((r) => r.shortage);
  return (
    <Group title="Warenfluss" icon="chart" color={short.length > 0 ? 'danger' : 'goods'}>
      <List>
        <ListItem onClick={() => ui.openPanel('goods.flow', {})}>
          <ItemContent
            icon="chart"
            color={short.length > 0 ? 'danger' : 'goods'}
            title={
              short.length > 0 ? `Engpass: ${short.map((r) => r.product.name).join(', ')}` : 'Verbrauch und Bestand'
            }
            tags={[
              tightest && {
                label: `${tightest.product.name} ${daysText(tightest.days)}`,
                icon: 'clock',
                color: tightest.shortage ? 'danger' : 'goods',
              },
            ]}
          />
        </ListItem>
      </List>
    </Group>
  );
}

/**
 * Standorte zum Kaufen (sauberes Geld). Der Kauf fragt nach (J11: ein Tipp kaufte sofort für 3.000 €), das Blatt nennt
 * Preis und Platz.
 */
function ForSaleGroup(props: { forSale: readonly Warehouse[] }) {
  const { state, dispatch } = useGame();
  const [asked, setAsked] = useState<Warehouse | null>(null);
  return (
    <Group title="Zu kaufen (sauberes Geld)" icon="building" color="money" count={props.forSale.length}>
      {props.forSale.length === 0 ? (
        <Empty icon="building">Hier gibt es keinen Standort mehr zu kaufen.</Empty>
      ) : (
        <List>
          {props.forSale.map((w) => (
            <ListItem
              key={w.id}
              aside={
                <Button small disabled={state.wallet.clean < w.cost} onClick={() => setAsked(w)}>
                  {formatEuro(w.cost)}
                </Button>
              }
            >
              <ItemContent
                icon="building"
                color="money"
                title={w.name}
                meta={w.description}
                tags={[{ label: `Platz ${formatAmount(w.capacity)}`, icon: 'boxes', color: 'goods' }]}
              />
            </ListItem>
          ))}
        </List>
      )}
      <ActionSheet
        open={asked !== null}
        onClose={() => setAsked(null)}
        title={asked ? `${asked.name} kaufen?` : ''}
        message={
          asked
            ? `Kostet ${formatEuro(asked.cost)} sauberes Geld, Platz für ${formatAmount(asked.capacity)}. Gekauft ist gekauft.`
            : undefined
        }
        actions={[
          {
            label: asked ? `Kaufen (${formatEuro(asked.cost)})` : 'Kaufen',
            icon: 'building',
            disabled: !asked || state.wallet.clean < asked.cost,
            onSelect: () => {
              if (asked) dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: asked.id } });
              setAsked(null);
            },
          },
        ]}
      />
    </Group>
  );
}

/**
 * Handy-App "Lager": deine Lager in der aktiven Stadt (Tipp öffnet die Lager-Seite) und die Standorte zum Kaufen. Ohne
 * Lager in der Stadt (neue Stadt) stehen die Standorte ganz oben (J11), vorher kamen erst Warenfluss und Fahrzeuge.
 */
function WarehouseApp() {
  const { state } = useGame();
  const ui = useUi();
  const cityId = activeCity(state);
  const owned = getWarehouses(state, cityId);
  const forSale = warehouseSites(cityId).filter((w) => !owned.some((o) => o.id === w.id));
  return (
    <div class="goods-panel">
      {owned.length === 0 && <ForSaleGroup forSale={forSale} />}
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
                  <ItemContent
                    icon="warehouse"
                    color="goods"
                    title={w.name}
                    meta={meta}
                    tags={[fillChip(fillOf(state, w.id).share)]}
                  />
                </ListItem>
              );
            })}
          </List>
        </Group>
      )}
      <FlowLink />
      <Slot name="goods.app" props={{}} />
      {owned.length > 0 && <ForSaleGroup forSale={forSale} />}
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
  // Nach dem Verkauf liegt die Ware in den Häfen (Handel › Hafen, Auftrag 43). Am Anfang kommt sie mit Peters Quest.
  hiddenWhen: (state) => isBusinessSold(state) || phoneAppLocked(state, 'goods.app'),
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
        // Ware ohne Gramm (Stück, ml, Pens) als Zahl der Sorten, nicht als Summe ohne Einheit („+1416“, N10).
        const other = rows.filter((r) => r.amount > 0 && getProduct(r.productId)?.unit !== 'g').length;
        const text = `${w.name} · ${formatProductAmount(DEFAULT_PRODUCT, grams)}${other > 0 ? ` + ${other} weitere` : ''}`;
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

registerMapLayer(supplyRoutesLayer);

// Erster Schritt in einer neuen Stadt (Auftrag 43): Ohne Lager keine Ware. Fehlt sauberes Geld, erst waschen.
registerAdvisor({
  id: 'goods.firstWarehouse',
  advise: (state) => {
    const cityId = activeCity(state);
    if (isBusinessSold(state) || getWarehouses(state, cityId).length > 0) return null;
    const sites = warehouseSites(cityId).filter((w) => w.cost > 0);
    if (sites.length === 0) return null;
    const cheapest = Math.min(...sites.map((w) => w.cost));
    const missing = Math.ceil(cheapest - state.wallet.clean);
    const city = cityName(cityId);
    return missing > 0
      ? {
          id: 'goods.firstWarehouse.wash',
          priority: 70,
          icon: 'washing',
          title: `Geld waschen für ein Lager in ${city}`,
          text: `Ein Lager kostet sauberes Geld. Für das billigste fehlen dir ${formatEuro(missing)}.`,
          actionLabel: 'Geldwäsche',
          action: (ui) => ui.openPhone('laundering.app'),
        }
      : {
          id: 'goods.firstWarehouse.buy',
          priority: 70,
          icon: 'warehouse',
          title: `Lager in ${city} kaufen`,
          text: `Ohne Lager keine Ware: Lieferanten liefern dorthin. Das billigste kostet ${formatEuro(cheapest)} sauber.`,
          actionLabel: 'Standorte',
          action: (ui) => ui.openPhone('goods.app'),
        };
  },
});

// Eigene Lager der Stadt in der Suche (Auftrag 43, G12: „Lager“ fand die Garage Barmbek nicht).
registerSearch({
  id: 'goods.warehouses',
  label: 'Lager',
  order: 25,
  items: (state) =>
    getWarehouses(state, activeCity(state)).map((w) => ({
      id: `warehouse:${w.id}`,
      title: w.name,
      subtitle: 'Eigenes Lager',
      icon: 'warehouse',
      keywords: 'Lager Ware Bestand Regale Tresor',
      run: (ui) => ui.openPanel('goods.warehouse', { warehouseId: w.id }),
    })),
});
