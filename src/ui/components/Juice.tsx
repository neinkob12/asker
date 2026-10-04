// "Juice": kleine Animationen, die das Spiel lebendig machen. Rein visuell, ändern nie den Spielzustand.
// CountUp (Zahl zählt hoch/runter), FloatingNumber (+120 € steigt auf), Stamp (Stempel), Confetti,
// SegmentMeter (Stufen-Balken), DuelBar (Kräfte-Vergleich). Alles respektiert prefers-reduced-motion.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import type { IconName } from './icons';

/** Möchte der Nutzer weniger Bewegung? */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface CountUpProps {
  value: number;
  /** Anzeige, Standard: gerundete Zahl. */
  format?: (value: number) => string;
  /** Dauer der Animation in ms. Standard 650. */
  duration?: number;
  class?: string;
}

/**
 * Zahl, die bei Änderungen animiert hoch- bzw. runterzählt und kurz pulsiert (grün hoch, rot runter).
 *
 * Die Zahl läuft am Browser vorbei am Render: Der Text des Wurzel-`<span>` wird pro Bild direkt gesetzt (kein
 * `setState`, kein Neuzeichnen von Preact), der Puls ist eine CSS-Klasse. Ein neuer Puls startet die Animation neu,
 * indem zwischen zwei gleichen Keyframes (`ui-pulse-up` und `ui-pulse-up-b`) gewechselt wird; das braucht kein
 * erzwungenes Layout und baut das Element nicht neu.
 */
export function CountUp(props: CountUpProps) {
  const format = props.format ?? ((v: number) => String(Math.round(v)));
  const root = useRef<HTMLSpanElement>(null);
  // Der Anfangstext steht fest im vnode; danach schreibt nur noch `write` in den Textknoten.
  const initial = useRef<string | null>(null);
  if (initial.current === null) initial.current = format(props.value);
  const shownText = useRef(initial.current);
  const from = useRef(props.value);
  const target = useRef(props.value);
  const frame = useRef(0);
  const running = useRef(false);
  const flip = useRef(false);
  const formatRef = useRef(format);
  formatRef.current = format;

  const write = (value: number) => {
    const text = formatRef.current(value);
    if (text === shownText.current) return;
    shownText.current = text;
    const node = root.current?.firstChild;
    if (node && node.nodeType === 3) (node as Text).data = text;
    else if (root.current) root.current.textContent = text;
  };

  useEffect(() => {
    if (props.value === target.current) {
      // Anzeige nachziehen, falls sich nur `format` geändert hat.
      if (!running.current) write(props.value);
      return;
    }
    const dir = props.value > target.current ? 'up' : 'down';
    target.current = props.value;
    const el = root.current;
    if (el) {
      flip.current = !flip.current;
      el.classList.remove(dir === 'up' ? 'is-down' : 'is-up');
      el.classList.add(dir === 'up' ? 'is-up' : 'is-down');
      el.classList.toggle('is-alt', flip.current);
    }
    cancelAnimationFrame(frame.current);
    if (prefersReducedMotion()) {
      running.current = false;
      from.current = props.value;
      write(props.value);
      return;
    }
    running.current = true;
    const start = performance.now();
    const begin = from.current;
    const end = props.value;
    const duration = props.duration ?? 650;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const v = begin + (end - begin) * eased;
      from.current = v;
      write(v);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else running.current = false;
    };
    frame.current = requestAnimationFrame(step);
  }, [props.value, props.duration, props.format]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <span ref={root} class={`ui-countup ${props.class ?? ''}`}>
      {initial.current}
    </span>
  );
}

interface Floater {
  id: number;
  text: string;
  up: boolean;
}

let floaterId = 0;

export interface FloatingNumberProps {
  /** Beobachteter Wert: Jede Änderung steigt als "+12 €" bzw. "−8 €" auf. */
  value: number;
  format?: (delta: number) => string;
  /** Kleinere Änderungen (Betrag) werden ignoriert. Standard 1. */
  min?: number;
  class?: string;
}

/** Schwebende Zahlen über einem Wert, z.B. dem Geld im HUD. */
export function FloatingNumber(props: FloatingNumberProps) {
  const last = useRef(props.value);
  const [items, setItems] = useState<Floater[]>([]);
  // Entfern-Timer pro Eintrag: Ein neuer Wert darf den Timer des vorigen nicht abbrechen (sonst blieben dessen
  // Elemente im DOM stehen); aufgeräumt wird nur beim Ausblenden der ganzen Komponente.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );
  useEffect(() => {
    const delta = props.value - last.current;
    last.current = props.value;
    if (Math.abs(delta) < (props.min ?? 1) || prefersReducedMotion()) return;
    const sign = delta > 0 ? '+' : '−';
    const text = props.format ? props.format(delta) : `${sign}${Math.round(Math.abs(delta))}`;
    const item = { id: ++floaterId, text, up: delta > 0 };
    setItems((list) => [...list.slice(-3), item]);
    timers.current.set(
      item.id,
      setTimeout(() => {
        timers.current.delete(item.id);
        setItems((list) => list.filter((f) => f.id !== item.id));
      }, 1300),
    );
  }, [props.value]);
  return (
    <span class={`ui-floaters ${props.class ?? ''}`} aria-hidden="true">
      {items.map((f) => (
        <span key={f.id} class={`ui-floater ${f.up ? 'is-up' : 'is-down'}`}>
          {f.text}
        </span>
      ))}
    </span>
  );
}

export interface StampProps {
  children: ComponentChildren;
  tone?: 'bad' | 'accent' | 'warn' | 'info' | 'ink';
  /** Drehung in Grad, Standard −8. */
  rotate?: number;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName | (string & {});
  class?: string;
}

/** Stempel mit Doppelrand, knallt beim Erscheinen auf (z.B. "PLEITE", "ANTWORT!", "GEWONNEN"). */
export function Stamp(props: StampProps) {
  const style = { '--stamp-rotate': `${props.rotate ?? -8}deg` } as JSX.CSSProperties;
  return (
    <span
      class={`ui-stamp ui-stamp--${props.tone ?? 'bad'} ui-stamp--${props.size ?? 'md'} ${props.class ?? ''}`}
      style={style}
    >
      {props.icon && <Icon name={props.icon} />}
      {props.children}
    </span>
  );
}

const CONFETTI_COLORS = ['#ff4b4b', '#58cc02', '#ffc800', '#1cb0f6', '#a560f0', '#ffffff'];

/** Konfetti-Regen (rein dekorativ). */
export function Confetti(props: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: props.count ?? 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2.4 + Math.random() * 2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
      wide: Math.random() > 0.5,
    })),
  );
  if (prefersReducedMotion()) return null;
  return (
    <div class="ui-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          class={`ui-confetti__piece ${p.wide ? 'is-wide' : ''}`}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export interface SegmentMeterProps {
  /** 0 bis 1. */
  value: number;
  /** Anzahl Stufen, Standard 5. */
  segments?: number;
  /** Farbverlauf der Stufen: 'heat' grün→gelb→rot (Standard), 'good' rot→grün, oder eine Farbe für alle. */
  scheme?: 'heat' | 'good' | 'accent' | 'info' | 'warn' | 'bad';
  label?: string;
  size?: 'sm' | 'md';
}

/** Stufen-Balken, z.B. Heat im HUD oder Ruf. */
export function SegmentMeter(props: SegmentMeterProps) {
  const segments = props.segments ?? 5;
  const value = Math.min(1, Math.max(0, props.value));
  const filled = value <= 0 ? 0 : Math.max(1, Math.ceil(value * segments - 1e-9));
  const scheme = props.scheme ?? 'heat';
  const colorFor = (i: number) => {
    const t = segments <= 1 ? 1 : i / (segments - 1);
    if (scheme === 'heat') return t < 0.34 ? 'green' : t < 0.67 ? 'yellow' : 'red';
    if (scheme === 'good') return t < 0.34 ? 'red' : t < 0.67 ? 'yellow' : 'green';
    return { accent: 'green', info: 'blue', warn: 'yellow', bad: 'red' }[scheme];
  };
  return (
    <span
      class={`ui-meter ui-meter--${props.size ?? 'md'}`}
      role="img"
      aria-label={`${props.label ?? 'Stufe'}: ${Math.round(value * 100)} Prozent`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} class={`ui-meter__seg ${i < filled ? `is-on is-${colorFor(i)}` : ''}`} />
      ))}
    </span>
  );
}

export interface DuelBarProps {
  /** Eigene Stärke (beliebige Einheit, nur das Verhältnis zählt). */
  left: number;
  right: number;
  leftLabel?: ComponentChildren;
  rightLabel?: ComponentChildren;
}

/** Doppelbalken: eigene Stärke gegen die des Gegners, treffen sich in der Mitte je nach Verhältnis. */
export function DuelBar(props: DuelBarProps) {
  const total = Math.max(0.0001, props.left + props.right);
  const pct = Math.round((props.left / total) * 1000) / 10;
  return (
    <div class="ui-duel">
      {(props.leftLabel || props.rightLabel) && (
        <div class="ui-duel__labels">
          <span class="ui-duel__label is-left">{props.leftLabel}</span>
          <span class="ui-duel__label is-right">{props.rightLabel}</span>
        </div>
      )}
      <div
        class="ui-duel__bar"
        role="img"
        aria-label={`Kräfteverhältnis ${Math.round(pct)} zu ${Math.round(100 - pct)}`}
      >
        <span class="ui-duel__left" style={{ width: `${pct}%` }} />
        <span class="ui-duel__right" style={{ width: `${100 - pct}%` }} />
        <span class="ui-duel__spark" style={{ left: `${pct}%` }}>
          <Icon name="bolt" />
        </span>
      </div>
    </div>
  );
}
