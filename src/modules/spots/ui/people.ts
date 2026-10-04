// Leute an Spots auf der Karte (Auftrag 31): kleine Figuren am Fuß der Spot-Marker, Läufer und Sicherheit in der
// Farbe people, wartende Kunden in goods (gehen beim Kauf, das Geld-Popup kommt wie bisher), dazu eine Streife in law,
// die in Veedeln mit hoher Heat über die Straßen von Spot zu Spot geht. Symbol-Ebene mit SDF-Figur, keine HTML-Marker;
// nur im Ausschnitt, unter Zoom 14 unsichtbar, höchstens 60 Figuren. Bei Tempo 0 und verstecktem Tab steht alles, bei
// "Bewegung reduzieren" pendelt nichts. Antippen einer Figur öffnet das Spot-Blatt. Reine Optik.
//
// Sparsam mit setData: Jede neue Geometrie einer Symbol-Ebene lässt MapLibre die Symbole neu einsortieren und die
// Deckkraft aller Beschriftungen der Karte neu rechnen (am Handy mit Drossel Long Tasks über 50 ms). Darum stehen die
// Figuren fest in ihrer Quelle (neu nur, wenn jemand kommt oder geht), und das Pendeln läuft über icon-translate
// (Paint-Eigenschaft, kein neues Einsortieren) in drei Gruppen mit eigener Phase. Nur die Streife bekommt neue
// Stellungen, höchstens 10-mal pro Sekunde und nur, wenn sie sich um ein Pixel bewegt hat.

import type { GeoJSONSource } from 'maplibre-gl';
import type { GameState, LngLat } from '../../../core';
import {
  ensureFigureImage,
  type MapLayer,
  type MeasuredPath,
  mapToken,
  measurePath,
  metersPerPixel,
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
const PATROL_SOURCE = 'spots.people.patrol';
/** Gruppen mit eigener Phase fürs Pendeln (je eine Ebene, gleiche Quelle; jede Ebene kostet beim Zeichnen). */
const GROUPS = 3;
const groupLayer = (g: number) => `spots.people.${g}`;
const LAYERS = [...Array.from({ length: GROUPS }, (_, g) => groupLayer(g)), PATROL_SOURCE];
/** Neue Stellungen höchstens so oft pro Sekunde (Budget aus Auftrag 31). */
const UPDATES_PER_SECOND = 10;
/** Pendeln: Ausschlag in Symbol-Einheiten und Dauer einer Schwingung (Sekunden). */
const SWAY = 2.2;
const SWAY_SECONDS = 3.2;
/** Gehtempo der Streife (m/s, etwas schneller als echt, damit man es sieht), mal Spieltempo. */
const PATROL_SPEED = 3.5;
/** Größe des Symbols nach Zoom (wie icon-size unten), für den Ausschlag in Pixeln. */
const SIZE_STOPS: [number, number][] = [
  [14, 0.42],
  [16, 0.6],
  [18, 0.8],
];

function iconSizeAt(zoom: number): number {
  if (zoom <= SIZE_STOPS[0][0]) return SIZE_STOPS[0][1];
  for (let i = 1; i < SIZE_STOPS.length; i++) {
    const [z1, s1] = SIZE_STOPS[i];
    const [z0, s0] = SIZE_STOPS[i - 1];
    if (zoom <= z1) return s0 + ((s1 - s0) * (zoom - z0)) / (z1 - z0);
  }
  return SIZE_STOPS[SIZE_STOPS.length - 1][1];
}

/** Gruppe fürs Pendeln aus der festen Phase der Figur. */
const groupOf = (f: Figure) => Math.min(GROUPS - 1, Math.floor((f.phase / (2 * Math.PI)) * GROUPS));

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
    const empty = { type: 'FeatureCollection' as const, features: [] };
    // Kacheln nur bis Zoom 14 (darüber vergrößert): weniger Kacheln zum Zeichnen, Punkte bleiben genau genug.
    map.addSource(SOURCE, { type: 'geojson', data: empty, maxzoom: PEOPLE_MIN_ZOOM });
    map.addSource(PATROL_SOURCE, { type: 'geojson', data: empty, maxzoom: PEOPLE_MIN_ZOOM });
    const layout = {
      'icon-image': image,
      'icon-anchor': 'bottom',
      'icon-size': ['interpolate', ['linear'], ['zoom'], ...SIZE_STOPS.flat()],
      'icon-offset': ['get', 'offset'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-pitch-alignment': 'viewport',
    } as never;
    const paint = {
      'icon-color': ['get', 'color'],
      'icon-halo-color': 'rgba(10, 12, 16, 0.7)',
      'icon-halo-width': 1.2,
      'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.4, 0.95],
      'icon-translate-anchor': 'viewport',
      // Ohne Übergang: sonst zeichnet die Karte ständig, auch wenn sonst nichts läuft.
      'icon-translate-transition': { duration: 0, delay: 0 },
    } as never;
    for (let g = 0; g < GROUPS; g++) {
      map.addLayer({
        id: groupLayer(g),
        type: 'symbol',
        source: SOURCE,
        minzoom: PEOPLE_MIN_ZOOM,
        filter: ['==', ['get', 'group'], g],
        layout,
        paint,
      });
    }
    map.addLayer({ id: PATROL_SOURCE, type: 'symbol', source: PATROL_SOURCE, minzoom: PEOPLE_MIN_ZOOM, layout, paint });

    let figures: Figure[] = [];
    let patrols: Patrol[] = [];
    let since = 0;
    const started = performance.now();
    let lastKey = '';
    let stopFrames: (() => void) | null = null;
    /** Zuletzt gesetzter Ausschlag je Gruppe (Pixel) und zuletzt gezeigte Stellung der Streifen. */
    const swayShown: number[] = Array.from({ length: GROUPS }, () => 0);
    let patrolShown = '';

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

    /** Die festen Figuren in die Quelle (nur, wenn jemand kommt oder geht). */
    const drawFigures = () => {
      const features = figures.map((f) => ({
        type: 'Feature' as const,
        properties: { spotId: f.spotId, color: colors[f.kind], offset: f.offset, group: groupOf(f) },
        geometry: { type: 'Point' as const, coordinates: [f.position.lng, f.position.lat] },
      }));
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };

    /** Pendeln: je Gruppe ein Ausschlag in Pixeln über icon-translate, nur bei Änderung. */
    const drawSway = (now: number) => {
      const t = (now - started) / 1000;
      const amplitude = motion.reduced ? 0 : SWAY * iconSizeAt(map.getZoom());
      for (let g = 0; g < GROUPS; g++) {
        const phase = ((g + 0.5) / GROUPS) * 2 * Math.PI;
        const x = Math.round(Math.sin(t * ((2 * Math.PI) / SWAY_SECONDS) + phase) * amplitude * 10) / 10;
        if (x === swayShown[g]) continue;
        swayShown[g] = x;
        if (map.getLayer(groupLayer(g)))
          map.setPaintProperty(groupLayer(g), 'icon-translate', [x, 0], { validate: false });
      }
    };

    /** Streifen: neue Stellung nur, wenn sie sich um mindestens ein Pixel bewegt hat (oder neu ist). */
    const drawPatrols = (force = false) => {
      const inView = viewTest();
      const step = metersPerPixel(map.getCenter().lat, map.getZoom());
      const features = [];
      const keys: string[] = [];
      for (const patrol of patrols) {
        const p = pointAtDistance(patrol.path, patrol.along);
        if (!inView(p)) continue;
        const target = patrol.spots[(patrol.index + 1) % Math.max(1, patrol.spots.length)] ?? patrol.spots[0];
        keys.push(`${patrol.veedelId}:${patrol.index}:${Math.round(patrol.along / step)}`);
        features.push({
          type: 'Feature' as const,
          properties: { spotId: target?.id ?? '', color: colors.patrol, offset: [0, 14] },
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        });
      }
      const key = keys.join(',');
      if (!force && key === patrolShown) return;
      patrolShown = key;
      (map.getSource(PATROL_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };

    const frame = (now: number, dt: number) => {
      if (map.getZoom() < PEOPLE_MIN_ZOOM || (figures.length === 0 && patrols.length === 0)) return;
      walk(dt * Math.sqrt(Math.max(0, motion.speed)));
      since += dt;
      if (since < 1 / UPDATES_PER_SECOND) return;
      since = 0;
      drawSway(now);
      if (patrols.length > 0) drawPatrols();
    };

    /** Takt nur, solange es etwas zu bewegen gibt (Pendeln oder Streife). */
    const sync = () => {
      const moving = (figures.length > 0 && !motion.reduced) || patrols.length > 0;
      if (moving && !stopFrames) stopFrames = onMapFrame(frame, 'people');
      if (!moving && stopFrames) {
        stopFrames();
        stopFrames = null;
      }
    };
    const offMotion = onMotionChange(() => {
      sync();
      drawSway(performance.now());
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
    for (const id of LAYERS) {
      map.on('click', id, onClick);
      map.on('mouseenter', id, onEnter);
      map.on('mouseleave', id, onLeave);
    }

    /** Neu planen (Zustand oder Ausschnitt geändert); in die Quelle nur, wenn sich die Figuren geändert haben. */
    let planState: GameState | null = null;
    const plan = () => {
      if (!planState) return;
      const c = map.getCenter();
      figures = planFigures(planState, { lng: c.lng, lat: c.lat }, viewTest(), MAX_FIGURES - patrols.length);
      const key = figures.map((f) => f.key + f.spotId).join(',');
      if (key !== lastKey) {
        lastKey = key;
        drawFigures();
      }
      drawPatrols();
      sync();
    };
    // Beim Verschieben andere Spots im Ausschnitt.
    map.on('moveend', plan);

    return {
      update(state) {
        planState = state;
        syncPatrols(state);
        plan();
      },
      destroy() {
        offMotion();
        stopFrames?.();
        for (const id of LAYERS) {
          map.off('click', id, onClick);
          map.off('mouseenter', id, onEnter);
          map.off('mouseleave', id, onLeave);
          if (map.getLayer(id)) map.removeLayer(id);
        }
        map.off('moveend', plan);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);
        if (map.getSource(PATROL_SOURCE)) map.removeSource(PATROL_SOURCE);
      },
    };
  },
};
