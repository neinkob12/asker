// Rahmen eines Minispiels (Dialog 'minigames.play'): Einleitung → 3-2-1 → Spiel → Ergebnis. Pflicht: kein Schließen,
// kein Esc, kein Wegwischen. Eigenes Overlay (kein MapDialog/Sheet, die haben am Handy immer einen Schließen-Knopf),
// am Handy bildschirmfüllend; den Fokus setzt der Rahmen selbst (area 'map' hat keine Fokus-Falle).
// Erst „Weiter“ schickt das Ergebnis: zuerst den Dialog schließen, dann den Befehl (sonst schlösse man den Dialog,
// den die Folgen öffnen, z.B. die Akte der Konfrontation).

import { useEffect, useRef, useState } from 'preact/hooks';
import { formatPercent } from '../../../core';
import { audio, Disclosure, haptic, Icon, useGame, useUi } from '../../../ui';
import { type Challenge, delegateInfo, getChallenge, MINIGAME_KINDS, winAt } from '../index';
import { restoreDialog, setDevFinish } from './flow';
import { HudBar, ResultStamp } from './kit/hud';
import { useMapTakeover } from './kit/mapTakeover';
import { MINIGAME_SOUNDS, playSound } from './kit/sounds';
import { useFrameLoop } from './kit/useFrameLoop';
import { type MinigameStat, minigameView } from './registry';

type Phase = 'intro' | 'countdown' | 'play' | 'paused' | 'result';

/** Dauer des Countdowns (3, 2, 1, Los) in Sekunden. */
const COUNTDOWN = 3.6;

/** So nah an der Schwelle (winAt) heißt es im Ergebnis „Knapp!“. */
const CLOSE_MARGIN = 0.08;

/** Wertung im Ergebnis: Dauer, bis der Balken steht (echte Sekunden). */
const SCORE_COUNT_SECONDS = 0.8;

/** Höchstens so viele Werte aus dem Spiel stehen im Ergebnis, jeder höchstens so lang. */
const STATS_MAX = 4;
const STAT_MAX_LENGTH = 24;

/** Lage aus der Schwierigkeit (challenge.difficulty): Wort, Stufe (1–4 Striche) und Farbe in der Einleitung. */
const SITUATION_LEVELS = [
  { below: 0.35, label: 'Ruhig', level: 1 },
  { below: 0.6, label: 'Angespannt', level: 2 },
  { below: 0.8, label: 'Brenzlig', level: 3 },
  { below: Number.POSITIVE_INFINITY, label: 'Kritisch', level: 4 },
] as const;

function situationLevel(difficulty: number): (typeof SITUATION_LEVELS)[number] {
  return SITUATION_LEVELS.find((s) => difficulty < s.below) ?? SITUATION_LEVELS[SITUATION_LEVELS.length - 1];
}

interface Outcome {
  score: number;
  picks: string[];
  won: boolean;
  stats: MinigameStat[];
}

/** Werte aus dem Spiel: nur Texte, kurz, höchstens STATS_MAX (nur Anzeige, nichts davon geht in den Spielstand). */
function cleanStats(stats: readonly MinigameStat[] | undefined): MinigameStat[] {
  if (!Array.isArray(stats)) return [];
  const cut = (text: unknown) => String(text ?? '').slice(0, STAT_MAX_LENGTH);
  return stats
    .filter((s) => s && typeof s === 'object')
    .slice(0, STATS_MAX)
    .map((s) => ({ label: cut(s.label), value: cut(s.value), icon: s.icon, tone: s.tone }));
}

function Intro(props: {
  challenge: Challenge;
  delegate: { name: string; chance: number } | null;
  onStart: () => void;
  onDelegate: () => void;
}) {
  const { challenge, delegate } = props;
  const view = minigameView(challenge.kind);
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus(), []);
  const mobileFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const situation = situationLevel(challenge.difficulty);
  return (
    <section class="mg-card mg-intro" aria-labelledby="mg-title">
      <div class="mg-intro__head">
        <p class="mg-kicker">
          <Icon name={view.icon ?? 'bolt'} class="mg-kicker__icon" />
          Minispiel · {MINIGAME_KINDS[challenge.kind].name}
        </p>
        <span class={`mg-level is-${situation.level}`} title="Wie schwer es wird">
          <span class="mg-level__bars" aria-hidden="true">
            {SITUATION_LEVELS.map((s) => (
              <span key={s.level} class={s.level <= situation.level ? 'is-on' : ''} />
            ))}
          </span>
          Lage: {situation.label}
        </span>
      </div>
      <h2 class="mg-title" id="mg-title">
        {challenge.title}
      </h2>
      <p class="mg-situation">{challenge.situation}</p>
      <ul class="mg-controls" aria-label="Steuerung">
        <li class={mobileFirst ? 'is-second' : ''}>
          <Icon name="keyboard" class="mg-controls__icon" />
          <span>{view.controls.keys}</span>
        </li>
        <li class={mobileFirst ? '' : 'is-second'}>
          <Icon name="vibrate" class="mg-controls__icon" />
          <span>{view.controls.touch}</span>
        </li>
      </ul>
      {view.controls.help && <Disclosure class="mg-more">{view.controls.help}</Disclosure>}
      <div class="mg-actions">
        <button ref={start} type="button" class="mg-button is-gold mg-button--big" onClick={props.onStart}>
          <Icon name="play" />
          Los
        </button>
        {delegate && (
          <button type="button" class="mg-button mg-button--big" onClick={props.onDelegate}>
            <Icon name="crew" />
            <span class="mg-button__label">
              {delegate.name.split(' ')[0]} übernimmt ({formatPercent(delegate.chance)})
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

function Countdown(props: { onDone: () => void }) {
  const [n, setN] = useState(3);
  const shown = useRef(3);
  const done = useRef(false);
  const start = useRef(performance.now());
  useEffect(() => playSound(MINIGAME_SOUNDS.count, 0.8), []);
  // Zeit über die eigene Schleife, nicht über CSS (bei „Bewegung reduzieren“ wäre die nach 1 ms vorbei). Echte
  // Sekunden statt gedeckelter Schritte: Auch bei wenigen Bildern pro Sekunde dauert 3-2-1 drei Sekunden.
  useFrameLoop(() => {
    const t = (performance.now() - start.current) / 1000;
    const next = t < 1 ? 3 : t < 2 ? 2 : t < 3 ? 1 : 0;
    if (next !== shown.current) {
      shown.current = next;
      setN(next);
      playSound(next === 0 ? MINIGAME_SOUNDS.go : MINIGAME_SOUNDS.count, 0.8);
      if (next === 0) haptic('medium');
    }
    if (t >= COUNTDOWN && !done.current) {
      done.current = true;
      props.onDone();
    }
  }, true);
  return (
    <div class="mg-countdown" aria-live="assertive">
      <span key={n} class={`mg-countdown__n${n === 0 ? ' is-go' : ''}`}>
        {n === 0 ? 'Los!' : n}
      </span>
    </div>
  );
}

/** Pause, wenn Tab oder App in den Hintergrund gehen: Das Spiel steht (running false), weiter mit 3-2-1. */
function Paused(props: { onResume: () => void }) {
  const resume = useRef<HTMLButtonElement>(null);
  useEffect(() => resume.current?.focus(), []);
  return (
    <section class="mg-card mg-paused" aria-labelledby="mg-title">
      <p class="mg-kicker">
        <Icon name="pause" class="mg-kicker__icon" />
        Pause
      </p>
      <h2 class="mg-title" id="mg-title">
        Kurz angehalten
      </h2>
      <p class="mg-situation">Das Spiel wartet auf dich. Nach „Weiter“ geht es mit 3-2-1 los.</p>
      <div class="mg-actions">
        <button ref={resume} type="button" class="mg-button is-gold mg-button--big" onClick={props.onResume}>
          <Icon name="play" />
          Weiter
        </button>
      </div>
    </section>
  );
}

/** Wertung 0–100 als Balken mit der Schwelle (winAt) als Marke; zählt beim Erscheinen hoch. */
function ScoreMeter(props: { score: number; goal: number; won: boolean }) {
  const { score, goal, won } = props;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? score : 0);
  const start = useRef(performance.now());
  const counting = !reduced && shown < score;
  useFrameLoop(() => {
    const t = Math.min(1, (performance.now() - start.current) / 1000 / SCORE_COUNT_SECONDS);
    // Schnell los, sanft auslaufen (ease-out kubisch).
    setShown(score * (1 - (1 - t) ** 3));
  }, counting);
  const close = Math.abs(score - goal) < CLOSE_MARGIN;
  return (
    <div class={`mg-score ${won ? 'is-won' : 'is-lost'}`}>
      <span class="mg-score__head">
        <span class="mg-score__label">Wertung</span>
        {close && <span class="mg-score__close">Knapp!</span>}
        <span class="mg-score__value">{Math.round(shown * 100)}</span>
      </span>
      <span class="mg-score__bar" aria-hidden="true">
        <span class="mg-score__fill" style={{ transform: `scaleX(${shown})` }} />
        <span class="mg-score__goal" style={{ left: `${goal * 100}%` }} />
      </span>
      <span class="mg-sr">{`Wertung ${Math.round(score * 100)} von 100, geschafft ab ${Math.round(goal * 100)}`}</span>
    </div>
  );
}

function Result(props: {
  challenge: Challenge;
  outcome: Outcome;
  preview: boolean;
  onNext: () => void;
  onAgain?: () => void;
}) {
  const { challenge, outcome } = props;
  const view = minigameView(challenge.kind);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    next.current?.focus();
    playSound(outcome.won ? MINIGAME_SOUNDS.win : MINIGAME_SOUNDS.lose, 0.9);
    haptic(outcome.won ? 'success' : 'error');
  }, [outcome.won]);
  const text =
    view.resultText?.({ won: outcome.won, score: outcome.score, picks: outcome.picks }, challenge) ??
    (outcome.won ? 'Das hat geklappt.' : 'Das ging schief.');
  const stamp = view.resultLabel?.({ won: outcome.won, score: outcome.score, picks: outcome.picks }, challenge);
  return (
    <section class={`mg-card mg-result ${outcome.won ? 'is-won' : 'is-lost'}`} aria-live="polite">
      <ResultStamp won={outcome.won} {...stamp} />
      <p class="mg-result__text">{text}</p>
      <ScoreMeter score={outcome.score} goal={winAt(challenge.kind)} won={outcome.won} />
      {outcome.stats.length > 0 && (
        <dl class="mg-stats">
          {outcome.stats.map((stat) => (
            <div key={stat.label} class={`mg-stat${stat.tone ? ` is-${stat.tone}` : ''}`}>
              <dt>
                {stat.icon && <Icon name={stat.icon} class="mg-stat__icon" />}
                {stat.label}
              </dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {props.preview && <p class="mg-result__note">Vorschau: nichts wird gezählt.</p>}
      <div class="mg-actions">
        <button ref={next} type="button" class="mg-button is-gold mg-button--big" onClick={props.onNext}>
          Weiter
          <Icon name="arrowRight" />
        </button>
        {props.onAgain && (
          <button type="button" class="mg-button mg-button--big" onClick={props.onAgain}>
            <Icon name="refresh" />
            Nochmal
          </button>
        )}
      </div>
    </section>
  );
}

/** Ein Durchlauf (neu angelegt bei „Nochmal“ in der Vorschau). */
function Run(props: { challenge: Challenge; preview: boolean; onAgain?: () => void }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const { challenge, preview } = props;
  const view = minigameView(challenge.kind);
  const [phase, setPhase] = useState<Phase>('intro');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const finished = useRef(false);
  const delegate = preview ? { name: 'Kalle', chance: 0.6 } : delegateInfo(state, challenge);

  const onFinish = (score: number, picks: string[] = [], stats?: readonly MinigameStat[]) => {
    if (finished.current) return;
    finished.current = true;
    const s = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
    setOutcome({ score: s, picks, won: s >= winAt(challenge.kind), stats: cleanStats(stats) });
    setPhase('result');
  };
  useEffect(() => {
    if (phase !== 'play') return;
    setDevFinish((won, score, stats) => onFinish(score ?? (won ? 0.9 : 0.1), [], stats));
    return () => setDevFinish(null);
  }, [phase]);
  // Tab oder App im Hintergrund: anhalten. Die Spiele kennen running = false schon aus Einleitung und Ergebnis.
  useEffect(() => {
    if (phase !== 'play') return;
    const onVisibility = () => {
      if (document.hidden && !finished.current) setPhase('paused');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase]);

  const leave = (send: () => void) => {
    ui.closeDialog();
    send();
    restoreDialog(ui);
  };
  const next = () => {
    if (!outcome) return;
    if (preview) {
      ui.closeDialog();
      return;
    }
    leave(() =>
      dispatch({ type: 'minigames.finish', payload: { id: challenge.id, score: outcome.score, picks: outcome.picks } }),
    );
  };
  const delegateNow = () => {
    if (preview) {
      // Vorschau: nur zeigen, wie es aussähe (Optik, kein Spielstand).
      const won = Math.random() < 0.6;
      onFinish(won ? 0.7 : 0.25);
      return;
    }
    leave(() => dispatch({ type: 'minigames.delegate', payload: { id: challenge.id } }));
  };

  const Game = view.component;
  return (
    <div class={`mg-run is-${phase}`}>
      <div class="mg-stage" aria-hidden={phase !== 'play'} inert={phase !== 'play' ? true : undefined}>
        <Game challenge={challenge} preview={preview} running={phase === 'play'} onFinish={onFinish} />
      </div>
      {phase === 'intro' && (
        <Intro
          challenge={challenge}
          delegate={delegate}
          onStart={() => setPhase('countdown')}
          onDelegate={delegateNow}
        />
      )}
      {phase === 'countdown' && <Countdown onDone={() => setPhase('play')} />}
      {phase === 'paused' && <Paused onResume={() => setPhase('countdown')} />}
      {phase === 'result' && outcome && (
        <div class={`mg-flash ${outcome.won ? 'is-won' : 'is-lost'}`} aria-hidden="true" />
      )}
      {phase === 'result' && outcome && (
        <Result challenge={challenge} outcome={outcome} preview={preview} onNext={next} onAgain={props.onAgain} />
      )}
    </div>
  );
}

/** Der Dialog: echte Challenge aus dem Spielstand oder Vorschau. */
export function MinigameFrame(props: { challengeId: number; preview?: Challenge }) {
  const { state } = useGame();
  const ui = useUi();
  const root = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  const live = props.preview ?? getChallenge(state, props.challengeId);
  // Die Challenge festhalten: Nach „Weiter“ ist sie aus dem Spielstand weg, der Rahmen zeigt aber noch zu Ende.
  const kept = useRef<Challenge | undefined>(live);
  if (live && live.id !== kept.current?.id) kept.current = live;
  const challenge = kept.current;
  const view = challenge ? minigameView(challenge.kind) : null;
  // layout 'map': Die Karte gehört dem Minispiel (keine Bedienung, keine Marker, kein HUD), bis der Rahmen zugeht. Das
  // Spiel startet erst danach (es führt die Kamera ab dem ersten Bild).
  const mapReady = useMapTakeover(view?.layout === 'map');
  // Fokus in den Rahmen (area 'map' hat keine Fokus-Falle), außer die Einleitung hat ihn schon auf „Los“ gesetzt.
  useEffect(() => {
    if (!root.current?.contains(document.activeElement)) root.current?.focus();
  }, []);
  // Solange der Rahmen offen ist, tritt die Musik zurück und die Stadt wird still: Das Spiel hat eigene Klänge.
  useEffect(() => {
    audio.setFocus(true);
    return () => audio.setFocus(false);
  }, []);
  return (
    <div
      ref={root}
      class={`mg-overlay mg-overlay--${view?.layout ?? 'stage'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mg-title"
      tabIndex={-1}
    >
      {challenge && !mapReady ? null : challenge ? (
        <Run
          key={`${challenge.id}:${round}`}
          challenge={challenge}
          preview={!!props.preview}
          onAgain={props.preview ? () => setRound((r) => r + 1) : undefined}
        />
      ) : (
        <section class="mg-card mg-intro">
          <HudBar>
            <span class="mg-title" id="mg-title">
              Minispiel vorbei
            </span>
          </HudBar>
          <p class="mg-situation">Dieses Minispiel ist schon entschieden.</p>
          <div class="mg-actions">
            <button type="button" class="mg-button is-gold mg-button--big" onClick={() => ui.closeDialog()}>
              Weiter
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
