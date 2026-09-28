// Oberfläche der Lieferanten: Bestellen im Tab "Geschäft", Route und Transporter auf der Karte.

import { clock, formatAmount, formatEuro } from '../../../core';
import { registerMapLayer } from '../../../map';
import { Button, Card, Empty, Hint, ProgressBar, registerSlot, useGame } from '../../../ui';
import { getSuppliers, shipmentProgress, shipmentsInTransit } from '../index';
import { suppliersLayer } from './map';
import './suppliers.css';

function SuppliersSection() {
  const { state, dispatch } = useGame();
  const shipments = shipmentsInTransit(state);
  return (
    <>
      {getSuppliers(state).map((supplier) => (
        <Card key={supplier.id} title={supplier.name}>
          <Hint>Lieferzeit: ca. {clock.formatDuration(supplier.deliveryTime)}</Hint>
          <div class="packages">
            {supplier.packages.map((p) => (
              <Button
                key={p.id}
                disabled={state.wallet.dirty < p.price}
                onClick={() =>
                  dispatch({ type: 'suppliers.order', payload: { supplierId: supplier.id, packageId: p.id } })
                }
              >
                <strong>{p.label}</strong>
                <span>{formatEuro(p.price)}</span>
              </Button>
            ))}
          </div>
          {shipments.filter((s) => s.supplierId === supplier.id).length === 0 ? (
            <Empty>Keine Lieferung unterwegs.</Empty>
          ) : (
            shipments
              .filter((s) => s.supplierId === supplier.id)
              .map((s) => (
                <div key={s.id} class="shipment">
                  <span>{formatAmount(s.amount)} unterwegs</span>
                  <ProgressBar value={shipmentProgress(state, s)} label="Lieferung" />
                </div>
              ))
          )}
        </Card>
      ))}
    </>
  );
}

registerSlot('tab:business', { id: 'suppliers.order', order: 10, component: SuppliersSection });
registerMapLayer(suppliersLayer);
