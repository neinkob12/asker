import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
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
   * des Lagers nach Produkt. Ein Tipp auf die Kachel klappt sie auf und wieder zu; mit onClick führt der Knopf unten in
   * der Karte (detailsAction) zum Ziel.
   */
  details?: ComponentChildren;
  /** Beschriftung des Knopfs unten in der Karte, der onClick auslöst (z.B. "Öffnen"). */
  detailsAction?: string;
  /** Anker der Tour (Auftrag 46a), z.B. "hud.stock"; steht am äußersten Element. */
  'data-tour'?: string;
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

/** Schließt die gerade offene HUD-Karte: Es ist immer nur eine offen (Auftrag 43, N2). */
let closeOpenCard: (() => void) | null = null;

/** Ab so vielen Buchstaben gilt ein Wort im Wert als lang (kleinere Schrift in schmalen Kacheln). */
const LONG_WORD = 11;

/**
 * Kennzahl: kleine Beschriftung, großer Wert. placement 'main' steht in der HUD-Leiste, 'more' als Kachel auf dem
 * Startbildschirm des Handys und (Look "Glas") als Kachel oben rechts über der Karte. Die Beschriftung trägt dort die
 * Bedeutungsfarbe aus `color` (--hud-tint).
 */
export function HudPill(props: HudPillProps) {
  const style = { '--hud-tint': `var(--cat-${categoryOf(props.color ?? 'brand')})` } as JSX.CSSProperties;
  // Ein langes Wort („Hafengeburtstag“) bekommt auf dem Handy eine kleinere Schrift statt „Hafengeburtst…“ (Auftrag 43).
  const longWord = typeof props.value === 'string' && props.value.split(/\s+/).some((word) => word.length > LONG_WORD);
  const inner = (
    <>
      <IconChip icon={props.icon} color={props.color ?? 'yellow'} size="sm" class="hud-pill__chip" />
      <span class="hud-pill__text">
        <span class="hud-pill__label">{props.label}</span>
        <span class={`hud-pill__value ${props.tone ? `is-${props.tone}` : ''} ${longWord ? 'is-long-word' : ''}`}>
          {props.value}
        </span>
      </span>
      {props.children}
    </>
  );
  const cls = `hud-pill hud-stat ${props.onClick || props.details ? 'is-button' : ''} ${props.class ?? ''}`;
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const wrap = useRef<HTMLFieldSetElement>(null);
  // Offen nach einem Tipp: Ein Tipp daneben oder Esc schließt (Auftrag 43, N2: Karten blieben sonst offen, mehrere
  // übereinander). Esc schließt hier nur die Karte, nicht zugleich das Handy.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    if (closeOpenCard && closeOpenCard !== close) closeOpenCard();
    closeOpenCard = close;
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      if (closeOpenCard === close) closeOpenCard = null;
    };
  }, [open]);
  if (props.details) {
    // Drüberfahren klappt auf (Maus), Antippen schaltet um (Finger); die Karte selbst trägt den Weg zum Ziel.
    return (
      <fieldset
        ref={wrap}
        class={`hud-pill-wrap ${open || hover ? 'is-open' : ''}`}
        data-tour={props['data-tour']}
        aria-label={typeof props.label === 'string' ? props.label : undefined}
        onPointerEnter={(e) => hoversWith(e.pointerType) && setHover(true)}
        onPointerLeave={(e) => {
          // Mit der Maus gilt: weg von der Kachel, Karte zu (auch nach einem Klick).
          if (!hoversWith(e.pointerType)) return;
          setHover(false);
          setOpen(false);
        }}
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
    <button
      type="button"
      class={cls}
      style={style}
      title={props.title}
      data-tour={props['data-tour']}
      onClick={props.onClick}
    >
      {inner}
    </button>
  ) : (
    <div class={cls} style={style} title={props.title} data-tour={props['data-tour']}>
      {inner}
    </div>
  );
}
