// Oberfläche der Reviere: Veedel auf der Karte, Abschnitt "Revier" im Veedel-Panel und der Tab "Reviere"
// mit dem Kampagnenziel "Köln übernehmen".

import { useEffect, useState } from 'preact/hooks';
import { formatNumber, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Card,
  Group,
  Hint,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerGameStat,
  registerMapLayerOption,
  registerSlot,
  registerTab,
  SegmentedControl,
  Slot,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { getHeat, heatLevel } from '../../police';
import { allVeedel, veedelName } from '../../veedel';
import {
  type CampaignProgress,
  CONTROL_THRESHOLD,
  campaignProgress,
  controllerOf,
  type FactionId,
  factionColor,
  factionName,
  factions,
  getInfluence,
  LOSE_CONTROL_THRESHOLD,
  lieutenantInfluence,
  PLAYER_FACTION,
  playerPresence,
} from '../index';
import { veedelLayer } from './map';
import './takeover';
import './territory.css';
import { getMapView, MAP_VIEW_OPTIONS, onMapViewChange, setMapView, type VeedelMapView } from './view';

/** Ein Satz zum Kampagnenziel: Meilenstein bei der Mehrheit, Ziel sind alle Veedel. */
export function campaignHint(progress: CampaignProgress): string {
  const { controlled, total, majority } = progress;
  if (progress.complete) return `Köln gehört dir ganz. Du hältst ${controlled} von ${total} Veedeln.`;
  if (progress.majorityReached)
    return `Boss von Köln: ${controlled} von ${total} Veedeln. Für Köln komplett brauchst du alle ${total}.`;
  return `Du kontrollierst ${controlled} von ${total} Veedeln. Ab ${majority} bist du Boss von Köln, mit allen ${total} gehört dir die Stadt.`;
}

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
      : lieutenantInfluence(state, props.veedelId) > 0
        ? 'ein Leutnant führt hier Spots'
        : presence.recentSale
          ? 'kürzlich hier verkauft'
          : getInfluence(state, props.veedelId, PLAYER_FACTION) > 0
            ? 'keine, dein Einfluss bröckelt'
            : 'keine';
  return (
    <Group
      title="Revier"
      icon="flag"
      color="place"
      note={`Deine Präsenz: ${presenceText}.`}
      more={`Kontrolle ab ${CONTROL_THRESHOLD} Einfluss und mehr als alle anderen, verloren unter ${LOSE_CONTROL_THRESHOLD}. Verkäufe hier drängen die stärkste Gang zurück.`}
    >
      <List>
        <ListItem value={<FactionName state={state} faction={owner} />}>
          <ItemContent icon="crown" color="place" title="Herrscht" />
        </ListItem>
        {rows.map((row) => (
          <ListItem key={row.faction} value={formatNumber(row.value)}>
            <span class="territory-influence__row">
              <span class="territory-influence__name">{factionName(state, row.faction)}</span>
              <span class="territory-bar">
                <span
                  class="territory-bar__fill"
                  style={{ width: `${row.value}%`, background: factionColor(state, row.faction) }}
                />
                <span class="territory-bar__threshold" style={{ left: `${CONTROL_THRESHOLD}%` }} />
              </span>
            </span>
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

function useMapView(): VeedelMapView {
  const [view, setView] = useState(getMapView());
  useEffect(() => onMapViewChange(setView), []);
  return view;
}

/** Tab "Reviere": Kampagnenziel, Kartenansicht, alle Veedel auf einen Blick, darunter Spots, Ruf und Polizei. */
function TerritoryTab() {
  const { state } = useGame();
  const ui = useUi();
  const view = useMapView();
  const progress = campaignProgress(state);
  return (
    <>
      <Card title={progress.complete ? 'Köln komplett' : 'Köln übernehmen'}>
        <ProgressBar value={progress.controlled / progress.total} label="Kampagnenfortschritt" />
        <Hint>{campaignHint(progress)}</Hint>
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
      {/* Spots, Ruf und Polizei-Stufe (seit Auftrag 26 hier statt im Geschäft) */}
      <Slot name="tab:territory" />
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
  else if (payload.from === PLAYER_FACTION) ui.toast(`Du hast ${name} verloren.`, 'bad', { urgent: true });
});

// Menü "Ebenen" der Kartensteuerung: Veedel nach Kontrolle oder nach Heat einfärben.
for (const [i, option] of MAP_VIEW_OPTIONS.entries()) {
  registerMapLayerOption({
    id: `territory.view.${option.value}`,
    order: 10 + i,
    group: 'Veedel einfärben',
    label: option.label,
    icon: option.value === 'heat' ? 'flame' : 'flag',
    active: () => getMapView() === option.value,
    select: () => setMapView(option.value),
  });
}

registerAdvisor({
  id: 'territory.goal',
  advise: (state) => {
    const progress = campaignProgress(state);
    if (progress.controlled > 0 || progress.won) return null;
    return {
      id: 'territory.goal',
      priority: 20,
      icon: 'flag',
      title: 'Ziel: Köln übernehmen',
      text: `Ab ${progress.majority} Veedeln bist du Boss von Köln, mit allen ${progress.total} gehört dir die Stadt.`,
      actionLabel: 'Reviere',
      action: (ui) => ui.selectTab('territory'),
    };
  },
});

registerGameStat({
  id: 'territory.veedel',
  order: 20,
  icon: 'flag',
  label: 'Veedel unter Kontrolle',
  value: (state) => {
    const p = campaignProgress(state);
    return `${p.controlled} von ${p.total}`;
  },
});

// Meilenstein "Boss von Köln" (Mehrheit der Veedel, Auftrag 30): Banner mit Ton, kein Sieg-Bildschirm.
onGameEvent('campaign.milestone', 'territory.milestone', (payload, ui) => {
  if (payload.kind !== 'majority') return;
  ui.toast(
    `Boss von Köln: ${payload.controlled} von ${payload.total} Veedeln gehören dir. Jetzt den Rest der Stadt.`,
    'good',
    { urgent: true },
  );
});
soundOnEvent('campaign.milestone', 'success');
