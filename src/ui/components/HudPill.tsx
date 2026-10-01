import type { ComponentChildren, JSX } from 'preact';
import { type ChipColor, categoryOf, IconChip } from './Icon';
import type { IconName } from './icons';

export interface HudPillProps {
  icon: IconName | (string & {});
  /** Farbe der Icon-Kachel (im HUD ausgeblendet, im Handy-Widget sichtbar je nach Stil). */
  color?: ChipColor;
  /** Kleine Beschriftung über dem Wert. */
  label: ComponentChildren;
  value: ComponentChildren;
  title?: string;
  /** Färbt den Wert (Warnung, Problem …). */
  tone?: 'accent' | 'warn' | 'bad' | 'info';
  /** Mit onClick wird die Pille zum Knopf. */
  onClick?: () => void;
  class?: string;
  /** Zusätzlicher Inhalt rechts, z.B. eine Anzeige mit Stufen. */
  children?: ComponentChildren;
}

/**
 * Stufen als Segmente (z.B. Köln: 7 Veedel zum Sieg), gold gefüllt. Steht in der Kennzahl-Kachel über der Karte;
 * auf dem Startbildschirm des Handys ausgeblendet (dort reicht der Wert).
 */
export function HudSegments(props: { total: number; filled: number; label: string }) {
  const filled = Math.max(0, Math.min(props.total, props.filled));
  return (
    <span class="hud-segments" role="img" aria-label={`${props.label}: ${filled} von ${props.total}`}>
      {Array.from({ length: props.total }, (_, i) => (
        <span key={i} class={`hud-segments__seg ${i < filled ? 'is-on' : ''}`} />
      ))}
    </span>
  );
}

/**
 * Kennzahl: kleine Beschriftung, großer Wert. placement 'main' steht in der HUD-Leiste, 'more' als Kachel auf dem
 * Startbildschirm des Handys und (Look "Glas") als Kachel oben rechts über der Karte. Die Beschriftung trägt dort die
 * Bedeutungsfarbe aus `color` (--hud-tint).
 */
export function HudPill(props: HudPillProps) {
  const style = { '--hud-tint': `var(--cat-${categoryOf(props.color ?? 'brand')})` } as JSX.CSSProperties;
  const inner = (
    <>
      <IconChip icon={props.icon} color={props.color ?? 'yellow'} size="sm" class="hud-pill__chip" />
      <span class="hud-pill__text">
        <span class="hud-pill__label">{props.label}</span>
        <span class={`hud-pill__value ${props.tone ? `is-${props.tone}` : ''}`}>{props.value}</span>
      </span>
      {props.children}
    </>
  );
  const cls = `hud-pill hud-stat ${props.onClick ? 'is-button' : ''} ${props.class ?? ''}`;
  return props.onClick ? (
    <button type="button" class={cls} style={style} title={props.title} onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <div class={cls} style={style} title={props.title}>
      {inner}
    </div>
  );
}
