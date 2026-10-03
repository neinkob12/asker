// "Veedel übernommen" im Look "Glas": Übernimmst du ein Veedel (territory.controlChanged zu dir), färbt es sich auf
// der Karte animiert gold, und über der Kartenfläche erscheint ein goldener Schein mit dem Namen des Veedels und einer
// Glas-Leiste: Köln-Fortschritt (Segmente), Ruf, Reaktion der Gang, die es verloren hat, und "Weiter". Das Spiel
// pausiert dabei kurz (wie Dialoge mit pausesGame), das Handy bleibt bedienbar. Am Handy-Bildschirm als Blatt.

import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect } from 'preact/hooks';
import type { GameState } from '../../../core';
import { type MapLayer, mapToken, registerMapLayer } from '../../../map';
import { HudSegments, MapDialog, onGameEvent, registerDialog, registerSlot, useGame, useUi } from '../../../ui';
import { getGang, getGangStatus } from '../../gangs';
import { getReputation, reputationLabel } from '../../reputation';
import { getBoundary, getVeedel, veedelName } from '../../veedel';
import { campaignProgress, PLAYER_FACTION } from '../index';
import { isFirstTakeover, newMemory } from './takeoverModel';

declare module '../../../ui' {
  interface DialogRegistry {
    'territory.takeover': { veedelId: string; from: string | null };
  }
}

/** So lange (Spielminuten) bleibt das Veedel gold, danach zeigt die normale Einfärbung die Kontrolle. */
const GOLD_MINUTES = 180;

interface Takeover {
  runId: string;
  at: number;
  veedelId: string;
  from: string | null;
  shown: boolean;
}

/** Letzte Übernahme (nur Oberfläche). */
let last: Takeover | null = null;
/** Welche Veedel schon einen Dialog bekamen (nur Oberfläche): Ein Rückgewinn hält das Spiel nicht noch einmal an. */
const memory = newMemory();

/** Wie reagiert die Gang, die das Veedel verloren hat? */
function gangReaction(state: GameState, from: string | null): string {
  if (!from) return 'Hier hatte niemand das Sagen. Jetzt du.';
  const gang = getGang(state, from);
  if (!gang) return 'Die alten Herren sind weg.';
  const hostility = getGangStatus(state, from)?.hostility ?? 0;
  if (hostility >= 70) return `${gang.name} schwört Rache.`;
  if (hostility >= 40) return `${gang.name} kocht vor Wut.`;
  return `${gang.name} zieht sich zurück. Vorerst.`;
}

function TakeoverDialog(props: { veedelId: string; from: string | null }) {
  const { state } = useGame();
  const ui = useUi();
  const veedel = getVeedel(props.veedelId);
  const progress = campaignProgress(state);
  const reputation = getReputation(state);
  const close = () => ui.closeDialog();
  return (
    <MapDialog label="Veedel übernommen" onClose={close} class="takeover" scrim="none" detent="large">
      <div class="takeover__glow" aria-hidden="true" />
      <p class="takeover__kicker">Veedel übernommen</p>
      <h2 class="takeover__name">{veedel?.name ?? veedelName(props.veedelId)}</h2>
      <p class="takeover__line">{veedel?.description ?? 'Ab jetzt gehört das Veedel dir.'}</p>
      <div class="takeover__bar">
        <div class="takeover__stat">
          <span class="takeover__label is-place">Köln</span>
          <strong>
            {progress.controlled}/{progress.total}
          </strong>
          <HudSegments total={progress.total} filled={progress.controlled} label="Köln" />
        </div>
        <div class="takeover__stat">
          <span class="takeover__label is-brand">Ruf</span>
          <strong>
            {Math.round(reputation)} {reputationLabel(reputation)}
          </strong>
        </div>
        <div class="takeover__stat is-wide">
          <span class="takeover__label is-danger">Gang</span>
          <span class="takeover__reaction">{gangReaction(state, props.from)}</span>
        </div>
        <button type="button" class="takeover__next" onClick={close}>
          Weiter
        </button>
      </div>
    </MapDialog>
  );
}

/** Öffnet die Übernahme, sobald kein anderer Dialog offen ist (z.B. erst nach einer Konfrontation). */
function TakeoverOpener() {
  const ui = useUi();
  const { state } = useGame();
  const pending = last && !last.shown && last.runId === state.meta.runId ? last : null;
  useEffect(() => {
    if (!pending) return;
    let timer = window.setTimeout(function tryOpen() {
      if (pending !== last || pending.shown) return;
      if (ui.state.dialog) {
        timer = window.setTimeout(tryOpen, 1000);
        return;
      }
      pending.shown = true;
      ui.openDialog('territory.takeover', { veedelId: pending.veedelId, from: pending.from });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return null;
}

/** Das übernommene Veedel leuchtet gold auf und blasst langsam aus (MapLibre-Übergang, kein eigener Takt). */
const takeoverLayer: MapLayer = {
  id: 'territory.takeover',
  order: 12,
  mount(ctx) {
    const { map } = ctx;
    const id = 'territory.takeover';
    const gold = mapToken('--hud-gold', '#f2c766');
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id,
      type: 'fill',
      source: id,
      paint: {
        'fill-color': gold,
        'fill-opacity': 0,
        'fill-opacity-transition': { duration: 1400, delay: 0 },
      },
    });
    map.addLayer({
      id: `${id}.line`,
      type: 'line',
      source: id,
      paint: {
        'line-color': gold,
        'line-width': 3,
        'line-opacity': 0,
        'line-opacity-transition': { duration: 1400, delay: 0 },
      },
    });
    let shown = '';
    let level = -1;
    return {
      update(state) {
        const t = last && last.runId === state.meta.runId ? last : null;
        const age = t ? state.time - t.at : Infinity;
        const active = t && age >= 0 && age < GOLD_MINUTES ? t : null;
        const key = active ? `${active.veedelId}@${active.at}` : '';
        if (key !== shown) {
          shown = key;
          const ring = active ? getBoundary(active.veedelId) : [];
          (map.getSource(id) as GeoJSONSource | undefined)?.setData({
            type: 'FeatureCollection',
            features:
              ring.length > 0
                ? [
                    {
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'Polygon', coordinates: [ring.map(([lng, lat]) => [lng, lat])] },
                    },
                  ]
                : [],
          });
        }
        // In Stufen ausblenden, damit MapLibre weich überblendet.
        const next = active ? Math.round((1 - age / GOLD_MINUTES) * 4) / 4 : 0;
        if (next !== level) {
          level = next;
          map.setPaintProperty(id, 'fill-opacity', 0.38 * next);
          map.setPaintProperty(`${id}.line`, 'line-opacity', 0.9 * next);
        }
      },
      destroy() {
        for (const layer of [`${id}.line`, id]) if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.getSource(id)) map.removeSource(id);
      },
    };
  },
};

registerDialog({
  id: 'territory.takeover',
  component: TakeoverDialog,
  pausesGame: true,
  area: 'map',
  lockPhone: false,
});
registerSlot('map.overlay', { id: 'territory.takeoverOpener', order: 40, component: TakeoverOpener });
registerMapLayer(takeoverLayer);

onGameEvent('territory.controlChanged', 'territory.takeover', (payload, ui, state) => {
  if (payload.to !== PLAYER_FACTION || state.outcome.gameOver) return;
  // Die Island bleibt die Quelle für das Live-Geschehen: kurzer Auftritt mit dem Veedel.
  ui.pulseIsland({ icon: 'flag', tone: 'accent', text: `${veedelName(payload.veedelId)} gehört dir` });
  // Das Aufleuchten auf der Karte gibt es immer, den pausierenden Dialog nur beim ersten Mal in diesem Veedel.
  const first = isFirstTakeover(memory, state.meta.runId, payload.veedelId);
  last = { runId: state.meta.runId, at: state.time, veedelId: payload.veedelId, from: payload.from, shown: !first };
});
