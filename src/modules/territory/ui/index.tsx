// Oberfläche der Reviere: Veedel auf der Karte, Abschnitt "Revier" im Veedel-Panel und der Tab "Reviere" mit Ruf und
// Fortschritt der Stadt als Kacheln und den Veedel als Tabelle (Feedback 13.10.2026).

import { formatNumber, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Group,
  Icon,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerAdvisor,
  registerGameStat,
  registerMapLayerOption,
  registerSlot,
  registerTab,
  Slot,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, citiesUnlocked, cityName, isBusinessSold, majorityMakesBoss } from '../../city';
import { getHeat, heatLevel } from '../../police';
import { getSpots } from '../../spots';
import { tutorialAllows } from '../../tutorial';
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
import { getMapView, MAP_VIEW_OPTIONS, setMapView } from './view';

/** Ein Satz zum Kampagnenziel einer Stadt: Meilenstein bei der Mehrheit, Ziel sind alle Veedel. */
export function campaignHint(progress: CampaignProgress, city = 'Köln', boss = true): string {
  const { controlled, total, majority } = progress;
  if (progress.complete) return `${city} gehört dir ganz. Du hältst ${controlled} von ${total} Veedeln.`;
  // Nur in Köln macht die Mehrheit einen Rang; anderswo heißt sie Mehrheit (N8).
  if (progress.majorityReached)
    return boss
      ? `Boss von ${city}: ${controlled} von ${total} Veedeln. Für ${city} komplett brauchst du alle ${total}.`
      : `Mehrheit in ${city}: ${controlled} von ${total} Veedeln. Boss von ${city} bist du mit allen ${total}.`;
  return boss
    ? `${controlled} von ${total} Veedeln. Ab ${majority} bist du Boss von ${city}, mit allen ${total} gehört dir die Stadt.`
    : `${controlled} von ${total} Veedeln. Mit allen ${total} gehört dir die Stadt und du bist Boss von ${city}.`;
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

declare module '../../../ui' {
  interface SlotRegistry {
    /** Kacheln oben in den Revieren neben dem Fortschritt (z.B. Ruf aus reputation). */
    'territory.tiles': Record<string, never>;
  }
}

/**
 * Tab "Reviere" (Feedback 13.10.2026, eine Seite ohne viel Scrollen): oben Ruf (Slot 'territory.tiles') und der
 * Fortschritt der Stadt als Kacheln, darunter die Veedel als Tabelle (wer herrscht, dein Einfluss, deine Spots, Heat).
 * Ein Tipp auf ein Veedel öffnet seine Seite mit den Spots. Spots, Stadtleben und Polizei stehen nicht mehr hier.
 */
function TerritoryTab() {
  const { state } = useGame();
  const ui = useUi();
  const cityId = activeCity(state);
  const city = cityName(cityId);
  const progress = campaignProgress(state, cityId);
  const spots = getSpots(state, cityId);
  return (
    <div class="territory-page">
      <div class="territory-tiles">
        <Slot name="territory.tiles" props={{}} />
        <div class="territory-tile" title={campaignHint(progress, city, majorityMakesBoss(cityId))}>
          <span class="territory-tile__label">{progress.complete ? `${city} komplett` : city}</span>
          <strong class="territory-tile__value">
            {progress.controlled}/{progress.total}
          </strong>
          <span class="territory-tile__sub">
            {progress.complete
              ? 'alle Veedel'
              : progress.majorityReached
                ? `alle ${progress.total} für komplett`
                : `Mehrheit ab ${progress.majority}`}
          </span>
          <span class="territory-tile__bar" aria-hidden="true">
            <span style={{ width: `${(100 * progress.controlled) / Math.max(1, progress.total)}%` }} />
          </span>
        </div>
      </div>
      <Group title="Veedel" icon="flag" color="place">
        <div class="territory-table">
          <div class="territory-table__head" aria-hidden="true">
            <span />
            <span>Einfluss</span>
            <span>Spots</span>
            <span>Heat</span>
            <span />
          </div>
          {allVeedel(cityId).map((v) => {
            const heat = getHeat(state, v.id);
            const owner = controllerOf(state, v.id);
            const count = spots.filter((sp) => sp.veedelId === v.id).length;
            return (
              <button
                key={v.id}
                type="button"
                class="territory-table__row"
                aria-label={`${v.name}, ${owner === null ? 'niemand' : factionName(state, owner)} herrscht`}
                onClick={() => {
                  ui.openPanel('veedel.veedel', { veedelId: v.id });
                  ui.flyTo(v.center, 14);
                }}
              >
                <span class="territory-table__name">
                  <span
                    class="territory-faction__dot"
                    style={{ background: factionColor(state, owner) }}
                    title={owner === null ? 'niemand' : factionName(state, owner)}
                  />
                  <span>{v.name}</span>
                </span>
                <span class={`territory-table__num${owner === PLAYER_FACTION ? ' is-mine' : ''}`}>
                  {formatNumber(getInfluence(state, v.id, PLAYER_FACTION))}
                </span>
                <span class="territory-table__num">{count > 0 ? count : '–'}</span>
                <span class={`territory-table__num territory-heat--${heatLevel(heat).id}`}>{Math.round(heat)}</span>
                <Icon name="chevronRight" size={12} />
              </button>
            );
          })}
        </div>
      </Group>
    </div>
  );
}

registerMapLayer(veedelLayer);
registerSlot('veedel.veedelPanel', { id: 'territory.influence', order: 10, component: InfluenceSection });
registerTab({
  id: 'territory',
  title: 'Reviere',
  order: 20,
  component: TerritoryTab,
  // Nach dem Verkauf gibt es keine Veedel mehr (Auftrag 43). Am Anfang kommt die App mit Peters Quest.
  // Auftrag 46b: Im Tutorial kommt die App mit ihrer Stufe.
  hiddenWhen: (state) => isBusinessSold(state) || !tutorialAllows(state, 'app.territory'),
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
    // Ziel der Stadt, in der du bist (Auftrag 43: stand in jeder Stadt auf Köln).
    const cityId = activeCity(state);
    const progress = campaignProgress(state, cityId);
    if (progress.total === 0 || progress.controlled > 0 || progress.won) return null;
    const city = cityName(cityId);
    return {
      id: 'territory.goal',
      priority: 20,
      icon: 'flag',
      title: `Ziel: ${city} übernehmen`,
      text: majorityMakesBoss(cityId)
        ? `Ab ${progress.majority} Veedeln bist du Boss von ${city}, mit allen ${progress.total} gehört dir die Stadt.`
        : `Mit allen ${progress.total} Veedeln gehört dir die Stadt, und du bist Boss von ${city}.`,
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
    // Über alle freien Städte (Auftrag 43: zählte nur Köln).
    const all = citiesUnlocked(state).map((id) => campaignProgress(state, id));
    const controlled = all.reduce((sum, p) => sum + p.controlled, 0);
    const total = all.reduce((sum, p) => sum + p.total, 0);
    return `${controlled} von ${total}`;
  },
});

// Meilenstein "Boss von Köln" (Mehrheit der Veedel, Auftrag 30): Banner mit Ton, kein Sieg-Bildschirm.
onGameEvent('campaign.milestone', 'territory.milestone', (payload, ui) => {
  if (payload.kind !== 'majority') return;
  const city = cityName(payload.cityId);
  ui.toast(
    `${majorityMakesBoss(payload.cityId) ? `Boss von ${city}` : `Mehrheit in ${city}`}: ${payload.controlled} von ${payload.total} Veedeln gehören dir. Jetzt den Rest der Stadt.`,
    'good',
    { urgent: true },
  );
});
soundOnEvent('campaign.milestone', 'success');
