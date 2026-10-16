// Lieferungen auf der Karte als Konvois (Feedback 16.10.2026: "laggt total, wenn man viele Bestellungen hat"): Alle
// Lieferungen eines Lieferanten an dasselbe Ziel (Lager oder Kai) in der aktiven Stadt fahren als ein Fahrzeug mit
// einer Strecke, einem Etikett und einem Fußweg, statt jede Lieferung einzeln. Das Fahrzeug steht dort, wo die
// vorderste Lieferung ist; kommt sie an, springt es zur nächsten. Lieferungen anderer Städte zeigt die Karte nicht
// (wie das Handy, Auftrag 43); Fahrten zwischen den Städten zeigt die Deutschland-Ansicht als goldene Autobahn.
// Ohne DOM, damit es sich ohne Browser prüfen lässt.

import type { GameState } from '../../../core';
import { formatProductAmount, productName } from '../../goods';
import {
  type Shipment,
  type Supplier,
  shipmentCity,
  shipmentGoods,
  shipmentProgress,
  shipmentSupplier,
  shipmentsInTransit,
} from '../index';

export interface Convoy {
  /** Lieferant, Stadt und Ziel, z.B. "berlin|hamburg|garage-barmbek" oder "rotterdam|koeln|port". */
  key: string;
  /** Der Lieferant so, wie er in dieser Stadt auftritt (Position, Art). */
  supplier: Supplier;
  cityId: string;
  /** Die vorderste Lieferung (am weitesten gefahren); nach ihr richtet sich das Fahrzeug. */
  lead: Shipment;
  /** Fortschritt der vordersten Lieferung (0–1). */
  progress: number;
  /** Alle Lieferungen des Konvois, die vorderste zuerst. */
  shipments: Shipment[];
  /** Ist eine davon verspätet (und der Spieler weiß es)? */
  late: boolean;
}

/** Ziel einer Lieferung im Schlüssel: der Kai ("port") oder das Lager. */
const targetKey = (s: Shipment) => (s.toPort ? 'port' : s.warehouseId);

/** Konvois der Stadt, nach Schlüssel sortiert (gleiche Reihenfolge bei gleichem Zustand). */
export function shipmentConvoys(state: GameState, cityId: string): Convoy[] {
  const groups = new Map<string, { supplier: Supplier; items: { s: Shipment; progress: number }[] }>();
  for (const s of shipmentsInTransit(state, cityId)) {
    const supplier = shipmentSupplier(state, s);
    if (!supplier) continue;
    const key = `${s.supplierId}|${shipmentCity(s)}|${targetKey(s)}`;
    let group = groups.get(key);
    if (!group) {
      group = { supplier, items: [] };
      groups.set(key, group);
    }
    group.items.push({ s, progress: shipmentProgress(state, s) });
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { supplier, items }]) => {
      // Vorneweg die am weitesten gefahrene Lieferung; bei Gleichstand die ältere (feste Reihenfolge).
      items.sort((a, b) => b.progress - a.progress || a.s.id - b.s.id);
      return {
        key,
        supplier,
        cityId: shipmentCity(items[0].s),
        lead: items[0].s,
        progress: items[0].progress,
        shipments: items.map((i) => i.s),
        late: items.some((i) => i.s.problem === 'delayed' && !!i.s.problemRevealed),
      };
    });
}

/** Etikett über dem Fahrzeug: "500 g Haze · 62 %", bei mehreren "3 Lieferungen · 62 %" (Stand der vordersten). */
export function convoyLabel(convoy: Pick<Convoy, 'shipments' | 'progress'>): string {
  const percent = `${Math.round(convoy.progress * 100)} %`;
  const [lead] = convoy.shipments;
  if (convoy.shipments.length > 1) return `${convoy.shipments.length} Lieferungen · ${percent}`;
  return `${formatProductAmount(lead.productId, lead.amount)} ${productName(lead.productId)} · ${percent}`;
}

/** Höchstens so viele Lieferungen nennt der Text beim Überfahren mit der Maus einzeln. */
const TITLE_LIST = 3;

/** Text beim Überfahren: "50 g Haze aus Mirko" bzw. "3 Lieferungen aus Mirko: 50 g Haze, 20 g Hasch, …". */
export function convoyTitle(convoy: Pick<Convoy, 'shipments' | 'supplier'>): string {
  const { shipments, supplier } = convoy;
  if (shipments.length === 1) return `${shipmentGoods(shipments[0])} aus ${supplier.name}`;
  const listed = shipments.slice(0, TITLE_LIST).map((s) => shipmentGoods(s));
  const more = shipments.length > TITLE_LIST ? ', …' : '';
  return `${shipments.length} Lieferungen aus ${supplier.name}: ${listed.join(', ')}${more}`;
}
