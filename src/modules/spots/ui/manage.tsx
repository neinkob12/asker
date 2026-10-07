// Auftrag 23: Bekanntheit, Verlegen, Umbenennen und Aufgeben auf der Spot-Seite. Spot gründen über die Karte ist weg
// (Auftrag 46d), der Befehl 'spots.found' bleibt für den Shop-Platzhalter (46e).

import { useState } from 'preact/hooks';
import { formatEuro, formatPercent } from '../../../core';
import {
  ActionSheet,
  Button,
  Group,
  ItemContent,
  List,
  ListItem,
  ProgressBar,
  Sheet,
  TextField,
  useGame,
  useUi,
} from '../../../ui';
import { veedelName } from '../../veedel';
import { getSpot, isSpotActive, MOVE_COST, spotAwareness, spotType } from '../index';

/** Abschnitte der Spot-Seite: Bekanntheit und Verwalten (nur eigene Spots). */
export function SpotManage(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [closing, setClosing] = useState(false);
  const spot = getSpot(state, props.spotId);
  if (!spot || !isSpotActive(state, spot.id)) return null;
  const awareness = spotAwareness(state, spot.id);
  const run = (result: { ok: boolean; reason?: string }, good?: string) => {
    if (!result.ok) ui.toast(result.reason ?? 'Geht nicht.', 'warn');
    else if (good) ui.toast(good, 'good', { urgent: false });
  };
  const move = async () => {
    const pos = await ui.pickLocation(`Wohin soll ${spot.name}? (${formatEuro(MOVE_COST)})`);
    if (pos)
      run(dispatch({ type: 'spots.move', payload: { spotId: spot.id, lng: pos.lng, lat: pos.lat } }), 'Spot verlegt.');
  };
  return (
    <>
      {spot.custom && (
        <Group title="Bekanntheit" icon="megaphone" color="people" value={formatPercent(awareness)}>
          <List>
            <ListItem>
              <ItemContent
                icon="megaphone"
                color="people"
                title={
                  awareness >= 0.9 ? 'Jeder kennt ihn' : awareness >= 0.5 ? 'Spricht sich rum' : 'Noch kaum bekannt'
                }
                meta="Verkäufe, Stammkunden und Leute vor Ort machen ihn bekannter"
              >
                <ProgressBar value={awareness} tone={awareness < 0.4 ? 'warn' : 'accent'} label="Bekanntheit" />
              </ItemContent>
            </ListItem>
          </List>
        </Group>
      )}
      {spot.custom && (
        <Group title="Spot verwalten" icon="sliders" color="system">
          <List>
            <ListItem
              onClick={() => {
                setNewName(spot.name);
                setRenaming(true);
              }}
            >
              <ItemContent icon="edit" color="system" title="Umbenennen" />
            </ListItem>
            <ListItem onClick={move} value={formatEuro(MOVE_COST)} disabled={state.wallet.dirty < MOVE_COST}>
              <ItemContent icon="route" color="place" title="Verlegen" meta="Ein Teil der Kundschaft kommt mit" />
            </ListItem>
            <ListItem onClick={() => setClosing(true)}>
              <ItemContent icon="trash" color="danger" title="Aufgeben" />
            </ListItem>
          </List>
        </Group>
      )}
      <Sheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Spot umbenennen"
        detents={['medium']}
        action={
          <Button
            variant="primary"
            small
            onClick={() => {
              run(dispatch({ type: 'spots.rename', payload: { spotId: spot.id, name: newName } }));
              setRenaming(false);
            }}
          >
            Fertig
          </Button>
        }
      >
        <TextField label="Name" value={newName} onInput={setNewName} maxLength={40} autoFocus />
      </Sheet>
      <ActionSheet
        open={closing}
        onClose={() => setClosing(false)}
        title={`${spot.name} aufgeben?`}
        message={`${spotType(spot).name} in ${veedelName(spot.veedelId)}. Deine Leute dort werden frei, Stammkunden gehen zum nächsten Spot oder sind weg. Das Geld für die Gründung ist verloren.`}
        actions={[
          {
            label: 'Aufgeben',
            destructive: true,
            onSelect: () => {
              run(dispatch({ type: 'spots.close', payload: { spotId: spot.id } }), 'Spot aufgegeben.');
              ui.closePanel();
            },
          },
        ]}
      />
    </>
  );
}
