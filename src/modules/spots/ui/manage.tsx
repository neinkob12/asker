// Auftrag 23: Spot gründen mit Art-Auswahl (Blatt nach dem Klick auf die Karte), Bekanntheit, Ausbau, Verlegen,
// Umbenennen und Aufgeben auf der Spot-Seite.

import { useState } from 'preact/hooks';
import { formatEuro, formatPercent } from '../../../core';
import {
  ActionSheet,
  Button,
  Disclosure,
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
import { getVeedel, veedelName } from '../../veedel';
import {
  CUSTOM_SPOT_DEMAND,
  canFoundSpotAt,
  getSpot,
  isSpotActive,
  MOVE_COST,
  SPOT_KINDS,
  SPOT_TYPES,
  SPOT_UPGRADE_IDS,
  SPOT_UPGRADES,
  type SpotKind,
  spotAwareness,
  spotHoursLabel,
  spotType,
  spotUpgrades,
} from '../index';

/** Andrang eines neuen Spots dieser Art im Veedel (wie spots.found ihn setzt, als Prozent von normal). */
function expectedDemand(kind: SpotKind, veedelId: string): number {
  return CUSTOM_SPOT_DEMAND * SPOT_TYPES[kind].demand * (getVeedel(veedelId)?.density ?? 1);
}

/** Blatt nach dem Klick auf die Karte: Art wählen, Name optional, bestätigen. */
export function FoundSheet(props: {
  at: { lng: number; lat: number } | null;
  onClose: () => void;
  onFounded: (spotId: string) => void;
}) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [kind, setKind] = useState<SpotKind>('corner');
  const [name, setName] = useState('');
  const at = props.at;
  const check = at ? canFoundSpotAt(state, at.lng, at.lat) : null;
  const veedelId = check?.ok ? check.veedelId : null;
  const type = SPOT_TYPES[kind];
  const found = () => {
    if (!at) return;
    const r = dispatch({
      type: 'spots.found',
      payload: { lng: at.lng, lat: at.lat, kind, name: name.trim() || undefined },
    });
    if (!r.ok) {
      ui.toast(r.reason, 'warn');
      return;
    }
    setName('');
    props.onFounded((r.data as { spotId: string }).spotId);
  };
  return (
    <Sheet
      open={!!at}
      onClose={props.onClose}
      title={veedelId ? `Neuer Spot in ${veedelName(veedelId)}` : 'Neuer Spot'}
      detents={['large']}
      action={
        <Button variant="primary" small disabled={!veedelId || state.wallet.dirty < type.foundCost} onClick={found}>
          Gründen
        </Button>
      }
    >
      {check && !check.ok ? (
        <p class="spot-found__error">{check.reason}</p>
      ) : (
        <>
          <Group title="Was für ein Spot?" icon="pinPlus" color="place">
            <List>
              {SPOT_KINDS.filter((k) => SPOT_TYPES[k].foundable).map((k) => {
                const t = SPOT_TYPES[k];
                const hours = spotHoursLabel({ kind: k, custom: true });
                const heat = t.heatFactor > 1.05 ? 'viel Heat' : t.heatFactor < 0.95 ? 'wenig Heat' : null;
                return (
                  <ListItem
                    key={k}
                    active={k === kind}
                    onClick={() => setKind(k)}
                    value={formatEuro(t.foundCost)}
                    disabled={state.wallet.dirty < t.foundCost}
                  >
                    <ItemContent
                      icon={t.icon}
                      color={k === kind ? 'brand' : 'place'}
                      title={t.name}
                      tags={[
                        !!veedelId && {
                          label: `Andrang ${formatPercent(expectedDemand(k, veedelId))}`,
                          icon: 'users',
                          color: 'people',
                        },
                        { label: hours ?? 'immer offen', icon: 'clock', color: 'system' },
                        heat && { label: heat, icon: 'flame', color: t.heatFactor > 1 ? 'danger' : 'money' },
                      ]}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Group>
          <p class="spot-found__hint">{type.description}</p>
          <TextField label="Name (optional)" value={name} onInput={setName} maxLength={40} onSubmit={found} />
          <Disclosure label="Wie läuft ein neuer Spot an?" icon="info">
            Am Anfang kennt den Spot kaum jemand: Es kommen weniger Kunden. Verkäufe, Stammkunden und Tage mit deinen
            Leuten dort sprechen sich herum. Steht dort tagelang niemand, gerät er wieder in Vergessenheit.
          </Disclosure>
        </>
      )}
    </Sheet>
  );
}

/** Abschnitte der Spot-Seite: Bekanntheit (eigene Spots), Ausbau, Verwalten (eigene Spots). */
export function SpotManage(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [closing, setClosing] = useState(false);
  const spot = getSpot(state, props.spotId);
  if (!spot || !isSpotActive(state, spot.id)) return null;
  const awareness = spotAwareness(state, spot.id);
  const owned = spotUpgrades(state, spot.id);
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
      <Group title="Ausbau" icon="building" color="brand">
        <List>
          {SPOT_UPGRADE_IDS.map((id) => {
            const u = SPOT_UPGRADES[id];
            const has = owned.includes(id);
            return (
              <ListItem
                key={id}
                action={!has}
                disabled={!has && state.wallet.dirty < u.cost}
                value={has ? 'eingerichtet' : formatEuro(u.cost)}
                onClick={
                  has
                    ? undefined
                    : () => run(dispatch({ type: 'spots.upgrade', payload: { spotId: spot.id, upgrade: id } }))
                }
              >
                <ItemContent icon={u.icon} color={has ? 'money' : 'brand'} title={u.name} meta={u.description} />
              </ListItem>
            );
          })}
        </List>
      </Group>
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
        message={`${spotType(spot).name} in ${veedelName(spot.veedelId)}. Deine Leute dort werden frei, Stammkunden gehen zum nächsten Spot oder sind weg. Das Geld für Gründung und Ausbau ist verloren.`}
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
