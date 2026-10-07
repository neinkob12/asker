// Dynamic Island: Lieferungen unterwegs mit Restzeit und Fortschritt, dazu ein kurzer Auftritt bei Ankunft.

import { islandCountdown, onGameEvent, registerLiveActivity } from '../../../ui';
import { activeCity } from '../../city';
import {
  expectedArrival,
  shipmentGoods,
  shipmentProgress,
  shipmentReason,
  shipmentSupplier,
  shipmentsInTransit,
} from '../index';

registerLiveActivity({
  id: 'suppliers.shipments',
  activities: (state) =>
    shipmentsInTransit(state, activeCity(state)).map((shipment) => {
      const supplier = shipmentSupplier(state, shipment);
      const left = expectedArrival(shipment) - state.time;
      const late = shipment.problem === 'delayed' && shipment.problemRevealed;
      return {
        id: `suppliers.shipment.${shipment.id}`,
        priority: late ? 58 : 50,
        icon: supplier?.kind === 'port' ? 'ship' : 'truck',
        tone: late ? 'warn' : 'info',
        leading: shipment.extra ? 'Sammellieferung' : 'Lieferung',
        trailing: islandCountdown(left),
        title: shipmentGoods(shipment),
        // Auftrag 23: bei einer Verspätung mit Grund.
        detail: late
          ? `Verspätet: ${shipmentReason(state, shipment) ?? supplier?.name ?? 'unterwegs'}`
          : (supplier?.name ?? 'Lieferant'),
        progress: shipmentProgress(state, shipment),
        open: (ui) => ui.openPhone('suppliers.app'),
      };
    }),
});

onGameEvent('shipment.arrived', 'suppliers.island', (payload, ui, state) => {
  if (payload.cityId !== undefined && payload.cityId !== activeCity(state)) return;
  ui.pulseIsland({ icon: 'truck', tone: 'accent', text: 'Ware ist da' });
});
