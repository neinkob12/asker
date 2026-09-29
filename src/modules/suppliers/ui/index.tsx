// Oberfläche der Lieferanten: Handy-App "Lieferanten" (freischalten, bestellen, Beziehung, Kredit), Lieferungen im
// Tab "Geschäft", Routen und Transporter auf der Karte, Hinweise bei Lieferproblemen.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Badge,
  Button,
  Card,
  Empty,
  Hint,
  Icon,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  PhoneScreen,
  ProgressBar,
  registerAdvisor,
  registerPhoneApp,
  registerSlot,
  Select,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { getStock, getWarehouse, getWarehouses, productName, qualityTier } from '../../goods';
import { cargoAmount, hasBerth } from '../../logistics';
import {
  assortment,
  availableCredit,
  availablePackages,
  canUnlock,
  creditLimit,
  expectedArrival,
  getRelation,
  getSupplier,
  getSuppliers,
  isBlocked,
  isUnlocked,
  packagePrice,
  type Shipment,
  type Supplier,
  shipmentProgress,
  shipmentsInTransit,
  supplierDiscount,
  trustLabel,
  unlockRequirements,
} from '../index';
import { suppliersLayer } from './map';
import './island';
import './suppliers.css';

const KIND_NAME: Record<Supplier['kind'], string> = { port: 'Hafen', city: 'Großstadt' };

function ShipmentRow(props: { state: GameState; shipment: Shipment; showSupplier?: boolean }) {
  const { state, shipment: s } = props;
  const supplier = getSupplier(state, s.supplierId);
  const pkg = supplier?.packages.find((p) => p.id === s.packageId);
  const delayed = s.problem === 'delayed' && s.problemRevealed;
  const target = s.toPort ? 'an den Kai' : `ins ${getWarehouse(state, s.warehouseId)?.name ?? 'Lager'}`;
  return (
    <div class="shipment">
      <div class="shipment__head">
        <span>
          {pkg?.label ?? productName(s.productId)}
          {props.showSupplier && supplier ? ` aus ${supplier.name}` : ''} {target}
        </span>
        <span class={delayed ? 'shipment__eta is-late' : 'shipment__eta'}>
          {delayed ? 'verspätet, ' : ''}an {clock.formatTime(expectedArrival(s))}
        </span>
      </div>
      <ProgressBar value={shipmentProgress(state, s)} tone={delayed ? 'warn' : 'accent'} label="Lieferung" />
    </div>
  );
}

function SupplierList(props: { onSelect: (id: string) => void }) {
  const { state } = useGame();
  // Wer liefert, zuerst; gesperrte danach (grau, mit dem, was noch fehlt).
  const suppliers = [...getSuppliers(state)].sort(
    (a, b) => Number(isUnlocked(state, b.id)) - Number(isUnlocked(state, a.id)),
  );
  return (
    <div class="sup-app">
      <ul class="sup-list">
        {suppliers.map((s) => {
          const rel = getRelation(state, s.id);
          const underway = shipmentsInTransit(state).filter((x) => x.supplierId === s.id).length;
          const unlocked = isUnlocked(state, s.id);
          const ready = !unlocked && canUnlock(state, s.id).ok;
          const missing = unlockRequirements(state, s.id).find((r) => !r.done);
          return (
            <li key={s.id}>
              <button
                type="button"
                class={`sup-list__item ${unlocked ? '' : 'is-locked'} ${ready ? 'is-ready' : ''}`}
                onClick={() => props.onSelect(s.id)}
              >
                <strong>
                  {!unlocked && <Icon name={ready ? 'unlock' : 'lock'} class="sup-list__lock" />}
                  {s.contactName} · {s.name}
                  <Badge count={underway} tone="accent" />
                </strong>
                <span>
                  {KIND_NAME[s.kind]}, {clock.formatDuration(s.deliveryTime)} ·{' '}
                  {unlocked
                    ? trustLabel(rel.trust)
                    : ready
                      ? 'bereit zum Freischalten'
                      : `fehlt: ${missing?.label ?? '…'}`}
                </span>
                {rel.debt > 0 && (
                  <span class={isBlocked(state, s.id) ? 'sup-debt is-overdue' : 'sup-debt'}>
                    Schulden {formatEuro(rel.debt)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <Hint>
        Am Anfang liefert nur Toni. Mit mehr Umsatz, eigenen Veedeln und einem Liegeplatz im Hafen melden sich die
        anderen. Großstädte liefern schnell kleine Mengen, der Hafen günstig große. Vertrauen bringt Rabatt und Kredit.
      </Hint>
    </div>
  );
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
    <>
      <h4 class="sup-app__section">Noch kein Geschäft</h4>
      <p class="ui-hint">{supplier.contactName} macht erst Geschäfte mit dir, wenn das hier stimmt:</p>
      <ul class="sup-reqs">
        {rows.map((r) => (
          <li key={r.label} class={r.done ? 'is-done' : ''}>
            <Icon name={r.done ? 'checkCircle' : 'lock'} />
            <span>{r.label}</span>
            {!r.done && r.progress > 0 && <ProgressBar value={r.progress} label={r.label} />}
          </li>
        ))}
      </ul>
      {supplier.unlock.requires.berth && !hasBerth(state) && (
        <Button wide onClick={() => ui.openPhone('logistics.app')}>
          Zum Hafen (Logistik)
        </Button>
      )}
      <Button
        variant="primary"
        wide
        disabled={!ready || state.wallet.dirty < fee}
        onClick={() => dispatch({ type: 'suppliers.unlock', payload: { supplierId: supplier.id } })}
      >
        {fee > 0 ? `Einsteigen (${formatEuro(fee)} Vermittlung)` : 'Geschäfte machen'}
      </Button>
    </>
  );
}

function SupplierDetail(props: { supplierId: string }) {
  const { state, dispatch } = useGame();
  const supplier = getSupplier(state, props.supplierId);
  const [target, setTarget] = useState('');
  if (!supplier) return null;
  if (!isUnlocked(state, supplier.id)) {
    return (
      <div class="sup-app">
        <p class="ui-hint">{supplier.description}</p>
        <KeyValue label="Art" value={KIND_NAME[supplier.kind]} />
        <KeyValue label="Preis" value={`${formatPercent(supplier.priceLevel)} vom Straßenpreis`} />
        <KeyValue label="Qualität" value={qualityTier(supplier.quality).name} />
        <KeyValue label="Sortiment" value={assortment(supplier).map(productName).join(', ')} />
        <LockedSupplier supplierId={supplier.id} />
      </div>
    );
  }
  const warehouses = getWarehouses(state);
  const warehouseId = warehouses.some((w) => w.id === target) ? target : undefined;
  const toPort = supplier.kind === 'port';
  const rel = getRelation(state, supplier.id);
  const limit = creditLimit(state, supplier.id);
  const credit = availableCredit(state, supplier.id);
  const blocked = isBlocked(state, supplier.id);
  const offered = new Set(availablePackages(state, supplier.id).map((p) => p.id));
  const discount = supplierDiscount(state, supplier.id);
  const shipments = shipmentsInTransit(state).filter((s) => s.supplierId === supplier.id);
  return (
    <div class="sup-app">
      <p class="ui-hint">{supplier.description}</p>
      <KeyValue label="Art" value={KIND_NAME[supplier.kind]} />
      <KeyValue label="Preis" value={`${formatPercent(supplier.priceLevel)} vom Straßenpreis`} />
      <KeyValue label="Qualität" value={qualityTier(supplier.quality).name} />
      <KeyValue label="Zuverlässigkeit" value={formatPercent(supplier.reliability)} />
      <KeyValue label="Lieferzeit" value={clock.formatDuration(supplier.deliveryTime)} />
      <KeyValue label="Sortiment" value={assortment(supplier).map(productName).join(', ')} />

      <h4 class="sup-app__section">Beziehung: {trustLabel(rel.trust)}</h4>
      <ProgressBar value={rel.trust / 100} label="Vertrauen" />
      <KeyValue label="Rabatt" value={formatPercent(discount)} />
      <KeyValue label="Kredit" value={limit > 0 ? `${formatEuro(credit)} von ${formatEuro(limit)}` : 'noch keiner'} />
      {rel.debt > 0 && (
        <div class={blocked ? 'sup-debtbox is-overdue' : 'sup-debtbox'}>
          <span>
            Schulden {formatEuro(rel.debt)}
            {rel.dueAt !== null && `, fällig ${clock.formatLong(rel.dueAt)}`}
            {blocked && '. Liefert nicht mehr, bis du zahlst.'}
          </span>
          <Button
            small
            variant="primary"
            disabled={state.wallet.dirty < rel.debt}
            onClick={() => dispatch({ type: 'suppliers.repay', payload: { supplierId: supplier.id } })}
          >
            Zahlen
          </Button>
        </div>
      )}

      <h4 class="sup-app__section">Angebot</h4>
      {toPort ? (
        <Hint>
          {hasBerth(state)
            ? 'Das Schiff legt an deinem Liegeplatz im Niehler Hafen an. Abholen musst du selbst (Logistik-App).'
            : 'Ohne Liegeplatz im Niehler Hafen kann kein Schiff für dich anlegen (Logistik-App).'}
        </Hint>
      ) : (
        warehouses.length > 1 && (
          <Select
            label="Liefern an"
            wide
            value={warehouseId ?? warehouses[0].id}
            options={warehouses.map((w) => ({ value: w.id, label: `liefern an ${w.name}` }))}
            onChange={setTarget}
          />
        )
      )}
      <List>
        {supplier.packages.map((p) => {
          const locked = !offered.has(p.id);
          const price = packagePrice(state, supplier.id, p.id);
          return (
            <ListItem
              key={p.id}
              aside={
                locked ? (
                  <span class="ui-hint">ab Vertrauen {p.minTrust}</span>
                ) : (
                  <div class="sup-buy">
                    <Button
                      small
                      disabled={blocked || state.wallet.dirty < price || (toPort && !hasBerth(state))}
                      onClick={() =>
                        dispatch({
                          type: 'suppliers.order',
                          payload: {
                            supplierId: supplier.id,
                            packageId: p.id,
                            ...(warehouseId ? { warehouseId } : {}),
                          },
                        })
                      }
                    >
                      Kaufen
                    </Button>
                    {limit > 0 && (
                      <Button
                        small
                        variant="subtle"
                        disabled={blocked || credit < price || (toPort && !hasBerth(state))}
                        onClick={() =>
                          dispatch({
                            type: 'suppliers.order',
                            payload: {
                              supplierId: supplier.id,
                              packageId: p.id,
                              onCredit: true,
                              ...(warehouseId ? { warehouseId } : {}),
                            },
                          })
                        }
                      >
                        Kredit
                      </Button>
                    )}
                  </div>
                )
              }
            >
              <div class={locked ? 'sup-pkg is-locked' : 'sup-pkg'}>
                <strong>{p.label}</strong>
                <span>
                  {price < p.price && <s>{formatEuro(p.price)}</s>} {formatEuro(price)}
                </span>
              </div>
            </ListItem>
          );
        })}
      </List>

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
function SuppliersApp() {
  const { state } = useGame();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const supplier = supplierId ? getSupplier(state, supplierId) : undefined;
  if (supplier) {
    return (
      <PhoneScreen title={`${supplier.contactName} · ${supplier.name}`} onBack={() => setSupplierId(null)}>
        <SupplierDetail supplierId={supplier.id} />
      </PhoneScreen>
    );
  }
  return (
    <PhoneScreen title="Lieferanten">
      <SupplierList onSelect={setSupplierId} />
    </PhoneScreen>
  );
}

function ShipmentsSection() {
  const { state } = useGame();
  const ui = useUi();
  const shipments = shipmentsInTransit(state);
  const debts = getSuppliers(state).filter((s) => getRelation(state, s.id).debt > 0);
  return (
    <Card
      title="Lieferungen"
      icon="truck"
      color="blue"
      status={debts.length > 0 ? 'warn' : shipments.length > 0 ? 'good' : 'idle'}
      summary={shipments.length === 0 ? 'keine' : `${shipments.length} unterwegs`}
      actions={
        <Button small onClick={() => ui.openPhone('suppliers.app')}>
          Bestellen
        </Button>
      }
    >
      {shipments.length === 0 ? (
        <Empty>Keine Lieferung unterwegs. Bestellen kannst du über die Lieferanten-App im Handy.</Empty>
      ) : (
        shipments.map((s) => <ShipmentRow key={s.id} state={state} shipment={s} showSupplier />)
      )}
      {debts.map((s) => (
        <p key={s.id} class={isBlocked(state, s.id) ? 'sup-debt is-overdue' : 'sup-debt'}>
          Schulden bei {s.name}: {formatEuro(getRelation(state, s.id).debt)}
        </p>
      ))}
    </Card>
  );
}

registerPhoneApp({
  id: 'suppliers.app',
  name: 'Lieferanten',
  icon: 'truck',
  order: 20,
  color: '#6b46c1',
  chrome: 'none',
  component: SuppliersApp,
  // Gesperrt wegen Schulden oder bereit zum Freischalten.
  badge: (state) =>
    getSuppliers(state).filter((s) => isBlocked(state, s.id) || (!isUnlocked(state, s.id) && canUnlock(state, s.id).ok))
      .length,
});
registerSlot('tab:business', { id: 'suppliers.order', order: 10, component: ShipmentsSection });
registerMapLayer(suppliersLayer);

onGameEvent('shipment.problem', 'suppliers.problemToast', (payload, ui, state) => {
  const name = getSupplier(state, payload.supplierId)?.name ?? 'Lieferant';
  const text = {
    delayed: `Lieferung aus ${name} verspätet sich.`,
    badQuality: `Die Ware aus ${name} ist schlechter als versprochen.`,
    seized: `Lieferung aus ${name} beschlagnahmt!`,
  }[payload.kind];
  ui.toast(text, 'bad');
});
soundOnEvent('shipment.arrived', 'delivery');
onGameEvent('shipment.arrived', 'suppliers.arrivedToast', (payload, ui, state) => {
  // Schiffsware meldet die Logistik (Ware am Kai).
  if (payload.atPort) return;
  ui.toast(`Lieferung aus ${getSupplier(state, payload.supplierId)?.name ?? 'dem Ausland'} ist da.`, 'good');
});
onGameEvent('supplier.unlocked', 'suppliers.unlockedToast', (payload, ui, state) => {
  const supplier = getSupplier(state, payload.supplierId);
  ui.toast(`${supplier?.contactName ?? 'Neuer Lieferant'} (${supplier?.name ?? ''}) liefert jetzt an dich.`, 'good');
});

// Empfehlung: Nachschub bestellen, wenn die Ware knapp wird.
registerAdvisor({
  id: 'suppliers.restock',
  advise: (state) => {
    if (shipmentsInTransit(state).length > 0 || cargoAmount(state) > 0) return null;
    const stock = getStock(state);
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
