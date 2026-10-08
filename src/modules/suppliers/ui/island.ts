// Anzeige oben im Handy (Auftrag 46d, an der Stelle der Dynamic Island): wie viele Lieferungen in der aktiven Stadt
// unterwegs sind, nur Zahl und Symbol; ein Tipp öffnet die Lieferanten-App.

import { registerStatusCounter } from '../../../ui';
import { activeCity } from '../../city';
import { shipmentsInTransit } from '../index';

registerStatusCounter({
  id: 'suppliers.shipments',
  order: 10,
  icon: 'truck',
  count: (state) => shipmentsInTransit(state, activeCity(state)).length,
  label: (n) => (n === 1 ? 'Eine Lieferung unterwegs' : `${n} Lieferungen unterwegs`),
  open: (ui) => ui.openPhone('suppliers.app'),
});
