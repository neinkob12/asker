// Größe deines Geschäfts aus Sicht der Polizei: Kleindealer, Händler, Großhändler (mit Hysterese).
// Gerechnet aus kontrollierten Veedeln, Spots, Leuten im Einsatz, Leutnants, Lagern, Liegeplatz und dem Umsatz pro Tag
// (Schnitt über die letzten bis zu 7 vollen Tage aus der Kasse). Die Stufe bestimmt, wie hart die Polizei durchgreift
// (index.ts).

import type { GameState } from '../../core';
import { activeCity } from '../city';
import { playerSpot } from '../customers';
import { cityReport, currentDay } from '../finance';
import { getWarehouses } from '../goods';
import { getLieutenantIds } from '../hierarchy';
import { hasBerth } from '../logistics';
import { getSpots } from '../spots';
import { getStaff, getStaffMember, runnerAt } from '../staff';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { veedelCity } from '../veedel';
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

/** Zahlen deines Geschäfts in einer Stadt (Standard: die aktive; Auftrag 30). */
export function operationFacts(state: GameState, cityId: string = activeCity(state)): OperationFacts {
  // Nur volle Tage zählen: Der angefangene Tag würde den Schnitt drücken (früh am Tag fast um die Hälfte). Erst am
  // ersten Spieltag gibt es noch keinen vollen, dann zählt der laufende.
  const full = Math.min(7, currentDay(state) - 1);
  const days = Math.max(1, full);
  const report = cityReport(state, cityId, days, full >= 1 ? 1 : 0);
  const sales = report.rows.filter((r) => r.category.startsWith('sales.')).reduce((sum, r) => sum + r.amount, 0);
  return {
    veedel: controlledBy(state, PLAYER_FACTION).filter((id) => veedelCity(id) === cityId).length,
    spots: getSpots(state, cityId).filter((s) => runnerAt(state, s.id) || playerSpot(state) === s.id).length,
    people: getStaff(state, { status: 'active', cityId }).filter((m) => m.assignment).length,
    lieutenants: getLieutenantIds(state).filter((id) => getStaffMember(state, id)?.cityId === cityId).length,
    warehouses: getWarehouses(state, cityId).length,
    berth: hasBerth(state, cityId),
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
    f.veedel >= DEALER_DOWN.veedel ||
    f.spots >= DEALER_DOWN.spots ||
    f.people >= DEALER_DOWN.people ||
    f.lieutenants >= DEALER_DOWN.lieutenants ||
    f.berth ||
    f.warehouses >= DEALER_DOWN.warehouses ||
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

/** Ein Teil einer Bedingung mit Stand, z.B. "2/6 Veedel", und ob er schon erfüllt ist. */
export interface TierHintPart {
  label: string;
  met: boolean;
}

/** Eine Bedingung für die nächste Stufe: kurz gesagt, was es braucht, dazu der Stand in Teilen (am Handy als Chips). */
export interface TierHint {
  label: string;
  parts: TierHintPart[];
}

/** "2/6 Veedel" mit erfüllt, sobald der Stand das Ziel erreicht. */
function part(now: number, target: number, what: string): TierHintPart {
  return { label: `${now}/${target} ${what}`, met: now >= target };
}

/** Was zur nächsten Stufe führt (für das Polizei-Panel): Bedingungen mit Stand, jede reicht allein. */
export function nextTierHints(state: GameState, tier: number, cityId: string = activeCity(state)): TierHint[] {
  const f = operationFacts(state, cityId);
  const berth: TierHintPart = { label: f.berth ? 'Liegeplatz' : 'kein Liegeplatz', met: f.berth };
  if (tier === 0) {
    return [
      { label: 'ein eigenes Veedel', parts: [part(f.veedel, DEALER_UP.veedel, 'Veedel')] },
      { label: `${DEALER_UP.spots} besetzte Spots`, parts: [part(f.spots, DEALER_UP.spots, 'Spots')] },
      { label: `${DEALER_UP.people} Leute im Einsatz`, parts: [part(f.people, DEALER_UP.people, 'Leute')] },
      { label: 'ein Leutnant', parts: [part(f.lieutenants, DEALER_UP.lieutenants, 'Leutnant')] },
      {
        label: 'Liegeplatz oder zweites Lager',
        parts: [berth, part(f.warehouses, DEALER_UP.warehouses, 'Lager')],
      },
      {
        label: `${DEALER_UP.revenue.toLocaleString('de-DE')} € Umsatz am Tag`,
        parts: [{ label: `${f.revenue.toLocaleString('de-DE')} € am Tag`, met: f.revenue >= DEALER_UP.revenue }],
      },
    ];
  }
  if (tier === 1) {
    return [
      {
        label: `${KINGPIN_UP_VEEDEL} Veedel, ${KINGPIN_MIN_PEOPLE} Leute im Einsatz`,
        parts: [part(f.veedel, KINGPIN_UP_VEEDEL, 'Veedel'), part(f.people, KINGPIN_MIN_PEOPLE, 'Leute')],
      },
      {
        label: `${KINGPIN_UP_SPOTS} Spots, Liegeplatz, ${KINGPIN_UP_WAREHOUSES} Lager`,
        parts: [part(f.spots, KINGPIN_UP_SPOTS, 'Spots'), berth, part(f.warehouses, KINGPIN_UP_WAREHOUSES, 'Lager')],
      },
    ];
  }
  return [];
}
