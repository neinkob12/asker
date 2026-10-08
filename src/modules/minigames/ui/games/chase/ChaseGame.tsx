// Verfolgungsjagd (Auftrag 47): freies Lenken im Straßennetz, 3D-Szene mit three.js (scene.ts), Spiellogik in
// model.ts, Funk-Zeilen in radio.ts, Ton in sounds.ts. Hier: Bildschleife, Eingaben (Tastatur, Touch: linke Hälfte
// lenken, rechts Bremse und Turbo), HUD im Look Glas (Zeit, Abhängen, Karre, Tacho mit Turbo, Funk, Ware raus,
// Minikarte) und das Ende mit Zeitlupe.
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
import {
  type ChaseInput,
  type ChaseState,
  chasePicks,
  chaseScore,
  createChase,
  dumpGoods,
  forceEnd,
  GRID,
  initChase,
  PITCH,
  stepChase,
  TIME_LIMIT,
  TOP_SPEED,
  timeLeft,
  WORLD,
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
/** Minikarte: Pixel. */
const MINIMAP = 128;

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
  };
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
  }));

  // ------------------------------------------------------------------ Szene
  const sceneFor = (): ChaseScene => {
    const v = view.current;
    v.scene ??= createChaseScene(setup, { cityId, phase, rain, reduced });
    return v.scene;
  };
  const stage = useStage3d(canvas, (st) => {
    sceneFor().resize(st.width, st.height);
    draw(0);
  });
  const draw = (dt: number) => {
    const st = stage.current;
    if (!st) return;
    const scene = sceneFor();
    scene.update(game.current, dt, { steer: game.current.player.steer });
    scene.render(st);
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
    }));
  };
  const say = (text: string) => {
    const v = view.current;
    v.radioCount += 1;
    setHud((prev) => ({ ...prev, radio: text, radioKey: v.radioCount }));
    audio.play(CHASE_SOUNDS.radio, { volume: 0.5 });
  };

  const drawMinimap = () => {
    const c = minimap.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const s = game.current;
    const k = MINIMAP / WORLD;
    g.clearRect(0, 0, MINIMAP, MINIMAP);
    g.fillStyle = 'rgba(10,12,18,0.72)';
    g.fillRect(0, 0, MINIMAP, MINIMAP);
    // Straßen.
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const a = i * PITCH * k;
      g.beginPath();
      g.moveTo(a, 0);
      g.lineTo(a, MINIMAP);
      g.moveTo(0, a);
      g.lineTo(MINIMAP, a);
      g.stroke();
    }
    // Fluss.
    const rc = setup.city.riverCol;
    if (rc >= 0) {
      g.fillStyle = 'rgba(70,120,190,0.5)';
      g.fillRect((rc * PITCH + 8) * k, 0, (PITCH - 16) * k, MINIMAP);
    }
    // Sperren.
    g.fillStyle = '#ff5a3a';
    for (const b of s.blocks) g.fillRect(b.i * PITCH * k - 2, b.j * PITCH * k - 2, 4, 4);
    // Tiefgarage.
    if (s.hideout) {
      g.fillStyle = '#e0b24a';
      g.beginPath();
      g.arc(s.hideout.x * k, s.hideout.z * k, 3.5 + Math.sin(view.current.t * 8), 0, Math.PI * 2);
      g.fill();
    }
    // Streifen.
    g.fillStyle = '#4a8cff';
    for (const cop of s.cops) {
      if (!cop.active || cop.state === 'wrecked') continue;
      g.beginPath();
      g.arc(cop.x * k, cop.z * k, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    // Du: Pfeil in Fahrtrichtung.
    const p = s.player;
    g.save();
    g.translate(p.x * k, p.z * k);
    g.rotate(p.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(3.5, 4);
    g.lineTo(-3.5, 4);
    g.closePath();
    g.fill();
    g.restore();
  };

  // ------------------------------------------------------------------ Ton
  const loops = useRef<{ engine: LoopHandle; siren: LoopHandle } | null>(null);
  const stopLoops = () => {
    const l = loops.current;
    loops.current = null;
    if (!l) return;
    l.engine.stop();
    l.siren.stop();
  };
  const sound = () => {
    const g = game.current;
    const p = g.player;
    loops.current ??= {
      engine: audio.loop(CHASE_SOUNDS.engine, { rpm: 40, load: 0, volume: 0.7 }),
      siren: audio.loop(CHASE_SOUNDS.siren, { pitch: 1, volume: 0 }),
    };
    const l = loops.current;
    const v = Math.abs(p.v);
    const gear = v < 12 ? 0 : v < 24 ? 1 : v < 40 ? 2 : 3;
    const rpm = (36 + (v - [0, 9, 20, 34][gear]) * [4.8, 3.4, 2.6, 2.1][gear]) * (p.turboOn ? 1.12 : 1);
    l.engine.set({ rpm, load: Math.min(1, v / TOP_SPEED + (p.turboOn ? 0.3 : 0)), volume: g.end ? 0.3 : 0.7 });
    const near = g.nearest;
    const on = Number.isFinite(near) && !(g.end === 'escaped');
    l.siren.set({ pitch: near < 15 ? 1.03 : 1, volume: on ? Math.min(1, Math.max(0.1, 1 - near / 240)) * 0.9 : 0 });
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
          break;
        case 'splash':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.5 });
          scene?.shake(0.4);
          break;
        case 'ram':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.55 });
          haptic('medium');
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
          say(radioLine(g, 'lost', veedelName, view.current.radioCount));
          break;
        case 'block':
          say(radioLine(g, 'roadblock', veedelName, view.current.radioCount));
          break;
        case 'blockPassed':
          audio.playThrottled(CHASE_SOUNDS.honk, 400, { volume: 0.5 });
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
  useFrameLoop((dt) => {
    const v = view.current;
    const g = game.current;
    const started = performance.now();
    const slow = g.end ? END_SLOW : 1;
    stepChase(setup, g, inputNow(), dt * slow);
    v.t += dt;
    onEvents();
    sound();
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
    draw(dt * slow);
    if (v.t - v.lastMap > 1 / 12) {
      v.lastMap = v.t;
      drawMinimap();
    }
    if (g.end) {
      if (v.endT < 0) {
        v.endT = v.t;
        refreshHud(true);
      } else if (v.t - v.endT >= END_SECONDS && !v.sent) {
        v.sent = true;
        stopLoops();
        onFinish(chaseScore(g), chasePicks(g));
      }
    }
    const took = performance.now() - started;
    v.perf.frames += 1;
    v.perf.total += took;
    v.perf.max = Math.max(v.perf.max, took);
  }, running);

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
    (window as unknown as { chase?: unknown }).chase = { game, view, setup, advance, forceEnd };
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
      class={`chase chase--${phase}${hud.near ? ' is-near' : ''}${ended ? ` is-ended is-${g.end}` : ''}${hud.hideout ? ' has-hideout' : ''}`}
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

      <canvas
        ref={minimap}
        class="chase-minimap"
        width={MINIMAP}
        height={MINIMAP}
        role="img"
        aria-label="Karte: du, Streifen, Tiefgarage"
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
