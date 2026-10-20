// Bewerbungsgespräch (Auftrag 48: eigene Fragen, Druck steuern). Hinterzimmer, Lampe über dem Tisch, gegenüber die
// Person (Face groß) in einem Ring, der den Druck zeigt. Jede Runde liegen drei Fragekarten auf dem Tisch (1 bis 3),
// jede sagt, was sie prüft. Die Antwort tippt sich in die Sprechblase und kommt mit der Stimme der Figur (audio.speak).
// Blick halten (gedrückt halten: Knopf, die Person, F oder ↑) erhöht den Druck: In der hellen Zone des Rings ist die
// Person angespannt und Zeichen stehen lange, darunter huschen sie nur vorbei, darüber macht sie zu. Zeichen
// rechtzeitig antippen (Leertaste, „Zeichen!“); Gesten sind Fehlalarme. Links die Akte. Spiellogik in model.ts, die
// Zeichen sitzen als Overlay über dem Porträt (Tells.tsx).

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
  bandAt,
  CHOOSE_TIME,
  CLOSED_LINES,
  CUE_NAMES,
  type CueKind,
  choose,
  correctCount,
  createInterview,
  currentRound,
  type InterviewState,
  initInterview,
  interviewPicks,
  interviewScore,
  isDone,
  mark,
  neededHits,
  newlyDiscovered,
  type Phase,
  press,
  questionById,
  ROUNDS,
  ruledOutBy,
  type Signal,
  typedChars,
  type Zone,
} from './model';
import { INTERVIEW_SOUNDS } from './sounds';
import { TellMarks } from './Tells';

const KEYS = ['Space', 'Enter', 'KeyF', 'ArrowUp', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];
const HOLD_KEYS = ['KeyF', 'ArrowUp'];
/** Der Ring läuft über drei Viertel des Kreises (Anteil am Umfang mit pathLength 100), Start unten links. */
const ARC = 75;

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

const ZONE_TEXT: Record<Zone, string> = { calm: 'Locker', tense: 'Angespannt', over: 'Macht zu!' };

interface Hud {
  phase: Phase;
  round: number;
  offer: string[];
  results: InterviewState['results'];
  zone: Zone;
  /** Zeichen dieser Runde: getroffen, Fehlalarme. */
  hits: number;
  falseAlarms: number;
  /** Letztes Tippen: Treffer oder Fehlalarm, mit Namen (für das Aufblitzen). */
  flash: { kind: 'hit' | 'false'; text: string; key: number } | null;
}

function snapshot(s: InterviewState, zone: Zone, flash: Hud['flash']): Hud {
  return {
    phase: s.phase,
    round: s.round,
    offer: s.offer,
    results: [...s.results],
    zone,
    hits: s.caught.length,
    falseAlarms: s.falseAlarms,
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
  const game = useRef<InterviewState | null>(null);
  game.current ??= initInterview(setup);
  const reduced = useMemo(prefersReducedMotion, []);
  const look = useMemo(() => personLook(person.name, person.age), [person]);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const timerBar = useRef<HTMLSpanElement>(null);
  const ring = useRef({
    band: null as SVGCircleElement | null,
    fill: null as SVGCircleElement | null,
    knob: null as SVGGElement | null,
  });
  const fx = useRef({
    t: 0,
    sent: false,
    flashKey: 0,
    speech: null as (() => void) | null,
    typed: -1,
    lastHud: -1,
    cue: -1,
    held: false,
    heartAt: 0,
    zone: 'calm' as Zone,
    pressure: -1,
    /** In der Pause angehaltene Stimme: geht es weiter, spricht sie den Rest. */
    resume: false,
  });
  const keys = useGameKeys(
    KEYS,
    (p) => {
      if (p.code === 'Space' || p.code === 'Enter') onMark();
      else if (p.code.startsWith('Digit') || p.code.startsWith('Numpad')) onChoose(Number(p.code.slice(-1)) - 1);
    },
    running,
  );
  const [hud, setHud] = useState<Hud>(() => snapshot(game.current as InterviewState, 'calm', null));
  const [cue, setCue] = useState<{ kind: CueKind; faint: boolean; key: number } | null>(null);
  const [closedLine, setClosedLine] = useState<string | null>(null);

  const state = () => game.current as InterviewState;

  // Stimme schon laden und alle möglichen Antworten vorrechnen (das Spiel steht still, solange es offen ist).
  useEffect(() => {
    if (!person.voice) return;
    audio.prepareVoice(person.voice);
  }, [person]);

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
    onFinish(interviewScore(setup, state()), interviewPicks(state()));
  };

  const stopSpeech = () => {
    fx.current.speech?.();
    fx.current.speech = null;
  };

  const speak = (text: string) => {
    const f = fx.current;
    stopSpeech();
    if (!person.voice) return;
    f.speech = audio.speak(text, person.voice, () => {
      f.speech = null;
    });
  };

  const refresh = (flash: Hud['flash'] | undefined = undefined) => {
    setHud((h) => snapshot(state(), fx.current.zone, flash === undefined ? h.flash : flash));
  };

  const react = (signals: Signal[]) => {
    if (signals.length === 0) return;
    const s = state();
    for (const sig of signals) {
      switch (sig) {
        case 'offer':
          audio.play(INTERVIEW_SOUNDS.slide, { volume: 0.5 });
          setClosedLine(null);
          break;
        case 'asked': {
          audio.play(INTERVIEW_SOUNDS.slide, { volume: 0.6 });
          haptic('selection');
          // Die Antwort schon vorrechnen, solange du fragst.
          const round = currentRound(setup, s);
          if (round && person.voice) audio.prepareSpeech([round.answer], person.voice);
          break;
        }
        case 'answering': {
          const round = currentRound(setup, s);
          if (round) speak(round.answer);
          break;
        }
        case 'tense':
          haptic('light');
          break;
        case 'warn':
          haptic('warning');
          break;
        case 'closed': {
          const line = CLOSED_LINES[s.round % CLOSED_LINES.length];
          setClosedLine(line);
          audio.play(INTERVIEW_SOUNDS.chair, { volume: 0.8 });
          haptic('error');
          speak(line);
          break;
        }
        case 'miss':
          audio.play(INTERVIEW_SOUNDS.tick, { volume: 0.35 });
          break;
        case 'verdict': {
          const last = s.results[s.results.length - 1];
          if (!last?.closed) stopSpeech();
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
    const result = mark(setup, state());
    if (!result) return;
    const f = fx.current;
    if (result.result === 'hit') {
      audio.play(INTERVIEW_SOUNDS.pen, { volume: 0.7 });
      haptic('success');
      f.flashKey += 1;
      refresh({ kind: 'hit', text: result.kind ? CUE_NAMES[result.kind] : 'Zeichen', key: f.flashKey });
    } else if (result.result === 'falseAlarm') {
      playSound(MINIGAME_SOUNDS.fail, 0.5);
      haptic('error');
      f.flashKey += 1;
      refresh({
        kind: 'false',
        text: result.kind ? `${CUE_NAMES[result.kind]}: harmlos` : 'Nichts zu sehen',
        key: f.flashKey,
      });
    }
  };

  const onChoose = (index: number) => {
    if (!running) return;
    // Ton und Vorrechnen der Antwort kommen mit dem Signal 'asked' im nächsten Schritt.
    if (choose(setup, state(), index)) refresh();
  };

  const hold = (on: boolean) => {
    fx.current.held = on;
  };

  /** Ring und Druck direkt ins DOM (kein Rendern pro Bild). */
  const drawRing = (s: InterviewState) => {
    const { band, fill, knob } = ring.current;
    const p = s.pressure;
    const { lo, hi } = bandAt(setup, s);
    if (band) {
      const a = Math.max(0, lo) * ARC;
      const b = Math.min(1, hi) * ARC;
      band.setAttribute('stroke-dasharray', `${(b - a).toFixed(2)} ${(100 - (b - a)).toFixed(2)}`);
      band.setAttribute('stroke-dashoffset', (-a).toFixed(2));
    }
    if (fill) fill.setAttribute('stroke-dasharray', `${(p * ARC).toFixed(2)} 100`);
    if (knob) knob.setAttribute('transform', `rotate(${(p * 270).toFixed(1)} 50 50)`);
    if (root.current && Math.abs(p - fx.current.pressure) > 0.004) {
      fx.current.pressure = p;
      root.current.style.setProperty('--iv-p', p.toFixed(3));
    }
  };

  useFrameLoop((dt) => {
    const f = fx.current;
    const s = state();
    f.t += dt;
    press(s, f.held || HOLD_KEYS.some((k) => keys.isDown(k)));
    react(advance(setup, s, dt));
    drawRing(s);
    // Herzschlag, solange sie angespannt ist und du den Blick hältst; schneller mit mehr Druck.
    const zone = s.zone;
    if (zone !== f.zone) {
      f.zone = zone;
      refresh();
    }
    if (s.phase === 'answer' && zone !== 'calm' && f.t >= f.heartAt) {
      audio.play(INTERVIEW_SOUNDS.heart, { volume: 0.25 + s.pressure * 0.5 });
      f.heartAt = f.t + 1.15 - s.pressure * 0.6;
    }
    // Abtippen und Frist direkt ins DOM.
    const round = currentRound(setup, s);
    if (typed.current && round) {
      const n = typedChars(setup, s);
      if (n !== f.typed) {
        f.typed = n;
        typed.current.textContent = round.answer.slice(0, n);
      }
    }
    if (timerBar.current) {
      const share =
        s.phase === 'choose'
          ? 1 - s.t / CHOOSE_TIME
          : s.phase === 'answer' && round
            ? 1 - s.t / round.duration
            : s.phase === 'ask'
              ? 1
              : 0;
      timerBar.current.style.transform = `scaleX(${Math.max(0, share).toFixed(3)})`;
    }
    // Zeichen bzw. Geste, die gerade zu sehen ist (als Zustand, damit das Overlay neu aufbaut).
    const active = activeCue(setup, s);
    const key = active ? active.index + s.round * 100 : -1;
    if (key !== f.cue) {
      f.cue = key;
      setCue(active ? { kind: active.cue.kind, faint: active.faint, key } : null);
    }
    if (f.t - f.lastHud > 0.25) {
      f.lastHud = f.t;
      refresh();
    }
    if (isDone(s)) finish();
  }, running);

  // Pause (Tab im Hintergrund, Karte „Kurz angehalten“): loslassen, Stimme anhalten. Geht es weiter, spricht die
  // Person den Rest der Antwort ab dem Wort, bei dem der Text steht (nichts doppelt, nichts neu gestartet).
  useEffect(() => {
    const f = fx.current;
    if (!running) {
      f.held = false;
      if (f.speech) {
        stopSpeech();
        f.resume = true;
      }
      return;
    }
    if (!f.resume) return;
    f.resume = false;
    const s = state();
    const round = currentRound(setup, s);
    if (s.phase !== 'answer' || !round) return;
    const from = typedChars(setup, s);
    const cut = round.answer.lastIndexOf(' ', from);
    const rest = round.answer.slice(cut < 0 ? 0 : cut + 1).trim();
    if (rest) speak(rest);
  }, [running]);

  // Neue Antwort: Text von vorn (oder ganz, wenn die Phase schon weiter ist).
  useEffect(() => {
    fx.current.typed = -1;
    const round = currentRound(setup, state());
    if (typed.current) typed.current.textContent = round ? round.answer.slice(0, typedChars(setup, state())) : '';
  }, [hud.round, hud.phase]);

  const s = state();
  const round = currentRound(setup, s);
  const last = hud.phase === 'verdict' || hud.phase === 'end' ? hud.results[hud.results.length - 1] : undefined;
  // Nur Neues kommt in die Akte; was die Antwort an Bekanntem verrät, steht dort schon.
  const found = newlyDiscovered(s, person.known);
  const lastKnown = !!last && last.reveals !== 'none' && person.known.includes(last.reveals);
  const listening = hud.phase === 'ask' || hud.phase === 'answer';
  const mouth: MouthStyle =
    cue?.kind === 'grin'
      ? 'grin'
      : hud.phase === 'verdict' && last?.closed
        ? 'hard'
        : hud.phase === 'verdict' && last && !last.correct
          ? 'smirk'
          : listening && hud.zone === 'over'
            ? 'hard'
            : hud.phase === 'answer' && round && hud.zone === 'tense'
              ? round.mood === 'neutral'
                ? 'tired'
                : round.mood
              : 'neutral';
  const face = useMemo(() => ({ ...look, mouth }), [look, mouth]);
  const talking = hud.phase === 'answer' && !reduced;
  const unknown = Math.max(0, person.traits.length - person.known.length - found.length);
  const right = correctCount(s);
  const tellsThisRound = round?.cues.filter((c) => c.tell).length ?? 0;
  const need = neededHits(setup, tellsThisRound);
  const firstName = person.name.split(' ')[0];
  const excluded = last && hud.phase === 'verdict' ? ruledOutBy(setup, s, hud.results.length - 1) : [];

  return (
    <div
      ref={root}
      class={`iv is-${hud.phase} is-zone-${listening ? hud.zone : 'idle'}${reduced ? ' is-reduced' : ''}`}
      style={{ '--iv-p': s.pressure }}
    >
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

      <div class="iv-seat">
        <svg class="iv-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <g transform="rotate(135 50 50)">
            <circle class="iv-ring__track" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray={`${ARC} 100`} />
            <circle
              ref={(el) => {
                ring.current.band = el;
              }}
              class="iv-ring__band"
              cx="50"
              cy="50"
              r="46"
              pathLength="100"
            />
            <circle
              ref={(el) => {
                ring.current.fill = el;
              }}
              class="iv-ring__fill"
              cx="50"
              cy="50"
              r="46"
              pathLength="100"
            />
          </g>
          <g
            ref={(el) => {
              ring.current.knob = el;
            }}
          >
            {/* Start unten links (135°): Knopf sitzt dort und dreht mit dem Druck. */}
            <circle class="iv-ring__knob" cx={50 - 46 * Math.SQRT1_2} cy={50 + 46 * Math.SQRT1_2} r="3.4" />
          </g>
        </svg>
        <button
          type="button"
          class={`iv-person${talking ? ' is-talking' : ''}${cue ? ` is-cue is-cue-${cue.kind}${cue.faint ? ' is-faint' : ''}` : ''}${hud.flash ? ` is-flash-${hud.flash.kind}` : ''}`}
          data-flash={hud.flash?.key ?? 0}
          disabled={!running || !listening}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            hold(true);
          }}
          onPointerUp={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onLostPointerCapture={() => hold(false)}
          aria-label="Blick halten: gedrückt halten erhöht den Druck"
        >
          <Face look={face} />
          {cue && <TellMarks key={cue.key} kind={cue.kind} look={look} />}
        </button>
        {listening && (
          <span class="iv-zone" aria-live="polite">
            {ZONE_TEXT[hud.zone]}
          </span>
        )}
        {hud.flash && (
          <span key={hud.flash.key} class={`iv-pop is-${hud.flash.kind}`} aria-live="polite">
            <Icon name={hud.flash.kind === 'hit' ? 'check' : 'close'} />
            {hud.flash.text}
          </span>
        )}
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
      <div class="iv-vignette" aria-hidden="true" />

      <HudBar class="iv-hud">
        <span class="iv-hud__round" role="img" aria-label={`Frage ${Math.min(hud.round + 1, ROUNDS)} von ${ROUNDS}`}>
          <Icon name="message" />
          {Math.min(hud.round + 1, ROUNDS)}/{ROUNDS}
        </span>
        <span class="iv-hud__score" role="img" aria-label={`${right} Runden richtig beurteilt`}>
          {Array.from({ length: ROUNDS }, (_, i) => {
            const r = hud.results[i];
            const st = r ? (r.correct ? 'is-right' : 'is-wrong') : i === hud.round ? 'is-now' : '';
            return (
              <span key={i} class={`iv-hud__dot ${st}`}>
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

      {hud.phase !== 'choose' && (
        <section class="iv-talk" aria-live="polite">
          {round && (
            <>
              <p key={`q${hud.round}`} class="iv-bubble is-you">
                <span class="iv-bubble__who">Du</span>
                {round.text}
              </p>
              {hud.phase !== 'ask' && (
                <p
                  key={`a${hud.round}`}
                  class={`iv-bubble is-them${hud.phase === 'answer' ? ' is-typing' : ''}${closedLine ? ' is-closed' : ''}`}
                >
                  <span class="iv-bubble__who">{firstName}</span>
                  {closedLine ? (
                    <span class="iv-bubble__text">{closedLine}</span>
                  ) : (
                    <span ref={typed} class="iv-bubble__text" />
                  )}
                  {hud.phase === 'answer' && <span class="iv-bubble__caret" />}
                </p>
              )}
            </>
          )}
        </section>
      )}

      <section class={`iv-panel is-${hud.phase}`}>
        <span class="iv-timer" aria-hidden="true">
          <span ref={timerBar} />
        </span>
        {hud.phase === 'choose' && (
          <>
            <p class="iv-prompt">Was fragst du {firstName}?</p>
            <div class="iv-cards">
              {hud.offer.map((id, i) => {
                const q = questionById(id);
                if (!q) return null;
                return (
                  <button
                    key={`${hud.round}-${id}`}
                    type="button"
                    class="iv-card"
                    style={{ '--iv-i': i }}
                    disabled={!running}
                    onClick={() => onChoose(i)}
                  >
                    <span class="iv-card__head">
                      <Icon name={q.icon} />
                      <span class="iv-card__topic">{q.topic}</span>
                      <kbd class="iv-key">{i + 1}</kbd>
                    </span>
                    <span class="iv-card__text">{q.text}</span>
                    <span class="iv-card__probes">
                      {q.probes.map((t) => (
                        <span key={t} class={`iv-probe is-${toneOf(t)}`}>
                          <Icon name={TRAITS[t].icon} />
                          {traitName(t, person.name)}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {listening && (
          <div class="iv-watch">
            <button
              type="button"
              class="iv-hold"
              disabled={!running}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                hold(true);
              }}
              onPointerUp={() => hold(false)}
              onPointerCancel={() => hold(false)}
              onLostPointerCapture={() => hold(false)}
              aria-label="Blick halten (gedrückt halten): Druck erhöhen"
            >
              <Icon name="eye" />
              <span>Blick halten</span>
              <kbd class="iv-key">F</kbd>
            </button>
            <span class="iv-watch__tally" role="img" aria-label={`${hud.hits} Zeichen erwischt, ${need} nötig`}>
              {Array.from({ length: Math.max(tellsThisRound, hud.hits) }, (_, i) => (
                <span key={i} class={`iv-watch__dot${i < hud.hits ? ' is-hit' : ''}${i < need ? ' is-need' : ''}`} />
              ))}
              {hud.falseAlarms > 0 && (
                <span class="iv-watch__false">
                  <Icon name="alert" />
                  {hud.falseAlarms}
                </span>
              )}
            </span>
            <button type="button" class="iv-mark" disabled={!running || hud.phase !== 'answer'} onClick={onMark}>
              <Icon name="search" />
              <span>Zeichen!</span>
              <kbd class="iv-key">Leertaste</kbd>
            </button>
          </div>
        )}
        {(hud.phase === 'verdict' || hud.phase === 'end') && last && (
          <div class={`iv-verdict${last.correct ? ' is-right' : ' is-wrong'}`}>
            <p class="iv-prompt">
              {last.correct
                ? last.exposed
                  ? `${lastKnown ? 'Bestätigt' : 'Erkannt'}: ${traitName(last.exposed, person.name)}.`
                  : 'Richtig: Die Antwort war ehrlich.'
                : last.closed
                  ? `Zu viel Druck: ${firstName} hat dichtgemacht.`
                  : last.falseAlarms > 1
                    ? 'Zu oft daneben getippt: Das waren nur Gesten.'
                    : last.tells > 0
                      ? `Verpasst: ${last.hits} von ${last.tells} Zeichen erwischt.`
                      : 'Daneben.'}
            </p>
            <p class="iv-verdict__detail">
              {last.reveals !== 'none' && !last.correct
                ? `Die Antwort verriet: ${traitName(last.reveals, person.name)}. ${lastKnown ? 'Steht schon in der Akte.' : 'Nicht in der Akte.'}`
                : last.reveals === 'none'
                  ? excluded.length > 0
                    ? `Nichts davon: ${excluded.map((t) => traitName(t, person.name)).join(', ')}.`
                    : 'Nichts Neues.'
                  : lastKnown
                    ? 'Steht schon in der Akte.'
                    : 'Kommt in die Akte.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
