// Lieferungen auf der Karte: ein Punkt fährt Luftlinie vom Lager zum Kunden, das Ziel ist markiert.

import type { Marker } from 'maplibre-gl';
import { lerpLngLat } from '../../../core';
import { addHtmlMarker, type MapLayer } from '../../../map';
import { DEFAULT_WAREHOUSE, formatProductAmount, getWarehouse, productName } from '../../goods';
import { getOrders, orderProgress } from '../index';

export const deliveriesLayer: MapLayer = {
  id: 'customers.deliveries',
  order: 45,
  mount(ctx) {
    const shown = new Map<number, { rider: Marker; target: Marker }>();
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
          const pos = lerpLngLat(warehouse, order, orderProgress(state, order));
          let entry = shown.get(order.id);
          if (!entry) {
            const title = `${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)} für ${order.contactName}`;
            entry = {
              rider: addHtmlMarker(ctx.map, {
                position: pos,
                className: `delivery-marker ${order.deliveredBy === 'player' ? 'is-player' : ''}`,
                title,
              }).marker,
              target: addHtmlMarker(ctx.map, { position: order, className: 'delivery-target', title }).marker,
            };
            shown.set(order.id, entry);
          }
          entry.rider.setLngLat([pos.lng, pos.lat]);
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
