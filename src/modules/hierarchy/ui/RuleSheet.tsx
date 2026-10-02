// Bestellregel bearbeiten (Blatt): Ware, Lieferant, Paket, Mindestbestand und Ziel-Lager. Hafen-Lieferanten sind
// ausgegraut, solange niemand die Schiffsware automatisch am Kai abholt.

import { useEffect, useState } from 'preact/hooks';
import { formatEuro } from '../../../core';
import { Button, Group, Hint, ItemContent, List, ListItem, Select, Sheet, Stepper, useGame } from '../../../ui';
import { allProducts, formatProductAmount, getWarehouses, productName } from '../../goods';
import { availablePackages, getSupplier, getSuppliers, isUnlocked, packagePrice } from '../../suppliers';
import { homeWarehouse, isPortSupplierAllowed, type OrderRule, PORT_SUPPLIER_HINT } from '../index';

const AUTO = '';

export interface RuleSheetProps {
  open: boolean;
  onClose: () => void;
  staffId: string;
  /** Regel zum Bearbeiten, null = neue Regel. */
  rule: OrderRule | null;
  onSave: (rule: OrderRule) => void;
  onDelete?: () => void;
}

const EMPTY: OrderRule = {
  id: '',
  productId: null,
  supplierId: null,
  packageId: null,
  minStock: 50,
  warehouseId: null,
  paused: null,
};

export function RuleSheet(props: RuleSheetProps) {
  const { state } = useGame();
  const [draft, setDraft] = useState<OrderRule>(props.rule ?? EMPTY);
  useEffect(() => {
    if (props.open) setDraft(props.rule ?? EMPTY);
  }, [props.open]);
  const set = (patch: Partial<OrderRule>) => setDraft((d) => ({ ...d, ...patch }));

  const portAllowed = isPortSupplierAllowed(state);
  const supplierOptions = [
    { value: AUTO, label: 'Automatisch: günstigster' },
    ...getSuppliers(state).map((s) => {
      const blocked = s.kind === 'port' && !portAllowed;
      const locked = !isUnlocked(state, s.id);
      return {
        value: s.id,
        label: `${s.name}${blocked ? ' (Hafen, nicht möglich)' : locked ? ' (liefert noch nicht)' : ''}`,
        disabled: blocked,
      };
    }),
  ];
  const supplier = draft.supplierId ? getSupplier(state, draft.supplierId) : undefined;
  const packages = supplier ? supplier.packages.filter((p) => !draft.productId || p.productId === draft.productId) : [];
  const available = supplier ? availablePackages(state, supplier.id).map((p) => p.id) : [];
  const packageOptions = [
    { value: AUTO, label: 'Passend zur Lücke' },
    ...packages.map((p) => ({
      value: p.id,
      label: `${p.label} (${formatEuro(packagePrice(state, supplier?.id ?? '', p.id))})${available.includes(p.id) ? '' : ' (noch nicht)'}`,
    })),
  ];
  const home = homeWarehouse(state, props.staffId);
  const warehouseOptions = [
    { value: AUTO, label: `Lager seiner Spots${home ? ` (${home.name})` : ''}` },
    ...getWarehouses(state).map((w) => ({ value: w.id, label: w.name })),
  ];
  const unit = draft.productId ? formatProductAmount(draft.productId, draft.minStock) : `${draft.minStock} Einheiten`;

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.rule ? 'Bestellregel' : 'Neue Bestellregel'}
      detents={['large']}
      action={
        <Button
          small
          variant="primary"
          onClick={() => {
            props.onSave(draft);
            props.onClose();
          }}
        >
          Sichern
        </Button>
      }
    >
      <div class="lt-sheet">
        <Group title="Was und wo" icon="package" color="goods">
          <List>
            <ListItem>
              <ItemContent icon="leaf" color="goods" title="Ware">
                <Select
                  wide
                  label="Ware"
                  value={draft.productId ?? AUTO}
                  options={[
                    { value: AUTO, label: 'Alles nach Nachfrage' },
                    ...allProducts().map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  onChange={(v) => set({ productId: v || null, packageId: null })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent icon="truck" color="goods" title="Lieferant">
                <Select
                  wide
                  label="Lieferant"
                  value={draft.supplierId ?? AUTO}
                  options={supplierOptions}
                  onChange={(v) => set({ supplierId: v || null, packageId: null })}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent
                icon="boxes"
                color="goods"
                title="Paket"
                meta={supplier ? undefined : 'erst Lieferant wählen'}
              >
                <Select
                  wide
                  label="Paket"
                  value={draft.packageId ?? AUTO}
                  options={packageOptions}
                  disabled={!supplier}
                  onChange={(v) => {
                    const pkg = packages.find((p) => p.id === v);
                    set({ packageId: v || null, ...(pkg ? { productId: pkg.productId } : {}) });
                  }}
                />
              </ItemContent>
            </ListItem>
            <ListItem>
              <ItemContent icon="warehouse" color="goods" title="Lager">
                <Select
                  wide
                  label="Ziel-Lager"
                  value={draft.warehouseId ?? AUTO}
                  options={warehouseOptions}
                  onChange={(v) => set({ warehouseId: v || null })}
                />
              </ItemContent>
            </ListItem>
          </List>
        </Group>
        <Group
          title="Mindestbestand"
          icon="gauge"
          color="goods"
          note={`Fällt ${draft.productId ? productName(draft.productId) : 'die Ware'} im Lager (mit allem, was unterwegs ist) unter diese Menge, bestellt er.`}
        >
          <List>
            <ListItem
              aside={
                <Stepper
                  label="Mindestbestand"
                  value={draft.minStock}
                  min={0}
                  max={2000}
                  step={25}
                  onChange={(minStock) => set({ minStock })}
                />
              }
            >
              <ItemContent icon="gauge" color="goods" title={unit} />
            </ListItem>
          </List>
        </Group>
        {!portAllowed && <Hint icon="ship">Hafen-Lieferanten gehen noch nicht. {PORT_SUPPLIER_HINT}</Hint>}
        {props.rule && props.onDelete && (
          <div class="lt-actions">
            <Button
              variant="danger"
              onClick={() => {
                props.onDelete?.();
                props.onClose();
              }}
            >
              Regel löschen
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
