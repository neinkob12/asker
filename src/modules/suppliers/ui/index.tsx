// Oberfläche der Lieferanten: Handy-App "Lieferanten" (freischalten, bestellen, Beziehung, Kredit), Lieferungen im
// Tab "Geschäft", Routen und Transporter auf der Karte, Hinweise bei Lieferproblemen.

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
  Select,
  Slot,
  soundOnEvent,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityName, relationFactor } from '../../city';
import { getStock, getWarehouse, getWarehouses, productName, qualityTier } from '../../goods';
import { cargoAmount, defaultPickupWarehouse, hasBerth, inTransitAmount, portName } from '../../logistics';
import {
  assortment,
  availableCredit,
  availablePackages,
  CHOICE_NAMES,
  canUnlock,
  creditLimit,
  deliversTo,
  expectedArrival,
  getRelation,
  getSupplier,
  getSuppliers,
  isBlocked,
  isUnlocked,
  type ProblemChoice,
  packagePrice,
  type Shipment,
  type Supplier,
  shipmentProgress,
  shipmentReason,
  shipmentsInTransit,
  supplierDiscount,
  supplierIn,
  trustLabel,
  unlockRequirements,
} from '../index';
import { suppliersLayer } from './map';
import './island';
import './suppliers.css';

const APP_ID = 'suppliers.app';

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
  if (choice === 'partial') return 'Teillieferung';
  if (choice === 'redirect') {
    const target = s.decision?.redirectTo ? getWarehouse(state, s.decision.redirectTo)?.name : undefined;
    return `Ins ${target ?? 'andere Lager'}`;
  }
  return s.decision?.kind === 'seize' ? 'Aufgeben' : 'Abwarten';
}

/** Eine Zeile der Liste: Kachel (Schiff oder Transporter, gesperrt mit Schloss), Name, Stand, Etikett. */
function SupplierRow(props: { supplier: Supplier; onSelect: (id: string) => void }) {
  const { state } = useGame();
  const s = props.supplier;
  const rel = getRelation(state, s.id);
  const underway = shipmentsInTransit(state).filter((x) => x.supplierId === s.id).length;
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
  const shipments = shipmentsInTransit(state);
  const debts = getSuppliers(state, activeCity(state)).filter((s) => getRelation(state, s.id).debt > 0);
  return (
    <div class="sup-groups">
      {shipments.length > 0 && (
        <Group icon="route" color="goods" title="Unterwegs" count={shipments.length}>
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

function SupplierDetail(props: { supplierId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  // So, wie der Lieferant in der aktiven Stadt auftritt (Lieferzeit, Sortiment; Hein in Hamburg am Kai).
  const cityId = activeCity(state);
  const base = getSupplier(state, props.supplierId);
  const supplier = base ? supplierIn(base, cityId) : undefined;
  const [target, setTarget] = useState('');
  if (!supplier || !base) return null;
  if (!deliversTo(base, cityId)) {
    return (
      <div class="sup-app">
        <p class="ui-hint">{supplier.description}</p>
        <Hint icon="pin">{`${supplier.contactName} liefert nicht nach ${cityName(cityId)}.`}</Hint>
      </div>
    );
  }
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
  const warehouses = getWarehouses(state, activeCity(state));
  const toPort = supplier.kind === 'port';
  const picked = warehouses.some((w) => w.id === target) ? target : undefined;
  // Schiffsware: Ohne Wahl zeigt die Auswahl (und bestellt) das Lager, in das die Abholung ohnehin fährt.
  const warehouseId = toPort && warehouses.length > 1 ? (picked ?? defaultPickupWarehouse(state)) : picked;
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
          onChange={setTarget}
        />
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
  if (supplier) {
    return (
      <PhoneScreen title={`${supplier.contactName} (${supplier.name})`} onBack={() => ui.openPhone(APP_ID)}>
        <SupplierDetail key={supplier.id} supplierId={supplier.id} />
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
  // Schiffsware meldet die Logistik (Ware am Kai).
  if (payload.atPort) return;
  ui.toast(`Lieferung aus ${getSupplier(state, payload.supplierId)?.name ?? 'dem Ausland'} ist da.`, 'good', {
    urgent: true,
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
    if (shipmentsInTransit(state).length > 0 || cargoAmount(state) > 0 || inTransitAmount(state) > 0) return null;
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
