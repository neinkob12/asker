// Verfolgungsjagd (Auftrag 44, Teil 1): Kamera hinter und über dem eigenen Wagen auf der echten 3D-Karte der Stadt,
// echte Straßen, Blaulicht im Rückspiegel. Spiellogik im Modell (model.ts, net.ts), Darstellung als eigene WebGL-Ebene
// (scene.ts, draw.ts), Ton in sounds.ts. Hier: Karte übernehmen (Kamera, Bedienung aus, Kulisse aus) und am Ende
// zurückgeben, Bildschleife, Eingaben, HUD im Look Glas.
//
// Die Spielzeit steht still, solange das Minispiel offen ist: Kamera und Ebene laufen über die eigene Schleife
// (useFrameLoop), nicht über onMapFrame. Pro Bild nur Rechnen und Schreiben, keine Layout-Lesungen.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { daylightAt, mapToken, metersPerPixel } from '../../../../../map';
import { audio, haptic, Icon, prefersReducedMotion, useGame } from '../../../../../ui';
import { activeCity, getCity } from '../../../../city';
import { getWarehouses } from '../../../../goods';
import { roadGraph } from '../../../../roads';
import { allVeedel, getVeedel, veedelAt } from '../../../../veedel';
import { HudBar, HudTimer } from '../../kit/hud';
import { TouchControls, useSwipe } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import { ChaseFx, drawChase, type Palette } from './draw';
import { chaseMap } from './map';
import {
  ABTAUCHEN_SECONDS,
  type ChaseState,
  chasePicks,
  chaseScore,
  choose,
  createChase,
  dumpGoods,
  escaped,
  initChase,
  routeAhead,
  stepChase,
  TIME_LIMIT,
  timeLeft,
  type Upcoming,
  upcoming,
} from './model';
import { chaseNet, toLngLat } from './net';
import { radioLine } from './radio';
import { ChaseScene, mountScene, rgbOf } from './scene';
import { CHASE_SOUNDS, ENGINE_STEP, HELI_CHUNK, SIREN_CHUNK, setEngine, setSirenPitch } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'KeyX',
];

/** So lange läuft das Ende (Zeitlupe) in echten Sekunden, bevor das Ergebnis kommt. */
const END_SECONDS = 2.4;
/** HUD-Texte so oft pro Sekunde neu (Zahlen, die sich jedes Bild ändern, schreibt die Schleife direkt). */
const HUD_RATE = 8;
/** Zoom der Kamera im Stand (schneller = bis zu eine Stufe weiter weg). */
const CAMERA_ZOOM = { desktop: 18.9, mobile: 18.5 };
/** Ebenen der Karte, die während der Jagd stören (Verkehr als Kulisse, Leute an Spots). */
const HIDDEN_LAYERS = ['roads.traffic', 'spots.people'];

interface Hud {
  left: number;
  sight: boolean;
  nearest: number;
  heliIn: number;
  heliActive: boolean;
  heliOnYou: boolean;
  next: Upcoming | null;
  tooFast: boolean;
  radio: string;
  radioKey: number;
  dumped: boolean;
  hideout: string | null;
  uturn: boolean;
  deadEnd: boolean;
}

/** Farben aus den Design-Tokens (Dunkelvariante), einmal beim Start gelesen. */
function readPalette(): Palette {
  const c = (token: string, fallback: string) => rgbOf(mapToken(token, fallback), rgbOf(fallback, [1, 1, 1]));
  return {
    player: c('--hud-gold', '#f2c766'),
    playerCabin: c('--map-traffic-truck', '#50555d'),
    police: c('--map-traffic-cabin', '#c9cdd3'),
    policeBand: c('--cat-law', '#4c8fe0'),
    cabin: c('--map-traffic-truck', '#50555d'),
    red: c('--cat-danger', '#ff5a5f'),
    blue: c('--cat-law', '#4c8fe0'),
    white: [1, 0.97, 0.9],
    head: [1, 0.93, 0.72],
    tail: c('--cat-danger', '#ff5a5f'),
    spark: [1, 0.72, 0.3],
    smoke: [0.62, 0.62, 0.66],
    shadow: [0.06, 0.05, 0.1],
    skid: [0.05, 0.05, 0.06],
    gold: c('--hud-gold', '#f2c766'),
    parcel: c('--cat-goods', '#b99a5e'),
    civilians: ['--map-traffic-1', '--map-traffic-2', '--map-traffic-3', '--map-traffic-4', '--map-traffic-van'].map(
      (t) => c(t, '#8d939c'),
    ),
  };
}

/** Wo es losgeht ([lng, lat]): Start aus den params, sonst das Veedel der Challenge, sonst die Mitte der Stadt. */
function startOf(params: Record<string, unknown>, veedelId: string | undefined, cityId: string): [number, number] {
  const s = params.start;
  if (Array.isArray(s) && s.length === 2 && s.every((v) => Number.isFinite(v))) return [s[0] as number, s[1] as number];
  const veedel = veedelId ? getVeedel(veedelId) : undefined;
  if (veedel && veedel.cityId === cityId) return [veedel.center.lng, veedel.center.lat];
  const first = allVeedel(cityId)[0];
  if (first) return [first.center.lng, first.center.lat];
  const city = getCity(cityId);
  return city ? [city.center.lng, city.center.lat] : [6.9578, 50.9413];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (deg: number) => ((deg % 360) + 360) % 360;
const angleDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/** Abzweige als kleine Skizze: woher du kommst (unten), wohin es geht (gewählt in Gold). */
function TurnSketch(props: { next: Upcoming | null; tooFast: boolean }) {
  const { next } = props;
  if (!next) return null;
  const cx = 36;
  const cy = 40;
  const r = 26;
  const end = (a: number, k = 1): [number, number] => [cx - Math.sin(a) * r * k, cy - Math.cos(a) * r * k];
  const chosen = next.chosen;
  return (
    <svg class="chase-turn__sketch" viewBox="0 0 72 72" aria-hidden="true">
      <line class="chase-turn__road" x1={cx} y1={cy} x2={cx} y2={70} />
      {next.branches.map((b) => {
        const [x, y] = end(b.angle);
        return <line key={`${b.leg.edge}`} class="chase-turn__road" x1={cx} y1={cy} x2={x} y2={y} />;
      })}
      {chosen && (
        <g class={`chase-turn__pick${props.tooFast ? ' is-fast' : ''}`}>
          <line x1={cx} y1={70} x2={cx} y2={cy} />
          <line x1={cx} y1={cy} x2={end(chosen.angle, 0.82)[0]} y2={end(chosen.angle, 0.82)[1]} />
          <polygon
            points={[end(chosen.angle, 1.08), end(chosen.angle + 0.42, 0.62), end(chosen.angle - 0.42, 0.62)]
              .map((p) => p.join(','))
              .join(' ')}
          />
        </g>
      )}
      {next.deadEnd && <line class="chase-turn__dead" x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} />}
    </svg>
  );
}

export function ChaseGame(props: MinigameViewProps) {
  const { challenge, running, onFinish, preview } = props;
  const { state: gameState } = useGame();
  const reduced = useMemo(prefersReducedMotion, []);
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const cityId = preview ? activeCity(gameState) : challenge.cityId;
  const net = useMemo(() => chaseNet(roadGraph(cityId)), [cityId]);
  const setup = useMemo(() => {
    const [lng, lat] = startOf(challenge.params, challenge.veedelId, cityId);
    const warehouses = getWarehouses(gameState, cityId).map((w) => {
      const [x, y] = net.g.toMeters({ lng: w.lng, lat: w.lat });
      return { id: w.id, label: w.name, x, y };
    });
    return createChase(net, {
      seed: challenge.seed,
      difficulty: challenge.difficulty,
      start: net.g.toMeters({ lng, lat }),
      warehouses,
      clock: Number(challenge.params.clock),
      mobile: coarse,
    });
  }, [net, challenge.seed]);
  // Wie useRef, aber nur einmal angelegt (initChase sucht Startrichtung und erste Streife).
  const [game] = useState<{ current: ChaseState }>(() => ({ current: initChase(net, setup) }));
  const palette = useMemo(readPalette, []);
  // Dunkelheit aus der Spielzeit (steht während des Minispiels still).
  const night = useMemo(() => clamp(1 - daylightAt(gameState.time), 0, 1), []);
  const root = useRef<HTMLDivElement>(null);
  const refs = {
    speed: useRef<HTMLSpanElement>(null),
    turbo: useRef<HTMLSpanElement>(null),
    ring: useRef<SVGCircleElement>(null),
    vignette: useRef<HTMLDivElement>(null),
    lines: useRef<HTMLDivElement>(null),
    flash: useRef<HTMLDivElement>(null),
    arrow: useRef<HTMLDivElement>(null),
    arrowLabel: useRef<HTMLSpanElement>(null),
    mirror: useRef<HTMLDivElement>(null),
  };
  const view = useRef({
    map: null as MapLibreMap | null,
    scene: null as ChaseScene | null,
    fx: new ChaseFx(reduced),
    cam: { x: 0, y: 0, bearing: 0, zoom: 17.6, pitch: 58, ready: false },
    t: 0,
    endT: -1,
    sent: false,
    touch: { brake: false, turbo: false },
    lastHud: -1,
    tooFast: false,
    /** Entwicklung: Rechenzeit der Bildschleife (ohne das Zeichnen der Karte). */
    perf: { frames: 0, total: 0, max: 0 },
    lastEngine: -1,
    lastFreq: 40,
    lastSiren: -1,
    lastHeli: -1,
    lastVeedel: '',
    lastVeedelCheck: -1,
    radioCount: 0,
    pulse: 0,
    size: { w: 1280, h: 800 },
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const [hud, setHud] = useState<Hud>(() => ({
    left: TIME_LIMIT,
    sight: true,
    nearest: game.current.nearest,
    heliIn: setup.heliAt,
    heliActive: false,
    heliOnYou: false,
    next: upcoming(net, game.current),
    tooFast: false,
    radio: 'Zentrale: Flüchtiges Fahrzeug, alle Einheiten.',
    radioKey: 0,
    dumped: false,
    hideout: null,
    uturn: false,
    deadEnd: false,
  }));

  const lngLatOf = (x: number, y: number) => toLngLat(net, x, y);

  // ------------------------------------------------------------------ Karte übernehmen und zurückgeben
  useEffect(() => {
    const map = chaseMap();
    if (!map) return;
    const v = view.current;
    v.map = map;
    const saved = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      padding: map.getPadding(),
    };
    // Ränder der Karte (HUD oben, Dock unten am Handy) gelten während der Jagd nicht: Die Mitte ist die Mitte der
    // Fläche, die das Minispiel bedeckt (einmal gemessen, nicht pro Bild).
    const width = map.getContainer().clientWidth;
    const covered = root.current?.clientWidth ?? width;
    const height = root.current?.clientHeight ?? 800;
    // Der Wagen sitzt unter der Mitte (hochkant noch tiefer): Man sieht mehr von der Straße voraus.
    const top = Math.round(height * (height > covered ? 0.3 : 0.12));
    v.padding = { top, bottom: 0, left: 0, right: Math.max(0, width - covered) };
    const handlers = [
      map.dragPan,
      map.scrollZoom,
      map.boxZoom,
      map.dragRotate,
      map.keyboard,
      map.doubleClickZoom,
      map.touchZoomRotate,
      map.touchPitch,
    ];
    const wasOn = handlers.map((h) => h.isEnabled());
    for (const h of handlers) h.disable();
    const hidden: string[] = [];
    for (const id of HIDDEN_LAYERS) {
      if (!map.getLayer(id)) continue;
      if (map.getLayoutProperty(id, 'visibility') === 'none') continue;
      map.setLayoutProperty(id, 'visibility', 'none');
      hidden.push(id);
    }
    document.documentElement.classList.add('is-chasing');
    const scene = new ChaseScene('minigames.chase', net.mLng);
    v.scene = scene;
    const unmount = mountScene(map, scene);
    // Kamera einmal hinter den Wagen fliegen (in der Einleitung), danach führt die Schleife.
    const p = game.current.player;
    const rad = (p.heading * Math.PI) / 180;
    v.cam = {
      x: p.x + Math.sin(rad) * 10,
      y: p.y + Math.cos(rad) * 10,
      bearing: p.heading,
      zoom: coarse ? CAMERA_ZOOM.mobile : CAMERA_ZOOM.desktop,
      pitch: 58,
      ready: true,
    };
    const [lng, lat] = lngLatOf(v.cam.x, v.cam.y);
    map.flyTo({
      center: [lng, lat],
      padding: v.padding,
      zoom: v.cam.zoom,
      bearing: v.cam.bearing,
      pitch: v.cam.pitch,
      duration: reduced ? 0 : 1600,
      essential: true,
    });
    renderFrame(0);
    // Entwicklung: Zustand der Jagd in der Konsole (Screenshots, Fehlersuche).
    if (import.meta.env.DEV) {
      // advance(s): Modell s Sekunden mit Gas weiterfahren (biegt an Kreuzungen abwechselnd ab), für Bilder.
      const advance = (seconds: number, gas = true) => {
        const g = game.current;
        for (let i = 0; i < seconds * 30 && !g.end; i++) {
          if (gas && i % 90 === 0) choose(g, i % 180 === 0 ? 'left' : 'right');
          stepChase(net, setup, g, { gas, brake: false, turbo: false }, 1 / 30);
          view.current.fx.onEvents(g.events, g, view.current.t);
          g.events.length = 0;
        }
      };
      (window as unknown as { chase?: unknown }).chase = { game, view, setup, map, advance };
    }
    return () => {
      if (import.meta.env.DEV) delete (window as unknown as { chase?: unknown }).chase;
      unmount();
      v.scene = null;
      v.map = null;
      document.documentElement.classList.remove('is-chasing');
      for (const id of hidden) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      handlers.forEach((h, i) => {
        if (wasOn[i]) h.enable();
      });
      map.stop();
      map.easeTo({ ...saved, duration: reduced ? 0 : 700 });
    };
  }, []);

  // Größe der Bühne (für den Pfeil zum Versteck), nicht pro Bild gemessen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) view.current.size = { w: box.width, h: box.height };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ------------------------------------------------------------------ Eingaben
  const keys = useGameKeys(
    KEYS,
    (press) => {
      const g = game.current;
      if (g.end) return;
      if (press.code === 'ArrowLeft' || press.code === 'KeyA') pick('left');
      else if (press.code === 'ArrowRight' || press.code === 'KeyD') pick('right');
      else if (press.code === 'KeyX') dump();
    },
    running,
  );
  const pick = (dir: 'left' | 'right' | 'straight') => {
    choose(game.current, dir);
    audio.playThrottled('minigames.click', 40, { volume: 0.5 });
    refreshHud(true);
  };
  const dump = () => {
    if (!running || !dumpGoods(game.current)) return;
    haptic('medium');
    refreshHud(true);
  };
  useSwipe(
    root,
    (dir) => {
      if (dir === 'left' || dir === 'right') pick(dir);
    },
    running,
  );

  // ------------------------------------------------------------------ HUD
  const refreshHud = (force = false) => {
    const v = view.current;
    if (!force && v.t - v.lastHud < 1 / HUD_RATE) return;
    v.lastHud = v.t;
    const g = game.current;
    const next = upcoming(net, g);
    const brakeDist = (g.player.v * g.player.v) / (2 * 15) + g.player.v * 0.4;
    const tooFast = !!next.chosen && g.player.v > next.safe * 1.15 && next.distance < brakeDist + 15;
    v.tooFast = tooFast;
    const h = g.inHideout >= 0 ? setup.hideouts[g.inHideout].label : null;
    setHud((prev) => ({
      ...prev,
      left: timeLeft(g),
      sight: g.sight,
      nearest: g.nearest,
      heliIn: Math.max(0, setup.heliAt - g.t),
      heliActive: g.heli.active,
      heliOnYou: g.heli.onYou,
      next,
      tooFast,
      dumped: g.dumped,
      hideout: h,
      uturn: g.player.uturn > 0,
      deadEnd: next.deadEnd && next.distance < 40,
    }));
  };

  const say = (text: string) => {
    const v = view.current;
    v.radioCount += 1;
    setHud((prev) => ({ ...prev, radio: text, radioKey: v.radioCount }));
    audio.play(CHASE_SOUNDS.radio, { volume: 0.5 });
  };

  /** Veedel an einer Stelle (für die Funk-Zeile). */
  const veedelNameAt = (x: number, y: number): string => {
    const [lng, lat] = lngLatOf(x, y);
    return veedelAt(lng, lat)?.name ?? '';
  };

  // ------------------------------------------------------------------ Ton
  const sound = () => {
    const v = view.current;
    const g = game.current;
    const p = g.player;
    if (v.t - v.lastEngine >= ENGINE_STEP) {
      // Drehzahl: steigt mit dem Tempo, fällt beim Hochschalten etwas ab (drei Gänge).
      const gear = p.v < 9 ? 0 : p.v < 18 ? 1 : 2;
      const freq = (38 + (p.v - [0, 7, 15][gear]) * [5.2, 3.6, 2.8][gear]) * (p.turboOn ? 1.1 : 1);
      setEngine(v.lastFreq, freq, clamp(p.v / 30 + (p.turboOn ? 0.3 : 0), 0, 1));
      v.lastFreq = freq;
      audio.play(CHASE_SOUNDS.engine, { volume: g.end ? 0.35 : 0.7 });
      v.lastEngine = v.t;
    }
    // Martinshorn: lauter je näher, verstummt nach der Flucht.
    const near = g.nearest;
    if (v.t - v.lastSiren >= SIREN_CHUNK && Number.isFinite(near) && !(g.end && escaped(g))) {
      const vol = clamp(1 - near / 520, 0.08, 1);
      setSirenPitch(near < 60 ? 1.03 : 1);
      audio.play(CHASE_SOUNDS.siren, { volume: vol * 0.9 });
      v.lastSiren = v.t;
    }
    if (g.heli.active && v.t - v.lastHeli >= HELI_CHUNK - 0.04) {
      const d = Math.hypot(g.heli.x - p.x, g.heli.y - p.y);
      audio.play(CHASE_SOUNDS.heli, { volume: clamp(1 - d / 400, 0.15, 0.85) });
      v.lastHeli = v.t;
    }
  };

  const onEvents = () => {
    const g = game.current;
    for (const e of g.events) {
      switch (e.kind) {
        case 'skid':
          audio.playThrottled(CHASE_SOUNDS.squeal, 250, { volume: 0.4 + 0.5 * e.power });
          haptic('light');
          break;
        case 'squeal':
          audio.playThrottled(CHASE_SOUNDS.squeal, 400, { volume: 0.25 });
          break;
        case 'bump':
          audio.play(CHASE_SOUNDS.bump, { volume: 0.5 + 0.5 * e.power });
          audio.playThrottled(CHASE_SOUNDS.honk, 900, { volume: 0.6 });
          haptic('medium');
          break;
        case 'crash':
          audio.play(CHASE_SOUNDS.crash, { volume: 1 });
          haptic('warning');
          say('Zentrale: Fahrzeug in der Sperre! Zugriff!');
          break;
        case 'turbo':
          audio.play(CHASE_SOUNDS.turbo, { volume: 0.6 });
          break;
        case 'uturn':
          audio.play(CHASE_SOUNDS.squeal, { volume: 0.5 });
          break;
        case 'dump':
          audio.play(CHASE_SOUNDS.dump, { volume: 0.8 });
          say('Streife 2: Der wirft was aus dem Fenster! Vorsicht!');
          break;
        case 'cop':
          if (g.t > 1) say(radioLine(g, 'cop', veedelNameAt(e.x, e.y), view.current.radioCount));
          break;
        case 'roadblock':
          say(radioLine(g, 'roadblock', veedelNameAt(e.x, e.y), view.current.radioCount));
          break;
        case 'heli':
          say(radioLine(g, 'heli', veedelNameAt(g.player.x, g.player.y), view.current.radioCount));
          break;
        case 'lost':
          say(radioLine(g, 'lost', veedelNameAt(g.player.x, g.player.y), view.current.radioCount));
          haptic('selection');
          break;
        case 'spotted':
          if (g.t > 2) say(radioLine(g, 'spotted', veedelNameAt(g.player.x, g.player.y), view.current.radioCount));
          break;
        case 'escaped':
          audio.play('minigames.go', { volume: 0.6 });
          break;
        case 'caught':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.5 });
          say('Zentrale: Zugriff. Fahrzeug gestellt.');
          break;
        default:
          break;
      }
    }
  };

  // ------------------------------------------------------------------ Kamera und Bild
  const renderFrame = (dt: number) => {
    const v = view.current;
    const map = v.map;
    const scene = v.scene;
    if (!map || !scene) return;
    const g = game.current;
    const p = g.player;
    const ending = g.end !== null;
    const speedK = clamp(p.v / 30, 0, 1);
    // Kamera: hinter und über dem Wagen, Blick voraus, schneller = weiter weg.
    const heading = v.fx.smooth(-1, p.heading, dt, p.uturn > 0 ? 2.5 : 3.2);
    const ahead = 5 + p.v * 0.7;
    const rad = (heading * Math.PI) / 180;
    const tx = p.x + Math.sin(rad) * ahead;
    const ty = p.y + Math.cos(rad) * ahead;
    const base = coarse ? CAMERA_ZOOM.mobile : CAMERA_ZOOM.desktop;
    let zoomTarget = base - speedK * 0.6;
    let pitchTarget = 52 + speedK * 8;
    if (ending) {
      zoomTarget = escaped(g) ? base - 1.1 : base + 0.35;
      pitchTarget = escaped(g) ? 50 : 66;
    }
    const k = 1 - Math.exp(-dt * 3.2);
    const cam = v.cam;
    // Weit weg (z.B. nach einem Sprung): sofort hin statt lange nachzuziehen.
    if (Math.hypot(tx - cam.x, ty - cam.y) > 150) {
      cam.x = tx;
      cam.y = ty;
      cam.bearing = heading;
    }
    cam.x += (tx - cam.x) * Math.min(1, k * 1.6);
    cam.y += (ty - cam.y) * Math.min(1, k * 1.6);
    cam.bearing = wrap(cam.bearing + angleDiff(cam.bearing, heading) * k);
    cam.zoom += (zoomTarget - cam.zoom) * (1 - Math.exp(-dt * 1.4));
    cam.pitch += (pitchTarget - cam.pitch) * (1 - Math.exp(-dt * 1.4));
    const shake = reduced ? v.fx.shake * 0.25 : v.fx.shake;
    const sx = shake * 2.2 * Math.sin(v.t * 47);
    const sy = shake * 2.2 * Math.cos(v.t * 41);
    const [lng, lat] = lngLatOf(cam.x + sx, cam.y + sy);
    if (dt > 0) {
      map.jumpTo({
        center: [lng, lat],
        padding: v.padding,
        zoom: cam.zoom,
        bearing: cam.bearing + shake * 1.5 * Math.sin(v.t * 33),
        pitch: Math.min(72, cam.pitch),
      });
    }
    const mpp = metersPerPixel(lat, map.getZoom());
    v.pulse = 0.5 + 0.5 * Math.sin(v.t * 4);
    const braking = keys.isDown('ArrowDown') || keys.isDown('KeyS') || keys.isDown('Space') || v.touch.brake;
    drawChase({
      scene,
      state: g,
      setup,
      fx: v.fx,
      pal: palette,
      t: v.t,
      dt,
      night,
      mpp,
      braking,
      origin: [p.x, p.y],
      pulse: v.pulse,
      route: g.end ? [] : routeAhead(net, g),
      tooFast: v.tooFast,
    });
  };

  /** Werte, die sich jedes Bild ändern: direkt ins DOM (kein Neuzeichnen von Preact). */
  const writeHud = () => {
    const v = view.current;
    const g = game.current;
    const p = g.player;
    if (refs.speed.current) refs.speed.current.textContent = String(Math.round(p.v * 3.6));
    if (refs.turbo.current) refs.turbo.current.style.transform = `scaleX(${p.turbo.toFixed(3)})`;
    if (refs.ring.current) refs.ring.current.style.strokeDashoffset = String((1 - g.hide) * 100);
    // Rot-blaues Pulsieren am Rand bei Sichtkontakt, stärker je näher.
    const [red, blue] = [Math.sin(v.t * 11) > 0 ? 1 : 0, Math.sin(v.t * 11) > 0 ? 0 : 1];
    const near = g.sight ? clamp(1 - g.nearest / 220, 0.25, 1) : 0;
    const reducedK = reduced ? 0.5 : 1;
    if (refs.vignette.current) {
      refs.vignette.current.style.opacity = (near * 0.85 * reducedK).toFixed(3);
      refs.vignette.current.dataset.side = red ? 'red' : 'blue';
    }
    if (refs.mirror.current) {
      refs.mirror.current.style.setProperty('--chase-red', (red * near).toFixed(2));
      refs.mirror.current.style.setProperty('--chase-blue', (blue * near).toFixed(2));
    }
    if (refs.lines.current) {
      const fast = clamp((p.v - 20) / 14, 0, 1) * (p.turboOn ? 1 : 0.55) * reducedK;
      refs.lines.current.style.opacity = fast.toFixed(3);
    }
    if (refs.flash.current) refs.flash.current.style.opacity = (v.fx.flash * 0.55 * reducedK).toFixed(3);
    // Pfeil zum nächsten Versteck am Rand (Richtung relativ zur Kamera).
    const arrow = refs.arrow.current;
    if (arrow) {
      let best = -1;
      let bestD = Infinity;
      setup.hideouts.forEach((h, i) => {
        const d = Math.hypot(h.x - p.x, h.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0 || bestD < 60 || g.end) {
        arrow.style.opacity = '0';
      } else {
        const h = setup.hideouts[best];
        const dir = ((Math.atan2(h.x - p.x, h.y - p.y) * 180) / Math.PI - v.cam.bearing) * (Math.PI / 180);
        const { w, h: hh } = v.size;
        const rx = w / 2 - 70;
        const ry = hh / 2 - (coarse ? 210 : 130);
        const s = Math.sin(dir);
        const c = Math.cos(dir);
        const t = Math.min(rx / Math.max(1e-3, Math.abs(s)), ry / Math.max(1e-3, Math.abs(c)));
        const x = w / 2 + s * t;
        const y = hh / 2 - c * t;
        arrow.style.opacity = '1';
        arrow.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        arrow.style.setProperty('--chase-dir', `${((dir * 180) / Math.PI).toFixed(1)}deg`);
        if (refs.arrowLabel.current) refs.arrowLabel.current.textContent = `${h.label} · ${Math.round(bestD)} m`;
      }
    }
  };

  // ------------------------------------------------------------------ Schleife
  useFrameLoop((dtReal) => {
    const v = view.current;
    const g = game.current;
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    // Zeitlupe am Ende.
    let scale = 1;
    if (g.end) {
      if (v.endT < 0) v.endT = 0;
      v.endT += dtReal;
      scale = reduced ? 1 : clamp(1 - v.endT * 2.2, 0.22, 1);
      if (v.endT >= (reduced ? 1.2 : END_SECONDS) && !v.sent) {
        v.sent = true;
        onFinish(chaseScore(g), chasePicks(g));
        return;
      }
    }
    const dt = dtReal * scale;
    v.t += dt;
    const braking = keys.isDown('ArrowDown') || keys.isDown('KeyS') || keys.isDown('Space') || v.touch.brake;
    const gas = !braking && (coarse || keys.isDown('ArrowUp') || keys.isDown('KeyW'));
    const turbo = keys.isDown('ShiftLeft') || keys.isDown('ShiftRight') || v.touch.turbo;
    if (!g.end) stepChase(net, setup, g, { gas, brake: braking, turbo, cruise: true }, dt);
    const turned = g.events.some((e) => e.kind === 'turn' || e.kind === 'uturn');
    if (g.events.length > 0) {
      v.fx.onEvents(g.events, g, v.t);
      onEvents();
      // Jedes Ereignis nur einmal (nach dem Ende ruft niemand mehr stepChase, der sie sonst leert).
      g.events.length = 0;
    }
    v.fx.step(g, dt, v.t, braking, 1.5);
    sound();
    renderFrame(dt);
    writeHud();
    // Funk: Veedel-Wechsel melden (einmal pro Sekunde geprüft).
    if (v.t - v.lastVeedelCheck > 1) {
      v.lastVeedelCheck = v.t;
      const name = veedelNameAt(g.player.x, g.player.y);
      if (name && name !== v.lastVeedel) {
        if (v.lastVeedel && !g.end) say(radioLine(g, g.sight ? 'heading' : 'search', name, v.radioCount));
        v.lastVeedel = name;
      }
    }
    refreshHud(turned);
    if (import.meta.env.DEV) {
      const ms = performance.now() - t0;
      v.perf.frames += 1;
      v.perf.total += ms;
      v.perf.max = Math.max(v.perf.max, ms);
    }
  }, running);

  // Vor dem Start und in der Einleitung: nur das Blaulicht blinkt (ohne Spiel, ohne Ton).
  useFrameLoop((dt) => {
    const v = view.current;
    v.t += dt;
    renderFrame(0);
  }, !running && !view.current.sent);

  // Am Ende aufräumen: nichts mehr nachlegen (Ton läuft in kurzen Stücken aus).
  useEffect(() => () => setEngine(40, 40, 0), []);

  // Für Screenshots und Tests (Rahmen: koeln.dev.minigameWin/-Lose geht über onFinish direkt).
  const g = game.current;
  const next = hud.next;
  const distance = next ? Math.round(next.distance / 10) * 10 : 0;
  const status = hud.sight
    ? `Sichtkontakt · ${Number.isFinite(hud.nearest) ? Math.round(hud.nearest) : '–'} m`
    : hud.hideout
      ? `Im Versteck: ${hud.hideout}`
      : 'Kein Sichtkontakt';
  const touchButtons = [
    {
      id: 'brake',
      label: 'Bremse',
      icon: 'chevronDown',
      tone: 'danger' as const,
      onPress: () => {
        view.current.touch.brake = true;
      },
      onRelease: () => {
        view.current.touch.brake = false;
      },
    },
    {
      id: 'turbo',
      label: 'Turbo',
      icon: 'rocket',
      tone: 'gold' as const,
      onPress: () => {
        view.current.touch.turbo = true;
      },
      onRelease: () => {
        view.current.touch.turbo = false;
      },
    },
  ];
  return (
    <div ref={root} class={`chase${coarse ? ' is-touch' : ''}`} data-night={night > 0.5 ? 'true' : 'false'}>
      <div ref={refs.lines} class="chase-lines" aria-hidden="true" />
      <div ref={refs.vignette} class="chase-vignette" aria-hidden="true" />
      <div ref={refs.flash} class="chase-flash" aria-hidden="true" />

      <HudBar class="chase-top">
        <HudTimer seconds={hud.left} total={TIME_LIMIT} urgentAt={15} />
        <div ref={refs.mirror} class={`chase-mirror${hud.sight ? ' is-seen' : ''}`}>
          <Icon name={hud.sight ? 'eye' : 'eyeOff'} class="chase-mirror__icon" />
          <span class="chase-mirror__text">{status}</span>
        </div>
        <div class={`chase-hide${hud.sight ? '' : ' is-active'}`} title="Abtauchen">
          <svg viewBox="0 0 40 40" class="chase-hide__ring" aria-hidden="true">
            <circle class="chase-hide__track" cx="20" cy="20" r="15.9" pathLength={100} />
            <circle ref={refs.ring} class="chase-hide__fill" cx="20" cy="20" r="15.9" pathLength={100} />
          </svg>
          <span class="chase-hide__label">Abtauchen</span>
          <span class="mg-sr">{`Abtauchen: ${Math.round(g.hide * 100)} Prozent, ${ABTAUCHEN_SECONDS} Sekunden ohne Sichtkontakt`}</span>
        </div>
        <div class={`chase-heli${hud.heliOnYou ? ' is-on' : ''}`}>
          <Icon name="crosshair" class="chase-heli__icon" />
          <span>
            {!hud.heliActive
              ? `Hubschrauber ${Math.ceil(hud.heliIn)} s`
              : hud.heliOnYou
                ? 'Hubschrauber über dir'
                : 'Hubschrauber sucht'}
          </span>
        </div>
      </HudBar>

      <p key={hud.radioKey} class="chase-radio" aria-live="polite">
        <Icon name="signal" class="chase-radio__icon" />
        {hud.radio}
      </p>

      <div ref={refs.arrow} class="chase-arrow" aria-hidden="true">
        <span class="chase-arrow__tip" />
        <span ref={refs.arrowLabel} class="chase-arrow__label" />
      </div>

      <div class={`chase-turn${hud.tooFast ? ' is-fast' : ''}`}>
        <TurnSketch next={next} tooFast={hud.tooFast} />
        <span class="chase-turn__text">
          {hud.uturn
            ? 'Wenden …'
            : hud.deadEnd
              ? 'Sackgasse: Bremse halten zum Wenden'
              : next?.deadEnd
                ? `Sackgasse · ${distance} m`
                : hud.tooFast
                  ? 'Bremsen!'
                  : next && next.branches.length > 0
                    ? `${distance} m`
                    : 'geradeaus'}
        </span>
      </div>

      <div class="chase-speedo">
        <span class="chase-speedo__value">
          <span ref={refs.speed}>0</span>
          <span class="chase-speedo__unit">km/h</span>
        </span>
        <span class="chase-speedo__turbo" aria-hidden="true">
          <span ref={refs.turbo} />
        </span>
        <span class="chase-speedo__label">Turbo{coarse ? '' : ' · Umschalt'}</span>
      </div>

      <button
        type="button"
        class="chase-dump mg-pad"
        disabled={hud.dumped || !running}
        onClick={dump}
        aria-label="Ware aus dem Fenster werfen"
      >
        <Icon name="package" />
        <span class="mg-pad__label">{hud.dumped ? 'Ware ist weg' : coarse ? 'Ware raus' : 'Ware raus (X)'}</span>
      </button>

      <TouchControls
        class="chase-touch"
        pad="lr"
        onDirection={(dir, pressed) => {
          if (pressed && (dir === 'left' || dir === 'right')) pick(dir);
        }}
        buttons={touchButtons}
      />
    </div>
  );
}
