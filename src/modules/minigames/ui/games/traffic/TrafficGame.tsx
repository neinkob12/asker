// Verkehrskontrolle (Auftrag 47, neu in Auftrag 48): Du sitzt im Auto und schaust aus dem Fenster (3D-Szene in
// scene.ts, Beamter in officer.ts, Gesicht aus dem Look-System als Textur). Der Beamte fragt, du wählst eine von drei
// Antworten (1 bis 3); richtig ist, was zu Kennzeichen, Uhrzeit, Ladung und deinen früheren Antworten passt (Modell in
// model.ts, Fragen in questions.ts). Links steht, was er sieht und was du schon gesagt hast; fliegt etwas auf, leuchtet
// auf, woran es hing. Unter der Frage läuft seine Geduld ab. Jederzeit „Schein zustecken“ (B) und „Gas geben“ (G).
// Spannung: Puls im Takt des Misstrauens, Regen auf dem Dach, ein Widerspruch hält das Bild an (Hit-Stop), die Kamera
// ruckt und zieht heran, er rückt dir mit der Lampe ins Gesicht. Der Beamte spricht seine Zeilen (audio.speak).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clock, formatEuro, type VoiceSpec, voiceFor, wallet } from '../../../../../core';
import { audio, haptic, Icon, LOOK_COLORS, prefersReducedMotion, useGame } from '../../../../../ui';
import { activeCity, CITIES, cityName } from '../../../../city';
import { HudBar, HudMeter } from '../../kit/hud';
import { PauseButton } from '../../kit/pause';
import { phaseOf } from '../../kit/scene3d';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useStage3d } from '../../kit/stage3d';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import type { Expression } from './faceTexture';
import { officerLook } from './look';
import {
  advance,
  answer,
  bribe,
  contradiction,
  createTraffic,
  flee,
  initTraffic,
  isDone,
  MAX_HITS,
  patience,
  progress,
  type Question,
  questionDef,
  type Signal,
  type Topic,
  type TrafficState,
  trafficPicks,
  trafficScore,
  trafficStats,
} from './model';
import { measureFrame } from './perf';
import {
  type FactKey,
  OFFICER_LINES,
  plateAdjective,
  QUESTIONS,
  STORY_LABELS,
  storyText,
  VEHICLE_NAMES,
  VISIBLE_NAMES,
} from './questions';
import { createTrafficScene, type TrafficScene } from './scene';
import { TRAFFIC_SOUNDS } from './sounds';

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyG', 'KeyB'];

/** Hit-Stop bei einem Widerspruch (Sekunden, in denen das Bild steht). */
const HIT_STOP = 0.09;
/** Puls: Schläge pro Minute ohne und mit vollem Misstrauen. */
const PULSE = { calm: 68, tense: 150 };

interface Hud {
  suspicion: number;
  hits: number;
  progress: number;
  line: { text: string; n: number } | null;
  question: Question | null;
  where: string;
  message: { text: string; tone: 'good' | 'bad' | 'warn'; key: number } | null;
  done: boolean;
  outcome: TrafficState['outcome'];
  /** Was du bisher gesagt hast (in der Reihenfolge der Sachen). */
  story: { key: FactKey; text: string }[];
  /** Woran der letzte Widerspruch hing (leuchtet auf), mit Zähler für die Animation. */
  caught: { topics: Topic[]; key: number } | null;
  /** Er überlegt noch, was er sagt (Pause nach einem Widerspruch). */
  pause: boolean;
  /** Deine letzte Antwort (aufgeflogen: durchgestrichen). */
  said: { text: string; hit: boolean; key: number } | null;
  /** Misstrauen sprang hoch (aufploppende Zahl). */
  jump: { value: number; key: number } | null;
}

const STORY_ORDER: FactKey[] = ['from', 'to', 'owner', 'cargo', 'purpose'];

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

/** Ausdruck des Beamten aus dem Zustand und dem, was gerade passiert ist. */
function expressionOf(s: TrafficState, alarm: number): Expression {
  if (s.outcome === 'bribe') return 'smirk';
  if (s.outcome === 'pass') return s.hits > 0 ? 'calm' : 'grin';
  if (s.outcome === 'fail' || s.outcome === 'flee' || alarm > 0.1) return 'hard';
  if (s.suspicion > 0.62) return 'hard';
  if (s.suspicion > 0.38 || (s.phase === 'ask' && s.slowSaid)) return 'doubt';
  return 'calm';
}

export function TrafficGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const { state: gameState } = useGame();
  // Stunde und Tageszeit aus der Lage; fehlen sie (Vorschau ohne --uhr), aus der Spieluhr, damit Bild und Uhr passen.
  const hour = typeof challenge.params.hour === 'number' ? challenge.params.hour : clock.hour(gameState.time);
  const phase = useMemo(
    () => phaseOf(challenge.params.phase ?? clock.dayPhase(gameState.time)),
    [challenge.params.phase],
  );
  const night = phase === 'night';
  const rain = challenge.params.weather === 'rain' || challenge.params.weather === 'storm';
  const reduced = useMemo(prefersReducedMotion, []);
  const cityId = props.preview ? activeCity(gameState) : challenge.cityId;
  const setup = useMemo(
    () =>
      createTraffic(challenge.seed, challenge.difficulty, {
        hour,
        homeCity: cityName(cityId),
        otherCities: CITIES.filter((c) => c.id !== cityId && !c.template).map((c) => c.name),
      }),
    // Die Spieluhr nur beim Aufbau lesen: Das Spiel steht still, solange das Minispiel offen ist.
    [challenge.seed, challenge.difficulty, cityId],
  );
  const game = useRef<TrafficState>(initTraffic(setup));
  const look = useMemo(() => officerLook(challenge.seed), [challenge.seed]);
  const voice = useMemo<VoiceSpec>(() => voiceFor(`police:traffic:${challenge.seed}`, look), [challenge.seed, look]);
  const bribeCost = Number(challenge.params.bribeCost) || 0;
  const canPay = bribeCost > 0 && (props.preview || wallet.canAfford(gameState, bribeCost, 'dirty'));
  const canvas = useRef<HTMLCanvasElement>(null);
  const fx = useRef({
    t: 0,
    scene: null as TrafficScene | null,
    lastHud: -1,
    sent: false,
    endAt: -1,
    messageKey: 0,
    spokenLine: -1,
    speech: null as (() => void) | null,
    flash: 0,
    lineAt: 0,
    messageUntil: 0,
    caughtKey: 0,
    caught: null as Hud['caught'],
    said: null as Hud['said'],
    jump: null as Hud['jump'],
    alarm: 0,
    freeze: 0,
    nextBeat: 0,
    nextTick: 0,
    rain: null as ReturnType<typeof audio.loop> | null,
    light: { blue: -1, red: -1, glare: -1, x: -1, y: -1 },
  });
  const root = useRef<HTMLDivElement>(null);
  const patienceBar = useRef<HTMLSpanElement>(null);
  const [hud, setHud] = useState<Hud>(() => snapshot(game.current, null));

  function snapshot(s: TrafficState, message: Hud['message']): Hud {
    const f = fx.current;
    return {
      suspicion: s.suspicion,
      hits: s.hits,
      progress: progress(setup, s),
      line: s.line,
      question: s.phase === 'ask' ? s.question : null,
      where: whereText(s),
      message: message && f.t < f.messageUntil ? message : null,
      done: s.phase === 'end',
      outcome: s.outcome,
      story: STORY_ORDER.flatMap((key) => {
        const v = s.story[key];
        return v ? [{ key, text: storyText(key, v) }] : [];
      }),
      caught: f.caught,
      pause: f.t < f.lineAt,
      said: f.said,
      jump: f.jump,
    };
  }
  const refreshHud = (message?: Hud['message']) =>
    setHud((h) => snapshot(game.current, message === undefined ? h.message : message));
  const say = (text: string, tone: 'good' | 'bad' | 'warn') => {
    fx.current.messageKey += 1;
    fx.current.messageUntil = fx.current.t + 2.8;
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
      look,
      skin: LOOK_COLORS.skin[look.skin] ?? LOOK_COLORS.skin[1],
      jacket: LOOK_COLORS.top[look.topColor] ?? LOOK_COLORS.top[0],
      seed: challenge.seed,
    });
    return f.scene;
  };
  const stage = useStage3d(
    canvas,
    (st) => {
      sceneFor().resize(st.width, st.height);
      draw(0);
    },
    { maxDpr: 1.5 },
  );
  function draw(dt: number) {
    const st = stage.current;
    if (!st) return;
    const f = fx.current;
    const s = game.current;
    const scene = sceneFor();
    scene.update(s, dt, { expression: expressionOf(s, f.alarm), alarm: f.alarm, tension: s.suspicion });
    scene.render(st);
    // Blaulicht und Blendung als Licht über dem Bild (nur bei Änderung ins DOM).
    const box = root.current;
    const l = scene.light;
    const last = f.light;
    if (
      box &&
      (l.blue !== last.blue ||
        l.red !== last.red ||
        Math.abs(l.glare - last.glare) > 0.01 ||
        Math.abs(l.glareX - last.x) > 0.005 ||
        Math.abs(l.glareY - last.y) > 0.005)
    ) {
      last.blue = l.blue;
      last.red = l.red;
      last.glare = l.glare;
      last.x = l.glareX;
      last.y = l.glareY;
      box.style.setProperty('--traffic-blue', l.blue.toFixed(2));
      box.style.setProperty('--traffic-red', l.red.toFixed(2));
      box.style.setProperty('--traffic-glare', l.glare.toFixed(2));
      box.style.setProperty('--traffic-glare-x', `${(l.glareX * 100).toFixed(1)}%`);
      box.style.setProperty('--traffic-glare-y', `${(l.glareY * 100).toFixed(1)}%`);
    }
    if (patienceBar.current) {
      const p = patience(setup, s);
      patienceBar.current.style.transform = `scaleX(${p.toFixed(3)})`;
      patienceBar.current.dataset.low = p < 0.45 ? (p < 0.2 ? 'critical' : 'low') : '';
    }
    if (import.meta.env.DEV) {
      const perf = (window as unknown as { __mgPerf?: { calls?: number } }).__mgPerf;
      if (perf) perf.calls = scene.calls();
    }
  }
  useEffect(
    () => () => {
      const f = fx.current;
      f.scene?.dispose();
      f.scene = null;
      f.speech?.();
      f.speech = null;
      f.rain?.stop();
      f.rain = null;
    },
    [],
  );

  // Entwicklung: window.koeln.dev.traffic zeigt Aufbau und Zustand, .say(gut) antwortet passend bzw. mit einem
  // Widerspruch (Screenshots, Playwright).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const holder = window as unknown as { koeln?: { dev?: Record<string, unknown> } };
    if (!holder.koeln) return;
    holder.koeln.dev = {
      ...holder.koeln.dev,
      traffic: {
        setup,
        state: game.current,
        /** Sekunden seit dem Start (Bildzeit, auch mit Hit-Stop). */
        time: () => fx.current.t,
        scene: () => fx.current.scene?.debug(),
        say: (good = true) => {
          const q = game.current.question;
          if (!q) return false;
          const def = questionDef(q.id);
          const bad = q.answers.findIndex((a) => {
            const full = def.answers.find((x) => x.text === a.text);
            return !!full && contradiction(def, full, setup.evidence, game.current.story) !== null;
          });
          if (!good && bad < 0) return false;
          choose(good ? q.good : bad);
          return true;
        },
      },
    };
    return () => {
      if (holder.koeln?.dev) delete holder.koeln.dev.traffic;
    };
  }, [setup, running]);

  // Stimme vorab laden und die festen Zeilen vorrechnen.
  useEffect(() => {
    audio.prepareVoice(voice);
    const lines = [
      ...QUESTIONS.filter((q) => !q.repeat).map((q) => q.ask(setup.evidence, {})),
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
    if (!line || line.n === f.spokenLine || f.t < f.lineAt) return;
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
    f.rain?.stop();
    f.rain = null;
    onFinish(trafficScore(game.current), trafficPicks(game.current), trafficStats(game.current));
  };

  // ------------------------------------------------------------------ Eingaben
  const choose = (index: number) => {
    const s = game.current;
    if (!running || s.phase !== 'ask' || !s.question) return;
    const text = s.question.answers[index]?.text ?? '';
    const before = s.suspicion;
    const result = answer(setup, s, index);
    const f = fx.current;
    if (result === 'none') return;
    f.said = { text, hit: result !== 'ok', key: (f.said?.key ?? 0) + 1 };
    if (result === 'ok') {
      audio.playThrottled(MINIGAME_SOUNDS.click, 40, { volume: 0.5 });
      haptic('selection');
    } else {
      // Erst ein Moment Stille: Er stutzt, beugt sich vor, leuchtet dir ins Gesicht. Dann der Satz.
      caughtOut(result === 'fail', before);
    }
    refreshHud();
  };
  /** Widerspruch aufgeflogen: Hit-Stop, Schlag, Ruck, Heranzoomen, Blendung, die Fakten leuchten auf. */
  const caughtOut = (final: boolean, before: number) => {
    const f = fx.current;
    const s = game.current;
    f.lineAt = f.t + 0.75;
    f.flash = 1;
    f.alarm = 1;
    f.freeze = reduced ? 0 : HIT_STOP;
    f.caughtKey += 1;
    f.caught = { topics: [...s.caught], key: f.caughtKey };
    f.jump = { value: Math.round((s.suspicion - before) * 100), key: f.caughtKey };
    f.scene?.shake(final ? 1 : 0.75);
    f.scene?.punch(final ? 1 : 0.8);
    audio.play(TRAFFIC_SOUNDS.caught, { volume: 0.9 });
    haptic('error');
    if (final) {
      audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.9, delay: 0.5 });
      f.endAt = f.t + 3.2;
      say(s.hits >= MAX_HITS ? 'Zweiter Widerspruch. „Aussteigen.“' : 'Jetzt reicht es ihm. „Aussteigen.“', 'bad');
    } else {
      say(s.caught.length > 0 ? 'Das passt nicht zusammen. Er hat es gemerkt.' : 'Zu lange geschwiegen.', 'bad');
    }
  };

  const onFlee = () => {
    if (!running || !flee(game.current)) return;
    audio.play(TRAFFIC_SOUNDS.rev, { volume: 0.9 });
    haptic('medium');
    fx.current.scene?.shake(0.6);
    refreshHud();
  };
  const onBribe = () => {
    if (!running || !canPay) return;
    const result = bribe(game.current);
    const f = fx.current;
    if (result === 'ok') {
      playSound(MINIGAME_SOUNDS.clunk, 0.8);
      audio.play(TRAFFIC_SOUNDS.papers, { volume: 0.6 });
      haptic('success');
    } else if (result !== 'done') {
      playSound(MINIGAME_SOUNDS.fail, 0.7);
      haptic('error');
      f.alarm = 0.8;
      f.scene?.shake(0.4);
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
          f.scene?.shake(0.15);
          break;
        case 'ask':
          audio.playThrottled(MINIGAME_SOUNDS.click, 100, { volume: 0.25 });
          break;
        case 'walk':
          audio.play(TRAFFIC_SOUNDS.flashlight, { volume: 0.5 });
          break;
        case 'radio':
          audio.play(TRAFFIC_SOUNDS.radio, { volume: 0.5 });
          break;
        case 'slow':
          say('Er wird ungeduldig.', 'warn');
          haptic('warning');
          break;
        case 'silent':
          caughtOut(game.current.outcome === 'fail', game.current.suspicion - setup.hitSus);
          break;
        case 'pass':
          f.endAt = f.t + 2.6;
          audio.play(TRAFFIC_SOUNDS.tap, { volume: 0.8, delay: 0.5 });
          haptic('success');
          break;
        case 'fail':
          // Volles Misstrauen ohne Treffer: auch das ist ein Schlag.
          if (f.alarm < 0.5) caughtOut(true, game.current.suspicion);
          f.endAt = Math.max(f.endAt, f.t + 2.4);
          break;
        default:
          break;
      }
    }
  };

  /** Puls und Ticken: schneller mit dem Misstrauen, lauter, wenn die Geduld ausgeht. */
  const pulse = () => {
    const f = fx.current;
    const s = game.current;
    if (s.phase === 'end') return;
    const p = patience(setup, s);
    const tension = Math.min(1, s.suspicion + (1 - p) * 0.4);
    if (f.t >= f.nextBeat) {
      const bpm = PULSE.calm + (PULSE.tense - PULSE.calm) * tension;
      f.nextBeat = f.t + 60 / bpm;
      if (tension > 0.25) playSound(MINIGAME_SOUNDS.heartbeat, 0.12 + tension * 0.5);
    }
    if (s.phase === 'ask' && p < 0.35 && f.t >= f.nextTick) {
      f.nextTick = f.t + 0.5 + p * 1.5;
      audio.playThrottled(MINIGAME_SOUNDS.click, 120, { volume: 0.2 + (0.35 - p) });
    }
  };

  useFrameLoop((dt) => {
    measureFrame(() => {
      const s = game.current;
      const f = fx.current;
      f.t += dt;
      // Hit-Stop: Das Bild steht kurz, dann geht es weiter.
      let step = dt;
      if (f.freeze > 0) {
        f.freeze -= dt;
        step = 0;
      }
      if (!isDone(s) && step > 0) onSignals(advance(setup, s, step));
      speakLine();
      pulse();
      f.flash = Math.max(0, f.flash - dt * 1.5);
      f.alarm = Math.max(0, f.alarm - dt * 0.45);
      draw(step);
      if (f.t - f.lastHud > 0.1) {
        f.lastHud = f.t;
        refreshHud();
      }
      if (s.outcome === 'flee' && isDone(s)) finish();
      else if (s.outcome === 'bribe' && isDone(s)) finish();
      else if (f.endAt >= 0 && f.t >= f.endAt && isDone(s)) finish();
    });
  }, running);

  // Pause: Stimme und Regen anhalten. Geht es weiter und er wartet auf eine Antwort, wiederholt er seine Frage (sonst
  // nichts doppelt); Zeit, Geduld und Misstrauen stehen still, weil die Bildschleife steht.
  useEffect(() => {
    draw(0);
    const f = fx.current;
    if (!running) {
      f.rain?.stop();
      f.rain = null;
      if (f.speech) {
        f.speech();
        f.speech = null;
        if (game.current.phase === 'ask') f.spokenLine = -1;
      }
    } else if (rain && !f.sent && !f.rain) {
      f.rain = audio.loop(TRAFFIC_SOUNDS.rain, { rain: 1, volume: 0.8 });
    }
  }, [running]);

  const ev = setup.evidence;
  const q = hud.question;
  const lit = (topic: Topic) => (hud.caught?.topics.includes(topic) ? ' is-caught' : '');
  return (
    <div
      ref={root}
      class={`traffic traffic--${phase}${hud.done ? ' is-done' : ''}${hud.outcome ? ` is-${hud.outcome}` : ''}${reduced ? ' is-reduced' : ''}`}
      style={{ '--traffic-flash': fx.current.flash }}
    >
      <canvas ref={canvas} class="traffic__canvas" role="img" aria-label="Blick vom Fahrersitz aus dem Fenster" />
      <div class="traffic__glare" aria-hidden="true" />
      <div class="traffic__wash" aria-hidden="true" />

      <HudBar class="traffic__hud">
        <PauseButton />
        <span class="traffic__sus">
          <HudMeter label="Misstrauen" value={hud.suspicion} color="danger" detail={Math.round(hud.suspicion * 100)} />
          {hud.jump && hud.jump.value > 0 && (
            <span key={hud.jump.key} class="traffic__jump" aria-hidden="true">
              {`+${hud.jump.value}`}
            </span>
          )}
        </span>
        <span class="traffic__found" role="img" aria-label={`${hud.hits} von ${MAX_HITS} Widersprüchen`}>
          <Icon name="alert" />
          {Array.from({ length: MAX_HITS }, (_, i) => (
            <span key={i} class={`traffic__found-dot${i < hud.hits ? ' is-hit' : ''}`} />
          ))}
        </span>
        <HudMeter label="Gespräch" value={hud.progress} color="law" detail={`${Math.round(hud.progress * 100)} %`} />
      </HudBar>

      <aside class="traffic__facts" aria-label="Was er sieht und was du gesagt hast" data-key={hud.caught?.key ?? 0}>
        <p class="traffic__facts-head">Er sieht</p>
        <span key={`h${hud.caught?.key ?? 0}`} class={`traffic__fact${lit('hour')}`}>
          <Icon name="clock" />
          {`${ev.hour} Uhr`}
        </span>
        <span key={`v${hud.caught?.key ?? 0}`} class={`traffic__fact${lit('vehicle')}`}>
          <Icon name="car" />
          {VEHICLE_NAMES[ev.vehicle]}
        </span>
        <span key={`p${hud.caught?.key ?? 0}`} class={`traffic__fact${ev.plateHome ? '' : ' is-warn'}${lit('plate')}`}>
          <Icon name="idCard" />
          {`${plateAdjective(ev.plateCity)} Kennzeichen`}
        </span>
        <span key={`l${hud.caught?.key ?? 0}`} class={`traffic__fact${lit('visible')}`}>
          <Icon name="package" />
          {`Hinten: ${VISIBLE_NAMES[ev.visible]}`}
        </span>
        {hud.story.length > 0 && (
          <>
            <p class="traffic__facts-head">Du sagtest</p>
            {hud.story.map((item) => (
              <span key={`${item.key}${hud.caught?.key ?? 0}`} class={`traffic__fact is-said${lit('story')}`}>
                <span class="traffic__fact-label">{STORY_LABELS[item.key]}</span>
                {item.text}
              </span>
            ))}
          </>
        )}
      </aside>

      <div class={`traffic__speech-card${hud.pause ? ' is-pause' : ''}`} aria-live="polite">
        {hud.said && (hud.pause || hud.said.hit || hud.question === null) && (
          <p key={hud.said.key} class={`traffic__said${hud.said.hit ? ' is-hit' : ''}`}>
            <span class="traffic__said-who">Du</span>
            <span class="traffic__said-text">{`„${hud.said.text}“`}</span>
          </p>
        )}
        {hud.pause ? (
          <p class="traffic__line traffic__line--pause">…</p>
        ) : (
          hud.line && (
            <p key={hud.line.n} class="traffic__line">
              {hud.line.text}
            </p>
          )
        )}
        {hud.message ? (
          <p key={hud.message.key} class={`traffic__where traffic__message is-${hud.message.tone}`}>
            {hud.message.text}
          </p>
        ) : (
          <p class="traffic__where">{hud.where}</p>
        )}
        <span class={`traffic__patience${q ? '' : ' is-idle'}`} aria-hidden="true">
          <span ref={patienceBar} />
        </span>
      </div>

      <div class="traffic__bottom">
        <div class="traffic__answers">
          {q
            ? q.answers.map((a, i) => (
                <button
                  key={`${q.id}-${i}`}
                  type="button"
                  class="traffic__answer mg-pad"
                  style={{ '--i': i }}
                  disabled={!running}
                  onClick={() => choose(i)}
                >
                  <kbd>{i + 1}</kbd>
                  <span>{a.text}</span>
                </button>
              ))
            : null}
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
