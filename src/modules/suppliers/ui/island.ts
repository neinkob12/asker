// Dynamic Island: Lieferungen unterwegs mit Restzeit und Fortschritt, dazu ein kurzer Auftritt bei Ankunft.

import { islandCountdown, onGameEvent, registerLiveActivity } from '../../../ui';
import { formatProductAmount, productName } from '../../goods';
import { expectedArrival, getSupplier, shipmentProgress, shipmentsInTransit } from '../index';

registerLiveActivity({
  id: 'suppliers.shipments',
  activities: (state) =>
    shipmentsInTransit(state).map((shipment) => {
      const supplier = getSupplier(state, shipment.supplierId);
      const left = expectedArrival(shipment) - state.time;
      const late = shipment.problem === 'delayed' && shipment.problemRevealed;
      return {
        id: `suppliers.shipment.${shipment.id}`,
        priority: late ? 58 : 50,
        icon: supplier?.kind === 'port' ? 'ship' : 'truck',
        tone: late ? 'warn' : 'info',
        leading: 'Lieferung',
        trailing: islandCountdown(left),
        title: `${formatProductAmount(shipment.productId, shipment.amount)} ${productName(shipment.productId)}`,
        detail: `${supplier?.name ?? 'Lieferant'}${late ? ' · verspätet' : ''}`,
        progress: shipmentProgress(state, shipment),
        open: (ui) => ui.openPhone('suppliers.app'),
      };
    }),
});

onGameEvent('shipment.arrived', 'suppliers.island', (_payload, ui) =>
  ui.pulseIsland({ icon: 'truck', tone: 'accent', text: 'Ware ist da' }),
);
