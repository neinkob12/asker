// Verfolgungsjagd (Auftrag 47, Auftrag 48): freies Lenken im Straßennetz, 3D-Szene mit three.js (scene.ts), Spiellogik
// in model.ts, Funk-Zeilen in radio.ts, Ton in sounds.ts. Hier: Bildschleife, Eingaben (Tastatur, Touch: linke Hälfte
// lenken, rechts Bremse und Turbo), HUD im Look Glas (Zeit, Abhängen, Karre, Tacho mit Turbo, Funk, Ware raus, Radar
// mit Blick nach vorn, Pfeile am Rand zu Streifen außerhalb des Bildes, Ziel Tiefgarage, Einblendungen „Knapp
// vorbei“) und das Ende mit Zeitlupe.
//
// Die Spielzeit steht still, solange das Minispiel offen ist: alles läuft über die eigene Schleife (useFrameLoop).
// Pro Bild nur Rechnen und Zeichnen, keine Layout-Lesungen (Größe kommt aus useStage3d).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { audio, haptic, Icon, type LoopHandle, prefersReducedMotion, useGame } from '../../../../../ui';
import { activeCity } from '../../../../city';
import { getVeedel } from '../../../../veedel';
import { HudBar, HudTimer } from '../../kit/hud';
import { phaseOf } from '../../kit/scene3d';
import { useStage3d } from '../../kit/stage3d';
import { capture, TouchControls } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import { createPilot, type Pilot, pilotInput } from './bot';
import {
  type ChaseInput,
  type ChaseState,
  chasePicks,
  chaseScore,
  chaseStats,
  createChase,
  dumpGoods,
  forceEnd,
  GRID,
  headingTo,
  initChase,
  PITCH,
  stepChase,
  TIME_LIMIT,
  TOP_SPEED,
  timeLeft,
  wrapAngle,
} from './model';
import { radioLine } from './radio';
import { type ChaseScene, createChaseScene } from './scene';
import { CHASE_SOUNDS } from './sounds';

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
const END_SECONDS = 2.8;
/** Zeitlupe am Ende: so viel der echten Zeit. */
const END_SLOW = 0.4;
/** HUD-Texte so oft pro Sekunde neu (Zahlen, die sich jedes Bild ändern, schreibt die Schleife direkt). */
const HUD_RATE = 8;
/** Funk-Zeile von der Zentrale alle paar Sekunden (Richtung). */
const RADIO_EVERY = 14;
/** Lenken mit dem Finger: so viele Pixel seitlich sind voller Einschlag. */
const STEER_PX = 90;
/** Radar: Pixel (Zeichenfläche) und Reichweite bis zum Rand (Meter). */
const MINIMAP = 128;
const RADAR_RANGE = 190;
/** Pfeile am Rand: höchstens so viele Streifen. */
const PINS = 4;
/** Einblendungen (Knapp vorbei …): so viele gleichzeitig, so lange (Sekunden). */
const POPS = 3;
const POP_SECONDS = 1.4;

interface Pop {
  id: number;
  text: string;
  tone: 'gold' | 'good' | 'bad';
  at: number;
}

interface Hud {
  left: number;
  shake: number;
  damage: number;
  near: boolean;
  dumped: boolean;
  hideout: boolean;
  radio: string;
  radioKey: number;
  turboReady: boolean;
  /** Abstand zur Tiefgarage (Meter) oder null. */
  goal: number | null;
  charging: boolean;
  pops: Pop[];
}

export function ChaseGame(props: MinigameViewProps) {
  const { challenge, running, onFinish, preview } = props;
  const { state: gameState } = useGame();
  const reduced = useMemo(prefersReducedMotion, []);
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const cityId = preview ? activeCity(gameState) : challenge.cityId;
  const setup = useMemo(
    () =>
      createChase({
        seed: challenge.seed,
        difficulty: challenge.difficulty,
        clock: Number(challenge.params.clock),
        mobile: coarse,
      }),
    [challenge.seed, challenge.difficulty, coarse],
  );
  const [game] = useState<{ current: ChaseState }>(() => ({ current: initChase(setup) }));
  const phase = useMemo(() => phaseOf(challenge.params.phase), [challenge.params.phase]);
  const rain = challenge.params.weather === 'rain' || challenge.params.weather === 'storm';
  const veedelName = useMemo(
    () => (challenge.veedelId ? (getVeedel(challenge.veedelId)?.name ?? '') : ''),
    [challenge.veedelId],
  );
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const refs = {
    speed: useRef<HTMLSpanElement>(null),
    turbo: useRef<HTMLSpanElement>(null),
    shake: useRef<HTMLSpanElement>(null),
    damage: useRef<HTMLSpanElement>(null),
    goalArrow: useRef<HTMLSpanElement>(null),
    mirror: useRef<HTMLDivElement>(null),
  };
  const pins = useRef<(HTMLDivElement | null)[]>([]);
  const view = useRef({
    scene: null as ChaseScene | null,
    touch: { gas: false, brake: false, turbo: false, steer: 0 },
    keySteer: 0,
    t: 0,
    endT: -1,
    sent: false,
    lastHud: -1,
    radioCount: 0,
    nextRadio: RADIO_EVERY,
    lastMap: -1,
    popId: 0,
    /** Doppler: Abstand der nächsten Streife im letzten Bild. */
    lastNear: Number.POSITIVE_INFINITY,
    pitch: 1,
    /** Hit-Stop: so lange (echte Sekunden) steht das Spiel nach einem harten Treffer still. */
    hitStop: 0,
    /** Entwicklung: Autopilot (Fahr-Bot) für Bilder und Messungen. */
    pilot: null as Pilot | null,
    /** Entwicklung: Rechenzeit der Bildschleife. */
    perf: { frames: 0, total: 0, max: 0 },
  });
  const [hud, setHud] = useState<Hud>(() => ({
    left: TIME_LIMIT,
    shake: 0,
    damage: 0,
    near: true,
    dumped: false,
    hideout: false,
    radio: 'Zentrale: Flüchtiges Fahrzeug, alle Einheiten.',
    radioKey: 0,
    turboReady: true,
    goal: null,
    charging: false,
    pops: [],
  }));

  // ------------------------------------------------------------------ Szene
  const sceneFor = (): ChaseScene => {
    const v = view.current;
    v.scene ??= createChaseScene(setup, { cityId, phase, rain, reduced, hi: !coarse });
    return v.scene;
  };
  // Am Handy höchstens 1,5 Pixel je CSS-Pixel: Bloom und Linse kosten Füllrate, 30 Bilder reichen.
  const stage = useStage3d(
    canvas,
    (st) => {
      sceneFor().resize(st.width, st.height);
      placeMirror();
      draw(0);
    },
    { maxDpr: coarse ? 1.5 : undefined },
  );
  /** Rückspiegel: Rahmen im HUD (CSS) bestimmt, wohin die Szene ihn zeichnet. */
  const placeMirror = () => {
    const frame = refs.mirror.current;
    const c = canvas.current;
    const scene = view.current.scene;
    if (!frame || !c || !scene) return;
    const a = frame.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    if (a.width <= 0 || b.width <= 0) return scene.setMirror(null);
    // Innen am Rand (1,5 px) entlang, damit der Rahmen sichtbar bleibt.
    scene.setMirror({ x: a.left - b.left + 2, y: a.top - b.top + 2, width: a.width - 4, height: a.height - 4 });
  };
  const draw = (dt: number, render = true) => {
    const st = stage.current;
    if (!st) return;
    const scene = sceneFor();
    scene.update(game.current, dt);
    if (render) scene.render(st);
  };
  useEffect(
    () => () => {
      view.current.scene?.dispose();
      view.current.scene = null;
    },
    [],
  );

  // ------------------------------------------------------------------ Eingaben
  const dump = () => {
    if (!running || !dumpGoods(game.current)) return;
    haptic('medium');
    refreshHud(true);
  };
  const keys = useGameKeys(
    KEYS,
    (press) => {
      if (game.current.end) return;
      if (press.code === 'KeyX') dump();
    },
    running,
  );

  // Lenken mit dem Finger: auf der linken Hälfte ziehen (relativ zum Aufsetzpunkt).
  const steerPointer = useRef<{ id: number; x0: number } | null>(null);
  const onSteerDown = (e: PointerEvent) => {
    if (!running) return;
    e.preventDefault();
    capture(e);
    steerPointer.current = { id: e.pointerId, x0: e.clientX };
    view.current.touch.steer = 0;
  };
  const onSteerMove = (e: PointerEvent) => {
    const s = steerPointer.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0;
    view.current.touch.steer = Math.max(-1, Math.min(1, dx / STEER_PX));
  };
  const onSteerUp = (e: PointerEvent) => {
    const s = steerPointer.current;
    if (!s || s.id !== e.pointerId) return;
    steerPointer.current = null;
    view.current.touch.steer = 0;
  };

  // Am Handy gibt der Wagen von selbst Vollgas (Bremse, Turbo und Lenken reichen für zwei Daumen).
  const inputNow = (): ChaseInput => {
    const pilot = view.current.pilot;
    if (pilot) return pilotInput(setup, game.current, pilot);
    const t = view.current.touch;
    const left = keys.isDown('ArrowLeft') || keys.isDown('KeyA');
    const right = keys.isDown('ArrowRight') || keys.isDown('KeyD');
    const keySteer = (right ? 1 : 0) - (left ? 1 : 0);
    return {
      steer: t.steer !== 0 ? t.steer : keySteer,
      gas: coarse || t.gas || keys.isDown('ArrowUp') || keys.isDown('KeyW'),
      brake: t.brake || keys.isDown('ArrowDown') || keys.isDown('KeyS') || keys.isDown('Space'),
      turbo: t.turbo || keys.isDown('ShiftLeft') || keys.isDown('ShiftRight'),
    };
  };

  // ------------------------------------------------------------------ HUD
  const refreshHud = (force = false) => {
    const v = view.current;
    if (!force && v.t - v.lastHud < 1 / HUD_RATE) return;
    v.lastHud = v.t;
    const g = game.current;
    setHud((prev) => ({
      ...prev,
      left: timeLeft(g),
      shake: g.shake,
      damage: g.player.damage,
      near: g.near,
      dumped: g.dumped,
      hideout: !!g.hideout,
      turboReady: g.player.turbo >= 0.999 && !g.player.turboOn,
      goal: g.hideout ? Math.round(Math.hypot(g.hideout.x - g.player.x, g.hideout.z - g.player.z)) : null,
      charging: g.cops.some((c) => c.charging),
      pops: prev.pops.filter((p) => v.t - p.at < POP_SECONDS),
    }));
  };
  const pop = (text: string, tone: Pop['tone']) => {
    const v = view.current;
    v.popId += 1;
    const item: Pop = { id: v.popId, text, tone, at: v.t };
    setHud((prev) => ({ ...prev, pops: [...prev.pops.filter((p) => v.t - p.at < POP_SECONDS), item].slice(-POPS) }));
  };
  const say = (text: string) => {
    const v = view.current;
    v.radioCount += 1;
    setHud((prev) => ({ ...prev, radio: text, radioKey: v.radioCount }));
    audio.play(CHASE_SOUNDS.radio, { volume: 0.5 });
  };

  // Radar: du in der Mitte, Blick nach oben (dreht mit der Kamera), Umkreis RADAR_RANGE Meter.
  const drawMinimap = () => {
    const c = minimap.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const s = game.current;
    const p = s.player;
    const R = MINIMAP / 2;
    const k = R / RADAR_RANGE;
    const heading = view.current.scene?.viewHeading() ?? p.heading;
    g.clearRect(0, 0, MINIMAP, MINIMAP);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(64,68,78,0.92)';
    g.fillRect(0, 0, MINIMAP, MINIMAP);
    g.translate(R, R);
    g.rotate(-heading);
    g.scale(k, k);
    g.translate(-p.x, -p.z);
    // Blöcke (Häuser dunkel, Parks grün, Wasser blau); die Lücken dazwischen sind die Straßen.
    for (const block of setup.city.blocks) {
      const x0 = block.i * PITCH + 8.5;
      const z0 = block.j * PITCH + 8.5;
      if (Math.abs(x0 + 27 - p.x) > RADAR_RANGE * 1.5 || Math.abs(z0 + 27 - p.z) > RADAR_RANGE * 1.5) continue;
      g.fillStyle =
        block.kind === 'water'
          ? 'rgba(52,104,170,0.95)'
          : block.kind === 'park'
            ? 'rgba(40,70,44,0.95)'
            : 'rgba(16,18,24,0.95)';
      g.fillRect(x0, z0, PITCH - 17, PITCH - 17);
    }
    // Außerhalb der Stadt: dunkel.
    g.fillStyle = 'rgba(8,9,12,0.95)';
    const W = GRID * PITCH;
    g.fillRect(-2000, -2000, 4000 + W, 2000 - 8);
    g.fillRect(-2000, W + 8, 4000 + W, 2000);
    g.fillRect(-2000, -8, 2000 - 8, W + 16);
    g.fillRect(W + 8, -8, 2000, W + 16);
    // Sperren.
    g.fillStyle = '#ff5a3a';
    for (const b of s.blocks) for (const w of b.walls) g.fillRect(w.x0 - 1, w.z0 - 1, w.x1 - w.x0 + 2, w.z1 - w.z0 + 2);
    g.restore();
    // Punkte in Bildschirm-Lage (Radar dreht, Symbole nicht).
    const toRadar = (x: number, z: number) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const a = -heading;
      const rx = (dx * Math.cos(a) - dz * Math.sin(a)) * k;
      const rz = (dx * Math.sin(a) + dz * Math.cos(a)) * k;
      const d = Math.hypot(rx, rz);
      const max = R - 7;
      return d > max
        ? { x: R + (rx / d) * max, y: R + (rz / d) * max, edge: true }
        : { x: R + rx, y: R + rz, edge: false };
    };
    const t = view.current.t;
    if (s.hideout) {
      const h = toRadar(s.hideout.x, s.hideout.z);
      g.fillStyle = '#ffcf5a';
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(h.x, h.y, 5 + Math.sin(t * 8) * 1.2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const cop of s.cops) {
      if (!cop.active || cop.state === 'wrecked') continue;
      const q = toRadar(cop.x, cop.z);
      const blue = (t * 2.2 + cop.id * 0.37) % 1 < 0.5;
      g.fillStyle = cop.charging ? '#ff3a3a' : blue ? '#4a8cff' : '#ff5a4a';
      g.beginPath();
      g.arc(q.x, q.y, cop.charging ? 4.6 : 3.6, 0, Math.PI * 2);
      g.fill();
    }
    // Du: Pfeil nach oben (in Fahrtrichtung der Kamera).
    g.save();
    g.translate(R, R);
    g.rotate(wrapAngle(p.heading - heading));
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.strokeStyle = s.hideout ? 'rgba(255,207,90,0.9)' : 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(R, R, R - 1.5, 0, Math.PI * 2);
    g.stroke();
  };

  // Pfeile am Bildrand: Streifen außerhalb des Bildes (meist hinter dir), mit Abstand; rot, wenn sie zum Rammen
  // ansetzen. Schreibt nur Stil-Werte (kein Rendern von Preact pro Bild).
  const drawPins = () => {
    const scene = view.current.scene;
    const s = game.current;
    const active = s.cops.filter((c) => c.active && c.state !== 'wrecked');
    active.sort(
      (a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z),
    );
    for (let i = 0; i < PINS; i++) {
      const el = pins.current[i];
      if (!el) continue;
      const cop = active[i];
      const d = cop ? Math.hypot(cop.x - s.player.x, cop.z - s.player.z) : Infinity;
      if (!cop || !scene || d > 150 || s.end) {
        el.hidden = true;
        continue;
      }
      const sp = scene.screenOf(cop.x, 1.2, cop.z);
      let x = sp.x;
      let y = sp.y;
      const onScreen = !sp.behind && x > 0.04 && x < 0.96 && y > 0.12 && y < 0.92;
      if (onScreen && !cop.charging) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      let dx = x - 0.5;
      let dy = y - 0.5;
      if (sp.behind) {
        dx = -dx;
        dy = Math.abs(dy) + 0.4;
      }
      // Auf den Rand schieben (Rahmen 6 % bis 94 %, unten über den Knöpfen).
      const m = Math.max(Math.abs(dx) / 0.44, Math.abs(dy) / 0.36, 1e-6);
      if (!onScreen) {
        x = 0.5 + dx / m;
        y = 0.5 + dy / m;
      }
      const angle = Math.atan2(dy, dx);
      el.style.transform = `translate(${(x * 100).toFixed(2)}cqw, ${(y * 100).toFixed(2)}cqh) translate(-50%, -50%)`;
      el.style.setProperty('--pin-angle', `${angle.toFixed(3)}rad`);
      el.dataset.charging = cop.charging ? '1' : '';
      const label = el.lastElementChild;
      if (label) label.textContent = cop.charging ? 'Rammt!' : `${Math.round(d)} m`;
    }
  };

  // ------------------------------------------------------------------ Ton
  const loops = useRef<{ engine: LoopHandle; siren: LoopHandle; skid: LoopHandle } | null>(null);
  const stopLoops = () => {
    const l = loops.current;
    loops.current = null;
    if (!l) return;
    l.engine.stop();
    l.siren.stop();
    l.skid.stop();
  };
  const sound = (dt: number) => {
    const g = game.current;
    const p = g.player;
    const v = view.current;
    loops.current ??= {
      engine: audio.loop(CHASE_SOUNDS.engine, { rpm: 40, load: 0, volume: 0.7 }),
      siren: audio.loop(CHASE_SOUNDS.siren, { pitch: 1, volume: 0 }),
      skid: audio.loop(CHASE_SOUNDS.skid, { volume: 0 }),
    };
    const l = loops.current;
    const speed = Math.abs(p.v);
    const gear = speed < 12 ? 0 : speed < 24 ? 1 : speed < 40 ? 2 : 3;
    const rpm = (36 + (speed - [0, 9, 20, 34][gear]) * [4.8, 3.4, 2.6, 2.1][gear]) * (p.turboOn ? 1.12 : 1);
    l.engine.set({ rpm, load: Math.min(1, speed / TOP_SPEED + (p.turboOn ? 0.3 : 0)), volume: g.end ? 0.3 : 0.7 });
    // Martinshorn der nächsten Streife: lauter, je näher; Doppler aus der Annäherung; Stereo aus der Richtung.
    let near: (typeof g.cops)[number] | null = null;
    let nd = Infinity;
    for (const c of g.cops) {
      if (!c.active || c.state === 'wrecked') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < nd) {
        nd = d;
        near = c;
      }
    }
    const on = !!near && g.end !== 'escaped';
    if (near && dt > 0) {
      const closing = Number.isFinite(v.lastNear) ? (v.lastNear - nd) / dt : 0;
      const want = Math.max(0.86, Math.min(1.14, 343 / (343 - Math.max(-60, Math.min(60, closing)))));
      v.pitch += (want - v.pitch) * Math.min(1, dt * 3);
    }
    v.lastNear = nd;
    const view3 = v.scene?.viewHeading() ?? p.heading;
    const pan = near ? Math.sin(wrapAngle(headingTo(near.x - p.x, near.z - p.z) - view3)) * 0.8 : 0;
    l.siren.set({ pitch: v.pitch, pan, volume: on ? Math.min(1, Math.max(0.1, 1 - nd / 240)) * 0.9 : 0 });
    const slide = p.drifting || (p.braking && p.v > 14) ? Math.min(1, speed / 40) : 0;
    l.skid.set({ volume: g.end ? 0 : slide * 0.5, pitch: Math.min(1, speed / 50) });
  };
  const hitStop = (seconds: number) => {
    const v = view.current;
    v.hitStop = Math.max(v.hitStop, reduced ? seconds * 0.5 : seconds);
  };
  const onEvents = () => {
    const g = game.current;
    const scene = view.current.scene;
    for (const e of g.events) {
      switch (e.kind) {
        case 'crash':
        case 'blockHit':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.6 + 0.4 * e.power });
          haptic('error');
          scene?.shake(0.5 + e.power * 0.5);
          scene?.sparks(e.x, e.z, e.power);
          if (e.kind === 'blockHit' || e.power > 0.25) hitStop(e.kind === 'blockHit' ? 0.09 : 0.04 + 0.05 * e.power);
          break;
        case 'splash':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.5 });
          scene?.shake(0.4);
          break;
        case 'ram':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.55 });
          haptic('medium');
          pop('Gerammt!', 'bad');
          hitStop(0.07);
          scene?.shake(0.6);
          scene?.sparks(e.x, e.z, 0.6);
          break;
        case 'bump':
        case 'scrape':
          audio.playThrottled(CHASE_SOUNDS.bump, 150, { volume: 0.4 });
          scene?.sparks(e.x, e.z, 0.2);
          break;
        case 'sideswipe':
          audio.playThrottled(CHASE_SOUNDS.squeal, 250, { volume: 0.6 });
          audio.playThrottled(CHASE_SOUNDS.bump, 150, { volume: 0.4 });
          scene?.shake(0.25);
          scene?.sparks(e.x, e.z, 0.4);
          break;
        case 'steer':
          if (Math.abs(g.player.v) > TOP_SPEED * 0.5) audio.playThrottled(CHASE_SOUNDS.squeal, 400, { volume: 0.25 });
          break;
        case 'turbo':
          audio.play(CHASE_SOUNDS.turbo, { volume: 0.7 });
          haptic('light');
          break;
        case 'dump':
          audio.play(CHASE_SOUNDS.dump, { volume: 0.8 });
          break;
        case 'cop':
          say(radioLine(g, 'cop', veedelName, view.current.radioCount));
          break;
        case 'copCrash':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.35 });
          audio.playThrottled(CHASE_SOUNDS.honk, 500, { volume: 0.4 });
          scene?.sparks(e.x, e.z, 0.8);
          hitStop(0.06);
          pop('Streife zerlegt!', 'good');
          say(radioLine(g, 'lost', veedelName, view.current.radioCount));
          break;
        case 'block':
          say(radioLine(g, 'roadblock', veedelName, view.current.radioCount));
          break;
        case 'blockPassed':
          audio.playThrottled(CHASE_SOUNDS.honk, 400, { volume: 0.5 });
          audio.play(CHASE_SOUNDS.whoosh, { volume: 0.8 });
          haptic('success');
          pop('Durch die Sperre! +10 %', 'gold');
          break;
        case 'nearMiss':
          audio.play(CHASE_SOUNDS.whoosh, { volume: 0.5 + 0.4 * e.power });
          haptic('light');
          scene?.shake(0.12);
          pop('Knapp vorbei! +5 %', 'gold');
          break;
        case 'charge':
          audio.playThrottled(CHASE_SOUNDS.warn, 800, { volume: 0.6 });
          haptic('light');
          break;
        case 'alarm':
          audio.playThrottled(CHASE_SOUNDS.alarm, 1500, { volume: 0.4 });
          break;
        case 'near':
          if (g.t > 2) say(radioLine(g, 'spotted', veedelName, view.current.radioCount));
          break;
        case 'clear':
          say(radioLine(g, 'lost', veedelName, view.current.radioCount));
          break;
        case 'hideout':
          audio.play(CHASE_SOUNDS.turbo, { volume: 0.3 });
          haptic('success');
          say('Die Tiefgarage leuchtet auf der Karte. Nichts wie hin.');
          break;
        case 'hideoutLost':
          say(radioLine(g, 'spotted', veedelName, view.current.radioCount));
          break;
        case 'escaped':
          audio.play(CHASE_SOUNDS.turbo, { volume: 0.4 });
          haptic('success');
          break;
        case 'caught':
          haptic('error');
          break;
        default:
          break;
      }
    }
  };

  // ------------------------------------------------------------------ Schleife
  /** Ein Bild: rechnen, Ton, HUD, zeichnen (render false: nur nachführen, für den Dev-Haken sim). */
  const frame = (dt: number, render = true) => {
    const v = view.current;
    const g = game.current;
    const started = performance.now();
    const slow = g.end ? END_SLOW : 1;
    // Hit-Stop: Das Modell steht kurz, Kamera und Wackeln laufen weiter.
    const frozen = v.hitStop > 0;
    v.hitStop = Math.max(0, v.hitStop - dt);
    if (!frozen) {
      stepChase(setup, g, inputNow(), dt * slow);
      onEvents();
    }
    v.t += dt;
    sound(dt);
    if (g.t - v.lastHud > 0) refreshHud();
    const speed = refs.speed.current;
    if (speed) speed.textContent = String(Math.round(Math.abs(g.player.v) * 3.6));
    const turbo = refs.turbo.current;
    if (turbo) {
      turbo.style.transform = `scaleX(${g.player.turbo.toFixed(3)})`;
      turbo.dataset.on = g.player.turboOn ? '1' : '';
    }
    const shake = refs.shake.current;
    if (shake) shake.style.transform = `scaleX(${g.shake.toFixed(3)})`;
    const damage = refs.damage.current;
    if (damage) damage.style.transform = `scaleX(${g.player.damage.toFixed(3)})`;
    if (!g.end && v.t >= v.nextRadio) {
      v.nextRadio = v.t + RADIO_EVERY;
      say(radioLine(g, g.near ? 'heading' : 'search', veedelName, v.radioCount));
    }
    draw(dt * slow, render);
    const mirror = refs.mirror.current;
    const mirrorOn = v.scene?.mirrorOn() ? '1' : '';
    if (mirror && mirror.dataset.on !== mirrorOn) mirror.dataset.on = mirrorOn;
    drawPins();
    if (v.t - v.lastMap > 1 / 15) {
      v.lastMap = v.t;
      drawMinimap();
    }
    const arrow = refs.goalArrow.current;
    const h = g.hideout;
    if (arrow && h && v.scene) {
      const a = wrapAngle(headingTo(h.x - g.player.x, h.z - g.player.z) - v.scene.viewHeading());
      arrow.style.transform = `rotate(${a.toFixed(3)}rad)`;
    }
    if (g.end) {
      if (v.endT < 0) {
        v.endT = v.t;
        refreshHud(true);
      } else if (v.t - v.endT >= END_SECONDS && !v.sent) {
        v.sent = true;
        stopLoops();
        onFinish(chaseScore(g), chasePicks(g), chaseStats(g));
      }
    }
    const took = performance.now() - started;
    v.perf.frames += 1;
    v.perf.total += took;
    v.perf.max = Math.max(v.perf.max, took);
  };
  useFrameLoop((dt) => frame(dt), running);

  // Ton aus, wenn das Spiel pausiert oder zugeht; erstes Bild hinter der Einleitung.
  useEffect(() => {
    if (!running) stopLoops();
    draw(0);
    drawMinimap();
    return stopLoops;
  }, [running]);

  // Entwicklung: Zustand der Jagd in der Konsole (Screenshots, Leistung).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const advance = (seconds: number, gas = true) => {
      const g = game.current;
      for (let i = 0; i < seconds * 30 && !g.end; i++) {
        const steer = i % 90 < 20 ? (i % 180 < 90 ? 1 : -1) : 0;
        stepChase(setup, g, { steer, gas, brake: false, turbo: false }, 1 / 30);
      }
      draw(1 / 30);
      drawMinimap();
    };
    const info = () => view.current.scene?.info(stage.current) ?? null;
    // Vorspulen mit festen Schritten, gezeichnet wird nur am Ende (Bilder ohne echte Bildrate).
    const sim = (seconds: number, step = 1 / 30) => {
      for (let t = 0; t < seconds; t += step) frame(step, t + step >= seconds);
      refreshHud(true);
    };
    const autopilot = (on = true) => {
      view.current.pilot = on ? createPilot() : null;
    };
    (window as unknown as { chase?: unknown }).chase = { game, view, setup, advance, forceEnd, info, autopilot, sim };
    return () => {
      delete (window as unknown as { chase?: unknown }).chase;
    };
  }, []);

  const g = game.current;
  const ended = !!g.end;
  const status = ended
    ? g.end === 'escaped'
      ? 'Abgehängt'
      : g.end === 'time'
        ? 'Eingekreist'
        : 'Gestellt'
    : hud.hideout
      ? 'Tiefgarage!'
      : hud.near
        ? 'Im Nacken'
        : 'Vorsprung';
  return (
    <div
      ref={root}
      class={`chase chase--${phase}${hud.near ? ' is-near' : ''}${ended ? ` is-ended is-${g.end}` : ''}${hud.hideout ? ' has-hideout' : ''}${hud.charging ? ' is-charging' : ''}`}
    >
      <canvas ref={canvas} class="chase-canvas" role="img" aria-label="Verfolgungsjagd" />
      <div class="chase-wash" aria-hidden="true" />

      {/* Linke Hälfte: Lenken mit dem Finger. */}
      <div
        class="chase-steer"
        aria-hidden="true"
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerUp}
        onPointerCancel={onSteerUp}
        onLostPointerCapture={onSteerUp}
      />

      <HudBar class="chase-top">
        <HudTimer seconds={hud.left} total={TIME_LIMIT} urgentAt={15} />
        <div class="chase-meter chase-meter--shake">
          <span class="chase-meter__head">
            <Icon name={hud.hideout ? 'home' : hud.near ? 'siren' : 'eyeOff'} class="chase-meter__icon" />
            <span class="chase-meter__label">Abhängen</span>
            <span class="chase-meter__status">{status}</span>
          </span>
          <span class="chase-meter__bar" aria-hidden="true">
            <span ref={refs.shake} style={{ transform: `scaleX(${hud.shake})` }} />
          </span>
          <span class="mg-sr">{`Abhängen: ${Math.round(hud.shake * 100)} Prozent`}</span>
        </div>
        <div class="chase-meter chase-meter--damage">
          <span class="chase-meter__head">
            <Icon name="car" class="chase-meter__icon" />
            <span class="chase-meter__label">Karre</span>
          </span>
          <span class="chase-meter__bar" aria-hidden="true">
            <span ref={refs.damage} style={{ transform: `scaleX(${hud.damage})` }} />
          </span>
          <span class="mg-sr">{`Schaden: ${Math.round(hud.damage * 100)} Prozent`}</span>
        </div>
      </HudBar>

      <p key={hud.radioKey} class="chase-radio" aria-live="polite">
        <Icon name="signal" class="chase-radio__icon" />
        <span>{hud.radio}</span>
      </p>

      {hud.goal !== null && !ended && (
        <p class="chase-goal">
          <span ref={refs.goalArrow} class="chase-goal__arrow">
            <Icon name="navigation" />
          </span>
          <span class="chase-goal__label">Tiefgarage</span>
          <b class="chase-goal__dist">{hud.goal} m</b>
        </p>
      )}

      <div ref={refs.mirror} class="chase-mirror" aria-hidden="true" />

      <div class="chase-pins" aria-hidden="true">
        {Array.from({ length: PINS }, (_, i) => (
          <div
            key={i}
            class="chase-pin"
            hidden
            ref={(el) => {
              pins.current[i] = el;
            }}
          >
            <span class="chase-pin__arrow" />
            <span class="chase-pin__label" />
          </div>
        ))}
      </div>

      <div class="chase-pops" aria-live="polite">
        {hud.pops.map((p) => (
          <span key={p.id} class={`chase-pop is-${p.tone}`}>
            {p.text}
          </span>
        ))}
      </div>

      <canvas
        ref={minimap}
        class="chase-minimap"
        width={MINIMAP}
        height={MINIMAP}
        role="img"
        aria-label="Radar: du, Streifen, Tiefgarage"
      />

      <div class="chase-speedo">
        <span class="chase-speedo__value">
          <span ref={refs.speed}>{Math.round(Math.abs(g.player.v) * 3.6)}</span>
          <span class="chase-speedo__unit">km/h</span>
        </span>
        <span class="chase-speedo__turbo" aria-hidden="true">
          <span ref={refs.turbo} style={{ transform: `scaleX(${g.player.turbo})` }} />
        </span>
        <span class="chase-speedo__label">Turbo{coarse ? '' : ' · Umschalt'}</span>
      </div>

      <button
        type="button"
        class="chase-dump mg-pad"
        disabled={hud.dumped || ended || !running}
        onClick={dump}
        aria-label="Ware aus dem Fenster"
      >
        <Icon name="package" />
        <span>{hud.dumped ? 'Ware weg' : coarse ? 'Ware raus' : 'Ware raus (X)'}</span>
      </button>

      <TouchControls
        class="chase-touch"
        buttons={[
          {
            id: 'brake',
            label: 'Bremse',
            icon: 'arrowDown',
            tone: 'danger',
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
            icon: 'bolt',
            tone: hud.turboReady ? 'money' : 'plain',
            onPress: () => {
              view.current.touch.turbo = true;
            },
            onRelease: () => {
              view.current.touch.turbo = false;
            },
          },
        ]}
      />
      <p class="chase-hint" aria-hidden="true">
        {coarse ? 'Links ziehen: lenken' : '←/→ lenken · ↑ Gas · ↓ Bremse'}
      </p>
    </div>
  );
}
