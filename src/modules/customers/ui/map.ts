// Lieferungen auf der Karte: Kurier (Roller) oder du selbst (Auto) fahren Luftlinie vom Lager zum Kunden
// (Effekt-Werkzeug createVehicle), das Ziel ist markiert.

import type { Marker } from 'maplibre-gl';
import { addHtmlMarker, createVehicle, type MapLayer, type VehicleHandle } from '../../../map';
import { DEFAULT_WAREHOUSE, formatProductAmount, getWarehouse, productName } from '../../goods';
import { getOrders, orderProgress } from '../index';

export const deliveriesLayer: MapLayer = {
  id: 'customers.deliveries',
  order: 45,
  mount(ctx) {
    const shown = new Map<number, { rider: VehicleHandle; target: Marker }>();
    return {
      update(state) {
        const active = getOrders(state, { status: 'enRoute' });
        const ids = new Set(active.map((o) => o.id));
        for (const [id, entry] of shown) {
          if (ids.has(id)) continue;
          entry.rider.remove();
          entry.target.remove();
          shown.delete(id);
        }
        const warehouse = getWarehouse(state, DEFAULT_WAREHOUSE);
        if (!warehouse) return;
        for (const order of active) {
          let entry = shown.get(order.id);
          if (!entry) {
            const title = `${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)} für ${order.contactName}`;
            entry = {
              rider: createVehicle(ctx.map, {
                path: [warehouse, order],
                kind: order.deliveredBy === 'player' ? 'car' : 'courier',
                label: order.kind === 'wholesale' ? formatProductAmount(order.productId, order.amount) : undefined,
                title,
              }),
              target: addHtmlMarker(ctx.map, { position: order, className: 'delivery-target', title }).marker,
            };
            shown.set(order.id, entry);
          }
          entry.rider.setProgress(orderProgress(state, order));
        }
      },
      destroy() {
        for (const entry of shown.values()) {
          entry.rider.remove();
          entry.target.remove();
        }
        shown.clear();
      },
    };
  },
};
