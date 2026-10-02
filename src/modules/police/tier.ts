// Größe deines Geschäfts aus Sicht der Polizei: Kleindealer, Händler, Großhändler (mit Hysterese).
// Gerechnet aus kontrollierten Veedeln, Spots, Leuten im Einsatz, Leutnants, Lagern, Liegeplatz und dem Umsatz pro Tag
// (Schnitt über die letzten bis zu 7 vollen Tage aus der Kasse). Die Stufe bestimmt, wie hart die Polizei durchgreift
// (index.ts).

import type { GameState } from '../../core';
import { playerSpot } from '../customers';
import { currentDay, periodReport } from '../finance';
import { getWarehouses } from '../goods';
import { getLieutenantIds } from '../hierarchy';
import { hasBerth } from '../logistics';
import { getSpots } from '../spots';
import { getStaff, runnerAt } from '../staff';
import { controlledBy, PLAYER_FACTION } from '../territory';
import {
  DEALER_DOWN,
  DEALER_UP,
  KINGPIN_DOWN_SPOTS,
  KINGPIN_DOWN_VEEDEL,
  KINGPIN_MIN_PEOPLE,
  KINGPIN_UP_SPOTS,
  KINGPIN_UP_VEEDEL,
  KINGPIN_UP_WAREHOUSES,
  OPERATION_TIERS,
} from './config';

export type OperationTierId = (typeof OPERATION_TIERS)[number]['id'];

export interface OperationFacts {
  /** Kontrollierte Veedel. */
  veedel: number;
  /** Spots, an denen jemand für dich arbeitet (Läufer, auch wenn er gerade ausfällt) oder du selbst stehst. */
  spots: number;
  /** Leute im Einsatz (aktiv, mit Einsatz). */
  people: number;
  lieutenants: number;
  /** Eigene Lager. */
  warehouses: number;
  berth: boolean;
  /** Umsatz pro Tag, Schnitt über die letzten (bis zu 7) vollen Tage. */
  revenue: number;
}

export interface OperationTier {
  /** 0 Kleindealer, 1 Händler, 2 Großhändler. */
  index: number;
  id: OperationTierId;
  name: string;
  hint: string;
}

export function operationFacts(state: GameState): OperationFacts {
  // Nur volle Tage zählen: Der angefangene Tag würde den Schnitt drücken (früh am Tag fast um die Hälfte). Erst am
  // ersten Spieltag gibt es noch keinen vollen, dann zählt der laufende.
  const full = Math.min(7, currentDay(state) - 1);
  const days = Math.max(1, full);
  const report = periodReport(state, days, full >= 1 ? 1 : 0);
  const sales = report.rows.filter((r) => r.category.startsWith('sales.')).reduce((sum, r) => sum + r.amount, 0);
  return {
    veedel: controlledBy(state, PLAYER_FACTION).length,
    spots: getSpots(state).filter((s) => runnerAt(state, s.id) || playerSpot(state) === s.id).length,
    people: getStaff(state, { status: 'active' }).filter((m) => m.assignment).length,
    lieutenants: getLieutenantIds(state).length,
    warehouses: getWarehouses(state).length,
    berth: hasBerth(state),
    revenue: Math.round(sales / Math.max(1, days)),
  };
}

function isKingpinUp(f: OperationFacts): boolean {
  return (
    (f.veedel >= KINGPIN_UP_VEEDEL && f.people >= KINGPIN_MIN_PEOPLE) ||
    (f.spots >= KINGPIN_UP_SPOTS && f.berth && f.warehouses >= KINGPIN_UP_WAREHOUSES)
  );
}

function isKingpinStill(f: OperationFacts): boolean {
  return (
    (f.veedel >= KINGPIN_DOWN_VEEDEL && f.people >= KINGPIN_MIN_PEOPLE - 1) ||
    (f.spots >= KINGPIN_DOWN_SPOTS && f.berth && f.warehouses >= KINGPIN_UP_WAREHOUSES)
  );
}

function isDealerUp(f: OperationFacts): boolean {
  return (
    f.veedel >= DEALER_UP.veedel ||
    f.spots >= DEALER_UP.spots ||
    f.people >= DEALER_UP.people ||
    f.lieutenants >= DEALER_UP.lieutenants ||
    f.berth ||
    f.warehouses >= DEALER_UP.warehouses ||
    f.revenue >= DEALER_UP.revenue
  );
}

function isDealerStill(f: OperationFacts): boolean {
  return (
    f.veedel > DEALER_DOWN.veedel ||
    f.spots > DEALER_DOWN.spots ||
    f.people > DEALER_DOWN.people ||
    f.lieutenants > DEALER_DOWN.lieutenants ||
    f.berth ||
    f.warehouses > DEALER_DOWN.warehouses ||
    f.revenue >= DEALER_DOWN.revenue
  );
}

/** Neue Stufe aus den Zahlen und der bisherigen Stufe (Hysterese: hoch bei "up", runter erst unter "down"). */
export function nextTier(facts: OperationFacts, current: number): number {
  if (isKingpinUp(facts)) return 2;
  if (current >= 2 && isKingpinStill(facts)) return 2;
  if (isDealerUp(facts)) return 1;
  if (current >= 1 && isDealerStill(facts)) return 1;
  return 0;
}

export function tierInfo(index: number): OperationTier {
  const i = Math.max(0, Math.min(OPERATION_TIERS.length - 1, index));
  const t = OPERATION_TIERS[i];
  return { index: i, id: t.id, name: t.name, hint: t.hint };
}

/** Was zur nächsten Stufe führt (für das Polizei-Panel): Bedingungen mit Stand, jede reicht allein. */
export function nextTierHints(state: GameState, tier: number): { label: string; value: string }[] {
  const f = operationFacts(state);
  if (tier === 0) {
    return [
      { label: 'ein Veedel unter deiner Kontrolle', value: `${f.veedel} von ${DEALER_UP.veedel}` },
      { label: `${DEALER_UP.spots} besetzte Spots`, value: `${f.spots} von ${DEALER_UP.spots}` },
      { label: `${DEALER_UP.people} Leute im Einsatz`, value: `${f.people} von ${DEALER_UP.people}` },
      { label: 'ein Leutnant', value: `${f.lieutenants} von ${DEALER_UP.lieutenants}` },
      { label: 'Liegeplatz oder zweites Lager', value: f.berth ? 'ja' : `${f.warehouses} Lager` },
      {
        label: `${DEALER_UP.revenue.toLocaleString('de-DE')} € Umsatz am Tag`,
        value: `${f.revenue.toLocaleString('de-DE')} €`,
      },
    ];
  }
  if (tier === 1) {
    return [
      {
        label: `${KINGPIN_UP_VEEDEL} Veedel unter deiner Kontrolle und ${KINGPIN_MIN_PEOPLE} Leute im Einsatz`,
        value: `${f.veedel} Veedel, ${f.people} Leute`,
      },
      {
        label: `${KINGPIN_UP_SPOTS} Spots plus Liegeplatz und ${KINGPIN_UP_WAREHOUSES} Lager`,
        value: `${f.spots} Spots, ${f.berth ? 'Liegeplatz' : 'kein Liegeplatz'}, ${f.warehouses} Lager`,
      },
    ];
  }
  return [];
}
