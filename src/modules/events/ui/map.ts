// Stadt-Events auf der Karte (Auftrag 31): Bei den Kölner Lichtern geht abends über dem Rhein zwischen
// Hohenzollernbrücke und Deutzer Brücke ein Feuerwerk hoch (mapEffects firework, nur CSS), beim Hafengeburtstag ziehen
// Schiffe auf der Elbe vor den Landungsbrücken hin und her (3D-Mini-Fahrzeuge auf dem Wasserweg aus roads.shipRoute).
// Nur in der aktiven Stadt und in der Stadtansicht. Reine Optik mit eigenem Zufall: steht bei Tempo 0 und verstecktem
// Tab, bei "Bewegung reduzieren" gibt es kein Feuerwerk.

import { clock, type GameState, type LngLat } from '../../../core';
import { createVehicle, firework, type MapLayer, mapToken, motion, onMapFrame, type VehicleHandle } from '../../../map';
import { activeCity } from '../../city';
import { shipRoute } from '../../roads';
import { activeEvents } from '../index';

/** Rhein zwischen Hohenzollernbrücke und Deutzer Brücke (Mitte des Stroms): dort steigen die Raketen. */
const RHINE_SHOW: readonly [LngLat, LngLat] = [
  { lng: 6.9668, lat: 50.9408 },
  { lng: 6.9707, lat: 50.9342 },
];
/** Feuerwerk ab dieser Stunde bis Mitternacht. */
const FIREWORK_FROM_HOUR = 21;
/** Abstand zwischen zwei Schlägen in echten Sekunden (zufällig dazwischen), schneller mit dem Spieltempo. */
const FIREWORK_GAP: readonly [number, number] = [0.35, 1.1];
/** Darunter ist die Stadt zu klein für das Feuerwerk. */
const SHOW_MIN_ZOOM = 11.5;
/** Elbe vor den Landungsbrücken (Längengrade), auf der die Schiffe zum Hafengeburtstag fahren. */
const ELBE_PARADE: readonly [number, number] = [9.86, 9.975];
const PARADE_SHIPS = 4;
/** Eine Runde (hin und zurück über die Paradestrecke) dauert so viele Spielminuten. */
const PARADE_MINUTES = 300;

/** Kleiner Zufall nur für die Optik (nie ctx.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const eventsLayer: MapLayer = {
  id: 'events.map',
  order: 60,
  mount(ctx) {
    const { map } = ctx;
    const colors = ['--hud-gold', '--cat-money', '--cat-chat', '--cat-people', '--cat-dirty'].map((t) =>
      mapToken(t, '#f2c766'),
    );
    const random = lcg(31);
    let showOn = false;
    let wait = 0;
    let lastNow = 0;
    let stopShow: (() => void) | null = null;

    const burst = () => {
      const t = random();
      const along = {
        lng: RHINE_SHOW[0].lng + (RHINE_SHOW[1].lng - RHINE_SHOW[0].lng) * t + (random() - 0.5) * 0.002,
        lat: RHINE_SHOW[0].lat + (RHINE_SHOW[1].lat - RHINE_SHOW[0].lat) * t + (random() - 0.5) * 0.001,
      };
      firework(map, along, { color: colors[Math.floor(random() * colors.length)], size: 34 + random() * 30 });
    };
    const frame = (now: number) => {
      // Echte Zeit statt des gedeckelten Bildabstands: auch bei wenigen Bildern pro Sekunde gleich viele Schläge.
      const elapsed = lastNow ? Math.min(2, (now - lastNow) / 1000) : 0;
      lastNow = now;
      if (map.getZoom() < SHOW_MIN_ZOOM) return;
      wait -= elapsed * Math.sqrt(Math.max(0, motion.speed));
      for (let n = 0; wait <= 0 && n < 3; n++) {
        wait += FIREWORK_GAP[0] + random() * (FIREWORK_GAP[1] - FIREWORK_GAP[0]);
        burst();
      }
    };
    const syncShow = () => {
      const wanted = showOn && !motion.reduced;
      if (wanted && !stopShow) {
        // Der erste Schlag gleich, sobald die Show beginnt.
        wait = 0;
        lastNow = 0;
        stopShow = onMapFrame(frame, 'events.fireworks');
      }
      if (!wanted && stopShow) {
        stopShow();
        stopShow = null;
      }
    };

    // Schiffe zum Hafengeburtstag: Runden auf der Elbe (hin und zurück, immer mit dem Bug voran), versetzt gestartet.
    let ships: { vehicle: VehicleHandle; offset: number; last: number }[] = [];
    const paradePath = (): LngLat[] => {
      const elbe = shipRoute('hamburg');
      return elbe.filter((p) => p.lng >= ELBE_PARADE[0] && p.lng <= ELBE_PARADE[1]);
    };
    const startParade = () => {
      const path = paradePath();
      if (path.length < 2) return;
      const round = [...path, ...path.slice(0, -1).reverse()];
      ships = Array.from({ length: PARADE_SHIPS }, (_, i) => ({
        vehicle: createVehicle(map, { path: round, kind: 'ship', title: 'Hafengeburtstag' }),
        offset: i / PARADE_SHIPS,
        last: -1,
      }));
    };
    const stopParade = () => {
      for (const s of ships) s.vehicle.remove();
      ships = [];
    };

    return {
      update(state: GameState) {
        const city = activeCity(state);
        const running = activeEvents(state, city).map((e) => e.id);
        const hour = clock.hour(state.time);
        showOn = running.includes('lichter') && hour >= FIREWORK_FROM_HOUR && ctx.ui.mapView() === 'city:koeln';
        syncShow();
        const parade = running.includes('hafengeburtstag') && city === 'hamburg';
        if (parade && ships.length === 0) startParade();
        if (!parade && ships.length > 0) stopParade();
        for (const ship of ships) {
          const u = (state.time / PARADE_MINUTES + ship.offset) % 1;
          // Neue Runde: an den Anfang springen statt die ganze Strecke zurückzugleiten.
          if (u < ship.last) ship.vehicle.jumpTo(u);
          else ship.vehicle.setProgress(u);
          ship.last = u;
        }
      },
      destroy() {
        stopShow?.();
        stopParade();
      },
    };
  },
};
