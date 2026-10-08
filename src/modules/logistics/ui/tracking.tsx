// Lieferung live (Look "Glas"): unten links über der Kartenfläche eine Tracking-Karte, solange eine Schiffslieferung
// läuft, Ware am Kai steht oder eine Abholung unterwegs ist. Status als Zeile, darunter der Weg Fluss → Kai → Lager
// in zwei Teilen; am Kai der Gold-Knopf "Fahrer schicken" (logistics.pickup). Die Live-Aktivität in der Island bleibt,
// die Karte ist die Ansicht am Desktop (am Handy-Bildschirm entfällt sie).

import { clock, formatPercent, type GameState } from '../../../core';
import { hourCountdown, Icon, registerSlot, useGame, useIsMobile } from '../../../ui';
import { activeCity, cityName, isPlayerIn, isPlayerTraveling } from '../../city';
import { formatProductAmount, productName, warehousePlace } from '../../goods';
import {
  getSupplier,
  type Shipment,
  shipmentCity,
  shipmentProgress,
  shipmentSupplier,
  shipmentsInTransit,
} from '../../suppliers';
import {
  cargoRisk,
  cargoRiskFrom,
  freeDrivers,
  getCargo,
  getTrips,
  itemsText,
  type PortCargo,
  placeOf,
  playerBusy,
  portRiver,
  reservedCargo,
  type Trip,
  type TripItem,
  tripProgress,
  tripTouchesCity,
} from '../index';

type Stage = 'sea' | 'quay' | 'road';

interface Tracking {
  stage: Stage;
  title: string;
  status: string;
  /** Fluss (0–1) und Straße ins Lager (0–1). */
  sea: number;
  road: number;
  tone: 'info' | 'warn' | 'bad';
  more: number;
  /** Am Kai liegt Ware, die noch keine Fahrt eingeteilt hat: Die Karte bietet „Fahrer schicken“ bzw. „Selbst abholen“. */
  pickup: boolean;
}

function shipTracking(state: GameState, shipment: Shipment): Tracking {
  const progress = shipmentProgress(state, shipment);
  const supplier = shipmentSupplier(state, shipment);
  return {
    stage: 'sea',
    title: `${formatProductAmount(shipment.productId, shipment.amount)} ${productName(shipment.productId)} · ${supplier?.name ?? 'Lieferant'}`,
    status: `Schiff ${portRiver(shipmentCity(shipment)).on} · ${formatPercent(progress)}`,
    sea: progress,
    road: 0,
    tone: shipment.problem === 'delayed' && shipment.problemRevealed ? 'warn' : 'info',
    more: 0,
    pickup: false,
  };
}

/** Ladung nach Ware zusammengefasst: Gramm und Stück werden nie zu einer Zahl addiert. */
export function productTotals(
  items: readonly Pick<TripItem, 'productId' | 'amount'>[],
): Pick<TripItem, 'productId' | 'amount'>[] {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.amount);
  return [...totals].map(([productId, amount]) => ({ productId, amount }));
}

/** quay: Am Kai liegt noch Ware, die man abholen kann (zeigt bei einer wartenden Fahrt den Knopf). */
function roadTracking(state: GameState, trip: Trip, quay: boolean): Tracking {
  const progress = tripProgress(state, trip);
  const to = placeOf(state, trip.toId)?.name ?? 'Lager';
  const stopped = trip.status === 'stopped';
  // Am vollen Lager (Auftrag 33) steht die Fahrt im Hof, bis Platz ist; der Kai ist frei für die nächste Abholung.
  const waiting = trip.status === 'waiting';
  const who = trip.driverId ? 'Fahrer fährt' : 'Du fährst';
  const status = stopped
    ? 'Verkehrskontrolle! Die Fahrt steht.'
    : waiting
      ? `${to} ist voll · ${quay ? 'am Kai wartet noch Ware' : 'die Fahrt wartet auf Platz'}`
      : progress.leg === 'toPickup'
        ? `${who} zum Hafen · ${formatPercent(progress.total)}`
        : progress.leg === 'loading'
          ? `Am Kai wird geladen · ${formatPercent(progress.total)}`
          : `${who} ${warehousePlace(to, 'into')} · ${formatPercent(progress.total)}`;
  return {
    stage: 'road',
    title: `${itemsText(productTotals(trip.items))} · Abholung`,
    status,
    sea: 1,
    road: progress.leg === 'delivering' || progress.leg === 'stopped' ? progress.t : 0,
    tone: stopped ? 'bad' : waiting ? 'warn' : 'info',
    more: 0,
    pickup: waiting && quay,
  };
}

/**
 * Ware am Kai. night: Die Container hat eine geplante Nachtfahrt schon eingeteilt, dann gibt es nichts abzuholen, die
 * Karte nennt die Abfahrt.
 */
function quayTracking(state: GameState, cargo: readonly PortCargo[], night: Trip | undefined): Tracking {
  const c = cargo[0];
  const risky = cargoRisk(state, c) === 'risky';
  const amount = cargo.filter((x) => x.productId === c.productId).reduce((sum, x) => sum + x.amount, 0);
  const customs = risky
    ? 'der Zoll kann sie jederzeit finden'
    : `Zoll in ${hourCountdown(cargoRiskFrom(c, state) - state.time)}`;
  return {
    stage: 'quay',
    title: `${formatProductAmount(c.productId, amount)} ${productName(c.productId)} · ${getSupplier(state, c.supplierId)?.name ?? 'Lieferant'}`,
    status: night ? `Am Kai · Nachtfahrt um ${clock.formatTime(night.startedAt)} · ${customs}` : `Am Kai · ${customs}`,
    sea: 1,
    road: 0,
    tone: risky ? 'bad' : 'warn',
    more: 0,
    pickup: !night,
  };
}

/** Was die Karte zeigt: die am weitesten fortgeschrittene Hafenlieferung (Straße vor Kai vor Fluss). */
export function currentTracking(state: GameState): Tracking | null {
  // Während deiner Fahrt zwischen den Städten gehört die Stelle der Reisekarte (city): Die Lieferungs-Karte läge sonst
  // über „Fahrt überspringen“. Selbst abholen geht unterwegs ohnehin nicht, die Hafen-Seite im Handy bleibt.
  if (isPlayerTraveling(state)) return null;
  // Nur die Stadt, in der du spielst (Auftrag 43): Schiffe für eine andere Stadt sind Sache ihres Statthalters.
  const here = activeCity(state);
  // Abholungen nach ihrer Art, nicht nach dem Abholort: Hamburg holt am 'port:hamburg' ab, und eine umgeleitete
  // Abholung fährt von einem Lager los.
  const pickups = getTrips(state).filter(
    (t) => t.kind === 'pickup' && t.status !== 'planned' && tripTouchesCity(state, t, here),
  );
  const cargo = getCargo(state, here);
  // Was eine Nachtfahrt schon eingeteilt hat, holt sie bei der Abfahrt; abholen kann man nur den Rest.
  const reserved = reservedCargo(state);
  const free = cargo.filter((c) => !reserved.has(c.id));
  const ships = shipmentsInTransit(state, here).filter((s) => shipmentSupplier(state, s)?.kind === 'port');
  const total = pickups.length + cargo.length + ships.length;
  let tracking: Tracking | null = null;
  if (pickups.length > 0) tracking = roadTracking(state, pickups[0], free.length > 0);
  else if (free.length > 0) tracking = quayTracking(state, free, undefined);
  else if (cargo.length > 0) {
    const night = getTrips(state).find((t) => t.status === 'planned' && t.cargoIds?.includes(cargo[0].id));
    tracking = quayTracking(state, cargo, night);
  } else if (ships.length > 0) {
    tracking = ships.map((s) => shipTracking(state, s)).sort((a, b) => b.sea - a.sea)[0];
  }
  if (tracking) tracking.more = total - 1;
  return tracking;
}

/**
 * Warum du die Ware am Kai nicht selbst holen kannst, wenn kein Fahrer frei ist (null: du kannst). Bist du in einer
 * anderen Stadt, nennt der Satz einen Weg, der geht: playerBusy rät dort zum Fahrer, den es gerade nicht gibt.
 */
export function selfPickupBlocked(state: GameState, cityId: string): string | null {
  const busy = playerBusy(state, cityId);
  if (!busy || isPlayerTraveling(state) || isPlayerIn(state, cityId)) return busy;
  return `Du bist nicht in ${cityName(cityId)}. Fahr hin oder heuer dort einen Fahrer an.`;
}

function TrackingCard() {
  const { state, dispatch } = useGame();
  const mobile = useIsMobile();
  const tracking = mobile ? null : currentTracking(state);
  if (!tracking) return null;
  const drivers = freeDrivers(state).length;
  // Selbst abholen nur, wenn du hier bist und frei (Auftrag 43, M8); der Grund steht sichtbar unter dem Knopf.
  const blocked = drivers === 0 ? selfPickupBlocked(state, activeCity(state)) : null;
  return (
    <section class={`logi-track is-${tracking.stage} is-${tracking.tone}`} aria-label="Lieferung live">
      <header class="logi-track__head">
        <span class="logi-track__tile">
          <Icon name={tracking.stage === 'road' ? 'truck' : 'ship'} strokeWidth={2} />
        </span>
        <span class="logi-track__text">
          <span class="logi-track__label">Lieferung live{tracking.more > 0 ? ` · +${tracking.more}` : ''}</span>
          <strong>{tracking.title}</strong>
          <span class="logi-track__status">{tracking.status}</span>
        </span>
      </header>
      <div class="logi-track__way" aria-hidden="true">
        <span class="logi-track__part">
          <span style={{ width: `${Math.round(tracking.sea * 100)}%` }} />
        </span>
        <span class={`logi-track__dot ${tracking.sea >= 1 ? 'is-on' : ''}`} />
        <span class="logi-track__part is-road">
          <span style={{ width: `${Math.round(tracking.road * 100)}%` }} />
        </span>
      </div>
      <div class="logi-track__legend" aria-hidden="true">
        <span>{portRiver(activeCity(state)).name}</span>
        <span>Kai</span>
        <span>Lager</span>
      </div>
      {tracking.pickup && (
        <button
          type="button"
          class="logi-track__action"
          disabled={!!blocked}
          title={blocked ?? undefined}
          onClick={() =>
            dispatch({ type: 'logistics.pickup', payload: drivers > 0 ? { by: 'driver' } : { by: 'player' } })
          }
        >
          {drivers > 0 ? 'Fahrer schicken' : 'Selbst abholen'}
        </button>
      )}
      {tracking.pickup && blocked && <p class="logi-track__note">{blocked}</p>}
    </section>
  );
}

registerSlot('map.overlay', { id: 'logistics.tracking', order: 30, component: TrackingCard });
