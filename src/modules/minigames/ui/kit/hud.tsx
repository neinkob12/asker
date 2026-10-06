// HUD-Bausteine der Minispiele im Look Glas: Zeit, Balken mit Bedeutungsfarbe, Stempel am Ende.

import type { ComponentChildren } from 'preact';
import { Icon } from '../../../../ui';

/** Bedeutungsfarben, die ein Balken tragen kann (--cat-*). */
export type MeterColor = 'money' | 'danger' | 'warn' | 'place' | 'goods' | 'people' | 'law' | 'brand' | 'dirty';

/** Restzeit oben im HUD: Sekunden groß, unter urgentAt rot und pulsierend (Puls nur Optik). */
export function HudTimer(props: { seconds: number; total: number; urgentAt?: number; label?: string }) {
  const left = Math.max(0, props.seconds);
  const urgent = left <= (props.urgentAt ?? 10);
  const share = props.total > 0 ? Math.min(1, left / props.total) : 0;
  return (
    <div class={`mg-hud-timer${urgent ? ' is-urgent' : ''}`} role="timer" aria-label={`${Math.ceil(left)} Sekunden`}>
      <Icon name="timer" class="mg-hud-timer__icon" />
      <span class="mg-hud-timer__value">{left < 10 ? left.toFixed(1) : Math.ceil(left)}</span>
      <span class="mg-hud-timer__unit">{props.label ?? 's'}</span>
      <span class="mg-hud-timer__bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${share})` }} />
      </span>
    </div>
  );
}

/** Balken 0–1 mit Beschriftung in der Bedeutungsfarbe (z.B. Misstrauen danger, Lärm warn). */
export function HudMeter(props: { label: string; value: number; color: MeterColor; detail?: ComponentChildren }) {
  const v = Math.min(1, Math.max(0, props.value));
  return (
    <div class={`mg-hud-meter is-${props.color}`}>
      <span class="mg-hud-meter__head">
        <span class="mg-hud-meter__label">{props.label}</span>
        {props.detail !== undefined && <span class="mg-hud-meter__detail">{props.detail}</span>}
      </span>
      <span class="mg-hud-meter__bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${v})` }} />
      </span>
      <span class="mg-sr">{`${props.label}: ${Math.round(v * 100)} Prozent`}</span>
    </div>
  );
}

/** Stempel „Geschafft“ / „Nicht geschafft“ (oder ein eigenes Wort), knallt beim Erscheinen auf. */
export function ResultStamp(props: { won: boolean; label?: string }) {
  const text = props.label ?? (props.won ? 'Geschafft' : 'Nicht geschafft');
  return (
    <span class={`mg-stamp ${props.won ? 'is-won' : 'is-lost'}`} role="img" aria-label={`Ergebnis: ${text}`}>
      <Icon name={props.won ? 'checkCircle' : 'xCircle'} class="mg-stamp__icon" />
      {text}
    </span>
  );
}

/** Glas-Leiste oben über der Bühne (Zeit, Zähler, Balken). */
export function HudBar(props: { children: ComponentChildren; class?: string }) {
  return <div class={`mg-hud ${props.class ?? ''}`}>{props.children}</div>;
}
