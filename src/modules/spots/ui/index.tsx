// Oberfläche der Spots: Marker auf der Karte und das Spot-Panel.
// Das Panel hat den Slot 'spots.spotPanel', in den andere Module Abschnitte hängen (Kunden, Läufer …).

import { registerPanel, Slot, useGame } from '../../../ui';
import { getSpot } from '../index';
import { spotsLayer } from './map';
import './spots.css';
import { formatPercent } from '../../../core';
import { registerMapLayer } from '../../../map';
import { veedelName } from '../../veedel';

declare module '../../../ui' {
  interface PanelRegistry {
    'spots.spot': { spotId: string };
  }
  interface SlotRegistry {
    /** Abschnitte im Spot-Panel. */
    'spots.spotPanel': { spotId: string };
  }
}

function SpotPanel(props: { spotId: string }) {
  const { state } = useGame();
  const spot = getSpot(state, props.spotId);
  if (!spot) return null;
  return (
    <div class="spot-panel">
      <p class="ui-hint">
        {veedelName(spot.veedelId)} · Preisniveau {formatPercent(spot.priceMultiplier)}, Andrang{' '}
        {formatPercent(spot.demand)}
      </p>
      <Slot name="spots.spotPanel" props={{ spotId: spot.id }} />
    </div>
  );
}

registerPanel({
  id: 'spots.spot',
  title: (props, state) => getSpot(state, props.spotId)?.name ?? 'Spot',
  component: SpotPanel,
});

registerMapLayer(spotsLayer);
