// Oberfläche der Veedel: das Veedel-Panel (öffnet sich beim Klick auf ein Veedel auf der Karte).
// Das Panel hat den Slot 'veedel.veedelPanel', in den andere Module Abschnitte hängen (Revier, Polizei …).

import { formatEuro, formatPercent } from '../../../core';
import { Group, ItemContent, List, ListItem, registerPanel, registerSearch, Slot, useGame, useUi } from '../../../ui';
import { activeCity } from '../../city';
import { waitingAt } from '../../customers';
import { getSpots, lockedSpots } from '../../spots';
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

/**
 * Veedel-Seite: kurze Beschreibung, die Eckdaten als Zeilen mit Wert rechts, dann die Abschnitte der anderen Module
 * (Revier, Polizei, Leutnant), die Spots im Veedel und die Nachbarn zum Weitertippen.
 */
function VeedelPanel(props: { veedelId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const veedel = getVeedel(props.veedelId);
  if (!veedel) return null;
  const spots = getSpots(state).filter((s) => s.veedelId === veedel.id);
  // Spots, die du noch freischalten kannst: Ohne sie sähe ein Veedel ohne eigenen Spot leer aus, obwohl dort zwei
  // zu haben sind (der Kauf ginge sonst nur über graue Marker oder die Suche).
  const locked = lockedSpots(state).filter((s) => s.veedelId === veedel.id);
  const link = (id: string) =>
    veedelLinks().find((l) => (l.a === veedel.id && l.b === id) || (l.b === veedel.id && l.a === id));
  return (
    <div class="veedel-panel">
      <p class="veedel-panel__description">{veedel.description}</p>
      <Group title="Veedel" icon="map" color="place">
        <List>
          <ListItem value={veedel.district}>
            <ItemContent icon="building" color="place" title="Bezirk" />
          </ListItem>
          <ListItem value={relative(veedel.purchasingPower)}>
            <ItemContent icon="wallet" color="money" title="Kaufkraft" meta={formatPercent(veedel.purchasingPower)} />
          </ListItem>
          <ListItem value={relative(veedel.density)}>
            <ItemContent icon="users" color="people" title="Nachfrage" meta={formatPercent(veedel.density)} />
          </ListItem>
          <ListItem value={relative(veedel.policePresence)}>
            <ItemContent icon="siren" color="law" title="Polizei" meta={formatPercent(veedel.policePresence)} />
          </ListItem>
        </List>
      </Group>
      <Slot name="veedel.veedelPanel" props={{ veedelId: veedel.id }} />
      <Group title="Spots" icon="pin" color="place" count={spots.length}>
        <List>
          {spots.length + locked.length === 0 && (
            <ListItem>
              <ItemContent
                icon="pin"
                color="system"
                title="Noch kein Spot"
                meta="Eigene Spots gründest du unter Reviere › Spots."
              />
            </ListItem>
          )}
          {spots.map((s) => (
            <ListItem
              key={s.id}
              onClick={() => ui.openPanel('spots.spot', { spotId: s.id })}
              value={`${waitingAt(state, s.id).length} warten`}
            >
              <ItemContent icon="pin" color="place" title={s.name} />
            </ListItem>
          ))}
          {locked.map((s) => (
            <ListItem
              key={s.id}
              onClick={() => ui.openPanel('spots.spot', { spotId: s.id })}
              value={formatEuro(s.unlockCost ?? 0)}
            >
              <ItemContent
                icon="lock"
                color="system"
                title={s.name}
                tags={[{ label: 'zum Freischalten', icon: 'lock', color: 'brand' }]}
              />
            </ListItem>
          ))}
        </List>
      </Group>
      <Group title="Nachbarn" icon="route" color="place">
        <List>
          {neighborsOf(veedel.id).map((id) => (
            <ListItem key={id} onClick={() => ui.openPanel('veedel.veedel', { veedelId: id })}>
              <ItemContent
                icon={sharesBorder(veedel.id, id) ? 'map' : 'bridge'}
                color="place"
                title={veedelName(id)}
                // Die Daten bringen die Präposition mit („über …“, „durch …“), Auftrag 43, L4: es stand „über über …“.
                meta={sharesBorder(veedel.id, id) ? 'gemeinsame Grenze' : (link(id)?.via ?? 'über eine Verbindung')}
              />
            </ListItem>
          ))}
        </List>
      </Group>
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
  // Nur die Veedel der Stadt, in der du bist (Auftrag 43).
  items: (state) =>
    allVeedel(activeCity(state)).map((v) => ({
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
