// Oberfläche der Reviere: Veedel auf der Karte, Abschnitt "Revier" im Veedel-Panel und der Tab "Reviere"
// mit dem Kampagnenziel "Köln übernehmen".

import { useEffect, useState } from 'preact/hooks';
import { formatNumber, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Card,
  Hint,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerHudItem,
  registerSlot,
  registerTab,
  SegmentedControl,
  Stat,
  useGame,
  useUi,
} from '../../../ui';
import { getHeat, heatLevel } from '../../police';
import { allVeedel, veedelName } from '../../veedel';
import {
  CONTROL_THRESHOLD,
  campaignProgress,
  controllerOf,
  type FactionId,
  factionColor,
  factionName,
  factions,
  getInfluence,
  LOSE_CONTROL_THRESHOLD,
  PLAYER_FACTION,
  playerPresence,
} from '../index';
import { veedelLayer } from './map';
import './territory.css';
import { getMapView, MAP_VIEW_OPTIONS, onMapViewChange, setMapView, type VeedelMapView } from './view';

function FactionName(props: { state: GameState; faction: FactionId | null }) {
  return (
    <span class="territory-faction">
      <span class="territory-faction__dot" style={{ background: factionColor(props.state, props.faction) }} />
      {props.faction === null ? 'niemand' : factionName(props.state, props.faction)}
    </span>
  );
}

/** Abschnitt im Veedel-Panel: wer herrscht, Einfluss aller Fraktionen, eigene Präsenz. */
function InfluenceSection(props: { veedelId: string }) {
  const { state } = useGame();
  const owner = controllerOf(state, props.veedelId);
  const rows = factions(state)
    .map((faction) => ({ faction, value: getInfluence(state, props.veedelId, faction) }))
    .filter((row) => row.value > 0 || row.faction === PLAYER_FACTION)
    .sort((a, b) => b.value - a.value);
  const presence = playerPresence(state, props.veedelId);
  const presenceText =
    presence.staff > 0
      ? `${presence.staff} Mitarbeiter vor Ort`
      : presence.recentSale
        ? 'kürzlich hier verkauft'
        : getInfluence(state, props.veedelId, PLAYER_FACTION) > 0
          ? 'keine, dein Einfluss bröckelt'
          : 'keine';
  return (
    <Card title="Revier" actions={<FactionName state={state} faction={owner} />}>
      <div class="territory-influence">
        {rows.map((row) => (
          <div key={row.faction} class="territory-influence__row">
            <span class="territory-influence__name">{factionName(state, row.faction)}</span>
            <span class="territory-bar">
              <span
                class="territory-bar__fill"
                style={{ width: `${row.value}%`, background: factionColor(state, row.faction) }}
              />
              <span class="territory-bar__threshold" style={{ left: `${CONTROL_THRESHOLD}%` }} />
            </span>
            <span class="territory-influence__value">{formatNumber(row.value)}</span>
          </div>
        ))}
      </div>
      <Hint>
        Deine Präsenz: {presenceText}. Kontrolle ab {CONTROL_THRESHOLD} Einfluss und mehr als alle anderen, verloren
        unter {LOSE_CONTROL_THRESHOLD}. Verkäufe hier drängen die stärkste Gang zurück.
      </Hint>
    </Card>
  );
}

function useMapView(): VeedelMapView {
  const [view, setView] = useState(getMapView());
  useEffect(() => onMapViewChange(setView), []);
  return view;
}

/** Tab "Reviere": Kampagnenziel, Kartenansicht, alle Veedel auf einen Blick. */
function TerritoryTab() {
  const { state } = useGame();
  const ui = useUi();
  const view = useMapView();
  const progress = campaignProgress(state);
  return (
    <>
      <Card title="Köln übernehmen">
        <ProgressBar value={progress.controlled / progress.needed} label="Kampagnenfortschritt" />
        <Hint>
          {progress.won
            ? `Köln gehört dir. Du hältst ${progress.controlled} von ${progress.total} Veedeln, das Spiel läuft weiter.`
            : `Du kontrollierst ${progress.controlled} von ${progress.total} Veedeln. Für die Übernahme brauchst du ${progress.needed}.`}
        </Hint>
      </Card>
      <Card
        title="Veedel"
        actions={
          <SegmentedControl aria-label="Kartenansicht" options={MAP_VIEW_OPTIONS} value={view} onChange={setMapView} />
        }
      >
        <List>
          {allVeedel().map((v) => {
            const heat = getHeat(state, v.id);
            const mine = getInfluence(state, v.id, PLAYER_FACTION);
            return (
              <ListItem
                key={v.id}
                onClick={() => {
                  ui.openPanel('veedel.veedel', { veedelId: v.id });
                  ui.flyTo(v.center, 14);
                }}
                aside={
                  view === 'heat' ? (
                    <span class={`territory-heat territory-heat--${heatLevel(heat).id}`}>{Math.round(heat)}</span>
                  ) : (
                    <span class="territory-mine" title="Dein Einfluss">
                      {formatNumber(mine)}
                    </span>
                  )
                }
              >
                <span class="territory-list__row">
                  <span class="territory-list__name">{v.name}</span>
                  <FactionName state={state} faction={controllerOf(state, v.id)} />
                </span>
              </ListItem>
            );
          })}
        </List>
        <Hint>
          {view === 'heat'
            ? 'Rechts: Heat im Veedel. Ab 30 gibt es Kontrollen, ab 60 Razzien.'
            : 'Rechts: dein Einfluss. Klick auf ein Veedel zeigt Details.'}
        </Hint>
      </Card>
    </>
  );
}

registerMapLayer(veedelLayer);
registerSlot('veedel.veedelPanel', { id: 'territory.influence', order: 10, component: InfluenceSection });
registerTab({
  id: 'territory',
  title: 'Reviere',
  order: 20,
  component: TerritoryTab,
});

onGameEvent('territory.controlChanged', 'territory.toast', (payload, ui) => {
  const name = veedelName(payload.veedelId);
  if (payload.to === PLAYER_FACTION) ui.toast(`${name} gehört jetzt dir.`, 'good');
  else if (payload.from === PLAYER_FACTION) ui.toast(`Du hast ${name} verloren.`, 'bad');
});

/** HUD: Fortschritt beim Kampagnenziel "Köln übernehmen". Klick öffnet den Tab "Reviere". */
function CampaignHud() {
  const { state } = useGame();
  const ui = useUi();
  const progress = campaignProgress(state);
  return (
    <button type="button" class="territory-hud" onClick={() => ui.selectTab('territory')}>
      <Stat
        label="Köln"
        value={progress.won ? 'gehört dir' : `${progress.controlled}/${progress.needed} Veedel`}
        title={`Kampagne "Köln übernehmen": ${progress.controlled} von ${progress.total} Veedeln, ${progress.needed} gewinnen.`}
      />
    </button>
  );
}

registerHudItem({ id: 'territory.campaign', order: 45, component: CampaignHud });
