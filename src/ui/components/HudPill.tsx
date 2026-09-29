import type { ComponentChildren } from 'preact';
import { type ChipColor, IconChip } from './Icon';
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
 * Kennzahl: kleine Beschriftung, großer Wert. placement 'main' steht in der HUD-Leiste, 'more' als Kachel auf dem
 * Startbildschirm des Handys.
 */
export function HudPill(props: HudPillProps) {
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
    <button type="button" class={cls} title={props.title} onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <div class={cls} title={props.title}>
      {inner}
    </div>
  );
}
