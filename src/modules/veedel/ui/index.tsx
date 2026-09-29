// Oberfläche der Veedel: das Veedel-Panel (öffnet sich beim Klick auf ein Veedel auf der Karte).
// Das Panel hat den Slot 'veedel.veedelPanel', in den andere Module Abschnitte hängen (Revier, Polizei …).

import { formatPercent } from '../../../core';
import { Button, Card, KeyValue, registerPanel, registerSearch, Slot, useGame, useUi } from '../../../ui';
import { getSpots } from '../../spots';
import { allVeedel, getVeedel, neighborsOf, sharesBorder, veedelLinks, veedelName } from '../index';
import './veedel.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'veedel.veedel': { veedelId: string };
  }
  interface SlotRegistry {
    /** Abschnitte im Veedel-Panel. */
    'veedel.veedelPanel': { veedelId: string };
  }
}

/** Wert relativ zum Kölner Schnitt als Wort, z.B. für Kaufkraft. */
function relative(value: number): string {
  if (value >= 1.25) return 'sehr hoch';
  if (value >= 1.08) return 'hoch';
  if (value > 0.92) return 'mittel';
  if (value > 0.75) return 'niedrig';
  return 'sehr niedrig';
}

function VeedelPanel(props: { veedelId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const veedel = getVeedel(props.veedelId);
  if (!veedel) return null;
  const spots = getSpots(state).filter((s) => s.veedelId === veedel.id);
  const link = (id: string) =>
    veedelLinks().find((l) => (l.a === veedel.id && l.b === id) || (l.b === veedel.id && l.a === id));
  return (
    <div class="veedel-panel">
      <p class="veedel-panel__description">{veedel.description}</p>
      <Card>
        <KeyValue label="Bezirk" value={veedel.district} />
        <KeyValue
          label="Kaufkraft"
          value={`${relative(veedel.purchasingPower)} (${formatPercent(veedel.purchasingPower)})`}
        />
        <KeyValue label="Nachfrage" value={`${relative(veedel.density)} (${formatPercent(veedel.density)})`} />
        <KeyValue
          label="Polizeipräsenz"
          value={`${relative(veedel.policePresence)} (${formatPercent(veedel.policePresence)})`}
        />
      </Card>
      <Slot name="veedel.veedelPanel" props={{ veedelId: veedel.id }} />
      <Card title="Spots">
        {spots.length === 0 ? (
          <p class="ui-hint">Hier gibt es noch keinen Spot.</p>
        ) : (
          <div class="veedel-panel__links">
            {spots.map((s) => (
              <Button key={s.id} small onClick={() => ui.openPanel('spots.spot', { spotId: s.id })}>
                {s.name}
              </Button>
            ))}
          </div>
        )}
      </Card>
      <Card title="Nachbarn">
        <div class="veedel-panel__links">
          {neighborsOf(veedel.id).map((id) => (
            <Button
              key={id}
              small
              variant="subtle"
              title={sharesBorder(veedel.id, id) ? 'gemeinsame Grenze' : link(id)?.via}
              onClick={() => ui.openPanel('veedel.veedel', { veedelId: id })}
            >
              {veedelName(id)}
              {sharesBorder(veedel.id, id) ? '' : ' ↝'}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

registerPanel({
  id: 'veedel.veedel',
  title: (props) => veedelName(props.veedelId),
  component: VeedelPanel,
});

registerSearch({
  id: 'veedel.search',
  label: 'Veedel',
  order: 20,
  items: () =>
    allVeedel().map((v) => ({
      id: v.id,
      title: v.name,
      subtitle: v.district,
      icon: 'map',
      run: (ui) => {
        ui.flyTo(v.center, 14.5);
        ui.openPanel('veedel.veedel', { veedelId: v.id });
      },
    })),
});
