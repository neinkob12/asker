// Versorgung planen (Auftrag 43): Was Fenna übernimmt (für alle und pro Kunde), die Übersicht „Diese Woche“ (Bedarf,
// Bestand, auf See, fehlt pro Ware), Nachkauf-Regeln im Hafen und die Seite eines Kunden (Bedarf, Anteil, Vertrauen,
// Konkurrenz, Pünktlichkeit, Lieferplan, letzte Bestellungen).

import { useState } from 'preact/hooks';
import { clock, contactLook, formatEuro, formatNumber, type GameState } from '../../../core';
import {
  Avatar,
  Button,
  type CategoryColor,
  Chip,
  Chips,
  Group,
  Hint,
  Icon,
  ItemContent,
  List,
  ListItem,
  registerPanel,
  SegmentedControl,
  Select,
  Sheet,
  Stepper,
  useGame,
  useUi,
} from '../../../ui';
import { HARBOR_CITY } from '../../city';
import { getVehicles, isShip } from '../../fleet';
import { productName } from '../../goods';
import {
  ACCEPT_LABELS,
  CONTAINER_SIZES,
  type ContainerSize,
  CUSTOMER_KINDS,
  type CustomerPlan,
  containerCost,
  contractEndsAt,
  customerBlocked,
  customerContact,
  DELIVER_LABELS,
  europeCityOf,
  getCustomer,
  getOrders,
  getShipments,
  hasOwnPlan,
  OWN_ORIGINS,
  openItems,
  originStock,
  ownedPorts,
  PRODUCERS,
  planFor,
  portStock,
  restockRules,
  shippingMinutes,
  type TradeOrder,
} from '../index';

declare module '../../../ui' {
  interface PanelRegistry {
    /** Seite eines Kunden der Hafen-Phase (Auftrag 43). */
    'trade.customer': { customerId: string };
  }
}

const kg = (grams: number) => `${formatNumber(Math.round(grams / 100) / 10, 1)} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Kurze Namen für die Knöpfe (die langen stehen in ACCEPT_LABELS bzw. DELIVER_LABELS). */
const DELIVER_SHORT: Record<CustomerPlan['deliver'], string> = { off: 'Selbst', truck: 'Lkw', freight: 'Spedition' };

/** Die zwei Schalter eines Plans: annehmen und ausliefern. */
function PlanControls(props: { plan: CustomerPlan; onChange: (patch: Partial<CustomerPlan>) => void }) {
  const { state } = useGame();
  const hasTruck = getVehicles(state, HARBOR_CITY).some((v) => !isShip(v));
  return (
    <List>
      <ListItem>
        <ItemContent
          icon="inbox"
          color="warn"
          title="Annehmen"
          meta={
            props.plan.accept === 'covered'
              ? 'Nur, wenn die Ware da oder unterwegs ist.'
              : props.plan.accept === 'all'
                ? 'Alles, auch ohne Ware. Kommt sie nicht rechtzeitig, platzt die Bestellung: weniger Vertrauen, schlechterer Ruf.'
                : 'Das machst du.'
          }
        />
      </ListItem>
      <ListItem>
        <SegmentedControl
          wide
          aria-label="Annehmen"
          value={props.plan.accept}
          options={(Object.keys(ACCEPT_LABELS) as CustomerPlan['accept'][]).map((v) => ({
            value: v,
            label: ACCEPT_LABELS[v],
          }))}
          onChange={(accept) => props.onChange({ accept })}
        />
      </ListItem>
      <ListItem>
        <ItemContent
          icon="truck"
          color="place"
          title="Ausliefern"
          meta={
            props.plan.deliver === 'off'
              ? 'Das machst du.'
              : `${DELIVER_LABELS[props.plan.deliver]}, sobald die Ware im Hafen liegt.`
          }
        />
      </ListItem>
      <ListItem>
        <SegmentedControl
          wide
          aria-label="Ausliefern"
          value={props.plan.deliver}
          // „Lkw“ erst mit eigenem Lkw (Auftrag 43: sonst fuhr still die Spedition).
          options={(Object.keys(DELIVER_SHORT) as CustomerPlan['deliver'][])
            .filter((v) => v !== 'truck' || hasTruck || props.plan.deliver === 'truck')
            .map((v) => ({
              value: v,
              label: DELIVER_SHORT[v],
            }))}
          onChange={(deliver) => props.onChange({ deliver })}
        />
      </ListItem>
    </List>
  );
}

/** „Fenna übernimmt“: der Plan für alle Kunden (in den Bestellungen). */
export function DispatcherGroup() {
  const { state, dispatch } = useGame();
  const plan = state.modules.trade.defaultPlan;
  const own = Object.keys(state.modules.trade.plans ?? {}).length;
  // Nur beim Öffnen der Seite (Auftrag 43, H5): sonst klappte die Gruppe beim ersten Tipp zu, mitten in der Wahl.
  const [startOpen] = useState(plan.accept === 'off' && plan.deliver === 'off');
  return (
    <Group
      title="Fenna übernimmt"
      icon="users"
      color="people"
      collapsible
      open={startOpen}
      note={
        own > 0
          ? `Für alle Kunden, ${own} mit eigenem Plan (auf ihrer Seite).`
          : 'Für alle Kunden; einzelne stellst du auf ihrer Seite um.'
      }
      more="Fenna de Wit macht Jansens Disposition. Sie schaut jede Stunde nach: Bestellungen annehmen, Ware ausliefern, sobald sie im Hafen liegt, und nach deinen Regeln Container nachkaufen (Hafen › Nachkauf). Sie zahlt dieselbe Fracht wie du."
    >
      <PlanControls plan={plan} onChange={(patch) => dispatch({ type: 'trade.setPlan', payload: { plan: patch } })} />
    </Group>
  );
}

/** Was diese Woche gebraucht wird, pro Ware: Bedarf (offen und angenommen), im Hafen, auf See, fehlt. */
function weekRows(state: GameState) {
  const need = new Map<string, number>();
  // Früheste und späteste Frist pro Ware (Auftrag 43, H4): Container, die erst danach ankommen, helfen nicht.
  const firstDue = new Map<string, number>();
  const lastDue = new Map<string, number>();
  for (const o of getOrders(state)) {
    if (o.status !== 'open' && o.status !== 'accepted') continue;
    for (const item of openItems(o)) {
      need.set(item.productId, (need.get(item.productId) ?? 0) + item.amount);
      firstDue.set(item.productId, Math.min(firstDue.get(item.productId) ?? Infinity, o.dueAt));
      lastDue.set(item.productId, Math.max(lastDue.get(item.productId) ?? 0, o.dueAt));
    }
  }
  const stock = new Map<string, number>();
  for (const id of ownedPorts(state)) {
    for (const [productId, lot] of Object.entries(portStock(state, id))) {
      stock.set(productId, (stock.get(productId) ?? 0) + lot.amount);
    }
  }
  const sea = new Map<string, number>();
  const late = new Map<string, number>();
  for (const x of getShipments(state)) {
    const due = lastDue.get(x.productId);
    const target = due !== undefined && x.arrivesAt > due ? late : sea;
    target.set(x.productId, (target.get(x.productId) ?? 0) + x.amount);
  }
  const ids = [...new Set([...need.keys(), ...stock.keys(), ...sea.keys(), ...late.keys()])];
  return ids
    .map((productId) => {
      const n = need.get(productId) ?? 0;
      const s = stock.get(productId) ?? 0;
      const w = sea.get(productId) ?? 0;
      return {
        productId,
        need: n,
        stock: s,
        sea: w,
        late: late.get(productId) ?? 0,
        due: firstDue.get(productId) ?? null,
        missing: Math.max(0, n - s - w),
      };
    })
    .sort((a, b) => b.missing - a.missing || b.need - a.need);
}

/** Preis pro Kilo einer Ware bei einem Produzenten (halber Container, mit Fracht). */
export function pricePerKg(producerId: string, productId: string): number {
  const size = CONTAINER_SIZES.find((c) => c.id === 'medium') ?? CONTAINER_SIZES[0];
  const cost = containerCost(producerId, productId, size.id);
  return ((cost.goods + cost.freight) / size.grams) * 1000;
}

/** „1 Tag“, „5 Tage“ für eine Fahrzeit in Minuten. */
export function tripDays(minutes: number): string {
  const days = Math.max(1, Math.round(minutes / 1440));
  return days === 1 ? '1 Tag' : `${days} Tage`;
}

/**
 * Woher eine Ware am besten kommt (Auftrag 43, H5): die eigene Ernte im Ausfuhrlager, sonst der günstigste Produzent, der
 * bis `by` ankommt. Ohne Frist der günstigste, schafft es keiner rechtzeitig, der schnellste. Vorher war es immer der
 * schnellste, also Jansens Netz zum doppelten Preis.
 */
export function bestProducer(state: GameState, productId: string, portId: string, by: number | null = null) {
  const own = OWN_ORIGINS.find((o) => (originStock(state, o.id)[productId]?.amount ?? 0) > 0);
  if (own) return own;
  const list = PRODUCERS.filter((p) => p.products[productId] !== undefined);
  const inTime = by === null ? list : list.filter((p) => state.time + shippingMinutes(p.id, portId) <= by);
  if (inTime.length > 0)
    return [...inTime].sort((a, b) => pricePerKg(a.id, productId) - pricePerKg(b.id, productId))[0];
  return [...list].sort((a, b) => shippingMinutes(a.id, portId) - shippingMinutes(b.id, portId))[0];
}

/** „Diese Woche“ (in den Bestellungen): Reicht die Ware für alles, was bestellt ist? */
export function WeekGroup() {
  const { state } = useGame();
  const ui = useUi();
  const rows = weekRows(state);
  if (rows.length === 0) return null;
  const port = ownedPorts(state)[0] ?? HARBOR_CITY;
  const short = rows.filter((r) => r.missing > 0).length;
  return (
    <Group
      title="Diese Woche"
      icon="boxes"
      color="goods"
      value={short > 0 ? `${short} fehlen` : 'reicht'}
      note="Bestellt (offen und angenommen) gegen Hafen und Container, die vor der Frist ankommen."
    >
      <List>
        {rows.map((r) => {
          const producer = r.missing > 0 ? bestProducer(state, r.productId, port, r.due) : undefined;
          return (
            <ListItem
              key={r.productId}
              value={r.missing > 0 ? `fehlt ${kg(r.missing)}` : undefined}
              onClick={
                producer
                  ? () => ui.openPanel('trade.order', { producerId: producer.id, productId: r.productId })
                  : undefined
              }
            >
              <ItemContent
                icon="package"
                color={r.missing > 0 ? 'danger' : 'goods'}
                title={productName(r.productId)}
                tags={[
                  { label: `bestellt ${kg(r.need)}`, color: 'warn', icon: 'inbox' },
                  { label: `im Hafen ${kg(r.stock)}`, color: 'goods', icon: 'warehouse' },
                  r.sea > 0 && { label: `auf See ${kg(r.sea)}`, color: 'place', icon: 'ship' },
                  r.late > 0 && { label: `nach der Frist ${kg(r.late)}`, color: 'danger', icon: 'clock' },
                ]}
              />
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}

const DEFAULT_RULE = { productId: 'weed', minKg: 60, size: 'medium' as ContainerSize['id'] };

/** Nachkauf-Regeln (im Hafen): unter einer Menge bestellt Fenna einen Container. */
export function RestockGroup() {
  const { state, dispatch } = useGame();
  const [open, setOpen] = useState(false);
  const rules = restockRules(state);
  const port = ownedPorts(state)[0] ?? HARBOR_CITY;
  const cheapest = (productId: string) =>
    PRODUCERS.filter((p) => p.products[productId] !== undefined).sort(
      (a, b) => pricePerKg(a.id, productId) - pricePerKg(b.id, productId),
    )[0]?.id ?? '';
  const [draft, setDraft] = useState({ ...DEFAULT_RULE, producerId: cheapest(DEFAULT_RULE.productId) });
  const products = [...new Set(PRODUCERS.flatMap((p) => Object.keys(p.products)))];
  const producers = PRODUCERS.filter((p) => p.products[draft.productId] !== undefined);
  const producerId = producers.some((p) => p.id === draft.producerId) ? draft.producerId : cheapest(draft.productId);
  const save = () => {
    const done = dispatch({
      type: 'trade.addRestock',
      payload: { productId: draft.productId, minGrams: draft.minKg * 1000, producerId, size: draft.size, portId: port },
    });
    if (done.ok) setOpen(false);
  };
  return (
    <Group
      title="Nachkauf"
      icon="refresh"
      color="goods"
      count={rules.length}
      note={
        rules.length === 0
          ? 'Fenna bestellt einen Container, sobald von einer Ware zu wenig da ist.'
          : 'Liegt weniger da (Hafen und unterwegs), bestellt Fenna einen Container.'
      }
    >
      <List>
        {rules.map((r) => {
          const producer = PRODUCERS.find((p) => p.id === r.producerId);
          const size = CONTAINER_SIZES.find((c) => c.id === r.size);
          return (
            <ListItem
              key={r.id}
              aside={
                <Button
                  small
                  variant="subtle"
                  icon="trash"
                  aria-label="Regel löschen"
                  onClick={() => dispatch({ type: 'trade.removeRestock', payload: { ruleId: r.id } })}
                />
              }
            >
              <ItemContent
                icon="refresh"
                color="goods"
                title={`${productName(r.productId)} unter ${kg(r.minGrams)}`}
                tags={[
                  { label: producer?.name ?? r.producerId, color: 'place', icon: 'ship' },
                  { label: size?.label ?? r.size, color: 'goods', icon: 'boxes' },
                ]}
              />
            </ListItem>
          );
        })}
        <ListItem action icon="plusCircle" onClick={() => setOpen(true)}>
          Regel anlegen
        </ListItem>
      </List>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nachkauf-Regel"
        detents={['large']}
        action={
          <Button small variant="primary" onClick={save} disabled={!producerId}>
            Sichern
          </Button>
        }
      >
        <Group title="Was und woher" icon="package" color="goods">
          <List>
            <ListItem>
              <ItemContent icon="leaf" color="goods" title="Ware">
                <Select
                  wide
                  label="Ware"
                  value={draft.productId}
                  options={products.map((id) => ({ value: id, label: productName(id) }))}
                  onChange={(productId) => setDraft({ ...draft, productId, producerId: cheapest(productId) })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent icon="ship" color="place" title="Produzent">
                <Select
                  wide
                  label="Produzent"
                  value={producerId}
                  options={producers.map((p) => ({
                    value: p.id,
                    label: `${p.name}, ${formatEuro(pricePerKg(p.id, draft.productId))}/kg, ${tripDays(shippingMinutes(p.id, port))}`,
                  }))}
                  onChange={(id) => setDraft({ ...draft, producerId: id })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent icon="boxes" color="goods" title="Container">
                <Select
                  wide
                  label="Container"
                  value={draft.size}
                  options={CONTAINER_SIZES.map((c) => ({ value: c.id, label: c.label }))}
                  onChange={(size) => setDraft({ ...draft, size })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent
                icon="warehouse"
                color="goods"
                title="Nachkaufen unter"
                meta="Hafen und unterwegs zusammen."
              />
              <Stepper
                label="Nachkaufen unter"
                value={draft.minKg}
                min={10}
                max={1000}
                step={10}
                format={(v) => `${v} kg`}
                onChange={(minKg) => setDraft({ ...draft, minKg })}
              />
            </ListItem>
          </List>
        </Group>
      </Sheet>
    </Group>
  );
}

const STATUS_TEXT: Record<TradeOrder['status'], { label: string; color: CategoryColor }> = {
  open: { label: 'offen', color: 'warn' },
  accepted: { label: 'zu liefern', color: 'goods' },
  delivering: { label: 'unterwegs', color: 'place' },
  delivered: { label: 'geliefert', color: 'money' },
  declined: { label: 'abgelehnt', color: 'system' },
  lost: { label: 'an die Konkurrenz', color: 'danger' },
  expired: { label: 'verfallen', color: 'system' },
  failed: { label: 'geplatzt', color: 'danger' },
};

/** Ende des Abnahmevertrags, z.B. „Mo, Tag 31“. */
export function contractText(at: number): string {
  return `${clock.weekdayName(at, true)}, Tag ${clock.day(at)}`;
}

/** Seite eines Kunden (Auftrag 43). */
function CustomerPanel(props: { customerId: string }) {
  const { state, dispatch } = useGame();
  const c = getCustomer(state, props.customerId);
  if (!c) return null;
  const contact = customerContact(state, c);
  const kind = CUSTOMER_KINDS[c.kind];
  const weekly = Object.entries(c.weekly);
  const europe = europeCityOf(c);
  const own = hasOwnPlan(state, c.id);
  const orders = getOrders(state)
    .filter((o) => o.customerId === c.id)
    .slice(-6)
    .reverse();
  const total = c.delivered + c.late + c.failed;
  const contractEnd = contractEndsAt(state);
  return (
    <div class="trade-app">
      <div class="trade-customer__head">
        <Avatar name={contact.name} look={contactLook(contact)} size="lg" />
        <div>
          <strong>{c.name}</strong>
          <span class="ui-hint">{contact.name !== c.name ? `${contact.name}, ${kind.label}` : kind.label}</span>
        </div>
      </div>
      <Chips>
        <Chip color={c.share >= 0.4 ? 'money' : 'warn'} icon="chart">
          Anteil {pct(c.share)}
        </Chip>
        <Chip color={c.trust >= 50 ? 'people' : 'danger'} icon="handshake">
          Vertrauen {c.trust}
        </Chip>
        {c.kind === 'org' && contractEnd !== null && (
          <Chip color="brand" icon="handshake">
            Vertrag bis {contractText(contractEnd)}
          </Chip>
        )}
        {c.topRival !== null && (
          <Chip color="danger" icon="trendDown">
            stärkste Konkurrenz: {c.topRival}
          </Chip>
        )}
        {europe && (
          <Chip color="law" icon="shield">
            Zoll {europe.border.name}
          </Chip>
        )}
      </Chips>
      {customerBlocked(state, c) && (
        <Hint icon="fist">
          Die Gang hat aus der Zeit in der Stadt noch eine Rechnung mit dir offen und kauft nicht bei dir. Das verblasst
          mit der Zeit.
        </Hint>
      )}
      <Group title="Bedarf pro Woche" icon="package" color="goods" note="Davon bestellt er deinen Anteil bei dir.">
        <List>
          {weekly.map(([productId, grams]) => (
            <ListItem key={productId} value={kg(grams)}>
              <ItemContent icon="package" color="goods" title={productName(productId)} />
            </ListItem>
          ))}
        </List>
      </Group>
      <Group
        title="Lieferplan"
        icon="users"
        color="people"
        value={own ? 'eigener' : 'wie alle'}
        note="Was Fenna für diesen Kunden übernimmt."
      >
        <PlanControls
          plan={planFor(state, c.id)}
          onChange={(patch) => dispatch({ type: 'trade.setPlan', payload: { plan: patch, customerId: c.id } })}
        />
        {own && (
          <List>
            <ListItem
              action
              icon="refresh"
              onClick={() => dispatch({ type: 'trade.setPlan', payload: { plan: {}, customerId: c.id, reset: true } })}
            >
              Wie alle Kunden
            </ListItem>
          </List>
        )}
      </Group>
      <Group
        title="Zuverlässigkeit"
        icon="clock"
        color="place"
        value={total > 0 ? `${pct(c.delivered / total)} pünktlich` : undefined}
      >
        <Chips>
          <Chip color="money" icon="checkCircle">
            {c.delivered} pünktlich
          </Chip>
          <Chip color="warn" icon="clock">
            {c.late} zu spät
          </Chip>
          <Chip color="danger" icon="xCircle">
            {c.failed} geplatzt
          </Chip>
        </Chips>
      </Group>
      {orders.length > 0 && (
        <Group title="Bestellungen" icon="inbox" color="warn" count={orders.length}>
          <List>
            {orders.map((o) => (
              <ListItem key={o.id} value={o.revenue ? formatEuro(o.revenue) : undefined}>
                <ItemContent
                  icon="package"
                  color={STATUS_TEXT[o.status].color}
                  title={`${kg(o.amount)}, ${clock.weekdayName(o.placedAt, true)} ${clock.formatTime(o.placedAt)}`}
                  tags={[{ label: STATUS_TEXT[o.status].label, color: STATUS_TEXT[o.status].color }]}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      <p class="ui-hint">
        <Icon name="info" /> Pünktlich und gute Qualität heben dein Vertrauen, dann bestellt er mehr bei dir.
      </p>
    </div>
  );
}

registerPanel({
  id: 'trade.customer',
  title: ({ customerId }, state) => getCustomer(state, customerId)?.name ?? 'Kunde',
  component: CustomerPanel,
});
