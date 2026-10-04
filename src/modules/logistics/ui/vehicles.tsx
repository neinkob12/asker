// Fahrzeug- und Streckenwahl für Fahrten (Auftrag 33): Auswahl "Passendes Fahrzeug" (das kleinste freie, in das die
// Ware passt), "Privatauto" oder ein eigenes freies Fahrzeug der Stadt; dazu Autobahn, Landstraße oder nachts als
// Segmente mit einem Satz darunter.

import { formatAmount, type GameState } from '../../../core';
import { SegmentedControl, Select } from '../../../ui';
import { freeVehicles, getVehicles, PRIVATE_CAR, vehicleName, vehicleSpec } from '../../fleet';
import { ROUTE_CHOICE_ORDER, ROUTE_CHOICES, type RouteChoice, type VehicleChoice } from '../index';

export const AUTO = '';

/** Text aus dem Select in die Fahrzeugwahl der Payload (leer = passendes). */
export function vehicleChoice(value: string): VehicleChoice | undefined {
  if (value === AUTO) return undefined;
  if (value === 'private') return 'private';
  return Number(value);
}

/** Auswahl nur zeigen, wenn es in der Stadt eigene Fahrzeuge gibt (sonst fährt immer das Privatauto). */
export function VehicleSelect(props: {
  state: GameState;
  cityId: string;
  value: string;
  onChange: (value: string) => void;
  /** Bei Routen: auch Fahrzeuge, die gerade unterwegs sind (fest eingeteilt). */
  all?: boolean;
  label?: string;
}) {
  const vehicles = props.all
    ? getVehicles(props.state).filter((v) => v.seizedAt === null)
    : freeVehicles(props.state, props.cityId);
  if (getVehicles(props.state).length === 0) return null;
  const options = [
    { value: AUTO, label: 'Passendes Fahrzeug' },
    ...(props.all ? [] : [{ value: 'private', label: `${PRIVATE_CAR.name} (${formatAmount(PRIVATE_CAR.capacity)})` }]),
    ...vehicles.map((v) => ({
      value: String(v.id),
      label: `${vehicleName(props.state, v.id)} (${formatAmount(vehicleSpec(props.state, v.id).capacity)})`,
    })),
  ];
  const value = options.some((o) => o.value === props.value) ? props.value : AUTO;
  return <Select label={props.label ?? 'Fahrzeug'} wide value={value} options={options} onChange={props.onChange} />;
}

/** Autobahn, Landstraße oder nachts, mit dem Satz zur gewählten Strecke. */
export function ChoiceControl(props: { value: RouteChoice; onChange: (value: RouteChoice) => void }) {
  return (
    <div class="logi-choice">
      <SegmentedControl
        wide
        aria-label="Strecke"
        value={props.value}
        options={ROUTE_CHOICE_ORDER.map((id) => ({ value: id, label: ROUTE_CHOICES[id].name }))}
        onChange={props.onChange}
      />
      <span class="ui-hint">{ROUTE_CHOICES[props.value].hint}</span>
    </div>
  );
}
