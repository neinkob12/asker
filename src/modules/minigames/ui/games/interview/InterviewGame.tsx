// Bewerbungsgespräch (Feedback vom 07.10.2026: Lügendetektor). Hinterzimmer, Lampe über dem Tisch, gegenüber die
// Person (Face groß). Du stellst drei Fragen; die Antwort tippt sich in die Sprechblase und kommt mit der Stimme der
// Figur (audio.speak, wenn verfügbar). Während die Person redet, zeigt sie kurz Zeichen (Blick weg, Schwitzen,
// Zappeln, Kratzen, Grinsen) und harmlose Gesten (Nicken, Schluck, Schulterzucken, Vorbeugen). Zeichen rechtzeitig
// antippen (Leertaste, „Zeichen!“ oder die Person antippen); Gesten sind Fehlalarme. Links die Akte. Spiellogik in
// model.ts, die Zeichen sitzen als Overlay über dem Porträt (Tells.tsx).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type MouthStyle, personLook } from '../../../../../core';
import { audio, Face, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { TRAITS, type TraitId, traitName } from '../../../../staff';
import { HudBar } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import {
  activeCue,
  advance,
  CUE_NAMES,
  type CueKind,
  correctCount,
  createInterview,
  currentRound,
  discovered,
  type InterviewState,
  initInterview,
  interviewPicks,
  interviewScore,
  isDone,
  mark,
  type Phase,
  type Signal,
  typedChars,
} from './model';
import { INTERVIEW_SOUNDS } from './sounds';
import { TellMarks } from './Tells';

const KEYS = ['Space', 'Enter'];

/** params, wie sie recruiting mitgibt (InterviewParams); alles geprüft, weil es aus dem Spielstand kommt. */
interface Person {
  name: string;
  age: number | undefined;
  roleName: string;
  level: number;
  traits: TraitId[];
  known: TraitId[];
  voice: { feminine: boolean; pitch: number; rate: number } | null;
}

function isTrait(value: unknown): value is TraitId {
  return typeof value === 'string' && value in TRAITS;
}

function personOf(params: Record<string, unknown>): Person {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isTrait) : []);
  const voice = params.voice as Person['voice'];
  return {
    name: typeof params.name === 'string' ? params.name : 'Jemand',
    age: Number.isFinite(params.age) ? Number(params.age) : undefined,
    roleName: typeof params.roleName === 'string' ? params.roleName : '',
    level: Number.isFinite(params.level) ? Number(params.level) : 1,
    traits: list(params.traits),
    known: list(params.known),
    voice:
      voice && typeof voice === 'object' && Number.isFinite(voice.pitch) && Number.isFinite(voice.rate)
        ? { feminine: !!voice.feminine, pitch: voice.pitch, rate: voice.rate }
        : null,
  };
}

function toneOf(t: TraitId): 'good' | 'bad' | 'mixed' {
  return TRAITS[t].tone;
}

interface Hud {
  phase: Phase;
  round: number;
  results: InterviewState['results'];
  /** Zeichen dieser Runde: getroffen, verpasst (nach dem Fenster), Fehlalarme. */
  hits: number;
  misses: number;
  falseAlarms: number;
  /** Zähler, damit Sprechblasen bei jeder neuen Runde neu aufploppen. */
  beat: number;
  /** Letztes Tippen: Treffer oder Fehlalarm (für das Aufblitzen). */
  flash: { kind: 'hit' | 'false'; key: number } | null;
}

function snapshot(
  setup: ReturnType<typeof createInterview>,
  s: InterviewState,
  beat: number,
  flash: Hud['flash'],
): Hud {
  const round = currentRound(setup, s);
  const misses =
    round && s.phase === 'answer'
      ? round.cues.filter((c, i) => c.tell && s.t >= c.at + c.len && !s.caught.includes(i)).length
      : 0;
  return {
    phase: s.phase,
    round: s.round,
    results: [...s.results],
    hits: s.caught.length,
    misses,
    falseAlarms: s.falseAlarms,
    beat,
    flash,
  };
}

export function InterviewGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const person = useMemo(() => personOf(challenge.params), [challenge.params]);
  const setup = useMemo(
    () => createInterview(challenge.seed, challenge.difficulty, { traits: person.traits, known: person.known }),
    [challenge.seed, challenge.difficulty, person],
  );
  const game = useRef(initInterview());
  const reduced = useMemo(prefersReducedMotion, []);
  const look = useMemo(() => personLook(person.name, person.age), [person]);
  const typed = useRef<HTMLSpanElement>(null);
  const timerBar = useRef<HTMLSpanElement>(null);
  const personBox = useRef<HTMLButtonElement>(null);
  const fx = useRef({
    t: 0,
    sent: false,
    beat: 0,
    flashKey: 0,
    speech: null as (() => void) | null,
    typed: -1,
    lastHud: -1,
    cue: null as CueKind | null,
  });
  const [hud, setHud] = useState<Hud>(() => snapshot(setup, game.current, 0, null));
  const [cue, setCue] = useState<{ kind: CueKind; tell: boolean; key: number } | null>(null);

  // Stimme schon laden und alle Antworten vorrechnen (das Spiel steht still, solange es offen ist).
  useEffect(() => {
    if (!person.voice) return;
    audio.prepareVoice(person.voice);
    audio.prepareSpeech(
      setup.rounds.map((r) => r.answer),
      person.voice,
    );
  }, [setup, person]);

  // Aufräumen: Stimme verstummt mit dem Spiel.
  useEffect(
    () => () => {
      fx.current.speech?.();
      fx.current.speech = null;
    },
    [],
  );

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(interviewScore(setup, game.current), interviewPicks(game.current));
  };

  const speak = () => {
    const f = fx.current;
    f.speech?.();
    f.speech = null;
    const round = currentRound(setup, game.current);
    if (!round || !person.voice) return;
    f.speech = audio.speak(round.answer, person.voice, () => {
      f.speech = null;
    });
  };

  const refresh = (flash: Hud['flash'] = null) => {
    setHud((h) => snapshot(setup, game.current, fx.current.beat, flash ?? h.flash));
  };

  const react = (signals: Signal[]) => {
    if (signals.length === 0) return;
    for (const sig of signals) {
      switch (sig) {
        case 'asked':
          audio.play(INTERVIEW_SOUNDS.slide, { volume: 0.6 });
          haptic('selection');
          break;
        case 'answering':
          speak();
          break;
        case 'miss':
          audio.play(INTERVIEW_SOUNDS.tick, { volume: 0.35 });
          break;
        case 'verdict': {
          const last = game.current.results[game.current.results.length - 1];
          fx.current.speech?.();
          fx.current.speech = null;
          if (last?.correct) {
            audio.play(INTERVIEW_SOUNDS.pen, { volume: 0.9 });
            playSound(MINIGAME_SOUNDS.clunk, 0.35);
            haptic('success');
          } else {
            playSound(MINIGAME_SOUNDS.fail, 0.6);
            haptic('error');
          }
          break;
        }
        case 'round':
          fx.current.beat += 1;
          break;
        case 'done':
          finish();
          break;
        default:
          break;
      }
    }
    refresh();
  };

  const onMark = () => {
    if (!running) return;
    const result = mark(setup, game.current);
    const f = fx.current;
    if (result === 'hit') {
      audio.play(INTERVIEW_SOUNDS.pen, { volume: 0.7 });
      haptic('success');
      f.flashKey += 1;
      refresh({ kind: 'hit', key: f.flashKey });
    } else if (result === 'falseAlarm') {
      playSound(MINIGAME_SOUNDS.fail, 0.5);
      haptic('error');
      f.flashKey += 1;
      refresh({ kind: 'false', key: f.flashKey });
    }
  };

  useGameKeys(KEYS, () => onMark(), running);

  useFrameLoop((dt) => {
    const f = fx.current;
    const s = game.current;
    f.t += dt;
    react(advance(setup, s, dt));
    // Abtippen und Frist direkt ins DOM (kein Rendern pro Bild).
    const round = currentRound(setup, s);
    if (typed.current && round) {
      const n = typedChars(setup, s);
      if (n !== f.typed) {
        f.typed = n;
        typed.current.textContent = round.answer.slice(0, n);
      }
    }
    if (timerBar.current && round) {
      const share = s.phase === 'answer' ? 1 - s.t / round.duration : s.phase === 'ask' ? 1 : 0;
      timerBar.current.style.transform = `scaleX(${Math.max(0, share).toFixed(3)})`;
    }
    // Zeichen bzw. Geste, die gerade zu sehen ist (als Zustand, damit das Overlay neu aufbaut).
    const active = activeCue(setup, s);
    const kind = active?.cue.kind ?? null;
    if (kind !== f.cue) {
      f.cue = kind;
      setCue(active ? { kind: active.cue.kind, tell: active.cue.tell, key: active.index + s.round * 100 } : null);
    }
    if (f.t - f.lastHud > 0.2) {
      f.lastHud = f.t;
      refresh();
    }
    if (isDone(s)) finish();
  }, running);

  // Neue Antwort: Text von vorn (oder ganz, wenn die Phase schon weiter ist).
  useEffect(() => {
    fx.current.typed = -1;
    const round = currentRound(setup, game.current);
    if (typed.current) typed.current.textContent = round ? round.answer.slice(0, typedChars(setup, game.current)) : '';
  }, [hud.round, hud.phase]);

  const s = game.current;
  const round = currentRound(setup, s);
  const last = hud.phase === 'verdict' || hud.phase === 'end' ? hud.results[hud.results.length - 1] : undefined;
  const found = discovered(s);
  const mouth: MouthStyle =
    cue?.kind === 'grin'
      ? 'grin'
      : hud.phase === 'verdict' && last && !last.correct
        ? 'smirk'
        : hud.phase === 'answer' && round
          ? round.mood
          : 'neutral';
  const face = useMemo(() => ({ ...look, mouth }), [look, mouth]);
  const talking = hud.phase === 'answer' && !reduced;
  const unknown = Math.max(0, person.traits.length - person.known.length - found.length);
  const right = correctCount(s);
  const tellsThisRound = round?.cues.filter((c) => c.tell).length ?? 0;

  return (
    <div class={`iv${reduced ? ' is-reduced' : ''}`}>
      <div class="iv-room" aria-hidden="true">
        <div class="iv-room__wall" />
        <svg class="iv-room__window" viewBox="0 0 120 90" aria-hidden="true" focusable="false">
          <rect class="iv-room__pane" x="4" y="4" width="112" height="82" rx="2" />
          <path class="iv-room__bars" d="M30 4v82M60 4v82M90 4v82M4 45h112" />
        </svg>
        <svg class="iv-room__clock" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <circle class="iv-room__clock-face" cx="20" cy="20" r="17" />
          <path class="iv-room__clock-hand" d="M20 20V8M20 20l8 5" />
        </svg>
        <div class="iv-room__cone" />
        <svg class="iv-room__lamp" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
          <path class="iv-room__cord" d="M60 0v34" />
          <path class="iv-room__shade" d="M30 70 L44 36 H76 L90 70 Z" />
          <ellipse class="iv-room__bulb" cx="60" cy="70" rx="22" ry="5" />
        </svg>
      </div>

      <button
        ref={personBox}
        type="button"
        class={`iv-person${talking ? ' is-talking' : ''}${cue ? ` is-cue is-cue-${cue.kind}` : ''}${hud.flash ? ` is-flash-${hud.flash.kind}` : ''}`}
        data-flash={hud.flash?.key ?? 0}
        disabled={!running || hud.phase !== 'answer'}
        onPointerDown={(e) => {
          e.preventDefault();
          onMark();
        }}
        onClick={(e) => {
          if ((e as MouseEvent).detail === 0) onMark();
        }}
        aria-label="Zeichen! Die Person antippen, wenn sie ein Zeichen zeigt"
      >
        <Face look={face} />
        {cue && <TellMarks key={cue.key} kind={cue.kind} look={look} />}
      </button>

      <div class="iv-table" aria-hidden="true">
        <svg class="iv-table__ashtray" viewBox="0 0 60 24" aria-hidden="true" focusable="false">
          <ellipse class="iv-table__tray" cx="30" cy="14" rx="26" ry="9" />
          <ellipse class="iv-table__tray-in" cx="30" cy="12" rx="18" ry="5" />
          <rect class="iv-table__cig" x="30" y="8" width="20" height="3" rx="1.5" transform="rotate(-12 30 8)" />
        </svg>
        {!reduced && (
          <span class="iv-table__smoke">
            <span />
            <span />
          </span>
        )}
      </div>

      <HudBar class="iv-hud">
        <span
          class="iv-hud__round"
          role="img"
          aria-label={`Frage ${Math.min(hud.round + 1, setup.rounds.length)} von ${setup.rounds.length}`}
        >
          <Icon name="message" />
          {Math.min(hud.round + 1, setup.rounds.length)}/{setup.rounds.length}
        </span>
        <span class="iv-hud__score" role="img" aria-label={`${right} Runden richtig beurteilt`}>
          {setup.rounds.map((_, i) => {
            const r = hud.results[i];
            const state = r ? (r.correct ? 'is-right' : 'is-wrong') : i === hud.round ? 'is-now' : '';
            return (
              <span key={i} class={`iv-hud__dot ${state}`}>
                {r && <Icon name={r.correct ? 'check' : 'close'} />}
              </span>
            );
          })}
        </span>
        <span class="iv-hud__who">
          <strong>{person.name}</strong>
          <span>
            {person.roleName}
            {person.level > 1 ? ` · Level ${person.level}` : ''}
          </span>
        </span>
      </HudBar>

      <aside class="iv-file" aria-label="Akte">
        <p class="iv-file__head">
          <Icon name="clipboard" />
          Akte
        </p>
        <ul class="iv-file__list">
          {person.known.map((t) => (
            <li key={t} class={`iv-trait is-${toneOf(t)} is-known`}>
              <Icon name={TRAITS[t].icon} />
              {traitName(t, person.name)}
            </li>
          ))}
          {found.map((t) => (
            <li key={t} class={`iv-trait is-${toneOf(t)} is-new`}>
              <Icon name={TRAITS[t].icon} />
              {traitName(t, person.name)}
            </li>
          ))}
          {Array.from({ length: unknown }, (_, i) => (
            <li key={`u${i}`} class="iv-trait is-unknown">
              <Icon name="help" />?
            </li>
          ))}
        </ul>
      </aside>

      <section class="iv-talk" aria-live="polite">
        {round && (
          <>
            <p key={`q${hud.round}`} class="iv-bubble is-you">
              <span class="iv-bubble__who">Du</span>
              {round.text}
            </p>
            {hud.phase !== 'ask' && (
              <p key={`a${hud.round}`} class={`iv-bubble is-them${hud.phase === 'answer' ? ' is-typing' : ''}`}>
                <span class="iv-bubble__who">{person.name.split(' ')[0]}</span>
                <span ref={typed} class="iv-bubble__text" />
                {hud.phase === 'answer' && <span class="iv-bubble__caret" />}
              </p>
            )}
          </>
        )}
      </section>

      <section class={`iv-panel is-${hud.phase}`}>
        <span class="iv-timer" aria-hidden="true">
          <span ref={timerBar} />
        </span>
        {(hud.phase === 'ask' || hud.phase === 'answer') && (
          <>
            <p class="iv-prompt">
              {hud.phase === 'ask' ? 'Du fragst …' : 'Zuhören. Zeigt sie ein Zeichen, tipp sofort.'}
            </p>
            <div class="iv-watch">
              <span class="iv-watch__tally" role="img" aria-label={`${hud.hits} Zeichen erwischt`}>
                {Array.from({ length: Math.max(tellsThisRound, hud.hits) }, (_, i) => (
                  <span key={i} class={`iv-watch__dot${i < hud.hits ? ' is-hit' : ''}`} />
                ))}
                {hud.falseAlarms > 0 && (
                  <span class="iv-watch__false">
                    <Icon name="alert" />
                    {hud.falseAlarms}
                  </span>
                )}
              </span>
              <button type="button" class="iv-mark" disabled={!running || hud.phase !== 'answer'} onClick={onMark}>
                <Icon name="eye" />
                <span>Zeichen!</span>
                <kbd class="iv-key">Leertaste</kbd>
              </button>
              <span class="iv-watch__cue" aria-live="polite">
                {cue ? CUE_NAMES[cue.kind] : ' '}
              </span>
            </div>
          </>
        )}
        {(hud.phase === 'verdict' || hud.phase === 'end') && last && (
          <div class={`iv-verdict${last.correct ? ' is-right' : ' is-wrong'}`}>
            <p class="iv-prompt">
              {last.correct
                ? last.exposed
                  ? `Erkannt: ${traitName(last.exposed, person.name)}.`
                  : 'Richtig: nichts Auffälliges.'
                : last.falseAlarms > 1
                  ? 'Zu oft daneben getippt: Du hast nur Gesten gesehen.'
                  : last.tells > 0
                    ? `Verpasst: ${last.hits} von ${last.tells} Zeichen erwischt.`
                    : 'Daneben.'}
            </p>
            <p class="iv-verdict__detail">
              {last.reveals !== 'none' && !last.correct
                ? `Die Antwort verriet: ${traitName(last.reveals, person.name)}. Nicht in der Akte.`
                : last.reveals === 'none'
                  ? 'Die Antwort war ehrlich.'
                  : 'Kommt in die Akte.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
