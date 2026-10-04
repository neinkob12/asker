import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
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
  /**
   * Kleine Karte, die beim Drüberfahren oder Antippen unter der Kachel aufklappt (Look "Glas"), z.B. die Aufstellung
   * des Lagers nach Produkt. Mit onClick öffnet ein Tipp die Karte, ein zweiter Tipp führt zum Ziel.
   */
  details?: ComponentChildren;
  /** Beschriftung des Knopfs unten in der Karte, der onClick auslöst (z.B. "Öffnen"). */
  detailsAction?: string;
}

/**
 * Schwebt nur eine Maus über der Karte? Ein Finger löst am Touchscreen nach dem Tippen ein nachgemachtes mouseenter
 * aus (und mouseleave erst beim nächsten Tipp daneben): Die Karte klebte offen, und ein zweiter Tipp schloss sie nicht.
 * Pointer-Ereignisse tragen den Typ, Finger und Stift schweben hier nicht.
 */
export function hoversWith(pointerType: string): boolean {
  return pointerType === 'mouse';
}

/** Waagerechte Leiste 0–100 (z.B. Ruf) in der Kennzahl-Kachel. */
export function HudBar(props: { value: number; max?: number; label: string; marks?: readonly number[] }) {
  const max = props.max ?? 100;
  const share = Math.max(0, Math.min(1, props.value / max));
  return (
    <span class="hud-bar" role="img" aria-label={`${props.label}: ${Math.round(props.value)} von ${max}`}>
      <span class="hud-bar__fill" style={{ width: `${share * 100}%` }} />
      {props.marks?.map((m) => (
        <span key={m} class="hud-bar__mark" style={{ left: `${(m / max) * 100}%` }} />
      ))}
    </span>
  );
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
  const cls = `hud-pill hud-stat ${props.onClick || props.details ? 'is-button' : ''} ${props.class ?? ''}`;
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  if (props.details) {
    // Drüberfahren klappt auf (Maus), Antippen schaltet um (Finger); die Karte selbst trägt den Weg zum Ziel.
    return (
      <fieldset
        class={`hud-pill-wrap ${open || hover ? 'is-open' : ''}`}
        aria-label={typeof props.label === 'string' ? props.label : undefined}
        onPointerEnter={(e) => hoversWith(e.pointerType) && setHover(true)}
        onPointerLeave={(e) => hoversWith(e.pointerType) && setHover(false)}
      >
        <button
          type="button"
          class={cls}
          style={style}
          title={props.title}
          aria-expanded={open || hover}
          onClick={() => setOpen(!open)}
        >
          {inner}
        </button>
        {(open || hover) && (
          <div class="hud-flyout" role="dialog" aria-label={typeof props.label === 'string' ? props.label : undefined}>
            {props.details}
            {props.onClick && (
              <button
                type="button"
                class="hud-flyout__action"
                onClick={() => {
                  setOpen(false);
                  setHover(false);
                  props.onClick?.();
                }}
              >
                {props.detailsAction ?? 'Öffnen'}
              </button>
            )}
          </div>
        )}
      </fieldset>
    );
  }
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
