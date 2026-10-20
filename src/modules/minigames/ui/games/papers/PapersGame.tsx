// Papiere fälschen (Auftrag 44, Teil 8): Schreibtisch des Zolls im Stil von „Papers, Please“. Links der Zöllner hinter
// der Scheibe (Face mit Dienstmütze), darunter Waage, Kalender und Kamera (was wirklich stimmt). Rechts drei Papiere;
// sein Finger wandert Zeile für Zeile. Felder antippen (bzw. Pfeile und Eingabe), richtigen Wert wählen, fehlende
// Stempel setzen, bevor der Finger ankommt. Jederzeit: Schein ins Papier (B), Ladung aufgeben (G). Am Handy liegen die
// Papiere als Stapel mit Reitern. Spiellogik in model.ts, Daten in data.ts, Tisch in draw.ts.
// Auftrag 48: Lupe (dasselbe Feld auf allen Papieren und der Vorlage wird markiert, der Wertewähler zeigt den Vergleich),
// Stempel mit Wumms (Holzstempel kommt herunter, Tisch ruckt), Kuli schreibt sichtbar, großer Stempel am Schluss.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatEuro, type MouthStyle, wallet } from '../../../../../core';
import { audio, haptic, Icon, prefersReducedMotion, useGame } from '../../../../../ui';
import { HudBar } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import { measureFrame } from '../traffic/perf';
import { type FieldKey, fieldLabel, type Setting } from './data';
import { deskVars, drawDesk } from './draw';
import {
  advance,
  bribe,
  bribeOpen,
  choose,
  createPapers,
  type FieldSlot,
  fingerOn,
  giveUp,
  initPapers,
  isDone,
  isEditable,
  MAX_HITS,
  NO_STAMP,
  openCount,
  type PapersState,
  papersPicks,
  papersScore,
  papersStats,
  readingPaper,
  type Signal,
} from './model';
import { CustomsOfficer, customsLook } from './Officer';
import { PAPERS_SOUNDS } from './sounds';

const KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'NumpadEnter',
  'Space',
  'Escape',
  'Backspace',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'KeyB',
  'KeyG',
];

/** Unter dieser Breite (CSS-Pixel) liegen die Papiere als Stapel mit Reitern. */
const NARROW = 820;

/** Ausdruck des Zöllners. */
function mouthOf(s: PapersState): MouthStyle {
  if (s.outcome === 'bribe') return 'smirk';
  if (s.outcome === 'fail' || s.hits >= 1) return 'hard';
  if (s.outcome === 'pass') return 'neutral';
  return s.phase === 'browse' ? 'neutral' : 'tired';
}

/** Ausfuhrstempel auf dem Papier (rund, rot, schräg). */
function Stamp(props: { country: string; big?: boolean }) {
  return (
    <span class={`pp-stamp${props.big ? ' is-big' : ''}`}>
      <span class="pp-stamp__ring">
        <span class="pp-stamp__top">Ausfuhr</span>
        <span class="pp-stamp__country">{props.country}</span>
      </span>
    </span>
  );
}

function FieldValue(props: { slot: FieldSlot; value: string }) {
  const { slot, value } = props;
  if (slot.key === 'stamp') {
    return value === NO_STAMP ? <span class="pp-field__missing">fehlt</span> : <Stamp country={value} />;
  }
  return <span class="pp-field__text">{value}</span>;
}

export function PapersGame(props: MinigameViewProps) {
  const { challenge, running, preview, onFinish } = props;
  const { state } = useGame();
  const params = challenge.params;
  const setting: Setting = params.setting === 'port' ? 'port' : 'autobahn';
  const night = params.phase === 'night' || params.phase === 'dusk';
  const time = Number.isFinite(Number(params.time)) ? Number(params.time) : challenge.startedAt;
  const bribeCost = Number(params.bribeCost) > 0 ? Math.round(Number(params.bribeCost)) : 0;
  const affordable = preview || wallet.balance(state, 'dirty') >= bribeCost;
  const setup = useMemo(
    () => createPapers(challenge.seed, challenge.difficulty, { setting, time }),
    [challenge.seed, challenge.difficulty, setting, time],
  );
  const game = useRef<PapersState>(initPapers(setup));
  const look = useMemo(() => customsLook(challenge.seed), [challenge.seed]);
  const vars = useMemo(deskVars, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const deskCanvas = useRef<HTMLCanvasElement>(null);
  const readBar = useRef<HTMLSpanElement>(null);
  /** Rest-Zeit einer Stichprobe (Balken am Papier, das er sich greift). */
  const peekBar = useRef<HTMLSpanElement>(null);
  const fx = useRef({
    sent: false,
    shake: 0,
    flash: '' as string,
    stampAt: '' as string,
    /** Zähler der Stempel (jeder startet die Animation neu) und der Rucke am Tisch. */
    stampN: 0,
    thump: 0,
    keyboard: false,
  });
  /** Feld unter der Maus (Lupe: dasselbe Feld auf den anderen Papieren leuchtet). */
  const [hoverKey, setHoverKey] = useState<FieldKey | null>(null);
  const [, setVersion] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState(0);
  const [picker, setPicker] = useState<string | null>(null);

  useStageCanvas(deskCanvas, (stage) => {
    const isNarrow = stage.width < NARROW;
    setNarrow(isNarrow);
    drawDesk(stage.ctx, stage.width, stage.height, { seed: challenge.seed, night, narrow: isNarrow });
  });

  const refresh = () => setVersion((v) => v + 1);

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(papersScore(setup, game.current), papersPicks(setup, game.current), papersStats(setup, game.current));
  };

  /** Ton, Vibration und Optik zu dem, was im Modell passiert ist. */
  const react = (signals: Signal[], slotId?: string) => {
    if (signals.length === 0) return;
    const f = fx.current;
    const s = game.current;
    for (const sig of signals) {
      switch (sig) {
        case 'read':
          audio.play(PAPERS_SOUNDS.tap, { volume: 0.5 });
          break;
        case 'hit': {
          audio.play(PAPERS_SOUNDS.knock, { volume: 0.9 });
          playSound(MINIGAME_SOUNDS.fail, 0.7);
          haptic('error');
          f.shake += 1;
          f.flash = setup.slots[s.cursor]?.id ?? '';
          break;
        }
        case 'nextPaper':
          audio.play(PAPERS_SOUNDS.rustle, { volume: 0.8 });
          break;
        case 'peek': {
          // Stichprobe: Er greift sich ein anderes Papier, das Papier springt sichtbar nach vorn. Am Handy kommt der
          // Reiter dieses Papiers nach vorn, damit man noch umschreiben kann.
          audio.play(PAPERS_SOUNDS.rustle, { volume: 1 });
          playSound(MINIGAME_SOUNDS.alarm, 0.25);
          haptic('warning');
          const paper = setup.slots[s.cursor]?.paper;
          if (paper !== undefined) setTab(paper);
          break;
        }
        case 'write':
          audio.play(PAPERS_SOUNDS.scribble, { volume: 0.8 });
          haptic('light');
          break;
        case 'stamp':
          // Der Stempel braucht 0,15 s nach unten: Ton und Ruck beim Aufschlag.
          audio.play(PAPERS_SOUNDS.stamp, { delay: 0.15 });
          window.setTimeout(() => haptic('medium'), 150);
          f.stampAt = slotId ?? '';
          f.stampN += 1;
          f.thump += 1;
          break;
        case 'bribeAccepted':
          audio.play(PAPERS_SOUNDS.slide);
          haptic('success');
          break;
        case 'bribeRejected':
          playSound(MINIGAME_SOUNDS.fail, 0.8);
          haptic('warning');
          f.shake += 1;
          break;
        case 'giveUp':
          audio.play(PAPERS_SOUNDS.rustle);
          break;
        case 'pass':
          audio.play(PAPERS_SOUNDS.slam, { delay: 0.12 });
          window.setTimeout(() => haptic('success'), 120);
          f.thump += 1;
          break;
        case 'fail':
          audio.play(PAPERS_SOUNDS.knock);
          audio.play(PAPERS_SOUNDS.slam, { delay: 0.35, volume: 0.8 });
          window.setTimeout(() => haptic('error'), 350);
          f.thump += 1;
          break;
        case 'done':
          finish();
          break;
      }
    }
    refresh();
  };

  const write = (slotId: string, value: string) => {
    if (!running) return;
    react(choose(setup, game.current, slotId, value), slotId);
    setPicker(null);
  };

  const openPicker = (index: number) => {
    const slot = setup.slots[index];
    if (!running || !slot || !isEditable(game.current, slot.id)) return;
    setSel(index);
    setTab(slot.paper);
    setPicker(slot.id);
    haptic('selection');
  };

  const doBribe = () => {
    if (!running || !affordable || bribeCost <= 0 || game.current.bribeUsed) return;
    setPicker(null);
    react(bribe(setup, game.current));
  };
  const doGiveUp = () => {
    if (!running) return;
    setPicker(null);
    react(giveUp(setup, game.current));
  };

  /** Tastatur: Zeile wählen (↑/↓), Papier wechseln (←/→), Eingabe öffnet die Werte, 1 bis 4 wählt. */
  const move = (code: string) => {
    fx.current.keyboard = true;
    const slots = setup.slots;
    const cur = slots[sel] ?? slots[0];
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const next = Math.min(slots.length - 1, Math.max(0, sel + (code === 'ArrowUp' ? -1 : 1)));
      setSel(next);
      setTab(slots[next].paper);
      return;
    }
    const paper = Math.min(setup.papers.length - 1, Math.max(0, cur.paper + (code === 'ArrowLeft' ? -1 : 1)));
    const rows = setup.papers[paper].slots;
    const target = rows[Math.min(cur.line, rows.length - 1)];
    setSel(slots.indexOf(target));
    setTab(paper);
  };

  useGameKeys(
    KEYS,
    (press) => {
      const code = press.code;
      if (code === 'KeyB') return doBribe();
      if (code === 'KeyG') return doGiveUp();
      if (picker) {
        if (code === 'Escape' || code === 'Backspace') setPicker(null);
        else if (/^(Digit|Numpad)[1-4]$/.test(code)) {
          const slot = setup.slots.find((x) => x.id === picker);
          const value = slot?.options[Number(code.slice(-1)) - 1];
          if (slot && value !== undefined) write(slot.id, value);
        }
        return;
      }
      if (code.startsWith('Arrow')) move(code);
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
        fx.current.keyboard = true;
        openPicker(sel);
      }
    },
    running,
  );

  // Entwicklung: window.koeln.dev.papers.setup/.state zeigen den Tisch, .fix(n) stellt n falsche Zeilen richtig
  // (Screenshots, Playwright).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const holder = window as unknown as { koeln?: { dev?: Record<string, unknown> } };
    if (!holder.koeln) return;
    holder.koeln.dev = {
      ...holder.koeln.dev,
      papers: {
        setup,
        state: game.current,
        fix: (n = Number.POSITIVE_INFINITY) => {
          let done = 0;
          for (const slot of setup.slots) {
            if (done >= n) break;
            if (!isEditable(game.current, slot.id) || game.current.values[slot.id] === slot.truth) continue;
            react(choose(setup, game.current, slot.id, slot.truth), slot.id);
            done += 1;
          }
          return done;
        },
      },
    };
    return () => {
      if (holder.koeln?.dev) delete holder.koeln.dev.papers;
    };
  }, [setup]);

  // Beginn: Er nimmt die Papiere.
  const started = useRef(false);
  useEffect(() => {
    if (!running || started.current) return;
    started.current = true;
    audio.play(PAPERS_SOUNDS.rustle, { volume: 0.8 });
  }, [running]);

  // Ist die Zeile im Wertewähler schon geprüft (er war schneller), geht der Wähler zu.
  const s = game.current;
  if (picker && !isEditable(s, picker)) queueMicrotask(() => setPicker(null));

  useFrameLoop((dt) => {
    measureFrame(() => {
      const st = game.current;
      react(advance(setup, st, dt));
      // Wie lange er noch auf dieser Zeile ist: Balken unter der Zeile, direkt ins DOM.
      if (readBar.current) {
        const share = fingerOn(st) && st.phaseLen > 0 ? Math.min(1, st.phaseT / st.phaseLen) : 0;
        readBar.current.style.transform = `scaleX(${share.toFixed(3)})`;
      }
      if (peekBar.current) {
        const left = st.resume !== null && st.phase === 'turn' ? 1 - st.phaseT / Math.max(0.01, st.phaseLen) : 0;
        peekBar.current.style.transform = `scaleX(${Math.max(0, left).toFixed(3)})`;
      }
      if (isDone(st)) finish();
    });
  }, running);

  const reading = readingPaper(setup, s);
  // Stichprobe: Er blättert gerade zu einem anderen Papier (dort zählt gleich die Zeile am Finger).
  const peekSlot = s.resume !== null && s.phase === 'turn' ? setup.slots[s.cursor] : undefined;
  const cursorSlot = setup.slots[s.cursor];
  const finger = fingerOn(s) && cursorSlot ? cursorSlot : null;
  const done = s.phase === 'end';
  const pickerSlot = picker ? setup.slots.find((x) => x.id === picker) : undefined;
  const open = bribeOpen(s);
  const f = fx.current;
  const declaration = setup.papers.length - 1;
  // Lupe: welches Feld gerade verglichen wird (Wertewähler, Tastatur-Auswahl oder Maus). Stempel und Herkunft gehören
  // zusammen (der Ausfuhrstempel muss zur Herkunft passen).
  const focusSlot = pickerSlot ?? (f.keyboard && running && !done ? setup.slots[sel] : undefined);
  const compareKey: FieldKey | null = done ? null : (focusSlot?.key ?? hoverKey);
  const compares = (key: FieldKey) =>
    compareKey !== null &&
    (key === compareKey ||
      (compareKey === 'stamp' && key === 'origin') ||
      (compareKey === 'origin' && key === 'stamp'));
  const refCompare = (key: FieldKey) => (compareKey === key ? ' is-compare' : '');
  // Vergleich im Wertewähler: dasselbe Feld auf den anderen Papieren (beim Stempel die Herkunft), dazu die Vorlage.
  const comparison: { id: string; label: string; value: string; ref?: boolean }[] = [];
  if (pickerSlot) {
    const key = pickerSlot.key === 'stamp' ? 'origin' : pickerSlot.key;
    for (const other of setup.slots) {
      if (other.id === pickerSlot.id || other.key !== key) continue;
      const title = setup.papers[other.paper].def.title;
      comparison.push({
        id: other.id,
        label: key === pickerSlot.key ? title : `${title}, ${fieldLabel(key, setup.setting)}`,
        value: s.values[other.id],
      });
    }
    const refs: Partial<Record<FieldKey, string>> = {
      weight: 'Waage',
      date: 'Kalender',
      plate: setting === 'port' ? 'Kamera am Kai' : 'Kamera',
    };
    const refLabel = refs[pickerSlot.key];
    if (refLabel) comparison.push({ id: 'ref', label: refLabel, value: setup.truth[pickerSlot.key], ref: true });
  }

  const sheet = (paper: number) => {
    const p = setup.papers[paper];
    const state =
      paper < reading || (done && s.outcome !== 'giveUp' && s.outcome !== 'bribe' && paper <= reading)
        ? 'is-checked'
        : paper === reading && s.phase !== 'browse'
          ? 'is-reading'
          : '';
    return (
      <article
        key={p.def.id}
        class={`pp-sheet pp-sheet--${paper} ${state}${peekSlot?.paper === paper ? ' is-peeked' : ''}${paper === reading && f.shake % 2 ? ' is-shake-a' : paper === reading && f.shake ? ' is-shake-b' : ''}`}
        aria-label={p.def.title}
      >
        {peekSlot?.paper === paper && (
          <p class="pp-sheet__peek" role="alert">
            <Icon name="eye" />
            {`Stichprobe: ${fieldLabel(peekSlot.key, setup.setting)}`}
            <span class="pp-sheet__peek-bar">
              <span ref={peekBar} />
            </span>
          </p>
        )}
        <header class="pp-sheet__head">
          <span class="pp-sheet__title">{p.def.title}</span>
          <span class="pp-sheet__sub">{p.def.sub}</span>
        </header>
        <ol class="pp-sheet__rows" style={finger?.paper === paper ? { '--line': finger.line } : undefined}>
          {p.slots.map((slot) => {
            const index = setup.slots.indexOf(slot);
            const seen = s.seen[slot.id];
            const value = s.values[slot.id];
            const edited = s.edited.includes(slot.id);
            const editable = isEditable(s, slot.id);
            const cls = [
              'pp-field',
              seen === 'ok' ? 'is-ok' : '',
              seen === 'hit' ? 'is-hit' : '',
              f.flash === slot.id ? 'is-flash' : '',
              edited ? 'is-edited' : '',
              finger?.id === slot.id ? 'is-reading' : '',
              f.keyboard && sel === index && running ? 'is-selected' : '',
              picker === slot.id ? 'is-picking' : '',
              f.stampAt === slot.id ? 'is-stamped' : '',
              peekSlot?.id === slot.id ? 'is-peek' : '',
              compares(slot.key) ? 'is-compare' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={slot.id}>
                <button
                  type="button"
                  class={cls}
                  disabled={!running || !editable}
                  aria-label={`${fieldLabel(slot.key, setup.setting)}: ${value === NO_STAMP ? 'Stempel fehlt' : value}${seen === 'hit' ? ', beanstandet' : seen === 'ok' ? ', geprüft' : ''}`}
                  onClick={() => {
                    fx.current.keyboard = false;
                    openPicker(index);
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setHoverKey(slot.key);
                  }}
                  onPointerLeave={() => setHoverKey((k) => (k === slot.key ? null : k))}
                >
                  <span class="pp-field__label">{fieldLabel(slot.key, setup.setting)}</span>
                  <span class="pp-field__value">
                    <FieldValue key={value} slot={slot} value={value} />
                  </span>
                  {seen && <Icon name={seen === 'ok' ? 'check' : 'xCircle'} class={`pp-field__mark is-${seen}`} />}
                  {seen === 'hit' && (
                    <svg class="pp-field__circle" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M58 4 C 86 3, 98 12, 96 22 C 94 33, 64 38, 42 37 C 14 36, 2 29, 4 19 C 6 9, 26 3, 50 4 L 62 6" />
                    </svg>
                  )}
                  {f.stampAt === slot.id && !reduced && (
                    <span key={f.stampN} class="pp-press" aria-hidden="true">
                      <span class="pp-press__knob" />
                      <span class="pp-press__block" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {finger?.paper === paper && (
            <li class="pp-reader" aria-hidden="true">
              <svg class="pp-reader__finger" viewBox="0 0 32 20" aria-hidden="true" focusable="false">
                <path d="M31 8.6 H15.2 Q12.4 4 9 4.2 L3.6 4.6 Q1 5 1 8.4 V12 Q1 16 5 16.4 L13 16.4 Q15 16.4 16 13.6 L18.2 13.6 Q20 13.6 20 12 L31 12 Q32.6 12 32.6 10.3 Q32.6 8.6 31 8.6 Z" />
              </svg>
              <span class="pp-reader__bar">
                <span ref={readBar} />
              </span>
            </li>
          )}
        </ol>
        {paper === reading && s.outcome === 'fail' && (
          <span class="pp-sheet__cleared is-fail" aria-hidden="true">
            Beanstandet
          </span>
        )}
        {paper === declaration && (s.outcome === 'pass' || s.outcome === 'bribe') && (
          <span class="pp-sheet__cleared" aria-hidden="true">
            Abgefertigt
          </span>
        )}
      </article>
    );
  };

  // Offen sind die Widersprüche, die er noch nicht gesehen hat (auch selbst eingebaute): Was du richtig behebst, zählt
  // herunter.
  const remaining = openCount(setup, s);
  const bubbleTone = s.outcome === 'fail' || (s.say?.key ?? '').startsWith('hit') || s.say?.key === 'bribeNo';

  return (
    <div
      class={`papers is-${setting}${narrow ? ' is-narrow' : ''}${night ? ' is-night' : ''}${done ? ' is-done' : ''}${reduced ? ' is-reduced' : ''}`}
      style={vars}
    >
      <canvas ref={deskCanvas} class="papers__desk" role="img" aria-label="Schreibtisch des Zolls" />

      <HudBar class="papers__hud">
        <span class="papers__count" role="img" aria-label={`${remaining} Widersprüche offen`}>
          <Icon name="clipboard" />
          {remaining}
          <small>{remaining === 1 ? 'Widerspruch offen' : 'Widersprüche offen'}</small>
        </span>
        <span class="papers__hits" role="img" aria-label={`Beanstandet: ${s.hits} von ${MAX_HITS}`}>
          <small>Beanstandet</small>
          {Array.from({ length: MAX_HITS }, (_, i) => (
            <span key={i} class={`papers__pip${i < s.hits ? ' is-on' : ''}`} />
          ))}
        </span>
      </HudBar>

      <section class="papers__booth" aria-live="polite">
        <div
          class={`papers__window${s.hits > 0 ? ' is-cross' : ''}${peekSlot ? ' is-peek' : ''}${s.outcome === 'bribe' ? ' is-bribed' : ''}`}
        >
          <CustomsOfficer look={look} mouth={mouthOf(s)} />
        </div>
        {s.say && (
          <p key={s.say.n} class={`papers__bubble${bubbleTone ? ' is-bad' : s.outcome === 'pass' ? ' is-good' : ''}`}>
            {s.say.text}
          </p>
        )}
      </section>

      <section class="papers__refs" aria-label="Was wirklich stimmt">
        <div class={`pp-ref${refCompare('weight')}`}>
          <span class="pp-ref__label">
            <Icon name="scale" />
            Waage
          </span>
          <span class="pp-ref__lcd">{setup.truth.weight}</span>
        </div>
        <div class={`pp-ref${refCompare('date')}`}>
          <span class="pp-ref__label">
            <Icon name="calendar" />
            Heute
          </span>
          <span class="pp-ref__value">{setup.truth.date}</span>
        </div>
        <div class={`pp-ref${refCompare('plate')}`}>
          <span class="pp-ref__label">
            <Icon name="camera" />
            {setting === 'port' ? 'Container' : 'Kennzeichen'}
          </span>
          <span class={`pp-ref__plate${setting === 'port' ? ' is-container' : ''}`}>{setup.truth.plate}</span>
        </div>
      </section>

      {narrow && (
        <nav class="papers__tabs" aria-label="Papiere">
          {setup.papers.map((p, i) => (
            <button
              key={p.def.id}
              type="button"
              class={`papers__tab${tab === i ? ' is-active' : ''}${i === reading && !done && s.phase !== 'browse' ? ' is-reading' : ''}`}
              aria-pressed={tab === i}
              onClick={() => setTab(i)}
            >
              {i === reading && !done && s.phase !== 'browse' && <Icon name="eye" />}
              {i < reading && <Icon name="check" />}
              <span>{p.def.title}</span>
            </button>
          ))}
        </nav>
      )}

      <section class={`papers__docs${f.thump ? (f.thump % 2 ? ' is-thump-a' : ' is-thump-b') : ''}`}>
        {narrow ? sheet(Math.min(tab, setup.papers.length - 1)) : setup.papers.map((_, i) => sheet(i))}
      </section>

      <div class="papers__light" aria-hidden="true" />

      <div class="papers__ways">
        {bribeCost > 0 && (
          <button
            type="button"
            class={`papers__way is-money${open ? ' is-open' : ''}`}
            disabled={!running || done || !affordable || s.bribeUsed}
            onClick={doBribe}
            title={affordable ? undefined : `Nicht genug Schwarzgeld (${formatEuro(bribeCost)}).`}
          >
            <Icon name="cash" />
            <span>Schein · {formatEuro(bribeCost)}</span>
            <kbd class="papers__key">B</kbd>
          </button>
        )}
        <button type="button" class="papers__way is-danger" disabled={!running || done} onClick={doGiveUp}>
          <Icon name="flag" />
          <span>Ladung aufgeben</span>
          <kbd class="papers__key">G</kbd>
        </button>
      </div>

      {pickerSlot && running && (
        <div class="papers__picker" role="dialog" aria-label="Wert wählen">
          <p class="papers__picker-head">
            <Icon name={pickerSlot.key === 'stamp' ? 'badge' : 'edit'} />
            {pickerSlot.key === 'stamp' ? 'Stempel setzen' : `${fieldLabel(pickerSlot.key, setup.setting)} umschreiben`}
            <small>{setup.papers[pickerSlot.paper].def.title}</small>
          </p>
          {comparison.length > 0 && (
            <dl class="papers__compare" aria-label="Vergleich">
              {comparison.map((c) => (
                <div key={c.id} class={`papers__compare-row${c.ref ? ' is-ref' : ''}`}>
                  <dt>{c.label}</dt>
                  <dd>{c.value === NO_STAMP ? 'fehlt' : c.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <ol class="papers__options">
            {pickerSlot.options.map((value, i) => (
              <li key={value}>
                <button
                  type="button"
                  class={`papers__option${s.values[pickerSlot.id] === value ? ' is-current' : ''}`}
                  onClick={() => write(pickerSlot.id, value)}
                >
                  <kbd class="papers__key">{i + 1}</kbd>
                  {pickerSlot.key === 'stamp' ? <Stamp country={value} /> : <span>{value}</span>}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" class="papers__cancel" onClick={() => setPicker(null)}>
            Lassen
            <kbd class="papers__key">Esc</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
