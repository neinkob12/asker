// Verfolgungsjagd (Feedback vom 07.10.2026): Arcade-Rennspiel von hinten im Canvas. Spiellogik in model.ts, Zeichnen
// in draw.ts, Funk-Zeilen in radio.ts, Ton in sounds.ts. Hier: Bildschleife, Eingaben (Tastatur, Touch, Wischen), HUD
// im Look Glas (Zeit, Abhängen, Karre, Tacho mit Turbo, Funk, Ware raus) und das Ende mit Zeitlupe.
//
// Die Spielzeit steht still, solange das Minispiel offen ist: alles läuft über die eigene Schleife (useFrameLoop).
// Pro Bild nur Rechnen und Zeichnen, keine Layout-Lesungen (Größe kommt aus useStageCanvas).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { audio, haptic, Icon, type LoopHandle, prefersReducedMotion, useGame } from '../../../../../ui';
import { activeCity } from '../../../../city';
import { getVeedel } from '../../../../veedel';
import { HudBar, HudTimer } from '../../kit/hud';
import { TouchControls, useSwipe } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import { type ChaseFx, createFx, lightOf, onEvents, type Palette, readPalette, renderChase, stepFx } from './draw';
import {
  type ChaseInput,
  type ChaseState,
  chasePicks,
  chaseScore,
  createChase,
  dumpGoods,
  forceEnd,
  initChase,
  segmentAt,
  steer,
  stepChase,
  TIME_LIMIT,
  TOP_SPEED,
  timeLeft,
} from './model';
import { radioLine } from './radio';
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
const END_SECONDS = 2.6;
/** Zeitlupe am Ende: so viel der echten Zeit. */
const END_SLOW = 0.45;
/** HUD-Texte so oft pro Sekunde neu (Zahlen, die sich jedes Bild ändern, schreibt die Schleife direkt). */
const HUD_RATE = 8;
/** Funk-Zeile von der Zentrale alle paar Sekunden (Richtung). */
const RADIO_EVERY = 14;

interface Hud {
  left: number;
  shake: number;
  damage: number;
  near: boolean;
  dumped: boolean;
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
  const palette = useMemo<Palette>(readPalette, []);
  const light = useMemo(() => lightOf(challenge.params.phase), [challenge.params.phase]);
  const rain = challenge.params.weather === 'rain' || challenge.params.weather === 'storm';
  const veedelName = useMemo(
    () => (challenge.veedelId ? (getVeedel(challenge.veedelId)?.name ?? '') : ''),
    [challenge.veedelId],
  );
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const refs = {
    speed: useRef<HTMLSpanElement>(null),
    turbo: useRef<HTMLSpanElement>(null),
    shake: useRef<HTMLSpanElement>(null),
    damage: useRef<HTMLSpanElement>(null),
  };
  const view = useRef({
    fx: createFx(reduced) as ChaseFx,
    touch: { gas: false, brake: false, turbo: false },
    t: 0,
    endT: -1,
    sent: false,
    lastHud: -1,
    radioCount: 0,
    nextRadio: RADIO_EVERY,
    /** Entwicklung: Rechenzeit der Bildschleife. */
    perf: { frames: 0, total: 0, max: 0 },
  });
  const [hud, setHud] = useState<Hud>(() => ({
    left: TIME_LIMIT,
    shake: 0,
    damage: 0,
    near: true,
    dumped: false,
    radio: 'Zentrale: Flüchtiges Fahrzeug, alle Einheiten.',
    radioKey: 0,
    turboReady: true,
  }));

  // ------------------------------------------------------------------ Zeichnen
  const drawRef = useRef<() => void>(() => {});
  const stage = useStageCanvas(canvas, () => drawRef.current());
  const draw = () => {
    const s = stage.current;
    if (!s) return;
    renderChase(s.ctx, s.width, s.height, setup, game.current, view.current.fx, { light, rain, cityId, palette });
  };
  drawRef.current = draw;

  // ------------------------------------------------------------------ Eingaben
  const pick = (dir: 'left' | 'right') => {
    if (!running || !steer(game.current, dir)) return;
    audio.playThrottled('minigames.click', 60, { volume: 0.35 });
  };
  const dump = () => {
    if (!running || !dumpGoods(game.current)) return;
    haptic('medium');
    refreshHud(true);
  };
  const keys = useGameKeys(
    KEYS,
    (press) => {
      if (game.current.end) return;
      if (press.code === 'ArrowLeft' || press.code === 'KeyA') pick('left');
      else if (press.code === 'ArrowRight' || press.code === 'KeyD') pick('right');
      else if (press.code === 'KeyX') dump();
    },
    running,
  );
  useSwipe(
    root,
    (dir) => {
      if (dir === 'left' || dir === 'right') pick(dir);
    },
    running,
  );

  // Am Handy gibt der Wagen von selbst Vollgas (Bremse, Turbo und Spur reichen für zwei Daumen).
  const inputNow = (): ChaseInput => {
    const t = view.current.touch;
    return {
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
      turboReady: g.player.turbo >= 0.999 && !g.player.turboOn,
    }));
  };
  const say = (text: string) => {
    const v = view.current;
    v.radioCount += 1;
    setHud((prev) => ({ ...prev, radio: text, radioKey: v.radioCount }));
    audio.play(CHASE_SOUNDS.radio, { volume: 0.5 });
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
    // Drehzahl: steigt mit dem Tempo, fällt beim Hochschalten etwas ab (vier Gänge).
    const gear = p.v < 12 ? 0 : p.v < 24 ? 1 : p.v < 40 ? 2 : 3;
    const rpm = (36 + (p.v - [0, 9, 20, 34][gear]) * [4.8, 3.4, 2.6, 2.1][gear]) * (p.turboOn ? 1.12 : 1);
    l.engine.set({ rpm, load: Math.min(1, p.v / TOP_SPEED + (p.turboOn ? 0.3 : 0)), volume: g.end ? 0.3 : 0.7 });
    // Martinshorn: lauter je näher, verstummt nach der Flucht.
    const near = g.nearest;
    const on = Number.isFinite(near) && !(g.end === 'escaped');
    l.siren.set({ pitch: near < 15 ? 1.03 : 1, volume: on ? Math.min(1, Math.max(0.1, 1 - near / 220)) * 0.9 : 0 });
  };
  const onSoundEvents = () => {
    const g = game.current;
    for (const e of g.events) {
      switch (e.kind) {
        case 'crash':
        case 'blockHit':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.6 + 0.4 * e.power });
          haptic('error');
          break;
        case 'ram':
          audio.play(CHASE_SOUNDS.crash, { volume: 0.55 });
          haptic('medium');
          break;
        case 'bump':
          audio.playThrottled(CHASE_SOUNDS.bump, 150, { volume: 0.6 });
          haptic('light');
          break;
        case 'sideswipe':
          audio.playThrottled(CHASE_SOUNDS.squeal, 250, { volume: 0.6 });
          audio.playThrottled(CHASE_SOUNDS.bump, 150, { volume: 0.4 });
          break;
        case 'steer':
          if (g.player.v > TOP_SPEED * 0.7) audio.playThrottled(CHASE_SOUNDS.squeal, 400, { volume: 0.25 });
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
    const s = stage.current;
    const size = s ? { w: s.width, h: s.height } : { w: 1120, h: 760 };
    onEvents(v.fx, g, size);
    onSoundEvents();
    stepFx(v.fx, g, dt * slow, size, rain, segmentAt(setup, g.player.z + 20).curve);
    sound();
    if (g.t - v.lastHud > 0) refreshHud();
    // Werte, die sich jedes Bild ändern, direkt ins DOM.
    const speed = refs.speed.current;
    if (speed) speed.textContent = String(Math.round(g.player.v * 3.6));
    const turbo = refs.turbo.current;
    if (turbo) {
      turbo.style.transform = `scaleX(${g.player.turbo.toFixed(3)})`;
      turbo.dataset.on = g.player.turboOn ? '1' : '';
    }
    const shake = refs.shake.current;
    if (shake) shake.style.transform = `scaleX(${g.shake.toFixed(3)})`;
    const damage = refs.damage.current;
    if (damage) damage.style.transform = `scaleX(${g.player.damage.toFixed(3)})`;
    // Funk ab und zu: Richtung.
    if (!g.end && v.t >= v.nextRadio) {
      v.nextRadio = v.t + RADIO_EVERY;
      say(radioLine(g, g.near ? 'heading' : 'search', veedelName, v.radioCount));
    }
    draw();
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
    draw();
    return stopLoops;
  }, [running]);

  // Entwicklung: Zustand der Jagd in der Konsole (Screenshots, Leistung).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const advance = (seconds: number, gas = true) => {
      const g = game.current;
      for (let i = 0; i < seconds * 30 && !g.end; i++) {
        if (gas && i % 45 === 0) steer(g, i % 90 === 0 ? 'left' : 'right');
        stepChase(setup, g, { gas, brake: false, turbo: false }, 1 / 30);
      }
      draw();
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
    : hud.near
      ? 'Im Nacken'
      : 'Vorsprung';
  return (
    <div ref={root} class={`chase${hud.near ? ' is-near' : ''}${ended ? ' is-ended' : ''}`}>
      <canvas ref={canvas} class="chase-canvas" role="img" aria-label="Verfolgungsjagd" />

      <HudBar class="chase-top">
        <HudTimer seconds={hud.left} total={TIME_LIMIT} urgentAt={15} />
        <div class="chase-meter chase-meter--shake">
          <span class="chase-meter__head">
            <Icon name={hud.near ? 'siren' : 'eyeOff'} class="chase-meter__icon" />
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

      <div class="chase-speedo">
        <span class="chase-speedo__value">
          <span ref={refs.speed}>{Math.round(g.player.v * 3.6)}</span>
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
        pad="lr"
        onDirection={(dir, pressed) => {
          if (pressed && (dir === 'left' || dir === 'right')) pick(dir);
        }}
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
    </div>
  );
}
