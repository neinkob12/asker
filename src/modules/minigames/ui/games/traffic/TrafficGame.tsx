// Verkehrskontrolle (Auftrag 47): Du sitzt im Auto und schaust aus dem Fenster (3D-Szene in scene.ts). Der Beamte
// fragt, du wählst eine von drei Antworten (1 bis 3); richtig ist, was zu Kennzeichen, Uhrzeit, Ladung und deinen
// früheren Antworten passt (Modell in model.ts, Fragen in questions.ts). Jederzeit „Schein zustecken“ (B) und „Gas
// geben“ (G). Der Beamte spricht seine Zeilen (audio.speak), sein Gesicht kommt aus dem Look-System über der
// projizierten Kopfposition.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clock, formatEuro, type MouthStyle, type VoiceSpec, voiceFor, wallet } from '../../../../../core';
import { audio, haptic, Icon, LOOK_COLORS, prefersReducedMotion, useGame } from '../../../../../ui';
import { activeCity, CITIES, cityName } from '../../../../city';
import { HudBar, HudMeter } from '../../kit/hud';
import { phaseOf } from '../../kit/scene3d';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useStage3d } from '../../kit/stage3d';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import {
  advance,
  answer,
  bribe,
  createTraffic,
  flee,
  initTraffic,
  isDone,
  MAX_HITS,
  progress,
  type Question,
  type Signal,
  type TrafficState,
  trafficPicks,
  trafficScore,
} from './model';
import { Officer, officerLook } from './Officer';
import { OFFICER_LINES, QUESTIONS, VEHICLE_NAMES, VISIBLE_NAMES } from './questions';
import { createTrafficScene, type TrafficScene } from './scene';
import { TRAFFIC_SOUNDS } from './sounds';

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyG', 'KeyB'];

interface Hud {
  suspicion: number;
  hits: number;
  progress: number;
  line: { text: string; n: number } | null;
  question: Question | null;
  mouth: MouthStyle;
  where: string;
  message: { text: string; tone: 'good' | 'bad' | 'warn'; key: number } | null;
  done: boolean;
  outcome: TrafficState['outcome'];
}

function whereText(s: TrafficState): string {
  switch (s.phase) {
    case 'greet':
      return 'Er klopft ans Fenster.';
    case 'walk':
      return 'Er geht nach hinten und leuchtet durch die Scheibe.';
    case 'radio':
      return 'Er gibt das Kennzeichen durch.';
    case 'ask':
      return 'Er wartet auf deine Antwort.';
    default:
      return '';
  }
}

export function TrafficGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const { state: gameState } = useGame();
  const phase = useMemo(() => phaseOf(challenge.params.phase), [challenge.params.phase]);
  const night = phase === 'night';
  const rain = challenge.params.weather === 'rain' || challenge.params.weather === 'storm';
  const reduced = useMemo(prefersReducedMotion, []);
  const cityId = props.preview ? activeCity(gameState) : challenge.cityId;
  const setup = useMemo(() => {
    const hour = typeof challenge.params.hour === 'number' ? challenge.params.hour : clock.hour(gameState.time);
    return createTraffic(challenge.seed, challenge.difficulty, {
      hour,
      homeCity: cityName(cityId),
      otherCities: CITIES.filter((c) => c.id !== cityId && !c.template).map((c) => c.name),
    });
    // Die Spieluhr nur beim Aufbau lesen: Das Spiel steht still, solange das Minispiel offen ist.
    // biome-ignore lint/correctness/useExhaustiveDependencies: Aufbau einmal je Lage
  }, [challenge.seed, challenge.difficulty, cityId]);
  const game = useRef<TrafficState>(initTraffic(setup));
  const look = useMemo(() => officerLook(challenge.seed), [challenge.seed]);
  const voice = useMemo<VoiceSpec>(() => voiceFor(`police:traffic:${challenge.seed}`, look), [challenge.seed, look]);
  const bribeCost = Number(challenge.params.bribeCost) || 0;
  const canPay = bribeCost > 0 && (props.preview || wallet.canAfford(gameState, bribeCost, 'dirty'));
  const canvas = useRef<HTMLCanvasElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const fx = useRef({
    t: 0,
    scene: null as TrafficScene | null,
    lastHud: -1,
    sent: false,
    endAt: -1,
    mouth: 'neutral' as MouthStyle,
    messageKey: 0,
    spokenLine: -1,
    speech: null as (() => void) | null,
    flash: 0,
  });
  const [hud, setHud] = useState<Hud>(() => snapshot(game.current, 'neutral', null));

  function snapshot(s: TrafficState, mouth: MouthStyle, message: Hud['message']): Hud {
    return {
      suspicion: s.suspicion,
      hits: s.hits,
      progress: progress(setup, s),
      line: s.line,
      question: s.phase === 'ask' ? s.question : null,
      mouth,
      where: whereText(s),
      message,
      done: s.phase === 'end',
      outcome: s.outcome,
    };
  }
  const refreshHud = (message?: Hud['message']) =>
    setHud((h) => snapshot(game.current, fx.current.mouth, message === undefined ? h.message : message));
  const say = (text: string, tone: 'good' | 'bad' | 'warn') => {
    fx.current.messageKey += 1;
    refreshHud({ text, tone, key: fx.current.messageKey });
  };

  // ------------------------------------------------------------------ Szene
  const sceneFor = () => {
    const f = fx.current;
    f.scene ??= createTrafficScene({
      phase,
      rain,
      reduced,
      vehicle: setup.evidence.vehicle,
      visible: setup.evidence.visible,
      skin: LOOK_COLORS.skin[look.skin] ?? LOOK_COLORS.skin[1],
    });
    return f.scene;
  };
  const stage = useStage3d(canvas, (st) => {
    sceneFor().resize(st.width, st.height);
    draw(0);
  });
  function draw(dt: number) {
    const st = stage.current;
    if (!st) return;
    const scene = sceneFor();
    scene.update(game.current, dt);
    scene.render(st);
    const el = face.current;
    const h = scene.head;
    if (el) {
      el.style.transform = `translate(${(h.x - h.size / 2).toFixed(1)}px, ${(h.y - h.size * 0.52).toFixed(1)}px)`;
      el.style.width = `${h.size.toFixed(1)}px`;
      el.style.height = `${h.size.toFixed(1)}px`;
      el.style.opacity = h.visible ? '1' : '0';
    }
  }
  useEffect(
    () => () => {
      fx.current.scene?.dispose();
      fx.current.scene = null;
      fx.current.speech?.();
      fx.current.speech = null;
    },
    [],
  );

  // Stimme vorab laden und die festen Zeilen vorrechnen.
  useEffect(() => {
    audio.prepareVoice(voice);
    const lines = [
      ...QUESTIONS.map((q) => q.ask(setup.evidence, {})),
      ...OFFICER_LINES.greetDay,
      ...OFFICER_LINES.greetNight,
      ...OFFICER_LINES.ok,
      ...OFFICER_LINES.walk,
      ...OFFICER_LINES.radio,
      ...OFFICER_LINES.pass,
    ];
    audio.prepareSpeech(lines, voice);
  }, [setup, voice]);
  const speakLine = () => {
    const f = fx.current;
    const line = game.current.line;
    if (!line || line.n === f.spokenLine) return;
    f.spokenLine = line.n;
    f.speech?.();
    f.speech = audio.speak(line.text, voice, () => {
      f.speech = null;
    });
  };

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    f.speech?.();
    f.speech = null;
    onFinish(trafficScore(game.current), trafficPicks(game.current));
  };

  // ------------------------------------------------------------------ Eingaben
  const choose = (index: number) => {
    const s = game.current;
    if (!running || s.phase !== 'ask') return;
    const result = answer(setup, s, index);
    const f = fx.current;
    if (result === 'ok') {
      audio.playThrottled(MINIGAME_SOUNDS.click, 40, { volume: 0.5 });
      haptic('selection');
      f.mouth = 'neutral';
    } else if (result === 'hit') {
      playSound(MINIGAME_SOUNDS.fail, 0.8);
      haptic('error');
      f.mouth = 'hard';
      f.flash = 1;
      say('Das passt nicht zu dem, was er sieht oder gehört hat.', 'bad');
    } else if (result === 'fail') {
      audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.9 });
      haptic('error');
      f.mouth = 'hard';
      f.flash = 1;
      f.endAt = f.t + 2.6;
      say('Zweiter Widerspruch. „Aussteigen.“', 'bad');
    }
    refreshHud();
  };
  const onFlee = () => {
    if (!running || !flee(game.current)) return;
    audio.play(TRAFFIC_SOUNDS.rev, { volume: 0.9 });
    haptic('medium');
    fx.current.mouth = 'hard';
    refreshHud();
  };
  const onBribe = () => {
    if (!running || !canPay) return;
    const result = bribe(game.current);
    const f = fx.current;
    if (result === 'ok') {
      playSound(MINIGAME_SOUNDS.clunk, 0.8);
      haptic('success');
      f.mouth = 'smirk';
    } else if (result !== 'done') {
      playSound(MINIGAME_SOUNDS.fail, 0.7);
      haptic('error');
      f.mouth = 'hard';
      say(
        result === 'low' ? 'Zu früh: Dafür ist er noch nicht sauer genug.' : 'Zu spät: Jetzt ist er richtig sauer.',
        'bad',
      );
      if (result === 'high') f.endAt = f.t + 2;
    }
    refreshHud();
  };
  useGameKeys(
    KEYS,
    (press) => {
      const code = press.code;
      if (code === 'KeyG') onFlee();
      else if (code === 'KeyB') onBribe();
      else choose(Number(code.slice(-1)) - 1);
    },
    running,
  );

  // ------------------------------------------------------------------ Signale
  const onSignals = (signals: Signal[]) => {
    const f = fx.current;
    for (const sig of signals) {
      switch (sig) {
        case 'greet':
          audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.7 });
          break;
        case 'ask':
          audio.playThrottled(MINIGAME_SOUNDS.click, 100, { volume: 0.25 });
          f.mouth = 'neutral';
          break;
        case 'walk':
          audio.play(TRAFFIC_SOUNDS.flashlight, { volume: 0.5 });
          break;
        case 'radio':
          audio.play(TRAFFIC_SOUNDS.radio, { volume: 0.5 });
          break;
        case 'slow':
          f.mouth = 'smirk';
          say('Er wird ungeduldig.', 'warn');
          break;
        case 'pass':
          f.mouth = 'grin';
          f.endAt = f.t + 1.8;
          haptic('success');
          break;
        case 'fail':
          f.mouth = 'hard';
          f.endAt = f.t + 2;
          break;
        default:
          break;
      }
    }
  };

  useFrameLoop((dt) => {
    const s = game.current;
    const f = fx.current;
    f.t += dt;
    if (!isDone(s)) onSignals(advance(setup, s, dt));
    speakLine();
    f.flash = Math.max(0, f.flash - dt * 1.5);
    draw(dt);
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      refreshHud();
    }
    if (s.outcome === 'flee' && isDone(s)) finish();
    else if (s.outcome === 'bribe' && isDone(s)) finish();
    else if (f.endAt >= 0 && f.t >= f.endAt && isDone(s)) finish();
  }, running);

  useEffect(() => {
    draw(0);
    if (!running) {
      fx.current.speech?.();
      fx.current.speech = null;
    }
  }, [running]);

  const ev = setup.evidence;
  const q = hud.question;
  return (
    <div
      class={`traffic traffic--${phase}${hud.done ? ' is-done' : ''}${hud.outcome ? ` is-${hud.outcome}` : ''}`}
      style={{ '--traffic-flash': fx.current.flash }}
    >
      <canvas ref={canvas} class="traffic__canvas" role="img" aria-label="Blick vom Fahrersitz aus dem Fenster" />
      <div ref={face} class="traffic__face" aria-hidden="true">
        <Officer look={look} mouth={hud.mouth} />
      </div>
      <div class="traffic__wash" aria-hidden="true" />

      <HudBar class="traffic__hud">
        <HudMeter label="Misstrauen" value={hud.suspicion} color="danger" detail={Math.round(hud.suspicion * 100)} />
        <span class="traffic__found" role="img" aria-label={`${hud.hits} von ${MAX_HITS} Widersprüchen`}>
          <Icon name="alert" />
          {Array.from({ length: MAX_HITS }, (_, i) => (
            <span key={i} class={`traffic__found-dot${i < hud.hits ? ' is-hit' : ''}`} />
          ))}
        </span>
        <HudMeter label="Gespräch" value={hud.progress} color="law" detail={`${Math.round(hud.progress * 100)} %`} />
      </HudBar>

      <aside class="traffic__facts" aria-label="Was er sieht">
        <span class="traffic__fact">
          <Icon name="clock" />
          {`${ev.hour} Uhr`}
        </span>
        <span class="traffic__fact">
          <Icon name="car" />
          {VEHICLE_NAMES[ev.vehicle]}
        </span>
        <span class={`traffic__fact${ev.plateHome ? '' : ' is-warn'}`}>
          <Icon name="idCard" />
          {`${ev.plateCity}er Kennzeichen`}
        </span>
        <span class="traffic__fact">
          <Icon name="package" />
          {`Hinten: ${VISIBLE_NAMES[ev.visible]}`}
        </span>
      </aside>

      <div class="traffic__speech-card" aria-live="polite">
        {hud.line && (
          <p key={hud.line.n} class="traffic__line">
            {hud.line.text}
          </p>
        )}
        <p class="traffic__where">{hud.where}</p>
      </div>

      {hud.message && (
        <p key={hud.message.key} class={`traffic__message is-${hud.message.tone}`} aria-live="polite">
          {hud.message.text}
        </p>
      )}

      <div class="traffic__bottom">
        <div class="traffic__answers">
          {q
            ? q.answers.map((a, i) => (
                <button
                  key={`${q.id}-${i}`}
                  type="button"
                  class="traffic__answer mg-pad"
                  disabled={!running}
                  onClick={() => choose(i)}
                >
                  <kbd>{i + 1}</kbd>
                  <span>{a.text}</span>
                </button>
              ))
            : !hud.done && <p class="traffic__waiting">{hud.where}</p>}
        </div>
        <div class="traffic__actions">
          <button
            type="button"
            class="mg-pad is-danger"
            disabled={!running || hud.done}
            onClick={onFlee}
            aria-label="Gas geben: Verfolgungsjagd"
          >
            <Icon name="car" />
            <span>Gas geben</span>
            <kbd>G</kbd>
          </button>
          <button
            type="button"
            class="mg-pad is-money"
            disabled={!running || hud.done || !canPay}
            onClick={onBribe}
            aria-label="Schein zustecken"
            title={canPay ? undefined : 'Dafür fehlt das Schwarzgeld.'}
          >
            <Icon name="cash" />
            <span>{bribeCost > 0 ? `Schein · ${formatEuro(bribeCost)}` : 'Schein'}</span>
            <kbd>B</kbd>
          </button>
        </div>
      </div>
      {night && <span class="mg-sr">Nacht</span>}
    </div>
  );
}
