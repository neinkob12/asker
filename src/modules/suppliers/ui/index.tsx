// Oberfläche der Lieferanten: Handy-App "Lieferanten" (freischalten, bestellen, Beziehung, Kredit), Lieferungen im
// Tab "Geschäft", Routen und Transporter auf der Karte, Hinweise bei Lieferproblemen. Das Angebot steht nach Warenart
// geordnet, bestellt wird einzeln oder als Sammelbestellung (Feedback vom 07.10.2026).

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Button,
  Chips,
  Disclosure,
  Group,
  Hint,
  ItemContent,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  PhoneScreen,
  ProgressBar,
  registerAdvisor,
  registerPhoneApp,
  SegmentedControl,
  Select,
  Slot,
  Stepper,
  soundOnEvent,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityName, isBusinessSold, relationFactor } from '../../city';
import {
  formatProductAmount,
  getProduct,
  getStock,
  getWarehouse,
  getWarehouses,
  PRODUCT_CATEGORIES,
  productName,
  qualityTier,
  warehousePlace,
} from '../../goods';
import { cargoAmount, defaultPickupWarehouse, hasBerth, inTransitAmount, portName } from '../../logistics';
import { indexTrend, purchaseIndex } from '../../market';
import { tutorialAllows } from '../../tutorial';
import {
  activeDeal,
  assortment,
  availableCredit,
  availablePackages,
  CHOICE_NAMES,
  canUnlock,
  creditLimit,
  deliversTo,
  expectedArrival,
  forceShipmentProblem,
  GROUP_ORDER,
  getDeals,
  getRelation,
  getSupplier,
  getSuppliers,
  isBlocked,
  isUnlocked,
  type OrderLine,
  type OrderMode,
  orderQuote,
  type ProblemChoice,
  packagePrice,
  type Shipment,
  type Supplier,
  type SupplierPackage,
  seizeChance,
  shipmentItems,
  shipmentProgress,
  shipmentReason,
  shipmentSupplier,
  shipmentsInTransit,
  supplierDescription,
  supplierDiscount,
  supplierIn,
  trustLabel,
  unlockRequirements,
} from '../index';
import { suppliersLayer } from './map';
import './island';
import './meet';
import './suppliers.css';

const APP_ID = 'suppliers.app';

const KIND_NAME: Record<Supplier['kind'], string> = { port: 'Hafen', city: 'Großstadt' };

function ShipmentRow(props: { state: GameState; shipment: Shipment; showSupplier?: boolean }) {
  const { state, shipment: s } = props;
  const supplier = shipmentSupplier(state, s);
  const pkg = supplier?.packages.find((p) => p.id === s.packageId);
  const delayed = s.problem === 'delayed' && s.problemRevealed;
  const target = s.toPort ? 'an den Kai' : warehousePlace(getWarehouse(state, s.warehouseId)?.name ?? 'Lager', 'into');
  return (
    <div class="shipment">
      <div class="shipment__head">
        <span>
          {s.extra ? 'Sammellieferung' : (pkg?.label ?? productName(s.productId))}
          {props.showSupplier && supplier ? ` aus ${supplier.name}` : ''} {target}
        </span>
        <span class={delayed ? 'shipment__eta is-late' : 'shipment__eta'}>
          {delayed ? 'verspätet, ' : ''}an {clock.formatTime(expectedArrival(s))}
        </span>
      </div>
      {s.extra && (
        <Chips
          items={shipmentItems(s).map((x) => ({
            label: `${formatProductAmount(x.productId, x.amount)} ${productName(x.productId)}`,
            color: 'goods' as const,
          }))}
        />
      )}
      <ProgressBar value={shipmentProgress(state, s)} tone={delayed ? 'warn' : 'accent'} label="Lieferung" />
      <ShipmentTrouble state={state} shipment={s} />
    </div>
  );
}

/** Auftrag 23: Grund des Problems, gewählte Antwort und offene Rückfrage mit Knöpfen. */
function ShipmentTrouble(props: { state: GameState; shipment: Shipment }) {
  const { dispatch } = useGame();
  const ui = useUi();
  const { state, shipment: s } = props;
  const reason = s.problemRevealed || s.decision ? shipmentReason(state, s) : null;
  const chips = [
    reason ? { label: reason, color: 'warn' as const, icon: 'alert' as const } : null,
    s.choice && s.choice !== 'wait' ? { label: CHOICE_NAMES[s.choice], color: 'goods' as const } : null,
    s.partOf ? { label: 'Rest der Teillieferung', color: 'system' as const } : null,
  ];
  if (!chips.some(Boolean) && !s.decision) return null;
  const d = s.decision;
  return (
    <div class="shipment__trouble">
      <Chips items={chips} />
      {d && (
        <div class="shipment__choices">
          {d.choices.map((choice) => (
            <Button
              key={choice}
              small
              variant={choice === 'wait' ? 'subtle' : 'default'}
              onClick={() => {
                const r = dispatch({ type: 'suppliers.resolveProblem', payload: { shipmentId: s.id, choice } });
                if (!r.ok) ui.toast(r.reason, 'warn');
              }}
            >
              {choiceLabel(state, s, choice)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function choiceLabel(state: GameState, s: Shipment, choice: ProblemChoice): string {
  const cost = s.decision ? formatEuro(s.decision.cost) : '';
  if (choice === 'detour') return `Umweg (${cost})`;
  if (choice === 'bribe') return `Schmieren (${cost})`;
  if (choice === 'papers') return 'Papiere fälschen';
  if (choice === 'partial') return 'Teillieferung';
  if (choice === 'redirect') {
    const target = s.decision?.redirectTo ? getWarehouse(state, s.decision.redirectTo)?.name : undefined;
    return `Ins ${target ?? 'andere Lager'}`;
  }
  return s.decision?.kind === 'seize' ? 'Aufgeben' : 'Abwarten';
}

/**
 * Chips am Paket: Rabatt-Aktion des Lieferanten und Bewegung des Markts (ab ±5 %). Steigt der Index, wird der
 * Einkauf teurer.
 */
function PackageChips(props: {
  supplierId: string;
  packageId: string;
  productId: string;
  /** Container-Paket (Auftrag 33). */
  container?: 'full' | 'shared';
}) {
  const { state } = useGame();
  const trend = indexTrend(state, props.productId);
  const deal = activeDeal(state, props.supplierId, props.packageId);
  if (!trend && !deal && !props.container) return null;
  return (
    <Chips
      items={[
        props.container === 'full' && { label: 'ganzer Container', icon: 'package', color: 'goods' },
        props.container === 'shared' && { label: 'geteilt: fremde Ware drin', icon: 'alert', color: 'warn' },
        deal && {
          label: `Aktion −${Math.round(deal.discount * 100)} % bis ${clock.weekdayName(deal.endsAt - 1, true)}`,
          icon: 'percent',
          color: 'money',
        },
        trend && {
          // Der Einkauf folgt dem Markt nur zur Hälfte: Der Chip zeigt, was das Paket dadurch kostet.
          label: `Einkauf ${trend.up ? '↑' : '↓'} ${Math.round(Math.abs(purchaseIndex(state, props.productId) - 1) * 100)} %`,
          icon: trend.up ? 'trendUp' : 'trendDown',
          color: trend.up ? 'warn' : 'money',
          title: `${trend.label} am Markt, der Einkauf folgt zur Hälfte.`,
        },
      ]}
    />
  );
}

/** Eine Zeile der Liste: Kachel (Schiff oder Transporter, gesperrt mit Schloss), Name, Stand, Etikett. */
function SupplierRow(props: { supplier: Supplier; onSelect: (id: string) => void }) {
  const { state } = useGame();
  const s = props.supplier;
  const rel = getRelation(state, s.id);
  const underway = shipmentsInTransit(state, activeCity(state)).filter((x) => x.supplierId === s.id).length;
  const unlocked = isUnlocked(state, s.id);
  const ready = !unlocked && canUnlock(state, s.id).ok;
  const missing = unlockRequirements(state, s.id).find((r) => !r.done);
  const blocked = isBlocked(state, s.id);
  const meta = unlocked
    ? undefined
    : ready
      ? `Bereit: ${s.unlock && s.unlock.fee > 0 ? `${formatEuro(s.unlock.fee)} Vermittlung` : 'ohne Gebühr'}`
      : `Fehlt: ${missing?.label ?? '…'}`;
  const tags = [
    { label: s.name, icon: 'pin', color: 'place' as const },
    ...(unlocked
      ? [
          { label: KIND_NAME[s.kind], icon: s.kind === 'port' ? 'ship' : 'truck', color: 'goods' as const },
          { label: clock.formatDuration(s.deliveryTime), icon: 'clock' },
          { label: trustLabel(rel.trust), icon: 'handshake', color: 'money' as const },
        ]
      : []),
    unlocked &&
      getDeals(state, activeCity(state)).some((d) => d.supplierId === s.id) && {
        label: 'Aktion',
        icon: 'percent',
        color: 'money' as const,
      },
  ];
  const tag = blocked ? (
    <Tag category="danger" icon="alert">
      Schulden
    </Tag>
  ) : rel.debt > 0 ? (
    <Tag category="warn" icon="coinEuro">
      {formatEuro(rel.debt)}
    </Tag>
  ) : underway > 0 ? (
    <Tag category="goods" icon="truck">
      {underway} unterwegs
    </Tag>
  ) : ready ? (
    <Tag category="money" icon="unlock">
      bereit
    </Tag>
  ) : null;
  return (
    <ListItem onClick={() => props.onSelect(s.id)} aside={tag ?? undefined}>
      <ItemContent
        icon={unlocked ? (s.kind === 'port' ? 'ship' : 'truck') : ready ? 'unlock' : 'lock'}
        color={unlocked ? 'goods' : ready ? 'money' : 'system'}
        title={s.contactName}
        meta={meta}
        tags={tags}
      />
    </ListItem>
  );
}

function SupplierList(props: { onSelect: (id: string) => void }) {
  const { state } = useGame();
  const open = getSuppliers(state, activeCity(state)).filter((s) => isUnlocked(state, s.id));
  const locked = getSuppliers(state, activeCity(state)).filter((s) => !isUnlocked(state, s.id));
  // Schiffe an den eigenen Kai stehen im Tracker oben (Slot 'suppliers.top', Logistik), hier nur der Rest. Nur die
  // Stadt, in der du spielst: Was der Statthalter einer anderen Stadt bestellt hat, geht dich hier nichts an.
  const shipments = shipmentsInTransit(state, activeCity(state)).filter((s) => !s.toPort);
  const debts = getSuppliers(state, activeCity(state)).filter((s) => getRelation(state, s.id).debt > 0);
  return (
    <div class="sup-groups">
      <Slot name="suppliers.top" props={{}} />
      {shipments.length > 0 && (
        <Group data-tour="suppliers.shipments" icon="route" color="goods" title="Unterwegs" count={shipments.length}>
          {shipments.map((s) => (
            <ShipmentRow key={s.id} state={state} shipment={s} showSupplier />
          ))}
        </Group>
      )}
      {debts.map((s) => (
        <p key={s.id} class={isBlocked(state, s.id) ? 'sup-debt is-overdue' : 'sup-debt'}>
          Schulden bei {s.name}: {formatEuro(getRelation(state, s.id).debt)}
        </p>
      ))}
      <Group icon="truck" color="goods" title="Liefern an dich" count={open.length}>
        <List>
          {open.map((s) => (
            <SupplierRow key={s.id} supplier={s} onSelect={props.onSelect} />
          ))}
        </List>
      </Group>
      {locked.length > 0 && (
        <Group
          icon="lock"
          color="system"
          title="Noch kein Geschäft"
          count={locked.length}
          note="Mit mehr Umsatz, eigenen Veedeln und einem Liegeplatz melden sie sich per Handy."
          more="Großstädte liefern schnell kleine Mengen, der Hafen günstig große. Jeder Lieferant hat eigene Bedingungen; was fehlt, steht in der Zeile."
        >
          <List>
            {locked.map((s) => (
              <SupplierRow key={s.id} supplier={s} onSelect={props.onSelect} />
            ))}
          </List>
        </Group>
      )}
      <Slot name="suppliers.list" props={{}} />
    </div>
  );
}

declare module '../../../ui' {
  interface SlotRegistry {
    /** Abschnitte unten in der Liste der Lieferanten-App (z.B. Hafen, Routen und Fahrer aus der Logistik). */
    'suppliers.list': Record<string, never>;
    /** Abschnitte oben in der Liste (Schiffs-Tracker der Logistik, Auftrag 33). */
    'suppliers.top': Record<string, never>;
  }
}

/** Noch gesperrt: Bedingungen mit Stand, Freischalten, sobald alles erfüllt ist. */
function LockedSupplier(props: { supplierId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const supplier = getSupplier(state, props.supplierId);
  if (!supplier?.unlock) return null;
  const rows = unlockRequirements(state, supplier.id);
  const ready = canUnlock(state, supplier.id).ok;
  const fee = supplier.unlock.fee;
  return (
    <Group
      icon={ready ? 'unlock' : 'lock'}
      color={ready ? 'money' : 'system'}
      title="Noch kein Geschäft"
      note={`${supplier.contactName} macht erst Geschäfte mit dir, wenn alles erfüllt ist. Dann meldet er sich per Handy.`}
    >
      <List>
        {rows.map((r) => (
          <ListItem key={r.label}>
            <ItemContent
              icon={r.done ? 'checkCircle' : 'lock'}
              color={r.done ? 'money' : 'system'}
              title={r.done ? 'Erfüllt' : 'Fehlt noch'}
              meta={r.label}
            >
              {!r.done && r.progress > 0 && <ProgressBar value={r.progress} label={r.label} />}
            </ItemContent>
          </ListItem>
        ))}
      </List>
      <div class="sup-actions">
        {supplier.unlock.requires.berth && !hasBerth(state) && (
          <Button icon="ship" onClick={() => ui.openPanel('logistics.port', {})}>
            Zum Hafen
          </Button>
        )}
        <Button
          variant="primary"
          icon="unlock"
          disabled={!ready || state.wallet.dirty < fee}
          onClick={() => dispatch({ type: 'suppliers.unlock', payload: { supplierId: supplier.id } })}
        >
          {fee > 0 ? `Einsteigen (${formatEuro(fee)})` : 'Geschäfte machen'}
        </Button>
      </div>
    </Group>
  );
}

/** Was einzeln bzw. gesammelt passiert, in einem Satz. */
const MODE_NOTE: Record<OrderMode, string> = {
  single: 'Jedes Paket kommt für sich. Erwischt der Zoll eins, ist nur das weg.',
  group: 'Alles in einer Fuhre, billiger. Fliegt sie auf, ist alles auf einmal weg.',
};

/**
 * Bestellung in Arbeit, nur in der Oberfläche (bis bestellt wird): Bestellart, Auswahl der Sammelbestellung und das
 * gewählte Lager. Liegt in der App, damit die Fußzeile mit „Bestellen“ dieselbe Auswahl sieht.
 */
interface OrderDraft {
  supplierId: string;
  mode: OrderMode;
  cart: Record<string, number>;
  target: string;
}

type UpdateDraft = (patch: Partial<OrderDraft>) => void;

function emptyDraft(supplierId: string): OrderDraft {
  return { supplierId, mode: 'single', cart: {}, target: '' };
}

/** Wohin geliefert wird und ob überhaupt bestellt werden kann (Lager, Liegeplatz, Schulden). */
function orderTarget(state: GameState, supplier: Supplier, target: string) {
  const warehouses = getWarehouses(state, activeCity(state));
  const toPort = supplier.kind === 'port';
  // Ohne Lager in der Stadt geht keine Lieferung (Auftrag 43, M8: sonst erst ein Banner nach dem Tippen).
  const noWarehouse = warehouses.length === 0;
  const picked = warehouses.some((w) => w.id === target) ? target : undefined;
  // Schiffsware: Ohne Wahl zeigt die Auswahl (und bestellt) das Lager, in das die Abholung ohnehin fährt.
  const warehouseId = toPort && warehouses.length > 1 ? (picked ?? defaultPickupWarehouse(state)) : picked;
  const canOrder = !isBlocked(state, supplier.id) && !noWarehouse && !(toPort && !hasBerth(state));
  return { warehouses, toPort, noWarehouse, warehouseId, canOrder };
}

/** Die gewählten Pakete der Sammelbestellung (nur, was der Lieferant dir gerade anbietet). */
function draftLines(state: GameState, supplier: Supplier, draft: OrderDraft): OrderLine[] {
  const offered = new Set(availablePackages(state, supplier.id).map((p) => p.id));
  return supplier.packages
    .filter((p) => (draft.cart[p.id] ?? 0) > 0 && offered.has(p.id))
    .map((p) => ({ packageId: p.id, count: draft.cart[p.id] }));
}

/** Sammelbestellung abschicken; danach ist die Auswahl leer, sonst sagt ein Hinweis, was fehlt. */
function useGroupOrder(supplier: Supplier, draft: OrderDraft, update: UpdateDraft) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  return (onCredit: boolean) => {
    const { warehouseId } = orderTarget(state, supplier, draft.target);
    const r = dispatch({
      type: 'suppliers.orderBatch',
      payload: {
        supplierId: supplier.id,
        lines: draftLines(state, supplier, draft),
        mode: 'group',
        ...(onCredit ? { onCredit: true } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
    });
    if (r.ok) update({ cart: {} });
    else ui.toast(r.reason, 'warn');
  };
}

/** Fußzeile der Sammelbestellung: Pakete, Preis und „Bestellen“, immer sichtbar, solange etwas gewählt ist. */
function GroupOrderBar(props: { supplier: Supplier; draft: OrderDraft; update: UpdateDraft }) {
  const { state } = useGame();
  const { supplier, draft } = props;
  const quote = orderQuote(state, supplier.id, draftLines(state, supplier, draft), 'group');
  const send = useGroupOrder(supplier, draft, props.update);
  const { canOrder } = orderTarget(state, supplier, draft.target);
  return (
    <div class="sup-bar">
      <span class="sup-bar__sum">
        <strong>{quote.packages === 1 ? '1 Paket' : `${quote.packages} Pakete`}</strong>
        {quote.discount > 0 && <span class="sup-bar__discount">{formatPercent(quote.discount)} Rabatt</span>}
      </span>
      <Button
        variant="primary"
        icon="package"
        disabled={!canOrder || state.wallet.dirty < quote.price}
        onClick={() => send(false)}
      >
        Bestellen {formatEuro(quote.price)}
      </Button>
    </div>
  );
}

/**
 * Angebot nach Warenart (Blüten, Hasch, Edibles, Öl, Vapes) mit der Wahl der Bestellart: einzeln kauft jedes Paket
 * sofort als eigene Lieferung, gesammelt kommen die gewählten Pakete in einer Lieferung (Rabatt, aber alles auf einmal
 * in Gefahr). Bestellt wird die Sammelbestellung über die Fußzeile (GroupOrderBar) oder auf Kredit hier unten.
 */
function Offer(props: { supplier: Supplier; draft: OrderDraft; update: UpdateDraft }) {
  const { state, dispatch } = useGame();
  const { supplier, draft, update } = props;
  const { warehouseId, canOrder } = orderTarget(state, supplier, draft.target);
  const offered = new Set(availablePackages(state, supplier.id).map((p) => p.id));
  const limit = creditLimit(state, supplier.id);
  const credit = availableCredit(state, supplier.id);
  const lines = draftLines(state, supplier, draft);
  const quote = orderQuote(state, supplier.id, lines, 'group');
  const single = orderQuote(state, supplier.id, lines, 'single');
  const room = GROUP_ORDER.maxPackages - quote.packages;
  const sendGroup = useGroupOrder(supplier, draft, update);
  const categories = PRODUCT_CATEGORIES.map((c) => ({
    ...c,
    packages: supplier.packages.filter((p) => getProduct(p.productId)?.category === c.id),
  })).filter((c) => c.packages.length > 0);

  const buy = (packageId: string, onCredit: boolean) =>
    dispatch({
      type: 'suppliers.order',
      payload: {
        supplierId: supplier.id,
        packageId,
        ...(onCredit ? { onCredit: true } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
    });

  const aside = (p: SupplierPackage) => {
    if (!offered.has(p.id)) return <span class="ui-hint">ab Vertrauen {p.minTrust}</span>;
    const price = packagePrice(state, supplier.id, p.id);
    if (draft.mode === 'group') {
      if (p.container) return <span class="ui-hint">nur einzeln</span>;
      const count = draft.cart[p.id] ?? 0;
      return (
        <Stepper
          value={count}
          min={0}
          max={count + room}
          label={`Anzahl ${p.label}`}
          format={(n) => `${n}×`}
          disabled={!canOrder}
          onChange={(n) => update({ cart: { ...draft.cart, [p.id]: n } })}
        />
      );
    }
    return (
      <div class="sup-buy">
        <Button small disabled={!canOrder || state.wallet.dirty < price} onClick={() => buy(p.id, false)}>
          Kaufen
        </Button>
        {limit > 0 && (
          <Button small variant="subtle" disabled={!canOrder || credit < price} onClick={() => buy(p.id, true)}>
            Kredit
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Auftrag 46c: Anker der Tour (Stufe 9 erklärt Einzeln oder Sammelbestellung). */}
      <div class="sup-mode" data-tour="suppliers.orderMode">
        <SegmentedControl
          wide
          aria-label="Bestellart"
          value={draft.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: 'single', label: 'Einzeln' },
            { value: 'group', label: 'Sammelbestellung' },
          ]}
        />
        <p class="ui-hint">{MODE_NOTE[draft.mode]}</p>
      </div>
      {/* Auftrag 46c: Anker der Tour (Stufe 5 zeigt das Angebot). */}
      <div class="sup-offer" data-tour="suppliers.offer">
        {categories.map((c) => (
          <Group key={c.id} title={c.name} icon={c.icon} color="goods">
            <List>
              {c.packages.map((p) => {
                const price = packagePrice(state, supplier.id, p.id);
                return (
                  <ListItem key={p.id} aside={aside(p)}>
                    <div class={offered.has(p.id) ? 'sup-pkg' : 'sup-pkg is-locked'}>
                      <strong>{p.label}</strong>
                      <span class="sup-pkg__price">
                        {price < p.price && <s>{formatEuro(p.price)}</s>} {formatEuro(price)}
                      </span>
                      <PackageChips
                        supplierId={supplier.id}
                        packageId={p.id}
                        productId={p.productId}
                        {...(p.container ? { container: p.container } : {})}
                      />
                    </div>
                  </ListItem>
                );
              })}
            </List>
          </Group>
        ))}
      </div>
      {draft.mode === 'group' && (
        <Group
          class="sup-cart"
          title="Sammelbestellung"
          icon="package"
          color="money"
          count={quote.packages}
          value={quote.packages > 0 ? formatEuro(quote.price) : undefined}
          note={
            quote.packages === 0
              ? `Wähl mit + die Pakete aus, ab zwei gibt es Rabatt (höchstens ${GROUP_ORDER.maxPackages}).`
              : undefined
          }
        >
          {quote.packages > 0 && (
            <>
              <Chips
                items={lines.map((l) => ({
                  label: `${l.count}× ${supplier.packages.find((p) => p.id === l.packageId)?.label ?? l.packageId}`,
                  icon: 'package',
                  color: 'goods' as const,
                }))}
              />
              <KeyValue
                label="Rabatt"
                value={
                  quote.discount > 0
                    ? `${formatPercent(quote.discount)}, ${formatEuro(quote.listPrice - quote.price)} gespart`
                    : 'ab zwei Paketen'
                }
              />
              <KeyValue
                label="Beschlagnahme"
                value={`${formatPercent(quote.seize)} für alles`}
                tone={quote.packages > 1 ? 'warn' : undefined}
              />
              <KeyValue
                label="Einzeln"
                value={`${formatEuro(single.price)}, ${formatPercent(single.seize)} je Paket`}
              />
              <div class="sup-actions">
                <Button variant="subtle" onClick={() => update({ cart: {} })}>
                  Leeren
                </Button>
                {limit > 0 && (
                  <Button variant="subtle" disabled={!canOrder || credit < quote.price} onClick={() => sendGroup(true)}>
                    Auf Kredit
                  </Button>
                )}
              </div>
            </>
          )}
        </Group>
      )}
    </>
  );
}

function SupplierDetail(props: { supplierId: string; draft: OrderDraft; update: UpdateDraft }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  // So, wie der Lieferant in der aktiven Stadt auftritt (Lieferzeit, Sortiment; Hein in Hamburg am Kai).
  const cityId = activeCity(state);
  const base = getSupplier(state, props.supplierId);
  const supplier = base ? supplierIn(base, cityId) : undefined;
  if (!supplier || !base) return null;
  if (!deliversTo(base, cityId)) {
    return (
      <div class="sup-app">
        <p class="ui-hint">{supplierDescription(supplier, activeCity(state))}</p>
        <Hint icon="pin">{`${supplier.contactName} liefert nicht nach ${cityName(cityId)}.`}</Hint>
      </div>
    );
  }
  if (!isUnlocked(state, supplier.id)) {
    return (
      <div class="sup-app">
        <p class="ui-hint">{supplierDescription(supplier, activeCity(state))}</p>
        <KeyValue label="Art" value={KIND_NAME[supplier.kind]} />
        <KeyValue label="Preis" value={`${formatPercent(supplier.priceLevel)} vom Straßenpreis`} />
        <KeyValue label="Qualität" value={qualityTier(supplier.quality).name} />
        <KeyValue label="Sortiment" value={assortment(supplier).map(productName).join(', ')} />
        <LockedSupplier supplierId={supplier.id} />
      </div>
    );
  }
  const { warehouses, toPort, noWarehouse, warehouseId } = orderTarget(state, supplier, props.draft.target);
  const rel = getRelation(state, supplier.id);
  const limit = creditLimit(state, supplier.id);
  const credit = availableCredit(state, supplier.id);
  const blocked = isBlocked(state, supplier.id);
  const discount = supplierDiscount(state, supplier.id);
  const shipments = shipmentsInTransit(state, activeCity(state)).filter((s) => s.supplierId === supplier.id);
  return (
    <div class="sup-app">
      <p class="ui-hint">{supplierDescription(supplier, activeCity(state))}</p>
      <KeyValue label="Art" value={KIND_NAME[supplier.kind]} />
      <KeyValue label="Preis" value={`${formatPercent(supplier.priceLevel)} vom Straßenpreis`} />
      <KeyValue label="Qualität" value={qualityTier(supplier.quality).name} />
      <KeyValue label="Zuverlässigkeit" value={formatPercent(supplier.reliability)} />
      {/* Risiko pro Lieferung mit dem Vertrauen von jetzt, Zoll an der Grenze extra genannt (Auftrag 43, L6). */}
      <KeyValue
        label="Beschlagnahme"
        value={`${formatPercent(seizeChance(supplier, rel.trust))} je Lieferung${supplier.customs ? `, davon Zoll ${formatPercent(supplier.customs)}` : ''}`}
      />
      <KeyValue label="Lieferzeit" value={clock.formatDuration(supplier.deliveryTime)} />
      <KeyValue label="Sortiment" value={assortment(supplier).map(productName).join(', ')} />

      <h4 class="sup-app__section">Beziehung: {trustLabel(rel.trust)}</h4>
      <ProgressBar value={rel.trust / 100} label="Vertrauen" />
      <Disclosure
        label={relationFactor(activeCity(state)) > 1 ? 'Kölscher Klüngel' : 'Kühl und korrekt'}
        icon="handshake"
      >
        {relationFactor(activeCity(state)) > 1
          ? `In ${cityName(activeCity(state))} kennt man sich: Vertrauen wächst hier anderthalbmal so schnell.`
          : `In ${cityName(activeCity(state))} gibt es nichts geschenkt: Vertrauen wächst hier langsamer.`}
      </Disclosure>
      <KeyValue label="Rabatt" value={formatPercent(discount)} />
      <KeyValue label="Kredit" value={limit > 0 ? `${formatEuro(credit)} von ${formatEuro(limit)}` : 'noch keiner'} />
      {rel.debt > 0 && (
        <div class={blocked ? 'sup-debtbox is-overdue' : 'sup-debtbox'}>
          <span>
            Schulden {formatEuro(rel.debt)}
            {rel.dueAt !== null && `, fällig ${clock.formatLong(rel.dueAt)}`}
            {blocked && '. Liefert nicht mehr, bis du zahlst.'}
          </span>
          <div class="sup-buy">
            {state.wallet.dirty < rel.debt && state.wallet.dirty >= 1 && (
              // Reicht das Geld nicht für alles, hilft eine Teilzahlung (die Hälfte der Schuld oder, was da ist).
              <Button
                small
                disabled={state.wallet.dirty < 1}
                onClick={() =>
                  dispatch({
                    type: 'suppliers.repay',
                    payload: {
                      supplierId: supplier.id,
                      amount: Math.min(Math.ceil(rel.debt / 2), Math.floor(state.wallet.dirty)),
                    },
                  })
                }
              >
                Teilzahlung {formatEuro(Math.min(Math.ceil(rel.debt / 2), Math.floor(state.wallet.dirty)))}
              </Button>
            )}
            <Button
              small
              variant="primary"
              disabled={state.wallet.dirty < rel.debt}
              onClick={() => dispatch({ type: 'suppliers.repay', payload: { supplierId: supplier.id } })}
            >
              Zahlen
            </Button>
          </div>
        </div>
      )}

      <h4 class="sup-app__section">Angebot</h4>
      {noWarehouse && (
        <Hint icon="warehouse">{`In ${cityName(cityId)} hast du noch kein Lager. Ohne Lager kann nichts geliefert werden.`}</Hint>
      )}
      {noWarehouse && (
        <Button icon="warehouse" onClick={() => ui.openPhone('goods.app')}>
          Lager kaufen
        </Button>
      )}
      {toPort && (
        <Hint icon="ship">
          {hasBerth(state)
            ? `Die Ware kommt an deinen Liegeplatz im ${portName(cityId)}. Abholen muss jemand am Kai, im Hafen (oder die Rechte Hand mit einem Fahrer).`
            : `Ohne Liegeplatz im ${portName(cityId)} kann kein Schiff für dich anlegen.`}
        </Hint>
      )}
      {toPort && (
        <Button icon="ship" onClick={() => ui.openPanel('logistics.port', {})}>
          Zum Hafen
        </Button>
      )}
      {warehouses.length > 1 && (
        <Select
          label={toPort ? 'Abholen nach' : 'Liefern an'}
          wide
          value={warehouseId ?? warehouses[0].id}
          options={warehouses.map((w) => ({
            value: w.id,
            label: `${toPort ? 'abholen nach' : 'liefern an'} ${w.name}`,
          }))}
          onChange={(target) => props.update({ target })}
        />
      )}
      <Offer supplier={supplier} draft={props.draft} update={props.update} />

      {shipments.length > 0 && (
        <>
          <h4 class="sup-app__section">Unterwegs</h4>
          {shipments.map((s) => (
            <ShipmentRow key={s.id} state={state} shipment={s} />
          ))}
        </>
      )}
    </div>
  );
}

/** Eigene Kopfleiste (chrome: 'none'): Liste mit "Lieferanten", Detail mit dem Ansprechpartner und Zurück. */
/**
 * Welcher Lieferant offen ist, steht in ui.phone.params.supplierId (wie bei den Nachrichten). So öffnen
 * Empfehlungen und Hinweise einen Lieferanten direkt: ui.openPhone('suppliers.app', { supplierId: 'berlin' }).
 */
function SuppliersApp() {
  const { state } = useGame();
  const ui = useUi();
  const supplierId =
    ui.state.phone.app === APP_ID ? (ui.state.phone.params?.supplierId as string | undefined) : undefined;
  const supplier = supplierId ? getSupplier(state, supplierId) : undefined;
  // Bestellung in Arbeit gilt nur für den offenen Lieferanten (ein anderer fängt leer an).
  const [saved, setDraft] = useState<OrderDraft | null>(null);
  const draft = supplier && saved?.supplierId === supplier.id ? saved : emptyDraft(supplier?.id ?? '');
  const update: UpdateDraft = (patch) => setDraft({ ...draft, ...patch });
  // Nach dem Verkauf (Auftrag 43) kaufst du nicht mehr bei Lieferanten, sondern bei Produzenten im Ausland ein.
  if (isBusinessSold(state)) {
    return (
      <PhoneScreen title="Lieferanten">
        <Group
          title="Du bist jetzt selbst Lieferant"
          icon="ship"
          color="goods"
          note="Ware kaufst du ab jetzt bei Produzenten im Ausland ein, als Container in deinen Hafen. Toni, Hein, Mirko und Daan sind deine Konkurrenz."
        >
          <div class="sup-redirect">
            <Button variant="primary" icon="ship" onClick={() => ui.openPhone('trade.app', { view: 'harbor' })}>
              Zum Einkauf im Hafen
            </Button>
          </div>
        </Group>
      </PhoneScreen>
    );
  }
  if (supplier) {
    const groupPicked = draft.mode === 'group' && Object.values(draft.cart).some((n) => n > 0);
    const local = supplierIn(supplier, activeCity(state));
    return (
      <PhoneScreen
        title={`${supplier.contactName} (${supplier.name})`}
        onBack={() => ui.openPhone(APP_ID)}
        footer={groupPicked ? <GroupOrderBar supplier={local} draft={draft} update={update} /> : undefined}
      >
        <SupplierDetail key={supplier.id} supplierId={supplier.id} draft={draft} update={update} />
      </PhoneScreen>
    );
  }
  return (
    <PhoneScreen title="Lieferanten">
      <SupplierList onSelect={(id) => ui.openPhone(APP_ID, { supplierId: id })} />
    </PhoneScreen>
  );
}

registerPhoneApp({
  id: APP_ID,
  name: 'Lieferanten',
  icon: 'truck',
  order: 20,
  color: 'goods',
  chrome: 'none',
  component: SuppliersApp,
  // Nach dem Verkauf kauft man in der App Handel ein (Auftrag 43); die Seite verweist dorthin, falls sie jemand öffnet.
  // Auftrag 46b: Im Tutorial kommt die App mit ihrer Stufe.
  hiddenWhen: (state) => isBusinessSold(state) || !tutorialAllows(state, 'app.suppliers'),
  // Gesperrt wegen Schulden oder bereit zum Freischalten.
  badge: (state) =>
    getSuppliers(state, activeCity(state)).filter(
      (s) => isBlocked(state, s.id) || (!isUnlocked(state, s.id) && canUnlock(state, s.id).ok),
    ).length,
});
registerMapLayer(suppliersLayer);

onGameEvent('shipment.problem', 'suppliers.problemToast', (payload, ui, state) => {
  const name = getSupplier(state, payload.supplierId)?.name ?? 'Lieferant';
  const base = {
    delayed: `Lieferung aus ${name} verspätet sich`,
    badQuality: `Die Ware aus ${name} ist schlechter als versprochen`,
    seized: `Lieferung aus ${name} beschlagnahmt`,
  }[payload.kind];
  const text = payload.reason ? `${base}: ${payload.reason}` : `${base}.`;
  // Nur eine verlorene Lieferung ist ein Banner wert; Verspätung und Qualität stehen im Verlauf.
  ui.toast(text, 'bad', { urgent: payload.kind === 'seized' });
});
soundOnEvent('shipment.arrived', 'delivery');
onGameEvent('shipment.arrived', 'suppliers.arrivedToast', (payload, ui, state) => {
  // Schiffsware meldet die Logistik (Ware am Kai); Lieferungen in eine andere Stadt meldet ihr Statthalter.
  if (payload.atPort || (payload.cityId !== undefined && payload.cityId !== activeCity(state))) return;
  // Waren die Lager zu voll, steht im Banner, wo die Ware jetzt liegt (Auftrag 33).
  const where = payload.placedIn ? ` Lager voll, verteilt: ${payload.placedIn}.` : '';
  // Banner nur für eigene Bestellungen (Auftrag 43, K4); was deine Leute bestellt haben, steht im Verlauf.
  const what = payload.items ? 'Sammellieferung' : 'Lieferung';
  ui.toast(`${what} aus ${getSupplier(state, payload.supplierId)?.name ?? 'dem Ausland'} ist da.${where}`, 'good', {
    urgent: !payload.byStaff || payload.placedIn !== undefined,
  });
});
onGameEvent('supplier.unlocked', 'suppliers.unlockedToast', (payload, ui, state) => {
  const supplier = getSupplier(state, payload.supplierId);
  ui.toast(`${supplier?.contactName ?? 'Neuer Lieferant'} (${supplier?.name ?? ''}) liefert jetzt an dich.`, 'good');
});

// Empfehlung: Nachschub bestellen, wenn die Ware knapp wird.
registerAdvisor({
  id: 'suppliers.restock',
  advise: (state) => {
    // Nach dem Verkauf rät die App Handel (trade), wo Ware fehlt.
    if (isBusinessSold(state)) return null;
    if (shipmentsInTransit(state, activeCity(state)).length > 0 || cargoAmount(state) > 0 || inTransitAmount(state) > 0)
      return null;
    // Ware der Stadt, in der du bist (Auftrag 43: in Hamburg zählte das Kölner Lager mit, der Rat kam nie); ohne Lager
    // dort rät erst goods zum Lagerkauf.
    const city = activeCity(state);
    if (getWarehouses(state, city).length === 0) return null;
    const stock = getStock(state, { cityId: city });
    if (stock >= 20) return null;
    return {
      id: 'suppliers.restock',
      priority: stock <= 0 ? 88 : 80,
      icon: 'truck',
      title: stock <= 0 ? 'Ware ist alle' : 'Ware wird knapp',
      text: 'Bestell Nachschub über die Lieferanten-App im Handy.',
      actionLabel: 'Bestellen',
      action: (ui) => ui.openPhone('suppliers.app'),
    };
  },
});

// Nur im Dev-Build (Auftrag 23): Lieferung bei Toni mit Verspätung und Rückfrage, z.B. window.koeln.dev.lieferProblem().
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const dev = {
    lieferProblem: () => {
      const s = window.koeln?.session.sim;
      if (!s) return;
      s.state.wallet.dirty = Math.max(s.state.wallet.dirty, 2000);
      const r = s.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } });
      if (r.ok) forceShipmentProblem(s.ctx('suppliers'), (r.data as { shipmentId: number }).shipmentId, 'delayed');
      s.step();
    },
  };
  const holder = window as unknown as { koeln?: { dev?: Record<string, () => void> } };
  holder.koeln = { ...holder.koeln, dev: { ...holder.koeln?.dev, ...dev } };
}
