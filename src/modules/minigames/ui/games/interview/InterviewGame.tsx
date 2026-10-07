// Bewerbungsgespräch (Auftrag 44, Teil 9): Hinterzimmer, Lampe über dem Tisch, gegenüber die Person (Face groß,
// Ausdruck nach Antwort). Je Runde drei Fragekarten (1 bis 3 bzw. Tippen); die Antwort tippt sich in die Sprechblase
// und kommt mit der Stimme der Figur (audio.speak, wenn verfügbar). Danach drei Deutungen mit Frist (1 bis 3), was die
// Antwort verrät. Links die Akte: Was du schon weißt, und was du gerade erkannt hast. Spiellogik in model.ts.

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
  advance,
  CHOOSE_TIME,
  choose,
  correctCount,
  createInterview,
  currentOffer,
  discovered,
  type InterviewState,
  initInterview,
  interviewPicks,
  interviewScore,
  isDone,
  offersOf,
  type Phase,
  type Reading,
  read,
  type Signal,
  skipAnswer,
  timeLeft,
  typedChars,
} from './model';
import { INTERVIEW_SOUNDS } from './sounds';

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'Space', 'Enter'];

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

/** Name einer Deutung. */
function readingName(r: Reading, name: string): string {
  return r === 'none' ? 'Nichts davon' : traitName(r, name);
}

function readingIcon(r: Reading): string {
  return r === 'none' ? 'minus' : TRAITS[r].icon;
}

function toneOf(t: TraitId): 'good' | 'bad' | 'mixed' {
  return TRAITS[t].tone;
}

interface Hud {
  phase: Phase;
  round: number;
  chosen: number | null;
  results: InterviewState['results'];
  /** Zähler, damit Sprechblase und Karten bei jeder neuen Zeile neu aufploppen. */
  beat: number;
}

function snapshot(s: InterviewState, beat: number): Hud {
  return { phase: s.phase, round: s.round, chosen: s.chosen, results: [...s.results], beat };
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
  const fx = useRef({ t: 0, sent: false, beat: 0, lastTick: -1, speech: null as (() => void) | null, typed: -1 });
  const [hud, setHud] = useState<Hud>(() => snapshot(game.current, 0));

  // Stimme schon laden und alle möglichen Antworten vorrechnen (das Spiel steht still, solange es offen ist).
  useEffect(() => {
    if (!person.voice) return;
    audio.prepareVoice(person.voice);
    audio.prepareSpeech(
      setup.rounds.flat().map((o) => o.answer),
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
    const offer = currentOffer(setup, game.current);
    if (!offer || !person.voice) return;
    f.speech = audio.speak(offer.answer, person.voice, () => {
      f.speech = null;
    });
  };

  const react = (signals: Signal[]) => {
    if (signals.length === 0) return;
    for (const sig of signals) {
      switch (sig) {
        case 'asked':
          audio.play(INTERVIEW_SOUNDS.slide, { volume: 0.7 });
          haptic('selection');
          speak();
          break;
        case 'correct':
          audio.play(INTERVIEW_SOUNDS.pen, { volume: 0.9 });
          playSound(MINIGAME_SOUNDS.clunk, 0.4);
          haptic('success');
          break;
        case 'wrong':
          playSound(MINIGAME_SOUNDS.fail, 0.6);
          haptic('error');
          break;
        case 'timeout':
          playSound(MINIGAME_SOUNDS.fail, 0.5);
          haptic('warning');
          break;
        case 'round':
          fx.current.speech?.();
          fx.current.speech = null;
          break;
        case 'done':
          finish();
          break;
        default:
          break;
      }
    }
    fx.current.beat += 1;
    setHud(snapshot(game.current, fx.current.beat));
  };

  const pick = (index: number) => {
    if (!running) return;
    const s = game.current;
    if (s.phase === 'choose') react(choose(setup, s, index));
    else if (s.phase === 'read') react(read(setup, s, index));
    else if (s.phase === 'answer') react(skipAnswer(setup, s));
  };
  const skip = () => {
    if (!running) return;
    react(skipAnswer(setup, game.current));
  };

  useGameKeys(
    KEYS,
    (press) => {
      if (press.code === 'Space' || press.code === 'Enter') skip();
      else pick(Number(press.code.slice(-1)) - 1);
    },
    running,
  );

  useFrameLoop((dt) => {
    const f = fx.current;
    const s = game.current;
    f.t += dt;
    react(advance(setup, s, dt));
    // Abtippen und Frist direkt ins DOM (kein Rendern pro Bild).
    const offer = currentOffer(setup, s);
    if (typed.current && offer) {
      const n = typedChars(setup, s);
      if (n !== f.typed) {
        f.typed = n;
        typed.current.textContent = offer.answer.slice(0, n);
      }
    }
    if (timerBar.current) {
      const total = s.phase === 'choose' ? CHOOSE_TIME : setup.readTime;
      const left = timeLeft(setup, s);
      const share = s.phase === 'choose' || s.phase === 'read' ? left / total : 0;
      timerBar.current.style.transform = `scaleX(${share.toFixed(3)})`;
      const urgent = s.phase === 'read' && left < 3;
      timerBar.current.parentElement?.classList.toggle('is-urgent', urgent);
      // Die Uhr tickt in den letzten drei Sekunden des Deutens.
      const second = Math.ceil(left);
      if (urgent && second !== f.lastTick) {
        f.lastTick = second;
        audio.play(INTERVIEW_SOUNDS.tick, { volume: 0.7 });
      }
    }
    if (isDone(s)) finish();
  }, running);

  // Neue Antwort: Text von vorn (oder ganz, wenn die Phase schon weiter ist).
  useEffect(() => {
    fx.current.typed = -1;
    const offer = currentOffer(setup, game.current);
    if (typed.current) typed.current.textContent = offer ? offer.answer.slice(0, typedChars(setup, game.current)) : '';
  }, [hud.round, hud.chosen, hud.phase]);

  const s = game.current;
  const offer = currentOffer(setup, s);
  const offers = offersOf(setup, s);
  const last = hud.phase === 'verdict' || hud.phase === 'end' ? hud.results[hud.results.length - 1] : undefined;
  const found = discovered(s);
  const mouth: MouthStyle =
    hud.phase === 'verdict' && last && !last.correct
      ? 'smirk'
      : (hud.phase === 'answer' || hud.phase === 'read' || hud.phase === 'verdict') && offer
        ? offer.mood
        : 'neutral';
  const face = useMemo(() => ({ ...look, mouth }), [look, mouth]);
  const talking = hud.phase === 'answer' && !reduced;
  const unknown = Math.max(0, person.traits.length - person.known.length - found.length);
  const right = correctCount(s);

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

      <div class={`iv-person${talking ? ' is-talking' : ''}`} aria-hidden="true">
        <Face look={face} />
      </div>

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
        <span class="iv-hud__score" role="img" aria-label={`${right} richtig gedeutet`}>
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
        {offer && hud.phase !== 'choose' && (
          <>
            <p key={`q${hud.round}`} class="iv-bubble is-you">
              <span class="iv-bubble__who">Du</span>
              {offer.text}
            </p>
            <p key={`a${hud.round}`} class={`iv-bubble is-them${hud.phase === 'answer' ? ' is-typing' : ''}`}>
              <span class="iv-bubble__who">{person.name.split(' ')[0]}</span>
              <span ref={typed} class="iv-bubble__text" />
              {hud.phase === 'answer' && <span class="iv-bubble__caret" />}
            </p>
          </>
        )}
      </section>

      <section class={`iv-panel is-${hud.phase}`}>
        {(hud.phase === 'choose' || hud.phase === 'read') && (
          <span class="iv-timer" aria-hidden="true">
            <span ref={timerBar} />
          </span>
        )}
        {hud.phase === 'choose' && (
          <>
            <p class="iv-prompt">Was fragst du?</p>
            <ol key={`c${hud.beat}`} class="iv-cards">
              {offers.map((o, i) => (
                <li key={o.questionId}>
                  <button type="button" class="iv-card" disabled={!running} onClick={() => pick(i)}>
                    <span class="iv-card__topic">
                      <Icon name={o.icon} />
                      {o.topic}
                    </span>
                    <span class="iv-card__text">{o.text}</span>
                    <kbd class="iv-key">{i + 1}</kbd>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        {hud.phase === 'answer' && (
          <button type="button" class="iv-skip" disabled={!running} onClick={skip}>
            <span>Zuhören …</span>
            <kbd class="iv-key">Leertaste</kbd>
          </button>
        )}
        {(hud.phase === 'read' || hud.phase === 'verdict' || hud.phase === 'end') && offer && (
          <>
            <p class="iv-prompt">
              {hud.phase === 'read'
                ? 'Was verrät die Antwort?'
                : last?.correct
                  ? last.reveals === 'none'
                    ? 'Richtig: nichts Auffälliges.'
                    : `Erkannt: ${readingName(last.reveals, person.name)}.`
                  : last?.picked === null
                    ? 'Zu lange gezögert.'
                    : 'Daneben.'}
            </p>
            <ol class="iv-readings">
              {offer.readings.map((r, i) => {
                const verdict = hud.phase !== 'read';
                const isAnswer = r === offer.reveals;
                const isPicked = last?.picked === r;
                const cls = verdict ? (isAnswer ? ' is-right' : isPicked ? ' is-wrong' : ' is-off') : '';
                const tone = r === 'none' ? 'none' : toneOf(r);
                return (
                  <li key={r}>
                    <button
                      type="button"
                      class={`iv-reading is-${tone}${cls}`}
                      disabled={!running || verdict}
                      onClick={() => pick(i)}
                    >
                      <Icon name={readingIcon(r)} />
                      <span>{readingName(r, person.name)}</span>
                      <kbd class="iv-key">{i + 1}</kbd>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
