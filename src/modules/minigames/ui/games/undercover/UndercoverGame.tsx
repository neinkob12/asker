// Zivi oder Kunde (Auftrag 44, Teil 5): Am Spot kommen Leute nacheinander, jeder als Karte mit Gesicht, einem Satz und
// dem, was du siehst. Wischen nach rechts (→, D) verkauft, nach links (←, A) wimmelt ab. Karten fliegen mit Schwung,
// der Stapel hat Tiefe. Wer zu lange zögert, lässt den Kunden gehen. Spiellogik in model.ts, Merkmale in tells.ts.
// Hinschauen (Auftrag 48): Der Satz wird gesprochen (tippt sich), Merkmale zeigen sich nach und nach im Bild und als
// Chip (Kopf dreht sich zum Ohr, Blick zum Auto, Jacke verrutscht); solange noch etwas kommt, steht „…“ da.

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
import { Body, PortraitMarks } from './figure';
import {
  canDecide,
  cardElapsed,
  createShift,
  currentSeconds,
  type Decision,
  decide,
  initShift,
  inputFrom,
  LINE_SECONDS,
  type Person,
  type ShiftEvent,
  type ShiftOutcome,
  shiftOutcome,
  shiftPicks,
  shiftScore,
  shiftStats,
  step,
  type Verdict,
  visibleTells,
} from './model';
import { UNDERCOVER_SOUNDS } from './sounds';
import { tellDef } from './tells';

const KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
const NONE: readonly string[] = [];
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

/** Was im Bild schon zu sehen ist: nur die gezeigten Merkmale (Ohr, Kragen, Gürtel, Schuhe, Kopfhörer). */
function seenPerson(person: Person, seen: readonly string[]): Person {
  if (seen.length === person.tells.length) return person;
  const shows: Person['shows'] = {};
  for (const id of seen) {
    const show = tellDef(id)?.show;
    if (show && show !== 'none' && show !== 'speech') shows[show] = true;
  }
  const shoes = seen.includes('newShoes') ? 'new' : seen.includes('worn') ? 'worn' : 'plain';
  return { ...person, shows, shoes };
}

/** Eine Karte: Gesicht mit Merkmalen, Satz, was du siehst, unten Gürtel und Schuhe. seen = was schon zu sehen ist. */
const PersonCard = memo(function PersonCard(props: {
  person: Person;
  total: number;
  seen: readonly string[];
  lineRef?: { current: HTMLParagraphElement | null };
  /** Karte hinten im Stapel: steht still. */
  still?: boolean;
}) {
  const { total, seen } = props;
  const person = useMemo(() => seenPerson(props.person, seen), [props.person, seen]);
  const amount = formatAmount(person.amount, person.unit);
  const more = seen.length < props.person.tells.length;
  const has = (id: string) => seen.includes(id);
  const life = [
    'uc-figure',
    has('watchesCar') ? 'is-glance' : '',
    has('earpiece') ? 'is-ear' : '',
    has('nervous') || has('shaky') ? 'is-jitter' : '',
    has('shaky') ? 'is-shaky' : '',
    has('phone') ? 'is-down' : '',
    props.still ? 'is-still' : '',
  ]
    .filter(Boolean)
    .join(' ');
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
      {/* Ganze Figur im Licht der Laterne: Kopf (Face mit Merkmalen) über dem Körper. */}
      <div class="uc-card__person">
        <div
          class={life}
          style={{
            '--uc-delay': `${-(person.index * 0.77) % 3}s`,
            '--uc-sway': `${3.6 + (person.index % 3) * 0.7}s`,
          }}
        >
          <div class="uc-figure__head">
            <Face look={person.look} />
            <PortraitMarks person={person} />
          </div>
          <Body person={person} />
        </div>
      </div>
      {/* Der Satz steht ganz da (gleicher Umbruch), der noch nicht gesagte Rest ist durchsichtig. */}
      <p class="uc-card__line" ref={props.lineRef}>
        <span>{props.lineRef ? '' : `„${person.line}“`}</span>
        <span class="uc-card__line-rest">{props.lineRef ? `„${person.line}“` : ''}</span>
      </p>
      <ul class="uc-card__tells" aria-label="Was du siehst">
        {seen.map((id) => {
          const def = tellDef(id);
          if (!def) return null;
          return (
            <li key={id} class="uc-chip">
              <Icon name={TELL_ICONS[id] ?? 'eye'} />
              <span>{def.text}</span>
            </li>
          );
        })}
        {more && (
          <li class="uc-chip is-more" aria-label="Schau genau hin, da kommt noch was">
            <Icon name="eye" />
            <span>…</span>
          </li>
        )}
      </ul>
    </>
  );
});

/** Häuser der Straße (400er-Raster): links, oben, Breite, Ton (0 bis 2) und Fassade (Putz oder Backstein). */
const HOUSES: { x: number; y: number; w: number; tone: 0 | 1 | 2; brick: boolean }[] = [
  { x: -10, y: 40, w: 96, tone: 0, brick: false },
  { x: 86, y: 70, w: 70, tone: 1, brick: true },
  { x: 156, y: 30, w: 88, tone: 2, brick: false },
  { x: 244, y: 60, w: 76, tone: 0, brick: true },
  { x: 320, y: 44, w: 96, tone: 1, brick: false },
];

interface Win {
  x: number;
  y: number;
  lit: boolean;
  curtain: boolean;
}

/** Fenster je Haus im festen Raster, ein paar hell (fest, nicht gewürfelt), unten bleibt das Erdgeschoss. */
const WINDOWS: Win[] = HOUSES.flatMap((h, i) => {
  const cols = Math.max(1, Math.floor((h.w - 14) / 26));
  const left = h.x + (h.w - cols * 26 + 8) / 2;
  const out: Win[] = [];
  for (let row = 0; h.y + 16 + row * 36 + 22 < 160; row++) {
    for (let col = 0; col < cols; col++) {
      const k = i * 7 + row * 3 + col * 5;
      out.push({ x: left + col * 26, y: h.y + 16 + row * 36, lit: k % 5 < 2, curtain: k % 3 === 0 });
    }
  }
  return out;
});

/** Leute, die hinten über die Straße gehen (Silhouetten, x-Start, Tempo in s, Größe). */
const PASSERS: { from: number; dur: number; scale: number; delay: number }[] = [
  { from: -30, dur: 19, scale: 1, delay: -4 },
  { from: 430, dur: 24, scale: 0.85, delay: -13 },
  { from: -30, dur: 28, scale: 0.9, delay: -21 },
];

/**
 * Straße hinter dem Stapel (Auftrag 48 mit Licht; Teil E gemalt): Himmel mit Verlauf, ferne Dächer, Häuser aus Putz
 * und Backstein mit Gesims und Sockel, Fenster mit Rahmen, Sprossen, Bank und Vorhang (hell mit warmem Verlauf, dunkel
 * mit Spiegelung), ein Kiosk mit Markise, Laterne mit Lichtkegel und Lichtfleck, nasser Gehweg mit Spiegelungen, Körnung.
 * Alles Stehende ist eine Ebene, die nie neu malt; Leute im Hintergrund und das Auto liegen in einer eigenen Ebene
 * darüber (dort bewegt sich etwas). Tag oder Nacht nach der Stunde, Farben aus den Tokens (CSS).
 */
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
        <defs>
          <linearGradient id="uc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="uc-stop-sky-top" />
            <stop offset="1" class="uc-stop-sky-low" />
          </linearGradient>
          <linearGradient id="uc-house" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="uc-stop-house-top" />
            <stop offset="1" class="uc-stop-house-low" />
          </linearGradient>
          <linearGradient id="uc-walk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="uc-stop-walk-top" />
            <stop offset="1" class="uc-stop-walk-low" />
          </linearGradient>
          <linearGradient id="uc-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="uc-stop-light" stop-opacity="0.5" />
            <stop offset="1" class="uc-stop-light" stop-opacity="0" />
          </linearGradient>
          <radialGradient id="uc-pool" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" class="uc-stop-light" stop-opacity="0.55" />
            <stop offset="1" class="uc-stop-light" stop-opacity="0" />
          </radialGradient>
          {/* Helles Fenster: oben wärmer und heller, unten dunkler (Raum dahinter). */}
          <linearGradient id="uc-win-lit" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" class="uc-stop-light" stop-opacity="1" />
            <stop offset="1" class="uc-stop-light-deep" stop-opacity="0.85" />
          </linearGradient>
          {/* Dunkles Fenster: spiegelt den Himmel schräg. */}
          <linearGradient id="uc-win-dark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" class="uc-stop-sky-top" />
            <stop offset="0.5" class="uc-stop-sky-low" />
            <stop offset="0.52" class="uc-stop-sky-top" />
            <stop offset="1" class="uc-stop-sky-top" />
          </linearGradient>
          {/* Licht von links: Fassaden rechts dunkler. */}
          <linearGradient id="uc-side" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.06" />
            <stop offset="1" stop-color="#000000" stop-opacity="0.22" />
          </linearGradient>
          <pattern id="uc-brick" width="12" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 0.5 H12 M0 3.5 H12 M3 0.5 V3.5 M9 3.5 V6" class="uc-scene__mortar" />
          </pattern>
          <pattern id="uc-plaster" width="40" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 7 Q10 6 20 7.4 T40 7" class="uc-scene__plaster" />
          </pattern>
          <filter id="uc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          {/* Körnung wie gemalt: Rauschen, kaum sichtbar. */}
          <filter id="uc-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.9 -0.35" />
          </filter>
        </defs>
        <rect x="0" y="0" width="400" height="240" fill="url(#uc-sky)" />
        <path
          class="uc-scene__far"
          d="M0 120 L30 120 L30 96 L58 96 L58 110 L92 110 L92 70 L104 58 L116 70 L116 108 L150 108 L150 90 L190 90 L190 112 L232 112 L232 80 L262 80 L262 100 L300 100 L300 66 L312 50 L324 66 L324 104 L360 104 L360 88 L400 88 L400 200 L0 200 Z"
        />
        {HOUSES.map((h) => (
          <g key={h.x} class={`uc-scene__house is-tone-${h.tone}`}>
            <rect x={h.x} y={h.y} width={h.w} height={200 - h.y} fill="url(#uc-house)" />
            <rect
              x={h.x}
              y={h.y}
              width={h.w}
              height={200 - h.y}
              fill={h.brick ? 'url(#uc-brick)' : 'url(#uc-plaster)'}
            />
            <rect class="uc-scene__tint" x={h.x} y={h.y} width={h.w} height={200 - h.y} />
            <rect x={h.x} y={h.y} width={h.w} height={200 - h.y} fill="url(#uc-side)" />
            {/* Gesims oben, Band über dem Erdgeschoss, Sockel unten. */}
            <rect class="uc-scene__cornice" x={h.x - 2} y={h.y - 3} width={h.w + 4} height="5" />
            <rect class="uc-scene__band" x={h.x} y="160" width={h.w} height="3" />
            <rect class="uc-scene__plinth" x={h.x} y="190" width={h.w} height="10" />
          </g>
        ))}
        <g class="uc-scene__edges">
          {HOUSES.slice(1).map((h) => (
            <rect key={h.x} x={h.x - 2} y={h.y} width="2" height={200 - h.y} />
          ))}
        </g>
        <g class="uc-scene__glow" filter="url(#uc-glow)">
          {WINDOWS.filter((w) => w.lit).map((w) => (
            <rect key={`g${w.x}-${w.y}`} x={w.x - 3} y={w.y - 3} width="24" height="28" />
          ))}
        </g>
        <g class="uc-scene__windows">
          {WINDOWS.map((w) => (
            <g key={`w${w.x}-${w.y}`}>
              <rect class="uc-scene__frame" x={w.x - 1.5} y={w.y - 1.5} width="21" height="25" rx="1" />
              <rect
                class={w.lit ? 'uc-scene__pane is-lit' : 'uc-scene__pane'}
                x={w.x}
                y={w.y}
                width="18"
                height="22"
                fill={w.lit ? 'url(#uc-win-lit)' : 'url(#uc-win-dark)'}
              />
              {w.lit && w.curtain && <path class="uc-scene__curtain" d={`M${w.x} ${w.y} h6 q-2 11 1 22 h-7 Z`} />}
              <path class="uc-scene__mullion" d={`M${w.x + 9} ${w.y} v22 M${w.x} ${w.y + 8} h18`} />
              <rect class="uc-scene__sill" x={w.x - 2.5} y={w.y + 22.5} width="23" height="2.2" />
            </g>
          ))}
        </g>
        {/* Kiosk im Erdgeschoss: Schaufenster mit Licht, Markise. */}
        <g class="uc-scene__kiosk">
          <rect class="uc-scene__shop" x="170" y="166" width="60" height="24" fill="url(#uc-win-lit)" />
          <path class="uc-scene__mullion" d="M190 166 v24 M210 166 v24" />
          <path class="uc-scene__awning" d="M166 160 L234 160 L238 168 L162 168 Z" />
          <path class="uc-scene__awning-stripe" d="M174 160 l-2 8 M190 160 l0 8 M206 160 l0 8 M222 160 l2 8" />
          <rect class="uc-scene__shelf" x="172" y="178" width="56" height="1.4" />
        </g>
        <rect x="0" y="200" width="400" height="40" fill="url(#uc-walk)" />
        <path
          class="uc-scene__joints"
          d="M0 214 H400 M0 228 H400 M40 200 L30 240 M120 200 L116 240 M200 200 V240 M280 200 L284 240 M360 200 L370 240"
        />
        <g class="uc-scene__wet">
          {WINDOWS.filter((w, i) => w.lit && i % 2 === 0).map((w, i) => (
            <rect key={`r${w.x}-${w.y}`} x={w.x + 4} y={204} width="10" height={14 + (i % 3) * 6} rx="3" />
          ))}
          <rect x="176" y="203" width="48" height="16" rx="5" />
        </g>
        <rect class="uc-scene__curb" x="0" y="198" width="400" height="3" />
        <g class="uc-scene__lamp">
          <path class="uc-scene__cone" d="M322 98 L342 98 L392 200 L272 200 Z" fill="url(#uc-cone)" />
          <ellipse class="uc-scene__pool" cx="332" cy="206" rx="70" ry="12" fill="url(#uc-pool)" />
          <rect class="uc-scene__pole" x="330" y="96" width="4" height="104" />
          <path class="uc-scene__pole" d="M318 96 L346 96 L340 90 L324 90 Z" />
          <rect class="uc-scene__bulb" x="322" y="96" width="20" height="3" rx="1.5" />
        </g>
        <rect class="uc-scene__grain" x="0" y="0" width="400" height="240" filter="url(#uc-grain)" />
      </svg>
      {/* Was sich bewegt: eigene Ebene, damit die Straße darunter nicht mit neu malt. */}
      <svg
        class="uc-scene__live"
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        focusable="false"
      >
        <g class="uc-scene__passers">
          {PASSERS.map((p, i) => (
            <g
              key={i}
              class={`uc-scene__passer${p.from > 200 ? ' is-left' : ''}`}
              style={{ animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}
            >
              <g transform={`translate(0 ${200 - 34 * p.scale}) scale(${p.scale})`}>
                <circle cx="0" cy="4" r="4" />
                <path d="M-5 9 Q0 7 5 9 L6 24 L-6 24 Z" />
                <path class="uc-scene__leg" d="M-4 23 L-5 34 L-2 34 L-1 23 Z" />
                <path class="uc-scene__leg is-back" d="M1 23 L2 34 L5 34 L4 23 Z" />
              </g>
            </g>
          ))}
        </g>
        <g class={`uc-scene__car${props.watched ? ' is-watched' : ''}`}>
          <ellipse class="uc-scene__shadow" cx="70" cy="205" rx="58" ry="4" />
          <path
            class="uc-scene__body"
            d="M18 196 L24 178 Q28 170 40 169 L86 169 Q96 170 102 178 L112 186 L120 188 Q124 190 124 196 Z"
          />
          <path class="uc-scene__sill-line" d="M22 190 L122 190" />
          <path class="uc-scene__shine" d="M30 180 Q60 175 100 179" />
          <path class="uc-scene__glass" d="M32 181 L38 173 L62 173 L62 181 Z M66 173 L86 173 L94 181 L66 181 Z" />
          <path class="uc-scene__glass-shine" d="M40 180 L45 174 M70 180 L74 174" />
          <circle class="uc-scene__wheel" cx="40" cy="197" r="8" />
          <circle class="uc-scene__wheel" cx="102" cy="197" r="8" />
          <circle class="uc-scene__hub" cx="40" cy="197" r="3" />
          <circle class="uc-scene__hub" cx="102" cy="197" r="3" />
          <circle class="uc-scene__head" cx="54" cy="177" r="3.4" />
          <circle class="uc-scene__head" cx="78" cy="177" r="3.4" />
          <rect key={props.flash} class="uc-scene__lights" x="116" y="184" width="8" height="5" rx="2" />
          <ellipse class="uc-scene__lights-pool" cx="132" cy="206" rx="16" ry="3" />
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
  /** Was an der obersten Karte schon zu sehen ist (wächst, während man hinschaut). */
  const [seen, setSeen] = useState<string[]>(() => visibleTells(shift.people[0], 0));
  const line = useRef<HTMLParagraphElement>(null);

  const stage = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const flyEls = useRef(new Map<number, HTMLDivElement>());
  const fly = useRef<Flyer[]>([]);
  const drag = useRef<{ id: number; sx: number; sy: number; x: number; y: number; lt: number; lx: number; vx: number }>(
    null,
  );
  const motion = useRef({
    x: 0,
    y: 0,
    shake: 0,
    lastHud: -1,
    endAt: -1,
    sent: false,
    lastTick: -1,
    slow: 1,
    seenCount: -1,
    seenIndex: -1,
  });

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
    // Hinschauen: neue Merkmale zeigen sich (mit leisem Ton), der Satz tippt sich.
    const person = shift.people[g.index];
    if (person && !g.done) {
      const elapsed = cardElapsed(shift, g);
      const now = visibleTells(person, elapsed);
      if (now.length !== m.seenCount || g.index !== m.seenIndex) {
        if (g.index === m.seenIndex && now.length > m.seenCount) playSound(MINIGAME_SOUNDS.click, 0.25);
        m.seenCount = now.length;
        m.seenIndex = g.index;
        setSeen(now);
      }
      const el = line.current;
      const said = el?.children[0];
      const rest = el?.children[1];
      if (said && rest) {
        const full = `„${person.line}“`;
        const chars = reduced ? full.length : Math.ceil((elapsed / LINE_SECONDS) * full.length);
        const text = full.slice(0, Math.max(0, chars));
        if (said.textContent !== text) {
          said.textContent = text;
          rest.textContent = full.slice(text.length);
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
      const share = g.gapLeft > 0 ? 1 : g.cardLeft / currentSeconds(shift, g);
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
      setLeft(g.gapLeft > 0 ? currentSeconds(shift, g) : g.cardLeft);
    }
    if (g.done && m.endAt < 0) m.endAt = t + END_DELAY;
    if (m.endAt >= 0 && t >= m.endAt && !m.sent) {
      m.sent = true;
      const out = shiftOutcome(shift, g);
      onFinish(shiftScore(shift, out), shiftPicks(out), shiftStats(shift, out));
    }
  }, running);

  const deck = shift.people.slice(index, index + 3);
  const current = shift.people[index];
  const ziviSeen = tally.spotted;

  return (
    <div class={`uc${reduced ? ' is-reduced' : ''}`}>
      <Scene night={night} spot={spotName} watched={live && seen.includes('watchesCar')} flash={flash} />
      {bust > 0 && <div key={bust} class="uc-bust" aria-hidden="true" />}
      <HudBar class="uc-hud">
        <HudTimer seconds={left} total={current?.seconds ?? shift.perCard} urgentAt={2} />
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
        {/* Tempo steigt: Sobald die Karten merklich kürzer sind, sagt es das HUD (einmal mit Puls). */}
        {current && current.seconds <= shift.perCard * 0.9 && (
          <span class="uc-hud__rush" role="img" aria-label="Es wird voller, die Leute warten nicht mehr so lange">
            <Icon name="bolt" />
            <span class="uc-hud__rush-text">Voller</span>
          </span>
        )}
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
                <PersonCard
                  person={person}
                  total={total}
                  seen={i === 0 ? seen : NONE}
                  lineRef={i === 0 ? line : undefined}
                  still={i > 0}
                />
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
                <PersonCard person={person} total={total} seen={person.tells} />
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
