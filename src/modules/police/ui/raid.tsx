// Razzia gegen dich im Look "Glas": oben über der Kartenfläche ein Banner aus dunkelrotem Glas mit Sirene, am Rand
// der Kartenfläche pulsiert ein Schein blau/rot (aus bei weniger Bewegung), das Veedel wird rot getönt (Karten-Layer).
// Kurz danach eine Bilanz-Karte "Das hat gekostet": Ware, Schwarzgeld, wer in Haft ist (Kaution), Heat im Veedel,
// mit "Anwalt schicken · Kaution" (Befehl staff.bail) und "Später". Am Handy-Bildschirm ist die Bilanz ein Blatt.
// Das Blaulicht am Ort (mapEffects.blueLight) und die Sirene kommen weiter aus index.tsx.

import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect } from 'preact/hooks';
import { formatAmount, formatEuro, type GameState } from '../../../core';
import { ABOVE_LAND, type MapLayer, mapToken, registerMapLayer } from '../../../map';
import { Icon, MapDialog, onGameEvent, registerDialog, registerSlot, type UiApi, useGame, useUi } from '../../../ui';
import { getSpot } from '../../spots';
import { bailCost, getStaffMember } from '../../staff';
import { PLAYER_FACTION } from '../../territory';
import { getBoundary, veedelName } from '../../veedel';
import { getHeat, heatLevel } from '../index';

declare module '../../../ui' {
  interface DialogRegistry {
    'police.raidReport': RaidRecord;
  }
}

/** So lange (Spielminuten) stehen Banner und Schein, das Veedel ist danach noch eine Weile rot getönt. */
const ALERT_MINUTES = 60;
const TINT_MINUTES = 120;
/** Nach so vielen echten Millisekunden kommt die Bilanz (sobald kein anderer Dialog offen ist). */
const REPORT_DELAY_MS = 3500;

export interface RaidRecord {
  runId: string;
  at: number;
  veedelId: string;
  spotId?: string;
  goods: number;
  money: number;
  arrested: string[];
}

/** Letzte Razzia gegen dich (nur Oberfläche, nicht im Spielstand). */
let lastRaid: (RaidRecord & { reported: boolean }) | null = null;

function current(state: GameState, minutes: number): RaidRecord | null {
  if (!lastRaid || lastRaid.runId !== state.meta.runId) return null;
  const age = state.time - lastRaid.at;
  return age >= 0 && age < minutes ? lastRaid : null;
}

function raidLine(state: GameState, raid: RaidRecord): string {
  const spot = raid.spotId ? getSpot(state, raid.spotId)?.name : undefined;
  const parts: string[] = [];
  if (raid.goods > 0) parts.push(`${formatAmount(raid.goods)} beschlagnahmt`);
  if (raid.arrested.length > 0) parts.push(`${raid.arrested.length} festgenommen`);
  const where = spot ? `Zivile Beamte am ${spot}` : 'Die Polizei durchsucht deine Spots und Lager';
  return parts.length > 0 ? `${where}: ${parts.join(', ')}.` : `${where}.`;
}

/** Banner oben über der Kartenfläche und der Schein am Rand, solange die Razzia frisch ist. */
function RaidAlert() {
  const { state } = useGame();
  const raid = current(state, ALERT_MINUTES);
  if (!raid) return null;
  return (
    <>
      <div class="raid-edge" aria-hidden="true" />
      <div class="raid-banner" role="alert">
        <span class="raid-banner__tile">
          <Icon name="siren" strokeWidth={2} />
        </span>
        <span class="raid-banner__text">
          <strong>Razzia · {veedelName(raid.veedelId)}</strong>
          <span>{raidLine(state, raid)}</span>
        </span>
      </div>
    </>
  );
}

/** Öffnet die Bilanz kurz nach der Razzia, sobald kein anderer Dialog (z.B. eine Konfrontation) offen ist. */
function RaidReporter() {
  const ui = useUi();
  const { state } = useGame();
  const raid = lastRaid && !lastRaid.reported && lastRaid.runId === state.meta.runId ? lastRaid : null;
  useEffect(() => {
    if (!raid) return;
    let timer = window.setTimeout(function tryOpen() {
      if (!lastRaid || lastRaid !== raid || raid.reported) return;
      if (ui.state.dialog) {
        timer = window.setTimeout(tryOpen, 1500);
        return;
      }
      raid.reported = true;
      const { reported: _, ...record } = raid;
      ui.openDialog('police.raidReport', record);
    }, REPORT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [raid]);
  return null;
}

function bailAll(ui: UiApi, state: GameState, ids: string[]): void {
  for (const id of ids) {
    if (getStaffMember(state, id)?.status === 'jailed') ui.dispatch({ type: 'staff.bail', payload: { staffId: id } });
  }
}

/** Bilanz-Karte: was die Razzia gekostet hat. */
function RaidReport(props: RaidRecord) {
  const { state } = useGame();
  const ui = useUi();
  const heat = getHeat(state, props.veedelId);
  const jailed = props.arrested.filter((id) => getStaffMember(state, id)?.status === 'jailed');
  const bail = jailed.reduce((sum, id) => sum + bailCost(state, id), 0);
  const close = () => ui.closeDialog();
  return (
    <MapDialog label="Das hat gekostet" onClose={close} class="raid-report">
      <p class="raid-report__kicker">Razzia · {veedelName(props.veedelId)}</p>
      <h2 class="raid-report__title">Das hat gekostet</h2>
      <dl class="raid-report__rows">
        <dt>
          <Icon name="package" /> Ware beschlagnahmt
        </dt>
        <dd>{props.goods > 0 ? formatAmount(props.goods) : 'nichts'}</dd>
        <dt>
          <Icon name="moneyBag" /> Schwarzgeld weg
        </dt>
        <dd>{props.money > 0 ? `−${formatEuro(props.money)}` : 'nichts'}</dd>
        <dt>
          <Icon name="jail" /> In Haft
        </dt>
        <dd>
          {props.arrested.length === 0
            ? 'niemand'
            : props.arrested.map((id) => {
                const m = getStaffMember(state, id);
                const still = m?.status === 'jailed';
                return (
                  <span key={id} class="raid-report__person">
                    {m?.name ?? id}
                    {still ? ` · Kaution ${formatEuro(bailCost(state, id))}` : ' · frei'}
                  </span>
                );
              })}
        </dd>
        <dt>
          <Icon name="flame" /> Heat im Veedel
        </dt>
        <dd>
          {Math.round(heat)} · {heatLevel(heat).label}
        </dd>
      </dl>
      <div class="raid-report__actions">
        {jailed.length > 0 && (
          <button
            type="button"
            class="raid-report__primary"
            disabled={bail > state.wallet.dirty}
            onClick={() => bailAll(ui, state, jailed)}
          >
            Anwalt schicken · Kaution {formatEuro(bail)}
          </button>
        )}
        <button type="button" class="raid-report__later" onClick={close}>
          {jailed.length > 0 ? 'Später' : 'Schließen'}
        </button>
      </div>
    </MapDialog>
  );
}

/** Rot getöntes Veedel nach einer Razzia, blasst über TINT_MINUTES Spielminuten aus. */
const raidAreaLayer: MapLayer = {
  id: 'police.raidArea',
  order: 26,
  mount(ctx) {
    const { map } = ctx;
    const source = 'police.raidArea';
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      {
        id: source,
        type: 'fill',
        source,
        paint: { 'fill-color': mapToken('--map-heat-hot', '#ff453a'), 'fill-opacity': 0 },
      },
      ABOVE_LAND,
    );
    let shown = '';
    let opacity = -1;
    return {
      update(state) {
        const raid = current(state, TINT_MINUTES);
        const key = raid ? `${raid.veedelId}@${raid.at}` : '';
        if (key !== shown) {
          shown = key;
          const ring = raid ? getBoundary(raid.veedelId) : [];
          (map.getSource(source) as GeoJSONSource | undefined)?.setData({
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
        const next = raid ? Math.round(0.42 * (1 - (state.time - raid.at) / TINT_MINUTES) * 100) / 100 : 0;
        if (next !== opacity) {
          opacity = next;
          map.setPaintProperty(source, 'fill-opacity', next);
        }
      },
      destroy() {
        if (map.getLayer(source)) map.removeLayer(source);
        if (map.getSource(source)) map.removeSource(source);
      },
    };
  },
};

registerSlot('map.overlay', { id: 'police.raidAlert', order: 10, component: RaidAlert });
registerSlot('map.overlay', { id: 'police.raidReporter', order: 11, component: RaidReporter });
registerDialog({ id: 'police.raidReport', component: RaidReport, area: 'map', lockPhone: false });
registerMapLayer(raidAreaLayer);

onGameEvent('police.raid', 'police.raidLook', (payload, _ui, state) => {
  if (payload.target !== PLAYER_FACTION || payload.empty) return;
  lastRaid = {
    runId: state.meta.runId,
    at: state.time,
    veedelId: payload.veedelId,
    ...(payload.spotId ? { spotId: payload.spotId } : {}),
    goods: Math.round(payload.goods ?? 0),
    money: Math.round(payload.money ?? 0),
    arrested: [...(payload.arrested ?? [])],
    reported: false,
  };
});
