// Oberfläche des Fuhrparks (Auftrag 33): Gruppe „Fahrzeuge“ in der Lager-App (eigene Fahrzeuge der aktiven Stadt mit
// Status, Modelle zum Kaufen mit Preis, Kauf und Verkauf mit Rückfrage), Meldungen bei Kauf und Beschlagnahme.
// Die Fahrzeugwahl beim Abholen, Umlagern und in Routen steht in der Logistik.

import { useState } from 'preact/hooks';
import { formatAmount, formatEuro } from '../../../core';
import {
  ActionSheet,
  Button,
  type CategoryColor,
  type ChipSpec,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerSlot,
  useGame,
} from '../../../ui';
import { activeCity, getCity } from '../../city';
import {
  getVehicles,
  isShip,
  VEHICLE_MODELS,
  type Vehicle,
  type VehicleModel,
  type VehicleStatus,
  vehicleModel,
  vehicleName,
  vehiclePrice,
  vehicleStatus,
} from '../index';

const STATUS: Record<VehicleStatus, { label: string; icon: string; color: CategoryColor }> = {
  free: { label: 'frei', icon: 'checkCircle', color: 'money' },
  busy: { label: 'unterwegs', icon: 'route', color: 'goods' },
  seized: { label: 'beschlagnahmt', icon: 'siren', color: 'danger' },
};

/** Eigenschaften eines Modells als Chips: Ladung, Tempo, Auffälligkeit. */
export function modelChips(model: VehicleModel): ChipSpec[] {
  if (model.ship) {
    return [
      { label: formatAmount(model.capacity), icon: 'package', color: 'goods' },
      { label: `${model.ship.kmPerDay} km am Tag`, icon: 'speed', color: 'place' },
      model.checkFactor < 1 && { label: 'unauffällig', icon: 'eye', color: 'money' },
    ].filter(Boolean) as ChipSpec[];
  }
  return [
    { label: formatAmount(model.capacity), icon: 'package', color: 'goods' },
    model.speed !== 1 && {
      label: model.speed > 1 ? 'schnell' : 'langsam',
      icon: 'speed',
      color: model.speed > 1 ? 'money' : 'warn',
    },
    model.checkFactor !== 1 && {
      label: model.checkFactor < 1 ? 'unauffällig' : 'auffällig',
      icon: 'eye',
      color: model.checkFactor < 1 ? 'money' : 'warn',
    },
  ].filter(Boolean) as ChipSpec[];
}

/** Icon eines Modells in Listen. */
function modelIcon(model: VehicleModel | undefined): string {
  if (model?.ship) return 'ship';
  return model?.mapKind === 'courier' ? 'bike' : model?.mapKind === 'car' ? 'car' : 'truck';
}

type Ask = { kind: 'buy'; model: VehicleModel } | { kind: 'sell'; vehicle: Vehicle } | null;

function FleetGroup() {
  const { state, dispatch } = useGame();
  const [ask, setAsk] = useState<Ask>(null);
  const cityId = activeCity(state);
  // Schiffe stehen in der Kunden-App (trade, Hafen), nicht hier.
  const vehicles = getVehicles(state, cityId).filter((v) => !isShip(v));
  // Den Lkw gibt es nur in der Hafen-Phase an einem Ort im Ausland (Auftrag 40).
  const abroad = getCity(cityId)?.abroad === true;
  const models = VEHICLE_MODELS.filter((m) => m.available && !m.ship && (!m.harborOnly || abroad));
  const askPrice = ask?.kind === 'buy' ? vehiclePrice(ask.model, cityId) : 0;
  const sellModel = ask?.kind === 'sell' ? vehicleModel(ask.vehicle.model) : undefined;
  const sellAmount =
    sellModel && ask?.kind === 'sell' ? Math.round(vehiclePrice(sellModel, ask.vehicle.cityId) / 2) : 0;
  return (
    <Group
      title="Fahrzeuge"
      icon="truck"
      color="goods"
      count={vehicles.length}
      note={
        vehicles.length === 0 ? 'Ohne eigenes Fahrzeug fährt das Privatauto, auf Routen höchstens 5 kg.' : undefined
      }
      more="Eigene Fahrzeuge sind schneller oder fallen weniger auf. Fahrten nehmen das kleinste freie, in das die Ware passt, sonst das Privatauto. Fliegt eine Ladung auf, kann die Polizei das Fahrzeug behalten. Gekauft wird mit sauberem Geld."
    >
      {vehicles.length > 0 && (
        <List>
          {vehicles.map((v) => {
            const model = vehicleModel(v.model);
            const status = STATUS[vehicleStatus(v)];
            return (
              <ListItem
                key={v.id}
                onClick={vehicleStatus(v) === 'busy' ? undefined : () => setAsk({ kind: 'sell', vehicle: v })}
              >
                <ItemContent
                  icon={modelIcon(model)}
                  color={vehicleStatus(v) === 'seized' ? 'danger' : 'goods'}
                  title={vehicleName(state, v.id)}
                  tags={[
                    { label: status.label, icon: status.icon, color: status.color },
                    ...(model ? modelChips(model).slice(0, 1) : []),
                  ]}
                />
              </ListItem>
            );
          })}
        </List>
      )}
      <List>
        {models.map((m) => {
          const price = vehiclePrice(m, cityId);
          return (
            <ListItem
              key={m.id}
              aside={
                <Button small disabled={state.wallet.clean < price} onClick={() => setAsk({ kind: 'buy', model: m })}>
                  {formatEuro(price)}
                </Button>
              }
            >
              <ItemContent icon={modelIcon(m)} color="money" title={`${m.name} kaufen`} tags={modelChips(m)} />
            </ListItem>
          );
        })}
      </List>
      <ActionSheet
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={
          ask?.kind === 'buy'
            ? `${ask.model.name} kaufen?`
            : ask?.kind === 'sell'
              ? `${vehicleName(state, ask.vehicle.id)} ${vehicleStatus(ask.vehicle) === 'seized' ? 'abschreiben' : 'verkaufen'}?`
              : ''
        }
        message={
          ask?.kind === 'buy'
            ? `${ask.model.description} Kostet ${formatEuro(askPrice)} sauberes Geld.`
            : ask?.kind === 'sell'
              ? vehicleStatus(ask.vehicle) === 'seized'
                ? 'Die Polizei gibt es nicht zurück.'
                : `Du bekommst ${formatEuro(sellAmount)} sauberes Geld zurück.`
              : undefined
        }
        actions={
          ask?.kind === 'buy'
            ? [
                {
                  label: `Kaufen (${formatEuro(askPrice)})`,
                  icon: 'cart',
                  disabled: state.wallet.clean < askPrice,
                  onSelect: () => {
                    dispatch({ type: 'fleet.buy', payload: { model: ask.model.id } });
                    setAsk(null);
                  },
                },
              ]
            : ask?.kind === 'sell'
              ? [
                  {
                    label:
                      vehicleStatus(ask.vehicle) === 'seized'
                        ? 'Aus der Liste nehmen'
                        : `Verkaufen (${formatEuro(sellAmount)})`,
                    destructive: true,
                    onSelect: () => {
                      dispatch({ type: 'fleet.sell', payload: { vehicleId: ask.vehicle.id } });
                      setAsk(null);
                    },
                  },
                ]
              : []
        }
      />
    </Group>
  );
}

registerSlot('goods.app', { id: 'fleet.vehicles', order: 10, component: FleetGroup });

onGameEvent('fleet.seized', 'fleet.seizedToast', (payload, ui) => {
  ui.toast(`Fahrzeug beschlagnahmt: ${vehicleModel(payload.model)?.name ?? 'Fahrzeug'} ist weg.`, 'bad');
});
