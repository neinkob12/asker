// Zivi oder Kunde (Auftrag 44, Teil 5): Am Spot kommen Leute nacheinander, jeder als Karte mit Gesicht, einem Satz und
// dem, was du siehst. Wischen nach rechts (→, D) verkauft, nach links (←, A) wimmelt ab. Karten fliegen mit Schwung,
// der Stapel hat Tiefe. Wer zu lange zögert, lässt den Kunden gehen. Spiellogik in model.ts, Merkmale in tells.ts.

import { memo } from 'preact/compat';
import { useMemo, useRef, useState } from 'preact/hooks';
import { formatAmount } from '../../../../../core';
import { audio, Face, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { HudBar, HudTimer } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { capture } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import { LowerBody, PortraitMarks } from './figure';
import {
  canDecide,
  createShift,
  type Decision,
  decide,
  initShift,
  inputFrom,
  type Person,
  type ShiftEvent,
  type ShiftOutcome,
  shiftOutcome,
  shiftPicks,
  shiftScore,
  step,
  type Verdict,
} from './model';
import { UNDERCOVER_SOUNDS } from './sounds';
import { tellDef } from './tells';

const KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
/** Ab so vielen Pixeln Ziehen zählt es beim Loslassen als Entscheidung. */
const SWIPE_PX = 90;
/** Oder so schnell (Pixel pro Millisekunde) geschnippt. */
const FLICK = 0.55;
/** So lange fliegt eine Karte, bevor sie weg ist (Sekunden). */
const FLY_TIME = 0.7;
/** Nach der letzten Karte so lange bis zum Ergebnis (die Karte fliegt noch, Zeitlupe). */
const END_DELAY = 1.1;

/** Symbol je Merkmal (nur Optik, die Bedeutung steht im Text). */
const TELL_ICONS: Record<string, string> = {
  earpiece: 'volume',
  wire: 'signal',
  bulge: 'shield',
  asksSupplier: 'message',
  newShoes: 'sparkles',
  bigOrder: 'scale',
  tooPolite: 'smile',
  watchesCar: 'car',
  noSlang: 'newspaper',
  headphones: 'music',
  hood: 'eyeOff',
  beer: 'beer',
  dog: 'heart',
  scooter: 'bike',
  gymBag: 'bag',
  phone: 'phone',
  nervous: 'runner',
  regular: 'userCheck',
  coins: 'coins',
  shaky: 'drop',
  local: 'home',
  worn: 'clock',
};

const VERDICTS: Record<Verdict, { text: string; tone: 'good' | 'bad' | 'warn' }> = {
  sold: { text: 'Verkauft.', tone: 'good' },
  spotted: { text: 'Zivi erkannt! Er geht rüber zum Auto.', tone: 'good' },
  soldZivi: { text: 'Das war ein Zivi! Er funkt die Kollegen an.', tone: 'bad' },
  turnedAway: { text: 'Das war ein echter Kunde. Der kommt nicht wieder.', tone: 'warn' },
  missed: { text: 'Zu lange gezögert. Der Zivi zieht ab, durchschaut hast du ihn nicht.', tone: 'warn' },
};

interface Flyer {
  index: number;
  verdict: Verdict;
  zivi: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
}

interface Toast {
  text: string;
  tone: 'good' | 'bad' | 'warn';
  key: number;
}

/** Eine Karte: Gesicht mit Merkmalen, Satz, was du siehst, unten Gürtel und Schuhe. */
const PersonCard = memo(function PersonCard(props: { person: Person; total: number }) {
  const { person, total } = props;
  const amount = formatAmount(person.amount, person.unit);
  return (
    <>
      <header class="uc-card__head">
        <span class="uc-card__count">
          Kunde {person.index + 1} von {total}
        </span>
        <span class="uc-card__ask">
          <Icon name="package" />
          {amount}
        </span>
      </header>
      <div class="uc-card__portrait">
        <Face look={person.look} />
        <PortraitMarks person={person} />
      </div>
      <p class="uc-card__line">„{person.line}“</p>
      <ul class="uc-card__tells" aria-label="Was du siehst">
        {person.tells.map((id) => {
          const def = tellDef(id);
          if (!def) return null;
          return (
            <li key={id} class="uc-chip">
              <Icon name={TELL_ICONS[id] ?? 'eye'} />
              <span>{def.text}</span>
            </li>
          );
        })}
      </ul>
      <div class="uc-card__below">
        <LowerBody person={person} />
      </div>
    </>
  );
});

/** Straße hinter dem Stapel: Häuser, Laterne, das Auto gegenüber, der Spot. Tag oder Nacht nach der Stunde. */
const Scene = memo(function Scene(props: { night: boolean; spot: string; watched: boolean; flash: number }) {
  return (
    <div class={`uc-scene${props.night ? ' is-night' : ''}`} aria-hidden="true">
      <svg
        class="uc-scene__street"
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        focusable="false"
      >
        <rect class="uc-scene__sky" x="0" y="0" width="400" height="240" />
        <g class="uc-scene__houses">
          <rect x="-10" y="40" width="96" height="160" />
          <rect x="86" y="70" width="70" height="130" />
          <rect x="156" y="30" width="88" height="170" />
          <rect x="244" y="60" width="76" height="140" />
          <rect x="320" y="44" width="96" height="156" />
        </g>
        <g class="uc-scene__windows">
          {[
            [10, 60],
            [44, 60],
            [10, 100],
            [44, 140],
            [100, 90],
            [126, 130],
            [172, 50],
            [206, 50],
            [172, 96],
            [206, 140],
            [258, 80],
            [290, 120],
            [336, 64],
            [372, 104],
            [336, 144],
          ].map(([x, y], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width="18"
              height="22"
              class={i % 3 === 1 ? 'uc-scene__window-dark' : undefined}
            />
          ))}
        </g>
        <rect class="uc-scene__walk" x="0" y="200" width="400" height="40" />
        <rect class="uc-scene__curb" x="0" y="198" width="400" height="4" />
        <g class={`uc-scene__car${props.watched ? ' is-watched' : ''}`}>
          <path
            class="uc-scene__body"
            d="M18 196 L24 178 Q28 170 40 169 L86 169 Q96 170 102 178 L112 186 L120 188 Q124 190 124 196 Z"
          />
          <path class="uc-scene__glass" d="M32 181 L38 173 L62 173 L62 181 Z M66 173 L86 173 L94 181 L66 181 Z" />
          <circle class="uc-scene__wheel" cx="40" cy="197" r="8" />
          <circle class="uc-scene__wheel" cx="102" cy="197" r="8" />
          <circle class="uc-scene__head" cx="54" cy="177" r="3.4" />
          <circle class="uc-scene__head" cx="78" cy="177" r="3.4" />
          <rect key={props.flash} class="uc-scene__lights" x="116" y="184" width="8" height="5" rx="2" />
        </g>
        <g class="uc-scene__lamp">
          <rect x="330" y="96" width="4" height="104" />
          <path d="M318 96 L346 96 L340 90 L324 90 Z" />
          <path class="uc-scene__cone" d="M322 98 L342 98 L392 200 L272 200 Z" />
        </g>
      </svg>
      <span class="uc-scene__sign">
        <Icon name="pin" />
        {props.spot}
      </span>
    </div>
  );
});

export function UndercoverGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const input = useMemo(() => inputFrom(challenge.params), [challenge.params]);
  const shift = useMemo(
    () => createShift(challenge.seed, challenge.difficulty, input),
    [challenge.seed, challenge.difficulty, input],
  );
  const game = useRef(initShift(shift));
  const reduced = useMemo(prefersReducedMotion, []);
  const hour = Number(challenge.params.hour);
  const night = Number.isFinite(hour) ? hour >= 20 || hour < 6 : true;
  const spotName = String(challenge.params.spot ?? 'Am Spot');
  const total = shift.people.length;

  const [index, setIndex] = useState(0);
  const [live, setLive] = useState(true);
  const [left, setLeft] = useState(shift.perCard);
  const [tally, setTally] = useState<ShiftOutcome>(() => shiftOutcome(shift, game.current));
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flash, setFlash] = useState(0);
  const [bust, setBust] = useState(0);

  const stage = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const flyEls = useRef(new Map<number, HTMLDivElement>());
  const fly = useRef<Flyer[]>([]);
  const drag = useRef<{ id: number; sx: number; sy: number; x: number; y: number; lt: number; lx: number; vx: number }>(
    null,
  );
  const motion = useRef({ x: 0, y: 0, shake: 0, lastHud: -1, endAt: -1, sent: false, lastTick: -1, slow: 1 });

  /** Karte wegfliegen lassen (dir 1 rechts, -1 links, 0 nach unten: gegangen). */
  const launch = (event: Extract<ShiftEvent, { type: 'decided' }>, dir: number, speed: number) => {
    const m = motion.current;
    const f: Flyer = {
      index: event.index,
      verdict: event.verdict,
      zivi: event.zivi,
      x: dir === 0 ? 0 : m.x,
      y: dir === 0 ? 0 : m.y,
      vx: dir === 0 ? 0 : dir * Math.max(1500, Math.abs(speed)),
      vy: dir === 0 ? 900 : -120 + (reduced ? 0 : (Math.random() - 0.5) * 160),
      rot: m.x * 0.06,
      vr: dir === 0 ? 0 : dir * (reduced ? 60 : 260),
      age: 0,
    };
    m.x = 0;
    m.y = 0;
    fly.current = [...fly.current, f];
    setFlyers(fly.current);
  };

  /** Rückmeldung zu einer Entscheidung: Text, Ton, Vibration, Wackeln. */
  const feedback = (event: Extract<ShiftEvent, { type: 'decided' }>) => {
    const person = shift.people[event.index];
    const v = VERDICTS[event.verdict];
    let text = v.text;
    if (event.verdict === 'sold' && person) text = `Verkauft: ${formatAmount(person.amount, person.unit)}.`;
    if (event.decision === 'timeout' && !event.zivi) text = 'Zu lange gezögert. Der Kunde geht woanders hin.';
    setToast((t) => ({ text, tone: v.tone, key: (t?.key ?? 0) + 1 }));
    setTally(shiftOutcome(shift, game.current));
    audio.play(UNDERCOVER_SOUNDS.swoosh, { volume: event.decision === 'timeout' ? 0.3 : 0.6 });
    if (event.verdict === 'sold') {
      audio.play(UNDERCOVER_SOUNDS.deal, { volume: 0.8 });
      haptic('light');
    } else if (event.verdict === 'spotted') {
      audio.play('success', { volume: 0.6 });
      setFlash((n) => n + 1);
      haptic('success');
    } else if (event.verdict === 'soldZivi') {
      audio.play(UNDERCOVER_SOUNDS.radio, { volume: 1 });
      playSound(MINIGAME_SOUNDS.fail, 0.8);
      setBust((n) => n + 1);
      motion.current.shake = reduced ? 0 : 1;
      haptic('error');
    } else {
      playSound(MINIGAME_SOUNDS.fail, 0.45);
      haptic('warning');
    }
  };

  const after = (event: ShiftEvent | null, dir: number, speed = 0) => {
    if (event?.type !== 'decided') return;
    launch(event, dir, speed);
    feedback(event);
    setIndex(game.current.index);
    setLive(false);
    if (game.current.done) motion.current.slow = reduced ? 1 : 0.45;
  };

  const choose = (decision: Decision, speed = 0) => {
    if (!running || !canDecide(game.current)) return;
    after(decide(shift, game.current, decision), decision === 'sell' ? 1 : -1, speed);
  };

  useGameKeys(
    KEYS,
    ({ code }) => {
      if (code === 'ArrowRight' || code === 'KeyD') choose('sell');
      else choose('refuse');
    },
    running,
  );

  const onPointerDown = (e: PointerEvent) => {
    if (!running || !canDecide(game.current) || drag.current) return;
    capture(e);
    const now = performance.now();
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: 0, y: 0, lt: now, lx: e.clientX, vx: 0 };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lt);
    d.vx = d.vx * 0.5 + ((e.clientX - d.lx) / dt) * 0.5;
    d.lx = e.clientX;
    d.lt = now;
    d.x = e.clientX - d.sx;
    d.y = (e.clientY - d.sy) * 0.35;
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    motion.current.x = d.x;
    motion.current.y = d.y;
    const flick = Math.abs(d.vx) >= FLICK && Math.sign(d.vx) === Math.sign(d.x || d.vx);
    if (Math.abs(d.x) >= SWIPE_PX || flick) {
      const dir = (d.x || d.vx) > 0 ? 1 : -1;
      choose(dir > 0 ? 'sell' : 'refuse', d.vx * 1000);
    }
  };

  useFrameLoop((rawDt, t) => {
    const m = motion.current;
    const g = game.current;
    const dt = rawDt * m.slow;
    if (!g.done) {
      for (const event of step(shift, g, dt)) {
        if (event.type === 'decided') after(event, 0);
        else if (event.type === 'next') {
          setLive(true);
          audio.play(UNDERCOVER_SOUNDS.steps, { volume: 0.5 });
        }
      }
      // Die letzten Sekunden einer Karte: Ticken, damit man es auch ohne Hinschauen merkt.
      if (g.gapLeft <= 0 && g.cardLeft <= 2.5) {
        const tick = Math.ceil(g.cardLeft * 2);
        if (tick !== m.lastTick) {
          m.lastTick = tick;
          playSound(MINIGAME_SOUNDS.click, 0.35);
        }
      }
    }
    // Oberste Karte: folgt dem Finger, sonst federt sie zurück.
    const d = drag.current;
    if (d) {
      m.x = d.x;
      m.y = d.y;
    } else {
      const k = Math.min(1, rawDt * 14);
      m.x += (0 - m.x) * k;
      m.y += (0 - m.y) * k;
    }
    const el = top.current;
    if (el) {
      const lean = Math.max(-1, Math.min(1, m.x / SWIPE_PX));
      el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px) rotate(${(m.x * 0.06).toFixed(2)}deg)`;
      el.style.setProperty('--uc-sell', Math.max(0, lean).toFixed(2));
      el.style.setProperty('--uc-refuse', Math.max(0, -lean).toFixed(2));
    }
    if (timer.current) {
      const share = g.gapLeft > 0 ? 1 : g.cardLeft / shift.perCard;
      timer.current.style.transform = `scaleX(${share.toFixed(3)})`;
    }
    // Wegfliegende Karten.
    if (fly.current.length > 0) {
      let gone = false;
      for (const f of fly.current) {
        f.age += rawDt;
        f.x += f.vx * rawDt * m.slow;
        f.y += f.vy * rawDt * m.slow;
        f.vy += 900 * rawDt * m.slow;
        f.rot += f.vr * rawDt * m.slow;
        const fe = flyEls.current.get(f.index);
        if (fe) {
          fe.style.transform = `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) rotate(${f.rot.toFixed(1)}deg)`;
          fe.style.opacity = String(Math.max(0, 1 - f.age / (FLY_TIME * (m.slow < 1 ? 1.6 : 1))));
        }
        if (f.age > FLY_TIME * (m.slow < 1 ? 1.6 : 1)) gone = true;
      }
      if (gone) {
        fly.current = fly.current.filter((f) => f.age <= FLY_TIME * (m.slow < 1 ? 1.6 : 1));
        setFlyers(fly.current);
      }
    }
    // Wackeln bei Verkauf an einen Zivi.
    if (stage.current) {
      if (m.shake > 0) {
        m.shake = Math.max(0, m.shake - rawDt * 2.6);
        const a = m.shake * 9;
        stage.current.style.transform = `translate(${(Math.sin(t * 61) * a).toFixed(1)}px, ${(Math.cos(t * 47) * a * 0.6).toFixed(1)}px)`;
      } else if (stage.current.style.transform) stage.current.style.transform = '';
    }
    if (t - m.lastHud >= 0.1) {
      m.lastHud = t;
      setLeft(g.gapLeft > 0 ? shift.perCard : g.cardLeft);
    }
    if (g.done && m.endAt < 0) m.endAt = t + END_DELAY;
    if (m.endAt >= 0 && t >= m.endAt && !m.sent) {
      m.sent = true;
      const out = shiftOutcome(shift, g);
      onFinish(shiftScore(shift, out), shiftPicks(out));
    }
  }, running);

  const deck = shift.people.slice(index, index + 3);
  const current = shift.people[index];
  const ziviSeen = tally.spotted;

  return (
    <div class={`uc${reduced ? ' is-reduced' : ''}`}>
      <Scene night={night} spot={spotName} watched={!!current?.shows.car && live} flash={flash} />
      {bust > 0 && <div key={bust} class="uc-bust" aria-hidden="true" />}
      <HudBar class="uc-hud">
        <HudTimer seconds={left} total={shift.perCard} urgentAt={2} />
        <span class="uc-hud__stat">
          <span class="uc-hud__label">Kunde</span>
          <span class="uc-hud__value">
            {Math.min(total, index + 1)}/{total}
          </span>
        </span>
        <span class="uc-hud__stat is-law">
          <span class="uc-hud__label">Zivis erkannt</span>
          <span class="uc-hud__value">
            {ziviSeen}/{shift.zivis}
          </span>
        </span>
        <span class="uc-hud__stat is-money">
          <span class="uc-hud__label">Verkauft</span>
          <span class="uc-hud__value">{tally.sold}</span>
        </span>
      </HudBar>
      <div ref={stage} class="uc-stage">
        <div class="uc-deck">
          {deck
            .map((person, i) => ({ person, i }))
            .reverse()
            .map(({ person, i }) => (
              <div
                key={person.index}
                ref={i === 0 ? top : undefined}
                class={`uc-card is-depth-${i}${i === 0 && live ? ' is-live' : ''}`}
                style={i === 0 ? undefined : { transform: '' }}
                onPointerDown={i === 0 ? onPointerDown : undefined}
                onPointerMove={i === 0 ? onPointerMove : undefined}
                onPointerUp={i === 0 ? onPointerUp : undefined}
                onPointerCancel={i === 0 ? onPointerUp : undefined}
                aria-hidden={i === 0 ? undefined : true}
              >
                {i === 0 && (
                  <span class="uc-card__timer" aria-hidden="true">
                    <span ref={timer} />
                  </span>
                )}
                <PersonCard person={person} total={total} />
                {i === 0 && (
                  <>
                    <span class="uc-card__stamp is-sell" aria-hidden="true">
                      Verkaufen
                    </span>
                    <span class="uc-card__stamp is-refuse" aria-hidden="true">
                      Abwimmeln
                    </span>
                  </>
                )}
              </div>
            ))}
          {flyers.map((f) => {
            const person = shift.people[f.index];
            if (!person) return null;
            return (
              <div
                key={`fly-${f.index}`}
                ref={(el) => {
                  if (el) flyEls.current.set(f.index, el);
                  else flyEls.current.delete(f.index);
                }}
                class={`uc-card is-flying is-${f.verdict}`}
                aria-hidden="true"
              >
                <PersonCard person={person} total={total} />
                <span class={`uc-card__reveal ${f.zivi ? 'is-zivi' : 'is-kunde'}`}>
                  <Icon name={f.zivi ? 'badge' : 'user'} />
                  {f.zivi ? 'Zivi' : 'Kunde'}
                </span>
              </div>
            );
          })}
        </div>
        {toast && (
          <p key={toast.key} class={`uc-toast is-${toast.tone}`} role="status">
            {toast.text}
          </p>
        )}
      </div>
      <div class="uc-actions">
        <button
          type="button"
          class="mg-pad mg-pad--wide is-danger uc-action"
          disabled={!running}
          onClick={() => choose('refuse')}
        >
          <Icon name="arrowLeft" />
          <span class="mg-pad__label">Abwimmeln</span>
        </button>
        <button
          type="button"
          class="mg-pad mg-pad--wide is-money uc-action"
          disabled={!running}
          onClick={() => choose('sell')}
        >
          <span class="mg-pad__label">Verkaufen</span>
          <Icon name="arrowRight" />
        </button>
      </div>
      <p class="mg-sr" aria-live="polite">
        {current ? `Kunde ${index + 1}: ${current.line}` : ''}
      </p>
    </div>
  );
}
