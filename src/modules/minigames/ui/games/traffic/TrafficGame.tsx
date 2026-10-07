// Verkehrskontrolle (Auftrag 44, Teil 4): Blick vom Fahrersitz, der Beamte am Seitenfenster (Face mit Polizeimütze),
// Blaulicht im Rückspiegel, Taschenlampe, Regen auf der Scheibe. Unten das Gespräch: Frage mit Frist, drei bis vier
// Antworten (1 bis 4 bzw. Tippen). Rechts der Puls: im ruhigen Takt tippen (Leertaste bzw. Herz) hält ihn im grünen
// Bereich. Jederzeit „Gas geben“ (G, flee) und „Schein zustecken“ (B, bribe). Spiellogik in model.ts, Fragen als Daten
// in questions.ts, Zeichnen in draw.ts.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatEuro, type MouthStyle, wallet } from '../../../../../core';
import { audio, haptic, Icon, prefersReducedMotion, useGame } from '../../../../../ui';
import { HudBar } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import {
  blueFlash,
  clipPath,
  type Drop,
  drawBack,
  drawEcg,
  drawFront,
  lightOf,
  makeDrops,
  readPalette,
  renderTraffic,
  stepDrops,
  type TrafficLayers,
  type TrafficLayout,
  trafficLayout,
} from './draw';
import {
  advance,
  answer,
  answersOf,
  answerTimeOf,
  BRIBE_MAX,
  BRIBE_MIN,
  beatPhase,
  bribe,
  createTraffic,
  currentQuestion,
  flee,
  initTraffic,
  isDone,
  type Phase,
  questionCount,
  questionText,
  type Signal,
  tap,
  trafficPicks,
  trafficScore,
  type Zone,
  zoneOf,
} from './model';
import { Officer, officerLook } from './Officer';
import { TRAFFIC_SOUNDS } from './sounds';

const KEYS = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Space',
  'KeyG',
  'KeyB',
];
/** Punkte der Puls-Kurve (ein Punkt pro Bild bei 60 fps, also gut zwei Sekunden). */
const ECG_POINTS = 140;

const ZONE_LABEL: Record<Zone, string> = { green: 'ruhig', yellow: 'angespannt', red: 'zittrig' };
const ACTION_TEXT = {
  flashlight: 'leuchtet mit der Taschenlampe in den Laderaum',
  radio: 'greift zum Funkgerät',
  papers: 'liest deine Papiere',
} as const;

interface Hud {
  phase: Phase;
  index: number;
  count: number;
  suspicion: number;
  pulse: number;
  line: string | null;
  said: string | null;
  shaky: boolean;
  action: 'flashlight' | 'radio' | 'papers' | null;
  outcome: string | null;
  radioed: boolean;
  /** Zähler, damit die Sprechblase bei jeder neuen Zeile neu aufploppt. */
  lineId: number;
}

interface Placement {
  layout: TrafficLayout;
  clip: string;
}

function snapshot(s: ReturnType<typeof initTraffic>, lineId: number): Hud {
  return {
    phase: s.phase,
    index: s.index,
    count: questionCount(s),
    suspicion: s.suspicion,
    pulse: s.pulse,
    line: s.line?.text ?? null,
    said: s.said,
    shaky: s.shaky,
    action: s.action,
    outcome: s.outcome,
    radioed: s.radioed,
    lineId,
  };
}

/** Ausschlag der Puls-Kurve in einem Herzschlag (0 = Schlag, 1 = nächster): Zacke, kleine Welle danach. */
function ecgShape(phase: number): number {
  if (phase < 0.04) return phase / 0.04;
  if (phase < 0.08) return 1 - ((phase - 0.04) / 0.04) * 1.35;
  if (phase < 0.12) return -0.35 + ((phase - 0.08) / 0.04) * 0.35;
  if (phase > 0.28 && phase < 0.42) return 0.18 * Math.sin(((phase - 0.28) / 0.14) * Math.PI);
  return 0;
}

export function TrafficGame(props: MinigameViewProps) {
  const { challenge, running, preview, onFinish } = props;
  const { state } = useGame();
  const params = challenge.params;
  const light = lightOf(params.phase);
  const weather = typeof params.weather === 'string' ? params.weather : 'clear';
  const wet = weather === 'rain' || weather === 'storm';
  const bribeCost = Number(params.bribeCost) > 0 ? Math.round(Number(params.bribeCost)) : 0;
  const affordable = preview || wallet.balance(state, 'dirty') >= bribeCost;
  const setup = useMemo(
    () => createTraffic(challenge.seed, challenge.difficulty, { night: light !== 'day' }),
    [challenge.seed, challenge.difficulty, light],
  );
  const game = useRef(initTraffic(setup));
  const look = useMemo(() => officerLook(challenge.seed), [challenge.seed]);
  const palette = useMemo(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const backCanvas = useRef<HTMLCanvasElement>(null);
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  const ecgCanvas = useRef<HTMLCanvasElement>(null);
  const tint = useRef<HTMLDivElement>(null);
  const timerBar = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const heart = useRef<HTMLButtonElement>(null);
  const layers = useRef<TrafficLayers | null>(null);
  const drops = useRef<Drop[] | null>(null);
  const fx = useRef({
    t: 0,
    started: false,
    sent: false,
    lastHud: -1,
    lineId: 0,
    glare: 0,
    down: 0,
    sweep: -1,
    surge: 0,
    red: 0,
    relief: 0,
    heartAt: 0,
    ecg: new Float32Array(ECG_POINTS),
    ecgHead: 0,
    ecgAcc: 0,
    tapFx: { kind: '' as '' | 'good' | 'ok' | 'off', at: -10 },
  });
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [hud, setHud] = useState<Hud>(() => snapshot(game.current, 0));

  const back = useStageCanvas(backCanvas, (stage) => {
    const layout = trafficLayout(stage.width, stage.height);
    layers.current = renderTraffic(layout, palette, stage.dpr, { light, wet, seed: challenge.seed });
    if (wet) drops.current = makeDrops(layout, layout.narrow ? 36 : 70);
    setPlacement({ layout, clip: clipPath(layout.side) });
    drawScene();
  });
  const front = useStageCanvas(frontCanvas);
  const ecg = useStageCanvas(ecgCanvas);

  const refreshHud = () => {
    setHud(snapshot(game.current, fx.current.lineId));
  };

  /** Ton, Vibration und Optik zu dem, was im Modell passiert ist. */
  const react = (signals: Signal[]) => {
    if (signals.length === 0) return;
    const f = fx.current;
    for (const sig of signals) {
      switch (sig) {
        case 'contradiction':
        case 'caught':
          playSound(MINIGAME_SOUNDS.fail, 0.8);
          haptic('error');
          break;
        case 'mismatch':
        case 'rude':
        case 'timeout':
        case 'bribeRejected':
          playSound(MINIGAME_SOUNDS.fail, 0.5);
          haptic('warning');
          break;
        case 'flashlight':
          audio.play(TRAFFIC_SOUNDS.flashlight);
          f.sweep = 0;
          break;
        case 'radio':
          audio.play(TRAFFIC_SOUNDS.radio, { volume: 0.8 });
          break;
        case 'papers':
          audio.play(TRAFFIC_SOUNDS.papers, { volume: 0.8 });
          break;
        case 'cleared':
          haptic('light');
          break;
        case 'bribeAccepted':
          audio.play(TRAFFIC_SOUNDS.papers, { volume: 0.8 });
          f.relief = 1;
          haptic('success');
          break;
        case 'flee':
          audio.play(TRAFFIC_SOUNDS.rev);
          f.surge = 1;
          haptic('warning');
          break;
        case 'fail':
          audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.9 });
          f.red = 1;
          break;
        case 'pass':
          f.relief = 1;
          break;
        case 'done':
          finish();
          break;
        default:
          break;
      }
    }
    f.lineId += 1;
    refreshHud();
  };

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(trafficScore(setup, game.current), trafficPicks(game.current));
  };

  const pickAnswer = (index: number) => {
    const s = game.current;
    if (!running || s.phase !== 'ask') return;
    const q = currentQuestion(s);
    const a = q ? answersOf(q)[index] : undefined;
    if (!a) return;
    haptic('selection');
    react(answer(setup, s, a.id));
  };

  const tapBeat = () => {
    if (!running) return;
    const result = tap(setup, game.current);
    const f = fx.current;
    if (result === 'ignored') return;
    f.tapFx = { kind: result, at: f.t };
    if (result === 'off') {
      audio.play(TRAFFIC_SOUNDS.miss, { volume: 0.7 });
      haptic('light');
    } else {
      audio.play(TRAFFIC_SOUNDS.calm, { volume: result === 'good' ? 0.9 : 0.5 });
      haptic(result === 'good' ? 'medium' : 'light');
    }
    heart.current?.setAttribute('data-tap', result);
  };

  const doFlee = () => {
    if (!running) return;
    react(flee(game.current));
  };
  const doBribe = () => {
    if (!running || !affordable || bribeCost <= 0) return;
    react(bribe(setup, game.current));
  };

  useGameKeys(
    KEYS,
    (press) => {
      if (press.code === 'Space') tapBeat();
      else if (press.code === 'KeyG') doFlee();
      else if (press.code === 'KeyB') doBribe();
      else pickAnswer(Number(press.code.slice(-1)) - 1);
    },
    running,
  );

  // Beginn: Er klopft ans Fenster.
  useEffect(() => {
    if (!running || fx.current.started) return;
    fx.current.started = true;
    audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.8 });
  }, [running]);

  function drawScene() {
    const ls = layers.current;
    const b = back.current;
    const fr = front.current;
    if (!ls || !b) return;
    const f = fx.current;
    const s = game.current;
    drawBack(b.ctx, ls, palette, { t: f.t, sweep: f.sweep, slow: reduced, surge: reduced ? 0 : f.surge });
    if (fr)
      drawFront(fr.ctx, ls.layout, palette, {
        t: f.t,
        glare: f.glare,
        down: f.down,
        red: f.red * (0.6 + 0.4 * Math.abs(Math.sin(f.t * (reduced ? 2 : 7)))),
        relief: f.relief,
        drops: drops.current,
        snow: weather === 'snow',
      });
    // Blau auf dem Beamten (Licht von hinten), direkt ins DOM (kein Rendern pro Bild).
    if (tint.current) {
      const flash = Math.max(blueFlash(f.t, 0, reduced), blueFlash(f.t, 1, reduced));
      tint.current.style.opacity = String((reduced ? 0.2 : 0.38) * flash * (s.action === 'flashlight' ? 0.3 : 1));
    }
  }

  function drawPulse(dt: number) {
    const f = fx.current;
    const s = game.current;
    // Herzschlag im Takt des Pulses: Kurve, und ab angespannt auch zu hören.
    const period = 60 / s.pulse;
    f.heartAt += dt;
    if (f.heartAt >= period) {
      f.heartAt -= period;
      const zone = zoneOf(s.pulse);
      if (running && zone !== 'green') playSound(MINIGAME_SOUNDS.heartbeat, zone === 'red' ? 0.7 : 0.35);
    }
    f.ecgAcc += dt;
    while (f.ecgAcc >= 1 / 60) {
      f.ecgAcc -= 1 / 60;
      f.ecg[f.ecgHead] = ecgShape(f.heartAt / period);
      f.ecgHead = (f.ecgHead + 1) % ECG_POINTS;
    }
    const e = ecg.current;
    if (e) {
      const zone = zoneOf(s.pulse);
      drawEcg(
        e.ctx,
        e.width,
        e.height,
        f.ecg,
        f.ecgHead,
        zone === 'green' ? palette.money : zone === 'yellow' ? palette.gold : palette.danger,
      );
    }
    // Leitring: zieht sich bis zum nächsten ruhigen Schlag aufs Herz zusammen.
    if (ring.current) {
      const p = beatPhase(s);
      ring.current.style.transform = `scale(${(1 + 0.32 * (1 - p)).toFixed(3)})`;
      ring.current.style.opacity = (0.25 + 0.75 * p).toFixed(3);
    }
    if (heart.current && f.t - f.tapFx.at > 0.25 && heart.current.hasAttribute('data-tap')) {
      heart.current.removeAttribute('data-tap');
    }
  }

  useFrameLoop((dt) => {
    const f = fx.current;
    const s = game.current;
    f.t += dt;
    react(advance(setup, s, dt));
    // Lampe: auf dich, solange er fragt; nach unten bei den Papieren; weg, wenn er hinten leuchtet.
    const atWindow = s.action !== 'flashlight' && s.outcome !== 'flee' && s.outcome !== 'pass' && s.outcome !== 'bribe';
    const glareTarget =
      atWindow && s.action !== 'papers' && s.action !== 'radio' ? (s.outcome === 'fail' ? 1 : 0.7) : 0;
    const downTarget = s.action === 'papers' ? 0.8 : 0;
    const k = Math.min(1, dt * 4);
    f.glare += (glareTarget - f.glare) * k;
    f.down += (downTarget - f.down) * k;
    if (f.sweep >= 0) {
      f.sweep += dt / 3.2;
      if (s.action !== 'flashlight') f.sweep = -1;
    }
    f.surge = Math.max(0, f.surge - dt * 0.9);
    f.relief = s.outcome === 'pass' || s.outcome === 'bribe' ? Math.min(1, f.relief + dt) : Math.max(0, f.relief - dt);
    if (s.outcome !== 'fail') f.red = Math.max(0, f.red - dt);
    if (drops.current && placement) stepDrops(drops.current, placement.layout, dt, weather === 'storm' ? 3 : 1);
    drawScene();
    drawPulse(dt);
    // Frist der Antwort direkt ins DOM.
    if (timerBar.current) {
      const share = s.phase === 'ask' ? Math.max(0, s.answerLeft / answerTimeOf(setup, s)) : 0;
      timerBar.current.style.transform = `scaleX(${share.toFixed(3)})`;
      timerBar.current.parentElement?.classList.toggle('is-urgent', share < 0.34 && s.phase === 'ask');
    }
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      setHud((h) => {
        const n = snapshot(s, f.lineId);
        return Math.abs(h.pulse - n.pulse) < 0.5 &&
          Math.abs(h.suspicion - n.suspicion) < 0.004 &&
          h.lineId === n.lineId &&
          h.phase === n.phase
          ? h
          : n;
      });
    }
    if (isDone(s)) finish();
  }, running);

  // Vor dem Start (Einleitung, 3-2-1) und danach steht die Szene als Bild (Blaulicht im Standbild).
  useEffect(() => {
    if (!running) drawScene();
  }, [running, placement]);

  const s = game.current;
  const q = currentQuestion(s);
  const answers = q && hud.phase === 'ask' ? answersOf(q) : [];
  const zone = zoneOf(hud.pulse);
  const officerClass = [
    hud.action === 'flashlight' ? 'is-away' : '',
    hud.action === 'radio' ? 'is-radio' : '',
    hud.action === 'papers' ? 'is-papers' : '',
    hud.outcome === 'pass' || hud.outcome === 'bribe' ? 'is-leaving' : '',
    hud.outcome === 'fail' ? 'is-angry' : '',
    hud.outcome === 'flee' ? 'is-jump' : '',
    zone === 'red' && hud.phase === 'ask' ? 'is-staring' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const mouth: MouthStyle =
    hud.outcome === 'bribe' ? 'smirk' : hud.suspicion >= 0.55 ? 'hard' : hud.suspicion >= 0.3 ? 'tired' : 'neutral';
  const bubble =
    hud.outcome === 'flee'
      ? null
      : hud.phase === 'ask' && q
        ? questionText(setup, q)
        : hud.action && !hud.line
          ? null
          : (hud.line ?? (q ? questionText(setup, q) : ''));
  const bribeWindow = hud.suspicion >= BRIBE_MIN && hud.suspicion <= BRIBE_MAX;
  const layout = placement?.layout;
  const narrow = layout?.narrow ?? false;
  const officerStyle = layout
    ? {
        left: `${layout.officer.x}px`,
        top: `${layout.officer.y}px`,
        width: `${layout.officer.size}px`,
        height: `${layout.officer.size}px`,
      }
    : undefined;
  const done = hud.phase === 'end';

  return (
    <div
      class={`traffic is-${light}${narrow ? ' is-narrow' : ''}${done ? ' is-done' : ''}`}
      style={layout ? { '--belt': `${layout.belt}px` } : undefined}
    >
      <canvas
        ref={backCanvas}
        class="traffic__canvas"
        role="img"
        aria-label="Blick vom Fahrersitz: der Beamte am Fenster"
      />
      <div class="traffic__window" style={placement ? { clipPath: placement.clip } : undefined} aria-hidden="true">
        <div class={`traffic__officer ${officerClass}`} style={officerStyle}>
          <Officer look={look} mouth={mouth} />
          <div ref={tint} class="traffic__tint" />
        </div>
      </div>
      <canvas ref={frontCanvas} class="traffic__canvas traffic__front" role="img" aria-label="Taschenlampe und Regen" />

      <HudBar class="traffic__hud">
        <span
          class="traffic__count"
          role="img"
          aria-label={`Frage ${Math.min(hud.index + 1, hud.count)} von ${hud.count}`}
        >
          <Icon name="help" />
          {Math.min(hud.index + 1, hud.count)}/{hud.count}
        </span>
        <div class="traffic-sus" style={{ '--limit': `${(setup.limit * 100).toFixed(1)}%` }}>
          <span class="traffic-sus__head">
            <span class="traffic-sus__label">Misstrauen</span>
            <span class="traffic-sus__value">{Math.round(hud.suspicion * 100)}</span>
          </span>
          <span class="traffic-sus__bar" aria-hidden="true">
            <span
              class={`traffic-sus__fill${hud.suspicion >= setup.limit ? ' is-over' : ''}`}
              style={{ transform: `scaleX(${hud.suspicion.toFixed(3)})` }}
            />
            <span class="traffic-sus__limit" />
          </span>
          <span class="mg-sr">{`Misstrauen ${Math.round(hud.suspicion * 100)} Prozent, Grenze ${Math.round(setup.limit * 100)}`}</span>
        </div>
        {hud.radioed && (
          <span class="traffic__chip is-law">
            <Icon name="signal" />
            Kollegen kommen
          </span>
        )}
      </HudBar>

      <section class="traffic__talk" aria-live="polite">
        {bubble !== null ? (
          <p
            key={hud.lineId}
            class={`traffic__bubble${done ? (hud.outcome === 'fail' ? ' is-bad' : hud.outcome === 'flee' ? '' : ' is-good') : ''}`}
          >
            {bubble}
          </p>
        ) : (
          <p key={hud.lineId} class="traffic__bubble is-action">
            {hud.outcome === 'flee'
              ? 'Du legst den Gang ein und trittst aufs Gas …'
              : hud.action
                ? `Er ${ACTION_TEXT[hud.action]} …`
                : ''}
          </p>
        )}
        {hud.phase === 'event' && hud.line && hud.action && (
          <p class="traffic__note">
            <Icon name={hud.action === 'radio' ? 'signal' : 'idCard'} />
            Er {ACTION_TEXT[hud.action]}.
          </p>
        )}
        <span class="traffic__timer" aria-hidden="true">
          <span ref={timerBar} />
        </span>
        {answers.length > 0 ? (
          <ol class="traffic__answers">
            {answers.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  class={`traffic__answer${zone === 'red' ? ' is-shaky' : ''}`}
                  disabled={!running}
                  onClick={() => pickAnswer(i)}
                >
                  <kbd class="traffic__key">{i + 1}</kbd>
                  <span>{a.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p class={`traffic__said${hud.shaky ? ' is-shaky' : ''}`}>
            {hud.said ? (
              <>
                <span class="traffic__you">Du</span>
                {hud.said === '…' ? 'Du sagst nichts.' : `„${hud.said}“`}
              </>
            ) : null}
          </p>
        )}
      </section>

      <aside class="traffic__side" aria-label="Puls und Auswege">
        <div class={`traffic-pulse is-${zone}`}>
          <button
            ref={heart}
            type="button"
            class="traffic-pulse__heart"
            aria-label="Im Takt tippen, um ruhig zu bleiben"
            disabled={!running}
            onPointerDown={(e) => {
              e.preventDefault();
              tapBeat();
            }}
            onClick={(e) => {
              if ((e as MouseEvent).detail === 0) tapBeat();
            }}
          >
            <span ref={ring} class="traffic-pulse__ring" />
            <Icon name="heart" />
          </button>
          <div class="traffic-pulse__read">
            <span class="traffic-pulse__bpm">
              {Math.round(hud.pulse)}
              <small>Puls</small>
            </span>
            <span class="traffic-pulse__zone">{ZONE_LABEL[zone]}</span>
            <canvas ref={ecgCanvas} class="traffic-pulse__ecg" role="img" aria-label="Puls-Kurve" />
          </div>
        </div>
        <div class="traffic__ways">
          <button type="button" class="traffic__way is-danger" disabled={!running || done} onClick={doFlee}>
            <Icon name="car" />
            <span>Gas geben</span>
            <kbd class="traffic__key">G</kbd>
          </button>
          {bribeCost > 0 && (
            <button
              type="button"
              class={`traffic__way is-money${bribeWindow ? ' is-open' : ''}`}
              disabled={!running || done || !affordable}
              onClick={doBribe}
              title={affordable ? undefined : `Nicht genug Schwarzgeld (${formatEuro(bribeCost)}).`}
            >
              <Icon name="cash" />
              <span>Schein · {formatEuro(bribeCost)}</span>
              <kbd class="traffic__key">B</kbd>
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
