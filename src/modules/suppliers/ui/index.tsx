// Oberfläche der Lieferanten: Handy-App "Lieferanten" (bestellen, Beziehung, Kredit), Lieferungen im Tab
// "Geschäft", Routen und Transporter auf der Karte, Hinweise bei Lieferproblemen.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Badge,
  Button,
  Card,
  Empty,
  Hint,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerPhoneApp,
  registerSlot,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { productName, qualityTier } from '../../goods';
import {
  assortment,
  availableCredit,
  availablePackages,
  creditLimit,
  expectedArrival,
  getRelation,
  getSupplier,
  getSuppliers,
  isBlocked,
  packagePrice,
  type Shipment,
  type Supplier,
  shipmentProgress,
  shipmentsInTransit,
  supplierDiscount,
  trustLabel,
} from '../index';
import { suppliersLayer } from './map';
import './suppliers.css';

const KIND_NAME: Record<Supplier['kind'], string> = { port: 'Hafen', city: 'Großstadt' };

function ShipmentRow(props: { state: GameState; shipment: Shipment; showSupplier?: boolean }) {
  const { state, shipment: s } = props;
  const supplier = getSupplier(state, s.supplierId);
  const pkg = supplier?.packages.find((p) => p.id === s.packageId);
  const delayed = s.problem === 'delayed' && s.problemRevealed;
  return (
    <div class="shipment">
      <div class="shipment__head">
        <span>
          {pkg?.label ?? productName(s.productId)}
          {props.showSupplier && supplier ? ` aus ${supplier.name}` : ''}
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
  return (
    <div class="sup-app">
      <h3 class="sup-app__title">Lieferanten</h3>
      <ul class="sup-list">
        {getSuppliers(state).map((s) => {
          const rel = getRelation(state, s.id);
          const underway = shipmentsInTransit(state).filter((x) => x.supplierId === s.id).length;
          return (
            <li key={s.id}>
              <button type="button" class="sup-list__item" onClick={() => props.onSelect(s.id)}>
                <strong>
                  {s.contactName} · {s.name}
                  <Badge count={underway} tone="accent" />
                </strong>
                <span>
                  {KIND_NAME[s.kind]}, {clock.formatDuration(s.deliveryTime)} · {trustLabel(rel.trust)}
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
        Großstädte liefern schnell kleine Mengen, der Hafen günstig große. Vertrauen bringt Rabatt und Kredit.
      </Hint>
    </div>
  );
}

function SupplierDetail(props: { supplierId: string; onBack: () => void }) {
  const { state, dispatch } = useGame();
  const supplier = getSupplier(state, props.supplierId);
  if (!supplier) return null;
  const rel = getRelation(state, supplier.id);
  const limit = creditLimit(state, supplier.id);
  const credit = availableCredit(state, supplier.id);
  const blocked = isBlocked(state, supplier.id);
  const offered = new Set(availablePackages(state, supplier.id).map((p) => p.id));
  const discount = supplierDiscount(state, supplier.id);
  const shipments = shipmentsInTransit(state).filter((s) => s.supplierId === supplier.id);
  return (
    <div class="sup-app">
      <div class="sup-app__head">
        <Button small variant="subtle" onClick={props.onBack} aria-label="Zurück">
          ‹
        </Button>
        <h3 class="sup-app__title">
          {supplier.contactName} · {supplier.name}
        </h3>
      </div>
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
                      disabled={blocked || state.wallet.dirty < price}
                      onClick={() =>
                        dispatch({ type: 'suppliers.order', payload: { supplierId: supplier.id, packageId: p.id } })
                      }
                    >
                      Kaufen
                    </Button>
                    {limit > 0 && (
                      <Button
                        small
                        variant="subtle"
                        disabled={blocked || credit < price}
                        onClick={() =>
                          dispatch({
                            type: 'suppliers.order',
                            payload: { supplierId: supplier.id, packageId: p.id, onCredit: true },
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

function SuppliersApp() {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  return supplierId ? (
    <SupplierDetail supplierId={supplierId} onBack={() => setSupplierId(null)} />
  ) : (
    <SupplierList onSelect={setSupplierId} />
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
  component: SuppliersApp,
  badge: (state) => getSuppliers(state).filter((s) => isBlocked(state, s.id)).length,
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
  ui.toast(`Lieferung aus ${getSupplier(state, payload.supplierId)?.name ?? 'dem Ausland'} ist da.`, 'good');
});
