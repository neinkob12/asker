// Lieferungen auf der Karte: Du oder die Rechte Hand fahren mit dem Auto als 3D-Mini-Fahrzeug über echte Straßen
// (roads) vom Lager, aus dem die Ware kommt, zum Kunden (Effekt-Werkzeug createVehicle). Das Auto hält an der Straße,
// die letzten Meter zum Kunden (und vom Lager zur Straße) sind ein gepunkteter Fußweg. Das Ziel ist markiert.

import type { Marker } from 'maplibre-gl';
import {
  addFootpath,
  addHtmlMarker,
  createVehicle,
  type FootpathHandle,
  type MapLayer,
  type VehicleHandle,
} from '../../../map';
import { DEFAULT_WAREHOUSE, formatProductAmount, getWarehouse, getWarehouses, productName } from '../../goods';
import { roadRoute } from '../../roads';
import { getOrders, orderDriveProgress } from '../index';

export const deliveriesLayer: MapLayer = {
  id: 'customers.deliveries',
  order: 45,
  mount(ctx) {
    const shown = new Map<number, { rider: VehicleHandle; target: Marker; walks: FootpathHandle[] }>();
    return {
      update(state) {
        const active = getOrders(state, { status: 'enRoute' });
        const ids = new Set(active.map((o) => o.id));
        for (const [id, entry] of shown) {
          if (ids.has(id)) continue;
          entry.rider.remove();
          entry.target.remove();
          for (const walk of entry.walks) walk.remove();
          shown.delete(id);
        }
        for (const order of active) {
          let entry = shown.get(order.id);
          if (!entry) {
            const from =
              getWarehouse(state, order.fromWarehouseId ?? DEFAULT_WAREHOUSE) ??
              getWarehouse(state, DEFAULT_WAREHOUSE) ??
              getWarehouses(state)[0];
            if (!from) continue;
            const title = `${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)} für ${order.contactName}`;
            const route = roadRoute(from, order);
            entry = {
              walks: [addFootpath(ctx.map, route.walkFrom), addFootpath(ctx.map, route.walkTo)],
              rider: createVehicle(ctx.map, {
                path: route.drive,
                kind: 'car',
                label: order.kind === 'wholesale' ? formatProductAmount(order.productId, order.amount) : undefined,
                title,
                progress: orderDriveProgress(state, order),
              }),
              target: addHtmlMarker(ctx.map, { position: order, className: 'delivery-target', title }).marker,
            };
            shown.set(order.id, entry);
          }
          entry.rider.setProgress(orderDriveProgress(state, order));
        }
      },
      destroy() {
        for (const entry of shown.values()) {
          entry.rider.remove();
          entry.target.remove();
          for (const walk of entry.walks) walk.remove();
        }
        shown.clear();
      },
    };
  },
};
