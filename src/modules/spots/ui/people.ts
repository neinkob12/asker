// Leute an Spots auf der Karte (Auftrag 31): kleine Figuren am Fuß der Spot-Schilder, Läufer und Sicherheit in der
// Farbe people, wartende Kunden in goods (gehen beim Kauf, das Geld-Popup kommt wie bisher), dazu eine Streife in law,
// die in Veedeln mit hoher Heat über die Straßen von Spot zu Spot geht. Symbol-Ebene mit SDF-Figur, keine HTML-Marker;
// ruhiges Pendeln mit höchstens 10 neuen Stellungen pro Sekunde, nur im Ausschnitt, unter Zoom 14 unsichtbar,
// höchstens 60 Figuren. Bei Tempo 0 und verstecktem Tab steht alles, bei "Bewegung reduzieren" pendelt nichts.
// Antippen einer Figur öffnet das Spot-Blatt. Reine Optik.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import {
  ensureFigureImage,
  type MapLayer,
  type MeasuredPath,
  mapToken,
  measurePath,
  motion,
  onMapFrame,
  onMotionChange,
  pointAtDistance,
} from '../../../map';
import { roadRoute } from '../../roads';
import type { Spot } from '../index';
import { type Figure, MAX_FIGURES, patrolRounds, planFigures } from './peopleModel';

export const PEOPLE_MIN_ZOOM = 14;
const SOURCE = 'spots.people';
/** Neue Stellungen höchstens so oft pro Sekunde (Budget aus Auftrag 31). */
const UPDATES_PER_SECOND = 10;
/** Pendeln: Ausschlag in Symbol-Einheiten und Dauer einer Schwingung (Sekunden). */
const SWAY = 2.2;
const SWAY_SECONDS = 3.2;
/** Gehtempo der Streife (m/s, etwas schneller als echt, damit man es sieht), mal Spieltempo. */
const PATROL_SPEED = 3.5;

interface Patrol {
  veedelId: string;
  spots: Spot[];
  index: number;
  path: MeasuredPath;
  along: number;
}

export const peopleLayer: MapLayer = {
  id: 'spots.people',
  order: 48,
  mount(ctx) {
    const { map } = ctx;
    const colors = {
      staff: mapToken('--cat-people', '#40c8e0'),
      customer: mapToken('--cat-goods', '#c8aa85'),
      patrol: mapToken('--cat-law', '#a7a5ff'),
    };
    const image = ensureFigureImage(map);
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: SOURCE,
      type: 'symbol',
      source: SOURCE,
      minzoom: PEOPLE_MIN_ZOOM,
      layout: {
        'icon-image': image,
        'icon-anchor': 'bottom',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.42, 16, 0.6, 18, 0.8],
        'icon-offset': ['get', 'offset'] as never,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-pitch-alignment': 'viewport',
      },
      paint: {
        'icon-color': ['get', 'color'] as never,
        'icon-halo-color': 'rgba(10, 12, 16, 0.7)',
        'icon-halo-width': 1.2,
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.4, 0.95],
      },
    });

    let figures: Figure[] = [];
    let patrols: Patrol[] = [];
    let since = 0;
    const started = performance.now();
    let lastKey = '';
    let stopFrames: (() => void) | null = null;

    /** Liegt ein Punkt im Ausschnitt (mit 15 % Rand)? Die Grenzen einmal pro Aufruf lesen. */
    const viewTest = (): ((p: LngLat) => boolean) => {
      const b = map.getBounds();
      const dx = (b.getEast() - b.getWest()) * 0.15;
      const dy = (b.getNorth() - b.getSouth()) * 0.15;
      const [w, e, s, n] = [b.getWest() - dx, b.getEast() + dx, b.getSouth() - dy, b.getNorth() + dy];
      return (p) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n;
    };

    const routeBetween = (a: Spot, b: Spot): MeasuredPath => measurePath(roadRoute(a, b).path);

    /** Streifen anpassen: neue Veedel bekommen eine, abgekühlte verlieren sie; laufende behalten ihren Weg. */
    const syncPatrols = (state: GameState) => {
      const rounds = patrolRounds(state);
      const next: Patrol[] = [];
      for (const round of rounds) {
        const known = patrols.find((p) => p.veedelId === round.veedelId);
        if (known) {
          known.spots = round.spots;
          next.push(known);
          continue;
        }
        const [first, second] = round.spots;
        if (!first) continue;
        next.push({
          veedelId: round.veedelId,
          spots: round.spots,
          index: 0,
          path: routeBetween(first, second ?? first),
          along: 0,
        });
      }
      patrols = next;
    };

    const walk = (dt: number) => {
      for (const patrol of patrols) {
        patrol.along += dt * PATROL_SPEED;
        if (patrol.along < patrol.path.length) continue;
        const n = patrol.spots.length;
        patrol.index = (patrol.index + 1) % Math.max(1, n);
        const from = patrol.spots[patrol.index];
        const to = patrol.spots[(patrol.index + 1) % Math.max(1, n)];
        patrol.path = routeBetween(from, to ?? from);
        patrol.along = 0;
      }
    };

    const draw = (now: number) => {
      const t = (now - started) / 1000;
      const sway = motion.reduced ? 0 : SWAY;
      const features = figures.map((f) => ({
        type: 'Feature' as const,
        properties: {
          spotId: f.spotId,
          color: colors[f.kind],
          offset: [
            Math.round((f.offset[0] + Math.sin(t * ((2 * Math.PI) / SWAY_SECONDS) + f.phase) * sway) * 10) / 10,
            f.offset[1],
          ],
        },
        geometry: { type: 'Point' as const, coordinates: [f.position.lng, f.position.lat] },
      }));
      const inView = viewTest();
      for (const patrol of patrols) {
        const p = pointAtDistance(patrol.path, patrol.along);
        if (!inView(p)) continue;
        const target = patrol.spots[(patrol.index + 1) % Math.max(1, patrol.spots.length)] ?? patrol.spots[0];
        features.push({
          type: 'Feature',
          properties: { spotId: target?.id ?? '', color: colors.patrol, offset: [0, 14] },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        });
      }
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };

    const frame = (now: number, dt: number) => {
      if (map.getZoom() < PEOPLE_MIN_ZOOM || (figures.length === 0 && patrols.length === 0)) return;
      walk(dt * Math.sqrt(Math.max(0, motion.speed)));
      since += dt;
      if (since < 1 / UPDATES_PER_SECOND) return;
      since = 0;
      draw(now);
    };

    /** Takt nur, solange es etwas zu bewegen gibt (Pendeln oder Streife). */
    const sync = () => {
      const moving = figures.length > 0 || patrols.length > 0;
      if (moving && !stopFrames) stopFrames = onMapFrame(frame, 'people');
      if (!moving && stopFrames) {
        stopFrames();
        stopFrames = null;
      }
    };
    const offMotion = onMotionChange(() => {
      sync();
      draw(performance.now());
    });

    const onClick = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      if (ctx.isPicking()) return;
      const spotId = e.features?.[0]?.properties?.spotId;
      if (typeof spotId === 'string' && spotId) ctx.ui.openPanel('spots.spot', { spotId });
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', SOURCE, onClick);
    map.on('mouseenter', SOURCE, onEnter);
    map.on('mouseleave', SOURCE, onLeave);
    // Beim Verschieben andere Spots im Ausschnitt: neu planen.
    let planState: GameState | null = null;
    const replan = () => {
      if (!planState) return;
      const c = map.getCenter();
      figures = planFigures(planState, { lng: c.lng, lat: c.lat }, viewTest(), MAX_FIGURES - patrols.length);
      draw(performance.now());
    };
    map.on('moveend', replan);

    return {
      update(state) {
        planState = state;
        syncPatrols(state);
        const c = map.getCenter();
        const next = planFigures(state, { lng: c.lng, lat: c.lat }, viewTest(), MAX_FIGURES - patrols.length);
        const key = next.map((f) => f.key + f.spotId).join(',') + patrols.map((p) => p.veedelId).join(',');
        figures = next;
        if (key !== lastKey) {
          lastKey = key;
          draw(performance.now());
        }
        sync();
      },
      destroy() {
        offMotion();
        stopFrames?.();
        map.off('click', SOURCE, onClick);
        map.off('mouseenter', SOURCE, onEnter);
        map.off('mouseleave', SOURCE, onLeave);
        map.off('moveend', replan);
        if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      },
    };
  },
};
