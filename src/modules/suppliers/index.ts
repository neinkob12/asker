// Lieferanten: Bestellungen und Lieferungen. Aus dem Prototyp portiert: Hafen Rotterdam mit Transporter.
// Großstadt-Lieferanten, Beziehungen, Kredit und Lieferprobleme baut Auftrag 12.
//
// Öffentliche API:
//   getSuppliers(state), getSupplier(state, id), shipmentsInTransit(state), shipmentProgress(state, shipment),
//   cheapestPackagePrice(state)
// Befehle: 'suppliers.order'
// Ereignisse: 'shipment.ordered', 'shipment.arrived'

import { type Ctx, clock, defineModule, formatEuro, type GameState, journal, messages, wallet } from '../../core';
import { DEFAULT_WAREHOUSE, getWarehouse, STANDARD_QUALITY, store } from '../goods';
import { SUPPLIERS } from './config';

export interface SupplierPackage {
  id: string;
  label: string;
  productId: string;
  amount: number;
  price: number;
}

export interface Supplier {
  id: string;
  name: string;
  /** 'port' = Hafen (groß, langsam, günstig), 'city' = Großstadt (klein, schnell, teuer). */
  kind: 'port' | 'city';
  lng: number;
  lat: number;
  /** Lieferzeit in Spielminuten. */
  deliveryTime: number;
  packages: SupplierPackage[];
}

export interface Shipment {
  id: number;
  supplierId: string;
  packageId: string;
  productId: string;
  amount: number;
  quality: number;
  warehouseId: string;
  price: number;
  orderedAt: number;
  arrivesAt: number;
}

export interface SuppliersState {
  shipments: Shipment[];
}

declare module '../../core' {
  interface ModuleStates {
    suppliers: SuppliersState;
  }
  interface GameCommands {
    'suppliers.order': { supplierId: string; packageId: string };
  }
  interface GameEvents {
    'shipment.ordered': { shipmentId: number; supplierId: string; amount: number; price: number };
    'shipment.arrived': {
      shipmentId: number;
      supplierId: string;
      productId: string;
      amount: number;
      warehouseId: string;
    };
  }
}

export function getSuppliers(_state: GameState): readonly Supplier[] {
  return SUPPLIERS;
}

export function getSupplier(state: GameState, id: string): Supplier | undefined {
  return getSuppliers(state).find((s) => s.id === id);
}

export function shipmentsInTransit(state: GameState): readonly Shipment[] {
  return state.modules.suppliers.shipments;
}

/** Fortschritt einer Lieferung von 0 (bestellt) bis 1 (angekommen). */
export function shipmentProgress(state: GameState, shipment: Shipment): number {
  const total = shipment.arrivesAt - shipment.orderedAt;
  return total <= 0 ? 1 : Math.min(1, Math.max(0, (state.time - shipment.orderedAt) / total));
}

/** Preis des günstigsten Pakets aller Lieferanten. */
export function cheapestPackagePrice(state: GameState): number {
  return Math.min(...getSuppliers(state).flatMap((s) => s.packages.map((p) => p.price)));
}

function order(ctx: Ctx, supplierId: string, packageId: string) {
  const supplier = getSupplier(ctx.state, supplierId);
  const pkg = supplier?.packages.find((p) => p.id === packageId);
  if (!supplier || !pkg) return { ok: false as const, reason: 'Unbekanntes Paket.' };
  if (!wallet.pay(ctx, pkg.price, 'dirty', `Bestellung ${supplier.name}`)) {
    return { ok: false as const, reason: 'Nicht genug Geld.' };
  }
  const shipment: Shipment = {
    id: ctx.nextId(),
    supplierId,
    packageId,
    productId: pkg.productId,
    amount: pkg.amount,
    quality: STANDARD_QUALITY,
    warehouseId: DEFAULT_WAREHOUSE,
    price: pkg.price,
    orderedAt: ctx.now,
    arrivesAt: ctx.now + supplier.deliveryTime,
  };
  ctx.state.modules.suppliers.shipments.push(shipment);
  journal.add(ctx, `${pkg.label} bei ${supplier.name} bestellt (${formatEuro(pkg.price)}).`);
  ctx.emit('shipment.ordered', { shipmentId: shipment.id, supplierId, amount: pkg.amount, price: pkg.price });
  return { ok: true as const, data: { shipmentId: shipment.id } };
}

function tick(ctx: Ctx): void {
  const state = ctx.state.modules.suppliers;
  const arrived = state.shipments.filter((s) => s.arrivesAt <= ctx.now);
  if (arrived.length === 0) return;
  state.shipments = state.shipments.filter((s) => s.arrivesAt > ctx.now);
  for (const s of arrived) {
    store(ctx, { productId: s.productId, amount: s.amount, warehouseId: s.warehouseId, quality: s.quality });
    const warehouse = getWarehouse(ctx.state, s.warehouseId);
    journal.add(ctx, `Lieferung angekommen: ${s.amount} g im ${warehouse?.name ?? 'Lager'}.`, 'good');
    ctx.emit('shipment.arrived', {
      shipmentId: s.id,
      supplierId: s.supplierId,
      productId: s.productId,
      amount: s.amount,
      warehouseId: s.warehouseId,
    });
  }
}

export default defineModule({
  id: 'suppliers',
  version: 1,
  dependsOn: ['goods'],
  init: (ctx) => {
    const rotterdam = SUPPLIERS[0];
    const first = rotterdam.packages[0];
    messages.send(ctx, {
      contact: { id: `supplier:${rotterdam.id}`, name: rotterdam.name, kind: 'supplier' },
      text: `Du brauchst Nachschub? Wir liefern nach Köln. Lieferzeit ca. ${clock.formatDuration(rotterdam.deliveryTime)}`,
      options: [
        {
          id: 'order',
          label: `${first.label} bestellen (${formatEuro(first.price)})`,
          command: { type: 'suppliers.order', payload: { supplierId: rotterdam.id, packageId: first.id } },
        },
        { id: 'later', label: 'Später', reply: 'Melde mich.' },
      ],
    });
    return { shipments: [] };
  },
  tick,
  commands: {
    'suppliers.order': (ctx, { supplierId, packageId }) => order(ctx, supplierId, packageId),
  },
  // Pleite-Regel: Wer eine Lieferung erwartet oder sich eine leisten kann, kann weitermachen.
  solvency: (state) =>
    state.modules.suppliers.shipments.length > 0 || wallet.balance(state, 'dirty') >= cheapestPackagePrice(state),
});
