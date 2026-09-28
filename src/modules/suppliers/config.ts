import type { Supplier } from './index';

/** Lieferzeit Rotterdam: 12,5 Spielstunden = 2,5 echte Minuten bei 1x. */
export const ROTTERDAM_DELIVERY_TIME = 750;

export const SUPPLIERS: readonly Supplier[] = [
  {
    id: 'rotterdam',
    name: 'Hafen Rotterdam',
    kind: 'port',
    lng: 4.4,
    lat: 51.9,
    deliveryTime: ROTTERDAM_DELIVERY_TIME,
    packages: [
      { id: 'small', label: '100 g', productId: 'weed', amount: 100, price: 450 },
      { id: 'medium', label: '500 g', productId: 'weed', amount: 500, price: 2000 },
      { id: 'large', label: '1 kg', productId: 'weed', amount: 1000, price: 3600 },
    ],
  },
];
