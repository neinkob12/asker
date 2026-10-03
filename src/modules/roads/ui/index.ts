// Oberfläche des Straßen-Moduls: Verkehr als Kulisse auf der Karte (Layer 'roads.traffic', Auftrag 31) und der Schalter
// "Verkehr" im Menü Ebenen. Autos, Transporter, Lkw und Streifenwagen fahren als Zufallsweg über das echte Straßennetz
// (traffic.ts) und werden von einer Flotte gezeichnet (createFleet: eine WebGL-Ebene, Stellungen 20-mal pro Sekunde,
// dazwischen interpoliert). Reine Optik: eigener Zufall (mulberry32 aus Spiel-Seed und Spieltag), kein Einfluss auf
// den Spielstand. Anzahl nach Gerät und Einstellung (Einstellungen › Karte), Dichte nach Uhrzeit, Streifen nach Heat,
// bei Tempo 0, verstecktem Tab und "Bewegung reduzieren" steht bzw. fehlt alles, unter Zoom 12,5 ist nichts zu sehen.

import { clock, type GameState } from '../../../core';
import {
  createFleet,
  type FleetHandle,
  isMobile,
  type MapLayer,
  mapToken,
  metersPerPixel,
  motion,
  onMapFrame,
  onMotionChange,
  registerMapLayer,
} from '../../../map';
import { registerMapLayerOption, type TrafficLevel } from '../../../ui';
import { getHeat } from '../../police';
import { allVeedel } from '../../veedel';
import { roadGraph } from '../index';
import {
  mulberry32,
  policeShare,
  Traffic,
  type TrafficArea,
  type TrafficKind,
  tempoFactor,
  trafficTarget,
} from './traffic';

/** Darunter fährt nichts (die Fahrzeuge wären nur Pünktchen). */
export const TRAFFIC_MIN_ZOOM = 12.5;
/** So oft pro Sekunde neue Stellungen (Budget: höchstens 20). */
const KEYFRAMES_PER_SECOND = 20;
/** Scheinwerfer nachts nur für die nächsten Fahrzeuge. */
const LIGHTS = 12;

const trafficLayer: MapLayer = {
  id: 'roads.traffic',
  order: 15,
  mount(ctx) {
    const { map } = ctx;
    const graph = roadGraph();
    const palette: Record<TrafficKind, string[]> = {
      car: ['--map-traffic-1', '--map-traffic-2', '--map-traffic-3', '--map-traffic-4'].map((t) =>
        mapToken(t, '#8d939c'),
      ),
      van: [mapToken('--map-traffic-van', '#b9bdc3')],
      truck: [mapToken('--map-traffic-truck', '#50555d')],
      police: [mapToken('--map-traffic-cabin', '#c9cdd3')],
    };
    const traffic = new Traffic(graph, palette);
    let fleet: FleetHandle | null = null;
    let level: TrafficLevel = 'normal';
    let hour = 12;
    let share = policeShare(0);
    let seedDay = '';
    let random = mulberry32(1);
    let since = 0;
    let stopFrames: (() => void) | null = null;

    const ensureFleet = (): FleetHandle => {
      fleet ??= createFleet(map, {
        id: 'roads.traffic',
        minZoom: TRAFFIC_MIN_ZOOM,
        lights: LIGHTS,
        cabin: mapToken('--map-traffic-cabin', '#c9cdd3'),
        police: mapToken('--cat-law', '#a7a5ff'),
      });
      return fleet;
    };

    /** Sichtbarer Ausschnitt um die Kartenmitte (flach gerechnet, auch bei schräger Kamera) mit 25 % Rand. */
    const area = (): TrafficArea => {
      const c = map.getCenter();
      // Größe aus den Canvas-Attributen (clientWidth würde ein Layout erzwingen).
      const canvas = map.getCanvas();
      const ratio = map.getPixelRatio() || 1;
      const mpp = metersPerPixel(c.lat, map.getZoom());
      const [cx, cy] = graph.toMeters({ lng: c.lng, lat: c.lat });
      const hw = ((canvas.width / ratio || 800) / 2) * mpp * 1.25;
      const hh = ((canvas.height / ratio || 600) / 2) * mpp * 1.25;
      return { minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh };
    };

    const frame = (now: number, dt: number) => {
      since += dt;
      if (since < 1 / KEYFRAMES_PER_SECOND) return;
      const step = since * tempoFactor(motion.speed);
      since = 0;
      const visible = map.getZoom() >= TRAFFIC_MIN_ZOOM;
      if (!visible) {
        if (traffic.cars.length > 0) {
          traffic.clear();
          ensureFleet().update([], now);
        }
        return;
      }
      traffic.step(step, {
        target: trafficTarget(level, isMobile(), hour),
        area: area(),
        policeShare: share,
        random,
      });
      ensureFleet().update(traffic.poses(), now + 1000 / KEYFRAMES_PER_SECOND);
    };

    /** Takt an, wenn Verkehr da sein soll; sonst aus und leer (bei "Bewegung reduzieren" gar keine Kulisse). */
    const sync = () => {
      const wanted = level !== 'off' && !motion.reduced;
      // Die Flotte gleich anlegen: Ihre Shader werden dann beim Laden übersetzt, nicht mitten im Spiel.
      if (wanted) ensureFleet();
      if (wanted && !stopFrames) stopFrames = onMapFrame(frame, 'traffic');
      if (!wanted && stopFrames) {
        stopFrames();
        stopFrames = null;
      }
      if (!wanted && traffic.cars.length > 0) {
        traffic.clear();
        fleet?.update([], performance.now());
      }
    };
    const offMotion = onMotionChange(sync);

    /** Streifen nach der mittleren Heat der Veedel, deren Mitte im Ausschnitt liegt. */
    const heatShare = (state: GameState): number => {
      const a = area();
      let sum = 0;
      let count = 0;
      for (const v of allVeedel()) {
        const [x, y] = graph.toMeters(v.center);
        if (x < a.minX || x > a.maxX || y < a.minY || y > a.maxY) continue;
        sum += getHeat(state, v.id);
        count++;
      }
      return policeShare(count > 0 ? sum / count : 0);
    };

    return {
      update(state, ui) {
        level = ui.traffic;
        hour = clock.hour(state.time);
        share = heatShare(state);
        // Eigener Zufall: gleicher Spiel-Seed und Spieltag = gleiche Folge.
        const key = `${state.meta.seed}|${clock.day(state.time)}`;
        if (key !== seedDay) {
          seedDay = key;
          random = mulberry32((state.meta.seed ^ Math.imul(clock.day(state.time), 0x9e3779b1)) >>> 0);
        }
        sync();
      },
      destroy() {
        offMotion();
        stopFrames?.();
        fleet?.remove();
      },
    };
  },
};

registerMapLayer(trafficLayer);

// Schalter im Menü Ebenen: Verkehr an (normal) oder aus; "wenig" gibt es in Einstellungen › Karte.
registerMapLayerOption({
  id: 'roads.traffic',
  order: 80,
  group: 'Anzeige',
  label: 'Verkehr',
  icon: 'car',
  toggle: true,
  active: (ui) => ui.traffic !== 'off',
  select: (api, ui) => api.setTraffic(ui.traffic === 'off' ? 'normal' : 'off'),
});
